import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ArrowRight, Check, ChevronRight, Flag, Footprints, Layers, LocateFixed, Minus, Plus, Shield, Swords, Trophy, X } from 'lucide-react';
import './gameExamples.css';

const modes = [
  { id: 'city', title: 'District map', icon: Flag },
  { id: 'defend', title: 'Territory defense', icon: Shield },
  { id: 'result', title: 'Attack result', icon: Footprints },
];
const outer = [[-73.993,40.751],[-73.984,40.756],[-73.976,40.751],[-73.985,40.745],[-73.993,40.751]];
const inner = [[-73.986,40.751],[-73.983,40.753],[-73.980,40.751],[-73.983,40.749],[-73.986,40.751]];
const rival = [[-73.981,40.758],[-73.974,40.761],[-73.969,40.756],[-73.975,40.753],[-73.981,40.758]];
const route = [[-73.991,40.748],[-73.986,40.751],[-73.983,40.753],[-73.980,40.751],[-73.983,40.749],[-73.986,40.751],[-73.992,40.754]];
const polygon = (id, name, color, strength, coordinates) => ({ type: 'Feature', id, properties: { name, color, strength, height: strength * 12 }, geometry: { type: 'Polygon', coordinates } });

function GameExamples() {
  const [mode, setMode] = useState(() => modes.some((item) => item.id === location.hash.slice(1)) ? location.hash.slice(1) : 'city');
  const [stage, setStage] = useState(1);
  const [towers, setTowers] = useState(true);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState(null);
  const [plannedTarget, setPlannedTarget] = useState(null);
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const latest = useRef({ mode, stage });
  latest.current = { mode, stage };

  function territories(currentMode, currentStage) {
    return { type: 'FeatureCollection', features: [
      polygon('mine', 'Mila / Midtown', '#65c78b', 1, [outer, [...inner].reverse()]),
      polygon('jonas', 'Jonas / East Side', '#588ee0', 2, [rival]),
      polygon('inner', 'Bryant Sector', currentStage === 2 ? '#588ee0' : '#929b98', currentStage === 2 ? 1 : 0, [inner]),
    ] };
  }

  useEffect(() => {
    const map = new maplibregl.Map({ container: mapNode.current, style: 'https://tiles.openfreemap.org/styles/positron', center: [-73.983,40.752], zoom: 14.1, pitch: 43, bearing: -18 });
    mapRef.current = map;
    map.once('style.load', () => {
      map.addSource('land', { type: 'geojson', data: territories(latest.current.mode, latest.current.stage) });
      map.addLayer({ id: 'land-fill', type: 'fill', source: 'land', filter: ['>', ['get','strength'], 0], paint: { 'fill-color': ['get','color'], 'fill-opacity': 0.4 } });
      map.addLayer({ id: 'land-towers', type: 'fill-extrusion', source: 'land', filter: ['>', ['get','strength'], 0], paint: { 'fill-extrusion-color': ['get','color'], 'fill-extrusion-height': ['get','height'], 'fill-extrusion-opacity': 0.75 } });
      map.addLayer({ id: 'land-border', type: 'line', source: 'land', filter: ['>', ['get','strength'], 0], paint: { 'line-color': ['get','color'], 'line-width': 2 } });
      map.addSource('run', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route } } });
      map.addLayer({ id: 'run-line', type: 'line', source: 'run', paint: { 'line-color': '#263b32', 'line-width': 3, 'line-dasharray': [2,1.3] }, layout: { visibility: latest.current.mode === 'city' ? 'none' : 'visible' } });
      map.on('click','land-fill', (event) => {
        const feature = event.features?.[0];
        if (feature) setSelected(String(feature.id));
      });
      setReady(true);
    });
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const update = () => setMode(modes.some((item) => item.id === location.hash.slice(1)) ? location.hash.slice(1) : 'city');
    addEventListener('hashchange', update);
    return () => removeEventListener('hashchange', update);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const labels = [
      { id: 'mine', center: [-73.988,40.749], text: 'MILA · STRENGTH 1', color: '#65c78b' },
      { id: 'jonas', center: [-73.975,40.757], text: 'JONAS · STRENGTH 2', color: '#588ee0' },
      { id: 'inner', center: [-73.983,40.751], text: stage === 2 ? 'JONAS · STRENGTH 1' : 'NEUTRAL · STRENGTH 0', color: stage === 2 ? '#588ee0' : '#929b98' },
    ];
    const markers = labels.filter((label) => label.id !== 'inner' || stage === 2).map((label) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'territory-marker';
      element.textContent = label.text;
      element.setAttribute('aria-label', label.text);
      element.style.borderColor = label.color;
      element.title = 'Open territory';
      element.addEventListener('click', (event) => { event.stopPropagation(); setSelected(label.id); });
      return new maplibregl.Marker({ element, anchor: 'bottom' }).setLngLat(label.center).addTo(mapRef.current);
    });
    return () => markers.forEach((marker) => marker.remove());
  }, [ready, stage]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready) return;
    map.getSource('land').setData(territories(mode, stage));
    map.setLayoutProperty('land-towers', 'visibility', towers ? 'visible' : 'none');
    map.setLayoutProperty('run-line', 'visibility', mode === 'city' && plannedTarget !== 'inner' ? 'none' : 'visible');
    map.easeTo({ center: mode === 'city' ? [-73.983,40.753] : [-73.984,40.751], zoom: mode === 'city' ? 14.1 : 14.65, duration: 600 });
  }, [mode, stage, towers, ready, plannedTarget]);

  function chooseMode(value) { location.hash = value; setMode(value); setSelected(null); }
  function inspectTerritory(id) {
    setSelected(id);
    mapRef.current?.flyTo({ center: id === 'jonas' ? [-73.975,40.757] : [-73.983,40.751], zoom: 14.6 });
  }
  function planTerritory(id) {
    setPlannedTarget(id);
    chooseMode('city');
    setSelected(null);
  }
  const inspectedTerritory = territories(mode, stage).features.find((feature) => feature.id === selected);
  const inspectedOwner = selected === 'mine' ? 'Mila Chen' : selected === 'jonas' || (selected === 'inner' && stage === 2) ? 'Jonas Reed' : 'Unowned';
  const Icon = modes.find((item) => item.id === mode).icon;

  return <main className={`game-demo ${mode}`}>
    <nav className="concept-nav" aria-label="Territory strategy"><span>TerraRun <small>TERRITORY STRATEGY / DEMO</small></span><div>{modes.map(({id,title,icon:ModeIcon}) => <button key={id} aria-pressed={mode === id} onClick={() => chooseMode(id)}><ModeIcon size={15}/><span>{title}</span></button>)}</div></nav>
    <div className="world" ref={mapNode} aria-label="Manhattan game map" />
    <header className="game-header"><a href="#city" className="game-brand"><Footprints size={22}/> TerraRun</a><span className="season"><Trophy size={14}/> SEASON 04 <b>12 days left</b></span><button className="player" title="Your profile" onClick={() => setSelected(selected === 'profile' ? null : 'profile')}><span className="avatar">MC</span><span>Mila Chen<small>LEVEL 08</small></span></button></header>
    <div className="district"><span className="live-dot"/> MANHATTAN <span>/</span> MIDTOWN</div>
    <div className="map-controls"><button title="Zoom in" onClick={() => mapRef.current?.zoomIn()}><Plus size={18}/></button><button title="Zoom out" onClick={() => mapRef.current?.zoomOut()}><Minus size={18}/></button><button title="Focus your territory" onClick={() => mapRef.current?.flyTo({center:[-73.984,40.751],zoom:14.5})}><LocateFixed size={18}/></button><button title="Toggle 3D" aria-pressed={towers} onClick={() => setTowers(!towers)}><Layers size={18}/></button></div>
    <section className="mission-panel">
      <div className="mission-kicker"><Icon size={16}/>{mode === 'city' ? 'TACTICAL OVERVIEW' : mode === 'defend' ? 'CONTESTED TERRITORY' : 'ACTIVITY CONFIRMED'}</div>
      <h1>{mode === 'city' ? 'District control' : mode === 'defend' ? 'Reclaim\nBryant Sector.' : 'Every loop\nchanges the city.'}</h1>
      {mode === 'city' ? <>
        <div className="player-stats"><div><small>UNDER CONTROL</small><strong>0.82 <span>km²</span></strong></div><div><small>DISTRICT RANK</small><strong>#07 <span className="positive">↑ 2</span></strong></div></div>
        <div className="tactical-alert"><Swords size={18}/><span><strong>{stage === 1 ? 'A gap inside your territory' : 'A rival inside your territory'}</strong><small>Bryant Sector · 0.09 km²</small></span></div>
        <div className="section-label">RUN OBJECTIVES <span>02</span></div>
        <button className="target" onClick={() => inspectTerritory('inner')}><span className={`target-icon ${stage === 1 ? 'neutral' : 'blue'}`}><Flag size={19}/></span><span><strong>Bryant Sector</strong><small>{stage === 1 ? 'Neutral · Strength 0' : 'Jonas · Strength 1'}</small></span><ChevronRight size={17}/></button>
        <button className="target" onClick={() => inspectTerritory('jonas')}><span className="target-icon blue"><Shield size={19}/></span><span><strong>East Side / Jonas</strong><small>Defense 2 · 600 m away</small></span><ChevronRight size={17}/></button>
        <button className="primary-action" onClick={() => inspectTerritory('inner')}><Footprints size={18}/> Choose a run objective <ArrowRight size={18}/></button>
        <div className="rival-row"><span className="avatar rival-avatar">JR</span><span>Jonas Reed<strong>Nearby rival · #06</strong></span><b>0.91 km²</b></div>
      </> : mode === 'defend' ? <>
        <div className="warning-line"><span className="status-dot"/>{stage === 1 ? 'The inner territory is neutral' : 'Jonas owns the inner territory'}</div>
        <div className="versus"><span><span className="avatar">MC</span>YOU</span><Swords size={22}/><span>JONAS<span className="avatar rival-avatar">JR</span></span></div>
        <div className="defense-state"><span>Inner territory control</span><strong>{stage === 1 ? 'Mila 1' : 'Jonas 1'} <ArrowRight size={20}/> <em>0</em></strong><div className="strength-track"><i/><i/><i/></div><small>{stage === 1 ? 'Jonas neutralized this territory' : 'Your next loop will neutralize this territory'}</small></div>
        <dl className="detail-list"><div><dt>Area at risk</dt><dd>0.09 km²</dd></div><div><dt>Owner</dt><dd>{stage === 1 ? 'Neutral' : 'Jonas Reed'}</dd></div><div><dt>Your next loop</dt><dd>{stage === 1 ? 'Reclaims the territory' : 'Reduces strength to 0'}</dd></div></dl>
        <button className="primary-action" onClick={() => {setStage(1);chooseMode('result');}}><Shield size={18}/> View run scenario <ArrowRight size={18}/></button>
      </> : <>
        <div className="result-runner"><span className="avatar rival-avatar">JR</span><span>Jonas Reed<small>Midtown Loop · Today, 08:42</small></span><Check size={18}/></div>
        <div className="run-stats"><div><strong>5.24</strong><small>KM</small></div><div><strong>31:08</strong><small>TIME</small></div><div><strong>0.09</strong><small>KM² ENCLOSED</small></div></div>
        <div className="outcome"><span className={`outcome-icon ${stage === 2 ? 'blue' : 'neutral'}`}><Flag size={24}/></span><div><small>{stage === 1 ? 'FIRST RUN' : 'SECOND RUN'}</small><h2>{stage === 1 ? 'Territory neutralized' : 'Territory captured'}</h2><p>{stage === 1 ? 'Mila: strength 1 → 0. Outer territory unchanged.' : 'Jonas: strength 0 → 1. The inner territory is now blue.'}</p></div></div>
        <div className="stage-switch" aria-label="Jonas run"><button aria-pressed={stage === 1} onClick={() => setStage(1)}>First / neutralize</button><button aria-pressed={stage === 2} onClick={() => setStage(2)}>Second / capture</button></div>
      </>}
    </section>
    <aside className="world-feed"><div className="section-label">DISTRICT EVENTS <span>DEMO</span></div><div className="feed-item"><span className="feed-point blue"/><p><b>Jonas</b> {mode === 'city' ? 'reinforced East Side' : 'closed a loop inside Midtown'}<small>2 min ago</small></p></div><div className="feed-item"><span className="feed-point green"/><p><b>You</b> {mode === 'city' ? 'moved up to rank 7' : 'kept your outer territory'}<small>Today</small></p></div></aside>
    <div className="legend"><span><i className="green"/>Yours</span><span><i className="blue"/>Rival</span><span>Unfilled land is unowned</span></div>
    {plannedTarget && <div className="planned-target"><Flag size={17}/><span>Objective: {plannedTarget === 'inner' ? 'Bryant Sector' : plannedTarget === 'mine' ? 'Reinforce Midtown' : 'East Side'}<small>Demo loop. GPS recording has not started.</small></span><button title="Clear objective" onClick={() => setPlannedTarget(null)}><X size={16}/></button></div>}
    {selected === 'profile' && <div className="player-detail"><button title="Close" onClick={() => setSelected(null)}><X size={16}/></button><span className="avatar">MC</span><h2>Mila Chen</h2><p>Level 8 · Midtown</p><strong>0.82 km² · 14 runs</strong><small>Demo profile</small></div>}
    {inspectedTerritory && <div className="player-detail territory-detail" role="dialog" aria-label="Territory">
      <button title="Close" onClick={() => setSelected(null)}><X size={16}/></button>
      <div className="territory-owner" style={{'--owner-color':inspectedTerritory.properties.color}}><Flag size={18}/>{inspectedOwner}</div>
      <h2>{inspectedTerritory.properties.name}</h2>
      <p>Control strength <b>{inspectedTerritory.properties.strength}</b></p>
      <p>{selected === 'mine' ? 'Your loop will reinforce this territory.' : inspectedTerritory.properties.strength === 0 ? 'One closed loop claims this territory with strength 1.' : `A loop reduces strength to ${inspectedTerritory.properties.strength - 1}. At zero, the territory becomes neutral.`}</p>
      <button className="primary-action" onClick={() => planTerritory(selected)}><Footprints size={17}/>{selected === 'mine' ? 'Reinforce territory' : 'Plan a run'}<ArrowRight size={16}/></button>
    </div>}
  </main>;
}

const root = createRoot(document.getElementById('root'));
root.render(<GameExamples/>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());