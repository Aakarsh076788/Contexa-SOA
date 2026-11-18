import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('disposable preview starts and shuts down without leaving database connections', { timeout: 60000 }, async () => {
  const child = spawn(process.execPath, ['scripts/preview.js'], { env: { ...process.env, PREVIEW_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  try {
    const url = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Preview exited early (${code}): ${stderr}`)));
      child.stdout.on('data', chunk => {
        stdout += chunk;
        const match = stdout.match(/Disposable preview: (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) resolve(match[1]);
      });
    });
    assert.equal((await fetch(`${url}/api/health`)).status, 200);
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const [code] = await exited;
    assert.ok([0, 143].includes(code), stderr);
    assert.ok(stdout.includes('Disposable preview cleaned up.'), 'Preview must finish its cleanup hook before exiting.');
    assert.equal(stderr.includes('Unhandled'), false, stderr);
  } finally { if (child.exitCode === null) child.kill('SIGTERM'); }
});
