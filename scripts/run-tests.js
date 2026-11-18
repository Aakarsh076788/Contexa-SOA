// Fail closed before ANY test module imports dotenv or the database singleton.
// Integration helpers must explicitly replace this sentinel with a temporary DB.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
const args = process.argv.slice(2);
const targets = args.filter(value => /^tests\/[\w/.-]+\.test\.js$/.test(value) && !value.includes('..'));
const options = args.filter(value => /^--test-(?:name-pattern|skip-pattern|reporter|concurrency)=.+$/.test(value) || value === '--test-only');
if (args.length !== targets.length + options.length) throw new Error('Use explicit tests/*.test.js files and --test-name-pattern=... options.');
const files = targets.length ? targets : readdirSync('tests').filter(file => file.endsWith('.test.js')).sort().map(file => `tests/${file}`);
const child = spawn(process.execPath, ['--test', ...options, ...files], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: 'postgresql://disposable_only:invalid@127.0.0.1:1/never_use_real_data', CONTEXA_SECRET_KEY: 'ab'.repeat(32), OPENROUTER_API_KEY: '', GEMINI_API_KEY: '', RESEND_API_KEY: '', DISCORD_BOT_TOKEN: '', TELEGRAM_BOT_TOKEN: '', CONTEXA_ML_URL: 'http://127.0.0.1:1' }
});
child.once('error', () => { console.error('Could not start the isolated test runner.'); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
