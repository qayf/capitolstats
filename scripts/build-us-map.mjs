// Turns the us-atlas state shapes (public Census data, already projected with
// Alaska and Hawaii in insets) into SVG paths for the map page, so no mapping
// library ships to visitors. Run with `npm run update:map`.
import { readFile, writeFile } from "node:fs/promises";
import { geoPath } from "d3-geo";
import { feature } from "topojson-client";

const topology = JSON.parse(await readFile(new URL("../node_modules/us-atlas/states-albers-10m.json", import.meta.url)));
const path = geoPath().digits(1);

const states = feature(topology, topology.objects.states).features
  .map((f) => ({ name: f.properties.name, d: path(f) }))
  .sort((a, b) => a.name.localeCompare(b.name));

await writeFile(new URL("../lib/data/us-map.json", import.meta.url), JSON.stringify({ width: 975, height: 610, states }) + "\n");
console.log(`Saved ${states.length} shapes`);
