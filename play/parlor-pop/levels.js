/* Parlor Pop authored content. All level IDs are stable save/debug keys. */
(function (root) {
  'use strict';

  function collect(color, n) { return { type: 'collect', color: color, n: n }; }
  function plates() { return { type: 'plates', n: 0 }; }
  function keys(n) { return { type: 'keys', n: n }; }

  var ROOMS = [
    {
      id: 'entry', name: 'Entry Parlor', subtitle: 'Dust, drapes, first light',
      accent: 0xF25C68, wall: 0x5A3E53, floor: 0x9B6A4B,
      grammar: 'Colour collect and neighbor breaks',
      reveal: 'The front parlor catches the morning light.',
      slots: [
        { name: 'Hearth', cost: 2, options: ['Rose Mantel', 'Brass Stove'] },
        { name: 'Seating', cost: 3, options: ['Velvet Settee', 'Twin Wing Chairs'] },
        { name: 'Light', cost: 3, options: ['Amber Sconces', 'Glass Pendant'] }
      ]
    },
    {
      id: 'dining', name: 'Plated Dining Hall', subtitle: 'Enamel, brass, polished oak',
      accent: 0xF7C948, wall: 0x3E4F66, floor: 0x81563F,
      grammar: 'Crack plates, then drop keys',
      reveal: 'A long table gleams beneath the restored chandelier.',
      slots: [
        { name: 'Table', cost: 3, options: ['Walnut Table', 'Painted Table'] },
        { name: 'China', cost: 4, options: ['Blue Service', 'Sun Service'] },
        { name: 'Chandelier', cost: 4, options: ['Brass Branches', 'Opal Halo'] }
      ]
    },
    {
      id: 'conservatory', name: 'Ivy Conservatory', subtitle: 'Glass, leaves, growing paths',
      accent: 0x5BCB77, wall: 0x2E554B, floor: 0x687351,
      grammar: 'Prune ivy while keys find the floor',
      reveal: 'The conservatory breathes again, green against the glass.',
      slots: [
        { name: 'Planter', cost: 4, options: ['Fern Bank', 'Citrus Pots'] },
        { name: 'Water', cost: 5, options: ['Tiled Basin', 'Small Fountain'] },
        { name: 'Roof', cost: 5, options: ['Glass Vault', 'Louvered Shade'] }
      ]
    },
    {
      id: 'grand', name: 'Grand Hall', subtitle: 'Every hazard, one opening night',
      accent: 0x9A7CF3, wall: 0x3F385D, floor: 0x755044,
      grammar: 'Colour, plates, keys, crates and ivy',
      reveal: 'The grand hall opens for the first full-house celebration.',
      slots: [
        { name: 'Gallery', cost: 5, options: ['Portrait Rail', 'Mirror Rail'] },
        { name: 'Stair', cost: 6, options: ['Red Runner', 'Blue Runner'] },
        { name: 'Centerpiece', cost: 6, options: ['Brass Globe', 'Violet Bouquet'] }
      ]
    }
  ];

  var LEVELS = [
    { id: 'entry-01', room: 0, name: 'Open the Drapes', seed: 11031, colors: 6, moves: 30,
      goals: [collect(0, 20)], crates: 0, ivy: 0, plates: 0, dbl: 0, keys: 0, bonuses: { extra: 2, bomb: 1 } },
    { id: 'entry-02', room: 0, name: 'Rose and Sun', seed: 11047, colors: 6, moves: 34,
      goals: [collect(0, 18), collect(1, 18)], crates: 2, ivy: 0, plates: 0, dbl: 0, keys: 0, bonuses: { extra: 2, bomb: 1 } },
    { id: 'entry-03', room: 0, name: 'Loose Rosettes', seed: 11063, colors: 6, moves: 35,
      goals: [collect(2, 22)], crates: 5, ivy: 0, plates: 0, dbl: 0, keys: 0, bonuses: { extra: 2, bomb: 1 } },
    { id: 'entry-04', room: 0, name: 'A Clear Path', seed: 11079, colors: 6, moves: 38,
      goals: [collect(3, 20), collect(4, 16)], crates: 4, ivy: 2, plates: 0, dbl: 0, keys: 0, bonuses: { extra: 2, bomb: 2 } },
    { id: 'entry-05', room: 0, name: 'First Spark', seed: 11095, colors: 6, moves: 40,
      goals: [collect(5, 22)], crates: 4, ivy: 3, plates: 0, dbl: 0, keys: 0, bonuses: { extra: 3, bomb: 1 } },
    { id: 'entry-06', room: 0, name: 'Welcome Home', seed: 11111, colors: 6, moves: 44,
      goals: [collect(0, 16), collect(2, 16), collect(5, 16)], crates: 5, ivy: 3, plates: 0, dbl: 0, keys: 0, bonuses: { extra: 3, bomb: 2 } },

    { id: 'dining-01', room: 1, name: 'Cracked Enamel', seed: 22031, colors: 6, moves: 38,
      goals: [plates()], crates: 2, ivy: 0, plates: 10, dbl: 2, keys: 0, bonuses: { extra: 2, bomb: 1 } },
    { id: 'dining-02', room: 1, name: 'Service Lift', seed: 22047, colors: 6, moves: 42,
      goals: [plates(), keys(1)], crates: 3, ivy: 0, plates: 10, dbl: 2, keys: 1, bonuses: { extra: 3, bomb: 1 } },
    { id: 'dining-03', room: 1, name: 'The Long Table', seed: 22063, colors: 6, moves: 44,
      goals: [collect(1, 20), plates()], crates: 4, ivy: 1, plates: 12, dbl: 3, keys: 0, bonuses: { extra: 3, bomb: 2 } },
    { id: 'dining-04', room: 1, name: 'Brass Keyway', seed: 22079, colors: 7, moves: 71,
      goals: [keys(2)], crates: 5, ivy: 1, plates: 0, dbl: 0, keys: 2, bonuses: { extra: 3, bomb: 2 } },
    { id: 'dining-05', room: 1, name: 'Polish the Floor', seed: 22095, colors: 7, moves: 50,
      goals: [plates(), collect(3, 18)], crates: 5, ivy: 2, plates: 14, dbl: 4, keys: 0, bonuses: { extra: 3, bomb: 2 } },
    { id: 'dining-06', room: 1, name: 'Dinner Is Served', seed: 22111, colors: 7, moves: 72,
      goals: [plates(), keys(1)], crates: 4, ivy: 1, plates: 10, dbl: 2, keys: 1, bonuses: { extra: 4, bomb: 2 } },

    { id: 'conservatory-01', room: 2, name: 'First Tendrils', seed: 33031, colors: 7, moves: 42,
      goals: [collect(2, 22)], crates: 1, ivy: 5, plates: 0, dbl: 0, keys: 0, bonuses: { extra: 3, bomb: 1 } },
    { id: 'conservatory-02', room: 2, name: 'Glasshouse Key', seed: 33047, colors: 7, moves: 51,
      goals: [keys(1), collect(4, 18)], crates: 3, ivy: 5, plates: 0, dbl: 0, keys: 1, bonuses: { extra: 3, bomb: 2 } },
    { id: 'conservatory-03', room: 2, name: 'Prune and Drop', seed: 33063, colors: 7, moves: 51,
      goals: [collect(0, 18), keys(2)], crates: 3, ivy: 7, plates: 0, dbl: 0, keys: 2, bonuses: { extra: 4, bomb: 2 } },
    { id: 'conservatory-04', room: 2, name: 'Moss on Tile', seed: 33079, colors: 7, moves: 52,
      goals: [plates(), collect(5, 18)], crates: 4, ivy: 7, plates: 10, dbl: 2, keys: 0, bonuses: { extra: 4, bomb: 2 } },
    { id: 'conservatory-05', room: 2, name: 'Sun Through Leaves', seed: 33095, colors: 7, moves: 73,
      goals: [collect(1, 14), keys(1)], crates: 4, ivy: 7, plates: 0, dbl: 0, keys: 1, bonuses: { extra: 4, bomb: 3 } },
    { id: 'conservatory-06', room: 2, name: 'The Living Room', seed: 33111, colors: 7, moves: 73,
      goals: [collect(2, 12), plates(), keys(1)], crates: 4, ivy: 7, plates: 6, dbl: 1, keys: 1, bonuses: { extra: 4, bomb: 3 } },

    { id: 'grand-01', room: 3, name: 'Velvet Threshold', seed: 44031, colors: 7, moves: 48,
      goals: [collect(0, 20), plates()], crates: 4, ivy: 3, plates: 10, dbl: 2, keys: 0, bonuses: { extra: 3, bomb: 2 } },
    { id: 'grand-02', room: 3, name: 'Three Flights', seed: 44047, colors: 7, moves: 73,
      goals: [keys(1), collect(4, 14)], crates: 5, ivy: 4, plates: 0, dbl: 0, keys: 1, bonuses: { extra: 4, bomb: 2 } },
    { id: 'grand-03', room: 3, name: 'Ivy Under Glass', seed: 44063, colors: 7, moves: 74,
      goals: [plates(), keys(1)], crates: 4, ivy: 6, plates: 6, dbl: 1, keys: 1, bonuses: { extra: 4, bomb: 3 } },
    { id: 'grand-04', room: 3, name: 'Gallery Lights', seed: 44079, colors: 7, moves: 58,
      goals: [collect(1, 20), collect(5, 18), plates()], crates: 5, ivy: 6, plates: 12, dbl: 3, keys: 0, bonuses: { extra: 4, bomb: 3 } },
    { id: 'grand-05', room: 3, name: 'Opening Night', seed: 44095, colors: 7, moves: 69,
      goals: [collect(2, 16), plates(), keys(1)], crates: 6, ivy: 7, plates: 14, dbl: 4, keys: 1, bonuses: { extra: 5, bomb: 3 } },
    { id: 'grand-06', room: 3, name: 'The Grand Reopening', seed: 44111, colors: 7, moves: 72,
      goals: [collect(0, 18), plates(), keys(2)], crates: 6, ivy: 8, plates: 16, dbl: 5, keys: 2, bonuses: { extra: 5, bomb: 4 } }
  ];

  root.PP = root.PP || {};
  root.PP.rooms = ROOMS;
  root.PP.levels = LEVELS;
  root.PP.daily = {
    id: 'daily-parlor', room: 1, name: 'Daily Salon', seed: 99117, colors: 7, moves: 48,
    goals: [collect(3, 20), plates()], crates: 4, ivy: 2, plates: 10, dbl: 2, keys: 0,
    bonuses: { extra: 4, bomb: 2 }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = { rooms: ROOMS, levels: LEVELS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
