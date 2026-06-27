# GreenGuardPortal (greenguard-portal@0.1.0)

This design system is the published greenguard-portal React library, bundled as a single
browser global. All 9 components are the real upstream code.

## Where things are

- `_ds_bundle.js` — the whole-DS bundle at the project root; loads every component to `window.GreenGuardPortal`. First line is a `/* @ds-bundle: … */` metadata header.
- `styles.css` — the single stylesheet entry: it `@import`s the tokens, fonts, and component styles (`_ds_bundle.css`). Link this one file.
- `components/<group>/<Name>/<Name>.prompt.md` (example JSX + variants), `<Name>.d.ts` (types), `<Name>.html` (variant grid).
- `tokens/*.css` — CSS custom properties, names verbatim from upstream.
- `fonts/` — `@font-face` files + `fonts.css` (when the package ships fonts).

For a specific component, `read_file("components/<group>/<Name>/<Name>.prompt.md")`.

## Loading

Add these two lines to your page once (React must be on the page first):

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

Components are then available at `window.GreenGuardPortal.*`. Mount into a dedicated child node (e.g. `<div id="ds-root">`), not the host page's own React root, so the two trees don't collide:

```jsx
const { AdminChat } = window.GreenGuardPortal;
ReactDOM.createRoot(document.getElementById('ds-root')).render(<AdminChat />);
```

## Tokens

28 CSS custom properties from greenguard-portal. Names are
preserved verbatim from upstream. They are declared inside `_ds_bundle.css` (this DS ships one compiled stylesheet rather than separate token files).

- **color** (9): `--bg-deep`, `--bg-card`, `--bg-alt`, …
- **radius** (4): `--radius-sm`, `--radius`, `--radius-lg`, …
- **shadow** (3): `--shadow-sm`, `--shadow-md`, `--shadow-lg`
- **other** (12): `--bg`, `--border`, `--green`, …

## Components

### general
- `AdminChat`
- `AppointmentDetailDock`
- `CustomerChat`
- `CustomerMap`
- `CustomerPanel`
- `PortalLayout`
- `SignaturePad`
- `StopCard`
- `TankCalendar`
