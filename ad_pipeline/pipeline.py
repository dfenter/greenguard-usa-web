#!/usr/bin/env python3
"""
GreenGuard USA — 30-second spec ad pipeline.

Usage:
    PEXELS_API_KEY=<key> python3 pipeline.py

Pipeline:
    1.  Generate 3 VO segments via Google Cloud TTS (WaveNet-D)
    2.  Download 5 stock video clips from Pexels (lifestyle shots)
    3.  rsync shell_monolith.stl + render script to worker
    4.  Run Blender headless on worker → 4 product stills (Cycles + OIDN)
    5.  Download CC0 background music
    6.  rsync all assets to worker
    7.  Run ffmpeg on worker:
          • Ken Burns zoompan on 3 product stills → video clips
          • Alpha-composite Monolith PNG onto Shot 7 stock footage
          • Concatenate 8 clips (3 product + 5 stock) → 24s
          • Append 6s branded title card
          • Mix VO at cue points + background music (ducked -20 dB)
          • Burn branded text overlays
          → greenguard_ad_30sec.mp4  (1280×720 H.264 / AAC 192k)
    8.  rsync finished MP4 back to ./output/
"""

import os, sys, json, time, base64, shutil, subprocess
import urllib.request, urllib.error, urllib.parse
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

PEXELS_API_KEY  = os.environ.get("PEXELS_API_KEY", "")
GOOGLE_PROJECT  = "greenguard-usa"
GCLOUD_ACCOUNT  = "admin@greenguard-usa.com"
WORKER          = "gg-wsl"
WORKER_DIR      = "/tmp/gg_ad"
BLENDER         = "~/blender/blender"

WORK_DIR = Path(__file__).parent
ASSETS   = WORK_DIR / "assets"
OUTPUT   = WORK_DIR / "output"
for d in (ASSETS, OUTPUT):
    d.mkdir(exist_ok=True)

# STL files for product renders (shell + internals)
STL_FILES = [
    Path("/Users/lucille/Trap Design/CFD/stl/shell_monolith.stl"),
    Path("/Users/lucille/Trap Design/CFD/stl/internals_monolith.stl"),
]

# ── Shot plan ─────────────────────────────────────────────────────────────────
#
# shots 1,2,5,7,8 → Pexels stock  (people + lifestyle)
# shots 3,4,6     → Blender stills animated with Ken Burns (product only)
# shot 7          → Pexels stock + Blender RGBA overlay (trap in background)
#
# trim = target clip length in seconds

SHOTS = [
    # id          source   pexels_query                              orientation  trim
    ("shot_01",  "pexels", "backyard summer family golden hour",     "landscape",  3),
    ("shot_02",  "pexels", "arm swatting mosquito insect outdoor",   "landscape",  2),
    ("shot_03",  "blender","",                                        "",           3),   # Blender render
    ("shot_04",  "blender","",                                        "",           2),   # Blender render
    ("shot_05",  "pexels", "insect collection specimen trap science","landscape",  2),
    ("shot_06",  "blender","",                                        "",           2),   # Blender render
    ("shot_07",  "pexels", "family relaxing backyard summer evening","landscape",  5),   # + Blender overlay
    ("shot_08",  "pexels", "morning coffee patio garden peaceful",   "landscape",  5),
]

SHOT_TRIM = [s[4] for s in SHOTS]

# Blender render filename per shot
BLENDER_STILLS = {
    "shot_03": "shot03_wide.png",
    "shot_04": "shot04_macro.png",
    "shot_06": "shot06_topdown.png",
}
BLENDER_ALPHA  = "shot07_alpha.png"   # RGBA for compositing into shot_07

# ── VO segments ───────────────────────────────────────────────────────────────

VO_SEGMENTS = [
    {
        "id":       "vo_01",
        "text":     (
            "CO2 traps work by mimicking what mosquitoes hunt for — your breath. "
            "Ours do it all day, every day. No chemicals. No spraying. "
            "Nothing that harms your garden, your pets, or your family."
        ),
        "delay_ms": 8000,
    },
    {
        "id":       "vo_02",
        "text":     (
            "Most customers catch thousands of mosquitoes in the first month. "
            "You won't see them. You'll just notice they're gone."
        ),
        "delay_ms": 14000,
    },
    {
        "id":       "vo_03",
        "text":     "Take back your yard.",
        "delay_ms": 27000,
    },
]

# ── Google Cloud TTS ──────────────────────────────────────────────────────────

def gcloud_token() -> str:
    r = subprocess.run(
        ["gcloud", "auth", "print-access-token", f"--account={GCLOUD_ACCOUNT}"],
        capture_output=True, text=True, check=True,
    )
    return r.stdout.strip()

def generate_tts(seg: dict, token: str) -> Path:
    out = ASSETS / f"{seg['id']}.mp3"
    if out.exists():
        print(f"  [TTS] {seg['id']} cached")
        return out
    payload = json.dumps({
        "input": {"text": seg["text"]},
        "voice": {
            "languageCode": "en-US",
            "name":         "en-US-Wavenet-D",
            "ssmlGender":   "MALE",
        },
        "audioConfig": {
            "audioEncoding": "MP3",
            "speakingRate":  0.90,
            "pitch":         -1.5,
        },
    }).encode()
    req = urllib.request.Request(
        "https://texttospeech.googleapis.com/v1/text:synthesize",
        data=payload,
        headers={
            "Authorization":       f"Bearer {token}",
            "Content-Type":        "application/json",
            "X-Goog-User-Project": GOOGLE_PROJECT,
        },
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    audio = base64.b64decode(data["audioContent"])
    out.write_bytes(audio)
    print(f"  [TTS] {seg['id']}: {len(audio):,} bytes")
    return out

# ── Pexels stock footage ──────────────────────────────────────────────────────

PEXELS_VIDEO_SEARCH = "https://api.pexels.com/videos/search"

def pexels_download(shot_id: str, query: str, orientation: str, min_dur: int) -> Path:
    out = ASSETS / f"{shot_id}.mp4"
    if out.exists():
        print(f"  [Pexels] {shot_id} cached")
        return out
    params = urllib.parse.urlencode({
        "query":       query,
        "orientation": orientation,
        "per_page":    15,
        "size":        "medium",
    })
    req = urllib.request.Request(
        f"{PEXELS_VIDEO_SEARCH}?{params}",
        headers={
            "Authorization": PEXELS_API_KEY,
            "User-Agent":    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    videos = data.get("videos", [])
    if not videos:
        raise RuntimeError(f"No Pexels results for '{query}'")

    dl_url = None
    for vid in videos:
        if vid.get("duration", 0) < min_dur:
            continue
        for vf in sorted(vid.get("video_files", []), key=lambda f: f.get("width", 0), reverse=True):
            if vf.get("file_type") == "video/mp4" and vf.get("width", 0) >= 1280:
                dl_url = vf["link"]
                print(f"  [Pexels] {shot_id}: {vf['width']}×{vf['height']} {vid['duration']}s")
                break
        if dl_url:
            break

    if not dl_url:
        vf = videos[0]["video_files"][0]
        dl_url = vf["link"]
        print(f"  [Pexels] {shot_id}: fallback {vf.get('width')}×{vf.get('height')}")

    req2 = urllib.request.Request(dl_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req2, timeout=120) as resp:
        out.write_bytes(resp.read())
    print(f"  [Pexels] {shot_id}: {out.stat().st_size // 1024:,} KB")
    return out

# ── Background music ──────────────────────────────────────────────────────────

MUSIC_PATH = ASSETS / "bg_music.mp3"

# Try several CC0/CC-BY sources in order
MUSIC_URLS = [
    # Kevin MacLeod — incompetech (CC BY 3.0)
    "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Acoustic%20Breeze.mp3",
    "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Wholesome.mp3",
    # Archive.org mirror of Kevin MacLeod tracks
    "https://archive.org/download/kevin-macleod-incompetech/Acoustic%20Breeze.mp3",
    # freepd.com (CC0)
    "https://freepd.com/music/Acoustic%20Guitar%20Tune.mp3",
]

def download_music() -> Path:
    if MUSIC_PATH.exists():
        print(f"  [Music] cached")
        return MUSIC_PATH
    for url in MUSIC_URLS:
        try:
            print(f"  [Music] trying {url.split('/')[-1]}…")
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = resp.read()
            if len(data) > 50_000:       # must be a real audio file, not an error page
                MUSIC_PATH.write_bytes(data)
                print(f"  [Music] {MUSIC_PATH.stat().st_size // 1024:,} KB — {url.split('/')[-1]}")
                return MUSIC_PATH
        except Exception as e:
            print(f"  [Music] {e}")
    # Last resort: generate a simple ambient pad with ffmpeg synths
    print("  [Music] all URLs failed — generating ambient pad with ffmpeg")
    subprocess.run([
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", (
            "aevalsrc="
            "0.12*sin(2*PI*220*t)*exp(-0.3*mod(t\\,4))"
            "+0.10*sin(2*PI*330*t)*exp(-0.3*mod(t\\,4))"
            "+0.08*sin(2*PI*440*t)*exp(-0.3*mod(t\\,4))"
            "+0.06*sin(2*PI*550*t)*exp(-0.3*mod(t\\,4))"
            ":c=stereo:s=44100"
        ),
        "-t", "32", "-q:a", "4", "-f", "mp3", str(MUSIC_PATH),
    ], check=True, capture_output=True)
    print(f"  [Music] generated — {MUSIC_PATH.stat().st_size // 1024} KB")
    return MUSIC_PATH

# ── Worker helpers ────────────────────────────────────────────────────────────

def worker_run(cmd: str, timeout: int = 1800, print_output: bool = False) -> None:
    if print_output:
        subprocess.run(["ssh", WORKER, cmd], check=True, timeout=timeout)
    else:
        r = subprocess.run(["ssh", WORKER, cmd], capture_output=True, text=True, timeout=timeout)
        if r.returncode != 0:
            print(r.stderr[-2000:])
            raise RuntimeError(f"Worker command failed (rc={r.returncode})")

def worker_rsync(src, dst):
    subprocess.run(["rsync", "-az", "--progress", str(src), f"{WORKER}:{dst}"],
                   check=True)

def worker_rsync_back(src_remote, dst_local):
    subprocess.run(["rsync", "-az", "--progress", f"{WORKER}:{src_remote}", str(dst_local)],
                   check=True)

# ── Blender product renders ───────────────────────────────────────────────────

def run_blender_renders():
    print("  Pre-warming SSH ControlMaster…")
    subprocess.run(["ssh", WORKER, "true"], check=True, timeout=15)

    print("  Creating worker dirs…")
    worker_run(f"mkdir -p {WORKER_DIR}/assets {WORKER_DIR}/renders {WORKER_DIR}/output")

    print("  Uploading STL files…")
    for stl in STL_FILES:
        if stl.exists():
            worker_rsync(str(stl), f"{WORKER_DIR}/assets/")
        else:
            print(f"  WARNING: {stl.name} not found, skipping")

    print("  Uploading Blender render script…")
    render_script = WORK_DIR / "render_product.py"
    worker_rsync(str(render_script), f"{WORKER_DIR}/")

    print("  Running Blender headless renders on worker (this takes ~8–15 min)…")
    blender_cmd = (
        f"{BLENDER} --background "
        f"--python {WORKER_DIR}/render_product.py "
        f"2>&1 | grep -E '(Shot|Rendering|Saved|Error|✓|===)'"
    )
    worker_run(blender_cmd, timeout=1800, print_output=True)

    print("  Downloading product renders…")
    render_names = list(BLENDER_STILLS.values()) + [BLENDER_ALPHA]
    for name in render_names:
        local_path = ASSETS / name
        if not local_path.exists():
            worker_rsync_back(f"{WORKER_DIR}/renders/{name}", str(local_path))
            print(f"  [Blender] {name}: {local_path.stat().st_size // 1024} KB")
        else:
            print(f"  [Blender] {name} cached")

# ── FFmpeg filter complex ─────────────────────────────────────────────────────

def build_filter_complex() -> str:
    """
    Complete filter graph for the 30-second ad.

    Input index map (ffmpeg -i order):
      0   shot_01.mp4       (stock, 3s)
      1   shot_02.mp4       (stock, 2s)
      2   shot03_wide.png   (Blender still → Ken Burns 3s)
      3   shot04_macro.png  (Blender still → Ken Burns 2s)
      4   shot_05.mp4       (stock, 2s)
      5   shot06_topdown.png (Blender still → Ken Burns 2s)
      6   shot_07.mp4       (stock 5s + Monolith alpha composite)
      7   shot07_alpha.png  (Blender RGBA overlay for shot 7)
      8   shot_08.mp4       (stock, 5s)
      9   bg_music.mp3
      10  vo_01.mp3
      11  vo_02.mp3
      12  vo_03.mp3
    """

    font   = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    font_b = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

    p = []

    # ── Stock clips: trim + scale to 1280×720 ────────────────────────────────
    stock_map = {0: 3, 1: 2, 4: 2, 6: 5, 8: 5}   # input index → trim seconds
    for idx, dur in stock_map.items():
        p.append(
            f"[{idx}:v]trim=duration={dur},setpts=PTS-STARTPTS,"
            f"scale=1280:720:force_original_aspect_ratio=decrease,"
            f"pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,"
            f"fps=30[vstk{idx}]"
        )

    # ── Blender stills: Ken Burns zoompan → video clips ──────────────────────
    # shot_03 — 3s wide push: slow zoom in from 1.0→1.08 centered
    p.append(
        "[2:v]scale=1280:720,"
        "zoompan=z='min(zoom+0.0009\\,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        "d=90:s=1280x720:fps=30"
        "[vkb3]"
    )
    # shot_04 — 2s macro: very subtle drift left
    p.append(
        "[3:v]scale=1400:787,"
        "zoompan=z='1.08':x='if(eq(on\\,1)\\,60\\,x-0.5)':y='(ih/zoom/2)':"
        "d=60:s=1280x720:fps=30"
        "[vkb4]"
    )
    # shot_06 — 2s top-down: slow zoom in from 1.0→1.06
    p.append(
        "[5:v]scale=1280:720,"
        "zoompan=z='min(zoom+0.001\\,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        "d=60:s=1280x720:fps=30"
        "[vkb6]"
    )

    # ── Shot 7: composite Blender alpha over Pexels stock ─────────────────────
    # Scale the RGBA Monolith render to ~30% height, place lower-right
    p.append(
        "[7:v]scale=-1:220,format=rgba[valpha]"
    )
    p.append(
        "[vstk6][valpha]overlay=x=W-w-40:y=H-h-40:format=auto[vstk6c]"
    )

    # ── Assemble in timeline order ────────────────────────────────────────────
    # Timeline: [0 3s][1 2s][3 3s][4 2s][5 2s][6 2s][7 5s][8 5s] → 24s
    # Map:       vstk0 vstk1 vkb3  vkb4  vstk4 vkb6  vstk6c vstk8
    p.append(
        "[vstk0][vstk1][vkb3][vkb4][vstk4][vkb6][vstk6c][vstk8]"
        "concat=n=8:v=1:a=0[vcombined]"
    )

    # ── 6-second branded title card ───────────────────────────────────────────
    p.append("color=c=black:size=1280x720:rate=30:duration=6,setsar=1[vtitle]")
    p.append("[vcombined][vtitle]concat=n=2:v=1:a=0[vbase]")

    # ── Text overlays ─────────────────────────────────────────────────────────
    # Shot 3 (t=5–8): product name lower-left
    p.append(
        f"[vbase]"
        f"drawtext=fontfile='{font_b}':text='GreenGuard Monolith':"
        f"fontsize=24:fontcolor=white:"
        f"alpha='if(between(t\\,5\\,8)\\,0.80\\,0)':"
        f"x=48:y=h-64:"
        f"box=1:boxcolor=black@0.40:boxborderw=8"
        f"[vt1]"
    )

    # Shot 7 (t=14–19): benefit lower-third
    p.append(
        f"[vt1]"
        f"drawtext=fontfile='{font}':"
        f"text='No chemicals. No spraying.':"
        f"fontsize=28:fontcolor=white:"
        f"alpha='if(between(t\\,14\\,19)\\,0.85\\,0)':"
        f"x=(w-text_w)/2:y=h-80:"
        f"box=1:boxcolor=black@0.45:boxborderw=10"
        f"[vt2]"
    )

    # Title card — "GreenGuard USA" (t=24–30)
    p.append(
        f"[vt2]"
        f"drawtext=fontfile='{font_b}':"
        f"text='GreenGuard USA':"
        f"fontsize=74:fontcolor=white:"
        f"alpha='if(between(t\\,24\\,30)\\,1\\,0)':"
        f"x=(w-text_w)/2:y=195"
        f"[vt3]"
    )

    # Title card — tagline (t=26–30, fade in after brand)
    p.append(
        f"[vt3]"
        f"drawtext=fontfile='{font}':"
        f"text='Smart.  Safe.  Effective.':"
        f"fontsize=34:fontcolor=0x88DDAA:"
        f"alpha='if(between(t\\,26\\,30)\\,1\\,0)':"
        f"x=(w-text_w)/2:y=312"
        f"[vt4]"
    )

    # Title card — URL (t=26–30)
    p.append(
        f"[vt4]"
        f"drawtext=fontfile='{font}':"
        f"text='greenguard-usa.com':"
        f"fontsize=26:fontcolor=0x888888:"
        f"alpha='if(between(t\\,26\\,30)\\,1\\,0)':"
        f"x=(w-text_w)/2:y=388"
        f"[vfinal]"
    )

    # ── Audio ─────────────────────────────────────────────────────────────────
    for i, seg in enumerate(VO_SEGMENTS):
        d = seg["delay_ms"]
        p.append(f"[{10 + i}:a]adelay={d}|{d}[vod{i}]")

    p.append("[vod0][vod1][vod2]amix=inputs=3:normalize=0[vomix]")
    p.append("[9:a]atrim=duration=30,asetpts=PTS-STARTPTS,volume=-20dB[bgm]")
    p.append("[vomix][bgm]amix=inputs=2:normalize=0[afinal]")

    return ";".join(p)


def build_ffmpeg_cmd(output_path: str) -> list:
    d = f"{WORKER_DIR}/assets"
    r = f"{WORKER_DIR}/renders"

    inputs = [
        "-i", f"{d}/shot_01.mp4",          # 0
        "-i", f"{d}/shot_02.mp4",          # 1
        "-i", f"{r}/shot03_wide.png",      # 2 — Blender still
        "-i", f"{r}/shot04_macro.png",     # 3 — Blender still
        "-i", f"{d}/shot_05.mp4",          # 4
        "-i", f"{r}/shot06_topdown.png",   # 5 — Blender still
        "-i", f"{d}/shot_07.mp4",          # 6
        "-i", f"{r}/shot07_alpha.png",     # 7 — Blender RGBA
        "-i", f"{d}/shot_08.mp4",          # 8
        "-i", f"{d}/bg_music.mp3",         # 9
        "-i", f"{d}/vo_01.mp3",            # 10
        "-i", f"{d}/vo_02.mp3",            # 11
        "-i", f"{d}/vo_03.mp3",            # 12
    ]
    # PNG inputs need explicit loop/framerate
    png_idx = [2, 3, 5, 7]
    inputs_with_png = []
    for i, arg in enumerate(inputs):
        if arg.endswith(".png"):
            idx = inputs.index(arg)
            inputs_with_png += ["-loop", "1", "-framerate", "30"]
        inputs_with_png.append(arg)

    fc = build_filter_complex()

    return (
        ["ffmpeg", "-y"]
        + [
            "-loop", "1", "-framerate", "30", "-i", f"{r}/shot03_wide.png",
            "-loop", "1", "-framerate", "30", "-i", f"{r}/shot04_macro.png",
            "-loop", "1", "-framerate", "30", "-i", f"{r}/shot06_topdown.png",
            "-loop", "1", "-framerate", "30", "-i", f"{r}/shot07_alpha.png",
            "-i", f"{d}/shot_01.mp4",
            "-i", f"{d}/shot_02.mp4",
            "-i", f"{d}/shot_05.mp4",
            "-i", f"{d}/shot_07.mp4",
            "-i", f"{d}/shot_08.mp4",
            "-i", f"{d}/bg_music.mp3",
            "-i", f"{d}/vo_01.mp3",
            "-i", f"{d}/vo_02.mp3",
            "-i", f"{d}/vo_03.mp3",
        ]
        + [
            "-filter_complex", build_filter_complex_reindexed(),
            "-map", "[vfinal]",
            "-map", "[afinal]",
            "-c:v",   "libx264",
            "-preset", "slow",
            "-crf",   "18",
            "-c:a",   "aac",
            "-b:a",   "192k",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-t",     "30",
            output_path,
        ]
    )


def build_filter_complex_reindexed() -> str:
    """
    Filter complex with corrected input indices matching build_ffmpeg_cmd:
      0  shot03_wide.png     (loop PNG)
      1  shot04_macro.png    (loop PNG)
      2  shot06_topdown.png  (loop PNG)
      3  shot07_alpha.png    (loop PNG RGBA)
      4  shot_01.mp4
      5  shot_02.mp4
      6  shot_05.mp4
      7  shot_07.mp4
      8  shot_08.mp4
      9  bg_music.mp3
      10 vo_01.mp3
      11 vo_02.mp3
      12 vo_03.mp3
    """

    font   = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    font_b = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

    p = []

    # ── Stock clips: trim + scale + force SAR 1:1 ────────────────────────────
    # 4=shot_01(3s)  5=shot_02(2s)  6=shot_05(2s)  7=shot_07(5s)  8=shot_08(5s)
    for idx, dur in [(4, 3), (5, 2), (6, 2), (7, 5), (8, 5)]:
        p.append(
            f"[{idx}:v]trim=duration={dur},setpts=PTS-STARTPTS,"
            f"scale=1280:720:force_original_aspect_ratio=decrease,"
            f"pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,"
            f"fps=30,setsar=1[vstk{idx}]"
        )

    # ── Blender stills: zoompan with rounded x/y to eliminate sub-pixel jitter ──
    # round() snaps each frame to integer pixel coords — no accumulation drift.

    # 0=shot03_wide (3s, 90f) — slow zoom in
    p.append(
        "[0:v]scale=1280:720,setsar=1,"
        "zoompan=z='min(zoom+0.0009\\,1.08)':x='round(iw/2-iw/zoom/2)':y='round(ih/2-ih/zoom/2)':"
        "d=90:s=1280x720:fps=30,setsar=1"
        "[vkb0]"
    )
    # 1=shot04_macro (2s, 60f) — slow drift left, rounded
    p.append(
        "[1:v]scale=1400:787,setsar=1,"
        "zoompan=z='1.08':x='round(if(eq(on\\,1)\\,60\\,x-0.5))':y='round(ih/zoom/2)':"
        "d=60:s=1280x720:fps=30,setsar=1"
        "[vkb1]"
    )
    # 2=shot06_topdown (2s, 60f) — slow zoom in, rounded
    p.append(
        "[2:v]scale=1280:720,setsar=1,"
        "zoompan=z='min(zoom+0.001\\,1.06)':x='round(iw/2-iw/zoom/2)':y='round(ih/2-ih/zoom/2)':"
        "d=60:s=1280x720:fps=30,setsar=1"
        "[vkb2]"
    )

    # ── Shot 7: alpha composite ───────────────────────────────────────────────
    # 3=shot07_alpha → scale to ~220px tall, overlay bottom-right of stock shot_07
    # vstk7 already trimmed+scaled+SAR=1 from the loop above; use it directly.
    p.append("[3:v]scale=-1:220:flags=lanczos,setsar=1,format=rgba[valpha]")
    p.append("[vstk7][valpha]overlay=x=W-w-40:y=H-h-40:format=auto,setsar=1[vstk7c]")

    # ── Concat 8 clips in timeline order ─────────────────────────────────────
    # shot_01(4) shot_02(5) shot03_wide(0) shot04_macro(1) shot_05(6) shot06_top(2) shot_07+product(7c) shot_08(8)
    p.append(
        "[vstk4][vstk5][vkb0][vkb1][vstk6][vkb2][vstk7c][vstk8]"
        "concat=n=8:v=1:a=0[vcombined]"
    )

    # ── 6s black title card ───────────────────────────────────────────────────
    p.append("color=c=black:size=1280x720:rate=30:duration=6,setsar=1[vtitle]")
    p.append("[vcombined][vtitle]concat=n=2:v=1:a=0[vbase]")

    # ── Text overlays ─────────────────────────────────────────────────────────
    # t=5–8: product name over Blender shot (shot 3)
    p.append(
        f"[vbase]drawtext=fontfile='{font_b}':"
        f"text='GreenGuard Monolith':"
        f"fontsize=24:fontcolor=white:"
        f"alpha='if(between(t\\,5\\,8)\\,0.80\\,0)':"
        f"x=48:y=h-64:"
        f"box=1:boxcolor=black@0.40:boxborderw=8"
        f"[vt1]"
    )
    # t=14–19: benefit lower-third (over shot 7 — family relaxing)
    p.append(
        f"[vt1]drawtext=fontfile='{font}':"
        f"text='No chemicals. No spraying.':"
        f"fontsize=28:fontcolor=white:"
        f"alpha='if(between(t\\,14\\,19)\\,0.85\\,0)':"
        f"x=(w-text_w)/2:y=h-80:"
        f"box=1:boxcolor=black@0.45:boxborderw=10"
        f"[vt2]"
    )
    # t=24–30: brand name on title card
    p.append(
        f"[vt2]drawtext=fontfile='{font_b}':"
        f"text='GreenGuard USA':"
        f"fontsize=74:fontcolor=white:"
        f"alpha='if(between(t\\,24\\,30)\\,1\\,0)':"
        f"x=(w-text_w)/2:y=195"
        f"[vt3]"
    )
    # t=26–30: tagline
    p.append(
        f"[vt3]drawtext=fontfile='{font}':"
        f"text='Smart.  Safe.  Effective.':"
        f"fontsize=34:fontcolor=0x88DDAA:"
        f"alpha='if(between(t\\,26\\,30)\\,1\\,0)':"
        f"x=(w-text_w)/2:y=312"
        f"[vt4]"
    )
    # t=26–30: URL
    p.append(
        f"[vt4]drawtext=fontfile='{font}':"
        f"text='greenguard-usa.com':"
        f"fontsize=26:fontcolor=0x888888:"
        f"alpha='if(between(t\\,26\\,30)\\,1\\,0)':"
        f"x=(w-text_w)/2:y=388"
        f"[vfinal]"
    )

    # ── Audio: delay + mix ────────────────────────────────────────────────────
    for i, seg in enumerate(VO_SEGMENTS):
        d = seg["delay_ms"]
        p.append(f"[{10 + i}:a]adelay={d}|{d}[vod{i}]")
    p.append("[vod0][vod1][vod2]amix=inputs=3:normalize=0[vomix]")
    p.append("[9:a]atrim=duration=30,asetpts=PTS-STARTPTS,volume=-20dB[bgm]")
    p.append("[vomix][bgm]amix=inputs=2:normalize=0[afinal]")

    return ";".join(p)

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not PEXELS_API_KEY:
        sys.exit("ERROR: PEXELS_API_KEY not set. Get a free key at pexels.com/api")

    print("\n=== GreenGuard USA — 30-second spec ad pipeline ===\n")

    # 1. TTS
    print("Step 1/7 — Generating voiceover (Google TTS WaveNet-D)…")
    token = gcloud_token()
    for seg in VO_SEGMENTS:
        generate_tts(seg, token)

    # 2. Stock footage
    print("\nStep 2/7 — Downloading stock footage (Pexels)…")
    for shot_id, source, query, orientation, trim in SHOTS:
        if source == "pexels":
            pexels_download(shot_id, query, orientation, min_dur=trim)

    # 3. Music
    print("\nStep 3/7 — Background music…")
    download_music()

    # 4. Blender renders
    print("\nStep 4/7 — Blender product renders (runs on worker gg-wsl)…")
    print("  NOTE: ~8–15 minutes for 4 stills at 48 samples + OIDN")
    run_blender_renders()

    # 5. Sync all assets to worker
    print(f"\nStep 5/7 — Syncing all assets to worker ({WORKER})…")
    worker_rsync(str(ASSETS) + "/", f"{WORKER_DIR}/assets/")

    # 6. ffmpeg stitch on worker
    print(f"\nStep 6/7 — ffmpeg stitch on {WORKER}…")
    out_remote = f"{WORKER_DIR}/output/greenguard_ad_30sec.mp4"
    cmd = build_ffmpeg_cmd(out_remote)
    import shlex
    ssh_cmd = " ".join(shlex.quote(a) for a in cmd)
    print(f"  Running ffmpeg ({len(cmd)} args)…")
    worker_run(ssh_cmd, timeout=600, print_output=True)

    # 7. Pull output back
    print(f"\nStep 7/7 — Retrieving finished MP4…")
    local_out = OUTPUT / "greenguard_ad_30sec.mp4"
    worker_rsync_back(out_remote, local_out)

    size_mb = local_out.stat().st_size / 1_048_576
    print(f"\n✓ Done!")
    print(f"  File:     {local_out}")
    print(f"  Size:     {size_mb:.1f} MB")
    print(f"  Duration: 30 seconds")
    print(f"  Format:   1280×720 H.264 / AAC 192k stereo")
    print(f"\n  Shots 3, 4, 6:  Blender Cycles renders of the GreenGuard Monolith")
    print(f"  Shot 7:         Pexels family + Monolith composite (lower-right)")
    print(f"  Shots 1,2,5,8:  Pexels stock lifestyle footage")


if __name__ == "__main__":
    main()
