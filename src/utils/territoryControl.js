import { area, difference, featureCollection, intersect, union } from '@turf/turf';

function applyControl(properties, activity) {
  const routeIds = [...new Set([...(properties.routeIds ?? []), activity.routeId])];
  if (!properties.username || properties.strength === 0) {
    return { ...properties, username: activity.username, strength: 1, color: activity.color, name: activity.name, routeIds };
  }
  if (properties.username === activity.username) {
    return { ...properties, strength: properties.strength + 1, routeIds };
  }
  const strength = properties.strength - 1;
  return { ...properties, strength, username: strength === 0 ? null : properties.username, color: strength === 0 ? null : properties.color, routeIds };
}

export function applyTerritoryActivity(territories, activity) {
  if (!activity.polygon || activity.flagged) return territories;
  let remaining = activity.polygon;
  const result = [];

  for (const territory of territories) {
    const overlap = intersect(featureCollection([territory, activity.polygon]));
    if (!overlap) {
      result.push(territory);
      continue;
    }
    const outside = difference(featureCollection([territory, activity.polygon]));
    if (outside) result.push({ ...outside, properties: { ...territory.properties } });
    result.push({ ...overlap, properties: applyControl(territory.properties, activity) });
    if (remaining) remaining = difference(featureCollection([remaining, territory]));
  }

  if (remaining) {
    result.push({ ...remaining, properties: applyControl({ strength: 0, routeIds: [] }, activity) });
  }
  return result;
}

export function calculateTerritoryControl(activities) {
  const applied = new Set();
  return [...activities].sort((first, second) => first.recordedAt - second.recordedAt).reduce((territories, activity) => {
    const key = activity.activityKey ?? activity.routeId;
    if (applied.has(key)) return territories;
    applied.add(key);
    return applyTerritoryActivity(territories, activity);
  }, []);
}

export function selectControlledTerritories(territories, visibleRoutes, activities) {
  const ids = new Set(visibleRoutes.map((route) => route.id));
  const polygons = activities.filter((activity) => ids.has(activity.routeId) && activity.polygon).map((activity) => activity.polygon);
  if (!polygons.length) return [];
  const visibleGeometry = polygons.length === 1 ? polygons[0] : union(featureCollection(polygons));
  return territories.flatMap((territory, index) => {
    if (!territory.properties.username || territory.properties.strength <= 0) return [];
    const polygon = intersect(featureCollection([territory, visibleGeometry]));
    if (!polygon) return [];
    return [{
      ...territory.properties,
      id: `territory-${index}`,
      routeId: territory.properties.routeIds.find((id) => ids.has(id)),
      areaSqKm: area(polygon) / 1_000_000,
      polygon,
    }];
  });
}

export function getControlledAreaSqKm(territories, username) {
  return territories.reduce((sum, territory) => (
    territory.properties.strength > 0 && (!username || territory.properties.username === username)
      ? sum + area(territory) / 1_000_000
      : sum
  ), 0);
}