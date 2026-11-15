# Queen Charlotte Track 3D and the Great Walks

Phone web app with a 3D map for the Queen Charlotte Track and the 11 Great Walks of New Zealand: hourly forecast on the map, GPS tracking, replay, points of interest, Topo50 map and a plan that you can change (direction, start, end, nights, date).

Touch the walk name at the top left to select a walk. Each walk has a map pack in `walks/<id>/` that the app downloads the first time.

Live site: https://shaunnez.github.io/qcnz/

## Use on the phone

1. Open the live site while you have a connection. Wait until the map shows.
2. Add it to the home screen.
3. Open it from the home screen and allow location in the Track me tab.

The app then works offline. The forecast updates when there is a connection.

## Files

- Root: the built site that GitHub Pages serves.
- `walks/<id>/`: the map pack of each Great Walk (`pack.json`, `heights.webp`, `topo.webp`, `topofeat.json`, `cover.png`).
- `source/`: the source. Run `npm install` and `npm run build` in `source/` to rebuild `app.js`.
- `source/pipeline/`: the scripts that build a map pack (`python3 build_walk.py <id>`). They read a LINZ Basemaps key from the `LINZ_KEY` environment variable. The key is not in this repository.

## Data

- Track line and places: OpenStreetMap contributors (ODbL).
- Heights: LINZ 1 m LiDAR model (Marlborough 2020-2022) and LINZ 8 m contour model, averaged to 8 m. Sourced from LINZ. CC BY 4.0.
- Topo50 map image (`topo.webp`) and topo features (`topofeat.json`): LINZ Basemaps. Sourced from LINZ. CC BY 4.0.
- Great Walks: track lines from OpenStreetMap contributors (ODbL). Huts and campsites from the Department of Conservation open data (CC BY 4.0). Heights from the LINZ 8 m contour model, Topo50 map image and topo features from LINZ Basemaps (CC BY 4.0). Walk times are estimates from distance and climb, not DOC times.
- Forecast: Open-Meteo.
- Section times, facilities and route notes: the Wilderness Guides Marlborough Sounds route guide, in my own words.

GitHub Pages serves the `gh-pages` branch. Push each change to `main` and to `gh-pages`.
