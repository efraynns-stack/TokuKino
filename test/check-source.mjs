// Live source verification. curl transports HTTPS because Node's fetch cannot
// reach these hosts from this execution environment. Plugin code still uses kino.fetch.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createKino } from "../sdk/kino-shim.mjs";
import { validateManifest, checkOutput } from "../sdk/contract.mjs";
import * as plugin from "../plugin.js";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = validateManifest(readFileSync(root + "kino-plugin.json", "utf8")).manifest;
const record = root + "test/source-fixtures.json";
const requests = [];
async function fetchViaCurl(url, options) {
  const target = String(url);
  requests.push({ host: new URL(target).hostname, method: options.method });
  const args = ["--silent", "--show-error", "--max-time", "12", "--request", options.method,
    "--write-out", "\n__KINO_HTTP_STATUS__%{http_code}", "--url", target];
  for (const [key, value] of Object.entries(options.headers || {})) args.push("--header", key + ": " + value);
  if (typeof options.body === "string") args.push("--data-binary", options.body);
  const { stdout } = await exec("curl", args, { signal: options.signal, maxBuffer: 6 * 1024 * 1024 });
  const marker = stdout.lastIndexOf("\n__KINO_HTTP_STATUS__");
  if (marker < 0) throw new Error("curl did not supply the HTTP status");
  const status = Number(stdout.slice(marker + "\n__KINO_HTTP_STATUS__".length));
  return new Response(stdout.slice(0, marker), { status, headers: { "Content-Type": target.includes("/search?") ? "application/json" : "text/html" } });
}

const checkedAt = new Date().toISOString();
const { kino, servers, saveTape } = createKino(manifest, { fetchImpl: fetchViaCurl, record });
globalThis.kino = kino;
const report = { pluginVersion: manifest.version, checkedAt, transport: "SDK host gate + curl HTTPS transport", calls: {} };
let first;
for (const [fn, arg] of [["home", null], ["search", { q: "Gavv" }], ["episodes", "series:kamen-rider-gavv"]]) {
  const answer = await plugin[fn](arg);
  const result = checkOutput(fn, answer, manifest, servers);
  if (result.drops.length) throw new Error(JSON.stringify(result.drops));
  writeFileSync(root + "test/source-" + fn + ".json", JSON.stringify(result.value, null, 2) + "\n");
  report.calls[fn] = { drops: result.drops.length, count: fn === "home" ? result.value.length : fn === "search" ? result.value.items.length : result.value.episodes.length };
  if (fn === "episodes") first = result.value.episodes[0].ref;
}
try {
  const s = await plugin.resolve(first);
  const result = checkOutput("resolve", s, manifest, servers);
  report.calls.resolve = { outcome: "direct_stream", drops: result.drops.length };
} catch (e) {
  report.calls.resolve = { outcome: "not_verified", code: e.code || "unknown", detail: e.message };
}
saveTape();
report.requests = requests;
report.browserCapture = "Node SDK returns browser_unavailable; real capture must be checked on Android";
report.playbackOnTv = "pending";
writeFileSync(root + "test/source-results.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
