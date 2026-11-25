import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import rtlTextPluginUrl from '@mapbox/mapbox-gl-rtl-text/mapbox-gl-rtl-text.min.js?url';
import {
  Activity,
  ArrowUpRight,
  Bike,
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
  Mountain,
  Plus,
  Route,
  ShieldAlert,
  Trophy,
  Upload,
  Users,
  X,
  ZoomIn,
  ZoomOut,
  Zap,
} from 'lucide-react';
import { parseRouteFile } from './utils/geo.js';
import { loadPrivateActivities, savePrivateActivities } from './utils/activityStore.js';
import {
  activityToFile,
  disconnectGarmin,
  garminEnabled,
  isGarminLinked,
  loadPendingExternalActivities,
  markExternalActivitiesImported,
  startGarminConnect,
} from './utils/garmin.js';
import { calculateRouteMetrics, calculateSharedAreaSqKm } from './utils/routeMetrics.js';
import { calculateTerritoryControlByType, getControlledAreaSqKm, selectControlledTerritories, selectRivalTerritories } from './utils/territoryControl.js';
import { ACTIVITY_TYPES, DEFAULT_ACTIVITY_TYPE, activityTypeLabel, speedLimitKmh } from './utils/activityTypes.js';
import { loadRivalClaims, publishClaims } from './utils/sharedClaims.js';
import { filterRoutes, getRouteColor, routePeriods } from './utils/routeFilters.js';

const dayMs = 24 * 60 * 60 * 1000;
const demoRecordedAt = Date.now();

// Renders Hebrew and Arabic labels right-to-left; loads lazily when RTL text appears.
maplibregl.setRTLTextPlugin(rtlTextPluginUrl, true);

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
const typeIcons = { run: Footprints, hike: Mountain, bike: Bike };
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

function RouteSelectionPanel({ runnerName, routesInPeriod, selectedRouteIds, period, onPeriodChange, onToggleRoute, onSelectAll, onClear, onClose, floatStyle, handleProps }) {
  const selectedInPeriod = routesInPeriod.filter((route) => selectedRouteIds.has(route.id)).length;

  return (
    <section className="side-panel route-panel" aria-label="Route selection" style={floatStyle}>
      <div className="panel-heading route-panel-heading drag-handle" {...handleProps}>
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
          <span className="route-select-copy"><strong>{route.name}</strong><small>{new Date(route.recordedAt).toLocaleDateString('en-US')} · {activityTypeLabel(route.activityType)}</small></span>
          <span className="route-select-metrics"><strong>{route.distanceKm.toFixed(1)} km</strong><small>{route.areaSqKm > 0 ? `${route.areaSqKm.toFixed(3)} km²` : 'No claim'}</small></span>
        </label>)}
      </div>
    </section>
  );
}

// Makes an absolutely-positioned panel draggable by a handle child.
// Returns a style for the panel and pointer handlers to spread onto the handle.
function useFloating({ freezeSize = false } = {}) {
  const [style, setStyle] = useState(undefined);
  const drag = useRef(null);

  const handleProps = {
    onPointerDown(event) {
      if (window.matchMedia('(max-width: 760px)').matches) return;
      if (event.target.closest('button, select, input, a')) return;
      const rect = event.currentTarget.parentElement.getBoundingClientRect();
      drag.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, width: rect.width, height: rect.height };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    onPointerMove(event) {
      if (!drag.current) return;
      const { dx, dy, width, height } = drag.current;
      setStyle({
        left: Math.min(Math.max(event.clientX - dx, 8), window.innerWidth - 90),
        top: Math.min(Math.max(event.clientY - dy, 8), window.innerHeight - 48),
        right: 'auto',
        bottom: 'auto',
        // Panels anchored to opposite viewport edges need their size pinned once unanchored.
        ...(freezeSize ? { width, height, maxHeight: 'none' } : {}),
      });
    },
    onPointerUp() { drag.current = null; },
    onPointerCancel() { drag.current = null; },
  };

  return { style, handleProps };
}

function App({ user = null, client = null, onSignOut, authMessage }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const fileInput = useRef(null);
  const [claims, setClaims] = useState(() => user ? [] : demoClaims.map((claim, index) => ({
    ...claim,
    recordedAt: demoRoutes[index].recordedAt,
    activityKey: claim.routeId,
    polygon: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [claim.coordinates] } },
  })));
  const [routes, setRoutes] = useState(() => user ? [] : demoRoutes);
  const [routeSelections, setRouteSelections] = useState(() => {
    if (user) return { [user.id]: new Set() };
    const routeIds = demoRoutes.map((route) => route.id);
    return Object.fromEntries([...new Set(demoClaims.map((claim) => claim.username))].map((username) => [username, new Set(routeIds)]));
  });
  const [routePeriod, setRoutePeriod] = useState('year');
  const [typeFilter, setTypeFilter] = useState('all');
  const [importType, setImportType] = useState(DEFAULT_ACTIVITY_TYPE);
  const [activeTab, setActiveTab] = useState('territory');
  const [notice, setNotice] = useState('');
  const [showBoard, setShowBoard] = useState(true);
  const [showPanel, setShowPanel] = useState(() => !window.matchMedia('(max-width: 760px)').matches);
  const [showRunnerMenu, setShowRunnerMenu] = useState(false);
  const [currentRunner, setCurrentRunner] = useState(() => user?.email ?? 'Mila Chen');
  const [storageState, setStorageState] = useState(() => user ? 'loading' : 'ready');
  const [garminLinked, setGarminLinked] = useState(false);
  const [rivalClaims, setRivalClaims] = useState([]);
  const [storageError, setStorageError] = useState('');
  const [storageAttempt, setStorageAttempt] = useState(0);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapStyle, setMapStyle] = useState('positron');
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [showTowers, setShowTowers] = useState(true);
  const [showRivals, setShowRivals] = useState(true);
  const [showImportDock, setShowImportDock] = useState(() => !window.matchMedia('(max-width: 760px)').matches);
  const [showRecentRoutes, setShowRecentRoutes] = useState(false);
  // Every panel is a floating window, draggable by its header.
  const dockFloat = useFloating();
  const panelFloat = useFloating({ freezeSize: true });
  const detailFloat = useFloating();
  const stripFloat = useFloating({ freezeSize: true });
  const claimsRef = useRef([]);
  const towersRef = useRef(emptyCollection);
  const nextRouteColor = useRef(demoRoutes.length);
  const importedActivityKeys = useRef(new Set());
  const visibleRoutesRef = useRef([]);
  const activeTabRef = useRef(activeTab);
  const showTowersRef = useRef(showTowers);
  const importing = useRef(false);
  const fittedToOwnRoutes = useRef(false);
  const geolocateRef = useRef(null);
  activeTabRef.current = activeTab;
  showTowersRef.current = showTowers;

  useEffect(() => {
    if (!user || !client) return undefined;
    let active = true;
    setStorageState('loading');
    setStorageError('');
    loadPrivateActivities(client, user.id).then((activities) => {
      if (!active) return;
      const displayName = user.name?.trim() || user.email || 'You';
      const routesForUser = activities.map(({ route, activity_key: activityKey, recorded_at: recordedAt }) => ({
        ...route,
        username: displayName,
        activityKey,
        recordedAt: Date.parse(recordedAt),
        activityType: route.activityType ?? DEFAULT_ACTIVITY_TYPE,
      }));
      const claimsForUser = activities.flatMap(({ claim, route, activity_key: activityKey, recorded_at: recordedAt }) => claim ? [{
        ...claim,
        routeId: route.id,
        username: displayName,
        activityKey,
        recordedAt: Date.parse(recordedAt),
        activityType: claim.activityType ?? route.activityType ?? DEFAULT_ACTIVITY_TYPE,
      }] : []);
      setRoutes(routesForUser);
      setClaims(claimsForUser);
      setRouteSelections({ [user.id]: new Set(routesForUser.map((route) => route.id)) });
      importedActivityKeys.current = new Set(activities.map((activity) => activity.activity_key));
      nextRouteColor.current = demoRoutes.length + routesForUser.length;
      setStorageState('ready');
    }).catch((error) => {
      if (!active) return;
      setStorageError(error instanceof Error ? error.message : 'Unable to load your activities.');
      setStorageState('error');
    });
    return () => { active = false; };
  }, [client, user, storageAttempt]);

  useEffect(() => {
    if (!garminEnabled || !user || !client || storageState !== 'ready') return undefined;
    let active = true;
    (async () => {
      try {
        const linked = await isGarminLinked(client);
        if (!active) return;
        setGarminLinked(linked);
        if (!linked) return;
        const pending = await loadPendingExternalActivities(client, user.id);
        if (!active || !pending.length) return;
        if (await handleFiles(pending.map(activityToFile))) {
          await markExternalActivitiesImported(client, user.id, pending.map((activity) => activity.id));
        }
      } catch (error) {
        if (active) setNotice(error?.message ?? 'Garmin sync failed.');
      }
    })();
    return () => { active = false; };
  }, [client, user, storageState]);

  // Fly to the player's own routes once after they load; the default view is only a fallback.
  useEffect(() => {
    if (!user || !mapReady || storageState !== 'ready' || fittedToOwnRoutes.current || !routes.length) return;
    fittedToOwnRoutes.current = true;
    const coordinates = routes.flatMap((route) => route.coordinates);
    const bounds = coordinates.reduce((result, point) => result.extend(point), new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
    mapRef.current?.fitBounds(bounds, { padding: window.innerWidth <= 760 ? 50 : 110, maxZoom: 15 });
  }, [user, mapReady, storageState, routes]);

  // Shared combat layer: publish own claims anonymously and load rival territories.
  useEffect(() => {
    if (!user || !client || storageState !== 'ready') return undefined;
    let active = true;
    (async () => {
      try {
        await publishClaims(client, claims);
        const rivals = await loadRivalClaims(client);
        if (active) setRivalClaims(rivals);
      } catch (error) {
        if (active) setNotice(error?.message ?? 'Unable to sync shared territories.');
      }
    })();
    return () => { active = false; };
  }, [client, user, storageState, claims]);

  const controlledTerritories = useMemo(() => calculateTerritoryControlByType([...claims, ...rivalClaims], DEFAULT_ACTIVITY_TYPE), [claims, rivalClaims]);
  // The activity-type filter narrows everything on the map: routes, own territories and rivals.
  const typedTerritories = useMemo(() => typeFilter === 'all'
    ? controlledTerritories
    : controlledTerritories.filter((territory) => territory.properties.activityType === typeFilter), [controlledTerritories, typeFilter]);
  const totalArea = useMemo(() => getControlledAreaSqKm(typedTerritories, user ? user.email : undefined), [typedTerritories, user]);
  const runnerName = user ? (user.name?.trim() || user.email) : currentRunner;
  const runnerKey = user?.id ?? currentRunner;
  const selectedRouteIds = routeSelections[runnerKey] ?? new Set(routes.map((route) => route.id));
  const updateRouteSelection = (update) => setRouteSelections((current) => {
    const selected = current[runnerKey] ?? new Set(routes.map((route) => route.id));
    return { ...current, [runnerKey]: update(selected) };
  });
  const typedRoutes = useMemo(() => typeFilter === 'all'
    ? routes
    : routes.filter((route) => (route.activityType ?? DEFAULT_ACTIVITY_TYPE) === typeFilter), [routes, typeFilter]);
  const routesInPeriod = useMemo(() => filterRoutes(typedRoutes, new Set(typedRoutes.map((route) => route.id)), routePeriod), [typedRoutes, routePeriod]);
  const visibleRoutes = useMemo(() => filterRoutes(typedRoutes, selectedRouteIds, routePeriod), [typedRoutes, selectedRouteIds, routePeriod]);
  const visibleClaims = useMemo(() => selectControlledTerritories(typedTerritories, visibleRoutes, claims), [typedTerritories, visibleRoutes, claims]);
  const rivalTerritories = useMemo(() => selectRivalTerritories(typedTerritories), [typedTerritories]);
  const mapClaims = useMemo(() => [...visibleClaims, ...(showRivals ? rivalTerritories : [])], [visibleClaims, rivalTerritories, showRivals]);
  const territoryTowers = useMemo(() => claimCollection(mapClaims), [mapClaims]);
  towersRef.current = territoryTowers;
  const sharedAreaSqKm = useMemo(() => calculateSharedAreaSqKm(
    claims.filter((claim) => visibleRoutes.some((route) => route.id === claim.routeId)).map((claim) => claim.polygon),
  ), [claims, visibleRoutes]);
  claimsRef.current = mapClaims;
  visibleRoutesRef.current = visibleRoutes;
  const ownedClaims = typedTerritories.filter((territory) => territory.properties.username === runnerName);
  const myArea = getControlledAreaSqKm(typedTerritories, runnerName);
  const leaderboard = [...new Set(claims.map((claim) => claim.username))]
    .map((username) => ({
      username,
      area: getControlledAreaSqKm(typedTerritories, username),
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
    // Hidden geolocate control: draws the pulsing location dot; triggered by our own button.
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserLocation: true,
      showAccuracyCircle: true,
      fitBoundsOptions: { maxZoom: 15.5 },
    });
    map.addControl(geolocate, 'bottom-right');
    geolocate.on('error', () => setNotice('Location unavailable — check browser permissions.'));
    geolocateRef.current = geolocate;

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
    mapRef.current.getSource('claims')?.setData(claimCollection(mapClaims));
    mapRef.current.getSource('claim-towers')?.setData(territoryTowers);
    mapRef.current.getSource('routes')?.setData(routeCollection(visibleRoutes));
    setSelectedClaim(null);
  }, [mapClaims, visibleRoutes, territoryTowers, mapReady]);

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
    if (!files?.length || importing.current || storageState !== 'ready') return;
    importing.current = true;
    try {
      const parsedFiles = await Promise.all(Array.from(files).map(async (file) => ({
        file,
        routes: await parseRouteFile(file, importType),
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
          // Key by email (stable) so renaming the nickname never breaks deduplication.
          const activityKey = `${user?.email ?? runnerName}:${parsed.activityKey}`;
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
            username: runnerName,
            activityKey,
            activityType: parsed.activityType,
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
              username: runnerName,
              activityKey,
              activityType: parsed.activityType,
              recordedAt: route.recordedAt,
              color,
              areaSqKm: parsed.areaSqKm,
              polygon: parsed.polygon,
              coordinates: parsed.polygon.geometry.coordinates[0],
            });
          }
        }
      }

      if (user && client && importedRoutes.length) {
        await savePrivateActivities(client, user.id, importedRoutes, newClaims);
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
      return true;
    } catch (error) {
      setNotice(error?.message ?? 'Unable to process the file.');
      return false;
    } finally {
      importing.current = false;
    }
  }

  function focusMap() {
    const coordinates = visibleRoutes.flatMap((route) => route.coordinates);
    if (coordinates.length) {
      const bounds = coordinates.reduce((result, point) => result.extend(point), new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
      mapRef.current?.fitBounds(bounds, { padding: window.innerWidth <= 760 ? 50 : 100, maxZoom: 15, duration: 700 });
    }
  }

  // Centers the map on the player's GPS position and shows the location dot.
  function locateMe() {
    if (geolocateRef.current?.trigger()) return;
    setNotice('Geolocation is not supported by this browser.');
    focusMap();
  }

  function inspectClaim(claim) {
    setSelectedClaim(claim.id);
    const route = routes.find((item) => item.id === claim.routeId);
    // Rival territories have no local route: zoom to the territory polygon instead.
    const geometry = claim.polygon?.geometry;
    const coordinates = route?.coordinates
      ?? (geometry?.type === 'Polygon' ? geometry.coordinates.flat()
        : geometry?.type === 'MultiPolygon' ? geometry.coordinates.flat(2)
          : null);
    if (!coordinates?.length) return;
    const bounds = coordinates.reduce((result, point) => result.extend(point), new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
    mapRef.current?.fitBounds(bounds, { padding: window.innerWidth <= 760 ? 50 : 130, maxZoom: 15.5, duration: 600 });
  }

  const inspectedClaim = mapClaims.find((claim) => claim.id === selectedClaim);
  const inspectedRoute = inspectedClaim && routes.find((route) => route.id === inspectedClaim.routeId);

  function selectTab(tab) {
    setActiveTab(tab);
    if (window.matchMedia('(max-width: 760px)').matches) {
      setShowRecentRoutes(false);
      setShowPanel(true);
    }
  }

  return (
    <main className={`app-shell${showPanel ? ' panel-open' : ''}${showRecentRoutes ? ' show-recent-routes' : ''}`}>
      <div className="map-canvas" ref={mapContainer} aria-label="Captured territory map" />

      <header className="topbar">
        <a className="brand" href="#home" aria-label="TerraRun home">
          <span className="brand-mark"><Footprints size={22} /></span>
          <span className="brand-name">TerraRun</span>
          <span className="brand-tag">v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}</span>
        </a>
        <div className="mode-switch" role="tablist" aria-label="Map mode">
          <button className={activeTab === 'territory' ? 'mode-active' : ''} onClick={() => selectTab('territory')} role="tab" aria-selected={activeTab === 'territory'}>
            <Layers3 size={15} /> Territory
          </button>
          <button className={activeTab === 'routes' ? 'mode-active' : ''} onClick={() => selectTab('routes')} role="tab" aria-selected={activeTab === 'routes'}>
            <Route size={15} /> Routes <span className="mode-count">{visibleRoutes.length}</span>
          </button>
        </div>
        <div className="mode-switch type-switch" role="tablist" aria-label="Activity type filter">
          <button className={typeFilter === 'all' ? 'mode-active' : ''} title="All activity types" onClick={() => setTypeFilter('all')} role="tab" aria-selected={typeFilter === 'all'}>All</button>
          {ACTIVITY_TYPES.map(({ id, label }) => {
            const TypeIcon = typeIcons[id];
            return <button key={id} className={typeFilter === id ? 'mode-active' : ''} title={`${label} only`} aria-label={`${label} only`} onClick={() => setTypeFilter(id)} role="tab" aria-selected={typeFilter === id}>
              <TypeIcon size={15} />
            </button>;
          })}
        </div>
        <div className="runner-control">
          <button className="runner-select" title={user ? 'Account menu' : 'Switch runner'} aria-label={user ? 'Account menu' : 'Switch runner'} aria-expanded={showRunnerMenu} onClick={() => setShowRunnerMenu(!showRunnerMenu)}>
            <span className="runner-avatar">{user ? (user.email?.[0] ?? 'U').toUpperCase() : currentRunner.split(' ').map((part) => part[0]).join('')}</span>
            <span className="runner-name">{runnerName}</span>
            <ChevronDown size={14} />
          </button>
          {showRunnerMenu && <div className="runner-menu" role="group" aria-label={user ? 'Account actions' : 'Choose runner'}>
            {user
              ? <>
                {garminEnabled && (garminLinked
                  ? <button onClick={async () => {
                    try {
                      await disconnectGarmin(client);
                      setGarminLinked(false);
                      setNotice('Garmin disconnected.');
                    } catch (error) {
                      setNotice(error instanceof Error ? error.message : 'Unable to disconnect Garmin.');
                    }
                  }}>Disconnect Garmin</button>
                  : <button onClick={() => startGarminConnect(client).catch((error) => setNotice(error.message))}>Connect Garmin</button>)}
                <button onClick={onSignOut}>Sign out</button>
              </>
              : [...new Set(demoClaims.map((claim) => claim.username))].map((username) => <button key={username} aria-pressed={currentRunner === username} onClick={() => {
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
          runnerName={runnerName}
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
          floatStyle={panelFloat.style}
          handleProps={panelFloat.handleProps}
        />
        : <section className="side-panel" aria-label="Territory overview" style={panelFloat.style}>
        <div className="panel-heading drag-handle" {...panelFloat.handleProps}>
          <div>
            <p className="eyebrow"><Flag size={14} /> TACTICAL OVERVIEW</p>
            <h1>District control</h1>
          </div>
          <button className="icon-button panel-close" title="Close overview" aria-label="Close overview" onClick={() => setShowPanel(false)}><X size={17} /></button>
        </div>
        {user && storageState === 'loading' && <p className="route-empty-state" role="status">Loading private activity totals…</p>}
        {user && storageState === 'error' && <p className="route-empty-state" role="alert">{storageError} <button className="text-button" onClick={() => setStorageAttempt((attempt) => attempt + 1)}>Retry</button></p>}
        <div className="rank-heading private-activity-heading"><span className="eyebrow">{user ? 'YOUR PRIVATE ACTIVITY' : 'LOCAL STANDINGS'}</span><button className="text-button" onClick={() => setShowBoard(!showBoard)}>{showBoard ? 'HIDE' : 'SHOW'}</button></div>
        {showBoard && <div className="leaderboard">
          {leaderboard.map((runner, index) => <div className={`rank-row${runner.username === currentRunner ? ' rank-self' : ''}`} key={runner.username}>
            <span className="rank-number">{String(index + 1).padStart(2, '0')}</span>
            <span className={`rank-avatar${runner.username === currentRunner ? ' self-avatar' : runner.username === 'Jonas Reed' ? ' avatar-salmon' : ' avatar-blue'}`}>{runner.initials}</span>
            <span className="rank-user">{runner.username}{runner.username === currentRunner && <small>YOU</small>}</span>
            <strong>{runner.area.toFixed(3)}</strong><span className="rank-unit">km²</span>
          </div>)}
        </div>}
        <div className="district-footer"><Trophy size={14} /><span>{user ? 'Private captured area' : 'Captured area totals'}</span><strong>{totalArea.toFixed(3)} km²</strong></div>
        <div className="panel-rule" />
        <div className="area-readout">
          <span className="readout-label">YOUR CONTROL</span>
          <div className="readout-value">{myArea.toFixed(3)}<span> km²</span></div>
          <div className="readout-foot">{ownedClaims.length} controlled {ownedClaims.length === 1 ? 'region' : 'regions'} · {runnerName}</div>
          {user && <div className="account-storage-state" role={storageState === 'error' ? 'alert' : 'status'}>
            {storageState === 'loading' && 'Syncing your private activities…'}
            {storageState === 'ready' && 'Private activity sync · Neon'}
            {storageState === 'error' && <>{storageError} <button className="text-button" onClick={() => setStorageAttempt((attempt) => attempt + 1)}>RETRY</button></>}
          </div>}
          {authMessage && <div className="account-storage-state" role="status">{authMessage}</div>}
        </div>
        <div className="panel-rule" />
        <div className="metric-row">
          <div className="metric-icon"><Route size={16} /></div>
          <div><span className="metric-label">ON THIS MAP</span><strong>{mapClaims.length.toString().padStart(2, '0')} <small>territories</small></strong></div>
          <span className="metric-side">{visibleRoutes.length} routes</span>
        </div>
        <div className="metric-row">
          <div className="metric-icon pink"><Zap size={16} /></div>
          <div><span className="metric-label">SHARED AREA</span><strong>{sharedAreaSqKm.toFixed(3)} <small>km²</small></strong></div>
        </div>
        <div className="panel-rule" />
        <div className="rank-heading"><span className="eyebrow">TERRITORIES IN VIEW</span><button className="text-button" aria-pressed={showRivals} onClick={() => setShowRivals((visible) => !visible)}>{showRivals ? 'HIDE RIVALS' : 'SHOW RIVALS'}</button><button className="text-button" onClick={() => { setActiveTab('routes'); setShowPanel(true); }}>FILTER</button></div>
        <div className="territory-list">
          {mapClaims.length === 0 && <p className="route-empty-state">No captured territories in the selected routes.</p>}
          {mapClaims.map((claim) => <button className="territory-target" key={claim.id} onClick={() => inspectClaim(claim)}>
            <span className="territory-swatch" style={{ background: claim.color }}><Flag size={17} /></span>
            <span><strong>{claim.name}</strong><small>{claim.username === runnerName ? 'Yours' : claim.username} · {activityTypeLabel(claim.activityType)} · Strength {claim.strength} · {claim.areaSqKm.toFixed(3)} km²</small></span>
            <ArrowUpRight size={16} />
          </button>)}
        </div>
      </section>)}

      {inspectedClaim && <aside className="territory-detail" role="dialog" aria-label="Territory details" style={detailFloat.style}>
        <button className="icon-button detail-close" title="Close territory details" onClick={() => setSelectedClaim(null)}><X size={16} /></button>
        <span className="territory-owner drag-handle" {...detailFloat.handleProps}><Flag size={16} color={inspectedClaim.color} /> {inspectedClaim.username === currentRunner ? 'Your territory' : inspectedClaim.username}</span>
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
        <button className="icon-button" title="Go to my location" aria-label="Go to my location" onClick={locateMe}><LocateFixed size={18} /></button>
        <button className="icon-button" title={activeTab === 'territory' ? 'Show route layers' : 'Show territory layers'} onClick={() => setActiveTab(activeTab === 'territory' ? 'routes' : 'territory')}><Compass size={18} /></button>
        <button className={`icon-button${showTowers ? ' tower-toggle-active' : ''}`} title={showTowers ? 'Hide 3D towers' : 'Show 3D towers'} aria-label="Toggle 3D towers" aria-pressed={showTowers} onClick={() => setShowTowers((visible) => !visible)}><Building2 size={18} /></button>
        <button className={`icon-button${showRivals ? ' tower-toggle-active' : ''}`} title={showRivals ? 'Hide rival territories' : 'Show rival territories'} aria-label="Toggle rival territories" aria-pressed={showRivals} onClick={() => setShowRivals((visible) => !visible)}><Users size={18} /></button>
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

      <input ref={fileInput} className="visually-hidden" type="file" multiple disabled={storageState !== 'ready'} accept=".gpx,.json,.geojson,application/gpx+xml,application/geo+json,application/json" onChange={(event) => { handleFiles(event.target.files); event.target.value = ''; }} />
      {showImportDock ? <aside className="route-dock" style={dockFloat.style}>
        <div className="dock-topline drag-handle" {...dockFloat.handleProps}>
          <span><Activity size={14} /> ACTIVITY IMPORT</span>
          <span className="dock-topline-actions">
            <span className="demo-tag">DEMO</span>
            <button className="icon-button dock-close" title="Hide activity import" aria-label="Hide activity import" onClick={() => setShowImportDock(false)}><X size={14} /></button>
          </span>
        </div>
        <p>Claim your next sector.</p>
        <label className="dock-type-select">
          <span>ACTIVITY TYPE</span>
          <select value={importType} onChange={(event) => setImportType(event.target.value)}>
            {ACTIVITY_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
        </label>
        <div className="dock-meta"><span>GPX / GEOJSON</span><span>MAX {speedLimitKmh(importType)} KM/H</span></div>
        <button className="upload-button" disabled={storageState !== 'ready'} onClick={() => fileInput.current?.click()}><Upload size={16} /> IMPORT ROUTE <Plus size={16} /></button>
      </aside> : <button className="reopen-panel reopen-dock" onClick={() => setShowImportDock(true)}><Upload size={16} /> Activity import</button>}

      <button className="recent-toggle" aria-expanded={showRecentRoutes} aria-controls="recent-routes" onClick={() => {
        if (!showRecentRoutes) setShowPanel(false);
        setShowRecentRoutes((visible) => !visible);
      }}>
        <Activity size={16} /> {showRecentRoutes ? 'Hide recent routes' : 'Recent routes'}
      </button>
      <section id="recent-routes" className="activity-strip" aria-label="Recent routes" style={stripFloat.style}>
        <div className="strip-title drag-handle" {...stripFloat.handleProps}><span className="strip-marker"><Activity size={15} /></span><div><span className="eyebrow">SELECTED RUNS</span><strong>On the map</strong></div></div>
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
        <button className="strip-more" title="View route list" aria-label="View route list" onClick={() => selectTab('routes')}><ArrowUpRight size={17} /></button>
      </section>

      <div className="map-status"><span className="status-indicator" /> {mapReady ? 'MAP READY' : 'LOADING MAP'} <span className="status-divider">/</span> OPENFREEMAP</div>
      {notice && <div className="toast" role="status"><ShieldAlert size={17} /><span>{notice}</span><button className="icon-button" title="Dismiss" onClick={() => setNotice('')}><X size={15} /></button></div>}
      {!showPanel && <button className="reopen-panel" onClick={() => { setShowRecentRoutes(false); setShowPanel(true); }}><Crown size={16} /> {activeTab === 'routes' ? 'Route selection' : 'Territory stats'}</button>}
    </main>
  );
}

export default App;