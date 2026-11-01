"""先完成两个小函数，再运行本文件；参考分别见07插值与本章source_over。"""

import numpy as np


def recover_attribute(screen_weights, values, inv_w):
    """屏幕重心权重(3,)、顶点属性(3,K)、顶点1/w(3,) → 属性(K,)。"""
    raise NotImplementedError("请实现 recover_attribute")


def blend_linear(source, destination, alpha):
    """不透明目标上的线性 RGB source-over。"""
    raise NotImplementedError("请实现 blend_linear")


if __name__ == "__main__":
    try:
        np.testing.assert_allclose(
            recover_attribute([0.5, 0.5, 0], [[0], [1], [0.4]], [1, 0.25, 0.5]), [0.2]
        )
        np.testing.assert_allclose(
            blend_linear([1, 0, 0], [0, 0, 0.5], 0.5), [0.5, 0, 0.25]
        )
        print("两项手算通过。继续尝试所有w相等、alpha=0或1。")
    except NotImplementedError as error:
        print(error)
