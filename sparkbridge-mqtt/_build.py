#!/usr/bin/env python3
"""Reference shell for the SparkBridge product site: nav, head and footer in one place.

This is NOT a generator and running it writes nothing. The eight pages are maintained by hand;
shell() and cta() exist so that the nav, head and footer have one authoritative source to copy
from when adding or editing a page. Keep NAV below in step with the files that actually exist.
"""

NAV = [
    ("index",      "Overview",   ""),
    ("modules",    "Modules",    "modules"),
    ("technology", "Technology", "technology"),
    ("use-cases",  "Use cases",  "use-cases"),
    ("compare",    "Compare",    "compare"),
    ("pricing",    "Pricing",    "pricing"),
    ("resources",  "Resources",  "resources"),
    ("contact",    "Contact",    "contact"),
]
BASE = "/sparkbridge-mqtt/"

def shell(slug, title, desc, crumb, body, extra_head=""):
    nav = "\n".join(
        '        <a href="{href}"{cur}>{label}</a>'.format(
            href=BASE + path if path else BASE,
            cur=' aria-current="page"' if s == slug else "",
            label=label)
        for s, label, path in NAV)
    canonical = "https://new.greenguard-usa.com" + BASE + ("" if slug == "index" else slug)
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{canonical}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{BASE}sb.css">
{extra_head}</head>
<body>

<div class="topicbar">
  <div class="wrap">
    <a class="skip" href="#main">Skip to content</a>
    <a class="brand" href="{BASE}">Spark<span>Bridge</span></a>
    <nav class="nav" id="nav" aria-label="Main">
{nav}
    </nav>
    <button class="navtoggle" id="navtoggle" aria-expanded="false" aria-controls="nav">Menu</button>
    <div class="crumb mono" id="crumb">spBv1.0/<b>sparkbridge</b>/NDATA/<b id="crumb-sec">{crumb}</b></div>
  </div>
</div>

{body}

<footer>
  <div class="wrap">
    <span class="mono">SparkBridge · Sparkplug B / 3.0 · MQTT 3.1.1 and MQTT 5 · Ignition 8.1.0+</span>
    <span class="mono"><a href="{BASE}pricing">Pricing</a> · <a href="{BASE}contact">Contact</a></span>
  </div>
</footer>

<script>
(function(){{
  var t=document.getElementById('navtoggle'), n=document.getElementById('nav');
  if(t&&n){{t.addEventListener('click',function(){{
    var open=n.classList.toggle('open');
    t.setAttribute('aria-expanded',open?'true':'false');
  }});}}
  var secName=document.getElementById('crumb-sec');
  var paths=[].slice.call(document.querySelectorAll('.sec-head .path'));
  if(!secName||!paths.length) return;
  function onScroll(){{
    var best=secName.textContent, y=window.scrollY+120, found=null;
    paths.forEach(function(p){{
      var top=p.getBoundingClientRect().top+window.scrollY;
      if(top<=y) found=p.textContent.split('/').pop();
    }});
    if(found&&secName.textContent!==found) secName.textContent=found;
  }}
  window.addEventListener('scroll',onScroll,{{passive:true}});
}})();
</script>
</body>
</html>
'''

def cta(primary_label, primary_href, ghost_label, ghost_href, heading, para):
    return f'''<section class="tail">
  <div class="wrap">
    <h2>{heading}</h2>
    <p>{para}</p>
    <div class="cta-row">
      <a class="btn" href="{primary_href}">{primary_label}</a>
      <a class="btn ghost" href="{ghost_href}">{ghost_label}</a>
    </div>
  </div>
</section>'''
