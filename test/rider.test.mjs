import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createKino } from "../sdk/kino-shim.mjs";
import { validateManifest, checkOutput, checkSettingsOutput } from "../sdk/contract.mjs";
import * as plugin from "../plugin.js";

const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
const manifest = validateManifest(read("../kino-plugin.json")).manifest;
const ROOT = "https://shadowrangers.live";
const RIDER = ROOT + "/genero/kamen-rider/", SENTAI = ROOT + "/genero/super-sentai/";
const fixtures = { "kamen-rider": read("rider-original.html"), "kamen-rider-gavv": read("rider-gavv.html"),
  "kamen-rider-my-th": read("rider-my-th.html"), "mirai-sentai-timeranger": read("shadow-series.html") };
const PAGE = ROOT + "/capitulos/kamen-rider-gavv-1x1/";
const VOE = "https://voe.sx/e/lmwguphboixl", LIV = "https://shadowliv.xyz/#ef6vi";
const REF = "shadow:rider:kamen-rider-gavv:1x1";

function boot({ rider = read("rider-catalog.html"), failFamily = null } = {}) {
  const requests = [], captures = [], logs = [];
  let fail = failFamily, riderReply = rider;
  const { kino, servers } = createKino(manifest, { fetchImpl: async (url, options) => {
    url = String(url); requests.push({ url, options });
    if ((url === RIDER && fail === "rider") || (url === SENTAI && fail === "sentai")) throw new Error("synthetic network failure");
    if (url === ROOT + "/genero/tokusatsu/") return new Response(read("tokusatsu-catalog.html"));
    if (url === RIDER) return new Response(riderReply);
    if (url === SENTAI) return new Response(read("sentai-catalog.html"));
    for (const [slug, html] of Object.entries(fixtures)) if (url === ROOT + "/series/" + slug + "/") return new Response(html);
    if (url === PAGE) return new Response(read("rider-gavv-1x1.html"));
    if (url === VOE) return new Response("<html>Dynamic player</html>");
    throw new Error("Unexpected test request: " + url);
  } });
  globalThis.kino = { ...kino, log: (level, message) => logs.push({ level, message }), browser: { capture: async (url, options) => {
    captures.push({ url, options });
    return { media: [{ url: "https://media.example.com/gavv/master.m3u8", headers: { Referer: url, Cookie: "synthetic=1" } }] };
  } } };
  return { kino, servers, requests, captures, logs, setFailure: (f) => { fail = f; }, setRider: (html) => { riderReply = html; } };
}

function checked(fn, value, r) {
  const out = checkOutput(fn, value, manifest, r.servers);
  assert.deepEqual(out.drops, []);
  return out.value;
}
function status(value) {
  const drops = [];
  const out = checkSettingsOutput("settingsStatus", value, manifest, (s) => s, (s) => drops.push(s));
  assert.deepEqual(drops, []);
  return out;
}

test("all 38 published Rider series are unique and chronological, including same-year premieres", async () => {
  const r = boot();
  const items = checked("browse", await plugin.browse("category:kamen-rider"), r).items;
  assert.equal(items.length, 38);
  assert.equal(new Set(items.map((s) => s.ref)).size, 38);
  assert.equal(items[0].title, "Kamen Rider");
  assert.equal(items[0].year, "1971");
  assert.equal(items.at(-1).title, "Kamen Rider MY-TH");
  assert.equal(items.at(-1).year, "2026");
  assert.deepEqual(items.map((s) => Number(s.year)), items.map((s) => Number(s.year)).sort((a, b) => a - b));
  for (const pair of [["kamen-rider-x", "kamen-rider-amazon"], ["kamen-rider-decade", "kamen-rider-w"], ["kamen-rider-geats", "kamen-rider-black-sun"]])
    assert.ok(items.findIndex((s) => s.id === "shadow-" + pair[0]) < items.findIndex((s) => s.id === "shadow-" + pair[1]));
  assert.ok(items.every((s) => s.ref.startsWith("shadow:rider:") && s.genres.includes("Kamen Rider")));
  assert.deepEqual(r.requests.map((x) => x.url), [RIDER]);
  assert.equal(r.captures.length, 0);
});

test("each Rider series exposes its own real chapters rather than the legacy VK catalog", async () => {
  const r = boot();
  await plugin.browse("category:kamen-rider");
  for (const [slug, count, year] of [["kamen-rider", 98, "1971"], ["kamen-rider-gavv", 50, "2024"], ["kamen-rider-my-th", 5, "2026"]]) {
    const data = checked("episodes", await plugin.episodes("shadow:rider:" + slug), r);
    assert.equal(data.series.year, year);
    assert.equal(data.episodes.length, count);
    assert.deepEqual(data.episodes.map((e) => e.number), Array.from({ length: count }, (_, i) => i + 1));
    assert.equal(data.episodes[0].ref, "shadow:rider:" + slug + ":1x1");
  }
  await plugin.episodes("shadow:rider:kamen-rider");
  assert.equal(r.requests.length, 4);
  assert.equal(r.captures.length, 0);
  assert.ok(r.requests.every((x) => x.url.startsWith(ROOT)));
});

test("global searches include Rider and Sentai while Gavv routes to ShadowRangers", async () => {
  const r = boot();
  const gavv = checked("search", await plugin.search({ q: "Gavv" }), r).items;
  assert.equal(gavv.length, 1);
  assert.equal(gavv[0].ref, "shadow:rider:kamen-rider-gavv");
  assert.equal(checked("search", await plugin.search({ q: "Kamen Rider" }), r).items.length, 39);
  assert.equal(checked("search", await plugin.search({ q: "Super Sentai" }), r).items.length, 49);
  assert.equal(checked("search", await plugin.search({ q: "2000" }), r).items.length, 2);
  assert.deepEqual(r.requests.map((x) => x.url), [SENTAI, RIDER, ROOT + "/genero/tokusatsu/"]);
});

test("a temporary failure of one family leaves the other searchable and reports its failed state", async () => {
  const r = boot({ failFamily: "sentai" });
  const items = checked("search", await plugin.search({ q: "Gavv" }), r).items;
  assert.equal(items[0].ref, "shadow:rider:kamen-rider-gavv");
  const states = status(await plugin.settingsStatus());
  assert.match(states.catalogStatus, /^Error/);
  assert.match(states.riderStatus, /^100% · 38/);
  assert.ok(r.logs.some((s) => /SHADOW_SEARCH partial family=sentai/.test(s.message)));
});

test("all unavailable catalogs produce a controlled search error rather than a fake empty result", async () => {
  boot();
  globalThis.kino.fetch = async () => { throw new Error("synthetic offline"); };
  await assert.rejects(plugin.search({ q: "Gavv" }), { code: "unavailable" });
});

test("real Gavv options resolve VOE and attach ShadowLiv to the same Rider chapter", async () => {
  const r = boot();
  const stream = checked("resolve", await plugin.resolve(REF), r);
  assert.equal(stream.label, "Server 2 · VOE");
  assert.equal(r.captures[0].url, VOE);
  assert.equal(r.captures[0].options.headers.Referer, PAGE);
  assert.deepEqual(stream.alternatives, [{ label: "Server 3 · ShadowLiv", ref: REF + ":server:3" }]);
  const alternate = checked("resolve", await plugin.resolve(stream.alternatives[0].ref), r);
  assert.equal(r.captures[1].url, LIV);
  assert.equal(alternate.headers.Cookie, "synthetic=1");
  assert.equal(r.requests.filter((x) => x.url === PAGE).length, 2);
  assert.equal(r.requests.filter((x) => x.url === VOE).length, 1);
  assert.ok(r.requests.every((x) => !x.url.includes("vk.com")));
});

test("cross-family refs, absent chapters and unsupported servers cannot select another video", async () => {
  const r = boot();
  await plugin.episodes("shadow:rider:kamen-rider-gavv");
  await assert.rejects(plugin.episodes("shadow:sentai:kamen-rider-gavv"), { code: "not_found" });
  await assert.rejects(plugin.episodes("shadow:rider:mirai-sentai-timeranger"), { code: "not_found" });
  await assert.rejects(plugin.resolve("shadow:rider:kamen-rider-gavv:1x51"), { code: "not_found" });
  await assert.rejects(plugin.resolve(REF + ":server:1"), { code: "not_found" });
  assert.equal(r.captures.length, 0);
  assert.ok(r.requests.every((x) => x.url.startsWith(ROOT)));
});

test("Rider loading ignores duplicate, foreign and sidebar series cards", async () => {
  const real = read("rider-catalog.html"), card = /<article\b[\s\S]*?<\/article>/.exec(real)[0];
  const rider = real.replace("</div></div>", card + card.replaceAll(ROOT, "https://foreign.example.com") + "</div></div>")
    + '<div class="sidebar right"><article class="item tvshows"><h3><a href="' + ROOT + '/series/mirai-sentai-timeranger/">Timeranger</a></h3><span>2000</span></article></div>';
  const r = boot({ rider });
  assert.equal(checked("browse", await plugin.browse("category:kamen-rider"), r).items.length, 38);
});

test("manual Rider refresh records a real count and date without changing Sentai status", async () => {
  const r = boot();
  await plugin.home();
  const before = status(await plugin.settingsStatus());
  assert.equal(before.riderStatus, "0% · sin carga registrada");
  const message = checkSettingsOutput("action", await plugin.action("refreshRiderCatalog"), manifest);
  assert.match(message.message, /100% · 38 series de Kamen Rider/);
  const after = status(await plugin.settingsStatus());
  assert.equal(after.catalogStatus, before.catalogStatus);
  assert.equal(after.catalogUpdated, before.catalogUpdated);
  assert.match(after.riderStatus, /^100% · 38 series/);
  assert.match(after.riderUpdated, / UTC$/);
  assert.equal(r.requests.filter((x) => x.url === RIDER).length, 1);
  r.setFailure("rider");
  await assert.rejects(plugin.action("refreshRiderCatalog"), { code: "unavailable" });
  const failed = status(await plugin.settingsStatus());
  assert.match(failed.riderStatus, /Error.*38 series/);
  assert.equal(failed.riderUpdated, after.riderUpdated);
  assert.equal(failed.catalogUpdated, before.catalogUpdated);
  assert.equal(checked("browse", await plugin.browse("category:kamen-rider"), r).items.length, 38);
});

test("malformed Rider refresh retains the previous successful list, count and timestamp", async () => {
  const r = boot();
  await plugin.action("refreshRiderCatalog");
  const before = status(await plugin.settingsStatus());
  r.setRider("<html>Changed category format</html>");
  await assert.rejects(plugin.action("refreshRiderCatalog"), { code: "unavailable" });
  const after = status(await plugin.settingsStatus());
  assert.match(after.riderStatus, /Error.*38 series/);
  assert.equal(after.riderUpdated, before.riderUpdated);
  assert.equal((await plugin.browse("category:kamen-rider")).items.length, 38);
});

test("a cold Rider episode lookup shares the native call budget between category and series requests", async () => {
  const r = boot(), fetch = globalThis.kino.fetch, now = Date.now;
  const timeouts = [];
  let elapsed = 0;
  Date.now = () => now() + elapsed;
  globalThis.kino.fetch = async (url, options) => {
    timeouts.push({ url, timeout: options.timeoutMs });
    const reply = await fetch(url, options);
    if (url === RIDER) elapsed += 14000;
    return reply;
  };
  try {
    assert.equal(checked("episodes", await plugin.episodes("shadow:rider:kamen-rider-gavv"), r).episodes.length, 50);
    const series = timeouts.find((x) => x.url.endsWith("/series/kamen-rider-gavv/"));
    assert.ok(series.timeout >= 1000);
    assert.ok(elapsed + series.timeout <= 18500, "series fetch leaves time for returning within the native 20-second call");
  } finally { Date.now = now; }
});
