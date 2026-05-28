# dev.twake.ai

Dev environment for Twake / Cozy work, hosted on `athena` and exposed publicly
through `hermes` at `*.dev-twake.maudet.cloud`.

## Layout

- `cozy-stack/` — upstream [cozy/cozy-stack](https://github.com/cozy/cozy-stack)
  clone (separate git repo, ignored here). Patched locally to allow
  `disable_csp: true` in production builds.
- `twake-space-app/` — custom Cozy webapp `twakespace` that embeds the Twake
  Space static demo in an iframe and wraps it with the modern cozy-bar.
- `twake-space-app-build/` — esbuild project that produces `bar.js` + `bar.css`
  (the bundled modern cozy-bar React tree). Output is copied into
  `twake-space-app/`.

## Branches

- `main` — minimal scaffold.
- `feature/twake-space` — full app sources, build harness and helper scripts.
