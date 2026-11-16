export function recordsToFeature(records, name) {
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
        coordinateProperties: { times: points.map((point) => new Date(point.time).toISOString()) },
      },
      geometry: { type: 'LineString', coordinates: points.map((point) => point.coordinate) },
    }],
  };
}
