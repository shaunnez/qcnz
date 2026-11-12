# Queen Charlotte Track 3D

Phone web app for the Queen Charlotte Track walk, 13 to 16 November 2026: 3D map, hourly forecast on the map, GPS tracking, replay and points of interest.

Live site: https://shaunnez.github.io/qcnz/

## Use on the phone

1. Open the live site while you have a connection. Wait until the map shows.
2. Add it to the home screen.
3. Open it from the home screen and allow location in the Track me tab.

The app then works offline. The forecast updates when there is a connection.

## Files

- Root: the built site that GitHub Pages serves.
- `source/`: the source. Run `npm install` and `npm run build` in `source/` to rebuild `app.js`.

## Data

- Track line and places: OpenStreetMap contributors (ODbL).
- Heights: Mapzen terrain tiles on AWS.
- Forecast: Open-Meteo.
- Section times, facilities and route notes: the Wilderness Guides Marlborough Sounds route guide, in my own words.

GitHub Pages serves the `gh-pages` branch. Push each change to `main` and to `gh-pages`.
