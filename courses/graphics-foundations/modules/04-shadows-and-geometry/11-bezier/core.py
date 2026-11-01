"""Bézier：递归插值、Bernstein 形式、导数、精确分割和近似弧长参数。"""
from math import comb
import numpy as np


def _points(control):
    points = np.asarray(control, float)
    if points.ndim != 2 or len(points) < 1 or points.shape[1] < 1 or not np.isfinite(points).all():
        raise ValueError("控制点必须是非空、有限的 (N, D) 数组")
    return points


def de_casteljau(control, t):
    """返回包括控制点在内的每一层；最后一层唯一的点就是 C(t)。"""
    points = _points(control)
    if not np.isscalar(t) or not np.isfinite(t) or not 0 <= t <= 1:
        raise ValueError("t 必须是 [0,1] 中的有限标量")
    levels = [points.copy()]
    while len(levels[-1]) > 1:
        previous = levels[-1]
        levels.append((1-t)*previous[:-1]+t*previous[1:])
    return levels


def bernstein(t, degree=3):
    """每行是 Bᵢⁿ(t)=C(n,i)tⁱ(1−t)ⁿ⁻ⁱ；支持标量或一组 t。"""
    t = np.asarray(t, float)
    if not isinstance(degree, (int, np.integer)) or degree < 0:
        raise ValueError("次数必须是非负整数")
    if not np.isfinite(t).all() or np.any((t < 0) | (t > 1)):
        raise ValueError("参数必须位于 [0,1]")
    return np.stack([comb(degree, i)*t**i*(1-t)**(degree-i) for i in range(degree+1)], axis=-1)


def evaluate(control, t):
    """Bernstein 的独立求值方式；与 de Casteljau 的数值结果互相检查。"""
    points = _points(control)
    return bernstein(t, len(points)-1) @ points


def derivative(control, t):
    """C′(t) 也是 Bézier：次数降一，控制点为 n(Pᵢ₊₁−Pᵢ)。允许零导数。"""
    points = _points(control)
    degree = len(points)-1
    if degree == 0:
        return np.zeros_like(evaluate(points, t))
    return evaluate(degree*np.diff(points, axis=0), t)


def split(control, t):
    """精确分成两个 Bézier 段，每段重新参数化到 [0,1]，几何路径不变。"""
    levels = de_casteljau(control, t)
    left = np.array([level[0] for level in levels])
    right = np.array([level[-1] for level in reversed(levels)])
    return left, right


def arc_length_parameters(control, fractions, steps=800):
    """用折线长度查表反求 t，近似等弧长；不是解析弧长或误差有界求积。"""
    fractions = np.asarray(fractions, float)
    if not np.isfinite(fractions).all() or np.any((fractions < 0) | (fractions > 1)):
        raise ValueError("弧长比例应在 [0,1]")
    if not isinstance(steps, (int, np.integer)) or steps < 2:
        raise ValueError("至少需要两段折线")
    points = _points(control)
    if np.all(points == points[0]):
        raise ValueError("零长度曲线没有唯一的弧长参数反函数")
    t = np.linspace(0, 1, steps+1)
    curve = evaluate(points, t)
    distances = np.linalg.norm(np.diff(curve, axis=0), axis=-1)
    cumulative = np.concatenate([[0.], np.cumsum(distances)])
    if cumulative[-1] == 0:
        raise ValueError("零长度曲线没有唯一的弧长参数反函数")
    return np.interp(fractions*cumulative[-1], cumulative, t)
