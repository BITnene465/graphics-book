import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const files = (await readdir(new URL('../src/', import.meta.url), { recursive: true }))
  .filter((name) => name.endsWith('.test.ts'))
  .sort()
  .map((name) => `src/${name}`);
if (!files.length) throw new Error('没有发现测试文件');
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', ...files], {
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
