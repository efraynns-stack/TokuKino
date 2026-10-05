// Live HTTP validation; no media links, cookies or encoded player data are saved.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { createKino } from "../sdk/kino-shim.mjs";
import { validateManifest, checkOutput } from "../sdk/contract.mjs";
import * as plugin from "../plugin.js";

const exec = promisify(execFile);
const manifest = validateManifest(readFileSync(new URL("../kino-plugin.json", import.meta.url), "utf8")).manifest;
const requests = [];
async function fetchViaCurl(url, options = {}) {
  const args = ["--silent", "--show-error", "--max-time", "25", "--max-filesize", "5000000",
    "--write-out", "\n__STATUS__%{http_code}", "--url", String(url)];
  for (const [k, v] of Object.entries(options.headers || {})) args.push("--header", k + ": " + v);
  const start = Date.now();
  const request = { host: new URL(url).hostname, method: options.method || "GET" };
  requests.push(request);
  try {
    const { stdout } = await exec("curl", args, { signal: options.signal, maxBuffer: 6 * 1024 * 1024 });
    const index = stdout.lastIndexOf("\n__STATUS__");
    const status = Number(stdout.slice(index + 11));
    request.status = status;
    return new Response(stdout.slice(0, index), { status });
  } catch {
    request.outcome = "network_or_timeout";
    throw new Error("HTTP transport could not complete the request");
  } finally { request.durationMs = Date.now() - start; }
}

const { kino, servers } = createKino(manifest, { fetchImpl: fetchViaCurl });
globalThis.kino = kino;
const report = { version: manifest.version, checkedAt: new Date().toISOString(), transport: "Official SDK host gate with curl HTTPS transport",
  calls: {}, playbackOnAndroidTv: "pending", shadowLivCapture: "Node SDK cannot run Android WebView" };
for (const [fn, arg] of [["home", undefined], ["search", { q: "Timeranger" }], ["episodes", "shadow:timeranger"]]) {
  try {
    const checked = checkOutput(fn, await plugin[fn](arg), manifest, servers);
    report.calls[fn] = { outcome: "ok", drops: checked.drops.length,
      count: fn === "episodes" ? checked.value.episodes.length : fn === "search" ? checked.value.items.length : checked.value.length };
  } catch (e) { report.calls[fn] = { outcome: "failed", code: e.code || "unknown", detail: e.message }; }
}
try {
  const checked = checkOutput("resolve", await plugin.resolve("shadow:timeranger:1x1:server:1"), manifest, servers);
  if (checked.drops.length || !checked.value.url) throw new Error("Invalid stream");
  const s = checked.value;
  report.calls.resolve = { outcome: "stream_returned", drops: checked.drops.length, mime: s.mime, label: s.label };
  // Read only the manifest. Native decoding, video segments and TV playback remain unverified.
  const playlist = await fetchViaCurl(s.url, { headers: s.headers });
  const body = await playlist.text();
  report.hlsManifest = { status: playlist.status, bytes: body.length, validHeader: body.trimStart().startsWith("#EXTM3U"),
    variants: (body.match(/#EXT-X-STREAM-INF:/g) || []).length };
} catch (e) { report.calls.resolve = { outcome: "not_verified", code: e.code || "unknown", detail: e.message }; }
report.requests = requests;
writeFileSync(new URL("shadow-live-results.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
