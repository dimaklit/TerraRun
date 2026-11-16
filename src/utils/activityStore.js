export async function loadPrivateActivities(client, userId) {
  const { data, error } = await client.from('private_activities')
    .select('activity_key, route, claim, recorded_at')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function savePrivateActivities(client, userId, routes, claims) {
  if (!routes.length) return;
  const claimsByRoute = new Map(claims.map((claim) => [claim.routeId, claim]));
  const rows = routes.map((route) => ({
    user_id: userId,
    activity_key: route.activityKey,
    route,
    claim: claimsByRoute.get(route.id) ?? null,
    recorded_at: new Date(route.recordedAt).toISOString(),
  }));
  const { error } = await client.from('private_activities').insert(rows);
  if (error) throw error;
}