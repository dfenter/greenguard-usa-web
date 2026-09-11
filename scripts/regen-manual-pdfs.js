const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const manualsDir = path.join(__dirname, '..', 'sparkbridge', 'manuals');
const outDir = path.join(__dirname, '..', 'sparkbridge', 'downloads', 'manuals');

const slugs = fs.readdirSync(manualsDir)
  .filter(f => f.endsWith('.html') && f !== 'index.html')
  .map(f => f.replace(/\.html$/, ''));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const slug of slugs) {
    const htmlPath = path.join(manualsDir, `${slug}.html`);
    const pdfPath = path.join(outDir, `${slug}.pdf`);
    await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' });
    await page.pdf({
      path: pdfPath,
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' },
    });
    console.log('wrote', pdfPath);
  }
  await browser.close();
})();
