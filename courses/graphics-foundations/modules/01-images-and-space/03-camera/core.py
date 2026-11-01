"""相机、投影和线段裁剪。右手系，相机看 -Z，列向量，NDC ∈ [-1, 1]。

按 look_at → perspective → clip_segment → perspective_divide → viewport 阅读。
批量点存为 (N, 4) 行数组，因此代码使用 points @ matrix.T。
"""

import numpy as np


def _vector(value, size):
    value = np.asarray(value, dtype=float)
    if value.shape != (size,) or not np.isfinite(value).all():
        raise ValueError(f"需要 {size} 个有限数值")
    return value


def _unit(vector):
    length = np.linalg.norm(vector)
    if not np.isfinite(length) or length <= 1e-12:
        raise ValueError("零向量或过小的方向无法定义相机")
    return vector / length


def look_at(eye, target, up=(0, 1, 0)):
    """世界 → 相机；拒绝 eye=target 和 up 与视线平行的奇异姿态。"""
    eye, target, up = (_vector(v, 3) for v in (eye, target, up))
    forward = _unit(target - eye)
    right = _unit(np.cross(forward, _unit(up)))
    camera_up = np.cross(right, forward)
    rotation = np.stack((right, camera_up, -forward))
    view = np.eye(4)
    view[:3, :3] = rotation
    view[:3, 3] = -rotation @ eye
    return view


def _check_volume(aspect, near, far):
    if not np.isfinite([aspect, near, far]).all():
        raise ValueError("投影参数必须是有限数值")
    if aspect <= 0 or not 0 < near < far:
        raise ValueError("要求 aspect > 0 且 0 < near < far")


def perspective(fov_y_degrees, aspect, near, far):
    """垂直视场角，深度 -near → NDC -1，-far → +1，w_clip = -z_view。"""
    _check_volume(aspect, near, far)
    if not np.isfinite(fov_y_degrees) or not 0 < fov_y_degrees < 180:
        raise ValueError("垂直视场角必须在 (0, 180) 度之间")
    s = 1 / np.tan(np.deg2rad(fov_y_degrees) / 2)
    return np.array([
        [s / aspect, 0, 0, 0],
        [0, s, 0, 0],
        [0, 0, -(far + near) / (far - near), -2 * far * near / (far - near)],
        [0, 0, -1, 0],
    ])


def orthographic(height, aspect, near, far):
    """正交窗口的完整高度为 height；x/y 缩放不依赖深度。"""
    _check_volume(aspect, near, far)
    if not np.isfinite(height) or height <= 0:
        raise ValueError("正交窗口高度必须为正数")
    return np.array([
        [2 / (height * aspect), 0, 0, 0],
        [0, 2 / height, 0, 0],
        [0, 0, -2 / (far - near), -(far + near) / (far - near)],
        [0, 0, 0, 1],
    ])


def transform_points(points, matrix):
    """将 (N, 3) 普通点转成 (N, 4) 齐次点并变换；保留 w，不做除法。"""
    points, matrix = np.asarray(points, float), np.asarray(matrix, float)
    if points.ndim != 2 or points.shape[1] != 3 or matrix.shape != (4, 4):
        raise ValueError("需要 (N, 3) 点数组与 (4, 4) 矩阵")
    if not np.isfinite(points).all() or not np.isfinite(matrix).all():
        raise ValueError("点和矩阵必须有限")
    return np.column_stack((points, np.ones(len(points)))) @ matrix.T


def clip_segment(start, end):
    """在齐次空间将线段裁到 -w <= x,y,z <= w；全不可见返回 None。

    六个半空间都形如 g(p) = w ± coordinate >= 0。
    p(t) = (1-t)*start + t*end；每个平面收紧参数区间 [enter, leave]。
    此时尚未除以 w，所以穿过相机/近平面的线段仍然连续。
    """
    start, end = _vector(start, 4), _vector(end, 4)
    enter, leave = 0.0, 1.0
    for axis in range(3):
        for sign in (-1, 1):
            g0 = start[3] + sign * start[axis]
            g1 = end[3] + sign * end[axis]
            if g0 < 0 and g1 < 0:
                return None
            if g0 < 0 <= g1:
                enter = max(enter, g0 / (g0 - g1))
            elif g1 < 0 <= g0:
                leave = min(leave, g0 / (g0 - g1))
            if enter > leave:
                return None
    endpoints = np.stack(((1 - enter) * start + enter * end,
                          (1 - leave) * start + leave * end))
    # 齐次原点不表示有限的点。合法 near > 0 的投影不会留下这个原点。
    if np.any(endpoints[:, 3] <= 0):
        return None
    return endpoints


def perspective_divide(clip_points):
    """有效正 w 的齐次点 → NDC；调用者必须先裁剪图元。"""
    points = np.asarray(clip_points, float)
    if points.ndim != 2 or points.shape[1] != 4 or not np.isfinite(points).all():
        raise ValueError("需要有限的 (N, 4) 齐次点")
    if np.any(points[:, 3] <= 0):
        raise ValueError("必须先裁剪；不能对 w <= 0 的点做透视除法")
    return points[:, :3] / points[:, 3, None]


def viewport(ndc_points, width, height):
    """NDC → 连续屏幕坐标；左上原点，Y 只翻转这一次。

    边界对应 0 和 width/height；像素中心另为 i+0.5、j+0.5。
    """
    points = np.asarray(ndc_points, float)
    if points.ndim != 2 or points.shape[1] != 3 or not np.isfinite(points).all():
        raise ValueError("需要有限的 (N, 3) NDC 点")
    if not np.isfinite([width, height]).all() or min(width, height) <= 0:
        raise ValueError("屏幕宽高必须为正数")
    return np.column_stack(((points[:, 0] + 1) * width / 2,
                            (1 - points[:, 1]) * height / 2))


def project_wireframe(vertices, edges, view, projection, width, height):
    """完整的 CPU 线框投影。返回屏幕线段列表，保留每条边的可见部分。"""
    view_points = transform_points(vertices, view)
    clip_points = view_points @ np.asarray(projection, float).T
    screen_segments = []
    for first, second in edges:
        clipped = clip_segment(clip_points[first], clip_points[second])
        if clipped is not None:
            screen_segments.append(viewport(perspective_divide(clipped), width, height))
    return screen_segments
