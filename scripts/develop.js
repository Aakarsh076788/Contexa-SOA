import 'dotenv/config';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import pg from 'pg';

// A supervisor for the existing database, API and Vite. It never initializes,
// replaces or migrates a database. Optional pg_ctl points to a user-owned cluster.
const run = (command, args, options = {}) => spawn(command, args, { stdio: 'inherit', ...options });
async function databaseReady() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2500 });
  try { await client.connect(); await client.query('SELECT 1'); return true; }
  catch { return false; }
  finally { await client.end().catch(() => {}); }
}
if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL in .env first.');
if (!await databaseReady()) {
  const address = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(address.hostname) || !process.env.LOCAL_PG_CTL || !process.env.LOCAL_PG_DATA) throw new Error('PostgreSQL is unavailable. Start it first, or configure LOCAL_PG_CTL and LOCAL_PG_DATA for an existing local cluster.');
  await mkdir('.local', { recursive: true });
  const start = run(process.env.LOCAL_PG_CTL, ['-D', process.env.LOCAL_PG_DATA, '-l', `${process.cwd()}/.local/postgresql14.log`, '-o', `-h localhost -p ${Number(address.port || 5432)}`, '-w', 'start']);
  const started = await new Promise(resolve => { start.once('exit', code => resolve(code === 0)); start.once('error', () => resolve(false)); });
  if (!started || !await databaseReady()) throw new Error('Local PostgreSQL did not start. Check .local/postgresql14.log. Existing data was not replaced.');
}
const children = [run(process.execPath, ['backend/server.js']), run(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'])];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true; process.exitCode = code;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
}
for (const child of children) {
  child.once('error', () => { console.error('A development service could not start.'); stop(1); });
  child.once('exit', code => { if (!stopping) stop(code || 1); });
}
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
