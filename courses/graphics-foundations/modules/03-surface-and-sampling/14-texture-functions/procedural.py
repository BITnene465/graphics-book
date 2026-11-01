"""确定性格点 value noise 与有限 octave 合成；不依赖随机数生成器或查询次序。

points 的最后一维为 2 或 3，其他维度批量化。返回线性标量数据 [0, 1]。
每格使用张量积五次 fade 权重；这不是以随机梯度定义的 Perlin noise。
"""

from itertools import product

import numpy as np


def _points(points, bound=2**20):
    points = np.asarray(points, float)
    if points.ndim == 0 or points.shape[-1] not in (2, 3):
        raise ValueError("查询点须为 (...,2) 或 (...,3)")
    if not np.isfinite(points).all() or np.any(np.abs(points) > bound):
        raise ValueError("坐标须有限且绝对值不超过 2²⁰")
    return points


def lattice_hash(corners, seed=0):
    """整数坐标 → [0,1)；显式 32 位混合，可复现但不是密码学随机数。"""
    corners = _points(corners, 2**20 + 1)
    if np.any(corners != np.floor(corners)):
        raise ValueError("格点 hash 只接受整数坐标")
    if (
        not isinstance(seed, (int, np.integer))
        or isinstance(seed, (bool, np.bool_))
        or not 0 <= seed < 2**32
    ):
        raise ValueError("seed 须为 0..2³²−1 的整数")
    mask = np.uint64(0xFFFFFFFF)
    bits = (corners.astype(np.int64) & 0xFFFFFFFF).astype(np.uint64)
    hashed = np.full(corners.shape[:-1], seed, dtype=np.uint64)
    for axis, salt in enumerate((0x9E3779B9, 0x85EBCA77, 0xC2B2AE3D)):
        if axis < corners.shape[-1]:
            hashed ^= (bits[..., axis] * np.uint64(salt)) & mask
    hashed ^= hashed >> np.uint64(16)
    hashed = (hashed * np.uint64(0x7FEB352D)) & mask
    hashed ^= hashed >> np.uint64(15)
    hashed = (hashed * np.uint64(0x846CA68B)) & mask
    hashed ^= hashed >> np.uint64(16)
    return hashed.astype(float) / 2**32


def fade(s):
    """[0,1] 上的 6s⁵−15s⁴+10s³；两端一阶、二阶导数都为零。"""
    s = np.asarray(s, float)
    if not np.isfinite(s).all() or np.any((s < 0) | (s > 1)):
        raise ValueError("格内坐标须在 [0,1]")
    return np.clip(s * s * s * (s * (6 * s - 15) + 10), 0, 1)


def noise_probe(points, seed=0):
    """返回实际格点、格内坐标、角值和权重，供手算及演示检查。"""
    points = _points(points)
    cell = np.floor(points).astype(np.int64)
    fraction = points - cell
    eased = fade(fraction)
    offsets = np.array(list(product((0, 1), repeat=points.shape[-1])))
    corners = cell[..., None, :] + offsets
    values = lattice_hash(corners, seed)
    weights = np.prod(
        np.where(offsets, eased[..., None, :], 1 - eased[..., None, :]), axis=-1
    )
    return dict(
        cell=cell,
        fraction=fraction,
        eased=eased,
        corners=corners,
        corner_values=values,
        weights=weights,
        value=np.sum(weights * values, axis=-1),
    )


def value_noise(points, seed=0):
    """二维或三维格点 value noise；跨格 C² 连续，不声称严格带限。"""
    return noise_probe(points, seed)["value"]


def fbm_parts(points, octaves=4, gain=0.5, lacunarity=2.0, seed=0):
    """有限自相似合成；同一 seed，频率倍增，幅度衰减，最后除以幅度和。"""
    points = _points(points)
    if (
        not isinstance(octaves, (int, np.integer))
        or isinstance(octaves, (bool, np.bool_))
        or not 1 <= octaves <= 8
    ):
        raise ValueError("octaves 须为 1..8 的整数")
    if (
        not np.isfinite([gain, lacunarity]).all()
        or not 0 <= gain <= 1
        or not 1 <= lacunarity <= 4
    ):
        raise ValueError("gain 须为 0..1，lacunarity 须为 1..4")
    frequencies = lacunarity ** np.arange(octaves)
    amplitudes = gain ** np.arange(octaves)
    layers = np.stack(
        [value_noise(points * frequency, seed) for frequency in frequencies]
    )
    weights = amplitudes / amplitudes.sum()
    value = np.tensordot(weights, layers, axes=(0, 0))
    return dict(
        frequencies=frequencies,
        amplitudes=amplitudes,
        weights=weights,
        layers=layers,
        value=value,
    )


def fbm(points, octaves=4, gain=0.5, lacunarity=2.0, seed=0):
    """返回归一化的有限 octave 合成；不等同严格无限分形。"""
    return fbm_parts(points, octaves, gain, lacunarity, seed)["value"]
