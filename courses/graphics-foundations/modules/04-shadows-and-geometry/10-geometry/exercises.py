"""两道几何练习：参数点与解析法线。"""
import numpy as np


def ellipsoid_point(u,v,axes):
    """TODO 1：u 是经度，v 是从 +Z 开始的极角，输入单位为弧度。"""
    raise NotImplementedError("把单位球参数式沿三个坐标轴分别缩放")


def ellipsoid_normal(point,axes):
    """TODO 2：归一化 F 的梯度；不要直接归一化位置向量。"""
    raise NotImplementedError("先对 x²/a²+y²/b²+z²/c²−1 求梯度")


def check():
    tasks=[
        ('参数点',lambda:(np.testing.assert_allclose(ellipsoid_point(0,np.pi/2,[2,1,3]),[2,0,0],atol=1e-15),
                         np.testing.assert_allclose(ellipsoid_point(1.2,0,[2,1,3]),[0,0,3],atol=1e-15))),
        ('解析法线',lambda:(np.testing.assert_allclose(ellipsoid_normal([np.sqrt(2),1/np.sqrt(2),0],[2,1,1]),[1/np.sqrt(5),2/np.sqrt(5),0]),
                           np.testing.assert_allclose(ellipsoid_normal([0,0,3],[2,1,3]),[0,0,1]))),
    ]
    for name,test in tasks:
        try:test();print(f'✓ {name}通过。解释椭球法线为何一般不沿径向。')
        except NotImplementedError as error:print(f'· {name}：{error}')
        except (ValueError,TypeError,AssertionError) as error:print(f'✗ {name}：检查角度、半轴平方和归一化。\n{error}')


if __name__=='__main__':check()
