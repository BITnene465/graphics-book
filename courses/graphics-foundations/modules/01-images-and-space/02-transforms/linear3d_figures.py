"""同一立方体的三个正交投影；镜像与错切由 linear3d.py 计算。"""

import itertools
import numpy as np

BLUE, GREEN, YELLOW, WHITE, MUTED = (
    "#71b7ff",
    "#76dfb1",
    "#ffdc80",
    "#e8edf6",
    "#687c96",
)


def reflection_shear(p, t, Drawing, core):
    d = Drawing((-7.4, 7.4, -2.6, 3.15))
    point = np.asarray(p["point"])
    normal = np.asarray(p["normal"])
    reflect = p["operation"] == "平面镜像"
    valid = not reflect or np.any(normal != 0)
    matrix = (
        (
            core.plane_reflection(normal, p["distance"])
            if reflect
            else core.shear_matrix(p["shear"])
        )
        if valid
        else None
    )
    cube = np.array(list(itertools.product([-1.0, 1.0], repeat=3)))
    edges = [
        (i, j)
        for i in range(8)
        for j in range(i)
        if np.count_nonzero(cube[i] != cube[j]) == 1
    ]
    changed = core.transform_points(matrix, cube) if valid else None
    result = core.transform_points(matrix, point) if valid else None
    # 动画显示点沿法向/错切方向的位移；中途不冒充一个仍保持距离的镜像矩阵。
    moving = None if result is None else (1 - t) * point + t * result
    patch = core.plane_patch(normal, p["distance"]) if reflect and valid else None
    for cx, components in ((-4.9, (0, 1)), (0, (1, 2)), (4.9, (2, 0))):
        panel_key = "".join("xyz"[i] for i in components)
        with d.panel(panel_key, (cx - 2.6, cx + 2.6, -2.6, 3.15)):

            def project(q):
                return np.asarray(q)[..., list(components)] * 0.65 + [cx, 0]

            names = "xyz"
            d.text(
                [cx - 2.1, 2.65],
                "".join(names[i].upper() for i in components) + " · 同一空间",
                WHITE,
                13,
            )
            for axis in range(2):
                points = (
                    [[cx - 2.2, 0], [cx + 2.2, 0]]
                    if axis == 0
                    else [[cx, -2.2], [cx, 2.2]]
                )
                d.line(points, MUTED, 0.8, 0.6)
                d.text(
                    [cx + 2.12, -0.18] if axis == 0 else [cx + 0.08, 2.08],
                    names[components[axis]],
                    MUTED,
                    12,
                )
            if patch is not None:
                d.polygon(project(patch), BLUE, 0.14)
                d.line(project(np.vstack([patch, patch[0]])), BLUE, 1, 0.5)
                center = p["distance"] * core.unit(normal)
                d.arrow(project(center), project(center + core.unit(normal)), BLUE)
            for i, j in edges:
                d.line(project(cube[[i, j]]), MUTED, 1, 0.55, True)
                if valid:
                    d.line(project(changed[[i, j]]), GREEN, 1.8)
            d.dot(project(point), WHITE, 0.055)
            if valid:
                d.line(project([point, result]), YELLOW, 1.2, 0.8, True)
                d.dot(project(result), GREEN, 0.055)
                d.dot(project(moving), YELLOW, 0.07)
            key = "normal" if reflect and p["edit"] == "平面法向 n" else "point"
            d.handle(
                project(p[key]),
                key,
                "n" if key == "normal" else "p",
                limits=(
                    [-1.1, 1.1, -1.1, 1.1] if key == "point" else [-1.4, 1.4, -1.4, 1.4]
                ),
            )
            d.handles[-1].update(
                id=f"{key}:{components}",
                components=list(components),
                mapping=dict(scale=[0.65, 0.65], offset=[cx, 0]),
                color=BLUE if key == "normal" else WHITE,
            )
    d.formula = (
        r"\begin{aligned}"
        r"p'&=p-2(\widehat n\cdot p-d)\widehat n\\"
        r"H&=I-2\widehat n\widehat n^T"
        r"\end{aligned}"
        if reflect
        else r"\begin{aligned}"
        r"p'&=Sp,\quad\det S=1\\"
        r"S&=\begin{bmatrix}1&k&0\\0&1&0\\0&0&1\end{bmatrix}"
        r"\end{aligned}"
    )
    d.values = {
        "操作": p["operation"],
        "输入点 p": point.round(4).tolist(),
        "结果 p′": None if not valid else result.round(4).tolist(),
        "状态": (
            "零法向：平面尚未定义"
            if not valid
            else "浅色虚线原立方体 · 绿色变换结果 · 黄色位移进度"
        ),
    }
    if valid:
        linear = matrix[:3, :3]
        d.values.update(
            {
                "线性部分行列式": round(float(np.linalg.det(linear)), 6),
                "正交性误差 ‖AᵀA−I‖": round(
                    float(np.linalg.norm(linear.T @ linear - np.eye(3))), 6
                ),
                "位移进度": round(t, 3),
            }
        )
        if reflect:
            n = core.unit(normal)
            d.values["到平面的有符号距离（前/后）"] = [
                round(float(q @ n - p["distance"]), 5) for q in (point, result)
            ]
    return d
