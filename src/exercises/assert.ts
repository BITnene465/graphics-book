import assert from 'node:assert/strict';
/** 比较手算标量或任意层数的数组；不把 NaN 当作近似相等。 */
export function close(actual: unknown, expected: unknown, tolerance = 1e-10): void {
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual));
    assert.equal(actual.length, expected.length);
    expected.forEach((x, i) => close(actual[i], x, tolerance));
  } else {
    assert.equal(typeof actual, 'number');
    assert.equal(typeof expected, 'number');
    assert.ok(
      actual === expected || Math.abs((actual as number) - (expected as number)) <= tolerance,
      `${actual} ≉ ${expected}`,
    );
  }
}
