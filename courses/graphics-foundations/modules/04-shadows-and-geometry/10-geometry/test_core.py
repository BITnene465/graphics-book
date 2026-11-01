"""检查表示一致性、闭合连接、绕序与误差；不靠图像看起来像球来判断。"""
import unittest
import numpy as np
from core import (parametric,tangents,implicit,analytic_normal,make_mesh,face_geometry,
                  mesh_statistics,analytic_slice,mesh_slice,radial_mesh_point,project,silhouette,pick_surface)


class GeometryTests(unittest.TestCase):
    def test_parametric_points_satisfy_implicit(self):
        u,v=np.meshgrid(np.linspace(0,2*np.pi,31),np.linspace(0,np.pi,17))
        for axes in [(1,1,1),(2,.7,1.3)]:
            np.testing.assert_allclose(implicit(parametric(u,v,axes),axes),0,atol=8e-16)
        self.assertLess(implicit([0,0,0]),0); self.assertGreater(implicit([2,0,0]),0)

    def test_gradient_is_orthogonal_to_both_tangents(self):
        u=np.linspace(.2,6.1,20);v=np.linspace(.1,3,20);axes=(1.7,.8,1.2)
        p=parametric(u,v,axes);du,dv=tangents(u,v,axes);n=analytic_normal(p,axes)
        np.testing.assert_allclose(np.sum(n*du,axis=1),0,atol=4e-16)
        np.testing.assert_allclose(np.sum(n*dv,axis=1),0,atol=4e-16)
        cross=np.cross(dv,du); cross/=np.linalg.norm(cross,axis=1)[:,None]
        np.testing.assert_allclose(cross,n,atol=3e-16)

    def test_poles_parameter_singular_surface_regular(self):
        for u in [0,1,4]:
            np.testing.assert_allclose(parametric(u,0,(2,1,3)),[0,0,3])
            du,_=tangents(u,0,(2,1,3));np.testing.assert_array_equal(du,0)
            np.testing.assert_allclose(analytic_normal([0,0,3],(2,1,3)),[0,0,1])
        with self.assertRaises(ValueError): analytic_normal([0,0,0])

    def test_seam_closes_without_duplicate_mesh_vertices(self):
        np.testing.assert_allclose(parametric(0,1.2),parametric(2*np.pi,1.2),atol=3e-16)
        vertices,faces=make_mesh(latitude=8,longitude=16)
        self.assertEqual(len(np.unique(np.round(vertices,12),axis=0)),len(vertices))
        self.assertEqual(np.count_nonzero(vertices[:,2]==1),1)
        self.assertEqual(np.count_nonzero(vertices[:,2]==-1),1)

    def test_indices_counts_edges_and_euler(self):
        m,n=8,16;vertices,faces=make_mesh(latitude=m,longitude=n)
        self.assertEqual(len(vertices),2+n*(m-1));self.assertEqual(len(faces),2*n*(m-1))
        self.assertTrue(np.all((faces>=0)&(faces<len(vertices))))
        self.assertTrue(all(len(set(face))==3 for face in faces))
        directed=np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]])
        edges,counts=np.unique(np.sort(directed,axis=1),axis=0,return_counts=True)
        np.testing.assert_array_equal(counts,2)
        arrows=set(map(tuple,directed))
        self.assertTrue(all((b,a) in arrows for a,b in arrows))
        self.assertEqual(len(vertices)-len(edges)+len(faces),2)
        # 连通性也是必要事实，单独检查，不能由 Euler=2 擅自推出。
        reached={0}
        while True:
            expanded=reached|{int(b) for a,b in directed if int(a) in reached}
            if expanded==reached:break
            reached=expanded
        self.assertEqual(len(reached),len(vertices))

    def test_faces_outward_nonzero_area(self):
        v,f=make_mesh((1.6,.7,1.1));centers,normals,area=face_geometry(v,f)
        self.assertTrue(np.all(area>0));self.assertTrue(np.all(np.sum(centers*normals,axis=1)>0))
        np.testing.assert_allclose(np.linalg.norm(normals,axis=1),1)

    def test_refinement_reduces_volume_and_radial_sample_error(self):
        axes=(1.5,1,.8);statistics=[]
        for segments in [4,8,16]:
            v,f=make_mesh(axes,segments,2*segments);statistics.append(mesh_statistics(v,f,axes))
        for coarse,fine in zip(statistics,statistics[1:]):
            self.assertGreater(coarse['relative_volume_error'],fine['relative_volume_error'])
            self.assertGreater(coarse['max_radial_sample_error'],fine['max_radial_sample_error'])
        for item in statistics:
            self.assertLess(item['volume'],item['exact_volume']);self.assertTrue(item['closed_edges'])

    def test_mesh_volume_matches_independent_polygonal_frusta(self):
        # 每对纬圈是相似正 n 边形，截面面积为 K*r²。
        # 棱台积分 h*K*(r0²+r0*r1+r1²)/3 独立于三角形行列式体积公式。
        axes = np.array([1.5, .7, 1.2])
        for latitude, longitude in [(2, 4), (4, 8), (7, 13), (20, 40)]:
            angle = np.linspace(0, np.pi, latitude+1)
            radius = np.sin(angle)
            z = axes[2]*np.cos(angle)
            factor = longitude*np.sin(2*np.pi/longitude)*axes[0]*axes[1]/2
            expected = factor*np.sum((z[:-1]-z[1:]) *
                                     (radius[:-1]**2+radius[:-1]*radius[1:]+radius[1:]**2))/3
            vertices, faces = make_mesh(axes, latitude, longitude)
            self.assertAlmostEqual(mesh_statistics(vertices, faces, axes)['volume'], expected, places=13)

    def test_analytic_slice_equation_and_empty_cases(self):
        axes=(2,1,3);curve=analytic_slice(1.5,axes)
        np.testing.assert_allclose(curve[:,2],1.5)
        np.testing.assert_allclose(implicit(curve,axes),0,atol=5e-16)
        self.assertEqual(analytic_slice(4,axes).shape,(0,3))
        np.testing.assert_array_equal(analytic_slice(3,axes),[[0,0,3]])

    def test_mesh_slice_lies_in_plane_and_inside_ellipsoid(self):
        axes=(1.5,1,.8);vertices,faces=make_mesh(axes)
        segments=mesh_slice(vertices,faces,.13)
        self.assertGreater(len(segments),3)
        np.testing.assert_allclose(segments[:,:,2],.13)
        self.assertTrue(np.all(implicit(segments,axes)<=1e-14))
        _,count=np.unique(np.round(segments.reshape(-1,3),11),axis=0,return_counts=True)
        np.testing.assert_array_equal(count,2)

    def test_slice_on_latitude_ring_does_not_duplicate_shared_edges(self):
        vertices, faces = make_mesh((1.5, 1, .8), latitude=8, longitude=16)
        for ring in [0, 3, 6]:
            z = vertices[1+16*ring, 2]
            segments = mesh_slice(vertices, faces, z)
            self.assertEqual(len(segments), 16)
            _, counts = np.unique(segments.reshape(-1, 3), axis=0, return_counts=True)
            np.testing.assert_array_equal(counts, 2)
        self.assertEqual(mesh_slice(vertices, faces, .8).shape, (0, 2, 3))

    def test_radial_probe_reconstructs_face_point(self):
        axes=(1.5,1,.8);vertices,faces=make_mesh(axes)
        p=parametric(.73,1.1,axes);q,face,weights=radial_mesh_point(p,vertices,faces)
        np.testing.assert_allclose(q,weights@vertices[faces[face]],atol=3e-16)
        np.testing.assert_allclose(np.cross(p,q),0,atol=2e-16)
        self.assertLess(np.linalg.norm(q),np.linalg.norm(p));self.assertGreaterEqual(weights.min(),-1e-10)
        for vertex in [vertices[0],vertices[12],vertices[-1]]:
            np.testing.assert_allclose(radial_mesh_point(vertex,vertices,faces)[0],vertex,atol=6e-16)

    def test_orthographic_basis_preserves_3d_length(self):
        points=np.array([[1,2,3],[-2,.5,1]])
        xy,z=project(points,53,-12)
        np.testing.assert_allclose(np.sum(xy**2,axis=1)+z**2,np.sum(points**2,axis=1),atol=4e-15)

    def test_analytic_silhouette_is_tangent_to_view(self):
        axes=(1.5,1,.8);curve=silhouette(axes,33,21);_,forward=project(np.eye(3),33,21)
        np.testing.assert_allclose(implicit(curve,axes),0,atol=7e-16)
        np.testing.assert_allclose(analytic_normal(curve,axes)@forward,0,atol=4e-16)

    def test_surface_picking_projects_back(self):
        axes=(1.5,1,.8);p=pick_surface(.2,-.1,axes,33,21)
        self.assertAlmostEqual(float(implicit(p,axes)),0)
        np.testing.assert_allclose(project(p,33,21)[0],[.2,-.1],atol=3e-16)
        self.assertIsNone(pick_surface(100,100,axes))

    def test_tangent_picking_accepts_roundoff_but_rejects_outside(self):
        axes = (1.5, 1, .8)
        for azimuth, elevation in [(0, 0), (35, 25), (123, -60)]:
            boundary = silhouette(axes, azimuth, elevation, samples=48)
            screen, _ = project(boundary, azimuth, elevation)
            for xy in screen:
                point = pick_surface(*xy, axes, azimuth, elevation)
                self.assertIsNotNone(point)
                self.assertAlmostEqual(float(implicit(point, axes)), 0., places=13)
                np.testing.assert_allclose(project(point, azimuth, elevation)[0], xy, atol=8e-16)
                self.assertIsNone(pick_surface(*(xy*(1+1e-8)), axes, azimuth, elevation))

    def test_invalid_axes_and_zero_direction(self):
        for axes in [(0,1,1),(1,-1,1),(np.nan,1,1)]:
            with self.assertRaises(ValueError): make_mesh(axes)
        v,f=make_mesh()
        with self.assertRaises(ValueError):radial_mesh_point([0,0,0],v,f)


if __name__ == '__main__':unittest.main()
