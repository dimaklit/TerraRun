export const ACTIVITY_TYPES = [
  { id: 'run', label: 'Run', maxSpeedKmh: 35 },
  { id: 'hike', label: 'Hike', maxSpeedKmh: 15 },
  { id: 'bike', label: 'Bike', maxSpeedKmh: 65 },
];

export const DEFAULT_ACTIVITY_TYPE = 'run';

const ALIASES = {
  run: ['run', 'running', 'trail_running', 'street_running', 'track_running', 'treadmill_running', 'ultra_running', 'jogging'],
  hike: ['hike', 'hiking', 'walk', 'walking', 'trekking', 'casual_walking', 'speed_walking', 'mountaineering', 'rucking'],
  bike: ['bike', 'biking', 'cycling', 'ride', 'riding', 'road_biking', 'mountain_biking', 'gravel_cycling', 'cyclocross', 'track_cycling', 'virtual_ride', 'ebiking', 'e_bike_fitness', 'bmx'],
};

const aliasToType = new Map(
  Object.entries(ALIASES).flatMap(([type, names]) => names.map((name) => [name, type])),
);

// Maps provider sport labels (Garmin FIT sport, GPX <type>) to a known activity type.
export function normalizeActivityType(value) {
  if (!value) return null;
  return aliasToType.get(String(value).trim().toLowerCase().replace(/[\s-]+/g, '_')) ?? null;
}

export function activityTypeLabel(activityType) {
  return ACTIVITY_TYPES.find((type) => type.id === activityType)?.label ?? 'Run';
}

export function speedLimitKmh(activityType) {
  return ACTIVITY_TYPES.find((type) => type.id === activityType)?.maxSpeedKmh
    ?? ACTIVITY_TYPES.find((type) => type.id === DEFAULT_ACTIVITY_TYPE).maxSpeedKmh;
}
