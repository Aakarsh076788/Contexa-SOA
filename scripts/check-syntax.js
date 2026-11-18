import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
let failed = 0, checked = 0;
for (const directory of ['backend', 'scripts', 'chrome-extension', 'vscode-extension']) {
  for (const file of readdirSync(directory, { recursive: true }).filter(x => x.endsWith('.js'))) {
    if (file === 'server.old.js' || file.includes('node_modules/')) continue;
    const result = spawnSync(process.execPath, ['--check', `${directory}/${file}`], { encoding: 'utf8' });
    checked++;
    if (result.status) { failed++; console.error(`${directory}/${file}: ${result.stderr}`); }
  }
}
console.log(`${checked} JavaScript files checked; ${failed} failures. JSX is checked by npm run build.`);
process.exitCode = failed ? 1 : 0;
