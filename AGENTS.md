# AGENTS.md

## Product

Desktop app (Linux/Windows/macOS) to manage z.ai coding-plan tokens for zcode. Implemented (Vue 3 + Tauri 2):

- Stores tokens in the app's own config file, writes the active one into zcode's config: `~/.zcode/v2/config.json` — resolves to `/home/$USER` (Linux), `C:\Users\$USER` (Windows), `/Users/$USER` (macOS) via `dirs::home_dir()` in `zcode_config_path()`.
- The token is written to BOTH `provider.builtin:zai.options.apiKey` and `provider.builtin:zai-coding-plan.options.apiKey` (constant `ZCODE_PROVIDER_IDS` in `src-tauri/src/lib.rs`) and `systemDisabledReason` is cleared, so the switch takes effect regardless of which provider zcode resolves.
- Quota usage from `GET https://api.z.ai/api/monitor/usage/quota/limit` (`Authorization: Bearer $TOKEN`), fetched Rust-side (reqwest, rustls) to avoid webview CORS.
- "Cambiar Token" rotates round-robin to the next configured token and applies it.
- UI style: dark "AI" aesthetic — near-black background, neon purple/blue gradient glows, pill-shaped glowing buttons, soft glass cards.

- App identity: `productName`/window title is "ZCode Switcher" (bundles + desktop entry); the Tauri identifier and internal binary remain `com.josval.zcode-switch-token` / `zcode-switch-token` — changing the identifier moves the token storage dir. Icons: regenerate the whole set with `bun run tauri icon assets/zcode-switcher-logo.png`; `Cargo.toml` `description` feeds the deb/metadata `Comment`, keep it in sync.

## Commands

- `bun run tauri dev` — full dev app (Vite + Rust shell).
- `bun run dev` — frontend only in browser (no Tauri shell; `invoke()` calls will fail there). Use `http://localhost:1420/demo.html` for a browser demo with a mocked IPC bridge (`src/demo/main.ts`, fabricated data — never put real tokens there; README screenshots come from it, `?autoSwitch=1` clicks the real switch button).
- `bun run tauri build` — release bundle, all targets.
- Typecheck: `bunx vue-tsc --noEmit` (runs automatically as the first half of `build`).
- Rust-side check: `cargo check` inside `src-tauri/`.

**Bun is required**: `src-tauri/tauri.conf.json` sets `beforeDevCommand`/`beforeBuildCommand` to `bun run ...`, so `tauri dev`/`tauri build` fail without bun regardless of how you install JS deps.

No test, lint, or formatter tooling is configured; `vue-tsc --noEmit` is the only automated gate.

- Release: `bun run release X.Y.Z` — bumps all manifests, validates the tag matches the version, commits, tags and pushes (tag push triggers CI). Flags: `--dry-run`, `--no-push`.

## Architecture

- `src/` — Vue 3 `<script setup>` + TypeScript (`strict`, `noUnusedLocals`, `noUnusedParameters`). Entry: `src/main.ts` → `App.vue` (container/state) → presentational components in `src/components/` (QuotaCard, TokenList, AddTokenForm).
- `src/lib/` — typed `invoke()` wrappers (`api.ts`), shared types (`types.ts`), `quota.ts` (a defensive parser for the quota response whose real shape is unverified: it promotes any object with a percent-like value or used/limit pair into a progress bar, and the UI falls back to a raw JSON view), and `viewTransition.ts` (feature-detected same-document View Transitions wrapper — no polyfill; state mutations go inside, IPC/network stay outside).
- View transitions: all `::view-transition-*` rules and keyframes live in global `src/style.css` (scoped styles never reach pseudo-elements). Names in use: `quota-card` (static) and `token-<id>` (per-row inline, unique by construction). `prefers-reduced-motion` guard is mandatory — keep it when touching this CSS.
- `src-tauri/src/lib.rs` — all Tauri commands (`load_state`, `save_state`, `zcode_path`, `apply_token`, `fetch_quota`), registered in `tauri::generate_handler![]`. Token list persists to the app config dir (`app_config_dir()/tokens.json`, mode 0600 on Unix).
- `apply_token` backs up zcode's config to `config.json.bak` before every write, writes via temp-file + rename, and preserves all unrelated keys (serde_json `preserve_order` keeps the diff readable).
- Plugin/command permissions are gated by `src-tauri/capabilities/default.json` — a runtime "not allowed" error from `invoke` usually means the permission is missing there.

## Gotchas

- Vite runs on fixed port 1420 with `strictPort: true` — it fails if the port is taken; HMR uses ws port 1421.
- Vite ignores `src-tauri/**`; Rust changes are rebuilt by `tauri dev` itself, not by Vite reload.
- Linux + NVIDIA/VM: WebKitGTK's DMABUF renderer produces a black window with `Failed to create GBM buffer`. `main.rs` sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` on Linux (pre-set env vars win if the user needs to override).
- Linux + view transitions: WebKitGTK 2.52 exposes `startViewTransition` but hangs the whole webview when it runs on the forced legacy renderer — total app freeze. `viewTransition.ts` gates transitions off on Linux (UA check) + feature-detect; do not re-enable there.
- Linux bundling: the AppImage step fails with `failed to run linuxdeploy` unless user namespaces/FUSE mounting works. Build with `APPIMAGE_EXTRACT_AND_RUN=1 NO_STRIP=true bun run tauri build`.
- Cross-compilation is not supported: Windows (MSVC) and macOS (Xcode) bundles must be built on those OSes — `.github/workflows/build.yml` (tauri-action matrix) does it via GitHub Actions on `v*` tags or manual dispatch.
- Don't remove the `windows_subsystem` attribute in `src-tauri/src/main.rs` (prevents a console window on Windows release).
- zcode rewrites `config.json` on its own; the app never caches it — always read → modify → write in one command call.
