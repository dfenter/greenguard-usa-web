# Molehunt Manor
Ten staff work a 16-room manor; two are moles who fake tasks and sabotage. Six rounds.
Each round: tap 2 rooms to watch them live, tap 2 staff for a statement, read the TASK LOG, then ACCUSE or END ROUND.
Watching a room proves who is really there: anyone the log posted elsewhere, or faking their work, is a mole — the honest are cleared.
Catch both moles to win; if either survives round 6 the sabotage lands. Wrong accusation clears that person and burns the round.
Keyboard: arrows move focus, Enter selects, Esc closes. Portrait only; best round-count and last cases are saved locally.

## AAA rebuild

### implemented

- Rebuilt the prototype as a Phaser 3 portrait title using `/play/_shared/phaser.min.js` and GGKit for lifecycle, pause, input identity, saves, audio buses, settings, juice, and PWA registration.
- Added a readable 16-room manor map with four authored wings, room links, sightlines, guest silhouettes, colour identities, task markers, movement, sabotage, bodies, health, score, particles, screen shake, hit-stop, reduced-motion gating, two music stems, and ten MP3 SFX.
- Replaced scripted deduction with time-stamped guest memories, automatic notebook sightings, honest knowledge-based claims, mole-only lies, witness-consistent alibis, selectable meeting claims, raw evidence cross-reference, personality-weighted AI votes, detective alignment knowledge, saboteur extra sabotage, and mimic claim copying that cannot make an honest guest lie.
- Added a 12-case campaign with escalating guest and mole counts, Free Play rule configuration, Mole Side play, result records, deduction accuracy, unlocked role persistence, and guest dossiers through validated GGKit save data.
- Added the `window.__mm` probe surface with `state.mode`, `progress`, `score`, `health`, `stage`, `forceMode`, `forceStage`, and actions for starting, observing, opening a meeting, selecting a claim, and voting.
- Added PWA manifest, procedural original PNG marks, a complete service-worker precache, and file-level provenance in `LICENSES.md` with the required `play/_assets/LEDGER.md` citation.

### content tables

- Campaign cases: 12 authored entries from 6 guests and 1 mole through 8 guests and 2 moles.
- Wings: Grand Hall, Glasshouse, Servants Warren, and Clocktower, each with four rooms and a distinct lighting palette.
- Roles: detective, saboteur, and mimic, introduced across the campaign and available in Free Play.
- Guests: Ada Vell, Bram Otis, Cleo Nash, Dorian Pike, Esme Rook, Fitz Malloy, Greta Solm, and Hale Brint, each with a distinct silhouette, colour, logic, memory, and boldness profile.
- Tasks: the prototype's 16-room task vocabulary carried into the authored room grid; fake task observations remain mole-only evidence.

### deferred

- Live in-app browser verification and the pinned private-port boot check could not run in this environment: no browser connector was available and the sandbox denied binding port 47863. Node syntax checks, asset/precache checks, and a Phaser/GGKit VM smoke harness did run, including the `window.__mm` mechanic path through observation, meeting, claim selection, and vote.
- No frame-rate or feel numbers were recorded because the wave box is contended and has no valid GPU timing authority.
