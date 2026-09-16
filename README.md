# ZCode Switcher

<p align="center">
  <img src="assets/zcode-switcher-logo.png" width="140" alt="ZCode Switcher logo" />
</p>

Desktop manager (Linux / Windows / macOS) for your **z.ai coding-plan** tokens, built with Tauri 2 + Vue 3 + TypeScript.

Store one or more tokens, check your plan's quota usage at a glance, and hot-swap the active token straight into zcode's config.

| Main view | After "Cambiar Token" |
| --- | --- |
| ![Main view](docs/screenshots/app-main.png) | ![After switching tokens](docs/screenshots/app-switched.png) |

## Features

- **Multi-token**: add as many z.ai tokens as you need; the list persists in the app's own config (never inside the agents' configs).
- **Multi-agent**: choose where the switch applies — ZCode, OpenCode, or both. Your choice persists.
- **Cambiar Token**: one click rotates round-robin to the next configured token and applies it to the enabled agents.
- **Quota card**: live usage from `GET https://api.z.ai/api/monitor/usage/quota/limit` (`Authorization: Bearer $TOKEN`), fetched Rust-side (reqwest + rustls) to avoid webview CORS. Unknown response shapes fall back to a raw JSON view.
- **Safe config writes**: reads each config → modifies only the token fields → writes atomically (temp file + rename), keeping a one-shot `.bak` backup. Everything else is preserved.
- **Native View Transitions** on supported webviews (Windows / macOS), instant updates elsewhere.

## How it works

The active token is written into the credential store of each enabled agent, resolved from the user home directory on every platform:

| Agent | Credential store | What changes |
| --- | --- | --- |
| ZCode | `~/.zcode/v2/config.json` (`C:\Users\$USER\…`, `/Users/$USER/…`) | `provider.builtin:zai.options.apiKey` + `provider.builtin:zai-coding-plan.options.apiKey` |
| OpenCode | `~/.local/share/opencode/auth.json` (same on all OSes — it's what `opencode auth login` writes) | `zai-coding-plan.key` + `zai.key` |

The key is written to both provider entries on each agent (and stale `systemDisabledReason` flags are cleared on zcode), so the switch takes effect no matter which provider the agent resolves. Agents rewrite these files on their own, so the app never caches them — every switch is a fresh read → modify → write cycle.

Token list lives in the app config dir (`tokens.json`, mode `0600` on Unix). Tokens are never logged and never leave your machine except to the official z.ai quota endpoint.

## Development

**Bun is required** — `src-tauri/tauri.conf.json` runs the frontend through `bun run ...`:

```bash
bun install
bun run tauri dev      # full desktop app
bun run tauri build    # release bundle, all targets

bunx vue-tsc --noEmit  # typecheck (the only automated gate)
cargo check            # inside src-tauri/, for the Rust side
```

`bun run dev` serves the frontend alone in a browser — `invoke()` calls will fail there. For UI iteration without the Tauri shell there's a demo mode with a mocked IPC bridge and fabricated data:

```bash
bun run dev
# then open http://localhost:1420/demo.html
```

The README screenshots above were captured from that demo (`?autoSwitch=1` clicks the real "Cambiar Token" button after mount).

### Cutting a release

```bash
bun run release 0.1.2          # bump, validate, commit, tag, push
bun run release 0.1.2 --dry-run
```

`bun run release <version>` bumps every manifest (tauri.conf.json, Cargo.toml, package.json, Cargo.lock), validates that the tag matches the new version, commits, tags and pushes — pushing the tag is what triggers CI to build and publish the installers for all platforms.

## Platform notes

- **Linux + NVIDIA/VM**: WebKitGTK's DMABUF renderer can produce a black window (`Failed to create GBM buffer`). The app sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` at startup on Linux — a pre-set env var always wins if you need to override it.
- **Linux + View Transitions**: WebKitGTK exposes `startViewTransition` but can hang the webview on the forced legacy renderer; transitions are therefore disabled on Linux by design (progressive enhancement, never a hard dependency).
- **Building for all OSes**: Tauri can't cross-compile — Windows and macOS installers are built by GitHub Actions (`.github/workflows/build.yml`, runs on `v*` tags) and attached to a draft release. When bundling the AppImage locally, use `APPIMAGE_EXTRACT_AND_RUN=1 NO_STRIP=true bun run tauri build`.
- Vite dev server uses fixed port 1420 (`strictPort: true`) with HMR on 1421.
