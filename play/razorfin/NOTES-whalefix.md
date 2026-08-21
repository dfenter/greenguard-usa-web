# Whale bulk/head repair

The whale head had two competing silhouettes: a full spine loft and an
independent bulk/head kitbash offset toward `+Z`. The repair makes the whale
body itself front-heavy and smoothly tapered, removes the duplicate whale bulk
box, derives baleen from the committed mouth span, and centers the committed
front head on the spine axis.

The shared bulky-head audit covers `blunt`, `angler`, `whale`, and `kaiju`,
including `whaleshark`, `megalodon`, `gulperfiend`, `maelstrom`, `vortexa`,
`omenmaw`, and `leviathanrex`. It checks +x extent, body/head overlap, axis
alignment, and the whale rear/front/nose profile relationship.

Verification:

```text
node --check shark3d.js
node --import ./tools/reg.mjs tools/selftest.mjs art3d world game fish
```
