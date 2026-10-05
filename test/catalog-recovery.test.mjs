import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createKino } from '../sdk/kino-shim.mjs';
import { validateManifest, checkOutput } from '../sdk/contract.mjs';
import * as plugin from '../plugin.js';
const read = f => readFileSync(new URL(f, import.meta.url), 'utf8');
const manifest = validateManifest(read('../kino-plugin.json')).manifest;
const snapshot = JSON.parse(read('catalog-bootstrap.json'));
const familyByGenre = {'super-sentai':'sentai','kamen-rider':'rider',tokusatsu:'tokusatsu'};
function boot({offline = false, gate} = {}) {
 const requests = [], captures = [], budgets = [];
 let failed = offline, sentai = read('sentai-catalog.html');
 const {kino, servers} = createKino(manifest, {fetchImpl: async (url, options) => {
  requests.push({url:String(url),options});
  if (gate) await gate;
  if (failed) throw new Error('Synthetic network timeout');
  const family = familyByGenre[String(url).split('/').filter(Boolean).at(-1)];
  if (!family) throw new Error('Unexpected fixture request');
  return new Response(family === 'sentai' ? sentai : read(family+'-catalog.html'));
 }});
 globalThis.kino = {...kino,fetch:async (url,options) => {budgets.push(options.timeoutMs);return kino.fetch(url,options);},log() {},browser:{capture:async () => {captures.push(true);throw new Error('Unexpected capture');}}};
 return {kino,servers,requests,captures,budgets,fail:()=>{failed=true;},online:()=>{failed=false;},withdraw:()=>{sentai=sentai.replace(/<article\b[\s\S]*?<\/article>/,'');}};
}
function accepted(fn, value, r) {
 const checked = checkOutput(fn,value,manifest,r.servers);
 assert.deepEqual(checked.drops,[]);
 return checked.value;
}
test('cold startup with every category unavailable still exposes three browsable real catalogs',async()=>{
 const r=boot({offline:true});
 const home=accepted('home',await plugin.home(),r);
 assert.deepEqual(home.map(row=>row.ref),['category:super-sentai','category:kamen-rider','category:tokusatsu']);
 assert.deepEqual(home.map(row=>row.items.length),[49,38,37]);
 assert.ok(home.every(row=>row.title.includes('copia inicial')));
 assert.equal(new Set(home.flatMap(row=>row.items.map(i=>i.ref))).size,124);
 assert.equal(home[0].items.find(i=>i.title==='Mirai Sentai Timeranger').ref,'shadow:timeranger');
 assert.equal(home[1].items.find(i=>i.title==='Kamen Rider Gavv').ref,'shadow:rider:kamen-rider-gavv');
 assert.equal(r.requests.length,3);assert.equal(r.captures.length,0);
 for (const [genre,family] of Object.entries(familyByGenre)) {
  const browse=accepted('browse',await plugin.browse('category:'+genre),r);
  assert.equal(browse.items.length,snapshot.catalogs[family].length);
 }
});
test('null, omitted, unknown and known section selections preserve tabs during a first-load failure',async()=>{
 const r=boot({offline:true});
 for (const arg of [undefined,null,{tab:null},{tab:'unknown'},{tab:'kamen-rider'},{tab:'tokusatsu'}]) {
  const section=accepted('section',await plugin.section(arg),r);
  const selected=arg?.tab==='kamen-rider'?'rider':arg?.tab==='tokusatsu'?'tokusatsu':'sentai';
  assert.equal(section.tabs.length,3);
  assert.equal(section.rows.flatMap(row=>row.items).length,snapshot.catalogs[selected].length);
  assert.match(section.hero.text,/Catálogo inicial de 2026-10-05/);
 }
});
test('home category fetches share one concurrent bounded wait rather than three consecutive waits',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});
 const r=boot({gate});const pending=plugin.home();
 await new Promise(resolve=>setImmediate(resolve));
 release();
 assert.equal(r.requests.length,3);
 assert.ok(r.budgets.every(ms=>ms<=18000));
 assert.deepEqual(accepted('home',await pending,r).map(row=>row.items.length),[49,38,37]);
 assert.ok((await plugin.settingsStatus()).catalogStatus.startsWith('100%'));
});
test('fallback metadata never marks a failed device refresh as 100 percent or records a successful date',async()=>{
 const r=boot({offline:true});
 await plugin.section(null);
 let status=await plugin.settingsStatus();
 assert.match(status.catalogStatus,/Error al actualizar.*copia inicial.*49 series/);
 assert.equal(status.catalogUpdated,'Sin fecha registrada');
 const state=JSON.parse(r.kino.storage.get('shadow-sentai-load-state-v1'));
 assert.equal(state.phase,'failed');assert.equal(state.count,undefined);assert.equal(state.loadedAt,undefined);
 await assert.rejects(plugin.action('refreshCatalog'),{code:'unavailable'});
 status=await plugin.settingsStatus();assert.ok(!status.catalogStatus.startsWith('100%'));
});
test('expired short cache uses the last successful listing, retaining source withdrawals and its timestamp',async()=>{
 const r=boot();r.withdraw();
 await plugin.action('refreshCatalog');
 const before=await plugin.settingsStatus();
 const now=Date.now;let tick=now();Date.now=()=>tick;
 try {
  tick+=6*60*1000;r.fail();
  const section=accepted('section',await plugin.section(null),r);
  assert.equal(section.rows[0].items.length,48);
  assert.match(section.hero.text,/última lista guardada/);
  const after=await plugin.settingsStatus();
  assert.match(after.catalogStatus,/Error.*48 series de la última carga/);
  assert.equal(after.catalogUpdated,before.catalogUpdated);
  tick+=8*24*60*60*1000;
  const expired=await plugin.section(null);
  assert.equal(expired.rows[0].items.length,49);
  assert.match(expired.hero.text,/Catálogo inicial/);
 } finally {Date.now=now;}
});
test('a corrupt or unsafe saved listing cannot replace the verified initial catalog',async()=>{
 const r=boot({offline:true});
 for (const value of ['{',JSON.stringify({savedAt:Date.now(),items:[{slug:'../another-site',title:'Unsafe'}]}),JSON.stringify({savedAt:Date.now()+60000,items:[{slug:'future',title:'Future'}]})]) {
  r.kino.storage.set('shadow-sentai-catalog-v1-last-good',value,{ttlMs:60000});
  const section=accepted('section',await plugin.section(null),r);
  assert.equal(section.rows[0].items.length,49);
  assert.match(section.hero.text,/Catálogo inicial/);
 }
});
test('successful manual refresh replaces the initial copy and clears its fallback label',async()=>{
 const r=boot({offline:true});await plugin.section(null);
 r.online();r.withdraw();
 await plugin.action('refreshCatalog');
 const section=accepted('section',await plugin.section(null),r);
 assert.equal(section.rows[0].items.length,48);
 assert.equal(section.hero.text,'Series ordenadas por año de estreno.');
 assert.ok(!section.rows[0].title.includes('copia inicial'));
 assert.match((await plugin.settingsStatus()).catalogStatus,/^100% · 48 series/);
});
test('display fallback does not bypass source checks or initiate playback when episode metadata fails',async()=>{
 const r=boot({offline:true});await plugin.home();
 await assert.rejects(plugin.resolve('shadow:timeranger:1x1'),{code:'unavailable'});
 assert.equal(r.captures.length,0);
 assert.ok(r.requests.every(req=>!req.url.includes('/capitulos/')&&!req.url.includes('voe.sx')));
});
