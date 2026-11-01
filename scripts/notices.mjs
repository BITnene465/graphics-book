/** 将实际打包的运行依赖许可随静态站点一起发布。 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
const root = resolve('.'),
  require = createRequire(resolve(root, 'package.json'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8')),
  seen = new Set(),
  entries = [];
function visit(name, parentDirectory = root) {
  const from = createRequire(resolve(parentDirectory, 'package.json'));
  let directory;
  try {
    directory = dirname(from.resolve(`${name}/package.json`));
  } catch {
    directory = dirname(from.resolve(name));
    while (!readdirSync(directory).includes('package.json')) directory = dirname(directory);
  }
  const path = resolve(directory, 'package.json'),
    info = JSON.parse(readFileSync(path, 'utf8'));
  if (seen.has(path)) return;
  seen.add(path);
  const licenses = readdirSync(directory)
    .filter((file) => /^(license|licence|copying|notice)(\.|$)/i.test(file))
    .sort();
  entries.push({
    name: info.name,
    text: `${info.name} ${info.version}\nLicense: ${typeof info.license === 'string' ? info.license : JSON.stringify(info.license)}\n${licenses.map((file) => readFileSync(resolve(directory, file), 'utf8')).join('\n')}`,
  });
  for (const dependency of Object.keys(info.dependencies ?? {})) visit(dependency, directory);
}
for (const name of Object.keys(pkg.dependencies)) visit(name);
mkdirSync('public', { recursive: true });
writeFileSync(
  'public/third-party-notices.txt',
  'Runtime dependencies of 从像素到光线\n\n' +
    entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => e.text)
      .join('\n\n' + '='.repeat(72) + '\n\n'),
);
console.log(`已整理 ${entries.length} 项运行依赖许可。`);
