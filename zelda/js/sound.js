/* sound.js — tiny WebAudio SFX and pattern music.
   No assets; every sound is synthesized and scheduled from one tick loop. */
const Sound = (() => {
  let ctx = null, muted = false, musicOn = false, musicTimer = null;
  let noteIdx = 0, currentTrackName = 'title', musicWasPlaying = null;
  let masterGain = null;

  function ensure() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.18;
      masterGain.connect(ctx.destination);
    } catch (e) { ctx = null; }
  }

  function blip(freq, dur, type='square', vol=0.5) {
    if (muted) return;
    ensure(); if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(masterGain);
    o.onended = () => { if (o.disconnect) o.disconnect(); if (g.disconnect) g.disconnect(); };
    o.start(); o.stop(ctx.currentTime + dur);
  }
  function sweep(f0, f1, dur, type='square', vol=0.4) {
    if (muted) return;
    ensure(); if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(f1, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(masterGain);
    o.onended = () => { if (o.disconnect) o.disconnect(); if (g.disconnect) g.disconnect(); };
    o.start(); o.stop(ctx.currentTime + dur);
  }

  const SFX = {
    sword:   () => sweep(880, 440, 0.08, 'square', 0.35),
    beam:    () => sweep(1200, 500, 0.18, 'sawtooth', 0.3),
    hurt:    () => sweep(300, 80, 0.18, 'square', 0.5),
    lowbeat: () => blip(220, 0.08, 'triangle', 0.16),
    enemyHit:() => blip(180, 0.06, 'square', 0.4),
    enemyDie:() => sweep(400, 120, 0.18, 'sawtooth', 0.4),
    rupee:   () => { blip(1318,0.05,'square',0.3); setTimeout(()=>blip(1760,0.07,'square',0.3),50); },
    heart:   () => { blip(1046,0.06); setTimeout(()=>blip(1318,0.08),60); },
    item:    () => { [659,784,988,1318].forEach((f,i)=>setTimeout(()=>blip(f,0.1),i*70)); },
    bomb:    () => sweep(120, 40, 0.3, 'sawtooth', 0.6),
    secret:  () => { [523,659,784,1046].forEach((f,i)=>setTimeout(()=>blip(f,0.12,'triangle'),i*90)); },
    stairs:  () => sweep(200, 900, 0.25, 'square', 0.3),
    whistle: () => { [784,988,1318,1568].forEach((f,i)=>setTimeout(()=>blip(f,0.1,'triangle'),i*70)); },
    select:  () => blip(880, 0.04, 'square', 0.3),
    text:    () => blip(660, 0.02, 'square', 0.15),
    die:     () => { [392,330,262,196].forEach((f,i)=>setTimeout(()=>blip(f,0.2,'triangle',0.5),i*180)); },
  };

  // Compact eighth-note patterns. Zero is a rest; bass is sampled every step.
  const TRACKS = {
    title: {
      bpm: 144,
      notes: [392,0,523,0,659,0,523,0, 392,0,330,0,392,0,0,0],
      bass:  [98,0,98,0,131,0,131,0, 98,0,82,0,98,0,0,0],
    },
    overworld: {
      bpm: 160,
      notes: [659,0,659,0,784,0,659,0, 587,0,523,0,587,659,0,0,
        523,0,587,0,659,0,587,0, 523,0,494,0,440,0,0,0,
        659,0,659,0,784,0,880,0, 784,0,659,0,587,0,523,0,
        587,659,784,0,659,587,523,0, 494,0,523,0,587,0,0,0],
      bass:  [165,0,165,0,196,0,165,0, 147,0,131,0,147,165,0,0,
        131,0,147,0,165,0,147,0, 131,0,123,0,110,0,0,0],
    },
    dungeon: {
      bpm: 132,
      notes: [262,0,262,330,0,262,220,0, 262,0,330,0,392,330,262,0],
      bass:  [131,131,110,110,131,131,98,98, 131,131,110,110,98,98,82,82],
    },
    level9: {
      bpm: 118,
      notes: [110,0,131,0,146,131,0,110, 98,0,110,0,131,0,98,0],
      bass:  [55,0,55,0,49,0,49,0, 44,0,44,0,49,0,41,0],
    },
    ganon: {
      bpm: 210,
      notes: [220,220,0,277,220,0,185,220, 0,277,330,0,277,220,185,0],
      bass:  [55,55,55,55,46,46,46,46, 55,55,55,55,41,41,41,41],
    },
    boss: {
      bpm: 176,
      notes: [196,0,233,0,262,233,196,0, 175,0,196,0,233,196,175,0],
      bass:  [49,0,49,0,58,0,49,0, 44,0,44,0,49,0,44,0],
    },
    ending: {
      bpm: 150,
      notes: [523,659,784,0,659,784,1046,0, 784,880,1046,0,1175,1046,880,0],
      bass:  [131,0,165,0,196,0,196,0, 196,0,220,0,262,0,220,0],
    },
  };
  const STINGERS = {
    cave: { bpm: 220, notes: [392,523,659,784,0,523] },
  };

  function stopLoop() {
    musicOn = false;
    if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
  }
  function startLoop() {
    if (muted || musicOn) return;
    const track = TRACKS[currentTrackName] || TRACKS.overworld;
    ensure(); if (!ctx) return;
    musicOn = true; noteIdx = 0;
    const stepMs = 60000 / track.bpm / 2;
    const tick = () => {
      if (!musicOn) return;
      const f = track.notes[noteIdx % track.notes.length] || 0;
      const bass = track.bass[noteIdx % track.bass.length] || 0;
      if (f) blip(f, stepMs / 1000 * 0.82, 'triangle', 0.22);
      if (bass) blip(bass, stepMs / 1000 * 0.9, 'square', 0.12);
      noteIdx++;
      musicTimer = setTimeout(tick, stepMs);
    };
    tick();
  }
  function playTrack(name) {
    if (!TRACKS[name]) return false;
    const changed = currentTrackName !== name;
    currentTrackName = name;
    if (muted) { musicWasPlaying = name; return true; }
    if (changed) stopLoop();
    startLoop();
    return true;
  }
  function startMusic() { return playTrack('overworld'); }
  function resumeMusic() { startLoop(); }
  function pauseMusic() { if (musicOn) musicWasPlaying = currentTrackName; stopLoop(); }
  function stopMusic() { stopLoop(); musicWasPlaying = null; }

  function stinger(name) {
    const pattern = STINGERS[name];
    if (!pattern || muted) return false;
    ensure(); if (!ctx) return false;
    const stepMs = 60000 / pattern.bpm / 2;
    pattern.notes.forEach((f, i) => { if (f) setTimeout(() => blip(f, stepMs / 1000 * 0.8, 'triangle', 0.25), i * stepMs); });
    return true;
  }

  function toggleMute() {
    muted = !muted;
    if (muted) {
      musicWasPlaying = musicOn ? currentTrackName : null;
      stopLoop();
    } else if (musicWasPlaying) {
      const track = musicWasPlaying;
      musicWasPlaying = null;
      currentTrackName = track;
      startLoop();
    }
    return muted;
  }
  function isMuted(){ return muted; }

  return { TRACKS, SFX, blip, sweep, playTrack, stinger, startMusic, resumeMusic, pauseMusic,
    stopMusic, toggleMute, isMuted, currentTrack:()=>currentTrackName,
    isMusicPlaying:()=>musicOn, ensure };
})();
