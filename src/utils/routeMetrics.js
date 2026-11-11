import {
  area,
  combine,
  distance,
  difference,
  featureCollection,
  intersect,
  length,
  lineIntersect,
  lineSplit,
  lineString,
  polygonize,
  simplify,
  union,
} from '@turf/turf';

export function buildTerritoryTowers(features) {
  let regions = [];

  for (const feature of features) {
    let remaining = feature;
    const nextRegions = [];
    for (const region of regions) {
      const overlap = intersect(featureCollection([region, feature]));
      if (!overlap) {
        nextRegions.push(region);
        continue;
      }
      const outside = difference(featureCollection([region, feature]));
      if (outside) nextRegions.push({ ...outside, properties: region.properties });
      nextRegions.push({
        ...overlap,
        properties: {
          ...feature.properties,
          height: region.properties.height + feature.properties.height,
          coverage: region.properties.coverage + 1,
        },
      });
      if (remaining) remaining = difference(featureCollection([remaining, region]));
    }
    if (remaining) nextRegions.push({ ...remaining, properties: { ...feature.properties, coverage: 1 } });
    regions = nextRegions;
  }

  return featureCollection(regions);
}

export function calculateSharedAreaSqKm(polygons) {
  let covered = null;
  let shared = null;

  for (const polygon of polygons) {
    if (!covered) {
      covered = polygon;
      continue;
    }

    const overlap = intersect(featureCollection([covered, polygon]));
    if (overlap) {
      shared = shared ? union(featureCollection([shared, overlap])) : overlap;
    }
    covered = union(featureCollection([covered, polygon]));
  }

  return shared ? area(shared) / 1_000_000 : 0;
}

function getMaxSpeedKmh(coordinates, times) {
  if (times.length !== coordinates.length) return null;
  let maxSpeed = 0;

  for (let index = 1; index < coordinates.length; index += 1) {
    const elapsedHours = (times[index] - times[index - 1]) / 3_600_000;
    if (!Number.isFinite(elapsedHours) || elapsedHours <= 0) continue;
    const speed = distance(coordinates[index - 1], coordinates[index]) / elapsedHours;
    maxSpeed = Math.max(maxSpeed, speed);
  }

  return maxSpeed || null;
}

function getCapturedGeometry(route, isClosed) {
  const routeCoordinates = route.geometry.coordinates;
  const first = routeCoordinates[0];
  const last = routeCoordinates[routeCoordinates.length - 1];
  const closedRoute = isClosed && (first[0] !== last[0] || first[1] !== last[1])
    ? lineString([...routeCoordinates, first])
    : route;
  const areaRoute = simplify(closedRoute, { tolerance: 0.000005, highQuality: true });
  const intersections = lineIntersect(areaRoute, areaRoute);
  const coordinates = areaRoute.geometry.coordinates;
  const routeVertices = new Set();
  let hasRepeatedVertex = false;
  for (const coordinate of coordinates) {
    const key = coordinate.join(',');
    if (routeVertices.has(key)) hasRepeatedVertex = true;
    routeVertices.add(key);
  }
  const crossingPoints = intersections.features.filter((intersection) => (
    !routeVertices.has(intersection.geometry.coordinates.join(','))
  ));

  if (!isClosed && crossingPoints.length === 0 && !hasRepeatedVertex) {
    return { polygon: null, areaSqKm: 0 };
  }

  const segments = coordinates.slice(1).flatMap((coordinate, index) => {
    const segment = lineString([coordinates[index], coordinate]);
    return crossingPoints.reduce((parts, intersection) => parts.flatMap((part) => {
      const split = lineSplit(part, intersection);
      return split.features.length > 1 ? split.features : [part];
    }), [segment]);
  });
  const faces = polygonize(featureCollection(segments)).features.filter((face) => area(face) > 0);

  if (faces.length === 0) return { polygon: null, areaSqKm: 0 };

  const polygon = faces.length === 1
    ? faces[0]
    : combine(featureCollection(faces)).features[0];

  return {
    polygon,
    areaSqKm: faces.reduce((total, face) => total + area(face), 0) / 1_000_000,
  };
}

export function calculateRouteMetrics(coordinates, times = []) {
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const closingDistanceKm = distance(first, last);
  const isClosed = closingDistanceKm <= 0.05;
  const maxSpeedKmh = getMaxSpeedKmh(coordinates, times);
  const flagged = maxSpeedKmh !== null && maxSpeedKmh > 35;
  const capturedGeometry = flagged
    ? { polygon: null, areaSqKm: 0 }
    : getCapturedGeometry(lineString(coordinates), isClosed);

  return {
    polygon: capturedGeometry.polygon,
    routeDistanceKm: length(lineString(coordinates), { units: 'kilometers' }),
    areaSqKm: capturedGeometry.areaSqKm,
    closingDistanceM: closingDistanceKm * 1000,
    isClosed,
    flagged,
    maxSpeedKmh,
  };
}