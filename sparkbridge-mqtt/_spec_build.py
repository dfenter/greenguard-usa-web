#!/usr/bin/env python3
"""Generate spec.html from the normative SB-MQTT5 spec in the SparkBridge repo.

Unlike the eight hand-maintained pages, spec.html IS generated: the spec's normative
text lives in the repo (docs/SB-MQTT5-SPEC.md) and the page must never drift from it.
Re-run this after any spec revision:  python3 _spec_build.py
"""
import html
import re
from pathlib import Path

import markdown

SRC = Path("/Users/lucille/Github/SparkBridge/docs/SB-MQTT5-SPEC.md")
OUT = Path(__file__).parent / "spec.html"
BASE = "/sparkbridge-mqtt/"

md = SRC.read_text()

# Body starts after the H1 + status paragraph block; the page supplies its own masthead.
body_md = md.split("RFC 2119 keywords (MUST/SHOULD/MAY) apply.", 1)[1]

frag = markdown.markdown(body_md, extensions=["tables"])

# RFC-2119 keyword chips, outside code/pre only.
def chip_keywords(html_text):
    parts = re.split(r"(<(?:code|pre)[^>]*>.*?</(?:code|pre)>)", html_text, flags=re.S)
    out = []
    for i, part in enumerate(parts):
        if i % 2 == 0:
            part = re.sub(r"\b(MUST NOT|SHALL NOT|MUST|SHALL|SHOULD NOT|SHOULD|MAY)\b",
                          r'<span class="rfc">\1</span>', part)
        out.append(part)
    return "".join(out)

frag = chip_keywords(frag)

# Heading ids + TOC from h2s.
toc = []
def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")

def add_ids(m):
    tag, inner = m.group(1), m.group(2)
    plain = re.sub(r"<[^>]+>", "", inner)
    sid = slugify(plain)
    if tag == "h2":
        toc.append((sid, plain))
    return f'<{tag} id="{sid}">{inner}</{tag}>'

frag = re.sub(r"<(h2|h3)>(.*?)</\1>", add_ids, frag, flags=re.S)

toc_html = "\n".join(
    f'      <a href="#{sid}">{html.escape(label)}</a>' for sid, label in toc)

NAV_ITEMS = [
    ("index", "Overview", ""), ("modules", "Modules", "modules"),
    ("technology", "Technology", "technology"), ("use-cases", "Use cases", "use-cases"),
    ("compare", "Compare", "compare"), ("pricing", "Pricing", "pricing"),
    ("resources", "Resources", "resources"), ("spec", "Spec", "spec"),
    ("contact", "Contact", "contact"),
]
nav = "\n".join(
    '        <a href="{h}"{c}>{l}</a>'.format(
        h=BASE + p if p else BASE,
        c=' aria-current="page"' if s == "spec" else "", l=l)
    for s, l, p in NAV_ITEMS)

page = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SB-MQTT5 Specification | SparkBridge</title>
<meta name="description" content="SparkBridge MQTT5 (SB-MQTT5), Version 1.0 Revision D: the normative profile for how SparkBridge uses MQTT 5.0 under Sparkplug 3.0, with strict, resilient-edge and coordinated-host conformance classes.">
<link rel="canonical" href="https://new.greenguard-usa.com/sparkbridge-mqtt/spec">
<meta property="og:title" content="SB-MQTT5: the SparkBridge MQTT5 profile specification">
<meta property="og:description" content="A normative profile over OASIS MQTT 5.0 and Eclipse Sparkplug 3.0: session modes, message classes, flow control, shared subscriptions, and conformance gates.">
<meta property="og:type" content="article">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/sparkbridge-mqtt/sb.css">
</head>
<body>

<div class="topicbar">
  <div class="wrap">
    <a class="skip" href="#main">Skip to content</a>
    <a class="brand" href="/sparkbridge-mqtt/">Spark<span>Bridge</span></a>
    <nav class="nav" id="nav" aria-label="Main">
{nav}
    </nav>
    <button class="navtoggle" id="navtoggle" aria-expanded="false" aria-controls="nav">Menu</button>
  </div>
</div>

<header class="phead spec-mast">
  <div class="wrap">
    <div class="eyebrow">Specification</div>
    <h1>SparkBridge MQTT5</h1>
    <dl class="mast mono">
      <div><dt>Short id</dt><dd>SB-MQTT5</dd></div>
      <div><dt>Version</dt><dd>1.0, Revision D</dd></div>
      <div><dt>Status</dt><dd class="normative">NORMATIVE</dd></div>
      <div><dt>Keywords</dt><dd>RFC 2119</dd></div>
    </dl>
    <p>A profile over existing standards, not a new wire protocol: every requirement is
    expressible with a conformant OASIS MQTT 5.0 client and broker, and strict mode remains
    Sparkplug 3.0 conformant. This page renders the complete normative text; the file of
    record ships with the source as <span class="mono">docs/SB-MQTT5-SPEC.md</span>.</p>
  </div>
</header>

<main id="main">
<section class="band">
  <div class="wrap">
    <h2 class="bandtitle">Three conformance classes, one degradation rule</h2>
    <p class="bandlede">An implementation claims one or more classes. R and C extend S and
    <span class="rfc">MUST</span> degrade to S by configuration alone: no code change, and no
    redeploy of peers.</p>
    <div class="classcards">
      <article class="ccard s">
        <div class="ctag mono">Class S</div>
        <h3>Strict</h3>
        <p>Sparkplug 3.0 wire semantics on protocol 3 or 5. The TCK-eligible class, and the
        default: Clean Start 1, Session Expiry 0, Will Delay 0.</p>
      </article>
      <article class="ccard r">
        <div class="ctag mono">Class R</div>
        <h3>Resilient Edge</h3>
        <p>Flap-immune Wills, session-resume NDEATH suppression, and data expiry for edges on
        unreliable links. Protocol 5 only; edge transports only.</p>
      </article>
      <article class="ccard c">
        <div class="ctag mono">Class C</div>
        <h3>Coordinated Host</h3>
        <p>Shared-subscription consumer groups feeding one host-side projection, for fan-in
        beyond a single consumer. Protocol 5 only; disabled for TCK runs.</p>
      </article>
    </div>
  </div>
</section>

<section class="band alt">
  <div class="wrap specgrid">
    <nav class="spectoc mono" aria-label="Specification contents">
      <div class="toct">Contents</div>
{toc_html}
    </nav>
    <article class="specdoc">
{frag}
    </article>
  </div>
</section>
</main>

<footer>
  <div class="wrap">
    <span class="mono">SparkBridge · Sparkplug B / 3.0 · MQTT 3.1.1 and MQTT 5 · Ignition 8.1.19+</span>
    <span class="mono"><a href="/sparkbridge-mqtt/pricing">Pricing</a> · <a href="/sparkbridge-mqtt/contact">Contact</a></span>
  </div>
</footer>

<script defer src="/sparkbridge-mqtt/sb-chat.js"></script>
<script>
(function(){{
  var t=document.getElementById('navtoggle'), n=document.getElementById('nav');
  if(t&&n){{t.addEventListener('click',function(){{
    var open=n.classList.toggle('open');
    t.setAttribute('aria-expanded',open?'true':'false');
  }});}}
}})();
</script>
</body>
</html>
'''

OUT.write_text(page)
print(f"wrote {OUT} ({len(page)} bytes), {len(toc)} TOC entries")
