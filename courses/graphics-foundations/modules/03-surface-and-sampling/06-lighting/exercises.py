"""先完成四个 TODO，再直接运行本文件。参考 core.py 与 mesh_shading.py。"""

import numpy as np


def lambert(normal, light, color, intensity=1.0):
    """TODO 1：返回线性 RGB。normal 与 light 未必单位长度，light 指向光源。

    自检输入均为非零方向。要归一化，再截断背光余弦，最后逐分量乘颜色。
    """
    raise NotImplementedError("请实现 lambert")


def transformed_normal(linear, normal):
    """TODO 2：linear 为 3×3 线性部分，返回变换后的单位法线。

    奇异矩阵必须抛出 ValueError 或 np.linalg.LinAlgError，不能返回假法线。
    """
    raise NotImplementedError("请实现 transformed_normal")


def gouraud_color(weights, vertex_colors):
    """TODO 3：用三个重心权重插值 (3,3) 顶点线性 RGB；不要做显示编码。"""
    raise NotImplementedError("请实现 gouraud_color")


def phong_normal(weights, vertex_normals):
    """TODO 4：插值 (3,3) 顶点单位法线，再把结果归一化。

    自检中加权和非零。即使三个输入都是单位向量，也不能跳过最后一步。
    """
    raise NotImplementedError("请实现 phong_normal")


def check():
    from numpy.testing import assert_allclose

    assert_allclose(
        lambert([0, 0, 1], [0.6, 0, 0.8], [0.5, 0.25, 1], 2), [0.8, 0.4, 1.6]
    )
    assert_allclose(lambert([0, 0, 3], [0, 0, 4], [0.2, 0.4, 0.6]), [0.2, 0.4, 0.6])
    assert_allclose(lambert([0, 0, 1], [0, 0, -1], [1, 1, 1]), [0, 0, 0])
    assert_allclose(lambert([0, 0, 1], [1, 0, 0], [1, 1, 1]), [0, 0, 0])
    a = np.diag([2.0, 1.0, 0.5])
    n = transformed_normal(a, [1, 0, 1])
    assert_allclose(n, np.array([1, 0, 4]) / np.sqrt(17), atol=1e-12)
    assert_allclose(n @ (a @ [1, 0, -1]), 0, atol=1e-12)
    assert_allclose(transformed_normal(np.eye(3) * 5, [0, 0, 3]), [0, 0, 1])
    try:
        transformed_normal(np.diag([0.0, 1.0, 1.0]), [1, 0, 0])
    except (ValueError, np.linalg.LinAlgError):
        pass
    else:
        raise AssertionError("奇异矩阵不能定义可靠的逆转置")
    weights = np.array([0.25, 0.25, 0.5])
    colors = np.array([[0.2, 0.3, 0.8], [0.8, 0.1, 0.2], [0.4, 0.9, 0.6]])
    assert_allclose(gouraud_color(weights, colors), [0.45, 0.55, 0.55])
    normals = np.array([[0.6, 0, 0.8], [-0.6, 0, 0.8], [0, 0.6, 0.8]])
    assert_allclose(
        phong_normal(weights, normals), np.array([0, 0.3, 0.8]) / np.sqrt(0.73)
    )
    assert_allclose(gouraud_color(weights, np.full((3, 3), 0.8)), [0.8, 0.8, 0.8])
    print("自检通过：余弦、背光、逆转置、奇异反例、颜色插值与法线重归一化。")


if __name__ == "__main__":
    try:
        check()
    except NotImplementedError as error:
        print(f"尚未完成：{error}。从第一题开始，再运行本文件。")
