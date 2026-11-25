import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import maplibregl from 'maplibre-gl';
import { bbox, featureCollection } from '@turf/turf';
import { groupTerritoryFlags, territoryFlagAnchor } from '../utils/territoryPresentation.js';

function FlagMarker({ map, group, selectedId, recentRouteIds, onSelect }) {
  const element = useMemo(() => document.createElement('div'), []);
  const { coordinates, flags } = group;
  const { claim } = flags[0];
  const selected = flags.some((flag) => flag.claim.id === selectedId);
  const fresh = flags.some((flag) => flag.claim.routeIds?.some((id) => recentRouteIds.includes(id)));
  const clustered = flags.length > 1;
  useEffect(() => {
    const marker = new maplibregl.Marker({ element, anchor: 'bottom' }).setLngLat(coordinates).addTo(map);
    element.removeAttribute('role');
    element.removeAttribute('tabindex');
    element.removeAttribute('aria-label');
    return () => marker.remove();
  }, [map, element, coordinates]);

  function select() {
    if (!clustered) {
      onSelect(claim.id);
      return;
    }
    const [west, south, east, north] = bbox(featureCollection(flags.map((flag) => flag.claim.polygon)));
    map.fitBounds([[west, south], [east, north]], {
      padding: 80, maxZoom: Math.max(map.getZoom() + 2, 16),
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450,
    });
    onSelect(claim.id);
  }

  return createPortal(
    <button
      className={`territory-flag${selected ? ' is-selected' : ''}${fresh ? ' is-new' : ''}`}
      style={{ '--flag-color': claim.color }}
      aria-label={clustered ? `${flags.length} territories. Zoom in to inspect` : `Inspect territory: ${claim.name}, ${claim.areaSqKm.toFixed(3)} square kilometers, strength ${claim.strength}`}
      aria-pressed={selected}
      title={clustered ? `${flags.length} territories` : `${claim.name} · Strength ${claim.strength}`}
      onClick={(event) => { event.stopPropagation(); select(); }}
    >
      <span className="flag-ground" aria-hidden="true" />
      <svg className="flag-standard" width="44" height="52" viewBox="0 0 44 52" aria-hidden="true">
        <path className="flag-pole" d="M12 46V7" />
        <circle cx="12" cy="6" r="3" fill="#fff5ce" stroke="#334d3c" strokeWidth="2" />
        <path className="flag-cloth" d="M13 10 Q22 5 31 10 L39 8 L35 19 L39 29 Q27 25 22 29 L13 27Z" />
        <path className="flag-emblem" d="m23 15 2 4 5 .5-3.5 3 1 4.5-4.5-2.5-4 2.5 1-4.5-3.5-3 5-.5Z" />
      </svg>
      <span className="flag-strength" aria-hidden="true">{clustered ? `×${flags.length}` : claim.strength}</span>
    </button>,
    element,
  );
}

export default function TerritoryFlags({ map, claims, selectedId, recentRouteIds, onSelect }) {
  const flags = useMemo(() => claims.map((claim) => ({ claim, coordinates: territoryFlagAnchor(claim) })), [claims]);
  const [groups, setGroups] = useState([]);
  useEffect(() => {
    function update() {
      const { clientWidth, clientHeight } = map.getContainer();
      setGroups(groupTerritoryFlags(flags, (point) => map.project(point), clientWidth, clientHeight, selectedId));
    }
    update();
    map.on('moveend', update);
    map.on('resize', update);
    return () => {
      map.off('moveend', update);
      map.off('resize', update);
    };
  }, [map, flags, selectedId]);
  return groups.map((group) => <FlagMarker
    key={group.flags.map((flag) => flag.claim.id).join(':')}
    map={map} group={group} selectedId={selectedId} recentRouteIds={recentRouteIds} onSelect={onSelect}
  />);
}
