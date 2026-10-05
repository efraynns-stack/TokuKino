import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validate } from "../sdk/validate.mjs";
import { createKino } from "../sdk/kino-shim.mjs";
import { checkOutput, validateManifest } from "../sdk/contract.mjs";
import * as plugin from "../plugin.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixtures = fileURLToPath(new URL("source-fixtures.json", import.meta.url));
const manifest = validateManifest(readFileSync(root + "kino-plugin.json", "utf8")).manifest;
const tape = JSON.parse(readFileSync(fixtures, "utf8"));
const apiBody = Buffer.from(tape[0].body, "base64").toString("utf8");
const API = "https://ulsapi.unlimiteds.workers.dev/search?q=Gavv";
const EP = "episode:kamen-rider-gavv-s39e01";
const EMBED = "https://vk.com/video_ext.php?oid=-229718195&id=456239339&hash=344941078a42a3be";
const EPISODE_PAGE = "https://www.subsunlimiteds.com/series/kamen-rider-gavv/kamen-rider-gavv-s39e01";
const shadowSeries = readFileSync(root + "test/shadow-series.html", "utf8");
const riderCatalog = readFileSync(root + "test/rider-catalog.html", "utf8");
const sentaiCatalog = readFileSync(root + "test/sentai-catalog.html", "utf8");

function boot({ html = "<html>Dynamic player</html>", status = 200, browser, api = apiBody, apiStatus = 200, vkFails = false } = {}) {
  const requests = [], captures = [], logs = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url) === "https://shadowrangers.live/genero/kamen-rider/") return new Response(riderCatalog);
    if (String(url) === "https://shadowrangers.live/genero/tokusatsu/") return new Response(readFileSync(root + "test/tokusatsu-catalog.html", "utf8"));
    if (String(url) === API) return new Response(api, { status: apiStatus, headers: { "Content-Type": "application/json" } });
    if (String(url) === "https://shadowrangers.live/series/mirai-sentai-timeranger/") return new Response(shadowSeries);
    if (String(url) === "https://shadowrangers.live/genero/super-sentai/") return new Response(sentaiCatalog);
    if (/^https:\/\/(?:vk\.com|vkvideo\.ru)\/video_ext\.php\?/.test(String(url))) {
      if (vkFails) throw new Error("synthetic network failure");
      return new Response(html, { status, headers: { "Content-Type": "text/html" } });
    }
    throw new Error("Unexpected request: " + url);
  };
  const { kino, servers } = createKino(manifest, { fetchImpl });
  const capture = async (url, options) => {
    captures.push({ url, options });
    if (browser instanceof Error) throw browser;
    const answer = browser || { media: [] };
    // Model the documented native URL filter. This still does not run a WebView.
    const match = options.match && new RegExp(options.match, "i");
    return { ...answer, media: match ? (answer.media || []).filter((m) => match.test(m.url)) : answer.media };
  };
  const testKino = { ...kino, browser: { capture }, log: (level, message) => logs.push({ level, message }) };
  globalThis.kino = testKino;
  return { requests, captures, logs, servers, kino: testKino };
}

function checked(fn, value, servers) {
  const out = checkOutput(fn, value, manifest, servers);
  assert.deepEqual(out.drops, []);
  return out.value;
}

// These player samples are synthetic parser tests, not live VK recordings.
function player(params, suffix = "") {
  return '<script>const playerParams = ' + JSON.stringify({ params: [params], nested: { braces: '} " {' } }) + ';\n' + suffix + '</script>';
}

test("manifest and declared exports are accepted", async () => {
  const result = await validate(root);
  assert.deepEqual(result.problems, []);
  assert.equal(manifest.apiVersion, 6);
  assert.equal(manifest.browser, true);
});

for (const [fn, args] of [["search", ["Gavv"]], ["home", []], ["episodes", ["series:kamen-rider-gavv"]]]) {
  test(fn + " replays the real API response without dropping output", async () => {
    const result = await validate(root, { run: fn, args, replay: fixtures });
    assert.deepEqual(result.problems, []);
    assert.deepEqual(result.drops, []);
    if (fn === "episodes") {
      assert.equal(result.output.episodes.length, 50);
      assert.deepEqual(result.output.episodes.map((e) => e.number), Array.from({ length: 50 }, (_, i) => i + 1));
      assert.ok(result.output.episodes.every((e) => e.season === 1));
    }
  });
}

test("empty searches make no requests; irrelevant searches query all three categories", async () => {
  const r = boot();
  assert.deepEqual(await plugin.search({ q: "" }), []);
  assert.deepEqual(await plugin.search({ q: "***" }), []);
  assert.equal(r.requests.length, 0);
  assert.deepEqual(await plugin.search({ q: "Ultraman" }), []);
  assert.equal(r.requests.length, 3);
});

test("stable refs and metadata cache; playback refreshes the public source", async () => {
  const r = boot({ html: player({ url720: "https://cdn.example.com/gavv.mp4" }) });
  const rows = await plugin.home();
  const results = await plugin.search({ q: "Gavv" });
  const eps = await plugin.episodes("series:kamen-rider-gavv");
  assert.equal(rows[0].items[0].title, "Himitsu Sentai Goranger");
  assert.equal(results[0].id, "shadow-kamen-rider-gavv");
  assert.equal(r.requests.filter((x) => x.url === API).length, 1);
  await plugin.resolve(eps.episodes[0].ref);
  assert.equal(r.requests.filter((x) => x.url === API).length, 2);
  assert.equal(r.captures.length, 0);
  assert.equal(r.requests.at(-1).url, EMBED);
});

test("balanced player JSON preserves escaped URLs, subtitles and fallback qualities", async () => {
  const r = boot({ html: player({
    hls: "https://cdn.example.com/master.m3u8?x=1&y=2",
    url1080: "https://cdn.example.com/1080.mp4",
    url720: "https://cdn.example.com/720.mp4",
    note: 'Nested } braces { and \\" quotes',
    subs: [{ url: "https://cdn.example.com/es.vtt", lang: "es" }],
  }) });
  const stream = checked("resolve", await plugin.resolve(EP), r.servers);
  assert.equal(stream.mime, "application/vnd.apple.mpegurl");
  assert.equal(stream.url, "https://cdn.example.com/master.m3u8?x=1&y=2");
  assert.equal(stream.headers.Referer, EMBED);
  assert.equal(stream.subtitles[0].lang, "es");
  assert.equal(stream.alternatives.length, 2);
  assert.equal(r.captures.length, 0);
});

test("1080p is preferred to 2160p and malformed/protected sources are ignored", async () => {
  const r = boot({ html: player({
    url2160: "https://cdn.example.com/2160.mp4", url1080: "https://cdn.example.com/1080.mp4",
    url720: "https://127.0.0.1/private.mp4", url480: "javascript:alert(1)",
    hls: "https://cdn.example.com:8443/master.m3u8", dash: "https://cdn.example.com/drm.mpd",
  }) });
  const s = checked("resolve", await plugin.resolve(EP), r.servers);
  assert.equal(s.url, "https://cdn.example.com/1080.mp4");
  assert.equal(s.alternatives.length, 1);
});

test("VK Video episodes keep their source host and public hash", async () => {
  const r = boot({ html: player({ url720: "https://cdn.example.com/26.mp4" }) });
  await plugin.resolve("episode:kamen-rider-gavv-s39e26");
  assert.match(r.requests.at(-1).url, /^https:\/\/vkvideo\.ru\/video_ext\.php\?/);
  assert.ok(r.requests.at(-1).url.includes("hash=58894dc4f4ff9c1c"));
});

test("one browser capture preserves playback headers and does not fetch the video", async () => {
  const headers = { Referer: EMBED, "User-Agent": "captured-agent", Cookie: "synthetic=test" };
  const r = boot({ browser: {
    media: [{ url: "https://cdn.example.com/v.mp4", mime: "video/mp4", headers },
      { url: "https://cdn.example.com/alt.mp4", mime: "video/mp4", headers }],
    subtitles: [{ url: "https://cdn.example.com/sub.vtt" }],
  } });
  const s = checked("resolve", await plugin.resolve(EP), r.servers);
  assert.deepEqual(s.headers, headers);
  assert.equal(s.alternatives.length, 1);
  assert.equal(s.subtitles[0].lang, "es");
  assert.equal(r.captures.length, 1);
  assert.equal(r.captures[0].url, EPISODE_PAGE);
  assert.equal(r.captures[0].options.headers.Referer, "https://www.subsunlimiteds.com/series/kamen-rider-gavv");
  assert.equal(r.captures[0].options.timeoutMs, 25000);
  assert.equal(r.captures[0].options.autoplay, true);
  assert.ok(r.captures[0].options.match.length <= 500);
  assert.equal(r.requests.length, 2);
  assert.ok(r.requests.every((request) => request.options.method === "GET"));
  assert.ok(r.requests.every((request) => !request.url.includes("al_video.php")));
  assert.ok(r.logs.some((l) => l.message === "ULS_RESOLVE fallback=web_page version=0.3.2"));
  assert.ok(r.logs.some((l) => l.message.includes("ULS_CAPTURE started version=" + manifest.version + " mode=web")));
});

test("a failed plain VK request can capture the real source page once", async () => {
  const r = boot({ vkFails: true, browser: { media: [{ url: "https://cdn.example.com/video.mp4" }] } });
  assert.ok((await plugin.resolve(EP)).url);
  assert.equal(r.captures.length, 1);
});

test("the original iframe rate limit or protected stream ends before opening a browser", async () => {
  for (const opts of [
    { status: 429 },
    { html: player({ drm: true, url720: "https://cdn.example.com/protected.mp4" }) },
  ]) {
    const r = boot(opts);
    await assert.rejects(plugin.resolve(EP), (e) => ["rate_limited", "unavailable"].includes(e.code));
    assert.equal(r.requests.length, 2);
    assert.equal(r.captures.length, 0);
  }
});

for (const html of ["<p>Verify you are human</p>", "<p>Please log in to watch</p>", "<p>The video has been deleted.</p>"]) {
  test("a restricted player ends cleanly without capture: " + html, async () => {
    const r = boot({ html });
    await assert.rejects(plugin.resolve(EP), (e) => ["unavailable", "not_found"].includes(e.code));
    assert.equal(r.captures.length, 0);
  });
}

for (const code of ["blocked", "timeout", "busy", "browser_unavailable", "not_allowed"]) {
  test("browser " + code + " produces one controlled error without retrying", async () => {
    const e = Object.assign(new Error("synthetic " + code), { code });
    const r = boot({ browser: e });
    await assert.rejects(plugin.resolve(EP), (err) => err.code === "unavailable");
    assert.equal(r.captures.length, 1);
  });
}

test("a capture without a usable video keeps the specific failure detail", async () => {
  const r = boot({ browser: { media: [{ url: "http://127.0.0.1/video.mp4" }] } });
  await assert.rejects(plugin.resolve(EP), { code: "unavailable", message: "VK no entregó un enlace de video" });
  assert.equal(r.captures.length, 1);
  assert.equal(r.requests.length, 2);
});

for (const url of [
  "https://vkvd17.mycdn.me/?expires=1900000000000&srcAg=CHROME&type=5&sig=synthetic&id=12345",
  "https://vkvd111.mycdn.me/expires/1900000000000/srcAg/CHROME/type/2/sig/synthetic/id/12345/video/",
]) {
  test("a signed VK video without an extension survives the capture filter: " + new URL(url).pathname, async () => {
    const headers = { Referer: EMBED, Cookie: "synthetic=test" };
    const r = boot({ browser: { media: [{ url, headers }] } });
    const stream = checked("resolve", await plugin.resolve(EP), r.servers);
    assert.equal(stream.url, url);
    assert.equal(stream.mime, "video/mp4");
    assert.deepEqual(stream.headers, headers);
    assert.equal(r.captures.length, 1);
  });
}

test("VK-specific matching excludes ordinary assets and keeps standard manifests", async () => {
  const url = "https://cdn.example.com/master.m3u8";
  const r = boot({ browser: { media: [
    { url: "https://vkvd17.mycdn.me/poster.jpg" },
    { url: "https://vkvd17.mycdn.me/?id=12345" },
    { url: "https://vkvd17.mycdn.me/?expires=1900000000000" },
    { url: "https://vkvd17.mycdn.me.evil.example/?expires=1900000000000&id=12345" },
    { url: "https://vkvd17.mycdn.me/script.js?expires=1900000000000&id=12345" },
    { url, mime: "application/vnd.apple.mpegurl" },
  ] } });
  const stream = checked("resolve", await plugin.resolve(EP), r.servers);
  assert.equal(stream.url, url);
  assert.equal(stream.alternatives, undefined);
  assert.equal(r.captures.length, 1);
});

test("bad references make no calls; absent and upcoming episodes cannot play", async () => {
  const r = boot();
  await assert.rejects(plugin.episodes("series:other"), { code: "not_found" });
  await assert.rejects(plugin.resolve("https://example.com/video"), { code: "not_found" });
  assert.equal(r.requests.length, 0);
  const data = JSON.parse(apiBody);
  const gavv = data.results.find((s) => s.ID === "kamen-rider-gavv");
  gavv.episodes[0].episodeURL = "";
  const future = boot({ api: JSON.stringify(data) });
  assert.equal((await plugin.episodes("series:kamen-rider-gavv")).episodes.length, 49);
  await assert.rejects(plugin.resolve(EP), { code: "not_found" });
  assert.equal(future.captures.length, 0);
});

test("API failures and invalid responses never become a fake empty catalog", async () => {
  for (const opts of [{ api: "not JSON" }, { api: '{}' }, { api: '{"results":[]}' }, { apiStatus: 429 }]) {
    boot(opts);
    await assert.rejects(plugin.episodes("series:kamen-rider-gavv"), (e) => ["unavailable", "not_found", "rate_limited"].includes(e.code));
  }
});
