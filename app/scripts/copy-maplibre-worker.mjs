// MapLibre 6 locates its web worker relative to import.meta.url, which breaks once
// Turbopack bundles it ("Worker failed to load"). Copy the self-contained worker into
// public/ so it is served at a stable URL; MapView calls setWorkerUrl() with it.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("maplibre-gl/package.json"));
const { version } = require("maplibre-gl/package.json");
mkdirSync("public/vendor", { recursive: true });
copyFileSync(join(pkgDir, "dist/maplibre-gl-worker.mjs"), "public/vendor/maplibre-gl-worker.mjs");
console.log(`copied maplibre-gl-worker.mjs (v${version}) to public/vendor/`);
