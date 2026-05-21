const sharp = require('../app/node_modules/sharp')
const path = require('path')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="72" fill="#1a2e1f"/>
  <text x="256" y="340" text-anchor="middle"
    font-family="Arial, sans-serif" font-size="240" font-weight="900"
    fill="#7dffaa">GG</text>
</svg>`

const buf = Buffer.from(svg)
const out = (name) => path.join(__dirname, '..', 'app', 'public', name)

;(async () => {
  await sharp(buf).resize(192, 192).png().toFile(out('icon-192.png'))
  await sharp(buf).resize(512, 512).png().toFile(out('icon-512.png'))
  await sharp(buf).resize(180, 180).png().toFile(out('apple-touch-icon.png'))
  console.log('Icons generated in app/public/')
})()
