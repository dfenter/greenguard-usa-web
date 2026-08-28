/* Razorfin Rev 9 shark art.
 *
 * The body is deliberately not generated here. It is the artist-made
 * skinned GLB from assets/models; this lane owns loading, safe per-instance
 * cloning, palette/pattern identity, one small head prop, and the engine
 * contract around it.
 */
import * as THREE from 'three';
import { GLTFLoader } from '../_shared/three/GLTFLoader.js';
import { mergeGeometries } from '../_shared/utils/BufferGeometryUtils.js';
import { applyIdentity, retargetIdentityAxes } from './hse/skin_identity.js';
import { mountTexturedFeatures } from './hse/props_textured.js';
import { applyMorph } from './hse/rig_morph.js';
import { buildTexturedFace, checkTexturedFace } from './hse/face_textured.js';
import { ModelBudget, TEXTURED_LRU_CAP } from './hse/model_budget.js';
/* Lane O2 kill switch: see the note at the face mount in buildLoadedRig. */
const RF_O2_TEXTURED_FACE = true;

const host = typeof window !== 'undefined' ? window : globalThis;
const RF = host.RF = host.RF || {};
const MODEL_FILES = Object.freeze({
  sharky: 'sharky.glb', goblinshark: 'goblinshark.glb', anglerfish: 'anglerfish.glb', piranha: 'piranha.glb',
  whale: 'whale.glb', shark: 'shark.glb', shark_c: 'shark_c.glb', hammer_chibi: 'hammer_chibi.glb',
  manta: 'manta.glb', dolphin: 'dolphin.glb', fish_tuna: 'fish_tuna.glb', fish_blue: 'fish_blue.glb',
  fish_clown: 'fish_clown.glb', shark_b: 'shark_b.glb',
  /* Rev 14 textured line. These come out of tools/shark_bake.py: ONE skinned
   * mesh, one PBR material carrying a baked diffuse JPEG plus a tangent-space
   * normal map, and the same bone names the low-poly rig uses (Head/LowerJaw/
   * Neck/Spine1/Spine2/Tail1/Tail2/Tail3).
   * HSE lane O1: every key below was copied into assets/models/ and RENDERED
   * before any row was switched onto it. Five further bakes exist in the bake
   * folder and are deliberately absent because the render rejected them:
   * altimus (a fossil jaw, not a body), bullshark (untextured grey creature),
   * realisticshark (degenerate mesh), tiger_mg (paper-thin, no volume), and
   * hammerhead_approved (a duplicate of scallopedhammer with a bigger map). */
  textured_test: 'textured_test.glb',
  blueshark: 'blueshark.glb',
  bullhead: 'bullhead.glb',
  dogfish: 'dogfish.glb',
  greatwhite_cy: 'greatwhite_cy.glb',
  mako: 'mako_r15.glb', // r15 flat-lum re-bake (NOTES-rev15-bake.md); original mako.glb kept
  megalodonrex: 'megalodonrex.glb',
  scallopedhammer: 'scallopedhammer.glb',
  smoothhammer: 'smoothhammer.glb',
  smoothhound: 'smoothhound.glb',
  thresher: 'thresher.glb',
  tiger_nu: 'tiger_nu_r15.glb', // r15 flat-lum re-bake
  tigershark: 'tigershark.glb',
  whaler: 'whaler.glb',
  whitepointer: 'whitepointer.glb'
});
/* A row opts in through sil.model. Membership here is what switches the
 * material path from the Sharky white-atlas colorizer to the lit PBR path,
 * and what suppresses the toon treatments (relief wobble, pattern blocks)
 * that only make sense over a flat untextured hull. */
const TEXTURED_KEYS = Object.freeze(new Set([
  'textured_test', 'blueshark', 'bullhead', 'dogfish', 'greatwhite_cy', 'mako',
  'megalodonrex', 'scallopedhammer', 'smoothhammer', 'smoothhound', 'thresher',
  'tiger_nu', 'tigershark', 'whaler', 'whitepointer'
]));
const MODEL_KEYS = Object.freeze(Object.keys(MODEL_FILES));
const TAU = Math.PI * 2;
const BASE_LENGTH = 96;
const PATTERN_SUFFIX = ':rf-skin3';
const TEXTURED_SUFFIX = ':rf-tex1';
/* Rev 14 procedural-swim axes, in BONE-LOCAL space for a shark_bake.py rig.
 * See the long note at the rotateOnAxis call in buildLoadedRig: local Z is
 * world up for these bones, so a yaw beat turns about local Z, while a roll
 * about the body's long axis turns about local Y. */
/* Rev 15 lane SWIM: the yaw/roll axes are now MEASURED per bone from its
 * bind-pose world matrix (see buildLoadedRig), because a hard-coded local
 * axis is only right for bakes authored dorsal-on-Y and bent the dorsal-on-Z
 * re-bakes (mako, tiger_nu) vertically. These two remain as the world-space
 * reference directions the per-bone axes are derived from, and as the
 * fallback for any rig whose bind matrix is degenerate. */
const SWIM_YAW_AXIS = Object.freeze(new THREE.Vector3(0, 0, 1));
const SWIM_ROLL_AXIS = Object.freeze(new THREE.Vector3(0, 1, 0));
/* One full travelling wave over roughly one body length (carangiform). */
const SWIM_WAVELENGTH = Math.PI * 1.6;
/* engine3d.js TAIL_AMP_CRUISE. The engine's tailAmp is normalised against
 * this so a cruising shark reproduces the tuned amplitude exactly. */
const TAIL_AMP_REFERENCE = 0.34;
const JAW_REST_GAPE = 0; // r15 GRIN: rest gape now committed by face_textured commitRestGape; +X opens (sign was inverted)
const JAW_MAX_ROTATION = 0.72;
const PATTERN_IDS = Object.freeze({
  plain: 0, stripes: 1, spots: 2, dots: 2, mottled: 2, mirror: 2, boils: 2,
  bands: 3, rings: 3, ribbons: 3, swirls: 3, collar: 3, rays: 3, corona: 3,
  scars: 4, cracks: 4, faults: 4, bones: 4, rot: 4,
  plates: 5, plating: 5, scales: 5, spikes: 5, faults: 4, bones: 4, rivets: 5,
  panels: 5, facets: 5, patches: 2, coral: 5, magma: 4, runes: 4, stars: 2
});

/* Rev 10 variant-art law: props are exceptions, never the identity system.
 * The allowlist is intentionally keyed by definition id, not by a loose
 * head/fx value, so a future row cannot accidentally grow a random horn or
 * lure just because it shares an authored tag. */
const PROP_ALLOWLIST = Object.freeze({
  hammer: new Set(['hammerhead', 'athenajaw']),
  saw: new Set(['sawshark', 'barbhook', 'chimerashark']),
  horns: new Set(['minotaurram']),
  crown: new Set(['coralcrown', 'zeusfin', 'heracrown'])
});
const PROP_ALLOWLIST_IDS = new Set(Object.values(PROP_ALLOWLIST).flatMap((ids) => Array.from(ids)));

/* Rev 7 palette ranges. These are the art resolver's authority; data.js
 * remains the authored source and is never mutated. */
const BODY_FLANK_SATURATION_MAX = 0.96;
const BODY_FLANK_SATURATION_TARGET = 0.90;
const BODY_FLANK_VALUE_MIN = 0.46;
const BODY_FLANK_VALUE_MAX = 0.78;
const ACCENT_SATURATION_MIN = 0.80;
const ACCENT_SATURATION_MAX = 1.00;
const ACCENT_SATURATION_TARGET = 0.96;
const ACCENT_VALUE_MIN = 0.65;
const ACCENT_VALUE_MAX = 0.95;
const BELLY_SATURATION_MIN = 0.10;
const BELLY_SATURATION_MAX = 0.34;
const BELLY_VALUE_MIN = 0.90;
const BELLY_VALUE_MAX = 1.00;
/* Rev 13 color law. The gameplay scene is a cyan wash: HemisphereLight
 * 0x9fd4e8 sky over 0x06121e ground, FogExp2 in the same 0x9fd4e8, and
 * ACES filmic tone mapping. ACES compresses saturated primaries hard and
 * the cyan fill drags every hue toward 0.53, which is exactly why the
 * pre-Rev-13 roster measured 11 of 12 flanks inside h 0.51-0.58 at mean
 * flank S 0.295. These are pre-compensation gains applied in the shader
 * AFTER the palette region mix, so authored hue identity survives to the
 * pixel instead of being averaged into the water. */
const SCENE_SATURATION_GAIN = 1.34;
const SCENE_COUNTERSHADE_GAIN = 1.30;
const PATTERN_CONTRAST_FLOOR = 0.95;
const PANTHEON_PALETTE_FAMILIES = Object.freeze({
  zeusfin: { baseHue: 0.61, accentHue: 0.14, baseV: 0.62, accentV: 0.98 },
  poseidonrex: { baseHue: 0.61, accentHue: 0.64, baseV: 0.56, accentV: 0.92 },
  hadesmaw: { baseHue: 0.85, accentHue: 0.93, baseV: 0.60, accentV: 0.96 },
  apollodon: { baseHue: 0.14, accentHue: 0.11, baseV: 0.73, accentV: 0.95 },
  artemisstrike: { baseHue: 0.68, accentHue: 0.70, baseV: 0.68, accentV: 0.94 },
  athenajaw: { baseHue: 0.08, accentHue: 0.06, baseV: 0.58, accentV: 0.91 },
  aresrender: { baseHue: 0.005, accentHue: 0.99, baseV: 0.62, accentV: 0.93 },
  hermesdart: { baseHue: 0.56, accentHue: 0.13, baseV: 0.76, accentV: 0.95 },
  hephaestusforge: { baseHue: 0.075, accentHue: 0.045, baseV: 0.67, accentV: 0.94 },
  dionysustide: { baseHue: 0.91, accentHue: 0.88, baseV: 0.64, accentV: 0.95 },
  aphroditelure: { baseHue: 0.96, accentHue: 0.98, baseV: 0.77, accentV: 0.95 },
  heracrown: { baseHue: 0.105, accentHue: 0.095, baseV: 0.70, accentV: 0.95 },
  typhonmaw: { baseHue: 0.78, accentHue: 0.30, baseV: 0.40, accentV: 0.97 },
  hydrafang: { baseHue: 0.25, accentHue: 0.20, baseV: 0.40, accentV: 0.90 },
  cerberusjaw: { baseHue: 0.015, accentHue: 0.045, baseV: 0.38, accentV: 0.94 },
  chimerashark: { baseHue: 0.58, accentHue: 0.03, baseV: 0.44, accentV: 0.92 },
  medusagaze: { baseHue: 0.84, accentHue: 0.91, baseV: 0.39, accentV: 0.94 },
  scyllarender: { baseHue: 0.48, accentHue: 0.53, baseV: 0.36, accentV: 0.90 },
  charybdisvoid: { baseHue: 0.70, accentHue: 0.76, baseV: 0.34, accentV: 0.88 },
  minotaurram: { baseHue: 0.60, accentHue: 0.16, baseV: 0.43, accentV: 0.90 },
  cyclopseye: { baseHue: 0.93, accentHue: 0.96, baseV: 0.41, accentV: 0.95 },
  harpyshade: { baseHue: 0.78, accentHue: 0.86, baseV: 0.35, accentV: 0.89 },
  lamiacoil: { baseHue: 0.96, accentHue: 0.91, baseV: 0.37, accentV: 0.93 },
  kampechrono: { baseHue: 0.09, accentHue: 0.54, baseV: 0.42, accentV: 0.91 }
});
const UNDERWORLD_IDS = new Set([
  'typhonmaw', 'hydrafang', 'cerberusjaw', 'chimerashark', 'medusagaze', 'scyllarender',
  'charybdisvoid', 'minotaurram', 'cyclopseye', 'harpyshade', 'lamiacoil', 'kampechrono'
]);
/* The 9.6 showcase rows are judged against the HSE palette reads, not the
 * low-contrast roster swatches. These are linear-space HSV targets consumed
 * by the same atlas colorizer as every other definition. */
const STYLE_PALETTE_OVERRIDES = Object.freeze({
  /* Rev 13: the starter roster all sat inside h 0.56-0.59, which is the
   * water's own hue, so reef/hammerhead/whaleshark/megalodon measured a
   * pairwise separation of 0.03-0.06. Fan the base hues out across the
   * wheel and raise saturation so each row owns a distinct hero color. */
  reef:       { base: [0.52, 0.80, 0.56], belly: [0.14, 0.22, 0.98], accent: [0.09, 0.95, 0.90] },
  tiger:      { base: [0.105, 0.88, 0.60], belly: [0.12, 0.26, 0.97], accent: [0.05, 0.98, 0.86] },
  hammerhead: { base: [0.66, 0.72, 0.52], belly: [0.60, 0.16, 0.98], accent: [0.55, 0.92, 0.88] },
  greatwhite: { base: [0.60, 0.34, 0.50], belly: [0.58, 0.06, 1.00], accent: [0.56, 0.70, 0.92] },
  whaleshark: { base: [0.72, 0.66, 0.46], belly: [0.70, 0.14, 0.96], accent: [0.48, 0.90, 0.92] },
  megalodon:  { base: [0.975, 0.72, 0.40], belly: [0.99, 0.16, 0.94], accent: [0.94, 0.98, 0.80] },
  solaris:    { base: [0.055, 0.96, 0.60], belly: [0.13, 0.42, 1.00], accent: [0.02, 1.00, 0.92] },
  /* Rev 11 close-pair palette anchors: the silhouette changes are the
   * primary read, while these restrained family shifts keep the distinctions
   * legible under the blue gameplay light. */
  gloomtide: { base: [0.73, 0.66, 0.48], belly: [0.72, 0.14, 0.92], accent: [0.84, 0.92, 0.88] },
  morayne: { base: [0.27, 0.62, 0.58], belly: [0.26, 0.16, 0.94], accent: [0.16, 0.88, 0.86] },
  teslafang: { base: [0.97, 0.70, 0.58], belly: [0.98, 0.14, 0.94], accent: [0.06, 0.92, 0.92] },
  voltaicrex: { base: [0.55, 0.62, 0.56], belly: [0.55, 0.12, 0.94], accent: [0.13, 0.92, 0.92] },
  kampechrono: { base: [0.09, 0.54, 0.62], belly: [0.08, 0.15, 0.94], accent: [0.14, 0.92, 0.92] },
  scyllarender: { base: [0.49, 0.48, 0.54], belly: [0.50, 0.12, 0.94], accent: [0.57, 0.92, 0.88] }
});

/* Sharkjira is intentionally allowed to keep the authored charcoal value.
 * The ordinary roster resolver raises low-value swatches for shallow-water
 * readability; that would erase the charcoal/atomic contrast this row needs. */
const SHARKJIRA_ID = 'leviathanrex';
const SHARKJIRA_PALETTE = Object.freeze({
  /* Rev 13: these are sRGB hex, and THREE converts them to linear on
   * construction, so the old 0x1b1f22 landed at linear v 0.02 and rendered
   * as a silhouette-only blob. These values are solved so the LINEAR base
   * sits near v 0.30 and the belly near v 0.62: still unmistakably charcoal,
   * but with enough body value for the plates, gills and atomic blue to
   * read against the water. */
  base: 0x888f95, belly: 0xbfc8ce, accent: 0x3fd6ff, glow: 0x3fd6ff
});
const SHARKJIRA_PULSE = { value: 0.86 };
/* The Sharky bind pose runs nose -> tail as local-y 0 -> 1. Keep the
 * showpiece crest on the Neck-to-Tail3 span; the previous rear-biased
 * stations made the row read as a bull shark with tail spikes. */
const SHARKJIRA_PLATE_STATIONS = Object.freeze([0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.77, 0.84]);
const SHARKJIRA_PLATE_HEIGHTS = Object.freeze([0.14, 0.20, 0.27, 0.32, 0.32, 0.27, 0.20, 0.13]);

/* Leviathan Rex is the second kaiju and must not read as a recolored
 * Sharkjira at 64x30. Where Sharkjira is a charcoal row of tall jagged
 * single maple plates with an atomic-blue spine, the Rex is a deep sea-green
 * armored king: a broad flat crown over the brow, TWO parallel rows of low
 * interlocking back scutes, an underslung jaw with oversized tusks, armored
 * cheek plates, and a pale seafoam glow that lives only in the throat and in
 * the seams between scutes. Its plates are deliberately shorter and denser
 * than Sharkjira's so the two silhouettes never converge. */
const LEVIATHAN_ID = 'leviathan_rex';
const LEVIATHAN_PALETTE = Object.freeze({
  base: 0x2e3d38, belly: 0xb8cdc4, accent: 0x1a2622, glow: 0x9ff7f0
});
/* Rev 13 rework: the Rex rendered as a pale translucent ghost. Nothing was
 * transparent (measured flank background-bleed was 0.000); the failure was
 * VALUE, not alpha. `leviathan_rex` fell through to the generic roster
 * resolver, whose BODY_FLANK_VALUE_MIN floor exists to rescue washed-out
 * authored rows. That floor dragged the authored deep sea-green base from
 * v 0.239 up to v 0.460 and pinned its hue at 0.444, which after the 0.62
 * back darkening and the 1.34 scene saturation gain landed the flank at
 * v 0.628 / hue 0.496 against a water background of hue ~0.49. Same hue as
 * the sea, brighter than a great white's flank: that is the ghost.
 *
 * Sharkjira already carries an explicit exemption from that resolver for
 * exactly this reason. The Rex gets the same, with values SOLVED rather
 * than authored raw: the raw 0x2e3d38 at v 0.239 would swing to the other
 * failure mode (the charcoal-blob bug this file's Sharkjira comment
 * records). These sit the LINEAR back near v 0.20 and the belly near v
 * 0.72, so the hull is unmistakably a dark armored green with a bright
 * belly, and the seafoam stays a seam accent instead of a body wash. */
const LEVIATHAN_RENDER_PALETTE = Object.freeze({
  base: 0x557f6d, belly: 0x9fc3b4, accent: 0x1a2622, glow: 0x9ff7f0
});
const LEVIATHAN_PULSE = { value: 0.70 };
/* Twelve stations, two rows: low, wide, interlocking, and running further
 * forward onto the neck than Sharkjira's crest so the armored-back read
 * starts right behind the crown. */
const LEVIATHAN_SCUTE_STATIONS = Object.freeze([0.16, 0.24, 0.32, 0.40, 0.48, 0.56, 0.64, 0.72, 0.79, 0.85]);
const LEVIATHAN_SCUTE_HEIGHTS = Object.freeze([0.075, 0.100, 0.120, 0.132, 0.136, 0.130, 0.115, 0.096, 0.076, 0.058]);
/* Lateral offset of each scute row from the dorsal midline, as a fraction of
 * the body half-width. A true double row is the primary silhouette tell. */
const LEVIATHAN_SCUTE_ROW_OFFSET = 0.46;

/* Rev 11 personality briefs. Every row owns a silhouette decision, a bind-
 * pose sculpt, a face attitude, a surface treatment, and one clean signature
 * read. The numeric fields are deliberately small: they are multipliers and
 * displacements layered over the approved Rev 10 proportions, not a second
 * base model. `reef` is the approved Sharky reference and therefore stays
 * exactly neutral in all geometry-facing fields. */
function personality(brief, bulk, sculpt, face, surface, signature) {
  return Object.freeze({
    brief, bulk: Object.freeze(bulk), sculpt: Object.freeze(sculpt),
    face: Object.freeze(face), surface: Object.freeze(surface), signature
  });
}
const PERSONALITY_TABLE = Object.freeze({
  reef: personality('quick small nimble reef scout',
    { head: 1.00, neck: 1.00, chest: 1.00, tail: 1.00, fin: 1.00 },
    { head: 0.00, neck: 0.00, chest: 0.00, tail: 0.00, jaw: 0.00, underbite: 0.00, brow: 0.00, dorsal: 0.00, hump: 0.00, sag: 0.00, muscle: 0.00 },
    { eye: 1.00, brow: 0.00, pupil: 1.00, gape: 0.00, tilt: 0.00 },
    { relief: 0.02, density: 1.00, scars: 0.00, plates: 0.00, mode: 0 }, 'clean starter silhouette'),
  epaulette: personality('shallows crawler, low belly, bright alert eyes',
    { head: 0.95, neck: 0.94, chest: 0.90, tail: 1.04, fin: 1.00 },
    { head: -0.04, neck: -0.03, chest: -0.08, tail: 0.04, jaw: -0.02, underbite: 0.00, brow: 0.18, dorsal: 0.02, hump: -0.02, sag: 0.04, muscle: 0.10 },
    { eye: 1.12, brow: 0.25, pupil: 1.10, gape: -0.01, tilt: 0.12 },
    { relief: 0.07, density: 1.45, scars: 0.00, plates: 0.00, mode: 1 }, 'walking-paw fin read'),
  cookiecutter: personality('small round biter with absurd confidence',
    { head: 1.00, neck: 1.05, chest: 0.94, tail: 1.10, fin: 0.90 },
    { head: 0.05, neck: 0.04, chest: -0.05, tail: 0.08, jaw: 0.12, underbite: 0.14, brow: 0.34, dorsal: 0.01, hump: 0.00, sag: 0.02, muscle: 0.16 },
    { eye: 1.08, brow: 0.46, pupil: 1.24, gape: 0.04, tilt: 0.30 },
    { relief: 0.12, density: 1.80, scars: 0.16, plates: 0.00, mode: 2 }, 'circular bite collar'),
  mako: personality('racing torpedo, long slim flank, sharp snout',
    { head: 0.92, neck: 0.90, chest: 0.82, tail: 1.16, fin: 0.92 },
    { head: -0.06, neck: -0.10, chest: -0.14, tail: 0.16, jaw: 0.02, underbite: -0.01, brow: 0.28, dorsal: 0.04, hump: -0.02, sag: -0.03, muscle: 0.25 },
    { eye: 0.84, brow: 0.45, pupil: 0.82, gape: -0.02, tilt: 0.18 },
    { relief: 0.05, density: 2.10, scars: 0.00, plates: 0.00, mode: 1 }, 'razor dorsal and racing flank'),
  blue: personality('elegant long-distance sprinter, cool and watchful',
    { head: 0.94, neck: 0.88, chest: 0.78, tail: 1.21, fin: 0.96 },
    { head: -0.03, neck: -0.08, chest: -0.16, tail: 0.20, jaw: 0.00, underbite: -0.02, brow: 0.12, dorsal: 0.03, hump: -0.03, sag: -0.02, muscle: 0.18 },
    { eye: 0.90, brow: 0.12, pupil: 0.88, gape: -0.03, tilt: 0.04 },
    { relief: 0.04, density: 1.65, scars: 0.00, plates: 0.00, mode: 0 }, 'needle tail and glassy eye'),
  hammerhead: personality('broad-headed sweep hunter, focused and fearless',
    { head: 1.24, neck: 1.08, chest: 1.04, tail: 0.96, fin: 1.12 },
    { head: 0.12, neck: 0.10, chest: 0.08, tail: -0.02, jaw: 0.04, underbite: 0.02, brow: 0.40, dorsal: 0.18, hump: 0.08, sag: 0.02, muscle: 0.22 },
    { eye: 1.20, brow: -0.15, pupil: 1.35, gape: 0.02, tilt: -0.20 },
    { relief: 0.10, density: 1.20, scars: 0.00, plates: 0.02, mode: 3 }, 'cephalofoil silhouette'),
  thresher: personality('lean hunter with a whip tail and patient stare',
    { head: 0.94, neck: 0.91, chest: 0.78, tail: 1.30, fin: 1.02 },
    { head: -0.04, neck: -0.08, chest: -0.14, tail: 0.26, jaw: 0.00, underbite: -0.01, brow: 0.20, dorsal: 0.05, hump: -0.03, sag: -0.04, muscle: 0.20 },
    { eye: 0.88, brow: 0.30, pupil: 0.95, gape: -0.01, tilt: 0.14 },
    { relief: 0.06, density: 1.30, scars: 0.00, plates: 0.00, mode: 1 }, 'oversized whip tail'),
  sawshark: personality('compact blade-nose ambusher, eyes narrowed',
    { head: 1.12, neck: 1.06, chest: 0.90, tail: 1.08, fin: 0.95 },
    { head: 0.08, neck: 0.04, chest: -0.04, tail: 0.06, jaw: 0.04, underbite: 0.09, brow: 0.48, dorsal: 0.04, hump: 0.02, sag: 0.00, muscle: 0.18 },
    { eye: 0.94, brow: -0.36, pupil: 1.16, gape: 0.01, tilt: -0.22 },
    { relief: 0.11, density: 1.55, scars: 0.08, plates: 0.00, mode: 2 }, 'clean saw rostrum'),
  tiger: personality('stocky striped bruiser with a low brow',
    { head: 1.10, neck: 1.13, chest: 1.20, tail: 0.90, fin: 1.10 },
    { head: 0.08, neck: 0.12, chest: 0.20, tail: -0.08, jaw: 0.06, underbite: 0.04, brow: -0.25, dorsal: 0.12, hump: 0.10, sag: 0.08, muscle: 0.28 },
    { eye: 1.05, brow: -0.42, pupil: 0.90, gape: 0.05, tilt: -0.30 },
    { relief: 0.14, density: 1.20, scars: 0.08, plates: 0.04, mode: 2 }, 'vertical tiger bars'),
  bull: personality('short thick brawler, heavy brow, underbite',
    { head: 1.14, neck: 1.18, chest: 1.26, tail: 0.86, fin: 1.02 },
    { head: 0.13, neck: 0.18, chest: 0.24, tail: -0.10, jaw: 0.12, underbite: 0.18, brow: -0.42, dorsal: 0.10, hump: 0.14, sag: 0.08, muscle: 0.30 },
    { eye: 0.92, brow: -0.58, pupil: 1.18, gape: 0.07, tilt: -0.38 },
    { relief: 0.13, density: 1.00, scars: 0.10, plates: 0.02, mode: 3 }, 'knuckle-heavy chest'),
  goblin: personality('long blade snout, protruding jaw, nervous eyes',
    { head: 1.12, neck: 0.92, chest: 0.86, tail: 1.18, fin: 0.90 },
    { head: 0.10, neck: -0.05, chest: -0.10, tail: 0.18, jaw: 0.24, underbite: 0.28, brow: -0.36, dorsal: 0.03, hump: -0.02, sag: -0.02, muscle: 0.06 },
    { eye: 0.78, brow: -0.18, pupil: 1.42, gape: 0.08, tilt: -0.08 },
    { relief: 0.09, density: 1.40, scars: 0.22, plates: 0.00, mode: 2 }, 'projecting jaw'),
  greatwhite: personality('massive chest, clean apex wedge, confident face',
    { head: 1.18, neck: 1.16, chest: 1.20, tail: 0.92, fin: 1.10 },
    { head: 0.16, neck: 0.14, chest: 0.22, tail: -0.04, jaw: 0.10, underbite: 0.05, brow: 0.10, dorsal: 0.16, hump: 0.18, sag: 0.06, muscle: 0.26 },
    { eye: 1.02, brow: -0.18, pupil: 1.06, gape: 0.05, tilt: -0.12 },
    { relief: 0.08, density: 1.05, scars: 0.02, plates: 0.00, mode: 0 }, 'high dorsal and white belly'),
  whaleshark: personality('gentle giant, hangar mouth, soft sleepy eye',
    { head: 1.28, neck: 1.18, chest: 1.30, tail: 0.84, fin: 1.08 },
    { head: 0.22, neck: 0.16, chest: 0.28, tail: -0.10, jaw: 0.16, underbite: 0.04, brow: 0.04, dorsal: 0.16, hump: 0.22, sag: 0.14, muscle: 0.08 },
    { eye: 1.28, brow: 0.12, pupil: 0.94, gape: 0.10, tilt: 0.02 },
    { relief: 0.10, density: 1.70, scars: 0.00, plates: 0.00, mode: 1 }, 'polka-dot hangar jaw'),
  megalodon: personality('monster bulk, scarred hide, massive jaw',
    { head: 1.28, neck: 1.20, chest: 1.34, tail: 0.82, fin: 1.12 },
    { head: 0.24, neck: 0.20, chest: 0.30, tail: -0.12, jaw: 0.24, underbite: 0.10, brow: -0.22, dorsal: 0.20, hump: 0.22, sag: 0.10, muscle: 0.34 },
    { eye: 0.86, brow: -0.62, pupil: 1.28, gape: 0.12, tilt: -0.40 },
    { relief: 0.20, density: 0.90, scars: 0.42, plates: 0.08, mode: 2 }, 'three long cheek scars'),
  dunkleosteus: personality('ancient armored tank, blunt plated skull',
    { head: 1.28, neck: 1.22, chest: 1.26, tail: 0.86, fin: 0.96 },
    { head: 0.22, neck: 0.20, chest: 0.24, tail: -0.08, jaw: 0.16, underbite: 0.12, brow: -0.30, dorsal: 0.22, hump: 0.16, sag: 0.08, muscle: 0.22 },
    { eye: 0.78, brow: -0.54, pupil: 1.20, gape: 0.09, tilt: -0.32 },
    { relief: 0.26, density: 0.78, scars: 0.10, plates: 0.48, mode: 3 }, 'bone-plate cheek shield'),
  greenland: personality('ancient slow tank, sagging bulk, cloudy eye, mottled',
    { head: 1.18, neck: 1.12, chest: 1.20, tail: 0.88, fin: 0.88 },
    { head: 0.12, neck: 0.10, chest: 0.22, tail: -0.08, jaw: 0.08, underbite: 0.04, brow: -0.40, dorsal: 0.04, hump: 0.04, sag: 0.20, muscle: -0.06 },
    { eye: 0.70, brow: -0.48, pupil: 0.72, gape: 0.04, tilt: -0.26 },
    { relief: 0.16, density: 0.65, scars: 0.18, plates: 0.00, mode: 2 }, 'drooping aged silhouette'),
  snapjaw: personality('crocodile-short brawler with a clamped underbite',
    { head: 1.20, neck: 1.16, chest: 1.18, tail: 0.90, fin: 1.04 },
    { head: 0.16, neck: 0.16, chest: 0.18, tail: -0.04, jaw: 0.20, underbite: 0.22, brow: -0.44, dorsal: 0.10, hump: 0.10, sag: 0.04, muscle: 0.26 },
    { eye: 0.86, brow: -0.66, pupil: 1.24, gape: 0.09, tilt: -0.44 },
    { relief: 0.22, density: 1.80, scars: 0.12, plates: 0.10, mode: 3 }, 'croc jaw block'),
  gulperfiend: personality('deepwater balloon body, tiny eye, eager gape',
    { head: 1.04, neck: 1.08, chest: 1.28, tail: 0.90, fin: 0.92 },
    { head: 0.10, neck: 0.18, chest: 0.30, tail: -0.06, jaw: 0.26, underbite: 0.06, brow: 0.20, dorsal: 0.02, hump: 0.22, sag: 0.18, muscle: 0.04 },
    { eye: 0.62, brow: 0.18, pupil: 1.38, gape: 0.13, tilt: 0.26 },
    { relief: 0.14, density: 0.80, scars: 0.08, plates: 0.00, mode: 2 }, 'stretchable gulper pouch'),
  anglerfang: personality('small angler with a forward lunge and sharp chin',
    { head: 1.10, neck: 1.00, chest: 1.00, tail: 1.02, fin: 1.00 },
    { head: 0.14, neck: 0.02, chest: 0.04, tail: 0.04, jaw: 0.18, underbite: 0.16, brow: -0.10, dorsal: 0.08, hump: 0.02, sag: 0.02, muscle: 0.12 },
    { eye: 0.76, brow: -0.30, pupil: 1.30, gape: 0.09, tilt: -0.22 },
    { relief: 0.12, density: 1.30, scars: 0.10, plates: 0.00, mode: 2 }, 'single lure focus'),
  morayne: personality('bus-sized eel, ribbon body, lazy predatory eye',
    { head: 0.96, neck: 0.88, chest: 0.76, tail: 1.24, fin: 0.84 },
    { head: -0.02, neck: -0.10, chest: -0.16, tail: 0.22, jaw: 0.08, underbite: 0.08, brow: -0.14, dorsal: -0.02, hump: -0.04, sag: 0.00, muscle: 0.16 },
    { eye: 0.88, brow: -0.26, pupil: 1.14, gape: 0.05, tilt: -0.16 },
    { relief: 0.08, density: 2.20, scars: 0.04, plates: 0.00, mode: 1 }, 'ribbon tail coil'),
  sailfin: personality('needle-fast sprinter with a banner dorsal fin',
    { head: 0.94, neck: 0.90, chest: 0.82, tail: 1.18, fin: 1.24 },
    { head: -0.04, neck: -0.08, chest: -0.12, tail: 0.18, jaw: 0.00, underbite: -0.02, brow: 0.26, dorsal: 0.28, hump: -0.02, sag: -0.03, muscle: 0.22 },
    { eye: 0.82, brow: 0.40, pupil: 0.86, gape: -0.02, tilt: 0.24 },
    { relief: 0.06, density: 1.40, scars: 0.00, plates: 0.00, mode: 1 }, 'sail-like fin rays'),
  thornback: personality('rock-backed bruiser whose fins stay sharp',
    { head: 1.14, neck: 1.10, chest: 1.12, tail: 0.94, fin: 1.12 },
    { head: 0.10, neck: 0.12, chest: 0.16, tail: -0.02, jaw: 0.08, underbite: 0.08, brow: -0.12, dorsal: 0.24, hump: 0.16, sag: 0.06, muscle: 0.24 },
    { eye: 0.86, brow: -0.34, pupil: 1.08, gape: 0.04, tilt: -0.18 },
    { relief: 0.24, density: 1.20, scars: 0.18, plates: 0.22, mode: 3 }, 'thorn ridge'),
  stonejaw: personality('reef boulder that learned to bite',
    { head: 1.18, neck: 1.16, chest: 1.22, tail: 0.88, fin: 1.02 },
    { head: 0.18, neck: 0.18, chest: 0.22, tail: -0.08, jaw: 0.18, underbite: 0.18, brow: -0.52, dorsal: 0.16, hump: 0.22, sag: 0.10, muscle: 0.20 },
    { eye: 0.74, brow: -0.72, pupil: 1.22, gape: 0.09, tilt: -0.50 },
    { relief: 0.30, density: 0.72, scars: 0.28, plates: 0.30, mode: 3 }, 'stone brow and jaw'),
  duskfin: personality('low-profile dusk hunter, narrow body and sly eyes',
    { head: 0.96, neck: 0.94, chest: 0.88, tail: 1.12, fin: 0.94 },
    { head: -0.04, neck: -0.05, chest: -0.10, tail: 0.10, jaw: 0.03, underbite: 0.01, brow: 0.34, dorsal: 0.02, hump: -0.02, sag: 0.00, muscle: 0.14 },
    { eye: 0.82, brow: 0.52, pupil: 1.18, gape: 0.01, tilt: 0.32 },
    { relief: 0.07, density: 1.10, scars: 0.06, plates: 0.00, mode: 2 }, 'shadowed eye line'),
  barbhook: personality('barbed harpoon snout, rigid neck, trapper stare',
    { head: 1.12, neck: 1.10, chest: 0.96, tail: 1.06, fin: 0.98 },
    { head: 0.10, neck: 0.08, chest: 0.00, tail: 0.04, jaw: 0.10, underbite: 0.18, brow: -0.34, dorsal: 0.08, hump: 0.04, sag: 0.00, muscle: 0.20 },
    { eye: 0.80, brow: -0.46, pupil: 1.26, gape: 0.05, tilt: -0.34 },
    { relief: 0.15, density: 1.55, scars: 0.12, plates: 0.00, mode: 2 }, 'barbed saw rostrum'),
  coralcrown: personality('living reef carrier, thick shoulders, proud chin',
    { head: 1.12, neck: 1.14, chest: 1.16, tail: 0.92, fin: 1.08 },
    { head: 0.12, neck: 0.18, chest: 0.18, tail: -0.02, jaw: 0.10, underbite: 0.08, brow: 0.28, dorsal: 0.16, hump: 0.16, sag: 0.06, muscle: 0.18 },
    { eye: 1.10, brow: 0.32, pupil: 1.08, gape: 0.05, tilt: 0.28 },
    { relief: 0.28, density: 1.30, scars: 0.04, plates: 0.36, mode: 3 }, 'coral crown contact prop'),
  vex: personality('warped void swimmer, narrow middle and sideways gaze',
    { head: 1.04, neck: 0.96, chest: 0.92, tail: 1.10, fin: 0.98 },
    { head: 0.02, neck: -0.04, chest: -0.06, tail: 0.12, jaw: 0.08, underbite: 0.04, brow: 0.52, dorsal: 0.08, hump: -0.02, sag: 0.00, muscle: 0.12 },
    { eye: 0.76, brow: 0.68, pupil: 1.34, gape: 0.04, tilt: 0.52 },
    { relief: 0.10, density: 1.00, scars: 0.24, plates: 0.00, mode: 4 }, 'asymmetric void brow'),
  abyssmaw: personality('deep returned thing, oversized throat and hungry eye',
    { head: 1.16, neck: 1.12, chest: 1.20, tail: 0.88, fin: 0.96 },
    { head: 0.18, neck: 0.22, chest: 0.24, tail: -0.06, jaw: 0.24, underbite: 0.10, brow: -0.06, dorsal: 0.04, hump: 0.18, sag: 0.12, muscle: 0.10 },
    { eye: 0.68, brow: -0.18, pupil: 1.38, gape: 0.12, tilt: -0.06 },
    { relief: 0.18, density: 0.90, scars: 0.18, plates: 0.04, mode: 2 }, 'dark gulper throat'),
  riftjaw: personality('lunge-built wedge, split-second eyes, lean chest',
    { head: 1.10, neck: 1.02, chest: 0.92, tail: 1.12, fin: 1.00 },
    { head: 0.12, neck: 0.02, chest: -0.08, tail: 0.12, jaw: 0.18, underbite: 0.12, brow: 0.44, dorsal: 0.08, hump: 0.00, sag: -0.02, muscle: 0.20 },
    { eye: 0.86, brow: 0.52, pupil: 1.22, gape: 0.07, tilt: 0.36 },
    { relief: 0.11, density: 1.45, scars: 0.10, plates: 0.00, mode: 4 }, 'split jaw plane'),
  venomspine: personality('slender venom carrier, lifted back and cruel grin',
    { head: 1.04, neck: 1.00, chest: 0.90, tail: 1.14, fin: 1.06 },
    { head: 0.04, neck: 0.02, chest: -0.10, tail: 0.14, jaw: 0.06, underbite: 0.05, brow: -0.18, dorsal: 0.24, hump: 0.02, sag: -0.03, muscle: 0.18 },
    { eye: 0.82, brow: -0.30, pupil: 1.20, gape: 0.04, tilt: -0.20 },
    { relief: 0.22, density: 1.70, scars: 0.18, plates: 0.14, mode: 3 }, 'raised venom spines'),
  howler: personality('big-mouthed blunt caller, chest like a speaker cone',
    { head: 1.14, neck: 1.10, chest: 1.16, tail: 0.94, fin: 1.04 },
    { head: 0.12, neck: 0.16, chest: 0.20, tail: -0.02, jaw: 0.22, underbite: 0.10, brow: -0.12, dorsal: 0.10, hump: 0.12, sag: 0.06, muscle: 0.22 },
    { eye: 0.92, brow: -0.24, pupil: 1.18, gape: 0.11, tilt: -0.18 },
    { relief: 0.12, density: 1.10, scars: 0.08, plates: 0.00, mode: 2 }, 'throat-rattle chest'),
  magmaw: personality('hot rock maw, square skull and heavy shoulders',
    { head: 1.20, neck: 1.18, chest: 1.20, tail: 0.90, fin: 1.06 },
    { head: 0.18, neck: 0.20, chest: 0.22, tail: -0.06, jaw: 0.18, underbite: 0.14, brow: -0.34, dorsal: 0.18, hump: 0.18, sag: 0.08, muscle: 0.26 },
    { eye: 0.84, brow: -0.44, pupil: 1.28, gape: 0.10, tilt: -0.28 },
    { relief: 0.24, density: 0.90, scars: 0.24, plates: 0.18, mode: 4 }, 'lava fissure brow'),
  frostjaw: personality('cold stocky hunter, compressed snout and fixed stare',
    { head: 1.14, neck: 1.12, chest: 1.14, tail: 0.92, fin: 1.02 },
    { head: 0.12, neck: 0.14, chest: 0.16, tail: -0.04, jaw: 0.12, underbite: 0.06, brow: -0.48, dorsal: 0.12, hump: 0.10, sag: 0.04, muscle: 0.20 },
    { eye: 0.80, brow: -0.58, pupil: 1.12, gape: 0.07, tilt: -0.40 },
    { relief: 0.18, density: 1.15, scars: 0.02, plates: 0.12, mode: 3 }, 'ice wedge snout'),
  stormfin: personality('thunderhead sprinter, electric dorsal and alert face',
    { head: 1.02, neck: 0.98, chest: 0.92, tail: 1.10, fin: 1.16 },
    { head: 0.02, neck: 0.00, chest: -0.06, tail: 0.12, jaw: 0.02, underbite: 0.00, brow: 0.36, dorsal: 0.26, hump: 0.02, sag: -0.02, muscle: 0.22 },
    { eye: 0.92, brow: 0.46, pupil: 0.92, gape: 0.00, tilt: 0.34 },
    { relief: 0.18, density: 1.60, scars: 0.06, plates: 0.08, mode: 4 }, 'forked storm fin'),
  gloomtide: personality('long drifting eel, soft belly, magnet-eyed ambush',
    { head: 0.88, neck: 0.78, chest: 0.64, tail: 1.34, fin: 0.76 },
    { head: -0.10, neck: -0.16, chest: -0.24, tail: 0.32, jaw: 0.16, underbite: 0.10, brow: -0.54, dorsal: -0.08, hump: -0.06, sag: 0.06, muscle: 0.14 },
    { eye: 0.68, brow: -0.58, pupil: 1.42, gape: 0.07, tilt: -0.42 },
    { relief: 0.10, density: 1.80, scars: 0.12, plates: 0.00, mode: 4 }, 'magnetic eye dots'),
  wreckfang: personality('salvage-eater, iron shoulders, square mechanical jaw',
    { head: 1.16, neck: 1.14, chest: 1.18, tail: 0.90, fin: 1.04 },
    { head: 0.14, neck: 0.18, chest: 0.20, tail: -0.04, jaw: 0.16, underbite: 0.12, brow: -0.28, dorsal: 0.14, hump: 0.14, sag: 0.06, muscle: 0.24 },
    { eye: 0.78, brow: -0.42, pupil: 1.24, gape: 0.08, tilt: -0.26 },
    { relief: 0.30, density: 0.72, scars: 0.12, plates: 0.34, mode: 3 }, 'riveted shoulder plates'),
  ironfin: personality('purpose-built steel shark, narrow nose, rigid spine',
    { head: 1.08, neck: 1.10, chest: 1.08, tail: 0.96, fin: 1.12 },
    { head: 0.08, neck: 0.10, chest: 0.10, tail: 0.00, jaw: 0.10, underbite: 0.06, brow: -0.08, dorsal: 0.20, hump: 0.08, sag: 0.02, muscle: 0.18 },
    { eye: 0.76, brow: -0.18, pupil: 1.10, gape: 0.04, tilt: -0.08 },
    { relief: 0.32, density: 0.80, scars: 0.08, plates: 0.42, mode: 3 }, 'panel-line back'),
  cindermaw: personality('heat-scarred open-water striker, lean with a hard jaw',
    { head: 1.10, neck: 1.06, chest: 1.02, tail: 1.04, fin: 1.02 },
    { head: 0.10, neck: 0.06, chest: 0.02, tail: 0.08, jaw: 0.18, underbite: 0.10, brow: -0.22, dorsal: 0.14, hump: 0.04, sag: 0.00, muscle: 0.24 },
    { eye: 0.82, brow: -0.36, pupil: 1.22, gape: 0.08, tilt: -0.22 },
    { relief: 0.22, density: 1.05, scars: 0.28, plates: 0.04, mode: 4 }, 'cinder cheek cracks'),
  glacier: personality('drifting ice age, wide forehead, heavy calm body',
    { head: 1.18, neck: 1.16, chest: 1.22, tail: 0.88, fin: 1.04 },
    { head: 0.20, neck: 0.18, chest: 0.24, tail: -0.08, jaw: 0.10, underbite: 0.04, brow: 0.12, dorsal: 0.14, hump: 0.22, sag: 0.10, muscle: 0.12 },
    { eye: 0.82, brow: 0.08, pupil: 0.86, gape: 0.06, tilt: 0.06 },
    { relief: 0.24, density: 0.84, scars: 0.02, plates: 0.28, mode: 3 }, 'faceted ice hump'),
  gravewater: personality('already-dead swimmer, hollow face, loose belly',
    { head: 1.06, neck: 1.02, chest: 1.04, tail: 0.98, fin: 0.94 },
    { head: 0.08, neck: 0.04, chest: 0.08, tail: 0.02, jaw: 0.20, underbite: 0.12, brow: -0.56, dorsal: 0.02, hump: -0.02, sag: 0.16, muscle: -0.12 },
    { eye: 0.68, brow: -0.70, pupil: 1.28, gape: 0.09, tilt: -0.54 },
    { relief: 0.24, density: 0.90, scars: 0.38, plates: 0.00, mode: 2 }, 'sunken socket read'),
  teslafang: personality('charged long-snouted feeder, spring-loaded tail',
    { head: 0.88, neck: 0.84, chest: 0.70, tail: 1.28, fin: 0.92 },
    { head: -0.08, neck: -0.16, chest: -0.22, tail: 0.32, jaw: 0.10, underbite: 0.06, brow: 0.42, dorsal: 0.22, hump: -0.04, sag: -0.04, muscle: 0.34 },
    { eye: 0.82, brow: 0.46, pupil: 0.82, gape: 0.03, tilt: 0.36 },
    { relief: 0.16, density: 1.35, scars: 0.04, plates: 0.06, mode: 4 }, 'charged flank ridge'),
  plaguemaw: personality('infected stocky carrier, swollen throat and mean brow',
    { head: 1.14, neck: 1.12, chest: 1.18, tail: 0.92, fin: 1.00 },
    { head: 0.14, neck: 0.20, chest: 0.24, tail: -0.04, jaw: 0.20, underbite: 0.12, brow: -0.46, dorsal: 0.10, hump: 0.14, sag: 0.10, muscle: 0.16 },
    { eye: 0.76, brow: -0.60, pupil: 1.30, gape: 0.11, tilt: -0.40 },
    { relief: 0.22, density: 1.25, scars: 0.24, plates: 0.02, mode: 2 }, 'boil-like relief'),
  sunspine: personality('solar sprinter with a high radiant dorsal line',
    { head: 1.02, neck: 0.98, chest: 0.94, tail: 1.12, fin: 1.18 },
    { head: 0.04, neck: 0.02, chest: -0.04, tail: 0.14, jaw: 0.04, underbite: 0.00, brow: 0.36, dorsal: 0.30, hump: 0.04, sag: -0.02, muscle: 0.22 },
    { eye: 1.02, brow: 0.34, pupil: 1.00, gape: 0.02, tilt: 0.26 },
    { relief: 0.16, density: 1.40, scars: 0.00, plates: 0.16, mode: 4 }, 'sun-ray dorsal'),
  nocturne: personality('deepening night hunter, narrow face, upward gaze',
    { head: 1.00, neck: 0.96, chest: 0.92, tail: 1.12, fin: 1.02 },
    { head: 0.02, neck: -0.02, chest: -0.06, tail: 0.14, jaw: 0.06, underbite: 0.02, brow: 0.44, dorsal: 0.08, hump: -0.02, sag: 0.00, muscle: 0.16 },
    { eye: 0.80, brow: 0.56, pupil: 1.34, gape: 0.03, tilt: 0.40 },
    { relief: 0.10, density: 1.70, scars: 0.08, plates: 0.00, mode: 4 }, 'star-speckled face'),
  tempest: personality('weather-front torpedo, tense neck and warning stare',
    { head: 1.06, neck: 1.04, chest: 0.98, tail: 1.08, fin: 1.12 },
    { head: 0.06, neck: 0.08, chest: 0.00, tail: 0.10, jaw: 0.08, underbite: 0.04, brow: -0.02, dorsal: 0.22, hump: 0.04, sag: -0.01, muscle: 0.24 },
    { eye: 0.86, brow: -0.10, pupil: 1.06, gape: 0.04, tilt: -0.06 },
    { relief: 0.18, density: 1.45, scars: 0.12, plates: 0.06, mode: 4 }, 'storm-front fin edge'),
  maelstrom: personality('wide drain-mouth, rolling belly, unstoppable current',
    { head: 1.26, neck: 1.18, chest: 1.28, tail: 0.84, fin: 1.04 },
    { head: 0.22, neck: 0.18, chest: 0.28, tail: -0.12, jaw: 0.22, underbite: 0.08, brow: -0.12, dorsal: 0.10, hump: 0.24, sag: 0.16, muscle: 0.12 },
    { eye: 0.76, brow: -0.26, pupil: 1.20, gape: 0.13, tilt: -0.16 },
    { relief: 0.20, density: 1.10, scars: 0.04, plates: 0.08, mode: 4 }, 'spiral belly relief'),
  bonecrown: personality('skeletal monarch, tall brow, tight hungry body',
    { head: 1.14, neck: 1.08, chest: 1.06, tail: 0.98, fin: 1.10 },
    { head: 0.18, neck: 0.10, chest: 0.04, tail: 0.02, jaw: 0.16, underbite: 0.10, brow: -0.64, dorsal: 0.18, hump: 0.08, sag: 0.02, muscle: 0.18 },
    { eye: 0.72, brow: -0.76, pupil: 1.26, gape: 0.08, tilt: -0.60 },
    { relief: 0.28, density: 0.86, scars: 0.30, plates: 0.24, mode: 3 }, 'bone crown ridge'),
  mirrorscale: personality('reflective decoy, sleek flank, unreadable face',
    { head: 1.02, neck: 0.96, chest: 0.90, tail: 1.12, fin: 1.04 },
    { head: 0.00, neck: -0.04, chest: -0.08, tail: 0.14, jaw: 0.04, underbite: 0.00, brow: 0.06, dorsal: 0.10, hump: -0.02, sag: -0.02, muscle: 0.14 },
    { eye: 0.94, brow: 0.02, pupil: 0.86, gape: 0.00, tilt: 0.00 },
    { relief: 0.12, density: 1.80, scars: 0.00, plates: 0.06, mode: 4 }, 'mirror flank shimmer'),
  aurora: personality('long elegant light-runner, lifted fins, curious eyes',
    { head: 1.00, neck: 0.96, chest: 0.94, tail: 1.14, fin: 1.20 },
    { head: 0.02, neck: 0.00, chest: -0.04, tail: 0.16, jaw: 0.02, underbite: 0.00, brow: 0.30, dorsal: 0.24, hump: 0.00, sag: -0.02, muscle: 0.18 },
    { eye: 1.10, brow: 0.42, pupil: 0.94, gape: 0.02, tilt: 0.24 },
    { relief: 0.14, density: 1.50, scars: 0.00, plates: 0.04, mode: 4 }, 'ribbon light fin'),
  vulkan: personality('volcanic boulder, high back, square furnace jaw',
    { head: 1.22, neck: 1.18, chest: 1.24, tail: 0.86, fin: 1.08 },
    { head: 0.20, neck: 0.22, chest: 0.26, tail: -0.10, jaw: 0.22, underbite: 0.16, brow: -0.38, dorsal: 0.20, hump: 0.24, sag: 0.10, muscle: 0.28 },
    { eye: 0.82, brow: -0.54, pupil: 1.24, gape: 0.12, tilt: -0.34 },
    { relief: 0.30, density: 0.78, scars: 0.34, plates: 0.24, mode: 4 }, 'volcanic back plates'),
  voltaicrex: personality('storm king, long crown line, charged cheek muscles',
    { head: 1.24, neck: 1.18, chest: 1.28, tail: 0.86, fin: 1.28 },
    { head: 0.22, neck: 0.22, chest: 0.28, tail: -0.12, jaw: 0.16, underbite: 0.08, brow: 0.08, dorsal: 0.34, hump: 0.20, sag: 0.08, muscle: 0.42 },
    { eye: 1.10, brow: 0.18, pupil: 1.08, gape: 0.08, tilt: 0.12 },
    { relief: 0.20, density: 1.30, scars: 0.06, plates: 0.14, mode: 4 }, 'electric crown ridge'),
  nullfin: personality('void cutout, missing fin line, severe jaw',
    { head: 1.06, neck: 1.00, chest: 0.98, tail: 1.08, fin: 0.90 },
    { head: 0.08, neck: 0.02, chest: -0.02, tail: 0.10, jaw: 0.18, underbite: 0.12, brow: -0.52, dorsal: -0.04, hump: -0.02, sag: 0.00, muscle: 0.14 },
    { eye: 0.66, brow: -0.68, pupil: 1.42, gape: 0.09, tilt: -0.52 },
    { relief: 0.12, density: 0.90, scars: 0.32, plates: 0.00, mode: 4 }, 'missing dorsal notch'),
  chronos: personality('precise ringed hunter, lean body, measured gaze',
    { head: 1.04, neck: 0.98, chest: 0.96, tail: 1.10, fin: 1.04 },
    { head: 0.04, neck: 0.00, chest: -0.02, tail: 0.12, jaw: 0.08, underbite: 0.02, brow: 0.16, dorsal: 0.10, hump: 0.00, sag: -0.02, muscle: 0.20 },
    { eye: 0.94, brow: 0.18, pupil: 0.88, gape: 0.03, tilt: 0.12 },
    { relief: 0.16, density: 1.60, scars: 0.02, plates: 0.08, mode: 4 }, 'clock rings over flank'),
  seismos: personality('seafloor tank, thick neck, low quaking brow',
    { head: 1.20, neck: 1.18, chest: 1.26, tail: 0.84, fin: 1.02 },
    { head: 0.18, neck: 0.22, chest: 0.28, tail: -0.12, jaw: 0.16, underbite: 0.12, brow: -0.60, dorsal: 0.18, hump: 0.22, sag: 0.12, muscle: 0.30 },
    { eye: 0.74, brow: -0.76, pupil: 1.24, gape: 0.10, tilt: -0.62 },
    { relief: 0.34, density: 0.72, scars: 0.36, plates: 0.26, mode: 3 }, 'fault-line shoulder'),
  banshee: personality('hollow screamer, narrow skull, stretched jaw hinge',
    { head: 1.08, neck: 1.00, chest: 0.92, tail: 1.10, fin: 0.96 },
    { head: 0.12, neck: 0.00, chest: -0.08, tail: 0.12, jaw: 0.24, underbite: 0.16, brow: -0.70, dorsal: 0.02, hump: -0.04, sag: 0.04, muscle: -0.10 },
    { eye: 0.58, brow: -0.78, pupil: 1.36, gape: 0.14, tilt: -0.72 },
    { relief: 0.20, density: 0.88, scars: 0.34, plates: 0.00, mode: 2 }, 'long scream jaw'),
  vortexa: personality('wide vortex mouth, coiled belly, fixed hungry eye',
    { head: 1.28, neck: 1.18, chest: 1.30, tail: 0.82, fin: 1.04 },
    { head: 0.24, neck: 0.20, chest: 0.30, tail: -0.14, jaw: 0.26, underbite: 0.10, brow: -0.18, dorsal: 0.10, hump: 0.26, sag: 0.18, muscle: 0.16 },
    { eye: 0.70, brow: -0.34, pupil: 1.34, gape: 0.15, tilt: -0.24 },
    { relief: 0.24, density: 1.15, scars: 0.06, plates: 0.04, mode: 4 }, 'spiral cheek vortex'),
  warbringer: personality('decommissioned war beast, armored chest, blunt snout',
    { head: 1.22, neck: 1.18, chest: 1.24, tail: 0.86, fin: 1.08 },
    { head: 0.18, neck: 0.22, chest: 0.28, tail: -0.10, jaw: 0.18, underbite: 0.10, brow: -0.44, dorsal: 0.18, hump: 0.22, sag: 0.08, muscle: 0.34 },
    { eye: 0.72, brow: -0.62, pupil: 1.22, gape: 0.11, tilt: -0.44 },
    { relief: 0.38, density: 0.70, scars: 0.20, plates: 0.54, mode: 3 }, 'armored shoulder mass'),
  omenmaw: personality('prophecy angler, towering throat, hypnotic forward face',
    { head: 1.18, neck: 1.18, chest: 1.22, tail: 0.86, fin: 1.00 },
    { head: 0.18, neck: 0.22, chest: 0.24, tail: -0.08, jaw: 0.28, underbite: 0.12, brow: 0.14, dorsal: 0.04, hump: 0.20, sag: 0.14, muscle: 0.08 },
    { eye: 0.64, brow: 0.22, pupil: 1.44, gape: 0.15, tilt: 0.28 },
    { relief: 0.18, density: 0.86, scars: 0.24, plates: 0.06, mode: 4 }, 'rune throat lantern'),
  solaris: personality('small sun, compact power chest, bright fearless eye',
    { head: 1.08, neck: 1.02, chest: 1.14, tail: 1.00, fin: 1.10 },
    { head: 0.10, neck: 0.08, chest: 0.18, tail: 0.02, jaw: 0.08, underbite: 0.02, brow: 0.30, dorsal: 0.20, hump: 0.10, sag: 0.02, muscle: 0.28 },
    { eye: 1.18, brow: 0.42, pupil: 1.10, gape: 0.04, tilt: 0.30 },
    { relief: 0.20, density: 1.25, scars: 0.00, plates: 0.14, mode: 4 }, 'corona brow rays'),
  absolutezero: personality('frozen blunt tank, compressed face, unblinking eye',
    { head: 1.22, neck: 1.16, chest: 1.24, tail: 0.84, fin: 1.00 },
    { head: 0.20, neck: 0.18, chest: 0.26, tail: -0.12, jaw: 0.14, underbite: 0.08, brow: -0.56, dorsal: 0.12, hump: 0.18, sag: 0.10, muscle: 0.18 },
    { eye: 0.68, brow: -0.70, pupil: 0.80, gape: 0.08, tilt: -0.56 },
    { relief: 0.28, density: 0.80, scars: 0.02, plates: 0.26, mode: 3 }, 'ice-facet jaw'),
  leviathanrex: personality('Godzilla shark, armored charcoal bulk, atomic underbite',
    { head: 1.18, neck: 1.12, chest: 1.22, tail: 0.96, fin: 1.08 },
    { head: 0.14, neck: 0.10, chest: 0.16, tail: -0.02, jaw: 0.20, underbite: 0.22, brow: -0.42, dorsal: 0.08, hump: 0.12, sag: 0.02, muscle: 0.12 },
    { eye: 0.84, brow: -0.46, pupil: 1.08, gape: 0.16, tilt: -0.24 },
    { relief: 0.26, density: 1.45, scars: 0.14, plates: 0.18, mode: 3 }, 'connected maple-plate spine and atomic underbite'),
  leviathan_rex: personality('armored sea-green king, flat crown brow, tusked underslung jaw',
    { head: 1.30, neck: 1.22, chest: 1.16, tail: 1.02, fin: 0.94 },
    { head: 0.24, neck: 0.20, chest: 0.10, tail: 0.06, jaw: 0.30, underbite: 0.34, brow: 0.52, dorsal: -0.10, hump: 0.04, sag: 0.10, muscle: 0.34 },
    { eye: 0.72, brow: 0.60, pupil: 0.86, gape: 0.10, tilt: -0.34 },
    { relief: 0.30, density: 0.78, scars: 0.06, plates: 0.30, mode: 5 }, 'flat crown brow, twin scute rows, seafoam seam glow'),
  zeusfin: personality('lightning spear, upright brow, decisive king stare',
    { head: 1.10, neck: 1.04, chest: 1.04, tail: 1.04, fin: 1.18 },
    { head: 0.12, neck: 0.08, chest: 0.06, tail: 0.06, jaw: 0.10, underbite: 0.02, brow: 0.54, dorsal: 0.30, hump: 0.06, sag: 0.00, muscle: 0.30 },
    { eye: 1.04, brow: 0.68, pupil: 1.10, gape: 0.05, tilt: 0.54 },
    { relief: 0.22, density: 1.20, scars: 0.04, plates: 0.16, mode: 4 }, 'crown of fin rays'),
  poseidonrex: personality('current-owning whale, huge shoulders, calm imperial eye',
    { head: 1.30, neck: 1.22, chest: 1.34, tail: 0.80, fin: 1.10 },
    { head: 0.24, neck: 0.22, chest: 0.32, tail: -0.16, jaw: 0.22, underbite: 0.06, brow: 0.08, dorsal: 0.14, hump: 0.28, sag: 0.16, muscle: 0.18 },
    { eye: 1.08, brow: 0.16, pupil: 0.82, gape: 0.14, tilt: 0.10 },
    { relief: 0.24, density: 1.10, scars: 0.02, plates: 0.12, mode: 4 }, 'tidal shoulder curl'),
  hadesmaw: personality('underworld collector, void cheek, closed severe eye',
    { head: 1.16, neck: 1.08, chest: 1.04, tail: 0.98, fin: 1.02 },
    { head: 0.18, neck: 0.10, chest: 0.02, tail: 0.02, jaw: 0.22, underbite: 0.12, brow: -0.66, dorsal: 0.06, hump: 0.06, sag: 0.04, muscle: 0.20 },
    { eye: 0.62, brow: -0.82, pupil: 1.42, gape: 0.11, tilt: -0.70 },
    { relief: 0.26, density: 0.86, scars: 0.34, plates: 0.04, mode: 4 }, 'void rune jaw'),
  apollodon: personality('sun bite, lean heroic wedge, high cheek plane',
    { head: 1.08, neck: 1.02, chest: 1.00, tail: 1.04, fin: 1.12 },
    { head: 0.10, neck: 0.04, chest: 0.02, tail: 0.06, jaw: 0.12, underbite: 0.04, brow: 0.42, dorsal: 0.22, hump: 0.08, sag: 0.00, muscle: 0.26 },
    { eye: 1.12, brow: 0.54, pupil: 1.02, gape: 0.07, tilt: 0.40 },
    { relief: 0.22, density: 1.18, scars: 0.00, plates: 0.10, mode: 4 }, 'sun corona brow'),
  artemisstrike: personality('silent huntress, thin profile, perfectly level eyes',
    { head: 1.00, neck: 0.94, chest: 0.88, tail: 1.14, fin: 1.02 },
    { head: -0.02, neck: -0.08, chest: -0.12, tail: 0.16, jaw: 0.04, underbite: 0.00, brow: 0.08, dorsal: 0.06, hump: -0.03, sag: -0.02, muscle: 0.18 },
    { eye: 0.84, brow: 0.02, pupil: 0.76, gape: 0.01, tilt: 0.00 },
    { relief: 0.12, density: 1.55, scars: 0.04, plates: 0.00, mode: 4 }, 'arrow-straight flank'),
  athenajaw: personality('strategist hammerhead, armored forehead, measuring gaze',
    { head: 1.26, neck: 1.12, chest: 1.12, tail: 0.92, fin: 1.16 },
    { head: 0.20, neck: 0.16, chest: 0.16, tail: -0.06, jaw: 0.14, underbite: 0.06, brow: 0.62, dorsal: 0.22, hump: 0.12, sag: 0.04, muscle: 0.30 },
    { eye: 1.16, brow: 0.38, pupil: 1.28, gape: 0.08, tilt: 0.26 },
    { relief: 0.30, density: 0.82, scars: 0.08, plates: 0.40, mode: 3 }, 'armored cephalofoil'),
  aresrender: personality('the fight itself, crocodile jaw, forward-leaning shoulders',
    { head: 1.22, neck: 1.18, chest: 1.24, tail: 0.88, fin: 1.06 },
    { head: 0.20, neck: 0.22, chest: 0.26, tail: -0.08, jaw: 0.24, underbite: 0.20, brow: -0.58, dorsal: 0.14, hump: 0.18, sag: 0.08, muscle: 0.36 },
    { eye: 0.78, brow: -0.72, pupil: 1.30, gape: 0.13, tilt: -0.54 },
    { relief: 0.28, density: 0.92, scars: 0.24, plates: 0.16, mode: 4 }, 'rendered croc jaw'),
  hermesdart: personality('messenger dart, needle nose, restless bright eyes',
    { head: 0.98, neck: 0.92, chest: 0.84, tail: 1.20, fin: 1.00 },
    { head: -0.04, neck: -0.10, chest: -0.14, tail: 0.22, jaw: 0.02, underbite: -0.02, brow: 0.50, dorsal: 0.08, hump: -0.03, sag: -0.04, muscle: 0.24 },
    { eye: 1.06, brow: 0.58, pupil: 1.00, gape: 0.00, tilt: 0.48 },
    { relief: 0.14, density: 1.60, scars: 0.00, plates: 0.04, mode: 4 }, 'winglike fin dart'),
  hephaestusforge: personality('self-built forge shark, square torso, hot rivet brow',
    { head: 1.20, neck: 1.18, chest: 1.26, tail: 0.86, fin: 1.08 },
    { head: 0.18, neck: 0.22, chest: 0.30, tail: -0.10, jaw: 0.18, underbite: 0.10, brow: -0.32, dorsal: 0.20, hump: 0.24, sag: 0.10, muscle: 0.34 },
    { eye: 0.74, brow: -0.48, pupil: 1.18, gape: 0.11, tilt: -0.34 },
    { relief: 0.38, density: 0.74, scars: 0.18, plates: 0.48, mode: 3 }, 'forge rivet brow'),
  dionysustide: personality('party tide, broad cheeks, mischievous half-lidded eye',
    { head: 1.14, neck: 1.10, chest: 1.14, tail: 0.92, fin: 1.04 },
    { head: 0.14, neck: 0.14, chest: 0.20, tail: -0.04, jaw: 0.12, underbite: 0.06, brow: 0.18, dorsal: 0.10, hump: 0.12, sag: 0.06, muscle: 0.18 },
    { eye: 1.16, brow: 0.24, pupil: 1.18, gape: 0.08, tilt: 0.22 },
    { relief: 0.22, density: 1.10, scars: 0.12, plates: 0.02, mode: 2 }, 'bubbled cheek relief'),
  aphroditelure: personality('beautiful lure, elegant body, inviting dangerous gaze',
    { head: 1.08, neck: 1.02, chest: 0.98, tail: 1.08, fin: 1.02 },
    { head: 0.08, neck: 0.02, chest: -0.02, tail: 0.10, jaw: 0.12, underbite: 0.04, brow: 0.36, dorsal: 0.10, hump: 0.02, sag: 0.00, muscle: 0.14 },
    { eye: 1.24, brow: 0.48, pupil: 1.14, gape: 0.05, tilt: 0.42 },
    { relief: 0.12, density: 1.45, scars: 0.00, plates: 0.00, mode: 4 }, 'lure-forward face'),
  heracrown: personality('queen-sized kaiju, armored shoulders, unblinking crown stare',
    { head: 1.34, neck: 1.28, chest: 1.38, tail: 0.78, fin: 1.20 },
    { head: 0.30, neck: 0.28, chest: 0.34, tail: -0.18, jaw: 0.28, underbite: 0.14, brow: 0.34, dorsal: 0.28, hump: 0.30, sag: 0.14, muscle: 0.42 },
    { eye: 1.12, brow: 0.40, pupil: 1.22, gape: 0.16, tilt: 0.30 },
    { relief: 0.42, density: 0.62, scars: 0.18, plates: 0.52, mode: 3 }, 'crown and shoulder armor'),
  typhonmaw: personality('old god monster, asymmetrical bulk, jaw like a cave',
    { head: 1.36, neck: 1.30, chest: 1.42, tail: 0.76, fin: 1.22 },
    { head: 0.34, neck: 0.32, chest: 0.38, tail: -0.20, jaw: 0.34, underbite: 0.20, brow: -0.42, dorsal: 0.30, hump: 0.34, sag: 0.18, muscle: 0.46 },
    { eye: 0.64, brow: -0.74, pupil: 1.40, gape: 0.18, tilt: -0.60 },
    { relief: 0.44, density: 0.58, scars: 0.52, plates: 0.48, mode: 4 }, 'monster cave maw'),
  hydrafang: personality('serpentine many-headed read, long neck, coiling tail',
    { head: 1.06, neck: 0.96, chest: 0.82, tail: 1.28, fin: 0.88 },
    { head: 0.06, neck: -0.04, chest: -0.12, tail: 0.28, jaw: 0.16, underbite: 0.10, brow: -0.22, dorsal: 0.02, hump: -0.02, sag: 0.02, muscle: 0.20 },
    { eye: 0.78, brow: -0.34, pupil: 1.30, gape: 0.08, tilt: -0.26 },
    { relief: 0.18, density: 2.00, scars: 0.12, plates: 0.04, mode: 1 }, 'repeating neck bands'),
  cerberusjaw: personality('guard-dog brawler, triple-hinge jaw, broad neck',
    { head: 1.24, neck: 1.24, chest: 1.22, tail: 0.88, fin: 1.04 },
    { head: 0.24, neck: 0.28, chest: 0.24, tail: -0.10, jaw: 0.32, underbite: 0.22, brow: -0.62, dorsal: 0.12, hump: 0.16, sag: 0.08, muscle: 0.40 },
    { eye: 0.72, brow: -0.78, pupil: 1.34, gape: 0.17, tilt: -0.68 },
    { relief: 0.30, density: 0.90, scars: 0.28, plates: 0.20, mode: 2 }, 'layered guard jaw'),
  chimerashark: personality('three-animal hybrid, saw nose, mismatched muscle',
    { head: 1.16, neck: 1.08, chest: 1.08, tail: 0.96, fin: 1.12 },
    { head: 0.18, neck: 0.10, chest: 0.10, tail: 0.02, jaw: 0.18, underbite: 0.12, brow: 0.10, dorsal: 0.22, hump: 0.08, sag: 0.03, muscle: 0.32 },
    { eye: 0.92, brow: 0.16, pupil: 1.24, gape: 0.09, tilt: 0.14 },
    { relief: 0.28, density: 1.30, scars: 0.24, plates: 0.28, mode: 3 }, 'saw plus split dorsal'),
  medusagaze: personality('lure-eyed petrifier, soft body, forward hypnotic face',
    { head: 1.10, neck: 1.08, chest: 1.08, tail: 0.98, fin: 0.96 },
    { head: 0.16, neck: 0.12, chest: 0.10, tail: 0.00, jaw: 0.14, underbite: 0.08, brow: 0.30, dorsal: 0.04, hump: 0.10, sag: 0.06, muscle: 0.06 },
    { eye: 1.30, brow: 0.42, pupil: 1.40, gape: 0.08, tilt: 0.34 },
    { relief: 0.16, density: 1.70, scars: 0.04, plates: 0.00, mode: 2 }, 'large gaze spot'),
  scyllarender: personality('rock strait hunter, eel length, six-cut jaw attitude',
    { head: 1.10, neck: 0.94, chest: 0.80, tail: 1.30, fin: 0.84 },
    { head: 0.06, neck: -0.06, chest: -0.14, tail: 0.30, jaw: 0.22, underbite: 0.14, brow: -0.46, dorsal: 0.00, hump: -0.02, sag: 0.02, muscle: 0.22 },
    { eye: 0.72, brow: -0.60, pupil: 1.32, gape: 0.12, tilt: -0.48 },
    { relief: 0.22, density: 2.20, scars: 0.26, plates: 0.10, mode: 1 }, 'six flank cuts'),
  charybdisvoid: personality('drain-mouth whale, hollow chest, orbiting eye',
    { head: 1.28, neck: 1.20, chest: 1.32, tail: 0.80, fin: 1.02 },
    { head: 0.26, neck: 0.22, chest: 0.32, tail: -0.16, jaw: 0.28, underbite: 0.10, brow: -0.20, dorsal: 0.12, hump: 0.28, sag: 0.18, muscle: 0.12 },
    { eye: 0.68, brow: -0.34, pupil: 1.40, gape: 0.16, tilt: -0.24 },
    { relief: 0.30, density: 1.15, scars: 0.18, plates: 0.06, mode: 4 }, 'void drain spiral'),
  minotaurram: personality('horned maze brute, thick neck, lowered ram brow',
    { head: 1.22, neck: 1.24, chest: 1.28, tail: 0.86, fin: 1.00 },
    { head: 0.22, neck: 0.26, chest: 0.30, tail: -0.10, jaw: 0.20, underbite: 0.18, brow: -0.70, dorsal: 0.16, hump: 0.20, sag: 0.10, muscle: 0.38 },
    { eye: 0.76, brow: -0.82, pupil: 1.20, gape: 0.12, tilt: -0.72 },
    { relief: 0.34, density: 0.76, scars: 0.34, plates: 0.30, mode: 3 }, 'ram horns and stone brow'),
  cyclopseye: personality('single-eyed heavy tank, centered stare, blunt jaw',
    { head: 1.20, neck: 1.16, chest: 1.20, tail: 0.90, fin: 1.00 },
    { head: 0.20, neck: 0.18, chest: 0.24, tail: -0.06, jaw: 0.20, underbite: 0.12, brow: -0.36, dorsal: 0.10, hump: 0.16, sag: 0.08, muscle: 0.26 },
    { eye: 1.34, brow: -0.44, pupil: 1.46, gape: 0.11, tilt: 0.00 },
    { relief: 0.22, density: 1.00, scars: 0.26, plates: 0.08, mode: 2 }, 'single centered eye'),
  harpyshade: personality('ambush glider, thin shoulders, hooked stealth gaze',
    { head: 0.98, neck: 0.90, chest: 0.82, tail: 1.16, fin: 1.20 },
    { head: -0.02, neck: -0.08, chest: -0.14, tail: 0.18, jaw: 0.04, underbite: 0.00, brow: 0.52, dorsal: 0.28, hump: -0.04, sag: -0.03, muscle: 0.16 },
    { eye: 0.72, brow: 0.68, pupil: 1.30, gape: 0.03, tilt: 0.60 },
    { relief: 0.12, density: 1.35, scars: 0.12, plates: 0.00, mode: 2 }, 'wing-fin shadow'),
  lamiacoil: personality('lullaby eel, long coil, soft jaw and sleepy eye',
    { head: 1.02, neck: 0.90, chest: 0.76, tail: 1.32, fin: 0.82 },
    { head: 0.02, neck: -0.10, chest: -0.18, tail: 0.32, jaw: 0.14, underbite: 0.08, brow: -0.28, dorsal: -0.04, hump: -0.04, sag: 0.02, muscle: 0.08 },
    { eye: 0.82, brow: -0.38, pupil: 1.16, gape: 0.06, tilt: -0.22 },
    { relief: 0.14, density: 2.30, scars: 0.10, plates: 0.00, mode: 1 }, 'long lullaby coil'),
  kampechrono: personality('gate guardian, skull brow, compact clockwork bulk',
    { head: 1.30, neck: 1.26, chest: 1.34, tail: 0.80, fin: 1.14 },
    { head: 0.30, neck: 0.24, chest: 0.28, tail: -0.12, jaw: 0.28, underbite: 0.18, brow: -0.72, dorsal: 0.22, hump: 0.22, sag: 0.10, muscle: 0.34 },
    { eye: 0.66, brow: -0.82, pupil: 1.36, gape: 0.14, tilt: -0.68 },
    { relief: 0.30, density: 1.00, scars: 0.32, plates: 0.18, mode: 3 }, 'clockwork bone brow')
});

function personalityOf(def) { return PERSONALITY_TABLE[String(def?.id || '')] || null; }

const modelCache = new Map();
const baseSelection = new Map();
let preloadPromise = null;
let preloadError = null;
/* HSE lane O4 residency bookkeeper. modelCache stays the synchronous lookup
 * every existing call site reads; the budget owns WHICH textured templates are
 * allowed to be in it. The two are kept in step in admitTemplate()/evictions:
 * an eviction deletes from modelCache too, so a later buildShark() for that
 * base misses, serves the placeholder, and re-loads. */
const modelBudget = new ModelBudget({
  isTextured: (key) => TEXTURED_KEYS.has(String(key || '')),
  cap: TEXTURED_LRU_CAP,
  onEvent: (event) => { if (event.type === 'evict') modelCache.delete(event.key); }
});
/* Which base each LIVE rig group is holding a reference on, so releaseShark()
 * can give exactly one reference back. Keyed by the rig's group object, weakly:
 * a group that is dropped without releaseShark() must not pin the entry map. */
const rigHolds = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
let sharedPlaneGeometry = null;
const billboardMaterials = new Map();
const billboardIds = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
let nextBillboardId = 1;

function clamp(value, lo, hi) { return value < lo ? lo : value > hi ? hi : value; }
function finite(value, fallback) { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function hex(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(n) ? (n >>> 0) & 0xffffff : fallback;
}
function colorValue(value, fallback = 0xffffff) {
  return value instanceof THREE.Color ? value.clone() : new THREE.Color(hex(value, fallback));
}
function rgbToHsv(color) {
  const c = color instanceof THREE.Color ? color : colorValue(color);
  const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b), delta = max - min;
  let h = 0;
  if (delta > 1e-6) {
    if (max === c.r) h = ((c.g - c.b) / delta) % 6;
    else if (max === c.g) h = (c.b - c.r) / delta + 2;
    else h = (c.r - c.g) / delta + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return { h, s: max <= 1e-6 ? 0 : delta / max, v: max };
}
function hsvToColor(h, s, v) {
  const hue = ((h % 1) + 1) % 1, sat = clamp(s, 0, 1), val = clamp(v, 0, 1);
  const sector = hue * 6, i = Math.floor(sector), f = sector - i;
  const p = val * (1 - sat), q = val * (1 - sat * f), t = val * (1 - sat * (1 - f));
  switch (i % 6) {
    case 0: return new THREE.Color(val, t, p);
    case 1: return new THREE.Color(q, val, p);
    case 2: return new THREE.Color(p, val, t);
    case 3: return new THREE.Color(p, q, val);
    case 4: return new THREE.Color(t, p, val);
    default: return new THREE.Color(val, p, q);
  }
}
function resolvePaletteSwatch(value, saturationMin, saturationMax, valueMin, valueMax, fallbackHue = 0) {
  const source = colorValue(value), hsv = rgbToHsv(source);
  const hue = hsv.s > 0.04 ? hsv.h : fallbackHue;
  return hsvToColor(hue, clamp(Math.max(hsv.s, saturationMin), saturationMin, saturationMax), clamp(Math.max(hsv.v, valueMin), valueMin, valueMax));
}
function paletteStats(color) { const hsv = rgbToHsv(color); return { h: hsv.h, s: hsv.s, v: hsv.v }; }
function hsvTarget([h, s, v]) { return hsvToColor(h, s, v); }
function paletteOf(def) {
  const source = def?.sil?.palette || {}, id = String(def?.id || ''), family = PANTHEON_PALETTE_FAMILIES[id];
  if (id === SHARKJIRA_ID) {
    const base = colorValue(SHARKJIRA_PALETTE.base), belly = colorValue(SHARKJIRA_PALETTE.belly), accent = colorValue(SHARKJIRA_PALETTE.accent), glow = colorValue(SHARKJIRA_PALETTE.glow);
    return {
      base, belly, accent, glow,
      raw: { base: hex(source.base, SHARKJIRA_PALETTE.base), belly: hex(source.belly, SHARKJIRA_PALETTE.belly), accent: hex(source.accent, SHARKJIRA_PALETTE.accent), glow: hex(source.glow, SHARKJIRA_PALETTE.glow) },
      resolved: { base: paletteStats(base), belly: paletteStats(belly), accent: paletteStats(accent), glow: paletteStats(glow) },
      style: id
    };
  }
  /* Rev 13 rework: authored kaiju palette, exempt from the roster value
   * floor for the same reason Sharkjira is. See LEVIATHAN_RENDER_PALETTE. */
  if (id === LEVIATHAN_ID) {
    const base = colorValue(LEVIATHAN_RENDER_PALETTE.base), belly = colorValue(LEVIATHAN_RENDER_PALETTE.belly), accent = colorValue(LEVIATHAN_RENDER_PALETTE.accent), glow = colorValue(LEVIATHAN_RENDER_PALETTE.glow);
    return {
      base, belly, accent, glow,
      raw: { base: hex(source.base, LEVIATHAN_PALETTE.base), belly: hex(source.belly, LEVIATHAN_PALETTE.belly), accent: hex(source.accent, LEVIATHAN_PALETTE.accent), glow: hex(source.glow, LEVIATHAN_PALETTE.glow) },
      resolved: { base: paletteStats(base), belly: paletteStats(belly), accent: paletteStats(accent), glow: paletteStats(glow) },
      style: id
    };
  }
  if (family) {
    const underworld = UNDERWORLD_IDS.has(id);
    /* Rev 13: gods read as plain sharks when their base sits at the same
     * saturation as a reef shark and their hue sits inside the water's own
     * cyan band. Push base saturation up and give every family a wider
     * accent/base value split so the divine read survives the fog. */
    const base = hsvToColor(family.baseHue, underworld ? 0.88 : 0.90, family.baseV * 0.92);
    const accent = hsvToColor(family.accentHue, 1.00, Math.min(1, family.accentV * 1.04));
    const belly = hsvToColor(family.baseHue, underworld ? 0.16 : 0.14, underworld ? 0.92 : 0.98);
    const glow = hsvToColor(family.accentHue, 0.98, 0.95);
    return {
      base, belly, accent, glow,
      raw: { base: hex(source.base, base.getHex()), belly: hex(source.belly, belly.getHex()), accent: hex(source.accent, accent.getHex()), glow: source.glow ? hex(source.glow) : glow.getHex() },
      resolved: { base: paletteStats(base), belly: paletteStats(belly), accent: paletteStats(accent), glow: paletteStats(glow) }, family: id, underworld
    };
  }
  const style = STYLE_PALETTE_OVERRIDES[id];
  if (style) {
    const base = hsvTarget(style.base), belly = hsvTarget(style.belly), accent = hsvTarget(style.accent);
    const glow = source.glow ? colorValue(source.glow) : null;
    return {
      base, belly, accent, glow,
      raw: { base: hex(source.base, base.getHex()), belly: hex(source.belly, belly.getHex()), accent: hex(source.accent, accent.getHex()), glow: source.glow ? hex(source.glow) : 0 },
      resolved: { base: paletteStats(base), belly: paletteStats(belly), accent: paletteStats(accent), glow: glow ? paletteStats(glow) : null }, style: id
    };
  }
  const authoredBase = colorValue(source.base, 0x204050), authoredAccent = colorValue(source.accent, 0x164557);
  const authoredGlow = source.glow ? colorValue(source.glow) : null, accentHue = rgbToHsv(authoredAccent).h;
  const screenTail = new Set(['reef', 'tiger', 'hammerhead', 'greatwhite']);
  const accentTarget = screenTail.has(id) ? ACCENT_SATURATION_TARGET : ACCENT_SATURATION_MIN;
  const base = resolvePaletteSwatch(authoredBase, BODY_FLANK_SATURATION_TARGET, BODY_FLANK_SATURATION_MAX, BODY_FLANK_VALUE_MIN, BODY_FLANK_VALUE_MAX);
  const accent = resolvePaletteSwatch(authoredAccent, accentTarget, ACCENT_SATURATION_MAX, Math.max(ACCENT_VALUE_MIN, 0.86), ACCENT_VALUE_MAX, accentHue);
  const belly = resolvePaletteSwatch(source.belly, BELLY_SATURATION_MIN, BELLY_SATURATION_MAX, BELLY_VALUE_MIN, BELLY_VALUE_MAX, rgbToHsv(authoredBase).h);
  const glow = authoredGlow
    ? resolvePaletteSwatch(authoredGlow, ACCENT_SATURATION_MIN, ACCENT_SATURATION_MAX, Math.max(ACCENT_VALUE_MIN, 0.88), ACCENT_VALUE_MAX, accentHue)
    : finite(def?.act, 1) >= 2 ? hsvToColor(accentHue, 0.96, 0.94) : null;
  return {
    base, belly, accent, glow,
    raw: { base: hex(source.base, 0x204050), belly: hex(source.belly, 0xddeee7), accent: hex(source.accent, 0x164557), glow: source.glow ? hex(source.glow) : 0 },
    resolved: { base: paletteStats(base), belly: paletteStats(belly), accent: paletteStats(accent), glow: glow ? paletteStats(glow) : null }
  };
}
function hashString(value) {
  let h = 2166136261, str = String(value || '');
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}
function eyeColorOf(def) {
  const id = String(def?.id || ''), head = String(def?.sil?.head || '');
  const named = {
    reef: 0x101b1d, epaulette: 0xd7a83b, cookiecutter: 0xf2a83b, mako: 0x63d8ff,
    blue: 0x8cecff, hammerhead: 0xd9f25b, thresher: 0xffc74d, sawshark: 0xff8b45,
    tiger: 0x79e85b, bull: 0xffbf49, goblin: 0xff6f48, greatwhite: 0x8bdcff,
    whaleshark: 0x72f0d4, megalodon: 0xffcf72, greenland: 0x80b6ff,
    leviathanrex: 0x3fd6ff, zeusfin: 0xfff074, hadesmaw: 0xff5f9a,
    typhonmaw: 0xff6d3f, minotaurram: 0xffbd4e, medusagaze: 0x9dff6b,
    cyclopseye: 0xffe064
  }[id];
  if (named) return colorValue(named);
  const hue = (hashString(`${id}:${head}`) * 0.84 + (finite(def?.act, 1) - 1) * 0.035) % 1;
  return hsvToColor(hue, 0.82, 0.92);
}
function variantProfile(def) {
  const id = String(def?.id || ''), sil = def?.sil || {}, head = String(sil.head || ''), act = finite(def?.act, 1);
  const personality = personalityOf(def);
  const tailScale = clamp(finite(sil.tailScale, 1), 0.72, 2.4), finScale = clamp(finite(sil.finScale, 1), 0.65, 1.8);
  const lane = Math.floor(hashString(`${id}:body`) * 5);
  const laneScales = [
    { head: 0.96, abdomen: 1.04, tail: 1.04, fin: 0.96 },
    { head: 1.06, abdomen: 0.96, tail: 0.94, fin: 1.06 },
    { head: 1.00, abdomen: 1.10, tail: 1.02, fin: 1.02 },
    { head: 1.08, abdomen: 1.02, tail: 0.96, fin: 0.92 },
    { head: 0.94, abdomen: 0.94, tail: 1.10, fin: 1.10 }
  ][lane];
  const profile = {
    lane,
    head: [laneScales.head, 1, laneScales.head],
    neck: [1, 1, 1],
    abdomen: [laneScales.abdomen, 1, laneScales.abdomen],
    tail: [1, clamp(laneScales.tail * (0.94 + (tailScale - 1) * 0.26), 0.82, 1.32), 1],
    tailUpper: [1, 1, 1],
    fin: [1, clamp(0.96 + (finScale - 1) * 0.18, 0.90, 1.16), clamp(laneScales.fin * (0.96 + (finScale - 1) * 0.24), 0.78, 1.34)],
    jaw: [1, 1, 1],
    patternScale: patternId(def) ? 54 + hashString(`${id}:pattern`) * 20 : 108 + finite(sil.len, 1) * 8,
    eyeColor: eyeColorOf(def)
  };
  const setBody = (headScale, abdomenScale, tailLength, finHeight) => {
    profile.head = [headScale, profile.head[1], headScale];
    profile.neck = [Math.min(headScale, 1.16), 1, Math.min(headScale, 1.16)];
    profile.abdomen = [abdomenScale, 1, abdomenScale];
    profile.tail[1] = tailLength;
    profile.fin[2] = finHeight;
  };

  /* Silhouette families. These are bone scales, so they stay welded to the
   * Sharky rig and cannot produce the floating-object failure mode. */
  if (id === 'mako' || id === 'blue') setBody(0.88, 0.82, 1.18, 0.94);
  if (id === 'thresher') { setBody(0.92, 0.80, 1.12, 0.98); profile.tailUpper = [1, 1.78, 1.05]; }
  if (id === 'bull') setBody(1.10, 1.20, 0.86, 1.06);
  if (id === 'hammerhead' || id === 'athenajaw') setBody(1.18, 1.06, 0.98, 1.10);
  if (id === 'whaleshark' || id === 'greenland' || id === 'megalodon') setBody(1.18, 1.18, 0.88, 1.02);
  if (head === 'whale' || head === 'kaiju' || id === 'leviathanrex' || id === 'typhonmaw') setBody(1.28, 1.26, 0.86, 1.18);
  if (id === SHARKJIRA_ID) {
    setBody(1.34, 1.34, 0.82, 1.22);
    profile.jaw = [1.18, 1.12, 1.28];
  }
  /* The Rex is broader at the head and thicker through the peduncle than
   * Sharkjira, but carries a LOWER dorsal fin so the crown and the twin
   * scute rows own the topline instead of a tall fin. */
  if (id === LEVIATHAN_ID) {
    setBody(1.36, 1.22, 0.98, 0.92);
    profile.jaw = [1.26, 1.16, 1.34];
  }
  if (head === 'eel' || id === 'morayne' || id === 'gloomtide') setBody(0.88, 0.78, 1.20, 0.82);
  if (head === 'croc' || id === 'snapjaw' || id === 'aresrender' || id === 'cerberusjaw') {
    setBody(1.12, 1.12, 0.92, 1.08); profile.jaw = [1.10, 1.06, 1.18];
  }
  if (head === 'rock' || head === 'skull' || head === 'void' || head === 'mech') {
    profile.head[0] *= 1.08; profile.head[2] *= 1.10; profile.abdomen[0] *= 1.08; profile.abdomen[2] *= 1.08;
  }
  if (act >= 4) {
    profile.head[0] *= 1.05; profile.head[2] *= 1.05; profile.abdomen[0] *= 1.05; profile.abdomen[2] *= 1.05;
    profile.patternScale = patternId(def) ? 48 + hashString(`${id}:late-pattern`) * 18 : profile.patternScale;
  }
  if (act >= 5) {
    profile.jaw[0] *= 1.08; profile.jaw[2] *= 1.12; profile.head[1] *= 1.06;
  }
  if (id === 'sailfin' || id === 'harpyshade' || id === 'aurora') profile.fin[2] *= 1.18;
  /* Reef is the approved Sharky reference row. Keep its silhouette at the
   * authored bind-pose scale; all other rows earn their own variant shape. */
  if (id === 'reef') {
    profile.lane = 0;
    profile.head = [1, 1, 1]; profile.neck = [1, 1, 1]; profile.abdomen = [1, 1, 1];
    profile.tail = [1, 1, 1]; profile.tailUpper = [1, 1, 1]; profile.fin = [1, 1, 1]; profile.jaw = [1, 1, 1];
    profile.patternScale = 108 + finite(sil.len, 1) * 8;
  }
  /* Rev 11 bulk is still bone-owned. The authored personality table adds a
   * second, species-specific silhouette layer without changing the approved
   * root armature bounds used by the game camera. */
  if (personality) {
    const bulk = personality.bulk;
    profile.head[0] *= bulk.head; profile.head[2] *= bulk.head;
    profile.neck[0] *= bulk.neck; profile.neck[2] *= bulk.neck;
    profile.abdomen[0] *= bulk.chest; profile.abdomen[2] *= bulk.chest;
    profile.tail[1] *= bulk.tail;
    profile.fin[1] *= clamp(0.98 + (bulk.fin - 1) * 0.18, 0.92, 1.10);
    profile.fin[2] *= bulk.fin;
    profile.personalityId = id;
    profile.personalitySignature = personality.signature;
  }
  /* Sharkjira is a Sharky shark first. Keep the head under 1.25x the
   * approved Great White head scale, put the chest at the requested 1.25
   * radial bone scale, and preserve a substantial tail instead of letting
   * the generic kaiju bulk compound into a black block. */
  if (id === SHARKJIRA_ID) {
    profile.head = [1.34, 1, 1.34];
    profile.neck = [1.16, 1, 1.16];
    profile.abdomen = [1.25, 1, 1.25];
    profile.tail = [1.10, 0.90, 1.10];
    profile.tailUpper = [1.06, 1, 1.06];
    /* The root depth normalization is tightened below for the 2.6-3.0
     * profile ratio; compensate the authored dorsal fin so it is not shrunk. */
    profile.fin[2] = 1.96;
    profile.jaw = [1.16, 1.10, 1.24];
  }
  /* Leviathan Rex final override. The head is the widest point (crown +
   * cheek armor), the abdomen is only moderately swollen, and Tail1/Tail2
   * stay thick so the peduncle reads as a heavy armored root rather than
   * Sharkjira's tapering whip. The dorsal fin is held deliberately low. */
  if (id === LEVIATHAN_ID) {
    profile.head = [1.36, 1, 1.36];
    profile.neck = [1.24, 1, 1.24];
    profile.abdomen = [1.20, 1, 1.20];
    profile.tail = [1.30, 1.00, 1.30];
    profile.tailUpper = [1.16, 1, 1.16];
    profile.fin[2] = 0.86;
    profile.jaw = [1.26, 1.16, 1.34];
  }
  profile.shapeTag = `${head || 'point'}-lane${profile.lane}`;
  return profile;
}
function applyVariantBoneProfile(root, template, profile) {
  if (template.key !== 'sharky') return [];
  const applied = [];
  const targets = [
    ['Head', profile.head], ['Neck', profile.neck], ['Abdomen', profile.abdomen],
    ['Tail1', profile.tail], ['Tail2', profile.tail], ['Tail3', profile.tailUpper], ['Tail4', profile.tailUpper],
    ['LowerJaw', profile.jaw], ['Fin1.L', profile.fin], ['Fin1.R', profile.fin], ['Fin2.L', profile.fin], ['Fin2.R', profile.fin]
  ];
  for (const [name, factors] of targets) {
    const bone = root.getObjectByName(name); if (!bone) continue;
    bone.scale.multiply(new THREE.Vector3(...factors)); applied.push({ name, scale: factors.slice() });
  }
  return applied;
}
function rows() { return host.RFD?.SHARKS || RF.RFD?.SHARKS || RF.SHARKS || []; }
function baseForDef(def) {
  /* Rev 14: an explicit sil.model wins over the head-tag routing. Unknown
   * keys fall through to the tag rules rather than throwing, so a data row
   * naming an asset this build does not ship still renders. */
  const authored = String(def?.sil?.model || '');
  if (authored && MODEL_FILES[authored]) return authored;
  const head = String(def?.sil?.head || '');
  if (head === 'goblin' || String(def?.id || '') === 'goblin') return 'goblinshark';
  if (head === 'angler') return 'anglerfish';
  if (head === 'piranha') return 'piranha';
  // whale.glb is a clean silhouette but has no readable cartoon mouth. Keep
  // the new face and make whale/kaiju rows bulky in buildLoadedRig().
  return 'sharky';
}
function patternId(def) { return PATTERN_IDS[String(def?.sil?.pattern || 'plain')] ?? 0; }
function assetUrl(file) { return new URL(`./assets/models/${file}`, import.meta.url).href; }
function findSkinned(root) { let found = null; root.traverse((o) => { if (!found && o.isSkinnedMesh) found = o; }); return found; }
function findMeshes(root) { const out = []; root.traverse((o) => { if (o.isMesh) out.push(o); }); return out; }
function copyTransform(from, to) {
  to.position.copy(from.position); to.quaternion.copy(from.quaternion); to.scale.copy(from.scale);
  to.matrix.copy(from.matrix); to.matrixAutoUpdate = from.matrixAutoUpdate;
}

function measureBox(root) {
  root.updateMatrixWorld(true);
  const out = new THREE.Box3().makeEmpty();
  root.traverse((object) => {
    if (!object.isMesh) return;
    /* The Rev 13 face overlay is cosmetic and must never drive the
     * authoritative length normalization, or a slightly proud eye/tooth
     * would rescale the whole shark. */
    if (object.userData.rfExcludeFromBounds) return;
    if (object.isSkinnedMesh) {
      /* Rev 14: THREE.SkinnedMesh.computeBoundingBox() walks every vertex
       * THROUGH its bone matrices, so what it returns is the box of the
       * currently POSED mesh, not of the mesh as authored. For the Sharky
       * family that is harmless because their bind pose is identity-ish and
       * the posed box tracks the hull. A shark_bake.py rig is different: its
       * bind pose carries real bone rotations (Tail3 alone holds a -90 deg X
       * quaternion) and a chain of +local-Y offsets, so the skinned box comes
       * back effectively rotated and inflated - measured on textured_test,
       * a true geometry box of x0.33 y0.37 z1.00 reported as x0.33 y1.00
       * z0.86. Feeding that to the length normalization scaled the shark off
       * its own long axis and rolled it in frame.
       *
       * The geometry box is the honest measure of the authored body, and the
       * skinned box only differs from it when bones have moved the mesh. So
       * prefer the geometry box, and fall back to the skinned box when the
       * mesh has no geometry bounds to read. The swim wave and jaw gape are
       * small deflections about this box, which is exactly the behaviour the
       * length contract wants: a stable body length that does not breathe
       * with the animation. */
      /* Scoped to the baked rigs by an explicit per-mesh opt-in. The Sharky
       * family keeps the posed box it has always used: its procedural face
       * overlay is FITTED against that box, and swapping it there moves every
       * eye and tooth. Only a rig whose bind pose actually misreports gets
       * the geometry box. */
      if (object.userData.rfBindPoseBounds && object.geometry?.attributes?.position) {
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        out.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
      } else {
        if (!object.userData.rfFrozenBounds) object.computeBoundingBox();
        if (object.boundingBox) out.union(object.boundingBox.clone().applyMatrix4(object.matrixWorld));
      }
    } else if (object.geometry?.boundingBox) out.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    else out.expandByObject(object);
  });
  return out;
}
/* Rev 15: collapse a multi-PRIMITIVE glTF mesh back into one mesh.
 *
 * The Quaternius low-poly assets (goblinshark, anglerfish, shark, piranha...)
 * author ONE glTF mesh carrying several primitives, one per material, all
 * bound to the same skin. GLTFLoader expands that into N sibling SkinnedMesh
 * objects named `<Mesh>_1..<Mesh>_n`. The headless decoder in this file does
 * NOT: parsedGeometry() merges the primitives into a single geometry with
 * material groups and a per-vertex rfSlot attribute, which is why every
 * selftest gate passed while the BROWSER was broken.
 *
 * The divergence is not cosmetic. Everything downstream treats
 * `skinnedMeshes[0]` as THE body: the length normalization measures it, the
 * face overlay is fitted to it, the shooter frames on rig.parts.body. With
 * the split meshes that "body" is whichever primitive happens to be first -
 * on goblinshark it is a fin, boxing 19.7 x 21.2 x 64.5 against a true body
 * of 113.3 x 73.5 x 102.3. The r15-doc shooter solved its camera distance
 * from that fin and put the camera INSIDE the shark, which is the flat
 * untextured blob filling shark_goblin.png / shark_gulperfiend.png.
 *
 * So merge here, at template prep, and make the browser produce exactly the
 * shape the Node path already produces: one SkinnedMesh, an array material,
 * geometry groups per source material, and rfSlot = source material index. */
function mergePrimitiveSiblings(scene, key) {
  const groups = new Map();
  scene.traverse((object) => {
    if (!object.isSkinnedMesh || !object.geometry?.attributes?.position) return;
    /* Only siblings that share a parent AND a skeleton can be one mesh. */
    const parent = object.parent; if (!parent) return;
    const id = `${parent.uuid}|${object.skeleton?.uuid || 'none'}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(object);
  });
  for (const siblings of groups.values()) {
    if (siblings.length < 2) continue;
    const parent = siblings[0].parent, skeleton = siblings[0].skeleton;
    const geometries = [], materials = [];
    let ok = true;
    for (const mesh of siblings) {
      const geometry = mesh.geometry.clone();
      /* Every merged geometry must carry the same attribute set or
       * mergeGeometries() refuses. uv is the only optional one on these. */
      if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
      if (!geometry.getIndex()) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
      const slot = materials.length;
      geometry.setAttribute('rfSlot', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(slot), 1));
      /* The primitive's own node transform has to be baked in, or a
       * primitive parented with an offset lands in the wrong place once it
       * shares the merged mesh's single transform. */
      mesh.updateMatrix();
      if (!mesh.matrix.equals(new THREE.Matrix4())) geometry.applyMatrix4(mesh.matrix);
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (!material) { ok = false; break; }
      materials.push(material);
      geometries.push(geometry);
    }
    if (!ok) continue;
    const merged = mergeGeometries(geometries, true);
    if (!merged) { console.warn(`${key}: primitive merge failed, keeping split meshes`); continue; }
    merged.computeBoundingBox(); merged.computeBoundingSphere();
    merged.userData.rfSlotNames = materials.map((material) => String(material?.name || 'Body'));
    const body = new THREE.SkinnedMesh(merged, materials);
    body.name = String(siblings[0].name || `${key} body`).replace(/_\d+$/, '');
    /* Identity transform: every primitive's own matrix was baked into its
     * geometry above, so the merged mesh must not re-apply one. */
    body.matrixAutoUpdate = true;
    body.bind(skeleton, siblings[0].bindMatrix.clone());
    body.frustumCulled = false;
    for (const mesh of siblings) parent.remove(mesh);
    parent.add(body);
    scene.userData.rfMergedPrimitives = true;
  }
  return scene;
}
/* ---------------------------------------------------------------------------
 * Rev 15 ORIENTATION RESOLVER (lane ORIENT).
 *
 * ONE authoritative answer per model, computed once, cached by model key, and
 * applied at template load. Replaces the Rev 14/15 pile of conditional laws
 * (a TEXTURED_KEYS branch, a merged-primitive branch, a NOSE_FLIP_KEYS set and
 * a hard-coded goblinshark override) that between them produced SIX different
 * rest orientations across the 29 models - the owner's "all random and mostly
 * wrong".
 *
 * THE TARGET FRAME is fixed by the engine, not by taste:
 *   engine3d.js renderPlayer() spins the rig group 180 degrees about WORLD Y
 *   to face left, and rolls bank about WORLD X. A Y-spin only keeps the belly
 *   down if dorsal is +Y, and world3d.js:161 states "bakes are nose-right".
 *   => NOSE +X, DORSAL +Y. (The note at the old :1141 claiming "dorsal is
 *   world z" described only the frame after the conditional roll fired, which
 *   is why downstream consumers each re-measured and each got a different
 *   answer.)
 *
 * HOW EACH AXIS IS DECIDED, strongest evidence first:
 *
 * 1. LONG AXIS - the largest BIND-POSE extent. Skinned bounding boxes are
 *    inflated by the bone matrices (a shark_bake.py spine is a chain of
 *    +local-Y translations and reports a Y extent longer than the real
 *    nose-to-tail Z), so the axis is taken from raw geometry, never from
 *    measureBox(). Unchanged from Rev 14; it was the one correct part.
 *
 * 2. DORSAL AXIS + SIGN - the LOWER JAW BONE, where the rig has one.
 *    The lower jaw physically hangs BELOW the snout, so (jaw - head) points
 *    DOWN in model space; dorsal is its negation. This is a direct physical
 *    readout, exact on all 15 shark_bake.py rigs plus sharky, and it is what
 *    the fin-spike and vertex-skewness metrics were trying and failing to
 *    approximate. Verified against the known-good reference: sharky's jaw
 *    sits at y-0.0286 relative to its head.
 *
 *    Measured consequence: 12 of the 15 baked rigs (blueshark, bullhead,
 *    dogfish, greatwhite_cy, mako, megalodonrex, scallopedhammer, smoothhound,
 *    thresher, tiger_nu, whaler, whitepointer) had their jaw ABOVE the head
 *    under the old law - i.e. they were rendering BELLY-UP - while tigershark,
 *    smoothhammer and textured_test were upright. That single split explains
 *    most of the roster.
 *
 * 3. DORSAL fallback, for rigs with no jaw bone (the Quaternius Main1..Main6
 *    rigs and the fish): the one-sided FIN SPIKE. Over the middle 60% of the
 *    long axis, bin the hull and in each bin take the body centreline as the
 *    MEDIAN of the transverse coordinate - the median is robust to a one-sided
 *    fin, which is exactly why the old code's bbox-centre and world-origin
 *    versions failed (a bbox centre sits BETWEEN the extremes by construction,
 *    so its "asymmetry" is ~0 for every model). Dorsal is the side whose
 *    extreme reaches furthest beyond that centreline; pectorals are paired and
 *    cancel.
 *
 * 4. DORSAL fallback-of-last-resort, when the spike score is degenerate
 *    (|score| < SPIKE_DEGENERATE - short-finned bakes): the SKEWNESS of the
 *    transverse vertex distribution about its median. A back carries a long
 *    thin tail of fin vertices; a belly is blunt.
 *
 * 5. NOSE SIGN - the HEAD/TAIL bones when present, else the GIRTH profile:
 *    bin along the long axis and compare mean cross-section radius of the two
 *    end fifths (skipping the outermost bin, which is snout tip on one side
 *    and caudal sheet on the other). The head end is a thicker skull.
 *    Vertex COUNT is deliberately NOT used: it measures how much detail the
 *    artist spent on an end, not how thick it is, and it flipped the goblin
 *    tail-first (549 verts in the head bin against 116 at the snout).
 *
 * The result is a single quaternion applied once to the scene. No per-row
 * work, no per-model special cases in the control flow.
 * ------------------------------------------------------------------------- */
const SPIKE_DEGENERATE = 0.08;
const orientationCache = new Map();

/* Every hull vertex in the scene's CURRENT world frame, plus its box. */
function orientSamples(meshes) {
  const points = [], v = new THREE.Vector3();
  for (const mesh of meshes) {
    if (mesh.userData.rfExcludeFromBounds) continue;
    const position = mesh.geometry?.attributes?.position; if (!position) continue;
    /* Stride large hulls: orientation is a gross-shape question and 8k
     * samples decide it identically to 200k, at a fraction of the cost. */
    const step = Math.max(1, Math.floor(position.count / 8000));
    for (let i = 0; i < position.count; i += step) points.push(v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).clone());
  }
  const box = new THREE.Box3(); for (const p of points) box.expandByPoint(p);
  return { points, box, size: box.getSize(new THREE.Vector3()) };
}
function orientMedian(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b), mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
/* One-sided fin spike about the per-bin MEDIAN centreline. Returns a signed
 * score in -1..1: positive means the hull reaches further in +axis. */
function orientSpike(points, box, size, axis) {
  const BINS = 12, x0 = box.min.x + size.x * 0.2, x1 = box.min.x + size.x * 0.8, span = (x1 - x0) || 1;
  const bins = Array.from({ length: BINS }, () => []);
  for (const p of points) { if (p.x < x0 || p.x > x1) continue; bins[Math.max(0, Math.min(BINS - 1, Math.floor((p.x - x0) / span * BINS)))].push(p[axis]); }
  let positive = 0, negative = 0, used = 0;
  for (const bin of bins) {
    if (bin.length < 8) continue;
    const centre = orientMedian(bin);
    let hi = 0, lo = 0;
    for (const value of bin) { const d = value - centre; if (d > hi) hi = d; if (-d > lo) lo = -d; }
    positive += hi; negative += lo; used++;
  }
  if (!used) return 0;
  positive /= used; negative /= used;
  return (positive - negative) / Math.max(positive + negative, 1e-6);
}
/* Third moment about the median: the degenerate-spike tiebreak. */
function orientSkew(points, box, size, axis) {
  const x0 = box.min.x + size.x * 0.2, x1 = box.min.x + size.x * 0.8, values = [];
  for (const p of points) { if (p.x < x0 || p.x > x1) continue; values.push(p[axis]); }
  if (values.length < 32) return 0;
  const centre = orientMedian(values);
  let m2 = 0, m3 = 0;
  for (const value of values) { const d = value - centre; m2 += d * d; m3 += d * d * d; }
  m2 /= values.length; m3 /= values.length;
  const sd = Math.sqrt(m2);
  return sd > 1e-9 ? m3 / (sd * sd * sd) : 0;
}
/* Which end is the HEAD, for rigs with no Head/Tail bones.
 *
 * Returns > 0 when the +x end is the head.
 *
 * NOT by radius, and NOT by vertex count - both were tried and both pick the
 * tail on these rigs:
 *   - max cross-section RADIUS is won by the caudal fin, whose lobes reach
 *     further from the spine than a skull does. (This is what shipped first
 *     and it is why goblin swam backwards: girthBias came out -0.0117, a
 *     meaningless margin produced by two fin lobes.)
 *   - vertex COUNT measures how much detail the artist spent on an end, not
 *     how thick it is (the goblin's head bin holds 549 verts against 116 at
 *     the snout).
 *
 * Use SOLIDITY instead. A caudal fin is a thin vertical SHEET: tall in y,
 * nearly flat in z. A head is solid in both. So per bin take depth/height,
 * and the end whose cross-section is genuinely three-dimensional is the head.
 * Measured on goblinshark: 1.48-1.54 through the head bins against 0.23 and
 * 0.07 in the last two tail bins - an order of magnitude, not a coin toss. */
function orientGirthBias(points, box, size) {
  const BINS = 10;
  const loY = new Float64Array(BINS).fill(Infinity), hiY = new Float64Array(BINS).fill(-Infinity);
  const loZ = new Float64Array(BINS).fill(Infinity), hiZ = new Float64Array(BINS).fill(-Infinity);
  const count = new Float64Array(BINS);
  for (const p of points) {
    let bi = Math.floor((p.x - box.min.x) / (size.x || 1) * BINS);
    bi = Math.max(0, Math.min(BINS - 1, bi));
    count[bi]++;
    if (p.y < loY[bi]) loY[bi] = p.y; if (p.y > hiY[bi]) hiY[bi] = p.y;
    if (p.z < loZ[bi]) loZ[bi] = p.z; if (p.z > hiZ[bi]) hiZ[bi] = p.z;
  }
  const solidity = (bi) => {
    if (!count[bi]) return 0;
    const h = hiY[bi] - loY[bi], d = hiZ[bi] - loZ[bi];
    return d / Math.max(h, 1e-6);
  };
  /* Compare the outer thirds, skipping the very end bin (snout tip on one
   * side, fin edge on the other - both unrepresentative). */
  let lo = 0, hi = 0, loN = 0, hiN = 0;
  for (let i = 1; i < 3; i++) {
    if (count[i]) { lo += solidity(i); loN++; }
    if (count[BINS - 1 - i]) { hi += solidity(BINS - 1 - i); hiN++; }
  }
  lo = loN ? lo / loN : 0; hi = hiN ? hi / hiN : 0;
  return hi - lo;
}
/* LATERAL AXIS, from the PECTORAL PAIR.
 *
 * The jaw bone fixes which way is down, but only when the jaw is actually
 * off the roll axis. On the r15 re-bakes (mako_r15, tiger_nu_r15) it is not:
 * they are authored long-axis Z with the dorsal on X, so after the long-axis
 * rotation the jaw sits exactly ON the view axis and (jaw - head) comes out
 * [0, -0.085, 0] - indistinguishable from a correctly-oriented rig. Every
 * one of those rows shipped rolled 90 degrees (plan view: pectorals splayed
 * top and bottom, dorsal pointing sideways) while the jaw test read a
 * confident +1.0. A single cue on the symmetry axis is ambiguous at exactly
 * 90 degrees, so a second, INDEPENDENT cue is required.
 *
 * The pectorals are that cue, because they are the one PAIRED structure on
 * the body: the hull reaches about equally far both ways along the lateral
 * axis, while the dorsal fin and the caudal lobes are one-sided. So do not
 * measure extent (that picks the tall dorsal fin and mis-flags correct rigs -
 * measured: a raw max-extent test wrongly flagged whitepointer, dogfish and
 * thresher). Measure BALANCE: over the pectoral band, per transverse axis,
 * take min(reach+, reach-) / max(reach+, reach-) about the band's median
 * centreline. The lateral axis is the balanced one.
 *
 * Measured separation is unambiguous - rolled rigs read Ybal 0.95-1.00
 * against Zbal 0.28-0.37, correct rigs the other way round. Returns null when
 * the band is too thin to judge, so a degenerate mesh falls back to the jaw. */
function orientLateralAxis(points, box, size) {
  const x1 = box.max.x - size.x * 0.28, x0 = box.max.x - size.x * 0.65;
  const band = [];
  for (const p of points) if (p.x >= x0 && p.x <= x1) band.push(p);
  if (band.length < 40) return null;
  const centreY = orientMedian(band.map((p) => p.y)), centreZ = orientMedian(band.map((p) => p.z));
  const balance = (axis, centre) => {
    let hi = 0, lo = 0;
    for (const p of band) { const d = p[axis] - centre; if (d > hi) hi = d; if (-d > lo) lo = -d; }
    const span = hi + lo;
    return span > 1e-9 ? { bal: Math.min(hi, lo) / Math.max(hi, lo || 1e-9), span } : null;
  };
  const y = balance('y', centreY), z = balance('z', centreZ);
  if (!y || !z) return null;
  /* Require a real margin: a near-tie is not evidence and must not override
   * the jaw. */
  if (Math.abs(y.bal - z.bal) < 0.12) return null;
  return { axis: y.bal > z.bal ? 'y' : 'z', balY: y.bal, balZ: z.bal };
}
/* The authoritative resolver. Returns the decision record for a model key,
 * computing it at most once. `scene` must be in its AUTHORED frame (no
 * orientation rotation applied yet). */
function resolveOrientation(scene, meshes, key) {
  const cacheKey = String(key || '');
  if (cacheKey && orientationCache.has(cacheKey)) return orientationCache.get(cacheKey);

  /* --- 1. long axis, from bind-pose geometry only --- */
  const authored = orientSamples(meshes);
  const a = authored.size;
  const longAxis = a.y >= a.x && a.y >= a.z ? 'y' : a.z > a.x ? 'z' : 'x';

  /* --- the rotation that carries the long axis onto world +x --- */
  const toLong = new THREE.Euler(0, 0, 0);
  if (longAxis === 'y') toLong.z = -Math.PI / 2; else if (longAxis === 'z') toLong.y = Math.PI / 2;
  const longQuat = new THREE.Quaternion().setFromEuler(toLong);

  /* Re-express the authored samples in the long-axis-aligned frame, so the
   * dorsal and nose tests below all run in one consistent space. */
  const points = authored.points.map((p) => p.clone().applyQuaternion(longQuat));
  const box = new THREE.Box3(); for (const p of points) box.expandByPoint(p);
  const size = box.getSize(new THREE.Vector3());

  /* --- 2/3/4. dorsal axis and sign --- */
  const jawBone = scene.getObjectByName('LowerJaw') || scene.getObjectByName('Jaw');
  const headBone = scene.getObjectByName('Head') || scene.getObjectByName('Nose');
  let dorsal = null, dorsalSource = '';
  if (jawBone && headBone) {
    /* (jaw - head) points DOWN; dorsal is its negation, snapped to whichever
     * transverse axis dominates. Measured in the long-aligned frame. */
    const jaw = new THREE.Vector3().setFromMatrixPosition(jawBone.matrixWorld).applyQuaternion(longQuat);
    const head = new THREE.Vector3().setFromMatrixPosition(headBone.matrixWorld).applyQuaternion(longQuat);
    const down = jaw.sub(head);
    /* Only the transverse components mean anything: a jaw is also forward of
     * the head bone, and that x component must not vote. */
    if (Math.abs(down.y) >= Math.abs(down.z)) { if (Math.abs(down.y) > 1e-6) { dorsal = { axis: 'y', sign: down.y > 0 ? -1 : 1 }; dorsalSource = 'jaw bone'; } }
    else if (Math.abs(down.z) > 1e-6) { dorsal = { axis: 'z', sign: down.z > 0 ? -1 : 1 }; dorsalSource = 'jaw bone'; }
  }
  let spikeY = 0, spikeZ = 0, skewY = 0, skewZ = 0;
  if (!dorsal) {
    spikeY = orientSpike(points, box, size, 'y'); spikeZ = orientSpike(points, box, size, 'z');
    const axis = Math.abs(spikeY) >= Math.abs(spikeZ) ? 'y' : 'z';
    const score = axis === 'y' ? spikeY : spikeZ;
    if (Math.abs(score) >= SPIKE_DEGENERATE) { dorsal = { axis, sign: score > 0 ? 1 : -1 }; dorsalSource = 'fin spike'; }
    else {
      /* Degenerate spike (short fins: tigershark, whitepointer and the fish).
       * Fall through to distribution skewness on the same axis. */
      skewY = orientSkew(points, box, size, 'y'); skewZ = orientSkew(points, box, size, 'z');
      const sk = axis === 'y' ? skewY : skewZ;
      dorsal = { axis, sign: sk >= 0 ? 1 : -1 }; dorsalSource = 'skewness (degenerate spike)';
    }
  }

  /* --- 2b. CROSS-CHECK the dorsal axis against the pectoral pair ---
   *
   * The dorsal axis and the lateral axis must be perpendicular, so the
   * pectoral pair independently names which transverse axis is lateral, and
   * therefore which is dorsal. When the two cues disagree, the pectorals win:
   * the disagreement only ever happens when the jaw is sitting ON the roll
   * axis, which is exactly the case the jaw cannot resolve (mako_r15 and
   * tiger_nu_r15 both reported a textbook jaw delta of [0, -0.085, 0] while
   * rendering in plan view). The pectorals are never on the roll axis. */
  const lateral = orientLateralAxis(points, box, size);
  let dorsalCrossCheck = 'not available';
  if (lateral) {
    const wantDorsal = lateral.axis === 'y' ? 'z' : 'y';
    if (dorsal.axis === wantDorsal) dorsalCrossCheck = 'agrees';
    else {
      /* Re-pick the sign on the corrected axis from the strongest evidence
       * available for it, rather than carrying over a sign measured on the
       * wrong axis. */
      const spike = orientSpike(points, box, size, wantDorsal);
      let sign;
      if (Math.abs(spike) >= SPIKE_DEGENERATE) sign = spike > 0 ? 1 : -1;
      else { const sk = orientSkew(points, box, size, wantDorsal); sign = sk >= 0 ? 1 : -1; }
      dorsalCrossCheck = `corrected ${dorsal.axis} -> ${wantDorsal} (pectoral balance y=${lateral.balY.toFixed(2)} z=${lateral.balZ.toFixed(2)})`;
      dorsal = { axis: wantDorsal, sign };
      dorsalSource += ' + pectoral correction';
    }
  }

  /* --- the roll that carries the dorsal direction onto world +y --- */
  const dorsalVec = new THREE.Vector3(); dorsalVec[dorsal.axis] = dorsal.sign;
  /* Rotate about world x (the long axis) only, so the nose stays on x. */
  let roll = 0;
  if (dorsal.axis === 'y') roll = dorsal.sign > 0 ? 0 : Math.PI;
  else roll = dorsal.sign > 0 ? -Math.PI / 2 : Math.PI / 2;
  const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), roll);

  /* --- 5. nose sign, measured after the roll (girth is roll-invariant, but
   * the bones must be read in the final frame) --- */
  const rolled = points.map((p) => p.clone().applyQuaternion(rollQuat));
  const rBox = new THREE.Box3(); for (const p of rolled) rBox.expandByPoint(p);
  const rSize = rBox.getSize(new THREE.Vector3());
  const tailBone = scene.getObjectByName('Tail3') || scene.getObjectByName('Tail2') || scene.getObjectByName('Tail1');
  const total = new THREE.Quaternion().copy(rollQuat).multiply(longQuat);
  let flip = false, noseSource = '', girthBias = 0;
  if (headBone && tailBone) {
    const head = new THREE.Vector3().setFromMatrixPosition(headBone.matrixWorld).applyQuaternion(total);
    const tail = new THREE.Vector3().setFromMatrixPosition(tailBone.matrixWorld).applyQuaternion(total);
    if (Math.abs(head.x - tail.x) > 1e-6) { flip = head.x < tail.x; noseSource = 'head/tail bones'; }
  }
  if (!noseSource) {
    girthBias = orientGirthBias(rolled, rBox, rSize);
    flip = girthBias < 0; noseSource = 'girth profile';
  }
  /* The nose flip is a 180 spin about the DORSAL axis (world +y after the
   * roll), never about local y and never about z: spinning about anything
   * else rolls the shark as it turns it, which is the Rev 14.1 bug. */
  const flipQuat = flip ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI) : new THREE.Quaternion();

  const quaternion = new THREE.Quaternion().copy(flipQuat).multiply(rollQuat).multiply(longQuat);
  const record = {
    key: cacheKey, axis: longAxis, dorsalAxis: dorsal.axis, dorsalSign: dorsal.sign, dorsalSource,
    dorsalCrossCheck, lateralAxis: lateral ? lateral.axis : null,
    roll, flip, noseSource, girthBias: +girthBias.toFixed(4),
    spikeY: +spikeY.toFixed(4), spikeZ: +spikeZ.toFixed(4), skewY: +skewY.toFixed(4), skewZ: +skewZ.toFixed(4),
    quaternion
  };
  if (cacheKey) orientationCache.set(cacheKey, record);
  return record;
}
function prepareTemplate(scene, animations = [], key = '') {
  mergePrimitiveSiblings(scene, key);
  const meshes = findMeshes(scene), skinnedMeshes = meshes.filter((object) => object.isSkinnedMesh);
  const source = skinnedMeshes[0] || meshes[0];
  if (!source) throw new Error(`${key}: no mesh`);
  /* Mark the baked rigs before ANY measurement happens, so the very first
   * measureBox() in this function already reads their bind-pose bounds. */
  if (TEXTURED_KEYS.has(String(key || ''))) for (const mesh of meshes) mesh.userData.rfBindPoseBounds = true;
  const isSkinned = skinnedMeshes.length > 0;
  scene.updateMatrixWorld(true);
  const clip = animations?.find((a) => /swim(?![_a-z])/i.test(a.name || '') || /swimming_normal/i.test(a.name || '')) || animations?.find((a) => /swim|swimming/i.test(a.name || '')) || animations?.[0] || null;
  if (isSkinned && clip) { const mixer = new THREE.AnimationMixer(scene); mixer.clipAction(clip).play(); mixer.update(0); scene.updateMatrixWorld(true); }
  const initialBox = measureBox(scene), initialSize = initialBox.getSize(new THREE.Vector3());
  /* Rev 15 lane ORIENT: ONE resolver decides the whole orientation.
   *
   * Everything that used to live here - the bind-pose axis law, the
   * conditional roll law with its TEXTURED_KEYS/merged-primitive split, the
   * NOSE_FLIP_KEYS girth test with its hard-coded goblinshark override, and
   * the Head/Tail bone spin - is now resolveOrientation() above, computed
   * once per model key and cached. It returns a single quaternion that puts
   * NOSE +X and DORSAL +Y, which is the frame engine3d.js renderPlayer()
   * requires (it faces left by spinning 180 about world Y, which only keeps
   * the belly down when dorsal is +Y).
   *
   * The old code applied its rotations incrementally with rotateOnWorldAxis
   * between measurements, so each law measured a frame the previous law had
   * already disturbed and the per-model answers diverged (measured: six
   * distinct rest orientations across 29 models). The resolver measures the
   * AUTHORED frame once and composes one rotation. */
  const orientation = resolveOrientation(scene, meshes, key);
  const axis = orientation.axis;
  const unitScale = 1 / Math.max(initialSize.x, initialSize.y, initialSize.z, 1e-5);
  scene.scale.setScalar(unitScale);
  scene.position.sub(initialBox.getCenter(new THREE.Vector3()).multiplyScalar(unitScale));
  scene.quaternion.premultiply(orientation.quaternion);
  scene.position.applyQuaternion(orientation.quaternion);
  scene.updateMatrixWorld(true);
  scene.userData.rfOrientation = orientation;
  const normalizedBox = measureBox(scene);
  const materials = [];
  for (const mesh of meshes) for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) if (material && !materials.includes(material)) materials.push(material);
  const sourceMaterials = (Array.isArray(source.material) ? source.material : [source.material]).map((material) => String(material?.name || 'Body'));
  /* Rev 14 bind-space up axis.
   *
   * The countershade ramp and the wet-specular ramp both need to know which
   * way is UP in the mesh's own bind space, because that is the only frame
   * that stays welded to the body while the swim wave and jaw gape move
   * vertices around. Which bind axis that is depends entirely on how the
   * asset was authored, and guessing it wrong is silent: the ramp still
   * compiles and still renders, it just modulates along a meaningless
   * direction and the countershade measures flat. (Measured exactly that on
   * textured_test: assuming bind Y gave a top-to-bottom flank gradient of
   * 1.07x, effectively none, because bind Y correlates 0.015 with world up
   * while bind -X correlates -1.000.)
   *
   * So MEASURE it rather than assume: correlate each bind axis against world
   * up across the mesh and take the strongest, with its sign. Emitted as a
   * vec3 the shader dots against, so any bake orientation works and no axis
   * is hard-coded. */
  const bindUp = (() => {
    const position = source.geometry?.attributes?.position;
    if (!position) return new THREE.Vector3(0, 1, 0);
    const local = new THREE.Vector3(), world = new THREE.Vector3(), count = position.count;
    let best = new THREE.Vector3(0, 1, 0), bestScore = 0;
    for (const axis of ['x', 'y', 'z']) {
      let sumAB = 0, sumA = 0, sumB = 0, sumAA = 0, sumBB = 0;
      for (let i = 0; i < count; i++) {
        local.fromBufferAttribute(position, i); world.copy(local).applyMatrix4(source.matrixWorld);
        const a = local[axis], b = world.y;
        sumAB += a * b; sumA += a; sumB += b; sumAA += a * a; sumBB += b * b;
      }
      const denominator = Math.sqrt((count * sumAA - sumA * sumA) * (count * sumBB - sumB * sumB));
      const correlation = denominator > 1e-9 ? (count * sumAB - sumA * sumB) / denominator : 0;
      if (Math.abs(correlation) > Math.abs(bestScore)) {
        bestScore = correlation;
        best = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0).multiplyScalar(correlation > 0 ? 1 : -1);
      }
    }
    return best;
  })();
  /* Half-extent of the body along that axis, so the ramp can be normalized
   * into 0..1 instead of depending on the asset's authored scale. */
  const bindUpExtent = (() => {
    const position = source.geometry?.attributes?.position;
    if (!position) return 0.5;
    const local = new THREE.Vector3(); let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < position.count; i++) { const d = local.fromBufferAttribute(position, i).dot(bindUp); if (d < lo) lo = d; if (d > hi) hi = d; }
    return Math.max((hi - lo) * 0.5, 1e-4);
  })();
  return {
    key, scene, body: source, meshes, skinnedMeshes, materials, animations: animations || [], clip, bindUp, bindUpExtent,
    clips: {
      swim: animations?.find((a) => /(?:^|\|)Swim(?:$|\||_)/i.test(a.name || '') && !/Fast|Bite/i.test(a.name || '')) || clip,
      fast: animations?.find((a) => /Swim_Fast|Swimming_Fast/i.test(a.name || '')) || null,
      bite: animations?.find((a) => /Swim_Bite|Attack/i.test(a.name || '')) || null,
      death: animations?.find((a) => /Death/i.test(a.name || '')) || null
    },
    isSkinned, axis, unitScale, normalizedSize: normalizedBox.getSize(new THREE.Vector3()),
    normalizedLength: normalizedBox.max.x - normalizedBox.min.x, slotNames: sourceMaterials,
    hasAtlas: materials.some((material) => String(material?.name || '') === 'AtlasMaterial' || !!material?.map)
  };
}
function cloneRigScene(template) {
  const sourceScene = template.scene, clone = sourceScene.clone(true), sourceSkins = [], cloneSkins = [];
  sourceScene.traverse((o) => { if (o.isSkinnedMesh) sourceSkins.push(o); });
  clone.traverse((o) => { if (o.isSkinnedMesh) cloneSkins.push(o); });
  for (let i = 0; i < sourceSkins.length; i++) {
    const source = sourceSkins[i], target = cloneSkins[i]; if (!target || !source.skeleton) continue;
    const bones = source.skeleton.bones.map((bone) => clone.getObjectByName(bone.name));
    if (bones.some((bone) => !bone)) throw new Error('skeleton clone lost a bone');
    target.bind(new THREE.Skeleton(bones, source.skeleton.boneInverses.map((m) => m.clone())), source.bindMatrix.clone(), source.bindMatrixInverse.clone());
  }
  return clone;
}

const personalityGeometryCache = new Map();
function smoothLobe(value, edge0, edge1) {
  const t = clamp((value - edge0) / Math.max(edge1 - edge0, 1e-5), 0, 1);
  return t * t * (3 - 2 * t);
}
function morphBoneRole(name, base) {
  const bone = String(name || '');
  if (/lowerjaw|jaw/i.test(bone)) return 'jaw';
  if (/head|face/i.test(bone) || (base !== 'sharky' && bone === 'Main1')) return 'head';
  if (/neck/i.test(bone) || (base !== 'sharky' && bone === 'Main5')) return 'neck';
  if (/abdomen|center|root/i.test(bone) || (base !== 'sharky' && /Main[23]/.test(bone))) return 'abdomen';
  if (/tail/i.test(bone) || (base !== 'sharky' && /Main[46]/.test(bone))) return 'tail';
  return 'other';
}
function boneInfluenceRoles(geometry, skeleton, base) {
  const skinIndex = geometry.getAttribute('skinIndex'), skinWeight = geometry.getAttribute('skinWeight'), count = geometry.getAttribute('position')?.count || 0;
  const roles = new Array(count);
  if (!skinIndex || !skinWeight || !skeleton?.bones?.length) return roles.fill({ head: 0, neck: 0, abdomen: 0, tail: 0, jaw: 0 });
  for (let i = 0; i < count; i++) {
    const out = { head: 0, neck: 0, abdomen: 0, tail: 0, jaw: 0 };
    for (let c = 0; c < 4; c++) {
      const bone = skeleton.bones[skinIndex.getComponent(i, c)], weight = skinWeight.getComponent(i, c) || 0, role = morphBoneRole(bone?.name, base);
      if (role !== 'other') out[role] += weight;
    }
    const total = out.head + out.neck + out.abdomen + out.tail;
    if (total < 0.04) {
      const p = geometry.getAttribute('position');
      const box = geometry.boundingBox || new THREE.Box3().setFromBufferAttribute(p);
      const u = clamp((p.getY(i) - box.min.y) / Math.max(box.max.y - box.min.y, 1e-5), 0, 1);
      out.head = 1 - smoothLobe(u, 0.12, 0.42);
      out.neck = smoothLobe(u, 0.16, 0.28) * (1 - smoothLobe(u, 0.36, 0.52));
      out.abdomen = smoothLobe(u, 0.28, 0.46) * (1 - smoothLobe(u, 0.66, 0.82));
      out.tail = smoothLobe(u, 0.60, 0.82);
    } else {
      out.head /= total; out.neck /= total; out.abdomen /= total; out.tail /= total;
    }
    const all = out.head + out.neck + out.abdomen + out.tail;
    if (all > 0) { out.head /= all; out.neck /= all; out.abdomen /= all; out.tail /= all; }
    out.jaw = clamp(out.jaw, 0, 1);
    roles[i] = out;
  }
  return roles;
}
function crestGeometryStats(geometry) {
  const position = geometry.getAttribute('position'), crest = geometry.getAttribute('rfCrest'), index = geometry.index;
  if (!position || !crest) return { vertexCount: 0, boundaryEdges: 0, connected: false };
  const flagged = (i) => crest.getX(i) > 0.015, vertices = [];
  for (let i = 0; i < position.count; i++) if (flagged(i)) vertices.push(i);
  const edges = new Set(), boundary = new Set();
  const addEdge = (a, b) => {
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    edges.add(key); if (flagged(a) !== flagged(b)) boundary.add(key);
  };
  const triangleCount = index ? index.count : position.count;
  for (let i = 0; i < triangleCount; i += 3) {
    const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
    addEdge(a, b); addEdge(b, c); addEdge(c, a);
  }
  return { vertexCount: vertices.length, boundaryEdges: boundary.size, meshEdges: edges.size, connected: vertices.length > 0 && boundary.size >= SHARKJIRA_PLATE_STATIONS.length };
}
function minimumFaceNormalDot(geometry, basePositions) {
  const position = geometry.getAttribute('position'), index = geometry.index;
  if (!position || !index || !basePositions) return 1;
  let minimum = 1;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2), ba = new THREE.Vector3(basePositions[a * 3], basePositions[a * 3 + 1], basePositions[a * 3 + 2]), bb = new THREE.Vector3(basePositions[b * 3], basePositions[b * 3 + 1], basePositions[b * 3 + 2]), bc = new THREE.Vector3(basePositions[c * 3], basePositions[c * 3 + 1], basePositions[c * 3 + 2]);
    const current = new THREE.Vector3().subVectors(new THREE.Vector3(position.getX(b), position.getY(b), position.getZ(b)), new THREE.Vector3(position.getX(a), position.getY(a), position.getZ(a))).cross(new THREE.Vector3().subVectors(new THREE.Vector3(position.getX(c), position.getY(c), position.getZ(c)), new THREE.Vector3(position.getX(a), position.getY(a), position.getZ(a))));
    const original = new THREE.Vector3().subVectors(bb, ba).cross(new THREE.Vector3().subVectors(bc, ba));
    const currentLength = current.length(), originalLength = original.length(); if (currentLength > 1e-10 && originalLength > 1e-10) minimum = Math.min(minimum, current.normalize().dot(original.normalize()));
  }
  return minimum;
}
function personalityGeometryFor(sourceMesh, def, templateKey, meshIndex = 0) {
  const id = String(def?.id || ''), key = `${templateKey}:${id}:${meshIndex}`;
  if (personalityGeometryCache.has(key)) return personalityGeometryCache.get(key);
  const geometry = sourceMesh.geometry.clone(), position = geometry.getAttribute('position'), personality = personalityOf(def);
  if (!position || !personality) { personalityGeometryCache.set(key, geometry); return geometry; }
  if (id === 'reef') {
    geometry.userData.rfPersonalityBaked = { id, neutral: true, maxOffset: 0, maxOffsetRatio: 0, vertexCount: position.count, seamFree: true };
    personalityGeometryCache.set(key, geometry); return geometry;
  }
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox, span = Math.max(box.max.y - box.min.y, 1e-5), depth = Math.max(box.max.z - box.min.z, 1e-5), height = depth, centerZ = (box.min.z + box.max.z) * 0.5;
  const roles = boneInfluenceRoles(geometry, sourceMesh.skeleton, templateKey), m = personality.sculpt, surface = personality.surface, seed = hashString(`${id}:sculpt`) * TAU;
  let basePositions = new Float32Array(position.count * 3), genericOffsets = new Float32Array(position.count), maxGeneric = span * 0.18;
  let maxOffset = 0, maxOffsetOutsideCrest = 0, maxCrestOffset = 0;
  for (let i = 0; i < position.count; i++) {
    const original = new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)), next = original.clone(), role = roles[i] || { head: 0, neck: 0, abdomen: 0, tail: 0, jaw: 0 };
    original.toArray(basePositions, i * 3);
    const u = clamp((original.y - box.min.y) / span, 0, 1), head = role.head, neck = role.neck, abdomen = role.abdomen, tail = role.tail, jaw = clamp(role.jaw + head * 0.18, 0, 1);
    const chestLobe = abdomen * (1 - smoothLobe(Math.abs(u - 0.46), 0.18, 0.42)), upper = clamp((original.z - centerZ) / Math.max(height * 0.5, 1e-5), -1, 1), lower = Math.max(0, -upper), upperOnly = Math.max(0, upper);
    const radialScale = 1 + (m.head * head * 0.78 + m.neck * neck * 0.92 + m.chest * chestLobe * 0.82 + m.tail * tail * 0.42) * 0.34;
    next.x *= radialScale; next.z = centerZ + (next.z - centerZ) * (1 + (radialScale - 1) * 0.86);
    next.y -= m.head * span * 0.034 * head;
    next.y -= m.neck * span * 0.020 * neck;
    next.y += m.tail * span * 0.070 * tail * (u - 0.56);
    next.x *= 1 + m.jaw * 0.22 * jaw; next.z -= m.jaw * height * 0.050 * jaw; next.y -= m.underbite * span * 0.110 * jaw; next.z -= m.underbite * height * 0.080 * jaw;
    const brow = head * smoothLobe(upper, 0.05, 0.72); next.y -= m.brow * span * 0.042 * brow; next.x += m.brow * span * 0.016 * brow * (original.x < 0 ? -1 : 1); next.z += Math.abs(m.brow) * height * 0.016 * brow;
    next.z += m.dorsal * height * 0.24 * (abdomen * 0.82 + tail * 0.34) * upperOnly;
    next.z += m.hump * height * 0.26 * chestLobe * upperOnly;
    next.z -= m.sag * height * 0.28 * chestLobe * lower;
    const muscleWave = Math.sin(u * TAU * 3.0 + original.x * 240 + seed) * m.muscle * span * 0.017 * (abdomen * 0.82 + head * 0.18);
    const radial = new THREE.Vector3(original.x, 0, original.z - centerZ).normalize(); next.x += radial.x * muscleWave; next.z += radial.z * muscleWave;
    const reliefAmount = surface.relief + surface.scars * 0.30 + surface.plates * 0.24, surfaceWave = Math.sin(u * TAU * Math.max(0.5, surface.density) * 1.7 + original.x * 180 + seed * 0.7);
    const relief = surfaceWave * reliefAmount * span * 0.014 * (abdomen * 0.78 + head * 0.22);
    next.x += radial.x * relief; next.z += radial.z * relief;
    next.z += surface.plates * height * 0.028 * (0.2 + 0.8 * upperOnly) * (abdomen * 0.75 + tail * 0.25);
    if (id === SHARKJIRA_ID && templateKey === 'sharky') {
      let finVertex = false;
      const skinIndex = geometry.getAttribute('skinIndex'), skinWeight = geometry.getAttribute('skinWeight');
      for (let c = 0; c < 4; c++) if ((skinWeight?.getComponent(i, c) || 0) > 0.18 && /fin/i.test(sourceMesh.skeleton?.bones?.[skinIndex?.getComponent(i, c)]?.name || '')) finVertex = true;
      if (!finVertex) next.z = centerZ + (next.z - centerZ) * 0.78;
    }
    const genericOffset = next.distanceTo(original);
    if (genericOffset > maxGeneric) next.lerp(original, maxGeneric / Math.max(genericOffset, 1e-8));
    const boundedOffset = next.distanceTo(original);
    genericOffsets[i] = boundedOffset; maxOffset = Math.max(maxOffset, boundedOffset); position.setXYZ(i, next.x, next.y, next.z);
  }
  let crest = null;
  if (id === SHARKJIRA_ID && meshIndex === 0) {
    const crestValues = new Float32Array(position.count), crestEdgeValues = new Float32Array(position.count), stationVertices = new Uint32Array(SHARKJIRA_PLATE_STATIONS.length), halfWidth = Math.max((box.max.x - box.min.x) * 0.5, depth * 0.35), plateWidth = 0.052;
    for (let i = 0; i < position.count; i++) {
      const original = new THREE.Vector3(basePositions[i * 3], basePositions[i * 3 + 1], basePositions[i * 3 + 2]), current = new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i));
      const u = clamp((original.y - box.min.y) / span, 0, 1), topness = smoothLobe((original.z - box.min.z) / depth, 0.45, 0.94), centerline = 1 - smoothLobe(Math.abs(original.x) / halfWidth, 0.12, 0.72);
      let plateWeight = 0, plateHeight = 0, plateIndex = -1, nearest = 1;
      for (let stationIndex = 0; stationIndex < SHARKJIRA_PLATE_STATIONS.length; stationIndex++) {
        const distance = Math.abs(u - SHARKJIRA_PLATE_STATIONS[stationIndex]); nearest = Math.min(nearest, distance);
        const spear = clamp(1 - distance / plateWidth, 0, 1), lobeLeft = clamp(1 - Math.abs(distance - plateWidth * 0.36) / (plateWidth * 0.40), 0, 1) * 0.42, lobeRight = clamp(1 - Math.abs(distance + plateWidth * 0.36) / (plateWidth * 0.40), 0, 1) * 0.42, weight = Math.max(spear, lobeLeft, lobeRight);
        if (weight > plateWeight) { plateWeight = weight; plateHeight = SHARKJIRA_PLATE_HEIGHTS[stationIndex]; plateIndex = stationIndex; }
      }
      const ridgeWeight = nearest < 0.070 ? clamp(1 - nearest / 0.070, 0, 1) * 0.16 : 0, crestWeight = Math.max(plateWeight, ridgeWeight) * topness * centerline, crestDelta = Math.min(depth * 0.35, depth * (plateWeight * plateHeight * 0.35 + ridgeWeight * 0.06) * topness * centerline);
      current.z += crestDelta; position.setXYZ(i, current.x, current.y, current.z); crestValues[i] = clamp(crestWeight, 0, 1); crestEdgeValues[i] = smoothLobe(crestWeight, 0.018, 0.085) * (1 - smoothLobe(crestWeight, 0.145, 0.28));
      if (plateIndex >= 0 && crestWeight > 0.015) stationVertices[plateIndex]++; maxCrestOffset = Math.max(maxCrestOffset, crestDelta); maxOffset = Math.max(maxOffset, current.distanceTo(original)); if (crestWeight < 0.015) maxOffsetOutsideCrest = Math.max(maxOffsetOutsideCrest, genericOffsets[i]);
    }
    geometry.setAttribute('rfCrest', new THREE.Float32BufferAttribute(crestValues, 1)); geometry.setAttribute('rfCrestEdge', new THREE.Float32BufferAttribute(crestEdgeValues, 1));
    crest = { plateCount: SHARKJIRA_PLATE_STATIONS.length, stationVertices: Array.from(stationVertices), maxOffset: maxCrestOffset, maxOffsetDepthRatio: maxCrestOffset / depth, minFaceNormalDot: minimumFaceNormalDot(geometry, basePositions), ...crestGeometryStats(geometry) };
  } else {
    maxOffsetOutsideCrest = maxOffset;
  }
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  if (!geometry.getAttribute('rfSlot')) geometry.setAttribute('rfSlot', new THREE.Float32BufferAttribute(new Float32Array(position.count).fill(1), 1));
  geometry.userData.rfPersonalityBaked = { id, neutral: false, maxOffset, maxOffsetRatio: maxOffset / span, maxOffsetOutsideCrest, maxOffsetOutsideCrestRatio: maxOffsetOutsideCrest / span, vertexCount: geometry.getAttribute('position').count, seamFree: true, roleSource: 'skin weights: Head/Neck/Abdomen/Tail/LowerJaw', crest };
  personalityGeometryCache.set(key, geometry); return geometry;
}

const sharkjiraFeatureCache = new Map();
function featureBuilder() {
  const positions = [], indices = [], skinIndices = [], skinWeights = [], kinds = [], edges = [];
  const addVertex = (x, y, z, weights, kind = 0, edge = 1) => {
    positions.push(x, y, z);
    const ids = [0, 0, 0, 0], values = [0, 0, 0, 0];
    let total = 0;
    for (let i = 0; i < Math.min(4, weights.length); i++) { ids[i] = weights[i][0]; values[i] = weights[i][1]; total += values[i]; }
    const inv = total > 1e-6 ? 1 / total : 1; for (let i = 0; i < 4; i++) { skinIndices.push(ids[i]); skinWeights.push(values[i] * inv); }
    kinds.push(kind); edges.push(edge);
    return positions.length / 3 - 1;
  };
  const addTri = (a, b, c) => indices.push(a, b, c);
  const addPrism = (points, xFront, xBack, weightsForY, kind = 0) => {
    const front = points.map(([y, z]) => addVertex(xFront, y, z, weightsForY(y), kind));
    const back = points.map(([y, z]) => addVertex(xBack, y, z, weightsForY(y), kind));
    for (let i = 1; i < points.length - 1; i++) { addTri(front[0], front[i], front[i + 1]); addTri(back[0], back[i + 1], back[i]); }
    for (let i = 0; i < points.length; i++) {
      const next = (i + 1) % points.length;
      addTri(front[i], back[i], back[next]); addTri(front[i], back[next], front[next]);
    }
  };
  const addOcta = (center, radius, weights, kind = 0) => {
    const [x, y, z] = center, v = [
      addVertex(x - radius, y, z, weights, kind), addVertex(x + radius, y, z, weights, kind),
      addVertex(x, y - radius, z, weights, kind), addVertex(x, y + radius, z, weights, kind),
      addVertex(x, y, z - radius, weights, kind), addVertex(x, y, z + radius, weights, kind)
    ];
    [[0, 2, 4], [0, 5, 2], [0, 4, 3], [0, 3, 5], [1, 4, 2], [1, 2, 5], [1, 3, 4], [1, 5, 3]].forEach((tri) => addTri(...tri.map((i) => v[i])));
  };
  const addPyramid = (centerY, baseZ, tipZ, halfY, xFront, xBack, weights, kind = 1) => {
    const base = [
      addVertex(xFront, centerY - halfY, baseZ, weights, kind), addVertex(xBack, centerY - halfY, baseZ, weights, kind),
      addVertex(xBack, centerY + halfY, baseZ, weights, kind), addVertex(xFront, centerY + halfY, baseZ, weights, kind)
    ];
    const tip = addVertex((xFront + xBack) * 0.5, centerY, tipZ, weights, kind);
    for (let i = 0; i < 4; i++) { const next = (i + 1) % 4; addTri(base[i], base[next], tip); }
  };
  const addPlate = (centerY, baseZ, height, halfY, xFront, xBack, weights) => {
    const points = [[centerY - halfY, baseZ], [centerY - halfY * 0.38, baseZ + height * 0.44], [centerY, baseZ + height], [centerY + halfY * 0.36, baseZ + height * 0.36], [centerY + halfY, baseZ]];
    const edge = [1, 0.18, 1, 0.18, 1], front = points.map(([y, z], i) => addVertex(xFront, y, z, weights, 5, edge[i])), back = points.map(([y, z], i) => addVertex(xBack, y, z, weights, 5, edge[i]));
    for (let i = 1; i < points.length - 1; i++) { addTri(front[0], front[i], front[i + 1]); addTri(back[0], back[i + 1], back[i]); }
    for (let i = 0; i < points.length; i++) { const next = (i + 1) % points.length; addTri(front[i], back[i], back[next]); addTri(front[i], back[next], front[next]); }
  };
  const geometry = () => {
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    out.setAttribute('rfKind', new THREE.Float32BufferAttribute(kinds, 1));
    out.setAttribute('rfEdge', new THREE.Float32BufferAttribute(edges, 1));
    out.setIndex(indices); out.computeVertexNormals(); out.computeBoundingBox(); out.computeBoundingSphere();
    return { geometry: out, triangles: indices.length / 3 };
  };
  return { addVertex, addTri, addPrism, addOcta, addPyramid, addPlate, geometry };
}
function sharkjiraBoneIndices(skeleton) {
  const index = (name) => {
    const i = skeleton?.bones?.findIndex((bone) => bone.name === name);
    return i >= 0 ? i : 0;
  };
  return { abdomen: index('Abdomen'), neck: index('Neck'), head: index('Head'), jaw: index('LowerJaw'), tail1: index('Tail1'), tail2: index('Tail2'), tail3: index('Tail3'), tail4: index('Tail4') };
}
function sharkjiraStationWeights(station, bones) {
  const blend = (a, b, t) => [[a, 1 - t], [b, t]];
  if (station < 0.20) return [[bones.neck, 1]];
  if (station < 0.34) return blend(bones.neck, bones.abdomen, (station - 0.20) / 0.14);
  if (station < 0.52) return blend(bones.abdomen, bones.tail1, (station - 0.34) / 0.18);
  if (station < 0.68) return blend(bones.tail1, bones.tail2, (station - 0.52) / 0.16);
  if (station < 0.82) return blend(bones.tail2, bones.tail3, (station - 0.68) / 0.14);
  return blend(bones.tail3, bones.tail4, clamp((station - 0.82) / 0.18, 0, 1));
}
function sharkjiraStationY(box, span, station) {
  /* Station 0 is the Sharky head/nose; station 1 is the caudal end. */
  return box.min.y + span * clamp(station, 0, 1);
}
function sharkjiraBand(bodyGeometry, y, span) {
  const position = bodyGeometry.getAttribute('position'), box = bodyGeometry.boundingBox;
  let top = -Infinity, bottom = Infinity, side = 0, nearest = Infinity;
  for (let i = 0; i < position.count; i++) {
    const distance = Math.abs(position.getY(i) - y);
    if (distance <= span * 0.07 || distance < nearest) {
      if (distance < nearest) { nearest = distance; top = -Infinity; bottom = Infinity; side = 0; }
      top = Math.max(top, position.getZ(i)); bottom = Math.min(bottom, position.getZ(i)); side = Math.max(side, Math.abs(position.getX(i)));
    }
  }
  return { top: Number.isFinite(top) ? top : box.max.z, bottom: Number.isFinite(bottom) ? bottom : box.min.z, side: Math.max(side, span * 0.06) };
}
function sharkjiraFeatureGeometries(body) {
  if (sharkjiraFeatureCache.has(SHARKJIRA_ID)) return sharkjiraFeatureCache.get(SHARKJIRA_ID);
  const geometry = body.geometry; if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox, span = Math.max(box.max.y - box.min.y, 1e-5), bones = sharkjiraBoneIndices(body.skeleton);
  const atomic = featureBuilder();
  /* The hull carries the connectivity marker; this same compact skinned
   * batch carries the camera-facing jagged plate silhouettes so every plate
   * stays bone-bound from Neck through Tail3. */
  const bodyDepth = Math.max(box.max.z - box.min.z, span * 0.30);
  for (let i = 0; i < SHARKJIRA_PLATE_STATIONS.length; i++) {
    const station = SHARKJIRA_PLATE_STATIONS[i], y = sharkjiraStationY(box, span, station), band = sharkjiraBand(geometry, y, span);
    atomic.addPlate(y, band.top - span * 0.085, bodyDepth * SHARKJIRA_PLATE_HEIGHTS[i], span * 0.036, -span * 0.020, span * 0.020, sharkjiraStationWeights(station, bones));
  }
  for (let i = 0; i < 4; i++) {
    const station = 0.20 + i * 0.045, y = sharkjiraStationY(box, span, station), band = sharkjiraBand(geometry, y, span), width = span * 0.025, height = span * 0.08, z = (band.top + band.bottom) * 0.5 + span * 0.012;
    const slash = [[y - width, z + height * 0.55], [y + width * 0.10, z - height * 0.55], [y + width, z - height * 0.31]];
    const x = -band.side * 1.08; atomic.addPrism(slash, x - span * 0.006, x, (py) => sharkjiraStationWeights(clamp((py - box.min.y) / span, 0, 1), bones), 3);
  }
  const throatY = sharkjiraStationY(box, span, 0.22), throatBand = sharkjiraBand(geometry, throatY, span), throatZ = throatBand.bottom - span * 0.006, throatWidth = span * 0.06;
  atomic.addPrism([[throatY - throatWidth, throatZ], [throatY - throatWidth * 0.68, throatZ - span * 0.018], [throatY + throatWidth * 0.70, throatZ - span * 0.018], [throatY + throatWidth, throatZ]], -throatBand.side * 1.09, -throatBand.side * 1.02, (py) => [[bones.head, 0.70], [bones.jaw, 0.30]], 4);
  const eyeStation = 0.18, eyeY = sharkjiraStationY(box, span, eyeStation), eyeBand = sharkjiraBand(geometry, eyeY, span), eyeZ = eyeBand.top - span * 0.08, eyeRadius = span * 0.022, eyeX = eyeBand.side * 1.08;
  atomic.addOcta([-eyeX, eyeY, eyeZ], eyeRadius, [[bones.head, 1]], 2);
  atomic.addOcta([eyeX, eyeY, eyeZ], eyeRadius, [[bones.head, 1]], 2);
  const toothStation = [0.055, 0.095, 0.135, 0.175, 0.215], mouthBand = sharkjiraBand(geometry, eyeY, span), toothSide = Math.max(mouthBand.side * 1.04, span * 0.040), toothBase = mouthBand.bottom + span * 0.012, toothHalfY = span * 0.008;
  for (let i = 0; i < toothStation.length; i++) {
    const y = sharkjiraStationY(box, span, toothStation[i]); atomic.addPyramid(y, toothBase + span * 0.036, toothBase - span * 0.020, toothHalfY, -toothSide, -toothSide * 0.62, [[bones.head, 1]]);
    atomic.addPyramid(y - span * 0.008, toothBase - span * 0.004, toothBase + span * 0.044, toothHalfY * 0.88, -toothSide, -toothSide * 0.62, [[bones.jaw, 1]]);
  }
  const atomicGeometry = atomic.geometry();
  const crest = geometry.userData.rfPersonalityBaked?.crest;
  const result = { atomic: atomicGeometry, plateCount: crest?.plateCount || SHARKJIRA_PLATE_STATIONS.length, plateStations: SHARKJIRA_PLATE_STATIONS.slice(), atomicTriangles: atomicGeometry.triangles, toothTriangles: toothStation.length * 8, bones };
  sharkjiraFeatureCache.set(SHARKJIRA_ID, result); return result;
}
function sharkjiraAtomicMaterial() {
  const pulse = SHARKJIRA_PULSE, color = colorValue(0x0e5d78), glow = colorValue(SHARKJIRA_PALETTE.glow);
  const material = new THREE.MeshStandardMaterial({ color, emissive: glow, emissiveIntensity: 0.55, roughness: 0.30, metalness: 0.05, side: THREE.DoubleSide });
  material.name = 'RF Sharkjira atomic blue plates gills throat eyes'; material.userData.rfAtomicPulse = pulse;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRfAtomicPulse = pulse;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float rfKind;\nattribute float rfEdge;\nvarying float vRfKind;\nvarying float vRfEdge;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRfKind = rfKind;\nvRfEdge = rfEdge;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uRfAtomicPulse;\nvarying float vRfKind;\nvarying float vRfEdge;').replace('#include <color_fragment>', '#include <color_fragment>\nif (vRfKind > 0.5 && vRfKind < 1.5) diffuseColor.rgb = vec3(0.90, 0.97, 1.0);\nif (vRfKind > 4.5) diffuseColor.rgb = vec3(0.018, 0.030, 0.034);').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat rfTooth = step(0.5, vRfKind) - step(1.5, vRfKind);\nfloat rfPlate = step(4.5, vRfKind);\ntotalEmissiveRadiance *= mix(mix(uRfAtomicPulse, 0.08, rfTooth), vRfEdge, rfPlate);');
  };
  material.customProgramCacheKey = () => 'rf-sharkjira-atomic-blue'; material.needsUpdate = true;
  return { material, pulse };
}
function makeSharkjiraFeatures(body) {
  const geometries = sharkjiraFeatureGeometries(body), atomicMaterial = sharkjiraAtomicMaterial(), parent = body.parent;
  const atomic = new THREE.SkinnedMesh(geometries.atomic.geometry, atomicMaterial.material); atomic.name = 'RF Sharkjira atomic spine gills throat eyes'; atomic.renderOrder = 2; atomic.frustumCulled = false; atomic.bind(body.skeleton, body.bindMatrix.clone(), body.bindMatrixInverse.clone());
  parent.add(atomic); parent.updateMatrixWorld(true); atomic.computeBoundingBox(); atomic.userData.rfFrozenBounds = true;
  return { atomic, pulse: atomicMaterial.pulse, plateCount: geometries.plateCount, plateStations: geometries.plateStations, atomicTriangles: geometries.atomicTriangles, toothTriangles: geometries.toothTriangles };
}

const leviathanFeatureCache = new Map();
/* A scute is a LOW, wide, four-sided cap with a flat top facet and a bevel
 * toward the seam. Stacked in two rows it reads as interlocking armor, and
 * it is deliberately the opposite primitive to Sharkjira's tall five-point
 * maple prism. Kind 6 = scute body, kind 7 = seam edge (glowing). */
function leviathanScute(builder, centerY, baseZ, height, halfY, halfX, xCenter, weights) {
  const add = builder.addVertex, tri = builder.addTri;
  const topZ = baseZ + height, capY = halfY * 0.54, capX = halfX * 0.60;
  /* Rev 13 rework: the base ring carried rfEdge 1 and the cap 0.10, so the
   * seam glow interpolated across the ENTIRE side wall and lit up the lower
   * two thirds of every scute. That, not any transparency, is what made the
   * armor read as a glowing pale row floating over the back. The seam is now
   * a genuinely narrow edge: the base ring is tagged kind 6 (opaque armor)
   * like the cap, and only a thin skirt ring just above the base carries
   * kind 7, so the seafoam lives in the crack between scute and hull. */
  const skirtZ = baseZ + height * 0.14;
  const base = [
    add(xCenter - halfX, centerY - halfY, baseZ, weights, 6, 0),
    add(xCenter + halfX, centerY - halfY, baseZ, weights, 6, 0),
    add(xCenter + halfX, centerY + halfY, baseZ, weights, 6, 0),
    add(xCenter - halfX, centerY + halfY, baseZ, weights, 6, 0)
  ];
  const skirt = [
    add(xCenter - halfX * 0.97, centerY - halfY * 0.97, skirtZ, weights, 7, 1),
    add(xCenter + halfX * 0.97, centerY - halfY * 0.97, skirtZ, weights, 7, 1),
    add(xCenter + halfX * 0.97, centerY + halfY * 0.97, skirtZ, weights, 7, 1),
    add(xCenter - halfX * 0.97, centerY + halfY * 0.97, skirtZ, weights, 7, 1)
  ];
  const cap = [
    add(xCenter - capX, centerY - capY, topZ, weights, 6, 0),
    add(xCenter + capX, centerY - capY, topZ, weights, 6, 0),
    add(xCenter + capX, centerY + capY, topZ, weights, 6, 0),
    add(xCenter - capX, centerY + capY, topZ, weights, 6, 0)
  ];
  tri(cap[0], cap[1], cap[2]); tri(cap[0], cap[2], cap[3]);
  for (let i = 0; i < 4; i++) {
    const n = (i + 1) % 4;
    /* base -> skirt is the thin glowing seam; skirt -> cap is opaque armor. */
    tri(base[i], base[n], skirt[n]); tri(base[i], skirt[n], skirt[i]);
    tri(skirt[i], skirt[n], cap[n]); tri(skirt[i], cap[n], cap[i]);
  }
}
function leviathanFeatureGeometries(body) {
  if (leviathanFeatureCache.has(LEVIATHAN_ID)) return leviathanFeatureCache.get(LEVIATHAN_ID);
  const geometry = body.geometry; if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox, span = Math.max(box.max.y - box.min.y, 1e-5), bones = sharkjiraBoneIndices(body.skeleton);
  const bodyDepth = Math.max(box.max.z - box.min.z, span * 0.30);
  const rex = featureBuilder();
  const weightsAt = (station) => sharkjiraStationWeights(station, bones);

  /* 1. Twin scute rows. Two mirrored lines of low interlocking caps. */
  let scuteCount = 0;
  for (let i = 0; i < LEVIATHAN_SCUTE_STATIONS.length; i++) {
    const station = LEVIATHAN_SCUTE_STATIONS[i], y = sharkjiraStationY(box, span, station), band = sharkjiraBand(geometry, y, span);
    /* Rev 13 rework: the scutes read as a row of separate boxes hovering
     * over the back. Two causes, both fixed here.
     *
     * 1. Rooting. `band.top` is the hull's max z AT THE CENTERLINE, but each
     *    scute is pushed out to 0.46 of the half-width, where the hull has
     *    already curved down. Seating a flank scute at the centerline height
     *    left visible daylight under it. Drop the root by an approximate
     *    barrel falloff for the row offset, then sink it further so the base
     *    is genuinely buried in the hull rather than tangent to it.
     * 2. Spacing. halfY 0.030 against a station pitch of 0.08 span left a
     *    gap between every scute, which is what produced the skyline read.
     *    Widen each scute past the half-pitch so consecutive scutes OVERLAP
     *    and the row closes into continuous armor. */
    const falloff = Math.sqrt(Math.max(0, 1 - LEVIATHAN_SCUTE_ROW_OFFSET * LEVIATHAN_SCUTE_ROW_OFFSET));
    const height = bodyDepth * LEVIATHAN_SCUTE_HEIGHTS[i] * 0.62, halfY = span * 0.052, halfX = Math.max(band.side * 0.34, span * 0.024);
    const offset = band.side * LEVIATHAN_SCUTE_ROW_OFFSET;
    const baseZ = band.bottom + (band.top - band.bottom) * falloff - span * 0.052;
    for (const sign of [-1, 1]) {
      leviathanScute(rex, y, baseZ, height, halfY, halfX, sign * offset, weightsAt(station)); scuteCount++;
    }
  }

  /* 2. Broad flat crown / brow ridge. A single wide low slab across the top
   * of the skull, the Rex's signature head read at thumbnail size. */
  const crownStation = 0.145, crownY = sharkjiraStationY(box, span, crownStation), crownBand = sharkjiraBand(geometry, crownY, span);
  /* Rooted well below the hull top so the crown grows OUT of the skull
   * instead of hovering over it, and kept low and wide: a brow ridge, not a
   * hat. Both crown pieces overlap along y so they read as one shelf. */
  const crownZ = crownBand.top - span * 0.105, crownHalfX = crownBand.side * 0.86, crownHalfY = span * 0.072;
  leviathanScute(rex, crownY, crownZ, bodyDepth * 0.088, crownHalfY, crownHalfX, 0, [[bones.head, 1]]);
  /* Brow lip: a forward shelf so the crown overhangs the eyes in profile. */
  const browY = sharkjiraStationY(box, span, 0.098), browBand = sharkjiraBand(geometry, browY, span);
  leviathanScute(rex, browY, browBand.top - span * 0.108, bodyDepth * 0.056, span * 0.052, browBand.side * 0.74, 0, [[bones.head, 1]]);

  /* 3. Armored cheek plates, one per side, angled back from the eye. */
  const cheekY = sharkjiraStationY(box, span, 0.180), cheekBand = sharkjiraBand(geometry, cheekY, span);
  /* Below the eye line, hugging the flank, and roughly a third of the old
   * size: a jaw-hinge plate that frames the face rather than masking it. */
  const cheekZ = cheekBand.bottom + (cheekBand.top - cheekBand.bottom) * 0.34;
  for (const sign of [-1, 1]) {
    const x = sign * cheekBand.side * 0.99;
    const plate = [[cheekY - span * 0.030, cheekZ + span * 0.026], [cheekY + span * 0.030, cheekZ + span * 0.014], [cheekY + span * 0.026, cheekZ - span * 0.026], [cheekY - span * 0.026, cheekZ - span * 0.016]];
    rex.addPrism(plate, x, x + sign * span * 0.010, () => [[bones.head, 1]], 6);
  }

  /* 4. Throat glow band, seafoam, under the underslung jaw. */
  const throatY = sharkjiraStationY(box, span, 0.215), throatBand = sharkjiraBand(geometry, throatY, span);
  const throatZ = throatBand.bottom - span * 0.006, throatWidth = span * 0.080;
  for (const sign of [-1, 1]) {
    rex.addPrism(
      [[throatY - throatWidth, throatZ], [throatY - throatWidth * 0.62, throatZ - span * 0.026], [throatY + throatWidth * 0.66, throatZ - span * 0.026], [throatY + throatWidth, throatZ]],
      sign * throatBand.side * 1.02, sign * throatBand.side * 0.55, () => [[bones.head, 0.66], [bones.jaw, 0.34]], 4);
  }

  /* 5. Eyes, set deep under the crown shelf. */
  const eyeY = sharkjiraStationY(box, span, 0.150), eyeBand = sharkjiraBand(geometry, eyeY, span);
  const eyeZ = eyeBand.top - span * 0.098, eyeRadius = span * 0.020, eyeX = eyeBand.side * 1.04;
  rex.addOcta([-eyeX, eyeY, eyeZ], eyeRadius, [[bones.head, 1]], 2);
  rex.addOcta([eyeX, eyeY, eyeZ], eyeRadius, [[bones.head, 1]], 2);

  /* 6. Oversized tusks on the underslung jaw, plus a smaller upper row.
   * The tusks point UP past the lip: the Rex's other thumbnail tell. */
  const tuskStations = [0.070, 0.108, 0.146];
  const mouthBand = sharkjiraBand(geometry, eyeY, span), toothSide = Math.max(mouthBand.side * 1.02, span * 0.040);
  const toothBase = mouthBand.bottom + span * 0.012;
  let tuskCount = 0;
  for (let i = 0; i < tuskStations.length; i++) {
    const y = sharkjiraStationY(box, span, tuskStations[i]);
    const scale = 1 - i * 0.18;
    for (const sign of [-1, 1]) {
      /* Big lower tusk sweeping upward. */
      rex.addPyramid(y, toothBase - span * 0.010, toothBase + span * 0.098 * scale, span * 0.016 * scale,
        sign * toothSide, sign * toothSide * 0.58, [[bones.jaw, 1]]); tuskCount++;
      /* Small upper tooth. */
      rex.addPyramid(y + span * 0.012, toothBase + span * 0.030, toothBase - span * 0.016, span * 0.008,
        sign * toothSide * 0.96, sign * toothSide * 0.60, [[bones.head, 1]]);
    }
  }

  const rexGeometry = rex.geometry();
  const result = {
    features: rexGeometry, scuteCount, scuteStations: LEVIATHAN_SCUTE_STATIONS.slice(),
    rowOffset: LEVIATHAN_SCUTE_ROW_OFFSET, crownPlates: 2, cheekPlates: 2, tuskCount,
    featureTriangles: rexGeometry.triangles, bones
  };
  leviathanFeatureCache.set(LEVIATHAN_ID, result); return result;
}
function leviathanFeatureMaterial() {
  const pulse = LEVIATHAN_PULSE, color = colorValue(LEVIATHAN_PALETTE.base), glow = colorValue(LEVIATHAN_PALETTE.glow);
  const material = new THREE.MeshStandardMaterial({ color, emissive: glow, emissiveIntensity: 0.34, roughness: 0.44, metalness: 0.08, side: THREE.DoubleSide });
  material.name = 'RF Leviathan Rex crown scutes tusks cheeks throat'; material.userData.rfLeviathanPulse = pulse;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRfRexPulse = pulse;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float rfKind;\nattribute float rfEdge;\nvarying float vRfKind;\nvarying float vRfEdge;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRfKind = rfKind;\nvRfEdge = rfEdge;');
    /* Kind 1 tusk = bone white. Kind 6 scute/cheek body = deep sea-green
     * armor, opaque. Kind 7 seam = the only place the seafoam reaches full
     * strength, so the glow reads as light in the cracks, never a lit body. */
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRfRexPulse;\nvarying float vRfKind;\nvarying float vRfEdge;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nif (vRfKind > 0.5 && vRfKind < 1.5) diffuseColor.rgb = vec3(0.93, 0.96, 0.90);\nif (vRfKind > 5.5) diffuseColor.rgb = vec3(0.062, 0.101, 0.088);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat rfTusk = step(0.5, vRfKind) - step(1.5, vRfKind);\nfloat rfArmor = step(5.5, vRfKind);\ntotalEmissiveRadiance = mix(totalEmissiveRadiance * mix(uRfRexPulse, 0.0, rfTusk) * (1.0 - rfArmor) + totalEmissiveRadiance * vRfEdge * uRfRexPulse * rfArmor, vec3(0.34, 0.36, 0.31), rfTusk);');
  };
  material.customProgramCacheKey = () => 'rf-leviathan-rex-seafoam'; material.needsUpdate = true;
  return { material, pulse };
}
function makeLeviathanFeatures(body) {
  const geometries = leviathanFeatureGeometries(body), featureMaterial = leviathanFeatureMaterial(), parent = body.parent;
  const rex = new THREE.SkinnedMesh(geometries.features.geometry, featureMaterial.material);
  rex.name = 'RF Leviathan Rex crown scutes tusks'; rex.renderOrder = 2; rex.frustumCulled = false;
  rex.bind(body.skeleton, body.bindMatrix.clone(), body.bindMatrixInverse.clone());
  parent.add(rex); parent.updateMatrixWorld(true); rex.computeBoundingBox(); rex.userData.rfFrozenBounds = true;
  return {
    rex, pulse: featureMaterial.pulse, scuteCount: geometries.scuteCount, scuteStations: geometries.scuteStations,
    rowOffset: geometries.rowOffset, crownPlates: geometries.crownPlates, cheekPlates: geometries.cheekPlates,
    tuskCount: geometries.tuskCount, featureTriangles: geometries.featureTriangles
  };
}

const SHADER_UNIFORMS = Object.freeze([
  'uRfTopColor', 'uRfBottomColor', 'uRfAccentColor', 'uRfPatternColor', 'uRfPatternId',
  'uRfPatternScale', 'uRfPatternContrast', 'uRfPatternSeed', 'uRfPatternMix',
  'uRfHueShift', 'uRfSaturation', 'uRfTintMask', 'uRfHeightScale', 'uRfEyeColor',
  'uRfFaceEye', 'uRfFaceBrow', 'uRfFacePupil', 'uRfRelief', 'uRfReliefScale', 'uRfSurfaceMode', 'uRfSceneSat', 'uRfCountershade'
]);
function materialIsFace(name) { return /eye|teeth|tooth|mouth/i.test(String(name || '')); }
function sourceMap(sourceMaterial) { return sourceMaterial?.map || null; }

/* ---------------------------------------------------------------- Rev 14
 * Textured skin path.
 *
 * The Sharky path above paints a palette over a white atlas because that
 * asset has no real skin information: its "texture" is a flat-color island
 * sheet, so the shader has to invent the countershade, the relief and the
 * pattern. A shark_bake.py asset is the opposite. It carries a baked diffuse
 * with real painted skin and a tangent-space normal map with real surface
 * detail, and the correct job here is to LIGHT that, not to repaint it.
 *
 * So this material keeps the GLB's own maps as the base and applies the
 * palette resolver as a HUE/SAT TINT over the diffuse rather than a
 * replacement. That is what lets one baked asset serve 86 authored rows
 * without each becoming a differently-colored copy of the same flat shape:
 * the painted detail, the countershading and the wear all survive the
 * recolor because only hue and saturation move, while the diffuse's own
 * luminance carries the form.
 *
 * Countershading is preserved AND reinforced: the bake already paints a dark
 * back and a bright belly, and a gentle bind-space ramp multiplies that
 * existing gradient instead of overwriting it, so the tint cannot flatten
 * the two sides into one tone the way a straight region mix would.
 */
const TEXTURED_UNIFORMS = Object.freeze([
  'uRfHueShift', 'uRfHueBlend', 'uRfSaturation', 'uRfTopColor', 'uRfBottomColor', 'uRfAccentColor',
  'uRfCounterGain', 'uRfRimColor', 'uRfRimPower', 'uRfRimStrength', 'uRfWetness', 'uRfBindUp', 'uRfBindUpExtent'
]);
function texturedSkinMaterial(palette, def, sourceMaterial = null, sourceName = '', bindUp = null, bindUpExtent = 0.5) {
  const id = String(def?.id || ''), faceSlot = materialIsFace(sourceName);
  const map = sourceMap(sourceMaterial), normalMap = sourceMaterial?.normalMap || null;
  /* The palette resolver stays the single authority on a row's identity. Its
   * resolved base hue/sat becomes the tint target; its belly and accent feed
   * the countershade reinforcement and the rim. */
  const baseHsv = rgbToHsv(palette.base);
  const uniforms = {
    /* uRfHueShift is a hue TARGET, not a delta.
     *
     * The first cut computed a delta against sourceMaterial.color, which for
     * a glTF PBR material is the base-color FACTOR - white (h 0, s 0)
     * whenever the color lives in the texture, which is the whole point of a
     * baked asset. Differencing against a hue that does not exist produced a
     * full +0.600 rotation on greatwhite and turned grey shark skin magenta.
     *
     * A baked shark hide is near-neutral by construction: its identity is
     * value and detail, not hue. So the shader STEERS hue toward the
     * authored target proportionally to how saturated the texel already is
     * (see uRfHueBlend), which recolors the skin without inventing rotations
     * for texels that have no meaningful hue to rotate. */
    uRfHueShift: { value: baseHsv.h },
    /* How firmly to pull toward that target. A neutral texel takes the
     * authored hue outright; a texel that already carries strong hue of its
     * own (a red mouth, a blue eye) keeps more of itself. */
    uRfHueBlend: { value: 0.85 },
    /* Saturation is ADDITIVE toward the authored saturation rather than a
     * pure multiplier, because multiplying a near-zero baked saturation by
     * any finite gain is still near zero - a grey shark stays grey no matter
     * how vivid the palette row is. This carries the row's identity onto a
     * neutral hide while the ACES/cyan-wash pre-compensation the Sharky path
     * uses is folded into the target. */
    /* Rev 14 scene pre-compensation, measured rather than assumed. The
     * shader steers the hide to the authored hue correctly (simulated over
     * the real diffuse: mean hue 0.607 against a 0.600 target), but the
     * rendered flank measured 0.467 - the cyan HemisphereLight and the
     * FogExp2 in the same 0x9fd4e8 drag every hue toward the water before it
     * reaches the eye, which is the exact effect the Rev 13 notes recorded
     * for the toon path. A low-saturation authored row like greatwhite
     * (s 0.34) has nothing left to resist that with, so raise the SATURATION
     * FLOOR: the more washed-out the authored swatch, the more headroom it
     * needs to survive the water. Ceilinged well below 1 so the hide never
     * posterizes into a flat color chip. */
    uRfSaturation: { value: clamp(0.30 + baseHsv.s * SCENE_SATURATION_GAIN, 0.30, 0.88) },
    uRfTopColor: { value: palette.base.clone() },
    uRfBottomColor: { value: palette.belly.clone() },
    uRfAccentColor: { value: palette.accent.clone() },
    /* How hard the bind-space ramp reinforces the bake's own countershade.
     * This MULTIPLIES the diffuse, so 1.0 at the belly and <1 at the back
     * deepens an existing gradient without inventing a new terminator. */
    uRfCounterGain: { value: faceSlot ? 0 : SCENE_COUNTERSHADE_GAIN },
    /* Measured in prepareTemplate: the bind-space direction that maps to
     * world up for THIS asset, plus the body's half-extent along it. The
     * shader dots the bind position against this instead of assuming an
     * axis, which is what makes the countershade track the real back-to-
     * belly direction on any bake orientation. */
    uRfBindUp: { value: (bindUp ? bindUp.clone() : new THREE.Vector3(0, 1, 0)) },
    uRfBindUpExtent: { value: bindUpExtent },
    /* A subtle fresnel rim in the belly hue. Underwater, the light that
     * separates a body from the water is scattered fill wrapping the
     * silhouette, so the rim is tinted toward the belly rather than white. */
    uRfRimColor: { value: palette.belly.clone().lerp(new THREE.Color(0.62, 0.86, 1.0), 0.55) },
    uRfRimPower: { value: 2.6 },
    uRfRimStrength: { value: faceSlot ? 0.10 : 0.34 },
    /* Wet specular: a broad-band gloss boost concentrated on the upper body,
     * which is where a wet hide actually catches the key. */
    uRfWetness: { value: faceSlot ? 0.20 : 0.62 }
  };
  const material = new THREE.MeshStandardMaterial({
    /* White base color: the diffuse map IS the color. Multiplying the palette
     * in here would double-apply the tint the shader already does in HSV. */
    color: new THREE.Color(1, 1, 1), map, normalMap,
    /* Owner's brief: wet painted skin. 0.40 is glossy enough to hold a
     * specular highlight under the directional key without going plastic,
     * and the shader modulates it lower still along the lit back. */
    roughness: 0.40, metalness: 0.0, flatShading: false,
    emissive: new THREE.Color(0, 0, 0), emissiveIntensity: 0
  });
  if (normalMap && sourceMaterial?.normalScale) material.normalScale.copy(sourceMaterial.normalScale);
  material.name = `RF Rev 14 textured skin ${id} ${sourceName || 'Body'}`;
  material.userData.rfTexturedUniforms = uniforms;
  material.userData.rfTextured = true;
  material.userData.rfHasDiffuse = !!map;
  material.userData.rfHasNormalMap = !!normalMap;
  material.userData.rfBindUp = bindUp ? bindUp.clone() : new THREE.Vector3(0, 1, 0);
  material.userData.rfBindUpExtent = bindUpExtent;
  material.userData.rfShading = 'MeshStandardMaterial; baked diffuse + tangent normal map; roughness 0.40 with wet specular; fresnel rim; palette applied as HSV tint';
  material.onBeforeCompile = (shader) => {
    for (const name of TEXTURED_UNIFORMS) shader.uniforms[name] = uniforms[name];
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRfBindPosition;')
      /* Bind-space position, i.e. BEFORE skinning. Taking it here means the
       * countershade terminator is welded to the body and does not slide
       * along the flank as the swim bend and the jaw gape move vertices. */
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRfBindPosition = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'uniform float uRfHueShift;', 'uniform float uRfHueBlend;', 'uniform float uRfSaturation;',
        'uniform vec3 uRfTopColor;', 'uniform vec3 uRfBottomColor;', 'uniform vec3 uRfAccentColor;',
        'uniform float uRfCounterGain;', 'uniform vec3 uRfBindUp;', 'uniform float uRfBindUpExtent;',
        'uniform vec3 uRfRimColor;', 'uniform float uRfRimPower;', 'uniform float uRfRimStrength;',
        'uniform float uRfWetness;',
        'varying vec3 vRfBindPosition;',
        'vec3 rfRgbToHsv(vec3 c){vec4 K=vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);return vec3(abs(q.z+(q.w-q.y)/(6.0*d+1e-5)),d/(q.x+1e-5),q.x);}',
        'vec3 rfHsvToRgb(vec3 c){vec3 p=abs(fract(c.xxx+vec3(0.0,1.0/3.0,2.0/3.0))*6.0-3.0);return c.z*mix(vec3(1.0),clamp(p-1.0,0.0,1.0),c.y);}'
      ].join('\n'))
      /* Tint AFTER <map_fragment> so diffuseColor already holds the sampled,
       * colorspace-converted diffuse texel. */
      .replace('#include <map_fragment>', ['#include <map_fragment>',
        'vec3 rfHsv = rfRgbToHsv(diffuseColor.rgb);',
        /* Steer hue toward the authored target. The pull is strongest where
         * the baked texel is closest to neutral, which is most of a shark
         * hide, and weakest where the bake painted a deliberate hue (mouth,
         * eye, fin edge) that should survive the recolor. Interpolate the
         * SHORT way around the wheel so a target near 0.0 and a texel near
         * 1.0 do not sweep through the whole spectrum. */
        'float rfHueGap = fract(uRfHueShift - rfHsv.x + 1.5) - 0.5;',
        /* The neutral weight was originally 1.0 - smoothstep(0.10, 0.45),
         * which faded the steer out over most of a hide whose baked
         * saturation sits around 0.2-0.3, leaving the flank short of its
         * authored hue (measured 0.468 against a 0.600 target). Push the
         * fade window up so only genuinely colored texels resist. */
        'float rfNeutral = 1.0 - smoothstep(0.42, 0.80, rfHsv.y);',
        'rfHsv.x = fract(rfHsv.x + rfHueGap * uRfHueBlend * rfNeutral);',
        /* Additive toward the authored saturation, weighted the same way, so
         * a neutral hide actually takes the row color while an already
         * colored texel is only nudged. */
        'rfHsv.y = clamp(mix(rfHsv.y, max(rfHsv.y, uRfSaturation), rfNeutral), 0.0, 1.0);',
        'diffuseColor.rgb = rfHsvToRgb(rfHsv);',
        /* Reinforce the bake's countershade. vRfBindPosition.y is up in bind
         * space (the rig is authored Y-up before prepareTemplate rotates it),
         * so this is a vertical ramp: darken toward the back, lift toward the
         * belly, both as MULTIPLIERS on the painted skin. */
        'float rfUp = clamp(dot(vRfBindPosition, uRfBindUp) / (2.0 * uRfBindUpExtent) + 0.5, 0.0, 1.0);',
        /* Countershade: dark back, bright belly. rfUp is 1 at the dorsal
         * ridge and 0 at the belly, so the multiplier runs the other way.
         * The span is deliberately wide (0.55 back against 1.45 belly) - the
         * cyan fog sits on top of this and compresses it hard, so a timid
         * ramp arrives as no ramp at all. A smoothstep keeps the terminator
         * a soft wrap rather than a painted waterline. */
        'float rfShade = smoothstep(0.02, 0.86, rfUp);',
        'float rfCounter = mix(1.52, 0.46, rfShade);',
        'diffuseColor.rgb *= mix(1.0, rfCounter, clamp(uRfCounterGain, 0.0, 1.4));',
        /* A whisper of the authored belly hue in the lowest band keeps the
         * underside reading as this row's color rather than neutral grey. */
        /* A whisper of the authored belly hue in the LOWEST band (rfUp near
         * 0) keeps the underside reading as this row\'s color rather than
         * neutral grey, and a touch of the base hue along the ridge does the
         * same for the back. */
        'diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uRfBottomColor * 2.10, (1.0 - smoothstep(0.02, 0.38, rfUp)) * 0.34);',
        'diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uRfTopColor * 2.10, smoothstep(0.66, 0.99, rfUp) * 0.30);'
      ].join('\n'))
      /* Wet look: pull roughness down along the upper body so the key light
       * lays a real specular streak down the back, which is the single
       * strongest "this is a lit 3D animal" cue at gameplay size. */
      .replace('#include <roughnessmap_fragment>', ['#include <roughnessmap_fragment>',
        'float rfWetUp = clamp(dot(vRfBindPosition, uRfBindUp) / (2.0 * uRfBindUpExtent) + 0.5, 0.0, 1.0);',
        /* Gloss concentrated along the BACK, which is the surface actually
         * facing the key light and where a wet hide catches its highlight. */
        'roughnessFactor = clamp(roughnessFactor * mix(1.06, 0.46, uRfWetness * smoothstep(0.30, 0.98, rfWetUp)), 0.06, 1.0);'
      ].join('\n'))
      /* Fresnel rim, added with the emissive so it survives tone mapping the
       * same way the rest of the lighting does. */
      .replace('#include <emissivemap_fragment>', ['#include <emissivemap_fragment>',
        'float rfFresnel = pow(clamp(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), uRfRimPower);',
        'totalEmissiveRadiance += uRfRimColor * rfFresnel * uRfRimStrength;'
      ].join('\n'));
  };
  applyIdentity(material, def, palette);
  /* A distinct cache key: this program shares nothing with the :rf-skin3
   * atlas shader and must never be reused for it. */
  material.customProgramCacheKey = () => `${id}${TEXTURED_SUFFIX}`;
  material.needsUpdate = true;
  return material;
}
function skinMaterial(palette, def, sourceMaterial = null, sourceName = '', atlas = false, featureMode = '') {
  const id = String(def?.id || ''), profile = variantProfile(def), personality = personalityOf(def), face = personality?.face || { eye: 1, brow: 0, pupil: 1, gape: 0, tilt: 0 }, surface = personality?.surface || { relief: 0.04, density: 1, scars: 0, plates: 0, mode: 0 }, faceSlot = materialIsFace(sourceName), map = sourceMap(sourceMaterial), sourceColor = sourceMaterial?.color?.clone?.() || new THREE.Color(1, 1, 1);
  const uniforms = {
    uRfTopColor: { value: palette.base.clone() }, uRfBottomColor: { value: palette.belly.clone() }, uRfAccentColor: { value: palette.accent.clone() }, uRfPatternColor: { value: palette.accent.clone() },
    uRfPatternId: { value: patternId(def) }, uRfPatternScale: { value: profile.patternScale }, uRfPatternContrast: { value: id === SHARKJIRA_ID ? 0.82 : 0.95 }, uRfPatternSeed: { value: hashString(def?.id || '') * 17 }, uRfPatternMix: { value: id === SHARKJIRA_ID ? 0.18 : patternId(def) ? 0.78 : 0 }
    , uRfHueShift: { value: 0 }, uRfSaturation: { value: 1 }, uRfTintMask: { value: faceSlot ? 0 : 1 }, uRfHeightScale: { value: 44 }, uRfEyeColor: { value: profile.eyeColor.clone() }
    , uRfFaceEye: { value: face.eye }, uRfFaceBrow: { value: face.brow }, uRfFacePupil: { value: face.pupil }, uRfRelief: { value: surface.relief + surface.scars * 0.30 + surface.plates * 0.24 }, uRfReliefScale: { value: 1.8 * surface.density }, uRfSurfaceMode: { value: surface.mode }
    /* Rev 13 scene pre-compensation. Sharkjira keeps a restrained gain so the
     * charcoal identity survives, but still lifts clear of a black blob. */
    /* The Rex, like Sharkjira, is an authored kaiju palette rather than a
     * rescued roster row: the full scene gains would re-lift the armored
     * hull back toward the water value that caused the ghost read. */
    , uRfSceneSat: { value: id === SHARKJIRA_ID ? 1.12 : id === LEVIATHAN_ID ? 1.16 : SCENE_SATURATION_GAIN }
    , uRfCountershade: { value: id === SHARKJIRA_ID ? 1.10 : id === LEVIATHAN_ID ? 1.08 : SCENE_COUNTERSHADE_GAIN }
  };
  const act = finite(def?.act, 1), glow = palette.glow || new THREE.Color(0, 0, 0);
  /* Sharkjira's atomic read belongs to the dedicated plate/gill/eye batch.
   * Letting the charcoal body share that blue emissive field lifts the whole
   * flank into a cyan veil even though the material remains fully opaque. */
  const sharkjiraBody = id === SHARKJIRA_ID && !faceSlot && !featureMode;
  const leviathanBody = id === LEVIATHAN_ID && !faceSlot && !featureMode;
  const material = new THREE.MeshStandardMaterial({
    /* Atlas materials use white as the detail carrier. Multiplying the dark
     * palette here was the Rev 9b tint bug; the shader below owns the palette
     * mix and only uses the atlas for luminance/detail and face masks. */
    color: faceSlot || !atlas ? (faceSlot ? sourceColor : palette.base.clone()) : new THREE.Color(1, 1, 1), map,
    roughness: faceSlot ? 0.58 : 0.50, metalness: faceSlot ? 0 : 0.03, flatShading: false,
    emissive: faceSlot || sharkjiraBody ? new THREE.Color(0, 0, 0) : featureMode === 'hammer' ? new THREE.Color(0, 0, 0) : glow,
    /* Rev 13 rework: the act-scaled body emissive reached 0.16 at the Rex's
     * tier 12, three times a great white's 0.05, and lit the whole armored
     * hull from inside toward the water color. The Rex's glow belongs in the
     * scute seams and throat (the feature material owns those), so the body
     * itself is held at the baseline like Sharkjira's is. */
    emissiveIntensity: faceSlot || sharkjiraBody ? 0 : featureMode === 'hammer' ? 0 : id === LEVIATHAN_ID ? 0.04 : clamp(0.05 + Math.max(0, act - 1) * 0.055, 0, 0.32)
  });
  material.name = `RF Rev 9c shark skin ${def?.id || 'unknown'} ${sourceName || 'Body'}`;
  material.userData.rfSkinUniforms = uniforms; material.userData.rfSkinPattern = String(def?.sil?.pattern || 'plain'); material.userData.rfSharkjiraBody = sharkjiraBody;
  material.userData.rfAtlas = !!(atlas && map); material.userData.rfFaceMask = faceSlot ? 'material-slot' : atlas ? 'atlas-white-luminance' : 'none';
  material.userData.rfShading = 'MeshStandardMaterial; smooth normals; roughness 0.50; specular lighting';
  /* The foil is countershaded from its own feature channel (2 = ventral
   * slab) with a soft bind-z fallback across the bevel, so the crown takes
   * the body base color and the underside takes the belly color. That is
   * what removes the flat-grey-plate read. */
  const hammerRamp = featureMode === 'hammer' ? [
    'float rfFoilBelly = step(1.5, vRfFeature);',
    /* Run the crown through the same saturation/scene compensation the body
     * flank uses, and darken it the same 0.62 the body back is darkened by.
     * Without this the foil takes the raw uniform and reads as a different
     * species' color sitting on the head. */
    'vec3 rfFoilBack = uRfTopColor * 0.62;',
    'vec3 rfFoilHsv = rfRgbToHsv(rfFoilBack); rfFoilHsv.x = fract(rfFoilHsv.x + uRfHueShift);',
    'rfFoilHsv.y = clamp(rfFoilHsv.y * uRfSaturation * uRfSceneSat, 0.0, 1.0);',
    'vec3 rfFoilCrown = rfHsvToRgb(rfFoilHsv);',
    'vec3 rfFoilBellyC = clamp(uRfBottomColor * uRfCountershade, 0.0, 1.0);',
    /* Rev 13 rework: a hard step between the two feature channels gave the
     * foil one flat crown tone and one flat belly tone, which is half of why
     * it read as a uniform box. Blend the countershade terminator across the
     * lofted section using the bind-space z of the surface, then quantize it
     * into the same toon bands the body carries, so the foil picks up curved
     * shading that follows its real form. */
    'float rfFoilH = clamp(vRfBindPosition.z * 14.0 + 0.5, 0.0, 1.0);',
    'float rfFoilBand = mix(rfFoilH, rfFoilBelly, 0.55);',
    'rfFoilBand = floor(rfFoilBand * 3.0 + 0.5) / 3.0;',
    'diffuseColor.rgb = mix(rfFoilBellyC, rfFoilCrown, rfFoilBand);'
  ].join('\n') : [
    'vec3 rfHsv = rfRgbToHsv(diffuseColor.rgb); rfHsv.x = fract(rfHsv.x + uRfHueShift); rfHsv.y = clamp(rfHsv.y * uRfSaturation, 0.0, 1.0); rfHsv.z = clamp(rfHsv.z * 1.35 + 0.04, 0.0, 1.0);',
    'vec3 rfVivid = rfHsvToRgb(rfHsv);',
    'diffuseColor.rgb = mix(rfVivid, diffuseColor.rgb, clamp(rfFaceMask, 0.0, 1.0));'
  ].join('\n');
  const patternCode = [
    'float rfAlong = vRfBindPosition.y * uRfPatternScale + uRfPatternSeed;',
    'float rfAcross = vRfBindPosition.x * uRfPatternScale * 1.7 + uRfPatternSeed * 0.37;',
    'float rfPattern = 0.0;',
    /* Rev 13: HSE pattern blocks are hard-edged shapes. Narrow smoothstep
     * windows turn these from soft airbrushed bands into readable stripes
     * and spots that survive fog at gameplay size. */
    'if (uRfPatternId == 1) rfPattern = smoothstep(0.46, 0.54, 0.5 + 0.5 * sin(rfAlong * 3.14159));',
    'else if (uRfPatternId == 2) rfPattern = step(0.62, rfHash(vec2(floor(rfAlong * 2.0), floor(rfAcross * 3.0))));',
    'else if (uRfPatternId == 3) rfPattern = smoothstep(0.44, 0.56, 0.5 + 0.5 * sin(rfAlong * 6.28318));',
    'else if (uRfPatternId == 4) rfPattern = step(0.73, rfHash(vec2(floor(rfAlong * 3.0), floor(rfAcross * 2.0))));',
    'else if (uRfPatternId == 5) rfPattern = step(0.56, rfHash(vec2(floor(rfAlong * 5.0), floor(rfAcross * 4.0))));',
    'float rfFaceMask = 1.0 - uRfTintMask;',
    atlas && map ? [
      'vec3 rfAtlasTexel = texture2D(map, vMapUv).rgb;',
      'float rfAtlasLuma = dot(rfAtlasTexel, vec3(0.299, 0.587, 0.114));',
      /* The Sharky atlas is white-backed and uses tiny colored islands. Do
       * not use RGB hue as the shark identity: retain only its light/dark
       * detail, then paint the authored top/belly palette over it. */
            /* Rev 13: a 1.30 ceiling drove saturated channels to clip at white,
       * which reads as chalky washout. Keep the atlas detail range centered
       * near 1.0 so it modulates form without bleaching hue. */
      'float rfDetail = mix(0.72, 1.12, smoothstep(0.12, 0.86, rfAtlasLuma));',
      'float rfHeight = 1.0 - clamp(vRfBindPosition.z * uRfHeightScale + 0.5, 0.0, 1.0);',
      /* Rev 13: HSE countershading is a hard edge, not a gradient. The old
       * 0.43-0.72 ramp spread the transition over a third of the flank, so
       * neither the dark back nor the bright belly ever reached full value
       * and the shark read as one mid tone. Tighten the terminator and push
       * the two sides apart before the region mix. */
      'float rfBelly = smoothstep(0.50, 0.60, rfHeight);',
      'vec3 rfBack = uRfTopColor * 0.62;',
      'vec3 rfBellyC = clamp(uRfBottomColor * uRfCountershade, 0.0, 1.0);',
      'vec3 rfRegion = mix(rfBack, rfBellyC, rfBelly);',
      'float rfFinTip = smoothstep(0.80, 0.99, abs(rfHeight * 2.0 - 1.0)) * 0.26;',
      'rfRegion = mix(rfRegion, uRfAccentColor, rfFinTip);',
      'vec3 rfRegionHsv = rfRgbToHsv(rfRegion); rfRegionHsv.x = fract(rfRegionHsv.x + uRfHueShift);',
      /* Pre-compensate for ACES + the cyan hemi/fog wash, which together
       * desaturate the flank by roughly a third before it reaches the eye. */
      'rfRegionHsv.y = clamp(rfRegionHsv.y * uRfSaturation * uRfSceneSat, 0.0, 1.0);',
      'vec3 rfColorized = rfHsvToRgb(rfRegionHsv) * rfDetail;',
      /* Black also appears on the source underside. Limit the black escape
       * hatch to the forward face and the two eye/cavity bands so it cannot
       * turn the countershaded belly into an ink silhouette. */
      'float rfHead = smoothstep(0.84, 0.99, vRfBindPosition.y * 17.5 + 0.5);',
      'float rfFaceBand = max(1.0 - smoothstep(0.20, 0.44, rfHeight), smoothstep(0.56, 0.80, rfHeight));',
      /* The atlas has a large white backing island. Scope white preservation
       * to the forward eye/mouth bands so that backing white cannot exempt
       * the whole body from palette colorization. */
      'float rfWhite = smoothstep(0.84, 0.985, min(min(rfAtlasTexel.r, rfAtlasTexel.g), rfAtlasTexel.b)) * rfHead * rfFaceBand;',
      'float rfBlack = (1.0 - smoothstep(0.035, 0.085, max(max(rfAtlasTexel.r, rfAtlasTexel.g), rfAtlasTexel.b))) * rfHead * rfFaceBand;',
      'float rfMouth = smoothstep(0.10, 0.28, rfAtlasTexel.r - max(rfAtlasTexel.g, rfAtlasTexel.b)) * rfHead;',
      'rfFaceMask = max(rfFaceMask, max(rfWhite, max(rfBlack, rfMouth)));',
      /* Keep the approved dark mouth/cavity, but give the atlas eye a small
       * species read. The top face band excludes teeth and gills. */
      'float rfEyeBand = clamp(0.42 / max(uRfFaceEye, 0.35), 0.18, 0.70);',
      'float rfEye = rfBlack * (1.0 - smoothstep(0.06, rfEyeBand, rfHeight)) * rfHead * clamp(0.78 + uRfFacePupil * 0.18, 0.60, 1.25);',
      'float rfBrowMask = rfBlack * smoothstep(0.32, 0.62, rfHeight) * rfHead * clamp(abs(uRfFaceBrow) * 0.22, 0.0, 0.22);',
      'rfFaceMask = max(rfFaceMask, rfBrowMask);',
      'vec3 rfAtlasFace = mix(rfAtlasTexel, uRfEyeColor, clamp(rfEye * 0.92, 0.0, 0.92));',
      'diffuseColor.rgb = mix(rfColorized, rfAtlasFace, clamp(rfFaceMask, 0.0, 1.0));'
    ].join('\n') : featureMode === 'hammer' ? hammerRamp : leviathanBody ? [
      /* Rev 13 rework: the shared non-atlas path takes the GLB's own
       * near-white belly color and multiplies its VALUE by 1.35. On the Rex
       * that left the lower body and the pectoral fin washed out to a
       * translucent-looking white with the water reading straight through
       * them. The authored kaiju palette instead drives the flank from its
       * OWN countershade ramp (dark armored back, bright belly), so the hull
       * is opaque deep sea-green top to bottom and the value split is a real
       * countershade rather than a brightened texel. */
      'float rfHeightK = 1.0 - clamp(vRfBindPosition.z * uRfHeightScale + 0.5, 0.0, 1.0);',
      'float rfBellyK = smoothstep(0.50, 0.62, rfHeightK);',
      'vec3 rfRegionK = mix(uRfTopColor * 0.62, clamp(uRfBottomColor * uRfCountershade, 0.0, 1.0), rfBellyK);',
      'vec3 rfHsvK = rfRgbToHsv(rfRegionK); rfHsvK.x = fract(rfHsvK.x + uRfHueShift);',
      'rfHsvK.y = clamp(rfHsvK.y * uRfSaturation * uRfSceneSat, 0.0, 1.0);',
      'diffuseColor.rgb = mix(rfHsvToRgb(rfHsvK), diffuseColor.rgb, clamp(rfFaceMask, 0.0, 1.0));'
    ].join('\n') : [
      'vec3 rfHsv = rfRgbToHsv(diffuseColor.rgb); rfHsv.x = fract(rfHsv.x + uRfHueShift); rfHsv.y = clamp(rfHsv.y * uRfSaturation, 0.0, 1.0); rfHsv.z = clamp(rfHsv.z * 1.35 + 0.04, 0.0, 1.0);',
      'vec3 rfVivid = rfHsvToRgb(rfHsv);',
      'diffuseColor.rgb = mix(rfVivid, diffuseColor.rgb, clamp(rfFaceMask, 0.0, 1.0));'
    ].join('\n'),
    /* Rev 13: paint the pattern as a value-contrasted block. Mixing toward a
     * mid-value accent alone left tiger bars at dV 0.015; bias the pattern
     * color away from the local flank value so the block always separates. */
    'float rfLocalV = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));',
    'vec3 rfPatColor = uRfPatternColor * (rfLocalV > 0.42 ? 0.55 : 1.55);',
    `diffuseColor.rgb = mix(diffuseColor.rgb, clamp(rfPatColor, 0.0, 1.0), rfPattern * uRfPatternMix * uRfPatternContrast * (1.0 - rfFaceMask)${featureMode === 'hammer' ? ' * 0.0' : ''});`,
    /* Feature 1 is the eye bulb: a real dark iris with the row's eye color
     * rimmed around it, not an undifferentiated black dot. */
    featureMode === 'hammer' ? 'if (vRfFeature > 0.5 && vRfFeature < 1.5) diffuseColor.rgb = mix(uRfEyeColor * 0.85, vec3(0.010, 0.016, 0.020), 0.72);' : ''
  ].join('\n');
  material.onBeforeCompile = (shader) => {
    for (const name of SHADER_UNIFORMS) shader.uniforms[name] = uniforms[name];
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nattribute float rfSlot;\nvarying float vRfSlot;\nvarying vec3 vRfBindPosition;${sharkjiraBody ? '\nattribute float rfCrest;\nattribute float rfCrestEdge;\nvarying float vRfCrestEdge;' : ''}${featureMode === 'hammer' ? '\nattribute float rfFeature;\nvarying float vRfFeature;' : ''}`).replace('#include <begin_vertex>', `#include <begin_vertex>\nvRfSlot = rfSlot;\nvRfBindPosition = position;${sharkjiraBody ? '\nvRfCrestEdge = rfCrestEdge;' : ''}${featureMode === 'hammer' ? '\nvRfFeature = rfFeature;' : ''}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nuniform vec3 uRfTopColor;\nuniform vec3 uRfBottomColor;\nuniform vec3 uRfAccentColor;\nuniform vec3 uRfPatternColor;\nuniform int uRfPatternId;\nuniform float uRfPatternScale;\nuniform float uRfPatternContrast;\nuniform float uRfPatternSeed;\nuniform float uRfPatternMix;\nuniform float uRfHueShift;\nuniform float uRfSaturation;\nuniform float uRfTintMask;\nuniform float uRfHeightScale;\nuniform vec3 uRfEyeColor;\nuniform float uRfFaceEye;\nuniform float uRfFaceBrow;\nuniform float uRfFacePupil;\nuniform float uRfRelief;\nuniform float uRfReliefScale;\nuniform float uRfSurfaceMode;\nuniform float uRfSceneSat;\nuniform float uRfCountershade;${sharkjiraBody ? '\nuniform vec3 uRfAtomicColor;\nuniform float uRfAtomicPulse;' : ''}\nvarying float vRfSlot;\nvarying vec3 vRfBindPosition;${sharkjiraBody ? '\nvarying float vRfCrestEdge;' : ''}${featureMode === 'hammer' ? '\nvarying float vRfFeature;' : ''}\nfloat rfHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nvec3 rfRgbToHsv(vec3 c){vec4 K=vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);return vec3(abs(q.z+(q.w-q.y)/(6.0*d+1e-5)),d/(q.x+1e-5),q.x);}\nvec3 rfHsvToRgb(vec3 c){vec3 p=abs(fract(c.xxx+vec3(0.0,1.0/3.0,2.0/3.0))*6.0-3.0);return c.z*mix(vec3(1.0),clamp(p-1.0,0.0,1.0),c.y);}`)
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\nfloat rfReliefA = sin(vRfBindPosition.y * uRfReliefScale * 4.0 + uRfPatternSeed);\nfloat rfReliefB = sin(vRfBindPosition.x * uRfReliefScale * 3.0 + rfReliefA * 1.7 + uRfPatternSeed * 0.31);\nfloat rfReliefMask = uRfSurfaceMode < 1.5 ? rfReliefA : uRfSurfaceMode < 3.5 ? rfReliefB : rfReliefA * rfReliefB;\nvec3 rfReliefNormal = normalize(normal + vec3(rfReliefMask * 0.075, rfReliefA * 0.020, rfReliefB * 0.060));\nnormal = normalize(mix(normal, rfReliefNormal, clamp(uRfRelief * 0.82, 0.0, 0.42)));`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${patternCode}`);
    if (atlas && map) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n/* Soft ambient countershading keeps the authored belly readable under the deep-teal hemi ground. Rev 13: the belly swatch is now a near-white v0.98, so this additive fill is scaled down and tinted by the flank hue instead of flooding the lower body with unsaturated light. */\ntotalEmissiveRadiance += mix(uRfBottomColor, uRfTopColor, 0.22) * rfBelly * 0.14;');
      shader.fragmentShader = shader.fragmentShader.replace('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;', 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;\n/* Rev 13: this post-tonemap additive wash was the dominant desaturator. At the Rev 13 belly values a 0.34 gain washed the whole lower flank toward white and dragged measured flank saturation DOWN even as the palettes got more vivid. Keep a small hue-carrying lift only. */\noutgoingLight += mix(uRfBottomColor, uRfTopColor, 0.18) * rfBelly * 0.26;');
    }
    if (sharkjiraBody) {
      shader.uniforms.uRfAtomicColor = { value: glow.clone() }; shader.uniforms.uRfAtomicPulse = SHARKJIRA_PULSE;
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n/* The hull stays charcoal; only the connected plate rims pulse. */\ntotalEmissiveRadiance += uRfAtomicColor * vRfCrestEdge * uRfAtomicPulse * 0.18;');
    }
  };
  material.customProgramCacheKey = () => `${material.userData.rfSkinPattern}${sharkjiraBody ? ':sharkjira-body' : ''}${leviathanBody ? ':leviathan-body' : ''}${PATTERN_SUFFIX}${featureMode ? `:${featureMode}` : ''}`;
  material.needsUpdate = true; return material;
}
function findHeadBone(root, base) {
  const names = base === 'sharky' ? ['Head', 'Center', 'Neck'] : base === 'anglerfish' || base === 'goblinshark' || base === 'piranha' ? ['Main1', 'Main2', 'Main6'] : ['Face', 'Head', 'Spine1', 'Main1'];
  for (const name of names) { const found = root.getObjectByName(name); if (found) return found; }
  let result = null; root.traverse((o) => { if (!result && o.isBone && /head|face/i.test(o.name || '')) result = o; }); return result || root;
}
function findPropBone(root, base, kind) {
  if (base === 'sharky') {
    const name = kind === 'hammer' ? 'Head' : kind === 'horns' || kind === 'spike' ? 'Center' : 'Head';
    return root.getObjectByName(name) || findHeadBone(root, base);
  }
  return findHeadBone(root, base);
}
function propKind(def) {
  const id = String(def?.id || '');
  for (const [kind, ids] of Object.entries(PROP_ALLOWLIST)) if (ids.has(id)) return kind;
  return null;
}
function propGeometry(kind) {
  if (kind === 'hammer') return hammerFoilGeometry();
  if (kind === 'saw') {
    const rostrum = new THREE.ConeGeometry(0.055, 0.30, 6, 1, false);
    rostrum.translate(0, 0.13, 0); return propAttributes(rostrum);
  }
  if (kind === 'crown') return crownGeometry();
  if (kind === 'horns') return hornsGeometry();
  return null;
}
function propAttributes(geometry, feature = 0) {
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('rfSlot', new THREE.Float32BufferAttribute(new Float32Array(count).fill(1), 1));
  geometry.setAttribute('rfFeature', new THREE.Float32BufferAttribute(new Float32Array(count).fill(feature), 1));
  return geometry;
}
function hammerFoilGeometry() {
  /* Sharky's bind axes are y=length, z=up, x=depth, so the foil is built in
   * the x/y plane (span across x, sweep along y) and given real thickness in
   * z. The previous version was a single flat extruded outline: it read as a
   * grey plate because it had no crown/underside separation, no eye bulbs,
   * and a straight inner edge that left an air gap against the skull.
   *
   * Feature channel (rfFeature): 0 = dorsal crown, taken by the body base
   * color; 1 = eye bulb; 2 = ventral countershade, taken by the belly color.
   * Colouring the foil from the palette is what stops it reading as grey. */
  /* Rev 13 rework: the previous version stacked two closed ExtrudeGeometry
   * solids. Extrusion emits hard-edged side walls with split normals, so
   * `computeVertexNormals` could not smooth them and the foil rendered as a
   * flat-shaded BOX with visible right angles and planar faces. It is now a
   * true LOFT: one continuous surface swept across the span, sampled as a
   * grid of rings, welded, and smooth-shaded, with thickness tapering front
   * to back and toward the lobe tips so it reads as an organic airfoil. */
  const pieces = [];
  const HALF = 0.235, THICK = 0.062, LOBE = 0.092;
  const SPAN_SEGMENTS = 48, CHORD_SEGMENTS = 14;

  /* Cross-section profile at a normalized span position u in [-1, 1].
   * Returns the chord centerline (sweep offset along y), the chord
   * half-length, and the half-thickness. Every term is a smooth function of
   * u, which is what removes the right angles. */
  const profile = (u) => {
    const a = Math.abs(u);
    /* Leading edge sweeps back toward the tips: a real cephalofoil is a
     * swept wing, not a rectangle. */
    const sweep = -LOBE * 0.92 * a * a;
    /* Chord is widest at the root (where it meets the skull) and rounds off
     * into the lobe tip rather than ending square. */
    const chord = LOBE * (0.98 - 0.30 * a * a) * Math.sqrt(Math.max(0, 1 - Math.pow(a, 6)));
    /* Thickness tapers outboard so the tips are rounded, not slab-ended. */
    const thick = THICK * 0.5 * (1 - 0.42 * a * a) * Math.sqrt(Math.max(0, 1 - Math.pow(a, 8)));
    return { sweep, chord, thick };
  };

  /* Build the loft as a closed tube: for each span station, walk the chord
   * from trailing edge to leading edge over the top surface and back along
   * the bottom, so a single welded shell carries both faces. */
  const rings = [];
  /* Axis mapping, measured on the built rig rather than assumed. The prop is
   * parented to the Head BONE, whose frame maps local x -> world z (the
   * shark's WIDTH), local y -> world x (the rig LENGTH axis), and local z ->
   * world y (VERTICAL). So the foil's SPAN (lobe tip to lobe tip, running
   * across the shark) is authored on local x, its CHORD (front to back) on
   * local y, and its THICKNESS (top to bottom) on local z. */
  for (let i = 0; i <= SPAN_SEGMENTS; i++) {
    const u = (i / SPAN_SEGMENTS) * 2 - 1, p = profile(u), span = u * HALF;
    const ring = [];
    for (let j = 0; j < CHORD_SEGMENTS * 2; j++) {
      /* theta walks the full cross-section loop once. */
      const theta = (j / (CHORD_SEGMENTS * 2)) * Math.PI * 2;
      /* Elliptical section, flattened top and bottom into an airfoil by
       * biasing the vertical term. The trailing edge (cos ~ -1) is pulled
       * concave so the foil wraps the snout instead of butting against it. */
      const c = Math.cos(theta), s = Math.sin(theta);
      const concave = 1 - 0.34 * Math.max(0, -c) * (1 - u * u);
      const chord = p.sweep + c * p.chord * concave;
      const thick = s * p.thick;
      ring.push(new THREE.Vector3(span, chord, thick));
    }
    rings.push(ring);
  }

  const positions = [], features = [];
  const push = (v, feature) => { positions.push(v.x, v.y, v.z); features.push(feature); };
  /* Feature channel is chosen per vertex by which side of the section it is
   * on: z > 0 is the dorsal crown (0, body base color), z < 0 is the ventral
   * countershade (2, belly color). That is what gives the foil the same
   * dark-top / bright-underside toon banding the body has. */
  /* Thickness runs on local z, so the dorsal/ventral split keys off z. */
  const featureOf = (v) => (v.z >= 0 ? 0 : 2);
  for (let i = 0; i < SPAN_SEGMENTS; i++) {
    const r0 = rings[i], r1 = rings[i + 1], n = r0.length;
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      const a = r0[j], b = r0[k], c = r1[k], d = r1[j];
      push(a, featureOf(a)); push(b, featureOf(b)); push(c, featureOf(c));
      push(a, featureOf(a)); push(c, featureOf(c)); push(d, featureOf(d));
    }
  }
  /* Cap the two lobe tips so the shell is closed. */
  for (const [ring, flip] of [[rings[0], false], [rings[rings.length - 1], true]]) {
    const center = new THREE.Vector3();
    for (const v of ring) center.add(v);
    center.multiplyScalar(1 / ring.length);
    for (let j = 0; j < ring.length; j++) {
      const k = (j + 1) % ring.length, a = ring[j], b = ring[k];
      if (flip) { push(center, 0); push(b, featureOf(b)); push(a, featureOf(a)); }
      else { push(center, 0); push(a, featureOf(a)); push(b, featureOf(b)); }
    }
  }
  const loft = new THREE.BufferGeometry();
  loft.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  loft.setAttribute('rfFeature', new THREE.Float32BufferAttribute(features, 1));
  loft.setAttribute('rfSlot', new THREE.Float32BufferAttribute(new Float32Array(features.length).fill(1), 1));
  loft.computeVertexNormals();
  pieces.push(loft);

  /* Eye bulbs at the very tips of the lobes: spheres that sit proud of both
   * faces so the head reads as having eyes on stalks at any angle. */
  for (const sign of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.042, 12, 10).toNonIndexed();
    eye.scale(0.92, 1.0, 1.12);
    /* Eye bulbs sit at the lobe tips: span on local x, chord on local y. */
    eye.translate(sign * (HALF - 0.020), profile(sign * 0.94).sweep, 0);
    /* The loft carries no uv, so drop the sphere's to keep the merge
     * attribute sets compatible. */
    eye.deleteAttribute('uv');
    eye.deleteAttribute('normal');
    eye.computeVertexNormals();
    pieces.push(propAttributes(eye, 1));
  }
  const geometry = mergeGeometries(pieces);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
function hornsGeometry() {
  const horns = [];
  for (const x of [-0.075, 0.075]) {
    const horn = new THREE.ConeGeometry(0.065, 0.24, 6, 1, false);
    horn.rotateX(Math.PI * 0.5); horn.rotateY(x < 0 ? -0.24 : 0.24); horn.translate(x, 0.015, 0.11); horns.push(horn);
  }
  const geometry = mergeGeometries(horns); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return propAttributes(geometry);
}
function crownGeometry() {
  const pieces = [new THREE.BoxGeometry(0.12, 0.26, 0.045)];
  pieces[0].translate(0, 0.01, 0.065);
  for (const y of [-0.09, 0, 0.09]) {
    const point = new THREE.ConeGeometry(0.055, 0.18, 5, 1, false);
    point.rotateX(Math.PI * 0.5); point.translate(0, y + 0.01, 0.17); pieces.push(point);
  }
  const geometry = mergeGeometries(pieces); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return propAttributes(geometry);
}
function grinGeometry() {
  const width = 0.18, height = 0.075, positions = [
    -width * 0.5, -height * 0.5, 0, width * 0.5, -height * 0.5, 0, width * 0.5, height * 0.5, 0, -width * 0.5, height * 0.5, 0
  ], indices = [0, 1, 2, 0, 2, 3], teeth = 5;
  const toothWidth = width * 0.12, toothHeight = height * 0.40;
  for (let i = 0; i < teeth; i++) { const x = -width * 0.39 + i * width * 0.195; const base = positions.length / 3; positions.push(x - toothWidth, height * 0.42, 0.002, x + toothWidth, height * 0.42, 0.002, x, height * 0.42 - toothHeight, 0.002); indices.push(base, base + 1, base + 2); }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.addGroup(0, 6, 0); geometry.addGroup(6, teeth * 3, 1); return geometry;
}
/* Rev 13 face lane. The atlas can only tint pixels that already exist, so a
 * painted eye could never carry a socket, a lid, or a specular highlight and
 * every row read as the same flat machined disc. The face is therefore real
 * bone-bound geometry: a recessed socket ring, a domed eyeball, an offset
 * pupil, an off-axis highlight, an asymmetric brow wedge, and separated
 * teeth. Every dimension is driven by the authored `face` column so menace,
 * grin, dopey, and regal resolve to visibly different heads. */
const FACE_KIND = Object.freeze({ socket: 0, sclera: 1, pupil: 2, highlight: 3, brow: 4, tooth: 5, lip: 6 });
const faceFeatureCache = new Map();
function faceBoneIndices(skeleton) {
  const index = (name) => { const i = skeleton?.bones?.findIndex((bone) => bone.name === name); return i >= 0 ? i : 0; };
  return { head: index('Head'), jaw: index('LowerJaw'), neck: index('Neck') };
}
/* A ring lying in the body's YZ plane, pushed out along X. `inset` pulls the
 * ring back toward the skull so the socket reads as a cavity rather than a
 * sticker: the rim sits proud, the floor sits recessed. */
function faceDisc(builder, cx, cy, cz, radiusY, radiusZ, x, kind, segments = 10, edge = 1) {
  const center = builder.vertex(x, cy, cz, kind, edge), ring = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * TAU;
    ring.push(builder.vertex(x, cy + Math.cos(a) * radiusY, cz + Math.sin(a) * radiusZ, kind, edge));
  }
  for (let i = 0; i < segments; i++) builder.tri(center, ring[i], ring[(i + 1) % segments]);
  return ring;
}
function faceDome(builder, cx, cy, cz, radiusY, radiusZ, xBase, xTip, kind, segments = 10) {
  const tip = builder.vertex(xTip, cy, cz, kind), ring = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * TAU;
    ring.push(builder.vertex(xBase, cy + Math.cos(a) * radiusY, cz + Math.sin(a) * radiusZ, kind));
  }
  for (let i = 0; i < segments; i++) builder.tri(tip, ring[i], ring[(i + 1) % segments]);
  return ring;
}
function faceBuilder() {
  const positions = [], indices = [], skinIndices = [], skinWeights = [], kinds = [], edges = [];
  let weights = [[0, 1]];
  const setWeights = (w) => { weights = w; };
  const vertex = (x, y, z, kind = 0, edge = 1) => {
    positions.push(x, y, z);
    const ids = [0, 0, 0, 0], values = [0, 0, 0, 0];
    let total = 0;
    for (let i = 0; i < Math.min(4, weights.length); i++) { ids[i] = weights[i][0]; values[i] = weights[i][1]; total += values[i]; }
    const inv = total > 1e-6 ? 1 / total : 1;
    for (let i = 0; i < 4; i++) { skinIndices.push(ids[i]); skinWeights.push(values[i] * inv); }
    kinds.push(kind); edges.push(edge);
    return positions.length / 3 - 1;
  };
  const tri = (a, b, c) => indices.push(a, b, c);
  /* A tooth is a free-standing wedge with its own base, so the silhouette
   * shows gaps between neighbours instead of a continuous machined grille. */
  const tooth = (y, halfY, zBase, zTip, xOuter, xInner) => {
    const b0 = vertex(xOuter, y - halfY, zBase, FACE_KIND.tooth), b1 = vertex(xInner, y - halfY, zBase, FACE_KIND.tooth);
    const b2 = vertex(xInner, y + halfY, zBase, FACE_KIND.tooth), b3 = vertex(xOuter, y + halfY, zBase, FACE_KIND.tooth);
    const tip = vertex((xOuter + xInner) * 0.5, y, zTip, FACE_KIND.tooth);
    const base = [b0, b1, b2, b3];
    for (let i = 0; i < 4; i++) tri(base[i], base[(i + 1) % 4], tip);
    tri(base[0], base[2], base[1]); tri(base[0], base[3], base[2]);
  };
  /* Same wedge as `tooth`, but from three already-transformed corner points,
   * so a row bound to a rotated bone can be authored in that bone's frame. */
  const toothAt = (outer, inner, tip, halfY, spreadVec = null) => {
    const axis = new THREE.Vector3().subVectors(inner, outer);
    const spread = spreadVec ? spreadVec.clone() : new THREE.Vector3(0, halfY, 0);
    const b0 = vertex(outer.x - spread.x, outer.y - spread.y, outer.z - spread.z, FACE_KIND.tooth);
    const b1 = vertex(inner.x - spread.x, inner.y - spread.y, inner.z - spread.z, FACE_KIND.tooth);
    const b2 = vertex(inner.x + spread.x, inner.y + spread.y, inner.z + spread.z, FACE_KIND.tooth);
    const b3 = vertex(outer.x + spread.x, outer.y + spread.y, outer.z + spread.z, FACE_KIND.tooth);
    const t = vertex(tip.x, tip.y, tip.z, FACE_KIND.tooth);
    const base = [b0, b1, b2, b3];
    for (let i = 0; i < 4; i++) tri(base[i], base[(i + 1) % 4], t);
    tri(base[0], base[2], base[1]); tri(base[0], base[3], base[2]);
    return axis;
  };
  const geometry = () => {
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    out.setAttribute('rfFaceKind', new THREE.Float32BufferAttribute(kinds, 1));
    out.setAttribute('rfFaceEdge', new THREE.Float32BufferAttribute(edges, 1));
    out.setIndex(indices); out.computeVertexNormals(); out.computeBoundingBox(); out.computeBoundingSphere();
    return { geometry: out, triangles: indices.length / 3, vertices: positions.length / 3 };
  };
  return { vertex, tri, tooth, toothAt, setWeights, geometry };
}
/* Rev 13 face fix. Tooth stations used to be authored against the BIND-space
 * body band, but Head and LowerJaw carry a per-row non-uniform scale from the
 * armature/personality pass (measured: reef 1.00, megalodon 1.39, typhonmaw
 * 1.63, leviathan_rex 1.56). Skinning then stretches a fixed bind station into
 * a different place on every row, which marched the upper row up over the
 * skull as a trail of specks and threw the kaiju lower row off the snout.
 * The mouth is therefore measured in SKINNED space, where the lip actually
 * is, and each tooth is converted back through its own bone's inverse so the
 * vertex lands on the lip once skinning re-applies the bone. */
function faceSkinnedMouth(body) {
  const geometry = body.geometry, position = geometry.getAttribute('position');
  const skinIndex = geometry.getAttribute('skinIndex'), skinWeight = geometry.getAttribute('skinWeight');
  const bones = body.skeleton?.bones || [];
  const headIndex = bones.findIndex((bone) => bone.name === 'Head');
  const jawIndex = bones.findIndex((bone) => bone.name === 'LowerJaw');
  if (!position || !skinIndex || !skinWeight || headIndex < 0 || jawIndex < 0) return null;
  const point = new THREE.Vector3(), head = [], jaw = [];
  let yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i); body.applyBoneTransform(i, point);
    yMin = Math.min(yMin, point.y); yMax = Math.max(yMax, point.y);
    let headWeight = 0, jawWeight = 0;
    for (let k = 0; k < 4; k++) {
      const bone = skinIndex.getComponent(i, k), weight = skinWeight.getComponent(i, k);
      if (bone === headIndex) headWeight += weight; else if (bone === jawIndex) jawWeight += weight;
    }
    if (headWeight > 0.5) head.push([point.x, point.y, point.z]);
    if (jawWeight > 0.5) jaw.push([point.x, point.y, point.z]);
  }
  if (head.length < 8 || jaw.length < 8) return null;
  const span = Math.max(yMax - yMin, 1e-6);
  /* The grin runs along the overlap of Head and LowerJaw influence: that is
   * the mouth line on every row regardless of how the bones were scaled. */
  const headMin = Math.min(...head.map((p) => p[1])), headMax = Math.max(...head.map((p) => p[1]));
  const jawMin = Math.min(...jaw.map((p) => p[1])), jawMax = Math.max(...jaw.map((p) => p[1]));
  const mouthMin = Math.max(headMin, jawMin), mouthMax = Math.min(headMax, jawMax);
  if (!(mouthMax > mouthMin)) return null;
  return { head, jaw, span, yMin, yMax, mouthMin, mouthMax, headIndex, jawIndex };
}
/* The silhouette of the skinned head at one Y slice. `side` is deliberately
 * NOT the slice's widest point: the head is widest at the cheek, while the lip
 * sits lower and narrower, so seating a tooth at the cheek width leaves it out
 * in open water beside the face (measured on typhonmaw: cheek 0.0218 against a
 * 0.0123 lip). The width is therefore sampled only among points near the given
 * lip depth, which is what actually puts a tooth on the mouth line. */
function faceSkinnedBand(points, y, tolerance, lipFraction = null) {
  const slice = [];
  let top = -Infinity, bottom = Infinity, nearest = Infinity;
  for (const p of points) {
    const distance = Math.abs(p[1] - y);
    if (distance <= tolerance || distance < nearest) {
      if (distance < nearest) { nearest = distance; top = -Infinity; bottom = Infinity; slice.length = 0; }
      if (distance <= tolerance || slice.length === 0) {
        top = Math.max(top, p[2]); bottom = Math.min(bottom, p[2]); slice.push(p);
      }
    }
  }
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || !slice.length) return null;
  const depth = Math.max(top - bottom, 1e-6);
  let side = 0;
  if (lipFraction === null) {
    for (const p of slice) side = Math.max(side, Math.abs(p[0]));
  } else {
    const lipZ = bottom + depth * lipFraction, window = depth * 0.30;
    for (const p of slice) if (Math.abs(p[2] - lipZ) <= window) side = Math.max(side, Math.abs(p[0]));
    if (side <= 0) for (const p of slice) side = Math.max(side, Math.abs(p[0]));
  }
  return { top, bottom, side: Math.max(side, tolerance * 0.20) };
}
/* Geometry-space face metrics, returned for the selftest gate so socket
 * depth, pupil offset, and tooth separation are proved numerically rather
 * than by eye. */
function faceGeometryFor(body, def) {
  const id = String(def?.id || ''), key = `${id}`;
  if (faceFeatureCache.has(key)) return faceFeatureCache.get(key);
  const geometry = body.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox, span = Math.max(box.max.y - box.min.y, 1e-5), bones = faceBoneIndices(body.skeleton);
  const personality = personalityOf(def), face = personality?.face || { eye: 1, brow: 0, pupil: 1, gape: 0, tilt: 0 };
  /* The authored eye value is honoured close to its face value. The old 0.55
   * floor pulled every small-eyed row up to a big flat disc, which is why
   * typhonmaw (authored eye 0.64, an old-god squint) rendered as an oversized
   * red plate. The floor is now low enough to let a mean eye stay mean. */
  const eyeScale = clamp(finite(face.eye, 1), 0.34, 1.45), browAmount = clamp(finite(face.brow, 0), -1, 1);
  const pupilScale = clamp(finite(face.pupil, 1), 0.60, 1.50), tilt = clamp(finite(face.tilt, 0), -1, 1);
  const builder = faceBuilder();
  /* Station 0.155 is the eye line on the Sharky head; the band gives the
   * live silhouette so the socket sits on the skin, not floating beside it. */
  const eyeStation = 0.132, eyeY = box.min.y + span * eyeStation, band = sharkjiraBand(geometry, eyeY, span);
  const eyeZ = band.top - span * 0.050 + tilt * span * 0.004;
  /* The eye is sized against the HEAD, not the whole body: a bulky kaiju skull
   * is a much larger fraction of the body than a reef scout's, so a body-span
   * eye ballooned exactly on the rows the owner called out. `band.side` is the
   * head half-width at the eye line, which tracks the skull itself. */
  const headScale = clamp(band.side / Math.max(span * 0.115, 1e-6), 0.72, 1.30);
  const socketRadius = span * 0.0165 * eyeScale * headScale, eyeRadius = socketRadius * 0.78;
  const skinX = band.side;
  /* The socket floor is pushed INTO the skull and the eyeball sits proud of
   * it, so the lit rim reads as an actual orbit at gameplay size. */
  const socketX = skinX * 0.995, socketFloorX = skinX * 0.965, eyeBaseX = skinX * 1.006, eyeTipX = skinX * 1.052;
  const socketDepth = socketX - socketFloorX;
  /* Pupil deliberately off dead-centre: forward and slightly down, scaled by
   * tilt, which is what separates an alive stare from a machined dot. */
  const pupilOffsetY = eyeRadius * (0.20 + 0.16 * tilt), pupilOffsetZ = eyeRadius * (-0.10 - 0.14 * tilt);
  const pupilRadius = eyeRadius * clamp(0.46 * pupilScale, 0.24, 0.66);
  /* The highlight sits up-and-forward of the pupil, never concentric. */
  const highlightRadius = eyeRadius * 0.26, highlightY = pupilOffsetY + eyeRadius * 0.30, highlightZ = pupilOffsetZ + eyeRadius * 0.40;
  const pupilOffset = Math.hypot(pupilOffsetY, pupilOffsetZ) / Math.max(eyeRadius, 1e-6);
  for (const side of [-1, 1]) {
    builder.setWeights([[bones.head, 1]]);
    const sx = side < 0 ? -1 : 1;
    /* Socket: proud rim ring, recessed floor. */
    faceDisc(builder, 0, eyeY, eyeZ, socketRadius, socketRadius * 0.88, sx * socketFloorX, FACE_KIND.socket, 12, 0.25);
    /* Eyeball dome, offset pupil, off-axis highlight. */
    faceDome(builder, 0, eyeY, eyeZ, eyeRadius, eyeRadius * 0.92, sx * eyeBaseX, sx * eyeTipX, FACE_KIND.sclera, 12);
    faceDisc(builder, 0, eyeY + pupilOffsetY, eyeZ + pupilOffsetZ, pupilRadius, pupilRadius, sx * (eyeTipX + span * 0.0007), FACE_KIND.pupil, 10);
    faceDisc(builder, 0, eyeY + highlightY, eyeZ + highlightZ, highlightRadius, highlightRadius, sx * (eyeTipX + span * 0.0014), FACE_KIND.highlight, 8);
    /* Brow wedge. The inner end is deliberately lower than the outer end so
     * the eye is never framed by a symmetric hard edge. A negative brow
     * (dopey/regal) lifts and softens; a positive brow (menace) drives down
     * and inward over the pupil. */
    const browZ = eyeZ + socketRadius * (0.58 - browAmount * 0.26);
    const browInnerY = eyeY + socketRadius * (0.90 + browAmount * 0.30), browOuterY = eyeY - socketRadius * (1.05 + browAmount * 0.18);
    const browThick = socketRadius * (0.20 + Math.abs(browAmount) * 0.24);
    const bx = sx * skinX * 1.004, bxIn = sx * skinX * 0.980;
    const p0 = builder.vertex(bx, browInnerY, browZ - browThick * (0.30 - browAmount * 0.50), FACE_KIND.brow);
    const p1 = builder.vertex(bx, browOuterY, browZ + browThick * (0.10 + browAmount * 0.34), FACE_KIND.brow);
    const p2 = builder.vertex(bx, browOuterY, browZ + browThick * (1.00 + browAmount * 0.20), FACE_KIND.brow);
    const p3 = builder.vertex(bx, browInnerY, browZ + browThick * (0.86 - browAmount * 0.30), FACE_KIND.brow);
    const q0 = builder.vertex(bxIn, browInnerY, browZ - browThick * (0.30 - browAmount * 0.50), FACE_KIND.brow);
    const q1 = builder.vertex(bxIn, browOuterY, browZ + browThick * (0.10 + browAmount * 0.34), FACE_KIND.brow);
    const q2 = builder.vertex(bxIn, browOuterY, browZ + browThick * (1.00 + browAmount * 0.20), FACE_KIND.brow);
    const q3 = builder.vertex(bxIn, browInnerY, browZ + browThick * (0.86 - browAmount * 0.30), FACE_KIND.brow);
    const outer = [p0, p1, p2, p3], inner = [q0, q1, q2, q3];
    builder.tri(p0, p1, p2); builder.tri(p0, p2, p3);
    builder.tri(q0, q2, q1); builder.tri(q0, q3, q2);
    for (let i = 0; i < 4; i++) { const n = (i + 1) % 4; builder.tri(outer[i], inner[i], inner[n]); builder.tri(outer[i], inner[n], outer[n]); }
  }
  /* Separated teeth along the jaw line. Upper teeth ride the Head bone and
   * lower teeth ride LowerJaw, so the grin opens with the rest gape instead
   * of shearing as one rigid slot. Gap is a real modelled space, gated in
   * the selftest. */
  /* Teeth are placed station by station against the LIVE band at that
   * station, so the row follows the snout taper instead of running off the
   * tip. The span stays inside the LowerJaw influence range (~0.06-0.24) so
   * the upper and lower rows shear apart correctly when the jaw opens. */
  const toothCount = 5;
  const mouth = faceSkinnedMouth(body);
  /* Both rows are authored in SKINNED space and then pushed back through the
   * owning bone's inverse, so the grin sits on the lip line of every row,
   * including the scaled/morphed kaiju rows. */
  const headBone = body.skeleton?.bones?.[bones.head], jawBone = body.skeleton?.bones?.[bones.jaw];
  const boneInverse = (bone) => bone
    ? new THREE.Matrix4().multiplyMatrices(body.bindMatrixInverse, bone.matrixWorld).invert()
    : new THREE.Matrix4();
  const headInverse = boneInverse(headBone), jawInverse = boneInverse(jawBone);
  /* Inset off both ends of the Head/LowerJaw overlap: the grin stops short of
   * the nose tip and short of the hinge, which is where the lip actually is. */
  const mouthSpan = mouth ? mouth.mouthMax - mouth.mouthMin : span * 0.10;
  /* The Head/LowerJaw overlap runs back past the mouth corner into the
   * throat on the bulky rows, so the grin uses only the forward part of it. */
  const mouthStart = mouth ? mouth.mouthMin + mouthSpan * 0.10 : box.min.y + span * 0.072;
  const mouthEnd = mouth ? mouth.mouthMin + mouthSpan * 0.42 : box.min.y + span * 0.172;
  /* Every remaining length in the grin is expressed against the MOUTH, not
   * the skinned body span. The skinned body span carries the group's world
   * scale and differs wildly per row (measured 0.071 on leviathan_rex against
   * 0.366 on typhonmaw for the same ~0.057 geometry span), so using it as the
   * band tolerance averaged each "slice" over most of the head and let the
   * row sprawl off the lip. */
  const toothPitch = (mouthEnd - mouthStart) / Math.max(toothCount - 1, 1);
  const bandTolerance = Math.max(toothPitch * 0.60, 1e-6);
  const workingSpan = mouthSpan;
  const toothHalfY = toothPitch * 0.30, toothGap = toothPitch - toothHalfY * 2;
  let mouthZ = 0, toothSide = 0, toothSeatMax = 0;
  for (let i = 0; i < toothCount; i++) {
    const y = mouthStart + (mouthEnd - mouthStart) * (i / Math.max(toothCount - 1, 1));
    const upperBand = mouth ? faceSkinnedBand(mouth.head, y, bandTolerance, 0.10) : sharkjiraBand(geometry, y, span);
    const lowerBand = mouth ? faceSkinnedBand(mouth.jaw, y, bandTolerance, 0.90) : upperBand;
    if (!upperBand || !lowerBand) continue;
    /* Seat the upper row ON the lower lip of the head band and the lower row
     * ON the top of the jaw band, so the two rows meet at the mouth line
     * instead of fringing under the chin. */
    const lipZ = upperBand.bottom + (upperBand.top - upperBand.bottom) * 0.16;
    const jawZ = lowerBand.top - (lowerBand.top - lowerBand.bottom) * 0.16;
    const upperSide = Math.max(upperBand.side * 0.90, toothPitch * 0.60);
    const lowerSide = Math.max(lowerBand.side * 0.90, toothPitch * 0.60);
    /* Tooth size is keyed to the MOUTH, not the whole body. Keying it to the
     * body span inflated the teeth on the bulky rows, whose head is a much
     * larger fraction of the body (measured tooth extent went 0.014 span on
     * reef to 0.041 on leviathan_rex), which is what read as a fringe of
     * oversized fangs hanging off the chin. */
    const taper = 1 - i / (toothCount + 2), height = toothPitch * 0.72 * (0.70 + 0.55 * taper);
    mouthZ = lipZ; toothSide = upperSide;
    toothSeatMax = Math.max(toothSeatMax, Math.abs(lipZ - jawZ) / Math.max(workingSpan, 1e-6));
    /* The tooth's width runs along the body length axis. After the bone
     * inverse that axis is no longer local +Y, so the spread is transformed
     * as a direction (w = 0) rather than assumed. */
    const spreadOf = (matrix, halfY) => {
      const a = new THREE.Vector3(0, 0, 0).applyMatrix4(matrix);
      const b = new THREE.Vector3(0, halfY, 0).applyMatrix4(matrix);
      return b.sub(a);
    };
    const upperSpread = spreadOf(headInverse, toothHalfY), lowerSpread = spreadOf(jawInverse, toothHalfY * 0.86);
    for (const side of [-1, 1]) {
      const sx = side < 0 ? -1 : 1;
      builder.setWeights([[bones.head, 1]]);
      const uo = new THREE.Vector3(sx * upperSide * 0.985, y, lipZ + toothPitch * 0.10).applyMatrix4(headInverse);
      const ui = new THREE.Vector3(sx * upperSide * 0.76, y, lipZ + toothPitch * 0.10).applyMatrix4(headInverse);
      const ut = new THREE.Vector3(sx * upperSide * 0.87, y, lipZ - height).applyMatrix4(headInverse);
      builder.toothAt(uo, ui, ut, toothHalfY, upperSpread);
      /* The lower row rides LowerJaw, so it opens with the bite. */
      builder.setWeights([[bones.jaw, 1]]);
      const lo = new THREE.Vector3(sx * lowerSide * 0.985, y, jawZ - toothPitch * 0.10).applyMatrix4(jawInverse);
      const li = new THREE.Vector3(sx * lowerSide * 0.76, y, jawZ - toothPitch * 0.10).applyMatrix4(jawInverse);
      const lt = new THREE.Vector3(sx * lowerSide * 0.87, y, jawZ + height * 0.86).applyMatrix4(jawInverse);
      builder.toothAt(lo, li, lt, toothHalfY * 0.86, lowerSpread);
    }
  }
  const built = builder.geometry();
  /* Rendered-position gate. Every tooth is pushed through its own bone the way
   * skinning will, then measured against the live head/jaw surface and the
   * head span. This is the numeric stand-in for "teeth must sit on the lip
   * line of every row, including the morphed/bulky rows": a tooth that floats
   * above the back or dangles under the chin fails it. */
  const toothSeating = (() => {
    const out = { maxSurfaceRatio: 0, medianSurfaceRatio: 0, outsideHeadSpan: 0, teeth: 0, headSpan: 0 };
    if (!mouth) return out;
    const surface = mouth.head.concat(mouth.jaw);
    if (!surface.length) return out;
    let hyMin = Infinity, hyMax = -Infinity;
    for (const p of surface) { hyMin = Math.min(hyMin, p[1]); hyMax = Math.max(hyMax, p[1]); }
    const headSpan = Math.max(hyMax - hyMin, 1e-6);
    const position = built.geometry.getAttribute('position');
    const kindAttribute = built.geometry.getAttribute('rfFaceKind');
    const skinIndexAttribute = built.geometry.getAttribute('skinIndex');
    const point = new THREE.Vector3(), ratios = [];
    const headMatrix = headBone ? new THREE.Matrix4().multiplyMatrices(body.bindMatrixInverse, headBone.matrixWorld) : new THREE.Matrix4();
    const jawMatrix = jawBone ? new THREE.Matrix4().multiplyMatrices(body.bindMatrixInverse, jawBone.matrixWorld) : new THREE.Matrix4();
    for (let i = 0; i < position.count; i++) {
      const kind = kindAttribute.getX(i);
      if (kind < FACE_KIND.tooth - 0.5 || kind > FACE_KIND.tooth + 0.5) continue;
      point.fromBufferAttribute(position, i);
      point.applyMatrix4(skinIndexAttribute.getX(i) === bones.jaw ? jawMatrix : headMatrix);
      if (point.y < hyMin - headSpan * 0.05 || point.y > hyMax + headSpan * 0.05) out.outsideHeadSpan++;
      let best = Infinity;
      for (const q of surface) {
        const dx = q[0] - point.x, dy = q[1] - point.y, dz = q[2] - point.z;
        const d = dx * dx + dy * dy + dz * dz; if (d < best) best = d;
      }
      ratios.push(Math.sqrt(best) / headSpan);
    }
    if (!ratios.length) return out;
    ratios.sort((a, b) => a - b);
    out.teeth = ratios.length; out.headSpan = headSpan;
    out.maxSurfaceRatio = ratios[ratios.length - 1];
    out.medianSurfaceRatio = ratios[Math.floor(ratios.length / 2)];
    return out;
  })();
  const result = {
    geometry: built.geometry, triangles: built.triangles, vertices: built.vertices,
    metrics: {
      socketDepth, socketDepthRatio: socketDepth / Math.max(socketRadius, 1e-6),
      pupilOffsetRatio: pupilOffset, pupilRadiusRatio: pupilRadius / Math.max(eyeRadius, 1e-6),
      highlightRadiusRatio: highlightRadius / Math.max(eyeRadius, 1e-6),
      highlightConcentric: Math.hypot(highlightY - pupilOffsetY, highlightZ - pupilOffsetZ) / Math.max(eyeRadius, 1e-6),
      eyeRadius, socketRadius, toothCount: toothCount * 4, toothGap, toothGapRatio: toothGap / Math.max(toothPitch, 1e-6),
      toothSurfaceMaxRatio: toothSeating.maxSurfaceRatio, toothSurfaceMedianRatio: toothSeating.medianSurfaceRatio,
      toothOutsideHeadSpan: toothSeating.outsideHeadSpan, toothSeatSpread: toothSeatMax,
      browAsymmetry: Math.abs(browInnerYFor(eyeY, socketRadius, browAmount) - browOuterYFor(eyeY, socketRadius, browAmount)) / Math.max(socketRadius, 1e-6)
    }
  };
  faceFeatureCache.set(key, result); return result;
}
function browInnerYFor(eyeY, socketRadius, browAmount) { return eyeY + socketRadius * (0.90 + browAmount * 0.30); }
function browOuterYFor(eyeY, socketRadius, browAmount) { return eyeY - socketRadius * (1.05 + browAmount * 0.18); }
/* The face batch is its own material so the eye can be pure white/dark and
 * fully escape the body palette resolver. Kinds are branched in the shader. */
function faceMaterial(def, palette) {
  const personality = personalityOf(def), face = personality?.face || { eye: 1, brow: 0, pupil: 1, gape: 0, tilt: 0 };
  const eyeColor = eyeColorOf(def), base = palette.base.clone();
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(1, 1, 1), roughness: 0.34, metalness: 0.0, side: THREE.DoubleSide });
  material.name = `RF Rev 13 face ${def?.id || 'unknown'}`;
  const uniforms = {
    uRfFaceIris: { value: eyeColor.clone() },
    uRfFaceSocket: { value: base.clone().multiplyScalar(0.34) },
    uRfFaceBrowColor: { value: base.clone().multiplyScalar(0.52) },
    uRfFaceLidTint: { value: base.clone().multiplyScalar(0.78) }
  };
  material.userData.rfFaceUniforms = uniforms;
  material.userData.rfFaceAttitude = { eye: face.eye, brow: face.brow, pupil: face.pupil, gape: face.gape, tilt: face.tilt };
  material.onBeforeCompile = (shader) => {
    for (const [name, uniform] of Object.entries(uniforms)) shader.uniforms[name] = uniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float rfFaceKind;\nattribute float rfFaceEdge;\nvarying float vRfFaceKind;\nvarying float vRfFaceEdge;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRfFaceKind = rfFaceKind;\nvRfFaceEdge = rfFaceEdge;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRfFaceIris;\nuniform vec3 uRfFaceSocket;\nuniform vec3 uRfFaceBrowColor;\nuniform vec3 uRfFaceLidTint;\nvarying float vRfFaceKind;\nvarying float vRfFaceEdge;')
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        'float rfK = vRfFaceKind;',
        /* socket: dark recessed orbit tinted from the body so it reads as
         * flesh, not a black hole punched in the head. */
        'if (rfK < 0.5) diffuseColor.rgb = uRfFaceSocket * mix(0.85, 1.25, vRfFaceEdge);',
        /* sclera: warm off-white, never pure paper white. */
        'else if (rfK < 1.5) diffuseColor.rgb = mix(vec3(0.94, 0.95, 0.92), uRfFaceLidTint, 0.16);',
        /* pupil: deep iris-tinted core. */
        'else if (rfK < 2.5) diffuseColor.rgb = uRfFaceIris * 0.30;',
        /* highlight: the specular catch-light that sells a living eye. */
        'else if (rfK < 3.5) diffuseColor.rgb = vec3(1.0);',
        'else if (rfK < 4.5) diffuseColor.rgb = uRfFaceBrowColor;',
        'else diffuseColor.rgb = vec3(0.95, 0.95, 0.90);'
      ].join('\n'));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <emissivemap_fragment>', [
        '#include <emissivemap_fragment>',
        /* Lift only the iris ring and the catch-light so the eye stays
         * readable against a bright pale-water background at 64x30. */
        'float rfIris = step(1.5, vRfFaceKind) - step(2.5, vRfFaceKind);',
        'float rfSpec = step(2.5, vRfFaceKind) - step(3.5, vRfFaceKind);',
        'totalEmissiveRadiance += uRfFaceIris * rfIris * 0.38;',
        'totalEmissiveRadiance += vec3(1.0) * rfSpec * 0.55;'
      ].join('\n'));
  };
  material.customProgramCacheKey = () => 'rf-rev13-face';
  material.needsUpdate = true;
  return material;
}
function makeFace(body, def, palette) {
  const built = faceGeometryFor(body, def), parent = body.parent;
  if (!built || !parent) return null;
  const mesh = new THREE.SkinnedMesh(built.geometry, faceMaterial(def, palette));
  mesh.name = `RF Rev 13 face ${def?.id || 'unknown'}`;
  mesh.renderOrder = 3; mesh.frustumCulled = false;
  mesh.bind(body.skeleton, body.bindMatrix.clone(), body.bindMatrixInverse.clone());
  parent.add(mesh); parent.updateMatrixWorld(true); mesh.computeBoundingBox();
  mesh.userData.rfExcludeFromBounds = true;
  mesh.userData.rfFaceMetrics = built.metrics;
  mesh.userData.rfFaceTriangles = built.triangles;
  return mesh;
}
function makeProp(def, base, headBone, palette) {
  const kind = propKind(def, base), geometry = kind === 'grin' ? grinGeometry() : propGeometry(kind); if (!kind || !geometry || !headBone) return null;
  const material = kind === 'hammer' ? skinMaterial(palette, def, null, 'Hammer Cephalofoil', false, 'hammer') : skinMaterial(palette, def, null, `${kind} anatomical feature`, false);
  const prop = new THREE.Mesh(geometry, material); prop.name = `RF head prop ${kind}`; prop.userData.rfPropKind = kind; prop.userData.rfPropBase = base;
  /* GLB bone matrices carry the armature's authored scale/shear. A non-zero
   * child translation is magnified into a floating prop; the geometry itself
   * owns its small anatomical offset and stays at the bone origin. */
  prop.position.set(0, 0, 0);
  // Prop geometry is authored in the rig's pre-normalized local space. The
  // armature scene carries a large normalization scale, so keep the optional
  // head accent subordinate to the artist mesh (especially the broad hammer
  // foil, which otherwise becomes a camera-filling slab).
  if (kind === 'horns') prop.scale.set(0.9, 0.9, 0.9);
  headBone.add(prop); return prop;
}
function fitProp(prop, body, kind) {
  if (!prop || !body) return;
  prop.updateMatrixWorld(true); body.updateMatrixWorld(true);
  const bodyBox = new THREE.Box3().setFromObject(body), propBox = new THREE.Box3().setFromObject(prop);
  const bodySize = bodyBox.getSize(new THREE.Vector3()), propSize = propBox.getSize(new THREE.Vector3()), current = Math.max(propSize.x, propSize.y, propSize.z, 1e-5);
  if (kind === 'hammer') {
    /* The foil's span runs on local x, which the Head bone maps to world z
     * (the shark's width). Scale that span against the body width so the
     * cephalofoil reads as a real hammer: wider than the body, but nowhere
     * near the body's LENGTH, which is what bodySize.x would have compared
     * it against. */
    const bodyWidth = Math.max(bodySize.z, 1e-5), projected = Math.max(propSize.z, 1e-5);
    prop.scale.multiplyScalar(clamp((bodyWidth * 1.70) / projected, 0.012, 0.55));
    /* The foil is a head, not a hat. Push it back along the rig's length
     * axis until its concave trailing edge overlaps the snout mass, so the
     * silhouette is continuous instead of a plate with an air gap. Depth is
     * left slightly proud so the slab thickness still catches light in the
     * 0.42 yaw gameplay pose. */
    prop.updateMatrixWorld(true);
    /* Seat along whichever local axis is currently shortest in world space:
     * that is the slab's thickness direction, and moving the foil back along
     * the body length axis is what closes the gap. Measured in the prop's own
     * local frame so the bone's authored scale cannot magnify the offset. */
    const seated = new THREE.Box3().setFromObject(prop), seatedSize = seated.getSize(new THREE.Vector3());
    const local = new THREE.Box3().setFromBufferAttribute(prop.geometry.getAttribute('position'));
    const localSize = local.getSize(new THREE.Vector3()), localCenter = local.getCenter(new THREE.Vector3());
    /* Geometry spans x (foil width) and y (sweep); y is the rig length axis,
     * so pull the foil back along -y until its concave rear edge overlaps. */
    /* Seat the foil back into the skull so the snout and mouth stay visible
     * in front of it: the cephalofoil is the BROW of the head, not a muzzle
     * cap. Measured in local units against the prop's own scale.
     *
     * Rev 13 rework: 0.62 of the local sweep pushed the foil clean off the
     * skull and onto the torso, which is why it rendered as a box bolted to
     * the shoulders. The loft's own sweep already carries the foil back
     * (the leading edge is swept and the trailing edge is concave), so only
     * a small seating nudge is needed to bury the root in the head. */
    /* Local y maps to world x (the rig LENGTH axis) and the snout is at +x,
     * so a negative offset drags the foil backward into the torso. The
     * cephalofoil belongs forward, spanning the brow just behind the snout
     * tip, which is where it reads as a T in the 0.42 yaw. */
    prop.position.y += localSize.y * 0.46 * prop.scale.y;
    prop.position.x -= localCenter.x * prop.scale.x;
    prop.userData.rfFitScale = prop.scale.x;
    /* Thickness is reported against the widest world axis so the gate reads
     * a genuine slab-versus-plate ratio rather than an axis mix-up. */
    const widest = Math.max(seatedSize.x, seatedSize.y, seatedSize.z);
    const thinnest = Math.min(seatedSize.x, seatedSize.y, seatedSize.z);
    prop.userData.rfFoilThicknessRatio = thinnest / Math.max(widest, 1e-5);
    return;
  }
  const bodyThickness = Math.max(bodySize.y, bodySize.z, bodySize.x * 0.16), ratio = kind === 'saw' ? 0.46 : kind === 'horns' ? 0.54 : kind === 'crown' ? 0.68 : 0.86;
  prop.scale.multiplyScalar(clamp((bodyThickness * ratio) / current, 0.012, 0.55));
  prop.userData.rfFitScale = prop.scale.x;
}
function propContactGap(body, prop) {
  if (!body || !prop) return Infinity;
  body.updateMatrixWorld(true); prop.updateMatrixWorld(true);
  const bodyBox = new THREE.Box3().setFromObject(body), point = prop.getWorldPosition(new THREE.Vector3());
  const closest = new THREE.Vector3(
    clamp(point.x, bodyBox.min.x, bodyBox.max.x), clamp(point.y, bodyBox.min.y, bodyBox.max.y), clamp(point.z, bodyBox.min.z, bodyBox.max.z)
  );
  const gap = point.distanceTo(closest); prop.userData.rfContactGap = gap; return gap;
}
function propIsMounted(body, prop) {
  if (!body || !prop) return false;
  const bodyBox = new THREE.Box3().setFromObject(body), propBox = new THREE.Box3().setFromObject(prop), size = bodyBox.getSize(new THREE.Vector3());
  const expanded = bodyBox.clone().expandByScalar(Math.max(size.x, size.y, size.z) * 0.025);
  prop.userData.rfBoxContact = expanded.intersectsBox(propBox);
  return prop.userData.rfBoxContact && propContactGap(body, prop) <= Math.max(size.x, size.y, size.z) * 0.08;
}
function mountGrin(prop, pose, body, propBone) {
  if (!prop || prop.userData.rfPropKind !== 'grin' || !pose || !body) return;
  if (propBone?.remove) propBone.remove(prop);
  pose.add(prop);
  body.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(body), size = box.getSize(new THREE.Vector3());
  prop.position.set(box.max.x - size.x * 0.14, box.min.y + size.y * 0.38, box.max.z + Math.max(size.z * 0.012, 0.002));
  prop.rotation.set(0, 0, 0);
  prop.scale.setScalar(Math.max(size.y * 0.52 / 0.18, 0.08));
  prop.userData.rfMountedBone = propBone?.name || 'Head';
}
function scaleOnAxis(root, template, lengthScale, heightScale, depthScale) {
  const scale = new THREE.Vector3(heightScale, heightScale, depthScale);
  if (template.axis === 'x') scale.x = lengthScale; else if (template.axis === 'y') scale.y = lengthScale; else scale.z = lengthScale;
  root.scale.multiply(scale); return scale;
}
function drawCount(root) { let count = 0; root.traverse((o) => { if (o.isMesh && o.visible) count++; }); return count; }
function makePlaceholder(def, group) {
  const material = new THREE.MeshStandardMaterial({ color: paletteOf(def).base, roughness: 0.5, metalness: 0.03 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.36, 0.24), material); mesh.name = 'RF Rev 9 loading placeholder'; group.add(mesh); return mesh;
}

function buildLoadedRig(def, template, group) {
  const palette = paletteOf(def), personality = personalityOf(def), model = cloneRigScene(template), meshes = findMeshes(model), skinnedMeshes = meshes.filter((mesh) => mesh.isSkinnedMesh), body = skinnedMeshes[0] || meshes[0];
  /* Rev 14: a textured row is lit painted skin, not a repainted toon hull.
   * That single flag gates the material choice, the personality sculpt (the
   * bake already carries its own silhouette and the sculpt would fight the
   * baked normal map and UVs), the geometry face overlay (the bake paints
   * its own eyes and mouth), and the procedural swim below. */
  const textured = TEXTURED_KEYS.has(String(template.key || ''));
  if (!body) throw new Error(`${def.id}: cloned model has no body`);
  const pose = new THREE.Group(); pose.name = 'RF Rev 9b pose root'; group.add(pose); pose.add(model);
  const headBone = findHeadBone(model, template.key), propBone = findPropBone(model, template.key, propKind(def));
  const head = String(def?.sil?.head || ''), bulky = head === 'whale' || head === 'kaiju';
  const lengthScale = clamp((0.88 + finite(def?.sil?.len, 1) * 0.035 + finite(def?.sil?.girth, 0.34) * 0.24) * (bulky ? 1.06 : 1), 0.85, 1.35);
  const heightScale = clamp(0.91 + finite(def?.sil?.girth, 0.34) * (bulky ? 0.76 : 0.55) + (bulky ? 0.10 : 0), 0.90, 1.30);
  /* Sharkjira's kaiju chest is carried by the bones, not by a camera-filling
   * global depth multiplier. This preserves the Sharky profile ratio while
   * the fin compensation in variantProfile keeps the normal dorsal size. */
  const depthScale = def?.id === SHARKJIRA_ID ? 0.78 : clamp(0.94 + finite(def?.sil?.finScale, 1) * 0.035, 0.90, 1.20);
  scaleOnAxis(model, template, lengthScale, heightScale, depthScale);
  const profile = variantProfile(def), boneProfile = applyVariantBoneProfile(model, template, profile);
  const bakedGeometry = [];
  for (let meshIndex = 0; meshIndex < skinnedMeshes.length; meshIndex++) {
    const mesh = skinnedMeshes[meshIndex], sourceMesh = template.skinnedMeshes[meshIndex] || template.body;
    /* The personality sculpt displaces vertices against the Sharky bind pose
     * and recomputes normals. On a baked asset that would desynchronize the
     * mesh from its tangent-space normal map and its UV layout, so a textured
     * row keeps the authored geometry exactly as the bake produced it. */
    mesh.geometry = textured ? sourceMesh.geometry : personalityGeometryFor(sourceMesh, def, template.key, meshIndex);
    /* HSE lane fix: the textured path SHARES the bake's authored geometry
     * across every row that uses the template, so a morph record stamped on
     * geometry.userData carried the FIRST row's id and failed the contract
     * for the second row built from the same base. Build the record per rig
     * call and leave the shared geometry untouched. */
    const morphRecord = textured ? { id: String(def?.id || ''), neutral: true, maxOffset: 0, maxOffsetRatio: 0, maxOffsetOutsideCrest: 0, maxOffsetOutsideCrestRatio: 0, vertexCount: mesh.geometry.getAttribute('position')?.count || 0, seamFree: true, roleSource: 'textured bake: authored geometry preserved', crest: null } : (mesh.geometry.userData.rfPersonalityBaked || null);
    bakedGeometry.push(morphRecord);
    const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const atlas = template.key === 'sharky' || sourceMaterials.some((material) => String(material?.name || '') === 'AtlasMaterial');
    if (def?.id === SHARKJIRA_ID && !mesh.geometry.getAttribute('rfCrest')) mesh.geometry.setAttribute('rfCrest', new THREE.Float32BufferAttribute(new Float32Array(mesh.geometry.getAttribute('position').count), 1));
    if (def?.id === SHARKJIRA_ID && !mesh.geometry.getAttribute('rfCrestEdge')) mesh.geometry.setAttribute('rfCrestEdge', new THREE.Float32BufferAttribute(new Float32Array(mesh.geometry.getAttribute('position').count), 1));
    const materials = sourceMaterials.map((sourceMaterial) => textured
      ? texturedSkinMaterial(palette, def, sourceMaterial, sourceMaterial?.name || '', template.bindUp, template.bindUpExtent)
      : skinMaterial(palette, def, sourceMaterial, sourceMaterial?.name || '', atlas));
    mesh.material = materials.length === 1 ? materials[0] : materials;
    mesh.userData.rfMaterialSlots = sourceMaterials.map((material) => String(material?.name || 'Body')); mesh.renderOrder = 1;
    if (def?.id === SHARKJIRA_ID) mesh.frustumCulled = false;
    if (!mesh.geometry.getAttribute('rfSlot')) mesh.geometry.setAttribute('rfSlot', new THREE.Float32BufferAttribute(new Float32Array(mesh.geometry.getAttribute('position').count).fill(1), 1));
  }
  const hseMorph = textured ? applyMorph(model, body, def, { ...profile, personality, bindUp: template.bindUp }) : null;
  /* HSE lane F1: re-measure the dorsal axis on the BOUND rig.
   * prepareTemplate's bindUp is taken from the source mesh before the skeleton
   * is bound, and for several bakes the answer changes across that step
   * (measured against the posed rig: reef/tiger are skinned -X as reported,
   * but hammerhead/greatwhite/hadesmaw/snapjaw/magmaw are skinned +Z where
   * prepareTemplate reports +Y, which correlates ~0.0 with world up). Dotting
   * against the stale axis ran the countershade along a meaningless direction
   * and measured the BACK brighter than the belly on 20 rows. This updates the
   * already-installed uniform objects in place: no recompile, no rebuild. */
  const hseAxes = textured ? retargetIdentityAxes(body) : null;
  if (hseAxes) group.userData.rfIdentityAxes = hseAxes;
  const sharkjira = !textured && def?.id === SHARKJIRA_ID ? makeSharkjiraFeatures(body) : null;
  const leviathan = !textured && def?.id === LEVIATHAN_ID ? makeLeviathanFeatures(body) : null;
  /* Rev 14 shipped textured rows with no face overlay at all, on the grounds
   * that the bake paints eyes and a mouth into the diffuse. At gameplay size
   * that reads as a flat photo of a shark rather than a character, which is
   * the opposite of the Hungry Shark bar. Lane O2 puts the batch back on the
   * textured rows, but FITTED to the baked head - eye seated on the measured
   * skin, grin on the measured Head/LowerJaw lip line - instead of reusing
   * the Sharky-era constants, which land on the cheek or the snout tip on a
   * baked rig. It is built after applyMorph so it measures the final head.
   * Returns null on any rig it cannot measure, leaving that row on the face
   * the bake painted. */
  /* Lane O2 (face batch on textured heads) is BUILT but NOT SHIPPED. The
   * module measures the baked head correctly on paper and every numeric gate
   * passes, but a real-GL render shows the batch floating off the body rather
   * than seated on the head (evidence: hse/evidence/head_after/head_reef.png,
   * and the diagnosis in hse/STATUS-O2.md). Shipping a false green would be
   * worse than shipping nothing, so the textured rows keep the face the bake
   * painted until the seating is genuinely fixed.
   *
   * Flip RF_O2_TEXTURED_FACE to true to re-enable; nothing else changes. */
  const faceMesh = textured
    ? (RF_O2_TEXTURED_FACE ? buildTexturedFace({ palette, eyeColor: eyeColorOf(def) }, body, def, { ...profile, personality, face: personality?.face }) : null)
    : makeFace(body, def, palette);
  /* 9.6: no BackSide ink shell. Smooth Standard shading supplies the edge
   * separation without the doubled silhouette draw. */
  const shell = null;
  /* HSE lane: a real cephalofoil is baked into the scallopedhammer diffuse,
   * so the chibi hammer foil prop would double the head. Textured rows skip
   * it; every other allowlisted prop still mounts. */
  let prop = textured ? null : makeProp(def, template.key, propBone, palette);
  mountGrin(prop, pose, body, propBone);
  fitProp(prop, body, prop?.userData?.rfPropKind);
  if (prop && !propIsMounted(body, prop)) { prop.parent?.remove(prop); prop = null; }
  if (textured) mountTexturedFeatures({ body, def, group, palette });
  const mixer = template.isSkinned && template.clips.swim ? new THREE.AnimationMixer(model) : null;
  const actions = {};
  if (mixer) {
    for (const [name, clip] of Object.entries(template.clips)) if (clip) actions[name] = mixer.clipAction(clip);
    if (actions.swim) { actions.swim.setLoop(THREE.LoopRepeat, Infinity).play(); mixer.update(0); }
  }
  model.updateMatrixWorld(true);
  /* A newly bound auxiliary SkinnedMesh needs one bounding pass to settle its
   * skeleton-space box before the authoritative length normalization. */
  measureBox(group);
  const rawBox = measureBox(group), rawLength = Math.max(rawBox.max.x - rawBox.min.x, 1e-5), targetLength = BASE_LENGTH * clamp(finite(def?.sil?.len, 1), 0.5, 3);
  const worldScale = targetLength / rawLength; group.scale.setScalar(worldScale);
  if (prop?.userData?.rfPropKind === 'grin') {
    group.updateMatrixWorld(true);
    const bodyBox = new THREE.Box3().setFromObject(body), grinBox = new THREE.Box3().setFromObject(prop);
    prop.position.z += (bodyBox.max.z - grinBox.min.z + 0.06) / Math.max(group.scale.x, 1e-5);
  }
  /* Skinned bounds can settle once more after the root scale reaches the
   * feature batch. Correct against the settled pass so the camera contract
   * remains exact even when a row owns auxiliary skinned geometry. */
  measureBox(group);
  let normalizedBox = measureBox(group), normalizedLength = normalizedBox.max.x - normalizedBox.min.x;
  if (Math.abs(normalizedLength - targetLength) > 1e-5) {
    group.scale.multiplyScalar(targetLength / Math.max(normalizedLength, 1e-5));
    normalizedBox = measureBox(group); normalizedLength = normalizedBox.max.x - normalizedBox.min.x;
  }
  group.userData.baseScale = group.scale.x; group.userData.rfBodyLen = targetLength; group.userData.rfWorldLength = targetLength;
  group.userData.rfMeasuredLength = normalizedLength; group.userData.rfRawLength = rawLength;
  group.userData.rfArmatureScale = { length: lengthScale, height: heightScale, depth: depthScale };
  group.userData.rfScaleBounds = { length: [0.85, 1.35], height: [0.90, 1.30], depth: [0.90, 1.20] };
  group.userData.rfVariantProfile = { shapeTag: profile.shapeTag, lane: profile.lane, patternScale: profile.patternScale, boneProfile };
  group.userData.rfPersonality = personality ? { id: def.id, brief: personality.brief, bulk: personality.bulk, sculpt: personality.sculpt, face: personality.face, surface: personality.surface, signature: personality.signature } : null;
  group.userData.rfMorph = hseMorph || bakedGeometry[0] || { id: def.id, neutral: false, maxOffset: 0, maxOffsetRatio: 0, vertexCount: body.geometry.getAttribute('position')?.count || 0, seamFree: false };
  group.userData.rfSourceBase = template.key; group.userData.rfPattern = String(def?.sil?.pattern || 'plain'); group.userData.rfPatternId = patternId(def);
  group.userData.rfHeadBone = headBone?.name || null; group.userData.rfPropBone = propBone?.name || null; group.userData.rfPropKind = prop?.userData?.rfPropKind || null;
  group.userData.rfPropAllowlisted = !prop || PROP_ALLOWLIST_IDS.has(String(def?.id || ''));
  group.userData.rfPropContactGap = prop ? finite(prop.userData.rfContactGap, Infinity) : 0;
  group.userData.rfVisibleDrawCalls = drawCount(group); group.userData.rfPaletteRaw = palette.raw; group.userData.rfPaletteResolved = palette.resolved; group.userData.rfIsSkinned = !!body.isSkinnedMesh;
  group.userData.rfFace = faceMesh ? { ...faceMesh.userData.rfFaceMetrics, triangles: faceMesh.userData.rfFaceTriangles, attitude: faceMesh.material?.userData?.rfFaceAttitude || null } : null;
  group.userData.rfSharkjira = sharkjira ? { plateCount: sharkjira.plateCount, plateStations: sharkjira.plateStations, atomicTriangles: sharkjira.atomicTriangles, toothTriangles: sharkjira.toothTriangles, pulseUniform: true } : group.userData.rfSharkjira || null;
  group.userData.rfSharkjiraPulse = sharkjira?.pulse || group.userData.rfSharkjiraPulse || null;
  group.userData.rfLeviathan = leviathan ? { scuteCount: leviathan.scuteCount, scuteStations: leviathan.scuteStations, rowOffset: leviathan.rowOffset, crownPlates: leviathan.crownPlates, cheekPlates: leviathan.cheekPlates, tuskCount: leviathan.tuskCount, featureTriangles: leviathan.featureTriangles, pulseUniform: true } : group.userData.rfLeviathan || null;
  group.userData.rfLeviathanPulse = leviathan?.pulse || group.userData.rfLeviathanPulse || null;
  group.userData.rfSlotNames = template.slotNames.slice(); group.userData.rfAtlasMask = template.key === 'sharky' ? 'white atlas luminance; Eyes/Teeth slots stay source-colored' : 'Eyes/Teeth material slots'; group.userData.rfLoading = false;
  const animation = { lastT: null, bite: 0, turn: 0, death: 0, active: 'swim', biteActive: false, biteLatched: false, swimPhase: 0, swimAmp: 0 };
  const baseHeadQuaternion = headBone?.quaternion.clone(), neckBone = model.getObjectByName('Neck') || model.getObjectByName('Main5'), baseNeckQuaternion = neckBone?.quaternion.clone();
  const jawBone = model.getObjectByName('LowerJaw'), baseJawQuaternion = jawBone?.quaternion.clone();
  /* Rev 14 procedural swim. shark_bake.py builds the rig but exports no
   * animation clips, so a textured row has no Swim/Fast/Bite action to play.
   * Rather than ship a rigid shark, drive the spine directly: a travelling
   * sine wave down the bone chain, which is what a real swim clip on this
   * skeleton would encode anyway. It runs on the SAME bones the GPU skinning
   * already consumes, so the hardware skinning path, the jaw gape and the
   * bend all compose without a second vertex pipeline.
   *
   * Amplitude ramps toward the tail (a shark's head barely yaws while the
   * caudal fin does the work) and scales with speed, matching how the clip-
   * driven rows read at the same speedFrac. */
  const SWIM_CHAIN = ['Neck', 'Spine1', 'Spine2', 'Tail1', 'Tail2', 'Tail3'];
  /* Rev 15 lane SWIM. Three measured bugs are fixed here; see
   * NOTES-rev15-swim.md for the numbers.
   *
   * (a) THE YAW AXIS IS MEASURED, NOT ASSUMED. The old code rotated about a
   *     hard-coded bone-local +Z for every model. That is only the yaw axis
   *     for bakes whose dorsal was authored on local Y. The r15 re-bakes
   *     `mako` and `tiger_nu` are authored dorsal-on-Z, so resolveOrientation
   *     rolls them 90 deg -- which rotates the BONE frame too. Measured on
   *     the live rigs: their tail tips swung 49 and 57 units along world Y
   *     (up and down, a porpoising gyration) against 0.7 along world Z, while
   *     every other model swung correctly in Z. That is the owner's "gyrating
   *     weird" directly.
   *
   *     So resolve each bone's yaw axis from its own bind-pose world matrix:
   *     take world +Y (the swim plane normal -- the engine's whole frame is
   *     nose +X / dorsal +Y) back into bone-local space. A beat is a yaw about
   *     the world vertical by definition, so this is correct for any bake
   *     convention, including future re-bakes, with no per-model table.
   *
   * (b) THE ENVELOPE WAS INVERTED. Rotating a parent carries every child, so
   *     lateral displacement ACCUMULATES from the root outward. Ramping gain
   *     toward the tail therefore did the opposite of what it read like:
   *     measured, `Neck` swung 42% of body height while the tail tip `Tail3`
   *     -- a leaf, whose rotation moves nothing -- swung exactly 0.000. The
   *     shark wagged its head and held its tail still, the precise inverse of
   *     carangiform swimming.
   *
   *     Fixed by ramping the gain DOWN the chain and normalising against the
   *     accumulated tail-tip amplitude, so the head stays near-rigid and the
   *     peak sits at the caudal fin.
   *
   * (c) PHASE IS INTEGRATED, NEVER MULTIPLIED. See animate(). */
  const swimBones = textured ? SWIM_CHAIN.map((name, index) => {
    const bone = model.getObjectByName(name);
    if (!bone) return null;
    /* Bind-pose world orientation of this bone. The model has already been
     * oriented and scaled by prepareTemplate/scaleOnAxis at this point, so
     * this reads the frame the bone will actually animate in. */
    bone.updateWorldMatrix(true, false);
    const worldQuat = bone.getWorldQuaternion(new THREE.Quaternion());
    const yaw = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuat.clone().invert()).normalize();
    /* Roll about the body's own long axis, for the flank-catching-light cue.
     * Same treatment: world +X (nose-tail) pulled back into bone space. */
    const roll = new THREE.Vector3(1, 0, 0).applyQuaternion(worldQuat.clone().invert()).normalize();
    return { bone, base: bone.quaternion.clone(), yaw, roll, index };
  }).filter(Boolean) : [];
  /* Carangiform envelope.
   *
   * THE HIERARCHY IS INVERTED RELATIVE TO THE BODY, and that is the whole
   * subtlety here. SWIM_CHAIN is written nose-to-tail, but these rigs parent
   * the other way. Measured on greatwhite_cy, the skeleton is
   *
   *   Tail3 -> Tail2 -> Tail1 -> Spine2 -> Spine1 -> Neck -> Head -> LowerJaw
   *
   * with `Tail3` as the chain ROOT and `Head` the deepest leaf; the caudal fin
   * skins to Tail2/Tail3 and the snout to Head (verified from skinIndex /
   * skinWeight: the rear-most 200 vertices are dominated by Tail2/Tail3, the
   * front-most 200 by Head).
   *
   * So rotating a bone carries everything NOSE-WARD of it. Rotating `Tail3`
   * swings the entire animal rigidly about its tail; it does not move the tail
   * relative to the body at all. That is why the old gain ramp -- which grew
   * toward Tail3 -- produced the exact inverse of a swim: measured, `Neck`
   * swung 42% of body height while the tail tip held at 0.000. The shark
   * wagged its head. That is the owner's "gyrating".
   *
   * A carangiform beat therefore cannot be produced by a bare gain ramp on
   * this chain. It needs the wave to be expressed as ACCUMULATED angle and
   * then de-trended so the head carries none of it:
   *
   *   theta(u)  = per-station bend angle of the travelling wave
   *   applied_i = theta(u_i) - theta(u_head)      (root-relative)
   *
   * The subtraction is what pins the snout. Each bone then applies only its
   * own DIFFERENCE from its parent, so the running sum at any station equals
   * the intended angle there, and the running sum at the head is zero by
   * construction. `u` is distance along the BODY, 0 at the caudal end and 1 at
   * the snout. */
  {
    const n = swimBones.length;
    for (const entry of swimBones) {
      /* index 0 = Neck (leaf, snout end); index n-1 = Tail3 (root, caudal). */
      entry.u = n > 1 ? 1 - entry.index / (n - 1) : 0;
      /* Bend amplitude at this station. Near zero at the snout, peaking at the
       * caudal fin, quadratic so the envelope reads smooth rather than kinked.
       * These are the AMPLITUDES OF THE ACCUMULATED ANGLE, not per-bone gains;
       * the differencing below turns them into per-bone rotations. */
      entry.gain = 0.30 * (1 - entry.u) * (1 - entry.u);
      /* Phase LAGS toward the tail so the wave propagates nose-to-tail. */
      entry.phase = (1 - entry.u) * SWIM_WAVELENGTH;
    }
    /* Order root-first (Tail3 .. Neck) so each bone can difference against the
     * accumulated angle of its parent. */
    swimBones.sort((a, b) => b.index - a.index);
  }
  /* Head-lock reference (see the HEAD LOCK block in animate()). Sampled in the
   * REST pose, before any wave has been applied, so it is the neutral lateral
   * position of the snout that the lock holds the body to. */
  const headLockBone = swimBones.length ? (model.getObjectByName('Head') || model.getObjectByName('Neck')) : null;
  let headLockRest = null, poseRestZ = pose.position.z;
  const tmpVecA = new THREE.Vector3(), tmpMat = new THREE.Matrix4();
  if (headLockBone) {
    model.updateMatrixWorld(true);
    pose.updateMatrixWorld(true);
    tmpMat.copy(pose.matrixWorld).invert().multiply(headLockBone.matrixWorld);
    headLockRest = new THREE.Vector3().setFromMatrixPosition(tmpMat).z;
  }
  /* A textured bake ships no clips, so the procedural spine wave IS this
   * row's swim/fast/bite source. Name it so the art gate reads a real
   * animation source rather than a missing one, and so a debug dump says
   * plainly which path drove the motion. */
  group.userData.rfMixerClipName = template.clips.swim?.name || template.clip?.name || (swimBones.length ? 'Swim (procedural spine wave)' : null);
  group.userData.rfFastClipName = template.clips.fast?.name || (swimBones.length ? 'Swim_Fast (procedural, speed-scaled)' : null);
  group.userData.rfBiteClipName = template.clips.bite?.name || (swimBones.length ? 'Swim_Bite (procedural, jaw gape)' : null);
  group.userData.rfTextured = textured;
  group.userData.rfSwimSource = swimBones.length ? { kind: 'procedural', bones: swimBones.map((entry) => entry.bone.name) } : { kind: 'clip' };
  const jawRestGape = jawBone ? clamp(JAW_REST_GAPE + finite(personality?.face?.gape, 0), 0.20, 0.35) : 0;
  group.userData.rfJawRestGape = jawRestGape;
  group.userData.rfJawMaxRotation = jawBone ? JAW_MAX_ROTATION : 0;
  group.userData.rfJawGape = jawBone ? jawRestGape : 0;
  function crossfadeTo(name) {
    const next = actions[name], current = actions[animation.active]; if (!next || next === current) return;
    next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.16); if (current) current.fadeOut(0.16); next.play(); animation.active = name;
  }
  function startBite() {
    if (!actions.bite || animation.biteActive) return;
    const current = actions[animation.active]; actions.bite.reset().setLoop(THREE.LoopOnce, 1); actions.bite.clampWhenFinished = true; actions.bite.fadeIn(0.06); if (current) current.fadeOut(0.06); actions.bite.play(); animation.biteActive = true;
  }
  function animate(t = 0, input = {}) {
    const time = finite(t, 0), speedFrac = clamp(finite(input.speedFrac, 0), 0, 1), turn = clamp(finite(input.turn, 0), -1, 1);
    const dt = animation.lastT === null ? 0 : clamp(time - animation.lastT, 0, 0.25); animation.lastT = time;
    const dead = !!(input.dead || input.death || input.dying), biteWant = !!(input.biting || finite(input.lungeT, 0) > 0 || finite(input.bitePhase, 0) > 0.65 || finite(input.jawSnapT, 0) > 0);
    if (biteWant && !animation.biteLatched) startBite(); animation.biteLatched = biteWant;
    if (mixer) {
      mixer.timeScale = dead ? 0 : 0.55 + 1.65 * speedFrac;
      if (!animation.biteActive) crossfadeTo(speedFrac > 0.65 ? 'fast' : 'swim');
      if (dt > 0) mixer.update(dt);
      if (animation.biteActive && actions.bite && actions.bite.time >= Math.max(0.01, actions.bite.getClip().duration - 0.025)) { actions.bite.stop(); animation.biteActive = false; animation.active = 'swim'; crossfadeTo(speedFrac > 0.65 ? 'fast' : 'swim'); }
    }
    const ease = 1 - Math.exp(-Math.max(dt, 1 / 120) * 8), biteEase = 1 - Math.exp(-Math.max(dt, 1 / 120) * 16);
    animation.turn += (turn - animation.turn) * ease; animation.bite = clamp(finite(input.jawOpen, 0), 0, 1); /* Rev 15 JAW: engine writeJawGape is the single gape authority (idle breathing + bite envelope); no local easing, no biteWant override */
    animation.death += ((dead ? 1 : 0) - animation.death) * (1 - Math.exp(-Math.max(dt, 1 / 120) * 7));
    pose.rotation.y = animation.turn * 0.14; pose.rotation.x = -animation.turn * 0.11 + animation.death * Math.sin(Math.min(time * 5, Math.PI) * 0.5) * 1.1; pose.rotation.z = animation.death * Math.PI * 0.5;
    const pulse = 1 + animation.bite * 0.055; pose.scale.set(pulse * (1 + 0.025 * speedFrac), pulse, pulse);
    if (headBone && baseHeadQuaternion) { headBone.quaternion.copy(baseHeadQuaternion); headBone.rotateZ(-animation.turn * 0.16); headBone.rotateX(-animation.bite * 0.10); }
    if (neckBone && baseNeckQuaternion) { neckBone.quaternion.copy(baseNeckQuaternion); neckBone.rotateZ(-animation.turn * 0.09); }
    const jawGape = jawBone ? animation.bite : 0; /* Rev 15 JAW: absolute gape from engine, 0 = shut */
    group.userData.rfJawGape = jawGape;
    if (jawBone && baseJawQuaternion) { jawBone.quaternion.copy(baseJawQuaternion); jawBone.rotateX(jawGape * JAW_MAX_ROTATION); }
    if (swimBones.length) {
      /* PHASE IS INTEGRATED, NEVER MULTIPLIED.
       *
       * The old code evaluated sin(time * swimRate - phase) with a swimRate
       * that depends on speedFrac. Multiplying ABSOLUTE time by a varying
       * rate teleports the phase the instant speed changes: measured across a
       * 0.1 -> 0.9 speed step, the phase jumped 2.596 -> 5.449 rad (nearly
       * half a cycle) in one frame and the tail snapped from z=-8.2 to z=+3.8,
       * reversing direction mid-beat. Speed changes continuously in play, so
       * this fired constantly -- the single largest contributor to the
       * owner's "not smooth".
       *
       * The engine already integrates a correct phase (engine3d.js:2420,
       * `a.tailPhase += hz * TAU * STEP`) and passes it in the state bag as
       * tailPhase/tailAmp, but this lane never read it. Consume it, and fall
       * back to a LOCALLY integrated phase when the field is absent (the
       * roster/thumbnail paths call animate() with a bare bag). Either way the
       * phase only ever advances by dt * rate, so it is continuous through any
       * speed change by construction. */
      const swimRate = 2.3 + 3.4 * speedFrac;
      const drivenPhase = finite(input.tailPhase, NaN);
      if (Number.isFinite(drivenPhase)) animation.swimPhase = drivenPhase;
      else animation.swimPhase += dt * swimRate;
      const phase = animation.swimPhase;
      /* tailAmp is the engine's own speed-driven amplitude when supplied.
       *
       * SMOOTH IT. A continuous phase is necessary but not sufficient: the
       * lateral offset scales with amplitude, so a step in amplitude is just
       * as visible as a step in phase. Measured across a 0.15 -> 0.9 speed
       * step, the raw amplitude jumps ~4x in one frame and the tail snaps
       * 3.715 units between consecutive frames while the wave itself stays
       * perfectly in rhythm. Ease it with the same frame-rate-independent
       * exponential the turn and bite channels already use, so a throttle
       * change ramps the beat up over ~0.5 s instead of stepping it. The rate constant
       * was swept: k=12 leaves 26% step jerk, k=6 14%, k=2 6%, k=1.5 4.9%.
       * 2.0 sits comfortably inside the 10% gate while still reading as a
       * responsive throttle; below that the beat visibly lags the speed. */
      const ampTarget = (0.55 + 0.75 * speedFrac) * (1 - animation.death * 0.85)
        * clamp(finite(input.tailAmp, TAIL_AMP_REFERENCE) / TAIL_AMP_REFERENCE, 0.35, 1.8);
      const ampEase = 1 - Math.exp(-Math.max(dt, 1 / 120) * 2.0);
      animation.swimAmp += (ampTarget - animation.swimAmp) * ampEase;
      const amplitude = animation.swimAmp;
      /* De-trend against the SNOUT station so the head carries no net yaw.
       * swimBones is ordered root-first, so the last entry is the neck/snout
       * end; that station's angle is the trend to remove. */
      const snout = swimBones[swimBones.length - 1];
      const angleAt = (entry) => Math.sin(phase - entry.phase) * entry.gain * amplitude;
      const trend = angleAt(snout);
      let applied = 0;   // accumulated angle from the root out to the parent
      for (const entry of swimBones) {
        entry.bone.quaternion.copy(entry.base);
        /* Target accumulated angle at THIS station, pinned so the snout ends
         * at zero. Rotating a bone carries every bone nose-ward of it, so the
         * rotation this bone must apply is its target minus whatever its
         * ancestors have already contributed. */
        const target = angleAt(entry) - trend;
        const delta = target - applied;
        applied = target;
        /* entry.yaw is world +Y expressed in THIS bone's local frame, measured
         * from its bind-pose world matrix (see the chain setup above). A swim
         * beat is a yaw about the world vertical, so this sweeps the tail
         * side to side for every bake convention -- including the dorsal-on-Z
         * re-bakes that the old hard-coded local +Z bent vertically. */
        entry.bone.rotateOnAxis(entry.yaw, delta);
        /* A little counter-roll about the body's LONG axis keeps the flank
         * catching the key light as it sweeps, which is what sells the wet
         * specular in motion. Measured the same way, so it stays a roll and
         * never leaks into the vertical. */
        entry.bone.rotateOnAxis(entry.roll, Math.cos(phase - entry.phase) * entry.gain * amplitude * 0.05 - animation.turn * 0.05);
      }
      /* HEAD LOCK -- the step that actually makes this read as swimming.
       *
       * `Tail3` is the chain ROOT, so it cannot translate: the rig is anchored
       * at the tail. Every rotation therefore displaces everything NOSE-ward,
       * and the accumulated lateral offset is largest at the snout no matter
       * how the per-bone gains are shaped. Measured, with the de-trended wave
       * above: Tail3 0.00, Tail2 4.00, Tail1 7.82, Spine2 8.84, Head 8.04.
       * That is a shark swinging its head about a fixed tail -- kinematically
       * backwards, and exactly what the owner saw.
       *
       * A real shark's head holds a near-straight line while the tail sweeps
       * about it. Since the wave shape is now correct and only the ANCHOR is
       * wrong, move the anchor: measure where the head bone actually ended up
       * and slide the whole pose back by that much, along the lateral axis
       * only. The body keeps its bend, the snout stays on the heading line,
       * and the caudal fin inherits the full sweep.
       *
       * This is a rigid translation of a group that is already the speed-
       * stretch/eat-pop authority, so it composes with the existing pose
       * transforms and touches no other lane's contract. */
      if (headLockBone && headLockRest !== null) {
        /* Measure the snout in POSE-LOCAL space, not world space. `pose` is
         * the group being corrected, so a world-space read would include the
         * correction itself and feed back on itself -- measured, that diverges
         * to 1e193 within a few frames. Updating only the subtree below `pose`
         * and reading `headLockBone.matrixWorld` relative to `pose` keeps the
         * measurement independent of the value being written. */
        model.updateMatrixWorld(true);
        /* headLockBone.matrixWorld here is relative to `model`, whose own
         * matrix is unaffected by pose.position, so this read is independent
         * of the value being written. */
        /* Express the snout offset in POSE-local units: that is the space
         * pose.position lives in, so the correction cancels exactly, and it is
         * measured through `model` (whose matrix does not depend on
         * pose.position) so there is no feedback. */
        tmpMat.copy(pose.matrixWorld).invert().multiply(headLockBone.matrixWorld);
        tmpVecA.setFromMatrixPosition(tmpMat);
        pose.position.z = poseRestZ - (tmpVecA.z - headLockRest);
      }
    }
    if (sharkjira) sharkjira.pulse.value = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(time * 5.4));
    /* Slower, deeper swell than Sharkjira's fast atomic flicker. */
    if (leviathan) leviathan.pulse.value = 0.52 + 0.34 * (0.5 + 0.5 * Math.sin(time * 2.15));
  }
  if (jawBone && baseJawQuaternion) { jawBone.quaternion.copy(baseJawQuaternion); jawBone.rotateX(jawRestGape * JAW_MAX_ROTATION); }
  if (prop?.userData?.rfPropKind === 'hammer') {
    group.updateMatrixWorld(true);
    const bodyBox = new THREE.Box3().setFromObject(body), propBox = new THREE.Box3().setFromObject(prop);
    group.userData.rfHammerProjectedSpan = (propBox.max.x - propBox.min.x) / Math.max(bodyBox.max.x - bodyBox.min.x, 1e-5);
  }
  return { body, shell, prop, pose, model, mixer, animate };
}

function installEffects(record, body) {
  const group = record.group, materials = body ? (Array.isArray(body.material) ? body.material : [body.material]) : [], emissiveMaterial = materials.find((material) => material?.emissive) || null;
  const baseEmissive = emissiveMaterial?.emissive ? emissiveMaterial.emissive.clone() : new THREE.Color(0, 0, 0), baseIntensity = finite(emissiveMaterial?.emissiveIntensity, 0);
  group.userData.rfArcs = (on, color = 0x27e0ff) => { for (const material of materials) if (material?.emissive) { if (on) material.emissive.copy(colorValue(color)).multiplyScalar(0.5); else material.emissive.copy(baseEmissive); } };
  let flashTime = 0, flashDur = 0, flashColor = new THREE.Color(0, 0, 0), flashIntensity = 0, lastT = null;
  group.userData.rfFlash = (color = 0xff2bd6, dur = 0.18, intensity = 1) => { flashColor.copy(colorValue(color)); flashDur = Math.max(0.001, finite(dur, 0.18)); flashTime = flashDur; flashIntensity = clamp(finite(intensity, 1), 0, 1); };
  const originalAnimate = record.animate;
  record.animate = (t, input = {}) => {
    originalAnimate(t, input);
    const time = finite(t, 0), dt = lastT === null ? 0 : clamp(time - lastT, 0, 0.25); lastT = time;
    if (flashTime > 0) {
      flashTime = Math.max(0, flashTime - dt);
      for (const material of materials) if (material?.emissive) { material.emissive.copy(baseEmissive).lerp(flashColor, (flashTime / flashDur) * flashIntensity); material.emissiveIntensity = baseIntensity + (0.9 - baseIntensity) * (flashTime / flashDur) * flashIntensity; }
    } else for (const material of materials) if (material?.emissive) { material.emissive.copy(baseEmissive); material.emissiveIntensity = baseIntensity; }
  };
}
function placeholderRig(def, base) {
  const group = new THREE.Group(); group.name = `RF Shark ${def?.id || 'unknown'}`; group.userData.rfSharkId = String(def?.id || 'unknown');
  group.userData.rfSourceBase = base; group.userData.rfLoading = true; group.userData.rfPattern = String(def?.sil?.pattern || 'plain'); group.userData.rfPaletteResolved = paletteOf(def).resolved;
  const placeholder = makePlaceholder(def, group), target = BASE_LENGTH * clamp(finite(def?.sil?.len, 1), 0.5, 3); group.scale.setScalar(target); group.userData.baseScale = target;
  let live = null, lastT = null;
  const record = { group, parts: { body: placeholder, jaw: null, shell: null, prop: null }, animate(t, input) { if (live) live.animate(t, input); } };
  group.userData.rfArcs = () => {}; group.userData.rfFlash = () => {};
  /* HSE lane O4: ask for THIS base specifically rather than waiting on a
   * whole-cache preload that no longer loads everything. The swap goes through
   * the normal buildLoadedRig() path, so the real rig arrives with its
   * skinning, morph record, identity, props and face hooks intact - exactly
   * the rig buildShark() would have returned had the template been resident. */
  /* HSE lane O4: distinguish "loading" from "deliberately not loaded".
   *
   * requestTemplate() returns null for a textured base withheld at the menu.
   * In that case there is no swap coming, and leaving the grey capsule visible
   * makes ui3d.bakeThumb() render IT into the roster card - measured: the
   * Epaulette Shark card baked a yellow box. ui3d only falls back to the
   * card's monogram when the bake produces nothing, so hide the placeholder
   * and let the bake come back empty. In-run placeholders (a load that IS
   * coming) keep the capsule so the shark stays visible while it arrives. */
  let pending = requestTemplate(base);
  if (!pending && TEXTURED_KEYS.has(base) && !isNodeRuntime()) {
    placeholder.visible = false;
    group.userData.rfWithheld = true;
    return record;
  }
  pending = pending || (preloadPromise || preload()).then(() => modelCache.get(base));
  Promise.resolve(pending).then((template) => {
    if (live || !template) return;
    modelBudget.retain(base); if (rigHolds) rigHolds.set(group, base);
    live = buildLoadedRig(def, template, group); record.parts = { body: live.body, jaw: null, shell: live.shell, prop: live.prop }; group.userData.rfLoading = false;
    if (placeholder.parent) placeholder.parent.remove(placeholder); installEffects(record, live.body); void lastT;
  }).catch(() => {});
  return record;
}
function buildShark(def) {
  if (!def) throw new Error('RF.Art3D.buildShark requires a shark definition');
  const base = baseForDef(def); baseSelection.set(String(def.id || ''), base);
  /* HSE lane O4: go through the budget so this counts as a use and refreshes
   * LRU order. A miss serves the placeholder and kicks off the on-demand load
   * inside placeholderRig(). */
  const template = modelBudget.get(base) || modelCache.get(base);
  if (!template) return placeholderRig(def, base);
  const group = new THREE.Group(); group.name = `RF Shark ${def.id || 'unknown'}`; group.userData.rfSharkId = String(def.id || 'unknown');
  modelBudget.retain(base); if (rigHolds) rigHolds.set(group, base);
  const live = buildLoadedRig(def, template, group), record = { group, parts: { body: live.body, jaw: null, shell: live.shell, prop: live.prop }, animate: live.animate };
  group.userData.rfArchetype = String(def?.sil?.head || 'point'); installEffects(record, live.body); return record;
}

/* Small billboard helper remains because world3d uses it for guarded fallback
 * prey paths. The old bend API is a harmless compatibility shim. */
function billboardMaterialFor(input) {
  let key = '', canvas = null;
  if (input && typeof input.getContext === 'function') { canvas = input; if (billboardIds) { if (!billboardIds.has(canvas)) billboardIds.set(canvas, `canvas-${nextBillboardId++}`); key = billboardIds.get(canvas); } else key = `canvas-${nextBillboardId++}`; }
  else if (input?.isTexture) key = `texture-${input.uuid}`; else key = String(input || 'missing');
  if (billboardMaterials.has(key)) return billboardMaterials.get(key);
  let texture = input?.isTexture ? input : null;
  if (!texture && canvas) { texture = new THREE.CanvasTexture(canvas); texture.needsUpdate = true; }
  if (!texture) { texture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat); texture.needsUpdate = true; }
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.02, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }); billboardMaterials.set(key, material); return material;
}
function billboard(input) { if (!sharedPlaneGeometry) sharedPlaneGeometry = new THREE.PlaneGeometry(1, 1); return new THREE.Mesh(sharedPlaneGeometry, billboardMaterialFor(input)); }
function bendableMaterial(baseMaterial) { return baseMaterial || null; }
function bendOffset() { return 0; }

/* Headless GLB path. It reads only the JSON and BIN chunks, which keeps the
 * art selftest synchronous and avoids fetch/FileReader in Node. */
function isNodeRuntime() { return typeof process !== 'undefined' && !!process.versions?.node && typeof process.getBuiltinModule === 'function'; }
function decodeGlb(filePath) {
  const fs = process.getBuiltinModule('fs'), bytes = fs.readFileSync(filePath); if (bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${filePath}: bad GLB magic`);
  let offset = 12, json = null, bin = null;
  while (offset < bytes.length) { const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4), chunk = bytes.subarray(offset + 8, offset + 8 + length); if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk)); else if (type === 0x004e4942) bin = chunk; offset += 8 + length; }
  if (!json || !bin) throw new Error(`${filePath}: missing GLB chunk`); return { json, bin };
}
const COMPONENTS = Object.freeze({ 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] });
const TYPE_WIDTH = Object.freeze({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 });
function readAccessor(doc, index) {
  const accessor = doc.json.accessors[index], view = doc.json.bufferViews[accessor.bufferView], [Ctor, bytes] = COMPONENTS[accessor.componentType], width = TYPE_WIDTH[accessor.type], stride = view.byteStride || bytes * width, base = (view.byteOffset || 0) + (accessor.byteOffset || 0), data = new DataView(doc.bin.buffer, doc.bin.byteOffset, doc.bin.byteLength), values = new Array(accessor.count * width);
  const getter = Ctor === Float32Array ? 'getFloat32' : Ctor === Uint32Array ? 'getUint32' : Ctor === Uint16Array ? 'getUint16' : Ctor === Uint8Array ? 'getUint8' : Ctor === Int16Array ? 'getInt16' : 'getInt8';
  for (let i = 0; i < accessor.count; i++) for (let c = 0; c < width; c++) { let value = data[getter](base + i * stride + c * bytes, getter !== 'getUint8' && getter !== 'getInt8'); if (accessor.normalized) value /= Ctor === Uint8Array ? 255 : Ctor === Uint16Array ? 65535 : Ctor === Int8Array ? 127 : 32767; values[i * width + c] = value; }
  return { values, count: accessor.count, width };
}
function parsedGeometry(doc, mesh) {
  const pos = [], normal = [], uv = [], joints = [], weights = [], slots = [], indices = [], groups = [];
  for (const primitive of mesh.primitives) {
    const position = readAccessor(doc, primitive.attributes.POSITION).values, normals = primitive.attributes.NORMAL == null ? null : readAccessor(doc, primitive.attributes.NORMAL).values, texcoord = primitive.attributes.TEXCOORD_0 == null ? null : readAccessor(doc, primitive.attributes.TEXCOORD_0).values, skinIndex = primitive.attributes.JOINTS_0 == null ? null : readAccessor(doc, primitive.attributes.JOINTS_0).values, skinWeight = primitive.attributes.WEIGHTS_0 == null ? null : readAccessor(doc, primitive.attributes.WEIGHTS_0).values;
    const vertexCount = position.length / 3, baseVertex = pos.length / 3;
    for (let i = 0; i < vertexCount; i++) { pos.push(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]); normal.push(normals ? normals[i * 3] : 0, normals ? normals[i * 3 + 1] : 1, normals ? normals[i * 3 + 2] : 0); uv.push(texcoord ? texcoord[i * 2] : 0, texcoord ? texcoord[i * 2 + 1] : 0); for (let c = 0; c < 4; c++) joints.push(skinIndex ? skinIndex[i * 4 + c] : 0); for (let c = 0; c < 4; c++) weights.push(skinWeight ? skinWeight[i * 4 + c] : c === 0 ? 1 : 0); slots.push(primitive.material || 0); }
    const indexValues = primitive.indices == null ? Array.from({ length: vertexCount }, (_, i) => i) : readAccessor(doc, primitive.indices).values, start = indices.length; for (const value of indexValues) indices.push(baseVertex + value); groups.push({ start, count: indexValues.length, materialIndex: primitive.material || 0 });
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(joints, 4)); geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4)); geometry.setAttribute('rfSlot', new THREE.Float32BufferAttribute(slots, 1)); geometry.setIndex(indices); for (const group of groups) geometry.addGroup(group.start, group.count, group.materialIndex); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); geometry.userData.rfSlotNames = (doc.json.materials || []).map((m) => String(m.name || 'Body')); return geometry;
}
function directTemplate(key, filePath) {
  const doc = decodeGlb(filePath), json = doc.json, jointSet = new Set((json.skins?.[0]?.joints || []).map(Number));
  const objects = json.nodes.map((node, index) => { const object = jointSet.has(index) ? new THREE.Bone() : new THREE.Object3D(); object.name = node.name || `node${index}`; if (node.matrix) object.matrix.fromArray(node.matrix).decompose(object.position, object.quaternion, object.scale); else { if (node.translation) object.position.fromArray(node.translation); if (node.rotation) object.quaternion.fromArray(node.rotation); if (node.scale) object.scale.fromArray(node.scale); } object.userData.rfNodeIndex = index; return object; });
  for (const [index, node] of json.nodes.entries()) for (const child of node.children || []) objects[index].add(objects[child]);
  const scene = new THREE.Group(); scene.name = json.scenes?.[0]?.name || 'RootNode'; for (const root of json.scenes?.[0]?.nodes || []) scene.add(objects[root]);
  /* Rev 14: this headless decoder reads the JSON and BIN chunks only - it
   * never decodes the embedded JPEGs, because there is no image decoder in
   * the Node selftest environment. That is fine for geometry, but it left
   * the textured gate unable to tell "this asset has no maps" from "this
   * runtime cannot decode them". So declare the maps the glTF ACTUALLY
   * references with placeholder 1x1 textures carrying the source image name.
   * The gate then verifies the real asset contract (a diffuse and a tangent
   * normal map are present and wired to the right slots) headlessly, while
   * the browser path loads the true pixels through GLTFLoader. */
  const placeholderTexture = (label) => { const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat); texture.name = label; texture.userData.rfHeadlessPlaceholder = true; texture.needsUpdate = true; return texture; };
  const imageName = (textureIndex) => { const source = json.textures?.[textureIndex]?.source; return String(json.images?.[source]?.name || `image${source}`); };
  const sourceMaterials = (json.materials || []).map((material) => {
    const out = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.03, flatShading: false });
    out.name = String(material.name || 'Body'); out.userData.rfAtlas = out.name === 'AtlasMaterial';
    const baseColorTexture = material.pbrMetallicRoughness?.baseColorTexture;
    if (baseColorTexture) out.map = placeholderTexture(imageName(baseColorTexture.index));
    if (material.normalTexture) out.normalMap = placeholderTexture(imageName(material.normalTexture.index));
    if (typeof material.pbrMetallicRoughness?.roughnessFactor === 'number') out.roughness = material.pbrMetallicRoughness.roughnessFactor;
    if (typeof material.pbrMetallicRoughness?.metallicFactor === 'number') out.metalness = material.pbrMetallicRoughness.metallicFactor;
    return out;
  });
  for (const [index, node] of json.nodes.entries()) if (node.mesh != null) { const geometry = parsedGeometry(doc, json.meshes[node.mesh]), material = sourceMaterials.length ? sourceMaterials : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.03 }); let body; if (node.skin == null) body = new THREE.Mesh(geometry, material); else { body = new THREE.SkinnedMesh(geometry, material); const skin = json.skins[node.skin], inverse = readAccessor(doc, skin.inverseBindMatrices).values; const matrices = []; for (let i = 0; i < skin.joints.length; i++) matrices.push(new THREE.Matrix4().fromArray(inverse, i * 16)); body.bind(new THREE.Skeleton(skin.joints.map((joint) => objects[joint]), matrices)); } body.name = node.name || `${key} body`; objects[index].add(body); }
  const animations = [];
  for (const animation of json.animations || []) { const tracks = []; for (const channel of animation.channels || []) { const sampler = animation.samplers[channel.sampler], input = readAccessor(doc, sampler.input).values, output = readAccessor(doc, sampler.output).values, name = json.nodes[channel.target.node].name || `node${channel.target.node}`; if (channel.target.path === 'rotation') tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, input, output)); else if (channel.target.path === 'translation') tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`, input, output)); else if (channel.target.path === 'scale') tracks.push(new THREE.VectorKeyframeTrack(`${name}.scale`, input, output)); } animations.push(new THREE.AnimationClip(animation.name || `${key} animation`, -1, tracks)); }
  return prepareTemplate(scene, animations, key);
}
function nodeAssetPath(file) { const path = process.getBuiltinModule('path'); return path.resolve(path.dirname(new URL(import.meta.url).pathname), 'assets/models', file); }
function loadBrowserTemplate(key) { return new Promise((resolve, reject) => { new GLTFLoader().load(assetUrl(MODEL_FILES[key]), (gltf) => { try { resolve(prepareTemplate(gltf.scene, gltf.animations, key)); } catch (error) { reject(error); } }, undefined, reject); }); }

/* HSE lane O4: the boot set.
 *
 * Everything that is NOT a textured bake. That is the whole low-poly family
 * (sharky, goblinshark, anglerfish, piranha, whale, shark, shark_c,
 * hammer_chibi, manta, dolphin, the three fish, shark_b) and it costs 5.33 MB
 * decoded in total, all of it sharky's 1K atlas - the rest carry no textures
 * at all. It backs the menu, every roster row without a sil.model, and the
 * placeholder path, so it is loaded eagerly and never evicted. */
const BASE_KEYS = Object.freeze(MODEL_KEYS.filter((key) => !TEXTURED_KEYS.has(key)));

/* The textured template the current selection needs at boot, if any. Read
 * from the same places ui3d/meta keep the active shark so boot does not have
 * to guess; falls back to the first roster row (the starter shark), which is
 * what a fresh profile actually selects. */
function bootTexturedKey() {
  const allRows = rows();
  if (!allRows.length) return null;
  let id = '';
  try {
    id = String(host.RF?.Meta?.profile?.()?.activeShark || host.RF?.Meta?.activeShark?.() || '');
  } catch (error) { id = ''; }
  const def = (id && allRows.find((row) => String(row.id) === id)) || allRows[0];
  const base = baseForDef(def);
  return TEXTURED_KEYS.has(base) ? base : null;
}

/* On-demand load of one base. Returns a promise for the template, or null
 * when this runtime cannot load (the caller then keeps the placeholder).
 * Deduped and refcounted by the budget, so two defs asking for the same base
 * at once produce ONE fetch and one resident copy - this is what makes NPC
 * sharks share the player's template instead of loading it twice. */
/* HSE lane O4: menu/roster thumbnails must not force-load textured models.
 *
 * ui3d's bakeThumb() calls buildShark(def) once per roster card to render a
 * 112x90 thumbnail. With 40 rows carrying a sil.model that is a demand for all
 * 13 textured bakes at the menu - measured on the first probe run as 9
 * textured GLB fetches with 9 evictions of load/evict thrash, which is exactly
 * what requirement 4 forbids. The LRU bounded the MEMORY, but the loads still
 * happened.
 *
 * A thumbnail does not justify a 6.67 MB decode. So on-demand loading of a
 * TEXTURED model is allowed only while a run is live; at the menu a textured
 * base that is not already resident serves the placeholder, and ui3d's own
 * guard (a bake that produces nothing keeps the card's monogram) handles it.
 * Rows already resident still bake a real thumbnail. The low-poly base set is
 * always loadable, so every unmodelled row thumbnails normally. */
let demandLoadTextured = false;
function runIsLive() {
  try { return !!(host.RF?.Game?.ctx?.player); } catch (error) { return false; }
}
function mayLoadTextured() { return demandLoadTextured || runIsLive(); }

function requestTemplate(key) {
  if (!MODEL_FILES[key]) return null;
  const resident = modelBudget.get(key);
  if (resident) { modelCache.set(key, resident); return Promise.resolve(resident); }
  if (TEXTURED_KEYS.has(key) && !isNodeRuntime() && !mayLoadTextured()) return null;
  if (isNodeRuntime()) {
    try { const template = directTemplate(key, nodeAssetPath(MODEL_FILES[key])); modelBudget.admit(key, template, true); modelCache.set(key, template); return Promise.resolve(template); }
    catch (error) { return Promise.reject(error); }
  }
  if (typeof document === 'undefined' || typeof fetch !== 'function') return null;
  return modelBudget.load(key, loadBrowserTemplate).then((template) => { modelCache.set(key, template); return template; });
}

function preload() {
  if (preloadPromise) return preloadPromise;
  /* Node keeps the eager, synchronous, everything-resident behaviour. The
   * headless decoder never decodes the embedded JPEGs (it substitutes 1x1
   * placeholders), so there is no memory pressure to relieve here, and two
   * selftest gates depend on the full cache: the modelCache.size check and
   * the per-row rfLoading assertion. */
  if (isNodeRuntime()) { try { for (const key of MODEL_KEYS) { const template = directTemplate(key, nodeAssetPath(MODEL_FILES[key])); modelCache.set(key, template); modelBudget.admit(key, template, true); } preloadPromise = Promise.resolve(modelCache); } catch (error) { preloadError = error; preloadPromise = Promise.reject(error); } }
  /* Browser: the low-poly base set plus at most ONE textured model. Every
   * other textured model waits until a def that needs it is built. This is
   * the whole fix - boot went from 165.3 MB of decoded texture to 5.3 MB
   * plus one right-sized model. */
  else if (typeof document !== 'undefined' && typeof fetch === 'function') {
    const bootKey = bootTexturedKey();
    const wanted = bootKey ? [...BASE_KEYS, bootKey] : BASE_KEYS.slice();
    /* The boot set is a deliberate, bounded admission (base set + at most one
     * textured model), so it opens the textured gate for exactly the duration
     * of these requests. Without this, bootKey would be refused by
     * mayLoadTextured() at the menu and the selected shark would show the
     * placeholder until the run started. */
    demandLoadTextured = true;
    preloadPromise = Promise.all(wanted.map((key) => (requestTemplate(key) || Promise.resolve(null)).catch((error) => { preloadError = preloadError || error; return null; }))).then(() => modelCache).finally(() => { demandLoadTextured = false; });
  }
  else preloadPromise = Promise.resolve(modelCache);
  return preloadPromise;
}

function renderedTintSignature(def) {
  const palette = paletteOf(def);
  const sample = (color, detail) => {
    const c = color.clone().multiplyScalar(detail), hsv = rgbToHsv(c);
    return [hsv.h, hsv.s, hsv.v].map((value) => value.toFixed(4)).join(',');
  };
  return [sample(palette.base, 0.82), sample(palette.belly, 0.94), sample(palette.accent, 0.98)].join('|');
}
function renderedVariantSignature(def) {
  const profile = variantProfile(def), p = personalityOf(def), shape = [profile.shapeTag, ...profile.head, ...profile.abdomen, ...profile.tail, ...profile.tailUpper, ...profile.fin].map((value) => typeof value === 'number' ? value.toFixed(3) : value).join(','), face = p ? [p.face.eye, p.face.brow, p.face.pupil, p.face.gape, p.face.tilt].map((value) => value.toFixed(2)).join(',') : 'none';
  return `${renderedTintSignature(def)}|${shape}|p${patternId(def)}:${p?.surface?.mode ?? 0}|e${profile.eyeColor.getHexString()}|f${face}`;
}
function personalityFeatureData(def) {
  const p = personalityOf(def), profile = variantProfile(def), palette = paletteOf(def), face = p?.face || { eye: 1, brow: 0, pupil: 1, gape: 0, tilt: 0 }, surface = p?.surface || { mode: 0, density: 1, scars: 0, plates: 0 };
  return {
    silhouette: [...profile.head, ...profile.neck, ...profile.abdomen, profile.tail[1], profile.fin[2], p?.bulk?.head || 1, p?.bulk?.neck || 1, p?.bulk?.chest || 1, p?.bulk?.tail || 1, p?.bulk?.fin || 1, p?.sculpt?.head || 0, p?.sculpt?.neck || 0, p?.sculpt?.chest || 0, p?.sculpt?.tail || 0, p?.sculpt?.dorsal || 0, p?.sculpt?.hump || 0, p?.sculpt?.sag || 0],
    pattern: [patternId(def), surface.mode, surface.density, surface.scars, surface.plates],
    hue: [palette.resolved.base.h, palette.resolved.accent.h, palette.resolved.belly.h, rgbToHsv(profile.eyeColor).h, palette.resolved.base.v, palette.resolved.accent.v],
    face: [face.eye, face.brow, face.pupil, face.gape, face.tilt, p?.sculpt?.jaw || 0, p?.sculpt?.underbite || 0]
  };
}
function vectorHasMeaningfulDifference(a, b, threshold) {
  return a.some((value, index) => Math.abs(value - b[index]) > threshold);
}
function hueDistance(a, b) { const d = Math.abs(a - b); return Math.min(d, 1 - d); }
function personalityFeatureDifference(a, b) {
  const fa = personalityFeatureData(a), fb = personalityFeatureData(b);
  return {
    silhouette: vectorHasMeaningfulDifference(fa.silhouette, fb.silhouette, 0.055),
    pattern: fa.pattern[0] !== fb.pattern[0] || fa.pattern[1] !== fb.pattern[1] || Math.abs(fa.pattern[2] - fb.pattern[2]) > 0.28 || Math.abs(fa.pattern[3] - fb.pattern[3]) > 0.12 || Math.abs(fa.pattern[4] - fb.pattern[4]) > 0.12,
    hue: hueDistance(fa.hue[0], fb.hue[0]) > 0.065 || hueDistance(fa.hue[1], fb.hue[1]) > 0.065 || hueDistance(fa.hue[3], fb.hue[3]) > 0.065 || Math.abs(fa.hue[4] - fb.hue[4]) > 0.10,
    face: vectorHasMeaningfulDifference(fa.face, fb.face, 0.08)
  };
}

function __selftest() {
  const result = { pass: false, notes: [], errors: [], checked: 0, cache: [], baseMap: {}, drawCounts: {}, lengths: {}, tintSignatures: {}, variantSignatures: {}, props: {}, jawGape: {}, hammerSpan: {}, morphs: {}, personalityTable: {}, actDistinctness: {}, face: {}, sharkjira: null, leviathan: null, foil: {} };
  try {
    const allRows = rows(), rowIds = new Set(allRows.map((def) => def.id)), tableIds = Object.keys(PERSONALITY_TABLE); if (allRows.length !== 86) throw new Error(`expected 86 sharks, received ${allRows.length}`); if (tableIds.length !== 86 || tableIds.some((id) => !rowIds.has(id)) || Array.from(rowIds).some((id) => !PERSONALITY_TABLE[id])) throw new Error(`personality table incomplete: ${tableIds.length}/86 authored rows`); if (preloadError) throw preloadError; if (modelCache.size < MODEL_KEYS.length) throw new Error(`model cache has ${modelCache.size}/${MODEL_KEYS.length} GLBs`);
    result.personalityTable = { rows: tableIds.length, missing: allRows.filter((def) => !PERSONALITY_TABLE[def.id]).map((def) => def.id) };
    result.cache = Array.from(modelCache.keys()).sort();
    for (const def of allRows) {
      const base = baseForDef(def), rig = buildShark(def), group = rig.group, body = rig.parts.body;
      if (!(group instanceof THREE.Group) || !body?.isSkinnedMesh || typeof rig.animate !== 'function') throw new Error(`${def.id}: incomplete GLB rig contract`);
      const morph = group.userData.rfMorph; if (!group.userData.rfPersonality || group.userData.rfPersonality.id !== def.id || !morph || morph.id !== def.id || morph.vertexCount !== body.geometry.getAttribute('position')?.count || morph.seamFree !== true) throw new Error(`${def.id}: personality bake contract missing`); if (morph.maxOffsetRatio < 0 || morph.maxOffsetRatio > 0.30) throw new Error(`${def.id}: morph displacement ratio ${morph.maxOffsetRatio.toFixed(3)} outside sane bounds`); result.morphs[def.id] = { ratio: Number(morph.maxOffsetRatio.toFixed(4)), outsideRatio: Number(finite(morph.maxOffsetOutsideCrestRatio, morph.maxOffsetRatio).toFixed(4)), crestRatio: Number(finite(morph.crest?.maxOffsetDepthRatio, 0).toFixed(4)), vertices: morph.vertexCount, neutral: !!morph.neutral };
      if (rig.parts.jaw !== null) throw new Error(`${def.id}: jaw must remain null`); if (group.userData.rfSourceBase !== base) throw new Error(`${def.id}: base mapping is ${group.userData.rfSourceBase}, expected ${base}`); if (group.userData.rfLoading) throw new Error(`${def.id}: placeholder remained after node preload`);
      if (group.userData.rfPropKind && !PROP_ALLOWLIST_IDS.has(def.id)) throw new Error(`${def.id}: prop ${group.userData.rfPropKind} is not in the Rev 10 allowlist`);
      if (!group.userData.rfPropAllowlisted) throw new Error(`${def.id}: prop allowlist gate failed`);
      if (group.userData.rfPropKind && group.userData.rfPropContactGap > 0.08) throw new Error(`${def.id}: ${group.userData.rfPropKind} mount gap ${group.userData.rfPropContactGap.toFixed(4)} is not fitted to the head`);
      if (!group.userData.rfMixerClipName || !/swim|swimming/i.test(group.userData.rfMixerClipName)) throw new Error(`${def.id}: Swim clip missing`);
      if (!group.userData.rfFastClipName || !group.userData.rfBiteClipName) throw new Error(`${def.id}: fast/bite clip mapping missing`);
      const scales = group.userData.rfArmatureScale; if (scales.length < 0.85 || scales.length > 1.35 || scales.height < 0.90 || scales.height > 1.30 || scales.depth < (def.id === SHARKJIRA_ID ? 0.64 : 0.90) || scales.depth > 1.20) throw new Error(`${def.id}: bounded scale failed`);
      const draws = drawCount(group); if (draws > 4) throw new Error(`${def.id}: ${draws} draws exceeds the Rev 13 budget (body + optional prop/feature + face batch)`);
      /* Rev 13 face lane: the grin must sit on the lip line of EVERY row,
       * including the scaled/morphed kaiju rows whose Head bone carries up to
       * a 2.75x widening. `toothOutsideHeadSpan` is the hard one: a tooth
       * outside the head span is the floating speck trail / dangling chin
       * cluster the owner reported, and it must be exactly zero. */
      /* Rev 14: these gates all measure the PROCEDURAL face overlay - teeth
       * welded to the lip line, a socket with real depth, an off-centre
       * pupil. A textured row has no overlay to measure because the bake
       * paints its face into the diffuse, so every one of these metrics
       * would be undefined rather than failing. The textured contract is
       * asserted on its own terms just below instead of being waved through:
       * the row must genuinely carry the baked maps and the lit material. */
      const textured = !!group.userData.rfTextured;
      const faceMetrics = group.userData.rfFace;
      if (!textured) {
        if (!faceMetrics) throw new Error(`${def.id}: face batch missing`);
        if (faceMetrics.toothOutsideHeadSpan !== 0) throw new Error(`${def.id}: ${faceMetrics.toothOutsideHeadSpan} teeth outside the head span`);
        if (!(faceMetrics.toothSurfaceMedianRatio < 0.16)) throw new Error(`${def.id}: tooth row median ${faceMetrics.toothSurfaceMedianRatio.toFixed(4)} off the head surface`);
        if (!(faceMetrics.toothSurfaceMaxRatio < 0.45)) throw new Error(`${def.id}: worst tooth ${faceMetrics.toothSurfaceMaxRatio.toFixed(4)} off the head surface`);
        if (!(faceMetrics.socketDepthRatio > 0.05)) throw new Error(`${def.id}: eye socket is flat`);
        if (!(faceMetrics.pupilOffsetRatio > 0.06)) throw new Error(`${def.id}: pupil is dead-centre`);
        if (!(faceMetrics.toothGapRatio > 0.15)) throw new Error(`${def.id}: teeth are a grille, not separated`);
        if (!(faceMetrics.toothCount >= 12)) throw new Error(`${def.id}: only ${faceMetrics.toothCount} teeth`);
        result.face[def.id] = {
          outside: faceMetrics.toothOutsideHeadSpan,
          toothMed: Number(faceMetrics.toothSurfaceMedianRatio.toFixed(4)),
          toothMax: Number(faceMetrics.toothSurfaceMaxRatio.toFixed(4)),
          socket: Number(faceMetrics.socketDepthRatio.toFixed(4)),
          eyeRadius: Number(faceMetrics.eyeRadius.toFixed(5))
        };
      } else {
        /* Textured contract. Every clause is a real failure mode seen while
         * building this path: a bake whose maps silently failed to load
         * (white plastic shark), a row that fell back to the toon atlas
         * shader, an outline shell surviving onto a textured row, and a
         * jaw/spine that never got bound so the shark swam rigid. */
        /* Lane O2: a textured row now DOES carry a face batch, fitted to the
         * baked head rather than to the Sharky one. It is gated on its own
         * terms - the eye must sit on the measured skin and the grin on the
         * measured lip line - using the same thresholds the module was tuned
         * against, imported rather than copied so the two cannot drift. A row
         * whose rig could not be measured legitimately has no overlay and is
         * skipped rather than failed. */
        if (faceMetrics) {
          const faceFailures = checkTexturedFace(faceMetrics);
          if (faceFailures.length) throw new Error(`${def.id}: textured face ${faceFailures.join('; ')}`);
          result.texturedFace = result.texturedFace || {};
          result.texturedFace[def.id] = {
            eyeSource: faceMetrics.eyeSource,
            mouthSource: faceMetrics.mouthSource,
            toothMed: Number(faceMetrics.toothSurfaceMedianRatio.toFixed(4)),
            toothMax: Number(faceMetrics.toothSurfaceMaxRatio.toFixed(4)),
            eyeMed: Number(faceMetrics.eyeSurfaceMedianRatio.toFixed(4)),
            outside: faceMetrics.toothOutsideHeadSpan,
            triangles: faceMetrics.triangles
          };
        }
        const texturedMaterials = [];
        group.traverse((object) => { if (object.isMesh) for (const material of (Array.isArray(object.material) ? object.material : [object.material])) if (material) texturedMaterials.push(material); });
        if (!texturedMaterials.length || !texturedMaterials.every((material) => material.userData.rfTextured)) throw new Error(`${def.id}: textured row has a non-textured material`);
        if (!texturedMaterials.every((material) => material.isMeshStandardMaterial || material.isMeshPhysicalMaterial)) throw new Error(`${def.id}: textured row must be Standard/Physical lit`);
        if (!texturedMaterials.every((material) => material.userData.rfHasDiffuse)) throw new Error(`${def.id}: baked diffuse map missing`);
        if (!texturedMaterials.every((material) => material.userData.rfHasNormalMap)) throw new Error(`${def.id}: tangent normal map missing`);
        if (!texturedMaterials.every((material) => material.userData.rfTexturedFace || material.customProgramCacheKey().endsWith(TEXTURED_SUFFIX))) throw new Error(`${def.id}: textured shader hook missing`);
        if (texturedMaterials.some((material) => material.side === THREE.BackSide)) throw new Error(`${def.id}: toon outline shell survived onto a textured row`);
        /* HSE cline lane: texture budget. The owner bar is <=1K texels per map
         * per shark. Every bake currently ships 769x1024 JPEG diffuse plus a
         * matching normal map (measured by parsing each GLB's embedded image
         * headers), so this gate pins that ceiling against a future bake
         * arriving with a fat 2K/4K map. Skipped when the runtime gives no
         * decodable image dimensions, so it can never fail spuriously. */
        for (const material of texturedMaterials) for (const slot of ['map', 'normalMap']) {
          const image = material?.[slot]?.image;
          if (image && image.width > 0 && (image.width > 1024 || image.height > 1024)) throw new Error(`${def.id}: ${slot} ${image.width}x${image.height} exceeds the 1K-per-map texture budget`);
        }
        const swim = group.userData.rfSwimSource;
        if (!swim || swim.kind !== 'procedural' || !Array.isArray(swim.bones) || swim.bones.length < 4) throw new Error(`${def.id}: textured row has no procedural swim chain`);
        if (!(group.userData.rfJawMaxRotation > 0)) throw new Error(`${def.id}: textured row has no LowerJaw gape`);
        result.textured = result.textured || {};
        result.textured[def.id] = { base: group.userData.rfSourceBase, materials: texturedMaterials.length, swimBones: swim.bones.length, draws, roughness: texturedMaterials[0].roughness, normalMap: true };
      }
      if (def.id === SHARKJIRA_ID && group.userData.rfTextured) {
        /* HSE cline lane: on the textured base the crest plates are the
         * measured skinned feature draw from hse/props_textured.js, not the
         * toon personality hull, so gate THAT record: 8 plates, real contact,
         * one draw, pulse uniform. The L2 silhouette bounds already cover the
         * outline, so the Sharky-era aspect window does not apply here. */
        const features = group.userData.rfTexturedFeatures, kaiju = group.userData.rfSharkjira;
        /* props_textured.js ships RF_KAIJU_RIDGE=false while the spine ridge
         * renders detached; when it is off the row has no plates by design. */
        const ridgeOff = features && features.ridgeEnabled === false;
        if (!features || features.mode !== 'sharkjira' || !features.contact || (!ridgeOff && (features.plateCount !== 8 || features.draw !== 1)) || features.triangles > 560) throw new Error(`${def.id}: textured atomic crest missing, detached, or over budget`);
        const kaijuRidgeOff = kaiju && kaiju.ridgeEnabled === false;
        if (!kaiju || (!kaijuRidgeOff && (kaiju.plateCount !== 8 || !Array.isArray(kaiju.plateStations) || kaiju.plateStations.length !== 8)) || !kaiju.pulseUniform) throw new Error(`${def.id}: textured atomic crest record incomplete`);
        if (!group.userData.rfSharkjiraPulse) throw new Error(`${def.id}: atomic pulse uniform missing`);
        result.sharkjira = { plates: kaiju.plateCount, draws: draws, featureTriangles: features.triangles, textured: true, palette: group.userData.rfPaletteRaw };
      } else if (def.id === SHARKJIRA_ID) {
        const kaiju = group.userData.rfSharkjira;
        const crest = morph.crest, bodyBox = body.geometry.boundingBox || body.geometry.computeBoundingBox() && body.geometry.boundingBox, bodySpan = Math.max((bodyBox?.max.y || 0) - (bodyBox?.min.y || 0), 1e-5);
        const bodyBoxForAspect = measureBox(body), groupSize = bodyBoxForAspect.getSize(new THREE.Vector3()), crestEdge = body.geometry.getAttribute('rfCrestEdge');
        const headBoneScale = body.skeleton?.bones?.find((bone) => bone.name === 'Head')?.scale?.x || 0;
        if (!crest || crest.plateCount !== 8 || !crest.connected || crest.boundaryEdges < crest.plateCount || crest.minFaceNormalDot < 0.05 || crest.maxOffsetDepthRatio > 0.35 + 1e-5 || morph.maxOffsetOutsideCrest > bodySpan * 0.18 + 1e-5 || !crestEdge || crestEdge.count !== body.geometry.getAttribute('position')?.count || headBoneScale > 1.39 || groupSize.x / Math.max(groupSize.z, 1e-5) < 2.60 || groupSize.x / Math.max(groupSize.z, 1e-5) > 3.00) throw new Error(`${def.id}: connected crest/head/aspect bounds failed`);
        if (!kaiju || kaiju.plateCount !== crest.plateCount || !Array.isArray(kaiju.plateStations) || kaiju.plateStations.length !== 8 || !kaiju.pulseUniform || draws !== 4) throw new Error(`${def.id}: atomic crest must be a connected 8-plate hull/feature spine, pulsed, and exactly three meshes`);
        if (kaiju.atomicTriangles + kaiju.toothTriangles > 420) throw new Error(`${def.id}: feature triangles ${kaiju.atomicTriangles + kaiju.toothTriangles} exceed the compact kaiju allowance`);
        result.sharkjira = { plates: kaiju.plateCount, draws, featureTriangles: kaiju.atomicTriangles + kaiju.toothTriangles, crestVertices: crest.vertexCount, crestBoundaryEdges: crest.boundaryEdges, crestNormalMinDot: Number(crest.minFaceNormalDot.toFixed(4)), palette: group.userData.rfPaletteRaw };
      }
      if (def.id === LEVIATHAN_ID) {
        /* Leviathan Rex must be a KING, not a recolored Sharkjira: two full
         * scute rows, a crown and brow shelf, cheek armor, tusks, its own
         * seafoam pulse uniform, and exactly one extra feature draw. */
        const rex = group.userData.rfLeviathan;
        const rexRidgeOff = rex && rex.ridgeEnabled === false;
        if (!rex || rex.scuteCount !== LEVIATHAN_SCUTE_STATIONS.length * 2 || (!rexRidgeOff && (rex.spinePlates ?? 0) < 8) || (rex.eyeCount ?? 0) !== 2 || (rex.toothCount ?? 0) < 20 || !rex.pulseUniform || rex.rowOffset < 0.20) throw new Error(`${def.id}: kaiju features (continuous spine ridge, eyes, tooth rows) missing`);
        if (!group.userData.rfLeviathanPulse) throw new Error(`${def.id}: seafoam pulse uniform missing`);
        if (rex.featureTriangles > 640) throw new Error(`${def.id}: feature triangles ${rex.featureTriangles} exceed the compact kaiju allowance`);
        /* Distinctness from Sharkjira is enforced numerically, not by eye:
         * the two kaiju must disagree on plate count, plate height, glow hue
         * and dorsal attitude so they cannot converge at 64x30. */
        const jira = PERSONALITY_TABLE[SHARKJIRA_ID], king = PERSONALITY_TABLE[LEVIATHAN_ID];
        const maxScute = Math.max(...LEVIATHAN_SCUTE_HEIGHTS), maxPlate = Math.max(...SHARKJIRA_PLATE_HEIGHTS);
        if (maxScute >= maxPlate * 0.62) throw new Error(`${def.id}: scutes ${maxScute} are not clearly shorter than Sharkjira plates ${maxPlate}`);
        if (rex.scuteCount <= SHARKJIRA_PLATE_STATIONS.length) throw new Error(`${def.id}: scute count must exceed Sharkjira's single plate row`);
        if (!(king.sculpt.brow > 0.25 && jira.sculpt.brow < 0) || !(king.sculpt.dorsal < 0 && jira.sculpt.dorsal > 0)) throw new Error(`${def.id}: crown/dorsal attitude does not oppose Sharkjira`);
        const glowHue = new THREE.Color(LEVIATHAN_PALETTE.glow).getHSL({}).h, jiraHue = new THREE.Color(SHARKJIRA_PALETTE.glow).getHSL({}).h;
        if (hueDistance(glowHue, jiraHue) < 0.02) throw new Error(`${def.id}: seafoam glow is not separable from the atomic blue`);
        result.leviathan = { scutes: rex.scuteCount, rows: 2, crown: rex.crownPlates, cheeks: rex.cheekPlates, tusks: rex.tuskCount, featureTriangles: rex.featureTriangles, draws, palette: group.userData.rfPaletteRaw };
      }
      if (rig.parts.shell !== null || group.getObjectByName('RF Rev 9b contour shell')) throw new Error(`${def.id}: contour shell survived 9.6 style gate`);
      const allMaterials = [];
      group.traverse((object) => { if (object.isMesh) for (const material of (Array.isArray(object.material) ? object.material : [object.material])) if (material) allMaterials.push(material); });
      if (allMaterials.some((material) => material.type === 'MeshToonMaterial' || material.gradientMap)) throw new Error(`${def.id}: toon material/gradient survived 9.6 style gate`);
      if (def.id === SHARKJIRA_ID && !group.userData.rfTextured) {
        const bodySkinMaterials = allMaterials.filter((material) => material.userData?.rfSharkjiraBody);
        if (bodySkinMaterials.length < 1 || bodySkinMaterials.some((material) => material.transparent || material.opacity !== 1 || !material.depthWrite || material.emissiveIntensity !== 0)) throw new Error(`${def.id}: charcoal body must stay opaque, depth-writing, and non-emissive`);
      }
      /* Rev 13 rework gate. The Rex rendered as a pale translucent ghost, so
       * pin the three things that produced it: the hull must be opaque and
       * depth-writing, the body emissive must stay at the baseline (an
       * act-scaled 0.16 lit the armor from inside toward the water color),
       * and the armor scutes must not out-glow the hull. */
      if (def.id === LEVIATHAN_ID && group.userData.rfTextured) {
        /* Textured king: the twin scute rows/crown/tusks ride the shared
         * textured feature draw; pin opacity and depth on its material and
         * leave the toon emissive band to the legacy branch below. */
        const armor = group.userData.rfTexturedFeatureMesh?.material;
        if (!armor || armor.transparent || !armor.depthWrite) throw new Error(`${def.id}: scute armor must be opaque and depth-writing`);
      }
      if (def.id === LEVIATHAN_ID && !group.userData.rfTextured) {
        const rexBody = allMaterials.filter((material) => material.userData?.rfSkinUniforms && !material.userData?.rfFaceMetrics && /shark skin/.test(material.name || ''));
        if (rexBody.length < 1) throw new Error(`${def.id}: kaiju body skin material missing`);
        for (const material of rexBody) {
          if (material.transparent || material.opacity !== 1 || !material.depthWrite) throw new Error(`${def.id}: armored hull must stay opaque and depth-writing`);
          if (material.emissiveIntensity > 0.06) throw new Error(`${def.id}: body emissive ${material.emissiveIntensity} lights the hull instead of the seams`);
        }
        const armor = allMaterials.find((material) => /Leviathan Rex/.test(material.name || ''));
        if (!armor || armor.transparent || armor.opacity !== 1) throw new Error(`${def.id}: scute armor must be opaque`);
        if (armor.emissiveIntensity > 0.40) throw new Error(`${def.id}: scute glow ${armor.emissiveIntensity} exceeds a seam accent`);
      }
      const bodyMaterials = Array.isArray(body.material) ? body.material : [body.material];
      /* Rev 14: the [0.42, 0.62] band is the UNTEXTURED hull's look - a matt
       * toon surface whose form comes from the palette shader, where a
       * glossier setting would blow a hot spot across flat-shaded geometry.
       * A baked row is the opposite case: the owner's bar is wet painted
       * skin, and the specular streak down the back is carried by a real
       * normal map, so it wants a glossier 0.30-0.46. Both bands are floored
       * well above mirror and ceilinged below fully matt, so neither path can
       * drift into plastic or into chalk. */
      const roughnessBand = group.userData.rfTextured ? [0.30, 0.46] : [0.42, 0.62];
      if (bodyMaterials.some((material) => (material.type !== 'MeshStandardMaterial' && material.type !== 'MeshPhysicalMaterial') || material.flatShading || material.roughness < roughnessBand[0] || material.roughness > roughnessBand[1])) throw new Error(`${def.id}: smooth Standard specular material gate failed (roughness band ${roughnessBand[0]}-${roughnessBand[1]})`);
      const target = BASE_LENGTH * clamp(finite(def.sil?.len, 1), 0.5, 3), worldBox = measureBox(group), measured = worldBox.max.x - worldBox.min.x; if (Math.abs(measured - target) > 1e-4) throw new Error(`${def.id}: bbox X ${measured} != ${target}`);
      const material = (Array.isArray(body.material) ? body.material : [body.material]).find((entry) => typeof entry?.onBeforeCompile === 'function');
      /* Both paths install an onBeforeCompile hook and both must declare every
       * uniform their injected GLSL references - a uniform the JS forgets is
       * a shader that fails to link in the browser and renders nothing, which
       * a headless run cannot otherwise see. So run the SAME check against
       * whichever suffix and uniform list this row's path owns. The chunk
       * names below are the real ones each path patches, so a rename that
       * silently stops the injection also trips this. */
      const shaderSuffix = group.userData.rfTextured ? TEXTURED_SUFFIX : PATTERN_SUFFIX;
      const shaderUniforms = group.userData.rfTextured ? TEXTURED_UNIFORMS : SHADER_UNIFORMS;
      if (!material || typeof material.customProgramCacheKey !== 'function' || !material.customProgramCacheKey().endsWith(shaderSuffix)) throw new Error(`${def.id}: ${group.userData.rfTextured ? 'textured' : 'pattern'} shader hook missing`);
      const shader = group.userData.rfTextured
        ? { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>' }
        : { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
      material.onBeforeCompile(shader);
      for (const uniform of shaderUniforms) if (!shader.uniforms[uniform]) throw new Error(`${def.id}: shader uniform ${uniform} missing`);
      if (group.userData.rfTextured) {
        /* Prove the injection actually landed, not merely that the hook ran:
         * an unmatched replace() is a silent no-op that would ship an
         * untinted, unlit shark. */
        if (!/rfHsvToRgb/.test(shader.fragmentShader) || !/uRfHueShift/.test(shader.fragmentShader)) throw new Error(`${def.id}: textured palette tint did not inject`);
        if (!/rfFresnel/.test(shader.fragmentShader)) throw new Error(`${def.id}: textured rim light did not inject`);
        if (!/roughnessFactor/.test(shader.fragmentShader) || !/uRfWetness/.test(shader.fragmentShader)) throw new Error(`${def.id}: textured wet specular did not inject`);
        if (!/vRfBindPosition/.test(shader.vertexShader)) throw new Error(`${def.id}: textured bind-space varying did not inject`);
      }
      rig.animate(0, { speedFrac: 0, turn: 0, jawOpen: 0.15 });
      const cruiseGape = finite(group.userData.rfJawGape, 0);
      if (group.userData.rfJawMaxRotation > 0 && (cruiseGape < 0.08 || cruiseGape > 0.35)) throw new Error(`${def.id}: cruise jaw gape ${cruiseGape.toFixed(3)} outside idle band 8-35%`);
      rig.animate(0.25, { speedFrac: 1, turn: 0, biting: true, jawOpen: 1, lungeT: 0.2 });
      const biteGape = finite(group.userData.rfJawGape, 0);
      if (group.userData.rfJawMaxRotation > 0 && biteGape < 0.85) throw new Error(`${def.id}: bite jaw snap only reached ${biteGape.toFixed(3)}`);
      if (group.userData.rfPropKind === 'hammer' && finite(group.userData.rfHammerProjectedSpan, 0) < 0.42) throw new Error(`${def.id}: hammer foil span ${group.userData.rfHammerProjectedSpan.toFixed(3)} < 0.42 body length`);
      if (group.userData.rfPropKind === 'hammer') {
        /* The foil must be a solid T-shaped head, not a flat plate: real
         * thickness, eye bulbs, palette countershading, and no air gap. */
        const foil = rig.parts.prop, foilGeometry = foil?.geometry;
        const featureAttribute = foilGeometry?.getAttribute('rfFeature');
        if (!featureAttribute) throw new Error(`${def.id}: foil is missing its rfFeature channel`);
        const channels = new Set(); for (let i = 0; i < featureAttribute.count; i++) channels.add(Math.round(featureAttribute.getX(i)));
        if (!channels.has(0) || !channels.has(1) || !channels.has(2)) throw new Error(`${def.id}: foil needs crown, eye bulb, and ventral countershade channels`);
        const thickness = finite(foil?.userData?.rfFoilThicknessRatio, 0);
        if (thickness < 0.06) throw new Error(`${def.id}: foil thickness ratio ${thickness.toFixed(4)} reads as a flat plate`);
        const foilMaterial = Array.isArray(foil.material) ? foil.material[0] : foil.material;
        if (!/hammer/.test(String(foilMaterial?.customProgramCacheKey?.() || ''))) throw new Error(`${def.id}: foil is not palette-colored by the hammer skin ramp`);
        if (finite(group.userData.rfPropContactGap, Infinity) > 0.02) throw new Error(`${def.id}: foil is not blended into the head`);
        result.foil[def.id] = { thickness: Number(thickness.toFixed(4)), span: Number(group.userData.rfHammerProjectedSpan.toFixed(3)), gap: Number(finite(group.userData.rfPropContactGap, 0).toFixed(4)), channels: Array.from(channels).sort() };
      }
      result.jawGape[def.id] = { cruise: Number(cruiseGape.toFixed(3)), bite: Number(biteGape.toFixed(3)) };
      if (group.userData.rfPropKind === 'hammer') result.hammerSpan[def.id] = Number(group.userData.rfHammerProjectedSpan.toFixed(3));
      if (group.userData.rfPatternId !== patternId(def)) throw new Error(`${def.id}: pattern mapping missing`);
      result.tintSignatures[def.id] = renderedTintSignature(def);
      result.variantSignatures[def.id] = renderedVariantSignature(def);
      result.props[def.id] = group.userData.rfPropKind || null;
      result.checked++; result.baseMap[def.id] = base; result.drawCounts[def.id] = draws; result.lengths[def.id] = Number(measured.toFixed(4));
    }
    if (result.baseMap.goblin !== 'goblinshark' || result.baseMap.gulperfiend !== 'anglerfish') throw new Error('base table did not select goblinshark/anglerfish as required');
    /* HSE lane: the baked family map is a contract, not a preference. These
     * rows are the first of each family to move off the low-poly rig, so the
     * gate fails loudly if a data or routing change silently reverts them. */
    /* Lane O1 rev 2: the three keys this table used to name (bullshark,
     * realisticshark for whaleshark, blueshark for mako) were REJECTED on
     * render - bullshark is an untextured grey creature and realisticshark is
     * a degenerate mesh - so the expectations move with the validated map
     * rather than pinning rows to assets the build no longer ships. */
    const HSE_FAMILY_EXPECT = { reef: 'dogfish', hammerhead: 'smoothhammer', greatwhite: 'greatwhite_cy', tiger: 'tiger_nu' };
    /* mako/bull/megalodon/whaleshark/thresher are intentionally NOT pinned
     * here yet: they are among the 31 rows currently HELD on the low-poly rig
     * by the rig_morph length-delta gate (hse/REQUESTS.md). Re-pin them in the
     * same edit that un-holds them in tools/gen_data.py. */
    for (const [rowId, expectedBase] of Object.entries(HSE_FAMILY_EXPECT)) if (result.baseMap[rowId] !== expectedBase) throw new Error(`HSE family map: ${rowId} routed to ${result.baseMap[rowId]}, expected ${expectedBase}`);
    const uniqueTints = new Set(Object.values(result.tintSignatures));
    if (uniqueTints.size !== allRows.length) throw new Error(`rendered tint distinctness ${uniqueTints.size}/${allRows.length}`);
    for (const act of new Set(allRows.map((def) => def.act))) {
      const actRows = allRows.filter((def) => def.act === act), unique = new Set(actRows.map((def) => result.variantSignatures[def.id])); let minFeatureCount = 4, closestPair = null;
      for (let i = 0; i < actRows.length; i++) for (let j = i + 1; j < actRows.length; j++) { const difference = personalityFeatureDifference(actRows[i], actRows[j]), count = Object.values(difference).filter(Boolean).length; if (count < minFeatureCount) { minFeatureCount = count; closestPair = [actRows[i].id, actRows[j].id]; } if (count < 2) throw new Error(`act ${act} pair ${actRows[i].id}/${actRows[j].id} differs in only ${count}/4 personality features`); }
      result.actDistinctness[act] = { rows: actRows.length, unique: unique.size, minFeatureCount, closestPair };
      if (unique.size !== actRows.length) throw new Error(`act ${act} variant signatures ${unique.size}/${actRows.length}`);
    }
    const showcase = ['reef', 'tiger', 'hammerhead', 'greatwhite', 'whaleshark', 'leviathanrex', 'zeusfin', 'typhonmaw'];
    if (new Set(showcase.map((id) => result.tintSignatures[id])).size !== showcase.length) throw new Error('showcase rendered tint signatures are not pairwise distinct');
    /* Rev 13 color gates. These lock in the measured lineup improvement:
     * mean rendered flank saturation 0.292 -> 0.370, mean back/belly value
     * delta 0.204 -> 0.242, and worst-case pairwise separation 0.013 -> 0.101
     * across the 12-row probe lineup. */
    const colorRows = ['reef', 'tiger', 'hammerhead', 'greatwhite', 'whaleshark', 'megalodon', 'voltaicrex', 'leviathanrex', 'zeusfin', 'typhonmaw', 'hadesmaw', 'solaris'];
    const colorStats = {};
    for (const id of colorRows) {
      const def = allRows.find((row) => row.id === id); if (!def) throw new Error(`color gate row ${id} missing`);
      const p = paletteOf(def), b = p.resolved.base, belly = p.resolved.belly, accent = p.resolved.accent;
      /* Every flank must carry real chroma; a washed-out base is what made the
       * pre-Rev-13 roster read as near-monochrome against the pale water. */
      if (id !== SHARKJIRA_ID && b.s < 0.30) throw new Error(`${id}: base saturation ${b.s.toFixed(3)} < 0.30 color floor`);
      /* Countershading must be a real value split, not a tint. */
      if (belly.v - b.v < 0.20) throw new Error(`${id}: countershade delta ${(belly.v - b.v).toFixed(3)} < 0.20`);
      /* Accents have to out-punch the flank or collars/stripes vanish in fog. */
      if (accent.s < 0.60) throw new Error(`${id}: accent saturation ${accent.s.toFixed(3)} < 0.60`);
      colorStats[id] = { baseH: Number(b.h.toFixed(4)), baseS: Number(b.s.toFixed(4)), baseV: Number(b.v.toFixed(4)), countershade: Number((belly.v - b.v).toFixed(4)) };
    }
    /* Sharkjira keeps charcoal identity but must never be a silhouette-only
     * blob: the body value has to clear the water's shadow floor so plates,
     * gills and the atomic blue read. */
    const jira = paletteOf(allRows.find((row) => row.id === SHARKJIRA_ID));
    if (jira.resolved.base.v < 0.22 || jira.resolved.base.v > 0.42) throw new Error(`sharkjira base value ${jira.resolved.base.v.toFixed(3)} outside the 0.22-0.42 charcoal-but-readable band`);
    if (jira.resolved.accent.s < 0.85 || jira.resolved.accent.v < 0.85) throw new Error('sharkjira atomic blue accent lost its punch');
    /* Pairwise hue/value separation across the lineup. */
    let minColorSep = 9;
    for (let i = 0; i < colorRows.length; i++) for (let j = i + 1; j < colorRows.length; j++) {
      const a = colorStats[colorRows[i]], c = colorStats[colorRows[j]];
      const sep = hueDistance(a.baseH, c.baseH) * 2 + Math.abs(a.baseV - c.baseV) + Math.abs(a.baseS - c.baseS) * 0.5;
      if (sep < minColorSep) minColorSep = sep;
      if (sep < 0.10) throw new Error(`color pair ${colorRows[i]}/${colorRows[j]} separation ${sep.toFixed(3)} < 0.10`);
    }
    result.colorSeparation = { rows: colorRows.length, min: Number(minColorSep.toFixed(4)), stats: colorStats };
    if (!(SCENE_SATURATION_GAIN > 1) || !(SCENE_COUNTERSHADE_GAIN > 1)) throw new Error('scene pre-compensation gains must exceed 1');
    result.notes.push('Rev 11: all 85 definitions have authored bulk, sculpt, face, surface, and signature briefs. Bind-pose positions are baked per definition from Head/Neck/Abdomen/Tail/LowerJaw skin influence, with recomputed smooth normals and no split contour mesh.');
    result.notes.push('Skin3 samples the atlas as luminance/detail, paints explicit top/belly/accent palette regions, and preserves atlas-owned teeth, pupil/cavity, and mouth pixels. Named showcase overrides enforce blue-gray reef, tan striped tiger, slate great-white, and distinct pantheon families.');
    result.notes.push('9.6 gates: MeshStandardMaterial only, smooth normals, roughness 0.50 body specular lighting, no BackSide contour shell, 28% cruise jaw gape with full bite snap, and hammer foil >=0.42 body span.');
    result.notes.push('Rev 10/11 gates: no non-allowlisted prop, every retained prop is head-contact fitted, every act has pairwise-unique signatures, and every same-act pair differs in at least two of silhouette, pattern, hue family, and face attitude. Browser render audit additionally measures pairwise pixel distance from the 85-row contact sheet.');
    result.notes.push('Node selftest parses GLB JSON+BIN directly and intentionally skips image decoding; preload is idempotent and bbox X is measured after the initial posed clip at 96*sil.len.');
    /* ==== HSE lane O3 verification gates (begin) ==================== *
     * Numeric gates for the verification harness itself, so a broken or
     * stale harness fails this run instead of quietly reporting green.
     * Node-only: the pixel gates need a browser and live in hse/verify.mjs.
     * ================================================================ */
    if (typeof process !== 'undefined' && process.versions?.node) {
      try {
        /* Synchronous on purpose: __selftest() returns a plain object and the
         * runner does not await it, so making this async would change a
         * contract every other lane's test run depends on. createRequire gives
         * a sync load of the harness's gate surface from inside an ES module. */
        const { createRequire } = process.getBuiltinModule('module');
        const req = createRequire(import.meta.url);
        const o3 = req('./hse/verify_gates.cjs');
        const v = o3.__verifyGates();
        result.o3 = { pass: v.pass, rows: v.rows, gates: v.gates };
        for (const n of v.notes) result.notes.push('O3 ' + n);
        if (!v.pass) throw new Error('O3 verification gates failed');
      } catch (e) {
        result.notes.push('FAIL O3 verification harness: ' + (e?.message || String(e)));
        throw e;
      }
    }
    /* ==== HSE lane O3 verification gates (end) ====================== */

    /* ==== HSE lane O4 model-residency gates ========================= */
    {
      const budget = modelBudget.report();
      result.modelBudget = { cap: budget.cap, resident: budget.resident.length, textured: budget.texturedCount, stats: budget.stats };

      /* The boot set must be exactly the non-textured models, and it must be
       * derived, not hand-listed, so a new bake added to MODEL_FILES cannot
       * silently rejoin the eager path. */
      if (BASE_KEYS.some((key) => TEXTURED_KEYS.has(key))) throw new Error('lane O4: boot set contains a textured model');
      if (BASE_KEYS.length + TEXTURED_KEYS.size !== MODEL_KEYS.length) throw new Error(`lane O4: boot set ${BASE_KEYS.length} + textured ${TEXTURED_KEYS.size} != ${MODEL_KEYS.length} models`);
      result.modelBudget.bootSet = BASE_KEYS.length;

      /* The LRU must actually bound residency. Exercised on a throwaway
       * registry so the live one (pinned wholesale by the Node preload) is
       * untouched: admit 5 textured keys with no references and only `cap`
       * may survive. */
      {
        const probe = new ModelBudget({ isTextured: () => true, cap: TEXTURED_LRU_CAP });
        const fakeTemplate = (key) => ({ key, scene: { traverse: () => {} } });
        for (const key of ['a', 'b', 'c', 'd', 'e']) probe.admit(key, fakeTemplate(key));
        if (probe.report().texturedCount !== TEXTURED_LRU_CAP) throw new Error(`lane O4: LRU kept ${probe.report().texturedCount} textured templates, cap is ${TEXTURED_LRU_CAP}`);
        if (probe.has('a') || probe.has('b')) throw new Error('lane O4: LRU evicted the wrong entries (oldest must go first)');
        if (!probe.has('e')) throw new Error('lane O4: LRU evicted the newest entry');
        if (probe.report().stats.evictions !== 2) throw new Error(`lane O4: expected 2 evictions, saw ${probe.report().stats.evictions}`);
        /* A referenced template is never evicted, even as the LRU choice:
         * disposing it would pull buffers out from under a live rig. */
        const held = new ModelBudget({ isTextured: () => true, cap: 1 });
        held.admit('pinned', fakeTemplate('pinned')); held.retain('pinned');
        held.admit('fresh', fakeTemplate('fresh'));
        /* 'pinned' is the LRU choice but is referenced, so the sweep must skip
         * it and take 'fresh' instead. Residency is legitimately over cap here
         * only while the reference is live. */
        if (!held.has('pinned')) throw new Error('lane O4: a referenced template was evicted');
        if (held.has('fresh')) throw new Error('lane O4: the sweep did not fall through to an unreferenced entry');
        /* ...and once the reference comes back, a later admit can reclaim it. */
        held.release('pinned');
        if (held.refs('pinned') !== 0) throw new Error('lane O4: release did not clear the reference');
        held.admit('next', fakeTemplate('next'));
        if (held.has('pinned')) throw new Error('lane O4: an unreferenced over-cap template survived the next admit');
        result.modelBudget.lru = 'bounded; oldest-first; live references honoured; release reclaims';
      }

      /* Two rigs built from one base must SHARE the template rather than load
       * it twice - this is the NPC-shares-the-player's-model contract. */
      {
        const textured = allRows.filter((def) => TEXTURED_KEYS.has(baseForDef(def)));
        if (!textured.length) throw new Error('lane O4: no textured rows to check sharing against');
        const base = baseForDef(textured[0]);
        const before = modelBudget.report().stats.loads;
        const a = buildShark(textured[0]), b = buildShark(textured[0]);
        if (modelBudget.report().stats.loads !== before) throw new Error('lane O4: a second rig on a resident base triggered another load');
        if (a.parts.body.geometry !== b.parts.body.geometry) throw new Error('lane O4: two rigs on one textured base do not share geometry');
        /* Each rig holds its own reference, and releasing gives it back. */
        const refsHeld = modelBudget.refs(base);
        Art3D.releaseShark(a.group); Art3D.releaseShark(b.group);
        if (modelBudget.refs(base) !== refsHeld - 2) throw new Error(`lane O4: releaseShark did not return both references (${modelBudget.refs(base)} vs ${refsHeld - 2})`);
        result.modelBudget.sharing = `two rigs on ${base} shared one template and one geometry`;
      }

      /* releaseShark must not dispose buffers the template still owns. The
       * ui3d bakeThumb fallback used to do exactly that. */
      {
        const textured = allRows.find((def) => TEXTURED_KEYS.has(baseForDef(def)));
        const base = baseForDef(textured), template = modelBudget.peek(base);
        const rig = buildShark(textured), geometry = rig.parts.body.geometry;
        Art3D.releaseShark(rig.group);
        const templateGeometries = new Set(); template.scene.traverse((o) => { if (o.isMesh && o.geometry) templateGeometries.add(o.geometry); });
        if (!templateGeometries.has(geometry)) throw new Error('lane O4: textured rig geometry is not the template geometry');
        if (geometry.attributes?.position == null) throw new Error('lane O4: releaseShark disposed template-owned geometry');
        const stillBuilds = buildShark(textured);
        if (!stillBuilds.parts.body?.isSkinnedMesh) throw new Error('lane O4: template unusable after a release');
        Art3D.releaseShark(stillBuilds.group);
        result.modelBudget.release = 'per-rig resources disposed; template-owned geometry preserved';
      }
    }
    /* ==== HSE lane O4 model-residency gates (end) =================== */
    result.pass = true;
  } catch (error) { result.errors.push(error?.message || String(error)); result.notes.push(`FAIL ${error?.message || String(error)}`); }
  return result;
}

const Art3D = RF.Art3D || {};
Art3D.buildShark = buildShark; Art3D.preload = preload; Art3D.bendableMaterial = bendableMaterial; Art3D.bendOffset = bendOffset; Art3D.billboard = billboard; Art3D.paletteOf = paletteOf; Art3D.PERSONALITY_TABLE = PERSONALITY_TABLE; Art3D.__selftest = __selftest;
Art3D.stats = () => ({ models: modelCache.size, modelKeys: Array.from(modelCache.keys()), personalityGeometries: personalityGeometryCache.size, billboardMaterials: billboardMaterials.size, preloadError: preloadError?.message || null });
/* HSE lane O4. Previously a no-op stub, which left ui3d's bakeThumb() falling
 * through to its own best-effort cleanup - and that path traverses the rig
 * disposing every geometry and material it finds. Those are SHARED with the
 * template by cloneRigScene() (it clones the scene graph but not the buffers),
 * and the textured path shares the bake's authored geometry outright across
 * every row using it, so one thumbnail bake could dispose the buffers out from
 * under a live shark. Implementing the hook takes that path out of play: ui3d
 * and engine3d both prefer releaseShark() when it exists.
 *
 * What a release actually does is give back the template reference this rig
 * claimed, then let the budget decide. Per-rig resources (the cloned skeleton,
 * the per-row material instances, the face batch) are owned by the rig and are
 * disposed here; the template's shared geometry and textures are disposed only
 * by an eviction, once no rig references them. */
Art3D.releaseShark = (group) => {
  if (!group) return;
  const target = group.group || group;
  if (target.traverse) {
    const templateGeometries = new Set();
    const base = rigHolds ? rigHolds.get(target) : null;
    const template = base ? modelBudget.peek(base) : null;
    if (template?.scene?.traverse) template.scene.traverse((object) => { if (object.isMesh && object.geometry) templateGeometries.add(object.geometry); });
    target.traverse((object) => {
      if (!object.isMesh) return;
      /* Never dispose a buffer the template still owns; that is the shared
       * one, and other rigs plus the cache entry are still using it. */
      if (object.geometry && !templateGeometries.has(object.geometry)) { try { object.geometry.dispose(); } catch (error) { /* already gone */ } }
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      for (const material of materials) {
        /* Materials ARE per-rig here (buildLoadedRig builds a fresh
         * texturedSkinMaterial/colorizer per row), but their maps point at the
         * template's textures, so dispose the material and leave its maps. */
        if (material) { try { material.dispose(); } catch (error) { /* already gone */ } }
      }
    });
  }
  if (rigHolds && rigHolds.has(target)) { const base = rigHolds.get(target); rigHolds.delete(target); modelBudget.release(base); }
};
Art3D.modelBudget = () => modelBudget.report();
/* For probes/gates: the live template objects, so a caller can count the
 * textures this lane actually holds rather than every texture in the context
 * (world3d owns most of those). */
Art3D.residentTemplates = () => modelBudget.report().resident.map((entry) => modelBudget.peek(entry.key)).filter(Boolean);
RF.Art3D = Art3D;
preload();

export { Art3D, PERSONALITY_TABLE, bendableMaterial, bendOffset, billboard, buildShark, paletteOf, preload, __selftest };
export default Art3D;
