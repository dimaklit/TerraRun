# PROJECT_SPEC.md — TerraRun (GitHub Pages MVP)

## 1. Project Overview & Deployment Target
* **Project Name:** TerraRun
* **Tagline:** Turning Real-World Running into a 3D Area Control Strategy
* **Deployment Target:** Static Single-Page Application (SPA) hosted on **GitHub Pages**.
* **Architecture:** Client-side React application with a managed cloud geospatial database via **Supabase (PostgreSQL + PostGIS)**.
* **Core Loop:** 
  1. A runner records or uploads a workout.
  2. The system checks if start and finish locations meet (delta $\le 50\text{ m}$).
  3. The closed route creates a 3D polygonal "claim" on the map.
  4. Overlapping claims allow runners to compete for total controlled surface area.

---

## 2. Tech Stack & Key Libraries

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Build Tool & UI** | React 18+ / Vite | Static SPA runtime deployable to GitHub Pages |
| **Styling** | Tailwind CSS | Dark/Cyberpunk high-contrast UI theme |
| **Map Rendering** | Mapbox GL JS (or MapLibre GL JS) | 3D terrain, building extrusions, vector tiles |
| **Spatial Utilities** | `@turf/turf` | Client-side coordinate math, loop distance, geometry sanitization |
| **File Parsing** | `@tmcw/togeojson` / native DOMParser | In-browser parsing of `.gpx` and `.json` files |
| **Backend & Spatial DB** | `@supabase/supabase-js` + PostGIS | Multi-user persistence, authentication, spatial overlap queries |

---

## 3. Core Geospatial & Business Rules

### 3.1. Coordinate Conventions
* **GeoJSON Standard:** All coordinate pairs must strictly follow `[longitude, latitude]`. Never invert to `[latitude, longitude]`.
* **SRID:** Spatial reference system `EPSG:4326` (WGS 84).

### 3.2. Loop Closure Validation
* Let $P_0$ be the starting point `[lng, lat]` and $P_n$ be the ending point `[lng, lat]`.
* The Euclidean / Haversine distance is computed:
  $$\Delta d = \text{distance}(P_0, P_n)$$
* **Validation Rule:**
  * If $\Delta d \le 0.05\text{ km}$ ($50\text{ meters}$): Route is **VALID**. Append $P_0$ to the end of the array to create a closed ring and emit a `Polygon`.
  * If $\Delta d > 0.05\text{ km}$: Route is **OPEN**. Render as a standard `LineString` with the status: *"Route open — no territory captured"*.

### 3.3. Area Calculation
* Primary calculation occurs in the PostGIS database using spherical projection:
  $$\text{Area (km}^2) = \frac{\text{ST\_Area}(\text{geom}::\text{geography})}{1\,000\,000}$$
* Secondary client preview calculations can be approximated using `turf.area(polygon) / 1000000`.

### 3.4. Speed & Anti-Cheat Validation
* Compute segment velocity:
  $$v = \frac{\Delta \text{distance}}{\Delta \text{time}} \times 3.6\quad (\text{km/h})$$
* If sustained speed exceeds $35\text{ km/h}$, flag the activity in `public.flagged_activities` and withhold the claim until reviewed by a superuser.

---

### 3.5. Territory Control Strength
* Area and control strength are independent: repeated runs increase strength, not surface area.
* Apply confirmed activities in chronological order. Each enclosed area contributes one control action.
* A run by the owner increases strength by one in its enclosed area.
* A rival run decreases strength by one only in the intersection with owned territory. Non-overlapping regions retain their state.
* Strength zero is neutral: no owner, no player color, no fill, outline, or tower. The next activity enclosing that neutral area claims it with strength one.
* An inner loop can neutralize or capture a region inside another player's territory without affecting the surrounding area; resulting polygons can have holes.
* Render towers at `strength * 12` meters. Do not add rival activity heights to the owner's strength.
* Route selection and date filters only limit display geometry. They never undo previously applied activities or change game strength.
* Duplicate activity imports must not award additional strength. The current local prototype identifies imports by player, route geometry, coordinate times, and activity name (or filename); production requires trusted activity IDs and server-side validation.
* Activities without coordinate timestamps use import time for ordering. Distinct runs without timestamps need distinct activity names; reimporting the same activity is ignored.
* The current implementation is client-side and session-only. Multiplayer authentication, persistence, and authoritative control calculations remain backend work; the database contract below must be extended before deployment of competitive play.

## 4. Database Schema & RPC Contract (Supabase + PostGIS)

AI agents must assume the following tables, views, and functions exist in the database:

### 4.1. Tables & Views
```sql
-- Profiles / Players
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  color_hex TEXT NOT NULL DEFAULT '#00f0ff',
  role TEXT NOT NULL DEFAULT 'player', -- 'player' | 'superadmin'
  strava_athlete_id BIGINT UNIQUE,
  strava_access_token TEXT,
  strava_refresh_token TEXT,
  strava_expires_at BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Captured Territories
CREATE TABLE public.territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT DEFAULT 'Captured Sector',
  geom geometry(Polygon, 4326) NOT NULL,
  area_sq_km NUMERIC(8, 4),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Anti-Cheat / Moderation Log
CREATE TABLE public.flagged_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id),
  activity_id TEXT,
  reason TEXT NOT NULL,
  max_speed_kmh NUMERIC(5, 2),
  avg_speed_kmh NUMERIC(5, 2),
  raw_stream JSONB,
  status TEXT DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pre-aggregated FeatureCollection for Mapbox
CREATE OR REPLACE VIEW public.territories_geojson AS
SELECT 
  jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'type', 'Feature',
          'id', t.id,
          'geometry', ST_AsGeoJSON(t.geom)::jsonb,
          'properties', jsonb_build_object(
            'id', t.id,
            'name', t.name,
            'user_id', t.user_id,
            'username', p.username,
            'color', p.color_hex,
            'area_sq_km', t.area_sq_km,
            'created_at', t.created_at
          )
        )
      ), '[]'::jsonb
    )
  ) AS geojson
FROM public.territories t
JOIN public.profiles p ON t.user_id = p.id;
```

### 4.2. Stored Procedures (RPC)
```sql
-- Claim territory with validation
public.claim_territory(
  p_user_id UUID,
  p_geojson_geom JSONB,
  p_sector_name TEXT DEFAULT 'Sector'
) RETURNS JSONB;

-- Superuser territory revocation
public.admin_revoke_territory(
  p_admin_id UUID,
  p_territory_id UUID,
  p_reason TEXT DEFAULT 'Violation'
) RETURNS JSONB;
```

---

## 5. MVP Component Architecture

```
src/
├── components/
│   ├── MapView.jsx          # Fullscreen 3D Mapbox instance with extrusion layers
│   ├── ControlDock.jsx      # Floating HUD: Player switcher & manual file uploader
│   ├── StatsOverlay.jsx     # Active user metrics, area held, and leaderboard
│   └── AdminDashboard.jsx   # Superuser dock: claim revocation & anti-cheat alerts
├── utils/
│   ├── geo.js               # Turf.js closure validation, GPX parser, speed checks
│   ├── mapboxConfig.js      # Map style, layer definitions, and 3D extrusion presets
│   └── supabase.js          # Supabase client singleton & RPC methods
├── App.jsx                  # Main application container & view toggles
└── main.jsx                 # React root mounting point
```

---

## 6. GitHub Pages Deployment Constraints

1. **Vite Base Path:** `vite.config.js` must set `base: './'` or `base: '/<repository-name>/'` to prevent broken asset paths.
2. **Environment Variables:** All public keys must use the `VITE_` prefix:
   * `VITE_SUPABASE_URL`
   * `VITE_SUPABASE_ANON_KEY`
   * `VITE_MAPBOX_TOKEN`
3. **Static Routing:** Do not use HTML5 pushState routing unless paired with a custom `404.html` redirect script. Use state-based view switching or hash routing (`#/admin`).
4. **No Server Runtime:** The GitHub Pages build contains only HTML, JS, CSS, and static assets. All backend logic is executed directly via Supabase client calls and Supabase Edge Functions.

---

## 7. AI Agent Execution Directives

When implementing features from this specification:
* **Preserve Code Structure:** Maintain single-responsibility utility functions in `src/utils/geo.js`.
* **Resilient Geometry:** Always pass candidate GeoJSON through `turf.cleanCoords()` before submitting to `claim_territory()`.
* **Dark Mode Visuals:** Maintain a cyberpunk aesthetic with `#0f172a` (slate-900) bases, neon cyan `#00f0ff`, and magenta `#ff0055` territory highlights.