// Rewrite the graph plugin's CDN pixi.js URL to the minified build.
//
// @quartz-community/graph ships an inline client script that dynamically injects
//   https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.js      (UNMINIFIED)
// alongside d3, which it already loads as d3.min.js. The plugin exposes no option
// for the CDN URL (its optionSchema covers only localGraph/globalGraph), so the
// only lever is a build-time rewrite of the installed package.
//
// Measured on 2026-08-24 against cdn.jsdelivr.net:
//   pixi.js      2,399,021 B raw / 471,099 B gzip / 444,919 B brotli
//   pixi.min.js    818,297 B raw / 231,974 B gzip / 224,607 B brotli
//   saving       1,580,724 B raw / 239,125 B gzip / 220,312 B brotli  (~215 KiB br)
//
// Idempotent, and a no-op if the upstream package ever fixes this itself.
import { readFileSync, writeFileSync, existsSync } from "node:fs"

const FROM = "cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.js"
const TO = "cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.js"
const targets = [
  "node_modules/@quartz-community/graph/dist/index.js",
  "node_modules/@quartz-community/graph/dist/components/index.js",
]

let changed = 0
for (const f of targets) {
  if (!existsSync(f)) continue
  const src = readFileSync(f, "utf8")
  if (!src.includes(FROM)) continue
  writeFileSync(f, src.split(FROM).join(TO))
  changed++
}
console.log(
  changed
    ? `patch-graph-pixi: rewrote pixi.js -> pixi.min.js in ${changed} file(s)`
    : "patch-graph-pixi: nothing to do (already minified, or upstream changed)",
)
