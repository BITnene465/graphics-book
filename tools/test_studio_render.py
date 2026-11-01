"""内嵌演示的渲染契约；测试像素和数学，不测试页面实现细节。

运行：uv run --locked python -m unittest discover -s tools -p test_studio_render.py
"""
import base64
import json
from pathlib import Path
import struct
import sys
import unittest
from unittest.mock import patch
import zlib

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import studio_render as studio


def png_pixels(image):
    data = base64.b64decode(image['url'].split(',', 1)[1])
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    offset, compressed, dimensions = 8, bytearray(), None
    while offset < len(data):
        length = struct.unpack('>I', data[offset:offset+4])[0]
        kind = data[offset+4:offset+8]
        payload = data[offset+8:offset+8+length]
        crc = struct.unpack('>I', data[offset+8+length:offset+12+length])[0]
        assert crc == zlib.crc32(kind + payload)
        if kind == b'IHDR':
            dimensions = struct.unpack('>IIBBBBB', payload)
        elif kind == b'IDAT':
            compressed.extend(payload)
        offset += length+12
    width, height, depth, color, *_ = dimensions
    assert (depth, color) == (8, 2)
    scanlines = np.frombuffer(zlib.decompress(compressed), np.uint8).reshape(height, 1+3*width)
    assert np.all(scanlines[:, 0] == 0)
    return scanlines[:, 1:].reshape(height, width, 3)


class StudioRenderTests(unittest.TestCase):
    def test_pipeline_probe_reconstructs_original_surface_and_encoded_pixel(self):
        params = dict(size=96, divisions=5, wave=.4, model_rotation=[8,25,0], near=2)
        result = studio.render('13', params)
        probe = result['probe']
        self.assertTrue(probe['hit'])
        self.assertAlmostEqual(sum(probe['weights']), 1)
        geometry = np.asarray(result['geometry']['positions']).reshape(-1, 3, 3)
        np.testing.assert_allclose(np.asarray(probe['weights']) @ geometry[probe['face']],
                                   probe['world'], atol=1e-12)
        expected = np.rint(studio._core('01').linear_to_srgb(
            np.clip(probe['linear'], 0, 1))*255).astype(np.uint8)
        np.testing.assert_array_equal(png_pixels(result['images'][0])[probe['row'],probe['col']], expected)
        passed = np.asarray(probe['candidate_faces'])[probe['depth_passes']]
        self.assertEqual(passed[-1], probe['face'])
        objects = {obj['id']: obj for obj in result['geometry']['objects']}
        self.assertTrue(all(objects['model']['edit'].values()))
        self.assertTrue(objects['camera']['edit']['translate'])
        self.assertTrue(objects['light']['edit']['translate'])

    def test_pipeline_early_depth_reduces_work_without_changing_encoded_image(self):
        early = studio.render('13', dict(size=96, early_depth=True))
        late = studio.render('13', dict(size=96, early_depth=False))
        self.assertEqual(early['images'], late['images'])
        self.assertLess(early['metrics'][2]['value'], late['metrics'][2]['value'])
        self.assertEqual(studio.render('13',dict(size=1024,preview=True))['images'][0]['width'],160)

    def test_mesh_shading_probe_is_the_pixel_in_all_three_encoded_images(self):
        result = studio.render('06', dict(size=96, surface_model='mesh', mesh_latitude=5,
                                          exponent=128, surface_position=[.2,-.2,.5]))
        probe = result['probe']
        self.assertTrue(probe['hit'])
        self.assertEqual([image['id'] for image in result['images']], ['flat','gouraud','phong'])
        self.assertAlmostEqual(sum(probe['weights']), 1)
        self.assertAlmostEqual(np.linalg.norm(probe['normal']), 1)
        for image in result['images']:
            expected = np.rint(studio._core('01').linear_to_srgb(
                np.clip(probe[image['id']+'_rgb'],0,1))*255).astype(np.uint8)
            np.testing.assert_array_equal(png_pixels(image)[probe['row'],probe['col']], expected)
        geometry = np.asarray(result['geometry']['positions']).reshape(-1,3,3)
        self.assertEqual(len(geometry), 4*5*(5-1))
        np.testing.assert_allclose((geometry.min((0,1))+geometry.max((0,1)))/2, [.2,-.2,.5], atol=.07)

    def test_filter_probe_matches_actual_footprint_and_selected_sampling_level(self):
        core = studio._core('07')
        for filtering in ('nearest','bilinear','trilinear','anisotropic'):
            result = studio.render('07', dict(size=96,tilt=70,frequency=64,texture_size=512,
                                              filter=filtering,max_anisotropy=4,lod_bias=.5))
            probe=result['probe']; row,col=probe['row'],probe['col']
            frame=core.render(tilt=70,frequency=64,texture_size=512,resolution=96,
                              filtering=filtering,max_anisotropy=4,lod_bias=.5)
            for key in ('lod','footprint_major','footprint_minor','tap_count'):
                self.assertAlmostEqual(probe[key],float(frame[key][row,col]))
            self.assertEqual(result['images'][-1]['width'],512)
            self.assertGreater(max(probe['texel_cols']),64)
            expected=np.rint(studio._core('01').linear_to_srgb(np.clip(frame['correct'],0,1))*255).astype(np.uint8)
            np.testing.assert_array_equal(png_pixels(result['images'][0]),expected)

    def test_published_chapters_have_valid_png_and_json(self):
        for entry in studio.catalog():
            with self.subTest(chapter=entry['id']):
                result = studio.render(entry['id'], {'size': 64})
                json.dumps(result, allow_nan=False)
                self.assertTrue(result['images'])
                for image in result['images']:
                    pixels = png_pixels(image)
                    self.assertEqual(pixels.shape[:2], (image['height'], image['width']))
                if entry['dimension'] == 3:
                    geometry = result['geometry']
                    positions = np.asarray(geometry['positions']).reshape(-1, 3, 3)
                    self.assertTrue(np.isfinite(positions).all())
                    self.assertEqual(len(geometry['colors']), positions.size)
                else:
                    self.assertTrue(result['handles'])

    def test_reordering_reading_list_preserves_parameters_and_pixels(self):
        entries = studio.catalog()
        expected = {entry['id']: studio.render(entry['id'], {'size': 64})
                    for entry in entries}
        # Clear the cache so this also checks how default render parameters are found.
        studio._cached_scene.cache_clear()
        with patch.object(studio, 'catalog', return_value=list(reversed(entries))):
            for chapter, original in expected.items():
                with self.subTest(chapter=chapter):
                    reordered = studio.render(chapter, {'size': 64})
                    self.assertEqual(reordered['params'], original['params'])
                    self.assertEqual(reordered['images'], original['images'])

    def test_png_orientation_and_single_srgb_encoding(self):
        result = studio.render('01', {'size': 64, 'pattern': 'corners', 'samples': 1})
        pixels = png_pixels(result['images'][0])
        np.testing.assert_array_equal(pixels[0, 0], [255, 0, 0])
        np.testing.assert_array_equal(pixels[-1, 0], [0, 0, 255])
        result = studio.render('01', {'size': 64, 'pattern': 'gradient', 'samples': 1})
        expected = np.rint(studio._core('01').linear_to_srgb(studio._core('01').render_image(64, 64, 1, 'gradient'))*255).astype(np.uint8)
        np.testing.assert_array_equal(png_pixels(result['images'][0]), expected)

    def test_affine_transform_readout_is_core_result(self):
        result = studio.render('02', dict(size=64, angle=90, tx=2, ty=0, sx=1, sy=1, point=[1, 0]))
        np.testing.assert_allclose(result['probe']['transformed'], [2, 1])

    def test_barycentric_degenerate_drag_is_valid_state(self):
        result = studio.render('04', dict(size=64, vertices=[[0, 0], [1, 1], [2, 2]]))
        self.assertIsNone(result['probe']['weights'])
        self.assertFalse(result['probe']['inside'])
        self.assertEqual(result['metrics'][0]['value'], 0)

    def test_depth_probe_matches_full_rasterization(self):
        result = studio.render('05', {'size': 64, 'probe': [.42, .6]})
        core = studio._core('05')
        triangles = np.asarray(result['geometry']['positions']).reshape(-1, 3, 3)
        clip = studio._core('03').transform_points(triangles.reshape(-1, 3), studio._core('03').perspective(90, 1, 1, 10)).reshape(-1, 3, 4)
        depth = core.candidate_depths(clip, 64, 64)
        row, col = result['probe']['row'], result['probe']['col']
        expected = [float(x) if np.isfinite(x) else None for x in depth[:, row, col]]
        self.assertEqual(result['probe']['candidates'], expected)

    def test_nonuniform_normal_comparison_differs(self):
        result = studio.render('06', {'size': 64})
        good, bad = [png_pixels(image) for image in result['images']]
        self.assertGreater(np.count_nonzero(good != bad), 100)

    def test_texture_probe_matches_the_actual_wrong_and_correct_images(self):
        core = studio._core('07')
        frame = core.render(resolution=64)
        for uv in ([.5, .5], [.4, .6]):
            result = studio.render('07', {'size': 64, 'probe': uv})
            row, col = result['probe']['row'], result['probe']['col']
            np.testing.assert_allclose(result['probe']['uv_correct'], frame['uv_correct'][row, col], atol=1e-14)
            np.testing.assert_allclose(result['probe']['uv_affine'], frame['uv_affine'][row, col], atol=1e-14)

    def test_sampling_probe_matches_core_coverage(self):
        result = studio.render('08', {'size': 64, 'samples': 64, 'point': [2, 1]})
        coverage = studio._core('08').sample_coverage(64, 64, scene='line', phase=0, angle=35, width=.8, cell=3)
        row, col = result['probe']['row'], result['probe']['col']
        self.assertEqual(result['probe']['coverage'], coverage[row, col])

    def test_shadow_probe_repeats_real_shadow_map_taps(self):
        result = studio.render('09', {'size': 64})
        frame = studio._core('09').render_scene(64, 512, [-3, 6, -2], .004, 1)
        row, col = result['probe']['row'], result['probe']['col']
        self.assertAlmostEqual(result['probe']['visibility'], frame['visibility'][row, col])
        np.testing.assert_allclose(result['probe']['world'], frame['camera']['world'][row, col], atol=1e-12)

    def test_geometry_probe_lies_on_implicit_surface(self):
        result = studio.render('10', {'size': 64, 'a': 2., 'b': .4, 'c': 1.2})
        self.assertAlmostEqual(result['probe']['implicit'], 0)
        self.assertAlmostEqual(np.linalg.norm(result['probe']['normal']), 1)

    def test_bezier_endpoint(self):
        result = studio.render('11', {'size': 64, 't': 0})
        np.testing.assert_array_equal(result['probe']['point'], result['params']['points'][0])

    def test_ray_batch_agrees_with_original_camera(self):
        origins, directions = studio._core('12').camera_rays(64)
        ids = np.array([0, 52, 63, 1800, 4095])
        actual_origins, actual_directions = studio._ray_batch(64, ids)
        np.testing.assert_allclose(actual_origins, origins[ids])
        np.testing.assert_allclose(actual_directions, directions[ids])
        result = studio.render('12', {'size': 64})
        reference = studio._core('12').render_image(64)['color']
        expected = np.rint(studio._core('01').linear_to_srgb(reference)*255).astype(np.uint8)
        np.testing.assert_array_equal(png_pixels(result['images'][0]), expected)

    def test_probe_changes_reuse_pixel_images(self):
        before = studio.render('07', {'size': 64, 'probe': [.4, .5]})
        hits = studio._cached_scene.cache_info().hits
        after = studio.render('07', {'size': 64, 'probe': [.6, .5]})
        self.assertGreater(studio._cached_scene.cache_info().hits, hits)
        self.assertEqual(before['images'], after['images'])
        self.assertNotEqual(before['probe']['col'], after['probe']['col'])

    def test_preview_is_bounded(self):
        result = studio.render('12', {'size': 2048, 'preview': True})
        self.assertEqual(result['images'][0]['width'], 160)

    def test_sampling_preview_preserves_pixel_domain_and_probe(self):
        params = dict(size=512, samples=64, point=[200, -180], scene='checker', cell=.7, phase=.13)
        preview = studio.render('08', {**params, 'preview': True})
        final = studio.render('08', params)
        self.assertEqual(preview['bounds'], [-256, 256, -256, 256])
        self.assertEqual(preview['bounds'], final['bounds'])
        self.assertEqual(preview['handles'], final['handles'])
        self.assertEqual(preview['images'][0]['width'], 512)
        self.assertEqual(preview['params']['samples'], 4)
        self.assertEqual(final['params']['samples'], 64)
        for key in ('row', 'col', 'uv'):
            self.assertEqual(preview['probe'][key], final['probe'][key])
        core = studio._core('08')
        row, col = final['probe']['row'], final['probe']['col']
        lower_left = np.array([col-256, 512-1-row-256])
        positions = lower_left+core.sample_offsets(64)
        expected = core.scene_values(positions, scene='checker', cell=.7, phase=.13, angle=35, width=.8)
        self.assertEqual(final['probe']['coverage'], float(expected.mean()))
        self.assertEqual(len(preview['probe']['samples']), 4)
        self.assertEqual(len(final['probe']['samples']), 64)

    def test_high_resolution_real_pixels_and_geometry(self):
        for chapter in ('03', '06', '10', '12', '13'):
            with self.subTest(chapter=chapter):
                result = studio.render(chapter, {'size': 1024})
                self.assertEqual(png_pixels(result['images'][0]).shape, (1024, 1024, 3))
                self.assertTrue(result['geometry']['positions'])

    def test_editable_objects_change_python_images(self):
        cases = {
            '13': [{'model_position':[.2,.3,0]}, {'model_rotation':[15,20,0]}, {'model_scale':[1.3,.7,1]}, {'camera_target':[.2,0,0]}, {'camera_rotation':[0,5,0]}, {'light_x':4}, {'wave':.6}],
            '03': [{'cube_a_position':[.2,.7,.5]}, {'cube_b_rotation':[20,35,10]}, {'cube_a_scale':[1,.4,.7]}, {'camera_target':[.6,.3,0]}, {'camera_rotation':[0,15,0]}],
            '06': [{'surface_position':[.5,.2,0]}],
            '07': [{'plane_position':[.4,.2,-3]}, {'plane_rotation':[10,20,0]}, {'plane_scale':[1.5,.6,1]}],
            '09': [{'pillar_position':[.8,.8,0]}, {'pillar_rotation':[15,30,0]}, {'pillar_scale':[.8,1.2,.3]}, {'light_target':[2,0,1]}],
            '10': [{'surface_position':[.5,.4,0]}, {'surface_rotation':[30,20,10]}, {'camera_target':[.5,0,0]}, {'camera_rotation':[0,10,0]}],
            '12': [{'sphere_a_position':[-.2,1.1,.4]}, {'sphere_b_radius':1.2}, {'camera_target':[.5,0,0]}, {'camera_rotation':[0,10,0]}],
        }
        for chapter, edits in cases.items():
            base = studio.render(chapter, {'size':64})
            for patch in edits:
                with self.subTest(chapter=chapter, patch=patch):
                    result = studio.render(chapter, {'size':64, **patch})
                    self.assertNotEqual(result['images'][0]['url'], base['images'][0]['url'])
                    json.dumps(result, allow_nan=False)

    def test_object_metadata_covers_actual_geometry(self):
        result = studio.render('03', {'size':64, 'cube_a_position':[1,.3,0], 'cube_a_rotation':[20,30,40], 'cube_a_scale':[.4,.8,1.2]})
        geometry = result['geometry']
        for obj in geometry['objects']:
            if obj['count'] == 0:
                continue
            vertices = np.asarray(geometry['positions']).reshape(-1,3,3)[obj['start']:obj['start']+obj['count']]
            rotation=studio._rotation(np.rad2deg(obj['rotation']))
            local=(vertices-np.asarray(obj['position']))@rotation/obj['scale']
            np.testing.assert_allclose(np.abs(local),1,atol=1e-14)
            self.assertTrue(all(obj['edit'].values()))

    def test_camera_rotation_is_not_orbiting_observer(self):
        base=studio.render('03', {'size':64})
        result=studio.render('03', {'size':64,'camera_rotation':[20,30,10]})
        np.testing.assert_allclose(base['geometry']['camera']['eye'],result['geometry']['camera']['eye'])
        self.assertFalse(np.allclose(base['geometry']['camera']['target'],result['geometry']['camera']['target']))
        self.assertEqual(base['geometry']['positions'],result['geometry']['positions'])

    def test_edited_shadow_probe_uses_same_world_geometry(self):
        p=studio._parameters('09',{'size':64,'pillar_position':[.8,.8,0],'pillar_rotation':[0,30,0],'light_target':[1,0,0]})
        result=studio.render('09',p)
        triangles,colors=studio._shadow_geometry(p)
        core=studio._core('09')
        frame=core.render_scene(64,512,[-3,6,-2],.004,1,triangles=triangles,materials=colors,light_target=p['light_target'])
        row,col=result['probe']['row'],result['probe']['col']
        if 'world' in result['probe']:
            np.testing.assert_allclose(result['probe']['world'],frame['camera']['world'][row,col])
            self.assertAlmostEqual(result['probe']['visibility'],frame['visibility'][row,col])

    def test_edited_ray_scene_is_pure_and_probe_matches(self):
        core=studio._core('12')
        original_centers=core.CENTERS.copy()
        p=studio._parameters('12', {'size':64,'sphere_a_position':[-.3,1,.5],'sphere_b_radius':1.1,'camera_rotation':[0,5,0]})
        result=studio.render('12',p)
        centers,radii=studio._ray_spheres(p)
        camera=studio._camera_pose(p)
        row,col=result['probe']['row'],result['probe']['col']
        origins,directions=studio._ray_batch(64,np.array([row*64+col]),camera)
        hit=core.nearest_hit(origins,directions,p['epsilon'],centers=centers,radii=radii)
        self.assertEqual(result['probe']['segments'][0]['owner'],int(hit['owner'][0]))
        np.testing.assert_array_equal(core.CENTERS,original_centers)
        np.testing.assert_allclose(np.linalg.norm(hit['normal'][hit['owner']>=0],axis=-1),1)

    def test_invalid_inputs_fail_before_allocation(self):
        cases = [('01', {'size': 100000}), ('03', {'yaw': float('nan')}), ('06', {'sx': float('inf')}),
                 ('12', {'bounces': 4}), ('01', {'size': 128.5}), ('01', {'size': True}),
                 ('04', {'vertices': [[0, 0]]}), ('11', {'points': [[0, 0]]*1000}),
                 ('07', {'probe': [float('nan'), 0]}), ('03', {'cube_a_scale':[0,1,1]}), ('12', {'sphere_a_radius':-1}), ('10', {'surface_rotation':[0,float('nan'),0]}), ('07', {'plane_scale':[1,1,2]}), ('09', {'light_target':[0,3,0]}), ('07', {'filter': 'unknown'}), ('12', {'unknown': 2})]
        for chapter, params in cases:
            with self.subTest(chapter=chapter, params=params):
                with self.assertRaises(ValueError):
                    studio.render(chapter, params)


if __name__ == '__main__':
    unittest.main()
