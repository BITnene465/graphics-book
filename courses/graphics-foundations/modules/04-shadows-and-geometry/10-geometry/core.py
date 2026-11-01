"""同一个椭球的隐式式、参数式与闭合三角网格。仅依赖 NumPy。"""
import numpy as np


def valid_axes(axes):
    axes = np.asarray(axes, float)
    if axes.shape != (3,) or not np.isfinite(axes).all() or np.any(axes <= 0):
        raise ValueError("三个半轴必须是正的有限数")
    return axes


def parametric(u, v, axes=(1, 1, 1)):
    """经度 u∈[0,2π)、极角 v∈[0,π] → 椭球上的点 (...,3)。"""
    a, b, c = valid_axes(axes)
    u, v = np.broadcast_arrays(np.asarray(u, float), np.asarray(v, float))
    return np.stack([a*np.sin(v)*np.cos(u), b*np.sin(v)*np.sin(u), c*np.cos(v)], axis=-1)


def tangents(u, v, axes=(1, 1, 1)):
    """参数偏导 (∂p/∂u, ∂p/∂v)。极点处第一项为零，参数化不正则。"""
    a, b, c = valid_axes(axes)
    u, v = np.broadcast_arrays(np.asarray(u, float), np.asarray(v, float))
    du = np.stack([-a*np.sin(v)*np.sin(u), b*np.sin(v)*np.cos(u), np.zeros_like(u)], axis=-1)
    dv = np.stack([a*np.cos(v)*np.cos(u), b*np.cos(v)*np.sin(u), -c*np.sin(v)], axis=-1)
    return du, dv


def implicit(points, axes=(1, 1, 1)):
    """F<0 内部，F=0 表面，F>0 外部。F 不是符号距离。"""
    return np.sum((np.asarray(points, float)/valid_axes(axes))**2, axis=-1)-1


def analytic_normal(points, axes=(1, 1, 1)):
    """单位梯度法线。椭球中心 ∇F=0，不强行给它指定一个方向。"""
    gradient = 2*np.asarray(points, float)/valid_axes(axes)**2
    length = np.linalg.norm(gradient, axis=-1, keepdims=True)
    if not np.isfinite(gradient).all() or np.any(length == 0):
        raise ValueError("零梯度或非有限梯度没有可归一化法线")
    return gradient/length


def make_mesh(axes=(1, 1, 1), latitude=8, longitude=16):
    """两个极点各一个索引，经线用取模闭合；无重复接缝顶点、无退化极帽。"""
    axes = valid_axes(axes)
    if not isinstance(latitude, int) or not isinstance(longitude, int) or latitude < 2 or longitude < 3:
        raise ValueError("纬向至少 2 段，经向至少 3 段")
    u, v = np.meshgrid(np.arange(longitude)*2*np.pi/longitude, np.arange(1,latitude)*np.pi/latitude)
    vertices = np.vstack([[0,0,axes[2]], parametric(u,v,axes).reshape(-1,3), [0,0,-axes[2]]])
    faces = []
    for k in range(longitude):
        k1 = (k+1) % longitude
        faces.append([0,1+k,1+k1])
        for ring in range(latitude-2):
            a,b = 1+ring*longitude+k,1+ring*longitude+k1
            faces.extend([[a,a+longitude,b+longitude],[a,b+longitude,b]])
        base = 1+(latitude-2)*longitude
        faces.append([len(vertices)-1,base+k1,base+k])
    return vertices, np.asarray(faces, int)


def face_geometry(vertices, faces):
    """三角形面心、单位外法线、面积；依赖顶点的绕序。"""
    triangle = np.asarray(vertices, float)[np.asarray(faces, int)]
    cross = np.cross(triangle[:,1]-triangle[:,0],triangle[:,2]-triangle[:,0])
    length = np.linalg.norm(cross,axis=1)
    if np.any(length == 0):
        raise ValueError("退化三角形没有唯一面法线")
    return triangle.mean(axis=1), cross/length[:,None], length/2


def mesh_statistics(vertices, faces, axes):
    """体积和面心方向径向误差；后者是有限采样指标，不是 Hausdorff 距离。"""
    centers, _, area = face_geometry(vertices, faces)
    edges = np.sort(np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]]),axis=1)
    unique, counts = np.unique(edges,axis=0,return_counts=True)
    triangle = vertices[faces]
    volume = np.sum(triangle[:,0]*np.cross(triangle[:,1],triangle[:,2]))/6
    exact = 4*np.pi*np.prod(valid_axes(axes))/3
    surface = centers/np.sqrt(np.sum((centers/axes)**2,axis=1))[:,None]
    return dict(vertices=len(vertices),edges=len(unique),faces=len(faces),euler=len(vertices)-len(unique)+len(faces),
                closed_edges=bool(np.all(counts==2)),volume=volume,exact_volume=exact,
                relative_volume_error=abs(volume-exact)/exact,area=area.sum(),
                max_radial_sample_error=np.linalg.norm(surface-centers,axis=1).max())


def analytic_slice(z, axes, samples=160):
    """z=常量与椭球相交：椭圆、一个极点，或空集。"""
    a,b,c = valid_axes(axes)
    factor = 1-(z/c)**2
    if factor < 0:
        return np.empty((0,3))
    if factor == 0:
        return np.array([[0.,0.,z]])
    u = np.linspace(0,2*np.pi,samples+1)
    return np.column_stack([a*np.sqrt(factor)*np.cos(u),b*np.sqrt(factor)*np.sin(u),np.full_like(u,z)])


def mesh_slice(vertices, faces, z):
    """本章闭合经纬网格的水平截线，返回 (N,2,3)；单顶点接触不产生线段。"""
    segments = []
    for tri in vertices[faces]:
        points = []
        for i, j in [(0,1),(1,2),(2,0)]:
            a, b = tri[i], tri[j]
            da, db = a[2]-z, b[2]-z
            if da == 0:
                points.append(a)
            if (da < 0 < db) or (db < 0 < da):
                points.append(a + (da/(da-db))*(b-a))
        if points:
            points = np.unique(np.asarray(points), axis=0)
            if len(points) == 2:
                segments.append(points)
    # 截面恰好经过纬圈时，相邻两面会各报告一次同一条边。
    # 每段端点已按坐标排序，因此可按六个坐标去重，保留唯一截线。
    unique = np.unique(np.asarray(segments, float).reshape(-1,6), axis=0)
    return unique.reshape(-1,2,3)


def radial_mesh_point(point, vertices, faces):
    """由中心向解析点发射线，找网格交点；共享边命中时取最低面索引。"""
    direction = np.asarray(point, float)
    if direction.shape != (3,) or not np.isfinite(direction).all() or np.linalg.norm(direction) == 0:
        raise ValueError("射线方向需要非零有限三维向量")
    direction = direction/np.linalg.norm(direction)
    tri = vertices[faces]
    e1, e2 = tri[:,1]-tri[:,0], tri[:,2]-tri[:,0]
    h = np.cross(direction, e2)
    det = np.sum(e1*h, axis=1)
    valid = np.abs(det) > 1e-12*np.linalg.norm(e1,axis=1)*np.linalg.norm(e2,axis=1)
    inv = np.divide(1., det, out=np.zeros_like(det), where=valid)
    s = -tri[:,0]
    u = np.sum(s*h, axis=1)*inv
    q = np.cross(s, e1)
    v = q@direction*inv
    t = np.sum(e2*q, axis=1)*inv
    hit = valid & (u>=-1e-10) & (v>=-1e-10) & (u+v<=1+1e-10) & (t>0)
    indices = np.flatnonzero(hit)
    if not len(indices):
        raise ValueError("射线没有命中网格")
    index = int(indices[0])
    return t[index]*direction, index, np.array([1-u[index]-v[index],u[index],v[index]])


def project(points, azimuth=35, elevation=25):
    """自写正交观察变换，返回 (二维坐标, 朝观察者的深度)。角度以度输入。"""
    az, el = np.deg2rad([azimuth, elevation])
    forward = np.array([np.cos(el)*np.cos(az), np.cos(el)*np.sin(az), np.sin(el)])
    right = np.array([-np.sin(az), np.cos(az), 0.])
    up = np.cross(forward, right)
    points = np.asarray(points, float)
    return np.stack([points@right, points@up], axis=-1), points@forward


def silhouette(axes,azimuth=35,elevation=25,samples=160):
    """正交观察下的解析轮廓，满足 F=0 且 ∇F·观察方向=0。"""
    axes = valid_axes(axes)
    _, forward = project(np.eye(3), azimuth, elevation)
    normal = forward/axes
    normal /= np.linalg.norm(normal)
    reference = np.array([0.,0.,1.]) if abs(normal[2]) < .9 else np.array([1.,0.,0.])
    a = np.cross(normal, reference)
    a /= np.linalg.norm(a)
    b = np.cross(normal, a)
    angle = np.linspace(0, 2*np.pi, samples+1)
    return (np.cos(angle)[:,None]*a+np.sin(angle)[:,None]*b)*axes


def pick_surface(x,y,axes,azimuth=35,elevation=25):
    """观察平面点反投影为平行射线，返回最近的椭球表面点或 None。"""
    axes = valid_axes(axes)
    basis, direction = project(np.eye(3), azimuth, elevation)
    origin = basis@np.array([x, y])
    a = np.sum((direction/axes)**2)
    b = 2*np.sum(origin*direction/axes**2)
    c = implicit(origin, axes)
    discriminant = b*b-4*a*c
    # 相切时真值为零，c 中的减法和判别式计算都可能引入微小负数。
    # 容差跟随本次运算的量级，不用固定世界距离把轮廓任意扩大。
    scale = b*b + 4*a*(np.sum((origin/axes)**2)+1)
    tolerance = 32*np.finfo(float).eps*scale
    if discriminant < -tolerance:
        return None
    t = (-b+np.sqrt(max(0., discriminant)))/(2*a)  # 观察者位于 +direction 一侧。
    return origin+t*direction
