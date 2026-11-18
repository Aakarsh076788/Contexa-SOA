import { db } from './backend/storage/db.js';
import { hashPassword } from './backend/utils/crypto.js';
import { id } from './backend/utils/id.js';

async function seed() {
  console.log("Seeding database for demo...");
  
  // Clear old data
  await db.event.deleteMany();
  await db.context.deleteMany();
  await db.workspace.deleteMany();
  await db.user.deleteMany();
  
  // Create Demo User
  const userId = id('user');
  const user = await db.user.create({
    data: {
      id: userId,
      email: 'demo@contexa.app',
      password: await hashPassword('password123'),
    }
  });

  // Create Workspace
  const workspaceId = id('workspace');
  await db.workspace.create({
    data: {
      id: workspaceId,
      userId: user.id,
      settings: { theme: 'system', captureEnabled: true }
    }
  });

  // Create Context
  const contextId = id('context');
  await db.context.create({
    data: {
      id: contextId,
      workspaceId: workspaceId,
      name: 'Fix Payment Gateway Crash',
      topic: 'Stripe webhook throwing 500 errors',
      tint: 'violet',
      description: 'Investigating why the payment webhook is failing in production.',
      state: 'IMPLEMENTATION',
      confidence: 95
    }
  });

  // Create Events
  await db.event.createMany({
    data: [
      {
        id: id('event'),
        contextId: contextId,
        source: 'chrome',
        type: 'window',
        title: 'Stripe API Reference - Webhooks',
        detail: 'docs.stripe.com/webhooks',
        kind: 'RESEARCH',
        createdAt: new Date(Date.now() - 3600000)
      },
      {
        id: id('event'),
        contextId: contextId,
        source: 'vscode',
        type: 'document',
        title: 'api/webhooks.js',
        detail: 'Modified event parsing logic',
        kind: 'IMPLEMENTATION',
        createdAt: new Date(Date.now() - 3000000)
      },
      {
        id: id('event'),
        contextId: contextId,
        source: 'vscode',
        type: 'terminal',
        title: 'TypeError: Cannot read properties of undefined (reading "type")',
        detail: 'Terminal Error',
        kind: 'DEBUG',
        createdAt: new Date(Date.now() - 2500000)
      },
      {
        id: id('event'),
        contextId: contextId,
        source: 'discord',
        type: 'message',
        title: '#engineering channel',
        detail: 'Asked about webhook signing secrets',
        kind: 'CONVERSATION',
        createdAt: new Date(Date.now() - 1000000)
      }
    ]
  });

  console.log("Database seeded! You can login with demo@contexa.app / password123");
}

seed()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
