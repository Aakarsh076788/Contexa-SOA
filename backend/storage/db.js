import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import { PrismaPg } from '@prisma/adapter-pg';
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;

const globalForPrisma = global;

let db;

if (globalForPrisma.prisma) {
  db = globalForPrisma.prisma;
} else {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, statement_timeout: 15000, max: 10 });
  const adapter = new PrismaPg(pool, {
    disposeExternalPool: true,
    onPoolError: () => { if (process.env.NODE_ENV !== 'test') console.error('Database connection interrupted; requests will reconnect when it is available.'); }
  });
  db = new PrismaClient({ adapter });
}

export { db };

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
