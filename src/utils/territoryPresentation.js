import { area, pointOnFeature } from '@turf/turf';

export function territoryFlagAnchor(claim) {
  const polygon = claim.polygon;
  const geometry = polygon.geometry;
  const surface = geometry.type === 'MultiPolygon'
    ? geometry.coordinates.map((coordinates) => ({
      type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates },
    })).sort((first, second) => area(second) - area(first))[0]
    : polygon;
  return pointOnFeature(surface).geometry.coordinates;
}

export function groupTerritoryFlags(flags, project, width, height, selectedId) {
  const groups = [];
  const ordered = [...flags].sort((first, second) => Number(second.claim.id === selectedId) - Number(first.claim.id === selectedId));
  for (const flag of ordered) {
    const point = project(flag.coordinates);
    if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) continue;
    const group = groups.find((candidate) => Math.hypot(candidate.point.x - point.x, candidate.point.y - point.y) < 52);
    if (group) group.flags.push(flag);
    else groups.push({ coordinates: flag.coordinates, point, flags: [flag] });
  }
  return groups;
}
