import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createKino } from "../sdk/kino-shim.mjs";
import { validateManifest, checkOutput, checkSettingsOutput } from "../sdk/contract.mjs";
import * as plugin from "../plugin.js";

const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
const manifest = validateManifest(read("../kino-plugin.json")).manifest;
const ROOT = "https://shadowrangers.live", CATEGORY = ROOT + "/genero/tokusatsu/";
const SPIDER = "shadow:tokusatsu:spider-man", PAGE = ROOT + "/capitulos/spider-man-1x1/";
const VOE = "https://voe.sx/e/etauvojcman9";
const fixtures = { "spider-man": read("toku-spider-man.html"), "chouseishin-series": read("toku-gransazer.html") };

function boot({ catalog = read("tokusatsu-catalog.html"), sentai = read("sentai-catalog.html"), pages = {}, fail = [] } = {}) {
  const requests = [], captures = [], logs = [];
  let categoryReply = catalog, failures = new Set(fail);
  const { kino, servers } = createKino(manifest, { fetchImpl: async (url, options) => {
    url = String(url); requests.push({ url, options });
    if (failures.has(url)) throw new Error("synthetic network failure");
    if (url === CATEGORY) return new Response(categoryReply);
    if (url === ROOT + "/genero/super-sentai/") return new Response(sentai);
    if (url === ROOT + "/genero/kamen-rider/") return new Response(read("rider-catalog.html"));
    if (pages[url] !== undefined) return new Response(pages[url]);
    for (const [slug, html] of Object.entries(fixtures)) if (url === ROOT + "/series/" + slug + "/") return new Response(html);
    if (url === PAGE) return new Response(read("toku-spider-man-1x1.html"));
    if (url === VOE) return new Response("<html>Dynamic player</html>");
    throw new Error("Unexpected request: " + url);
  } });
  globalThis.kino = { ...kino, log: (level, message) => logs.push({ level, message }), browser: { capture: async (url, options) => {
    captures.push({ url, options });
    return { media: [{ url: "https://media.example.com/toku/master.m3u8", headers: { Referer: url, Cookie: "synthetic=1" } }] };
  } } };
  return { requests, captures, logs, kino, servers, setCatalog: (html) => { categoryReply = html; }, fail: (urls) => { failures = new Set(urls); } };
}
function checked(fn, value, r) {
  const out = checkOutput(fn, value, manifest, r.servers);
  assert.deepEqual(out.drops, []);
  return out.value;
}
function checkedSettings(fn, value) {
  const drops = [];
  const out = checkSettingsOutput(fn, value, manifest, (s) => s, (s) => drops.push(s));
  assert.deepEqual(drops, []);
  return out;
}

test("Tokusatsu exposes its supplied image and its own section tab, loading only that family", async () => {
  const r = boot();
  const tiles = checked("categories", await plugin.categories(), r);
  assert.deepEqual(tiles.map((c) => c.title), ["Super Sentai", "Kamen Rider", "Tokusatsu"]);
  assert.equal(tiles[2].ref, "category:tokusatsu");
  assert.ok(tiles[2].art.endsWith("/assets/tokusatsu.png"));
  assert.equal(r.requests.length, 0);
  const section = checked("section", await plugin.section({ tab: "tokusatsu" }), r);
  assert.equal(section.tab, "tokusatsu");
  assert.equal(section.hero.image, tiles[2].art);
  assert.equal(section.rows[0].ref, "category:tokusatsu");
  assert.equal(section.rows[0].items.length, 37);
  assert.deepEqual(r.requests.map((x) => x.url), [CATEGORY]);
});

test("all 37 real general series are ordered by year, with four undated cards preserved at the end", async () => {
  const r = boot(), page = checked("browse", await plugin.browse("category:tokusatsu"), r);
  assert.equal(page.items.length, 37);
  assert.equal(page.next, null);
  assert.equal(new Set(page.items.map((x) => x.id)).size, 37);
  const dated = page.items.filter((x) => x.year), undated = page.items.filter((x) => !x.year);
  assert.equal(dated.length, 33);
  assert.deepEqual(dated.map((x) => Number(x.year)), dated.map((x) => Number(x.year)).sort((a, b) => a - b));
  assert.equal(dated[0].title, "Blitz!! Strada 5");
  assert.equal(dated.at(-1).title, "KakuseiHunter Omegahorn");
  assert.deepEqual(page.items.slice(-4), undated);
  assert.deepEqual(undated.map((x) => x.title), ["BIMA Satria Garuda – S2", "Dogengers Metropolis", "Dogengers: High School", "Kankyou Chojin Ecogainder"]);
  assert.ok(page.items.every((x) => x.ref.startsWith("shadow:tokusatsu:") && x.genres.length === 1 && x.genres[0] === "Tokusatsu"));
  assert.ok(page.items.every((x) => !x.lang));
  assert.equal(r.captures.length, 0);
});

test("the source's adults-only final chapter is kept behind Kino's native series adult mark", async () => {
  const r = boot(), items = checked("browse", await plugin.browse("category:tokusatsu"), r).items;
  assert.deepEqual(items.filter((x) => x.adult).map((x) => x.id), ["shadow-juuko-tokusou-dinnovator"]);
  assert.equal(checked("search", await plugin.search({ q: "Dinnovator" }), r).items[0].adult, true);
});

test("Spider-Man retains gaps in the real published chapters; Gransazer opens its own 51 chapters", async () => {
  const r = boot();
  await plugin.browse("category:tokusatsu");
  const spider = checked("episodes", await plugin.episodes(SPIDER), r);
  assert.equal(spider.series.title, "Spider-Man");
  assert.equal(spider.series.year, "1978");
  assert.equal(spider.episodes.length, 39);
  assert.equal(spider.episodes[0].ref, SPIDER + ":1x1");
  assert.equal(spider.episodes.at(-1).number, 41);
  assert.deepEqual(spider.episodes.map((x) => x.number), Array.from({ length: 41 }, (_, i) => i + 1).filter((n) => n !== 8 && n !== 23));
  const gransazer = checked("episodes", await plugin.episodes("shadow:tokusatsu:chouseishin-series"), r);
  assert.equal(gransazer.series.title, "Chouseishin Gransazer");
  assert.equal(gransazer.episodes.length, 51);
  assert.equal(gransazer.episodes[0].ref, "shadow:tokusatsu:chouseishin-series:1x1");
  await plugin.episodes(SPIDER);
  assert.equal(r.requests.length, 3);
  assert.equal(r.captures.length, 0);
});

test("Spider-Man's recorded first chapter selects its VOE iframe and ignores its VK option", async () => {
  const r = boot(), stream = checked("resolve", await plugin.resolve(SPIDER + ":1x1"), r);
  assert.equal(stream.label, "Server 2 · VOE");
  assert.equal(r.captures.length, 1);
  assert.equal(r.captures[0].url, VOE);
  assert.equal(r.captures[0].options.headers.Referer, PAGE);
  assert.equal(stream.headers.Cookie, "synthetic=1");
  assert.deepEqual(stream.alternatives || [], []);
  assert.ok(r.requests.every((x) => !x.url.includes("vk.com")));
});

test("a Tokusatsu lazy alternative keeps its own family, chapter and server id", async () => {
  const voe = "https://voe.sx/e/abcdefgh1234", liv = "https://shadowliv.xyz/#synthetic41";
  const last = ROOT + "/capitulos/spider-man-1x41/";
  const options = '<li data-nume="2"><span class="title">Server 2</span></li><li data-nume="5"><span class="title">Server 5</span></li>'
    + '<div id="source-player-2"><div><iframe src="' + voe + '"></iframe></div></div><div id="source-player-5"><div><iframe src="' + liv + '"></iframe></div></div>';
  const r = boot({ pages: { [last]: options, [voe]: "<html>Dynamic player</html>" } });
  const stream = checked("resolve", await plugin.resolve(SPIDER + ":1x41"), r);
  assert.deepEqual(stream.alternatives, [{ label: "Server 5 · ShadowLiv", ref: SPIDER + ":1x41:server:5" }]);
  await plugin.resolve(stream.alternatives[0].ref);
  assert.deepEqual(r.captures.map((x) => x.url), [voe, liv]);
  assert.equal(r.requests.filter((x) => x.url === voe).length, 1);
});

test("missing chapters, cross-family refs and cross-category cursors cannot reach another player", async () => {
  const r = boot();
  await plugin.episodes(SPIDER);
  await assert.rejects(plugin.resolve(SPIDER + ":1x8"), { code: "not_found" });
  await assert.rejects(plugin.resolve(SPIDER + ":1x23"), { code: "not_found" });
  await assert.rejects(plugin.episodes("shadow:rider:spider-man"), { code: "not_found" });
  await assert.rejects(plugin.episodes("shadow:tokusatsu:kamen-rider-gavv"), { code: "not_found" });
  const before = r.requests.length;
  await assert.rejects(plugin.browse("category:tokusatsu", "category:super-sentai:offset:100"), { code: "not_found" });
  assert.equal(r.requests.length, before);
  assert.equal(r.captures.length, 0);
});

test("global search includes general tokusatsu titles, while categories remain separate", async () => {
  const r = boot();
  const spider = checked("search", await plugin.search({ q: "Spider Man" }), r).items;
  assert.equal(spider.length, 1);
  assert.equal(spider[0].ref, SPIDER);
  assert.equal(checked("search", await plugin.search({ q: "Tokusatsu" }), r).items.length, 37);
  const riders = checked("search", await plugin.search({ q: "Kamen Rider" }), r).items;
  assert.equal(riders.length, 39);
  assert.equal(riders.find((x) => x.title.includes("Dragon Knight")).ref, "shadow:tokusatsu:kamen-rider-dragon-knight");
  assert.equal((await plugin.browse("category:kamen-rider")).items.length, 38);
  assert.equal(r.requests.length, 3);
});

test("a series shared by categories appears once in global search, preserving its established reference", async () => {
  const real = read("tokusatsu-catalog.html"), shared = /<article\b[\s\S]*?<\/article>/.exec(read("sentai-catalog.html"))[0];
  const r = boot({ catalog: real.replace("</div></div>", shared + "</div></div>") });
  const items = checked("search", await plugin.search({ q: "Gozyuger" }), r).items;
  assert.equal(items.length, 1);
  assert.equal(items[0].ref, "shadow:sentai:no-1-sentai-gozyuger");
  assert.equal((await plugin.browse("category:tokusatsu")).items.length, 38);
});

test("Tokusatsu refresh records its own count and timestamp, retaining the last good state on failure", async () => {
  const r = boot();
  await plugin.section({ tab: "super-sentai" });
  await plugin.browse("category:kamen-rider");
  const before = checkedSettings("settingsStatus", await plugin.settingsStatus());
  assert.equal(before.tokuStatus, "0% · sin carga registrada");
  assert.equal(before.tokuUpdated, "Sin fecha registrada");
  const done = checkedSettings("action", await plugin.action("refreshTokuCatalog"));
  assert.match(done.message, /100% · 37 series de Tokusatsu/);
  const after = checkedSettings("settingsStatus", await plugin.settingsStatus());
  assert.equal(after.catalogUpdated, before.catalogUpdated);
  assert.equal(after.riderUpdated, before.riderUpdated);
  assert.match(after.tokuStatus, /^100% · 37/);
  assert.match(after.tokuUpdated, / UTC$/);
  r.fail([CATEGORY]);
  await assert.rejects(plugin.action("refreshTokuCatalog"), { code: "unavailable" });
  const failed = checkedSettings("settingsStatus", await plugin.settingsStatus());
  assert.match(failed.tokuStatus, /Error.*37 series/);
  assert.equal(failed.tokuUpdated, after.tokuUpdated);
  assert.equal(failed.catalogStatus, before.catalogStatus);
  assert.equal(failed.riderStatus, before.riderStatus);
  assert.equal((await plugin.browse("category:tokusatsu")).items.length, 37);
});

test("temporary failure of the general category does not prevent Sentai and Rider searches", async () => {
  const r = boot({ fail: [CATEGORY] });
  assert.equal(checked("search", await plugin.search({ q: "Gavv" }), r).items[0].ref, "shadow:rider:kamen-rider-gavv");
  assert.equal(checked("search", await plugin.search({ q: "Timeranger" }), r).items[0].ref, "shadow:timeranger");
  await assert.rejects(plugin.search({ q: "Spider Man" }), { code: "unavailable" });
  assert.match((await plugin.settingsStatus()).tokuStatus, /^Error/);
});
