import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createKino } from "../sdk/kino-shim.mjs";
import { validateManifest, checkOutput } from "../sdk/contract.mjs";
import * as plugin from "../plugin.js";

const manifest = validateManifest(readFileSync(new URL("../kino-plugin.json", import.meta.url), "utf8")).manifest;
const SERIES = "https://shadowrangers.live/series/mirai-sentai-timeranger/";
const EP = "shadow:timeranger:1x1";
const PAGE = "https://shadowrangers.live/capitulos/mirai-sentai-timeranger-1x1/";
const VOE = "https://voe.sx/e/r3lca9vuu12y";
const TARGET = "https://megankiddifference.com/e/r3lca9vuu12y";
const FORMER = "https://teresapoliticallearn.com/e/r3lca9vuu12y";
const FUTURE = "https://next-voe.example.com/e/r3lca9vuu12y";
const LIV = "https://shadowliv.xyz/#i66uf";
const seriesHtml = readFileSync(new URL("shadow-series.html", import.meta.url), "utf8");
const catalogHtml = readFileSync(new URL("sentai-catalog.html", import.meta.url), "utf8");
const episodeHtml = readFileSync(new URL("shadow-1x1.html", import.meta.url), "utf8");

// Synthetic media data encoded in the format observed in the public VOE loader.
// No temporary source credentials or captured cookies are stored in these tests.
function encoded(config) {
  const base = Buffer.from(JSON.stringify(config)).toString("base64").split("").reverse().join("");
  const shifted = [...base].map((c) => String.fromCharCode(c.charCodeAt(0) + 3)).join("");
  const outer = Buffer.from(shifted, "latin1").toString("base64");
  const rot = outer.replace(/[a-z]/gi, (c) => {
    const n = c.charCodeAt(0), b = n <= 90 ? 65 : 97;
    return String.fromCharCode(b + (n - b + 13) % 26);
  });
  return '<script type="application/json">' + JSON.stringify([rot.match(/.{1,4}/g).join("@$" )]) + '</script>';
}

function boot({ series = seriesHtml, page = episodeHtml, config, targetStatus = 200, targetHtml,
  redirect = TARGET, preferred = "voe", capture, captureError, voeStatus = 200, onTarget,
  anyHost = false, futureHtml, httpLocation, futureStatus = 200, futureError } = {}) {
  const requests = [], captures = [], logs = [];
  const data = config || { source: "https://media.example.com/timeranger/master.m3u8?token=synthetic",
    title: "01.mp4", captions: [], check: false };
  const fetchImpl = async (url, options) => {
    url = String(url); requests.push({ url, options });
    if (url === "https://shadowrangers.live/genero/super-sentai/") return new Response(catalogHtml);
    if (url === "https://shadowrangers.live/genero/kamen-rider/") return new Response(readFileSync(new URL("rider-catalog.html", import.meta.url), "utf8"));
    if (url === "https://shadowrangers.live/genero/tokusatsu/") return new Response(readFileSync(new URL("tokusatsu-catalog.html", import.meta.url), "utf8"));
    if (url === SERIES) return new Response(series);
    if (url === PAGE || url === PAGE.replace("1x1", "1x2")) return new Response(page);
    if (url === VOE) return httpLocation
      ? new Response("", { status: 302, headers: { Location: httpLocation } })
      : new Response('<script>window.location.href = ' + JSON.stringify(redirect) + ';</script>', { status: voeStatus });
    if (url === FUTURE) {
      if (futureError) throw Object.assign(new Error("synthetic grant failure"), { code: futureError });
      return new Response(futureHtml === undefined ? encoded(data) : futureHtml, { status: futureStatus });
    }
    if (url === FORMER) return new Response('<script>window.location.href = ' + JSON.stringify(TARGET) + ';</script>');
    if (url === TARGET) {
      if (onTarget) onTarget();
      return new Response(targetHtml === undefined ? encoded(data) : targetHtml, { status: targetStatus });
    }
    throw new Error("Unexpected request");
  };
  // The bundled older shim has no native API 9 grant. Model approval explicitly,
  // with only the synthetic fixture host; production uses Kino's own host gate.
  const { kino, servers } = createKino(anyHost ? { ...manifest, hosts: [...manifest.hosts, "next-voe.example.com"] } : manifest, { fetchImpl });
  globalThis.kino = { ...kino, fetchAnyHost: anyHost,
    fetch: async (url, options) => {
      // Rate limiting is a native gate error, before the HTTP transport is called.
      if (String(url) === FUTURE && futureError) {
        requests.push({ url: String(url), options });
        throw Object.assign(new Error("synthetic native gate failure"), { code: futureError });
      }
      return kino.fetch(url, options);
    }, config: { get: () => preferred },
    log: (level, message) => logs.push({ level, message }), browser: {
      capture: async (url, options) => {
        captures.push({ url, options });
        if (captureError) throw Object.assign(new Error("synthetic browser failure"), { code: captureError });
        return capture || { media: [{ url: "https://media.example.com/shadowliv.mp4", mime: "video/mp4",
          headers: { Referer: LIV, Cookie: "synthetic=test", "User-Agent": "captured-agent" } }] };
      },
    } };
  return { requests, captures, logs, servers };
}

function checked(fn, answer, servers) {
  const result = checkOutput(fn, answer, manifest, servers);
  assert.deepEqual(result.drops, []);
  return result.value;
}

test("recorded Timeranger metadata exposes 50 stable episodes without media requests", async () => {
  const r = boot();
  const home = checked("home", await plugin.home(), r.servers);
  const search = checked("search", await plugin.search({ q: "Timeranger" }), r.servers);
  const timeranger = home[0].items.find((s) => s.ref === "shadow:timeranger");
  assert.ok(timeranger);
  assert.equal(search.items[0].id, timeranger.id);
  const eps = checked("episodes", await plugin.episodes("shadow:timeranger"), r.servers);
  assert.equal(eps.episodes.length, 50);
  assert.deepEqual(eps.episodes.map((e) => e.number), Array.from({ length: 50 }, (_, i) => i + 1));
  assert.equal(eps.episodes[0].ref, EP);
  assert.equal(r.requests.length, 4);
  assert.equal(r.captures.length, 0);
});

test("VOE data decoding returns HLS and leaves ShadowLiv as a lazy labelled copy", async () => {
  const r = boot({ config: { source: "https://media.example.com/main.m3u8?token=synthetic", title: "Capítulo ñ",
    captions: [{ file: "https://media.example.com/es.vtt", language: "es" }] } });
  const s = checked("resolve", await plugin.resolve(EP), r.servers);
  assert.equal(s.mime, "application/vnd.apple.mpegurl");
  assert.equal(s.headers.Referer, TARGET);
  assert.equal(s.label, "Server 2 · VOE");
  assert.deepEqual(s.alternatives, [{ label: "Server 3 · ShadowLiv", ref: EP + ":server:2" }]);
  assert.equal(s.subtitles[0].lang, "es");
  assert.equal(r.captures.length, 0);
  assert.equal(r.requests.length, 4);
  assert.ok(r.requests.every((x) => !x.url.includes("media.example.com")));
  assert.ok(!JSON.stringify(r.logs).includes("token=synthetic"));
});

test("a former VOE mirror navigates to the new public player within three pages", async () => {
  const r = boot({ redirect: FORMER });
  const s = checked("resolve", await plugin.resolve(EP + ":server:1"), r.servers);
  assert.equal(s.headers.Referer, TARGET);
  assert.equal(r.requests.filter((x) => [VOE, FORMER, TARGET].includes(x.url)).length, 3);
  assert.equal(r.captures.length, 0);
});

test("the new domain is recognized when ShadowRangers embeds it directly", async () => {
  const r = boot({ page: episodeHtml.replace(VOE, TARGET) });
  const s = checked("resolve", await plugin.resolve(EP + ":server:1"), r.servers);
  assert.equal(s.headers.Referer, TARGET);
  assert.equal(r.requests.filter((x) => x.url === VOE).length, 0);
  assert.equal(r.captures.length, 0);
});

test("VOE subtitles relative to the new player keep their Spanish label", async () => {
  const r = boot({ config: { source: "https://media.example.com/main.m3u8",
    captions: [{ file: "/captions/episode_es.srt", label: "Spanish, Castilian" }] } });
  const s = checked("resolve", await plugin.resolve(EP + ":server:1"), r.servers);
  assert.deepEqual(s.subtitles, [{ url: "https://megankiddifference.com/captions/episode_es.srt", lang: "es", format: "srt" }]);
});

test("a new-domain redirect cannot switch to a different video", async () => {
  const r = boot({ redirect: "https://megankiddifference.com/e/zzzzzzzzzzzz" });
  await assert.rejects(plugin.resolve(EP + ":server:1"), { code: "unavailable" });
  assert.equal(r.requests.filter((x) => x.url.includes("zzzzzzzzzzzz")).length, 0);
});

test("a selected lazy server loads only ShadowLiv and preserves captured headers", async () => {
  const r = boot();
  const s = checked("resolve", await plugin.resolve(EP + ":server:2"), r.servers);
  assert.equal(s.label, "Server 3 · ShadowLiv");
  assert.equal(s.headers.Cookie, "synthetic=test");
  assert.equal(s.alternatives, undefined);
  assert.deepEqual(r.requests.map((x) => x.url), [SERIES, PAGE]);
  assert.equal(r.captures[0].url, LIV);
  assert.equal(r.captures[0].options.headers.Referer, PAGE);
  assert.equal(r.captures[0].options.timeoutMs, 25000);
});

test("preferred ShadowLiv is loaded first without eagerly resolving VOE", async () => {
  const r = boot({ preferred: "shadowliv" });
  const s = checked("resolve", await plugin.resolve(EP), r.servers);
  assert.equal(s.label, "Server 3 · ShadowLiv");
  assert.deepEqual(s.alternatives, [{ label: "Server 2 · VOE", ref: EP + ":server:1" }]);
  assert.equal(r.requests.length, 2);
});

test("the second recorded episode resolves its own iframe rather than the first episode's", async () => {
  const page = readFileSync(new URL("shadow-1x2.html", import.meta.url), "utf8");
  const r = boot({ page });
  await plugin.resolve("shadow:timeranger:1x2:server:2");
  assert.equal(r.requests[1].url, PAGE.replace("1x1", "1x2"));
  assert.equal(r.captures[0].url, "https://shadowliv.xyz/#1kkxp");
});

test("failed preferred capture falls back once to the independent VOE source", async () => {
  const r = boot({ preferred: "shadowliv", captureError: "blocked" });
  assert.equal((await plugin.resolve(EP)).label, "Server 2 · VOE");
  assert.equal(r.captures.length, 1);
});

test("explicit VOE source has no browser alternative resolved in advance", async () => {
  const r = boot();
  const s = await plugin.resolve(EP + ":server:1");
  assert.equal(s.label, "Server 2 · VOE");
  assert.equal(s.alternatives, undefined);
  assert.equal(r.captures.length, 0);
});

test("changed VOE data uses one bounded capture on the inspected player", async () => {
  const r = boot({ targetHtml: '<script type="application/json">["changed"]</script>' });
  const s = await plugin.resolve(EP + ":server:1");
  assert.equal(s.label, "Server 2 · VOE");
  assert.equal(r.captures.length, 1);
  assert.equal(r.captures[0].url, TARGET);
  assert.equal(r.captures[0].options.timeoutMs, 20000);
});

test("a late player response shortens capture to the remaining resolve budget", async () => {
  const original = Date.now, start = original();
  try {
    Date.now = () => start;
    const r = boot({ targetHtml: '<p>Dynamic player</p>', onTarget: () => { Date.now = () => start + 65000; } });
    await plugin.resolve(EP + ":server:1");
    assert.equal(r.captures.length, 1);
    assert.equal(r.captures[0].options.timeoutMs, 3500);
  } finally { Date.now = original; }
});

for (const restricted of ["<p>Verify you are human</p>", "<p>Please log in to watch</p>"]) {
  test("a restricted VOE player is not captured again: " + restricted, async () => {
    const r = boot({ targetHtml: restricted });
    await assert.rejects(plugin.resolve(EP + ":server:1"), { code: "unavailable" });
    assert.equal(r.captures.length, 0);
  });
}

test("rate limiting stops the call without attempting other providers", async () => {
  const r = boot({ targetStatus: 429 });
  await assert.rejects(plugin.resolve(EP), { code: "rate_limited" });
  assert.equal(r.captures.length, 0);
});

test("unrecognized redirect domains are not fetched", async () => {
  const r = boot({ redirect: "https://unrecognized.example/e/r3lca9vuu12y" });
  await assert.rejects(plugin.resolve(EP + ":server:1"), { code: "unavailable" });
  assert.equal(r.requests.length, 3);
  assert.ok(!r.requests.some((x) => x.url.includes("unrecognized.example")));
});

test("approved general permission follows a future VOE domain without a manifest edit", async () => {
  const r = boot({ redirect: FUTURE, anyHost: true });
  const s = checked("resolve", await plugin.resolve(EP + ":server:1"), r.servers);
  assert.equal(s.headers.Referer, FUTURE);
  assert.ok(!manifest.hosts.includes("next-voe.example.com"));
  assert.equal(r.requests.filter((x) => x.url === FUTURE).length, 1);
  assert.equal(r.captures.length, 0);
});

for (const permission of [false, undefined]) {
  test("an unapproved or unavailable general permission never follows a new host: " + permission, async () => {
    const r = boot({ redirect: FUTURE, anyHost: permission });
    globalThis.kino.fetchAnyHost = permission;
    await assert.rejects(plugin.resolve(EP + ":server:1"), { code: "unavailable" });
    assert.equal(r.requests.filter((x) => x.url === FUTURE).length, 0);
    assert.equal(r.captures.length, 0);
  });
}

test("HTTP navigation is inspected manually and retains the video's current Referer", async () => {
  const r = boot({ httpLocation: FUTURE, anyHost: true });
  const s = checked("resolve", await plugin.resolve(EP + ":server:1"), r.servers);
  assert.equal(s.headers.Referer, FUTURE);
  assert.ok(r.requests.filter((x) => [VOE, FUTURE].includes(x.url)).every((x) => x.options.redirect === "manual"));
});

test("a relative HTTP navigation stays on the same video", async () => {
  const r = boot({ httpLocation: "//megankiddifference.com/e/r3lca9vuu12y" });
  assert.equal((await plugin.resolve(EP + ":server:1")).headers.Referer, TARGET);
});

for (const target of ["http://next-voe.example.com/e/r3lca9vuu12y", "https://next-voe.example.com:8443/e/r3lca9vuu12y",
  "https://127.0.0.1/e/r3lca9vuu12y", "https://router.local/e/r3lca9vuu12y",
  "https://next-voe.example.com/e/zzzzzzzzzzzz", FUTURE + "?ad=1", FUTURE + "#ad"]) {
  test("even an approved grant refuses an unrelated or unsafe HTTP navigation: " + target, async () => {
    const r = boot({ httpLocation: target, anyHost: true });
    await assert.rejects(plugin.resolve(EP + ":server:1"), { code: "unavailable" });
    assert.equal(r.requests.length, 3);
    assert.equal(r.captures.length, 0);
  });
}

test("a cycle back from a new mirror does not repeat a request or start capture", async () => {
  const r = boot({ redirect: FUTURE, anyHost: true,
    futureHtml: '<script>window.location.href = ' + JSON.stringify(VOE) + ';</script>' });
  await assert.rejects(plugin.resolve(EP + ":server:1"), { code: "unavailable" });
  assert.equal(r.requests.filter((x) => x.url === VOE).length, 1);
  assert.equal(r.requests.filter((x) => x.url === FUTURE).length, 1);
  assert.equal(r.captures.length, 0);
});

test("a dynamic player on the discovered domain captures only after approval", async () => {
  const r = boot({ redirect: FUTURE, anyHost: true, futureHtml: "<p>Dynamic player</p>" });
  await plugin.resolve(EP + ":server:1");
  assert.equal(r.captures.length, 1);
  assert.equal(r.captures[0].url, FUTURE);
});

test("native rate limits on a new host stop resolution without retrying", async () => {
  const r = boot({ redirect: FUTURE, anyHost: true, futureError: "rate_limited" });
  await assert.rejects(plugin.resolve(EP), { code: "rate_limited" });
  assert.equal(r.captures.length, 0);
  assert.equal(r.requests.filter((x) => x.url === FUTURE).length, 1);
});

test("a new-domain player still refuses a human verification page", async () => {
  const r = boot({ redirect: FUTURE, anyHost: true, futureHtml: "<p>Verify you are human</p>" });
  await assert.rejects(plugin.resolve(EP + ":server:1"), { code: "unavailable" });
  assert.equal(r.captures.length, 0);
});

test("a new iframe explicitly labelled VOE is recognized only with the general grant", async () => {
  const page = episodeHtml.replace(VOE, FUTURE).replace(">Server 2</span>", ">VOE</span>");
  const r = boot({ page, anyHost: true });
  const s = checked("resolve", await plugin.resolve(EP + ":server:1"), r.servers);
  assert.equal(s.headers.Referer, FUTURE);
  assert.ok(!r.requests.some((x) => x.url === VOE));
  boot({ page, anyHost: false });
  await assert.rejects(plugin.resolve(EP + ":server:1"), { code: "not_found" });
});

test("a generic iframe label never identifies an unknown site as VOE", async () => {
  const r = boot({ page: episodeHtml.replace(VOE, FUTURE), anyHost: true });
  await assert.rejects(plugin.resolve(EP + ":server:1"), { code: "not_found" });
  assert.equal(r.requests.length, 2);
});

test("a native host rejection remains a rejection even with the general grant", async () => {
  const r = boot({ redirect: FUTURE, anyHost: true, futureError: "host_not_allowed" });
  await assert.rejects(plugin.resolve(EP + ":server:1"), { code: "unavailable" });
  assert.equal(r.captures.length, 0);
  assert.equal(r.requests.filter((x) => x.url === FUTURE).length, 1);
});

test("unknown, duplicated and unsafe iframe sources are not followed", async () => {
  const unsafe = episodeHtml.replace("https://voe.sx/e/r3lca9vuu12y", "https://127.0.0.1/e/r3lca9vuu12y")
    .replace(LIV, "https://unrecognized.example/#i66uf");
  const r = boot({ page: unsafe });
  await assert.rejects(plugin.resolve(EP), { code: "not_found" });
  assert.equal(r.captures.length, 0);
  assert.equal(r.requests.length, 2);
});

test("replaying an episode refreshes iframe data without caching media URLs", async () => {
  const r = boot();
  await plugin.resolve(EP); await plugin.resolve(EP);
  assert.equal(r.requests.filter((x) => x.url === SERIES).length, 1);
  assert.equal(r.requests.filter((x) => x.url === PAGE).length, 2);
  assert.equal(r.requests.filter((x) => x.url === TARGET).length, 2);
});

test("removed server refs do not select a different server", async () => {
  const r = boot();
  await assert.rejects(plugin.resolve(EP + ":server:9"), { code: "not_found" });
  assert.equal(r.requests.length, 2);
  assert.equal(r.captures.length, 0);
});

test("invalid references make no requests; missing catalog is a controlled failure", async () => {
  const r = boot();
  for (const ref of ["shadow:timeranger:0x1", "shadow:timeranger:1x0", "shadow:timeranger:1x1/../../", "shadow:https://example.com/"]) {
    await assert.rejects(plugin.resolve(ref), { code: "not_found" });
  }
  assert.equal(r.requests.length, 0);
  boot({ series: '<p>No episodes</p>' });
  await assert.rejects(plugin.episodes("shadow:timeranger"), { code: "unavailable" });
});
