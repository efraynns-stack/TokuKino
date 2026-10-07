import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createKino } from "../sdk/kino-shim.mjs";
import { validateManifest, checkOutput, checkSettingsOutput } from "../sdk/contract.mjs";
import * as plugin from "../plugin.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const manifest = validateManifest(read("../kino-plugin.json")).manifest;
const SERIES = "mirai-sentai-timeranger", OTHER = "himitsu-sentai-goranger";
const TREE = "https://api.github.com/repos/efraynns-stack/TokuKino/git/trees/HEAD?recursive=1";
const BASE = "https://raw.githubusercontent.com/efraynns-stack/TokuKino/HEAD/assets/sentai/";
const sha = "a".repeat(40), changed = "b".repeat(40);
const blob = (path, hash = sha) => ({ path, sha: hash, type: "blob", size: 12345 });
const tree = (entries) => ({ truncated: false, tree: entries });

function boot(initial = tree([])) {
  let payload = initial, status = 200;
  const requests = [];
  const { kino, servers } = createKino(manifest, { fetchImpl: async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url) === TREE) return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), { status });
    if (String(url) === "https://shadowrangers.live/series/" + SERIES + "/") return new Response(read("shadow-series.html"));
    const family = { "super-sentai": "sentai", "kamen-rider": "rider", tokusatsu: "tokusatsu" }[String(url).split("/").filter(Boolean).at(-1)];
    if (family) return new Response(read(family + "-catalog.html"));
    throw new Error("Unexpected fixture request");
  } });
  globalThis.kino = { ...kino, log() {} };
  return { kino, servers, requests, reply: (next, code = 200) => { payload = next; status = code; } };
}

function checked(fn, value, runtime) {
  if (fn === "action" || fn === "settingsStatus") {
    const drops = [];
    const answer = checkSettingsOutput(fn, value, manifest, (s) => s, (s) => drops.push(s));
    assert.deepEqual(drops, []);
    return answer;
  }
  const answer = checkOutput(fn, value, manifest, runtime.servers);
  assert.deepEqual(answer.drops, []);
  return answer.value;
}

test("configuration starts offline, and preparing artwork never changes vertical posters", async () => {
  const r = boot();
  assert.match(checked("settingsStatus", await plugin.settingsStatus(), r).sentaiArtworkStatus, /^Sin revisar/);
  assert.equal(r.requests.length, 0);
  const before = checked("section", await plugin.section(null), r).rows[0].items;
  assert.ok(before.every((i) => i.backdrop === i.poster));
  assert.equal(r.requests.length, 1);
});

test("independent background reaches all series metadata while a distinct logo stays out of unsupported output", async () => {
  const r = boot(tree([blob("assets/sentai/" + SERIES + ".jpg"), blob("assets/sentai/backgrounds/" + SERIES + ".jpg", changed)]));
  checked("action", await plugin.action("refreshSentaiArtwork"), r);
  const status = checked("settingsStatus", await plugin.settingsStatus(), r);
  assert.equal(status.sentaiArtworkStatus, "1/49 fondos · 1/49 logos preparados");
  const expected = BASE + "backgrounds/" + SERIES + ".jpg?v=" + changed;
  const calls = [
    ["home", undefined, (v) => v.flatMap((row) => row.items)],
    ["section", null, (v) => v.rows.flatMap((row) => row.items)],
    ["browse", "category:super-sentai", (v) => v.items],
    ["search", { q: "Timeranger" }, (v) => v.items],
  ];
  for (const [fn, argument, items] of calls) {
    const item = items(checked(fn, await plugin[fn](argument), r)).find((i) => i.ref === "shadow:timeranger");
    assert.equal(item.backdrop, expected);
    assert.match(item.poster, /^https:\/\/shadowrangers\.live\//);
    assert.equal(Object.hasOwn(item, "logo"), false);
  }
  const detail = checked("episodes", await plugin.episodes("shadow:timeranger"), r);
  assert.equal(detail.series.backdrop, expected);
  assert.match(detail.series.poster, /^https:\/\/shadowrangers\.live\//);
  assert.equal(detail.episodes.length, 50);
  assert.equal(r.requests.filter((q) => q.url === TREE).length, 1);
  assert.ok(r.requests.every((q) => !q.url.endsWith(".jpg")));
});

test("a logo alone cannot overwrite the background, and other families retain their artwork", async () => {
  const r = boot(tree([blob("assets/sentai/" + SERIES + ".jpg")]));
  await plugin.action("refreshSentaiArtwork");
  const rows = checked("home", await plugin.home(), r);
  const sentai = rows[0].items;
  assert.ok(sentai.every((i) => i.backdrop === i.poster));
  assert.ok(rows.slice(1).flatMap((row) => row.items).every((i) => !i.backdrop));
  const detail = checked("episodes", await plugin.episodes("shadow:timeranger"), r);
  assert.equal(detail.series.backdrop, detail.series.poster);
});

test("only exact known JPG paths and real blob hashes are accepted", async () => {
  const r = boot(tree([
    blob("assets/sentai/backgrounds/" + OTHER + ".jpg"),
    blob("assets/sentai/backgrounds/" + SERIES + ".JPG"),
    blob("assets/sentai/backgrounds/../" + SERIES + ".jpg"),
    blob("assets/sentai/backgrounds/unknown-series.jpg"),
    blob("assets/sentai/" + SERIES + ".jpg.jpg"),
    blob("assets/sentai/backgrounds/" + SERIES + ".jpg", "https://evil.example/image.jpg"),
    { ...blob("assets/sentai/" + SERIES + ".jpg"), type: "tree" },
    { ...blob("assets/sentai/" + SERIES + ".jpg"), size: 0 },
  ]));
  await plugin.action("refreshSentaiArtwork");
  assert.equal((await plugin.settingsStatus()).sentaiArtworkStatus, "1/49 fondos · 0/49 logos preparados");
  const result = checked("browse", await plugin.browse("category:super-sentai"), r);
  assert.equal(result.items.filter((i) => i.backdrop !== i.poster).length, 1);
});

test("deleted or replaced backgrounds are reflected after an explicit refresh", async () => {
  const r = boot(tree([blob("assets/sentai/backgrounds/" + SERIES + ".jpg")]));
  await plugin.action("refreshSentaiArtwork");
  const first = checked("browse", await plugin.browse("category:super-sentai"), r).items.find((i) => i.ref === "shadow:timeranger");
  r.reply(tree([blob("assets/sentai/backgrounds/" + SERIES + ".jpg", changed)]));
  await plugin.action("refreshSentaiArtwork");
  const second = checked("browse", await plugin.browse("category:super-sentai"), r).items.find((i) => i.ref === "shadow:timeranger");
  assert.notEqual(first.backdrop, second.backdrop);
  r.reply(tree([]));
  await plugin.action("refreshSentaiArtwork");
  const third = checked("browse", await plugin.browse("category:super-sentai"), r).items.find((i) => i.ref === "shadow:timeranger");
  assert.equal(third.backdrop, third.poster);
});

test("malformed, truncated and rate-limited responses preserve the last valid image registry", async () => {
  const r = boot(tree([blob("assets/sentai/backgrounds/" + SERIES + ".jpg")]));
  await plugin.action("refreshSentaiArtwork");
  for (const [reply, code, error] of [["bad json", 200, "unavailable"], [{ truncated: true, tree: [] }, 200, "unavailable"], [tree([]), 429, "rate_limited"]]) {
    r.reply(reply, code);
    await assert.rejects(plugin.action("refreshSentaiArtwork"), { code: error });
    assert.equal((await plugin.settingsStatus()).sentaiArtworkStatus, "Error al revisar · último registro: 1/49 fondos · 0/49 logos preparados");
    const item = checked("browse", await plugin.browse("category:super-sentai"), r).items.find((i) => i.ref === "shadow:timeranger");
    assert.match(item.backdrop, /^https:\/\/raw\.githubusercontent\.com\//);
  }
});

test("corrupt or expired stored artwork cannot create arbitrary image URLs", async () => {
  const r = boot();
  r.kino.storage.set("sentai-artwork-v1", JSON.stringify({ schema: 1, checkedAt: Date.now(), logos: {}, backgrounds: { [SERIES]: "https://evil.example/image" } }));
  let item = checked("browse", await plugin.browse("category:super-sentai"), r).items.find((i) => i.ref === "shadow:timeranger");
  assert.equal(item.backdrop, item.poster);
  r.kino.storage.set("sentai-artwork-v1", JSON.stringify({ schema: 1, checkedAt: Date.now() - 31 * 24 * 60 * 60 * 1000, logos: {}, backgrounds: { [SERIES]: sha } }));
  item = checked("browse", await plugin.browse("category:super-sentai"), r).items.find((i) => i.ref === "shadow:timeranger");
  assert.equal(item.backdrop, item.poster);
  assert.equal(r.requests.length, 1);
});
