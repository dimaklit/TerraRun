import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import {
  Activity,
  ArrowUpRight,
  Building2,
  ChevronDown,
  Compass,
  Crown,
  Flag,
  Footprints,
  Layers,
  Layers3,
  LocateFixed,
  MapPinned,
  Plus,
  Route,
  ShieldAlert,
  Trophy,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
  Zap,
} from 'lucide-react';
import { parseRouteFile } from './utils/geo.js';
import { calculateRouteMetrics, calculateSharedAreaSqKm } from './utils/routeMetrics.js';
import { calculateTerritoryControl, getControlledAreaSqKm, selectControlledTerritories } from './utils/territoryControl.js';
import { filterRoutes, getRouteColor, routePeriods } from './utils/routeFilters.js';

const dayMs = 24 * 60 * 60 * 1000;
const demoRecordedAt = Date.now();

const demoClaims = [
  {
    id: 'claim-01', routeId: 'route-01', name: 'Bryant Loop', username: 'Mila Chen', color: '#b8ff5c', area: 0.084,
    coordinates: [[-73.9868, 40.7532], [-73.9804, 40.7542], [-73.9784, 40.7504], [-73.9835, 40.7477], [-73.9868, 40.7532]],
  },
  {
    id: 'claim-02', routeId: 'route-02', name: 'Grid Runner', username: 'Jonas Reed', color: '#ff5e7d', area: 0.061,
    coordinates: [[-73.9787, 40.7559], [-73.9728, 40.7549], [-73.9734, 40.7513], [-73.9781, 40.7507], [-73.9787, 40.7559]],
  },
  {
    id: 'claim-03', routeId: 'route-03', name: 'Midtown Circuit', username: 'Mila Chen', color: '#5cdcff', area: 0.047,
    coordinates: [[-73.9907, 40.7503], [-73.9868, 40.7532], [-73.9835, 40.7477], [-73.9879, 40.7454], [-73.9907, 40.7503]],
  },
];

const demoRoutes = [
  { id: 'route-01', name: 'Bryant Loop', distanceKm: 4.8, areaSqKm: demoClaims[0].area, time: 'Today, 07:42', recordedAt: demoRecordedAt, color: '#b8ff5c', coordinates: demoClaims[0].coordinates },
  { id: 'route-02', name: 'Grid Runner', distanceKm: 3.2, areaSqKm: demoClaims[1].area, time: 'Yesterday', recordedAt: demoRecordedAt - dayMs, color: '#ff5e7d', coordinates: demoClaims[1].coordinates },
  { id: 'route-03', name: 'Midtown Circuit', distanceKm: 5.1, areaSqKm: demoClaims[2].area, time: 'Oct 22', recordedAt: demoRecordedAt - 21 * dayMs, color: '#5cdcff', coordinates: demoClaims[2].coordinates },
].map((route) => {
  const metrics = calculateRouteMetrics(route.coordinates);
  return { ...route, distanceKm: metrics.routeDistanceKm, areaSqKm: metrics.areaSqKm };
});

const mapStyles = [
  { id: 'dark', label: 'Dark', url: 'https://tiles.openfreemap.org/styles/dark' },
  { id: 'liberty', label: 'Liberty', url: 'https://tiles.openfreemap.org/styles/liberty' },
  { id: 'bright', label: 'Bright', url: 'https://tiles.openfreemap.org/styles/bright' },
  { id: 'positron', label: 'Positron', url: 'https://tiles.openfreemap.org/styles/positron' },
];

const emptyCollection = { type: 'FeatureCollection', features: [] };
const claimCollection = (claims) => ({
  type: 'FeatureCollection',
  features: claims.filter((claim) => claim.polygon || claim.coordinates).map((claim) => ({
    type: 'Feature',
    id: claim.id,
    properties: {
      id: claim.id,
      name: claim.name,
      color: claim.color,
      username: claim.username,
      strength: claim.strength,
      height: claim.strength * 12,
    },
    geometry: claim.polygon?.geometry ?? { type: 'Polygon', coordinates: [claim.coordinates] },
  })),
});
const routeCollection = (routes) => ({
  type: 'FeatureCollection',
  features: routes.map((route) => ({
    type: 'Feature',
    id: route.id,
    properties: { id: route.id, color: route.color },
    geometry: { type: 'LineString', coordinates: route.coordinates },
  })),
});

function RouteSelectionPanel({ runnerName, routesInPeriod, selectedRouteIds, period, onPeriodChange, onToggleRoute, onSelectAll, onClear, onClose }) {
  const selectedInPeriod = routesInPeriod.filter((route) => selectedRouteIds.has(route.id)).length;

  return (
    <section className="side-panel route-panel" aria-label="Route selection">
      <div className="panel-heading route-panel-heading">
        <div>
          <p className="eyebrow">MAP FILTER / {runnerName.toUpperCase()}</p>
          <h2>Route selection</h2>
        </div>
        <button className="icon-button panel-close" title="Close route selection" aria-label="Close route selection" onClick={onClose}><X size={17} /></button>
      </div>
      <label className="route-period-select">
        <span className="metric-label">TIME PERIOD</span>
        <select value={period} onChange={(event) => onPeriodChange(event.target.value)}>
          {routePeriods.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      <div className="route-selection-actions">
        <span>{selectedInPeriod} / {routesInPeriod.length} selected</span>
        <button className="text-button" onClick={onSelectAll}>ALL</button>
        <button className="text-button" onClick={onClear}>NONE</button>
      </div>
      <div className="route-select-list">
        {routesInPeriod.length === 0 && <p className="route-empty-state">No routes in this period.</p>}
        {routesInPeriod.map((route) => <label className="route-select-row" key={route.id}>
          <input type="checkbox" checked={selectedRouteIds.has(route.id)} onChange={() => onToggleRoute(route.id)} />
          <span className="route-select-swatch" style={{ backgroundColor: route.color }} />
          <span className="route-select-copy"><strong>{route.name}</strong><small>{new Date(route.recordedAt).toLocaleDateString('en-US')}</small></span>
          <span className="route-select-metrics"><strong>{route.distanceKm.toFixed(1)} km</strong><small>{route.areaSqKm > 0 ? `${route.areaSqKm.toFixed(3)} km²` : 'No claim'}</small></span>
        </label>)}
      </div>
    </section>
  );
}

function App() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const fileInput = useRef(null);
  const [claims, setClaims] = useState(() => demoClaims.map((claim, index) => ({
    ...claim,
    recordedAt: demoRoutes[index].recordedAt,
    activityKey: claim.routeId,
    polygon: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [claim.coordinates] } },
  })));
  const [routes, setRoutes] = useState(demoRoutes);
  const [routeSelections, setRouteSelections] = useState(() => {
    const routeIds = demoRoutes.map((route) => route.id);
    return Object.fromEntries([...new Set(demoClaims.map((claim) => claim.username))].map((username) => [username, new Set(routeIds)]));
  });
  const [routePeriod, setRoutePeriod] = useState('year');
  const [activeTab, setActiveTab] = useState('territory');
  const [notice, setNotice] = useState('');
  const [showBoard, setShowBoard] = useState(true);
  const [showPanel, setShowPanel] = useState(true);
  const [showRunnerMenu, setShowRunnerMenu] = useState(false);
  const [currentRunner, setCurrentRunner] = useState('Mila Chen');
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapStyle, setMapStyle] = useState('positron');
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [showTowers, setShowTowers] = useState(true);
  const claimsRef = useRef([]);
  const towersRef = useRef(emptyCollection);
  const nextRouteColor = useRef(demoRoutes.length);
  const importedActivityKeys = useRef(new Set());
  const visibleRoutesRef = useRef([]);
  const activeTabRef = useRef(activeTab);
  const showTowersRef = useRef(showTowers);
  activeTabRef.current = activeTab;
  showTowersRef.current = showTowers;

  const controlledTerritories = useMemo(() => calculateTerritoryControl(claims), [claims]);
  const totalArea = useMemo(() => getControlledAreaSqKm(controlledTerritories), [controlledTerritories]);
  const selectedRouteIds = routeSelections[currentRunner] ?? new Set(routes.map((route) => route.id));
  const updateRouteSelection = (update) => setRouteSelections((current) => {
    const selected = current[currentRunner] ?? new Set(routes.map((route) => route.id));
    return { ...current, [currentRunner]: update(selected) };
  });
  const routesInPeriod = useMemo(() => filterRoutes(routes, new Set(routes.map((route) => route.id)), routePeriod), [routes, routePeriod]);
  const visibleRoutes = useMemo(() => filterRoutes(routes, selectedRouteIds, routePeriod), [routes, selectedRouteIds, routePeriod]);
  const visibleClaims = useMemo(() => selectControlledTerritories(controlledTerritories, visibleRoutes, claims), [controlledTerritories, visibleRoutes, claims]);
  const territoryTowers = useMemo(() => claimCollection(visibleClaims), [visibleClaims]);
  towersRef.current = territoryTowers;
  const sharedAreaSqKm = useMemo(() => calculateSharedAreaSqKm(
    claims.filter((claim) => visibleRoutes.some((route) => route.id === claim.routeId)).map((claim) => claim.polygon),
  ), [claims, visibleRoutes]);
  claimsRef.current = visibleClaims;
  visibleRoutesRef.current = visibleRoutes;
  const ownedClaims = controlledTerritories.filter((territory) => territory.properties.username === currentRunner);
  const myArea = getControlledAreaSqKm(controlledTerritories, currentRunner);
  const leaderboard = [...new Set(claims.map((claim) => claim.username))]
    .map((username) => ({
      username,
      area: getControlledAreaSqKm(controlledTerritories, username),
      initials: username.split(' ').map((part) => part[0]).join(''),
    }))
    .sort((first, second) => second.area - first.area);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: mapStyles.find((style) => style.id === 'positron').url,
      center: [-73.982, 40.7506],
      zoom: window.innerWidth <= 620 ? 13.4 : 14.2,
      pitch: 43,
      bearing: -18,
      maxPitch: 78,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    function installGameLayers() {
      map.addSource('claims', { type: 'geojson', data: claimCollection(claimsRef.current) });
      map.addLayer({
        id: 'claim-fill', type: 'fill', source: 'claims',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.58,
        },
        layout: { visibility: activeTabRef.current === 'territory' ? 'visible' : 'none' },
      });
      map.addSource('claim-towers', { type: 'geojson', data: towersRef.current });
      map.addLayer({
        id: 'claim-extrusions', type: 'fill-extrusion', source: 'claim-towers',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.73,
          'fill-extrusion-vertical-gradient': true,
        },
        layout: { visibility: activeTabRef.current === 'territory' && showTowersRef.current ? 'visible' : 'none' },
      });
      map.addLayer({
        id: 'claim-outline', type: 'line', source: 'claims',
        paint: { 'line-color': ['get', 'color'], 'line-width': 2.2, 'line-opacity': 0.95 },
        layout: { visibility: activeTabRef.current === 'territory' ? 'visible' : 'none' },
      });
      map.addSource('routes', { type: 'geojson', data: routeCollection(visibleRoutesRef.current) });
      map.addLayer({
        id: 'route-lines', type: 'line', source: 'routes',
        paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-opacity': 0.9 },
        layout: { visibility: 'visible' },
      });
      setMapReady(true);
    }

    map.on('style.load', installGameLayers);
    map.on('load', () => {
      map.on('click', 'claim-fill', (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        setSelectedClaim(feature.properties.id);
      });
      map.on('mouseenter', 'claim-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'claim-fill', () => { map.getCanvas().style.cursor = ''; });
      setMapReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    mapRef.current.getSource('claims')?.setData(claimCollection(visibleClaims));
    mapRef.current.getSource('claim-towers')?.setData(territoryTowers);
    mapRef.current.getSource('routes')?.setData(routeCollection(visibleRoutes));
    setSelectedClaim(null);
  }, [visibleClaims, visibleRoutes, territoryTowers, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map?.getLayer('claim-extrusions')) return;
    const visibility = activeTab === 'territory' ? 'visible' : 'none';
    map.setLayoutProperty('claim-fill', 'visibility', visibility);
    map.setLayoutProperty('claim-extrusions', 'visibility', activeTab === 'territory' && showTowers ? 'visible' : 'none');
    map.setLayoutProperty('claim-outline', 'visibility', visibility);
    map.setLayoutProperty('route-lines', 'visibility', 'visible');
  }, [activeTab, mapReady, showTowers]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 4800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function handleFiles(files) {
    if (!files?.length) return;
    try {
      const parsedFiles = await Promise.all(Array.from(files).map(async (file) => ({
        file,
        routes: await parseRouteFile(file),
      })));
      const importedRoutes = [];
      const newClaims = [];
      let flaggedCount = 0;
      let capturedCount = 0;
      let totalCapturedArea = 0;
      let routeIndex = 0;
      let duplicateCount = 0;
      const batchKeys = new Set();

      for (const { file, routes: parsedRoutes } of parsedFiles) {
        const baseName = file.name.replace(/\.(gpx|geojson|json)$/i, '');
        for (const [partIndex, parsed] of parsedRoutes.entries()) {
          const activityKey = `${currentRunner}:${parsed.activityKey}`;
          if (importedActivityKeys.current.has(activityKey) || batchKeys.has(activityKey)) {
            duplicateCount += 1;
            continue;
          }
          batchKeys.add(activityKey);
          const id = `route-${Date.now()}-${routeIndex++}`;
          const name = parsed.name || (parsedRoutes.length > 1 ? `${baseName} ${partIndex + 1}` : baseName);
          const color = getRouteColor(nextRouteColor.current++);
          const route = {
            id,
            name,
            coordinates: parsed.coordinates,
            color,
            username: currentRunner,
            activityKey,
            distanceKm: parsed.routeDistanceKm,
            areaSqKm: parsed.areaSqKm,
            recordedAt: parsed.recordedAt ?? Date.now() + routeIndex,
            time: 'Just now',
          };
          importedRoutes.push(route);

          if (parsed.flagged) {
            flaggedCount += 1;
          } else if (parsed.polygon) {
            capturedCount += 1;
            totalCapturedArea += parsed.areaSqKm;
            newClaims.push({
              id,
              routeId: id,
              name,
              username: currentRunner,
              activityKey,
              recordedAt: route.recordedAt,
              color,
              areaSqKm: parsed.areaSqKm,
              polygon: parsed.polygon,
              coordinates: parsed.polygon.geometry.coordinates[0],
            });
          }
        }
      }

      setRoutes((current) => [...importedRoutes, ...current]);
      batchKeys.forEach((key) => importedActivityKeys.current.add(key));
      updateRouteSelection((current) => new Set([...current, ...importedRoutes.map((route) => route.id)]));
      if (newClaims.length) setClaims((current) => [...newClaims, ...current]);
      const coordinates = importedRoutes.flatMap((route) => route.coordinates);
      if (coordinates.length) {
        const bounds = coordinates.reduce((result, point) => result.extend(point), new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
        mapRef.current?.fitBounds(bounds, { padding: 100, maxZoom: 16 });
      }
      setActiveTab('routes');
      const summary = [`Routes imported: ${importedRoutes.length}.`];
      if (capturedCount) summary.push(`Territory actions: ${capturedCount} (${totalCapturedArea.toFixed(3)} km² enclosed).`);
      if (duplicateCount) summary.push(`Duplicate activities skipped: ${duplicateCount}.`);
      if (flaggedCount) summary.push(`Speed review required for ${flaggedCount} routes.`);
      if (capturedCount === 0 && flaggedCount === 0 && importedRoutes.length > 0) summary.push('No enclosed areas found.');
      setNotice(summary.join(' '));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to process the file.');
    }
  }

  function focusMap() {
    const coordinates = visibleRoutes.flatMap((route) => route.coordinates);
    if (coordinates.length) {
      const bounds = coordinates.reduce((result, point) => result.extend(point), new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
      mapRef.current?.fitBounds(bounds, { padding: window.innerWidth <= 760 ? 50 : 100, maxZoom: 15, duration: 700 });
    }
  }

  function inspectClaim(claim) {
    setSelectedClaim(claim.id);
    const route = routes.find((item) => item.id === claim.routeId);
    if (!route) return;
    const bounds = route.coordinates.reduce((result, point) => result.extend(point), new maplibregl.LngLatBounds(route.coordinates[0], route.coordinates[0]));
    mapRef.current?.fitBounds(bounds, { padding: window.innerWidth <= 760 ? 50 : 130, maxZoom: 15.5, duration: 600 });
  }

  const inspectedClaim = visibleClaims.find((claim) => claim.id === selectedClaim);
  const inspectedRoute = inspectedClaim && routes.find((route) => route.id === inspectedClaim.routeId);

  return (
    <main className="app-shell">
      <div className="map-canvas" ref={mapContainer} aria-label="Captured territory map" />

      <header className="topbar">
        <a className="brand" href="#home" aria-label="TerraRun home">
          <span className="brand-mark"><Footprints size={22} /></span>
          <span className="brand-name">TerraRun</span>
          <span className="brand-tag">LOCAL DEMO</span>
        </a>
        <div className="mode-switch" role="tablist" aria-label="Map mode">
          <button className={activeTab === 'territory' ? 'mode-active' : ''} onClick={() => setActiveTab('territory')} role="tab" aria-selected={activeTab === 'territory'}>
            <Layers3 size={15} /> Territory
          </button>
          <button className={activeTab === 'routes' ? 'mode-active' : ''} onClick={() => setActiveTab('routes')} role="tab" aria-selected={activeTab === 'routes'}>
            <Route size={15} /> Routes <span className="mode-count">{visibleRoutes.length}</span>
          </button>
        </div>
        <div className="runner-control">
          <button className="runner-select" title="Switch runner" aria-label="Switch runner" aria-expanded={showRunnerMenu} onClick={() => setShowRunnerMenu(!showRunnerMenu)}>
            <span className="runner-avatar">{currentRunner.split(' ').map((part) => part[0]).join('')}</span>
            <span className="runner-name">{currentRunner}</span>
            <ChevronDown size={14} />
          </button>
          {showRunnerMenu && <div className="runner-menu" role="group" aria-label="Choose runner">
            {[...new Set(demoClaims.map((claim) => claim.username))].map((username) => <button key={username} aria-pressed={currentRunner === username} onClick={() => {
              setCurrentRunner(username);
              setShowRunnerMenu(false);
            }}>{username}</button>)}
          </div>}
        </div>
      </header>

      {showPanel && (activeTab === 'routes'
        ? <RouteSelectionPanel
          routesInPeriod={routesInPeriod}
          selectedRouteIds={selectedRouteIds}
          period={routePeriod}
          onPeriodChange={setRoutePeriod}
          runnerName={currentRunner}
          onToggleRoute={(routeId) => updateRouteSelection((current) => {
            const next = new Set(current);
            if (next.has(routeId)) next.delete(routeId);
            else next.add(routeId);
            return next;
          })}
          onSelectAll={() => updateRouteSelection((current) => new Set([...current, ...routesInPeriod.map((route) => route.id)]))}
          onClear={() => updateRouteSelection((current) => {
            const next = new Set(current);
            routesInPeriod.forEach((route) => next.delete(route.id));
            return next;
          })}
          onClose={() => setShowPanel(false)}
        />
        : <section className="side-panel" aria-label="Territory overview">
        <div className="panel-heading">
          <div>
            <p className="eyebrow"><Flag size={14} /> TACTICAL OVERVIEW</p>
            <h1>District control</h1>
          </div>
          <button className="icon-button panel-close" title="Close overview" aria-label="Close overview" onClick={() => setShowPanel(false)}><X size={17} /></button>
        </div>
        <div className="area-readout">
          <span className="readout-label">YOUR CONTROL</span>
          <div className="readout-value">{myArea.toFixed(3)}<span> km²</span></div>
          <div className="readout-foot">{ownedClaims.length} controlled {ownedClaims.length === 1 ? 'region' : 'regions'} · {currentRunner}</div>
        </div>
        <div className="panel-rule" />
        <div className="metric-row">
          <div className="metric-icon"><Route size={16} /></div>
          <div><span className="metric-label">ON THIS MAP</span><strong>{visibleClaims.length.toString().padStart(2, '0')} <small>territories</small></strong></div>
          <span className="metric-side">{visibleRoutes.length} routes</span>
        </div>
        <div className="metric-row">
          <div className="metric-icon pink"><Zap size={16} /></div>
          <div><span className="metric-label">SHARED AREA</span><strong>{sharedAreaSqKm.toFixed(3)} <small>km²</small></strong></div>
        </div>
        <div className="panel-rule" />
        <div className="rank-heading"><span className="eyebrow">TERRITORIES IN VIEW</span><button className="text-button" onClick={() => { setActiveTab('routes'); setShowPanel(true); }}>FILTER</button></div>
        <div className="territory-list">
          {visibleClaims.length === 0 && <p className="route-empty-state">No captured territories in the selected routes.</p>}
          {visibleClaims.map((claim) => <button className="territory-target" key={claim.id} onClick={() => inspectClaim(claim)}>
            <span className="territory-swatch" style={{ background: claim.color }}><Flag size={17} /></span>
            <span><strong>{claim.name}</strong><small>{claim.username === currentRunner ? 'Yours' : claim.username} · Strength {claim.strength} · {claim.areaSqKm.toFixed(3)} km²</small></span>
            <ArrowUpRight size={16} />
          </button>)}
        </div>
        <button className="upload-button territory-import" onClick={() => fileInput.current?.click()}><Footprints size={17} /> IMPORT A RUN <Upload size={16} /></button>
        <div className="panel-rule" />
        <div className="rank-heading"><span className="eyebrow">LOCAL STANDINGS</span><button className="text-button" onClick={() => setShowBoard(!showBoard)}>{showBoard ? 'HIDE' : 'SHOW'}</button></div>
        {showBoard && <div className="leaderboard">
          {leaderboard.map((runner, index) => <div className={`rank-row${runner.username === currentRunner ? ' rank-self' : ''}`} key={runner.username}>
            <span className="rank-number">{String(index + 1).padStart(2, '0')}</span>
            <span className={`rank-avatar${runner.username === currentRunner ? ' self-avatar' : runner.username === 'Jonas Reed' ? ' avatar-salmon' : ' avatar-blue'}`}>{runner.initials}</span>
            <span className="rank-user">{runner.username}{runner.username === currentRunner && <small>YOU</small>}</span>
            <strong>{runner.area.toFixed(3)}</strong><span className="rank-unit">km²</span>
          </div>)}
        </div>}
        <div className="district-footer"><Trophy size={14} /><span>Captured area totals</span><strong>{totalArea.toFixed(3)} km²</strong></div>
      </section>)}

      <div className="district-label"><span className="status-indicator" /> MANHATTAN <span>/</span> MIDTOWN</div>
      {inspectedClaim && <aside className="territory-detail" role="dialog" aria-label="Territory details">
        <button className="icon-button detail-close" title="Close territory details" onClick={() => setSelectedClaim(null)}><X size={16} /></button>
        <span className="territory-owner"><Flag size={16} color={inspectedClaim.color} /> {inspectedClaim.username === currentRunner ? 'Your territory' : inspectedClaim.username}</span>
        <h2>{inspectedClaim.name}</h2>
        <dl>
          <div><dt>Control strength</dt><dd>{inspectedClaim.strength}</dd></div>
          <div><dt>Captured area</dt><dd>{(inspectedClaim.area ?? inspectedClaim.areaSqKm ?? 0).toFixed(3)} km²</dd></div>
          <div><dt>Route distance</dt><dd>{inspectedRoute?.distanceKm.toFixed(1) ?? '0.0'} km</dd></div>
          <div><dt>Owner</dt><dd>{inspectedClaim.username}</dd></div>
        </dl>
        <p className="territory-rule">{inspectedClaim.username === currentRunner ? 'Your next closed loop reinforces this region.' : `Your loop reduces its strength to ${inspectedClaim.strength - 1}. At zero, it becomes unowned.`}</p>
        <button className="upload-button" onClick={() => { setActiveTab('routes'); setShowPanel(true); setSelectedClaim(null); }}><Route size={16} /> VIEW ROUTES <ArrowUpRight size={16} /></button>
      </aside>}

      <div className="map-tools">
        <button className="icon-button" title="Zoom in" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}><ZoomIn size={18} /></button>
        <button className="icon-button" title="Zoom out" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}><ZoomOut size={18} /></button>
        <button className="icon-button" title="Recenter map" onClick={focusMap}><LocateFixed size={18} /></button>
        <button className="icon-button" title={activeTab === 'territory' ? 'Show route layers' : 'Show territory layers'} onClick={() => setActiveTab(activeTab === 'territory' ? 'routes' : 'territory')}><Compass size={18} /></button>
        <button className={`icon-button${showTowers ? ' tower-toggle-active' : ''}`} title={showTowers ? 'Hide 3D towers' : 'Show 3D towers'} aria-label="Toggle 3D towers" aria-pressed={showTowers} onClick={() => setShowTowers((visible) => !visible)}><Building2 size={18} /></button>
        <div className="style-switcher">
          <button className="icon-button" title="Change map style" aria-label="Change map style" aria-expanded={showStyleMenu} onClick={() => setShowStyleMenu(!showStyleMenu)}><Layers size={18} /></button>
          {showStyleMenu && <div className="style-menu" role="group" aria-label="Map style">
            {mapStyles.map((style) => <button key={style.id} className={mapStyle === style.id ? 'style-active' : ''} aria-pressed={mapStyle === style.id} onClick={() => {
              setMapStyle(style.id);
              setShowStyleMenu(false);
              mapRef.current?.setStyle(style.url);
            }}>{style.label}</button>)}
          </div>}
        </div>
      </div>

      <aside className="route-dock">
        <div className="dock-topline"><span><Activity size={14} /> ACTIVITY IMPORT</span><span className="demo-tag">DEMO</span></div>
        <p>Claim your next sector.</p>
        <div className="dock-meta"><span>GPX / GEOJSON</span><span>MAX 35 KM/H</span></div>
        <input ref={fileInput} className="visually-hidden" type="file" multiple accept=".gpx,.json,.geojson,application/gpx+xml,application/geo+json,application/json" onChange={(event) => { handleFiles(event.target.files); event.target.value = ''; }} />
        <button className="upload-button" onClick={() => fileInput.current?.click()}><Upload size={16} /> IMPORT ROUTE <Plus size={16} /></button>
      </aside>

      <section className="activity-strip" aria-label="Recent routes">
        <div className="strip-title"><span className="strip-marker"><Activity size={15} /></span><div><span className="eyebrow">SELECTED RUNS</span><strong>On the map</strong></div></div>
        <div className="activity-items">
          {visibleRoutes.slice(0, 3).map((route) => <button className="activity-item" key={route.id} onClick={() => {
            mapRef.current?.fitBounds(route.coordinates.reduce((bounds, point) => bounds.extend(point), new maplibregl.LngLatBounds(route.coordinates[0], route.coordinates[0])), { padding: 120, maxZoom: 16 });
          }}>
            <span className="activity-line" style={{ backgroundColor: route.color }} />
            <span className="activity-copy"><strong>{route.name}</strong><small>{route.time}</small></span>
            <span className="activity-distance">
              <strong>{route.distanceKm.toFixed(1)} km</strong>
              <small>{route.areaSqKm > 0 ? `${route.areaSqKm.toFixed(3)} km²` : 'No claim'}</small>
            </span>
          </button>)}
        </div>
        <button className="strip-more" title="View route list" onClick={() => setActiveTab('routes')}><ArrowUpRight size={17} /></button>
      </section>

      <div className="map-status"><span className="status-indicator" /> {mapReady ? 'MAP READY' : 'LOADING MAP'} <span className="status-divider">/</span> OPENFREEMAP</div>
      {notice && <div className="toast" role="status"><ShieldAlert size={17} /><span>{notice}</span><button className="icon-button" title="Dismiss" onClick={() => setNotice('')}><X size={15} /></button></div>}
      {!showPanel && <button className="reopen-panel" onClick={() => setShowPanel(true)}><Crown size={16} /> {activeTab === 'routes' ? 'Route selection' : 'Territory stats'}</button>}
    </main>
  );
}

export default App;