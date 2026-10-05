import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createKino } from '../sdk/kino-shim.mjs';
import { validateManifest, checkOutput } from '../sdk/contract.mjs';
import * as plugin from '../plugin.js';
const read=f=>readFileSync(new URL(f,import.meta.url),'utf8');
const manifest=validateManifest(read('../kino-plugin.json')).manifest;
const audit=JSON.parse(read('rider-link-pages/audit.json'));
const ROOT='https://shadowrangers.live';
const V3='kamen-rider-v3', GEATS='kamen-rider-geats', DEN='kamen-rider-den-o';
const page=slug=>audit.series.find(s=>s.slug===slug).firstPage;
function boot({override={}}={}) {
 const requests=[],captures=[];
 const {kino,servers}=createKino(manifest,{fetchImpl:async(url)=>{
  url=String(url);requests.push(url);
  if (override[url]!==undefined) return new Response(override[url]);
  if(url===ROOT+'/genero/kamen-rider/')return new Response(read('rider-catalog.html'));
  const slug=/\/series\/([a-z0-9-]+)\/$/.exec(url)?.[1];
  if(slug && audit.series.some(s=>s.slug===slug))return new Response(read('rider-link-pages/'+slug+'.html'));
  if(url===page(V3))return new Response(read('rider-v3-1x1.html'));
  if(url==='https://voe.sx/e/etzqtz7gsgnh')return new Response('<html>Dynamic player fixture</html>');
  throw new Error('Unexpected fixture request: '+url);
 }});
 globalThis.kino={...kino,log(){},browser:{capture:async(url,options)=>{
  captures.push({url,options});return {media:[{url:'https://media.example.com/selected/master.m3u8',headers:{Referer:url}}]};
 }}};
 return {kino,servers,requests,captures};
}
function checked(fn,value,r){const out=checkOutput(fn,value,manifest,r.servers);assert.deepEqual(out.drops,[]);return out.value;}
test('all 38 real Rider episode lists preserve all 1767 published chapters and their own series refs',async()=>{
 const r=boot();let total=0;
 for(const row of audit.series){
  const data=checked('episodes',await plugin.episodes('shadow:rider:'+row.slug),r);
  assert.equal(data.episodes.length,row.episodes,row.slug);
  assert.deepEqual(data.episodes.map(e=>e.number),row.numbers,row.slug);
  assert.ok(data.episodes.every(e=>e.season===1&&e.ref==='shadow:rider:'+row.slug+':1x'+e.number),row.slug);
  total+=data.episodes.length;
 }
 assert.equal(total,1767);assert.equal(r.requests.length,39);assert.equal(r.captures.length,0);
});
test('V3 resolves the published franchise URL rather than reconstructing a non-existent series URL',async()=>{
 const r=boot();const data=checked('episodes',await plugin.episodes('shadow:rider:'+V3),r);
 assert.equal(data.episodes[0].season,1);assert.equal(data.episodes.length,52);
 const ref=data.episodes[0].ref;
 const stream=checked('resolve',await plugin.resolve(ref),r);
 assert.equal(stream.label,'Server 2 · VOE');
 assert.ok(r.requests.includes(ROOT+'/capitulos/kamen-rider-2x1/'));
 assert.ok(!r.requests.some(u=>u.includes('/capitulos/kamen-rider-v3-')));
 assert.equal(r.captures[0].options.headers.Referer,page(V3));
 assert.deepEqual(stream.alternatives,[{label:'Server 3 · ShadowLiv',ref:ref+':server:3'}]);
 await plugin.resolve(stream.alternatives[0].ref);
 assert.equal(r.captures[1].url,'https://shadowliv.xyz/#to99q');
 assert.equal(r.captures[1].options.headers.Referer,page(V3));
});
test('Geats retains chapters 37–49 when the published URL switches to franchise index 33',async()=>{
 const r=boot();const data=checked('episodes',await plugin.episodes('shadow:rider:'+GEATS),r);
 assert.equal(data.episodes.length,49);
 const cached=JSON.parse(r.kino.storage.get('shadow-sentai-series-v1'))[0];
 assert.equal(cached.episodes.find(e=>e.number===36).page,ROOT+'/capitulos/kamen-rider-geats-1x36/');
 assert.equal(cached.episodes.find(e=>e.number===37).page,ROOT+'/capitulos/kamen-rider-33x37/');
 assert.equal(data.episodes[36].ref,'shadow:rider:'+GEATS+':1x37');
});
test('Japanese URL slugs are kept as public chapter paths, while Kino refs remain ASCII and stable',async()=>{
 const actual=page(DEN),fixture='<li data-nume="1"><span class="title">Server 1</span></li><div id="source-player-1"><div><iframe src="https://voe.sx/e/synthetic1234"></iframe></div></div>';
 const r=boot({override:{[actual]:fixture,'https://voe.sx/e/synthetic1234':'<html>Dynamic synthetic fixture</html>'}});
 const data=checked('episodes',await plugin.episodes('shadow:rider:'+DEN),r);
 assert.equal(data.episodes.length,49);
 await plugin.resolve(data.episodes[0].ref);
 assert.ok(r.requests.includes(actual));
 assert.equal(r.captures[0].options.headers.Referer,actual);
 assert.ok(!r.requests.includes(ROOT+'/capitulos/'+DEN+'-1x1/'));
});
test('old partial metadata is re-read after the reader update instead of retaining only 36 Geats chapters',async()=>{
 const r=boot();r.kino.storage.set('shadow-sentai-series-v1',JSON.stringify([{slug:GEATS,family:'rider',savedAt:Date.now(),title:'Kamen Rider Geats',episodes:Array.from({length:36},(_,i)=>({season:1,number:i+1}))}]),{ttlMs:300000});
 assert.equal((await plugin.episodes('shadow:rider:'+GEATS)).episodes.length,49);
 assert.ok(r.requests.includes(ROOT+'/series/'+GEATS+'/'));
 assert.equal(JSON.parse(r.kino.storage.get('shadow-sentai-series-v1'))[0].parserVersion,2);
});
test('comments and unrelated episode widgets outside the series list are not added as chapters',async()=>{
 const original=read('rider-link-pages/'+V3+'.html');
 const extra='<ul class="episodios"><li><div class="numerando">1 - 99</div><div class="episodiotitle"><a href="'+ROOT+'/capitulos/kamen-rider-2x99/">Unrelated</a></div></li></ul>';
 const r=boot({override:{[ROOT+'/series/'+V3+'/']:original+'<div id="comments">'+extra+'</div>'}});
 assert.equal((await plugin.episodes('shadow:rider:'+V3)).episodes.length,52);
});
test('advertising links inside episode rows cannot replace the link in its episode title',async()=>{
 const original=read('rider-link-pages/'+V3+'.html').replace('<li>','<li><a href="https://ads.example.com/capitulos/ad-1x1/">Ad</a>');
 const r=boot({override:{[ROOT+'/series/'+V3+'/']:original}});
 assert.equal((await plugin.episodes('shadow:rider:'+V3)).episodes.length,52);
 await plugin.resolve('shadow:rider:'+V3+':1x1');
 assert.ok(r.requests.includes(page(V3)));assert.ok(r.requests.every(u=>!u.includes('ads.example.com')));
});
test('foreign hosts, encoded traversal, mismatched chapter numbers and unsafe URL forms are rejected',async()=>{
 const original=read('rider-link-pages/'+V3+'.html');
 const urls=['https://foreign.example.com/capitulos/kamen-rider-2x1/',ROOT+'/capitulos/%2e%2e-2x1/',ROOT+'/capitulos/kamen%2frider-2x1/',ROOT+'/capitulos/%252e%252e-2x1/',ROOT+'/capitulos/kamen-rider-2x1/?next=evil',ROOT+'/capitulos/kamen-rider-2x1/#evil',ROOT+'/capitulos/kamen-rider-2x2/'];
 for(const url of urls){
  const html=original.replace(page(V3),url);
  const r=boot({override:{[ROOT+'/series/'+V3+'/']:html}});
  const data=checked('episodes',await plugin.episodes('shadow:rider:'+V3),r);
  assert.equal(data.episodes.length,51);assert.ok(data.episodes.every(e=>e.number!==1));
  await assert.rejects(plugin.resolve('shadow:rider:'+V3+':1x1'),{code:'not_found'});
  assert.equal(r.captures.length,0);
 }
});
test('an incomplete owning episode container cannot leak unrelated links into the series',async()=>{
 const html='<div id="episodes"><div><ul class="episodios"><li><div class="numerando">1 - 1</div><div class="episodiotitle"><a href="'+page(V3)+'">Incomplete</a></div></li></ul>';
 const r=boot({override:{[ROOT+'/series/'+V3+'/']:html}});
 await assert.rejects(plugin.episodes('shadow:rider:'+V3),{code:'unavailable'});
 assert.equal(r.captures.length,0);
});
