export function getVisibleClaims(claims, visibleRoutes) {
  const routesById = new Map(visibleRoutes.map((route) => [route.id, route]));
  return claims.flatMap((claim) => {
    const route = routesById.get(claim.routeId);
    return route ? [{ ...claim, color: route.color }] : [];
  });
}

export function getRouteColor(index) {
  return `hsl(${Math.round((index * 137.508 + 85) % 360)}, 80%, 65%)`;
}

export const routePeriods = [
  { id: 'last', label: 'Last route' },
  { id: 'week', label: 'Last week' },
  { id: 'month', label: 'Last month' },
  { id: 'year', label: 'Last year' },
];

const periodDurations = {
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
};

export function filterRoutes(routes, selectedRouteIds, period, now = Date.now()) {
  const orderedRoutes = [...routes].sort((first, second) => second.recordedAt - first.recordedAt);
  const withinPeriod = period === 'last'
    ? orderedRoutes.slice(0, 1)
    : orderedRoutes.filter((route) => now - route.recordedAt <= periodDurations[period]);

  return withinPeriod.filter((route) => selectedRouteIds.has(route.id));
}
