"""手写两步几何计算；直接运行本文件获得反馈，参考解答见 core.py。"""
from math import isclose


def signed_area(a, b, c):
    """返回有向三角形面积：逆时针为正，顺时针为负。"""
    # TODO：先计算 b-a 与 c-a 的二维叉积，再除以 2。
    raise NotImplementedError("请补完 signed_area 的二维叉积。")


def weights(p, vertices):
    """按 vertices 次序返回三个重心权重；共线时抛出 ValueError。"""
    # TODO：取出 a,b,c，检查总面积，计算三个有向面积比。
    # 保留外部点的负权重，不要裁剪到 [0, 1]。
    raise NotImplementedError("请补完 weights 的三个面积比。")


if __name__ == "__main__":
    a, b, c = (0, 0), (2, 0), (0, 2)
    exercises = [
        ("有向面积", signed_area, [
            ((a, b, c), 2.0),
            ((a, c, b), -2.0),
            ((a, b, (1, 0)), 0.0),
        ]),
        ("重心权重", weights, [
            ((a, (a, b, c)), (1.0, 0.0, 0.0)),
            (((1, 1), (a, b, c)), (0.0, 0.5, 0.5)),
            (((0.5, 0.5), (a, b, c)), (0.5, 0.25, 0.25)),
            (((1.5, 1.5), (a, b, c)), (-0.5, 0.75, 0.75)),
            (((1, 0.5), (a, c, b)), (0.25, 0.25, 0.5)),
            (((0, 0), (a, b, (1, 0))), ValueError),
        ]),
    ]
    for title, function, cases in exercises:
        try:
            for arguments, expected in cases:
                try:
                    actual = function(*arguments)
                except ValueError:
                    if expected is ValueError:
                        continue
                    raise
                assert expected is not ValueError, "总面积为零，应抛出 ValueError"
                values = actual if isinstance(expected, tuple) else (actual,)
                targets = expected if isinstance(expected, tuple) else (expected,)
                assert len(values) == len(targets), "返回值数量不正确"
                assert all(isclose(x, y, abs_tol=1e-9) for x, y in zip(values, targets)), (
                    f"得到 {actual}，预期 {expected}"
                )
        except NotImplementedError as error:
            print(f"待完成 · {title}：{error}")
        except (AssertionError, ValueError, TypeError, ZeroDivisionError) as error:
            print(f"再试试 · {title}：输入 {arguments}；{error}")
        else:
            print(f"通过 · {title}：{len(cases)} 个样例均符合预期。")
    print("思考：为什么权重和为 1，仍可能不在三角形里？")
