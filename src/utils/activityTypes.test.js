import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeActivityType } from './activityTypes.js';

test('normalizes provider sport labels to known activity types', () => {
  assert.equal(normalizeActivityType('running'), 'run');
  assert.equal(normalizeActivityType('Trail Running'), 'run');
  assert.equal(normalizeActivityType('cycling'), 'bike');
  assert.equal(normalizeActivityType('mountain-biking'), 'bike');
  assert.equal(normalizeActivityType('WALKING'), 'hike');
  assert.equal(normalizeActivityType('hiking'), 'hike');
  assert.equal(normalizeActivityType('yoga'), null);
  assert.equal(normalizeActivityType(''), null);
  assert.equal(normalizeActivityType(undefined), null);
});
