# Name Manhattan Streets

A Manhattan edition of [Name SF Streets](https://carvin.github.io/sf-street-names/). Type street names from memory to reveal them on the map and track the percentage of Manhattan’s mapped street mileage you have named.

[Play Name Manhattan Streets](https://marcuszyyao.github.io/manhattan-street-names/)

The interaction model, color palette, and visual layout intentionally mirror Chris Arvin’s original game. Attribution to the original creator is retained below.

## Run locally

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Build and test:

```bash
npm test
npm run build
```

## Data

The checked-in game data was generated on 2026-10-09 from NYC Open Data:

- [NYC Street Centerline (CSCL)](https://data.cityofnewyork.us/d/inkn-q76z) — Manhattan street geometry, names, and segment lengths
- [Parks Properties](https://data.cityofnewyork.us/d/enfh-gkve) — park polygons
- [Borough Boundaries](https://data.cityofnewyork.us/d/gthc-hcne) — Manhattan land outline

Run `npm run data:refresh` to rebuild the local GeoJSON and game data from the current datasets. The resulting game contains 1,120 named street groups covering approximately 737 miles. Street suffixes, cardinal directions, written ordinals, Avenue of the Americas, FDR Drive aliases, and East/West Houston Street are normalized for play. A guess with an explicit ending stays specific (`First Avenue` reveals only `1ST AVE`), while omitting the ending (`First`) reveals every matching street type.

NYC data is provided under the [NYC Open Data Terms of Use](https://opendata.cityofnewyork.us/overview/#termsofuse).

## Saving games

Named games and progress are stored only in the current browser with `localStorage`. No account, analytics service, or remote database is used.

## Credits

Original game concept and design by [Chris Arvin](https://github.com/carvin). Manhattan adaptation and data pipeline created for this repository.
