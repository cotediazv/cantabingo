const { chromium } = require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1200,height:1400},deviceScaleFactor:1});
const f='file://'+path.resolve('cartelera-kennedy.html');
for(let s=0;s<7;s++){await p.goto(f+'?s='+s);await p.waitForTimeout(1500);
 await p.evaluate(()=>{const m=document.querySelector('.marco');document.querySelector('.vista').style.display='block';document.querySelector('.lado').style.display='none';m.style.width='720px';m.style.maxWidth='none';m.style.border='0';m.querySelector('.escala').style.transform='none'});
 await p.waitForTimeout(1200);
 await (await p.$('#s')).screenshot({path:`vid/p${s}.png`});}
await b.close()})();
