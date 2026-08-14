/* SparkBridge site chat: "Ask the Engineer".
   Talks directly to the GreenGuard Mac chat daemon over Tailscale Funnel
   (audience: sparkbridge — docs-grounded, read-only, rate-limited).
   Anonymous identity is a UUID kept in localStorage; the daemon resumes the
   CLI session per sid, and we re-send recent turns after its 24h expiry. */
(function () {
  'use strict'
  var ENDPOINT = 'https://greenguard-mac-controller.tail9a2933.ts.net/chat/sparkbridge'
  var LS_SID = 'sbchat.sid'
  var LS_LOG = 'sbchat.log'

  function sid() {
    var s = null
    try { s = localStorage.getItem(LS_SID) } catch (e) {}
    if (!s || !/^[0-9a-f-]{36}$/.test(s)) {
      s = (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16)
      }))
      try { localStorage.setItem(LS_SID, s) } catch (e) {}
    }
    return s
  }
  function loadLog() {
    try { return JSON.parse(localStorage.getItem(LS_LOG) || '[]').slice(-12) } catch (e) { return [] }
  }
  function saveLog(log) {
    try { localStorage.setItem(LS_LOG, JSON.stringify(log.slice(-12))) } catch (e) {}
  }

  var root = document.createElement('div')
  root.id = 'sbchat'
  root.innerHTML =
    '<button id="sbchat-fab" type="button" aria-haspopup="dialog" aria-expanded="false">' +
      '<span class="sbchat-dot" aria-hidden="true"></span>Ask the Engineer</button>' +
    '<section id="sbchat-panel" role="dialog" aria-label="Ask the Engineer" hidden>' +
      '<header><div><strong>Ask the Engineer</strong>' +
      '<span class="sbchat-sub mono">answers grounded in the SparkBridge docs</span></div>' +
      '<button id="sbchat-close" type="button" aria-label="Close chat">&#215;</button></header>' +
      '<div id="sbchat-msgs" aria-live="polite"></div>' +
      '<form id="sbchat-form"><textarea id="sbchat-in" rows="2" maxlength="1500" ' +
      'placeholder="Ask about capacity, security, Sparkplug conformance, installation..." required></textarea>' +
      '<button type="submit" id="sbchat-send">Ask</button></form>' +
      '<div class="sbchat-foot mono">Answers can take up to a minute. No account data; product questions only.</div>' +
    '</section>'
  document.body.appendChild(root)

  var fab = document.getElementById('sbchat-fab')
  var panel = document.getElementById('sbchat-panel')
  var msgs = document.getElementById('sbchat-msgs')
  var form = document.getElementById('sbchat-form')
  var input = document.getElementById('sbchat-in')
  var send = document.getElementById('sbchat-send')
  var log = loadLog()
  var busy = false

  function esc(t) {
    return t.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }
  // Minimal safe rendering: escape everything, then linkify site paths and
  // bold **spans**. No HTML from the model is ever interpreted.
  function render(t) {
    var h = esc(t)
    h = h.replace(/\*\*([^*\n]{1,80})\*\*/g, '<strong>$1</strong>')
    h = h.replace(/(^|[\s(])(\/sparkbridge-mqtt\/[a-z0-9\-\/]*)/g, '$1<a href="$2">$2</a>')
    return h.replace(/\n/g, '<br>')
  }
  function bubble(role, text) {
    var d = document.createElement('div')
    d.className = 'sbchat-m ' + (role === 'user' ? 'me' : 'eng')
    d.innerHTML = render(text)
    msgs.appendChild(d)
    msgs.scrollTop = msgs.scrollHeight
    return d
  }
  function thinking() {
    var d = document.createElement('div')
    d.className = 'sbchat-m eng sbchat-thinking'
    d.innerHTML = '<span></span><span></span><span></span> <em>checking the docs</em>'
    msgs.appendChild(d)
    msgs.scrollTop = msgs.scrollHeight
    return d
  }

  for (var i = 0; i < log.length; i++) bubble(log[i].role, log[i].content)
  if (!log.length) {
    bubble('eng', 'Ask me anything about SparkBridge: capacity, security model, Sparkplug 3.0 conformance, MQTT 5, installation, pricing. Answers come from the product documentation.')
  }

  function setOpen(open) {
    panel.hidden = !open
    fab.setAttribute('aria-expanded', String(open))
    fab.classList.toggle('open', open)
    if (open) input.focus()
  }
  fab.addEventListener('click', function () { setOpen(panel.hidden) })
  document.getElementById('sbchat-close').addEventListener('click', function () { setOpen(false) })
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) setOpen(false) })
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit() }
  })

  form.addEventListener('submit', function (e) {
    e.preventDefault()
    if (busy) return
    var q = input.value.trim()
    if (!q) return
    busy = true
    send.disabled = true
    input.value = ''
    bubble('user', q)
    log.push({ role: 'user', content: q })
    saveLog(log)
    var t = thinking()

    var ctl = new AbortController()
    var timer = setTimeout(function () { ctl.abort() }, 75000)
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sid: sid(), message: q, history: log.slice(0, -1) }),
      signal: ctl.signal,
    }).then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j } }) })
      .then(function (r) {
        t.remove()
        var reply
        if (r.j && r.j.ok && r.j.reply) reply = r.j.reply
        else if (r.status === 429) reply = 'That is a lot of questions at once. Give it a minute and ask again.'
        else if (r.status === 503) reply = 'The engineer is helping someone else right now. Try again in a moment.'
        else reply = 'Something went wrong on our side. Try again, or reach us at /sparkbridge-mqtt/contact.'
        bubble('eng', reply)
        if (r.j && r.j.ok) { log.push({ role: 'assistant', content: reply }); saveLog(log) }
      })
      .catch(function () {
        t.remove()
        bubble('eng', 'The assistant is unreachable right now. Try again shortly, or reach us at /sparkbridge-mqtt/contact.')
      })
      .finally(function () {
        clearTimeout(timer)
        busy = false
        send.disabled = false
        input.focus()
      })
  })
})()
