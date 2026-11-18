import { db } from '../backend/storage/db.js';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const snapshotPath = join(__dirname, 'contexa_db_snapshot.json');

async function restoreDatabase() {
  if (!existsSync(snapshotPath)) {
    console.error('Snapshot file not found at:', snapshotPath);
    process.exit(1);
  }

  console.log('Reading snapshot from:', snapshotPath);
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const { data } = snapshot;

  console.log('Restoring Contexa database snapshot from:', snapshot.exportedAt);

  // Restore Users
  for (const item of data.users || []) {
    await db.user.upsert({
      where: { id: item.id },
      update: item,
      create: item
    });
  }
  console.log(`✓ Restored ${(data.users || []).length} users.`);

  // Restore Workspaces
  for (const item of data.workspaces || []) {
    await db.workspace.upsert({
      where: { id: item.id },
      update: item,
      create: item
    });
  }
  console.log(`✓ Restored ${(data.workspaces || []).length} workspaces.`);

  // Restore Connectors
  for (const item of data.connectors || []) {
    await db.connector.upsert({
      where: { id: item.id },
      update: item,
      create: item
    });
  }
  console.log(`✓ Restored ${(data.connectors || []).length} connectors.`);

  // Restore Contexts
  for (const item of data.contexts || []) {
    await db.context.upsert({
      where: { id: item.id },
      update: item,
      create: item
    });
  }
  console.log(`✓ Restored ${(data.contexts || []).length} contexts.`);

  // Restore Entities
  for (const item of data.entities || []) {
    await db.entity.upsert({
      where: { id: item.id },
      update: item,
      create: item
    });
  }
  console.log(`✓ Restored ${(data.entities || []).length} entities.`);

  // Restore Events
  for (const item of data.events || []) {
    await db.event.upsert({
      where: { id: item.id },
      update: item,
      create: item
    });
  }
  console.log(`✓ Restored ${(data.events || []).length} events.`);

  console.log('🎉 Database successfully restored from snapshot!');
  process.exit(0);
}

restoreDatabase().catch((err) => {
  console.error('Restore failed:', err);
  process.exit(1);
});
