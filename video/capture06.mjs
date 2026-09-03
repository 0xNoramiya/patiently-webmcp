import { chromium } from '/home/kuda/hackathon/patiently/apps/web/node_modules/playwright/index.mjs';
import { readdirSync, renameSync } from 'node:fs';
const B='https://patiently-webmcp.vercel.app', OUT='/home/kuda/hackathon/patiently/video/raw';
const SIZE={width:1920,height:1080};
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH});

const waitTools=async(p,m)=>{for(let i=0;i<240;i++){const n=await p.evaluate(async()=>{try{return document.modelContext?(await document.modelContext.getTools()).length:0}catch{return 0}});if(n>=m)return n;await p.waitForTimeout(150);}throw new Error('no tools');};
// Non-blocking: the approval promise must NOT be awaited before we click.
const startCall=(p,n,a={})=>p.evaluate(async([n,a])=>{
  const t=(await document.modelContext.getTools()).find(x=>x.name===n);
  window.__done=false;
  window.__p=document.modelContext.executeTool(t,JSON.stringify(a)).then(()=>{window.__done=true;}).catch(()=>{window.__done=true;});
},[n,a]);

const ctx=await browser.newContext({viewport:SIZE,recordVideo:{dir:OUT,size:SIZE}});
const p=await ctx.newPage();
await p.goto(B+'/dashboard',{waitUntil:'domcontentloaded'});
await waitTools(p,11);
const tn=await p.evaluate(async()=>{const q=await (await fetch('/api/queue/umum')).json();return q.waiting[0].ticket.ticket_number;});
console.log('  ticket', tn);
const d=p.locator('[role="dialog"]');

// 1. Call the patient in — dialog, hold, approve.
await startCall(p,'call_next_patient',{ticket:tn});
await d.waitFor({timeout:25000});
await p.waitForTimeout(3000);
await d.getByRole('button',{name:'Call patient'}).click();
await p.waitForTimeout(2500);
console.log('  called in:', await p.evaluate(()=>window.__done));

// 2. Vitals — the blocking gate, held on screen, then approved.
await startCall(p,'record_vitals',{ticket:tn,systolic_bp:168,diastolic_bp:98,heart_rate:104,spo2:95,pain_score:7});
await d.waitFor({timeout:25000});
await p.waitForTimeout(4500);
await d.getByRole('button',{name:'Record vitals'}).click();
await p.waitForTimeout(3500);
console.log('  vitals written:', await p.evaluate(()=>window.__done));

await ctx.close();
const f=readdirSync(OUT).filter(x=>x.endsWith('.webm')&&!x.startsWith('shot-'));
if(f.length){renameSync(`${OUT}/${f[0]}`,`${OUT}/shot-06-vitals-gate.webm`);console.log('  ✓ shot-06-vitals-gate.webm');}
await browser.close();
