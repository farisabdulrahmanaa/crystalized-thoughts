# 📝 ملاحظات فارس — Crystalized Thoughts

Arabic-first digital garden, built with [Quartz v5](https://quartz.jzhao.xyz) and
deployed on Cloudflare Pages → **[crystalized-thoughts.pages.dev](https://crystalized-thoughts.pages.dev)**

## How publishing works

Notes live in a private Obsidian vault that never leaves my phone. Only notes
explicitly marked `publish: true` in their frontmatter are pushed here, from
inside Obsidian via [Quartz Syncer](https://github.com/saberzero1/quartz-syncer).

**This repository contains only already-public content.** Nothing private is
mirrored here — not in the working tree, and not in history.

## The publish guard

`scripts/verify-publish.mjs` runs before every build and **fails the build** if:

- any `.md` in `content/` lacks `publish: true`, or
- the note count falls below `MIN_PUBLISHED_NOTES` (default 10), which catches a
  wiped or half-failed sync

A failed guard deploys nothing — the previous site stays live. It is a
deliberate second barrier behind the Obsidian plugin, so that no single
misconfiguration can expose a private note. Don't disable it; a failure means
something upstream sent content it shouldn't have.

Quartz's own `explicit-publish` filter is also enabled in `quartz.config.yaml`
as a third barrier. Note that Quartz ships it **disabled** by default.

```bash
npm run verify   # run the guard alone
npm run build    # guard + build
```
