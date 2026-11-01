"""场景探索必须改变真正的几何/像素；解释路径与成像遵循同一参数。"""
import json
from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import studio_render as studio
from test_studio_render import png_pixels


class SceneExplorationTests(unittest.TestCase):
    def test_shape_topology_and_world_transform(self):
        """对象切片覆盖所有三角形；法线朝外；TRS 不因更换形状而丢失。"""
        for shape in ('cube', 'sphere', 'tetrahedron'):
            with self.subTest(shape=shape):
                mesh = studio._shape_mesh(shape)
                normals = np.cross(mesh[:, 1]-mesh[:, 0], mesh[:, 2]-mesh[:, 0])
                self.assertTrue(np.all(np.sum(normals*mesh.mean(axis=1), axis=1) > 0))
                if shape == 'sphere':
                    np.testing.assert_allclose(np.linalg.norm(mesh, axis=-1), 1)
                else:
                    self.assertEqual(len(mesh), 12 if shape == 'cube' else 4)
                params = dict(size=64, cube_a_shape=shape, cube_b_shape='tetrahedron',
                              cube_a_position=[.1,.3,-.2], cube_a_rotation=[20,35,10], cube_a_scale=[.4,.8,1.2])
                result = studio.render('03', params)
                geometry = result['geometry']
                a, b = geometry['objects'][:2]
                self.assertEqual((a['start'], a['count'], b['start'], b['count']), (0,len(mesh),len(mesh),4))
                triangles = np.array(geometry['positions']).reshape(-1,3,3)
                self.assertEqual(len(triangles), len(mesh)+4)
                actual = (triangles[:len(mesh)]-params['cube_a_position']) @ studio._rotation(params['cube_a_rotation']) / params['cube_a_scale']
                np.testing.assert_allclose(actual, mesh, atol=1e-14)

    def test_shapes_and_projection_channels_are_actual_python_buffers(self):
        baseline = studio.render('03', {'size':64})
        for shape in ('sphere','tetrahedron'):
            result = studio.render('03', {'size':64,'cube_a_shape':shape})
            self.assertNotEqual(result['images'][0]['url'], baseline['images'][0]['url'])
            triangles = np.array(result['geometry']['positions']).reshape(-1,3,3)
            matrix = np.array(result['probe']['projection']) @ np.array(result['probe']['view'])
            buffer = studio._core('09').rasterize_world(triangles,matrix,64)
            images = {image['id']:image for image in result['images']}
            depth = np.where(buffer['owner']>=0,buffer['depth'],1)
            expected_depth = np.rint(np.clip(depth,0,1)*255).astype(np.uint8)
            np.testing.assert_array_equal(png_pixels(images['depth'])[...,0],expected_depth)
            expected_normal = np.rint(studio._normal_image(buffer)*255).astype(np.uint8)
            np.testing.assert_array_equal(png_pixels(images['normal']),expected_normal)

    def test_material_edits_change_formal_png_and_preview_base_color(self):
        base = studio.render('12', {'size':64})
        for patch in ({'sphere_a_color':'jade'}, {'sphere_b_color':'ivory'},
                      {'sphere_a_reflectivity':0}, {'sphere_b_reflectivity':.95},
                      {'specular':.8}, {'specular':.8,'shininess':8}):
            with self.subTest(patch=patch):
                result = studio.render('12', {'size':64,**patch})
                self.assertNotEqual(result['images'][0]['url'],base['images'][0]['url'])
                json.dumps(result,allow_nan=False)
                colors = np.array(result['geometry']['colors']).reshape(-1,3,3)
                for obj in result['geometry']['objects']:
                    if obj['id'].startswith('sphere-'):
                        key = obj['id'][-1]
                        material = obj['material']
                        expected = studio.RAY_PALETTE[result['params'][f'sphere_{key}_color']]
                        np.testing.assert_array_equal(material['color'],expected)
                        np.testing.assert_allclose(colors[obj['start']:obj['start']+obj['count']],np.broadcast_to(expected,(obj['count'],3,3)))
                        self.assertEqual(material['reflectivity'],result['params'][f'sphere_{key}_reflectivity'])

    def test_phong_is_local_and_separate_from_mirror_weight(self):
        core = studio._core('12')
        params = dict(centers=[[0,1,0],[10,1,0]], radii=[1,1], materials=np.full((3,3),.15), mirrors=[0,0,0])
        diffuse = core.trace([0,1,4],[0,0,-1],light=[0,1,4],specular=0,**params)
        glossy = core.trace([0,1,4],[0,0,-1],light=[0,1,4],specular=.3,shininess=128,**params)
        np.testing.assert_allclose(diffuse,[[.15,.15,.15]],atol=1e-14)
        np.testing.assert_allclose(glossy-diffuse,[[.3,.3,.3]],atol=1e-14)
        self.assertEqual(len(core.trace_path([0,1,4],[0,0,-1],light=[0,1,4],specular=.3,**params)),1)

    def test_path_contributions_reconstruct_rendered_color(self):
        core = studio._core('12')
        materials = np.array([[.2,.1,.5],[.8,.4,.1],[.4,.5,.6]])
        params = dict(materials=materials,mirrors=[.9,.65,.35],specular=.45,shininess=12,bounces=3)
        origins,directions = core.camera_rays(16)
        reference = core.trace(origins,directions,**params)
        for index in (0,72,110,120,135,152,207,240):
            path = core.trace_path(origins[index],directions[index],**params)
            total = np.clip(np.sum([step['contribution'] for step in path],axis=0),0,1)
            np.testing.assert_allclose(total,reference[index],atol=1e-13)
            throughput = 1.
            for step in path:
                self.assertAlmostEqual(step['throughput'],throughput)
                if step['owner'] >= 0:
                    self.assertEqual(step['reflectivity'],params['mirrors'][step['owner']])
                    throughput *= step['continuation_weight']

    def test_probe_weights_reconstruct_the_selected_python_pixel(self):
        params = dict(size=64,sphere_a_color='ivory',sphere_a_reflectivity=.92,sphere_b_reflectivity=.8,
                      specular=.6,shininess=10,bounces=3,probe=[.4,.48])
        result = studio.render('12',params)
        probe = result['probe']
        color = np.clip(np.sum([step['contribution'] for step in probe['segments']],axis=0),0,1)
        expected = np.rint(studio._core('01').linear_to_srgb(color)*255).astype(np.uint8)
        np.testing.assert_array_equal(png_pixels(result['images'][0])[probe['row'],probe['col']],expected)
        self.assertIn('reflectivity',probe['segments'][0])

    def test_zero_reflectivity_stops_at_the_first_surface(self):
        core = studio._core('12')
        params = dict(centers=[[0,1,0],[10,1,0]],radii=[1,1],mirrors=[0,0,0],bounces=3)
        path = core.trace_path([0,1,4],[0,0,-1],**params)
        self.assertEqual(len(path),1)
        self.assertEqual(path[0]['owner'],0)
        self.assertEqual(path[0]['continuation_weight'],0)
        self.assertEqual(path[0]['throughput'],1)

    def test_presets_are_valid_and_visually_distinct(self):
        for chapter in ('03','12'):
            entry = next(item for item in studio.catalog() if item['id'] == chapter)
            images = []
            for preset in entry['scenePresets']:
                result = studio.render(chapter,{'size':64,**preset['params']})
                json.dumps(result,allow_nan=False)
                images.append(result['images'][0]['url'])
            self.assertEqual(len(images),len(set(images)))

    def test_invalid_shape_and_material_parameters_are_rejected(self):
        cases = [('03',{'cube_a_shape':'torus'}),('12',{'sphere_a_color':'purple'}),
                 ('12',{'sphere_a_reflectivity':-.01}),('12',{'sphere_b_reflectivity':1}),
                 ('12',{'specular':float('nan')}),('12',{'shininess':0}),('12',{'shininess':257})]
        for chapter,params in cases:
            with self.subTest(params=params), self.assertRaises(ValueError):
                studio.render(chapter,params)
        for params in ({'mirrors':[0,0,1]}, {'materials':[[1,0,0]]}, {'materials':np.full((3,3),np.nan)},
                       {'specular':-1}, {'shininess':0}):
            with self.subTest(params=params), self.assertRaises(ValueError):
                studio._core('12').trace([0,1,4],[0,0,-1],**params)


if __name__ == '__main__':
    unittest.main()
