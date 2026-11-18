import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from '../backend/middleware/error.js';

test('database failures give actionable errors without leaking Prisma details', () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  try {
    for (const code of ['ECONNREFUSED', 'P1001', 'P1002', 'P1017', 'ETIMEDOUT']) {
      let status, body;
      const response = { status(value) { status = value; return this; }, json(value) { body = value; } };
      errorHandler(Object.assign(new Error('Invalid prisma.user.findFirst(): private connection details'), { code }), {}, response, () => {});
      assert.equal(status, 503);
      assert.match(body.error, /database is unavailable/i);
      assert.equal(body.error.includes('prisma'), false);
      assert.equal(body.error.includes('private'), false);
    }
  } finally { if (original === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original; }
});

test('unexpected errors stay private in development and validation remains readable', () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  try {
    let status, body;
    const response = { status(value) { status = value; return this; }, json(value) { body = value; } };
    errorHandler(new Error('Database schema and secrets'), {}, response, () => {});
    assert.equal(status, 500);
    assert.equal(body.error, 'An unexpected server error occurred.');
    errorHandler(Object.assign(new Error('Enter your email and password.'), { status: 400 }), {}, response, () => {});
    assert.equal(status, 400);
    assert.equal(body.error, 'Enter your email and password.');
  } finally { if (original === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original; }
});
