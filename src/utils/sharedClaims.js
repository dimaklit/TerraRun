// Stable anonymous color: derived from the owner token, unique per rival.
export function rivalColorFromToken(token) {
  const hue = parseInt(String(token).slice(0, 8), 16) % 360;
  return `hsl(${hue}, 82%, 58%)`;
}

export function rivalFromFeedRow(row) {
  return {
    id: `rival-${row.id}`,
    routeId: `rival-${row.id}`,
    activityKey: `rival-${row.id}`,
    username: `rival:${row.owner_token}`,
    name: `Rival ${String(row.owner_token).slice(0, 4).toUpperCase()}`,
    color: rivalColorFromToken(row.owner_token),
    recordedAt: Date.parse(row.recorded_at),
    polygon: row.claim.polygon,
    areaSqKm: row.claim.areaSqKm ?? 0,
    activityType: row.claim.activityType ?? 'run',
  };
}

export async function loadRivalClaims(client) {
  const { data, error } = await client.from('shared_claims_feed')
    .select('id, owner_token, mine, claim, recorded_at')
    .eq('mine', false)
    .order('recorded_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rivalFromFeedRow);
}

// Publishes only the claim polygon, area and activity type: no name, email or route details.
export async function publishClaims(client, claims) {
  const rows = claims.filter((claim) => claim.polygon).map((claim) => ({
    claim_key: claim.activityKey,
    claim: { polygon: claim.polygon, areaSqKm: claim.areaSqKm, activityType: claim.activityType ?? 'run' },
    recorded_at: new Date(claim.recordedAt).toISOString(),
  }));
  if (!rows.length) return;
  // One insert per row: a duplicate (23505) must not fail the batch of new claims,
  // and the Data API rejects ON CONFLICT upserts under RLS.
  const results = await Promise.all(rows.map((row) => client.from('shared_claims').insert(row)));
  const failure = results.map((result) => result.error).find((error) => error && error.code !== '23505');
  if (failure) throw failure;
}
