/* Compact in-repo synthesized WAV motifs. GGKit owns decode, buses, mute,
 * suspend, resume, and playback. The separate stem names let the race
 * director switch a menu pulse and a driving pulse without another loader. */
const TONE = 'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YaAAAACAg4yYpK2wqpuDZEIjFRMeNVR5n8Hb6+7kzq+KZUInFhIbME5ymLvX6e7m07WRa0grGRIZK0hrkbXT5u7p17uYck4wGxIWJ0Jliq/O5O7r28GfeVQ1HhMVIz1eg6jJ4O3s38algFs6IRQTIDdYfaLD3evt4sush2E/JRUSHDJRdpu+2eru5dCyjmlKNCkpM0ZddYyeqq+up5yQhXx3dnd7';

export const AUDIO_ASSETS = Object.freeze({
  stemA: TONE,
  stemB: TONE,
  ui: TONE,
  boost: TONE,
  scrape: TONE,
  contact: TONE,
  pickup: TONE,
  dash: TONE,
  landing: TONE,
  lap: TONE,
  countdown: TONE,
  podium: TONE,
});

export function sfx(kit, name, options) {
  if (kit && kit.audio) kit.audio.sfx(name, options);
}
