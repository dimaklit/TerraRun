// Garmin FIT sport values → TerraRun activity types; unknown sports stay null.
const SPORT_TO_TYPE = {
  running: 'run',
  trail_running: 'run',
  cycling: 'bike',
  mountain_biking: 'bike',
  gravel_cycling: 'bike',
  e_biking: 'bike',
  walking: 'hike',
  hiking: 'hike',
};

export function sportToActivityType(sport) {
  return SPORT_TO_TYPE[String(sport ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')] ?? null;
}

export function recordsToFeature(records, name, activityType = null) {
  const points = records
    .filter((record) => Number.isFinite(record.position_lat) && Number.isFinite(record.position_long))
    .map((record) => ({
      coordinate: [record.position_long, record.position_lat],
      time: record.timestamp instanceof Date ? record.timestamp.getTime() : Date.parse(record.timestamp),
    }));
  if (points.length < 2) return null;
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {
        name,
        ...(activityType ? { activityType } : {}),
        coordinateProperties: { times: points.map((point) => new Date(point.time).toISOString()) },
      },
      geometry: { type: 'LineString', coordinates: points.map((point) => point.coordinate) },
    }],
  };
}
