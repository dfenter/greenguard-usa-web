# Shout It! - asset licenses

Engine and kit files live in `/play/_shared/` and are covered by
`/play/_shared/LICENSES.md` (Phaser 3.87 MIT, ggkit.js original work).

All game text, phrase decks, team names, layout, code, icons, the mascot and
every drawn surface are original work for GreenGuard Studio. No licensed or
trademarked catchphrases, titles, brands or characters appear anywhere in
this title.

## Images

None ship. As of fix round 1 this title has **no bitmap game art at all**:
every card face, card back, deck motif, panel, button, mascot and particle
primitive is drawn procedurally into the Phaser texture manager at boot by
`game.js`. The previously shipped Kenney particle PNGs were removed with the
FX rebuild and no longer appear in the payload.

`icon.png` and `icon512.png` are original artwork generated for this title
and are used only as PWA / home-screen icons.

## Audio - assets/audio/

Every file below traces to a pack row in `/play/_assets/LEDGER.md`. Harvest
archive: `/Users/lucille/worker-archive/studio-assets/`.

All shipped audio is mono mp3, transcoded with
`ffmpeg -i IN -ac 1 -c:a libmp3lame -b:a <rate> OUT.mp3` per the audio format
law. No other container or codec ships in this title.

| File | Source pack | Original file | License |
|---|---|---|---|
| music_lobby.mp3 | music harvest (web2d/music) | "Free Fall" by tad, opengameart.org/content/free-fall, first 44 s, 56 kbps | CC0 |
| music_round.mp3 | music harvest (web2d/music) | "Analog Beats (looped)" by ogelgames, opengameart.org/content/analog-beats-looped, 64 kbps | CC0 |
| sfx_tap.mp3 | Kenney interface-sounds | click_002 | CC0 |
| sfx_select.mp3 | Kenney interface-sounds | select_006 | CC0 |
| sfx_back.mp3 | Kenney interface-sounds | back_002 | CC0 |
| sfx_pass.mp3 | Kenney interface-sounds | minimize_006 | CC0 |
| sfx_tick.mp3 | Kenney interface-sounds | tick_001 | CC0 |
| sfx_tick_hi.mp3 | Kenney interface-sounds | tick_004 | CC0 |
| sfx_buzzer.mp3 | Kenney interface-sounds | error_008 | CC0 |
| sfx_handoff.mp3 | Kenney interface-sounds | maximize_006 | CC0 |
| sfx_got.mp3 | Kenney music-jingles | Pizzicato jingles / jingles_PIZZI09 | CC0 |
| sfx_fanfare.mp3 | Kenney music-jingles | Steel jingles / jingles_STEEL07 | CC0 |
| sfx_win.mp3 | Kenney music-jingles | Sax jingles / jingles_SAX10 | CC0 |
| sfx_card.mp3 | Kenney casino-audio | card-slide-3 | CC0 |
| sfx_shuffle.mp3 | Kenney casino-audio | card-shuffle | CC0 |
| sfx_unlock.mp3 | Kenney digital-audio | powerUp5 | CC0 |
| sfx_countdown.mp3 | Kenney digital-audio | pepSound1 | CC0 |
| sfx_crowd.mp3 | none (original) | synthesised for this title: filtered, doubly tremoloed brown noise, 4.2 s, 40 kbps | original work |

Sources: kenney.nl/assets/interface-sounds, kenney.nl/assets/music-jingles,
kenney.nl/assets/casino-audio, kenney.nl/assets/digital-audio (all CC0);
music tracks CC0 from opengameart.org as listed above. Source packs are
distributed in several container formats; only the mp3 transcodes above ship.

`sfx_crowd.mp3` is the crowd murmur bed. It contains no recorded material,
is generated from noise with ffmpeg filters, and is owned outright.

No CC-BY assets ship in this title, so no in-game credits screen is required.
