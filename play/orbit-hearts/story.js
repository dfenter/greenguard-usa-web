/* Orbit Hearts - story data. All names, characters and text original. */
(function (g) {
  'use strict';

  var ROUTES = [
    {
      id: 'rell', name: 'Rell Ossandro', role: 'Ring Engineer',
      color: '#7fd4ff', accent: '#2b6f8f', shape: 'hex', bg: 'ring',
      blurb: 'Keeps forty years of borrowed metal from shearing. Speaks in torque.',
      start: 'rell_1'
    },
    {
      id: 'ivane', name: 'Ivane Quill', role: 'Greenloop Botanist',
      color: '#9ff2a8', accent: '#2f7a45', shape: 'leaf', bg: 'green',
      blurb: 'Grows forty percent of the station\'s dinner and all of its optimism.',
      start: 'iv_1'
    },
    {
      id: 'cass', name: 'Cass Amaru', role: 'Courier Pilot',
      color: '#ffb27f', accent: '#a05230', shape: 'wing', bg: 'dock',
      blurb: 'Docks hot, leaves early, has never once filed a clean flight log.',
      start: 'cass_1'
    }
  ];

  var ENDINGS = {
    rell: [
      { id: 'rell_low', title: 'Hard Vacuum', star: 'A cold star at the rim.',
        text: ['The waiver clears. The loop holds. Rell signs off and goes back to the ring.',
               'You archive the repair perfectly: part number, pressure curve, date.',
               'Nowhere in the record is there a field for the way they said your name that first night.',
               'Vireo turns. You both keep it turning. Separately.'] },
      { id: 'rell_mid', title: 'Torque and Trust', star: 'A steady twin star.',
        text: ['Rell teaches you the ring the way they learned it: one strut, one noise, one night at a time.',
               '"I\'m slow at this," they warn you, hands still greased. "I take things apart before I trust them."',
               '"Then take your time," you say. "I\'m the archivist. I\'m extremely good at waiting."',
               'Six months later there are two mugs in the strut gallery. Neither of you moves them.'] },
      { id: 'rell_good', title: 'The Long Spin', star: 'A bright pair, locked in orbit.',
        text: ['They say it in the gallery, badly, with the window full of turning light.',
               '"You held the lamp," Rell says. "Nobody holds the lamp. They hold the schedule."',
               'You log it, because you log everything: FIELD REPAIR, RING C. PERSONNEL: TWO. STATUS: HOLDING.',
               'Forty years from now somebody will read that entry and know exactly what happened here.'] }
    ],
    ivane: [
      { id: 'ivane_low', title: 'Dormant', star: 'A seed-star, unopened.',
        text: ['The Greenloop recovers. Ivane files the strain report themself, in handwriting you can barely read.',
               'They still wave when you pass the glass. They still save you the bruised fruit.',
               'But some things need the right season and you were both busy surviving the wrong one.',
               'The bean germinates in spring. You hear about it secondhand.'] },
      { id: 'ivane_mid', title: 'Season by Season', star: 'A slow green light.',
        text: ['"I plant things I won\'t see finish," Ivane admits, elbow-deep in substrate. "It\'s a bad habit."',
               '"So archive it with me," you say. "Then somebody sees it finish."',
               'You start eating dinner in the Greenloop. Then breakfast. Then most of a year.',
               'Nothing is declared. Everything is watered.'] },
      { id: 'ivane_good', title: 'Perennial', star: 'Twin stars, one blooming.',
        text: ['Vireo Amber comes up gold under the grow bars and the whole ring smells like a promise.',
               'Ivane cries into a tray of seedlings and laughs about it for a week.',
               '"I wanted one thing to keep coming back," they say. "Greedy of me to want two."',
               'You file the harvest, the yield, and — in the notes field, where nobody checks — the date you stopped leaving.'] }
    ],
    cass: [
      { id: 'cass_low', title: 'Solo Burn', star: 'A streak, already gone.',
        text: ['Cass takes the long haul because Cass always takes the long haul.',
               'Her logs arrive on schedule, clean for the first time in her career. Someone taught her that.',
               'You archive each one. You never write back, and she never asks you to.',
               'Eighteen months later a courier undocks at Vireo and does not come inside.'] },
      { id: 'cass_mid', title: 'Wing and Wing', star: 'Two lights, close pass.',
        text: ['"I don\'t do kept," Cass says, boots on your console. "I do coming back. Big difference."',
               '"Noted," you say, and note it. "Coming back is a route. Routes I can file."',
               'She flies. She returns. The gap between the two gets shorter every quarter.',
               'Vireo\'s dock crew starts calling bay four hers. Nobody corrects them.'] },
      { id: 'cass_good', title: 'Two Names on the Manifest', star: 'A bright braid of light.',
        text: ['The contract clears with an amendment nobody at Central bothers to read: SECOND CREW — ARCHIVIST.',
               '"You realize this means you have to actually leave the station," Cass says, delighted, terrified.',
               '"I realize it means the record goes where the ship goes."',
               'Bay four seals. The burn is beautiful. Neither of you looks back at Vireo, and neither of you has to.'] }
    ]
  };

  var N = {};

  /* ---------------- RELL — Ring Engineer ---------------- */

  N.rell_1 = { ch: 1, bg: 'ring', lines: [
    ['', 'Vireo Station, spin ring C. It smells like hot copper and somebody\'s burnt tea.'],
    ['', 'Day one as station archivist. Your job is to record everything. Nobody said what everything includes.'],
    ['Rell', 'Stop. Don\'t touch that conduit, it bites.'],
    ['You', 'I was going to log it, not hug it.'],
    ['Rell', 'Log it after I clamp it. Hold the lamp. Steady.']
  ], choices: [
    { t: 'Hold the lamp perfectly steady.', a: 2, f: 'careful', go: 'rell_1b' },
    { t: 'Aim the lamp at their face and grin.', a: 1, f: 'bold', go: 'rell_1b' },
    { t: 'Put the lamp down. Start recording.', a: 0, f: 'formal', go: 'rell_1b' }
  ] };

  N.rell_1b = { ch: 1, bg: 'ring', lines: [
    ['Rell', 'Huh. Steady hands. Archivists usually shake.', 'careful'],
    ['Rell', 'Charming. Blinding, but charming.', 'bold'],
    ['Rell', 'You\'re recording me. Of course you are.', 'formal'],
    ['Rell', 'Clamp\'s in. Ring won\'t shear tonight.'],
    ['You', 'Does it usually try?'],
    ['Rell', 'Vireo is forty years past warranty. Everything here tries.'],
    ['', 'They press a torque driver into your hand. Three bolts. Match their rhythm.']
  ], rhythm: { name: 'TORQUE SYNC' }, go: 'rell_2' };

  N.rell_2 = { ch: 2, bg: 'core', lines: [
    ['', 'Two weeks later you know the ring\'s noises by heart. Rell knows them better.'],
    ['Rell', 'Archivist. I need a favour that\'s technically a felony.'],
    ['You', '"Technically" is doing a lot of work in that sentence.'],
    ['Rell', 'Coolant loop D is failing. Central won\'t approve the part for six months. I fabricated one. It\'s off-manifest.'],
    ['Rell', 'You log the truth for a living. So I\'m asking instead of sneaking.']
  ], choices: [
    { t: 'Log it as approved. I\'ll carry it.', a: 1, f: 'cover', go: 'rell_2b' },
    { t: 'I\'ll log it true — and argue it to Central myself.', a: 1, f: 'report', go: 'rell_2b' }
  ] };

  N.rell_2b = { ch: 2, bg: 'core', lines: [
    ['Rell', 'You just tied your record to mine. That is not nothing.', 'cover'],
    ['You', 'It isn\'t nothing. It also isn\'t a mistake.', 'cover'],
    ['Rell', 'You\'d put your name in front of Central. For a coolant loop.', 'report'],
    ['You', 'For the four hundred people breathing behind it.', 'report'],
    ['Rell', 'Nobody\'s argued for me before. They sign or they don\'t.', 'report'],
    ['Rell', 'Strut gallery. Before shift. I want to show you something.']
  ], go: 'rell_2c' };

  N.rell_2c = { ch: 2, bg: 'obs', lines: [
    ['', 'The strut gallery: bare girders and a window the size of a confession.'],
    ['Rell', 'Forty years of somebody else\'s welds. I can read every hand that worked here.'],
    ['Rell', 'Someday somebody reads mine.']
  ], choices: [
    { t: 'Then make them worth reading. I\'ll archive every one.', a: 2, go: 'rell_2d' },
    { t: 'I\'d rather read the person than the welds.', a: 1, go: 'rell_2d' },
    { t: 'That\'s a lot of weight for a bolt.', a: 0, go: 'rell_2d' }
  ] };

  N.rell_2d = { ch: 2, bg: 'obs', lines: [
    ['Rell', 'Ring pulse comes through the floor. Feel it? Three beats, then the shear note.'],
    ['Rell', 'Tap it back to me. If you can hear it, you can keep it alive.']
  ], rhythm: { name: 'RING PULSE' }, branch: { cover: 'rell_3a', report: 'rell_3b' } };

  N.rell_3a = { ch: 3, bg: 'core', lines: [
    ['', 'Central\'s audit lands on a Tuesday, the way bad weather does.'],
    ['Auditor', 'Loop D shows an approved part. There is no approval on file.'],
    ['Rell', 'That\'s on me. Archivist logged what I told them.'],
    ['', 'Rell does not look at you. That is, you realise, them protecting you.']
  ], choices: [
    { t: 'It\'s on both of us. Here\'s the pressure data — it held.', a: 2, f: 'stood', go: 'rell_3c' },
    { t: 'The part works. Cite me and take it out of my pay.', a: 1, f: 'stood', go: 'rell_3c' },
    { t: 'I logged what I was given.', a: 0, go: 'rell_3c' }
  ] };

  N.rell_3b = { ch: 3, bg: 'core', lines: [
    ['', 'You spend nine days writing an argument instead of a record.'],
    ['Rell', 'You\'ve been awake for all nine of them.'],
    ['You', 'Central answers paperwork. So I made paperwork it can\'t ignore.'],
    ['', 'The waiver returns approved, with a note: FABRICATION OVERSIGHT — OSSANDRO.'],
    ['Rell', 'They gave me the ring.']
  ], choices: [
    { t: 'They gave you what you already carried.', a: 2, f: 'stood', go: 'rell_3c' },
    { t: 'You gave it to yourself. I just held the lamp.', a: 1, f: 'stood', go: 'rell_3c' },
    { t: 'Now the paperwork\'s your problem.', a: 0, go: 'rell_3c' }
  ] };

  N.rell_3c = { ch: 3, bg: 'obs', lines: [
    ['Rell', 'Shift\'s over. Gallery?'],
    ['', 'The window. The station turning beneath you like a slow wheel of light.'],
    ['Rell', 'I\'m bad at this part. The part where a person says the thing.']
  ], choices: [
    { t: 'Then let me. Stay in my log. Permanently.', a: 2, go: 'rell_3d' },
    { t: 'Say it in torque. I\'ll learn to read it.', a: 1, go: 'rell_3d' },
    { t: 'Some things don\'t need saying.', a: 0, go: 'rell_3d' }
  ] };

  N.rell_3d = { ch: 3, bg: 'obs', lines: [
    ['Rell', 'Hand. Here. Against the girder.'],
    ['', 'Under your palm the ring keeps its old, stubborn time.']
  ], rhythm: { name: 'THE LONG SPIN' }, end: 'rell' };

  /* ---------------- IVANE — Greenloop Botanist ---------------- */

  N.iv_1 = { ch: 1, bg: 'green', lines: [
    ['', 'The Greenloop is the only place on Vireo that smells alive.'],
    ['Ivane', 'The archivist! Excellent. Hold this. Don\'t breathe on it.'],
    ['You', 'What is it?'],
    ['Ivane', 'Hope, mostly. Also a bean.']
  ], choices: [
    { t: 'Hold it like it\'s made of glass.', a: 2, f: 'gentle', go: 'iv_1b' },
    { t: 'Breathe on it. Obviously.', a: 1, f: 'playful', go: 'iv_1b' },
    { t: 'Request its taxonomic index first.', a: 0, f: 'precise', go: 'iv_1b' }
  ] };

  N.iv_1b = { ch: 1, bg: 'green', lines: [
    ['Ivane', 'Oh, you\'re careful. I\'m never careful. This could be good for both of us.', 'gentle'],
    ['Ivane', 'I said DON\'T — ha. Fine. It survived you. Promising sign.', 'playful'],
    ['Ivane', 'Vireo Amber, third generation, forty percent of everyone\'s dinner. Index enough?', 'precise'],
    ['Ivane', 'It won\'t germinate. Three seasons running. The trays come up empty and I keep planting.'],
    ['You', 'Why keep planting?'],
    ['Ivane', 'Because the day I stop is the day the ration board decides for me.'],
    ['', 'They hand you a pollen brush. Light strokes, on the beat, or the blossoms bruise.']
  ], rhythm: { name: 'POLLEN PASS' }, go: 'iv_2' };

  N.iv_2 = { ch: 2, bg: 'green', lines: [
    ['', 'A month in the grow bay teaches you that patience is a physical skill.'],
    ['Ivane', 'Two roads. I can splice the Amber with a fast hardy stock — results in weeks, and a blight risk I can\'t model.'],
    ['Ivane', 'Or I go back to the wild seed bank. Slow. Honest. Rationing until it takes.'],
    ['Ivane', 'You\'re the one who writes what happened here. So. Which happened?']
  ], choices: [
    { t: 'Splice it. Feed people now, argue later.', a: 1, f: 'splice', go: 'iv_2b' },
    { t: 'Wild stock. I\'ll ration with you.', a: 1, f: 'wild', go: 'iv_2b' }
  ] };

  N.iv_2b = { ch: 2, bg: 'green', lines: [
    ['Ivane', 'Fast it is. If it goes wrong it goes wrong in public and it goes wrong with my name on it.', 'splice'],
    ['You', 'And mine under it, in the record, holding the light.', 'splice'],
    ['Ivane', 'Half rations for a season. You know that means you too, archivist.', 'wild'],
    ['You', 'I checked. I signed. I\'m already hungry, it\'s fine.', 'wild'],
    ['Ivane', 'Come up to the observation gallery tonight. The bay lights hurt after fourteen hours.']
  ], go: 'iv_2c' };

  N.iv_2c = { ch: 2, bg: 'obs', lines: [
    ['', 'Vireo\'s window. Ivane sits with their boots off and their feet on the rail like a hazard notice.'],
    ['Ivane', 'I grew up dirtside. Real dirt. It rained on things without a schedule.'],
    ['Ivane', 'I keep planting like I\'m arguing with a station that doesn\'t care.']
  ], choices: [
    { t: 'Then I\'ll be the record that proves you won the argument.', a: 2, go: 'iv_2d' },
    { t: 'It cares. It just says it in yield numbers.', a: 1, go: 'iv_2d' },
    { t: 'Stations don\'t argue. They just spin.', a: 0, go: 'iv_2d' }
  ] };

  N.iv_2d = { ch: 2, bg: 'obs', lines: [
    ['Ivane', 'Grow bar cycle. Twelve seconds bright, three dark. Everything green here lives on that beat.'],
    ['Ivane', 'Come on. Learn the rhythm and you\'ll never miss a watering again.']
  ], rhythm: { name: 'GROW CYCLE' }, branch: { splice: 'iv_3a', wild: 'iv_3b' } };

  N.iv_3a = { ch: 3, bg: 'green', lines: [
    ['', 'The spliced Amber comes up in nineteen days. The ring eats fresh for the first time in a year.'],
    ['', 'On day twenty-two, tray six shows rust-coloured spotting.'],
    ['Ivane', 'Blight. Small. Contained, maybe. If I burn the whole bay tonight it stays small.'],
    ['Ivane', 'Everything I proved, gone in an hour, and I have to be the one holding the torch.']
  ], choices: [
    { t: 'Burn it. I\'ll log why, so it counts as courage, not failure.', a: 2, f: 'stood', go: 'iv_3c' },
    { t: 'Burn tray six. I\'ll sit the night watch on the rest with you.', a: 1, f: 'stood', go: 'iv_3c' },
    { t: 'Your call. I only write it down.', a: 0, go: 'iv_3c' }
  ] };

  N.iv_3b = { ch: 3, bg: 'green', lines: [
    ['', 'Half rations. Ninety-one days. The ring gets thin and loud about it.'],
    ['Ration Chief', 'Quill, the board wants the bay converted to algae vats by Friday.'],
    ['Ivane', 'The wild stock takes on day ninety-four. I have the curve. I have three days of nothing to survive.']
  ], choices: [
    { t: 'I\'ll take the board. You take the seedlings.', a: 2, f: 'stood', go: 'iv_3c' },
    { t: 'Show them the curve. I\'ll certify every number.', a: 1, f: 'stood', go: 'iv_3c' },
    { t: 'Algae isn\'t the worst outcome.', a: 0, go: 'iv_3c' }
  ] };

  N.iv_3c = { ch: 3, bg: 'green', lines: [
    ['', 'Day ninety-four. The trays come up gold.'],
    ['Ivane', 'It worked. It — hold on. I need a second. I\'ve had this face ready for three years.'],
    ['Ivane', 'I don\'t know how to want anything that isn\'t a plant. I might be bad at it.']
  ], choices: [
    { t: 'Want me the way you want spring. I\'ll keep coming back.', a: 2, go: 'iv_3d' },
    { t: 'You\'re not bad at it. You\'re early in the season.', a: 1, go: 'iv_3d' },
    { t: 'Then stick to plants. Safer harvest.', a: 0, go: 'iv_3d' }
  ] };

  N.iv_3d = { ch: 3, bg: 'green', lines: [
    ['Ivane', 'One more pass. The first flowers of a good crop get done by hand, always.'],
    ['', 'Their hand over yours on the brush. On the beat.']
  ], rhythm: { name: 'FIRST BLOOM' }, end: 'ivane' };

  /* ---------------- CASS — Courier Pilot ---------------- */

  N.cass_1 = { ch: 1, bg: 'dock', lines: [
    ['', 'Bay four. A courier hull ticking as it cools, still too hot to touch.'],
    ['Cass', 'You\'re the new archivist. You\'re about to tell me my flight log is incomplete.'],
    ['You', 'Your flight log is a haiku with a fuel figure in it.'],
    ['Cass', 'Thank you. Nobody appreciates the economy.']
  ], choices: [
    { t: 'File it properly or I file it as missing.', a: 2, f: 'straight', go: 'cass_1b' },
    { t: 'Dictate it. I type fast and I\'m generous.', a: 1, f: 'flirt', go: 'cass_1b' },
    { t: 'Say nothing. Log the discrepancy.', a: 0, f: 'quiet', go: 'cass_1b' }
  ] };

  N.cass_1b = { ch: 1, bg: 'dock', lines: [
    ['Cass', 'Straight at me. Okay. I like knowing where the wall is.', 'straight'],
    ['Cass', 'Generous archivist. Dangerous combination. Sit down, this one\'s a story.', 'flirt'],
    ['Cass', 'Silent type. You\'ll write me down exactly and I\'ll deserve it.', 'quiet'],
    ['Cass', 'Truth is I shaved the burn to make a medical delivery window. Central would ground me for a month.'],
    ['You', 'And the haiku hides it.'],
    ['Cass', 'The haiku is art. Come here — you want to see how a hot dock actually works? Three burns, on my count.']
  ], rhythm: { name: 'DOCKING BURN' }, go: 'cass_2' };

  N.cass_2 = { ch: 2, bg: 'dock', lines: [
    ['', 'You start timing your shifts to bay four. You are aware this is a choice.'],
    ['Cass', 'Central offered me the outer circuit. Eighteen months, no station longer than a day.'],
    ['Cass', 'It\'s the best route anyone\'s ever put in front of me.'],
    ['Cass', 'And I brought it to you first, which — I\'ve been trying not to think about, honestly.']
  ], choices: [
    { t: 'Take it. I\'ll archive every log you send.', a: 1, f: 'go', go: 'cass_2b' },
    { t: 'Turn it down. Fly the Vireo loop. Stay reachable.', a: 1, f: 'stay', go: 'cass_2b' }
  ] };

  N.cass_2b = { ch: 2, bg: 'dock', lines: [
    ['Cass', 'You\'re not going to ask me to stay. Huh. That\'s worse, somehow. That\'s so much worse.', 'go'],
    ['You', 'I\'m asking you to come back. Different request. Better odds.', 'go'],
    ['Cass', 'You want me kept. Everybody eventually wants me kept.', 'stay'],
    ['You', 'I want you reachable. There\'s a difference and you know it.', 'stay'],
    ['Cass', 'Observation gallery. Ten minutes. Bring the bad station coffee.']
  ], go: 'cass_2c' };

  N.cass_2c = { ch: 2, bg: 'obs', lines: [
    ['', 'The window. Cass doesn\'t look at the stars; she looks at the traffic lanes between them.'],
    ['Cass', 'I\'ve never had a home port. I\'ve had bays I liked.'],
    ['Cass', 'Vireo is a bay I like. That\'s the most romantic sentence I own, and I hate it.']
  ], choices: [
    { t: 'Then let me write you a better one.', a: 2, go: 'cass_2d' },
    { t: 'A bay you like is a start. I\'ll take a start.', a: 1, go: 'cass_2d' },
    { t: 'Keep it. It suits you.', a: 0, go: 'cass_2d' }
  ] };

  N.cass_2d = { ch: 2, bg: 'obs', lines: [
    ['Cass', 'Approach rhythm. Three corrections, evenly spaced, or you kiss the collar ring at speed.'],
    ['Cass', 'Hands here. Feel the count.']
  ], rhythm: { name: 'APPROACH TRIM' }, branch: { go: 'cass_3a', stay: 'cass_3b' } };

  N.cass_3a = { ch: 3, bg: 'obs', lines: [
    ['', 'She takes the circuit. Vireo gets quieter in a way you can measure.'],
    ['', 'Her logs arrive weekly. They are, for the first time in her career, complete.'],
    ['Cass', '(log 31) Refuelled at Marrow Point. Nothing here. Filed early so it reaches you Thursday.'],
    ['', 'Month eleven, a log arrives with a course amendment attached and no explanation.']
  ], choices: [
    { t: 'Approve the amendment. It bends her route through Vireo.', a: 2, f: 'stood', go: 'cass_3c' },
    { t: 'Log it as filed and wait for her to say it out loud.', a: 1, f: 'stood', go: 'cass_3c' },
    { t: 'Flag it to Central as a deviation.', a: 0, go: 'cass_3c' }
  ] };

  N.cass_3b = { ch: 3, bg: 'dock', lines: [
    ['', 'She flies the Vireo loop. Short hops. Home every ninth night.'],
    ['', 'By month four she is bored in a way that shows up in her landings.'],
    ['Cass', 'I turned down eighteen months of sky for a milk run and I said it was my idea.'],
    ['Cass', 'I\'m not blaming you. I\'m blaming me for being this easy to keep.']
  ], choices: [
    { t: 'Then take the sky. I\'ll still be the port you file to.', a: 2, f: 'stood', go: 'cass_3c' },
    { t: 'Fly the outer runs. Come back loud. I\'ll be here.', a: 1, f: 'stood', go: 'cass_3c' },
    { t: 'You chose it. Live with the manifest.', a: 0, go: 'cass_3c' }
  ] };

  N.cass_3c = { ch: 3, bg: 'dock', lines: [
    ['', 'Bay four, 0400 station time. The hull ticking as it cools.'],
    ['Cass', 'I filed something. Central signed it before they read it, which is the only way I get anything.'],
    ['Cass', 'There\'s a second crew line on the manifest. It\'s blank. It\'s been blank for a month.']
  ], choices: [
    { t: 'Give me the stylus.', a: 2, go: 'cass_3d' },
    { t: 'Ask me properly and I\'ll think about it.', a: 1, go: 'cass_3d' },
    { t: 'The archive doesn\'t travel.', a: 0, go: 'cass_3d' }
  ] };

  N.cass_3d = { ch: 3, bg: 'dock', lines: [
    ['Cass', 'Pre-burn checks. Three of them. You call the count this time.'],
    ['', 'She hands you the stylus, and then the console.']
  ], rhythm: { name: 'LAUNCH COUNT' }, end: 'cass' };

  g.OH_DATA = { ROUTES: ROUTES, ENDINGS: ENDINGS, NODES: N, TIERS: [14, 11] };
})(window);
