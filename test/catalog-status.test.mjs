import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createKino } from "../sdk/kino-shim.mjs";
import { validateManifest, checkSettingsOutput } from "../sdk/contract.mjs";
import * as plugin from "../plugin.js";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const manifest = validateManifest(read("../kino-plugin.json")).manifest;
const html = read("sentai-catalog.html");
const SOURCE = "https://shadowrangers.live/genero/super-sentai/";

function boot() {
  const requests = [];
  let reply = html, failure = false, beforeReply;
  const { kino } = createKino(manifest, { fetchImpl: async (url) => {
    requests.push(String(url));
    assert.equal(String(url), SOURCE);
    if (beforeReply) await beforeReply();
    if (failure) throw new Error("synthetic network error");
    return new Response(reply);
  } });
  globalThis.kino = { ...kino, log() {} };
  return { kino, requests, setReply: (s) => { reply = s; }, fail: () => { failure = true; },
    observe: (fn) => { beforeReply = fn; } };
}

function settings(fn, value) {
  const drops = [];
  const result = checkSettingsOutput(fn, value, manifest, (s) => s, (s) => drops.push(s));
  assert.deepEqual(drops, []);
  return result;
}

test("settings status is immediate and offline before a catalog has been loaded", async () => {
  const r = boot();
  const s = settings("settingsStatus", await plugin.settingsStatus());
  assert.equal(s.catalogStatus, "0% · sin carga registrada");
  assert.equal(s.catalogUpdated, "Sin fecha registrada");
  assert.equal(s.riderStatus, "0% · sin carga registrada");
  assert.equal(s.riderUpdated, "Sin fecha registrada");
  assert.equal(r.requests.length, 0);
});

test("automatic catalog loading records a completed percentage, real count and timestamp", async () => {
  const r = boot();
  await plugin.home();
  const s = settings("settingsStatus", await plugin.settingsStatus());
  assert.equal(s.catalogStatus, "100% · 49 series · última carga completa");
  assert.match(s.catalogUpdated, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d UTC$/);
  assert.equal(r.requests.length, 1);
  await plugin.settingsStatus();
  assert.equal(r.requests.length, 1);
});

test("manual refresh bypasses a valid cache and reports the newly published count", async () => {
  const r = boot();
  await plugin.home();
  // A recorded category card is withdrawn between the first load and the refresh.
  r.setReply(html.replace(/<article\b[\s\S]*?<\/article>/, ""));
  const answer = settings("action", await plugin.action("refreshCatalog"));
  assert.match(answer.message, /100% · 48 series/);
  assert.equal(r.requests.length, 2);
  assert.equal((await plugin.home())[0].items.length, 48);
  assert.equal((await plugin.settingsStatus()).catalogStatus, "100% · 48 series · última carga completa");
});

test("a pending load is described without inventing intermediate percentages", async () => {
  const r = boot();
  r.observe(async () => {
    const s = settings("settingsStatus", await plugin.settingsStatus());
    assert.equal(s.catalogStatus, "Actualizando catálogo…");
    assert.equal(s.catalogUpdated, "Sin fecha registrada");
  });
  await plugin.action("refreshCatalog");
  assert.match((await plugin.settingsStatus()).catalogStatus, /^100%/);
});

test("a failed refresh preserves the last good catalog and its successful timestamp", async () => {
  const r = boot();
  await plugin.home();
  const before = await plugin.settingsStatus();
  r.fail();
  await assert.rejects(plugin.action("refreshCatalog"), { code: "unavailable" });
  const after = settings("settingsStatus", await plugin.settingsStatus());
  assert.equal(after.catalogStatus, "Error al actualizar · 49 series de la última carga");
  assert.equal(after.catalogUpdated, before.catalogUpdated);
  assert.equal((await plugin.home())[0].items.length, 49);
  assert.equal(r.requests.length, 2);
});

test("a malformed response cannot become 100 percent or replace the good catalog", async () => {
  const r = boot();
  await plugin.home();
  r.setReply("<html>No series cards</html>");
  await assert.rejects(plugin.action("refreshCatalog"), { code: "unavailable" });
  assert.match((await plugin.settingsStatus()).catalogStatus, /^Error al actualizar/);
  assert.equal((await plugin.browse("category:super-sentai")).items.length, 49);
});

test("an interrupted call is reported instead of remaining stuck on loading", async () => {
  const r = boot();
  r.kino.storage.set("shadow-sentai-load-state-v1", JSON.stringify({ phase: "loading", startedAt: Date.now() - 40000 }));
  assert.equal((await plugin.settingsStatus()).catalogStatus, "Carga interrumpida · pulsa Actualizar catálogo");
  assert.equal(r.requests.length, 0);
});

test("legacy cached metadata is recognized and unknown actions make no requests", async () => {
  const r = boot();
  r.kino.storage.set("shadow-sentai-catalog-v1", JSON.stringify({ items: [{ slug: "legacy" }] }));
  const s = await plugin.settingsStatus();
  assert.equal(s.catalogStatus, "100% · 1 series · última carga completa");
  assert.equal(s.catalogUpdated, "Sin fecha registrada");
  await assert.rejects(plugin.action("unknown"), { code: "not_found" });
  assert.equal(r.requests.length, 0);
});
