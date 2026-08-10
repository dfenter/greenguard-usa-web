import { Html, Head, Main, NextScript } from 'next/document'
const biz = require('../lib/business.config')

function buildCssVars(c) {
  // Parse #rrggbb → "r,g,b"
  function hx(hex) {
    const n = hex.replace('#', '')
    return `${parseInt(n.slice(0,2),16)},${parseInt(n.slice(2,4),16)},${parseInt(n.slice(4,6),16)}`
  }
  // Parse rgba(r,g,b,a) or rgb(r,g,b) → "r,g,b"
  function rg(rgba) {
    const m = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    return m ? `${m[1]},${m[2]},${m[3]}` : '0,0,0'
  }
  return `:root{` +
    `--bg:${c.bg};` +
    `--bg-deep:${c.bgDeep};` +
    `--bg-card:${c.bgCard};` +
    `--bg-alt:${c.bgAlt};` +
    `--border:${c.border};` +
    `--border-gold:${c.borderGold};` +
    `--green:${c.accent};` +
    `--green-muted:${c.accentMuted};` +
    `--gold:${c.gold};` +
    `--text:${c.text};` +
    `--text-muted:${c.textMuted};` +
    `--text-dim:${c.textDim};` +
    `--ok:${c.ok || '#176f2b'};` +
    `--danger:${c.danger || '#b3261e'};` +
    `--info:${c.info || '#0b57d0'};` +
    `--warn:${c.warn || '#8a5300'};` +
    `--text-on-accent:${c.textOnAccent || '#ffffff'};` +
    `--green-rgb:${hx(c.accent)};` +
    `--gold-rgb:${hx(c.gold)};` +
    `--text-rgb:${hx(c.text)};` +
    `--border-rgb:${rg(c.border)};` +
    `--ok-rgb:${hx(c.ok || '#176f2b')};` +
    `--danger-rgb:${hx(c.danger || '#b3261e')};` +
    `--info-rgb:${hx(c.info || '#0b57d0')};` +
    `--warn-rgb:${hx(c.warn || '#8a5300')};` +
  `}`
}

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <style dangerouslySetInnerHTML={{ __html: buildCssVars(biz.colors) }} />
        <meta name="theme-color" content={biz.colors.themeColor} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={biz.pwa.appTitle} />
        <link rel="manifest" href={biz.pwa.manifest} />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
