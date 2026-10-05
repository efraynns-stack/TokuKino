// Fresh HTTP calls through the official SDK. No media URLs or cookies are saved.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { createKino } from "../sdk/kino-shim.mjs";
import { validateManifest, checkOutput, checkSettingsOutput } from "../sdk/contract.mjs";
import * as plugin from "../plugin.js";

const exec = promisify(execFile);
const manifest = validateManifest(readFileSync(new URL("../kino-plugin.json", import.meta.url), "utf8")).manifest;
const requests = [];
const fetchImpl = async (url, options = {}) => {
  const request = { host: new URL(url).hostname, path: new URL(url).pathname };
  requests.push(request);
  const args = ["--silent", "--show-error", "--max-time", "25", "--max-filesize", "5000000", "--write-out", "\n__STATUS__%{http_code}", "--url", String(url)];
  for (const [k, v] of Object.entries(options.headers || {})) args.push("--header", k + ": " + v);
  const started = Date.now();
  try {
    const { stdout } = await exec("curl", args, { signal: options.signal, maxBuffer: 6 * 1024 * 1024 });
    const i = stdout.lastIndexOf("\n__STATUS__");
    request.status = Number(stdout.slice(i + 11));
    return new Response(stdout.slice(0, i), { status: request.status });
  } catch {
    request.outcome = "network_or_timeout";
    throw new Error("HTTP transport did not complete");
  } finally { request.durationMs = Date.now() - started; }
};
const { kino, servers } = createKino(manifest, { fetchImpl });
globalThis.kino = kino;
const report = { version: manifest.version, checkedAt: new Date().toISOString(),
  transport: "Fresh HTTPS through official SDK host gate", calls: [], androidTvPlayback: "0.1.6 VOE confirmed by user on Timeranger; current version " + manifest.version + " not yet verified on TV" };
const categoryCheck = process.argv.includes("--categories");
const statusCheck = process.argv.includes("--status");
const riderCheck = process.argv.includes("--rider");
const riderPlayCheck = process.argv.includes("--rider-play");
const calls = riderPlayCheck ? [["action", "refreshRiderCatalog"], ["episodes", "shadow:rider:kamen-rider-gavv"],
  ["resolve", "shadow:rider:kamen-rider-gavv:1x1:server:2"]] : riderCheck ? [["settingsStatus", undefined], ["action", "refreshRiderCatalog"],
  ["categories", undefined], ["browse", "category:kamen-rider"], ["section", { tab: "kamen-rider" }],
  ["episodes", "shadow:rider:kamen-rider"], ["episodes", "shadow:rider:kamen-rider-gavv"],
  ["episodes", "shadow:rider:kamen-rider-my-th"], ["resolve", "shadow:rider:kamen-rider-gavv:1x1:server:2"],
  ["search", { q: "Gavv" }], ["settingsStatus", undefined]] : statusCheck ? [["settingsStatus", undefined], ["action", "refreshCatalog"], ["settingsStatus", undefined]] : categoryCheck ? [["categories", undefined], ["browse", "category:super-sentai"], ["section", { tab: "super-sentai" }], ["browse", "category:kamen-rider"], ["section", { tab: "kamen-rider" }]] : [["home", undefined], ["search", { q: "Gozyuger" }],
  ["episodes", "shadow:sentai:himitsu-sentai-goranger"], ["episodes", "shadow:sentai:no-1-sentai-gozyuger"],
  ["resolve", "shadow:sentai:himitsu-sentai-goranger:1x1:server:2"]];
for (const [fn, argument] of calls) {
  const entry = { function: fn, argument };
  try {
    const answer = await plugin[fn](argument);
    const out = fn === "settingsStatus" || fn === "action" ? { value: checkSettingsOutput(fn, answer, manifest), drops: [] } : checkOutput(fn, answer, manifest, servers);
    entry.drops = out.drops.length;
    if (fn === "settingsStatus") entry.status = out.value;
    if (fn === "action") entry.message = out.value.message;
    if (fn === "home") entry.series = out.value.flatMap((r) => r.items).length;
    if (fn === "search" || fn === "browse") entry.series = out.value.items.length;
    if (fn === "categories") entry.categories = out.value.map((c) => c.title);
    if (fn === "section") { entry.tab = out.value.tab; entry.series = out.value.rows.flatMap((r) => r.items).length; }
    if (fn === "episodes") entry.episodes = out.value.episodes.length;
    if (fn === "resolve") { entry.mime = out.value.mime; entry.label = out.value.label; }
    entry.outcome = out.drops.length ? "output_dropped" : "accepted";
  } catch (e) { entry.outcome = "not_verified"; entry.code = e.code || "unknown"; }
  report.calls.push(entry);
  console.log(JSON.stringify(entry));
}
report.requests = requests;
writeFileSync(new URL(riderPlayCheck ? "rider-play-live-results.json" : riderCheck ? "rider-live-results.json" : statusCheck ? "catalog-status-live-results.json" : categoryCheck ? "categories-live-results.json" : "sentai-live-results.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
