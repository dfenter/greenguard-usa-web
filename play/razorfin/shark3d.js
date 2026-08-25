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

const host = typeof window !== 'undefined' ? window : globalThis;
const RF = host.RF = host.RF || {};
const MODEL_FILES = Object.freeze({
  sharky: 'sharky.glb', goblinshark: 'goblinshark.glb', anglerfish: 'anglerfish.glb', piranha: 'piranha.glb',
  whale: 'whale.glb', shark: 'shark.glb', shark_c: 'shark_c.glb', hammer_chibi: 'hammer_chibi.glb',
  manta: 'manta.glb', dolphin: 'dolphin.glb', fish_tuna: 'fish_tuna.glb', fish_blue: 'fish_blue.glb',
  fish_clown: 'fish_clown.glb', shark_b: 'shark_b.glb'
});
const MODEL_KEYS = Object.freeze(Object.keys(MODEL_FILES));
const TAU = Math.PI * 2;
const BASE_LENGTH = 96;
const PATTERN_SUFFIX = ':rf-skin3';
const JAW_REST_GAPE = 0.28;
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
const BODY_FLANK_SATURATION_MAX = 0.90;
const BODY_FLANK_SATURATION_TARGET = 0.86;
const BODY_FLANK_VALUE_MIN = 0.55;
const BODY_FLANK_VALUE_MAX = 0.82;
const ACCENT_SATURATION_MIN = 0.80;
const ACCENT_SATURATION_MAX = 1.00;
const ACCENT_SATURATION_TARGET = 0.96;
const ACCENT_VALUE_MIN = 0.65;
const ACCENT_VALUE_MAX = 0.95;
const BELLY_SATURATION_MIN = 0.15;
const BELLY_SATURATION_MAX = 0.40;
const BELLY_VALUE_MIN = 0.80;
const BELLY_VALUE_MAX = 0.98;
const PANTHEON_PALETTE_FAMILIES = Object.freeze({
  zeusfin: { baseHue: 0.52, accentHue: 0.55, baseV: 0.66, accentV: 0.94 },
  poseidonrex: { baseHue: 0.61, accentHue: 0.64, baseV: 0.56, accentV: 0.92 },
  hadesmaw: { baseHue: 0.77, accentHue: 0.81, baseV: 0.62, accentV: 0.94 },
  apollodon: { baseHue: 0.14, accentHue: 0.11, baseV: 0.73, accentV: 0.95 },
  artemisstrike: { baseHue: 0.68, accentHue: 0.70, baseV: 0.68, accentV: 0.94 },
  athenajaw: { baseHue: 0.08, accentHue: 0.06, baseV: 0.58, accentV: 0.91 },
  aresrender: { baseHue: 0.005, accentHue: 0.99, baseV: 0.62, accentV: 0.93 },
  hermesdart: { baseHue: 0.56, accentHue: 0.13, baseV: 0.76, accentV: 0.95 },
  hephaestusforge: { baseHue: 0.075, accentHue: 0.045, baseV: 0.67, accentV: 0.94 },
  dionysustide: { baseHue: 0.91, accentHue: 0.88, baseV: 0.64, accentV: 0.95 },
  aphroditelure: { baseHue: 0.96, accentHue: 0.98, baseV: 0.77, accentV: 0.95 },
  heracrown: { baseHue: 0.105, accentHue: 0.095, baseV: 0.70, accentV: 0.95 },
  typhonmaw: { baseHue: 0.74, accentHue: 0.55, baseV: 0.42, accentV: 0.95 },
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
  reef:       { base: [0.58, 0.52, 0.55], belly: [0.57, 0.12, 0.92], accent: [0.57, 0.82, 0.80] },
  tiger:      { base: [0.095, 0.52, 0.62], belly: [0.10, 0.16, 0.91], accent: [0.075, 0.78, 0.78] },
  hammerhead: { base: [0.59, 0.42, 0.60], belly: [0.58, 0.10, 0.94], accent: [0.57, 0.78, 0.82] },
  greatwhite: { base: [0.59, 0.22, 0.60], belly: [0.58, 0.08, 0.98], accent: [0.57, 0.62, 0.80] },
  whaleshark: { base: [0.58, 0.32, 0.54], belly: [0.57, 0.10, 0.92], accent: [0.56, 0.70, 0.76] },
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
  base: 0x1b1f22, belly: 0x2a3138, accent: 0x3fd6ff, glow: 0x3fd6ff
});
const SHARKJIRA_PULSE = { value: 0.86 };
/* The Sharky bind pose runs nose -> tail as local-y 0 -> 1. Keep the
 * showpiece crest on the Neck-to-Tail3 span; the previous rear-biased
 * stations made the row read as a bull shark with tail spikes. */
const SHARKJIRA_PLATE_STATIONS = Object.freeze([0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.77, 0.84]);
const SHARKJIRA_PLATE_HEIGHTS = Object.freeze([0.14, 0.20, 0.27, 0.32, 0.32, 0.27, 0.20, 0.13]);

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
  if (family) {
    const underworld = UNDERWORLD_IDS.has(id);
    const base = hsvToColor(family.baseHue, underworld ? 0.76 : 0.78, family.baseV);
    const accent = hsvToColor(family.accentHue, 0.96, family.accentV);
    const belly = hsvToColor(family.baseHue, underworld ? 0.20 : 0.18, underworld ? 0.84 : 0.91);
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
    if (object.isSkinnedMesh) {
      if (!object.userData.rfFrozenBounds) object.computeBoundingBox();
      if (object.boundingBox) out.union(object.boundingBox.clone().applyMatrix4(object.matrixWorld));
    } else if (object.geometry?.boundingBox) out.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    else out.expandByObject(object);
  });
  return out;
}
function prepareTemplate(scene, animations = [], key = '') {
  const meshes = findMeshes(scene), skinnedMeshes = meshes.filter((object) => object.isSkinnedMesh);
  const source = skinnedMeshes[0] || meshes[0];
  if (!source) throw new Error(`${key}: no mesh`);
  const isSkinned = skinnedMeshes.length > 0;
  scene.updateMatrixWorld(true);
  const clip = animations?.find((a) => /swim(?![_a-z])/i.test(a.name || '') || /swimming_normal/i.test(a.name || '')) || animations?.find((a) => /swim|swimming/i.test(a.name || '')) || animations?.[0] || null;
  if (isSkinned && clip) { const mixer = new THREE.AnimationMixer(scene); mixer.clipAction(clip).play(); mixer.update(0); scene.updateMatrixWorld(true); }
  const initialBox = measureBox(scene), initialSize = initialBox.getSize(new THREE.Vector3());
  const axis = initialSize.y >= initialSize.x && initialSize.y >= initialSize.z ? 'y' : initialSize.z > initialSize.x ? 'z' : 'x';
  const unitScale = 1 / Math.max(initialSize.x, initialSize.y, initialSize.z, 1e-5);
  scene.scale.setScalar(unitScale); scene.position.sub(initialBox.getCenter(new THREE.Vector3()).multiplyScalar(unitScale));
  if (axis === 'y') scene.rotation.z = -Math.PI / 2; else if (axis === 'z') scene.rotation.y = Math.PI / 2;
  scene.updateMatrixWorld(true);
  const normalizedBox = measureBox(scene);
  const materials = [];
  for (const mesh of meshes) for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) if (material && !materials.includes(material)) materials.push(material);
  const sourceMaterials = (Array.isArray(source.material) ? source.material : [source.material]).map((material) => String(material?.name || 'Body'));
  return {
    key, scene, body: source, meshes, skinnedMeshes, materials, animations: animations || [], clip,
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
  return { addPrism, addOcta, addPyramid, addPlate, geometry };
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

const SHADER_UNIFORMS = Object.freeze([
  'uRfTopColor', 'uRfBottomColor', 'uRfAccentColor', 'uRfPatternColor', 'uRfPatternId',
  'uRfPatternScale', 'uRfPatternContrast', 'uRfPatternSeed', 'uRfPatternMix',
  'uRfHueShift', 'uRfSaturation', 'uRfTintMask', 'uRfHeightScale', 'uRfEyeColor',
  'uRfFaceEye', 'uRfFaceBrow', 'uRfFacePupil', 'uRfRelief', 'uRfReliefScale', 'uRfSurfaceMode'
]);
function materialIsFace(name) { return /eye|teeth|tooth|mouth/i.test(String(name || '')); }
function sourceMap(sourceMaterial) { return sourceMaterial?.map || null; }
function skinMaterial(palette, def, sourceMaterial = null, sourceName = '', atlas = false, featureMode = '') {
  const id = String(def?.id || ''), profile = variantProfile(def), personality = personalityOf(def), face = personality?.face || { eye: 1, brow: 0, pupil: 1, gape: 0, tilt: 0 }, surface = personality?.surface || { relief: 0.04, density: 1, scars: 0, plates: 0, mode: 0 }, faceSlot = materialIsFace(sourceName), map = sourceMap(sourceMaterial), sourceColor = sourceMaterial?.color?.clone?.() || new THREE.Color(1, 1, 1);
  const uniforms = {
    uRfTopColor: { value: palette.base.clone() }, uRfBottomColor: { value: palette.belly.clone() }, uRfAccentColor: { value: palette.accent.clone() }, uRfPatternColor: { value: palette.accent.clone() },
    uRfPatternId: { value: patternId(def) }, uRfPatternScale: { value: profile.patternScale }, uRfPatternContrast: { value: id === SHARKJIRA_ID ? 0.82 : 0.95 }, uRfPatternSeed: { value: hashString(def?.id || '') * 17 }, uRfPatternMix: { value: id === SHARKJIRA_ID ? 0.18 : patternId(def) ? 0.78 : 0 }
    , uRfHueShift: { value: 0 }, uRfSaturation: { value: 1 }, uRfTintMask: { value: faceSlot ? 0 : 1 }, uRfHeightScale: { value: 44 }, uRfEyeColor: { value: profile.eyeColor.clone() }
    , uRfFaceEye: { value: face.eye }, uRfFaceBrow: { value: face.brow }, uRfFacePupil: { value: face.pupil }, uRfRelief: { value: surface.relief + surface.scars * 0.30 + surface.plates * 0.24 }, uRfReliefScale: { value: 1.8 * surface.density }, uRfSurfaceMode: { value: surface.mode }
  };
  const act = finite(def?.act, 1), glow = palette.glow || new THREE.Color(0, 0, 0);
  /* Sharkjira's atomic read belongs to the dedicated plate/gill/eye batch.
   * Letting the charcoal body share that blue emissive field lifts the whole
   * flank into a cyan veil even though the material remains fully opaque. */
  const sharkjiraBody = id === SHARKJIRA_ID && !faceSlot && !featureMode;
  const material = new THREE.MeshStandardMaterial({
    /* Atlas materials use white as the detail carrier. Multiplying the dark
     * palette here was the Rev 9b tint bug; the shader below owns the palette
     * mix and only uses the atlas for luminance/detail and face masks. */
    color: faceSlot || !atlas ? (faceSlot ? sourceColor : palette.base.clone()) : new THREE.Color(1, 1, 1), map,
    roughness: faceSlot ? 0.58 : 0.50, metalness: faceSlot ? 0 : 0.03, flatShading: false,
    emissive: faceSlot || sharkjiraBody ? new THREE.Color(0, 0, 0) : featureMode === 'hammer' ? palette.base.clone() : glow,
    emissiveIntensity: faceSlot || sharkjiraBody ? 0 : featureMode === 'hammer' ? 0.10 : clamp(0.05 + Math.max(0, act - 1) * 0.055, 0, 0.32)
  });
  material.name = `RF Rev 9c shark skin ${def?.id || 'unknown'} ${sourceName || 'Body'}`;
  material.userData.rfSkinUniforms = uniforms; material.userData.rfSkinPattern = String(def?.sil?.pattern || 'plain'); material.userData.rfSharkjiraBody = sharkjiraBody;
  material.userData.rfAtlas = !!(atlas && map); material.userData.rfFaceMask = faceSlot ? 'material-slot' : atlas ? 'atlas-white-luminance' : 'none';
  material.userData.rfShading = 'MeshStandardMaterial; smooth normals; roughness 0.50; specular lighting';
  const hammerRamp = featureMode === 'hammer' ? [
    'float rfFoilBelly = smoothstep(0.040, -0.040, vRfBindPosition.z);',
    'vec3 rfFoilRegion = mix(uRfTopColor, uRfBottomColor, rfFoilBelly);',
    'diffuseColor.rgb = rfFoilRegion;'
  ].join('\n') : [
    'vec3 rfHsv = rfRgbToHsv(diffuseColor.rgb); rfHsv.x = fract(rfHsv.x + uRfHueShift); rfHsv.y = clamp(rfHsv.y * uRfSaturation, 0.0, 1.0); rfHsv.z = clamp(rfHsv.z * 1.35 + 0.04, 0.0, 1.0);',
    'vec3 rfVivid = rfHsvToRgb(rfHsv);',
    'diffuseColor.rgb = mix(rfVivid, diffuseColor.rgb, clamp(rfFaceMask, 0.0, 1.0));'
  ].join('\n');
  const patternCode = [
    'float rfAlong = vRfBindPosition.y * uRfPatternScale + uRfPatternSeed;',
    'float rfAcross = vRfBindPosition.x * uRfPatternScale * 1.7 + uRfPatternSeed * 0.37;',
    'float rfPattern = 0.0;',
    'if (uRfPatternId == 1) rfPattern = smoothstep(0.40, 0.60, 0.5 + 0.5 * sin(rfAlong * 3.14159));',
    'else if (uRfPatternId == 2) rfPattern = step(0.68, rfHash(vec2(floor(rfAlong * 2.0), floor(rfAcross * 3.0))));',
    'else if (uRfPatternId == 3) rfPattern = smoothstep(0.35, 0.65, 0.5 + 0.5 * sin(rfAlong * 6.28318));',
    'else if (uRfPatternId == 4) rfPattern = step(0.73, rfHash(vec2(floor(rfAlong * 3.0), floor(rfAcross * 2.0))));',
    'else if (uRfPatternId == 5) rfPattern = step(0.56, rfHash(vec2(floor(rfAlong * 5.0), floor(rfAcross * 4.0))));',
    'float rfFaceMask = 1.0 - uRfTintMask;',
    atlas && map ? [
      'vec3 rfAtlasTexel = texture2D(map, vMapUv).rgb;',
      'float rfAtlasLuma = dot(rfAtlasTexel, vec3(0.299, 0.587, 0.114));',
      /* The Sharky atlas is white-backed and uses tiny colored islands. Do
       * not use RGB hue as the shark identity: retain only its light/dark
       * detail, then paint the authored top/belly palette over it. */
      'float rfDetail = mix(0.56, 1.30, smoothstep(0.12, 0.86, rfAtlasLuma));',
      'float rfHeight = 1.0 - clamp(vRfBindPosition.z * uRfHeightScale + 0.5, 0.0, 1.0);',
      'float rfBelly = smoothstep(0.43, 0.72, rfHeight);',
      'vec3 rfRegion = mix(uRfTopColor, uRfBottomColor, rfBelly);',
      'float rfFinTip = smoothstep(0.80, 0.99, abs(rfHeight * 2.0 - 1.0)) * 0.26;',
      'rfRegion = mix(rfRegion, uRfAccentColor, rfFinTip);',
      'vec3 rfRegionHsv = rfRgbToHsv(rfRegion); rfRegionHsv.x = fract(rfRegionHsv.x + uRfHueShift); rfRegionHsv.y = clamp(rfRegionHsv.y * uRfSaturation, 0.0, 1.0);',
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
    ].join('\n') : featureMode === 'hammer' ? hammerRamp : [
      'vec3 rfHsv = rfRgbToHsv(diffuseColor.rgb); rfHsv.x = fract(rfHsv.x + uRfHueShift); rfHsv.y = clamp(rfHsv.y * uRfSaturation, 0.0, 1.0); rfHsv.z = clamp(rfHsv.z * 1.35 + 0.04, 0.0, 1.0);',
      'vec3 rfVivid = rfHsvToRgb(rfHsv);',
      'diffuseColor.rgb = mix(rfVivid, diffuseColor.rgb, clamp(rfFaceMask, 0.0, 1.0));'
    ].join('\n'),
    'diffuseColor.rgb = mix(diffuseColor.rgb, uRfPatternColor, rfPattern * uRfPatternMix * uRfPatternContrast * (1.0 - rfFaceMask));',
    featureMode === 'hammer' ? 'if (vRfFeature > 0.5) diffuseColor.rgb = vec3(0.008, 0.014, 0.016);' : ''
  ].join('\n');
  material.onBeforeCompile = (shader) => {
    for (const name of SHADER_UNIFORMS) shader.uniforms[name] = uniforms[name];
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nattribute float rfSlot;\nvarying float vRfSlot;\nvarying vec3 vRfBindPosition;${sharkjiraBody ? '\nattribute float rfCrest;\nattribute float rfCrestEdge;\nvarying float vRfCrestEdge;' : ''}${featureMode === 'hammer' ? '\nattribute float rfFeature;\nvarying float vRfFeature;' : ''}`).replace('#include <begin_vertex>', `#include <begin_vertex>\nvRfSlot = rfSlot;\nvRfBindPosition = position;${sharkjiraBody ? '\nvRfCrestEdge = rfCrestEdge;' : ''}${featureMode === 'hammer' ? '\nvRfFeature = rfFeature;' : ''}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nuniform vec3 uRfTopColor;\nuniform vec3 uRfBottomColor;\nuniform vec3 uRfAccentColor;\nuniform vec3 uRfPatternColor;\nuniform int uRfPatternId;\nuniform float uRfPatternScale;\nuniform float uRfPatternContrast;\nuniform float uRfPatternSeed;\nuniform float uRfPatternMix;\nuniform float uRfHueShift;\nuniform float uRfSaturation;\nuniform float uRfTintMask;\nuniform float uRfHeightScale;\nuniform vec3 uRfEyeColor;\nuniform float uRfFaceEye;\nuniform float uRfFaceBrow;\nuniform float uRfFacePupil;\nuniform float uRfRelief;\nuniform float uRfReliefScale;\nuniform float uRfSurfaceMode;${sharkjiraBody ? '\nuniform vec3 uRfAtomicColor;\nuniform float uRfAtomicPulse;' : ''}\nvarying float vRfSlot;\nvarying vec3 vRfBindPosition;${sharkjiraBody ? '\nvarying float vRfCrestEdge;' : ''}${featureMode === 'hammer' ? '\nvarying float vRfFeature;' : ''}\nfloat rfHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nvec3 rfRgbToHsv(vec3 c){vec4 K=vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);return vec3(abs(q.z+(q.w-q.y)/(6.0*d+1e-5)),d/(q.x+1e-5),q.x);}\nvec3 rfHsvToRgb(vec3 c){vec3 p=abs(fract(c.xxx+vec3(0.0,1.0/3.0,2.0/3.0))*6.0-3.0);return c.z*mix(vec3(1.0),clamp(p-1.0,0.0,1.0),c.y);}`)
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\nfloat rfReliefA = sin(vRfBindPosition.y * uRfReliefScale * 4.0 + uRfPatternSeed);\nfloat rfReliefB = sin(vRfBindPosition.x * uRfReliefScale * 3.0 + rfReliefA * 1.7 + uRfPatternSeed * 0.31);\nfloat rfReliefMask = uRfSurfaceMode < 1.5 ? rfReliefA : uRfSurfaceMode < 3.5 ? rfReliefB : rfReliefA * rfReliefB;\nvec3 rfReliefNormal = normalize(normal + vec3(rfReliefMask * 0.075, rfReliefA * 0.020, rfReliefB * 0.060));\nnormal = normalize(mix(normal, rfReliefNormal, clamp(uRfRelief * 0.82, 0.0, 0.42)));`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${patternCode}`);
    if (atlas && map) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n/* Soft ambient countershading keeps the authored belly readable under the deep-teal hemi ground. */\ntotalEmissiveRadiance += uRfBottomColor * rfBelly * 0.16;');
      shader.fragmentShader = shader.fragmentShader.replace('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;', 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;\noutgoingLight += uRfBottomColor * rfBelly * 0.34;');
    }
    if (sharkjiraBody) {
      shader.uniforms.uRfAtomicColor = { value: glow.clone() }; shader.uniforms.uRfAtomicPulse = SHARKJIRA_PULSE;
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n/* The hull stays charcoal; only the connected plate rims pulse. */\ntotalEmissiveRadiance += uRfAtomicColor * vRfCrestEdge * uRfAtomicPulse * 0.18;');
    }
  };
  material.customProgramCacheKey = () => `${material.userData.rfSkinPattern}${sharkjiraBody ? ':sharkjira-body' : ''}${PATTERN_SUFFIX}${featureMode ? `:${featureMode}` : ''}`;
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
  /* Sharky's bind axes are y=length, z=up, x=depth. The old ShapeGeometry
   * lived in x/y and was therefore edge-on at the gameplay camera. This
   * rounded, slightly swept double-lobe is made in y/z and lofted through x. */
  const shape = new THREE.Shape();
  shape.moveTo(-0.205, 0.000);
  shape.quadraticCurveTo(-0.225, 0.028, -0.190, 0.078);
  shape.lineTo(-0.055, 0.046);
  shape.quadraticCurveTo(0.000, 0.038, 0.055, 0.046);
  shape.lineTo(0.190, 0.078);
  shape.quadraticCurveTo(0.225, 0.028, 0.205, 0.000);
  shape.quadraticCurveTo(0.225, -0.028, 0.190, -0.078);
  shape.lineTo(0.055, -0.046);
  shape.quadraticCurveTo(0.000, -0.038, -0.055, -0.046);
  shape.lineTo(-0.190, -0.078);
  shape.quadraticCurveTo(-0.225, -0.028, -0.205, 0.000);
  shape.closePath();
  const remap = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);
  const foil = new THREE.ExtrudeGeometry(shape, { depth: 0.10, steps: 1, curveSegments: 6, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.012, bevelThickness: 0.010 });
  foil.translate(0, 0, -0.05); foil.applyMatrix4(remap); propAttributes(foil, 0);
  const eyes = [];
  for (const y of [-0.168, 0.168]) {
    const eye = new THREE.SphereGeometry(0.022, 8, 5).toNonIndexed();
    eye.applyMatrix4(remap); eye.translate(0.058, y, 0.010); propAttributes(eye, 1); eyes.push(eye);
  }
  const geometry = mergeGeometries([foil, ...eyes]); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
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
    const bodySpan = Math.max(bodySize.x, 1e-5), projected = Math.max(propSize.x, 1e-5);
    prop.scale.multiplyScalar(clamp((bodySpan * 0.50) / projected, 0.012, 0.55));
    prop.userData.rfFitScale = prop.scale.x;
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
    mesh.geometry = personalityGeometryFor(sourceMesh, def, template.key, meshIndex); bakedGeometry.push(mesh.geometry.userData.rfPersonalityBaked || null);
    const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const atlas = template.key === 'sharky' || sourceMaterials.some((material) => String(material?.name || '') === 'AtlasMaterial');
    if (def?.id === SHARKJIRA_ID && !mesh.geometry.getAttribute('rfCrest')) mesh.geometry.setAttribute('rfCrest', new THREE.Float32BufferAttribute(new Float32Array(mesh.geometry.getAttribute('position').count), 1));
    if (def?.id === SHARKJIRA_ID && !mesh.geometry.getAttribute('rfCrestEdge')) mesh.geometry.setAttribute('rfCrestEdge', new THREE.Float32BufferAttribute(new Float32Array(mesh.geometry.getAttribute('position').count), 1));
    const materials = sourceMaterials.map((sourceMaterial) => skinMaterial(palette, def, sourceMaterial, sourceMaterial?.name || '', atlas));
    mesh.material = materials.length === 1 ? materials[0] : materials;
    mesh.userData.rfMaterialSlots = sourceMaterials.map((material) => String(material?.name || 'Body')); mesh.renderOrder = 1;
    if (def?.id === SHARKJIRA_ID) mesh.frustumCulled = false;
    if (!mesh.geometry.getAttribute('rfSlot')) mesh.geometry.setAttribute('rfSlot', new THREE.Float32BufferAttribute(new Float32Array(mesh.geometry.getAttribute('position').count).fill(1), 1));
  }
  const sharkjira = def?.id === SHARKJIRA_ID ? makeSharkjiraFeatures(body) : null;
  /* 9.6: no BackSide ink shell. Smooth Standard shading supplies the edge
   * separation without the doubled silhouette draw. */
  const shell = null;
  let prop = makeProp(def, template.key, propBone, palette);
  mountGrin(prop, pose, body, propBone);
  fitProp(prop, body, prop?.userData?.rfPropKind);
  if (prop && !propIsMounted(body, prop)) { prop.parent?.remove(prop); prop = null; }
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
  group.userData.rfMorph = bakedGeometry[0] || { id: def.id, neutral: false, maxOffset: 0, maxOffsetRatio: 0, vertexCount: body.geometry.getAttribute('position')?.count || 0, seamFree: false };
  group.userData.rfSourceBase = template.key; group.userData.rfPattern = String(def?.sil?.pattern || 'plain'); group.userData.rfPatternId = patternId(def);
  group.userData.rfMixerClipName = template.clips.swim?.name || template.clip?.name || null; group.userData.rfFastClipName = template.clips.fast?.name || null; group.userData.rfBiteClipName = template.clips.bite?.name || null;
  group.userData.rfHeadBone = headBone?.name || null; group.userData.rfPropBone = propBone?.name || null; group.userData.rfPropKind = prop?.userData?.rfPropKind || null;
  group.userData.rfPropAllowlisted = !prop || PROP_ALLOWLIST_IDS.has(String(def?.id || ''));
  group.userData.rfPropContactGap = prop ? finite(prop.userData.rfContactGap, Infinity) : 0;
  group.userData.rfVisibleDrawCalls = drawCount(group); group.userData.rfPaletteRaw = palette.raw; group.userData.rfPaletteResolved = palette.resolved; group.userData.rfIsSkinned = !!body.isSkinnedMesh;
  group.userData.rfSharkjira = sharkjira ? { plateCount: sharkjira.plateCount, plateStations: sharkjira.plateStations, atomicTriangles: sharkjira.atomicTriangles, toothTriangles: sharkjira.toothTriangles, pulseUniform: true } : null;
  group.userData.rfSharkjiraPulse = sharkjira?.pulse || null;
  group.userData.rfSlotNames = template.slotNames.slice(); group.userData.rfAtlasMask = template.key === 'sharky' ? 'white atlas luminance; Eyes/Teeth slots stay source-colored' : 'Eyes/Teeth material slots'; group.userData.rfLoading = false;
  const animation = { lastT: null, bite: 0, turn: 0, death: 0, active: 'swim', biteActive: false, biteLatched: false };
  const baseHeadQuaternion = headBone?.quaternion.clone(), neckBone = model.getObjectByName('Neck') || model.getObjectByName('Main5'), baseNeckQuaternion = neckBone?.quaternion.clone();
  const jawBone = model.getObjectByName('LowerJaw'), baseJawQuaternion = jawBone?.quaternion.clone();
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
    animation.turn += (turn - animation.turn) * ease; animation.bite += ((biteWant ? 1 : clamp(finite(input.jawOpen, 0), 0, 1)) - animation.bite) * biteEase;
    animation.death += ((dead ? 1 : 0) - animation.death) * (1 - Math.exp(-Math.max(dt, 1 / 120) * 7));
    pose.rotation.y = animation.turn * 0.14; pose.rotation.x = -animation.turn * 0.11 + animation.death * Math.sin(Math.min(time * 5, Math.PI) * 0.5) * 1.1; pose.rotation.z = animation.death * Math.PI * 0.5;
    const pulse = 1 + animation.bite * 0.055; pose.scale.set(pulse * (1 + 0.025 * speedFrac), pulse, pulse);
    if (headBone && baseHeadQuaternion) { headBone.quaternion.copy(baseHeadQuaternion); headBone.rotateZ(-animation.turn * 0.16); headBone.rotateX(-animation.bite * 0.10); }
    if (neckBone && baseNeckQuaternion) { neckBone.quaternion.copy(baseNeckQuaternion); neckBone.rotateZ(-animation.turn * 0.09); }
    const jawGape = jawBone ? jawRestGape + animation.bite * (1 - jawRestGape) : 0;
    group.userData.rfJawGape = jawGape;
    if (jawBone && baseJawQuaternion) { jawBone.quaternion.copy(baseJawQuaternion); jawBone.rotateX(-jawGape * JAW_MAX_ROTATION); }
    if (sharkjira) sharkjira.pulse.value = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(time * 5.4));
  }
  if (jawBone && baseJawQuaternion) { jawBone.quaternion.copy(baseJawQuaternion); jawBone.rotateX(-jawRestGape * JAW_MAX_ROTATION); }
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
  (preloadPromise || preload()).then(() => {
    if (live || !modelCache.has(base)) return;
    live = buildLoadedRig(def, modelCache.get(base), group); record.parts = { body: live.body, jaw: null, shell: live.shell, prop: live.prop }; group.userData.rfLoading = false;
    if (placeholder.parent) placeholder.parent.remove(placeholder); installEffects(record, live.body); void lastT;
  }).catch(() => {});
  return record;
}
function buildShark(def) {
  if (!def) throw new Error('RF.Art3D.buildShark requires a shark definition');
  const base = baseForDef(def); baseSelection.set(String(def.id || ''), base); const template = modelCache.get(base);
  if (!template) return placeholderRig(def, base);
  const group = new THREE.Group(); group.name = `RF Shark ${def.id || 'unknown'}`; group.userData.rfSharkId = String(def.id || 'unknown');
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
  const sourceMaterials = (json.materials || []).map((material) => { const out = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.03, flatShading: false }); out.name = String(material.name || 'Body'); out.userData.rfAtlas = out.name === 'AtlasMaterial'; return out; });
  for (const [index, node] of json.nodes.entries()) if (node.mesh != null) { const geometry = parsedGeometry(doc, json.meshes[node.mesh]), material = sourceMaterials.length ? sourceMaterials : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.03 }); let body; if (node.skin == null) body = new THREE.Mesh(geometry, material); else { body = new THREE.SkinnedMesh(geometry, material); const skin = json.skins[node.skin], inverse = readAccessor(doc, skin.inverseBindMatrices).values; const matrices = []; for (let i = 0; i < skin.joints.length; i++) matrices.push(new THREE.Matrix4().fromArray(inverse, i * 16)); body.bind(new THREE.Skeleton(skin.joints.map((joint) => objects[joint]), matrices)); } body.name = node.name || `${key} body`; objects[index].add(body); }
  const animations = [];
  for (const animation of json.animations || []) { const tracks = []; for (const channel of animation.channels || []) { const sampler = animation.samplers[channel.sampler], input = readAccessor(doc, sampler.input).values, output = readAccessor(doc, sampler.output).values, name = json.nodes[channel.target.node].name || `node${channel.target.node}`; if (channel.target.path === 'rotation') tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, input, output)); else if (channel.target.path === 'translation') tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`, input, output)); else if (channel.target.path === 'scale') tracks.push(new THREE.VectorKeyframeTrack(`${name}.scale`, input, output)); } animations.push(new THREE.AnimationClip(animation.name || `${key} animation`, -1, tracks)); }
  return prepareTemplate(scene, animations, key);
}
function nodeAssetPath(file) { const path = process.getBuiltinModule('path'); return path.resolve(path.dirname(new URL(import.meta.url).pathname), 'assets/models', file); }
function loadBrowserTemplate(key) { return new Promise((resolve, reject) => { new GLTFLoader().load(assetUrl(MODEL_FILES[key]), (gltf) => { try { resolve(prepareTemplate(gltf.scene, gltf.animations, key)); } catch (error) { reject(error); } }, undefined, reject); }); }
function preload() {
  if (preloadPromise) return preloadPromise;
  if (isNodeRuntime()) { try { for (const key of MODEL_KEYS) modelCache.set(key, directTemplate(key, nodeAssetPath(MODEL_FILES[key]))); preloadPromise = Promise.resolve(modelCache); } catch (error) { preloadError = error; preloadPromise = Promise.reject(error); } }
  else if (typeof document !== 'undefined' && typeof fetch === 'function') preloadPromise = Promise.all(MODEL_KEYS.map((key) => loadBrowserTemplate(key).then((template) => { modelCache.set(key, template); return template; }))).then(() => modelCache);
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
  const result = { pass: false, notes: [], errors: [], checked: 0, cache: [], baseMap: {}, drawCounts: {}, lengths: {}, tintSignatures: {}, variantSignatures: {}, props: {}, jawGape: {}, hammerSpan: {}, morphs: {}, personalityTable: {}, actDistinctness: {}, sharkjira: null };
  try {
    const allRows = rows(), rowIds = new Set(allRows.map((def) => def.id)), tableIds = Object.keys(PERSONALITY_TABLE); if (allRows.length !== 85) throw new Error(`expected 85 sharks, received ${allRows.length}`); if (tableIds.length !== 85 || tableIds.some((id) => !rowIds.has(id)) || Array.from(rowIds).some((id) => !PERSONALITY_TABLE[id])) throw new Error(`personality table incomplete: ${tableIds.length}/85 authored rows`); if (preloadError) throw preloadError; if (modelCache.size < MODEL_KEYS.length) throw new Error(`model cache has ${modelCache.size}/${MODEL_KEYS.length} GLBs`);
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
      const draws = drawCount(group); if (draws > 3) throw new Error(`${def.id}: ${draws} draws exceeds Rev 9 budget`);
      if (def.id === SHARKJIRA_ID) {
        const kaiju = group.userData.rfSharkjira;
        const crest = morph.crest, bodyBox = body.geometry.boundingBox || body.geometry.computeBoundingBox() && body.geometry.boundingBox, bodySpan = Math.max((bodyBox?.max.y || 0) - (bodyBox?.min.y || 0), 1e-5);
        const bodyBoxForAspect = measureBox(body), groupSize = bodyBoxForAspect.getSize(new THREE.Vector3()), crestEdge = body.geometry.getAttribute('rfCrestEdge');
        const headBoneScale = body.skeleton?.bones?.find((bone) => bone.name === 'Head')?.scale?.x || 0;
        if (!crest || crest.plateCount !== 8 || !crest.connected || crest.boundaryEdges < crest.plateCount || crest.minFaceNormalDot < 0.05 || crest.maxOffsetDepthRatio > 0.35 + 1e-5 || morph.maxOffsetOutsideCrest > bodySpan * 0.18 + 1e-5 || !crestEdge || crestEdge.count !== body.geometry.getAttribute('position')?.count || headBoneScale > 1.39 || groupSize.x / Math.max(groupSize.z, 1e-5) < 2.60 || groupSize.x / Math.max(groupSize.z, 1e-5) > 3.00) throw new Error(`${def.id}: connected crest/head/aspect bounds failed`);
        if (!kaiju || kaiju.plateCount !== crest.plateCount || !Array.isArray(kaiju.plateStations) || kaiju.plateStations.length !== 8 || !kaiju.pulseUniform || draws !== 3) throw new Error(`${def.id}: atomic crest must be a connected 8-plate hull/feature spine, pulsed, and exactly three meshes`);
        if (kaiju.atomicTriangles + kaiju.toothTriangles > 420) throw new Error(`${def.id}: feature triangles ${kaiju.atomicTriangles + kaiju.toothTriangles} exceed the compact kaiju allowance`);
        result.sharkjira = { plates: kaiju.plateCount, draws, featureTriangles: kaiju.atomicTriangles + kaiju.toothTriangles, crestVertices: crest.vertexCount, crestBoundaryEdges: crest.boundaryEdges, crestNormalMinDot: Number(crest.minFaceNormalDot.toFixed(4)), palette: group.userData.rfPaletteRaw };
      }
      if (rig.parts.shell !== null || group.getObjectByName('RF Rev 9b contour shell')) throw new Error(`${def.id}: contour shell survived 9.6 style gate`);
      const allMaterials = [];
      group.traverse((object) => { if (object.isMesh) for (const material of (Array.isArray(object.material) ? object.material : [object.material])) if (material) allMaterials.push(material); });
      if (allMaterials.some((material) => material.type === 'MeshToonMaterial' || material.gradientMap)) throw new Error(`${def.id}: toon material/gradient survived 9.6 style gate`);
      if (def.id === SHARKJIRA_ID) {
        const bodySkinMaterials = allMaterials.filter((material) => material.userData?.rfSharkjiraBody);
        if (bodySkinMaterials.length < 1 || bodySkinMaterials.some((material) => material.transparent || material.opacity !== 1 || !material.depthWrite || material.emissiveIntensity !== 0)) throw new Error(`${def.id}: charcoal body must stay opaque, depth-writing, and non-emissive`);
      }
      const bodyMaterials = Array.isArray(body.material) ? body.material : [body.material];
      if (bodyMaterials.some((material) => material.type !== 'MeshStandardMaterial' || material.flatShading || material.roughness < 0.42 || material.roughness > 0.62)) throw new Error(`${def.id}: smooth Standard specular material gate failed`);
      const target = BASE_LENGTH * clamp(finite(def.sil?.len, 1), 0.5, 3), worldBox = measureBox(group), measured = worldBox.max.x - worldBox.min.x; if (Math.abs(measured - target) > 1e-4) throw new Error(`${def.id}: bbox X ${measured} != ${target}`);
      const material = (Array.isArray(body.material) ? body.material : [body.material]).find((entry) => typeof entry?.onBeforeCompile === 'function'); if (!material || typeof material.customProgramCacheKey !== 'function' || !material.customProgramCacheKey().endsWith(PATTERN_SUFFIX)) throw new Error(`${def.id}: pattern shader hook missing`);
      const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' }; material.onBeforeCompile(shader); for (const uniform of SHADER_UNIFORMS) if (!shader.uniforms[uniform]) throw new Error(`${def.id}: shader uniform ${uniform} missing`);
      rig.animate(0, { speedFrac: 0, turn: 0 });
      const cruiseGape = finite(group.userData.rfJawGape, 0);
      if (group.userData.rfJawMaxRotation > 0 && (cruiseGape < 0.20 || cruiseGape > 0.35)) throw new Error(`${def.id}: cruise jaw gape ${cruiseGape.toFixed(3)} outside 20-35%`);
      rig.animate(0.25, { speedFrac: 1, turn: 0, biting: true, jawOpen: 1, lungeT: 0.2 });
      const biteGape = finite(group.userData.rfJawGape, 0);
      if (group.userData.rfJawMaxRotation > 0 && biteGape < 0.85) throw new Error(`${def.id}: bite jaw snap only reached ${biteGape.toFixed(3)}`);
      if (group.userData.rfPropKind === 'hammer' && finite(group.userData.rfHammerProjectedSpan, 0) < 0.42) throw new Error(`${def.id}: hammer foil span ${group.userData.rfHammerProjectedSpan.toFixed(3)} < 0.42 body length`);
      result.jawGape[def.id] = { cruise: Number(cruiseGape.toFixed(3)), bite: Number(biteGape.toFixed(3)) };
      if (group.userData.rfPropKind === 'hammer') result.hammerSpan[def.id] = Number(group.userData.rfHammerProjectedSpan.toFixed(3));
      if (group.userData.rfPatternId !== patternId(def)) throw new Error(`${def.id}: pattern mapping missing`);
      result.tintSignatures[def.id] = renderedTintSignature(def);
      result.variantSignatures[def.id] = renderedVariantSignature(def);
      result.props[def.id] = group.userData.rfPropKind || null;
      result.checked++; result.baseMap[def.id] = base; result.drawCounts[def.id] = draws; result.lengths[def.id] = Number(measured.toFixed(4));
    }
    if (result.baseMap.goblin !== 'goblinshark' || result.baseMap.gulperfiend !== 'anglerfish' || result.baseMap.reef !== 'sharky') throw new Error('base table did not select sharky/goblinshark/anglerfish as required');
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
    result.notes.push('Rev 11: all 85 definitions have authored bulk, sculpt, face, surface, and signature briefs. Bind-pose positions are baked per definition from Head/Neck/Abdomen/Tail/LowerJaw skin influence, with recomputed smooth normals and no split contour mesh.');
    result.notes.push('Skin3 samples the atlas as luminance/detail, paints explicit top/belly/accent palette regions, and preserves atlas-owned teeth, pupil/cavity, and mouth pixels. Named showcase overrides enforce blue-gray reef, tan striped tiger, slate great-white, and distinct pantheon families.');
    result.notes.push('9.6 gates: MeshStandardMaterial only, smooth normals, roughness 0.50 body specular lighting, no BackSide contour shell, 28% cruise jaw gape with full bite snap, and hammer foil >=0.42 body span.');
    result.notes.push('Rev 10/11 gates: no non-allowlisted prop, every retained prop is head-contact fitted, every act has pairwise-unique signatures, and every same-act pair differs in at least two of silhouette, pattern, hue family, and face attitude. Browser render audit additionally measures pairwise pixel distance from the 85-row contact sheet.');
    result.notes.push('Node selftest parses GLB JSON+BIN directly and intentionally skips image decoding; preload is idempotent and bbox X is measured after the initial posed clip at 96*sil.len.'); result.pass = true;
  } catch (error) { result.errors.push(error?.message || String(error)); result.notes.push(`FAIL ${error?.message || String(error)}`); }
  return result;
}

const Art3D = RF.Art3D || {};
Art3D.buildShark = buildShark; Art3D.preload = preload; Art3D.bendableMaterial = bendableMaterial; Art3D.bendOffset = bendOffset; Art3D.billboard = billboard; Art3D.paletteOf = paletteOf; Art3D.PERSONALITY_TABLE = PERSONALITY_TABLE; Art3D.__selftest = __selftest;
Art3D.stats = () => ({ models: modelCache.size, modelKeys: Array.from(modelCache.keys()), personalityGeometries: personalityGeometryCache.size, billboardMaterials: billboardMaterials.size, preloadError: preloadError?.message || null });
Art3D.releaseShark = () => {};
RF.Art3D = Art3D;
preload();

export { Art3D, PERSONALITY_TABLE, bendableMaterial, bendOffset, billboard, buildShark, paletteOf, preload, __selftest };
export default Art3D;
