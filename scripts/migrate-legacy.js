import { migrateLegacyWorkspace } from '../backend/storage/migrate-legacy.js';
import { db } from '../backend/storage/db.js';

try { console.log(await migrateLegacyWorkspace()); } finally { await db.$disconnect(); }
