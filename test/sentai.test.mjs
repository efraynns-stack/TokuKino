import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createKino } from "../sdk/kino-shim.mjs";
import { validateManifest, checkOutput } from "../sdk/contract.mjs";
import * as plugin from "../plugin.js";

const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
const manifest = validateManifest(read("../kino-plugin.json")).manifest;
const CATEGORY = "https://shadowrangers.live/genero/super-sentai/";
const ROOT = "https://shadowrangers.live";
const GORANGER = "himitsu-sentai-goranger", GOZYUGER = "no-1-sentai-gozyuger", TIMERANGER = "mirai-sentai-timeranger";
const fixtures = { [GORANGER]: read("sentai-goranger.html"), [GOZYUGER]: read("sentai-gozyuger.html"),
  [TIMERANGER]: read("shadow-series.html") };
const gavv = Buffer.from(JSON.parse(read("source-fixtures.json"))[0].body, "base64").toString("utf8");

function boot({ catalog = read("sentai-catalog.html"), pages = {}, onFetch } = {}) {
  const requests = [], captures = [];
  const { kino, servers } = createKino(manifest, { fetchImpl: async (url, options) => {
    url = String(url); requests.push({ url, options });
    if (onFetch) onFetch(url);
    if (url === ROOT + "/genero/kamen-rider/") return new Response(read("rider-catalog.html"));
    if (url === CATEGORY) return new Response(catalog);
    if (url === "https://ulsapi.unlimiteds.workers.dev/search?q=Gavv") return new Response(gavv);
    if (pages[url] !== undefined) return new Response(pages[url]);
    for (const [slug, html] of Object.entries(fixtures)) {
      if (url === ROOT + "/series/" + slug + "/") return new Response(html);
    }
    throw new Error("Unexpected test request: " + url);
  } });
  globalThis.kino = { ...kino, log() {}, browser: { capture: async (url, options) => {
    captures.push({ url, options });
    return { media: [{ url: "https://media.example.com/selected/master.m3u8", headers: { Referer: url } }] };
  } } };
  return { requests, captures, servers, kino };
}

function checked(fn, value, servers) {
  const out = checkOutput(fn, value, manifest, servers);
  assert.deepEqual(out.drops, []);
  return out.value;
}

test("all 49 recorded Sentai series appear individually, oldest first, without episode or player calls", async () => {
  const r = boot();
  const rows = checked("home", await plugin.home(), r.servers);
  const items = rows.flatMap((row) => row.items);
  assert.equal(items.length, 49);
  assert.equal(new Set(items.map((s) => s.id)).size, 49);
  assert.equal(new Set(items.map((s) => s.ref)).size, 49);
  assert.equal(items[0].title, "Himitsu Sentai Goranger");
  assert.equal(items[0].year, "1975");
  assert.equal(items.at(-1).title, "No. 1 Sentai Gozyuger");
  assert.equal(items.at(-1).year, "2025");
  assert.deepEqual(items.map((s) => Number(s.year)), items.map((s) => Number(s.year)).sort((a, b) => a - b));
  assert.equal(items.find((s) => s.year === "2000").ref, "shadow:timeranger");
  assert.deepEqual(r.requests.map((x) => x.url), [CATEGORY]);
  assert.equal(r.captures.length, 0);
});

test("sidebar recommendations, foreign hosts and duplicate cards never contaminate the genre", async () => {
  const original = read("sentai-catalog.html");
  const one = /<article\b[\s\S]*?<\/article>/.exec(original)[0];
  const injected = original.replace('</div></div>', one + one.replaceAll(ROOT, 'https://foreign.example.com') + '</div></div>')
    + '<div class="sidebar right"><article class="item tvshows"><h3><a href="' + ROOT + '/series/kamen-rider-x/">Kamen Rider X</a></h3><span>1974</span></article></div>';
  const r = boot({ catalog: injected });
  const items = checked("home", await plugin.home(), r.servers)[0].items;
  assert.equal(items.length, 49);
  assert.ok(items.every((s) => !s.title.includes("Kamen Rider")));
});

test("search finds every series and romanization variants, reusing category metadata", async () => {
  const r = boot();
  await plugin.home();
  for (const [q, expected] of [["Goranger", "Himitsu Sentai Goranger"], ["Gozyuger", "No. 1 Sentai Gozyuger"],
    ["Avataro Donbrothers", "Avatarō Sentai Donbrothers"], ["1977", "J.A.K.Q. Dengekitai"]]) {
    const found = checked("search", await plugin.search({ q }), r.servers).items;
    assert.equal(found.length, 1);
    assert.equal(found[0].title, expected);
  }
  assert.equal(checked("search", await plugin.search({ q: "Super Sentai" }), r.servers).items.length, 49);
  assert.equal((await plugin.search({ q: "Unknown", altTitles: ["Timeranger"] }))[0].ref, "shadow:timeranger");
  assert.deepEqual(r.requests.map((x) => x.url), [CATEGORY, ROOT + "/genero/kamen-rider/"]);
});

test("each real series opens its own ordered chapters, and Timeranger refs remain stable", async () => {
  const r = boot();
  const cards = (await plugin.home())[0].items;
  for (const [slug, count, year] of [[GORANGER, 84, "1975"], [TIMERANGER, 50, "2000"], [GOZYUGER, 49, "2025"]]) {
    const card = cards.find((s) => s.id === "shadow-" + slug);
    const data = checked("episodes", await plugin.episodes(card.ref), r.servers);
    assert.equal(data.series.title, card.title);
    assert.equal(data.series.year, year);
    assert.equal(data.episodes.length, count);
    assert.deepEqual(data.episodes.map((e) => e.number), Array.from({ length: count }, (_, i) => i + 1));
    assert.equal(data.episodes[0].ref, (slug === TIMERANGER ? "shadow:timeranger" : "shadow:sentai:" + slug) + ":1x1");
  }
  await plugin.episodes(cards[0].ref);
  assert.equal(r.requests.length, 4);
  assert.equal(r.captures.length, 0);
});

test("generic playback and lazy refs stay attached to the selected series and episode", async () => {
  // Synthetic provider fixtures exercise routing without storing real media URLs.
  const page = ROOT + "/capitulos/" + GORANGER + "-1x84/";
  const voe = "https://voe.sx/e/abcdefgh1234", liv = "https://shadowliv.xyz/#fixture84";
  const html = '<li data-nume="1"><span class="title">Server 2</span></li><li data-nume="2"><span class="title">Server 3</span></li>'
    + '<div id="source-player-1"><div class="pframe"><iframe src="' + voe + '"></iframe></div></div><div id="source-player-2"><div class="pframe"><iframe src="' + liv + '"></iframe></div></div>';
  const r = boot({ pages: { [page]: html, [voe]: "<html>Dynamic player</html>" } });
  await plugin.episodes("shadow:sentai:" + GOZYUGER);
  const ref = "shadow:sentai:" + GORANGER + ":1x84";
  const stream = checked("resolve", await plugin.resolve(ref), r.servers);
  assert.equal(stream.label, "Server 2 · VOE");
  assert.equal(r.captures[0].url, voe);
  assert.equal(r.captures[0].options.headers.Referer, page);
  assert.deepEqual(stream.alternatives, [{ label: "Server 3 · ShadowLiv", ref: ref + ":server:2" }]);
  await plugin.resolve(stream.alternatives[0].ref);
  assert.equal(r.captures[1].url, liv);
  assert.equal(r.requests.filter((x) => x.url === page).length, 2);
  assert.equal(r.requests.filter((x) => x.url === voe).length, 1);
});

test("unpublished series, absent episodes and path injection cannot reach a player", async () => {
  const r = boot();
  await assert.rejects(plugin.episodes("shadow:sentai:unpublished"), { code: "not_found" });
  await assert.rejects(plugin.resolve("shadow:sentai:" + GORANGER + ":1x85"), { code: "not_found" });
  const count = r.requests.length;
  for (const ref of ["shadow:sentai:../series:1x1", "shadow:sentai:" + GORANGER + ":0x1", "shadow:sentai:" + GORANGER + ":1x1:server:0"]) {
    await assert.rejects(plugin.resolve(ref), { code: "not_found" });
  }
  assert.equal(r.requests.length, count);
  assert.equal(r.captures.length, 0);
});

test("real Goranger player options retain their own server ids, excluding VK and Goodstream", async () => {
  const page = ROOT + "/capitulos/" + GORANGER + "-1x1/";
  const voe = "https://voe.sx/e/32onpc2nzayy";
  const r = boot({ pages: { [page]: read("sentai-goranger-1x1.html"), [voe]: "<html>Dynamic player</html>" } });
  const ref = "shadow:sentai:" + GORANGER + ":1x1";
  const stream = checked("resolve", await plugin.resolve(ref), r.servers);
  assert.equal(stream.label, "Server 2 · VOE");
  assert.equal(r.captures[0].url, voe);
  assert.deepEqual(stream.alternatives, [{ label: "Server 3 · ShadowLiv", ref: ref + ":server:3" }]);
  assert.ok(r.requests.every((x) => !/vk\.com|goodstream/.test(x.url)));
  await plugin.resolve(stream.alternatives[0].ref);
  assert.equal(r.captures[1].url, "https://shadowliv.xyz/#wrakj");
});

test("an expired series is fetched again even when another series refreshes the storage TTL", async () => {
  const r = boot(), now = Date.now;
  let tick = now();
  Date.now = () => tick;
  try {
    await plugin.episodes("shadow:sentai:" + GORANGER);
    tick += 4 * 60 * 1000;
    await plugin.episodes("shadow:sentai:" + GOZYUGER);
    tick += 2 * 60 * 1000;
    await plugin.episodes("shadow:sentai:" + GORANGER);
    assert.equal(r.requests.filter((x) => x.url === ROOT + "/series/" + GORANGER + "/").length, 2);
  } finally { Date.now = now; }
});

test("missing or restricted genre pages give a controlled error rather than an empty catalog", async () => {
  for (const catalog of ["<html>No catalog</html>", "<p>Verify you are human</p>", '<div class="content right full"></div>']) {
    const r = boot({ catalog });
    await assert.rejects(plugin.home(), { code: "unavailable" });
    assert.equal(r.requests.length, 1);
    assert.equal(r.captures.length, 0);
  }
});

test("the two category tiles expose the supplied artwork without any network call", async () => {
  const r = boot();
  const tiles = checked("categories", await plugin.categories(), r.servers);
  assert.deepEqual(tiles.map((t) => [t.title, t.ref]), [["Super Sentai", "category:super-sentai"], ["Kamen Rider", "category:kamen-rider"]]);
  assert.ok(tiles[0].art.endsWith("/assets/super-sentai.jpg"));
  assert.ok(tiles[1].art.endsWith("/assets/kamen-rider.jpg"));
  assert.equal(r.requests.length, 0);
});

test("category browsing isolates all Sentai series from all Rider series", async () => {
  const r = boot();
  const sentai = checked("browse", await plugin.browse("category:super-sentai", null), r.servers);
  const rider = checked("browse", await plugin.browse("category:kamen-rider", null), r.servers);
  assert.equal(sentai.items.length, 49);
  assert.equal(sentai.items[0].year, "1975");
  assert.equal(sentai.next, null);
  assert.equal(rider.items.length, 38);
  assert.equal(rider.items[0].ref, "shadow:rider:kamen-rider");
  assert.equal(rider.next, null);
  assert.ok(sentai.items.every((i) => i.ref !== rider.items[0].ref));
  assert.equal(r.requests.length, 2);
});

test("unknown categories and cursors from another category are rejected before network access", async () => {
  const r = boot();
  for (const [ref, cursor] of [["category:unknown", null], ["category:super-sentai", "category:kamen-rider:offset:100"],
    ["category:super-sentai", "category:super-sentai:offset:-1"], ["category:kamen-rider", 100]]) {
    await assert.rejects(plugin.browse(ref, cursor), { code: "not_found" });
  }
  assert.equal(r.requests.length, 0);
});

test("the Toku Kino section has separate tabs with category-specific rows and artwork", async () => {
  const r = boot();
  const sentai = checked("section", await plugin.section({ tab: null }), r.servers);
  const rider = checked("section", await plugin.section({ tab: "kamen-rider" }), r.servers);
  assert.deepEqual(sentai.tabs.map((t) => t.label), ["Super Sentai", "Kamen Rider"]);
  assert.equal(sentai.tab, "super-sentai");
  assert.equal(sentai.rows[0].items.length, 49);
  assert.equal(sentai.rows[0].ref, "category:super-sentai");
  assert.equal(rider.tab, "kamen-rider");
  assert.equal(rider.rows[0].ref, "category:kamen-rider");
  assert.equal(rider.rows[0].items[0].ref, "shadow:rider:kamen-rider");
  assert.notEqual(sentai.hero.image, rider.hero.image);
  assert.equal((await plugin.section({ tab: "unknown" })).tab, "super-sentai");
  assert.equal(r.requests.length, 2);
});
