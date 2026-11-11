import { cleanCoords, lineString } from '@turf/turf';
import { gpx } from '@tmcw/togeojson';
import { calculateRouteMetrics } from './routeMetrics.js';

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
        coordinates,
        times: partTimes,
      }];
    });
  });
}

export function parseRouteFile(file) {
  return file.text().then((text) => {
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

    return routes.map(({ name, coordinates, times }) => ({
      name,
      coordinates,
      activityKey: JSON.stringify({ coordinates, times, name: name ?? file.name }),
      recordedAt: times.find((time) => Number.isFinite(time)),
      ...calculateRouteMetrics(coordinates, times),
    }));
  });
}