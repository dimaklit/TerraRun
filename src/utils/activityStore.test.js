import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPrivateActivities, savePrivateActivities } from './activityStore.js';

test('loading private activities filters by the authenticated user and time-orders results', async () => {
  const calls = [];
  const query = {
    select(value) { calls.push(['select', value]); return this; },
    eq(field, value) { calls.push(['eq', field, value]); return this; },
    order(field, options) { calls.push(['order', field, options]); return Promise.resolve({ data: [], error: null }); },
  };
  const client = { from(table) { calls.push(['from', table]); return query; } };
  assert.deepEqual(await loadPrivateActivities(client, 'user-123'), []);
  assert.deepEqual(calls, [
    ['from', 'private_activities'],
    ['select', 'activity_key, route, claim, recorded_at'],
    ['eq', 'user_id', 'user-123'],
    ['order', 'recorded_at', { ascending: true }],
  ]);
});

test('saving stores routes, optional claims and activity timestamps for one user', async () => {
  let inserted;
  const client = { from() { return { insert(rows) { inserted = rows; return Promise.resolve({ error: null }); } }; } };
  const routes = [
    { id: 'route-1', activityKey: 'key-1', recordedAt: 1_800_000_000_000 },
    { id: 'route-2', activityKey: 'key-2', recordedAt: 1_800_000_001_000 },
  ];
  const claims = [{ routeId: 'route-1', areaSqKm: 0.1 }];
  await savePrivateActivities(client, 'user-123', routes, claims);
  assert.equal(inserted.length, 2);
  assert.equal(inserted[0].user_id, 'user-123');
  assert.equal(inserted[0].claim, claims[0]);
  assert.equal(inserted[1].claim, null);
  assert.equal(inserted[0].recorded_at, new Date(routes[0].recordedAt).toISOString());
});

test('database errors are propagated to the caller', async () => {
  const failure = new Error('Data API unavailable');
  const client = { from() { return { insert() { return Promise.resolve({ error: failure }); } }; } };
  await assert.rejects(savePrivateActivities(client, 'user-123', [{ id: 'route-1', activityKey: 'key', recordedAt: Date.now() }], []), failure);
});