import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const [,,src,out,w,h] = process.argv;
const b=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox']});
const p=await b.newPage();
await p.setViewport({width:Number(w),height:Number(h),deviceScaleFactor:1});
await p.setContent(`<body style="margin:0">${fs.readFileSync(src,'utf8')}</body>`);
await p.screenshot({path:out});
await b.close();
