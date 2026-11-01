import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const id = process.argv[2]?.padStart(2, '0');
const slug = readdirSync(new URL('../src/chapters', import.meta.url)).find((s) =>
  s.startsWith(`${id}-`),
);
if (!slug || !existsSync(`src/chapters/${slug}/exercises.test.ts`)) {
  console.error(
    '用法：npm run exercise -- 01 [--solutions]。01–15 有编程练习；进阶章的自查见正文。',
  );
  process.exit(1);
}
const result = spawnSync(
  process.execPath,
  ['--experimental-strip-types', '--test', `src/chapters/${slug}/exercises.test.ts`],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      GRAPHICS_EXERCISES: process.argv.includes('--solutions') ? 'solutions' : 'student',
    },
  },
);
process.exit(result.status ?? 1);
