#!/usr/bin/env bun
/**
 * Release helper for ZCode Switcher.
 *
 * Bumps the app version across manifests (tauri.conf.json, Cargo.toml,
 * package.json, Cargo.lock), validates that the git tag matches the new
 * version, commits, tags and pushes. Pushing the tag is what triggers CI
 * (.github/workflows/build.yml) to build and publish the installers.
 *
 * Usage:
 *   bun run release <version> [--dry-run] [--no-push]
 *
 *   bun run release 0.1.2            # full release
 *   bun run release v0.1.2 --dry-run # plan only (the "v" prefix is optional)
 *   bun run release 0.1.2 --no-push  # commit + tag locally, skip push
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const CONF = "src-tauri/tauri.conf.json";
const CARGO = "src-tauri/Cargo.toml";
const LOCK = "src-tauri/Cargo.lock";
const PKG = "package.json";
/** Files staged for the release commit, in full, never `git add -A`. */
const RELEASE_FILES = [CONF, CARGO, LOCK, PKG];

interface Opts {
  version: string;
  tag: string;
  dryRun: boolean;
  push: boolean;
}

function die(msg: string): never {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

function ok(msg: string): void {
  console.log(`✔ ${msg}`);
}

function capture(cmd: string): string {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function parseArgs(argv: string[]): Opts {
  const args = argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const noPush = args.includes("--no-push");
  const raw = args.find((a) => !a.startsWith("--"));
  if (raw === undefined || raw === "") {
    die("usage: bun run release <version> [--dry-run] [--no-push]");
  }
  const version = raw.replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    die(`"${raw}" is not valid semver (expected X.Y.Z, optional "v" prefix).`);
  }
  return { version, tag: `v${version}`, dryRun, push: !noPush };
}

function greaterThan(a: string, b: string): boolean {
  const pa = a.split("-")[0].split(".").map(Number);
  const pb = b.split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i];
  }
  return false;
}

function tagExistsLocal(tag: string): boolean {
  try {
    capture(`git rev-parse -q --verify refs/tags/${tag}`);
    return true;
  } catch {
    return false;
  }
}

function tagExistsOnOrigin(tag: string): boolean {
  try {
    return capture(`git ls-remote --tags origin refs/tags/${tag}`) !== "";
  } catch {
    console.warn("⚠ could not reach origin to check remote tags; continuing.");
    return false;
  }
}

/**
 * Replace the first version-like match in the file. Each manifest carries its
 * own current version (they can drift, e.g. package.json was not bumped in
 * early releases), so we bump whatever we find instead of expecting the
 * global current version.
 */
function bump(path: string, next: string, pattern: RegExp, label: string): void {
  const full = join(ROOT, path);
  const src = readFileSync(full, "utf8");
  const found = src
    .match(pattern)?.[0]
    ?.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)?.[0];
  if (found === undefined) {
    die(`${label}: could not find a version to replace.`);
  }
  writeFileSync(full, src.replace(pattern, (match) => match.replace(found, next)));
  ok(`${label}: ${found} -> ${next}`);
}

function preflight(o: Opts): string {
  try {
    capture("git rev-parse --is-inside-work-tree");
  } catch {
    die("not inside a git repository.");
  }

  const status = capture("git status --porcelain");
  if (status !== "") {
    die(`working tree is not clean:\n${status}\nCommit or stash before releasing.`);
  }

  const branch = capture("git rev-parse --abbrev-ref HEAD");
  if (branch !== "main") {
    die(`you are on "${branch}" — releases are cut from "main".`);
  }

  if (tagExistsLocal(o.tag)) {
    die(`tag ${o.tag} already exists locally. Pick the next version.`);
  }
  if (tagExistsOnOrigin(o.tag)) {
    die(`tag ${o.tag} already exists on origin. Pick the next version.`);
  }

  const conf = readFileSync(join(ROOT, CONF), "utf8");
  const current = conf.match(/"version": "([^"]+)"/)?.[1];
  if (current === undefined) {
    die(`${CONF}: could not read the current version.`);
  }
  if (current === o.version) {
    die(`version is already ${current} — pick a different one.`);
  }
  if (!greaterThan(o.version, current)) {
    die(`${o.version} is not greater than the current version (${current}).`);
  }
  ok(`current version: ${current} -> ${o.version} (${o.tag})`);
  return current;
}

function bumpAll(o: Opts): void {
  bump(CONF, o.version, /"version": "[^"]+"/, "tauri.conf.json");
  bump(CARGO, o.version, /^version = "[^"]+"/m, "Cargo.toml");
  bump(PKG, o.version, /"version": "[^"]+"/, "package.json");
  try {
    capture("cargo update -p zcode-switch-token");
    ok("Cargo.lock refreshed (cargo update)");
  } catch (e) {
    die(`cargo update failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * The validation the whole script exists for: re-read the files from disk and
 * make sure every manifest carries the new version and the tag name is
 * exactly "v" + that version. Runs before commit/tag, so a mismatch can never
 * reach CI.
 */
function validateTagMatchesVersion(o: Opts): void {
  const confVersion = readFileSync(join(ROOT, CONF), "utf8").match(/"version": "([^"]+)"/)?.[1];
  const cargoVersion = readFileSync(join(ROOT, CARGO), "utf8").match(/^version = "([^"]+)"/m)?.[1];
  const lock = readFileSync(join(ROOT, LOCK), "utf8");
  const lockVersion = lock.match(/name = "zcode-switch-token"\nversion = "([^"]+)"/)?.[1];

  for (const [label, found] of [
    [CONF, confVersion],
    [CARGO, cargoVersion],
    ["Cargo.lock", lockVersion],
  ] as const) {
    if (found !== o.version) {
      die(`${label}: expected "${o.version}" after bump, found "${found ?? "nothing"}".`);
    }
  }
  if (o.tag !== `v${confVersion}`) {
    die(`tag "${o.tag}" does not match version "${confVersion}".`);
  }
  ok(`validated: ${o.tag} matches version ${o.version} in all manifests`);
}

function release(o: Opts): void {
  const current = preflight(o);

  if (o.dryRun) {
    console.log("dry-run: no files, commits, tags or pushes were touched.");
    console.log(`would bump ${CONF}, ${CARGO}, ${PKG}, ${LOCK} to ${o.version}`);
    console.log(`would commit "chore(release): ${o.tag}" and create annotated tag ${o.tag}`);
    console.log(`would ${o.push ? "push main + tag (CI builds the installers)" : "skip push (--no-push)"}`);
    return;
  }

  bumpAll(o);
  validateTagMatchesVersion(o);

  capture(`git add ${RELEASE_FILES.join(" ")}`);
  capture(`git commit -m "chore(release): ${o.tag}"`);
  capture(`git tag -a ${o.tag} -m "ZCode Switcher ${o.tag}"`);
  ok(`committed and tagged ${o.tag}`);

  if (!o.push) {
    console.log("--no-push: commit and tag stay local. Push manually with:");
    console.log(`  git push origin main && git push origin ${o.tag}`);
    return;
  }

  capture("git push origin main");
  capture(`git push origin ${o.tag}`);
  ok("pushed main + tag — CI is building the installers");

  const origin = capture("git remote get-url origin").replace(/^(git@github\.com:|https:\/\/github\.com\/)/, "").replace(/\.git$/, "");
  console.log(`\nwatch: https://github.com/${origin}/actions`);
  console.log(`release (when CI finishes): https://github.com/${origin}/releases/tag/${o.tag}`);
}

release(parseArgs(process.argv));
