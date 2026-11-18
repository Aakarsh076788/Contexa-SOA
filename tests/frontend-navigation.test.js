import test from 'node:test';
import assert from 'node:assert/strict';
import { readRoute, routePath } from '../src/lib/navigation.js';

test('known routes and copied context links restore the intended view', () => {
  assert.equal(readRoute({ pathname: '/inbox/' }).page, 'Inbox');
  assert.equal(readRoute({ pathname: '/contexts/context-123' }).contextId, 'context-123');
  assert.equal(routePath('Context Details', 'a:b'), '/contexts/a%3Ab');
  assert.equal(readRoute({ pathname: '/reset-password' }).authAction, 'reset');
});

test('unknown or malformed context links cannot become invalid application state', () => {
  for (const pathname of ['/unknown', '/contexts/%', '/contexts/a%2Fb', '/contexts/%20', '/contexts/a/b']) assert.equal(readRoute({ pathname }).valid, false, pathname);
});
