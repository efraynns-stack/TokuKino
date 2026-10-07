// Real read-only GitHub inspection through the official Kino host gate.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { createKino } from "../sdk/kino-shim.mjs";
import { validateManifest, checkSettingsOutput } from "../sdk/contract.mjs";
import * as plugin from "../plugin.js";

const exec = promisify(execFile);
const manifest = validateManifest(readFileSync(new URL("../kino-plugin.json", import.meta.url), "utf8")).manifest;
const requests = [];
const { kino } = createKino(manifest, { fetchImpl: async (url, options = {}) => {
  const parsed = new URL(url);
  const request = { host: parsed.hostname, path: parsed.pathname };
  requests.push(request);
  const args = ["--silent", "--show-error", "--max-time", "12", "--max-filesize", "1000000", "--write-out", "\n__STATUS__%{http_code}", "--url", String(url)];
  for (const [key, value] of Object.entries(options.headers || {})) args.push("--header", key + ": " + value);
  const started = Date.now();
  try {
    const { stdout } = await exec("curl", args, { signal: options.signal, maxBuffer: 1100000 });
    const split = stdout.lastIndexOf("\n__STATUS__");
    request.status = Number(stdout.slice(split + 11));
    return new Response(stdout.slice(0, split), { status: request.status });
  } finally { request.durationMs = Date.now() - started; }
} });
globalThis.kino = { ...kino, log() {} };
const report = { version: manifest.version, checkedAt: new Date().toISOString(), requests, audiovisualPlayback: "Not tested; this change concerns artwork metadata only" };
try {
  const drops = [];
  report.action = checkSettingsOutput("action", await plugin.action("refreshSentaiArtwork"), manifest, (s) => s, (s) => drops.push(s));
  report.status = checkSettingsOutput("settingsStatus", await plugin.settingsStatus(), manifest, (s) => s, (s) => drops.push(s)).sentaiArtworkStatus;
  report.drops = drops;
  report.outcome = drops.length ? "output_dropped" : "accepted";
} catch (e) { report.outcome = "not_verified"; report.code = e.code || "unknown"; }
writeFileSync(new URL("sentai-artwork-live-results.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
if (report.outcome !== "accepted") process.exitCode = 1;
