import EmbeddedPostgres from 'embedded-postgres';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';

export async function startTestServer({ port = 0, ingestionWorker = true } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'contexa-test-'));
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const databasePort = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const postgres = new EmbeddedPostgres({ databaseDir: path.join(directory, 'db'), port: databasePort, user: 'contexa_test', password: 'disposable-test-password', persistent: true, postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} });
  let server, db, worker;
  try {
    await postgres.initialise();
    await postgres.start();
    await postgres.createDatabase('contexa_test');
    process.env.DATABASE_URL = `postgresql://contexa_test:disposable-test-password@127.0.0.1:${databasePort}/contexa_test`;
    process.env.NODE_ENV = 'test';
    process.env.CONTEXA_SECRET_KEY = 'ab'.repeat(32);
    process.env.OPENROUTER_API_KEY = '';
    process.env.GEMINI_API_KEY = '';
    const client = postgres.getPgClient('contexa_test', '127.0.0.1');
    await client.connect();
    try {
      const migrations = (await readdir('prisma/migrations', { withFileTypes: true })).filter(x => x.isDirectory()).map(x => x.name).sort();
      for (const migration of migrations) await client.query(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'));
    } finally { await client.end(); }
    db = (await import('../../backend/storage/db.js')).db;
    const [target] = await db.$queryRaw`SELECT current_database() AS name`;
    if (target.name !== 'contexa_test') throw new Error('Refusing to start test app against a non-test database. Import database-backed modules after startTestServer initializes its disposable environment.');
    const { app } = await import('../../backend/server.js');
    if (ingestionWorker) {
      const { startIngestionWorker } = await import('../../backend/services/ingestion-queue.js');
      worker = startIngestionWorker(db);
    }
    server = app.listen(port, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    return { db, url: `http://127.0.0.1:${server.address().port}`, close: async () => { await worker?.stop(); await new Promise(resolve => server.close(resolve)); await db.$disconnect(); await postgres.stop(); await rm(directory, { recursive: true, force: true }); } };
  } catch (error) {
    await worker?.stop();
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.$disconnect();
    await postgres.stop().catch(() => {});
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
