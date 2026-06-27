/* sound.js — minimal WebAudio blips + a looping overworld melody.
   No assets; everything is synthesized. */
const Sound = (() => {
  let ctx = null, muted = false, musicOn = false, musicTimer = null, noteIdx = 0;
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
    o.start(); o.stop(ctx.currentTime + dur);
  }

  const SFX = {
    sword:   () => sweep(880, 440, 0.08, 'square', 0.35),
    beam:    () => sweep(1200, 500, 0.18, 'sawtooth', 0.3),
    hurt:    () => sweep(300, 80, 0.18, 'square', 0.5),
    enemyHit:() => blip(180, 0.06, 'square', 0.4),
    enemyDie:() => sweep(400, 120, 0.18, 'sawtooth', 0.4),
    rupee:   () => { blip(1318,0.05,'square',0.3); setTimeout(()=>blip(1760,0.07,'square',0.3),50); },
    heart:   () => { blip(1046,0.06); setTimeout(()=>blip(1318,0.08),60); },
    item:    () => { [659,784,988,1318].forEach((f,i)=>setTimeout(()=>blip(f,0.1),i*70)); },
    bomb:    () => sweep(120, 40, 0.3, 'sawtooth', 0.6),
    secret:  () => { [523,659,784,1046].forEach((f,i)=>setTimeout(()=>blip(f,0.12,'triangle'),i*90)); },
    stairs:  () => sweep(200, 900, 0.25, 'square', 0.3),
    select:  () => blip(880, 0.04, 'square', 0.3),
    text:    () => blip(660, 0.02, 'square', 0.15),
    die:     () => { [392,330,262,196].forEach((f,i)=>setTimeout(()=>blip(f,0.2,'triangle',0.5),i*180)); },
  };

  // Overworld theme (simplified), note freqs; 0 = rest
  const MELODY = [
    659,0,659,0,784,0,659,0, 587,0,523,0,587,659,0,0,
    523,0,587,0,659,0,587,0, 523,0,494,0,440,0,0,0,
    659,0,659,0,784,0,880,0, 784,0,659,0,587,0,523,0,
    587,659,784,0,659,587,523,0, 494,0,523,0,587,0,0,0,
  ];
  function startMusic() {
    if (muted) return;
    ensure(); if (!ctx || musicOn) return;
    musicOn = true; noteIdx = 0;
    const tick = () => {
      if (!musicOn) return;
      const f = MELODY[noteIdx % MELODY.length];
      if (f) blip(f, 0.16, 'triangle', 0.22);
      // bass every 4 steps
      if (noteIdx % 4 === 0) blip(f ? f/4 : 130, 0.18, 'square', 0.12);
      noteIdx++;
      musicTimer = setTimeout(tick, 150);
    };
    tick();
  }
  function stopMusic() { musicOn = false; if (musicTimer) clearTimeout(musicTimer); }

  function toggleMute() {
    muted = !muted;
    if (muted) stopMusic();
    return muted;
  }
  function isMuted(){ return muted; }

  return { SFX, blip, sweep, startMusic, stopMusic, toggleMute, isMuted, ensure };
})();
