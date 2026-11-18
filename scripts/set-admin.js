import { db } from '../backend/storage/db.js';

const ADMIN_EMAIL = 'chimmaniaakarsh7@gmail.com';

async function main() {
  const user = await db.user.findFirst({ where: { email: ADMIN_EMAIL } });
  if (!user) {
    console.error(`User ${ADMIN_EMAIL} not found.`);
    process.exit(1);
  }
  await db.user.update({ where: { id: user.id }, data: { role: 'admin' } });
  console.log(`✓ Set ${ADMIN_EMAIL} as admin (user ${user.id}).`);
  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
