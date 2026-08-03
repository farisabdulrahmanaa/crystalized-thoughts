#!/usr/bin/env node
/**
 * Fail-closed publish guard.
 *
 * This repo is meant to contain ONLY notes explicitly marked `publish: true`.
 * The Obsidian-side plugin is supposed to guarantee that — this script assumes
 * it might not. If anything unflagged appears, the build dies and nothing is
 * deployed, leaving the previous site live.
 *
 * Run before `quartz build`. Never remove it, and never "fix" a failure by
 * relaxing it — a failure here means something upstream sent content it
 * shouldn't have.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, extname } from "node:path"

const CONTENT = "content"
const MIN_NOTES = Number(process.env.MIN_PUBLISHED_NOTES ?? 10)

const walk = (dir, acc = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, acc)
    else acc.push(p)
  }
  return acc
}

let files
try {
  files = walk(CONTENT)
} catch {
  console.error(`✗ FATAL: no '${CONTENT}/' directory. Refusing to build.`)
  process.exit(1)
}

const md = files.filter((f) => extname(f).toLowerCase() === ".md")
const other = files.filter((f) => extname(f).toLowerCase() !== ".md")

// `publish: true` inside the leading --- frontmatter block only
const isPublished = (src) => {
  const m = src.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---/)
  return m ? /^publish:\s*(true|yes|1)\s*$/im.test(m[1]) : false
}

const offenders = md.filter((f) => !isPublished(readFileSync(f, "utf8")))

console.log(`publish guard: ${md.length} markdown file(s), ${other.length} other file(s)`)
if (other.length) {
  console.log("  non-markdown files (served as-is — confirm none are private):")
  for (const f of other.slice(0, 40)) console.log(`    · ${relative(CONTENT, f)}`)
  if (other.length > 40) console.log(`    … and ${other.length - 40} more`)
}

if (offenders.length) {
  console.error(`\n✗ BUILD BLOCKED: ${offenders.length} file(s) lack \`publish: true\`:`)
  for (const f of offenders) console.error(`    · ${relative(CONTENT, f)}`)
  console.error("\nNothing was deployed. The live site is unchanged.")
  console.error("Investigate why unflagged content reached this repo before retrying.")
  process.exit(1)
}

if (md.length < MIN_NOTES) {
  console.error(`\n✗ BUILD BLOCKED: only ${md.length} note(s), expected >= ${MIN_NOTES}.`)
  console.error("This usually means content was wiped or a sync half-failed.")
  console.error("If the drop is intentional, set MIN_PUBLISHED_NOTES.")
  process.exit(1)
}

console.log(`✓ all ${md.length} note(s) carry \`publish: true\`. Safe to build.`)
