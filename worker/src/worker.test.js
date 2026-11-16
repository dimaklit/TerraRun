import test from 'node:test';
import assert from 'node:assert/strict';
import { createPkcePair, openState, sealState } from './state.js';
import { recordsToFeature } from './fit.js';

test('state round-trips and rejects tampering or expiry', async () => {
  const sealed = await sealState({ userId: 'u1', verifier: 'v' }, 'secret', 1000);
  assert.deepEqual(await openState(sealed, 'secret', 2000), { userId: 'u1', verifier: 'v', exp: 601000 });
  await assert.rejects(openState(sealed, 'other', 2000));
  await assert.rejects(openState(sealed, 'secret', 700000), /expired/);
});

test('PKCE challenge differs from verifier', async () => {
  const { verifier, challenge } = await createPkcePair();
  assert.notEqual(verifier, challenge);
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
});

test('recordsToFeature keeps only GPS points with times', () => {
  const feature = recordsToFeature([
    { position_lat: 40.1, position_long: -73.1, timestamp: new Date('2026-11-01T08:00:00Z') },
    { heart_rate: 120, timestamp: new Date('2026-11-01T08:00:01Z') },
    { position_lat: 40.2, position_long: -73.2, timestamp: new Date('2026-11-01T08:00:02Z') },
  ], 'Run');
  const line = feature.features[0];
  assert.deepEqual(line.geometry.coordinates, [[-73.1, 40.1], [-73.2, 40.2]]);
  assert.deepEqual(line.properties.coordinateProperties.times, ['2026-11-01T08:00:00.000Z', '2026-11-01T08:00:02.000Z']);
  assert.equal(recordsToFeature([{ position_lat: 1, position_long: 1, timestamp: new Date() }], 'x'), null);
});
