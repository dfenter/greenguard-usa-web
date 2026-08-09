/* sprites.js — presentation boundary.
   Archived entities retain their draw methods for behavioral parity tooling,
   but Phaser never calls them. The live view owns all visible characters. */

const Sprites = (() => ({
  init() {},
  get() { return null; },
  blit() {},
}))();

const Font = (() => ({
  draw() {},
  width(str, scale = 1) { return String(str).length * 8 * scale; },
}))();
