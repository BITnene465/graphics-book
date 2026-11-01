"""完成两个 TODO 后直接运行。第一题输入是线性 RGB，不要额外做 gamma。"""
import numpy as np


def box_average(samples):
    """TODO 1：samples 为非空 (N,3) 线性 RGB，返回 (3,) 等权平均。

    空输入必须抛出 ValueError。不要把样本数量与每轴分辨率混淆。
    """
    raise NotImplementedError("请实现 box_average")


def equivalent_frequency(frequency, sample_rate):
    """TODO 2：把频率折回 [-fs/2,fs/2)，保留符号；fs<=0 时抛出 ValueError。

    提示：模运算前后平移半个区间。不要直接对结果取绝对值。
    """
    raise NotImplementedError("请实现 equivalent_frequency")


def check():
    from numpy.testing import assert_allclose
    assert_allclose(box_average([[1, 1, 1], [0, 0, 0]]), [.5, .5, .5])
    assert_allclose(box_average([[.2, .4, .6]]*16), [.2, .4, .6])
    assert_allclose(box_average([[1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, 0]]), [.25, .25, .25])
    try:
        box_average([])
    except ValueError:
        pass
    else:
        raise AssertionError("空样本不能定义平均值")
    assert_allclose(equivalent_frequency(9, 8), 1)
    assert_allclose(equivalent_frequency(13, 8), -3)
    x, phase = np.arange(9)/8, .37
    f = equivalent_frequency(13, 8)
    assert_allclose(np.sin(2*np.pi*13*x+phase), np.sin(2*np.pi*f*x+phase), atol=1e-13)
    try:
        equivalent_frequency(3, 0)
    except ValueError:
        pass
    else:
        raise AssertionError("采样率必须大于零")
    print("8 项自检通过：常量保持、线性平均、带符号混叠与非法输入。")


if __name__ == '__main__':
    try:
        check()
    except NotImplementedError as error:
        print(f"尚未完成：{error}。先写出手算结果，再完成函数。")
