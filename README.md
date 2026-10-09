# Name Manhattan Streets

A Manhattan edition of [Name SF Streets](https://carvin.github.io/sf-street-names/). Type street names from memory to reveal them on the map and track the percentage of Manhattan’s mapped street mileage you have named.

The interaction model, color palette, and visual layout intentionally mirror Chris Arvin’s original game. This repository is kept private because the original site does not publish a reuse license.

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

Run `npm run data:refresh` to rebuild the local GeoJSON and game data from the current datasets. The resulting game contains 1,121 named street groups covering approximately 737 miles. Street suffixes, cardinal directions, written ordinals, Avenue of the Americas, and FDR Drive aliases are normalized for play. Exact names win over suffixless aliases; ambiguous shortened names are rejected so one guess cannot reveal unrelated streets.

NYC data is provided under the [NYC Open Data Terms of Use](https://opendata.cityofnewyork.us/overview/#termsofuse).

## Saving games

Named games and progress are stored only in the current browser with `localStorage`. No account, analytics service, or remote database is used.

## Credits

Original game concept and design by [Chris Arvin](https://github.com/carvin). Manhattan adaptation and data pipeline created for this repository.
