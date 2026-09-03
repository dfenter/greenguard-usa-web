#!/usr/bin/env python3
"""Generate resources.html from the normative SB-MQTT5 spec in the SparkBridge repo.

resources.html is the only generated page on the site. It carries two things: the
hand-written resources prose (TCK evidence, assurance, standards, documents), which
lives as template text INSIDE this script and must be edited here rather than in the
HTML, and the complete normative SB-MQTT5 text, which is rendered from the repo's
docs/SB-MQTT5-SPEC.md and must never drift from it.

Anything hand-edited in resources.html will be overwritten. Re-run this after any
spec revision, and after any change to the resources copy:  python3 _spec_build.py
"""
import html
import re
from pathlib import Path

import markdown

SRC = Path("/Users/lucille/Github/SparkBridge/docs/SB-MQTT5-SPEC.md")
OUT = Path(__file__).parent / "resources.html"
BASE = "/sparkbridge/"

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
    ("index", "Overview", ""),
    ("edge", "Edge", "edge"),
    ("central", "Host", "central"),
    ("products", "All products", "products"),
    ("pricing", "Pricing", "pricing"),
    ("use-cases", "Use cases", "use-cases"),
    ("architecture", "Architecture", "architecture"),
    ("resources", "Resources", "resources"),
    ("download", "Download", "download"),
    ("docs", "Docs", "docs"),
    ("contact", "Contact", "contact"),
]
nav = "\n".join(
    '        <a href="{h}"{c}>{l}</a>'.format(
        h=BASE + p if p else BASE,
        c=' aria-current="page"' if s == "resources" else "", l=l)
    for s, l, p in NAV_ITEMS)

page = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Evidence and the SB-MQTT5 Specification | SparkBridge</title>
<meta name="description" content="The evidence base for SparkBridge: official TCK conformance results with assertion counts, the engineering assurance record, the standards we implement, and the complete normative SB-MQTT5 profile published in full.">
<link rel="canonical" href="https://mqtt.greenguard-usa.com/sparkbridge/resources">
<meta property="og:title" content="SparkBridge resources: the evidence, and the SB-MQTT5 specification">
<meta property="og:description" content="TCK conformance results with assertion counts, 820 automated tests, the standards we implement, and the complete normative SB-MQTT5 profile over MQTT 5.0 and Sparkplug 3.0.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://mqtt.greenguard-usa.com/sparkbridge/resources">
<meta property="og:site_name" content="SparkBridge">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="SparkBridge resources: the evidence, and the SB-MQTT5 specification">
<meta name="twitter:description" content="TCK conformance results with assertion counts, 820 automated tests, the standards we implement, and the complete normative SB-MQTT5 profile over MQTT 5.0 and Sparkplug 3.0.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Saira+Semi+Condensed:wght@600;700&family=Public+Sans:wght@400;600&family=Spline+Sans+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Saira+Semi+Condensed:wght@600;700&family=Public+Sans:wght@400;600&family=Spline+Sans+Mono:wght@400;500&display=swap" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Saira+Semi+Condensed:wght@600;700&family=Public+Sans:wght@400;600&family=Spline+Sans+Mono:wght@400;500&display=swap"></noscript>
<link rel="stylesheet" href="/sparkbridge/sb.css">
<link rel="stylesheet" href="/sparkbridge/suite.css">
<style>.execsum{{background:rgba(120,200,140,.08);border-left:3px solid #5a8;padding:10px 14px;border-radius:4px;margin:14px 0}}</style>
<script type="application/ld+json">
{{"@context":"https://schema.org","@graph":[{{"@type":"BreadcrumbList","itemListElement":[{{"@type":"ListItem","position":1,"name":"SparkBridge","item":"https://mqtt.greenguard-usa.com/sparkbridge/"}},{{"@type":"ListItem","position":2,"name":"Evidence and the SB-MQTT5 Specification","item":"https://mqtt.greenguard-usa.com/sparkbridge/resources"}}]}}]}}
</script>
</head>
<body>

<div class="topicbar">
  <div class="wrap">
    <a class="skip" href="#main">Skip to content</a>
    <a class="brand" href="/sparkbridge/">Spark<span>Bridge</span></a>
    <nav class="nav" id="nav" aria-label="Main">
{nav}
    </nav>
    <button class="navtoggle" id="navtoggle" aria-expanded="false" aria-controls="nav">Menu</button>
  </div>
</div>

<header class="phead">
  <div class="wrap">
    <div class="eyebrow">Resources</div>
    <h1>The evidence, and the specification</h1>
    <p class="execsum"><b>For your executives:</b> everything claimed on this site has been tested, and the results are published, not just asserted. Below this line is the proof and the specification, written for the team that will verify it.</p>
    <p>Every claim on this site is backed by a test you can run yourself, and the normative profile
    is published in full on this page.</p>
  </div>
</header>

<main id="main">

<section>
  <div class="wrap">
    <div class="sec-head">
      <div class="path">conformance</div>
      <h2>Tested Against the Official Suite</h2>
      <p>The Eclipse Foundation, who publish the Sparkplug specification itself, also publish its
      official examiner: a test kit that watches a product on the wire and fails it for any
      deviation from the standard. Here is what that looked like, in plain terms.</p>
    </div>
    <div class="two">
      <div>
        <h4>What was tested</h4>
        <p>Not a simulation and not a paper claim. A complete live system was stood up, broker,
        host and edge together on a real Ignition gateway, and the official kit connected to it
        like any other participant, watching every message. It then put the system through the
        situations that break integrations in the field: publishing complex equipment models with
        parameters and datasets, receiving and acting on commands, losing the central server
        mid-session, and being forced to walk from one broker to another without losing its
        devices.</p>
        <h4>How it judges</h4>
        <p>The kit reads every byte the modules put on the wire and checks it against the
        specification: message order, sequence numbers, birth and death certificates, retained
        state, timing. There is no partial credit; a single wrong byte or out-of-order message
        fails the scenario.</p>
      </div>
      <div>
        <h4>The result</h4>
        <p>The newest record is the 2026-08-15 seed-240 session against 2.4.0 code: ten runs, zero
        FAIL lines anywhere in the session, 182 EDGE assertions passed and 52 HOST assertions
        passed, with a single MAYBE against an optional SHOULD. The earlier 2026-08-14 record of
        346 assertions executed and 346 passed, zero failed, across every edge profile and the host
        session profile, stands as history. Every run is scripted and repeatable, and the
        nine-profile session is now a single command, so the result can be reproduced on your own
        hardware rather than taken on trust.</p>
        <h4>Where the formal listing stands</h4>
        <p>The engineering is done: the examiner passes, on demand, on your hardware. What remains
        is the administrative half of the Eclipse Foundation listing, which is membership, paperwork
        and a published report, and it is in progress. We say this plainly because the listing is a
        third party's to grant, and you should be able to tell the difference between a vendor who
        has passed the tests and one who says the word certified.</p>
      </div>
    </div>
    <p class="note">The full execution record is published, raw and unedited, at <a href="/sparkbridge/tck">the TCK results page</a>; the whitepaper carries the analysis.</p>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <div class="sec-head">
      <div class="path">assurance</div>
      <h2>How It Is Tested</h2>
      <p>Everything below ships with the product and can be re-run on your own hardware.</p>
    </div>
    <div class="leads cols">
      <p><b>The SB-MQTT5 specification.</b> The normative profile for how SparkBridge exploits MQTT 5.0 under Sparkplug 3.0: session modes, message classes, flow control, and three conformance classes. <a href="#sb-mqtt5">Read the specification below</a>.</p>
      <p><b>820 automated tests.</b> Live gateway integration, property-based codec testing, a 50,000-case malformed-input fuzz of the decoder, corrupt-buffer and chaos suites, and negative TLS tests confirming untrusted certificates are rejected.</p>
      <p><b>A documented suite of load scenarios, reproducible from the shipped suite.</b> Codec scaling, latency distribution, fan-in, sustained soak with heap-stability checks, outage and replay, multi-broker scale-out, 5,000-node fleet tracking, churn endurance, and the 500,000-metric capacity acceptance.</p>
      <p><b>Four independent code reviews.</b> Independent passes over correctness, security, QA and performance. The fixes were reviewed again as their own pass; everything that pass raised was closed.</p>
      <p><b>Code analysis.</b> Clean high-priority static analysis, 89% mutation-test strength on the pure-logic core, and dependency auditing against known vulnerabilities.</p>
      <p><b>Ignition 8.1.19 and later.</b> The data path is compiled against the 8.1.0 API and the bytecode targets Java 11, so nothing reaches for a later method or a later JVM. Runtime-verified on 8.1.38.</p>
      <p><b>Direct support.</b> You deal with the engineers who wrote the code. Support and updates are included with volume agreements and optional on any gateway license.</p>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="sec-head">
      <div class="path">standards</div>
      <h2>The Official Sources</h2>
      <p>SparkBridge implements published standards, so you can check our claims against the
      standards themselves. These are the canonical, current locations.</p>
    </div>
    <div class="scroller">
      <table class="tbl">
        <thead><tr><th>Source</th><th>What it is</th></tr></thead>
        <tbody>
          <tr><td><a href="https://www.eclipse.org/tahu/spec/sparkplug_spec.pdf">Sparkplug 3.0.0 specification</a></td><td>The normative specification (released November 2022), published by the Eclipse Foundation.</td></tr>
          <tr><td><a href="https://github.com/eclipse-sparkplug/sparkplug">eclipse-sparkplug/sparkplug</a></td><td>The specification source and the official Technology Compatibility Kit (TCK), the examiner behind <a href="/sparkbridge/tck">our published results</a>.</td></tr>
          <tr><td><a href="https://projects.eclipse.org/projects/iot.sparkplug">Eclipse project page</a></td><td>Project status, release record, and the Sparkplug 4.0 development plan our <a href="#sb-mqtt5">SB-MQTT5 profile</a> anticipates.</td></tr>
          <tr><td><a href="https://sparkplug.eclipse.org/compatibility/get-listed/">Sparkplug Compatible Program</a></td><td>The Working Group's listing process for certified products.</td></tr>
          <tr><td><a href="https://www.oasis-open.org/committees/mqtt/">OASIS MQTT</a></td><td>The MQTT 3.1.1 and 5.0 wire protocol standards underneath everything.</td></tr>
          <tr><td><a href="https://sparkplug.eclipse.org/specification/version/2.2/documents/sparkplug-specification-2.2.pdf">Sparkplug 2.2 specification</a></td><td>The legacy pre-3.0 document, at its current home. SparkBridge retains read compatibility with 2.2-era payloads.</td></tr>
        </tbody>
      </table>
    </div>
    <p class="note">The historical eclipse.org/tahu URL for the 2.2 document now redirects; the
    link above is its current home. The 3.0.0 specification is the normative reference for
    everything this site claims.</p>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="sec-head">
      <div class="path">documents</div>
      <h2>Documents on Request</h2>
      <p>Ask and we will send them straight over.</p>
      <p>The <a href="/sparkbridge/architecture">architecture page</a> shows the reference topologies these documents describe.</p>
    </div>
    <div class="scroller">
      <table class="tbl">
        <thead><tr><th>Document</th><th>What is in it</th></tr></thead>
        <tbody>
          <tr><td><b>Technical whitepaper</b></td><td>The full argument: how Sparkplug came to exist, what it leaves to the implementation, the capability and performance comparison, a real 40-site Gateway Network hub measured against the consolidated alternative, and the conformance position stated precisely.</td></tr>
          <tr><td><b>Installation guide</b></td><td>Fresh install of the three modules, broker choice, the minimum secure configuration, and the application-topic authorization step that a UNS deployment must not skip.</td></tr>
          <tr><td><b>Production configuration</b></td><td>Every tuning and hardening property with its default and its effect: security posture, store-and-forward durability, capacity budgets, MQTT 5 knobs.</td></tr>
          <tr><td><b>Performance methodology</b></td><td>Harness, machine, and reproduction commands for every published figure, including the correction where an earlier benchmark measured ingest rather than end-to-end throughput.</td></tr>
          <tr><td><b>Device modeling guide</b></td><td>Turning folder structure into Sparkplug Devices, the write-back allowlist, and how a schema change becomes a DDEATH and DBIRTH without disturbing the session.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</section>

<section class="spec-mast" id="sb-mqtt5">
  <div class="wrap">
    <div class="sec-head">
      <div class="path">specification</div>
      <h2>The Specification</h2>
      <p>A profile over existing standards, not a new wire protocol: every requirement is
      expressible with a conformant OASIS MQTT 5.0 client and broker, and strict mode remains
      Sparkplug 3.0 conformant. This page renders the complete normative text; the file of
      record ships with the source as <span class="mono">docs/SB-MQTT5-SPEC.md</span>.</p>
      <p>Short definitions of the message types and terms are on the <a href="/sparkbridge/technology#glossary">technology page glossary</a>.</p>
    </div>
    <dl class="mast mono">
      <div><dt>Short id</dt><dd>SB-MQTT5</dd></div>
      <div><dt>Version</dt><dd>1.0, Revision D</dd></div>
      <div><dt>Status</dt><dd class="normative">NORMATIVE</dd></div>
      <div><dt>Keywords</dt><dd>RFC 2119</dd></div>
    </dl>
  </div>
</section>

<section>
  <div class="wrap">
    <h2 class="bandtitle">Three conformance classes, one degradation rule</h2>
    <p class="bandlede">An implementation claims one or more classes. R and C extend S and
    <span class="rfc">MUST</span> degrade to S by configuration alone: no code change, and no
    redeploy of peers.</p>
    <div class="leads" style="margin-top:22px">
      <p><span class="rfc">CLASS S</span> <b>Strict.</b> Sparkplug 3.0 wire semantics on
      protocol 3 or 5. The TCK-eligible class, and the default: Clean Start 1, Session
      Expiry 0, Will Delay 0.</p>
      <p><span class="rfc">CLASS R</span> <b>Resilient Edge.</b> Flap-immune Wills,
      session-resume NDEATH suppression, and data expiry for edges on unreliable links.
      Protocol 5 only; edge transports only.</p>
      <p><span class="rfc">CLASS C</span> <b>Coordinated Host.</b> Shared-subscription
      consumer groups feeding one host-side projection, for fan-in beyond a single consumer.
      Protocol 5 only; disabled for TCK runs.</p>
    </div>
  </div>
</section>

<section>
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

<section class="tail">
  <div class="wrap">
    <h2>Ask for the Whitepaper</h2>
    <p>The whitepaper carries the full conformance record, the measurement methodology, and the 40-site estate analysis, including which TCK cases were run and which are still roadmap. If a number on this site matters to your decision, ask how it was measured.</p>
    <div class="cta-row">
      <a class="btn" href="/sparkbridge/contact">Request the whitepaper</a>
      <a class="btn ghost" href="/sparkbridge/pricing">See pricing</a>
    </div>
  </div>
</section>
</main>

<footer>
  <div class="wrap">
    <span class="mono">SparkBridge · Sparkplug B / 3.0 · MQTT 3.1.1 and MQTT 5 · Ignition 8.1.19+</span>
    <span class="mono"><a href="/sparkbridge/download">Download</a> · <a href="/sparkbridge/technology">Technology</a> · <a href="/sparkbridge/changelog">Changelog</a> · <a href="/sparkbridge/pricing">Pricing</a> · <a href="/sparkbridge/contact">Contact</a></span>
  </div>
</footer>

<script>
(function(){{
  var t=document.getElementById('navtoggle'), n=document.getElementById('nav');
  if(t&&n){{t.addEventListener('click',function(){{
    var open=n.classList.toggle('open');
    t.setAttribute('aria-expanded',open?'true':'false');
  }});}}
}})();
</script>
<script defer src="/sparkbridge/sb-chat.js"></script>
</body>
</html>
'''

OUT.write_text(page)
print(f"wrote {OUT} ({len(page)} bytes), {len(toc)} TOC entries")
