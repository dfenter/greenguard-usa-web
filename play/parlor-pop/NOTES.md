# Parlor Pop

Controls: swipe (or tap tile, then tap a neighbour) to swap. Arrow keys move the cursor, Enter selects/swaps, Esc backs out, 1/2/3 arm a booster, R restarts.
Loop: match 3+ tiles to hit each level's goals (collect a colour, smash plated floor, drop keys to the floor) before the moves run out. Crates and ivy break when a match lands beside them; ivy spreads if you ignore it.
Out of moves = instant retry, no lives and no waiting. Stars from finishing with moves to spare fund three restored parlor rooms; each slot offers two furnishings and the choice persists.
Boosters (hammer / row rocket / shuffle) are earned only by 3-star finishes and never cost money; every level is clearable without them.
Build check: `node verify.js` replays each level 200x with a greedy solver; `--fix` raises move budgets until all clear >=90%.
