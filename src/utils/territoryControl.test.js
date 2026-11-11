import assert from 'node:assert/strict';
import test from 'node:test';
import { area, polygon } from '@turf/turf';
import { applyTerritoryActivity, calculateTerritoryControl, getControlledAreaSqKm, selectControlledTerritories } from './territoryControl.js';

const rectangle = (west, south, east, north) => polygon([[[west,south],[east,south],[east,north],[west,north],[west,south]]]);
const outer = rectangle(0, 0, 4, 4);
const inner = rectangle(1, 1, 2, 2);
const activity = (routeId, username, geometry = inner, recordedAt = 0) => ({ routeId, username, polygon: geometry, recordedAt, name: routeId, color: username === 'Mila' ? '#65c78b' : '#588ee0' });

test('repeated owner runs strengthen territory without increasing controlled area', () => {
  const state = calculateTerritoryControl([activity('a','Mila',outer), activity('b','Mila',outer,1)]);
  assert.equal(state.length, 1);
  assert.equal(state[0].properties.strength, 2);
  assert.ok(Math.abs(getControlledAreaSqKm(state, 'Mila') - area(outer) / 1_000_000) < 0.000001);
});

test('first inner attack neutralizes only the inner area, second captures it', () => {
  const initial = calculateTerritoryControl([activity('a','Mila',outer)]);
  const neutral = applyTerritoryActivity(initial, activity('b','Jonas'));
  const unowned = neutral.find((region) => region.properties.strength === 0);
  assert.equal(unowned.properties.username, null);
  assert.equal(unowned.properties.color, null);
  const outside = neutral.find((region) => region.properties.username === 'Mila');
  assert.equal(outside.properties.strength, 1);
  assert.equal(outside.geometry.coordinates.length, 2);
  const captured = applyTerritoryActivity(neutral, activity('c','Jonas'));
  assert.equal(captured.find((region) => region.properties.username === 'Jonas').properties.strength, 1);
  assert.ok(Math.abs(getControlledAreaSqKm(captured,'Mila') - (area(outer) - area(inner)) / 1_000_000) < 0.000001);
});

test('strength three requires three attacks to neutralize and a fourth to capture', () => {
  let state = calculateTerritoryControl([activity('a','Mila',outer),activity('b','Mila',outer,1),activity('c','Mila',outer,2)]);
  for (let index = 0; index < 3; index += 1) state = applyTerritoryActivity(state, activity(`attack-${index}`,'Jonas',outer));
  assert.equal(state[0].properties.strength, 0);
  assert.equal(state[0].properties.username, null);
  state = applyTerritoryActivity(state, activity('capture','Jonas',outer));
  assert.equal(state[0].properties.strength, 1);
  assert.equal(state[0].properties.username, 'Jonas');
});

test('partial attack claims new land but only weakens the overlapping region', () => {
  const state = calculateTerritoryControl([activity('a','Mila',rectangle(0,0,2,2)),activity('b','Jonas',rectangle(1,0,3,2),1)]);
  assert.deepEqual(state.map((region) => region.properties.username).sort((first,second) => String(first).localeCompare(String(second))), ['Jonas','Mila',null]);
});

test('activity history is chronological, duplicate imports and flagged runs add no strength', () => {
  const first = activity('a','Mila',outer,0);
  const attack = activity('b','Jonas',outer,1);
  const state = calculateTerritoryControl([attack,first,{...first,routeId:'copy',activityKey:'same'},{...first,activityKey:'same'},{...attack,routeId:'flagged',flagged:true,recordedAt:2}]);
  assert.equal(state[0].properties.strength, 1);
  assert.equal(state[0].properties.username, 'Mila');
  const deduplicated = calculateTerritoryControl([{...first,activityKey:'same'}, {...first,routeId:'copy',activityKey:'same'}]);
  assert.equal(deduplicated[0].properties.strength, 1);
});

test('map selection does not replay or undo attacks and neutral land is not painted', () => {
  const activities = [activity('a','Mila',outer),activity('b','Jonas',inner,1)];
  const state = calculateTerritoryControl(activities);
  const before = JSON.stringify(state);
  const visible = selectControlledTerritories(state, [{id:'a'}], activities);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].username, 'Mila');
  assert.equal(visible[0].polygon.geometry.coordinates.length, 2);
  assert.deepEqual(selectControlledTerritories(state, [{id:'b'}], activities), []);
  assert.deepEqual(selectControlledTerritories(state, [], activities), []);
  assert.equal(JSON.stringify(state), before);
});