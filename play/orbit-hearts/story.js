/* Orbit Hearts, fleet F14. Story graph, characters, locales and endings.
 * All names, characters, prose, and art direction are original GreenGuard USA work.
 * Line format: [who, text, expression, condition]
 *   who        'n' narration, 'you' the archivist, or a character id
 *   expression 'neutral' | 'warm' | 'wry' | 'hurt' | 'resolve' | 'surprise'
 *   condition  {f:'flag'} {nf:'flag'} {aff:n} {mem:'id'} gate the line
 */
(function (root) {
  'use strict';

  var CHARS = {
    rell: {
      name: 'Rell Ossandro', short: 'Rell', role: 'Ring Engineer',
      color: '#7fd4ff', accent: '#2b6f8f', deep: '#123246',
      skin: '#c98f6d', hair: '#2b3a4a', cloth: '#2f6d8c', trim: '#ffd67a',
      shape: 'hex'
    },
    ivane: {
      name: 'Ivane Quill', short: 'Ivane', role: 'Greenloop Botanist',
      color: '#9ff2a8', accent: '#2f7a45', deep: '#123526',
      skin: '#8d6a4f', hair: '#3d2a22', cloth: '#2f7a55', trim: '#ffe08a',
      shape: 'leaf'
    },
    cass: {
      name: 'Cass Amaru', short: 'Cass', role: 'Courier Pilot',
      color: '#ffb27f', accent: '#a05230', deep: '#3a1f18',
      skin: '#e0b08a', hair: '#6b2f2a', cloth: '#a8452f', trim: '#8fe4ff',
      shape: 'wing'
    },
    nel: {
      name: 'Nel Obarro', short: 'Nel', role: 'Harbourmaster',
      color: '#cbb2ff', accent: '#4a3a7a', deep: '#241a3c',
      skin: '#6f5a4a', hair: '#d8d2e8', cloth: '#4c3f78', trim: '#ffd67a',
      shape: 'hex'
    },
    aud: {
      name: 'Central Auditor Voss', short: 'Voss', role: 'Central Audit',
      color: '#b9c8d8', accent: '#3d4e60', deep: '#1a222c',
      skin: '#a98a72', hair: '#4a4a52', cloth: '#3f4d5e', trim: '#d8e4f0',
      shape: 'hex'
    },
    chief: {
      name: 'Ration Chief Bray', short: 'Bray', role: 'Ration Board',
      color: '#ffcf7f', accent: '#7a5220', deep: '#3a2a12',
      skin: '#7a5c46', hair: '#2c2118', cloth: '#7a5a28', trim: '#ffe6b0',
      shape: 'leaf'
    }
  };

  /* Authored station locales. Each is composed in code from gradients, shapes and
   * light bands, with three parallax layers and a per time of day light shift. */
  var LOCALES = {
    core: {
      name: 'Archive Core', kind: 'core',
      sky: ['#101a2c', '#1b2942', '#243a56'],
      glow: '#7fd4ff', struct: '#16243a', struct2: '#1f3350',
      accent: '#ffd67a', floor: '#0c1524'
    },
    ring: {
      name: 'Spin Ring C', kind: 'ring',
      sky: ['#0d1526', '#182742', '#2a3f5e'],
      glow: '#8fd0ff', struct: '#132038', struct2: '#1d3050',
      accent: '#ffb35c', floor: '#0a1220'
    },
    green: {
      name: 'The Greenloop', kind: 'green',
      sky: ['#0c2018', '#123a28', '#1d5a3a'],
      glow: '#9ff2a8', struct: '#0f2c20', struct2: '#17452f',
      accent: '#ffe08a', floor: '#08160f'
    },
    obs: {
      name: 'Observation Deck', kind: 'obs',
      sky: ['#080d1e', '#101a3a', '#1d2a58'],
      glow: '#cbb2ff', struct: '#0d1430', struct2: '#141d44',
      accent: '#ff9ec4', floor: '#070b18'
    },
    dock: {
      name: 'Docking Ring, Bay Four', kind: 'dock',
      sky: ['#180f18', '#2a1620', '#3d2028'],
      glow: '#ffb27f', struct: '#1c1220', struct2: '#2a1a2c',
      accent: '#8fe4ff', floor: '#120a14'
    },
    orbit: {
      name: 'The Orbit', kind: 'orbit',
      sky: ['#04060f', '#0a1030', '#141c52'],
      glow: '#ffd6ec', struct: '#070c22', struct2: '#0d1436',
      accent: '#8fe4ff', floor: '#03050c'
    }
  };

  /* Affinity ratios preserved from the prototype tier table TIERS [14, 11] of 18:
   * 0.7778 for the top tier, 0.6111 for the middle tier. AFF_MAX is the ceiling a
   * perfect run can reach across nine choices and six interactive scenes. */
  var AFF_MAX = 33;
  var AFF_HI = 26;
  var AFF_MID = 20;
  var MEM_TRUE = 5;

  var ROUTES = [
    {
      id: 'rell', chr: 'rell', name: 'Rell Ossandro', role: 'Ring Engineer',
      color: '#7fd4ff', accent: '#2b6f8f', shape: 'hex', loc: 'ring',
      blurb: 'Keeps forty years of borrowed metal from shearing. Speaks in torque.',
      start: 'r1', mems: 6, max: AFF_MAX, hi: AFF_HI, mid: AFF_MID
    },
    {
      id: 'ivane', chr: 'ivane', name: 'Ivane Quill', role: 'Greenloop Botanist',
      color: '#9ff2a8', accent: '#2f7a45', shape: 'leaf', loc: 'green',
      blurb: 'Grows forty percent of the station dinner and all of its optimism.',
      start: 'i1', mems: 6, max: AFF_MAX, hi: AFF_HI, mid: AFF_MID
    },
    {
      id: 'cass', chr: 'cass', name: 'Cass Amaru', role: 'Courier Pilot',
      color: '#ffb27f', accent: '#a05230', shape: 'wing', loc: 'dock',
      blurb: 'Docks hot, leaves early, has never once filed a clean flight log.',
      start: 'c1', mems: 6, max: AFF_MAX, hi: AFF_HI, mid: AFF_MID
    }
  ];

  var S = {};
  function scene(id, def) { def.id = id; S[id] = def; return def; }

  /* =====================================================================
   * SHARED PROLOGUE. Teaches tap to advance, instant complete, choices,
   * memory fragments, and one interactive scene, then opens route select.
   * ===================================================================== */

  scene('p1', {
    r: null, ch: 0, loc: 'core', tod: 'day', title: 'Arrival, Vireo Station',
    cg: true, cgName: 'First Watch',
    l: [
      ['n', 'Vireo Station is forty years past warranty and turning anyway.'],
      ['n', 'You arrive with one duffel, one stylus, and a job nobody has held for six years: station archivist.'],
      ['nel', 'Archivist. Good. You are the fourth one Central has promised us.', 'wry'],
      ['nel', 'The other three read the maintenance backlog and requested transfer inside a week.', 'neutral'],
      ['you', 'I read it on the shuttle. Twice.'],
      ['nel', 'And?', 'surprise'],
      ['you', 'It is the best thing anyone has written about this station. It is just filed badly.'],
      ['nel', 'Ha. Keep that. You will need it.', 'warm']
    ],
    q: {
      prompt: 'What kind of record are you here to keep?',
      opts: [
        { t: 'The complete one. Everything, including the parts that hurt.', a: 2, f: 'tone_full' },
        { t: 'The honest one. Short, true, no decoration.', a: 1, f: 'tone_plain' },
        { t: 'The kind one. Records outlive people.', a: 2, f: 'tone_kind' }
      ]
    },
    go: 'p2'
  });

  scene('p2', {
    r: null, ch: 0, loc: 'core', tod: 'day', title: 'The Index',
    l: [
      ['nel', 'That answer goes in your file, you understand.', 'wry', { f: 'tone_full' }],
      ['nel', 'Short and true. I can work with short and true.', 'neutral', { f: 'tone_plain' }],
      ['nel', 'Kind. Nobody has said kind in this office before.', 'warm', { f: 'tone_kind' }],
      ['nel', 'Your predecessor left the archive index encrypted and then left the station.'],
      ['nel', 'Nobody knows why. Nobody has been able to open it since.'],
      ['you', 'How long has it been locked?'],
      ['nel', 'Six years, two months. Welcome to Vireo. Open it.', 'wry'],
      ['n', 'A memory fragment glimmers in the corner of the console. Tap it to keep it.']
    ],
    mem: { id: 'mp1', name: 'Predecessor Note', at: 5, text: 'A note scratched under the console lip: IF YOU ARE READING THIS, THE INDEX IS NOT BROKEN. IT IS SHY.' },
    coach: 'Tap the glimmer to collect a memory fragment. They unlock true endings and the gallery.',
    go: 'p3'
  });

  scene('p3', {
    r: null, ch: 0, loc: 'core', tod: 'day', title: 'Six Years Shut',
    l: [
      ['n', 'The lock is a glyph cipher. Four rounds. Match the sequence the console shows you.'],
      ['nel', 'Take your time. It has waited six years, it can wait nine more minutes.', 'neutral']
    ],
    mg: { type: 'decrypt', name: 'ARCHIVE INDEX', diff: 1, rounds: 3 },
    coach: 'Tap the glyph that matches the highlighted key. Keyboard: number keys.',
    go: 'p4'
  });

  scene('p4', {
    r: null, ch: 0, loc: 'obs', tod: 'dusk', title: 'Observation Deck',
    cg: true, cgName: 'The Turning Window',
    l: [
      ['n', 'The index opens onto forty years of other people. Repairs, harvests, burns, arguments, one wedding, two funerals.'],
      ['n', 'You take it to the observation deck to read, because that is where the light is.'],
      ['nel', 'Three names come up more than any others in that index.', 'neutral'],
      ['nel', 'Ossandro on the ring. Quill in the Greenloop. Amaru at bay four.'],
      ['nel', 'They keep this place alive, and not one of them writes anything down.', 'wry'],
      ['you', 'So somebody should.'],
      ['nel', 'Somebody should. That is the whole job, archivist.', 'warm'],
      ['n', 'Below the window the station turns, slow and stubborn, exactly on schedule.']
    ],
    mem: { id: 'mp2', name: 'Deck Ledger', at: 3, text: 'Scratched into the deck rail: forty years of initials. Two of them are the same pair, twenty years apart.' },
    q: {
      prompt: 'Where do you start?',
      opts: [
        { t: 'With the person keeping the metal together.', a: 1, f: 'lean_rell' },
        { t: 'With the person keeping everyone fed.', a: 1, f: 'lean_ivane' },
        { t: 'With the person who keeps leaving.', a: 1, f: 'lean_cass' }
      ]
    },
    go: 'p5'
  });

  scene('p5', {
    r: null, ch: 0, loc: 'obs', tod: 'dusk', title: 'Three Names',
    l: [
      ['nel', 'Ossandro is on shift now. They are always on shift.', 'neutral', { f: 'lean_rell' }],
      ['nel', 'Quill is in the grow bay. Bring your own gloves.', 'neutral', { f: 'lean_ivane' }],
      ['nel', 'Amaru undocks in two hours. She always undocks in two hours.', 'wry', { f: 'lean_cass' }],
      ['nel', 'Pick one and go. The record does not write itself.'],
      ['you', 'And if I want all three?'],
      ['nel', 'Then you come back and start again. That is allowed here.', 'warm'],
      ['n', 'Nothing on Vireo is locked behind a currency. Every route, every ending, every fragment is open from the first minute.']
    ],
    select: true
  });

  /* =====================================================================
   * ROUTE ONE: RELL OSSANDRO, RING ENGINEER
   * ===================================================================== */

  scene('r1', {
    r: 'rell', ch: 1, loc: 'ring', tod: 'day', title: 'Hold The Lamp',
    cg: true, cgName: 'Conduit, Ring C',
    l: [
      ['n', 'Spin ring C smells like hot copper and somebody burnt tea.'],
      ['n', 'The floor hums under your boots at a frequency you will be able to identify in your sleep within a month.'],
      ['rell', 'Stop. Do not touch that conduit, it bites.', 'surprise'],
      ['you', 'I was going to log it, not hug it.'],
      ['rell', 'Log it after I clamp it. Hold the lamp. Steady.', 'neutral'],
      ['n', 'They do not look up. There is a clamp in their teeth and forty years of borrowed metal over their head.']
    ],
    q: {
      prompt: 'The lamp is in your hand.',
      opts: [
        { t: 'Hold it perfectly steady. Do not breathe.', a: 2, f: 'careful' },
        { t: 'Aim it at their face and grin.', a: 1, f: 'bold' },
        { t: 'Put it down. Start recording instead.', a: 0, f: 'formal' }
      ]
    },
    go: 'r2'
  });

  scene('r2', {
    r: 'rell', ch: 1, loc: 'ring', tod: 'day', title: 'Torque Sync',
    l: [
      ['rell', 'Huh. Steady hands. Archivists usually shake.', 'warm', { f: 'careful' }],
      ['rell', 'Charming. Blinding, but charming.', 'wry', { f: 'bold' }],
      ['rell', 'You are recording me. Of course you are.', 'neutral', { f: 'formal' }],
      ['rell', 'Clamp is in. Ring will not shear tonight.', 'neutral'],
      ['you', 'Does it usually try?'],
      ['rell', 'Vireo is forty years past warranty. Everything here tries.', 'wry'],
      ['n', 'They press a torque driver into your hand. Three bolts. Match their rhythm.']
    ],
    mg: { type: 'sync', name: 'TORQUE SYNC', diff: 1 },
    coach: 'Tap when the marker crosses the beat line. Keyboard: space.',
    go: 'r3'
  });

  scene('r3', {
    r: 'rell', ch: 1, loc: 'core', tod: 'dusk', title: 'The Noises',
    l: [
      ['n', 'Two weeks later you know the ring by its noises. Rell knows it better.'],
      ['rell', 'That one is a bearing. That one is a bearing complaining. Different sound, different paperwork.', 'neutral'],
      ['you', 'And that one?'],
      ['rell', 'That one is the shear note. If you hear it twice in a shift you wake me up, whatever hour it is.', 'resolve'],
      ['rell', 'I mean it. I would rather lose the sleep than the ring.'],
      ['n', 'In the corridor behind them, an old welder mark catches the work light.']
    ],
    mem: { id: 'mr1', name: 'Welder Mark', at: 5, text: 'A pair of initials burned into a strut in 2091 and never sanded off. Rell has been polishing around them for years.' },
    q: {
      prompt: 'You could ask.',
      opts: [
        { t: 'Whose initials are those, and why are they still there?', a: 2, f: 'asked' },
        { t: 'Log the shear note frequency and say nothing.', a: 0 },
        { t: 'Offer to take the night watch so they can sleep.', a: 2, f: 'watch' }
      ]
    },
    go: 'r4'
  });

  scene('r4', {
    r: 'rell', ch: 1, loc: 'obs', tod: 'night', title: 'Strut Gallery',
    l: [
      ['rell', 'Vann Ossandro. My aunt. She welded that strut and then she went home dirtside and never came back up.', 'hurt', { f: 'asked' }],
      ['rell', 'I keep it because somebody should be able to point at a thing and say a name.', 'neutral', { f: 'asked' }],
      ['rell', 'Nobody has offered me a night watch in nine years.', 'surprise', { f: 'watch' }],
      ['rell', 'I am not going to sleep, but ask me again next month.', 'warm', { f: 'watch' }],
      ['rell', 'Come see something. It is three decks up and it is technically off limits.', 'wry'],
      ['n', 'The strut gallery: bare girders and a window the size of a confession.'],
      ['rell', 'End of chapter one, archivist. You did not request a transfer. That is already a record.', 'warm']
    ],
    go: 'r5'
  });

  scene('r5', {
    r: 'rell', ch: 2, loc: 'core', tod: 'day', title: 'Off Manifest',
    cg: true, cgName: 'Coolant Loop D',
    l: [
      ['rell', 'Archivist. I need a favour that is technically a felony.', 'neutral'],
      ['you', 'Technically is doing a great deal of work in that sentence.'],
      ['rell', 'Coolant loop D is failing. Central will not approve the part for six months.'],
      ['rell', 'I fabricated one. It is off manifest. It is better than the approved part and it is completely illegal.'],
      ['rell', 'You log the truth for a living. So I am asking instead of sneaking.', 'resolve']
    ],
    q: {
      prompt: 'This choice rewrites the middle of the route.',
      opts: [
        { t: 'Log it as approved. I will carry it.', a: 1, f: 'cover' },
        { t: 'I will log it true, and argue it to Central myself.', a: 1, f: 'report' }
      ],
      timer: 12
    },
    go: 'r6'
  });

  scene('r6', {
    r: 'rell', ch: 2, loc: 'core', tod: 'day', title: 'Tied Records',
    l: [
      ['rell', 'You just tied your record to mine. That is not nothing.', 'surprise', { f: 'cover' }],
      ['you', 'It is not nothing. It is also not a mistake.', null, { f: 'cover' }],
      ['rell', 'You would put your name in front of Central. For a coolant loop.', 'surprise', { f: 'report' }],
      ['you', 'For the four hundred people breathing behind it.', null, { f: 'report' }],
      ['rell', 'Nobody has argued for me before. They sign or they do not.', 'hurt', { f: 'report' }],
      ['n', 'On the bench beside the fabricated part, a drawing.'],
      ['rell', 'Strut gallery. Before shift. I want to show you something.', 'warm']
    ],
    mem: { id: 'mr2', name: 'Part Sketch', at: 5, text: 'The fabricated coupling, drawn eleven times on one sheet before it was cut. The eleventh has a small heart in the margin, quickly scribbled out.' },
    go: 'r7'
  });

  scene('r7', {
    r: 'rell', ch: 2, loc: 'obs', tod: 'dusk', title: 'Forty Years Of Hands',
    l: [
      ['n', 'The strut gallery. Bare girders, and beyond them the slow wheel of the station.'],
      ['rell', 'Forty years of somebody else welds. I can read every hand that worked here.', 'neutral'],
      ['rell', 'That one was in a hurry. That one was scared. That one had done it a thousand times.'],
      ['rell', 'Someday somebody reads mine.', 'hurt']
    ],
    q: {
      prompt: 'They are waiting.',
      opts: [
        { t: 'Then make them worth reading. I will archive every one.', a: 2 },
        { t: 'I would rather read the person than the welds.', a: 2, f: 'person' },
        { t: 'That is a great deal of weight for a bolt.', a: 0 }
      ]
    },
    go: 'r8'
  });

  scene('r8', {
    r: 'rell', ch: 2, loc: 'obs', tod: 'dusk', title: 'Ring Pulse',
    l: [
      ['rell', 'Nobody has said that to me sober.', 'warm', { f: 'person' }],
      ['rell', 'Ring pulse comes through the floor. Feel it? Three beats, then the shear note.', 'neutral'],
      ['rell', 'Tap it back to me. If you can hear it, you can keep it alive.', 'resolve']
    ],
    mg: { type: 'sync', name: 'RING PULSE', diff: 2 },
    branch: { cover: 'r9a', report: 'r9b' }
  });

  /* Chapter three, variant A: you covered for the part. */

  scene('r9a', {
    r: 'rell', ch: 3, loc: 'core', tod: 'day', title: 'The Audit',
    l: [
      ['n', 'Central audit lands on a Tuesday, the way bad weather does.'],
      ['aud', 'Loop D shows an approved part. There is no approval on file.', 'neutral'],
      ['rell', 'That is on me. Archivist logged what I told them.', 'resolve'],
      ['n', 'Rell does not look at you. That is, you realise, them protecting you.']
    ],
    q: {
      prompt: 'The auditor is writing.',
      opts: [
        { t: 'It is on both of us. Here is the pressure data. It held.', a: 2, f: 'stood' },
        { t: 'The part works. Cite me and take it out of my pay.', a: 1, f: 'stood' },
        { t: 'I logged what I was given.', a: 0 }
      ],
      timer: 10
    },
    go: 'r10a'
  });

  scene('r10a', {
    r: 'rell', ch: 3, loc: 'core', tod: 'day', title: 'Twelve Weeks Probation',
    l: [
      ['aud', 'Twelve weeks probation, both records. The part stays in the loop.', 'neutral', { f: 'stood' }],
      ['aud', 'The part stays. The engineer carries it. Signed.', 'neutral', { nf: 'stood' }],
      ['rell', 'You should not have done that.', 'hurt', { f: 'stood' }],
      ['you', 'I did the thing I do. I wrote down what happened.', null, { f: 'stood' }],
      ['rell', 'Twelve weeks. Fine. I have had worse Tuesdays.', 'wry'],
      ['n', 'Later you find the audit slip in the recycling, smoothed flat and kept.']
    ],
    mem: { id: 'mr3', name: 'Kept Slip', at: 5, text: 'A probation notice with two names on it, folded into eighths and carried in a tool roll for a month.' },
    go: 'r11a'
  });

  scene('r11a', {
    r: 'rell', ch: 3, loc: 'ring', tod: 'night', title: 'Hull Walk',
    l: [
      ['rell', 'Probation means no assistants. So you are not an assistant, you are an observer.', 'wry'],
      ['you', 'That is the same sentence with better paperwork.'],
      ['rell', 'Now you are getting it. Suit up. Ring seam, exterior, four hours.', 'warm'],
      ['n', 'Outside, the station turns and you turn with it. Drift the seam. Do not overcorrect.']
    ],
    mg: { type: 'drift', name: 'HULL WALK', diff: 2 },
    coach: 'Tap the left or right half to thrust. Keyboard: arrow keys.',
    go: 'r12a'
  });

  scene('r12a', {
    r: 'rell', ch: 3, loc: 'obs', tod: 'night', title: 'After The Seam',
    l: [
      ['rell', 'You did not panic out there. Most people panic out there.', 'warm'],
      ['you', 'I was busy. Panicking is for people with free hands.'],
      ['rell', 'Twelve weeks of probation and I am in a better mood than I have been in a year.', 'warm'],
      ['rell', 'That is a data point. You can log that one.', 'wry']
    ],
    q: {
      prompt: 'You could log it.',
      opts: [
        { t: 'FIELD NOTE: subject smiled. Twice. Under observation.', a: 2 },
        { t: 'I would rather keep that one off the record.', a: 2, f: 'private' },
        { t: 'It is probably the oxygen mix.', a: 0 }
      ]
    },
    go: 'r13'
  });

  /* Chapter three, variant B: you argued it to Central. */

  scene('r9b', {
    r: 'rell', ch: 3, loc: 'core', tod: 'night', title: 'Nine Days Of Paper',
    l: [
      ['n', 'You spend nine days writing an argument instead of a record.'],
      ['rell', 'You have been awake for all nine of them.', 'hurt'],
      ['you', 'Central answers paperwork. So I made paperwork it cannot ignore.'],
      ['rell', 'Nobody has ever spent nine days on me.', 'surprise'],
      ['n', 'The waiver returns approved, with a note: FABRICATION OVERSIGHT, OSSANDRO.'],
      ['rell', 'They gave me the ring.', 'surprise']
    ],
    q: {
      prompt: 'They are holding the slip like it might dissolve.',
      opts: [
        { t: 'They gave you what you already carried.', a: 2, f: 'stood' },
        { t: 'You gave it to yourself. I just held the lamp.', a: 2, f: 'stood' },
        { t: 'Now the paperwork is your problem.', a: 0 }
      ]
    },
    go: 'r10b'
  });

  scene('r10b', {
    r: 'rell', ch: 3, loc: 'core', tod: 'day', title: 'Oversight',
    l: [
      ['rell', 'Oversight means I sign things now. I have signed four things today.', 'wry'],
      ['rell', 'One of them was a requisition for tea that is not burnt. Progress.', 'warm'],
      ['you', 'Historic.'],
      ['rell', 'You made a station change its mind. Do you know how rare that is up here.', 'resolve'],
      ['n', 'On the desk, under the new authority stamp, an older piece of paper.']
    ],
    mem: { id: 'mr3', name: 'Refused Requisition', at: 4, text: 'A part request from six years ago, refused four times, kept anyway. In the margin, in Rell hand: ASK AGAIN.' },
    go: 'r11b'
  });

  scene('r11b', {
    r: 'rell', ch: 3, loc: 'ring', tod: 'day', title: 'Central Cipher',
    l: [
      ['rell', 'Oversight also means Central sends me their maintenance cipher. Encrypted. Naturally.', 'wry'],
      ['you', 'They gave you authority and then locked the manual.'],
      ['rell', 'Welcome to the ring. Open it, archivist. You are good at shy things.', 'warm']
    ],
    mg: { type: 'decrypt', name: 'CENTRAL CIPHER', diff: 2, rounds: 4 },
    go: 'r12b'
  });

  scene('r12b', {
    r: 'rell', ch: 3, loc: 'obs', tod: 'dusk', title: 'Signed For',
    l: [
      ['rell', 'Every part in this ring is signed for now. By me. On the record.', 'resolve'],
      ['rell', 'If it fails, it fails with a name on it. That is terrifying and I love it.', 'warm'],
      ['you', 'That is the whole job.'],
      ['rell', 'That is your job. I stole it.', 'wry']
    ],
    q: {
      prompt: 'They are watching you sideways.',
      opts: [
        { t: 'Steal more of it. I will keep making copies.', a: 2 },
        { t: 'I would rather share it than lose it.', a: 2, f: 'private' },
        { t: 'Return it when you are done.', a: 0 }
      ]
    },
    go: 'r13'
  });

  /* Chapter four: the shear. */

  scene('r13', {
    r: 'rell', ch: 4, loc: 'ring', tod: 'night', title: 'The Shear Note',
    cg: true, cgName: 'Ring C, 0300',
    l: [
      ['n', '0300 station time. You hear it through the deck plate before the alarm reaches the panel.'],
      ['n', 'The shear note. Twice.'],
      ['you', 'Rell. Wake up. It is the second one.'],
      ['rell', 'I am already in the corridor.', 'resolve'],
      ['rell', 'Seam nine has gone. If it walks, it takes the whole quarter arc with it.'],
      ['rell', 'I need somebody outside with me who does not panic and who writes everything down.'],
      ['you', 'You have somebody.'],
      ['rell', 'I know. That is what scares me.', 'hurt']
    ],
    go: 'r14'
  });

  scene('r14', {
    r: 'rell', ch: 4, loc: 'ring', tod: 'night', title: 'Seam Nine',
    l: [
      ['rell', 'Clip your line. Do not trust the ring, trust the line.', 'resolve'],
      ['n', 'The station turns beneath you at forty years past warranty and does not care that you are on it.'],
      ['n', 'Reach every anchor before the arc walks.']
    ],
    mg: { type: 'drift', name: 'SEAM NINE', diff: 3 },
    go: 'r15'
  });

  scene('r15', {
    r: 'rell', ch: 4, loc: 'core', tod: 'night', title: 'Holding',
    l: [
      ['n', 'Seam nine holds. The quarter arc stays where forty years of hands put it.'],
      ['rell', 'You logged it while we were out there. In a suit. In the dark.', 'surprise'],
      ['you', 'Timestamps matter most when nobody expects them.'],
      ['rell', 'I have been doing this alone since I was nineteen.', 'hurt'],
      ['rell', 'Tonight I was not doing it alone and I do not know what to do with that.'],
      ['n', 'Their gloves are still on the table where they dropped them. Inside the left one, folded small, a paper.']
    ],
    mem: { id: 'mr4', name: 'Glove Note', at: 5, text: 'A list of every name that has ever worked ring C, in Rell handwriting, updated tonight. Your name is at the bottom, added in a shaky line.' },
    q: {
      prompt: 'They are looking at the gloves and not at you.',
      opts: [
        { t: 'Then stop doing it alone. That is an option now.', a: 2, f: 'together' },
        { t: 'You do not have to know. I will still be here.', a: 2, f: 'together' },
        { t: 'It was one night. Get some sleep.', a: 0 }
      ]
    },
    go: 'r16'
  });

  scene('r16', {
    r: 'rell', ch: 4, loc: 'obs', tod: 'night', title: 'Two Mugs',
    l: [
      ['n', 'Two days later somebody leaves two mugs in the strut gallery. Neither of you admits to it.'],
      ['n', 'Neither of you moves them, either.'],
      ['rell', 'Chief wants the shear report by Friday. It is going to say your name eleven times.', 'warm'],
      ['you', 'Twelve. You forgot the suit log.'],
      ['rell', 'Twelve.', 'warm'],
      ['rell', 'I have been thinking about what a person is supposed to say after a night like that.', 'hurt'],
      ['rell', 'I have not landed on anything. I am an engineer. Give me a week.']
    ],
    mem: { id: 'mr5', name: 'Second Mug', at: 1, text: 'A chipped mug from the ring galley, washed and set out every shift since the seam. Nobody claims it. Nobody moves it.' },
    go: 'r17'
  });

  scene('r17', {
    r: 'rell', ch: 5, loc: 'obs', tod: 'dusk', title: 'The Part Where A Person Says It',
    l: [
      ['rell', 'Shift is over. Gallery?', 'neutral'],
      ['n', 'The window. The station turning beneath you like a slow wheel of light.'],
      ['rell', 'I am bad at this part. The part where a person says the thing.', 'hurt'],
      ['rell', 'I take things apart before I trust them. It is a terrible habit and it has kept this ring turning for nine years.'],
      ['rell', 'You held the lamp. Nobody holds the lamp. They hold the schedule.', 'warm', { aff: 20 }]
    ],
    q: {
      prompt: 'The window is full of turning light.',
      opts: [
        { t: 'Then let me. Stay in my log. Permanently.', a: 2, f: 'said' },
        { t: 'Say it in torque. I will learn to read it.', a: 2, f: 'said' },
        { t: 'Some things do not need saying.', a: 0 }
      ]
    },
    go: 'r18'
  });

  scene('r18', {
    r: 'rell', ch: 5, loc: 'ring', tod: 'dusk', title: 'The Long Spin',
    cg: true, cgName: 'Hand On The Girder',
    l: [
      ['rell', 'Hand. Here. Against the girder.', 'warm'],
      ['n', 'Under your palm the ring keeps its old, stubborn time.'],
      ['rell', 'Three beats and the shear note. Forty years. It has never once been early.', 'warm'],
      ['rell', 'Keep the count with me.']
    ],
    mg: { type: 'sync', name: 'THE LONG SPIN', diff: 3 },
    go: 'r19'
  });

  scene('r19', {
    r: 'rell', ch: 5, loc: 'orbit', tod: 'night', title: 'The Orbit',
    l: [
      ['n', 'The orbit gallery is the one place on Vireo where you can see the whole station at once.'],
      ['n', 'Ring C is the ugliest arc on it, patched eleven times, holding perfectly.'],
      ['rell', 'That is mine. That whole arc. Every weld on it since I was nineteen.', 'resolve'],
      ['rell', 'And now some of it is yours, because you wrote it down, and that is the only way anything survives up here.'],
      ['you', 'FIELD REPAIR, RING C. PERSONNEL: TWO. STATUS: HOLDING.'],
      ['rell', 'Forty years from now somebody reads that entry and knows exactly what happened here.', 'warm']
    ],
    mem: { id: 'mr6', name: 'Arc Photograph', at: 2, text: 'A print of ring C taken from the orbit gallery, with eleven patch sites circled and dated. On the back: FOR THE ARCHIVE. FROM THE ENGINEER.' },
    go: 'r20'
  });

  scene('r20', {
    r: 'rell', ch: 5, loc: 'orbit', tod: 'night', title: 'Status: Holding',
    l: [
      ['rell', 'Last question, archivist, and then I am going to go fix a bearing.', 'warm'],
      ['rell', 'What goes in the notes field?']
    ],
    q: {
      prompt: 'The notes field. Nobody checks the notes field.',
      opts: [
        { t: 'Two names. Same entry. No end date.', a: 2, f: 'final_all' },
        { t: 'STATUS: HOLDING. That covers it.', a: 1, f: 'final_hold' },
        { t: 'Leave it blank. Records are for facts.', a: 0, f: 'final_blank' }
      ]
    },
    end: 'rell'
  });

  /* =====================================================================
   * ROUTE TWO: IVANE QUILL, GREENLOOP BOTANIST
   * ===================================================================== */

  scene('i1', {
    r: 'ivane', ch: 1, loc: 'green', tod: 'day', title: 'Hope, Mostly',
    cg: true, cgName: 'Tray Six, Greenloop',
    l: [
      ['n', 'The Greenloop is the only place on Vireo that smells alive.'],
      ['n', 'Grow bars, forty ranks of them, and under every one a tray of somebody stubbornness.'],
      ['ivane', 'The archivist. Excellent. Hold this. Do not breathe on it.', 'surprise'],
      ['you', 'What is it?'],
      ['ivane', 'Hope, mostly. Also a bean.', 'warm']
    ],
    q: {
      prompt: 'It is very small and it is now your responsibility.',
      opts: [
        { t: 'Hold it like it is made of glass.', a: 2, f: 'gentle' },
        { t: 'Breathe on it. Obviously.', a: 1, f: 'playful' },
        { t: 'Request its taxonomic index first.', a: 0, f: 'precise' }
      ]
    },
    go: 'i2'
  });

  scene('i2', {
    r: 'ivane', ch: 1, loc: 'green', tod: 'day', title: 'Pollen Pass',
    l: [
      ['ivane', 'Oh, you are careful. I am never careful. This could be good for both of us.', 'warm', { f: 'gentle' }],
      ['ivane', 'I said do not. Ha. Fine. It survived you. Promising sign.', 'wry', { f: 'playful' }],
      ['ivane', 'Vireo Amber, third generation, forty percent of everyone dinner. Index enough?', 'neutral', { f: 'precise' }],
      ['ivane', 'It will not germinate. Three seasons running. The trays come up empty and I keep planting.', 'hurt'],
      ['you', 'Why keep planting?'],
      ['ivane', 'Because the day I stop is the day the ration board decides for me.', 'resolve'],
      ['n', 'They hand you a pollen brush. Light strokes, on the beat, or the blossoms bruise.']
    ],
    mg: { type: 'sync', name: 'POLLEN PASS', diff: 1 },
    coach: 'Tap when the marker crosses the beat line. Keyboard: space.',
    go: 'i3'
  });

  scene('i3', {
    r: 'ivane', ch: 1, loc: 'green', tod: 'dusk', title: 'Dirtside',
    l: [
      ['n', 'A month in the grow bay teaches you that patience is a physical skill.'],
      ['ivane', 'You are still here. Most people last two visits and then discover the gym.', 'wry'],
      ['you', 'The gym does not smell like this.'],
      ['ivane', 'Nothing smells like this. That is the entire point of me.', 'warm'],
      ['n', 'Pinned above the bench, faded almost to nothing, a paper seed packet.']
    ],
    mem: { id: 'mi1', name: 'Seed Packet', at: 4, text: 'A dirtside seed packet, thirty years old, empty. On the back in a child hand: PLANTED THESE. NOTHING CAME UP. TRY AGAIN NEXT YEAR.' },
    q: {
      prompt: 'You could ask.',
      opts: [
        { t: 'Whose handwriting is that on the packet?', a: 2, f: 'asked' },
        { t: 'Log the bay humidity and let it be.', a: 0 },
        { t: 'Offer to take a tray home and watch it overnight.', a: 2, f: 'watch' }
      ]
    },
    go: 'i4'
  });

  scene('i4', {
    r: 'ivane', ch: 1, loc: 'obs', tod: 'night', title: 'Bright Bars, Dark Deck',
    l: [
      ['ivane', 'Mine. I was seven. It rained too much and then it did not rain at all.', 'hurt', { f: 'asked' }],
      ['ivane', 'I have been arguing with that packet ever since.', 'neutral', { f: 'asked' }],
      ['ivane', 'You want to take a tray home. Nobody takes a tray home.', 'surprise', { f: 'watch' }],
      ['ivane', 'Take tray six. It is the stubborn one. You will get on.', 'warm', { f: 'watch' }],
      ['ivane', 'Come up to the deck. The grow bars hurt after fourteen hours.', 'neutral'],
      ['n', 'Vireo window. Ivane sits with their boots off and their feet on the rail like a hazard notice.'],
      ['ivane', 'End of your first month, archivist. You have not filed a single complaint about the mud.', 'warm']
    ],
    go: 'i5'
  });

  scene('i5', {
    r: 'ivane', ch: 2, loc: 'green', tod: 'day', title: 'Two Roads',
    cg: true, cgName: 'The Splice Bench',
    l: [
      ['ivane', 'Two roads. I can splice the Amber with a fast hardy stock. Results in weeks, and a blight risk I cannot model.', 'neutral'],
      ['ivane', 'Or I go back to the wild seed bank. Slow. Honest. Rationing until it takes.'],
      ['ivane', 'Both roads have a number of people at the end of them and I cannot make the numbers agree.', 'hurt'],
      ['ivane', 'You are the one who writes what happened here. So. Which happened?', 'resolve']
    ],
    q: {
      prompt: 'This choice rewrites the middle of the route.',
      opts: [
        { t: 'Splice it. Feed people now, argue later.', a: 1, f: 'splice' },
        { t: 'Wild stock. I will ration with you.', a: 1, f: 'wild' }
      ],
      timer: 12
    },
    go: 'i6'
  });

  scene('i6', {
    r: 'ivane', ch: 2, loc: 'green', tod: 'day', title: 'Named For It',
    l: [
      ['ivane', 'Fast it is. If it goes wrong it goes wrong in public, with my name on it.', 'resolve', { f: 'splice' }],
      ['you', 'And mine under it, in the record, holding the light.', null, { f: 'splice' }],
      ['ivane', 'Half rations for a season. You know that means you too, archivist.', 'neutral', { f: 'wild' }],
      ['you', 'I checked. I signed. I am already hungry, it is fine.', null, { f: 'wild' }],
      ['ivane', 'You did that before you told me.', 'surprise', { f: 'wild' }],
      ['n', 'Taped inside the bench lid, a growth curve drawn by hand, plotted years ahead of anything planted.']
    ],
    mem: { id: 'mi2', name: 'Hand Curve', at: 5, text: 'A germination curve plotted by hand for a crop that does not exist yet, dated four years from now. Somebody has been planning a future out loud, quietly.' },
    go: 'i7'
  });

  scene('i7', {
    r: 'ivane', ch: 2, loc: 'obs', tod: 'dusk', title: 'Arguing With A Station',
    l: [
      ['ivane', 'I grew up dirtside. Real dirt. It rained on things without a schedule.', 'neutral'],
      ['ivane', 'Up here everything green lives because somebody decided it could, at a specific hour, on a timer.'],
      ['ivane', 'I keep planting like I am arguing with a station that does not care.', 'hurt']
    ],
    q: {
      prompt: 'Below the window the station turns, on schedule, not caring.',
      opts: [
        { t: 'Then I will be the record that proves you won the argument.', a: 2 },
        { t: 'It cares. It just says it in yield numbers.', a: 2, f: 'person' },
        { t: 'Stations do not argue. They just spin.', a: 0 }
      ]
    },
    go: 'i8'
  });

  scene('i8', {
    r: 'ivane', ch: 2, loc: 'obs', tod: 'dusk', title: 'Grow Cycle',
    l: [
      ['ivane', 'Nobody has ever called my yield numbers affectionate before.', 'warm', { f: 'person' }],
      ['ivane', 'Grow bar cycle. Twelve seconds bright, three dark. Everything green here lives on that beat.', 'neutral'],
      ['ivane', 'Come on. Learn the rhythm and you will never miss a watering again.', 'warm']
    ],
    mg: { type: 'sync', name: 'GROW CYCLE', diff: 2 },
    branch: { splice: 'i9a', wild: 'i9b' }
  });

  /* Chapter three, variant A: the splice. */

  scene('i9a', {
    r: 'ivane', ch: 3, loc: 'green', tod: 'night', title: 'Tray Six, Day Twenty Two',
    l: [
      ['n', 'The spliced Amber comes up in nineteen days. The ring eats fresh for the first time in a year.'],
      ['n', 'On day twenty two, tray six shows rust coloured spotting.'],
      ['ivane', 'Blight. Small. Contained, maybe. If I burn the whole bay tonight it stays small.', 'hurt'],
      ['ivane', 'Everything I proved, gone in an hour, and I have to be the one holding the torch.']
    ],
    q: {
      prompt: 'The torch is already in their hand.',
      opts: [
        { t: 'Burn it. I will log why, so it counts as courage and not failure.', a: 2, f: 'stood' },
        { t: 'Burn tray six. I will sit the night watch on the rest with you.', a: 2, f: 'stood' },
        { t: 'Your call. I only write it down.', a: 0 }
      ],
      timer: 10
    },
    go: 'i10a'
  });

  scene('i10a', {
    r: 'ivane', ch: 3, loc: 'green', tod: 'night', title: 'The Burn',
    l: [
      ['n', 'Nineteen days of proof goes into the reclaimer in forty minutes.'],
      ['ivane', 'That is the fastest I have ever destroyed anything.', 'hurt'],
      ['you', 'ENTRY: CONTAINMENT SUCCESSFUL. CAUSE: OPERATOR CAUGHT IT ON DAY TWENTY TWO.'],
      ['ivane', 'You made it sound like I did something right.', 'surprise', { f: 'stood' }],
      ['ivane', 'You did do something right. Read it back tomorrow when you can stand up.', 'warm', { f: 'stood' }],
      ['n', 'In the reclaimer tray, one pod is set aside, unburnt, in a sealed jar.']
    ],
    mem: { id: 'mi3', name: 'Sealed Pod', at: 5, text: 'One spliced pod pulled out of the burn and sealed, labelled TRAY SIX, KEPT. Nobody was supposed to see it, including you.' },
    go: 'i11a'
  });

  scene('i11a', {
    r: 'ivane', ch: 3, loc: 'green', tod: 'day', title: 'Spore Map',
    l: [
      ['ivane', 'If the blight is in the bay air I need every spore site mapped before the next planting.', 'resolve'],
      ['ivane', 'Trace the drift pattern. Rank by rank. Do not skip one because it looks clean.'],
      ['you', 'Clean is where nobody looked.'],
      ['ivane', 'You have been listening.', 'warm']
    ],
    mg: { type: 'trace', name: 'SPORE MAP', diff: 2 },
    coach: 'Tap the nodes in order, lowest number first. Keyboard: number keys.',
    go: 'i12a'
  });

  scene('i12a', {
    r: 'ivane', ch: 3, loc: 'obs', tod: 'dusk', title: 'Clean Bay',
    l: [
      ['ivane', 'Bay is clean. Fourteen ranks, no spores, one very tired botanist.', 'warm'],
      ['you', 'And one pod in a jar you have not mentioned.'],
      ['ivane', 'You saw that.', 'surprise'],
      ['ivane', 'I could not put all of it in the fire. That is not science, that is just wanting.', 'hurt']
    ],
    q: {
      prompt: 'They are waiting to be told off.',
      opts: [
        { t: 'Wanting is allowed. I will log the jar as a sample.', a: 2, f: 'private' },
        { t: 'Keep it. Some records are for later.', a: 2, f: 'private' },
        { t: 'It should have gone in the fire.', a: 0 }
      ]
    },
    go: 'i13'
  });

  /* Chapter three, variant B: the wild stock. */

  scene('i9b', {
    r: 'ivane', ch: 3, loc: 'green', tod: 'day', title: 'Ninety One Days',
    l: [
      ['n', 'Half rations. Ninety one days. The ring gets thin and loud about it.'],
      ['chief', 'Quill, the board wants the bay converted to algae vats by Friday.', 'neutral'],
      ['ivane', 'The wild stock takes on day ninety four. I have the curve.', 'resolve'],
      ['ivane', 'I have three days of nothing to survive and a board that counts in weeks.', 'hurt']
    ],
    q: {
      prompt: 'The chief has a form out already.',
      opts: [
        { t: 'I will take the board. You take the seedlings.', a: 2, f: 'stood' },
        { t: 'Show them the curve. I will certify every number.', a: 2, f: 'stood' },
        { t: 'Algae is not the worst outcome.', a: 0 }
      ],
      timer: 10
    },
    go: 'i10b'
  });

  scene('i10b', {
    r: 'ivane', ch: 3, loc: 'core', tod: 'day', title: 'The Board',
    l: [
      ['chief', 'Archivist. You are certifying a projection. Archivists do not certify projections.', 'neutral'],
      ['you', 'This one is a measurement with three days left to run.', null, { f: 'stood' }],
      ['chief', 'And if it is wrong?', 'neutral'],
      ['you', 'Then it is wrong in the record, with my name on it, for forty years.', null, { f: 'stood' }],
      ['chief', 'Friday becomes Monday. Do not make me regret the weekend.', 'wry'],
      ['n', 'Ivane says nothing at all on the walk back, which is not like them.'],
      ['n', 'In the bay, taped inside the bench lid, a growth curve nobody was supposed to see.']
    ],
    mem: { id: 'mi3', name: 'Monday Slip', at: 5, text: 'The board deferral slip, three lines long, kept in a pocket and read enough times that the fold has gone soft.' },
    go: 'i11b'
  });

  scene('i11b', {
    r: 'ivane', ch: 3, loc: 'green', tod: 'night', title: 'Seed Index',
    l: [
      ['ivane', 'The wild bank index is from before the station had a computer worth the name.', 'neutral'],
      ['ivane', 'It is a cipher because a botanist in 2074 was paranoid and, honestly, correct.', 'wry'],
      ['ivane', 'Open it. I need to know which tray is which before Monday.', 'resolve']
    ],
    mg: { type: 'decrypt', name: 'SEED INDEX', diff: 2, rounds: 4 },
    go: 'i12b'
  });

  scene('i12b', {
    r: 'ivane', ch: 3, loc: 'obs', tod: 'night', title: 'Three Days Of Nothing',
    l: [
      ['ivane', 'Two days. Then one. I have never been this frightened of a Tuesday.', 'hurt'],
      ['you', 'The curve has not moved.'],
      ['ivane', 'Curves are not frightened. That is their whole advantage.', 'wry'],
      ['ivane', 'You stood in front of the ration board for a plant.', 'surprise']
    ],
    q: {
      prompt: 'They say it like an accusation and a thank you at once.',
      opts: [
        { t: 'For the person growing it. The plant was incidental.', a: 2, f: 'private' },
        { t: 'For the record. Which is the same thing, up here.', a: 2, f: 'private' },
        { t: 'Somebody had to fill in the form.', a: 0 }
      ]
    },
    go: 'i13'
  });

  /* Chapter four: day ninety four. */

  scene('i13', {
    r: 'ivane', ch: 4, loc: 'green', tod: 'day', title: 'Gold',
    cg: true, cgName: 'Day Ninety Four',
    l: [
      ['n', 'Day ninety four. The trays come up gold under the grow bars and the whole ring smells like a promise.'],
      ['ivane', 'It worked. It. Hold on. I need a second.', 'surprise'],
      ['ivane', 'I have had this face ready for three years and now it will not do anything.', 'hurt'],
      ['you', 'Take the second. I will note the time.'],
      ['ivane', 'Of course you will.', 'warm'],
      ['n', 'They cry into a tray of seedlings and laugh about it for a week.']
    ],
    go: 'i14'
  });

  scene('i14', {
    r: 'ivane', ch: 4, loc: 'core', tod: 'night', title: 'Vault Drift',
    l: [
      ['ivane', 'The seed vault is in the zero g core store. Nobody has been in since my predecessor.', 'neutral'],
      ['ivane', 'If the Amber is stable I want a backup of every line in there tonight.'],
      ['ivane', 'Push off gently. The vault does not forgive enthusiasm.', 'wry']
    ],
    mg: { type: 'drift', name: 'VAULT DRIFT', diff: 2 },
    coach: 'Tap the left or right half to thrust. Keyboard: arrow keys.',
    go: 'i15'
  });

  scene('i15', {
    r: 'ivane', ch: 4, loc: 'green', tod: 'dusk', title: 'Things I Will Not See Finish',
    l: [
      ['ivane', 'I plant things I will not see finish. It is a bad habit.', 'hurt'],
      ['you', 'So archive it with me. Then somebody sees it finish.'],
      ['ivane', 'That is either the most romantic thing anyone has said to me or a filing suggestion.', 'wry'],
      ['you', 'Up here those are the same sentence.'],
      ['ivane', 'They really are.', 'warm'],
      ['n', 'On the bench, a fourth generation label, already printed, waiting for a name.']
    ],
    mem: { id: 'mi4', name: 'Fourth Generation Label', at: 5, text: 'A blank crop label for the next Amber line. Under the strain field, in pencil, two initials and a question mark.' },
    q: {
      prompt: 'The label is waiting.',
      opts: [
        { t: 'Name it for whoever eats it in forty years.', a: 2, f: 'together' },
        { t: 'Name it for the argument you finally won.', a: 2, f: 'together' },
        { t: 'Leave the strain field blank. It is only a label.', a: 0 }
      ]
    },
    go: 'i16'
  });

  scene('i16', {
    r: 'ivane', ch: 4, loc: 'obs', tod: 'night', title: 'Breakfast, Then Most Of A Year',
    l: [
      ['n', 'You start eating dinner in the Greenloop. Then breakfast. Then most of a year.'],
      ['n', 'Nothing is declared. Everything is watered.'],
      ['ivane', 'The board approved four more ranks. Four. They used the word investment.', 'warm'],
      ['you', 'I logged that word twice. It deserved it.'],
      ['ivane', 'You have been here longer than any archivist since the station opened.', 'neutral'],
      ['ivane', 'I have started planning things in years again. I had stopped doing that.', 'hurt']
    ],
    mem: { id: 'mi5', name: 'Two Cups', at: 0, text: 'The bay galley has two cups now, both chipped, one with a hand drawn bean on it and the other with a hand drawn stylus.' },
    go: 'i17'
  });

  scene('i17', {
    r: 'ivane', ch: 5, loc: 'green', tod: 'dusk', title: 'Bad At Wanting',
    l: [
      ['ivane', 'I do not know how to want anything that is not a plant. I might be bad at it.', 'hurt'],
      ['ivane', 'Plants are simple. Light, water, patience, and they never ask you to say anything out loud.'],
      ['ivane', 'I wanted one thing to keep coming back. It seems greedy to want two.', 'hurt', { aff: 20 }]
    ],
    q: {
      prompt: 'The grow bars cycle. Twelve seconds bright.',
      opts: [
        { t: 'Want me the way you want spring. I will keep coming back.', a: 2, f: 'said' },
        { t: 'You are not bad at it. You are early in the season.', a: 2, f: 'said' },
        { t: 'Then stick to plants. Safer harvest.', a: 0 }
      ]
    },
    go: 'i18'
  });

  scene('i18', {
    r: 'ivane', ch: 5, loc: 'green', tod: 'dusk', title: 'First Bloom',
    cg: true, cgName: 'Hand Over Hand, On The Beat',
    l: [
      ['ivane', 'One more pass. The first flowers of a good crop get done by hand, always.', 'warm'],
      ['n', 'Their hand over yours on the brush. On the beat.'],
      ['ivane', 'Light strokes. You know this one.', 'warm']
    ],
    mg: { type: 'sync', name: 'FIRST BLOOM', diff: 3 },
    go: 'i19'
  });

  scene('i19', {
    r: 'ivane', ch: 5, loc: 'orbit', tod: 'day', title: 'The Orbit',
    l: [
      ['n', 'From the orbit gallery the Greenloop is a green seam down the belly of a grey machine.'],
      ['ivane', 'Forty ranks. Four generations. One archivist who would not go away.', 'warm'],
      ['you', 'The record says forty one ranks.'],
      ['ivane', 'The record is early. The record is always early.', 'wry'],
      ['ivane', 'Rank forty one is not planted yet. It is planted next spring, and I intend to see it finish.', 'resolve']
    ],
    mem: { id: 'mi6', name: 'Rank Forty One', at: 4, text: 'A planting plan for a rank that does not exist yet, with two sets of shift initials against every watering slot for the next four years.' },
    go: 'i20'
  });

  scene('i20', {
    r: 'ivane', ch: 5, loc: 'orbit', tod: 'day', title: 'In The Notes Field',
    l: [
      ['ivane', 'Last thing, archivist, and then I have forty one ranks to water.', 'warm'],
      ['ivane', 'What goes in the notes field on the harvest record?']
    ],
    q: {
      prompt: 'Nobody checks the notes field.',
      opts: [
        { t: 'The date I stopped leaving.', a: 2, f: 'final_all' },
        { t: 'PERENNIAL. That covers it.', a: 1, f: 'final_hold' },
        { t: 'Yield and moisture. It is a harvest record.', a: 0, f: 'final_blank' }
      ]
    },
    end: 'ivane'
  });

  /* =====================================================================
   * ROUTE THREE: CASS AMARU, COURIER PILOT
   * ===================================================================== */

  scene('c1', {
    r: 'cass', ch: 1, loc: 'dock', tod: 'day', title: 'A Haiku With A Fuel Figure',
    cg: true, cgName: 'Bay Four, Still Ticking',
    l: [
      ['n', 'Bay four. A courier hull ticking as it cools, still too hot to touch.'],
      ['cass', 'You are the new archivist. You are about to tell me my flight log is incomplete.', 'wry'],
      ['you', 'Your flight log is a haiku with a fuel figure in it.'],
      ['cass', 'Thank you. Nobody appreciates the economy.', 'warm']
    ],
    q: {
      prompt: 'The log is still open on your stylus.',
      opts: [
        { t: 'File it properly or I file it as missing.', a: 2, f: 'straight' },
        { t: 'Dictate it. I type fast and I am generous.', a: 2, f: 'flirt' },
        { t: 'Say nothing. Log the discrepancy.', a: 0, f: 'quiet' }
      ]
    },
    go: 'c2'
  });

  scene('c2', {
    r: 'cass', ch: 1, loc: 'dock', tod: 'day', title: 'Docking Burn',
    l: [
      ['cass', 'Straight at me. Okay. I like knowing where the wall is.', 'neutral', { f: 'straight' }],
      ['cass', 'Generous archivist. Dangerous combination. Sit down, this one is a story.', 'warm', { f: 'flirt' }],
      ['cass', 'Silent type. You will write me down exactly and I will deserve it.', 'wry', { f: 'quiet' }],
      ['cass', 'Truth is I shaved the burn to make a medical delivery window.', 'resolve'],
      ['cass', 'Central would ground me for a month for it and the patient would have waited a month.'],
      ['you', 'And the haiku hides it.'],
      ['cass', 'The haiku is art. Come here. Three burns, on my count.', 'warm']
    ],
    mg: { type: 'sync', name: 'DOCKING BURN', diff: 1 },
    coach: 'Tap when the marker crosses the beat line. Keyboard: space.',
    go: 'c3'
  });

  scene('c3', {
    r: 'cass', ch: 1, loc: 'dock', tod: 'dusk', title: 'Bays She Liked',
    l: [
      ['n', 'You start timing your shifts to bay four. You are aware this is a choice.'],
      ['cass', 'Eleven stations in nine years. I can tell you the coffee at all of them.', 'neutral'],
      ['you', 'And the people?'],
      ['cass', 'The people are harder. The people expect a second visit.', 'hurt'],
      ['n', 'Wedged in the console frame, worn soft at the corners, an old approach card.']
    ],
    mem: { id: 'mc1', name: 'Approach Card', at: 4, text: 'A Vireo approach card, laminated, edges worn white. She has flown this approach enough times to have memorised it and she still keeps the card.' },
    q: {
      prompt: 'You could ask.',
      opts: [
        { t: 'You know this approach by heart. Why keep the card?', a: 2, f: 'asked' },
        { t: 'Log the fuel figure. Leave the card alone.', a: 0 },
        { t: 'Tell her the coffee here is objectively the worst.', a: 2, f: 'watch' }
      ]
    },
    go: 'c4'
  });

  scene('c4', {
    r: 'cass', ch: 1, loc: 'obs', tod: 'night', title: 'Traffic Lanes',
    l: [
      ['cass', 'Because one day I will fly it tired and I will want the card.', 'neutral', { f: 'asked' }],
      ['cass', 'Also because it is the only approach I have ever wanted to get right twice.', 'hurt', { f: 'asked' }],
      ['cass', 'It is the worst. It is famously the worst. I drink four cups a visit.', 'warm', { f: 'watch' }],
      ['n', 'The observation deck. Cass does not look at the stars. She looks at the traffic lanes between them.'],
      ['cass', 'Everyone up here looks at the pretty part. The lanes are where the work is.', 'neutral'],
      ['cass', 'End of your first month, archivist. You have not once asked me when I am leaving.', 'warm']
    ],
    go: 'c5'
  });

  scene('c5', {
    r: 'cass', ch: 2, loc: 'dock', tod: 'day', title: 'The Outer Circuit',
    cg: true, cgName: 'The Offer',
    l: [
      ['cass', 'Central offered me the outer circuit. Eighteen months, no station longer than a day.', 'neutral'],
      ['cass', 'It is the best route anyone has ever put in front of me.'],
      ['cass', 'And I brought it to you first, which I have been trying not to think about, honestly.', 'hurt']
    ],
    q: {
      prompt: 'This choice rewrites the middle of the route.',
      opts: [
        { t: 'Take it. I will archive every log you send.', a: 1, f: 'go' },
        { t: 'Turn it down. Fly the Vireo loop. Stay reachable.', a: 1, f: 'stay' }
      ],
      timer: 12
    },
    go: 'c6'
  });

  scene('c6', {
    r: 'cass', ch: 2, loc: 'dock', tod: 'day', title: 'Kept And Reachable',
    l: [
      ['cass', 'You are not going to ask me to stay. That is worse, somehow. That is so much worse.', 'hurt', { f: 'go' }],
      ['you', 'I am asking you to come back. Different request. Better odds.', null, { f: 'go' }],
      ['cass', 'You want me kept. Everybody eventually wants me kept.', 'hurt', { f: 'stay' }],
      ['you', 'I want you reachable. There is a difference and you know it.', null, { f: 'stay' }],
      ['cass', 'I know it. I have never had anybody make the distinction out loud.', 'surprise', { f: 'stay' }],
      ['n', 'Taped inside the flight case lid, a list.'],
      ['cass', 'Observation gallery. Ten minutes. Bring the bad station coffee.', 'warm']
    ],
    mem: { id: 'mc2', name: 'Case Lid List', at: 5, text: 'Eleven station names crossed out. Vireo is twelfth, written last, not crossed out, circled twice.' },
    go: 'c7'
  });

  scene('c7', {
    r: 'cass', ch: 2, loc: 'obs', tod: 'dusk', title: 'A Bay I Like',
    l: [
      ['cass', 'I have never had a home port. I have had bays I liked.', 'neutral'],
      ['cass', 'Vireo is a bay I like. That is the most romantic sentence I own, and I hate it.', 'hurt']
    ],
    q: {
      prompt: 'She is holding the terrible coffee with both hands.',
      opts: [
        { t: 'Then let me write you a better one.', a: 2, f: 'person' },
        { t: 'A bay you like is a start. I will take a start.', a: 2 },
        { t: 'Keep it. It suits you.', a: 0 }
      ]
    },
    go: 'c8'
  });

  scene('c8', {
    r: 'cass', ch: 2, loc: 'obs', tod: 'dusk', title: 'Approach Trim',
    l: [
      ['cass', 'Write it down then. You are the only person who writes anything down about me.', 'warm', { f: 'person' }],
      ['cass', 'Approach rhythm. Three corrections, evenly spaced, or you kiss the collar ring at speed.', 'neutral'],
      ['cass', 'Hands here. Feel the count.', 'warm']
    ],
    mg: { type: 'sync', name: 'APPROACH TRIM', diff: 2 },
    branch: { go: 'c9a', stay: 'c9b' }
  });

  /* Chapter three, variant A: she took the circuit. */

  scene('c9a', {
    r: 'cass', ch: 3, loc: 'core', tod: 'night', title: 'Log Thirty One',
    l: [
      ['n', 'She takes the circuit. Vireo gets quieter in a way you can measure.'],
      ['n', 'Her logs arrive weekly. They are, for the first time in her career, complete.'],
      ['cass', 'Log thirty one. Refuelled at Marrow Point. Nothing here. Filed early so it reaches you Thursday.', 'neutral'],
      ['n', 'Month eleven, a log arrives with a course amendment attached and no explanation.']
    ],
    q: {
      prompt: 'The amendment is sitting in your queue, unsigned.',
      opts: [
        { t: 'Approve it. It bends her route through Vireo.', a: 2, f: 'stood' },
        { t: 'Log it as filed and wait for her to say it out loud.', a: 2, f: 'stood' },
        { t: 'Flag it to Central as a deviation.', a: 0 }
      ],
      timer: 10
    },
    go: 'c10a'
  });

  scene('c10a', {
    r: 'cass', ch: 3, loc: 'core', tod: 'day', title: 'Fourteen Hours',
    l: [
      ['cass', 'Fourteen hours. That is what the amendment buys me. Fourteen hours at Vireo, every third circuit.', 'warm', { f: 'stood' }],
      ['cass', 'Fourteen hours is nothing. Fourteen hours is a fuel penalty and a rescheduled sleep cycle.', 'neutral'],
      ['cass', 'I did the maths four times looking for a reason that was not you.', 'hurt'],
      ['you', 'Did you find one?'],
      ['cass', 'No. Very annoying. Extremely well documented, though, thanks to your filing.', 'wry'],
      ['n', 'In the amendment packet, page nine, a burn plan drawn by hand.']
    ],
    mem: { id: 'mc3', name: 'Fourteen Hours', at: 5, text: 'A hand drawn burn plan optimising for one thing: the longest possible stop at Vireo without triggering a Central review.' },
    go: 'c11a'
  });

  scene('c11a', {
    r: 'cass', ch: 3, loc: 'dock', tod: 'night', title: 'Courier Cipher',
    l: [
      ['cass', 'Outer circuit traffic runs on a courier cipher. Old, ugly, and nobody at Central remembers who wrote it.', 'neutral'],
      ['cass', 'If you can read it you can hear every ship out there talking.'],
      ['cass', 'Teach yourself. Then you will always know where I am.', 'warm']
    ],
    mg: { type: 'decrypt', name: 'COURIER CIPHER', diff: 2, rounds: 4 },
    go: 'c12a'
  });

  scene('c12a', {
    r: 'cass', ch: 3, loc: 'obs', tod: 'night', title: 'Where She Is',
    l: [
      ['n', 'After that you always know where she is. It is, you discover, an enormous difference.'],
      ['cass', 'You have been tracking me on the lane board.', 'surprise'],
      ['you', 'I have been archiving the lane board. The tracking is incidental.'],
      ['cass', 'Nobody has known where I was in nine years.', 'hurt']
    ],
    q: {
      prompt: 'She says it like she is testing whether it is allowed.',
      opts: [
        { t: 'Somebody does now. That is the whole point of a record.', a: 2, f: 'private' },
        { t: 'I will stop if you want. I will not want to.', a: 2, f: 'private' },
        { t: 'It is only traffic data.', a: 0 }
      ]
    },
    go: 'c13'
  });

  /* Chapter three, variant B: she stayed on the loop. */

  scene('c9b', {
    r: 'cass', ch: 3, loc: 'dock', tod: 'day', title: 'The Milk Run',
    l: [
      ['n', 'She flies the Vireo loop. Short hops. Home every ninth night.'],
      ['n', 'By month four she is bored in a way that shows up in her landings.'],
      ['cass', 'I turned down eighteen months of sky for a milk run and I said it was my idea.', 'hurt'],
      ['cass', 'I am not blaming you. I am blaming me for being this easy to keep.']
    ],
    q: {
      prompt: 'The last landing put a scuff on the collar ring.',
      opts: [
        { t: 'Then take the sky. I will still be the port you file to.', a: 2, f: 'stood' },
        { t: 'Fly the outer runs. Come back loud. I will be here.', a: 2, f: 'stood' },
        { t: 'You chose it. Live with the manifest.', a: 0 }
      ],
      timer: 10
    },
    go: 'c10b'
  });

  scene('c10b', {
    r: 'cass', ch: 3, loc: 'dock', tod: 'dusk', title: 'The Scuff',
    l: [
      ['cass', 'You are the first person who has ever handed the sky back to me.', 'surprise', { f: 'stood' }],
      ['cass', 'Everybody else got quiet and hopeful and I flew worse to keep them comfortable.', 'hurt', { f: 'stood' }],
      ['cass', 'Central will give me the long runs and the loop. Both. If somebody files it right.', 'resolve'],
      ['you', 'Somebody files things right.'],
      ['cass', 'I know. It is the single most attractive thing about this station.', 'warm'],
      ['n', 'She sands the scuff off the collar ring herself, at 0200, badly, and keeps the sanding block.']
    ],
    mem: { id: 'mc3', name: 'Sanding Block', at: 5, text: 'A courier pilot who has never once repaired a station fitting sands one flat at 0200 and keeps the block in her flight case.' },
    go: 'c11b'
  });

  scene('c11b', {
    r: 'cass', ch: 3, loc: 'dock', tod: 'night', title: 'Bay Four Drift',
    l: [
      ['cass', 'Collar ring inspection. Exterior. It is a two person job and I have been doing it alone.', 'neutral'],
      ['cass', 'Push off, drift the ring, tag every clamp. Do not use the thrusters like you are angry at them.', 'wry']
    ],
    mg: { type: 'drift', name: 'BAY FOUR DRIFT', diff: 2 },
    coach: 'Tap the left or right half to thrust. Keyboard: arrow keys.',
    go: 'c12b'
  });

  scene('c12b', {
    r: 'cass', ch: 3, loc: 'obs', tod: 'dusk', title: 'Both',
    l: [
      ['cass', 'Central signed it. Long runs and the loop. Nine years and nobody thought to just ask for both.', 'warm'],
      ['you', 'Nobody had the paperwork.'],
      ['cass', 'Nobody had you.', 'hurt'],
      ['cass', 'I am going to say something badly now and I would like it on the record anyway.', 'resolve']
    ],
    q: {
      prompt: 'She is looking at the lanes, not at you.',
      opts: [
        { t: 'Say it badly. I will file it beautifully.', a: 2, f: 'private' },
        { t: 'On the record, then. Go ahead.', a: 2, f: 'private' },
        { t: 'Maybe do not.', a: 0 }
      ]
    },
    go: 'c13'
  });

  /* Chapter four: the hot dock. */

  scene('c13', {
    r: 'cass', ch: 4, loc: 'dock', tod: 'night', title: 'Hot Dock',
    cg: true, cgName: 'Bay Four, Inbound',
    l: [
      ['n', '0140 station time. A medical priority comes down the lane board with nine hours on it.'],
      ['cass', 'Nine hours. The safe plot is eleven.', 'resolve'],
      ['you', 'And the unsafe one?'],
      ['cass', 'Eight and a half, through the freight lanes, at an angle Central does not have a form for.'],
      ['cass', 'Last time I did this I hid it in a haiku. I am not doing that again.', 'hurt'],
      ['cass', 'Plot it with me. On the record. Every correction, logged as it happens.'],
      ['you', 'Then it is not a violation. It is a documented emergency procedure.'],
      ['cass', 'You have no idea how attractive that sentence is.', 'warm']
    ],
    go: 'c14'
  });

  scene('c14', {
    r: 'cass', ch: 4, loc: 'dock', tod: 'night', title: 'Lane Plot',
    l: [
      ['cass', 'Freight lanes. Six waypoints. In order, and do not let the plot cross itself.', 'resolve'],
      ['n', 'Her hand stays on the console beside yours the whole time, which is not how plotting works.']
    ],
    mg: { type: 'trace', name: 'LANE PLOT', diff: 3 },
    coach: 'Tap the waypoints in order, lowest number first. Keyboard: number keys.',
    go: 'c15'
  });

  scene('c15', {
    r: 'cass', ch: 4, loc: 'core', tod: 'night', title: 'Eight Hours Twenty',
    l: [
      ['n', 'Eight hours twenty. The delivery clears. Somebody two lanes over keeps a leg.'],
      ['cass', 'That is the first burn of my career that exists in writing.', 'surprise'],
      ['you', 'Complete with fuel figure and no poetry whatsoever.'],
      ['cass', 'I hated every second of the filing and I am going to do it every time now.', 'warm'],
      ['cass', 'Nine years of shaving burns in secret because nobody would have believed the reason.'],
      ['n', 'In the flight case, under the sanding block, a second stylus. Yours, from your first week, never returned.']
    ],
    mem: { id: 'mc4', name: 'Borrowed Stylus', at: 5, text: 'Your stylus, borrowed on day one and never given back, carried on eleven runs and two circuits.' },
    q: {
      prompt: 'She has noticed you noticing.',
      opts: [
        { t: 'Keep it. Filing is a two person job now.', a: 2, f: 'together' },
        { t: 'That has been on more runs than I have.', a: 2, f: 'together' },
        { t: 'I would like that back, actually.', a: 0 }
      ]
    },
    go: 'c16'
  });

  scene('c16', {
    r: 'cass', ch: 4, loc: 'obs', tod: 'night', title: 'Bay Four Is Hers',
    l: [
      ['n', 'The dock crew starts calling bay four hers. Nobody corrects them.'],
      ['n', 'She flies. She returns. The gap between the two gets shorter every quarter.'],
      ['cass', 'I do not do kept. I do coming back. Big difference.', 'neutral'],
      ['you', 'Noted. Coming back is a route. Routes I can file.'],
      ['cass', 'You have filed nineteen of them.', 'warm'],
      ['you', 'Twenty. The medical run had two legs.'],
      ['cass', 'Twenty.', 'hurt']
    ],
    mem: { id: 'mc5', name: 'Bay Four Plate', at: 0, text: 'Somebody in the dock crew has stencilled AMARU on the bay four bulkhead. It is not regulation. It has not been painted over.' },
    go: 'c17'
  });

  scene('c17', {
    r: 'cass', ch: 5, loc: 'dock', tod: 'dusk', title: 'The Blank Line',
    l: [
      ['n', 'Bay four, 0400 station time. The hull ticking as it cools.'],
      ['cass', 'I filed something. Central signed it before they read it, which is the only way I get anything.', 'wry'],
      ['cass', 'There is a second crew line on the manifest. It is blank. It has been blank for a month.', 'hurt'],
      ['cass', 'You realise this means you would have to actually leave the station.', 'hurt', { aff: 20 }]
    ],
    q: {
      prompt: 'The manifest is on the console, second line empty.',
      opts: [
        { t: 'Give me the stylus.', a: 2, f: 'said' },
        { t: 'Ask me properly and I will think about it.', a: 2, f: 'said' },
        { t: 'The archive does not travel.', a: 0 }
      ]
    },
    go: 'c18'
  });

  scene('c18', {
    r: 'cass', ch: 5, loc: 'dock', tod: 'dusk', title: 'Launch Count',
    cg: true, cgName: 'You Call The Count',
    l: [
      ['cass', 'Pre burn checks. Three of them. You call the count this time.', 'warm'],
      ['n', 'She hands you the stylus, and then the console.'],
      ['cass', 'Whenever you are ready, second crew.', 'warm']
    ],
    mg: { type: 'sync', name: 'LAUNCH COUNT', diff: 3 },
    go: 'c19'
  });

  scene('c19', {
    r: 'cass', ch: 5, loc: 'orbit', tod: 'night', title: 'The Orbit',
    l: [
      ['n', 'From outside, Vireo is a wheel of borrowed metal with one bright seam and four hundred lit windows.'],
      ['cass', 'Twelve stations. That is the only one I have ever looked back at.', 'hurt'],
      ['you', 'You are looking at it now.'],
      ['cass', 'I am aware. I am handling it.', 'wry'],
      ['cass', 'The record goes where the ship goes. You said that. I have thought about it every week since.', 'warm']
    ],
    mem: { id: 'mc6', name: 'Twelfth Station', at: 3, text: 'The case lid list, updated: Vireo uncrossed, circled twice, and under it in fresh ink, HOME PORT. FILED.' },
    go: 'c20'
  });

  scene('c20', {
    r: 'cass', ch: 5, loc: 'orbit', tod: 'night', title: 'Second Crew',
    l: [
      ['cass', 'Last thing, archivist, and then bay four seals and we are gone for a month.', 'warm'],
      ['cass', 'What goes in the notes field on the manifest?']
    ],
    q: {
      prompt: 'Nobody at Central reads the notes field.',
      opts: [
        { t: 'Two names. Same manifest. Every run.', a: 2, f: 'final_all' },
        { t: 'COMING BACK. That covers it.', a: 1, f: 'final_hold' },
        { t: 'Fuel and mass. It is a manifest.', a: 0, f: 'final_blank' }
      ]
    },
    end: 'cass'
  });

  /* =====================================================================
   * ENDINGS. Three per route: the drifting ending, the steady ending, and
   * the true ending, which requires the top affinity tier and five of the
   * six memory fragments on that route.
   * ===================================================================== */

  var ENDINGS = {
    rell: [
      {
        id: 'rell_low', title: 'Hard Vacuum', tier: 'drift', star: 'A cold star at the rim.',
        loc: 'ring', tod: 'night',
        text: [
          'The waiver clears. The loop holds. Rell signs off and goes back to the ring.',
          'You archive the repair perfectly: part number, pressure curve, date, personnel.',
          'Nowhere in the record is there a field for the way they said your name that first night.',
          'Vireo turns. You both keep it turning. Separately, correctly, for years.'
        ]
      },
      {
        id: 'rell_mid', title: 'Torque And Trust', tier: 'steady', star: 'A steady twin star.',
        loc: 'obs', tod: 'dusk',
        text: [
          'Rell teaches you the ring the way they learned it: one strut, one noise, one night at a time.',
          'I am slow at this, they warn you, hands still greased. I take things apart before I trust them.',
          'Then take your time, you say. I am the archivist. I am extremely good at waiting.',
          'Six months later there are two mugs in the strut gallery. Neither of you moves them.'
        ]
      },
      {
        id: 'rell_good', title: 'The Long Spin', tier: 'true', star: 'A bright pair, locked in orbit.',
        loc: 'orbit', tod: 'night',
        text: [
          'They say it in the gallery, badly, with the window full of turning light.',
          'You held the lamp, Rell says. Nobody holds the lamp. They hold the schedule.',
          'You log it, because you log everything. FIELD REPAIR, RING C. PERSONNEL: TWO. STATUS: HOLDING.',
          'Forty years from now somebody reads that entry and knows exactly what happened here.',
          'Ring C is patched eleven times and it has never once been early.'
        ]
      }
    ],
    ivane: [
      {
        id: 'ivane_low', title: 'Dormant', tier: 'drift', star: 'A seed star, unopened.',
        loc: 'green', tod: 'night',
        text: [
          'The Greenloop recovers. Ivane files the strain report themself, in handwriting you can barely read.',
          'They still wave when you pass the glass. They still save you the bruised fruit.',
          'But some things need the right season and you were both busy surviving the wrong one.',
          'The bean germinates in spring. You hear about it secondhand, and file it correctly.'
        ]
      },
      {
        id: 'ivane_mid', title: 'Season By Season', tier: 'steady', star: 'A slow green light.',
        loc: 'green', tod: 'dusk',
        text: [
          'I plant things I will not see finish, Ivane admits, elbow deep in substrate. It is a bad habit.',
          'So archive it with me, you say. Then somebody sees it finish.',
          'You start eating dinner in the Greenloop. Then breakfast. Then most of a year.',
          'Nothing is declared. Everything is watered.'
        ]
      },
      {
        id: 'ivane_good', title: 'Perennial', tier: 'true', star: 'Twin stars, one blooming.',
        loc: 'orbit', tod: 'day',
        text: [
          'Vireo Amber comes up gold under the grow bars and the whole ring smells like a promise.',
          'Ivane cries into a tray of seedlings and laughs about it for a week.',
          'I wanted one thing to keep coming back, they say. Greedy of me to want two.',
          'You file the harvest, the yield, and in the notes field where nobody checks, the date you stopped leaving.',
          'Rank forty one goes in next spring. Both sets of initials are already against every watering slot.'
        ]
      }
    ],
    cass: [
      {
        id: 'cass_low', title: 'Solo Burn', tier: 'drift', star: 'A streak, already gone.',
        loc: 'dock', tod: 'night',
        text: [
          'Cass takes the long haul because Cass always takes the long haul.',
          'Her logs arrive on schedule, clean for the first time in her career. Somebody taught her that.',
          'You archive each one. You never write back, and she never asks you to.',
          'Eighteen months later a courier undocks at Vireo and does not come inside.'
        ]
      },
      {
        id: 'cass_mid', title: 'Wing And Wing', tier: 'steady', star: 'Two lights, close pass.',
        loc: 'dock', tod: 'dusk',
        text: [
          'I do not do kept, Cass says, boots on your console. I do coming back. Big difference.',
          'Noted, you say, and note it. Coming back is a route. Routes I can file.',
          'She flies. She returns. The gap between the two gets shorter every quarter.',
          'The dock crew starts calling bay four hers. Nobody corrects them.'
        ]
      },
      {
        id: 'cass_good', title: 'Two Names On The Manifest', tier: 'true', star: 'A bright braid of light.',
        loc: 'orbit', tod: 'night',
        text: [
          'The contract clears with an amendment nobody at Central bothers to read. SECOND CREW: ARCHIVIST.',
          'You realise this means you have to actually leave the station, Cass says, delighted and terrified.',
          'I realise it means the record goes where the ship goes.',
          'Bay four seals. The burn is beautiful. Neither of you looks back at Vireo, and neither of you has to.',
          'Twelve stations. One of them is uncrossed, circled twice, and filed as a home port.'
        ]
      }
    ]
  };

  root.OH_STORY = {
    VERSION: 4, CHARS: CHARS, LOCALES: LOCALES, ROUTES: ROUTES, SCENES: S,
    AFF_MAX: AFF_MAX, AFF_HI: AFF_HI, AFF_MID: AFF_MID, MEM_TRUE: MEM_TRUE,
    PROLOGUE: 'p1', ENDINGS: ENDINGS
  };
})(window);
