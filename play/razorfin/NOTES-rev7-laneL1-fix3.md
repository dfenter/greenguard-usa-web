# Rev 7 Lane L1 fix 3 — crescent tail and live motion evidence

## Blocker 1 — rendered crescent tail

`makeSpineGeometry()` now keeps the tail welded to the rear body ring and uses
the terminal cap vertex as the projected center notch. The full notch retreat is
`0.12L` forward of both terminal lobe-tip vertices; the loft's center-facing
transition is held to half that retreat so the indexed side strip stays
monotone and outward-wound. The old rearward center cap was removed, so it can
no longer close the gameplay silhouette into a convex paddle.

Reef art3d probe values:

| Gate | Measured |
|---|---:|
| Tail length / body length | `0.310L` |
| Projected notch forward of upper tip | `0.120000L` |
| Projected notch forward of lower tip | `0.120000L` |
| Minimum projected notch gap | `0.120000L` |
| Estimated gameplay gap at 124px shark length | `11.36 CSS px` |
| Upper/lower lobe ratio | `0.6522` |
| Tail depth | `0.100L` |
| Final-20% lobe taper | `0.30` |
| Pointed cap | `true` |
| Shared welded tail root | `true` |

The misleading `rfTailNotchDepthRatio` sum-of-lobe-heights metric is gone. The
art3d selftest now gates the projected X gap from the actual notch vertex to
both actual lobe-tip vertices at `0.10–0.14L`, plus `>=10 CSS px` at gameplay
scale. The rendered `tail_region.png` thumbnail was inspected at normal and
reduced size: it shows two separated lobe tips with a concave center notch.

## Blocker 2 — valid five-state live-camera capture

Harness: `scratchpad/razorfin/motion_capture.js`. It uses only
`Page.captureScreenshot` through CDP, sets the `844x390` CSS landscape
override before capture, and re-sends `Emulation.setDeviceMetricsOverride`
after every capture. The output is `1688x780` physical pixels (`2x` DPR), with
no portrait rotate guard.

Capture paths:

- `scratchpad/razorfin/motion/motion_idle.png`
- `scratchpad/razorfin/motion/motion_sprint.png`
- `scratchpad/razorfin/motion/motion_turn.png`
- `scratchpad/razorfin/motion/motion_lunge.png`
- `scratchpad/razorfin/motion/motion_jaw-snap.png`
- Tail sample: `scratchpad/razorfin/motion/tail_region.png`
- Numeric audit: `scratchpad/razorfin/motion/motion_measurements.json`

Measured live-camera motion audit:

| Measurement | Result |
|---|---:|
| Rendered body length used for normalization | `94.66 CSS px` |
| Sprint distal upper-tip displacement vs idle | `16.27 CSS px` |
| Sprint distal displacement / body length | `0.1719L` (`0.12–0.18L` pass) |
| Sprint mid-body sample displacement | `1.33 CSS px` |
| Sprint mid-body displacement / body length | `0.0141L` (`<=0.06L` pass) |

Manual frame audit: idle, sprint, turn, lunge, and jaw-snap retain a continuous
tail-root transition without a crease or phase jump; the eye and lower jaw stay
anchored to the head. The lunge scale correction makes the requested `1.11x`
stretch a true total scale rather than adding `1.11` on top of the baseline.

## Verification

- `node --import ./tools/reg.mjs tools/selftest.mjs art3d`: pass; all 61 rigs.
- Full suite `art3d world game fish fx ui meta abilities`: every target passed.
- Tri gate: worst rig `nullfin`, `4174` triangles, under the `4200` ceiling.
- Bend contract: five stable `:rf-bend3` program variants; shared uniforms and
  `buildShark(def) -> { group, parts, animate }` API remain green.
- No git commit made.
