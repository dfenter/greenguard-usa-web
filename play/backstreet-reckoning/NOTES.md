# Backstreet Reckoning

Controls (landscape): drag anywhere on the left half for a floating 8-way stick that walks across 3 depth lanes; PUNCH and JUMP buttons bottom-right. Keyboard: WASD/arrows to move, J punch, K/Space jump, Enter restart.
Punch a downed foe to grab it, then swipe (or tap PUNCH) to throw; walk onto a pipe or crate and tap PUNCH to pick it up. Punch in mid-air for a knockdown kick, and smash bins/barrels for health.
Loop: each seeded stage is 3 procedural street blocks plus a boss alley. The camera locks while a gang wave is on screen; clear it and "GO →" opens the next stretch. Attacks are lane-honest, so line up your depth lane before swinging.
Fail/win: a KO costs one of 3 lives; beating the alley boss seeds the next, harder stage. Score and best score (localStorage key `br_best`) persist.
Tech: plain canvas + vanilla JS, no build step, no network, no external assets; WebAudio synth only.
