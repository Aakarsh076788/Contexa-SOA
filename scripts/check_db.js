import { db } from '../backend/storage/db.js';

async function main() {
  try {
    const userCount = await db.user.count();
    const contextCount = await db.context.count();
    const eventCount = await db.event.count();
    console.log(`DB Connection: SUCCESS`);
    console.log(`Users: ${userCount}, Contexts: ${contextCount}, Events: ${eventCount}`);
  } catch (err) {
    console.error(`DB Connection: FAILED`);
    console.error('Check that PostgreSQL is running and DATABASE_URL is configured.');
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
main();
