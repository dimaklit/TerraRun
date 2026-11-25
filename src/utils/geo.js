import { cleanCoords, lineString } from '@turf/turf';
import { gpx } from '@tmcw/togeojson';
import { calculateRouteMetrics } from './routeMetrics.js';
import { DEFAULT_ACTIVITY_TYPE, normalizeActivityType } from './activityTypes.js';

export function extractRouteGeometries(geojson) {
  const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
  return features.flatMap((feature) => {
    const geometry = feature.type === 'Feature' ? feature.geometry : feature;
    if (!geometry) return [];

    const parts = geometry.type === 'LineString'
      ? [geometry.coordinates]
      : geometry.type === 'MultiLineString'
        ? geometry.coordinates
        : [];
    const rawTimes = feature.properties?.coordinateProperties?.times;
    let timeOffset = 0;

    return parts.flatMap((part, partIndex) => {
      const coordinates = cleanCoords(lineString(part)).geometry.coordinates;
      if (coordinates.length < 2) return [];

      let partTimes = Array.isArray(rawTimes?.[0])
        ? rawTimes[partIndex] ?? []
        : parts.length === 1
          ? rawTimes ?? []
          : rawTimes?.slice(timeOffset, timeOffset + part.length) ?? [];
      timeOffset += part.length;
      partTimes = partTimes.map((time) => typeof time === 'number' ? time : Date.parse(time));

      return [{
        name: feature.properties?.name,
        // GPX <type> and Garmin GeoJSON activityType both land here; unknown labels stay null.
        activityType: normalizeActivityType(feature.properties?.activityType ?? feature.properties?.type),
        coordinates,
        times: partTimes,
      }];
    });
  });
}

async function hashActivityKey(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function parseRouteFile(file, defaultActivityType = DEFAULT_ACTIVITY_TYPE) {
  return file.text().then(async (text) => {
    let geojson;

    if (file.name.toLowerCase().endsWith('.gpx')) {
      const document = new DOMParser().parseFromString(text, 'application/xml');
      if (document.querySelector('parsererror')) throw new Error('Unable to read the GPX file.');
      geojson = gpx(document);
    } else {
      try {
        geojson = JSON.parse(text);
      } catch {
        throw new Error('Invalid JSON file.');
      }
    }

    const routes = extractRouteGeometries(geojson);
    if (routes.length === 0) throw new Error('The file contains no GPS route lines.');

    return Promise.all(routes.map(async ({ name, activityType, coordinates, times }) => ({
      name,
      coordinates,
      times,
      // Hashed so it stays small enough for the unique btree indexes.
      activityKey: await hashActivityKey(JSON.stringify({ coordinates, times, name: name ?? file.name })),
      recordedAt: times.find((time) => Number.isFinite(time)),
      // The type embedded in the file wins; the import selector is the fallback.
      ...calculateRouteMetrics(coordinates, times, activityType ?? defaultActivityType),
    })));
  });
}