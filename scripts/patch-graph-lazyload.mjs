// Lazy-load the graph plugin's client script (d3 + pixi.min.js, ~225 KB br,
// plus the graph render CPU cost) so it only runs once a graph container is
// near the viewport, instead of unconditionally on every page that has a
// Graph component (i.e. every page — the plugin is enabled site-wide).
//
// @quartz-community/graph's compiled client script
// (dist/index.js / dist/components/index.js, the `graph_inline_default`
// template literal, source: src/components/scripts/graph.inline.ts) is an
// IIFE that, the moment it runs, unconditionally does:
//
//   Promise.all([loadScript(d3 CDN url), loadScript(pixi CDN url)]).then(t)
//
// `t()` then renders every `.graph-container` on the page and wires up nav/
// click/keydown listeners. There is no lazy/defer option in the plugin's
// optionSchema (only `localGraph`/`globalGraph` object shapes) — see
// node_modules/@quartz-community/graph/package.json `"quartz".optionSchema`.
// So the only lever, same as scripts/patch-graph-pixi.mjs, is a build-time
// rewrite of the installed package.
//
// This patch renames the ENTIRE original script body into a plain JS string
// constant (via JSON.stringify — no parsing/mangling of the minified code
// needed) and replaces `graph_inline_default`'s value with a small,
// hand-written bootstrap that:
//   - watches every `.graph-outer` box (the visible local-graph box) with an
//     IntersectionObserver (rootMargin 200px) and, the first time one is near
//     the viewport, injects the original script verbatim as a real <script>
//     element (so it runs exactly as it always did — same libs, same
//     rendering, same event wiring);
//   - falls back to loading immediately if IntersectionObserver is
//     unavailable;
//   - also loads immediately on a click on `.global-graph-icon` (the global-
//     graph button), so the button still works even before any local graph
//     has scrolled into view — the original script's own click handling
//     takes over once it boots and re-renders on `nav`;
//   - re-arms the observer on Quartz's SPA `nav` event (new page content
//     swapped in) until the real script has loaded once, after which the
//     original script's own `nav` listener keeps handling re-renders (cheap
//     once d3/pixi are cached).
//
// Idempotent: once patched, the file no longer contains the backtick-
// delimited `var graph_inline_default = \`...\`;` assignment this script
// looks for (it's now a JSON string literal), so a second run is a no-op.
// Also a no-op if upstream ever changes the plugin (the OPEN marker won't be
// found, and the script logs so instead of failing silently).
//
// Must run AFTER scripts/patch-graph-pixi.mjs in `prebuild`, so the original
// body embedded here already has the pixi.min.js URL rewrite baked in.
import { readFileSync, writeFileSync, existsSync } from "node:fs"

const targets = [
  "node_modules/@quartz-community/graph/dist/index.js",
  "node_modules/@quartz-community/graph/dist/components/index.js",
]

const OPEN = "var graph_inline_default = `"

function buildWrapperSource(originalBody) {
  const embeddedOriginal = JSON.stringify(originalBody)
  return [
    "(function(){",
    "  var lg_loaded=false;",
    "  function lg_run(){",
    "    if(lg_loaded)return;",
    "    lg_loaded=true;",
    "    var s=document.createElement('script');",
    "    s.textContent=" + embeddedOriginal + ";",
    "    document.head.appendChild(s);",
    "  }",
    "  function lg_boot(){",
    "    if(lg_loaded)return;",
    "    var els=document.querySelectorAll('.graph-outer');",
    "    if(!els.length)return;",
    "    if(!('IntersectionObserver' in window)){lg_run();return;}",
    "    var io=new IntersectionObserver(function(entries){",
    "      for(var i=0;i<entries.length;i++){",
    "        if(entries[i].isIntersecting){io.disconnect();lg_run();return;}",
    "      }",
    "    },{rootMargin:'200px'});",
    "    for(var i=0;i<els.length;i++)io.observe(els[i]);",
    "  }",
    "  document.addEventListener('click',function(e){",
    "    if(lg_loaded)return;",
    "    var t=e.target&&e.target.closest&&e.target.closest('.global-graph-icon');",
    "    if(t)lg_run();",
    "  },true);",
    "  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',lg_boot);else lg_boot();",
    "  document.addEventListener('nav',function(){if(!lg_loaded)lg_boot();});",
    "})();",
  ].join("\n")
}

let changed = 0
for (const f of targets) {
  if (!existsSync(f)) continue
  const src = readFileSync(f, "utf8")
  const openIdx = src.indexOf(OPEN)
  if (openIdx === -1) continue // already patched, or upstream changed shape

  const bodyStart = openIdx + OPEN.length
  const closeIdx = src.indexOf("`", bodyStart)
  if (closeIdx === -1) continue // malformed / unexpected shape, bail out safely

  // `src.slice(bodyStart, closeIdx)` is the RAW SOURCE TEXT between the
  // backticks — NOT the decoded runtime string. Template literals can
  // contain escape sequences (this script has `\\/` for a literal `/` in a
  // regex, e.g. `/^\//`), so treating the raw slice as if it were already
  // the runtime value and re-escaping it with JSON.stringify double-escapes
  // every backslash (`\/` -> `\\/` in the raw text -> `\\\\/` once
  // JSON.stringify escapes it again), corrupting every regex/escape in the
  // script. Evaluate the literal (including its backtick delimiters) with
  // the real JS engine instead, so we get the actual decoded string Quartz
  // will hand the browser.
  const literalSource = src.slice(bodyStart - 1, closeIdx + 1) // include both backticks
  let originalBody
  try {
    originalBody = new Function(`return (${literalSource});`)()
  } catch {
    continue // couldn't safely evaluate — bail out rather than guess
  }
  // Sanity check: this is the script we think it is (loads d3+pixi from CDN).
  if (!originalBody.includes("cdn.jsdelivr.net/npm/d3") || !originalBody.includes("pixi")) {
    continue
  }

  const afterClose = src.indexOf(";", closeIdx)
  if (afterClose === -1) continue

  const wrapperSource = buildWrapperSource(originalBody)
  const replacement = `var graph_inline_default = ${JSON.stringify(wrapperSource)}`
  const newSrc = src.slice(0, openIdx) + replacement + src.slice(afterClose)

  writeFileSync(f, newSrc)
  changed++
}
console.log(
  changed
    ? `patch-graph-lazyload: wrapped graph client script for lazy-load in ${changed} file(s)`
    : "patch-graph-lazyload: nothing to do (already patched, or upstream changed)",
)
