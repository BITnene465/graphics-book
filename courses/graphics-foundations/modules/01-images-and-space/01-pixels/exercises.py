"""两道练习。仅修改 TODO 函数，运行本文件获取反馈；参考 core.py。"""
import numpy as np


def centers(width, height):
    """TODO 1：返回 (H,W,2) 的归一化像素中心；数组第一行在上方。"""
    raise NotImplementedError("先在纸上列出 2×2 图像的四个中心")


def mix_black_white(t):
    """TODO 2：黑白两束光按 t 混合，返回正确的 sRGB 灰度标量。"""
    # t 同时也是本题的线性灰度。自己实现分段编码，不能直接返回 t。
    raise NotImplementedError("把线性灰度 t 代入本章的 sRGB 编码公式")


def check():
    tasks = [
        ("中心坐标", lambda: (
            np.testing.assert_allclose(centers(2, 2),
                                       [[[.25, .75], [.75, .75]], [[.25, .25], [.75, .25]]]),
            np.testing.assert_allclose(centers(4, 1)[0, -1], [.875, .5]))),
        ("在线性空间混合", lambda: (
            np.testing.assert_allclose([mix_black_white(0), mix_black_white(.5), mix_black_white(1)],
                                       [0, .735356983, 1], atol=1e-8),
            np.testing.assert_allclose(mix_black_white(.001), .01292, atol=1e-9))),
    ]
    for name, run in tasks:
        try:
            run()
            print(f"✓ {name}：通过。现在解释为什么，而不只检查数值。")
        except NotImplementedError as error:
            print(f"· {name}：{error}")
        except (AssertionError, TypeError, ValueError, IndexError) as error:
            print(f"✗ {name}：再检查 y 的方向、像素中心偏移或 sRGB 分段。\n{error}")


if __name__ == "__main__":
    check()
