# Design Sync Notes

## Pre-build step required
This is a Next.js app, not a library. `build-portal-dist.mjs` must run before the converter to produce `dist/portal-entry.js`. The `buildCmd` in config.json handles this.

## JSX in .js files
Components use `.js` extension with JSX syntax. The pre-build uses `loader: { '.js': 'jsx' }` in esbuild to handle this.

## Next.js stubs
`next/link` → stub `<a>` wrapper; `next/router` → mock `useRouter` returning `{ pathname: '/' }`. All other `next/**` → empty stub.

## process.env substitution
Components use `process.env.NEXT_PUBLIC_*` which throw in the browser. The pre-build script defines all referenced vars as `undefined` so the `||` fallbacks in the components kick in cleanly.

## CSS tokens
Color tokens (`--green`, `--gold`, `--text`, etc.) are normally injected at runtime by `_document.js`. Hardcoded into `styles/ds-combined.css` for static previews.

## Fixed-position components
AdminChat, CustomerChat, AppointmentDetailDock, CustomerPanel, AdminBottomDock (in PortalLayout) all use `position: fixed`. These use `cardMode: "single"` overrides. Previews for AppointmentDetailDock and CustomerPanel use `transform: translateZ(0)` + explicit height to contain fixed positioning.

## CustomerMap RENDER_THIN warning
All CustomerMap variants show the same "Map unavailable" placeholder since Google Maps requires a real API key. This is benign — the warning is expected in the preview environment.

## Inter font
Loaded at runtime via Google Fonts `<link>`. Suppressed via `runtimeFontPrefixes: ["Inter"]` in config.
