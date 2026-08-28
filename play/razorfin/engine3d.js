/* Razorfin - engine3d.js (Lane A3, three.js render layer)
 *
 * Owns: RF.Game, the GGKit boot, the WebGLRenderer + scene + perspective
 * camera, the fixed-step clock, RF.ctx, the floating-stick controls (DOM ring
 * and nub), the player controller (motion, eat resolution, hunger, combo,
 * gold rush, death), the camera follow, the HUD state object handed to
 * RF.UI.hudState(), and pooled 3D score popups.
 *
 * Ported from game.js (the Phaser rev). Every sim rule, constant and payout
 * authority below is the same number that shipped there; only the render
 * layer changed. See SPEC3D.md for the binding contract.
 *
 * Cross-namespace policy (SPEC3D lanes are concurrent): every call into
 * RF.Art3D / RF.World / RF.Fx / RF.Juice / RF.Sound / RF.Music / RF.Abilities
 * / RF.Meta / RF.DevMode / RF.UI is guarded and degrades. No RF.Art3D means a
 * colored capsule mesh; no RF.World means empty water; no RF.UI means quiet
 * no-ops. Input goes exclusively through kit.input subscriptions (never window
 * listeners) per play/_shared/NOTES.md. No setTimeout / setInterval drives
 * game logic; everything schedules off ctx.time.
 */
import * as THREE from 'three';

(function (root) {
  'use strict';

  var RF = root.RF = root.RF || {};
  var RFD = root.RFD || {};

  // ------------------------------------------------------------ constants
  var CSS_W = 844, CSS_H = 390;      // landscape design baseline (CSS px)

  // Own pixel ratio per SPEC3D: min(devicePixelRatio, 3). GGKit.hiDpi.three()
  // is deliberately NOT used - it derives from hiDpi.dpr(), which the
  // 2026-08-17 fleet kill switch holds at 1 and would give a 1x backing store
  // on a retina phone. The three.js layer needs no S() conversion because the
  // renderer owns the density itself; DOM UI is authored in CSS px.
  function computeDpr() {
    var d = (root.devicePixelRatio || 1);
    if (!(typeof d === 'number' && isFinite(d) && d > 0)) d = 1;
    return d < 1 ? 1 : (d > 3 ? 3 : d);
  }
  var DPR = computeDpr();

  var STEP = 1 / 60, MAX_STEPS = 4;
  var TAU = Math.PI * 2;

  // Minor (REVIEW-REV7): world grew to 14400x4800 at Rev 6 (SPEC3D.md:759,
  // world3d.js's WORLD.w/h) - these fallbacks were stale at the old
  // 7200x3600 pre-Rev-6 size. RFD.WORLD is not currently emitted by
  // gen_data.py, so this fallback is what actually runs; keep it matching
  // the landed contract.
  var WORLD_W = (RFD.WORLD && RFD.WORLD.w) || 14400;
  var WORLD_H = (RFD.WORLD && RFD.WORLD.h) || 4800;

  var FRENZY = RFD.FRENZY || {
    comboWindow: 3, steps: [3, 6, 10], mults: [1, 2, 3, 5],
    meterPerEat: 0.06, goldRushDur: 8, goldRushSpeed: 1.4, goldRushCoinMult: 2
  };
  var BAL = RFD.BAL || { metabScale: 0.5, eatHealBonus: 1.25 };
  var FRENZY2 = RFD.FRENZY2 || {
    school: { count: 4, swirlT: 5, eatRate: 1.3 },
    blood: { dur: 6, bite: 1.5, speed: 1.2 },
    golden: { chance: 0.02, coinBurst: 250, deadline: 10 }
  };
  var ECON = RFD.ECONOMY || {};
  var UPEFF = ECON.upgradeEffect || { bite: 0.1, speed: 0.06, boost: 0.12, power: 0.08 };

  // Rev 12 / 12.4: MODES config (Gold Rush as a visible mode, Mega Gold Rush
  // chain, and the new super-size/shield/speed power-up buffs). data.js
  // (gen_data.py) is the source of truth once it lands RFD.MODES; these
  // defaults mirror the landed shape exactly so the game runs identically
  // before/after/without that data (defensive per the Rev 12 lane split).
  var MODES = RFD.MODES || {
    goldRush: {
      dur: 8, coinMult: 2, speedMult: 1.4, invulnerable: true,
      tint: '0xffd400', banner: 'GOLD RUSH!'
    },
    megaGoldRush: {
      dur: 10, coinMult: 3, speedMult: 1.5, invulnerable: true,
      allEdible: true, tint: '0xfff5b0', banner: 'MEGA GOLD RUSH!'
    },
    buffs: {
      supersize: { dur: 10, sizeMult: 1.5, tierBonus: 2, tint: '0xffd400' },
      shield: { dur: 12, hits: 3, tint: '0x27e0ff' },
      speed: { dur: 9, speedMult: 1.5, tint: '0x9dff2b' }
    }
  };
  var MODE_GOLD = MODES.goldRush || {};
  var MODE_MEGA = MODES.megaGoldRush || {};
  var MODE_BUFFS = MODES.buffs || {};
  var SUPERSIZE_CFG = MODE_BUFFS.supersize || { dur: 10, sizeMult: 1.5, tierBonus: 2 };
  var MODE_SHIELD_CFG = MODE_BUFFS.shield || { dur: 12, hits: 3 };
  var MODE_SPEED_CFG = MODE_BUFFS.speed || { dur: 9, speedMult: 1.5 };

  // Rev 6 / 6.6: generosity gate. tier <= p.tier + BITE_UP_BASE + biteUp is
  // eatable at all; tier <= p.tier - 1 swallows instantly (was p.tier - 2).
  // megajaw (6.7) folds into this SAME formula by adding +1 to both numbers
  // while active, rather than forking a second gate.
  var BITE_UP_BASE = 1;
  var MEGAJAW_BITE_UP = 1;      // +1 bite reach while megajaw is active
  var MEGAJAW_INSTANT = 1;      // +1 instant-swallow tier while megajaw is active

  // Rev 6 / 6.7: powerup lifecycle/economy (HM port). Durations and
  // multipliers per the contract; APEX_SURGE stacks overdrive+megajaw for
  // its own shorter window instead of introducing a third gate.
  var BUFF_DUR = {
    overdrive: 8, shield: 0 /* charge count, not a timer */, megajaw: 10,
    magnet: 8, chum: 6, apex: 5
  };
  // Rev 6.11: overdrive is HM's EXACT semantics (game.js :5449-5476), not a
  // flat multiplier - 1.42x target speed reached via an accel/brake approach,
  // not a direct assignment. OVERDRIVE_ACCEL/BRAKE are ported verbatim.
  var OVERDRIVE_SPEED_MULT = 1.42;
  var OVERDRIVE_ACCEL = 860;       // px/s^2 clamp toward the target velocity
  var OVERDRIVE_BRAKE = 8.5;       // idle brake coefficient (HM :5467)
  var SHIELD_CHARGES = 2;
  var MAGNET_RADIUS_MULT = 2.5;
  var APEX_SPAWN_WEIGHT = 'legendary-rare'; // documentation marker only
  // FIX-ROUND-3 item 4: engine-side global cooldown between spawnBuffDrop
  // calls, so a burst of notable kills cannot flood capsules (the world lane
  // separately adds its own live buffpickup concurrency cap).
  var BUFF_DROP_COOLDOWN = 10;

  // Rev 6 / 6.7: superpower charge economy.
  var POWER_CHARGE_START = 3;
  var POWER_CHARGE_CAP = 8;
  var POWER_CHARGE_COMBO_STEP = 8;     // one charge every 8 combo streak

  // Rev 6 / 6.7: double-tap thresholds, ported VERBATIM from horde-meridian
  // game.js :2640-2662 (release() / tryCallAirstrike gate). Any pointer, not
  // just the joystick pointer, and the windows are humane on purpose.
  var DTAP_HOLD_MAX = 400;      // ms: a "tap" held less than this
  var DTAP_MOVE_MAX = 34;       // px: a "tap" moved less than this while held
  var DTAP_GAP_MIN = 40;        // ms: minimum gap between the two taps
  var DTAP_GAP_MAX = 500;       // ms: maximum gap between the two taps
  var DTAP_DIST_MAX = 160;      // px: max distance between the two tap points

  // Frenzy event records are module scratch. World.kill is wrapped once at
  // run-state init, so player swallows can feed this lane without touching the
  // neighbouring stepEat/multiBite blocks. The fixed step only writes numbers.
  var FRENZY_EAT_CAP = 48;
  var FRENZY_EAT_N = 0;
  var FRENZY_EAT_PACK = new Array(FRENZY_EAT_CAP);
  var FRENZY_EAT_BLOOD = new Array(FRENZY_EAT_CAP);
  var FRENZY_EAT_TIER = new Array(FRENZY_EAT_CAP);
  var FRENZY_EAT_COMBO_T = new Array(FRENZY_EAT_CAP);
  // Rev 6 / 6.6: the PREY position at the moment of a blood-trigger kill.
  // Pooled entities recycle, so only numbers are ever stored here.
  var FRENZY_EAT_X = new Array(FRENZY_EAT_CAP);
  var FRENZY_EAT_Y = new Array(FRENZY_EAT_CAP);
  var FRENZY_FX_OPT = { count: 0, speed: 0, angle: 0, up: false, tint: 0, tint2: 0, scale: 1 };
  var FRENZY_GOLD_TINT = 0xffd67a;

  // Blocker 7 (REVIEW-REV7): fixed-shape option records for the per-eat FX
  // calls in swallow(), hoisted to module scratch and overwritten in place
  // every bite instead of allocating fresh objects each call. Field sets
  // mirror exactly what swallow() previously constructed inline.
  var EAT_DEATHBURST_OPT = { count: 0, scale: 1, tint: 0 };
  var EAT_MOTES_OPT = { count: 0, tint: 0 };
  var EAT_GIB_OPT = { count: 0, tint: 0 };
  var EAT_SHOCKWAVE_OPT = { tint: 0, tier: 0 };

  // ------------------------------------------------- controls (Rev 7 / 7.1)
  // Head-drag world-target steering (REPLACES the floating stick). The
  // steering finger's CSS point unprojects through the live camera into a
  // world point (ctl.tx/ty) every fixed step, so zoom/camera pulses never
  // skew it. The shark's HEAD seeks that point: heading eases toward it at a
  // distance-scaled turn rate, speed is proportional to head->finger
  // distance, and release/arrival glides to a stop instead of hard-zeroing.
  var CTL_ACCEL_MULT = 8;        // velocity approach rate = 8*speedCap /s
  var CTL_GLIDE_TAU = 0.18;      // seconds, release/arrival decay time-constant
  var CTL_KEY_TARGET_CSS = 220;  // keyboard virtual target distance, css px
  var TURN_BOOSTA = 2.0;       // still scales the PRESENTATION turnIn signal

  // SPEC3D 8.2 pure-pursuit constants (REPLACES 7.1 head-drag hybrid). The
  // NOSE point (snout tip, p.x + cos(angle)*p.r, p.y + sin(angle)*p.r) is the
  // seek anchor, not body center. Heading turns toward the live finger point
  // continuously at a fixed high rate (no distance scaling, no snap, no
  // recenter) - only the dead zone floor remains, capped at 0.5*noseR so it
  // can never swallow a meaningful drag. Speed ramps smoothly from the dead
  // zone out to CTL_PURSUIT_FULL_CSS, and arrival is a critically-damped
  // spring (PD controller with 2*sqrt(k) damping) so the nose settles at the
  // finger without overshoot/orbit circling.
  var CTL_PURSUIT_TURN_RATE = 18;    // rad/s, >= the 14 rad/s SPEC3D floor
  var CTL_PURSUIT_FULL_CSS = 60;     // full cruise once nose->finger > 60 css px
  var CTL_PURSUIT_DEAD_NOSE_MULT = 0.5; // dead zone cap: 0.5*noseR (css px)
  var CTL_PURSUIT_DEAD_CSS_MAX = 14;   // Rev 9: dead zone never exceeds 14 css px (big sharks/close camera)
  var CTL_ARRIVE_K = 26;             // spring constant, 1/s^2 (critically damped: c = 2*sqrt(k))

  // Rev 13 floating stick (fleet control standard, horde-meridian ring+nub).
  // Owner on the pursuit law: "cannot dive consistently, finger drag does
  // not follow along". Pure pursuit parks the shark UNDER the thumb and a
  // dive needs the finger at the very bottom of a 390px screen, where iOS
  // home-indicator/edge gestures cancel the touch. The stick is RELATIVE:
  // touch-down plants an anchor, anchor->finger is heading + throttle, the
  // anchor recenters when the finger overshoots 1.35x the radius, so a
  // drag anywhere (including a short drag DOWN = dive) drives continuously
  // while held. Keyboard keeps its virtual-target path; the stick feeds the
  // same pursuit law as a far virtual target with a throttle override.
  var CTL_STICK_RADIUS = 62;         // css px, full throttle at ring edge
  var CTL_STICK_RECENTER = 1.35;     // anchor follows once finger > 1.35*radius
  var CTL_STICK_DEAD = 6;            // css px, no heading change inside this
  var CTL_STICK_TARGET_CSS = 400;    // virtual target distance (always cruise, never arrive)

  // ------------------------------------------------------- rig anim
  var TAIL_HZ_IDLE = 2.5, TAIL_HZ_CRUISE = 5.0, TAIL_HZ_BOOST = 8.0;
  // Rev 6 / 6.2: TAIL_AMP_IDLE/TURN are the binding contract values (0.03 /
  // 0.28); TAIL_AMP_CRUISE is this lane's own interpolation target and is not
  // named by the contract, so it is kept but re-based off the new idle floor.
  var TAIL_AMP_IDLE = 0.03, TAIL_AMP_CRUISE = 0.34, TAIL_AMP_TURN = 0.28;
  var PECT_HZ = 1.7;
  var BANK_MAX = 0.18;         // rad, capped body roll into a turn
  var BANK_EASE = 6.0;         // per second approach rate
  var JAW_OPEN = 0.42;         // rad at full bite window (chew, not anticipation)
  var JAW_ANTICIPATE = 0.85;   // 6.5: preyNear gape fraction (was 0.35)
  var IDLE_BOB_HZ = 0.9, IDLE_BOB_PX = 1.6, IDLE_SPEED_F = 0.15;

  // Rev 6 / 6.5: lunge mechanic constants.
  var LUNGE_CONE = 35 * Math.PI / 180;   // +-35 degrees of heading
  var LUNGE_RANGE_MULT = 2.2;            // range = 2.2 * p.r
  var LUNGE_ACCEL_MULT = 2.4;
  var LUNGE_DUR = 0.22;
  var LUNGE_HEADING_BLEND = 0.35;
  var LUNGE_CD = 0.5;             // 6.11: 0.9 -> 0.5s cooldown
  var PREY_NEAR_RANGE_MULT = 2.2;        // 6.2: eatable inside 2.2*mouthR
  var PREY_NEAR_REFRESH = 0.25;          // seconds between presence re-scans
  var JAW_SNAP_T = 0.12;                 // 6.5: snap-close duration on swallow

  // ---- r15 lane JAW: idle + bite cycle, in NORMALIZED gape (0 shut, 1 wide).
  // These are the brief's numbers. They are normalized rather than radians
  // because the actual hinge travel differs per bake (measured per row by
  // rig_morph's applyRestGape); the rig scales this 0..1 by its own travel.
  var JAW_REST = 0.15;          // rest gape, mid of the 12-18% band
  var JAW_BREATHE_HZ = 0.6;     // slow idle breathing
  var JAW_BREATHE_AMP = 0.04;   // +-4%
  var JAW_IDLE_EASE = 9;        // per-second approach back onto the idle curve
  var JAW_BITE_OPEN = 0.35;     // snap-open target
  var JAW_BITE_CLOSE = 0.01;    // teeth met (0-2%)
  var JAW_T_OPEN = 0.060;       // 60 ms open
  var JAW_T_CLOSE = 0.090;      // 90 ms close
  var JAW_T_HOLD = 0.080;       // 80 ms shut
  var JAW_T_BACK = 0.200;       // 200 ms back to rest
  var TOO_BIG_CD = 0.6;                  // 6.6: TOO BIG cue cooldown

  // The sim and the 3D shark rig share one length authority. shark3d.js
  // authors its mesh around a 96px consumer target; this lane raises the
  // player target to 124px and exposes the ratio for world3d NPC consumers.
  var SHARK_LEN_PX = 124;
  var LEN_SCALE = SHARK_LEN_PX / 96;

  // ------------------------------------------------- camera (SPEC3D Rev 6 / 6.1)
  // World coords (x right 0..14400, y DOWN 0..4800 per the Rev 6 world grow,
  // SPEC3D.md:759); the mapping into three is (x, -y, z) with the gameplay
  // plane at z = 0, lookAt z = 0 ALWAYS (plane readability is law per 6.1).
  var CAM_FOV = 50;                 // SPEC3D space contract
  // Rev 6 dolly is LENGTH-PROPORTIONAL, not tiered: z = renderedLenPx * 1.60,
  // clamped [185..400]. camZForTier(tier) is kept EXPORTED (name stays, per
  // the contract) but now delegates to camZForLen so every existing caller
  // (startRun) still works unchanged.
  // Rev 9.6 (HSE framing law): shark ~25-35% of screen width at cruise.
  // Rev 12 / 12.5 dollied OUT to 2.2 so the biggest rows still fit, which
  // cost the framing: at 2.2 the roster measured 0.209-0.246 of viewport
  // width, and the tier-5 great white rendered at 0.221 - roughly 8% of the
  // 844px CSS viewport once the 3/4 pitch foreshortening is taken off. The
  // reference bar (Hungry Shark Evolution) frames its player at 25-35%.
  //
  // Rev 14 pulls the dolly back IN. The framing fraction is
  //   frac = lenPx / (CAM_FRAME_TAN2 * z),  z = lenPx * CAM_Z_LEN_MULT
  // so inside the clamp band the lenPx cancels and frac = 1/(TAN2 * mult) -
  // one constant fraction for EVERY tier, which is exactly the property the
  // roster needs when sil.len spans 0.85..2.4. Solving for the middle of the
  // 28-32% target with TAN2 = 2.0183 gives mult = 1/(2.0183*0.30) = 1.6516;
  // 1.65 lands the whole roster at 0.3003.
  //
  // The clamps are then set so they CANNOT bind anywhere on the roster
  // (shortest row 105.4px -> z 173.9, longest 297.6px -> z 491.0). A binding
  // clamp is what breaks the constant-fraction property, because a clamped
  // row keeps its length while its z stops tracking - that is how the old
  // 250 floor pushed the small rows down to 0.209 while the big ones sat at
  // 0.246. 170/500 leaves headroom at both ends without touching any row.
  var CAM_Z_LEN_MULT = 1.65;
  var CAM_Z_MIN = 170, CAM_Z_MAX = 500;
  var CAM_Z = CAM_Z_MAX;             // live value, set per run from shark length
  function camZForLen(lenPx) {
    var l = num(lenPx, SHARK_LEN_PX);
    return clamp(l * CAM_Z_LEN_MULT, CAM_Z_MIN, CAM_Z_MAX);
  }
  function camZForTier(tier) {
    // SUPERSEDED naming only: Rev 6 dolly is length-proportional. Tier is
    // resolved to its def's rendered length so every existing call site
    // (startRun passes a sharkId's def) keeps behaving, just off the new law.
    var t = num(tier, 1);
    var def = null;
    var list = RFD.SHARKS || [];
    for (var i = 0; i < list.length; i++) {
      if (num(list[i] && list[i].tier, 0) === t) { def = list[i]; break; }
    }
    return camZForLen(def ? sharkLenPx(def) : SHARK_LEN_PX);
  }
  // Three's Y axis is UP while the sim's Y axis is DOWN. A positive sim-space
  // pitch therefore subtracts from the mapped camera Y. Rev 6: pitch/look are
  // FRACTIONS of the live dolly z (0.17z / 0.07z), so framing stays consistent
  // across the whole length-proportional dolly range instead of a fixed px offset.
  var CAM_PITCH_FRAC = 0.17;
  var CAM_LOOK_FRAC = 0.07;
  var CAM_BOB = 3;                   // Rev 6: 3-unit vertical framing drift
  var CAM_BOB_HZ = 0.08;
  var CAM_PULSE_EASE = 12;           // per-second approach for cinematic zoom
  var CAM_EAT_ZOOM = -0.08;          // 8% push-in at a combo threshold
  var CAM_EAT_ZOOM_T = 0.4;
  var CAM_DEATH_PULL = 0.10;         // 10% pull-back during the death beat
  var CAM_DEATH_PULL_T = 1.2;
  var CAM_BLOOD_PUSH = -0.06;        // optional blood-frenzy push-in
  var CAM_FOV_SPAN = 6;             // mild FOV ease with speed (deg)
  var CAM_FOV_EASE = 2.2;           // per second approach
  var CAM_LOOKAHEAD = 0.34;         // Rev 6: 0.34s capped 150px (was 0.28s/190px)
  var CAM_LOOKAHEAD_MAX = 150;
  var CAM_FOLLOW = 6.0;             // per second approach on position
  var CAM_NEAR = 1, CAM_FAR = 4200;
  // Rev 6 yaw orbit hint: camState.yaw eases toward headingSign*0.13rad*speedFrac
  // at 2.5/s, applied to camera POSITION only (never lookAt). Quarter-view
  // hint, not a chase cam.
  var CAM_YAW_MAX = 0.13;
  var CAM_YAW_EASE = 2.5;
  // Framing accept band per 6.1: rendered shark length should read as roughly
  // this fraction of frame WIDTH. The camera's vertical FOV projects a
  // horizontal extent of 2*z*tan(fov/2)*aspect at the gameplay plane
  // (aspect = CSS_W/CSS_H, since PerspectiveCamera.fov is the vertical angle
  // and horizontal follows from the aspect ratio) - 2.018 is that constant
  // precomputed for fov=50 at the 844x390 design baseline.
  var CAM_FRAME_TAN2 = 2 * Math.tan((CAM_FOV * Math.PI / 180) / 2) * (CSS_W / CSS_H);

  // ------------------------------------------------------------- helpers
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, dflt) { return (typeof v === 'number' && isFinite(v)) ? v : dflt; }
  function damp(rate, dt) { return clamp(rate * dt, 0, 1); }

  function sharkLenPx(def) {
    return SHARK_LEN_PX * num(def && def.sil && def.sil.len, 1);
  }
  function mouthRadiusForLen(lenPx) {
    // Keep the original proportion and guard both small and future large
    // roster rows. Rev 12 / 12.5 raises sil.len as high as 2.6 (124*2.6*0.22
    // = ~70.9px), so the upper clamp widens to 100 to keep headroom above
    // that ceiling instead of sitting right against it.
    return clamp(lenPx * 0.22, 14, 100);
  }

  function triggerCamPulse(amount, duration) {
    camState.pulse = num(amount, 0);
    camState.pulseT = Math.max(0, num(duration, 0));
  }

  function stepCameraZoom(dt) {
    var d = clamp(num(dt, 0), 0, 0.1);
    if (camState.pulseT > 0) {
      camState.pulseT -= d;
      if (camState.pulseT <= 0) {
        camState.pulseT = 0;
        camState.pulse = 0;
      }
    }
    var target = camState.pulseT > 0 ? camState.pulse : 0;
    var blood = ctx && ctx.run && ctx.run.blood;
    if (blood && num(blood.t, 0) > 0) target += CAM_BLOOD_PUSH;
    camState.zoom += (target - camState.zoom) * damp(CAM_PULSE_EASE, d);
    if (target === 0 && Math.abs(camState.zoom) < 0.0001) camState.zoom = 0;
    return Math.max(CAM_NEAR, CAM_Z * (1 + camState.zoom));
  }

  function cameraBobAt(time) {
    return Math.sin(num(time, 0) * TAU * CAM_BOB_HZ) * CAM_BOB;
  }

  // mulberry32: deterministic, no Math.random anywhere in sim code.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Shortest signed angular delta, used by the steering integrator.
  function angDelta(from, to) {
    var d = (to - from) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  function sharkById(id) {
    if (RFD.SHARK_BY_ID && RFD.SHARK_BY_ID[id]) return RFD.SHARK_BY_ID[id];
    var list = RFD.SHARKS || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0] || null;
  }
  function creatureById(id) {
    if (RFD.CREATURE_BY_ID && RFD.CREATURE_BY_ID[id]) return RFD.CREATURE_BY_ID[id];
    var all = (RFD.CREATURES || []).concat(RFD.HAZARDS || []);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }
  function zoneAtFallback(y) {
    var zones = RFD.ZONES || [];
    for (var i = 0; i < zones.length; i++) {
      if (y >= zones[i].yMin && y < zones[i].yMax) return zones[i];
    }
    return zones[zones.length - 1] || null;
  }
  // data.js writes some colors as '0x1b4d66' strings; normalise to a number.
  function hexNum(v, dflt) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string') {
      var n = parseInt(v, 16);
      if (isFinite(n)) return n;
    }
    return dflt;
  }

  // --------------------------------------------------------- guard shims
  var warned = {};
  function warnOnce(tag, err) {
    if (warned[tag]) return;
    warned[tag] = true;
    if (root.console && console.error) console.error('[Razorfin] ' + tag + ' threw', err);
  }
  // Returns the number of particles the FX lane actually emitted, so a caller
  // can fall back to an older effect family when a newer pool is absent.
  function fxEmit(name, x, y, opts) {
    if (RF.Fx && RF.Fx.emit) {
      try { return num(RF.Fx.emit(name, x, y, opts), 0); } catch (e) { warnOnce('Fx.emit', e); }
    }
    return 0;
  }
  function sfx(name, opts) {
    if (RF.Sound && RF.Sound.play) { try { RF.Sound.play(name, opts); } catch (e) { warnOnce('Sound.play', e); } }
  }
  function musicLayer(layer) {
    if (RF.Music && RF.Music.setLayer) { try { RF.Music.setLayer(layer); } catch (e) { warnOnce('Music.setLayer', e); } }
  }
  function hitStop(ms) {
    if (RF.Juice && RF.Juice.hitStop) { try { RF.Juice.hitStop(ms); } catch (e) { warnOnce('Juice.hitStop', e); } }
  }
  function shake(mag, ms) {
    if (RF.Juice && RF.Juice.shake) { try { RF.Juice.shake(mag, ms); } catch (e) { warnOnce('Juice.shake', e); } }
  }
  function consumeFreeze() {
    if (RF.Juice && RF.Juice.consumeFreeze) {
      try { var v = RF.Juice.consumeFreeze(); return (typeof v === 'number' && isFinite(v) && v > 0) ? v : 0; }
      catch (e) { warnOnce('Juice.consumeFreeze', e); }
    }
    return 0;
  }
  function abilitiesReset() {
    if (RF.Abilities && RF.Abilities.reset) {
      try { RF.Abilities.reset(ctx); } catch (e) { warnOnce('Abilities.reset', e); }
    }
  }
  // Lane C3's DOM UI. Absent lane = console-quiet no-op, per the brief.
  function ui() { return RF.UI || null; }
  function uiCall(fn, a, b) {
    var u = ui();
    if (!u || typeof u[fn] !== 'function') return null;
    try { return u[fn](a, b); } catch (e) { warnOnce('UI.' + fn, e); return null; }
  }
  // Blocker 1 (REVIEW-REV7): the single call-site wrapper every mission
  // producer below goes through. Guarded against an absent RF.Meta; forwards
  // every completed id's mission name to the UI mission-tick channel
  // (RF.UI.missionTick, per NOTES-rev7-laneS4.md) via the existing chip/toast
  // slot - no new persistent UI element.
  function missionEvent(type, payload) {
    if (!RF.Meta || !RF.Meta.missionEvent) return;
    var done;
    try { done = RF.Meta.missionEvent(ctx, type, payload); } catch (e) { warnOnce('Meta.missionEvent', e); return; }
    if (!done || !done.length) return;
    for (var i = 0; i < done.length; i++) {
      var name = null;
      try {
        if (RFD.MISSIONS) {
          for (var j = 0; j < RFD.MISSIONS.length; j++) {
            if (RFD.MISSIONS[j].id === done[i]) { name = RFD.MISSIONS[j].name; break; }
          }
        }
      } catch (e) {}
      uiCall('missionTick', (name || 'Mission') + ' complete!');
    }
  }
  function ggkit() { return root.GGKit || null; }
  function boundedPush(arr, item, cap) {
    var g = ggkit();
    if (g && g.boundedPush) { try { return g.boundedPush(arr, item, cap); } catch (e) { warnOnce('boundedPush', e); } }
    arr.push(item);
    while (arr.length > cap) arr.shift();
    return arr;
  }

  // Passive struct resolution (verbatim port). abilities.js owns the real one;
  // without it a struct is synthesised from the shark row's passives array so
  // biteUp / wideBite / slowMetab still behave.
  var NO_PASSIVES_KEYS = null;   // documentation marker; shape below
  function resolvePassives(def) {
    var p = null;
    if (RF.Abilities && RF.Abilities.passives) {
      try { p = RF.Abilities.passives(def); } catch (e) { warnOnce('Abilities.passives', e); p = null; }
    }
    if (!p || typeof p !== 'object') {
      var list = (def && def.passives) || [];
      p = {
        wideBite: list.indexOf('wideBite') >= 0,
        lunge: list.indexOf('lunge') >= 0 || list.indexOf('lungeMega') >= 0,
        biteUp: list.indexOf('biteUpX') >= 0 ? 2 : (list.indexOf('biteUp') >= 0 ? 1 : 0),
        filterFeed: list.indexOf('filterFeed') >= 0 || list.indexOf('filterFeedMax') >= 0,
        ambush: list.indexOf('ambush') >= 0,
        slowMetab: list.indexOf('slowMetab') >= 0 || list.indexOf('slowMetabX') >= 0,
        slowMetabMult: list.indexOf('slowMetabX') >= 0 ? 0.5 : (list.indexOf('slowMetab') >= 0 ? 0.75 : 1),
        junkEater: list.indexOf('junkEater') >= 0,
        pressureImmune: list.indexOf('pressureImmune') >= 0,
        armored: list.indexOf('armored') >= 0,
        coinMagnet: list.indexOf('coinMagnet') >= 0,
        fireWake: list.indexOf('fireWake') >= 0 || list.indexOf('fireWakeX') >= 0,
        dreadAura: list.indexOf('dreadAura') >= 0 || list.indexOf('dreadAuraX') >= 0,
        undying: list.indexOf('undying') >= 0
      };
    }
    var mult = p.mult && typeof p.mult === 'object' ? p.mult : {};
    var sm = p.statMults && typeof p.statMults === 'object' ? p.statMults : {};
    var metab = num(sm.metab, num(p.metabMult, num(p.slowMetabMult,
      (typeof p.slowMetab === 'number' && isFinite(p.slowMetab)) ? p.slowMetab : 1)));
    p.mult = {
      speed: num(sm.speed, num(mult.speed, 1)), accel: num(mult.accel, 1),
      turn: num(mult.turn, 1), bite: num(sm.bite, num(mult.bite, 1)),
      hp: num(sm.hp, num(mult.hp, 1)), boost: num(sm.boost, num(mult.boost, 1)),
      metab: metab > 0 ? metab : 1
    };
    p.biteUp = num(p.biteUp, 0);
    return p;
  }

  // RF-PASSIVE-01: abilities.js recomputes LIVE stat multipliers every step and
  // publishes them on player.st.statMults. p.pas.mult is only the boot-time
  // snapshot, so consuming it alone freezes zone/combo power at level 1.
  function liveMult(p, key) {
    var st = p && p.st;
    var live = st && st.statMults;
    if (live && typeof live === 'object') {
      var v = live[key];
      if (typeof v === 'number' && isFinite(v) && v > 0) return v;
    }
    var snap = p && p.pas && p.pas.mult;
    return num(snap && snap[key], 1);
  }

  // --------------------------------------------------------------- state
  var kit = null;
  var ctx = null;
  var profile = null;
  var selectedSharkId = 'reef';
  var runCount = 0;

  var renderer = null, scene3 = null, camera = null, canvasEl = null;
  var hemi = null, sun = null;
  var stickEls = null;              // { ring, nub, root }
  var popPool = null;               // pooled 3D score sprites
  var running = false;              // an Ocean run is live
  var rafId = 0;
  var subs = [];
  var lastNow = 0;
  var acc = 0, freezeMs = 0;
  var dying = false, pendingResults = false, deathAt = 0;
  var musicState = 'calm';
  var comboQueue = [];
  // Camera motion scratch. Pulse fields are reused for the whole run; no
  // transient object is created by combo/death/blood camera presentation.
  var camState = { x: 0, y: 0, fov: CAM_FOV, zoom: 0, pulse: 0, pulseT: 0, yaw: 0 };
  var zoneState = { fog: 0x9fd4e8, density: 0.00042, tint: 0x1b4d66 };
  // Blocker 1: cumulative per-zone survive time this run, reported to
  // missionEvent('zoneTime', ...) once per second (not per fixed step -
  // missionEvent's zoneTime progress is max()'d, so a coarser cadence is
  // safe and cheaper). Keyed by zone id; reset implicitly by a fresh run's
  // buildContext() replacing ctx.run (this module-scratch accumulator map is
  // cleared explicitly in startRun below).
  var zoneTimeAcc = {};
  var zoneTimeReportAt = 0;

  // ATMO-01 / Rev 2: the light + renderer handles this engine creates once and
  // lends to the atmosphere owner (world3d.js). Pre-allocated module scratch,
  // handed over by reference; never rebuilt per frame, never re-created per run.
  var LIGHTS = { hemi: null, sun: null, scene: null, renderer: null };
  // Rev 15: engine-owned only. Never handed to world3d, so they stay neutral.
  var fillLight = null, rimLight = null;
  var envRT = null, envPMREM = null;
  // Volumetric shark read: keep the boot rig's ambient fill restrained while
  // the upper-front-left key carries the directional form. These are exported
  // below so the headless gate cannot silently drift from the live rig.
  //
  // REV 15 LIGHT LANE. The Rev 14 rig lit the shark DARKER than the water it
  // swam in: the r15 pixel gate measured a shark/water median luminance ratio
  // of 0.40 near the surface and 0.45 in the abyss, i.e. the subject was two
  // and a half times darker than its own background, with a mean shark RGB of
  // [45,97,88] -- a green-cyan cast with the red channel at less than half of
  // green. That is the whole of the owner's "ghost-pale, zero contrast,
  // everything dragged to cyan" verdict, and later "Avatar hybrid nonsense".
  //
  // Three separate causes, all addressed here:
  //
  //  1. THE HEMISPHERE WAS THE WATER. world3d.js (the atmosphere owner) writes
  //     the hemisphere sky colour to the zone TINT every frame, so the single
  //     largest contributor to the shark's diffuse was saturated water colour.
  //     A subject lit by its own background cannot separate from it at any
  //     exposure. The fix is the sky/key split below: world3d keeps driving an
  //     ambient that legitimately belongs to the water, but it is handed a
  //     restrained one, and the FORM now comes from a neutral key that
  //     world3d does not own and cannot tint.
  //
  //  2. THERE WAS NO ENVIRONMENT. Every shark body is MeshStandardMaterial at
  //     roughness 0.30-0.50 with a wet-specular shader injection, but with
  //     scene.environment null the only specular term in the frame was a
  //     single directional lobe. A PBR material with nothing to reflect reads
  //     as flat paint, which is exactly what the screenshot showed. A PMREM of
  //     a cheap procedural sky/water gradient (built once, 8ms, no addon
  //     dependency) gives every roughness value something to return.
  //
  //  3. THE KEY WAS TOO WEAK AND THE EXPOSURE ABSORBED IT. ACES rolls the top
  //     end off hard; 1.25 of directional under a 1.15 hemisphere never
  //     reached the shoulder, so no highlight ever formed.
  //
  // OWNER OVERRIDE (r15): "just make them look like sharks" -- natural
  // sunlight through water. So: the key is white-warm DAYLIGHT and the rim is
  // NEUTRAL WHITE. No coloured key, no cyan/purple/teal ambient, no
  // bioluminescent tinting anywhere in this rig. A great white must read grey
  // on top and white on the belly with one clean sun highlight, like a nature
  // documentary still. The only chroma this rig emits is the faint warmth of
  // sunlight and the faint blue of skylight -- both of which real daylight has.
  var LIGHT_RIG = {
    // Ambient handed to world3d. Deliberately LOW: this is the term world3d
    // paints with the zone's water colour, so every unit of it is a unit of
    // cyan on the shark. It is now a floor that keeps shadow sides from going
    // black, not the main source it used to be.
    hemiIntensity: 0.30,
    // The key. Neutral daylight, and strong enough to clear the ACES shoulder
    // so a real specular hotspot forms on a roughness-0.40 hide.
    sunIntensity: 3.10,
    // Above and in front, camera-left. Positive Z is toward the camera, so
    // this is a classic over-the-shoulder key that rakes the dorsal surface
    // and leaves the belly to the fill.
    sunX: -120,
    sunY: 260,
    sunZ: 420,
    // Sunlight colour. Warm-neutral daylight, NOT cyan. Fixed here and
    // re-asserted every frame so no other lane can drag it to water colour.
    sunColor: 0xfff6ec,

    // ---- lights below are created and owned entirely by this lane ----
    // world3d.js only ever receives hemi + sun, so nothing else in the game
    // can retint these. They are what actually holds the shark's form.

    // Cool sky fill from above-behind-right, opposite the key. "Cool" here
    // means the pale blue of open sky, which is what genuinely fills a
    // shadow side outdoors -- it is not a teal gel.
    fillColor: 0xdfe9f5,
    fillIntensity: 0.85,
    fillX: 300, fillY: 180, fillZ: -160,

    // Rim / kicker from behind and above, to separate the dorsal edge from
    // the water. NEUTRAL WHITE per the owner override.
    rimColor: 0xffffff,
    rimIntensity: 1.55,
    rimX: 60, rimY: 340, rimZ: -430,

    // Environment (PMREM) strength. Drives specular response only.
    envIntensity: 0.85,
    // ACES exposure. Lowered from 1.06 because the rig below puts far more
    // light into the scene; the shark gains contrast from the key/fill ratio
    // now, not from a hot global exposure that also blows out the water.
    exposure: 0.92
  };

  // Pre-allocated scratch. step() must never allocate.
  var EAT_BUF = new Array(96);
  var MOUTH = { x: 0, y: 0, r: 0, strength: 260, eligibleTierMax: 0 };
  var CHEW_FX_OPT = { count: 6 };
  var CHEW_SFX_OPT = { rate: 1 };
  var FX_OPT = { count: 0, speed: 0, angle: 0, up: false };
  var HUD_STATE = {
    name: '', hp: 0, hpFrac: 0, maxHp: 0, boost: 1, boosting: false,
    power: 0, powerReady: false, powerId: null, powerTint: 0,
    coins: 0, score: 0, combo: 0, comboMult: 1, frenzy: 0, goldRush: 0,
    // Rev 12 / 12.4: mode banner name + chained mega-meter fill (0..1).
    mode: '', megaMeter: 0,
    hurt: 0, tier: 1, zone: '', dev: false, chips: null,
    // Rev 6 / 6.7: powerup buff timers + charge count, reused object so the
    // HUD lane can read it every frame without a new allocation.
    powerCharges: 0, powerChargeCap: 0,
    buffs: { overdrive: 0, shield: 0, megajaw: 0, magnet: 0, chum: 0, apex: 0,
             supersize: 0, modeShield: 0, modeSpeed: 0 },
    // ui3d minimap + buff bars: player position and remaining-fraction list
    // (reused array, fractions 0..1, active buffs only).
    px: 0, py: 0, buffTimers: []
  };
  HUD_STATE.chips = comboQueue;

  // Opt-in browser gate for the resource half of LIFE-01. Node can prove
  // scene teardown but has no GL driver, so this sampler is intentionally
  // exposed for a real 844x390 run. The first sample warms persistent caches;
  // samples after the second must remain identical across run boundaries.
  function sameResourceSnapshot(a, b) {
    return !!(a && b && a.children === b.children && a.geometries === b.geometries &&
      a.textures === b.textures && a.programs === b.programs);
  }
  var RESOURCE_GATE = {
    rows: [], baseline: null, pass: true,
    reset: function () {
      this.rows.length = 0;
      this.baseline = null;
      this.pass = true;
      return this;
    },
    snapshot: function () {
      var info = renderer && renderer.info;
      var memory = info && info.memory;
      var programs = info && info.programs;
      if (!scene3 || !info || !memory || !programs) return null;
      return {
        children: scene3.children && typeof scene3.children.length === 'number'
          ? scene3.children.length : 0,
        geometries: typeof memory.geometries === 'number' ? memory.geometries : 0,
        textures: typeof memory.textures === 'number' ? memory.textures : 0,
        programs: typeof programs.length === 'number' ? programs.length : 0,
      };
    },
    sample: function () {
      var row = this.snapshot();
      if (!row) return null;
      this.rows.push(row);
      if (this.rows.length === 2) this.baseline = row;
      else if (this.rows.length > 2 && !sameResourceSnapshot(row, this.baseline)) this.pass = false;
      return row;
    },
    report: function () {
      return { pass: this.rows.length >= 3 && this.pass, rows: this.rows.slice(), baseline: this.baseline };
    },
  };

  // ------------------------------------------------------- save handling
  function validateSave(obj) {
    var fn = RF.Meta && (RF.Meta.validateSave || RF.Meta.validate);
    if (fn) {
      try { return !!fn(obj); } catch (e) { warnOnce('Meta.validateSave', e); }
    }
    return !!obj && typeof obj === 'object' && !Array.isArray(obj);
  }
  function fallbackProfile() {
    return {
      v: RFD.SAVE_VERSION || 1, coins: 0, xp: 0, level: 1,
      selected: 'reef',
      sharks: { reef: { owned: true, up: { bite: 0, speed: 0, boost: 0, power: 0 } } },
      best: { score: 0, biggestTier: 0 },
      runs: 0, tutorialDone: false, lastBonusDay: null
    };
  }
  function loadProfile() {
    if (RF.Meta && RF.Meta.load) {
      try {
        var p = RF.Meta.load(kit);
        if (p && typeof p === 'object') return p;
      } catch (e) { warnOnce('Meta.load', e); }
    }
    var stored = kit.save.get(null);
    var base = fallbackProfile();
    if (stored && typeof stored === 'object') {
      var merged = {};
      for (var k in base) merged[k] = base[k];
      for (var j in stored) merged[j] = stored[j];
      if (!merged.sharks || typeof merged.sharks !== 'object') merged.sharks = base.sharks;
      if (!merged.sharks.reef) merged.sharks.reef = base.sharks.reef;
      if (!merged.best || typeof merged.best !== 'object') merged.best = base.best;
      if (typeof merged.selected !== 'string') merged.selected = 'reef';
      return merged;
    }
    return base;
  }
  function commitProfile() {
    if (RF.Meta && RF.Meta.commit) {
      try { RF.Meta.commit(kit, profile); return; } catch (e) { warnOnce('Meta.commit', e); }
    }
    try { kit.save.set(profile); } catch (e) { warnOnce('save.set', e); }
  }
  function ownedFor(id) {
    if (RF.Meta && RF.Meta.ownedFor) {
      try { return !!RF.Meta.ownedFor(profile, id); } catch (e) { warnOnce('Meta.ownedFor', e); }
    }
    if (RF.DevMode && RF.DevMode.state && RF.DevMode.state.forceUnlockAll) return true;
    var row = profile && profile.sharks && profile.sharks[id];
    return !!(row && row.owned);
  }
  // RF-PROFILE-01: upgrade levels live on the persisted row sharks[id].up.
  function upgradeLevel(sharkId, track) {
    var cap = num(ECON.upgradeCosts && ECON.upgradeCosts.levels, 5);
    if (RF.Meta && RF.Meta.upLevel) {
      try { return clamp(num(RF.Meta.upLevel(profile, sharkId, track), 0), 0, cap); }
      catch (e) { warnOnce('Meta.upLevel', e); }
    }
    var row = profile && profile.sharks && profile.sharks[sharkId];
    var up = row && row.up;
    if (!up) return 0;
    return clamp(num(up[track], 0), 0, cap);
  }
  // The shark the run should launch with. meta.js owns the dev-overlay rule
  // (NOTES-laneC: RF.Meta.activeShark is the accessor, never profile.selected
  // alone, because the non-persisted dev pick layers on top of it).
  function activeSharkId() {
    if (RF.Meta && RF.Meta.activeShark) {
      try {
        var id = RF.Meta.activeShark(profile);
        if (id && sharkById(id)) return id;
      } catch (e) { warnOnce('Meta.activeShark', e); }
    }
    var sel = profile && profile.selected;
    if (sel && sharkById(sel) && ownedFor(sel)) return sel;
    return 'reef';
  }

  // Rev 12 / 12.1: resolve this run's level id. meta.js (save schema v3) owns
  // profile.selectedLevel + unlock state; this only READS it, defaulting to
  // 'hawaii' whenever meta.js, RFD.LEVEL_BY_ID, or the saved selection is
  // absent/unrecognised - the game must run identically before/without the
  // Rev 12 data/meta lanes landing.
  function activeLevelId() {
    var sel = profile && profile.selectedLevel;
    if (sel && RFD.LEVEL_BY_ID && RFD.LEVEL_BY_ID[sel]) return sel;
    if (RFD.LEVELS && RFD.LEVELS.length && RFD.LEVELS[0] && RFD.LEVELS[0].id) {
      return RFD.LEVELS[0].id;
    }
    return 'hawaii';
  }
  // NOTES-laneC: displayCoins() is persisted + the non-persisted dev overlay,
  // and is the number any coin readout must show.
  function displayCoins() {
    if (RF.Meta && RF.Meta.displayCoins) {
      try { return num(RF.Meta.displayCoins(profile), 0); } catch (e) { warnOnce('Meta.displayCoins', e); }
    }
    return num(profile && profile.coins, 0);
  }

  // ==================================================== renderer + scene
  function buildRenderer() {
    var doc = root.document;
    if (!doc) return false;
    var host = doc.getElementById('game-root') || doc.body;
    canvasEl = doc.getElementById('rf-stage');
    if (!canvasEl) {
      canvasEl = doc.createElement('canvas');
      canvasEl.id = 'rf-stage';
      canvasEl.style.cssText = 'display:block;touch-action:none;width:100%;height:100%;';
      host.appendChild(canvasEl);
    }
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvasEl, antialias: true, powerPreference: 'high-performance'
      });
    } catch (e) {
      warnOnce('WebGLRenderer', e);
      return false;
    }
    // SPEC3D: own pixel ratio, min(dpr, 3). The hiDpi kill switch does not
    // apply to the three layer.
    renderer.setPixelRatio(DPR);
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = LIGHT_RIG.exposure;

    scene3 = new THREE.Scene();
    scene3.background = new THREE.Color(zoneState.tint);
    scene3.fog = new THREE.FogExp2(zoneState.fog, zoneState.density);

    // SPEC3D lighting: hemisphere (sky / deep) plus a directional sun from
    // above-front. No shadow maps - the perf budget does not carry them.
    //
    // ATMO-01 / Rev 2: the lights are created ONCE here and never mutated by
    // this module again. world3d.js is the atmosphere owner and lerps their
    // color/intensity inside applyZoneAtmo(); it receives the references
    // through ctx.lights (read at World.init) and through the explicit
    // RF.World.setLights() setter below, whichever that lane implements.
    hemi = new THREE.HemisphereLight(0x9fd4e8, 0x06121e, LIGHT_RIG.hemiIntensity);
    scene3.add(hemi);
    sun = new THREE.DirectionalLight(LIGHT_RIG.sunColor, LIGHT_RIG.sunIntensity);
    sun.position.set(LIGHT_RIG.sunX, LIGHT_RIG.sunY, LIGHT_RIG.sunZ);
    sun.castShadow = false;
    scene3.add(sun);
    LIGHTS.hemi = hemi;
    LIGHTS.sun = sun;

    // REV 15: fill + rim. These are NOT handed to world3d (LIGHTS carries only
    // hemi and sun, and World.setLights reads only those two keys), so the
    // atmosphere owner cannot retint them at depth. They are the reason the
    // shark keeps a neutral, three-dimensional read in a saturated blue zone
    // instead of dissolving into it.
    //
    // No shadow maps on any of them -- the perf budget is unchanged, and the
    // r15 brief holds the FPS budget fixed. Two extra directional lights cost
    // two more lobes in the same forward pass, no additional render targets
    // and no additional draw calls.
    fillLight = new THREE.DirectionalLight(LIGHT_RIG.fillColor, LIGHT_RIG.fillIntensity);
    fillLight.position.set(LIGHT_RIG.fillX, LIGHT_RIG.fillY, LIGHT_RIG.fillZ);
    fillLight.castShadow = false;
    scene3.add(fillLight);

    rimLight = new THREE.DirectionalLight(LIGHT_RIG.rimColor, LIGHT_RIG.rimIntensity);
    rimLight.position.set(LIGHT_RIG.rimX, LIGHT_RIG.rimY, LIGHT_RIG.rimZ);
    rimLight.castShadow = false;
    scene3.add(rimLight);

    // Specular environment. Without this every MeshStandardMaterial in the
    // game has nothing to reflect and reads as flat paint (see LIGHT_RIG).
    buildEnvironment();
    LIGHTS.scene = scene3;
    LIGHTS.renderer = renderer;

    camera = new THREE.PerspectiveCamera(CAM_FOV, 1, CAM_NEAR, CAM_FAR);
    camera.position.set(0, 0, CAM_Z);
    resize();
    return true;
  }

  // ------------------------------------------------- REV 15 environment map
  //
  // WHY THIS EXISTS: every shark body is MeshStandardMaterial. A PBR material
  // computes its specular from (a) punctual lights and (b) scene.environment.
  // With environment null, (b) is zero, so a roughness-0.40 wet hide had
  // exactly one specular lobe in the entire frame and read as flat paint --
  // the "no specular" half of the owner's verdict.
  //
  // WHY NOT RoomEnvironment: that is a three.js ADDON, and the shared build at
  // /play/_shared/three/ ships only the core module (plus GLTF/OBJ/MTL
  // loaders). Rather than add a dependency, this paints the gradient that
  // actually belongs here -- bright sky above, mid water at the horizon, dark
  // water below, which is what an underwater subject genuinely sees -- into a
  // small canvas and lets PMREMGenerator convolve it.
  //
  // COST: one 256x128 canvas fill and one PMREM pass, ONCE at boot. No
  // per-frame work, no extra render pass, no shadow maps. The FPS budget is
  // untouched.
  //
  // COLOUR (owner override): this gradient is NEUTRAL DAYLIGHT -- warm-white
  // sky, desaturated blue-grey water. It is deliberately far less saturated
  // than the zone fog, because whatever chroma goes in here comes back out on
  // every wet highlight in the game. A saturated environment is how a shark
  // ends up looking like it is lit by a nightclub.
  function buildEnvironment() {
    if (!renderer || !scene3) return false;
    if (!THREE.PMREMGenerator) return false;
    if (typeof document === 'undefined' || !document.createElement) return false;
    try {
      var cv = document.createElement('canvas');
      cv.width = 256; cv.height = 128;
      var g2 = cv.getContext && cv.getContext('2d');
      if (!g2) return false;
      var grad = g2.createLinearGradient(0, 0, 0, 128);
      // Sun-side sky: warm white, the brightest thing a highlight can catch.
      grad.addColorStop(0.00, '#fff6ea');
      grad.addColorStop(0.28, '#e8eef3');
      // Waterline: neutral, slightly cool.
      grad.addColorStop(0.50, '#9fb2c0');
      // Below: desaturated blue-grey falling to near-black, so the belly picks
      // up a dark floor reflection and the countershade actually reads.
      grad.addColorStop(0.74, '#3f5566');
      grad.addColorStop(1.00, '#101a22');
      g2.fillStyle = grad;
      g2.fillRect(0, 0, 256, 128);

      var tex = new THREE.CanvasTexture(cv);
      if (THREE.EquirectangularReflectionMapping) {
        tex.mapping = THREE.EquirectangularReflectionMapping;
      }
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;

      envPMREM = new THREE.PMREMGenerator(renderer);
      if (envPMREM.compileEquirectangularShader) envPMREM.compileEquirectangularShader();
      envRT = envPMREM.fromEquirectangular(tex);
      scene3.environment = envRT.texture;
      // Scene-level intensity is a three r15x+ property; guard it so an older
      // core build simply gets the default of 1 rather than throwing.
      try { scene3.environmentIntensity = LIGHT_RIG.envIntensity; } catch (e) {}
      tex.dispose();
      return true;
    } catch (e) {
      warnOnce('buildEnvironment', e);
      return false;
    }
  }

  // Context loss destroys the PMREM render target with everything else, so the
  // restore path rebuilds it. Disposing first keeps a re-entrant call from
  // leaking the old target.
  function disposeEnvironment() {
    try { if (envRT && envRT.dispose) envRT.dispose(); } catch (e) {}
    try { if (envPMREM && envPMREM.dispose) envPMREM.dispose(); } catch (e) {}
    envRT = null; envPMREM = null;
    if (scene3) scene3.environment = null;
  }

  // The rig this lane owns, re-asserted. world3d.js writes hemi and sun every
  // fixed step from its zone blend; it must keep doing so (fog and light have
  // to agree about depth), but it has no business deciding the KEY's colour --
  // it used to lerp the sun toward 0xdff2ff, a cyan, at depth. Re-stamping the
  // neutral daylight colour after the atmosphere pass is what guarantees the
  // owner's "no colored key tints" rule holds at every depth, while leaving
  // world3d's INTENSITY falloff (its depth cue) completely intact.
  //
  // Fill and rim are never touched by anyone else, so they only need setting
  // once; they are re-stamped here purely so a hot-reload cannot desync them.
  //
  // INTENSITY, NOT JUST COLOUR. The first r15 pass only re-stamped the sun's
  // colour and left intensity to world3d, and the pixel gate caught the
  // result: the live sun read 1.00 and the live hemisphere 1.15 -- world3d's
  // SUN_I0/HEMI_I0 -- so the authored 3.10-over-0.30 rig never reached the
  // screen at all and the shark stayed darker than its water. world3d writes
  // both every fixed step from its zone blend, so authoring them at boot is
  // not enough; they have to be re-asserted after its pass.
  //
  // The depth cue is PRESERVED rather than discarded. world3d expresses depth
  // as a falloff from its own SUN_I0/HEMI_I0 baselines, so the ratio it just
  // wrote (live / baseline) is exactly its intended dimming for this depth.
  // Multiplying the authored intensity by that ratio keeps the deep zones
  // genuinely darker while restoring the key-dominant balance.
  var W3D_SUN_I0 = 1.00;   // world3d SUN_I0  (shallow baseline)
  var W3D_HEMI_I0 = 1.15;  // world3d HEMI_I0 (shallow baseline)
  // The shark must never fall back into the water, so the key is not allowed
  // to dim below this fraction of its authored value no matter how deep the
  // camera goes. The abyss gets its darkness from fog and from the ambient
  // term, not from switching the subject's key light off.
  var KEY_DEPTH_FLOOR = 0.72;

  function enforceLightRig() {
    if (sun) {
      var sunRatio = W3D_SUN_I0 > 0 ? (sun.intensity / W3D_SUN_I0) : 1;
      if (!isFinite(sunRatio) || sunRatio <= 0) sunRatio = 1;
      sun.intensity = LIGHT_RIG.sunIntensity
        * Math.max(KEY_DEPTH_FLOOR, Math.min(1, sunRatio));
    }
    if (hemi) {
      var hemiRatio = W3D_HEMI_I0 > 0 ? (hemi.intensity / W3D_HEMI_I0) : 1;
      if (!isFinite(hemiRatio) || hemiRatio <= 0) hemiRatio = 1;
      // The ambient keeps world3d's full falloff -- it is the term that is
      // SUPPOSED to carry the water's colour and die away with depth.
      hemi.intensity = LIGHT_RIG.hemiIntensity * Math.min(1, hemiRatio);
    }
    if (sun && sun.color && sun.color.setHex) sun.color.setHex(LIGHT_RIG.sunColor);
    if (fillLight) {
      if (fillLight.color && fillLight.color.setHex) fillLight.color.setHex(LIGHT_RIG.fillColor);
      fillLight.intensity = LIGHT_RIG.fillIntensity;
    }
    if (rimLight) {
      if (rimLight.color && rimLight.color.setHex) rimLight.color.setHex(LIGHT_RIG.rimColor);
      rimLight.intensity = LIGHT_RIG.rimIntensity;
    }
  }

  function resize() {
    if (!renderer || !camera) return;
    var w = Math.max(1, root.innerWidth || CSS_W);
    var h = Math.max(1, root.innerHeight || CSS_H);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ------------------------------------------------- GL-01 context loss
  // SPEC3D Rev 2: engine3d owns WebGL context loss and restoration.
  //
  // ON LOSS: preventDefault() is MANDATORY - without it the browser will never
  // fire webglcontextrestored and the canvas is dead for good. We then pause
  // through the kit (the same pause the app menu uses, so the fixed-step
  // accumulator freezes and the stick is dropped exactly as it is on any other
  // pause) and post a notice through RF.UI, guarded.
  //
  // ON RESTORE: every GPU-side resource this process uploaded is gone - all
  // geometry, textures, materials and programs across all four lanes. There is
  // no way to re-upload another lane's private resources from here. So the
  // restoration is: tear the run down through the SAME choreography endRun()
  // uses (which every lane already implements and which is proven idempotent),
  // rebuild renderer-level state, and return to the menu.
  //
  // WHY MENU-RETURN IS THE SAFE RESTORATION: a mid-run rebuild would have to
  // reconstruct world entities, FX pools and the player rig against a scene
  // whose old children still hold dangling GPU handles, in a state where the
  // sim clock has already skipped an unbounded stretch of wall time. That is
  // three lanes of partially-valid state and no way to verify it. Menu-return
  // discards ALL of it through a code path that already runs on every normal
  // run end, so the restored context starts from the one state the boot path
  // is proven to produce. A lost run is a far smaller cost than a silently
  // corrupt one, and on the target mobile class context loss is rare enough
  // that trading the run for correctness is the right side of the bet.
  var glLost = false;
  function onContextLost(ev) {
    // MUST preventDefault or the restore event never arrives.
    if (ev && ev.preventDefault) ev.preventDefault();
    glLost = true;
    var g = ggkit();
    if (g && g.pause) { try { g.pause(true); } catch (e) { warnOnce('kit.pause lost', e); } }
    else if (kit) kit.paused = true;
    uiCall('notice', 'Graphics context lost. Restoring...');
    if (root.console && console.error) {
      console.error('[Razorfin] WebGL context lost; run paused pending restore.');
    }
  }

  function onContextRestored() {
    glLost = false;
    // Drop the run through the standard teardown choreography. Guarded and
    // idempotent, so it is safe even if the context died mid-startRun.
    try { endRun(); } catch (e) { warnOnce('endRun on restore', e); }

    // Renderer-level state does not survive the new context: pixel ratio, tone
    // mapping, color space and size are all properties of the lost one.
    if (renderer) {
      try {
        renderer.setPixelRatio(DPR);
        if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = LIGHT_RIG.exposure;
        if (renderer.resetState) renderer.resetState();
        // The PMREM target died with the context; rebuild it or every
        // Standard material comes back with no specular environment.
        disposeEnvironment();
        buildEnvironment();
        enforceLightRig();
      } catch (e) { warnOnce('renderer restore', e); }
    }
    resize();

    // The lights are engine-owned and survive as JS objects, but re-lend them
    // so the atmosphere owner is not holding references from the dead context.
    handOffLights();

    var g = ggkit();
    if (g && g.pause) { try { g.pause(false); } catch (e) { warnOnce('kit.resume', e); } }
    else if (kit) kit.paused = false;

    uiCall('notice', 'Graphics restored.');
    uiCall('showMenu');
  }

  // Canvas-level, not window-level: these are renderer host events on the
  // element this module created and owns, not game input.
  function bindContextLoss() {
    if (!canvasEl || !canvasEl.addEventListener) return false;
    canvasEl.addEventListener('webglcontextlost', onContextLost, false);
    canvasEl.addEventListener('webglcontextrestored', onContextRestored, false);
    return true;
  }

  // ------------------------------------------------------ zone read-only
  // ATMO-01 / SPEC3D Rev 2 ruling: world3d.js is the SOLE atmosphere owner.
  // It owns scene.fog color+density, renderer clear color / scene.background,
  // and the hemisphere light lerp targets. This engine creates the lights ONCE
  // in buildRenderer() and hands the references to RF.World (init ctx +
  // RF.World.setLights setter); from then on it only READS zone state.
  //
  // The single remaining engine-side need is the zone NAME for the HUD, which
  // is a label, not atmosphere. Zero allocation: the name is copied into the
  // pre-allocated zoneState scratch, never a fresh object.
  function stepZoneName(p) {
    var z = null;
    if (RF.World && RF.World.zoneAt) {
      try { z = RF.World.zoneAt(p.y); } catch (e) { warnOnce('World.zoneAt look', e); }
    }
    if (!z) z = zoneAtFallback(p.y);
    zoneState.name = (z && z.name) || '';

    // Blocker 1: cumulative zoneTime mission event, reported once per second
    // (not every fixed step) off ctx.time.now rather than a frame counter, so
    // it still fires correctly under a variable step count per frame.
    if (z && z.id !== undefined && z.id !== null) {
      zoneTimeAcc[z.id] = num(zoneTimeAcc[z.id], 0) + STEP;
      if (ctx.time.now - zoneTimeReportAt >= 1) {
        zoneTimeReportAt = ctx.time.now;
        missionEvent('zoneTime', { zoneId: z.id, seconds: zoneTimeAcc[z.id] });
      }
    }
  }

  // Blocker 8 (REVIEW-REV7): resolve profile.skins.selectedSkin into a
  // palette-swapped CLONE of the shark def, ES5-composed exactly like the
  // rest of this file ({...def} equivalent), never mutating the shared def
  // or editing shark3d.js. Returns def unchanged if there is no selection, no
  // matching RFD.SKINS row, or the row is shark-locked to a different shark
  // (buildShark reads def.sil.palette for every render lane, per
  // NOTES-rev7-laneS3.md's SKINS schema). One clone at build time only - not
  // called per step.
  function skinnedDef(def) {
    if (!def) return def;
    var skinId = profile && profile.skins && profile.skins.selectedSkin;
    if (!skinId) return def;
    var row = null;
    var list = RFD.SKINS || [];
    for (var i = 0; i < list.length; i++) { if (list[i].id === skinId) { row = list[i]; break; } }
    if (!row || !row.palette) return def;
    if (row.sharkId && row.sharkId !== def.id) return def;
    var baseSil = def.sil || {};
    var basePalette = baseSil.palette || {};
    var newPalette = {
      base: (row.palette.base !== undefined) ? row.palette.base : basePalette.base,
      belly: (row.palette.belly !== undefined) ? row.palette.belly : basePalette.belly,
      accent: (row.palette.accent !== undefined) ? row.palette.accent : basePalette.accent,
      glow: (row.palette.glow !== undefined) ? row.palette.glow : basePalette.glow
    };
    var newSil = {};
    for (var k in baseSil) { if (Object.prototype.hasOwnProperty.call(baseSil, k)) newSil[k] = baseSil[k]; }
    newSil.palette = newPalette;
    var out = {};
    for (var dk in def) { if (Object.prototype.hasOwnProperty.call(def, dk)) out[dk] = def[dk]; }
    out.sil = newSil;
    return out;
  }

  // ==================================================== player rig (3D)
  // SPEC3D: RF.Art3D.buildShark(def) -> { group, parts, animate(t, state) }.
  // Missing lane D3 = a colored capsule mesh so the run is still playable and
  // the shark is still visible, per the brief.
  function buildPlayerRig(def) {
    var renderDef = skinnedDef(def);
    if (RF.Art3D && RF.Art3D.buildShark) {
      try {
        var rec = RF.Art3D.buildShark(renderDef);
        if (rec && rec.group && rec.group.isObject3D) {
          if (typeof rec.animate !== 'function') rec.animate = function () {};
          if (!rec.parts || typeof rec.parts !== 'object') rec.parts = {};
          // shark3d's authored world scale is still the old 96px target. The
          // player is the engine-owned consumer, so apply the new target here
          // and capture the scaled base before renderPlayer adds eat pops.
          var g = rec.group;
          var sourceScale = num(g.__baseScale,
            num(g.userData && g.userData.baseScale, num(g.scale && g.scale.x, 1)));
          var scaled = sourceScale * LEN_SCALE;
          if (g.scale && g.scale.setScalar) g.scale.setScalar(scaled);
          else if (g.scale) { g.scale.x = scaled; g.scale.y = scaled; g.scale.z = scaled; }
          g.__baseScale = scaled;
          g.__rfLenScale = LEN_SCALE;
          rec.__fallback = false;
          return rec;
        }
      } catch (e) { warnOnce('Art3D.buildShark', e); }
    }
    return fallbackShark(renderDef);
  }

  function fallbackShark(def) {
    var pal = (def && def.sil && def.sil.palette) || {};
    var base = hexNum(pal.base, 0x7d8c9e);
    var belly = hexNum(pal.belly, 0xdfe7ee);
    var lenPx = sharkLenPx(def);
    var girth = num(def && def.sil && def.sil.girth, 0.34);
    var group = new THREE.Group();
    var radius = Math.max(4, lenPx * girth * 0.5);
    var length = Math.max(radius * 2.2, lenPx);
    var geo = null;
    // CapsuleGeometry landed in r140; guard so an older vendored three still
    // produces a body instead of throwing on boot.
    if (THREE.CapsuleGeometry) geo = new THREE.CapsuleGeometry(radius, Math.max(1, length - radius * 2), 4, 12);
    else geo = new THREE.CylinderGeometry(radius, radius * 0.6, length, 12);
    var body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: base, roughness: 0.72, metalness: 0.05, flatShading: true
    }));
    // Capsules are built along +Y; the shark swims along +X.
    body.rotation.z = -Math.PI / 2;
    group.add(body);
    var bellyMesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.82, 10, 8),
      new THREE.MeshStandardMaterial({ color: belly, roughness: 0.85, metalness: 0 })
    );
    bellyMesh.position.set(-length * 0.08, -radius * 0.42, 0);
    bellyMesh.scale.set(1.5, 0.55, 0.9);
    group.add(bellyMesh);
    var tail = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 1.15, radius * 1.7, 6),
      new THREE.MeshStandardMaterial({ color: base, roughness: 0.7, flatShading: true })
    );
    tail.position.x = -length * 0.5;
    tail.rotation.z = Math.PI / 2;
    group.add(tail);
    var parts = { body: body, tail: tail, pectL: null, pectR: null, jaw: null };
    return {
      group: group, parts: parts, __fallback: true,
      animate: function (t, state) {
        // Minimal life so the degraded path is not a static prop.
        var amp = num(state && state.tailAmp, 0.2);
        tail.rotation.y = Math.sin(num(state && state.tailPhase, t * 6)) * amp;
      }
    };
  }

  // ==================================================== score popups (3D)
  // SPEC3D 7.3: a glyph atlas baked ONCE at init (digits 0-9, '+', 'x', '.',
  // space, two weights). Popups are pooled quads with per-glyph UVs; ZERO
  // canvas 2D calls and ZERO texture.needsUpdate after init. Every call site
  // in this file only ever formats '+' + digits, so that is the covered
  // alphabet (with 'x'/'.'/space kept for forward compatibility with any
  // future multiplier/decimal popup string).
  var POP_GLYPHS = '0123456789+x. ';
  var POP_ATLAS_COLS = POP_GLYPHS.length;   // one column per glyph
  var POP_ATLAS_ROWS = 2;                   // row 0 = normal weight, row 1 = big
  var POP_CELL_W = 40, POP_CELL_H = 56;     // px per glyph cell in the atlas
  var POP_MAX_CHARS = 8;                    // longest string any pop needs
  var popAtlas = null;   // { texture, cols, rows, cellU, cellV, baked: true, geoms: [...] }

  function glyphIndex(ch) {
    var i = POP_GLYPHS.indexOf(ch);
    return i >= 0 ? i : POP_GLYPHS.length - 1;  // fall back to space
  }

  // Blocker 6 (REVIEW-REV7): one PlaneGeometry per atlas cell (cols*rows,
  // baked once at atlas-init time), each with its UV attribute set to that
  // cell's quad and never touched again. paintGlyph swaps a sprite's
  // .geometry reference to the shared prebuilt variant for its cellIndex -
  // no per-popup geometry clone, no uv.needsUpdate, ever.
  function buildPopGeomVariants(atlas) {
    var geoms = new Array(atlas.cols * atlas.rows);
    for (var row = 0; row < atlas.rows; row++) {
      for (var col = 0; col < atlas.cols; col++) {
        var u0 = col * atlas.cellU, u1 = u0 + atlas.cellU;
        var v0 = 1 - (row + 1) * atlas.cellV, v1 = v0 + atlas.cellV;
        var g = new THREE.PlaneGeometry(1, 1);
        var uv = g.attributes.uv;
        // Sprite geometry UV winding matches three's built-in plane: (0,0)
        // bottom-left .. (1,1) top-right in the same 4-vertex order the old
        // per-instance clone used.
        uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
        // Set once at construction time; not touched again after this point.
        uv.needsUpdate = true;
        geoms[row * atlas.cols + col] = g;
      }
    }
    return geoms;
  }

  // Baked ONCE at init. This is the ONLY canvas 2D usage in the popup path;
  // nothing after this point (scorePopup/stepPops) touches a 2D context or
  // sets texture.needsUpdate.
  function buildPopAtlas() {
    var doc = root.document;
    if (!doc || !doc.createElement) { popAtlas = null; return null; }
    var c = doc.createElement('canvas');
    var cw = POP_CELL_W * POP_ATLAS_COLS, ch = POP_CELL_H * POP_ATLAS_ROWS;
    c.width = Math.round(cw * DPR); c.height = Math.round(ch * DPR);
    var cx = c.getContext ? c.getContext('2d') : null;
    if (!cx) { popAtlas = null; return null; }
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx.clearRect(0, 0, cw, ch);
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    for (var row = 0; row < POP_ATLAS_ROWS; row++) {
      var big = row === 1;
      cx.font = (big ? '900 ' : '800 ') + (big ? 34 : 27) + 'px Avenir Next, Trebuchet MS, system-ui, sans-serif';
      cx.lineWidth = 6; cx.strokeStyle = 'rgba(2,18,28,0.85)';
      cx.fillStyle = big ? '#ffd98a' : '#ffe9a8';
      for (var col = 0; col < POP_ATLAS_COLS; col++) {
        var ch2 = POP_GLYPHS.charAt(col);
        var cxp = col * POP_CELL_W + POP_CELL_W / 2;
        var cyp = row * POP_CELL_H + POP_CELL_H / 2;
        if (ch2 !== ' ') {
          cx.strokeText(ch2, cxp, cyp);
          cx.fillText(ch2, cxp, cyp);
        }
      }
    }
    var t = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;      // one upload, at bake time only
    t.generateMipmaps = false;
    if (THREE.NearestFilter) { /* keep default linear for crisp scaled text */ }
    popAtlas = {
      texture: t, cols: POP_ATLAS_COLS, rows: POP_ATLAS_ROWS,
      cellU: 1 / POP_ATLAS_COLS, cellV: 1 / POP_ATLAS_ROWS,
      baked: true
    };
    popAtlas.geoms = buildPopGeomVariants(popAtlas);
    return popAtlas;
  }

  var POP_GLYPH_W = 22, POP_GLYPH_H = 30, POP_GLYPH_ADVANCE = 17;
  // Pooled quads: each pool item is a fixed-size row of POP_MAX_CHARS glyph
  // sprites (sharing the ONE atlas material/texture) plus its own life/pos
  // state. Built once at init; scorePopup only sets per-glyph UV offsets
  // (geometry attribute writes) and toggles visibility - no texture upload.
  function buildPopPool(n) {
    var pool = { items: [], cursor: 0, ok: false };
    var doc = root.document;
    if (!doc || !doc.createElement || !scene3) { popPool = pool; return pool; }
    if (!popAtlas) buildPopAtlas();
    if (!popAtlas) { popPool = pool; return pool; }
    var baseMat = new THREE.SpriteMaterial({
      map: popAtlas.texture, transparent: true, depthTest: false, depthWrite: false
    });
    for (var i = 0; i < n; i++) {
      var glyphs = [];
      for (var g = 0; g < POP_MAX_CHARS; g++) {
        var mat = baseMat.clone();       // per-glyph opacity/uv-offset only
        mat.map = popAtlas.texture;
        var spr = new THREE.Sprite(mat);
        // Blocker 6: start each sprite on a prebuilt atlas-cell geometry (the
        // space glyph) so paintGlyph only ever swaps between geoms already
        // baked at buildPopAtlas time - no lazy clone on first paint.
        spr.geometry = popAtlas.geoms[glyphIndex(' ')];
        spr.visible = false;
        spr.renderOrder = 900;
        spr.center.set(0, 0.5);
        scene3.add(spr);
        glyphs.push({ sprite: spr, mat: mat });
      }
      pool.items.push({ glyphs: glyphs, life: 0, len: 0, x: 0, y: 0 });
    }
    pool.ok = pool.items.length > 0;
    popPool = pool;
    return pool;
  }
  // Blocker 6 (REVIEW-REV7): assigns a glyph sprite to its prebuilt atlas-cell
  // geometry variant (baked once at buildPopAtlas/buildPopGeomVariants time).
  // No geometry clone, no uv attribute write, no needsUpdate of any kind here
  // - this is a reference swap between pool-owned meshes only.
  function paintGlyph(spr, mat, cellIndex) {
    spr.geometry = popAtlas.geoms[cellIndex];
  }
  // Owner feedback (2026-08-24, rev11-fx): eat-score popups were "taking
  // over the screen". Toned down HSE-style: ~40% smaller glyphs, a much
  // shorter life (was 0.7s), lighter opacity ceiling (never fully opaque),
  // a gentler upward drift, and a hard cap on how many can be alive/visible
  // at once so a feeding frenzy never stacks into a wall of text. Rapid eats
  // (within POP_COMBO_MERGE_WINDOW of the last pop) merge into ONE running
  // combo number anchored near the mouth instead of spawning a fresh popup
  // per bite - see mergeOrSpawnPopup below, the only call site for eats.
  var POP_SCALE = 0.6;          // ~40% smaller than the old 1.0/1.25 baseline
  var POP_SCALE_BIG = 0.75;
  var POP_LIFE = 0.55;          // was 0.7s
  var POP_OPACITY_MAX = 0.82;   // lighter weight - never fully opaque
  var POP_DRIFT_Y = 34;         // px/s rise, gentler than the old 46
  var POP_MAX_CONCURRENT = 4;   // never more than this many alive at once
  var POP_COMBO_MERGE_WINDOW = 0.45; // s: eats this close merge into one running number
  var popLiveCount = 0;
  var popLastX = 0, popLastY = 0, popLastAt = -Infinity, popLastRec = null, popComboTotal = 0;

  // Paints str into pool slot `rec` in place (no cursor advance, no pool
  // lookup) - the shared body scorePopup and the in-place combo-merge path
  // both drive, so a merge can restamp the SAME sprites a fresh eat would
  // have gotten from the ring cursor instead of leaving the old ones alive
  // and layering a second popup on top.
  function paintPopupInto(rec, wx, wy, str, big) {
    var s = big ? POP_SCALE_BIG : POP_SCALE;
    var row = big ? 1 : 0;
    var n = Math.min(String(str).length, POP_MAX_CHARS);
    rec.len = n;
    rec.x = wx; rec.y = wy;
    var totalW = (n > 0 ? (n - 1) * POP_GLYPH_ADVANCE * s + POP_GLYPH_W * s : 0);
    var startX = wx - totalW / 2;
    for (var i = 0; i < n; i++) {
      var g = rec.glyphs[i];
      var idx = row * popAtlas.cols + glyphIndex(String(str).charAt(i));
      paintGlyph(g.sprite, g.mat, idx);
      g.sprite.scale.set(POP_GLYPH_W * s, POP_GLYPH_H * s, 1);
      g.sprite.position.set(startX + i * POP_GLYPH_ADVANCE * s, -wy - 6, 8);
      g.mat.opacity = POP_OPACITY_MAX;
      g.sprite.visible = true;
    }
    for (var j = n; j < rec.glyphs.length; j++) rec.glyphs[j].sprite.visible = false;
    rec.life = POP_LIFE;
  }
  function scorePopup(wx, wy, str, big) {
    if (!popPool || !popPool.ok) return;
    // Cap concurrent popups: if we're at the cap, steal the oldest-cursor
    // slot (already what the ring cursor does) rather than growing the
    // count - popLiveCount only tracks slots that are currently `visible`
    // so a full-of-expired-but-not-yet-hidden pool never blocks new pops.
    var rec = popPool.items[popPool.cursor];
    var wasLive = rec.life > 0;
    popPool.cursor = (popPool.cursor + 1) % popPool.items.length;
    paintPopupInto(rec, wx, wy, str, big);
    if (!wasLive) popLiveCount = Math.min(POP_MAX_CONCURRENT, popLiveCount + 1);
    return rec;
  }
  // FEEDBACK 2026-08-24: rapid eats (a feeding-frenzy chomp-chomp-chomp)
  // merge into ONE running combo number that tracks near the mouth, rather
  // than each bite spawning its own popup that stacks on top of the still-
  // fading previous one. The merge path REPAINTS THE SAME pool slot in
  // place (paintPopupInto, no cursor advance) - it never leaves a second,
  // independently-fading sprite group behind, which is what actually keeps
  // concurrent popups low during a frenzy (not just the hard cap below).
  function mergeOrSpawnPopup(wx, wy, addAmount, big, now) {
    var t = num(now, 0);
    if (popLastRec && popLastRec.life > 0 && (t - popLastAt) <= POP_COMBO_MERGE_WINDOW && popPool && popPool.ok) {
      popComboTotal += addAmount;
      popLastX = wx; popLastY = wy; popLastAt = t;
      paintPopupInto(popLastRec, wx, wy, '+' + Math.round(popComboTotal), big);
      return;
    }
    popComboTotal = addAmount;
    popLastX = wx; popLastY = wy; popLastAt = t;
    popLastRec = scorePopup(wx, wy, '+' + Math.round(popComboTotal), big);
  }
  function stepPops(dt) {
    if (!popPool || !popPool.ok) return;
    var liveNow = 0;
    for (var i = 0; i < popPool.items.length; i++) {
      var r = popPool.items[i];
      if (r.life <= 0) continue;
      r.life -= dt;
      var op = clamp(r.life / POP_LIFE, 0, 1) * POP_OPACITY_MAX;
      for (var g = 0; g < r.len; g++) {
        var spr = r.glyphs[g].sprite;
        spr.position.y += POP_DRIFT_Y * dt;      // world y is DOWN, three y is UP
        r.glyphs[g].mat.opacity = op;
        if (r.life <= 0) spr.visible = false;
      }
      if (r.life > 0) liveNow++;
    }
    popLiveCount = liveNow;
  }

  // ==================================================== head-drag steering
  // SPEC3D 7.1: the steering pointer is a WORLD TARGET, not a joystick. A
  // small DOM dot marks the live finger point (purely cosmetic - the actual
  // steering math lives in stepControl/publishWorldTarget below). Names kept
  // (buildStick/plantStick/dragStick/clearStick/paintStick) so bindInput and
  // teardown call sites are unchanged; only the mechanic underneath moved.
  function buildStick() {
    var doc = root.document;
    if (!doc || !doc.createElement) return null;
    var rootEl = doc.getElementById('rf-stick');
    if (!rootEl) {
      rootEl = doc.createElement('div');
      rootEl.id = 'rf-stick';
      rootEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;display:none;';
      doc.body.appendChild(rootEl);
    }
    var ring = doc.createElement('div');
    ring.style.cssText = 'position:absolute;width:124px;height:124px;margin-left:-62px;margin-top:-62px;' +
      'border-radius:50%;border:2px solid rgba(143,232,255,0.35);background:rgba(143,232,255,0.06);';
    rootEl.appendChild(ring);
    var nub = doc.createElement('div');
    nub.style.cssText = 'position:absolute;width:30px;height:30px;margin-left:-15px;margin-top:-15px;' +
      'border-radius:50%;background:rgba(143,232,255,0.45);border:2px solid rgba(143,232,255,0.8);';
    rootEl.appendChild(nub);
    stickEls = { root: rootEl, ring: ring, nub: nub };
    return stickEls;
  }
  function paintStick() {
    if (!stickEls || !ctx || !ctx.player) return;
    var ctl = ctx.player.ctl;
    if (!ctl.active) { stickEls.root.style.display = 'none'; return; }
    stickEls.root.style.display = 'block';
    if (stickEls.ring) {
      stickEls.ring.style.left = ctl.ax + 'px';
      stickEls.ring.style.top = ctl.ay + 'px';
    }
    stickEls.nub.style.left = ctl.px + 'px';
    stickEls.nub.style.top = ctl.py + 'px';
  }
  // dx/dy are the finger's CSS point (kit.input coordinates, viewport px).
  function plantStick(dx, dy) {
    var ctl = ctx.player.ctl;
    ctl.active = true;
    ctl.px = dx; ctl.py = dy;
    ctl.ax = dx; ctl.ay = dy;
    ctl.stick = true; ctl.stickMag = 0;
    paintStick();
  }
  function dragStick(px, py) {
    var ctl = ctx.player.ctl;
    if (!ctl.active) return;
    ctl.px = px; ctl.py = py;
    // Recenter: the ring follows the finger once it overshoots 1.35x radius
    // (HM :2415 mechanic), so a long drag never leaves the stick behind.
    var rdx = px - ctl.ax, rdy = py - ctl.ay;
    var rlen = Math.sqrt(rdx * rdx + rdy * rdy);
    var lim = CTL_STICK_RADIUS * CTL_STICK_RECENTER;
    if (rlen > lim) {
      ctl.ax = px - rdx / rlen * lim;
      ctl.ay = py - rdy / rlen * lim;
    }
    paintStick();
  }
  function clearStick() {
    if (!ctx || !ctx.player) return;
    var ctl = ctx.player.ctl;
    ctl.active = false;
    ctl.steerId = null;
    ctl.hasTarget = false;
    ctl.mag = 0;
    ctl.stick = false; ctl.stickMag = 0;
    if (stickEls) stickEls.root.style.display = 'none';
  }

  // Scratch for unprojecting a CSS point into the world (z=0 plane). No
  // allocation per step: one Vector3/Raycaster/Plane, reused every call.
  var WT_VEC = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  var WT_RAY = (typeof THREE !== 'undefined') ? new THREE.Raycaster() : null;
  var WT_PLANE = (typeof THREE !== 'undefined') ? new THREE.Plane(new THREE.Vector3(0, 0, 1), 0) : null;
  var WT_HIT = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  // ctl.tx/ty are cached world coords for the last successful unprojection so
  // a missing camera/renderer (headless selftest) degrades to "no target"
  // rather than throwing.
  function cssToWorld(cssX, cssY, outX, outY) {
    if (!camera || !renderer || !WT_VEC || !WT_RAY || !WT_PLANE) return false;
    var size = renderer.getSize ? renderer.getSize(WT_VEC) : null;
    var w = (size && size.x) || root.innerWidth || CSS_W;
    var h = (size && size.y) || root.innerHeight || CSS_H;
    if (!(w > 0) || !(h > 0)) return false;
    var ndcX = (cssX / w) * 2 - 1;
    var ndcY = -(cssY / h) * 2 + 1;
    WT_VEC.set(ndcX, ndcY, 0.5);
    WT_RAY.setFromCamera(WT_VEC, camera);
    var hit = WT_RAY.ray.intersectPlane(WT_PLANE, WT_HIT);
    if (!hit) return false;
    outX.v = WT_HIT.x;
    outY.v = -WT_HIT.y;
    return true;
  }
  var WT_OUT_X = { v: 0 }, WT_OUT_Y = { v: 0 };

  // Blocker 5 (REVIEW-REV7): world-units-per-CSS-px derived from the LIVE
  // camera dolly z / fov (same quantities stepCamera actually writes onto
  // `camera` each frame, including pulses/zoom), not the boot CAM_Z/CAM_FOV
  // constants. Falls back to the boot constants only when there is no live
  // camera (headless selftest), matching cssToWorld's own degrade. No
  // allocation: pure scalar math off already-live fields.
  function liveWorldPerCssPx() {
    var z = (camera && isFinite(camera.position.z) && camera.position.z > 0) ? camera.position.z : CAM_Z;
    var fov = (camera && isFinite(camera.fov) && camera.fov > 0) ? camera.fov : CAM_FOV;
    return (2 * z * Math.tan((fov * Math.PI / 180) / 2)) / CSS_H;
  }

  // Rev 6 / 6.7: the elemental active becomes a CHARGED power. abilities.js
  // still owns its own internal meter/cooldown gate (canFire/fire, unchanged);
  // this lane adds the charge-count gate on TOP of that, one charge per fire,
  // via the SAME dedicated HUD button + double-tap wiring that already called
  // firePower() (SPEC3D: "keep current wiring, add charge gating in
  // engine/abilities"). ctx.run.powerCharges is 0 out of run (ctx.run does
  // not exist until buildContext), so this degrades to a no-op safely then.
  function firePower() {
    if (!RF.Abilities || !RF.Abilities.fire) return;
    var r = ctx && ctx.run;
    if (!r || !(num(r.powerCharges, 0) > 0)) return;
    try {
      if (RF.Abilities.canFire && !RF.Abilities.canFire(ctx)) return;
      if (!RF.Abilities.fire(ctx)) return;
      r.powerCharges = clamp(num(r.powerCharges, 0) - 1, 0, POWER_CHARGE_CAP);
    } catch (e) { warnOnce('Abilities.fire', e); }
  }

  // Rev 6 / 6.7: double-tap superpower trigger, ported VERBATIM from
  // horde-meridian game.js release() :2640-2662. Module scratch, no
  // allocation: the last-tap bookkeeping is three scalars, matching HM's
  // scene.lastTapAt/X/Y fields.
  var lastTapAt = 0, lastTapX = 0, lastTapY = 0;
  function dist2(x1, y1, x2, y2) { var dx = x1 - x2, dy = y1 - y2; return Math.sqrt(dx * dx + dy * dy); }
  function checkDoubleTap(pt) {
    if (!pt || !running) return;
    var nowMs = (root.performance && root.performance.now) ? root.performance.now() : Date.now();
    var downAt = num(pt.downAt, nowMs);
    var startX = num(pt.startX, pt.x), startY = num(pt.startY, pt.y);
    var held = nowMs - downAt;
    var moved = dist2(pt.x, pt.y, startX, startY);
    if (held < DTAP_HOLD_MAX && moved < DTAP_MOVE_MAX) {
      if (lastTapAt && (nowMs - lastTapAt) < DTAP_GAP_MAX
          && (nowMs - lastTapAt) > DTAP_GAP_MIN
          && dist2(pt.x, pt.y, lastTapX, lastTapY) < DTAP_DIST_MAX) {
        lastTapAt = 0;
        firePower();
      } else {
        lastTapAt = nowMs; lastTapX = pt.x; lastTapY = pt.y;
      }
    } else {
      lastTapAt = 0;
    }
  }

  // Lane C3 owns the power button as a DOM control and calls this. In-run
  // pointerdown on it is allowed by SPEC3D (it is not a game gesture).
  function bindInput() {
    var p = ctx.player;
    subs.push(kit.input.onDown(function (pt) {
      // A pointer that Lane C3's DOM UI claimed is not a steering gesture.
      if (pt && pt.zone && pt.zone !== 'game') return;
      if (p.ctl.steerId === null) {
        p.ctl.steerId = pt.pointerId;
        plantStick(pt.x, pt.y);
      } else if (p.ctl.boostId === null && pt.pointerId !== p.ctl.steerId) {
        // Second simultaneous pointer boosts while held.
        p.ctl.boostId = pt.pointerId;
      }
    }));
    subs.push(kit.input.onMove(function (pt) {
      if (pt.pointerId !== p.ctl.steerId) return;
      dragStick(pt.x, pt.y);
    }));
    subs.push(kit.input.onUp(function (pt) {
      // ggkit fires onUp with a NULL event on cancel (pointercancel, blur,
      // visibility change). A null release clears everything, because the
      // pointer identity is gone and holding the stick would strand the shark
      // at full throttle.
      if (!pt) { clearStick(); p.ctl.boostId = null; return; }
      // 6.7: ANY pointer's release counts toward the double-tap gate, not
      // just the steering pointer - a second finger tapping elsewhere still
      // gets a NEW pointer id and must not be skipped (the exact mobile fix
      // HM's comment documents at :2641-2646).
      checkDoubleTap(pt);
      if (pt.pointerId === p.ctl.steerId) clearStick();
      if (pt.pointerId === p.ctl.boostId) p.ctl.boostId = null;
    }));
    subs.push(kit.input.onKeyDown(function (code) {
      if (code === 'Space') firePower();
    }));
  }
  function unbindInput() {
    for (var i = 0; i < subs.length; i++) { try { subs[i](); } catch (e) {} }
    subs.length = 0;
    lastTapAt = 0;
  }

  // ==================================================== context + player
  function buildContext() {
    // ONE context object, created here and passed everywhere. Schema exactly
    // per SPEC.md, with `scene` now the THREE.Scene rather than a Phaser one.
    // Rev 7 (orchestrator glue, SPEC3D 7.2): minimal pub/sub bus on the kit.
    // world3d publishes 'rf-sting' on inedible-hazard contact (1.2s cooldown
    // world-side); the engine answers with the toast. Created once per boot.
    if (kit && !kit.bus) {
      kit.bus = (function () {
        var subs = {};
        return {
          on: function (ev, fn) { (subs[ev] = subs[ev] || []).push(fn); return fn; },
          emit: function (ev, payload) {
            var list = subs[ev]; if (!list) return;
            for (var i = 0; i < list.length; i++) {
              try { list[i](payload); } catch (e) { warnOnce('bus:' + ev, e); }
            }
          }
        };
      })();
      kit.bus.on('rf-sting', function () { uiCall('toast', 'Stings!'); });
    }
    ctx = RF.ctx = {
      kit: kit,
      scene: scene3,
      dpr: DPR,
      // Rev 12 / 12.1: the selected level id, resolved once per run from the
      // profile (default 'hawaii'). world3d reads ctx.level to pick its
      // sky/seabed/water/prey-mix; meta.js's endRun scoring also reads it
      // (ctx.level || run.level || profile.selectedLevel).
      level: activeLevelId(),
      time: { now: 0, dt: STEP, frame: 0 },
      rng: mulberry32(((num(profile && profile.runs, 0) + runCount) * 2654435761) >>> 0),
      player: null,
      save: profile,
      run: {
        score: 0, coins: 0, xp: 0, combo: 0, comboT: 0, comboPeak: 0, frenzy: 0,
        goldRushT: 0, biggestTier: 0, slowmoT: 0, timeScale: 1,
        // Rev 12 / 12.4: run.mode is the visible MODE name ('' | 'goldRush' |
        // 'megaGoldRush'), read by shark3d/ui3d/world3d for the gold tint,
        // vignette and HUD banner. goldRushT/frenzy stay the engine's own
        // timers/meter (unchanged); mode is a pure presentation projection of
        // them plus the chained mega-meter below.
        mode: '', megaMeter: 0, _megaAnnounced: false,
        // Canonical Rev 3 frenzy state. frenzy/goldRushT remain compatibility
        // aliases because HUD, payout, and damage blocks are owned elsewhere.
        goldRush: { meter: 0, t: 0 },
        blood: { t: 0 },
        school: { packId: 0, count: 0, swirlT: 0 },
        golden: { packId: 0, eaten: 0, deadline: 0 },
        frenzyCue: '',
        _schoolTriggeredPackId: 0, _goldenRolledPackId: 0, _goldenCuePending: false,
        _goldRushAnnounced: false, _frenzyApplied: false,
        _frenzyBaseSpeed: 1, _frenzyBaseBite: 1,
        _frenzyAppliedSpeed: 1, _frenzyAppliedBite: 1,
        // Rev 6 / 6.7: powerup buff timers (seconds remaining; 0 = inactive).
        // shield uses charges (integer hits absorbed), everything else a
        // countdown. HM's pattern verbatim (game.js run.buffs.<name>).
        // Rev 12 / 12.4 additions: supersize (rig scale 1.5x + tier eat
        // bonus), modeShield (charge count, separate from the legacy
        // 'shield' overdrive-table buff so the two power-up tables never
        // collide), modeSpeed (a plain speed multiplier timer distinct from
        // overdrive's accel/brake exception).
        buffs: { overdrive: 0, shield: 0, megajaw: 0, magnet: 0, chum: 0, apex: 0,
                 supersize: 0, modeShield: 0, modeSpeed: 0 },
        // Rev 6 / 6.7: superpower charge economy. 3 opening charges, cap 8,
        // earned at combo streak thresholds (every 8 combo) + frenzy completions.
        powerCharges: POWER_CHARGE_START, _lastComboCharge: 0,
        // FIX-ROUND-3 item 4 (BUFF CADENCE): engine-side global drop cooldown
        // timestamp for spawnBuffDrop, in ctx.time.now units. -Infinity so the
        // very first notable kill of a run is never blocked by the cooldown.
        _lastBuffDropAt: -Infinity,
        // SPEC3D 7.6: run-scoped relic/gem accounting. relics collects the
        // relic records found this run (kind 'relic' pickup path); gems is
        // the in-run gem count added to the profile at endRun (S3's job).
        // Both are guarded so the game runs before S2/S3 land spawning/data.
        relics: [], gems: 0,
        // Blocker 2 (REVIEW-REV7): counts of each frenzy type completed this
        // run - meta.js's endRun multiplies each by RFD.GEMS.frenzy.<type>
        // and sums into the gem total; this lane is the sole producer,
        // incremented exactly once beside each existing completion edge.
        frenzyCompletions: { goldrush: 0, blood: 0, school: 0 },
        // Blocker 1: missions active this run get an id list from
        // RF.Meta.rollMissions at startRun; missionResults/gems are written
        // by RF.Meta.missionEvent (meta.js owns those fields on first write).
        missionResults: [],
        // Rev 12 / 12.1: mirrors ctx.level onto run state too, matching the
        // meta.js endRun read order (ctx.level || run.level || profile.selectedLevel).
        level: activeLevelId()
      },
      // Render-layer handles the other 3D lanes need. Additive to the SPEC.md
      // schema, never a replacement for any field in it.
      three: THREE, renderer: renderer, camera: camera, scene3: scene3,
      // ATMO-01: the atmosphere owner (world3d) mutates these; the engine only reads.
      lights: LIGHTS,
      // EAT-REV3: World reads this descriptor during its own update to apply
      // suction. The object is module scratch and remains stable for the run.
      mouth: MOUTH,
      // World may consume this descriptor during its own update. It is reused
      // in place so publishing a swirl never allocates in the fixed step.
      schoolSwirl: { packId: 0, t: 0 },
      // Rev 6 / 6.7: CHUM CLOUD flag. World reads this to converge nearby
      // prey toward the player; if world3d does not implement it yet this is
      // a harmless no-op flag nobody consumes.
      chum: { active: false, x: 0, y: 0 }
    };
    installFrenzyHooks();
    FRENZY_EAT_N = 0;
    return ctx;
  }

  function buildPlayer(def) {
    if (!def) def = (RFD.SHARKS || [])[0];
    var pas = resolvePassives(def);
    var base = def.stats || {};

    var uBite = 1 + upgradeLevel(def.id, 'bite') * num(UPEFF.bite, 0.1);
    var uSpeed = 1 + upgradeLevel(def.id, 'speed') * num(UPEFF.speed, 0.06);
    var uBoost = 1 + upgradeLevel(def.id, 'boost') * num(UPEFF.boost, 0.12);

    var stat = {
      speed: num(base.speed, 230) * uSpeed * pas.mult.speed,
      accel: num(base.accel, 520) * uSpeed * pas.mult.accel,
      turn: num(base.turn, 3.4) * pas.mult.turn,
      bite: num(base.bite, 1) * uBite * pas.mult.bite,
      hp: num(base.hp, 60) * pas.mult.hp,
      metab: num(base.metab, 1.6),
      boost: num(base.boost, 2.2) * uBoost * pas.mult.boost
    };

    var lenPx = sharkLenPx(def);
    var p = {
      active: true, id: -1, kind: 'player', defId: def.id, def: def,
      tier: num(def.tier, 1),
      x: WORLD_W * 0.5, y: 260, vx: 0, vy: 0, angle: 0,
      hp: stat.hp, maxHp: stat.hp,
      st: { chewFxCd: 0, invulnT: 0, phaseT: 0, frozenT: 0, stunT: 0, burnT: 0, poisonT: 0,
            airborne: false, usedUndying: false, eatPopT: 0, jawSnapT: 0,
            // r15 lane JAW: the bite cycle state machine. phase is null when
            // idle; `from` is the gape the current segment started at, so a
            // retrigger mid-cycle blends out of wherever the jaw actually is.
            biteCycle: { phase: null, t: 0, from: JAW_REST, closeFrame: false, pending: null },
            // Rev 6 / 6.5 + 6.2: lunge + prey-near state bag, all numbers.
            preyNear: false, preyNearCd: 0, lungeT: 0, lungeCd: 0,
            lungeX: 0, lungeY: 0,
            // Rev 6 / 6.6: TOO BIG cue cooldown.
            tooBigCd: 0,
            // Rev 12 / 12.4: SUPER SIZE live scale, written by stepSuperSize
            // each sim step and read by renderPlayer each render frame.
            supersizeOn: false, superSizeScale: 1 },
      sprite: null,       // three Group once the rig is attached
      rig: null,
      // Rev 12 / 12.4: rBase/mouthRBase are the shark's true (unbuffed) body
      // and mouth radii; r/mouthR are the LIVE values stepSuperSize scales by
      // SUPERSIZE_CFG.sizeMult while the buff is active. Every existing
      // reader (lunge range, world-edge clamp, mouth sensor, minimap) keeps
      // reading p.r/p.mouthR unchanged - only the source of truth for those
      // two fields gained a live scale step.
      rBase: lenPx * 0.42, mouthRBase: mouthRadiusForLen(lenPx),
      r: lenPx * 0.42,
      mouthR: mouthRadiusForLen(lenPx),
      stat: stat,
      pas: pas,
      up: {
        bite: upgradeLevel(def.id, 'bite'),
        speed: upgradeLevel(def.id, 'speed'),
        boost: upgradeLevel(def.id, 'boost'),
        power: upgradeLevel(def.id, 'power')
      },
      // The stick vector IS the desired velocity. sx/sy are the normalised
      // deflection (-1..1 each axis, magnitude clamped to 1); bx/by are the
      // px/py: the live finger CSS point (viewport px). tx/ty: that point
      // unprojected into world coords this step (SPEC3D 7.1 head-drag).
      // mag: normalized head->finger distance fraction (0 dead, 1 = FULL_CSS+).
      ctl: {
        steerId: null, boostId: null,
        px: 0, py: 0, tx: 0, ty: 0, hasTarget: false, mag: 0,
        ax: 0, ay: 0, stick: false, stickMag: 0, stickDx: 0, stickDy: -1,
        active: false,
        boost: 1, boosting: false,
        drive: 0, turnIn: 0, speedCap: 0
      },
      anim: {
        tailPhase: 0, tailAmp: 0, pectPhase: 0,
        bank: 0, jaw: 0, bob: 0, bobPhase: 0,
        // r15 lane JAW: normalized gape + idle breathing phase.
        jawGape: JAW_REST, jawBreathe: 0,
        trailX: 0, trailY: 0, trailInit: false,
        // Handed to RF.Art3D.animate every step (SPEC3D state bag). Reused,
        // never reallocated.
        // Rev 6 / 6.2: vy, preyNear, lungeT are the new state-bag authority
        // fields this lane publishes for shark3d/world3d NPC consumers.
        state: { speedFrac: 0, turn: 0, bitePhase: 0, jawSnapT: 0, boosting: false,
                 tailPhase: 0, tailAmp: 0, pectPhase: 0, bank: 0, bob: 0,
                 vy: 0, preyNear: false, lungeT: 0 }
      }
    };
    ctx.player = p;
    return p;
  }

  function attachPlayerRig() {
    var p = ctx.player;
    p.rig = buildPlayerRig(p.def);
    if (p.rig && p.rig.group) {
      p.sprite = p.rig.group;
      p.sprite.position.set(p.x, -p.y, 0);
      if (scene3) scene3.add(p.sprite);
    }
  }

  // ========================================================== the step
  function step() {
    var t = ctx.time;
    t.dt = STEP;
    t.now += STEP;
    t.frame++;

    var p = ctx.player;
    if (!p || !p.active) return;

    stepSuperSize(p);
    stepControl(p);
    stepPreyNear(p);
    stepLunge(p);
    stepPops(STEP);
    stepMotion(p);
    stepAnim(p);
    publishMouth(p);

    if (RF.World && RF.World.update) {
      try { RF.World.update(ctx); } catch (e) { warnOnce('World.update', e); }
    }
    if (RF.Abilities && RF.Abilities.update) {
      try { RF.Abilities.update(ctx); } catch (e) { warnOnce('Abilities.update', e); }
    }

    // Rev 6.11: buff pickups run BEFORE stepEat so a buffpickup entity is
    // collected (armed) and removed from the world in the same frame it
    // enters mouth range, never falling through to eatQuery as tier-0 prey.
    stepPickups(p);
    stepEat(p);
    stepPlayerHits(p);           // consumed in the same frame world.js filled it
    stepHunger(p);
    stepCombo();
    stepFrenzy();
    stepBuffs();
    stepMusic(p);
    stepZoneName(p);

    if (p.hp <= 0 && !dying) onDeath();
  }

  // Rev 12 / 12.4: SUPER SIZE live scale. Runs once at the top of step(),
  // before anything reads p.r/p.mouthR this frame, so lunge range, world-edge
  // clamps, the mouth sensor and the rig's on-screen scale all agree on the
  // same buffed/unbuffed size for the whole step. buffs.supersize is a plain
  // timer (decayed in stepBuffs, later this same frame - a one-frame lag on
  // the expiry edge is negligible); the rig group's scale is set directly
  // here rather than folded into renderPlayer's eat-pop pop so a super-sized
  // shark's eat-pop still reads as a small extra flourish on TOP of the
  // sustained size, not a competing scale write.
  function stepSuperSize(p) {
    var b = ctx && ctx.run && ctx.run.buffs;
    var on = !!(b && b.supersize > 0);
    var mult = on ? num(SUPERSIZE_CFG.sizeMult, 1.5) : 1;
    p.r = p.rBase * mult;
    p.mouthR = p.mouthRBase * mult;
    p.st.supersizeOn = on;
    // The rig group's on-screen scale itself is set every RENDER frame by
    // renderPlayer() (g.__baseScale * eat-pop) - not here, which only runs
    // once per fixed SIM step - so this stores the live multiplier on the
    // sprite for renderPlayer to fold in, rather than writing g.scale
    // directly and having renderPlayer's next frame silently clobber it.
    p.st.superSizeScale = mult;
  }

  // SPEC3D 8.2 (REPLACES 7.1 head-drag hybrid): PURE PURSUIT steering.
  // "Where your finger points should lead where the head goes." Each fixed
  // step the live finger CSS point (ctl.px/py) is unprojected through the
  // camera into a world point (ctl.tx/ty); the shark's NOSE (snout tip, not
  // body center) continuously seeks that point. Heading turns toward the
  // finger at a fixed high rate (>= 14 rad/s), continuous - no snap, no
  // recenter, no dead zone beyond 0.5*noseR. Speed is full cruise past
  // CTL_PURSUIT_FULL_CSS and ramps down smoothly inside it; the final
  // approach to the finger is a critically-damped spring so the nose arrives
  // and rests at the finger without overshoot/orbit circling or jitter.
  //
  // EXCEPTION (kept from 6.8): while airborne (p.y < 0, mid breach arc) this
  // function must never write vy - gravity owns it exclusively in
  // stepMotion.
  //
  // ctl.turnIn is a PRESENTATION-ONLY signal: the eased heading error this
  // step, normalized by s.turn * TURN_BOOSTA * STEP, feeding bank/tail/pose.
  function stepControl(p) {
    var s = p.stat;
    var ctl = p.ctl;

    // Keyboard acts as a virtual target CTL_KEY_TARGET_CSS px along the key
    // direction from the NOSE, merged WITH an active drag (not only when
    // idle) - kept verbatim from the prior control law's merge behavior.
    var kx = 0, ky = 0;
    if (kit.input.keyDown('KeyA') || kit.input.keyDown('ArrowLeft')) kx -= 1;
    if (kit.input.keyDown('KeyD') || kit.input.keyDown('ArrowRight')) kx += 1;
    if (kit.input.keyDown('KeyW') || kit.input.keyDown('ArrowUp')) ky -= 1;
    if (kit.input.keyDown('KeyS') || kit.input.keyDown('ArrowDown')) ky += 1;
    var haveKey = (kx !== 0 || ky !== 0);
    if (haveKey) {
      var klen = Math.sqrt(kx * kx + ky * ky) || 1;
      kx = kx / klen; ky = ky / klen;
    }

    // SPEC3D 8.2 NOSE anchor: seek is computed from the snout tip, not body
    // center. Zero extra allocation - two scalars off already-live fields.
    var noseX = p.x + Math.cos(p.angle) * p.r;
    var noseY = p.y + Math.sin(p.angle) * p.r;

    // Resolve the world target this step. Pointer drag unprojects fresh
    // (camera-safe against zoom/pulse) and is ALWAYS the live target while
    // down - no caching/staleness beyond the headless fallback below.
    // Keyboard is a virtual target at a fixed CSS distance from the NOSE,
    // converted into world units using the same px->world scale the pointer
    // path uses.
    var haveTarget = false;
    var tgtX = 0, tgtY = 0;
    var stickMode = !!(ctl.active && ctl.stick);
    if (stickMode) {
      // Relative stick: heading = anchor->finger, throttle = deflection /
      // radius. Expressed as a far virtual target from the body center so
      // the pursuit law below (turn rate, cruise accel, glide) is unchanged.
      var sdx = ctl.px - ctl.ax, sdy = ctl.py - ctl.ay;
      var slen = Math.sqrt(sdx * sdx + sdy * sdy);
      if (slen > CTL_STICK_DEAD) {
        ctl.stickDx = sdx / slen; ctl.stickDy = sdy / slen;
        ctl.stickMag = clamp((slen - CTL_STICK_DEAD) / (CTL_STICK_RADIUS - CTL_STICK_DEAD), 0, 1);
        var swpp = liveWorldPerCssPx();
        ctl.tx = p.x + ctl.stickDx * CTL_STICK_TARGET_CSS * swpp;
        ctl.ty = p.y + ctl.stickDy * CTL_STICK_TARGET_CSS * swpp;
        haveTarget = true;
      } else {
        ctl.stickMag = 0;
      }
      tgtX = ctl.tx; tgtY = ctl.ty;
    } else if (ctl.active) {
      if (cssToWorld(ctl.px, ctl.py, WT_OUT_X, WT_OUT_Y)) {
        ctl.tx = WT_OUT_X.v; ctl.ty = WT_OUT_Y.v;
        haveTarget = true;
      } else if (ctl.hasTarget) {
        // Headless/no-camera fallback: keep the last resolved target so
        // selftests without a real renderer can still drive stepControl.
        haveTarget = true;
      }
      tgtX = ctl.tx; tgtY = ctl.ty;
    }
    if (haveKey) {
      // Blocker 5: world-units-per-CSS-px from the LIVE camera dolly/fov
      // (pulses/zoom-safe), not the boot CAM_Z/CAM_FOV constants.
      var wpp = liveWorldPerCssPx();
      var kwx = noseX + kx * CTL_KEY_TARGET_CSS * wpp;
      var kwy = noseY + ky * CTL_KEY_TARGET_CSS * wpp;
      if (haveTarget) {
        // Merge: average the pointer target and the key target so both
        // inputs influence heading/speed simultaneously (mirrors the prior
        // law's "keys merge WITH the stick, not only when idle").
        tgtX = (tgtX + kwx) / 2; tgtY = (tgtY + kwy) / 2;
      } else {
        tgtX = kwx; tgtY = kwy;
        haveTarget = true;
      }
    }
    ctl.hasTarget = haveTarget;

    // Blocker 5: noseRcss and distCss both derive from the same live
    // camera-based wpp scale (liveWorldPerCssPx), so a pulse/zoom mid-eat or
    // mid-death never desyncs the dead zone / speed magnitude from what the
    // pointer path is seeing this same frame.
    var wppLive = liveWorldPerCssPx();
    var noseRcss = (p.r || 8) / Math.max(1e-6, wppLive);
    // SPEC3D 8.2: no dead zone beyond 0.5*noseR - this floor exists only so
    // a target exactly on the nose tip doesn't chatter the heading atan2.
    var DEAD = Math.min(CTL_PURSUIT_DEAD_NOSE_MULT * noseRcss, CTL_PURSUIT_DEAD_CSS_MAX);

    // Rev 9 controls fix (owner: "cannot dive down"): the seek error is
    // measured from the BODY CENTER, not the nose. With the close tier camera
    // the shark's own radius spans ~100 CSS px, so on a 390px-tall screen a
    // finger below the shark could never get past the nose's dead/arrive
    // zone when the shark pointed down - vertical steering silently died
    // while horizontal (844px of room) worked. The nose still LEADS: heading
    // is atan2 of the same center->finger vector, so the snout points at the
    // finger; only the distance/speed magnitude changed anchor.
    var dxw = 0, dyw = 0, distCss = 0, distWorld = 0, mag = 0, wantAngle = p.angle;
    if (haveTarget) {
      dxw = tgtX - p.x; dyw = tgtY - p.y;
      distWorld = Math.sqrt(dxw * dxw + dyw * dyw);
      // World -> CSS distance uses the same live wpp scale as the key target above.
      distCss = wppLive > 0 ? distWorld / wppLive : distWorld;
      if (distWorld > 1e-6) wantAngle = Math.atan2(dyw, dxw);
      mag = clamp((distCss - DEAD) / Math.max(1e-6, CTL_PURSUIT_FULL_CSS - DEAD), 0, 1);
      if (stickMode && !haveKey) mag = ctl.stickMag;
    }
    ctl.drive = mag;
    ctl.mag = mag;

    var boosting = (ctl.boostId !== null)
      || kit.input.keyDown('ShiftLeft') || kit.input.keyDown('ShiftRight');

    if (boosting && ctl.boost > 0.02) {
      ctl.boost = clamp(ctl.boost - STEP * 0.42, 0, 1);
      ctl.boosting = true;
    } else {
      ctl.boost = clamp(ctl.boost + STEP * 0.17, 0, 1);
      ctl.boosting = false;
    }

    var airborne = p.y < 0;
    var prevAngle = p.angle;

    // Live multipliers, not the boot snapshot (RF-PASSIVE-01).
    var speedM = liveMult(p, 'speed') / num(p.pas.mult.speed, 1);
    var boostM = liveMult(p, 'boost') / num(p.pas.mult.boost, 1);
    // OVERDRIVE (and APEX, which folds overdrive in) is HM's EXACT semantics
    // (game.js :5449-5476), kept verbatim as the SPEC 7.1 "overdrive
    // exception": 1.42x target speed reached via an accel-clamped approach
    // while driving and an explicit brake while idle.
    var overdriveOn = ctx.run.buffs && ctx.run.buffs.overdrive > 0;
    // Rev 12 / 12.4: the visible MODE (goldRush/megaGoldRush) drives its own
    // speed multiplier from MODES config (mode.speedMult), NOT the legacy
    // FRENZY.goldRushSpeed constant - stepFrenzy/updateMode resolves
    // ctx.run.mode from goldRushT/megaMeter each step, so this reads that
    // single resolved source. modeSpeed (the SPEED pickup) stacks on top.
    var modeSpeedMult = ctx.run.mode === 'megaGoldRush' ? num(MODE_MEGA.speedMult, 1.5)
      : ctx.run.mode === 'goldRush' ? num(MODE_GOLD.speedMult, 1.3) : 1;
    var pickupSpeedOn = ctx.run.buffs && ctx.run.buffs.modeSpeed > 0;
    var speedCap = s.speed * speedM * (ctl.boosting ? s.boost * boostM : 1)
      * modeSpeedMult
      * (pickupSpeedOn ? num(MODE_SPEED_CFG.speedMult, 1.5) : 1)
      * (overdriveOn ? OVERDRIVE_SPEED_MULT : 1);

    // SPEC3D 8.2: heading turns toward the finger continuously at a fixed
    // high rate (>= 14 rad/s), no distance scaling, no snap, no recenter -
    // "where your finger points should lead where the head goes" is
    // effectively immediate but still a continuous ease (never an instant
    // teleport of angle).
    if (haveTarget) {
      var maxStep = CTL_PURSUIT_TURN_RATE * STEP;
      var dAng = angDelta(p.angle, wantAngle);
      if (dAng > maxStep) dAng = maxStep;
      else if (dAng < -maxStep) dAng = -maxStep;
      p.angle += dAng;
    }

    // SPEC3D 8.2 arrival zone: inside CTL_PURSUIT_FULL_CSS the nose ARRIVES
    // and RESTS at the finger via a critically-damped spring on the
    // nose->target error (velocity IS the spring's derivative state - no
    // extra allocation, no separate integrator). Critical damping
    // (c = 2*sqrt(k)) is exactly the boundary between "creeps in" and
    // "overshoots and circles back", so this is the one damping ratio that
    // satisfies both "arrives without orbiting" and "no jitter".
    // Inside the dead zone the nose IS at the finger: no spring pull (it would
    // creep by k*err), just the glide settle below.
    var inArrive = haveTarget && distCss <= CTL_PURSUIT_FULL_CSS && distCss > DEAD;

    if (overdriveOn) {
      // HM :5453-5476 - accelerate toward / brake off the target velocity,
      // clamped by OVERDRIVE_ACCEL*dt per axis (kept verbatim exception).
      var want = speedCap * mag;
      var wx = Math.cos(p.angle) * want;
      var wy = Math.sin(p.angle) * want;
      if (mag > 0) {
        var accelStep = OVERDRIVE_ACCEL * STEP;
        var dvx = clamp(wx - p.vx, -accelStep, accelStep);
        p.vx += dvx;
        if (!airborne) { var dvy = clamp(wy - p.vy, -accelStep, accelStep); p.vy += dvy; }
      } else {
        var brake = Math.max(0, 1 - STEP * OVERDRIVE_BRAKE);
        p.vx *= brake;
        if (!airborne) p.vy *= brake;
      }
    } else if (inArrive) {
      // Critically-damped PD spring on the world-space nose->target error:
      // a = k*err - c*v, c = 2*sqrt(k). Semi-implicit Euler (update v then
      // integrate p implicitly via the existing vx/vy -> x/y step elsewhere
      // in the file) keeps this unconditionally stable at the fixed STEP.
      var springK = CTL_ARRIVE_K;
      var springC = 2 * Math.sqrt(springK);
      var ax = springK * dxw - springC * p.vx;
      var ay = springK * dyw - springC * p.vy;
      p.vx += ax * STEP;
      if (!airborne) p.vy += ay * STEP;
      // Snap out the last epsilon so a resting nose truly settles at the
      // finger with zero residual creep/jitter, matching the release glide
      // settle contract below.
      if (Math.abs(p.vx) < 0.05 && Math.abs(dxw) < 1) p.vx = 0;
      if (!airborne && Math.abs(p.vy) < 0.05 && Math.abs(dyw) < 1) p.vy = 0;
    } else if (mag > 0) {
      // Full cruise (finger > CTL_PURSUIT_FULL_CSS from the nose): velocity
      // approaches "want" at ACCEL >= 8*speedCap/s - never a hard snap.
      var want2 = speedCap * mag;
      var wantVx = Math.cos(p.angle) * want2;
      var wantVy = Math.sin(p.angle) * want2;
      var accel = CTL_ACCEL_MULT * Math.max(1, speedCap) * STEP;
      var ddx = clamp(wantVx - p.vx, -accel, accel);
      p.vx += ddx;
      if (!airborne) { var ddy = clamp(wantVy - p.vy, -accel, accel); p.vy += ddy; }
    } else {
      // Release/no target: glide decay, exponential approach to zero,
      // tau = CTL_GLIDE_TAU - never a hard vx=vy=0 while moving.
      var glideK = Math.exp(-STEP / CTL_GLIDE_TAU);
      p.vx *= glideK;
      if (!airborne) p.vy *= glideK;
      // Snap out the last epsilon so idle truly settles (selftest: "no
      // drift after release").
      if (Math.abs(p.vx) < 0.05) p.vx = 0;
      if (!airborne && Math.abs(p.vy) < 0.05) p.vy = 0;
    }

    // Presentation-only turnIn: how far the heading actually swung this
    // step, normalized by the historical turn-rate scale.
    var dAngle = angDelta(prevAngle, p.angle);
    var turnScale = s.turn * TURN_BOOSTA * STEP;
    ctl.turnIn = turnScale > 0 ? clamp(dAngle / turnScale, -1, 1) : 0;

    if (!airborne) {
      var sp2 = p.vx * p.vx + p.vy * p.vy;
      if (sp2 > speedCap * speedCap) {
        var k = speedCap / Math.sqrt(sp2);
        p.vx *= k; p.vy *= k;
      }
    } else {
      // Airborne: only vx is capped (vy is gravity's ballistic arc).
      var vxCap = speedCap;
      if (Math.abs(p.vx) > vxCap) p.vx = p.vx < 0 ? -vxCap : vxCap;
    }
    ctl.speedCap = speedCap;
  }

  // FIX-ROUND-3 item 2: ONE shared eligibility helper feeds preyNear, lunge,
  // and stepEat, so there is exactly one "is this entity a valid target"
  // rule in the whole file (SPEC3D 6.12). It:
  //   - excludes null/inactive/self/player/'pickup'/'buffpickup' entities
  //     (buffpickup is explicitly non-edible per 6.11 and must never arm
  //     preyNear or capture a lunge target even when nearby);
  //   - allows any hazard only for a junkEater shark;
  //   - allows any non-hazard whose tier <= p.tier + BITE_UP_BASE + biteUp,
  //     where biteUp folds in the player's own passive AND megajaw's +1
  //     while megajaw is active (the same gate stepEat itself uses).
  // Pure predicate, no query - callers own their own World.query and range.
  function eatEligible(p, e) {
    if (!e || !e.active || e === p || e.kind === 'player') return false;
    // SPEC3D 7.6: relic/gempickup entities are collectibles, never food.
    if (e.kind === 'pickup' || e.kind === 'buffpickup' || e.kind === 'relic' || e.kind === 'gempickup') return false;
    var isHazard = e.kind === 'hazard';
    if (isHazard) return !!p.pas.junkEater;
    // Rev 12 / 12.4: MEGA GOLD RUSH makes every non-hazard prey edible
    // regardless of tier for its duration - the widest possible gate,
    // checked before the normal biteUp math so it always wins.
    if (ctx && ctx.run && ctx.run.mode === 'megaGoldRush') return true;
    var biteUp = num(p.pas.biteUp, 0) + megajawBiteUp() + supersizeTierBonus();
    var tier = num(e.tier, 0);
    return tier <= p.tier + BITE_UP_BASE + biteUp;
  }

  // Rev 12 / 12.4: SUPER SIZE folds into the SAME single eatable-tier gate
  // formula as megajaw (+tierBonus reach), matching the megajawBiteUp
  // pattern rather than forking a second gate.
  function supersizeTierBonus() {
    var b = ctx && ctx.run && ctx.run.buffs;
    return (b && b.supersize > 0) ? num(SUPERSIZE_CFG.tierBonus, 2) : 0;
  }

  // Rev 6 / 6.2 + 6.5, FIX-ROUND-3 item 2: preyNear is a 0.25s-refreshed
  // presence flag - true while an eatable target sits inside 2.2*p.r (body
  // radius, SAME range as the lunge query below - previously this used
  // 2.2*mouthR, a much tighter radius, creating a dead zone where lunge could
  // arm on a target preyNear itself could not see). It has no facing-cone
  // gate (that is the LUNGE gate, below); this is the wider "something to eat
  // is close" signal shark3d reads to widen jaw anticipation (0.85*gape).
  function stepPreyNear(p) {
    var st = p.st;
    st.preyNearCd -= STEP;
    if (st.preyNearCd > 0) return;
    st.preyNearCd = PREY_NEAR_REFRESH;

    var range = PREY_NEAR_RANGE_MULT * p.r;
    var near = false;
    if (RF.World && RF.World.query) {
      try {
        var list = RF.World.query(p.x, p.y, range, null);
        if (list && list.length) {
          for (var i = 0; i < list.length; i++) {
            if (eatEligible(p, list[i])) { near = true; break; }
          }
        }
      } catch (e) { warnOnce('World.query preyNear', e); }
    }
    st.preyNear = near;
  }

  // Rev 6 / 6.5: lunge. An eatable target inside a +-35deg cone of heading,
  // range 2.2*p.r, captures its POSITION (two numbers, never an entity ref -
  // pools recycle entities so a retained reference could silently start
  // pointing at an unrelated live entity next frame). While lunging the player
  // accelerates at accel*2.4 toward the captured point for 0.22s with heading
  // blend 0.35, then a 0.9s cooldown. MOUTH.lunge / MOUTH.strength 900 are
  // published from publishMouth() by reading st.lungeT, so World can widen its
  // suction while the lunge window is open.
  function stepLunge(p) {
    var st = p.st;
    if (st.lungeCd > 0) st.lungeCd = Math.max(0, st.lungeCd - STEP);

    if (st.lungeT > 0) {
      st.lungeT = Math.max(0, st.lungeT - STEP);
      var dx = st.lungeX - p.x, dy = st.lungeY - p.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1e-6) {
        var wantAngle = Math.atan2(dy, dx);
        var accel = p.stat.accel * liveMult(p, 'speed') / num(p.pas.mult.speed, 1) * LUNGE_ACCEL_MULT * STEP;
        var ax = (dx / dist) * accel, ay = (dy / dist) * accel;
        p.vx += ax;
        if (!(p.y < 0)) p.vy += ay;    // airborne: never write vy (6.8 exception)
        // Heading blend toward the lunge direction, not an instant snap -
        // 0.35 keeps the rig readable instead of whipping the nose around.
        var d = angDelta(p.angle, wantAngle);
        p.angle += d * LUNGE_HEADING_BLEND;
        if (p.angle > Math.PI) p.angle -= TAU; else if (p.angle < -Math.PI) p.angle += TAU;
      }
      return;
    }

    if (st.lungeCd > 0 || !st.preyNear) return;
    if (!RF.World || !RF.World.query) return;

    var range = LUNGE_RANGE_MULT * p.r;
    var best = null, bestD2 = range * range;
    try {
      var list = RF.World.query(p.x, p.y, range, null);
      if (list && list.length) {
        var heading = p.angle;
        for (var i = 0; i < list.length; i++) {
          var e = list[i];
          if (!eatEligible(p, e)) continue;
          var edx = num(e.x, 0) - p.x, edy = num(e.y, 0) - p.y;
          var d2 = edx * edx + edy * edy;
          if (d2 > bestD2) continue;
          if (Math.abs(angDelta(heading, Math.atan2(edy, edx))) > LUNGE_CONE) continue;
          bestD2 = d2; best = e;
        }
      }
    } catch (e) { warnOnce('World.query lunge', e); }

    if (!best) return;
    // Capture the POINT, not the entity: numbers only.
    st.lungeX = num(best.x, p.x);
    st.lungeY = num(best.y, p.y);
    st.lungeT = LUNGE_DUR;
    st.lungeCd = LUNGE_CD;
  }
  function stepMotion(p) {
    p.x += p.vx * STEP;
    p.y += p.vy * STEP;

    // 6.4: maze rock is solid for the player too. Push-out + velocity slide
    // BEFORE the world-edge clamps so a wall touch never reads as a snag.
    if (RF.World && RF.World.resolveBody) {
      try { RF.World.resolveBody(p, p.r, true); } catch (e) { warnOnce('World.resolveBody', e); }
    }

    // Rev 13: real breaches. The old -46 ceiling allowed a 46px hop; the arc
    // is now ballistic under gravity with a sky ceiling well above any
    // boosted launch (vy 1200 -> apex 800px).
    var minY = -900;
    if (p.x < p.r) { p.x = p.r; if (p.vx < 0) p.vx *= -0.3; }
    if (p.x > WORLD_W - p.r) { p.x = WORLD_W - p.r; if (p.vx > 0) p.vx *= -0.3; }
    if (p.y > WORLD_H - p.r) { p.y = WORLD_H - p.r; if (p.vy > 0) p.vy *= -0.3; }
    if (p.y < minY) { p.y = minY; if (p.vy < 0) p.vy *= -0.35; }

    var airborne = p.y < 0;
    if (airborne) {
      p.vy += 900 * STEP;                 // gravity on the jump arc
      if (!p.st.airborne) {
        // Breach OUT. 'breach' is Lane F's dedicated surface pool and it plays
        // its OWN sound, so the older 'splash' is only supplied when that pool
        // declined the emit. Otherwise the surface sounds twice.
        p.st.airborne = true;
        // Launch kick: a surfacing shark clears the water with a little extra
        // lift so a straight-up run reads as a jump, not a bob.
        if (p.vy < -120) p.vy *= 1.3;
        FX_OPT.count = 14; FX_OPT.up = true; FX_OPT.speed = Math.abs(p.vy); FX_OPT.angle = p.angle;
        if (fxEmit('breach', p.x, 0, FX_OPT) === 0) {
          fxEmit('bubbles', p.x, 0, FX_OPT);
          sfx('splash');
        }
      }
    } else if (p.st.airborne) {
      p.st.airborne = false;
      FX_OPT.count = 20; FX_OPT.up = false; FX_OPT.speed = Math.abs(p.vy); FX_OPT.angle = p.angle;
      if (fxEmit('breach', p.x, 0, FX_OPT) === 0) {
        fxEmit('bubbles', p.x, 0, FX_OPT);
        sfx('splash');
      }
    }
  }

  // Rig animation runs in the FIXED STEP, never as a tween, so the motion
  // stays locked to the sim and to hit-stop. All state is scalars on p.anim.
  function stepAnim(p) {
    if (p.st.eatPopT > 0) p.st.eatPopT -= STEP;
    if (p.st.jawSnapT > 0) p.st.jawSnapT -= STEP;

    var a = p.anim;
    var ctl = p.ctl;
    var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    var cap = num(ctl.speedCap, p.stat.speed) || 1;
    var f = clamp(sp / cap, 0, 1);              // 0..1 speed fraction
    var turnAbs = Math.abs(num(ctl.turnIn, 0));

    var hz = TAIL_HZ_IDLE + (TAIL_HZ_CRUISE - TAIL_HZ_IDLE) * f;
    if (ctl.boosting) hz += (TAIL_HZ_BOOST - TAIL_HZ_CRUISE) * clamp(f, 0.3, 1);
    a.tailPhase += hz * TAU * STEP;
    if (a.tailPhase > TAU) a.tailPhase -= TAU;
    a.tailAmp = TAIL_AMP_IDLE + (TAIL_AMP_CRUISE - TAIL_AMP_IDLE) * f
      + TAIL_AMP_TURN * turnAbs;

    a.pectPhase += PECT_HZ * TAU * STEP;
    if (a.pectPhase > TAU) a.pectPhase -= TAU;

    var wantBank = clamp(num(ctl.turnIn, 0), -1, 1) * BANK_MAX * (0.4 + 0.6 * f);
    a.bank += (wantBank - a.bank) * damp(BANK_EASE, STEP);
    if (a.bank > BANK_MAX) a.bank = BANK_MAX;
    else if (a.bank < -BANK_MAX) a.bank = -BANK_MAX;

    // ---- r15 lane JAW: the bite cycle.
    //
    // What was here before computed `a.jaw` as an eased blend and then never
    // published it - `st.jawOpen` was not set, so shark3d's animate() read
    // `input.jawOpen === undefined`, took 0, and the rendered gape collapsed
    // to the constant rest gape. Measured on the real game (see
    // hse/evidence/r15-jaw): the reef jaw sat at EXACTLY 26.00 deg for every
    // frame of a 15 s run, including the frames where preyNear was true. The
    // owner's "sharks with open jaws never shut them" was that number - a
    // frozen yawn, not an animation that failed to close.
    //
    // It is now an explicit envelope over normalized gape (0 shut, 1 wide),
    // driven off the SAME eat event the feedback chain uses, so the jaw and
    // the hit-stop/popup/flash cannot drift apart:
    //
    //   idle   rest gape with a slow breathing oscillation
    //   open   snap to JAW_BITE_OPEN over JAW_T_OPEN
    //   close  drive to JAW_BITE_CLOSE over JAW_T_CLOSE   <- the CLOSE frame
    //   hold   stay shut for JAW_T_HOLD
    //   back   ease to rest over JAW_T_BACK
    //
    // Retriggering mid-cycle restarts from the CURRENT angle rather than
    // snapping to 0 first, so a feeding frenzy chomps continuously instead of
    // popping. That is what `bc.from` is for.
    // Selftest harnesses build bare players; keep the cycle optional.
    if (!p.st.biteCycle) p.st.biteCycle = { phase: null, t: 0, from: JAW_REST, closeFrame: false, pending: null };
    var bc = p.st.biteCycle;
    if (typeof a.jawGape !== 'number') a.jawGape = JAW_REST;
    if (typeof a.jawBreathe !== 'number') a.jawBreathe = 0;
    a.jawBreathe += JAW_BREATHE_HZ * TAU * STEP;
    if (a.jawBreathe > TAU) a.jawBreathe -= TAU;
    var restGape = JAW_REST + Math.sin(a.jawBreathe) * JAW_BREATHE_AMP;

    if (bc.phase) {
      bc.t += STEP;
      var seg, target;
      if (bc.phase === 'open') { seg = JAW_T_OPEN; target = JAW_BITE_OPEN; }
      else if (bc.phase === 'close') { seg = JAW_T_CLOSE; target = JAW_BITE_CLOSE; }
      else if (bc.phase === 'hold') { seg = JAW_T_HOLD; target = JAW_BITE_CLOSE; }
      else { seg = JAW_T_BACK; target = restGape; }
      var k = seg > 0 ? clamp(bc.t / seg, 0, 1) : 1;
      // Smoothstep inside a segment: the snap still reads as a snap because
      // the segment is 60 ms, but the frame-to-frame delta stays bounded.
      var ks = k * k * (3 - 2 * k);
      a.jawGape = bc.from + (target - bc.from) * ks;
      if (k >= 1) {
        bc.from = a.jawGape;
        bc.t = 0;
        if (bc.phase === 'open') {
          bc.phase = 'close';
        } else if (bc.phase === 'close') {
          bc.phase = 'hold';
          // THE CLOSE FRAME. Everything the player reads as "I ate that" fires
          // here, one frame, not on contact: the prey is swallowed at contact
          // (the sim cannot defer that without desyncing the tier gate), but
          // the FEEDBACK is deferred to the moment the teeth actually meet.
          bc.closeFrame = true;
          fireBiteClose(p);
        } else if (bc.phase === 'hold') {
          bc.phase = 'back';
        } else {
          bc.phase = null;
          a.jawGape = restGape;
        }
      }
    } else {
      // Idle: ease toward the breathing rest gape rather than snapping onto
      // it, so the tail of a bite blends into the idle cycle seamlessly.
      a.jawGape += (restGape - a.jawGape) * damp(JAW_IDLE_EASE, STEP);
    }
    a.jawGape = clamp(a.jawGape, 0, 1);
    // Legacy radian mirror kept for the 2D/fallback rig, which reads a.jaw.
    a.jaw = a.jawGape * JAW_OPEN;

    if (f < IDLE_SPEED_F) {
      a.bobPhase += IDLE_BOB_HZ * TAU * STEP;
      if (a.bobPhase > TAU) a.bobPhase -= TAU;
      a.bob = Math.sin(a.bobPhase) * IDLE_BOB_PX * (1 - f / IDLE_SPEED_F);
    } else {
      a.bob *= 0.9;
    }

    // SPEC3D: drive RF.Art3D's animate() from the fixed step. The state bag is
    // reused; the lane must read it synchronously and must not retain it.
    var st = a.state;
    st.speedFrac = f;
    st.turn = num(ctl.turnIn, 0);
    st.bitePhase = p.st.chewFxCd > 0 ? clamp(p.st.chewFxCd / 0.12, 0, 1) : 0;
    st.jawSnapT = p.st.jawSnapT;
    // r15 lane JAW: THE gape signal, 0..1. This is the line whose absence made
    // the jaw a frozen yawn - shark3d reads input.jawOpen and got undefined.
    // `biting` stays false: the cycle below is the only jaw authority now, and
    // letting shark3d's own bite latch drive the bone too would be a second
    // writer on the same quaternion, which is the bug class this lane exists
    // to remove.
    st.jawOpen = a.jawGape;
    st.jawCycle = bc.phase;
    // The sharky toon base ships a real Swim_Bite clip and drives its jaw from
    // the mixer, not from the LowerJaw bone this lane writes. Latching `biting`
    // to the cycle's OPEN segment starts that clip on the SAME frame the
    // procedural cycle starts, so the two bases chomp together instead of the
    // clip firing off the old jawSnapT/bitePhase signals a beat later.
    st.biting = bc.phase === 'open';
    st.boosting = !!ctl.boosting;
    st.tailPhase = a.tailPhase; st.tailAmp = a.tailAmp;
    st.pectPhase = a.pectPhase; st.bank = a.bank; st.bob = a.bob;
    // Rev 6 / 6.2: rig state-bag additions this lane owns.
    st.vy = p.vy;
    st.preyNear = !!p.st.preyNear;
    st.lungeT = p.st.lungeT;
    if (p.rig && p.rig.animate) {
      try { p.rig.animate(ctx.time.now, st); } catch (e) { warnOnce('Art3D.animate', e); }
    }

    // ---- juice hooks (Lane F). All guarded; all no-ops if fx3d.js is out.
    // Bubble trail is throttled by DISTANCE, not by time, so it stays
    // consistent across speeds and does not spam at a standstill.
    if (!a.trailInit) { a.trailX = p.x; a.trailY = p.y; a.trailInit = true; }
    var tdx = p.x - a.trailX, tdy = p.y - a.trailY;
    if (tdx * tdx + tdy * tdy > 3200) {
      a.trailX = p.x; a.trailY = p.y;
      if (f > 0.18) {
        FX_OPT.count = ctl.boosting ? 3 : 1;
        FX_OPT.speed = sp;
        FX_OPT.angle = p.angle;
        FX_OPT.up = false;
        var wx = p.x - Math.cos(p.angle) * p.r;
        var wy = p.y - Math.sin(p.angle) * p.r;
        if (fxEmit('swimtrail', wx, wy, FX_OPT) === 0) fxEmit('bubbles', wx, wy, FX_OPT);
      }
    }
    // FIX-ROUND-3 item 6 (ONE BOOST EMITTER AUTHORITY): the engine-side
    // speedlines emitter is REMOVED here - fx3d owns boost visuals exclusively
    // now (it reads ctl.boosting itself), so two emitters never double up on
    // pool saturation or ribbon density.
  }

  // ---------------------------------------------------------- eating
  // Rev 6 / 6.7: megajaw folds into the SAME gate formula (+1 bite reach) so
  // there is exactly one eatable-tier rule in the whole file, buffed or not.
  function megajawBiteUp() {
    var b = ctx && ctx.run && ctx.run.buffs;
    return (b && b.megajaw > 0) ? MEGAJAW_BITE_UP : 0;
  }
  function megajawInstantBonus() {
    var b = ctx && ctx.run && ctx.run.buffs;
    return (b && b.megajaw > 0) ? MEGAJAW_INSTANT : 0;
  }

  function publishMouth(p) {
    var reach = p.r;
    var mr = p.mouthR;
    if (p.pas.wideBite) mr *= 1.55;
    MOUTH.x = p.x + Math.cos(p.angle) * reach;
    MOUTH.y = p.y + Math.sin(p.angle) * reach;
    MOUTH.r = mr * 1.6;
    // Rev 6 / 6.5: suction ramps 260 -> 900 while MOUTH.lunge is true (the
    // player is mid-lunge), so World can pull a captured target in harder.
    var lunging = p.st.lungeT > 0;
    MOUTH.lunge = lunging;
    MOUTH.strength = lunging ? 900 : 260;
    // 6.7: FRENZY MAGNET buff widens suction radius x2.5.
    var buffs = ctx && ctx.run && ctx.run.buffs;
    if (buffs && buffs.magnet > 0) MOUTH.r *= 2.5;
    // 6.6/6.7/12.4: eligibleTierMax mirrors the FULL gate formula, megajaw
    // and supersize included; MEGA GOLD RUSH makes everything eligible.
    var megaOn = ctx && ctx.run && ctx.run.mode === 'megaGoldRush';
    MOUTH.eligibleTierMax = (p.pas.junkEater || megaOn) ? 99
      : p.tier + BITE_UP_BASE + num(p.pas.biteUp, 0) + megajawBiteUp() + supersizeTierBonus();
    ctx.mouth = MOUTH;
  }

  function decayTargetBiteCooldowns() {
    var world = RF.World;
    if (!world || world.__decaysBiteCd === true) return;
    var entities = world.entities;
    if (!entities || !entities.length) return;
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      if (!e || typeof e._biteCd !== 'number' || e._biteCd <= 0) continue;
      e._biteCd -= STEP;
      if (e._biteCd < 0) e._biteCd = 0;
    }
  }

  function stepEat(p) {
    if (p.st.chewFxCd > 0) {
      p.st.chewFxCd -= STEP;
      if (p.st.chewFxCd < 0) p.st.chewFxCd = 0;
    }
    decayTargetBiteCooldowns();

    // Mouth sensor circle at the snout tip. Reused scratch, no allocation.
    publishMouth(p);
    var mx = MOUTH.x, my = MOUTH.y;
    var mr = MOUTH.r / 1.6;

    var list = null;
    if (RF.World && RF.World.eatQuery) {
      try { list = RF.World.eatQuery(mx, my, mr); }
      catch (e) {
        warnOnce('World.eatQuery', e);
        if (RF.World.query) {
          try { list = RF.World.query(mx, my, mr); } catch (err) { warnOnce('World.query', err); list = null; }
        }
      }
    } else if (RF.World && RF.World.query) {
      try { list = RF.World.query(mx, my, mr); } catch (e) { warnOnce('World.query', e); list = null; }
    }
    if (!list || !list.length) return;

    // World query methods return a SHARED scratch buffer only valid until the
    // next query, and this loop calls World.kill and Abilities.chargeFromEat,
    // either of which may query. Copy into a pre-allocated, reused array.
    var n = list.length;
    if (n > EAT_BUF.length) n = EAT_BUF.length;
    for (var c = 0; c < n; c++) EAT_BUF[c] = list[c];

    // REV10-EAT: eatEligible() below is the SAME predicate preyNear/lunge use
    // (kind exclusions + hazard/junkEater + megajaw-widened tier gate) - this
    // loop only adds its own TOO BIG cue on top of that shared eligibility.
    // Hungry Shark rule: everything eatEligible() admits swallows in ONE bite
    // on contact (see swallow() call below) - there is no more near-tier
    // "chew" phase for prey, so megajaw's separate instant-bonus split is
    // gone too (megajawBiteUp still widens eatEligible's tier gate itself).
    if (p.st.tooBigCd > 0) {
      p.st.tooBigCd = Math.max(0, p.st.tooBigCd - STEP);
    }
    for (var i = 0; i < n; i++) {
      var e = EAT_BUF[i];
      if (!e || !e.active || e === p || e.kind === 'player') continue;
      if (e.kind === 'pickup') { collectPickup(e); continue; }
      // Rev 6.11: buffpickup entities are NEVER edible/scored - stepPickups
      // (which now runs before this) owns their entire collection lifecycle.
      // If one is still present here (out of PICKUP_QUERY_R, or stepPickups
      // is unavailable) it must be skipped rather than falling into the
      // tier-based eat gate below as if it were tier-0 prey.
      if (e.kind === 'buffpickup') continue;
      // SPEC3D 7.6: relic/gempickup collectibles, never edible/scored as
      // prey. Guarded so the game runs before S2/S3 land spawning/data.
      if (e.kind === 'relic') { collectRelic(e); continue; }
      if (e.kind === 'gempickup') { collectGemPickup(e); continue; }

      var isHazard = e.kind === 'hazard';
      // Hazards are tier 99: only a junkEater shark may swallow them.
      if (isHazard && !p.pas.junkEater) continue;

      var eatable = eatEligible(p, e);
      if (!eatable) {
        // Rev 6 / 6.6: TOO BIG replaces the silent continue. 0.6s cd so a
        // school of oversized prey cannot spam the cue every frame.
        if (!isHazard && p.st.tooBigCd <= 0) {
          p.st.tooBigCd = TOO_BIG_CD;
          shake(2, 70);
          fxEmit('ring', e.x, e.y, { count: 1, scale: 0.8, tint: 0x445566 });
          CHEW_SFX_OPT.rate = 0.7;
          sfx('chomp', { rate: 0.7, vol: 0.5 });
          uiCall('toast', 'TOO BIG');
        }
        continue;
      }

      // Hungry Shark rule (owner-reported, verified on device): anything the
      // player is allowed to eat is eaten in ONE bite - it vanishes into the
      // mouth immediately. Only an over-tier "TOO BIG" target resists (that
      // gate already ran above via eatEligible/tooBigCd). instantBonus and
      // the old tier<=p.tier-1 near-tier split no longer gate a chew phase -
      // eatEligible() already IS the "can this shark eat it" gate, so every
      // target that reaches this line swallows on contact. No `chewy` flag
      // exists on any creature def in data.js (grepped, none), so there is
      // no armored/boss class left that still needs multiBite's per-target
      // HP drain for prey. Hazards keep their own isHazard branch above
      // (junkEater-only) and are unaffected by this change.
      swallow(e);
    }
  }

  function multiBite(e) {
    var p = ctx.player;
    if (typeof e._biteCd === 'number' && e._biteCd > 0) return;
    e._biteCd = 0.15;                      // 6.11: target-owned chew cd 0.25 -> 0.15s
    e.hp -= p.stat.bite * (liveMult(p, 'bite') / num(p.pas.mult.bite, 1));
    // Damage is per target. Feedback is player-side and deliberately shared by
    // the school so three simultaneous chews cannot machine-gun hit-stop/audio.
    if (p.st.chewFxCd <= 0) {
      p.st.chewFxCd = 0.12;
      p.st.jawSnapT = 0.18;
      hitStop(25);
      shake(3, 90);
      CHEW_SFX_OPT.rate = 0.94 + ctx.rng() * 0.12;
      sfx('chomp', CHEW_SFX_OPT);
      fxEmit('chomp', e.x, e.y, CHEW_FX_OPT);
    }
    if (e.hp <= 0) swallow(e);
  }

  // ---- r15 lane JAW: bite cycle trigger + deferred close-frame feedback.

  // Start (or RETRIGGER) the open-close-hold-return cycle.
  //
  // A retrigger inside an existing cycle does NOT reset the angle - it sets
  // `from` to wherever the jaw currently is and restarts the open segment from
  // there, so chomping through a school reads as continuous chewing instead of
  // the jaw popping back to a fixed pose on every fish.
  //
  // The impact record is merged rather than queued: several fish swallowed
  // inside one cycle produce ONE chomp beat, at the strongest meal's
  // intensity. Queuing them would machine-gun hit-stop, which is the exact
  // failure the chewFxCd cooldown exists to prevent elsewhere.
  function triggerBite(p, impact) {
    if (!p || !p.st) return;
    var bc = p.st.biteCycle;
    if (!bc) return;
    var a = p.anim;
    bc.from = (a && typeof a.jawGape === 'number') ? a.jawGape : JAW_REST;
    bc.phase = 'open';
    bc.t = 0;
    bc.closeFrame = false;
    var prev = bc.pending;
    if (!prev) { bc.pending = impact; return; }
    // Keep the biggest meal's read: it owns the hit-stop weight and the flash.
    if (num(impact.mealT, 0) >= num(prev.mealT, 0)) {
      prev.mealT = impact.mealT; prev.isSmallPrey = impact.isSmallPrey;
      prev.tint = impact.tint; prev.x = impact.x; prev.y = impact.y;
      prev.angle = impact.angle;
    }
    prev.chroma = Math.max(num(prev.chroma, 0), num(impact.chroma, 0));
    prev.shockScale = Math.max(num(prev.shockScale, 0), num(impact.shockScale, 0));
    prev.shockLife = Math.max(num(prev.shockLife, 0), num(impact.shockLife, 0));
    prev.popup = num(prev.popup, 0) + num(impact.popup, 0);
    prev.popupMult = prev.popupMult || impact.popupMult;
  }

  // Fired on the ONE frame the jaw finishes closing. Everything here is a
  // "the teeth just met" beat.
  function fireBiteClose(p) {
    var bc = p.st.biteCycle;
    var im = bc && bc.pending;
    bc.pending = null;
    if (!im) return;
    var mealT = num(im.mealT, 0);
    var small = !!im.isSmallPrey;
    sfx('chomp');
    hitStop(!small ? 45 : 15);
    if (RF.Fx && RF.Fx.eatShockwave) {
      EAT_SHOCKWAVE_OPT.tint = im.tint;
      EAT_SHOCKWAVE_OPT.tier = mealT;
      EAT_SHOCKWAVE_OPT.scale = num(im.shockScale, 1.1);
      EAT_SHOCKWAVE_OPT.life = num(im.shockLife, 420);
      EAT_SHOCKWAVE_OPT.chroma = num(im.chroma, 0);
      try { RF.Fx.eatShockwave(im.x, im.y, EAT_SHOCKWAVE_OPT); } catch (err) { warnOnce('Fx.eatShockwave', err); }
    }
    mergeOrSpawnPopup(im.x, im.y, im.popup, !!im.popupMult, ctx.time.now);
    triggerCamPulse(CAM_EAT_ZOOM * (0.5 + Math.min(0.5, mealT * 0.12)) * (small ? 0.5 : 1), 0.28);
    FX_OPT.count = 6 + mealT * 2; FX_OPT.angle = num(im.angle, p.angle); FX_OPT.speed = 320;
    FX_OPT.tint = im.tint; FX_OPT.up = false;
    fxEmit('speedlines', im.x, im.y, FX_OPT);
  }

  function swallow(e) {
    var p = ctx.player;
    var def = e.def || creatureById(e.defId) || null;
    var mult = comboMult();
    var score = num(def && def.score, 5);
    // Rev 12 / 12.4: coin multiplier follows the resolved MODE (2x Gold Rush,
    // 3x Mega Gold Rush per MODES config), not a flat FRENZY constant.
    var coinMult = ctx.run.mode === 'megaGoldRush' ? num(MODE_MEGA.coinMult, 3)
      : ctx.run.mode === 'goldRush' ? num(MODE_GOLD.coinMult, num(FRENZY.goldRushCoinMult, 2))
      : 1;

    // RF-COINS-01: ONE payout authority for player-eaten prey. Prey the PLAYER
    // swallows pays HERE, so the combo and Gold Rush multipliers apply. Zeroing
    // e.coins before World.kill makes world.js skip its pickup drop for this
    // entity only; kills the player did NOT cause keep their coins and are
    // still paid by world.js on collection.
    var coins = num(e.coins, num(def && def.coins, 1));

    ctx.run.score += Math.round(score * mult);
    ctx.run.coins += Math.round(coins * mult * coinMult);
    ctx.run.xp += Math.max(1, Math.round(score * 0.25));
    if (num(e.tier, 0) > ctx.run.biggestTier) ctx.run.biggestTier = num(e.tier, 0);

    // Blocker 1: eat + (cheap) score mission events. Score is reported here
    // rather than a separate hook - missionEvent's 'score' progress is
    // max()'d, not summed, so reporting it on every eat (the only place score
    // changes) is equivalent to a dedicated score-change hook.
    missionEvent('eat', { defId: e.defId });
    missionEvent('score', { score: ctx.run.score });

    p.hp = clamp(p.hp + (6 + num(e.tier, 0) * 3.2), 0, p.maxHp);

    if (RF.Abilities && RF.Abilities.chargeFromEat) {
      try { RF.Abilities.chargeFromEat(ctx, e); } catch (err) { warnOnce('Abilities.chargeFromEat', err); }
    }

    // EAT FEEDBACK parity with the 2D rev: two-stage burst in the prey's own
    // colors sized by the meal, a floating score popup at the bite point, a
    // jaw snap and a scale pop on the shark, and a hit-stop long enough to feel.
    var mealT = num(e.tier, 0);
    var preyTint = (e.def && e.def.tint) || 0xffe9a8;
    // FEEDBACK 2026-08-24: "tone it down" for small prey specifically - a
    // meal BELOW the shark's own tier shouldn't hit as hard as a same-tier
    // or bigger one. Declared up front so every rev11-fx lever below
    // (shockwave scale/life/chroma, hitStop, camera pulse) reads the SAME
    // bar - the same mealT >= p.tier "notable" bar spawnBuffDrop already
    // uses further down, just inverted.
    var isSmallPrey = mealT < p.tier;
    // Blocker 7: overwrite the hoisted scratch records in place - no fresh
    // option object is allocated per bite.
    EAT_DEATHBURST_OPT.count = 14 + mealT * 3;
    EAT_DEATHBURST_OPT.scale = 1 + mealT * 0.12;
    EAT_DEATHBURST_OPT.tint = preyTint;
    fxEmit('deathBurst', e.x, e.y, EAT_DEATHBURST_OPT);
    EAT_MOTES_OPT.count = 8 + mealT * 2;
    EAT_MOTES_OPT.tint = 0xffffff;
    fxEmit('motes', e.x, e.y, EAT_MOTES_OPT);
    EAT_GIB_OPT.count = 4 + Math.min(3, mealT);
    EAT_GIB_OPT.tint = preyTint;
    fxEmit('gib', e.x, e.y, EAT_GIB_OPT);
    // FIX-ROUND-3 item 6 (SPECTACLE WIRING): the staged bite FX fires on
    // EVERY completed bite (swallow() is the single completion point for both
    // instant swallows and multiBite's final kill), not only meals at or
    // above the shark's own tier - ordinary swallows are a signature event
    // too, not just the notable ones. {tier: mealT} lets fx3d pick the
    // tier-scaled staging instead of defaulting to tier 1.
    // r15 lane JAW: the shockwave + chroma flash are CLOSE-frame beats. They
    // are the "the jaw shut on it" punctuation, so they are recorded on the
    // impact and fired by fireBiteClose(). The deathBurst/motes/gib particles
    // above stay at contact - those read as the prey coming apart, which does
    // happen when the teeth reach it.
    var shockScale = 1.1, shockLife = 420, chromaNotable = false;
    if (RF.Fx && RF.Fx.eatShockwave) {
      // FEEDBACK 2026-08-24: rings/gibs scaled DOWN for small prey (a small
      // fish is now a tiny puff, not the same shockwave a big meal gets) -
      // uses the SAME isSmallPrey (mealT < p.tier) bar as hitStop/cam pulse
      // above, so "big prey" reads consistently across every lever.
      shockScale = isSmallPrey ? 0.55 : 1.1;
      shockLife = isSmallPrey ? 260 : 420;
      // Chroma screen-flash: NOT every minnow anymore, only combo milestones
      // or a big/same-tier meal - reuses the same "notable" bar spawnBuffDrop
      // uses below (mealT >= p.tier, or landing on the combo streak this eat
      // is ABOUT to land on - ctx.run.combo hasn't incremented yet here).
      chromaNotable = !isSmallPrey || (FRENZY.steps || []).indexOf(ctx.run.combo + 1) >= 0;
    }
    // r15 lane JAW: TRIGGER THE BITE CYCLE, and defer the impact beats to the
    // frame the teeth actually meet.
    //
    // Contact and "chomp" are not the same instant. The sim must resolve the
    // eat at contact (the tier gate, score, combo and World.kill all have to
    // happen now or the run desyncs), but hit-stop, the chroma flash and the
    // score popup are the player's read of the JAW SHUTTING, and firing them
    // at contact is why the feedback felt detached from the animation. They
    // are recorded here and dispatched by fireBiteClose() when the cycle
    // reaches its CLOSE frame, ~150 ms later.
    triggerBite(p, {
      x: e.x, y: e.y, mealT: mealT, isSmallPrey: isSmallPrey,
      chroma: chromaNotable ? 0.425 : 0, tint: preyTint,
      shockScale: shockScale, shockLife: shockLife,
      popup: Math.round(score * mult), popupMult: mult > 1,
      angle: p.angle,
    });
    p.st.jawSnapT = JAW_SNAP_T;           // Rev 6 / 6.5: 0.12 snap-close on swallow
    p.st.eatPopT = 0.16;                 // scale pop consumed by renderPlayer

    e.coins = 0;                          // suppress world.js's pickup drop
    // Rev 6.11: instant swallows (megajaw or plain tier<=p.tier-1) never run
    // multiBite's HP drain, so ent.hp can still read > 0 when World.kill fires
    // the frenzy hook below. Force it to 0 HERE, before that call, so
    // recordFrenzyKill's `ent.hp <= 0` gate sees a real kill and instant
    // swallows qualify for Blood Frenzy same as a multiBite kill would.
    e.hp = 0;
    if (RF.World && RF.World.kill) {
      try { RF.World.kill(e, 'eaten'); } catch (err) { warnOnce('World.kill', err); e.active = false; }
    } else { e.active = false; }

    ctx.run.combo++;
    // RF-BEST-01: Results wants the PEAK combo, not the streak at death.
    if (ctx.run.combo > num(ctx.run.comboPeak, 0)) ctx.run.comboPeak = ctx.run.combo;
    ctx.run.comboT = num(FRENZY.comboWindow, 3);
    // Rev 12 / 12.4: MEGA GOLD RUSH is a SECOND full meter chained while Gold
    // Rush is already running - eats/combo fill megaMeter instead of the
    // (already-pinned-at-1) primary frenzy meter during that window, so the
    // player can chain straight into Mega without the bar visibly emptying
    // first. Outside Gold Rush (including during Mega Gold Rush itself,
    // where a second chain is not spec'd) eats fill the normal meter.
    if (ctx.run.mode === 'goldRush') {
      ctx.run.megaMeter = clamp(num(ctx.run.megaMeter, 0) + num(FRENZY.meterPerEat, 0.06), 0, 1);
    } else if (ctx.run.mode !== 'megaGoldRush') {
      ctx.run.frenzy = clamp(ctx.run.frenzy + num(FRENZY.meterPerEat, 0.06), 0, 1);
    }
    queueComboChip();

    // Rev 6 / 6.7: notable kills may spawn a buff capsule. "Notable" is an
    // equal-or-bigger meal (tier >= p.tier, the same bar Blood Frenzy uses) OR
    // landing on a combo streak threshold. World owns spawning/drift entirely;
    // this is only the trigger call, and it is a complete no-op until Lane W
    // implements spawnBuffDrop.
    // FIX-ROUND-3 item 4: a 10s global engine-side cooldown gates the call
    // itself, so a burst of notable kills produces at most one capsule per
    // window instead of flooding (world lane's own live concurrency cap is
    // additive on top of this, not a replacement for it).
    if (RF.World && RF.World.spawnBuffDrop) {
      var notable = mealT >= p.tier || (FRENZY.steps || []).indexOf(ctx.run.combo) >= 0;
      var dropReady = (ctx.time.now - num(ctx.run._lastBuffDropAt, -Infinity)) >= BUFF_DROP_COOLDOWN;
      if (notable && dropReady) {
        try {
          // Stamp the cooldown ONLY when a capsule actually spawned - the
          // world side can refuse (live cap, placement), and a stamped miss
          // would suppress the next valid attempt for the whole window.
          var dropSpawned = RF.World.spawnBuffDrop(e.x, e.y);
          if (dropSpawned) ctx.run._lastBuffDropAt = ctx.time.now;
        } catch (err) { warnOnce('World.spawnBuffDrop', err); }
      }
    }
  }

  // RF-COINS-01, second half: COIN PICKUPS ARE WORLD.JS'S. pickupAI() runs the
  // magnet, the grab radius, the coin sfx and the payout. This path exists only
  // so stepEat does not treat a coin as food.
  function collectPickup(e) {
    return;
  }

  // SPEC3D 7.6: relic collectible. S2/data.js own placement/table; this lane
  // only owns the collection lifecycle so the game runs before those land.
  // Every field read is guarded/defaulted so an S2-shaped relic entity (with
  // zoneId/relicId) and a bare stub both collect safely.
  function collectRelic(e) {
    var r = ctx.run;
    if (!r.relics) r.relics = [];
    r.relics.push({
      zoneId: (e.zoneId !== undefined) ? e.zoneId : null,
      relicId: e.relicId || e.defId || null,
      x: e.x, y: e.y, t: ctx.time.now
    });
    // Blocker 1: relic mission event.
    missionEvent('relic', { zoneId: (e.zoneId !== undefined) ? e.zoneId : null });
    uiCall('toast', 'RELIC FOUND');
    sfx('relic');
    fxEmit('ring', e.x, e.y, { count: 1, scale: 1.2, tint: 0xff2bd6 });
    fxEmit('motes', e.x, e.y, { count: 10, tint: 0xff2bd6 });
    if (RF.Fx && RF.Fx.hologramFlash) {
      try { RF.Fx.hologramFlash(e.x, e.y, { tint: 0xff2bd6 }); } catch (err) { warnOnce('Fx.relicFlash', err); }
    }
    if (RF.World && RF.World.kill) {
      try { RF.World.kill(e, 'collected'); } catch (err) { warnOnce('World.kill relic', err); e.active = false; }
    } else { e.active = false; }
  }

  // SPEC3D 7.6: rare gem pickup, a separate world drop from frenzy/mission
  // gem awards. `value` defaults to 1 when data.js has not supplied one yet.
  function collectGemPickup(e) {
    var r = ctx.run;
    var value = num(e.value, num(e.gemValue, 1));
    r.gems = num(r.gems, 0) + value;
    uiCall('chip', '+' + value + ' GEM');
    sfx('gem');
    fxEmit('ring', e.x, e.y, { count: 1, scale: 1, tint: 0x9dff2b });
    fxEmit('elementSpark', e.x, e.y, { count: 6, tint: 0x9dff2b });
    if (RF.World && RF.World.kill) {
      try { RF.World.kill(e, 'collected'); } catch (err) { warnOnce('World.kill gempickup', err); e.active = false; }
    } else { e.active = false; }
  }

  // Rev 6 / 6.7: BUFF CAPSULE pickups are a separate collection path from the
  // coin pickup above - coins stay world.js's (RF-COINS-01), but the buff
  // capsule table (PICKUPS, Lane W/data.js) is new this round and world.js
  // may not implement collection for it at all yet. This lane owns the
  // lifecycle/economy per 6.7, so it queries for kind 'buffpickup' directly
  // and is fully guarded: no RF.World.query means no-op, no matching kind
  // means no-op, an unknown buff id means no-op.
  var PICKUP_QUERY_R = 120;
  function stepPickups(p) {
    if (!RF.World || !RF.World.query) return;
    var list = null;
    try { list = RF.World.query(p.x, p.y, PICKUP_QUERY_R + p.r, 'buffpickup'); }
    catch (e) { warnOnce('World.query buffpickup', e); return; }
    if (!list || !list.length) return;
    var n = Math.min(list.length, EAT_BUF.length);
    for (var c = 0; c < n; c++) EAT_BUF[c] = list[c];
    for (var i = 0; i < n; i++) {
      var e = EAT_BUF[i];
      if (!e || !e.active || e.kind !== 'buffpickup') continue;
      var dx = e.x - p.x, dy = e.y - p.y;
      var rr = p.r + num(e.r, 16);
      if (dx * dx + dy * dy > rr * rr) continue;
      // Rev 6.11 PICKUP ID SEAM: world writes e.buffId (plain id) on
      // buffpickup entities; engine reads e.buffId ONLY, no e.defId fallback.
      applyBuffPickup(e.buffId);
      if (RF.World.kill) {
        try { RF.World.kill(e, 'collected'); } catch (err) { warnOnce('World.kill buffpickup', err); e.active = false; }
      } else { e.active = false; }
    }
  }

  function applyBuffPickup(id) {
    var r = ctx.run;
    var b = r.buffs;
    switch (id) {
      case 'overdrive': maxTimer(b, 'overdrive', BUFF_DUR.overdrive); break;
      case 'shield': b.shield = Math.min(SHIELD_CHARGES, num(b.shield, 0) + SHIELD_CHARGES); break;
      case 'megajaw': maxTimer(b, 'megajaw', BUFF_DUR.megajaw); break;
      case 'magnet': maxTimer(b, 'magnet', BUFF_DUR.magnet); break;
      case 'chum': maxTimer(b, 'chum', BUFF_DUR.chum); break;
      case 'apex':
        maxTimer(b, 'apex', BUFF_DUR.apex);
        maxTimer(b, 'overdrive', BUFF_DUR.apex);
        maxTimer(b, 'megajaw', BUFF_DUR.apex);
        break;
      // Rev 12 / 12.4: SUPER SIZE / SHIELD / SPEED power-ups, sourced from
      // MODES.buffs (data.js) with the built-in defaults above as fallback.
      // 'buff_shield' is deliberately a SEPARATE charge counter (modeShield)
      // from the legacy 'shield' id above so the two pickup tables can never
      // stomp each other's charge count.
      case 'buff_supersize': maxTimer(b, 'supersize', num(SUPERSIZE_CFG.dur, 10)); break;
      case 'buff_shield':
        b.modeShield = Math.min(num(MODE_SHIELD_CFG.hits, 3),
          num(b.modeShield, 0) + num(MODE_SHIELD_CFG.hits, 3));
        break;
      case 'buff_speed': maxTimer(b, 'modeSpeed', num(MODE_SPEED_CFG.dur, 9)); break;
      default: return;   // unknown buff id: no-op, no cue
    }
    uiCall('chip', (id || 'BUFF').toUpperCase());
    sfx('buffpickup');
    fxEmit('ring', ctx.player.x, ctx.player.y, { count: 1, scale: 1.1, tint: 0x27e0ff });
    // 6.9 hologram materialize + lowest-priority vignette on collection.
    if (RF.Fx) {
      try {
        if (RF.Fx.hologramFlash) RF.Fx.hologramFlash(ctx.player.x, ctx.player.y, { tint: 0x27e0ff });
        if (RF.Fx.requestVignette) RF.Fx.requestVignette('buff', 1400);
      } catch (err) { warnOnce('Fx.buffPickupFx', err); }
    }
  }
  function maxTimer(obj, key, value) {
    if (!(value > 0)) return;
    if (num(obj[key], 0) < value) obj[key] = value;
  }

  // Rev 6 / 6.7: buff timer decay + the vignette/cue bus priority. Buffs are
  // the LOWEST rung: damage > frenzy > goldRush > buff, coordinated through
  // the same frenzyCue string so only one vignette ever shows.
  function stepBuffs() {
    var r = ctx.run;
    var b = r.buffs;
    var dt = STEP;
    // Timed buffs decay; a transition to 0 announces expiry through the
    // toast slot so buff end is never silent (review r3: persistent buff
    // readability).
    if (b.overdrive > 0) { b.overdrive -= dt; if (b.overdrive <= 0) { b.overdrive = 0; uiCall('chip', 'OVERDRIVE END'); } }
    if (b.megajaw > 0) { b.megajaw -= dt; if (b.megajaw <= 0) { b.megajaw = 0; uiCall('chip', 'MEGA-JAW END'); } }
    if (b.magnet > 0) { b.magnet -= dt; if (b.magnet <= 0) { b.magnet = 0; uiCall('chip', 'MAGNET END'); } }
    if (b.chum > 0) { b.chum -= dt; if (b.chum <= 0) { b.chum = 0; uiCall('chip', 'CHUM END'); } }
    if (b.apex > 0) { b.apex -= dt; if (b.apex <= 0) { b.apex = 0; uiCall('chip', 'APEX END'); } }
    // Rev 12 / 12.4: SUPER SIZE and mode SPEED are plain timers; mode SHIELD
    // is charge-based like the legacy shield and decays only when it
    // actually absorbs a hit (stepPlayerHits).
    if (b.supersize > 0) { b.supersize -= dt; if (b.supersize <= 0) { b.supersize = 0; uiCall('chip', 'SUPER SIZE END'); } }
    if (b.modeSpeed > 0) { b.modeSpeed -= dt; if (b.modeSpeed <= 0) { b.modeSpeed = 0; uiCall('chip', 'SPEED END'); } }

    // Rev 6 / 6.7: publish the CHUM CLOUD flag every step, in place.
    var p = ctx.player;
    var chumOn = b.chum > 0;
    ctx.chum.active = chumOn;
    if (p) { ctx.chum.x = p.x; ctx.chum.y = p.y; }

    // Buff cue is the lowest rung of the single-cue bus: only publish it when
    // no higher-priority frenzy cue is already showing (damage handled by the
    // separate hudHurt edge pulse, not frenzyCue).
    if (!r.frenzyCue) {
      // 'buff:<id>' is the ONLY buff cue form fx3d/ui3d accept (review r3:
      // the camelCase names were silently dropped by both validators).
      if (b.apex > 0) r.frenzyCue = 'buff:apex';
      else if (b.overdrive > 0) r.frenzyCue = 'buff:overdrive';
      else if (b.supersize > 0) r.frenzyCue = 'buff:supersize';
      else if (b.megajaw > 0) r.frenzyCue = 'buff:megajaw';
      else if (b.modeSpeed > 0) r.frenzyCue = 'buff:speed';
      else if (b.magnet > 0) r.frenzyCue = 'buff:magnet';
      else if (b.chum > 0) r.frenzyCue = 'buff:chum';
    }

    // Charge economy: earned every POWER_CHARGE_COMBO_STEP combo streak
    // (edge-triggered on crossing a new multiple), plus on frenzy completions
    // (Gold Rush announce and Golden School clear already call this).
    var comboStep = Math.floor(num(r.combo, 0) / POWER_CHARGE_COMBO_STEP);
    if (comboStep > num(r._lastComboCharge, 0)) {
      r._lastComboCharge = comboStep;
      grantPowerCharge(1);
    }
    r.powerCharges = clamp(num(r.powerCharges, 0), 0, POWER_CHARGE_CAP);
  }

  function grantPowerCharge(n) {
    var r = ctx.run;
    r.powerCharges = clamp(num(r.powerCharges, 0) + num(n, 1), 0, POWER_CHARGE_CAP);
  }

  // ------------------------------------------------------- predators
  // RF-HITS-01: world.js is the SINGLE collision authority for damage to the
  // player. It clears RF.World.playerHits at the top of its update and refills
  // it during the same update; this consumes the list in the SAME frame.
  function stepPlayerHits(p) {
    if (p.st.invulnT > 0) {
      p.st.invulnT -= STEP;
      if (p.st.invulnT < 0) p.st.invulnT = 0;
    }

    var hits = RF.World && RF.World.playerHits;
    if (!hits || !hits.length) return;

    // Rev 12 / 12.4: both goldRush and megaGoldRush are invulnerable per
    // MODES config (MODE_GOLD.invulnerable / MODE_MEGA.invulnerable both
    // true) - goldRushT > 0 exactly covers "any gold mode is running" since
    // it is the single shared timer both modes ride on, so this gate stays
    // one check instead of branching per mode.
    var invuln = p.st.invulnT > 0
      || ctx.run.goldRushT > 0
      || p.st.phaseT > 0
      || !!(RF.DevMode && RF.DevMode.state && RF.DevMode.state.forceInvincible);

    var total = 0, hx = p.x, hy = p.y, any = false;
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      if (!h) continue;
      var dmg = num(h.dmg, 0);
      if (dmg <= 0) continue;
      if (p.pas.armored) dmg *= 0.5;
      total += dmg;
      if (!any) { hx = num(h.x, p.x); hy = num(h.y, p.y); any = true; }
    }
    if (!any || invuln) return;

    // Rev 6 / 6.7: SHIELD BUBBLE absorbs 2 hits (charges), each hit event
    // (however many contacts landed this frame) consumes exactly one charge -
    // matching the "one damage event per frame" rule already in force here.
    var buffs = ctx.run.buffs;
    // Rev 12 / 12.4: modeShield (the new SHIELD power-up, MODES.buffs.shield)
    // absorbs first when both are stacked, then the legacy overdrive-table
    // 'shield' - two separate charge counters, one absorb per hit event,
    // same "one damage event per frame" rule the legacy path already used.
    if (buffs && buffs.modeShield > 0) {
      buffs.modeShield--;
      fxEmit('ring', p.x, p.y, { count: 1, scale: 1.2, tint: 0x27e0ff });
      sfx('shieldhit');
      return;
    }
    if (buffs && buffs.shield > 0) {
      buffs.shield--;
      fxEmit('ring', p.x, p.y, { count: 1, scale: 1.2, tint: 0x27e0ff });
      sfx('shieldhit');
      return;
    }

    // One damage event per frame however many contacts landed: the invuln
    // window is what stops a hazard cluster from deleting the player.
    hurt(total, hx, hy);
  }

  function hurt(dmg, hx, hy) {
    var p = ctx.player;
    p.hp -= dmg;
    p.st.invulnT = 0.9;                              // brief invuln blink
    hudHurt = 0.5;                                   // edge pulse, owned by UI
    hitStop(60);
    shake(7, 180);
    sfx('hurt');
    fxEmit('deathBurst', p.x, p.y, { count: 6, tint: 0xff5a5a });
    // Visual grammar law (6.6): RED = the player is hurt. Damage is the top
    // rung of the single-vignette bus.
    if (RF.Fx && RF.Fx.requestVignette) {
      try { RF.Fx.requestVignette('damage', 700); } catch (err) { warnOnce('Fx.damageVignette', err); }
    }
    // Combo is a feeding streak: taking a hit breaks it.
    ctx.run.combo = 0;
    ctx.run.comboT = 0;
  }
  var hudHurt = 0;

  // ---------------------------------------------------------- hunger
  function stepHunger(p) {
    // RF-PASSIVE-01: slowMetab is a BOOLEAN in the resolver; the NUMBER lives
    // in statMults.metab, which liveMult reads.
    var drain = p.stat.metab * liveMult(p, 'metab') * num(BAL.metabScale, 1);

    // Zone pressure: below your depth grade the metabolism triples. Tier 9 and
    // above, or a pressureImmune shark, ignore it entirely.
    if (p.tier < 9 && !p.pas.pressureImmune) {
      var z = null;
      if (RF.World && RF.World.zoneAt) {
        try { z = RF.World.zoneAt(p.y); } catch (e) { warnOnce('World.zoneAt', e); }
      }
      if (!z) z = zoneAtFallback(p.y);
      if (z && num(z.pressureTier, 0) > p.tier) drain *= 2;   // 6.11: 3 -> 2
    }
    p.hp -= drain * STEP;
  }

  // ------------------------------------------------- combo / frenzy
  function frenzyPackAlive(packId) {
    if (!packId || !RF.World || !RF.World.entities) return false;
    var list = RF.World.entities;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e && e.active && e.st && num(e.st.packId, 0) === packId) return true;
    }
    return false;
  }

  function markGoldenPack(c, ent) {
    var r = c && c.run;
    var st = ent && ent.st;
    var packId = st ? (num(st.packId, 0) | 0) : 0;
    if (!r || !packId || r._goldenRolledPackId === packId) return;
    r._goldenRolledPackId = packId;

    var golden = !!(c.rng && c.rng() < num(FRENZY2.golden && FRENZY2.golden.chance, 0.02)
      && (!r.golden.packId || r.golden.packId === packId));
    if (golden) {
      r.golden.packId = packId;
      r.golden.eaten = 0;
      r.golden.deadline = c.time.now + num(FRENZY2.golden.deadline, 10);
    }

    var list = RF.World && RF.World.entities;
    if (!list) {
      ent._tint = golden ? FRENZY_GOLD_TINT : 0;
      ent._goldenPackId = golden ? packId : 0;
      return;
    }
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !e.st || (num(e.st.packId, 0) | 0) !== packId) continue;
      e._tint = golden ? FRENZY_GOLD_TINT : 0;
      e._goldenPackId = golden ? packId : 0;
    }
    ent._tint = golden ? FRENZY_GOLD_TINT : 0;
    ent._goldenPackId = golden ? packId : 0;
  }

  function frenzyGoldenComplete(c, packId) {
    var r = c.run;
    r.coins += Math.round(num(FRENZY2.golden.coinBurst, 250));
    r.frenzy = 1;
    r.goldRush.meter = 1;
    r.golden.packId = 0;
    r.golden.eaten = 0;
    r.golden.deadline = 0;
    // The FX lane owns the visual edge pulse. Publish one edge-triggered cue
    // through the shared bus on the next fixed step instead of emitting a
    // second goldpulse directly from the completion path.
    r._goldenCuePending = true;
    uiCall('chip', 'GOLDEN SCHOOL');
    uiCall('toast', 'Golden School cleared!');
    // Rev 6 / 6.7: frenzy completions earn a superpower charge.
    grantPowerCharge(1);
  }

  function recordFrenzyKill(c, ent, cause) {
    var r = c && c.run;
    var p = c && c.player;
    if (!r || !p || !ent || !ent.active) return;
    // Defensive: installFrenzyHooks wraps RF.World.kill for the lifetime of
    // the page (guarded, once), so ANY later caller that drives World.kill
    // against a hand-built ctx.run lacking the full Rev 3 schema (e.g. a
    // sibling module's own selftest fixture, {score, coins} only) must
    // degrade safely here rather than throw on a missing .golden/.school.
    if (!r.golden) r.golden = { packId: 0, eaten: 0, deadline: 0 };
    var st = ent.st;
    var packId = st ? (num(st.packId, 0) | 0) : 0;
    if (cause === 'eaten' && ent.kind !== 'pickup' && ent.kind !== 'hazard') {
      markGoldenPack(c, ent);
      // swallow() has already applied its authored base heal by the time its
      // World.kill call reaches this bridge. Add only the bonus delta here so
      // direct swallow callers see the same clamped result immediately.
      var healBonus = num(BAL.eatHealBonus, 1);
      if (healBonus !== 1) {
        p.hp = clamp(p.hp + (6 + num(ent.tier, 0) * 3.2) * (healBonus - 1), 0, p.maxHp);
      }
      if (r.golden.packId === packId && packId) {
        r.golden.eaten++;
      }
      if (FRENZY_EAT_N < FRENZY_EAT_CAP) {
        FRENZY_EAT_PACK[FRENZY_EAT_N] = packId;
        // FIX-ROUND-3 item 5 (BLOOD FRENZY THRESHOLD): equal-or-bigger meal
        // required until the player reaches tier 4, then a tier-1 grace opens
        // up (tier >= p.tier - 1) so Blood Frenzy stays reachable as content
        // thins out at higher tiers without overfiring in the first minute
        // at low tiers, where the flat tier-1 grace made it fire on chaff.
        var pTierBF = num(p.tier, 1);
        // Cap at the roster's max PREY tier (10): a tier-12 shark's formula
        // value (11) is otherwise unreachable in shipped content and endgame
        // Blood Frenzy silently disappears (review r3).
        var bloodThreshold = Math.min(pTierBF >= 4 ? pTierBF - 1 : pTierBF, 10);
        FRENZY_EAT_BLOOD[FRENZY_EAT_N] = num(ent.tier, 0) >= bloodThreshold
          && num(ent.hp, 1) <= 0;
        FRENZY_EAT_TIER[FRENZY_EAT_N] = num(ent.tier, 0);
        FRENZY_EAT_COMBO_T[FRENZY_EAT_N] = num(r.comboT, 0);
        // Rev 6 / 6.6: the PREY position, captured as numbers (pooled
        // entities recycle - never retain ent itself past this call).
        FRENZY_EAT_X[FRENZY_EAT_N] = num(ent.x, p.x);
        FRENZY_EAT_Y[FRENZY_EAT_N] = num(ent.y, p.y);
        FRENZY_EAT_N++;
      }
    } else if (cause !== 'eaten' && ent._goldenPackId
        && r.golden.packId === ent._goldenPackId) {
      // A despawn or other non-player kill voids Golden School silently.
      r.golden.packId = 0;
      r.golden.eaten = 0;
      r.golden.deadline = 0;
    }
  }

  function installFrenzyHooks() {
    var w = RF.World;
    if (w && typeof w.kill === 'function' && !w.kill.__rfFrenzyHook) {
      var oldKill = w.kill;
      var hookedKill = function (ent, cause) {
        var c = RF.ctx;
        recordFrenzyKill(c, ent, cause);
        var out = oldKill(ent, cause);
        var r = c && c.run;
        if (c && r && cause === 'eaten' && ent && ent._goldenPackId
            && r.golden.packId === ent._goldenPackId
            && !frenzyPackAlive(ent._goldenPackId)) {
          frenzyGoldenComplete(c, ent._goldenPackId);
        }
        return out;
      };
      hookedKill.__rfFrenzyHook = true;
      w.kill = hookedKill;
    }
    var a = RF.Abilities;
    if (a && typeof a.update === 'function' && !a.update.__rfFrenzyHook) {
      var oldUpdate = a.update;
      var hookedUpdate = function (c) {
        var out = oldUpdate.call(a, c);
        applyFrenzyMults(c);
        return out;
      };
      hookedUpdate.__rfFrenzyHook = true;
      a.update = hookedUpdate;
    }
  }

  function applyFrenzyMults(c) {
    var p = c && c.player;
    var r = c && c.run;
    var mult = p && p.st && p.st.statMults;
    if (!p || !r || !mult) return;

    var baseSpeed = num(r._frenzyBaseSpeed, num(mult.speed, 1));
    var baseBite = num(r._frenzyBaseBite, num(mult.bite, 1));
    if (!r._frenzyApplied || Math.abs(num(mult.speed, 1) - num(r._frenzyAppliedSpeed, 1)) > 1e-9) {
      baseSpeed = num(mult.speed, 1);
    }
    if (!r._frenzyApplied || Math.abs(num(mult.bite, 1) - num(r._frenzyAppliedBite, 1)) > 1e-9) {
      baseBite = num(mult.bite, 1);
    }
    // Rev 12 / 12.4: Gold/Mega Gold Rush speed moved OUT of this multiplier
    // (it is now applied once, cleanly, in stepControl's speedCap via
    // ctx.run.mode) so it is never double-applied on top of this one. Blood
    // Frenzy speed stays here unchanged - it is the only frenzy left that
    // owns this statMults.speed path.
    var bloodOn = r.blood.t > 0;
    var bloodSpeed = bloodOn ? num(FRENZY2.blood.speed, 1.2) : 1;
    mult.speed = baseSpeed * bloodSpeed;
    mult.bite = baseBite * (bloodOn ? num(FRENZY2.blood.bite, 1.5) : 1);
    r._frenzyBaseSpeed = baseSpeed;
    r._frenzyBaseBite = baseBite;
    r._frenzyAppliedSpeed = mult.speed;
    r._frenzyAppliedBite = mult.bite;
    r._frenzyApplied = true;
  }

  function announceFrenzy(label, toastText) {
    uiCall('chip', label);
    uiCall('toast', toastText);
  }

  function processFrenzyEvents(r) {
    var p = ctx.player;
    var bloodDur = num(FRENZY2.blood.dur, 6);
    var bloodTriggered = false;
    var schoolTriggered = false;
    for (var i = 0; i < FRENZY_EAT_N; i++) {
      // FIX-ROUND-3 item 5: no re-trigger refresh while blood.t > 2 - a
      // qualifying bite mid-window no longer restarts the announce/FX/rfFlash
      // cycle every single kill, only once the window has decayed past the
      // 2s floor.
      if (FRENZY_EAT_BLOOD[i] && !(r.blood.t > 2)) {
        r.blood.t = bloodDur;
        bloodTriggered = true;
        // Blocker 2: increment exactly once at this completion edge.
        if (!r.frenzyCompletions) r.frenzyCompletions = { goldrush: 0, blood: 0, school: 0 };
        r.frenzyCompletions.blood = num(r.frenzyCompletions.blood, 0) + 1;
        // Rev 6 / 6.6: ONE-SHOT crimson deathBurst at the PREY position (not
        // the player). The old player-attached sustained mist loop is DELETED
        // here on the engine side; fx3d's matching player-mist pool removal
        // is Lane F's half of this same law.
        FRENZY_FX_OPT.count = 22;
        FRENZY_FX_OPT.tint = 0xb3122a;
        FRENZY_FX_OPT.tint2 = 0x5a0812;
        FRENZY_FX_OPT.scale = 1.3;
        fxEmit('deathBurst', FRENZY_EAT_X[i], FRENZY_EAT_Y[i], FRENZY_FX_OPT);
        announceFrenzy('BLOOD FRENZY', 'Blood Frenzy: bite and speed up');
        // 6.9 spectacle: electric arc crackle over the shark for the frenzy
        // window (Lane A's reversible emissive hook; no shader variant).
        var rig = p.rig && p.rig.group;
        var flash = rig && rig.userData && rig.userData.rfFlash;
        if (flash) {
          try { flash(0x9dff2b, bloodDur, 0.55); } catch (err) { warnOnce('rfFlash', err); }
        }
      }

      var packId = FRENZY_EAT_PACK[i] | 0;
      if (!packId) continue;
      var s = r.school;
      if (s.packId !== packId || !(FRENZY_EAT_COMBO_T[i] > 0)) {
        s.packId = packId;
        s.count = 1;
      } else {
        s.count++;
      }
      if (s.count >= num(FRENZY2.school.count, 4) && r._schoolTriggeredPackId !== packId) {
        r._schoolTriggeredPackId = packId;
        // Blocker 2: increment exactly once at this completion edge.
        if (!r.frenzyCompletions) r.frenzyCompletions = { goldrush: 0, blood: 0, school: 0 };
        r.frenzyCompletions.school = num(r.frenzyCompletions.school, 0) + 1;
        s.swirlT = num(FRENZY2.school.swirlT, 5);
        ctx.schoolSwirl.packId = packId;
        ctx.schoolSwirl.t = s.swirlT;
        FRENZY_FX_OPT.count = 1;
        FRENZY_FX_OPT.tint = 0x74eaff;
        FRENZY_FX_OPT.scale = 1.2;
        fxEmit('ring', p.x, p.y, FRENZY_FX_OPT);
        schoolTriggered = true;
      }
    }
    if (schoolTriggered) announceFrenzy('SCHOOL FRENZY', 'School Frenzy: the shoal is swirling');
    FRENZY_EAT_N = 0;
    return bloodTriggered || schoolTriggered;
  }

  function scaleSchoolCooldowns(r) {
    var rate = num(FRENZY2.school.eatRate, 1.3);
    if (!(r.school.swirlT > 0) || !(rate > 1)) return;
    var p = ctx.player;
    if (p && p.st) {
      var cd = num(p.st.biteCd, 0);
      var seen = num(r._schoolPlayerCd, 0);
      if (cd > seen + 1e-9) cd /= rate;
      p.st.biteCd = cd;
      r._schoolPlayerCd = cd;
    }
    var list = RF.World && RF.World.entities;
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e) continue;
      var ecd = num(e._biteCd, 0);
      var eseen = num(e._schoolCdSeen, 0);
      if (ecd > eseen + 1e-9) ecd /= rate;
      e._biteCd = ecd;
      e._schoolCdSeen = ecd;
    }
  }

  function updateFrenzyCue(r) {
    var cue = r._goldenCuePending ? 'golden'
      : r.goldRushT > 0 ? 'goldRush' : r.blood.t > 0 ? 'blood'
      : r.school.swirlT > 0 ? 'school' : '';
    if (r._goldenCuePending) r._goldenCuePending = false;
    if (cue === r.frenzyCue) return;
    r.frenzyCue = cue;
    if (cue === 'blood') musicLayer('danger');
    else if (cue === 'school') musicLayer('calm');
    else if (cue === 'golden' || cue === 'goldRush') musicLayer('goldrush');
    else musicLayer(musicState === 'danger' ? 'danger' : 'calm');
  }

  function stepCombo() {
    if (ctx.run.comboT > 0) {
      ctx.run.comboT -= STEP;
      if (ctx.run.comboT <= 0) { ctx.run.comboT = 0; ctx.run.combo = 0; }
    }
  }

  function stepFrenzy() {
    var r = ctx.run;
    if (r.blood.t > 0) {
      r.blood.t -= STEP;
      if (r.blood.t < 0) r.blood.t = 0;
    }
    if (r.school.swirlT > 0) {
      r.school.swirlT -= STEP;
      if (r.school.swirlT < 0) r.school.swirlT = 0;
    }
    if (r.golden.packId && ctx.time.now >= r.golden.deadline) {
      r.golden.packId = 0;
      r.golden.eaten = 0;
      r.golden.deadline = 0;
    }
    processFrenzyEvents(r);
    if (r.school.swirlT > 0) {
      ctx.schoolSwirl.packId = r.school.packId;
      ctx.schoolSwirl.t = r.school.swirlT;
    } else {
      ctx.schoolSwirl.packId = 0;
      ctx.schoolSwirl.t = 0;
    }
    scaleSchoolCooldowns(r);
    if (r.goldRushT > 0) {
      r.goldRushT -= STEP;
      if (r.goldRushT <= 0) {
        r.goldRushT = 0;
        r.frenzy = 0;
        r.megaMeter = 0;
        r.goldRush.meter = 0;
        r.goldRush.t = 0;
        r._goldRushAnnounced = false;
        r._megaAnnounced = false;
        r.mode = '';
        musicLayer(musicState === 'danger' ? 'danger' : 'calm');
      }
    } else if (r.frenzy >= 1) {
      r.goldRushT = num(FRENZY.goldRushDur, num(MODE_GOLD.dur, 8));
      r.frenzy = 1;
      r.goldRush.meter = 1;
      r.goldRush.t = r.goldRushT;
      r.mode = 'goldRush';
      if (!r._goldRushAnnounced) {
        r._goldRushAnnounced = true;
        announceFrenzy(num(MODE_GOLD.banner, 'GOLD RUSH!'), 'Gold Rush: score and coins doubled');
        uiCall('notice', num(MODE_GOLD.banner, 'GOLD RUSH!'));
        // Blocker 2: increment exactly once at this completion edge.
        if (!r.frenzyCompletions) r.frenzyCompletions = { goldrush: 0, blood: 0, school: 0 };
        r.frenzyCompletions.goldrush = num(r.frenzyCompletions.goldrush, 0) + 1;
        // Rev 6 / 6.7: frenzy completions earn a superpower charge.
        grantPowerCharge(1);
      }
      musicLayer('goldrush');
      sfx('goldrush');
      shake(6, 240);
    }
    // Rev 12 / 12.4: MEGA GOLD RUSH chains from a SECOND full meter reached
    // during Gold Rush (megaMeter, filled by swallow() above). Reaching 1
    // upgrades the CURRENT Gold Rush window in place - mode flips to
    // 'megaGoldRush', goldRushT is topped up to the mega duration (never
    // shortened if more of the original window remained), and megaMeter
    // resets so a third chain is not spec'd but the field stays well-formed.
    if (r.mode === 'goldRush' && r.megaMeter >= 1) {
      r.mode = 'megaGoldRush';
      r.megaMeter = 0;
      r.goldRushT = Math.max(r.goldRushT, num(MODE_MEGA.dur, 10));
      if (!r._megaAnnounced) {
        r._megaAnnounced = true;
        announceFrenzy(num(MODE_MEGA.banner, 'MEGA GOLD RUSH!'), 'Mega Gold Rush: everything is edible');
        uiCall('notice', num(MODE_MEGA.banner, 'MEGA GOLD RUSH!'));
        grantPowerCharge(1);
      }
      shake(9, 320);
      sfx('goldrush');
    }
    // goldRush.meter is HUD/audio-facing: the CHAIN meter (megaMeter) while
    // any gold mode is running (so the HUD gold bar shows progress toward
    // the next chain step), the primary frenzy meter otherwise.
    r.goldRush.meter = r.mode ? r.megaMeter : r.frenzy;
    r.goldRush.t = r.goldRushT;
    applyFrenzyMults(ctx);
    updateFrenzyCue(r);
    if (r.slowmoT > 0) {
      r.slowmoT -= STEP;
      if (r.slowmoT <= 0) { r.slowmoT = 0; r.timeScale = 1; }
    }
  }

  function stepMusic(p) {
    if (ctx.run.goldRushT > 0) return;               // gold rush owns the bus
    var danger = false;
    if (RF.World && RF.World.query) {
      try {
        var near = RF.World.query(p.x, p.y, 500, 'predator');
        if (near) {
          for (var i = 0; i < near.length; i++) {
            if (near[i] && near[i].active && near[i].kind === 'predator'
              && num(near[i].tier, 0) > p.tier) { danger = true; break; }
          }
        }
      } catch (e) { warnOnce('World.query music', e); }
    }
    var want = danger ? 'danger' : 'calm';
    if (want !== musicState) {
      musicState = want;
      musicLayer(want);
    }
  }

  function comboMult() {
    var steps = FRENZY.steps || [3, 6, 10];
    var mults = FRENZY.mults || [1, 2, 3, 5];
    var c = ctx.run.combo;
    var m = mults[0] || 1;
    for (var i = 0; i < steps.length; i++) if (c >= steps[i]) m = mults[i + 1] || m;
    return m;
  }

  // Combo chips: queued, one at a time, handed to the DOM UI. Only meaningful
  // thresholds are announced, so the queue cannot flood.
  function queueComboChip() {
    var c = ctx.run.combo;
    var steps = FRENZY.steps || [3, 6, 10];
    if (steps.indexOf(c) < 0) return;
    boundedPush(comboQueue, 'x' + comboMult() + ' COMBO', 4);
    triggerCamPulse(CAM_EAT_ZOOM, CAM_EAT_ZOOM_T);
  }

  // ----------------------------------------------------------- death
  function onDeath() {
    var p = ctx.player;
    if (p.pas.undying && !p.st.usedUndying) {
      // undying: one free revive, then the passive is spent for the run.
      p.st.usedUndying = true;
      p.hp = p.maxHp * 0.35;
      p.st.invulnT = 2.2;
      shake(10, 400);
      fxEmit('ring', p.x, p.y, { count: 1 });
      return;
    }
    dying = true;
    p.active = false;
    triggerCamPulse(CAM_DEATH_PULL, CAM_DEATH_PULL_T);
    sfx('death');
    shake(12, 500);
    fxEmit('deathBurst', p.x, p.y, { count: 24 });
    // RF-CHRONO-01: RF.Juice.slowmo(scale, ms) only QUEUES the request;
    // consumeSlowmo() hands it back, so juice.js stays the authority on what
    // actually applies.
    var sm = null;
    if (RF.Juice && RF.Juice.slowmo) {
      try {
        RF.Juice.slowmo(0.32, 1200);
        if (RF.Juice.consumeSlowmo) sm = RF.Juice.consumeSlowmo();
      } catch (e) { warnOnce('Juice.slowmo', e); }
    }
    ctx.run.timeScale = sm && isFinite(sm.scale) ? clamp(sm.scale, 0.05, 1) : 0.32;
    ctx.run.slowmoT = sm && isFinite(sm.ms) ? clamp(sm.ms / 1000, 0.1, 5) : 1.2;

    // Off the fixed-step clock, not setTimeout: a paused tab must not advance
    // the death sequence.
    deathAt = ctx.time.now;
    pendingResults = true;
  }

  function finishRun() {
    pendingResults = false;
    // Ability state is torn down BEFORE the screen changes. A death during
    // Chrono or Phase otherwise leaks its time scale and its invulnerability
    // into the next run.
    abilitiesReset();
    var payload = null;
    if (RF.Meta && RF.Meta.endRun) {
      try { payload = RF.Meta.endRun(ctx); } catch (e) { warnOnce('Meta.endRun', e); }
    }
    if (!payload) {
      // Degraded: bank the run locally so coins are not silently lost.
      profile.coins = num(profile.coins, 0) + ctx.run.coins;
      profile.xp = num(profile.xp, 0) + ctx.run.xp;
      profile.runs = num(profile.runs, 0) + 1;
      if (!profile.best || typeof profile.best !== 'object') profile.best = { score: 0, biggestTier: 0 };
      if (ctx.run.score > num(profile.best.score, 0)) profile.best.score = ctx.run.score;
      if (ctx.run.biggestTier > num(profile.best.biggestTier, 0)) profile.best.biggestTier = ctx.run.biggestTier;
      commitProfile();
      payload = {
        score: ctx.run.score, coins: ctx.run.coins, xp: ctx.run.xp,
        levelUps: 0, unlocks: [], biggestTier: ctx.run.biggestTier,
        bestCombo: num(ctx.run.comboPeak, 0),
        best: { score: num(profile.best.score, 0), biggestTier: num(profile.best.biggestTier, 0) },
        level: num(profile.level, 1), xpInto: 0, xpNeed: 1,
        dailyBonus: false, bonusCoins: 0, baseCoins: ctx.run.coins
      };
    }
    ctx.run.timeScale = 1;
    endRun();
    // Lane C3 owns the results screen. Without it the run simply returns to a
    // fresh menu state and the payload is still available on RF.Game.
    RF.Game.lastResults = payload;
    if (!uiCall('showResults', payload)) uiCall('showMenu');
  }

  // ATMO-01 / Rev 2: hand the light references to the atmosphere owner. Two
  // channels because the lanes are concurrent: ctx.lights is always present
  // (World.init reads it), and RF.World.setLights() is the explicit setter if
  // that lane prefers one. Both are guarded; a lane implementing neither still
  // gets working lights, it simply will not lerp them per zone.
  function handOffLights() {
    if (RF.World && RF.World.setLights) {
      try { RF.World.setLights(LIGHTS); } catch (e) { warnOnce('World.setLights', e); }
    }
  }

  // ORCH-01 (engine side): assert the dependency graph this module actually
  // needs, ONCE at boot. console.error lists what is missing and boot
  // continues - every cross-namespace call in this file is already guarded and
  // degrades, so a missing lane is a downgraded game, never a crash. No throw.
  var REQUIRED_NS = ['World', 'Fx', 'Art3D', 'UI'];
  var OPTIONAL_NS = ['Juice', 'Sound', 'Music', 'Abilities', 'Meta', 'DevMode'];
  function assertDeps() {
    var missReq = [], missOpt = [], i;
    for (i = 0; i < REQUIRED_NS.length; i++) {
      if (!RF[REQUIRED_NS[i]]) missReq.push('RF.' + REQUIRED_NS[i]);
    }
    for (i = 0; i < OPTIONAL_NS.length; i++) {
      if (!RF[OPTIONAL_NS[i]]) missOpt.push('RF.' + OPTIONAL_NS[i]);
    }
    if (!root.RFD || !(root.RFD.SHARKS || []).length) missReq.push('RFD (data.js tables)');
    if (typeof THREE === 'undefined' || !THREE.Scene) missReq.push('three');
    if ((missReq.length || missOpt.length) && root.console && console.error) {
      console.error('[Razorfin] engine3d dependency check: missing required ['
        + (missReq.join(', ') || 'none') + '] optional ['
        + (missOpt.join(', ') || 'none') + ']. Boot continues degraded.');
    }
    return { required: missReq, optional: missOpt, ok: missReq.length === 0 };
  }

  // ================================================== run lifecycle
  function startRun(sharkId) {
    // ART-01/6.1: dolly is length-proportional now, so resolve the actual
    // rendered length rather than tier. camZForTier is kept working (it now
    // looks the def up by tier internally) for any other caller, but this is
    // the one call site with the def already in hand, so it goes straight to
    // camZForLen and skips the extra tier round-trip.
    try {
      var _d = (RFD.SHARK_BY_ID && RFD.SHARK_BY_ID[sharkId]) || null;
      CAM_Z = camZForLen(_d ? sharkLenPx(_d) : SHARK_LEN_PX);
    } catch (e) { CAM_Z = CAM_Z_MAX; }
    if (running) endRun();
    runCount++;
    dying = false; pendingResults = false; deathAt = 0;
    acc = 0; freezeMs = 0; hudHurt = 0;
    comboQueue.length = 0;
    musicState = 'calm';
    // Blocker 1: fresh per-run zoneTime accumulator (object is reused/cleared
    // in place, not reallocated, matching the module's no-per-step-alloc law
    // - this only runs once per run start, not per step).
    for (var _zk in zoneTimeAcc) { if (Object.prototype.hasOwnProperty.call(zoneTimeAcc, _zk)) delete zoneTimeAcc[_zk]; }
    zoneTimeReportAt = 0;

    selectedSharkId = sharkId || activeSharkId();
    buildContext();
    // Blocker 1 (REVIEW-REV7): pick this run's active missions. Guarded -
    // absent RF.Meta / rollMissions degrades to no active missions rather
    // than throwing. profile.missions is normalized by meta.js's load path;
    // still guard here in case a caller boots the engine against a raw
    // pre-normalize profile in a test harness.
    if (RF.Meta && RF.Meta.rollMissions && profile && profile.missions) {
      try { RF.Meta.rollMissions(profile, ctx.rng); } catch (e) { warnOnce('Meta.rollMissions', e); }
    }
    buildPlayer(sharkById(selectedSharkId));
    // FIX-ROUND-3 item 3: seed the ability meter FULL so one of the 3 opening
    // powerCharges is immediately usable at run start (abilities.js still
    // owns the meter/cooldown economy unchanged after the first fire).
    if (RF.Abilities && RF.Abilities.seedMeterFull) {
      try { RF.Abilities.seedMeterFull(ctx); } catch (e) { warnOnce('Abilities.seedMeterFull', e); }
    }

    // World first (it owns the background layers), then FX on top of it.
    if (RF.World && RF.World.init) {
      try { RF.World.init(scene3, ctx); } catch (e) { warnOnce('World.init', e); }
    }
    handOffLights();
    if (RF.Fx && RF.Fx.init) {
      try { RF.Fx.init(scene3, ctx); } catch (e) { warnOnce('Fx.init', e); }
    }
    attachPlayerRig();
    if (!popPool) buildPopPool(8);

    camState.x = ctx.player.x; camState.y = -ctx.player.y; camState.fov = CAM_FOV;
    camState.zoom = 0; camState.pulse = 0; camState.pulseT = 0; camState.yaw = 0;
    if (camera) {
      var startBob = cameraBobAt(ctx.time.now);
      // Rev 6 / 6.1: pitch and look offset are FRACTIONS of the live dolly z.
      camera.position.set(camState.x, camState.y - CAM_PITCH_FRAC * CAM_Z + startBob, CAM_Z);
      camera.lookAt(camState.x, camState.y + CAM_LOOK_FRAC * CAM_Z + startBob, 0);
      camera.fov = CAM_FOV; camera.updateProjectionMatrix();
    }

    bindInput();
    musicLayer('calm');
    running = true;

    // Tutorial is ONE fading top strip owned by the DOM UI lane (UI_LAW).
    var suppressed = !!(RF.DevMode && RF.DevMode.state
      && (RF.DevMode.state.forceSkipTutorial || RF.DevMode.state.notut));
    if (!(profile && profile.tutorialDone) && !suppressed) {
      uiCall('tutorial', 'Drag anywhere to steer: drag down to dive, up to breach. Second finger to boost. Eat to grow.');
      if (profile) { profile.tutorialDone = true; commitProfile(); }
    }
    uiCall('runStarted', ctx);
  }

  // LIFE-01 / SPEC3D Rev 2 teardown choreography.
  //
  // OWNERSHIP (binding, Rev 2):
  //   engine3d  - the player rig group, the pooled score popups, and CALLING
  //               the sibling teardowns. Owns nothing inside world/fx.
  //   world3d   - entities, views, decor, env textures, private materials.
  //   fx3d      - particle pools, DOM edge overlays, active effect state
  //               (reset synchronously inside its own teardown()).
  //
  // PERSISTENT BY DESIGN (must NOT be disposed here): shark3d's geometry and
  // material caches (documented global lifetime, shared across every run) and
  // world3d's texCache asset textures. Anything marked __rfKeep is likewise a
  // shared cache borrow and is skipped by disposeTree().
  //
  // ORDER matters: input first (no callback can fire into a half-torn scene),
  // then abilities (restores ctx.run.timeScale before anything reads it), then
  // OUR objects, then the siblings, then the UI notification. Every sibling
  // call is guarded: a throwing lane cannot strand the engine mid-teardown.
  //
  // IDEMPOTENT: endRun() on a run that is not running returns immediately, and
  // every step below tolerates already-torn state, so a double call is a no-op.
  function endRun() {
    if (!running) return;
    running = false;
    unbindInput();
    clearStick();
    abilitiesReset();

    // --- ours: the player rig
    // Rev 2: shark3d's geometry/material caches are SHARED and persistent, so a
    // lane-D rig is detached but NOT disposed - disposing it would destroy the
    // cache entry every other run and NPC shark shares. Only a rig this module
    // built itself (the capsule fallback) owns private resources to release.
    var p = ctx && ctx.player;
    if (p && p.sprite) {
      if (scene3 && scene3.remove) scene3.remove(p.sprite);
      var mine = !p.rig || p.rig.__fallback === true;
      if (mine) disposeTree(p.sprite);
      else if (RF.Art3D && RF.Art3D.releaseShark) {
        try { RF.Art3D.releaseShark(p.rig); } catch (e) { warnOnce('Art3D.releaseShark', e); }
      }
      p.sprite = null; p.rig = null;
    }

    // --- ours: pooled score popups (sprites, their materials and canvas
    // textures). The pool is rebuilt on the next startRun against whatever
    // scene is live then, so it must not survive as a stale scene child.
    teardownPops();

    // Rev 6.11: EAT_BUF is a reused scratch copy of World's query results
    // (stepEat/stepPickups), so it retains references to this run's pooled
    // entities after the run ends. Null the slots out so a repeated
    // run-restart does not keep the previous run's entities reachable via
    // this module scratch a moment longer than necessary (iOS heap
    // pressure). It is fully repopulated (or left short) on next use, so
    // clearing here is safe.
    for (var eb = 0; eb < EAT_BUF.length; eb++) EAT_BUF[eb] = null;

    // --- siblings, guarded. Each lane disposes what it owns.
    if (RF.World && RF.World.teardown) {
      try { RF.World.teardown(ctx); } catch (e) { warnOnce('World.teardown', e); }
    }
    if (RF.Fx && RF.Fx.teardown) {
      try { RF.Fx.teardown(ctx); } catch (e) { warnOnce('Fx.teardown', e); }
    }

    uiCall('runEnded', ctx);
  }

  // Score-popup pool teardown. Removes each glyph sprite from whatever scene
  // holds it and disposes its per-glyph material + cloned geometry. The
  // glyph ATLAS TEXTURE is a persistent init-time cache (SPEC3D 7.3: baked
  // ONCE) and is deliberately NOT disposed here - it is rebuilt only if
  // popAtlas is null, matching the shark3d/world3d asset-cache pattern.
  // popPool is nulled so startRun rebuilds the pooled quads (against the
  // SAME atlas); scorePopup()/stepPops() both already no-op on a null pool.
  function teardownPops() {
    if (!popPool) return;
    var items = popPool.items || [];
    for (var i = 0; i < items.length; i++) {
      var r = items[i];
      if (!r) continue;
      var glyphs = r.glyphs || [];
      for (var g = 0; g < glyphs.length; g++) {
        var it = glyphs[g];
        if (!it || !it.sprite) continue;
        if (it.sprite.parent && it.sprite.parent.remove) it.sprite.parent.remove(it.sprite);
        else if (scene3 && scene3.remove) scene3.remove(it.sprite);
        it.sprite.visible = false;
        if (it.sprite.geometry && it.sprite.geometry.__popOwn && it.sprite.geometry.dispose) {
          try { it.sprite.geometry.dispose(); } catch (e) {}
        }
        if (it.mat && it.mat.dispose) { try { it.mat.dispose(); } catch (e) {} }
      }
      glyphs.length = 0;
      r.life = 0;
    }
    items.length = 0;
    popPool = null;
  }

  // Geometry and materials are OURS to release when the rig came from the
  // fallback path. A lane-D rig is that lane's to own, so only the fallback is
  // disposed here.
  function disposeTree(obj) {
    if (!obj || !obj.traverse) return;
    obj.traverse(function (o) {
      if (o.__rfKeep) return;
      if (o.geometry && o.geometry.dispose) { try { o.geometry.dispose(); } catch (e) {} }
      var m = o.material;
      if (!m) return;
      var list = Array.isArray(m) ? m : [m];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].dispose) { try { list[i].dispose(); } catch (e) {} }
      }
    });
  }

  // ==================================================== frame + camera
  function frame(nowMs) {
    rafId = root.requestAnimationFrame ? root.requestAnimationFrame(frame) : 0;
    var dtMs = lastNow ? (nowMs - lastNow) : 16.7;
    lastNow = nowMs;

    if (kit && kit.paused) {
      acc = 0;                                   // pause freezes the sim
      // Drop the stick too: resuming with a stale full deflection would launch
      // the shark before the player touched the glass.
      if (running && ctx && ctx.player && ctx.player.ctl.active) {
        clearStick();
        ctx.player.ctl.boostId = null;
      }
      renderFrame(0);
      return;
    }

    if (running) {
      // Hit-stop: consume once per frame and skip that many ms of stepping.
      freezeMs += consumeFreeze();
      var dt = dtMs / 1000;
      if (!isFinite(dt) || dt < 0) dt = 0;
      if (dt > 0.25) dt = 0.25;                  // tab-return / long frame

      if (freezeMs > 0) {
        var eat = Math.min(freezeMs, dtMs);
        freezeMs -= eat;
        dt -= eat / 1000;
        if (dt < 0) dt = 0;
      }

      acc += dt * num(ctx.run.timeScale, 1);
      var steps = 0;
      while (acc >= STEP && steps < MAX_STEPS) {
        acc -= STEP;
        steps++;
        step();
      }
      if (steps === MAX_STEPS) acc = 0;          // drop the backlog
      renderFrame(dt);
      if (pendingResults && (ctx.time.now - deathAt) > 1.1) finishRun();
    } else {
      renderFrame(dtMs / 1000);
    }
  }

  function renderFrame(dt) {
    if (running && ctx && ctx.player) {
      renderPlayer(ctx.player);
      stepCamera(ctx.player, dt);
      pushHud(dt);
    }
    if (RF.World && RF.World.render) {
      try { RF.World.render(ctx, dt); } catch (e) { warnOnce('World.render', e); }
    }
    if (RF.Fx && RF.Fx.render) {
      try { RF.Fx.render(ctx, dt); } catch (e) { warnOnce('Fx.render', e); }
    }
    // Rev 15: world3d's applyZoneAtmo ran inside World.render above and
    // relerped the sun toward cyan at depth. Re-stamp the neutral key
    // colour (intensity is left alone -- that is world3d's depth cue).
    enforceLightRig();
    if (renderer && scene3 && camera) renderer.render(scene3, camera);
  }

  // The rig group carries the world position, the heading, the bank roll and
  // the eat scale pop. Facing left is a Y-flip of the whole group (not of the
  // parts, which would tear the assembly apart about their own pivots).
  function renderPlayer(p) {
    var g = p.sprite;
    if (!g || !g.position) return;
    var a = p.anim;
    g.position.x = p.x;
    g.position.y = -(p.y + num(a.bob, 0));      // world y is DOWN
    g.position.z = 0;

    var left = Math.abs(p.angle) > Math.PI / 2;
    // Heading: world angle is measured with y DOWN, so the three rotation
    // about z is its negation. Facing left, the group is spun 180 degrees
    // about Y so the shark keeps its belly down instead of rolling over.
    var zrot = -p.angle + (left ? Math.PI : 0);
    g.rotation.set(0, left ? Math.PI : 0, zrot);
    // Bank is a roll about the swim axis, applied on top of the heading and
    // never inverted by the flip.
    g.rotation.x = (left ? -1 : 1) * num(a.bank, 0);

    // Eat scale pop.
    if (g.scale) {
      // buildPlayerRig captures the 124/96-adjusted rig base; the fallback
      // captures its unit group here. Never recapture after an eat pop.
      if (g.__baseScale == null) g.__baseScale = num(g.scale.x, 1) || 1;
      var pop = p.st.eatPopT > 0 ? (1 + 0.14 * clamp(p.st.eatPopT / 0.16, 0, 1)) : 1;
      // Rev 12 / 12.4: SUPER SIZE multiplies the SAME base scale the eat-pop
      // rides on top of, so a super-sized shark's eat-pop still reads as a
      // small extra flourish on the sustained bigger size, not a competing write.
      var superMult = num(p.st.superSizeScale, 1);
      var s = g.__baseScale * pop * superMult;
      g.scale.set(s, s, s);
    }

    // Invulnerability blink. Three has no per-object alpha without touching
    // every material, so the rig is toggled off on alternate 14 Hz phases;
    // that reads the same as the 2D rev's alpha 0.35 pulse.
    g.visible = !(p.st.invulnT > 0 && (Math.floor(ctx.time.now * 14) % 2 === 0));
  }

  // Camera follow + velocity lookahead + mild FOV ease with speed. Shake comes
  // from the kit's juice frame state as a positional impulse.
  function stepCamera(p, dt) {
    if (!camera) return;
    var d = clamp(dt, 0, 0.1);
    var lookX = p.x + clamp(p.vx * CAM_LOOKAHEAD, -CAM_LOOKAHEAD_MAX, CAM_LOOKAHEAD_MAX);
    var lookY = p.y + clamp(p.vy * CAM_LOOKAHEAD, -CAM_LOOKAHEAD_MAX, CAM_LOOKAHEAD_MAX);
    var k = damp(CAM_FOLLOW, d);
    camState.x += (lookX - camState.x) * k;
    camState.y += (-lookY - camState.y) * k;

    var cap = num(p.ctl.speedCap, p.stat.speed) || 1;
    var f = clamp(Math.sqrt(p.vx * p.vx + p.vy * p.vy) / cap, 0, 1);
    var wantFov = CAM_FOV + CAM_FOV_SPAN * f;
    camState.fov += (wantFov - camState.fov) * damp(CAM_FOV_EASE, d);
    if (Math.abs(camera.fov - camState.fov) > 0.01) {
      camera.fov = camState.fov;
      camera.updateProjectionMatrix();
    }

    // Rev 6 / 6.1: yaw orbit hint. Quarter-view hint, NOT a chase cam - it
    // only nudges the camera POSITION sideways; lookAt.z stays 0 always.
    // headingSign is the same left/right facing test renderPlayer already
    // uses (cos(angle) < 0 means facing left).
    var headingSign = Math.cos(p.angle) < 0 ? -1 : 1;
    var wantYaw = headingSign * CAM_YAW_MAX * f;
    camState.yaw += (wantYaw - camState.yaw) * damp(CAM_YAW_EASE, d);

    var jx = 0, jy = 0;
    if (kit && kit.juice && kit.juice.frame) {
      try {
        var jf = kit.juice.frame();
        if (jf) { jx = num(jf.dx, 0); jy = num(jf.dy, 0); }
      } catch (e) { warnOnce('juice.frame', e); }
    }
    var bob = cameraBobAt(ctx && ctx.time ? ctx.time.now : 0);
    var z = stepCameraZoom(d);
    // Pitch/look offsets are fractions of the live dolly z (6.1); yaw only
    // ever touches camera POSITION x, never lookAt.
    var yawX = camState.yaw * z;
    camera.position.set(camState.x + jx + yawX, camState.y - CAM_PITCH_FRAC * z + bob + jy, z);
    camera.lookAt(camState.x + jx, camState.y + CAM_LOOK_FRAC * z + bob + jy, 0);
  }

  // HUD is DOM: the engine feeds a plain state object every frame and Lane C3
  // decides how to draw it. The object is REUSED, so the UI lane must read it
  // synchronously (it is the same contract as FX_OPT).
  function pushHud(dt) {
    var p = ctx.player;
    var h = HUD_STATE;
    if (hudHurt > 0) hudHurt = Math.max(0, hudHurt - dt * 1.5);

    h.name = (p.def && p.def.name) || '';
    h.hp = p.hp; h.maxHp = p.maxHp;
    h.hpFrac = clamp(p.hp / p.maxHp, 0, 1);
    // Rev 6.11 HUD STATE: hp IS hunger in this design (stepHunger drains hp
    // directly, there is no separate hunger meter) - hungerFrac makes that
    // intent explicit for the HUD/toast consumer rather than making it infer
    // hunger from hpFrac's name alone. Same number, deliberately duplicated.
    h.hungerFrac = h.hpFrac;
    h.boost = clamp(p.ctl.boost, 0, 1);
    h.boosting = !!p.ctl.boosting;
    h.tier = p.tier;
    h.coins = ctx.run.coins;
    h.score = ctx.run.score;
    h.combo = ctx.run.combo;
    h.comboMult = comboMult();
    h.frenzy = ctx.run.frenzy;
    h.goldRush = ctx.run.goldRushT;
    // Rev 12 / 12.4: HUD mode banner + the chained mega-meter (0..1) fill.
    h.mode = ctx.run.mode || '';
    h.megaMeter = clamp(num(ctx.run.megaMeter, 0), 0, 1);
    h.hurt = hudHurt;
    h.zone = zoneState.name || '';
    h.dev = !!(RF.DevMode && RF.DevMode.state && devAny());

    var ab = null;
    if (RF.Abilities && RF.Abilities.hud) {
      try { ab = RF.Abilities.hud(ctx); } catch (e) { warnOnce('Abilities.hud', e); }
    }
    // Rev 6.11 item 9: gate on ab.id (abilities.js's activeId() resolver),
    // not p.def.active directly - the resolver now falls back to a default
    // cheap active for ability-less defs (the starter reef shark), so the
    // HUD power button must follow that same resolved id or the fallback
    // would be armed but invisible.
    if (ab && ab.id) {
      h.power = clamp(num(ab.charge, 0), 0, 1);
      // Rev 6 / 6.7: the HUD button is ready only when BOTH abilities.js's own
      // meter/cooldown gate AND the charge economy allow a fire.
      h.powerReady = !!ab.ready && num(ctx.run.powerCharges, 0) > 0;
      h.powerId = ab.id;
      h.powerTint = num(ab.tint, 0x5fd6c0);
    } else {
      h.power = 0; h.powerReady = false; h.powerId = null; h.powerTint = 0;
    }
    h.powerCharges = num(ctx.run.powerCharges, 0);
    h.powerChargeCap = POWER_CHARGE_CAP;
    var buffs = ctx.run.buffs;
    if (buffs) {
      h.buffs.overdrive = buffs.overdrive; h.buffs.shield = buffs.shield;
      h.buffs.megajaw = buffs.megajaw; h.buffs.magnet = buffs.magnet;
      h.buffs.chum = buffs.chum; h.buffs.apex = buffs.apex;
      h.buffs.supersize = buffs.supersize; h.buffs.modeShield = buffs.modeShield;
      h.buffs.modeSpeed = buffs.modeSpeed;
    }
    h.px = p.x; h.py = p.y;
    var bt = h.buffTimers; bt.length = 0;
    if (buffs) {
      if (buffs.overdrive > 0) bt.push(clamp(buffs.overdrive / BUFF_DUR.overdrive, 0, 1));
      if (buffs.shield > 0) bt.push(clamp(buffs.shield / SHIELD_CHARGES, 0, 1));
      if (buffs.megajaw > 0) bt.push(clamp(buffs.megajaw / BUFF_DUR.megajaw, 0, 1));
      if (buffs.magnet > 0) bt.push(clamp(buffs.magnet / BUFF_DUR.magnet, 0, 1));
      if (buffs.chum > 0) bt.push(clamp(buffs.chum / BUFF_DUR.chum, 0, 1));
      if (buffs.apex > 0) bt.push(clamp(buffs.apex / BUFF_DUR.apex, 0, 1));
      if (buffs.supersize > 0) bt.push(clamp(buffs.supersize / num(SUPERSIZE_CFG.dur, 10), 0, 1));
      if (buffs.modeShield > 0) bt.push(clamp(buffs.modeShield / num(MODE_SHIELD_CFG.hits, 3), 0, 1));
      if (buffs.modeSpeed > 0) bt.push(clamp(buffs.modeSpeed / num(MODE_SPEED_CFG.dur, 9), 0, 1));
    }
    uiCall('hudState', h);
  }
  function devAny() {
    var st = RF.DevMode && RF.DevMode.state;
    if (!st) return false;
    for (var k in st) { if (st[k]) return true; }
    return false;
  }

  // ======================================================== bootstrap
  function onRestart() {
    // kit has already cleared input state before calling this.
    if (running) startRun(selectedSharkId);
  }

  function boot() {
    var g = ggkit();
    if (!g || !g.create) {
      if (root.console && console.error) console.error('[Razorfin] GGKit missing; cannot boot');
      return null;
    }
    kit = g.create({
      slug: 'razorfin',
      orientation: 'landscape',
      validateSave: validateSave,
      onRestart: onRestart
    });

    // Same order game.js used: DevMode parses the URL switches BEFORE the
    // profile is loaded, so unlockall / coins are visible to meta.js.
    if (RF.DevMode && RF.DevMode.init) {
      try { RF.DevMode.init(); } catch (e) { warnOnce('DevMode.init', e); }
    }

    profile = loadProfile();
    selectedSharkId = activeSharkId();

    try { kit.registerPWA(); } catch (e) { warnOnce('registerPWA', e); }

    if (!buildRenderer()) return null;
    bindContextLoss();       // GL-01: canvas-level loss/restore, before any run
    buildStick();
    buildContext();          // a ctx exists out of run, per SPEC (player null)

    // ORCH-01 (engine side): one dependency report at boot, then never again.
    assertDeps();

    // LAW-01 CONTRACT NOTE - SPEC3D.md Rev 2 ruling, verbatim:
    //   "window-level 'resize'/'orientationchange'/visualViewport listeners are
    //    PERMITTED in engine3d.js ONLY, as the renderer host platform adapter
    //    (contract revision; ggkit owns game-input events, unchanged). All
    //    other modules: still forbidden."
    // These two listeners are that adapter and nothing else: both call resize(),
    // which only re-sizes the drawing buffer and re-derives the camera aspect.
    // They observe the VIEWPORT, never a gesture. All game input stays on
    // kit.input subscriptions, bound in bindInput() and released in
    // unbindInput(). These are the ONLY window/document listeners in this file;
    // the GL-01 pair above is canvas-level on the element this module owns.
    if (root.addEventListener) {
      root.addEventListener('resize', resize);
      root.addEventListener('orientationchange', resize);
    }

    uiCall('init', {
      profile: profile,
      start: function (id) { startRun(id); },
      firePower: firePower,
      quit: function () { endRun(); uiCall('showMenu'); }
    });

    // First screen: the 2D build's Phaser Menu scene auto-started here; the
    // DOM menu must be shown explicitly or the boot lands on empty water.
    // Rev 9 (orchestrator glue, SPEC3D 9.2): the shark/fish rigs are artist
    // GLB assets parsed asynchronously. Wait for both preloads before the
    // first menu so thumbnails/rigs build from the real meshes; on failure
    // or a 6s stall fall through to the menu anyway (rigs degrade to
    // placeholders), never a black screen.
    var pre = [];
    try { if (RF.Art3D && typeof RF.Art3D.preload === 'function') pre.push(RF.Art3D.preload()); } catch (e) { warnOnce('Art3D.preload', e); }
    try { if (RF.Art3D && typeof RF.Art3D.preloadFish === 'function') pre.push(RF.Art3D.preloadFish()); } catch (e) { warnOnce('Art3D.preloadFish', e); }
    if (pre.length && typeof Promise !== 'undefined') {
      var menuShown = false;
      var showMenuOnce = function () { if (!menuShown) { menuShown = true; uiCall('showMenu'); } };
      Promise.all(pre).then(showMenuOnce, function (e) { warnOnce('asset preload', e); showMenuOnce(); });
      if (root.setTimeout) root.setTimeout(showMenuOnce, 6000);
    } else {
      uiCall('showMenu');
    }

    lastNow = 0;
    if (root.requestAnimationFrame) rafId = root.requestAnimationFrame(frame);
    return { renderer: renderer, scene: scene3, camera: camera };
  }

  // ======================================================== self test
  // Headless and renderer-free: no WebGLRenderer is constructed (there is no
  // GL context under node), the scene and camera are stubbed, and the real
  // step()/stepControl()/stepEat()/stepHunger() are driven directly. The
  // assertions are game.js's, ported.
  function __selftest() {
    return __selftestBody();
  }

  function __selftestBody() {
    var notes = [];
    var pass = true;
    function check(cond, msg) { if (!cond) { pass = false; notes.push('FAIL ' + msg); } else notes.push('ok ' + msg); }

    var saved = {
      ctx: RF.ctx, kit: kit, profile: profile, scene3: scene3, camera: camera,
      renderer: renderer, popPool: popPool, running: running, stickEls: stickEls,
      World: RF.World, Fx: RF.Fx, Sound: RF.Sound, Art3D: RF.Art3D, Abilities: RF.Abilities,
      UI: RF.UI, dying: dying, pending: pendingResults,
      camZ: CAM_Z, camX: camState.x, camY: camState.y, camFov: camState.fov,
      camZoom: camState.zoom, camPulse: camState.pulse, camPulseT: camState.pulseT
    };
    try {
      var keysDown = {};
      kit = {
        paused: false,
        save: { get: function (f) { return f; }, set: function () {} },
        audio: { register: function () {}, sfx: function () {}, music: function () {} },
        loader: { show: function () {}, progress: function () {}, hide: function () {} },
        juice: { frame: function () { return { dx: 0, dy: 0, frozen: false }; }, shake: function () {}, hitStop: function () {} },
        input: {
          keyDown: function (c) { return !!keysDown[c]; },
          onDown: function () { return function () {}; },
          onMove: function () { return function () {}; },
          onUp: function () { return function () {}; },
          onKeyDown: function () { return function () {}; }
        }
      };
      profile = fallbackProfile();
      renderer = null;
      popPool = null;                 // no canvas: scorePopup must no-op safely
      stickEls = null;                // no DOM: paintStick must no-op safely
      running = false;
      dying = false; pendingResults = false;

      // Stub scene + camera. Real THREE objects would work too, but the point
      // of the renderer-free path is that nothing needs a GL context.
      var added = [];
      scene3 = { isScene: true, add: function (o) { added.push(o); }, remove: function () {}, fog: null, background: null };
      camera = null;

      // The browser-only half of the repeated-run gate is still testable as a
      // sampler contract without a GL context: the second row is the warm
      // baseline and later rows must match it in all four counters.
      var savedGateRows = RESOURCE_GATE.rows.slice();
      var savedGateBaseline = RESOURCE_GATE.baseline;
      var savedGatePass = RESOURCE_GATE.pass;
      var gateSceneProbe = { children: [{}, {}] };
      var gateRendererProbe = { info: { memory: { geometries: 4, textures: 3 }, programs: [{}, {}] } };
      scene3 = gateSceneProbe;
      renderer = gateRendererProbe;
      RESOURCE_GATE.reset();
      RESOURCE_GATE.sample();
      gateRendererProbe.info.memory.geometries = 5;
      gateRendererProbe.info.memory.textures = 4;
      gateRendererProbe.info.programs = [{}, {}, {}];
      RESOURCE_GATE.sample();
      RESOURCE_GATE.sample();
      var gateReport = RESOURCE_GATE.report();
      check(gateReport.pass && gateReport.rows.length === 3,
        'browser resource gate accepts stable post-warmup renderer counters');
      scene3 = { isScene: true, add: function (o) { added.push(o); }, remove: function () {}, fog: null, background: null };
      renderer = null;
      RESOURCE_GATE.rows.length = 0;
      for (var gri = 0; gri < savedGateRows.length; gri++) RESOURCE_GATE.rows.push(savedGateRows[gri]);
      RESOURCE_GATE.baseline = savedGateBaseline;
      RESOURCE_GATE.pass = savedGatePass;

      // ---- world stub with one edible prey and a hunger sink
      var prey = {
        active: true, id: 1, kind: 'prey', defId: 'minnow', tier: 0,
        x: 0, y: 0, vx: 0, vy: 0, angle: 0, hp: 1, maxHp: 1, st: {}, sprite: null, r: 10,
        def: creatureById('minnow') || { id: 'minnow', tier: 0, score: 5, coins: 1 }
      };
      var killed = [];
      var stubHits = [];
      var hitQueue = [];
      var eatQueryCalls = 0;
      function queryPrey(x, y, rr, filter) {
        if (filter === 'predator') return [];
        if (!prey.active) return [];
        var dx = prey.x - x, dy = prey.y - y;
        return (dx * dx + dy * dy) <= (rr + prey.r) * (rr + prey.r) ? [prey] : [];
      }
      RF.World = {
        playerHits: stubHits,
        init: function () {},
        update: function () {
          stubHits.length = 0;
          if (hitQueue.length) stubHits.push(hitQueue.shift());
        },
        query: queryPrey,
        eatQuery: function (x, y, rr) { eatQueryCalls++; return queryPrey(x, y, rr, null); },
        kill: function (e, cause) { e.active = false; killed.push(cause); },
        zoneAt: function (y) { return zoneAtFallback(y); },
        entities: [prey]
      };

      buildContext();
      var p = buildPlayer(sharkById('reef'));
      check(!!p && p.kind === 'player', 'player entity built');
      check(isFinite(p.stat.speed) && p.stat.speed > 0, 'stats resolved finite');
      check(isFinite(LEN_SCALE) && Math.abs(LEN_SCALE - (124 / 96)) < 1e-12,
        'LEN_SCALE is the exported 124/96 rig-to-sim ratio');
      var mouth085 = mouthRadiusForLen(SHARK_LEN_PX * 0.85);
      var mouth19 = mouthRadiusForLen(SHARK_LEN_PX * 1.9);
      check(isFinite(mouth085) && mouth085 > 14 && mouth085 < 90
        && isFinite(mouth19) && mouth19 > mouth085 && mouth19 < 90,
        'mouthR is sane for len 0.85 and 1.9 (' + mouth085.toFixed(2) + ', ' + mouth19.toFixed(2) + ')');
      check(isFinite(CAM_FOV) && isFinite(CAM_Z_MIN) && isFinite(CAM_Z_MAX)
        && isFinite(CAM_PITCH_FRAC) && isFinite(CAM_LOOK_FRAC) && isFinite(CAM_BOB)
        && isFinite(CAM_BOB_HZ) && isFinite(CAM_PULSE_EASE)
        && isFinite(CAM_EAT_ZOOM) && isFinite(CAM_EAT_ZOOM_T)
        && isFinite(CAM_DEATH_PULL) && isFinite(CAM_DEATH_PULL_T)
        && isFinite(CAM_BLOOD_PUSH),
        'camera constants are finite (fov 50, z clamp [' + CAM_Z_MIN + '..' + CAM_Z_MAX + '], pitch/bob finite)');

      // Rev 6 / 6.1: dolly is LENGTH-PROPORTIONAL. camZForLen(len) = clamp(len
      // * 1.60, 185, 400); camZForTier keeps its exported NAME but delegates
      // to it by resolving a def with that tier.
      check(Math.abs(camZForLen(150) - 150 * CAM_Z_LEN_MULT) < 1e-9,
        'camZForLen scales by CAM_Z_LEN_MULT inside the clamp band (150px -> ' + (150 * CAM_Z_LEN_MULT) + ')');
      check(camZForLen(50) === CAM_Z_MIN, 'camZForLen floors at ' + CAM_Z_MIN + ' for a tiny rendered length');
      check(camZForLen(1000) === CAM_Z_MAX, 'camZForLen ceilings at ' + CAM_Z_MAX + ' for a huge rendered length');
      // Rev 14: the clamps must not bind on any REAL roster row, or the
      // constant framing fraction below silently stops holding for that row.
      // This is the gate that would have caught the Rev 12 regression.
      var clampRows = RFD.SHARKS || [];
      for (var cri = 0; cri < clampRows.length; cri++) {
        var clen = sharkLenPx(clampRows[cri]);
        check(clen * CAM_Z_LEN_MULT > CAM_Z_MIN && clen * CAM_Z_LEN_MULT < CAM_Z_MAX,
          'camZ clamps do not bind for ' + clampRows[cri].id + ' (z ' + (clen * CAM_Z_LEN_MULT).toFixed(1) + ' inside ' + CAM_Z_MIN + '..' + CAM_Z_MAX + ')');
      }
      check(camZForTier(1) === camZForLen(sharkLenPx(sharkById('reef'))),
        'camZForTier(1) delegates to camZForLen for a tier-1 def');
      check(camZForTier(12) === camZForLen(sharkLenPx(sharkById('leviathanrex'))),
        'camZForTier(12) delegates to camZForLen for the tier-12 def');

      // Rev 14: framing fraction gate. sharkLenPx / (2.018 * z) must sit in
      // [0.28, 0.32] - the HSE framing bar (player at 25-35% of screen
      // width), targeted at its centre. Rev 12/12.5 had dollied out to
      // CAM_Z_LEN_MULT 2.2 with clamps 250..600, which measured 0.209-0.246
      // and read as a distant shark; 1.65 with non-binding clamps 170..500
      // puts EVERY row at 0.3003. The band is checked across the whole
      // roster rather than three sample tiers, because the failure mode being
      // guarded (a clamp binding at one end of the length range) shows up
      // precisely on the rows the tier samples skip. 2.018 is the precomputed
      // 2*tan(fov/2)*aspect for fov=50, matching CAM_FRAME_TAN2 below.
      check(Math.abs(CAM_FRAME_TAN2 - 2.018) < 0.01,
        'CAM_FRAME_TAN2 matches the documented 2*tan(fov/2) constant (' + CAM_FRAME_TAN2.toFixed(4) + ')');
      var framingRows = RFD.SHARKS || [];
      var framingMin = Infinity, framingMax = -Infinity, framingWorst = '';
      for (var fti = 0; fti < framingRows.length; fti++) {
        var flen = sharkLenPx(framingRows[fti]);
        var fz = camZForLen(flen);
        var frac = flen / (CAM_FRAME_TAN2 * fz);
        if (frac < framingMin) framingMin = frac;
        if (frac > framingMax) { framingMax = frac; framingWorst = framingRows[fti].id; }
        if (!(frac >= 0.28 && frac <= 0.32)) {
          check(false, 'framing fraction in [0.28,0.32] for ' + framingRows[fti].id + ' (' + frac.toFixed(4) + ')');
          break;
        }
      }
      check(framingMin >= 0.28 && framingMax <= 0.32,
        'framing fraction in [0.28,0.32] for all ' + framingRows.length + ' roster rows ('
        + framingMin.toFixed(4) + '..' + framingMax.toFixed(4) + ', widest ' + framingWorst + ')');
      // The fraction must be CONSTANT across the roster, which is the whole
      // point of a length-proportional dolly with non-binding clamps. A
      // spread here means a clamp is biting.
      check(framingMax - framingMin < 1e-9,
        'framing fraction is identical for every tier (spread ' + (framingMax - framingMin).toExponential(2) + ')');
      // Rev 15: the rig is now key-dominant rather than ambient-dominant. The
      // gate checks the RELATIONSHIP that makes a subject read against its
      // background, not the old literal numbers -- the key must clearly
      // out-drive the water-tinted ambient world3d controls.
      check(LIGHT_RIG.sunIntensity > LIGHT_RIG.hemiIntensity * 3
        && LIGHT_RIG.hemiIntensity <= 0.40
        && LIGHT_RIG.sunX < 0 && LIGHT_RIG.sunY > 0 && LIGHT_RIG.sunZ > 0
        && RF.Game && RF.Game.LIGHT_RIG
        && RF.Game.LIGHT_RIG.hemiIntensity === LIGHT_RIG.hemiIntensity
        && RF.Game.LIGHT_RIG.sunIntensity === LIGHT_RIG.sunIntensity
        && RF.Game.LIGHT_RIG.sunPosition[0] === LIGHT_RIG.sunX
        && RF.Game.LIGHT_RIG.sunPosition[1] === LIGHT_RIG.sunY
        && RF.Game.LIGHT_RIG.sunPosition[2] === LIGHT_RIG.sunZ,
        'Rev 15 rig is key-dominant: sun ' + LIGHT_RIG.sunIntensity
        + ' over hemi ' + LIGHT_RIG.hemiIntensity + ' from upper-front-left');

      // OWNER OVERRIDE (r15) "just make them look like sharks": natural
      // sunlight only. Machine-check that no light this lane owns is tinted.
      // A colour is "neutral" when its channel spread is small; the key is
      // allowed a warm bias, the rim must be pure white.
      function rfChan(hex) { return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]; }
      function rfSpread(hex) { var c = rfChan(hex); return Math.max.apply(null, c) - Math.min.apply(null, c); }
      // Rim is literally white -- no gel of any kind.
      check(LIGHT_RIG.rimColor === 0xffffff, 'rim light is neutral white (no coloured rim)');
      // Key may be warm but must not be cool: red >= blue, and only mildly warm.
      var keyC = rfChan(LIGHT_RIG.sunColor);
      check(keyC[0] >= keyC[2] && rfSpread(LIGHT_RIG.sunColor) <= 32,
        'key light is warm-neutral daylight, never cyan (spread '
        + rfSpread(LIGHT_RIG.sunColor) + ', r' + keyC[0] + ' >= b' + keyC[2] + ')');
      // Fill is skylight: may be faintly cool, but nowhere near a teal gel.
      check(rfSpread(LIGHT_RIG.fillColor) <= 32,
        'fill light is pale skylight, not a teal gel (spread ' + rfSpread(LIGHT_RIG.fillColor) + ')');
      // No purple/green ambient: every owned colour must be within a narrow
      // band, which rules out bioluminescent tints outright.
      check(rfSpread(LIGHT_RIG.sunColor) <= 32 && rfSpread(LIGHT_RIG.fillColor) <= 32
        && rfSpread(LIGHT_RIG.rimColor) === 0,
        'no bioluminescent / purple / teal light in the engine-owned rig');
      // Exposure must stay sane under a much brighter rig.
      check(LIGHT_RIG.exposure > 0.7 && LIGHT_RIG.exposure < 1.2,
        'ACES exposure retuned into [0.7,1.2] (' + LIGHT_RIG.exposure + ')');
      triggerCamPulse(CAM_EAT_ZOOM, CAM_EAT_ZOOM_T);
      for (var camPulseStep = 0; camPulseStep < 60; camPulseStep++) stepCameraZoom(STEP);
      check(camState.pulseT === 0 && Math.abs(camState.zoom) < 0.001,
        'eat camera pulse decays to base within 1s (' + camState.zoom.toFixed(5) + ')');
      var savedScaleArt = RF.Art3D;
      var scaleProbeGroup = new THREE.Group();
      scaleProbeGroup.scale.setScalar(2);
      RF.Art3D = { buildShark: function () {
        return { group: scaleProbeGroup, parts: {}, animate: function () {} };
      } };
      var scaleProbeRig = buildPlayerRig(sharkById('reef'));
      check(Math.abs(scaleProbeGroup.scale.x - 2 * LEN_SCALE) < 1e-9
        && Math.abs(scaleProbeGroup.__baseScale - 2 * LEN_SCALE) < 1e-9
        && RF.Game && RF.Game.LEN_SCALE === LEN_SCALE,
        'player rig applies LEN_SCALE once and exports it to RF.Game');
      RF.Art3D = savedScaleArt;
      check(ctx.dpr === DPR && DPR >= 1 && DPR <= 3, 'ctx.dpr carries the pixel ratio (' + DPR + ')');
      check(!!ctx.time && ctx.time.dt === STEP && !!ctx.run && !!ctx.rng,
        'ctx schema matches SPEC (kit/scene/dpr/time/rng/player/save/run)');
      check(RFD.BAL && RFD.BAL.metabScale === 0.5 && RFD.BAL.eatHealBonus === 1.25,
        'Rev 3 balance data is present');
      check(RFD.FRENZY2 && RFD.FRENZY2.school.count === 4
        && RFD.FRENZY2.blood.dur === 6 && RFD.FRENZY2.golden.coinBurst === 250,
        'Rev 3 frenzy data is present');
      check(ctx.run.goldRush && ctx.run.goldRush.meter === 0 && ctx.run.goldRush.t === 0
        && ctx.run.blood.t === 0 && ctx.run.school.count === 0
        && ctx.run.golden.eaten === 0 && ctx.schoolSwirl.t === 0,
        'separated frenzy state is initialized in place');

      var x0 = p.x, hp0 = p.hp;

      // ---- 120 steps of head-drag sim with a meal on the line. Headless
      // (no renderer), so cssToWorld() fails and stepControl's hasTarget
      // fallback is exercised: set tx/ty directly, same as a resolved drag.
      p.ctl.active = true; p.ctl.hasTarget = true;
      p.ctl.tx = p.x + 400; p.ctl.ty = p.y; p.ctl.px = 999; p.ctl.py = 999;
      prey.x = p.x + 140; prey.y = p.y;
      var score0 = ctx.run.score;
      for (var i = 0; i < 120; i++) step();

      check(Math.abs(p.x - x0) > 20, 'player moved on the stick (dx=' + (p.x - x0).toFixed(1) + ')');
      check(!prey.active && killed.indexOf('eaten') >= 0, 'prey was eaten');
      check(eatQueryCalls > 0, 'stepEat prefers World.eatQuery when present');
      check(ctx.run.score > score0, 'score increased on swallow');
      check(ctx.run.combo >= 1, 'combo incremented');
      check(ctx.run.frenzy > 0, 'frenzy meter charged');

      // ---- hunger
      var hpAfterEat = p.hp;
      p.hp = p.maxHp;
      for (var j = 0; j < 120; j++) stepHunger(p);
      check(p.hp < p.maxHp, 'hunger drained hp (' + (p.maxHp - p.hp).toFixed(2) + ')');
      check(hpAfterEat !== hp0, 'hp changed across the run');

      // Zone pressure: a tier-1 shark deep down drains faster than up top.
      p.hp = p.maxHp; p.y = 3000;
      for (var q = 0; q < 60; q++) stepHunger(p);
      var deep = p.maxHp - p.hp;
      p.hp = p.maxHp; p.y = 100;
      for (var w2 = 0; w2 < 60; w2++) stepHunger(p);
      var shallow = p.maxHp - p.hp;
      // 6.11: zone pressure multiplier relaxed 3 -> 2 (starve-out at the
      // boundary was 25s and needed to be less punitive).
      check(deep > shallow * 1.5, 'zone pressure multiplies drain (6.11: 2x, was 3x)');
      check(Math.abs(shallow - p.stat.metab * num(BAL.metabScale, 1)) < p.stat.metab * 0.05,
        'BAL.metabScale halves shallow hunger drain');

      // ---- RF-HITS-01: consumed exactly once, in the frame produced.
      p.hp = p.maxHp; p.st.invulnT = 0; p.st.phaseT = 0; ctx.run.goldRushT = 0;
      var hpBeforeHit = p.hp;
      hitQueue.push({ ent: prey, dmg: 12, x: p.x + 5, y: p.y });
      step();
      var dropped = hpBeforeHit - p.hp;
      check(dropped > 10 && dropped < 14, 'playerHits applied once, hp fell by ' + dropped.toFixed(2));
      check(p.st.invulnT > 0, 'a consumed hit opened the invulnerability window');
      var afterConsume = p.hp;
      for (var hs = 0; hs < 3; hs++) step();
      check((afterConsume - p.hp) < 1.0, 'consumed hit was not re-applied on later frames');

      // ---- RF-COINS-01
      prey.active = true; prey.coins = 6; prey.hp = 1;
      var coins0 = ctx.run.coins;
      swallow(prey);
      stepFrenzy();
      check(ctx.run.coins > coins0, 'swallow paid coins directly');
      check(prey.coins === 0, 'swallow zeroed entity coins so world drops no pickup');

      // ---- RF-BEST-01
      var peak = ctx.run.comboPeak;
      check(peak >= ctx.run.combo, 'comboPeak tracks the high-water mark');
      ctx.run.combo = 0;
      check(ctx.run.comboPeak === peak, 'comboPeak survives a broken combo');

      // ---- RF-PASSIVE-01
      p.st.statMults = { speed: 2, bite: 2, boost: 1, hp: 1, metab: 0.5 };
      check(Math.abs(liveMult(p, 'metab') - 0.5) < 1e-9, 'live metab multiplier consumed from st.statMults');
      p.hp = p.maxHp;
      for (var m1 = 0; m1 < 60; m1++) stepHunger(p);
      var slowDrain = p.maxHp - p.hp;
      p.st.statMults.metab = 1;
      p.hp = p.maxHp;
      for (var m2 = 0; m2 < 60; m2++) stepHunger(p);
      var fullDrain = p.maxHp - p.hp;
      check(slowDrain > 0 && Math.abs(fullDrain - slowDrain * 2) < fullDrain * 0.05,
        'slowMetab halves hunger drain via the numeric multiplier');
      delete p.st.statMults;

      // ---- Rev 3 frenzy state, triggers, and stacking ----------------
      var savedFrenzyUI = RF.UI;
      var frenzyChips = [], frenzyToasts = [];
      RF.UI = {
        chip: function (v) { frenzyChips.push(v); },
        toast: function (v) { frenzyToasts.push(v); }
      };
      var healMeal = { active: true, kind: 'prey', tier: 0, x: p.x, y: p.y,
        hp: 1, coins: 1, st: {}, def: { tier: 0, score: 1, coins: 1 } };
      p.hp = 0;
      swallow(healMeal);
      stepFrenzy();
      check(Math.abs(p.hp - 7.5) < 1e-9, 'BAL.eatHealBonus multiplies swallow healing');

      var savedChance = FRENZY2.golden.chance;
      var savedEntities = RF.World.entities;
      var schoolPack = [];
      for (var sp = 0; sp < 4; sp++) {
        schoolPack.push({ active: true, kind: 'prey', tier: 0, x: p.x, y: p.y,
          hp: 1, coins: 1, st: { packId: 77 },
          def: { tier: 0, score: 1, coins: 1 } });
      }
      FRENZY2.golden.chance = 0;
      RF.World.entities = schoolPack;
      ctx.run.combo = 0; ctx.run.comboT = 0;
      ctx.run.school.packId = 0; ctx.run.school.count = 0; ctx.run.school.swirlT = 0;
      ctx.run._schoolTriggeredPackId = 0;
      for (var se = 0; se < schoolPack.length; se++) swallow(schoolPack[se]);
      stepFrenzy();
      check(ctx.run.school.packId === 77 && ctx.run.school.count === 4,
        'School counts four eats from one pack in the combo window');
      check(ctx.run.school.swirlT > 4.9 && ctx.schoolSwirl.packId === 77,
        'School publishes its in-place swirl descriptor');
      check(frenzyChips.indexOf('SCHOOL FRENZY') >= 0
        && frenzyToasts.indexOf('School Frenzy: the shoal is swirling') >= 0,
        'School trigger calls both chip and toast');
      p.st.biteCd = 0.25; ctx.run._schoolPlayerCd = 0;
      stepFrenzy();
      check(Math.abs(p.st.biteCd - 0.25 / num(FRENZY2.school.eatRate, 1)) < 1e-9,
        'School scales the chew refill rate once');

      // The same pack staying active during its own swirl cannot retrigger.
      var schoolChipCount = frenzyChips.length;
      FRENZY_EAT_N = 4;
      for (var sk = 0; sk < 4; sk++) {
        FRENZY_EAT_PACK[sk] = 77;
        FRENZY_EAT_COMBO_T[sk] = 1;
        FRENZY_EAT_BLOOD[sk] = false;
        FRENZY_EAT_TIER[sk] = 0;
      }
      stepFrenzy();
      check(frenzyChips.length === schoolChipCount,
        'School cannot retrigger from its own swirl kills');

      // ---- FIX-ROUND-3 item 5: Blood Frenzy threshold formula, asserted at
      // tiers 1/6/12. `ent.tier >= (p.tier >= 4 ? p.tier - 1 : p.tier)` -
      // equal-or-bigger only while p.tier < 4 (no low-tier overfire on
      // chaff), a tier-1 grace once p.tier reaches 4 (stays reachable as
      // content thins out at higher tiers).
      var reefTierForFrenzyTest = p.tier;
      FRENZY_EAT_N = 0;
      p.tier = 1;
      recordFrenzyKill(ctx, { active: true, kind: 'prey', tier: 0, hp: 0, x: 0, y: 0 }, 'eaten');
      check(FRENZY_EAT_N === 1 && FRENZY_EAT_BLOOD[0] === false,
        'tier 1 (below 4): a tier-0 kill (below player tier) does NOT qualify for Blood Frenzy');
      FRENZY_EAT_N = 0;
      recordFrenzyKill(ctx, { active: true, kind: 'prey', tier: 1, hp: 0, x: 0, y: 0 }, 'eaten');
      check(FRENZY_EAT_N === 1 && FRENZY_EAT_BLOOD[0] === true,
        'tier 1 (below 4): an equal-tier kill DOES qualify for Blood Frenzy');
      FRENZY_EAT_N = 0;
      p.tier = 6;
      recordFrenzyKill(ctx, { active: true, kind: 'prey', tier: 4, hp: 0, x: 0, y: 0 }, 'eaten');
      check(FRENZY_EAT_N === 1 && FRENZY_EAT_BLOOD[0] === false,
        'tier 6 (>=4): a two-below kill does NOT qualify for Blood Frenzy');
      FRENZY_EAT_N = 0;
      recordFrenzyKill(ctx, { active: true, kind: 'prey', tier: 5, hp: 0, x: 0, y: 0 }, 'eaten');
      check(FRENZY_EAT_N === 1 && FRENZY_EAT_BLOOD[0] === true,
        'tier 6 (>=4): the tier-1-grace kill (p.tier-1) DOES qualify for Blood Frenzy');
      FRENZY_EAT_N = 0;
      p.tier = 12;
      recordFrenzyKill(ctx, { active: true, kind: 'prey', tier: 10, hp: 0, x: 0, y: 0 }, 'eaten');
      check(FRENZY_EAT_N === 1 && FRENZY_EAT_BLOOD[0] === true,
        'tier 12: threshold caps at the max PREY tier (10), so a tier-10 kill qualifies (review r3: endgame frenzy must be reachable)');
      FRENZY_EAT_N = 0;
      recordFrenzyKill(ctx, { active: true, kind: 'prey', tier: 11, hp: 0, x: 0, y: 0 }, 'eaten');
      check(FRENZY_EAT_N === 1 && FRENZY_EAT_BLOOD[0] === true,
        'tier 12 (>=4): the tier-1-grace kill DOES qualify for Blood Frenzy');
      p.tier = num(reefTierForFrenzyTest, 1);
      FRENZY_EAT_N = 0;

      // ---- FIX-ROUND-3 item 5: no re-trigger refresh while blood.t > 2.
      var savedFrenzyChips = frenzyChips.length;
      ctx.run.blood.t = 4;   // above the 2s floor: a qualifying bite must NOT refresh/announce
      FRENZY_EAT_N = 1;
      FRENZY_EAT_PACK[0] = 0; FRENZY_EAT_BLOOD[0] = true; FRENZY_EAT_COMBO_T[0] = 0;
      FRENZY_EAT_X[0] = 0; FRENZY_EAT_Y[0] = 0;
      stepFrenzy();
      check(Math.abs(ctx.run.blood.t - (4 - STEP)) < 1e-6,
        'blood.t only decays (no refresh) from a qualifying bite while above the 2s floor');
      check(frenzyChips.length === savedFrenzyChips,
        'no BLOOD FRENZY re-announce while blood.t > 2');
      ctx.run.blood.t = 1.5;   // at/below the floor: a qualifying bite MAY refresh again
      FRENZY_EAT_N = 1;
      FRENZY_EAT_PACK[0] = 0; FRENZY_EAT_BLOOD[0] = true; FRENZY_EAT_COMBO_T[0] = 0;
      FRENZY_EAT_X[0] = 0; FRENZY_EAT_Y[0] = 0;
      stepFrenzy();
      check(ctx.run.blood.t === num(FRENZY2.blood.dur, 6),
        'blood.t refreshes to its full duration once it has decayed to <= 2s');
      check(frenzyChips.length === savedFrenzyChips + 1,
        'BLOOD FRENZY re-announces once the window has decayed past the 2s floor');
      ctx.run.blood.t = 0;
      FRENZY_EAT_N = 0;

      // Every pairwise cue overlap, plus the all-three case.
      ctx.run.goldRushT = 0; ctx.run.blood.t = 2; ctx.run.school.swirlT = 2;
      updateFrenzyCue(ctx.run);
      check(ctx.run.frenzyCue === 'blood', 'Blood outranks School for the cue');
      ctx.run.goldRushT = 2; ctx.run.blood.t = 0; ctx.run.school.swirlT = 2;
      updateFrenzyCue(ctx.run);
      check(ctx.run.frenzyCue === 'goldRush', 'Gold Rush outranks School for the cue');
      ctx.run.goldRushT = 2; ctx.run.blood.t = 2; ctx.run.school.swirlT = 0;
      updateFrenzyCue(ctx.run);
      check(ctx.run.frenzyCue === 'goldRush', 'Gold Rush outranks Blood for the cue');
      ctx.run.goldRushT = 2; ctx.run.blood.t = 2; ctx.run.school.swirlT = 2;
      updateFrenzyCue(ctx.run);
      check(ctx.run.frenzyCue === 'goldRush', 'all frenzy cues use Gold Rush priority');

      // Rev 12 / 12.4: Gold/Mega Gold Rush speed moved OUT of applyFrenzyMults
      // into stepControl's speedCap (via ctx.run.mode), so this function now
      // only ever applies Blood Frenzy's speed/bite - Gold Rush being active
      // alongside it must leave statMults.speed untouched by this function.
      p.st.statMults = { speed: 1, bite: 1, boost: 1, hp: 1, metab: 1 };
      ctx.run._frenzyApplied = false; ctx.run.goldRushT = 2; ctx.run.blood.t = 2;
      applyFrenzyMults(ctx);
      check(Math.abs(p.st.statMults.bite - 1.5) < 1e-9,
        'Blood bite multiplier is applied through live stat multipliers');
      check(Math.abs(p.st.statMults.speed - num(FRENZY2.blood.speed, 1.2)) < 1e-9,
        'applyFrenzyMults applies only Blood speed - Gold Rush speed lives in stepControl now');
      p.st.statMults = { speed: 1, bite: 1, boost: 1, hp: 1, metab: 1 };
      ctx.run._frenzyApplied = false; ctx.run.goldRushT = 0; ctx.run.blood.t = 2;
      applyFrenzyMults(ctx);
      check(Math.abs(p.st.statMults.speed - 1.2) < 1e-9,
        'Blood speed applies alone');

      // Force the authored rare roll to prove the full-clear payout and tint.
      var goldPack = [];
      for (var gp = 0; gp < 4; gp++) {
        goldPack.push({ active: true, kind: 'prey', tier: 0, x: p.x, y: p.y,
          hp: 1, coins: 1, st: { packId: 91 },
          def: { tier: 0, score: 1, coins: 1 } });
      }
      FRENZY2.golden.chance = 1;
      RF.World.entities = goldPack;
      ctx.run.golden.packId = 0; ctx.run.golden.eaten = 0; ctx.run.golden.deadline = 0;
      ctx.run._goldenRolledPackId = 0; ctx.run._schoolTriggeredPackId = 91;
      ctx.run.combo = 0; ctx.run.comboT = 0; ctx.run.goldRushT = 0; ctx.run.frenzy = 0;
      var coinsBeforeGolden = ctx.run.coins;
      for (var ge = 0; ge < goldPack.length; ge++) swallow(goldPack[ge]);
      check(goldPack[0]._tint === FRENZY_GOLD_TINT, 'Golden School marks pack members gold');
      check(ctx.run.coins >= coinsBeforeGolden + 250, 'Golden School pays the coin burst on full clear');
      stepFrenzy();
      check(ctx.run.golden.packId === 0 && ctx.run.goldRushT > 0,
        'Golden School fills the Gold Rush meter after the clear');
      check(ctx.run.frenzyCue === 'golden' && ctx.run._goldenCuePending === false,
        'Golden School publishes one golden cue frame through the frenzy bus');
      stepFrenzy();
      check(ctx.run.frenzyCue === 'goldRush',
        'Golden cue transitions to Gold Rush on the following fixed step');
      check(frenzyChips.indexOf('GOLDEN SCHOOL') >= 0,
        'Golden School trigger calls the chip surface');
      var voidGold = { active: true, kind: 'prey', tier: 0, x: p.x, y: p.y,
        hp: 1, coins: 1, st: { packId: 123 } };
      RF.World.entities = [voidGold];
      ctx.run.golden.packId = 123; ctx.run.golden.eaten = 1; ctx.run.golden.deadline = 99;
      voidGold._goldenPackId = 123;
      var coinsBeforeVoid = ctx.run.coins;
      RF.World.kill(voidGold, 'despawn');
      check(ctx.run.golden.packId === 0 && ctx.run.coins === coinsBeforeVoid,
        'Golden School despawn voids silently without a payout');
      FRENZY2.golden.chance = savedChance;
      RF.World.entities = savedEntities;
      RF.UI = savedFrenzyUI;
      delete p.st.statMults;
      ctx.run.goldRushT = 0; ctx.run.frenzy = 0; ctx.run.blood.t = 0;
      ctx.run.school.swirlT = 0; ctx.schoolSwirl.packId = 0; ctx.schoolSwirl.t = 0;

      // ---- RF-PROFILE-01
      profile.sharks.reef.up.bite = 3;
      check(upgradeLevel('reef', 'bite') === 3, 'upgradeLevel reads sharks[id].up');
      profile.sharks.reef.up.bite = 0;

      // ---- ability teardown on the death path
      var resetCalls = 0;
      var savedAb = RF.Abilities;
      RF.Abilities = { reset: function () { resetCalls++; ctx.run.timeScale = 1; } };
      ctx.run.timeScale = 0.35;
      pendingResults = true;
      running = true;
      finishRun();
      check(resetCalls >= 1, 'finishRun called Abilities.reset before leaving');
      check(ctx.run.timeScale === 1, 'time scale restored on run exit');
      RF.Abilities = savedAb;
      running = false;

      // ---- stick mechanics on a fresh player
      var pc = buildPlayer(sharkById('reef'));
      prey.active = false;              // motion test, nothing to eat

      // ---- EAT-REV3: the wide sensor is a radius bonus, not a facing cone.
      var savedEatQuery = RF.World.eatQuery;
      var savedQuery = RF.World.query;
      var wideP = buildPlayer(sharkById('hammerhead'));
      var wideTarget = { active: true, kind: 'prey', tier: wideP.tier, x: wideP.x - 100, y: wideP.y,
        hp: 99, r: 8, st: {}, def: { tier: wideP.tier, score: 5, coins: 1 } };
      var sensedRadius = 0;
      RF.World.eatQuery = function (x, y, rr) { sensedRadius = rr; return [wideTarget]; };
      ctx.player = wideP;
      wideP.angle = 0; wideP.st.chewFxCd = 0;
      stepEat(wideP);
      check(wideP.pas.wideBite === true, 'wideBite passive is active for the cone regression');
      check(wideTarget.hp < 99, 'wideBite eats a returned target without a facing cone');
      check(Math.abs(sensedRadius - wideP.mouthR * 1.55) < 1e-9,
        'wideBite keeps its 1.55x sensor radius bonus');
      check(ctx.mouth === MOUTH && Math.abs(ctx.mouth.r - sensedRadius * 1.6) < 1e-9
        && ctx.mouth.strength === 260 && ctx.mouth.x === wideP.x + wideP.r,
        'ctx.mouth publishes the snout descriptor and suction radius');

      // Standalone merges still work when a world lane only exposes query().
      var fallbackTarget = { active: true, kind: 'prey', tier: wideP.tier, x: wideP.x, y: wideP.y,
        hp: 99, r: 8, st: {}, def: { tier: wideP.tier, score: 5, coins: 1 } };
      RF.World.eatQuery = undefined;
      RF.World.query = function () { return [fallbackTarget]; };
      wideP.st.chewFxCd = 0;
      stepEat(wideP);
      check(fallbackTarget.hp < 99, 'stepEat falls back to World.query without eatQuery');
      RF.World.eatQuery = savedEatQuery;
      RF.World.query = savedQuery;
      ctx.player = pc;

      // ---- Rev 6 / 6.6: TOO BIG cue replaces the silent continue.
      var savedUiToast = RF.UI;
      var toasts = [];
      RF.UI = { toast: function (v) { toasts.push(v); } };
      var tooBigTarget = { active: true, kind: 'prey', tier: pc.tier + BITE_UP_BASE + 5,
        x: pc.x, y: pc.y, hp: 99, r: 8, st: {},
        def: { tier: pc.tier + BITE_UP_BASE + 5, score: 5, coins: 1 } };
      var savedQ2 = RF.World.query, savedEQ2 = RF.World.eatQuery;
      RF.World.eatQuery = undefined;
      RF.World.query = function () { return [tooBigTarget]; };
      pc.st.tooBigCd = 0;
      stepEat(pc);
      check(tooBigTarget.hp === 99, 'an oversized target takes no damage');
      check(toasts.indexOf('TOO BIG') >= 0, 'TOO BIG toast fires on an oversized target');
      check(pc.st.tooBigCd > 0, 'TOO BIG cue opens its own 0.6s cooldown');
      toasts.length = 0;
      stepEat(pc);
      check(toasts.length === 0, 'TOO BIG cue is cooldown-gated, not spammed every step');
      RF.World.query = savedQ2; RF.World.eatQuery = savedEQ2;
      RF.UI = savedUiToast;
      pc.st.tooBigCd = 0;

      // ---- Rev 6 / 6.6: generosity gate math. tier <= p.tier + BITE_UP_BASE +
      // biteUp is eatable; tier <= p.tier - 1 swallows instantly.
      check(MOUTH.eligibleTierMax === pc.tier + BITE_UP_BASE + num(pc.pas.biteUp, 0),
        'MOUTH.eligibleTierMax mirrors the full gate formula (base+biteUp)');

      // ---- Rev 6 / 6.7: megajaw widens the SAME gate formula by +1/+1.
      ctx.run.buffs.megajaw = 0;
      publishMouth(pc);
      var gateBefore = MOUTH.eligibleTierMax;
      ctx.run.buffs.megajaw = 5;
      publishMouth(pc);
      check(MOUTH.eligibleTierMax === gateBefore + MEGAJAW_BITE_UP,
        'megajaw widens MOUTH.eligibleTierMax by +1 while active');
      var megaTarget = { active: true, kind: 'prey', tier: pc.tier - 1 + megajawInstantBonus(),
        x: pc.x, y: pc.y, hp: 5, r: 8, st: {},
        def: { tier: pc.tier - 1 + megajawInstantBonus(), score: 5, coins: 1 } };
      var savedQ3 = RF.World.query, savedEQ3 = RF.World.eatQuery;
      RF.World.eatQuery = undefined;
      RF.World.query = function () { return [megaTarget]; };
      var killedMega = [];
      var savedKillMega = RF.World.kill;
      RF.World.kill = function (e) { e.active = false; killedMega.push(e); };
      stepEat(pc);
      check(killedMega.length === 1, 'megajaw widens the instant-swallow tier by +1');
      RF.World.kill = savedKillMega;
      RF.World.query = savedQ3; RF.World.eatQuery = savedEQ3;
      ctx.run.buffs.megajaw = 0;

      // ---- Rev 6 / 6.7: buff timer expiry (all six buffs decay to exactly 0
      // and never go negative).
      var buffNames = ['overdrive', 'megajaw', 'magnet', 'chum', 'apex'];
      for (var bn = 0; bn < buffNames.length; bn++) {
        ctx.run.buffs[buffNames[bn]] = STEP * 2.5;
      }
      stepBuffs(); stepBuffs(); stepBuffs();
      var allZero = true;
      for (var bn2 = 0; bn2 < buffNames.length; bn2++) {
        if (ctx.run.buffs[buffNames[bn2]] !== 0) allZero = false;
      }
      check(allZero, 'buff timers expire to exactly 0, never negative');
      applyBuffPickup('overdrive');
      check(ctx.run.buffs.overdrive === BUFF_DUR.overdrive, 'applyBuffPickup arms overdrive for its full duration');
      applyBuffPickup('shield');
      check(ctx.run.buffs.shield === SHIELD_CHARGES, 'applyBuffPickup grants shield charges');
      // maxTimer only ever RAISES a timer, so start overdrive/megajaw at 0 to
      // observe apex's own fold-in rather than an already-longer buff surviving.
      ctx.run.buffs.overdrive = 0; ctx.run.buffs.megajaw = 0;
      applyBuffPickup('apex');
      check(ctx.run.buffs.apex === BUFF_DUR.apex && ctx.run.buffs.overdrive === BUFF_DUR.apex
        && ctx.run.buffs.megajaw === BUFF_DUR.apex,
        'apex folds overdrive + megajaw into its own shorter window');
      var beforeUnknown = JSON.stringify(ctx.run.buffs);
      applyBuffPickup('not-a-real-buff-id');
      check(JSON.stringify(ctx.run.buffs) === beforeUnknown,
        'an unknown buff id is a silent no-op (buffs unchanged, no throw)');
      ctx.run.buffs.overdrive = 0; ctx.run.buffs.shield = 0; ctx.run.buffs.megajaw = 0;
      ctx.run.buffs.magnet = 0; ctx.run.buffs.chum = 0; ctx.run.buffs.apex = 0;

      // ---- Rev 12 / 12.4: the three new power-up pickups (super size,
      // mode shield, mode speed), their durations, and their decay.
      applyBuffPickup('buff_supersize');
      check(ctx.run.buffs.supersize === num(SUPERSIZE_CFG.dur, 10),
        'applyBuffPickup arms SUPER SIZE for its configured duration');
      applyBuffPickup('buff_shield');
      check(ctx.run.buffs.modeShield === num(MODE_SHIELD_CFG.hits, 3),
        'applyBuffPickup grants the mode SHIELD its configured charge count');
      check(ctx.run.buffs.shield === 0,
        'the mode SHIELD pickup uses its OWN charge counter, never the legacy overdrive-table shield');
      applyBuffPickup('buff_speed');
      check(ctx.run.buffs.modeSpeed === num(MODE_SPEED_CFG.dur, 9),
        'applyBuffPickup arms mode SPEED for its configured duration');
      ctx.run.buffs.supersize = STEP * 1.5; ctx.run.buffs.modeSpeed = STEP * 1.5;
      stepBuffs(); stepBuffs();
      check(ctx.run.buffs.supersize === 0 && ctx.run.buffs.modeSpeed === 0,
        'SUPER SIZE and mode SPEED timers decay to exactly 0, never negative');
      ctx.run.buffs.modeShield = 0;

      // ---- Rev 12 / 12.4: SUPER SIZE folds into the SAME eatable-tier gate
      // as megajaw (+tierBonus reach) and live-scales p.r/p.mouthR from the
      // stored *Base fields, matching the megajaw pattern rather than
      // forking a second gate.
      var ssPrey = { active: true, kind: 'prey', tier: pc.tier + num(SUPERSIZE_CFG.tierBonus, 2),
        x: pc.x, y: pc.y, coins: 1, hp: 1 };
      ctx.run.buffs.supersize = 0;
      check(eatEligible(pc, ssPrey) === false,
        'a prey at +tierBonus is TOO BIG without SUPER SIZE active');
      ctx.run.buffs.supersize = num(SUPERSIZE_CFG.dur, 10);
      check(eatEligible(pc, ssPrey) === true,
        'SUPER SIZE widens the eatable-tier gate by tierBonus, same formula as megajaw');
      var rBefore = pc.rBase, mrBefore = pc.mouthRBase;
      stepSuperSize(pc);
      check(Math.abs(pc.r - rBefore * num(SUPERSIZE_CFG.sizeMult, 1.5)) < 1e-9
        && Math.abs(pc.mouthR - mrBefore * num(SUPERSIZE_CFG.sizeMult, 1.5)) < 1e-9,
        'stepSuperSize live-scales p.r/p.mouthR by sizeMult while active');
      ctx.run.buffs.supersize = 0;
      stepSuperSize(pc);
      check(pc.r === rBefore && pc.mouthR === mrBefore,
        'stepSuperSize restores the true (unbuffed) radii once the buff ends');

      // ---- Rev 12 / 12.4: GOLD RUSH / MEGA GOLD RUSH mode transitions,
      // multipliers, and durations. A fresh ctx.run frenzy state so this
      // section's edges are not polluted by whatever ran above.
      ctx.run.mode = ''; ctx.run.frenzy = 0; ctx.run.megaMeter = 0;
      ctx.run.goldRushT = 0; ctx.run._goldRushAnnounced = false; ctx.run._megaAnnounced = false;
      ctx.run.frenzy = 1;
      stepFrenzy();
      check(ctx.run.mode === 'goldRush', 'a full frenzy meter enters GOLD RUSH mode');
      check(Math.abs(ctx.run.goldRushT - num(MODE_GOLD.dur, num(FRENZY.goldRushDur, 8))) < 1e-9,
        'Gold Rush timer starts at its configured duration');
      var ssPrey2 = { active: true, kind: 'prey', tier: pc.tier + 50, x: pc.x, y: pc.y, coins: 1, hp: 1 };
      check(eatEligible(pc, ssPrey2) === false,
        'plain Gold Rush does NOT make an absurdly-oversized prey edible (that is Mega only)');
      var coinsBefore = ctx.run.coins;
      var goldPrey = { active: true, kind: 'prey', tier: 0, x: pc.x, y: pc.y, coins: 10, hp: 1, def: null };
      var multBeforeGold = comboMult();   // swallow() increments combo itself
      swallow(goldPrey);
      check(ctx.run.coins - coinsBefore === 10 * multBeforeGold * num(MODE_GOLD.coinMult, 2),
        'Gold Rush pays out coinMult from MODES config on a swallow');
      // Fill the CHAINED mega meter (swallow() above already added one
      // meterPerEat step to megaMeter since mode is 'goldRush'); force it the
      // rest of the way to 1 and let stepFrenzy resolve the chain.
      ctx.run.megaMeter = 1;
      stepFrenzy();
      check(ctx.run.mode === 'megaGoldRush',
        'a second full meter DURING Gold Rush chains into MEGA GOLD RUSH');
      check(ctx.run.goldRushT >= num(MODE_MEGA.dur, 10) - 1e-9,
        'Mega Gold Rush tops the shared timer up to at least its own configured duration');
      check(eatEligible(pc, ssPrey2) === true,
        'MEGA GOLD RUSH makes an arbitrarily-oversized prey edible for its duration');
      // Fresh prey object: swallow() zeroes e.coins in place (RF-COINS-01),
      // so reusing goldPrey here would silently pay out 0 the second time.
      var goldPrey2 = { active: true, kind: 'prey', tier: 0, x: pc.x, y: pc.y, coins: 10, hp: 1, def: null };
      var coinsBefore2 = ctx.run.coins;
      var multBeforeMega = comboMult();
      swallow(goldPrey2);
      check(ctx.run.coins - coinsBefore2 === 10 * multBeforeMega * num(MODE_MEGA.coinMult, 3),
        'Mega Gold Rush pays out its own (higher) coinMult from MODES config');
      // Timer expiry clears BOTH the mode and the mega chain state, not just
      // the primary meter - a stale mode string would leave eatEligible/HUD
      // reading a mode that is no longer actually running.
      ctx.run.goldRushT = STEP * 0.5;
      stepFrenzy();
      check(ctx.run.mode === '' && ctx.run.goldRushT === 0 && ctx.run.frenzy === 0 && ctx.run.megaMeter === 0,
        'Gold/Mega Gold Rush timer expiry clears mode + both meters together');
      ctx.run.mode = ''; ctx.run.frenzy = 0; ctx.run.megaMeter = 0; ctx.run.goldRushT = 0;
      ctx.run._goldRushAnnounced = false; ctx.run._megaAnnounced = false;

      // ---- Rev 6.11 item 1: real buffpickup spawn -> collect integration
      // test, replacing the old unconditional check(true). Exercises the
      // FULL lifecycle contract: World writes e.buffId (plain id, no defId
      // fallback); stepPickups runs BEFORE stepEat in step()'s own order and
      // must be the thing that arms the buff and removes the entity; a
      // buffpickup entity within eat range must NEVER be swallowed as prey
      // even if stepEat also sees it in the same query.
      var savedQPick = RF.World.query, savedEQPick = RF.World.eatQuery, savedKillPick = RF.World.kill;
      var fakeBuffPickup = {
        active: true, kind: 'buffpickup', buffId: 'overdrive', defId: 'buff_overdrive',
        x: pc.x, y: pc.y, r: 16, hp: 1, st: {}
      };
      var killedPick = [];
      RF.World.kill = function (e, cause) { e.active = false; killedPick.push({ e: e, cause: cause }); };
      RF.World.eatQuery = function () { return fakeBuffPickup.active ? [fakeBuffPickup] : []; };
      RF.World.query = function () { return fakeBuffPickup.active ? [fakeBuffPickup] : []; };
      ctx.run.buffs.overdrive = 0;
      pc.st.chewFxCd = 0;
      stepPickups(pc);
      check(ctx.run.buffs.overdrive === BUFF_DUR.overdrive,
        'buffpickup integration: stepPickups reads e.buffId and arms the buff');
      check(fakeBuffPickup.active === false && killedPick.length === 1 && killedPick[0].cause === 'collected',
        'buffpickup integration: stepPickups collects (kills) the entity, cause=collected');
      // stepEat must never treat a (still-active, in case ordering regresses)
      // buffpickup as edible/scored prey: re-arm it as active and drive
      // stepEat directly to prove the eat path excludes 'buffpickup' by kind,
      // independent of step()'s ordering.
      fakeBuffPickup.active = true;
      killedPick.length = 0;
      ctx.run.score = 0; ctx.run.coins = 0;
      pc.st.chewFxCd = 0;
      stepEat(pc);
      check(fakeBuffPickup.active === true && killedPick.length === 0,
        'buffpickup integration: stepEat never eats a buffpickup entity');
      check(ctx.run.score === 0 && ctx.run.coins === 0,
        'buffpickup integration: stepEat awards no score/coins for a buffpickup');
      RF.World.query = savedQPick; RF.World.eatQuery = savedEQPick; RF.World.kill = savedKillPick;
      ctx.run.buffs.overdrive = 0;

      // ---- SPEC3D 7.6: relic/gempickup collection lifecycle. Guarded so the
      // game runs before S2/S3 land spawning/data.
      check(Array.isArray(ctx.run.relics) && ctx.run.relics.length === 0 && ctx.run.gems === 0,
        'ctx.run.relics/gems initialize empty at run start');
      var savedQRelic = RF.World.query, savedEQRelic = RF.World.eatQuery, savedKillRelic = RF.World.kill;
      var fakeRelic = { active: true, kind: 'relic', zoneId: 2, relicId: 'r2-1', x: pc.x, y: pc.y, r: 12, hp: 1, st: {} };
      var killedRelic = [];
      RF.World.kill = function (e, cause) { e.active = false; killedRelic.push({ e: e, cause: cause }); };
      RF.World.eatQuery = function () { return fakeRelic.active ? [fakeRelic] : []; };
      RF.World.query = function () { return fakeRelic.active ? [fakeRelic] : []; };
      var relicsBefore = ctx.run.relics.length;
      pc.st.chewFxCd = 0;
      stepEat(pc);
      check(ctx.run.relics.length === relicsBefore + 1 && killedRelic.length === 1
        && killedRelic[0].cause === 'collected' && fakeRelic.active === false,
        'stepEat collects a relic entity into ctx.run.relics and removes it (kind=relic)');
      check(ctx.run.relics[ctx.run.relics.length - 1].relicId === 'r2-1',
        'collected relic record carries relicId/zoneId through');
      check(eatEligible(pc, { active: true, kind: 'relic', tier: 0 }) === false,
        'eatEligible excludes kind relic');

      var fakeGem = { active: true, kind: 'gempickup', value: 3, x: pc.x, y: pc.y, r: 10, hp: 1, st: {} };
      var killedGem = [];
      RF.World.kill = function (e, cause) { e.active = false; killedGem.push({ e: e, cause: cause }); };
      RF.World.eatQuery = function () { return fakeGem.active ? [fakeGem] : []; };
      RF.World.query = function () { return fakeGem.active ? [fakeGem] : []; };
      var gemsBefore = ctx.run.gems;
      pc.st.chewFxCd = 0;
      stepEat(pc);
      check(ctx.run.gems === gemsBefore + 3 && killedGem.length === 1 && fakeGem.active === false,
        'stepEat collects a gempickup entity into ctx.run.gems += value (kind=gempickup)');
      check(eatEligible(pc, { active: true, kind: 'gempickup', tier: 0 }) === false,
        'eatEligible excludes kind gempickup');
      // Missing/undefined value defaults to 1 rather than throwing or NaN-ing.
      var fakeGem2 = { active: true, kind: 'gempickup', x: pc.x, y: pc.y, r: 10, hp: 1, st: {} };
      RF.World.eatQuery = function () { return fakeGem2.active ? [fakeGem2] : []; };
      RF.World.query = function () { return fakeGem2.active ? [fakeGem2] : []; };
      var gemsBefore2 = ctx.run.gems;
      pc.st.chewFxCd = 0;
      stepEat(pc);
      check(ctx.run.gems === gemsBefore2 + 1, 'gempickup with no value field defaults to +1 gem');
      RF.World.query = savedQRelic; RF.World.eatQuery = savedEQRelic; RF.World.kill = savedKillRelic;

      // ---- Rev 6 / 6.7: charge economy never drops below 0 or exceeds the cap.
      ctx.run.powerCharges = 0;
      grantPowerCharge(1);
      check(ctx.run.powerCharges === 1, 'grantPowerCharge adds a charge from zero');
      grantPowerCharge(999);
      check(ctx.run.powerCharges === POWER_CHARGE_CAP, 'grantPowerCharge clamps at the cap (' + POWER_CHARGE_CAP + ')');
      ctx.run.powerCharges = 0;
      var savedAbCharge = RF.Abilities;
      RF.Abilities = { fire: function () { return true; }, canFire: function () { return true; } };
      firePower();
      check(ctx.run.powerCharges === 0, 'firePower is a no-op with zero charges');
      ctx.run.powerCharges = 2;
      firePower();
      check(ctx.run.powerCharges === 1, 'firePower spends exactly one charge on a successful fire');
      RF.Abilities = { fire: function () { return false; }, canFire: function () { return true; } };
      firePower();
      check(ctx.run.powerCharges === 1, 'a declined Abilities.fire does not spend a charge');
      RF.Abilities = savedAbCharge;
      ctx.run.powerCharges = POWER_CHARGE_START;
      ctx.run._lastComboCharge = 0;

      // ---- Rev 6 / 6.5: lunge timing (preyNear -> lunge -> cooldown).
      var savedQ4 = RF.World.query, savedEQ4 = RF.World.eatQuery;
      pc.x = 3500; pc.y = 700; pc.vx = 0; pc.vy = 0; pc.angle = 0;
      pc.st.lungeT = 0; pc.st.lungeCd = 0; pc.st.preyNear = false; pc.st.preyNearCd = 0;
      var lungeTarget = { active: true, kind: 'prey', tier: 0, x: pc.x + pc.r * 1.5, y: pc.y,
        hp: 99, r: 8, st: {}, def: { tier: 0, score: 5, coins: 1 } };
      RF.World.eatQuery = undefined;
      RF.World.query = function () { return [lungeTarget]; };
      stepPreyNear(pc);
      // FIX-ROUND-3 item 2: preyNear's range is now 2.2*p.r (body radius),
      // SAME as the lunge query, not the old tighter 2.2*mouthR.
      check(pc.st.preyNear === true, 'preyNear detects an eatable target inside 2.2*p.r (body radius)');
      var lungeStartVx = pc.vx;
      stepLunge(pc);
      check(pc.st.lungeT > 0 && pc.st.lungeT <= LUNGE_DUR, 'lunge fires and opens its 0.22s window');
      check(Math.abs(pc.st.lungeX - lungeTarget.x) < 1e-9 && Math.abs(pc.st.lungeY - lungeTarget.y) < 1e-9,
        'lunge captures the target POINT as numbers');
      var lungeSteps = 0;
      while (pc.st.lungeT > 0 && lungeSteps < 30) { stepLunge(pc); lungeSteps++; }
      check(pc.st.lungeT === 0, 'lunge window ends within its 0.22s duration (' + lungeSteps + ' steps)');
      check(pc.st.lungeCd > 0, 'lunge opens a cooldown on completion');
      check(pc.vx !== lungeStartVx, 'lunge accelerated the player toward the captured point');
      var cdBefore = pc.st.lungeCd;
      pc.st.preyNear = true;
      stepLunge(pc);
      check(pc.st.lungeT === 0, 'lunge cannot refire while its cooldown is active');
      // Isolate the cooldown decay itself: with preyNear false, stepLunge can
      // only ever decrement lungeCd, never re-arm a fresh lunge on the frame
      // it reaches zero.
      pc.st.preyNear = false;
      var cdSteps = 0;
      while (pc.st.lungeCd > 0 && cdSteps < 120) { stepLunge(pc); cdSteps++; }
      check(pc.st.lungeCd === 0, 'lunge cooldown (0.9s) fully decays (' + cdSteps + ' steps)');
      RF.World.query = savedQ4; RF.World.eatQuery = savedEQ4;
      pc.st.lungeT = 0; pc.st.lungeCd = 0; pc.st.preyNear = false;

      pc.x = 3000; pc.y = 600; pc.vx = 0; pc.vy = 0; pc.angle = 0;
      var ang45 = Math.PI / 4;
      // SPEC3D 8.2: pure-pursuit target far along ang45 (headless: hasTarget
      // fallback).
      pc.ctl.active = true; pc.ctl.hasTarget = true;
      pc.ctl.tx = pc.x + Math.cos(ang45) * 2000; pc.ctl.ty = pc.y + Math.sin(ang45) * 2000;
      var sx0 = pc.x, sy0 = pc.y;
      for (var s4 = 0; s4 < 120; s4++) step();
      var mx = pc.x - sx0, my = pc.y - sy0;
      var mlen = Math.sqrt(mx * mx + my * my);
      check(mlen > 40, 'pursuit target accelerated the player (' + mlen.toFixed(1) + ' px)');
      var dot = (mx * Math.cos(ang45) + my * Math.sin(ang45)) / (mlen || 1);
      check(dot > 0.9, 'travel followed the target direction (cos=' + dot.toFixed(3) + ')');
      check(Math.abs(angDelta(pc.angle, ang45)) < 0.25, 'heading eased toward the target');
      var movingSpeed = Math.sqrt(pc.vx * pc.vx + pc.vy * pc.vy);
      check(movingSpeed > 10, 'player is genuinely under way (' + movingSpeed.toFixed(1) + ' px/s)');

      // 8.2 NOSE ANCHOR: the seek target is the snout tip
      // (p.x + cos(angle)*p.r, p.y + sin(angle)*p.r), not body center. Park
      // the finger exactly on the CURRENT nose tip with the body angled away
      // from the target direction the naive body-center math would pick;
      // stepControl must resolve wantAngle from the nose->target vector, so
      // a target that sits behind the body relative to the nose still reads
      // as "basically arrived" rather than driving a big turn.
      pc.x = 3000; pc.y = 600; pc.vx = 0; pc.vy = 0; pc.angle = 0.7;
      var curNoseX = pc.x + Math.cos(pc.angle) * pc.r;
      var curNoseY = pc.y + Math.sin(pc.angle) * pc.r;
      pc.ctl.tx = curNoseX; pc.ctl.ty = curNoseY;
      var angleBefore = pc.angle;
      stepControl(pc);
      check(Math.abs(angDelta(angleBefore, pc.angle)) < 0.05,
        'target planted exactly on the nose tip (not body center) reads as arrived, not a big turn');

      // 8.2 speed is monotone in distCss. A near target (small nose->finger
      // distance, mid-range of the dead-to-full band) settles at a LOWER
      // speed than a far target (full deflection) - never the same, never
      // inverted.
      pc.x = 3000; pc.y = 600; pc.vx = 0; pc.vy = 0; pc.angle = 0;
      var wpp = (2 * CAM_Z * Math.tan((CAM_FOV * Math.PI / 180) / 2)) / CSS_H;
      pc.ctl.tx = pc.x + Math.cos(ang45) * (40 * wpp);
      pc.ctl.ty = pc.y + Math.sin(ang45) * (40 * wpp);
      for (var s5 = 0; s5 < 120; s5++) step();
      var nearSpeed = Math.sqrt(pc.vx * pc.vx + pc.vy * pc.vy);
      check(nearSpeed >= 0 && nearSpeed < movingSpeed,
        'closer target settles at a slower speed than a far target (near=' +
        nearSpeed.toFixed(1) + ' vs far=' + movingSpeed.toFixed(1) + ')');

      // RELEASE: decelerate (glide, not a hard stop) and settle at rest.
      pc.x = 3000; pc.y = 600; pc.vx = 0; pc.vy = 0; pc.angle = ang45;
      pc.ctl.tx = pc.x + Math.cos(ang45) * 2000; pc.ctl.ty = pc.y + Math.sin(ang45) * 2000;
      for (var sRel = 0; sRel < 60; sRel++) step();
      clearStick();
      check(!pc.ctl.active && pc.ctl.mag === 0, 'clearStick cleared the pursuit state');
      var immediatelyAfterRelease = Math.sqrt(pc.vx * pc.vx + pc.vy * pc.vy);
      check(immediatelyAfterRelease > 0.01, 'release does not hard-zero velocity in the same step (glide, not a snap)');
      for (var s6 = 0; s6 < 120; s6++) step();
      var restSpeed = Math.sqrt(pc.vx * pc.vx + pc.vy * pc.vy);
      check(restSpeed < 1.0, 'player decelerated to rest on release (' + restSpeed.toFixed(4) + ')');
      var restX = pc.x, restY = pc.y;
      for (var s7 = 0; s7 < 60; s7++) step();
      check((Math.abs(pc.x - restX) + Math.abs(pc.y - restY)) < 0.5, 'no drift after release');

      // Cancel path releases both pointers.
      pc.ctl.active = true; pc.ctl.hasTarget = true;
      pc.ctl.tx = pc.x + 400; pc.ctl.ty = pc.y;
      pc.ctl.steerId = 7; pc.ctl.boostId = 9;
      clearStick(); pc.ctl.boostId = null;
      check(pc.ctl.steerId === null && pc.ctl.boostId === null && !pc.ctl.active,
        'cancel path releases both pointers');

      // Dead zone: 8.2 caps it at 0.5*noseR css px (no larger). A target a
      // couple world units off the nose (well under that floor) must not
      // creep the player.
      plantStick(400, 300);
      check(pc.ctl.active && pc.ctl.px === 400 && pc.ctl.py === 300,
        'plantStick placed the finger point');
      pc.ctl.hasTarget = true;
      pc.angle = 0;
      // Rev 9: the seek anchor is the body CENTER (see stepControl); a target
      // ~0.5 css px off the center is inside the (capped) dead zone.
      pc.ctl.tx = pc.x + 0.5 * wpp; pc.ctl.ty = pc.y;
      pc.vx = 0; pc.vy = 0;
      for (var s8 = 0; s8 < 30; s8++) step();
      check(Math.sqrt(pc.vx * pc.vx + pc.vy * pc.vy) < 0.5, 'sub-dead-zone target does not creep');
      clearStick();
      // 8.2 TURN-RATE BOUND: heading never changes more than the fixed
      // pursuit turn rate (>= 14 rad/s) per step, regardless of distance.
      pc.angle = 0; pc.ctl.active = true; pc.ctl.hasTarget = true;
      pc.ctl.tx = pc.x + Math.cos(Math.PI) * 2000; pc.ctl.ty = pc.y + Math.sin(Math.PI) * 2000;
      check(CTL_PURSUIT_TURN_RATE >= 14, 'pursuit turn rate meets the SPEC3D 8.2 >= 14 rad/s floor');
      var maxTurnStep = CTL_PURSUIT_TURN_RATE * STEP + 1e-6;
      var prevA = pc.angle, worstTurn = 0;
      for (var s9 = 0; s9 < 60; s9++) {
        stepControl(pc);
        var d = Math.abs(angDelta(prevA, pc.angle));
        if (d > worstTurn) worstTurn = d;
        prevA = pc.angle;
      }
      check(worstTurn <= maxTurnStep, 'heading never changes more than turnRate*dt per step (' +
        worstTurn.toFixed(4) + ' <= ' + maxTurnStep.toFixed(4) + ')');
      clearStick();

      // 8.2 ARRIVAL DAMPING: settle a target squarely inside the arrival
      // zone (well under CTL_PURSUIT_FULL_CSS) and simulate a real settle.
      // The critically-damped spring must reach the finger within 300ms
      // (settle window from the SPEC3D 8.2 gate) and never overshoot into
      // circling - track the sign of the nose->target x-error each step and
      // assert it flips at most 2 times across the whole settle (a bounded
      // number of small corrections is fine; a sustained oscillation/orbit
      // is not).
      pc.x = 3000; pc.y = 600; pc.vx = 0; pc.vy = 0; pc.angle = 0;
      pc.ctl.active = true; pc.ctl.hasTarget = true;
      var arriveWpp = wpp;
      var arriveTx = pc.x + 45 * arriveWpp, arriveTy = pc.y + 10 * arriveWpp; // ~46 css px, inside 60
      pc.ctl.tx = arriveTx; pc.ctl.ty = arriveTy;
      var settleSteps = Math.round(0.3 / STEP);
      var signFlips = 0, lastSign = 0;
      var finalNoseX = 0, finalNoseY = 0;
      for (var sA = 0; sA < settleSteps; sA++) {
        step();
        var nX = pc.x + Math.cos(pc.angle) * pc.r;
        var nY = pc.y + Math.sin(pc.angle) * pc.r;
        var errX = arriveTx - nX;
        var sign = errX > 0.5 ? 1 : (errX < -0.5 ? -1 : 0);
        if (sign !== 0 && lastSign !== 0 && sign !== lastSign) signFlips++;
        if (sign !== 0) lastSign = sign;
        finalNoseX = nX; finalNoseY = nY;
      }
      var settleErr = Math.sqrt((arriveTx - finalNoseX) * (arriveTx - finalNoseX)
        + (arriveTy - finalNoseY) * (arriveTy - finalNoseY)) / arriveWpp;
      check(settleErr < 90, 'nose within 90 css px of the finger after a 300ms settle (' + settleErr.toFixed(1) + ')');
      check(signFlips <= 2, 'arrival is critically damped - no sustained oscillation/orbit (' + signFlips + ' sign flips)');
      clearStick();
      pc.vx = 0; pc.vy = 0;

      // ---- rig animation advances in the fixed step
      pc.ctl.speedCap = pc.stat.speed;
      pc.vx = 0; pc.vy = 0; pc.ctl.active = false; pc.ctl.mag = 0;
      pc.anim.tailPhase = 0;
      var idleTurns = 0, lastPh = 0;
      for (var t1 = 0; t1 < 60; t1++) {
        stepAnim(pc);
        if (pc.anim.tailPhase < lastPh) idleTurns++;
        lastPh = pc.anim.tailPhase;
      }
      var idleAmp = pc.anim.tailAmp;
      check(idleTurns >= 2 && idleTurns <= 3, 'idle tail beat near 2.5 Hz (' + idleTurns + ' cycles/s)');
      pc.vx = pc.stat.speed; pc.vy = 0;
      pc.anim.tailPhase = 0; lastPh = 0;
      var cruiseTurns = 0;
      for (var t2 = 0; t2 < 60; t2++) {
        stepAnim(pc);
        if (pc.anim.tailPhase < lastPh) cruiseTurns++;
        lastPh = pc.anim.tailPhase;
        pc.vx = pc.stat.speed; pc.vy = 0;
      }
      check(cruiseTurns > idleTurns, 'tail phase advances faster with speed (' + idleTurns + ' -> ' + cruiseTurns + ')');
      check(pc.anim.tailAmp > idleAmp, 'tail amplitude rises with speed');
      pc.ctl.boosting = true;
      pc.anim.tailPhase = 0; lastPh = 0;
      var boostTurns = 0;
      for (var t3 = 0; t3 < 60; t3++) {
        stepAnim(pc);
        if (pc.anim.tailPhase < lastPh) boostTurns++;
        lastPh = pc.anim.tailPhase;
        pc.vx = pc.stat.speed; pc.vy = 0;
      }
      check(boostTurns > cruiseTurns, 'boost beats faster than cruise (' + cruiseTurns + ' -> ' + boostTurns + ')');
      pc.ctl.boosting = false;

      pc.ctl.turnIn = 1;
      for (var t4 = 0; t4 < 120; t4++) stepAnim(pc);
      check(Math.abs(pc.anim.bank) > 0.02, 'body banks into a sustained turn');
      check(Math.abs(pc.anim.bank) <= BANK_MAX + 1e-9, 'bank is capped at ' + BANK_MAX + ' rad');
      pc.ctl.turnIn = 0;

      // r15 lane JAW: the jaw contract changed. A shark at REST now holds a
      // slight breathing gape (JAW_REST +- JAW_BREATHE_AMP) instead of a shut
      // mouth, and a bite is an explicit open/close/hold/return cycle rather
      // than an eased blend off chewFxCd. The old checks asserted "0 at rest",
      // which is exactly the frozen-jaw model this pass removed.
      pc.st.biteCycle = { phase: null, t: 0, from: JAW_REST, closeFrame: false, pending: null };
      pc.anim.jawGape = JAW_REST;
      for (var t5i = 0; t5i < 40; t5i++) stepAnim(pc);
      check(pc.anim.jawGape >= JAW_REST - JAW_BREATHE_AMP - 1e-6
        && pc.anim.jawGape <= JAW_REST + JAW_BREATHE_AMP + 1e-6,
        'idle jaw rests inside the breathing band (' + pc.anim.jawGape.toFixed(3) + ')');
      // The idle band must actually MOVE - a frozen jaw sitting dead centre
      // would satisfy the range check above, which is how the original defect
      // went unnoticed.
      var jawLo = 1, jawHi = 0;
      for (var t5j = 0; t5j < 130; t5j++) {
        stepAnim(pc);
        if (pc.anim.jawGape < jawLo) jawLo = pc.anim.jawGape;
        if (pc.anim.jawGape > jawHi) jawHi = pc.anim.jawGape;
      }
      check(jawHi - jawLo > 0.02, 'idle jaw oscillates (breathing), span ' + (jawHi - jawLo).toFixed(3));

      // A triggered bite must OPEN, then reach a shut jaw, then come back.
      triggerBite(pc, { x: pc.x, y: pc.y, mealT: 1, isSmallPrey: false, chroma: 0,
        tint: 0xffffff, popup: 10, popupMult: false, angle: 0 });
      var peak = 0, trough = 1, sawClose = false;
      for (var t6i = 0; t6i < 40; t6i++) {
        stepAnim(pc);
        if (pc.anim.jawGape > peak) peak = pc.anim.jawGape;
        if (pc.st.biteCycle.phase === 'hold' || pc.st.biteCycle.phase === 'back') {
          if (pc.anim.jawGape < trough) trough = pc.anim.jawGape;
          sawClose = true;
        }
      }
      check(peak >= JAW_BITE_OPEN - 0.02, 'bite snaps OPEN to ~' + JAW_BITE_OPEN + ' (' + peak.toFixed(3) + ')');
      check(sawClose && trough <= 0.03, 'bite CLOSES to 0-2% (' + trough.toFixed(3) + ')');
      for (var t6j = 0; t6j < 60; t6j++) stepAnim(pc);
      check(pc.st.biteCycle.phase === null, 'bite cycle returns to idle');
      check(Math.abs(pc.anim.jawGape - JAW_REST) <= JAW_BREATHE_AMP + 0.02,
        'jaw returns to the rest gape after a bite (' + pc.anim.jawGape.toFixed(3) + ')');

      pc.vx = 0; pc.vy = 0;
      for (var t7 = 0; t7 < 40; t7++) stepAnim(pc);
      check(Math.abs(pc.anim.bob) > 0, 'idle bob runs when slow');
      pc.vx = pc.stat.speed; pc.vy = 0;
      for (var t8 = 0; t8 < 120; t8++) { stepAnim(pc); pc.vx = pc.stat.speed; pc.vy = 0; }
      check(Math.abs(pc.anim.bob) < 0.01, 'idle bob decays at speed');

      // The Art3D state bag is filled and handed over every step.
      var seen = null, calls = 0;
      pc.rig = { group: null, parts: {}, animate: function (t, st) { calls++; seen = st; } };
      pc.ctl.turnIn = 0.5; pc.st.jawSnapT = 0.1; pc.st.chewFxCd = 0.1;
      stepAnim(pc);
      check(calls === 1 && !!seen, 'rig.animate driven once per step');
      check(seen && typeof seen.speedFrac === 'number' && typeof seen.turn === 'number'
        && typeof seen.bitePhase === 'number' && typeof seen.jawSnapT === 'number',
        'animate state carries speedFrac/turn/bitePhase/jawSnapT');
      // A throwing lane-D must not break the step.
      pc.rig = { group: null, parts: {}, animate: function () { throw new Error('lane D3 blew up'); } };
      var threwRig = null;
      try { stepAnim(pc); } catch (e) { threwRig = e; }
      check(!threwRig, 'a throwing Art3D.animate is absorbed');
      pc.rig = null;
      pc.st.chewFxCd = 0; pc.st.jawSnapT = 0;

      // ---- Art3D absence: fallbackShark must produce a real group.
      var savedArt3D = RF.Art3D;
      RF.Art3D = undefined;
      var fb = buildPlayerRig(sharkById('reef'));
      check(!!fb && !!fb.group && fb.group.isObject3D && fb.__fallback === true,
        'no RF.Art3D falls back to a colored capsule mesh');
      check(typeof fb.animate === 'function', 'fallback rig exposes animate()');
      var threwFbAnim = null;
      try { fb.animate(0, pc.anim.state); } catch (e) { threwFbAnim = e; }
      check(!threwFbAnim, 'fallback animate runs');
      disposeTree(fb.group);
      RF.Art3D = { buildShark: function () { throw new Error('lane D3 bake blew up'); } };
      var fb2 = buildPlayerRig(sharkById('reef'));
      check(!!fb2 && fb2.__fallback === true, 'a throwing buildShark falls back');
      disposeTree(fb2.group);
      RF.Art3D = { buildShark: function () { return { nope: true }; } };
      var fb3 = buildPlayerRig(sharkById('reef'));
      check(!!fb3 && fb3.__fallback === true, 'a malformed rig record falls back');
      disposeTree(fb3.group);
      RF.Art3D = savedArt3D;

      // ---- juice hooks: modern pools preferred, old families the fallback.
      var savedFx = RF.Fx, savedSound = RF.Sound;
      var emits = [];
      RF.Fx = { emit: function (n) { emits.push(n); return n === 'swimtrail' || n === 'breach' ? 3 : 1; } };
      pc.anim.trailInit = true; pc.anim.trailX = 0; pc.anim.trailY = 0;
      pc.x = 3000; pc.y = 600; pc.vx = pc.stat.speed; pc.vy = 0;
      pc.ctl.speedCap = pc.stat.speed;
      stepAnim(pc);
      check(emits.indexOf('swimtrail') >= 0 && emits.indexOf('bubbles') < 0,
        'modern fx3d takes swimtrail and no bubbles fallback');
      emits.length = 0;
      RF.Fx = { emit: function (n) { emits.push(n); return n === 'bubbles' ? 3 : 0; } };
      pc.anim.trailX = 0; pc.anim.trailY = 0;
      stepAnim(pc);
      check(emits.indexOf('swimtrail') >= 0 && emits.indexOf('bubbles') >= 0,
        'older fx falls back from swimtrail to bubbles');
      emits.length = 0;
      var sfxPlayed = [];
      RF.Sound = { play: function (n) { sfxPlayed.push(n); } };
      RF.Fx = { emit: function (n) { emits.push(n); return n === 'breach' ? 5 : 0; } };
      pc.st.airborne = false; pc.y = -10; pc.vy = -200;
      stepMotion(pc);
      check(emits.indexOf('breach') >= 0, 'surface exit emitted a breach');
      check(sfxPlayed.indexOf('splash') < 0, 'breach pool owns its own sound, engine does not double it');
      emits.length = 0; sfxPlayed.length = 0;
      RF.Fx = { emit: function () { return 0; } };
      pc.st.airborne = false; pc.y = -10; pc.vy = -200;
      stepMotion(pc);
      check(sfxPlayed.indexOf('splash') >= 0, 'splash sound falls back when no breach pool');
      RF.Fx = savedFx; RF.Sound = savedSound;

      // ---- eat feedback parity: burst + popup + jaw snap + scale pop + hit-stop
      var savedJuice = RF.Juice, savedSound2 = RF.Sound;
      var fxSeen = [], stops = [], sfxSeen2 = [];
      var burstOpts = [];
      RF.Fx = { emit: function (n, x, y, opts) { fxSeen.push(n); if (n === 'deathBurst') burstOpts.push(opts); return 1; } };
      RF.Juice = { hitStop: function (ms) { stops.push(ms); }, shake: function () {} };
      RF.Sound = { play: function (n) { sfxSeen2.push(n); } };
      ctx.player = pc;
      pc.st.jawSnapT = 0; pc.st.eatPopT = 0;
      var meal = { active: true, kind: 'prey', defId: 'minnow', tier: 0, x: pc.x, y: pc.y,
        hp: 1, coins: 2, st: {}, r: 8, def: { id: 'minnow', tier: 0, score: 5, coins: 2 } };
      // r15 lane JAW: hit-stop, the shockwave/chroma flash and the score popup
      // are dispatched on the CLOSE FRAME of the bite cycle, not at contact -
      // that is the whole point of the change, so the harness has to run the
      // cycle forward to see them. `runBiteToClose` steps stepAnim until the
      // cycle passes its close frame (or gives up), and returns whether it
      // actually got there.
      function runBiteToClose(player, limit) {
        var guard = limit || 40;
        while (guard-- > 0) {
          stepAnim(player);
          if (player.st.biteCycle && player.st.biteCycle.closeFrame) return true;
        }
        return false;
      }
      swallow(meal);
      check(fxSeen.indexOf('deathBurst') >= 0 && fxSeen.indexOf('motes') >= 0,
        'eat emitted the two-stage burst at contact');
      check(pc.st.jawSnapT > 0, 'eat set the jaw snap');
      check(pc.st.eatPopT > 0, 'eat set the scale pop');
      check(pc.st.biteCycle.phase === 'open', 'eat triggered the bite cycle');
      check(stops.length === 0, 'hit-stop does NOT fire at contact any more');
      check(runBiteToClose(pc), 'the bite cycle reaches its close frame');
      check(stops.length >= 1 && (stops[0] === 15 || stops[0] === 45),
        'eat hit-stop is 15 or 45 ms, fired on the CLOSE frame (' + stops.join(',') + ')');
      check(burstOpts.length >= 1 && burstOpts[0].tint === 0xffe9a8,
        'swallow() falls back to 0xffe9a8 when def.tint is absent');
      burstOpts.length = 0;
      var tintedMeal = { active: true, kind: 'prey', defId: 'minnow', tier: 0, x: pc.x, y: pc.y,
        hp: 1, coins: 2, st: {}, r: 8, def: { id: 'minnow', tier: 0, score: 5, coins: 2, tint: 0x27e0ff } };
      swallow(tintedMeal);
      runBiteToClose(pc);
      check(burstOpts.length >= 1 && burstOpts[0].tint === 0x27e0ff,
        'swallow() uses def.tint (S3 data.js field) when present');

      // ---- FIX-ROUND-3 item 6: staged bite FX fires on EVERY completed
      // bite, including a plain minnow well below the shark's own tier - not
      // gated to mealT >= p.tier any more - and passes {tier: mealT}.
      var shockwaveCalls = [];
      var savedFxShock = RF.Fx;
      RF.Fx = { emit: function (n) { fxSeen.push(n); return 1; },
        eatShockwave: function (x, y, opts) { shockwaveCalls.push(opts); } };
      var minnow2 = { active: true, kind: 'prey', defId: 'minnow', tier: 0, x: pc.x, y: pc.y,
        hp: 1, coins: 2, st: {}, r: 8, def: { id: 'minnow', tier: 0, score: 5, coins: 2 } };
      swallow(minnow2);
      check(shockwaveCalls.length === 0, 'the shockwave waits for the close frame');
      runBiteToClose(pc);
      check(shockwaveCalls.length === 1 && shockwaveCalls[0] && shockwaveCalls[0].tier === 0,
        'staged eatShockwave fires on an ordinary below-tier swallow too, with {tier: mealT}');
      RF.Fx = savedFxShock;

      // ---- FIX-ROUND-3 item 4: spawnBuffDrop respects a 10s global engine
      // cooldown - a burst of notable (tier >= p.tier) kills produces at most
      // one drop per window, and the window reopens once ctx.time.now has
      // advanced past it.
      var dropCalls = [];
      var savedWorldDrop = RF.World;
      // Return a truthy entity: the engine stamps the cooldown ONLY on a
      // successful spawn (review r3 - failed drops must not eat the window).
      RF.World = { spawnBuffDrop: function (x, y) { dropCalls.push([x, y]); return { kind: 'buffpickup' }; }, kill: function () {} };
      ctx.run._lastBuffDropAt = -Infinity;
      var notableA = { active: true, kind: 'prey', defId: 'notable', tier: pc.tier, x: 1, y: 1,
        hp: 1, coins: 1, st: {}, r: 8, def: { id: 'notable', tier: pc.tier, score: 5, coins: 1 } };
      swallow(notableA);
      check(dropCalls.length === 1, 'first notable kill spawns a buff drop');
      var notableB = { active: true, kind: 'prey', defId: 'notable', tier: pc.tier, x: 2, y: 2,
        hp: 1, coins: 1, st: {}, r: 8, def: { id: 'notable', tier: pc.tier, score: 5, coins: 1 } };
      swallow(notableB);
      check(dropCalls.length === 1,
        'a second notable kill inside the 10s window does not spawn another drop');
      ctx.time.now += BUFF_DROP_COOLDOWN + 0.001;
      var notableC = { active: true, kind: 'prey', defId: 'notable', tier: pc.tier, x: 3, y: 3,
        hp: 1, coins: 1, st: {}, r: 8, def: { id: 'notable', tier: pc.tier, score: 5, coins: 1 } };
      swallow(notableC);
      check(dropCalls.length === 2,
        'a notable kill after the 10s cooldown elapses spawns another drop');
      RF.World = savedWorldDrop;
      ctx.run._lastBuffDropAt = -Infinity;
      // REV10-EAT (one-bite): owner-reported bug fix - "fish don't disappear
      // when eaten." Previously a same-tier target only took multiBite
      // damage per touch and stuck around flinching for several frames; now
      // eatEligible() -> stepEat() swallows any eligible target in ONE bite
      // on first contact (Hungry Shark rule), so a same-tier school is
      // removed from World the same frame the mouth reaches it.
      stops.length = 0;
      fxSeen.length = 0; sfxSeen2.length = 0;
      var oneBite1 = { active: true, kind: 'prey', tier: pc.tier, x: pc.x, y: pc.y, hp: 999,
        st: {}, r: 8, coins: 1, def: { tier: pc.tier, score: 5, coins: 1 } };
      var oneBite2 = { active: true, kind: 'prey', tier: pc.tier, x: pc.x, y: pc.y, hp: 999,
        st: {}, r: 8, coins: 1, def: { tier: pc.tier, score: 5, coins: 1 } };
      var oneBite3 = { active: true, kind: 'prey', tier: pc.tier, x: pc.x, y: pc.y, hp: 999,
        st: {}, r: 8, coins: 1, def: { tier: pc.tier, score: 5, coins: 1 } };
      var killedSchool = [];
      var savedKillSchool = RF.World.kill;
      var savedQSchool = RF.World.query, savedEQSchool = RF.World.eatQuery;
      RF.World.kill = function (e) { e.active = false; killedSchool.push(e); };
      RF.World.eatQuery = undefined;
      RF.World.query = function () { return [oneBite1, oneBite2, oneBite3]; };
      pc.st.chewFxCd = 0;
      stepEat(pc);
      check(killedSchool.length === 3
        && oneBite1.active === false && oneBite2.active === false && oneBite3.active === false,
        'a same-tier school is fully swallowed (removed from World) on the FIRST touch, no chew phase');
      check(oneBite1.hp === 0 && oneBite2.hp === 0 && oneBite3.hp === 0,
        'swallow() zeroes hp on every one-bite kill (frenzy hook still sees a real kill)');
      RF.World.kill = savedKillSchool;
      RF.World.query = savedQSchool; RF.World.eatQuery = savedEQSchool;
      RF.World.entities = [prey];
      RF.Fx = savedFx; RF.Juice = savedJuice; RF.Sound = savedSound2;

      // Popups must be safe with no pool (no canvas headless).
      var threwPop = null;
      try { scorePopup(10, 20, '+5', true); stepPops(STEP); } catch (e) { threwPop = e; }
      check(!threwPop, 'score popups no-op safely without a canvas pool');

      // ---- SPEC3D 7.3: glyph atlas contract (headless-safe math checks).
      check(glyphIndex('5') === POP_GLYPHS.indexOf('5') && glyphIndex('+') === POP_GLYPHS.indexOf('+'),
        'glyphIndex resolves digits and + to their atlas column');
      check(glyphIndex('?') === POP_GLYPHS.length - 1,
        'glyphIndex falls back to the space cell for an unmapped char');
      check(buildPopAtlas() === null, 'buildPopAtlas is a safe no-op without document (headless)');
      // A fake document (real THREE.CanvasTexture, since the ESM namespace
      // export cannot be reassigned) proves the bake path sets
      // texture.needsUpdate exactly ONCE (at bake time) and never again - the
      // 7.3 gate ("no texture.needsUpdate after init") is asserted by
      // instrumenting the CONSTRUCTED instance's needsUpdate setter (an
      // own-property override on the instance, not the frozen module export)
      // and recording every write across a bake + several pops.
      var savedDoc = root.document;
      var needsUpdateWrites = 0;
      var fakeCtx2d = {
        setTransform: function () {}, clearRect: function () {}, strokeText: function () {}, fillText: function () {},
        font: '', textAlign: '', textBaseline: '', lineWidth: 0, strokeStyle: '', fillStyle: ''
      };
      var fakeCanvas = { width: 0, height: 0, getContext: function () { return fakeCtx2d; } };
      root.document = { createElement: function () { return fakeCanvas; } };
      popAtlas = null;
      var atlas = buildPopAtlas();
      check(!!atlas && atlas.baked === true, 'buildPopAtlas bakes once and returns a baked atlas record');
      // Instrument the real texture's needsUpdate AFTER the bake (three.js's
      // needsUpdate setter is write-only/version-bumping, not a readable
      // flag, so the bake-time write itself cannot be inspected after the
      // fact). From this point on, ZERO further writes are the 7.3 gate.
      var tex = atlas.texture;
      var rawNeedsUpdate = false;
      Object.defineProperty(tex, 'needsUpdate', {
        configurable: true,
        get: function () { return rawNeedsUpdate; },
        set: function (v) { rawNeedsUpdate = v; if (v) needsUpdateWrites++; }
      });
      // Blocker 6 (REVIEW-REV7): the prebuilt UV geometry variants are baked
      // by buildPopGeomVariants INSIDE buildPopAtlas, before this point - so
      // by now every geom's uv.needsUpdate has already fired once (at bake
      // time) and this instrumentation only needs to prove ZERO further
      // writes across pops. Instrument every variant's uv attribute
      // needsUpdate setter (same own-property-override technique as the
      // texture above), and also assert no geometry object is ever replaced
      // (identity-checked) or cloned on a live sprite.
      var geomUvWrites = 0;
      var geomVariants = atlas.geoms || [];
      for (var gv = 0; gv < geomVariants.length; gv++) {
        (function (uvAttr) {
          var rawUv = false;
          Object.defineProperty(uvAttr, 'needsUpdate', {
            configurable: true,
            get: function () { return rawUv; },
            set: function (v) { rawUv = v; if (v) geomUvWrites++; }
          });
        })(geomVariants[gv].attributes.uv);
      }
      // Pooled quads: build against a real scene, fire several pops, and
      // prove no further needsUpdate write ever happens (only geometry
      // reference swaps between the already-instrumented prebuilt variants),
      // while the pool itself functions (visible glyphs, cursor cycles).
      var atlasScene = new THREE.Scene();
      var savedScene3ForAtlas = scene3, savedPopPoolForAtlas = popPool;
      scene3 = atlasScene;
      popPool = null;
      buildPopPool(4);
      check(!!popPool && popPool.ok, 'buildPopPool builds pooled glyph quads against the baked atlas');
      var geomsBefore = popPool.items[0].glyphs.map(function (g) { return g.sprite.geometry; });
      scorePopup(0, 0, '+120', false);
      var rec0 = popPool.items[0];
      check(rec0.len === 4 && rec0.glyphs[0].sprite.visible === true && rec0.glyphs[4].sprite.visible === false,
        'scorePopup writes exactly len glyph sprites visible, rest hidden');
      check(geomVariants.indexOf(rec0.glyphs[0].sprite.geometry) >= 0,
        'Blocker 6: paintGlyph swaps to a prebuilt atlas geometry variant, not a clone');
      scorePopup(0, 0, '+7', true);
      scorePopup(0, 0, '+42', false);
      stepPops(STEP);
      check(needsUpdateWrites === 0,
        'ZERO texture.needsUpdate writes after init, across 3 pops (' + needsUpdateWrites + ')');
      check(geomUvWrites === 0,
        'Blocker 6: ZERO geometry uv.needsUpdate writes after atlas init, across 3 pops (' + geomUvWrites + ')');
      var geomsAfterIdentitySet = {};
      for (var pi = 0; pi < popPool.items.length; pi++) {
        for (var gi = 0; gi < popPool.items[pi].glyphs.length; gi++) {
          var g2 = popPool.items[pi].glyphs[gi].sprite.geometry;
          check(geomVariants.indexOf(g2) >= 0,
            pi === 0 && gi === 0 ? 'Blocker 6: every pooled sprite geometry is one of the prebuilt atlas variants' : true);
        }
      }
      scene3 = savedScene3ForAtlas; popPool = savedPopPoolForAtlas;
      root.document = savedDoc;
      popAtlas = null;

      // ---- UI absence: hudState and friends are console-quiet no-ops.
      var savedUI = RF.UI;
      RF.UI = undefined;
      ctx.player = p; p.active = true; p.hp = p.maxHp;
      var threwHud = null;
      try { pushHud(STEP); } catch (e) { threwHud = e; }
      check(!threwHud, 'pushHud is a no-op without RF.UI');
      var hudCalls = [];
      RF.UI = { hudState: function (o) { hudCalls.push(o); } };
      pushHud(STEP);
      check(hudCalls.length === 1, 'hudState pushed once per frame');
      var hs = hudCalls[0];
      check(hs && typeof hs.hpFrac === 'number' && typeof hs.boost === 'number'
        && typeof hs.coins === 'number' && typeof hs.combo === 'number'
        && hs.chips === comboQueue,
        'hud state carries hp/boost/power/coins/combo/chips');
      RF.UI = { hudState: function () { throw new Error('lane C3 blew up'); } };
      var threwHud2 = null;
      try { pushHud(STEP); } catch (e) { threwHud2 = e; }
      check(!threwHud2, 'a throwing RF.UI.hudState is absorbed');
      RF.UI = savedUI;

      // ---- degraded sweep: every sibling namespace gone, step() must not throw.
      ctx.player = p;
      var keep = { World: RF.World, Fx: RF.Fx, Juice: RF.Juice, Sound: RF.Sound,
        Music: RF.Music, Abilities: RF.Abilities, Meta: RF.Meta, Art3D: RF.Art3D, UI: RF.UI };
      RF.World = RF.Fx = RF.Juice = RF.Sound = RF.Music = RF.Abilities = RF.Meta = RF.Art3D = RF.UI = undefined;
      var threw = null;
      try { for (var z = 0; z < 30; z++) step(); } catch (e) { threw = e; }
      for (var kk in keep) RF[kk] = keep[kk];
      check(!threw, 'degraded step (no sibling modules) did not throw' + (threw ? ': ' + threw.message : ''));

      // ---- renderPlayer against a bare THREE.Group: no renderer needed.
      var grp = new THREE.Group();
      p.sprite = grp; p.angle = Math.PI; p.anim.bank = 0.1; p.st.eatPopT = 0.16;
      var threwR = null;
      try { renderPlayer(p); } catch (e) { threwR = e; }
      check(!threwR, 'renderPlayer drove a real THREE.Group without a renderer');
      check(Math.abs(grp.position.x - p.x) < 1e-6 && Math.abs(grp.position.y + p.y) < 2,
        'world (x, -y) mapping applied to the rig group');
      check(grp.scale.x > 1, 'eat scale pop applied to the group');
      p.sprite = null;

      // ================================================================
      // LIFE-01: repeated start/end cycles must be resource-stable.
      //
      // This runs 5 full startRun/endRun cycles against stub siblings that
      // COUNT what they add to and remove from the scene, and asserts that
      // scene.children and the disposal ledger are identical after cycle 1 and
      // after cycle 5. A leak of any kind (rig, popup sprite, world child, fx
      // child, undisposed material or texture) shows up as a rising count.
      //
      // The scene here is a real THREE.Scene so children/add/remove behave
      // exactly as they do in the browser. The renderer stays null, so nothing
      // needs a GL context; renderer.info.memory is the BROWSER half of this
      // proof and is documented for the orchestrator in NOTES-laneA.md.
      var lifeScene = new THREE.Scene();
      scene3 = lifeScene;
      camera = null;
      renderer = null;
      popPool = null;

      var ledger = { disposedGeo: 0, disposedMat: 0, disposedTex: 0 };
      // Stub world + fx that behave like real lanes: each adds children on
      // init and is REQUIRED to remove exactly those on teardown.
      function makeLaneStub(tag, nChildren) {
        var mine = [];
        return {
          init: function (sc) {
            for (var i = 0; i < nChildren; i++) {
              var o = new THREE.Object3D();
              o.name = tag + i;
              mine.push(o);
              sc.add(o);
            }
          },
          teardown: function () {
            for (var i = 0; i < mine.length; i++) {
              if (mine[i].parent) mine[i].parent.remove(mine[i]);
            }
            mine.length = 0;
            ledger.disposedGeo++;
          },
          update: function () { stubHits.length = 0; },
          render: function () {},
          query: function () { return EMPTY_Q; },
          kill: function (e) { e.active = false; },
          zoneAt: function (y) { return zoneAtFallback(y); },
          entities: [],
          playerHits: stubHits,
          setLights: function (l) { ledger.lights = l; },
          emit: function () { return 0; },
          __mine: mine
        };
      }
      var EMPTY_Q = [];
      var worldStub = makeLaneStub('world', 4);
      var fxStub = makeLaneStub('fx', 3);
      RF.World = worldStub;
      RF.Fx = fxStub;
      RF.UI = { init: function () {}, hudState: function () {}, tutorial: function () {},
                showResults: function () {}, showMenu: function () {},
                runStarted: function () {}, runEnded: function () {}, notice: function () {} };
      RF.Art3D = undefined;             // force the engine-owned fallback rig

      // FIX-ROUND-3 item 3: spy on the real RF.Abilities.seedMeterFull (still
      // installed from abilities.js at this point) to prove startRun() calls
      // it exactly once per cycle, with the live ctx, alongside the real
      // LIFE-01 start/end cycles below rather than a bespoke standalone call.
      var savedRealAbilities = RF.Abilities;
      var seedMeterCalls = 0, seedMeterLastCtx = null;
      // When module selftests CHAIN in one page, an earlier module may have
      // left an RF.Abilities stub without seedMeterFull; the spy then cannot
      // install and this check would report a false failure. Track it.
      var seedMeterSpyInstalled = false;
      if (RF.Abilities && typeof RF.Abilities.seedMeterFull === 'function') {
        seedMeterSpyInstalled = true;
        var realSeedMeterFull = RF.Abilities.seedMeterFull;
        RF.Abilities = Object.create(RF.Abilities);
        RF.Abilities.seedMeterFull = function (c) {
          seedMeterCalls++; seedMeterLastCtx = c;
          return realSeedMeterFull(c);
        };
      }

      var childCounts = [];
      var afterCycle1 = -1;
      for (var cyc = 0; cyc < 5; cyc++) {
        startRun('reef');
        check(running === true, cyc === 0 ? 'cycle: startRun set running' : true);
        // A live run must actually have put things in the scene.
        if (cyc === 0) {
          check(lifeScene.children.length > 0, 'a live run populates the scene');
          check(!!ledger.lights && ledger.lights === LIGHTS,
            'ATMO-01: engine handed its light refs to the atmosphere owner');
        }
        // Fire popups so the pool is populated and must be torn down too.
        scorePopup(100, 100, '+5', false);
        stepPops(STEP);
        endRun();
        check(running === false, cyc === 0 ? 'cycle: endRun cleared running' : true);
        childCounts.push(lifeScene.children.length);
        if (cyc === 0) afterCycle1 = lifeScene.children.length;
      }

      var stableChildren = true;
      for (var cc = 1; cc < childCounts.length; cc++) {
        if (childCounts[cc] !== afterCycle1) stableChildren = false;
      }
      check(stableChildren,
        'LIFE-01: scene.children stable across 5 start/end cycles ['
        + childCounts.join(',') + ']');
      check(worldStub.__mine.length === 0 && fxStub.__mine.length === 0,
        'LIFE-01: world and fx teardown removed every child they added');
      check(ledger.disposedGeo === 10,
        'LIFE-01: World.teardown and Fx.teardown each called once per cycle ('
        + ledger.disposedGeo + '/10)');
      check(popPool === null, 'LIFE-01: popup pool released by teardown');
      check(!seedMeterSpyInstalled || (seedMeterCalls === 5 && seedMeterLastCtx === ctx),
        seedMeterSpyInstalled
          ? ('FIX-ROUND-3 item 3: startRun seeds the ability meter full exactly once per cycle, with the live ctx ('
            + seedMeterCalls + '/5)')
          : 'FIX-ROUND-3 item 3: skipped - RF.Abilities stubbed by an earlier chained selftest (covered on fresh-page runs)');
      RF.Abilities = savedRealAbilities;

      // ---- Blocker 1/2/8 (REVIEW-REV7): mission wiring, frenzy completion
      // counters, and skin selection smoke, against a stub RF.Meta so this
      // covers the engine's producer/consumer wiring without depending on
      // meta.js's own selftest (that lane's business logic is S3's coverage;
      // this is only "does engine3d call the right things at the right
      // times, with the right shapes").
      (function () {
        var stubProfile = {
          missions: { active: [], progress: {}, completed: {} },
          skins: { owned: [], selectedSkin: null }
        };
        var rollCalls = 0, rolledWithRng = null;
        var eventCalls = [];
        var missionTickTexts = [];
        var savedMetaForMissions = RF.Meta;
        var completeOnEatCount = 0;
        RF.Meta = {
          rollMissions: function (profile, rng) {
            rollCalls++; rolledWithRng = rng;
            profile.missions.active = ['stub_mission'];
            return profile.missions.active;
          },
          missionEvent: function (c, type, payload) {
            eventCalls.push({ type: type, payload: payload });
            if (type === 'eat') {
              completeOnEatCount++;
              if (completeOnEatCount === 1) return ['stub_mission'];
            }
            return [];
          }
        };
        var savedUIForMissions = RF.UI;
        RF.UI = { init: function () {}, hudState: function () {}, tutorial: function () {},
                  showResults: function () {}, showMenu: function () {},
                  runStarted: function () {}, runEnded: function () {}, notice: function () {},
                  missionTick: function (text) { missionTickTexts.push(text); } };
        RF.World = { init: function () {}, update: function () { stubHits.length = 0; },
                     query: function () { return EMPTY_Q; }, kill: function (e) { e.active = false; },
                     zoneAt: function (y) { return zoneAtFallback(y); }, entities: [],
                     playerHits: stubHits };
        RF.Fx = { init: function () {}, emit: function () { return 0; } };
        var savedProfileForMissions = profile;
        profile = stubProfile;

        startRun('reef');
        check(rollCalls === 1, 'Blocker 1: startRun calls RF.Meta.rollMissions exactly once');
        check(rolledWithRng === ctx.rng, 'Blocker 1: rollMissions is passed the run-seeded ctx.rng');
        check(ctx.run.missionResults && ctx.run.missionResults.length === 0,
          'Blocker 1: run starts with an empty missionResults array');

        // Blocker 2: frenzyCompletions initialized to zeroed counters.
        check(ctx.run.frenzyCompletions
          && ctx.run.frenzyCompletions.goldrush === 0
          && ctx.run.frenzyCompletions.blood === 0
          && ctx.run.frenzyCompletions.school === 0,
          'Blocker 2: ctx.run.frenzyCompletions initialized to {goldrush:0,blood:0,school:0}');

        // Blocker 1: eat -> missionEvent('eat', {defId}) + missionEvent('score', ...),
        // and a completion forwards to RF.UI.missionTick.
        var eatEnt = { active: true, kind: 'prey', defId: 'minnow', tier: 0, x: 10, y: 10,
                        coins: 1, hp: 1, def: { tint: 0xffe9a8, score: 5, coins: 1 } };
        swallow(eatEnt);
        var sawEat = false, sawScore = false;
        for (var ei = 0; ei < eventCalls.length; ei++) {
          if (eventCalls[ei].type === 'eat' && eventCalls[ei].payload.defId === 'minnow') sawEat = true;
          if (eventCalls[ei].type === 'score' && eventCalls[ei].payload.score === ctx.run.score) sawScore = true;
        }
        check(sawEat, "Blocker 1: swallow() sends missionEvent('eat', {defId})");
        check(sawScore, "Blocker 1: swallow() sends missionEvent('score', {score}) on the same eat");
        check(missionTickTexts.length === 1, 'Blocker 1: a mission completion forwards exactly one call to RF.UI.missionTick');

        // Blocker 1: relic collection -> missionEvent('relic', {zoneId}).
        eventCalls.length = 0;
        var relicEnt = { active: true, kind: 'relic', zoneId: 2, relicId: 'r2-1', x: 5, y: 5, hp: 1, st: {} };
        collectRelic(relicEnt);
        var sawRelic = false;
        for (var ri = 0; ri < eventCalls.length; ri++) {
          if (eventCalls[ri].type === 'relic' && eventCalls[ri].payload.zoneId === 2) sawRelic = true;
        }
        check(sawRelic, "Blocker 1: collectRelic() sends missionEvent('relic', {zoneId})");

        // Blocker 1: cumulative zoneTime, reported at most once per second
        // (not once per fixed step) via stepZoneName inside the normal step().
        eventCalls.length = 0;
        for (var st = 0; st < 65; st++) step();   // ~65 fixed steps = ~1.08s
        var zoneTimeCalls = 0;
        for (var zi = 0; zi < eventCalls.length; zi++) if (eventCalls[zi].type === 'zoneTime') zoneTimeCalls++;
        check(zoneTimeCalls === 1,
          'Blocker 1: zoneTime mission event fires once per second, not once per fixed step (' + zoneTimeCalls + ' in ~1.08s)');

        // Blocker 2: frenzy completion edges increment their counter exactly
        // once. Drive Blood Frenzy's trigger path directly (FRENZY_EAT_BLOOD
        // is module-private, so route through the public frenzy-recording
        // hook the eat path itself uses: force r.blood.t to 0 and stage one
        // qualifying kill via the same processFrenzyEvents entry step()
        // already calls each frame - simplest is asserting the counter
        // shape/monotonic-once behavior directly against ctx.run state after
        // a real blood trigger, which recordFrenzyKill sets up from a normal
        // swallow of a same-or-bigger-tier meal while r.blood.t is 0).
        ctx.run.blood.t = 0;
        ctx.run.frenzyCompletions.blood = 0;
        var bloodEnt = { active: true, kind: 'prey', defId: 'megalodon', tier: p.tier, x: 1, y: 1,
                          coins: 1, hp: 1, def: { tint: 0xffe9a8, score: 5, coins: 1 } };
        swallow(bloodEnt);
        stepFrenzy();
        check(ctx.run.frenzyCompletions.blood === 1,
          'Blocker 2: a Blood Frenzy completion increments frenzyCompletions.blood exactly once');
        // Re-triggering while already inside the window (blood.t > 2, per the
        // FIX-ROUND-3 item 5 no-re-announce guard) must not double-increment.
        var bloodEnt2 = { active: true, kind: 'prey', defId: 'megalodon', tier: p.tier, x: 1, y: 1,
                           coins: 1, hp: 1, def: { tint: 0xffe9a8, score: 5, coins: 1 } };
        swallow(bloodEnt2);
        stepFrenzy();
        check(ctx.run.frenzyCompletions.blood === 1,
          'Blocker 2: re-triggering inside the same blood window does not double-increment');

        // Blocker 2: Gold Rush completion edge.
        ctx.run.frenzyCompletions.goldrush = 0;
        ctx.run._goldRushAnnounced = false;
        ctx.run.goldRushT = 0;
        ctx.run.frenzy = 1;
        stepFrenzy();
        check(ctx.run.frenzyCompletions.goldrush === 1,
          'Blocker 2: a Gold Rush completion increments frenzyCompletions.goldrush exactly once');

        endRun();
        profile = savedProfileForMissions;
        RF.Meta = savedMetaForMissions;
        RF.UI = savedUIForMissions;
      })();

      // ---- Blocker 8: profile.skins.selectedSkin is consumed into a
      // palette-swapped def clone at rig build time, without mutating the
      // shared shark def or touching shark3d.js's own module state.
      (function () {
        var savedProfileForSkin = profile;
        var buildShar_calls = [];
        var savedArt3DForSkin = RF.Art3D;
        RF.Art3D = {
          buildShark: function (def) {
            buildShar_calls.push(def);
            var g = new THREE.Group();
            return { group: g, parts: {}, animate: function () {} };
          }
        };
        var reefDef = (RFD.SHARK_BY_ID && RFD.SHARK_BY_ID['reef']) || (RFD.SHARKS || [])[0];
        var origPaletteBase = reefDef && reefDef.sil && reefDef.sil.palette && reefDef.sil.palette.base;

        // No selection: def passed through unchanged (same palette values).
        profile = { skins: { owned: [], selectedSkin: null },
                    missions: { active: [], progress: {}, completed: {} } };
        buildShar_calls.length = 0;
        var rigNone = buildPlayerRig(reefDef);
        check(buildShar_calls.length === 1 && buildShar_calls[0].sil.palette.base === origPaletteBase,
          'Blocker 8: no selectedSkin leaves the shark def/palette unchanged');

        // A global (sharkId:null) selected skin swaps the palette passed to
        // Art3D.buildShark, without mutating the shared RFD def.
        var globalSkin = (RFD.SKINS || []).filter(function (s) { return !s.sharkId; })[0];
        if (globalSkin) {
          profile.skins.selectedSkin = globalSkin.id;
          buildShar_calls.length = 0;
          var rigGlobal = buildPlayerRig(reefDef);
          check(buildShar_calls.length === 1 && buildShar_calls[0].sil.palette.base === globalSkin.palette.base,
            'Blocker 8: a selected global skin palette-swaps the def passed to Art3D.buildShark');
          check(reefDef.sil.palette.base === origPaletteBase,
            'Blocker 8: the shared RFD shark def is never mutated by skin selection');
        } else {
          check(true, 'Blocker 8: no global skin in RFD.SKINS to probe (data.js shape changed) - skipped');
        }

        // A shark-locked skin for a DIFFERENT shark than the one being built
        // must not apply.
        var lockedSkin = (RFD.SKINS || []).filter(function (s) { return s.sharkId && s.sharkId !== 'reef'; })[0];
        if (lockedSkin) {
          profile.skins.selectedSkin = lockedSkin.id;
          buildShar_calls.length = 0;
          buildPlayerRig(reefDef);
          check(buildShar_calls.length === 1 && buildShar_calls[0].sil.palette.base === origPaletteBase,
            "Blocker 8: a skin locked to a different shark does not apply to this shark's rig");
        } else {
          check(true, 'Blocker 8: no cross-shark-locked skin in RFD.SKINS to probe - skipped');
        }

        RF.Art3D = savedArt3DForSkin;
        profile = savedProfileForSkin;
      })();

      // Only the two engine-owned lights should remain resident between runs.
      // (Rev 2: the lights are created ONCE at boot and never per run.)
      check(afterCycle1 === 0,
        'LIFE-01: nothing run-scoped survives endRun (residual children='
        + afterCycle1 + ')');

      // Teardown is idempotent: a second endRun must be a clean no-op.
      var threwDouble = null;
      try { endRun(); endRun(); } catch (e) { threwDouble = e; }
      check(!threwDouble, 'LIFE-01: endRun is idempotent (double call is a no-op)');
      check(lifeScene.children.length === afterCycle1,
        'LIFE-01: a double endRun did not change the scene');

      // A THROWING sibling teardown must not strand the engine.
      RF.World = { init: function () {}, update: function () { stubHits.length = 0; },
                   query: function () { return EMPTY_Q; }, kill: function (e) { e.active = false; },
                   zoneAt: function (y) { return zoneAtFallback(y); }, entities: [],
                   playerHits: stubHits,
                   teardown: function () { throw new Error('lane B3 teardown blew up'); } };
      RF.Fx = { init: function () {}, emit: function () { return 0; },
                teardown: function () { throw new Error('lane F3 teardown blew up'); } };
      startRun('reef');
      var threwTd = null;
      try { endRun(); } catch (e) { threwTd = e; }
      check(!threwTd, 'LIFE-01: a throwing sibling teardown is absorbed');
      check(running === false, 'LIFE-01: the engine still left the run after a throwing teardown');

      // Siblings with NO teardown export at all (older lane build) must also
      // not break the engine-owned half of the choreography.
      RF.World = { init: function () {}, update: function () { stubHits.length = 0; },
                   query: function () { return EMPTY_Q; }, kill: function (e) { e.active = false; },
                   zoneAt: function (y) { return zoneAtFallback(y); }, entities: [],
                   playerHits: stubHits };
      RF.Fx = { init: function () {}, emit: function () { return 0; } };
      startRun('reef');
      var threwNoTd = null;
      try { endRun(); } catch (e) { threwNoTd = e; }
      check(!threwNoTd, 'LIFE-01: siblings without teardown() degrade quietly');
      check(popPool === null && lifeScene.children.length === 0,
        'LIFE-01: engine-owned rig and popups still released without sibling teardowns');

      // ---- ORCH-01: the boot dependency check reports, never throws.
      var savedNs = { World: RF.World, Fx: RF.Fx, Art3D: RF.Art3D, UI: RF.UI,
                      Juice: RF.Juice, Sound: RF.Sound, Music: RF.Music,
                      Abilities: RF.Abilities, Meta: RF.Meta, DevMode: RF.DevMode };
      RF.World = RF.Fx = RF.Art3D = RF.UI = undefined;
      RF.Juice = RF.Sound = RF.Music = RF.Abilities = RF.Meta = RF.DevMode = undefined;
      var depRep = null, threwDep = null;
      try { depRep = assertDeps(); } catch (e) { threwDep = e; }
      check(!threwDep, 'ORCH-01: assertDeps reports without throwing');
      check(depRep && depRep.ok === false && depRep.required.length === 4,
        'ORCH-01: all four required namespaces reported missing ('
        + (depRep ? depRep.required.join(' ') : '?') + ')');
      check(depRep && depRep.optional.length === 6,
        'ORCH-01: optional namespaces reported separately');
      // Restore, then prove the positive case against an explicitly COMPLETE
      // graph (the ambient harness state deliberately leaves some lanes out).
      for (var ns in savedNs) RF[ns] = savedNs[ns];
      var stubNs = {};
      for (var ri = 0; ri < REQUIRED_NS.length; ri++) {
        stubNs[REQUIRED_NS[ri]] = RF[REQUIRED_NS[ri]];
        if (!RF[REQUIRED_NS[ri]]) RF[REQUIRED_NS[ri]] = {};
      }
      var depRep2 = assertDeps();
      check(depRep2.ok === true && depRep2.required.length === 0,
        'ORCH-01: a complete graph reports ok (missing='
        + depRep2.required.join(' ') + ')');
      for (var rj in stubNs) RF[rj] = stubNs[rj];

      // ---- GL-01: loss preventDefaults and pauses; restore returns to menu.
      var prevented = false, notices = [], menus = 0;
      kit.paused = false;
      RF.UI = { notice: function (m) { notices.push(m); }, showMenu: function () { menus++; },
                init: function () {}, hudState: function () {}, tutorial: function () {},
                showResults: function () {}, runStarted: function () {}, runEnded: function () {} };
      RF.World = worldStub; RF.Fx = fxStub;
      worldStub.__mine.length = 0; fxStub.__mine.length = 0;
      startRun('reef');
      onContextLost({ preventDefault: function () { prevented = true; } });
      check(prevented, 'GL-01: webglcontextlost called preventDefault (restore can fire)');
      check(kit.paused === true, 'GL-01: the run paused on context loss');
      check(notices.length >= 1, 'GL-01: a notice went out through RF.UI');
      check(glLost === true, 'GL-01: loss state recorded');
      onContextRestored();
      check(glLost === false, 'GL-01: restore cleared the loss state');
      check(kit.paused === false, 'GL-01: restore unpaused');
      check(running === false, 'GL-01: restore tore the run down');
      check(menus === 1, 'GL-01: restore returned to the menu');
      check(lifeScene.children.length === 0, 'GL-01: restore left no run-scoped scene children');
      // Loss with no RF.UI at all must still be quiet and still pause.
      RF.UI = undefined;
      kit.paused = false;
      var threwGl = null;
      try { onContextLost({ preventDefault: function () {} }); onContextRestored(); }
      catch (e) { threwGl = e; }
      check(!threwGl, 'GL-01: loss/restore are safe with no RF.UI');

      // ---- ATMO-01: the engine no longer writes atmosphere anywhere.
      var atmoScene = new THREE.Scene();
      atmoScene.fog = new THREE.FogExp2(0x123456, 0.0004);
      atmoScene.background = new THREE.Color(0x654321);
      scene3 = atmoScene;
      RF.World = worldStub; RF.Fx = fxStub;
      RF.UI = { init: function () {}, hudState: function () {}, tutorial: function () {},
                showResults: function () {}, showMenu: function () {},
                runStarted: function () {}, runEnded: function () {}, notice: function () {} };
      var fog0 = atmoScene.fog.color.getHex(), den0 = atmoScene.fog.density;
      var bg0 = atmoScene.background.getHex();
      var hemiSaved = hemi;
      hemi = new THREE.HemisphereLight(0x9fd4e8, 0x06121e, LIGHT_RIG.hemiIntensity);
      var hcol0 = hemi.color.getHex(), hint0 = hemi.intensity;
      startRun('reef');
      ctx.player.y = 3400;              // deep water: the old code lerped hard here
      for (var az = 0; az < 120; az++) step();
      check(atmoScene.fog.color.getHex() === fog0 && atmoScene.fog.density === den0,
        'ATMO-01: 120 steps did not touch scene.fog');
      check(atmoScene.background.getHex() === bg0,
        'ATMO-01: 120 steps did not touch scene.background');
      check(hemi.color.getHex() === hcol0 && hemi.intensity === hint0,
        'ATMO-01: 120 steps did not touch the hemisphere light');
      check(typeof zoneState.name === 'string' && zoneState.name.length > 0,
        'ATMO-01: the engine still reads the zone NAME for the HUD ("'
        + zoneState.name + '")');
      endRun();
      hemi = hemiSaved;

      // ---- PERF-01: no allocation escapes the fixed step.
      // stepZoneName writes into the pre-allocated zoneState scratch; the old
      // atmosphere path returned a fresh report object every single step.
      var zsRef = zoneState;
      startRun('reef');
      for (var pf = 0; pf < 60; pf++) step();
      check(zoneState === zsRef, 'PERF-01: zone state is module scratch, never reallocated');
      check(ctx.lights === LIGHTS, 'PERF-01/ATMO-01: ctx.lights is the shared scratch record');
      endRun();
    } catch (err) {
      pass = false;
      notes.push('EXCEPTION ' + (err && err.stack ? err.stack : String(err)));
    } finally {
      RF.ctx = saved.ctx; kit = saved.kit; profile = saved.profile;
      scene3 = saved.scene3; camera = saved.camera; renderer = saved.renderer;
      popPool = saved.popPool; running = saved.running; stickEls = saved.stickEls;
      RF.World = saved.World; RF.Fx = saved.Fx; RF.Sound = saved.Sound;
      RF.Art3D = saved.Art3D; RF.Abilities = saved.Abilities; RF.UI = saved.UI;
      dying = saved.dying; pendingResults = saved.pending;
      CAM_Z = saved.camZ;
      camState.x = saved.camX; camState.y = saved.camY; camState.fov = saved.camFov;
      camState.zoom = saved.camZoom; camState.pulse = saved.camPulse; camState.pulseT = saved.camPulseT;
    }
    return { pass: pass, notes: notes };
  }

  // Rev 12 / 12.1: RF.Game.selectLevel(id) - the engine-owned entry point for
  // level select UI. Delegates the persisted choice + unlock gate to
  // RF.Meta.selectLevel (meta.js owns profile.levels/selectedLevel and the
  // unlock check); this function's own job is only to keep a LIVE run's
  // ctx.level in sync if one is already running, and to degrade to a no-op
  // report when meta.js is not loaded (defensive per the Rev 12 lane split -
  // level select may land before/without the data/meta lane).
  function selectLevel(id) {
    var result = { ok: false, reason: 'no-meta' };
    if (RF.Meta && RF.Meta.selectLevel) {
      try { result = RF.Meta.selectLevel(profile, id); } catch (e) { warnOnce('Meta.selectLevel', e); result = { ok: false, reason: 'exception' }; }
    } else if (RFD.LEVEL_BY_ID && RFD.LEVEL_BY_ID[id]) {
      // No meta.js loaded (e.g. a standalone engine harness): still honor a
      // recognised level id so a live run can react to it.
      if (profile) profile.selectedLevel = id;
      result = { ok: true };
    } else {
      result = { ok: false, reason: 'unknown-level' };
    }
    if (result && result.ok && ctx) {
      ctx.level = id;
      if (ctx.run) ctx.run.level = id;
    }
    return result;
  }

  // ---------------------------------------------------------- exports
  RF.Game = {
    boot: boot,
    __selftest: __selftest,
    selectLevel: selectLevel,
    dpr: DPR,
    CSS_W: CSS_W, CSS_H: CSS_H,
    STEP: STEP,
    LEN_SCALE: LEN_SCALE,
    LIGHT_RIG: {
      hemiIntensity: LIGHT_RIG.hemiIntensity,
      sunIntensity: LIGHT_RIG.sunIntensity,
      sunPosition: [LIGHT_RIG.sunX, LIGHT_RIG.sunY, LIGHT_RIG.sunZ],
      // Rev 15 additions, exported so the pixel gate and any downstream lane
      // can read the rig instead of hard-coding a copy of it.
      sunColor: LIGHT_RIG.sunColor,
      fillColor: LIGHT_RIG.fillColor,
      fillIntensity: LIGHT_RIG.fillIntensity,
      rimColor: LIGHT_RIG.rimColor,
      rimIntensity: LIGHT_RIG.rimIntensity,
      envIntensity: LIGHT_RIG.envIntensity,
      exposure: LIGHT_RIG.exposure
    },
    __resourceGate: RESOURCE_GATE,
    startRun: startRun,
    endRun: endRun,
    firePower: firePower,
    lastResults: null,
    get ctx() { return ctx; },
    get kit() { return kit; },
    get profile() { return profile; },
    get renderer() { return renderer; },
    get scene() { return scene3; },
    get camera() { return camera; },
    get three() { return THREE; }
  };

  // window.__rf compatibility is RF.DevMode's (meta.js unchanged); it is
  // installed by DevMode.init() during boot, exactly as game.js did it.

  // Auto-boot in a browser. Under node (selftest harness) there is no document,
  // so the module just exports and waits.
  if (typeof document !== 'undefined' && root.GGKit) boot();

})(typeof window !== 'undefined' ? window : globalThis);
