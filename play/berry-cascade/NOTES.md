# Berry Cascade

Controls: swipe a berry into a neighbour to swap (tap-tap also works); drag the trail to scroll the map. Keyboard: arrows move the cursor, Enter picks up / swaps, Esc = map, R = restart, M = mute, E = endless.
Loop: 30 hand-seeded groves on a winding trail — hit every goal (score, syrup, acorns) inside the move budget. Match 4 = line berry, L/T = burst gourd, 5 = prism; swap two specials for combos. Out of moves = instant retry.
Earned, not sold: no lives, no energy, no boosters, no currency — every special comes from the board. Levels are validated at generation by random playouts and given more moves until a blind random bot clears them.
Also here: Endless Cascade (score chase, escalating move refills and colour count) and a crown screen for a full trail. Stars, per-grove bests and the endless best persist in localStorage.
Files: index.html + js/core.js (rng, storage, audio, fx) + js/board.js (match-3 engine, level gen, validation) + js/game.js (scenes, render, input).
