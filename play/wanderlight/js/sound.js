/* sound.js — archived sound names routed through GGKit's persistent buses.
   Music is registered but not decoded until the first real interaction. */

const Sound = (() => {
  const kit = (typeof window !== 'undefined' && window.__wanderKit) || null;
  const URLS = {
    musicExplore: 'assets/music-explore.mp3',
    musicDungeon: 'assets/music-dungeon.mp3',
    sword: 'assets/sfx-sword.mp3',
    beam: 'assets/sfx-beam.mp3',
    hurt: 'assets/sfx-hurt.mp3',
    enemyHit: 'assets/sfx-enemy-hit.mp3',
    enemyDie: 'assets/sfx-enemy-die.mp3',
    rupee: 'assets/sfx-rupee.mp3',
    item: 'assets/sfx-item.mp3',
    bomb: 'assets/sfx-bomb.mp3',
    secret: 'assets/sfx-secret.mp3',
    stairs: 'assets/sfx-stairs.mp3',
    whistle: 'assets/sfx-whistle.mp3',
    select: 'assets/sfx-select.mp3',
    text: 'assets/sfx-text.mp3',
    die: 'assets/sfx-die.mp3',
    lowbeat: 'assets/sfx-lowbeat.mp3',
  };
  if (kit && kit.audio) kit.audio.register(URLS);
  let unlocked = false;
  let musicActive = false;
  let musicRequest = 0;
  let currentTrack = 'title';
  let desiredMusic = 'musicExplore';

  function trackAsset(name) {
    if (name === 'dungeon' || name === 'level9' || name === 'sable' || name === 'boss') return 'musicDungeon';
    return 'musicExplore';
  }
  function sfx(name, opts) {
    if (!unlocked || !kit || !kit.audio) return;
    kit.audio.sfx(name, opts);
  }
  function unlock() {
    if (unlocked) return true;
    unlocked = true;
    requestMusic(desiredMusic, 450);
    return true;
  }
  function requestMusic(asset, fadeMs) {
    const token = ++musicRequest;
    if (!kit || !kit.audio) return;
    kit.audio.preload([asset]).then(() => {
      if (token !== musicRequest || !unlocked || desiredMusic !== asset) return;
      kit.audio.music(asset, fadeMs);
      musicActive = true;
    });
  }
  function playTrack(name) {
    currentTrack = name;
    desiredMusic = trackAsset(name);
    if (unlocked) requestMusic(desiredMusic, 650);
    return true;
  }
  function pauseMusic() { musicActive = false; if (kit && kit.audio) kit.audio.stopMusic(250); }
  function resumeMusic() { if (unlocked) requestMusic(desiredMusic, 450); }
  function stopMusic() { musicRequest++; musicActive = false; if (kit && kit.audio) kit.audio.stopMusic(250); }
  function toggleMute() {
    const next = !(kit && kit.audio ? kit.audio.prefs.mute : false);
    if (kit && kit.audio) kit.audio.setMute(next);
    return next;
  }
  function isMuted() { return !!(kit && kit.audio && kit.audio.prefs.mute); }
  function ensure() { return true; }
  function blip() { sfx('text'); }
  function sweep() { sfx('beam'); }
  function step(surface) {
    const rate = surface === 'water' ? 1.16 : surface === 'stone' ? 0.92 : 1.04;
    sfx('lowbeat', { rate, volume: 0.22 });
  }
  function stinger(name) { if (name === 'cave' || name === 'danger') sfx('secret', { volume: 0.55 }); return true; }

  const SFX = {
    sword: () => sfx('sword'), beam: () => sfx('beam'), hurt: () => sfx('hurt'),
    lowbeat: () => sfx('lowbeat'), enemyHit: () => sfx('enemyHit'), enemyDie: () => sfx('enemyDie'),
    rupee: () => sfx('rupee'), heart: () => sfx('item'), item: () => sfx('item'),
    bomb: () => sfx('bomb'), secret: () => sfx('secret'), stairs: () => sfx('stairs'),
    whistle: () => sfx('whistle'), select: () => sfx('select'), text: () => sfx('text'), die: () => sfx('die'),
    step: surface => step(surface), danger: () => stinger('danger'),
  };
  const TRACKS = { title: {}, overworld: {}, dungeon: {}, level9: {}, sable: {}, boss: {}, ending: {} };
  return {
    TRACKS, SFX, blip, sweep, playTrack, stinger, startMusic: () => playTrack('overworld'),
    resumeMusic, pauseMusic, stopMusic, toggleMute, isMuted, currentTrack: () => currentTrack,
    isMusicPlaying: () => unlocked && musicActive && !isMuted(), ensure, unlock,
  };
})();
