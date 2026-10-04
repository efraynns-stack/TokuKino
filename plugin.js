// Toku Kino 0.1.1: UnlimitedSubs is the first source, with one series for the TV test.
// Public metadata only. Video addresses are discovered again at play time.
const SITE = "https://www.subsunlimiteds.com";
const API_URL = "https://ulsapi.unlimiteds.workers.dev/search?q=Gavv";
const SERIES_ID = "kamen-rider-gavv";
const SERIES_REF = "series:" + SERIES_ID;
const CACHE_KEY = "gavv-metadata-v1";
const CACHE_TTL = 5 * 60 * 1000;
const VIDEO_HOSTS = ["vk.com", "vkvideo.ru"];

function log(level, message) {
  try { kino.log(level, message); } catch { /* Logging must not break a call. */ }
}

function safeHttps(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const u = new URL(value.startsWith("//") ? "https:" + value : value);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    const host = u.hostname.toLowerCase();
    if (!host.includes(".") || host.includes(":") || /^\d+(?:\.\d+){3}$/.test(host)) return null;
    if (/(^|\.)(localhost|local|lan|internal|home|test|invalid)$/.test(host) || host.endsWith(".home.arpa")) return null;
    return u.href;
  } catch { return null; }
}

function text(value, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function error(code, detail) { return kino.error(code, detail); }

function statusError(status, area) {
  if (status === 404 || status === 410) return error("not_found", area + ": contenido no disponible");
  if (status === 429) return error("rate_limited", area + ": demasiadas solicitudes");
  if (status === 451) return error("geo_blocked", area + ": restricción regional");
  return error("unavailable", area + ": respuesta HTTP " + status);
}

function normalizeSeries(raw) {
  if (!raw || raw.ID !== SERIES_ID || !Array.isArray(raw.episodes)) return null;
  const seen = new Set();
  const episodes = [];
  for (const e of raw.episodes.slice(0, 5000)) {
    if (!e || typeof e !== "object") continue;
    const id = text(e.episodeID, 128);
    const number = Number(e.episodeNumber);
    if (!/^kamen-rider-gavv-[a-z0-9-]+$/.test(id) || seen.has(id)) continue;
    if (!Number.isInteger(number) || number < 1 || number > 99999) continue;
    const url = safeHttps(e.episodeURL);
    let validVideo = false;
    if (url) {
      const u = new URL(url);
      validVideo = VIDEO_HOSTS.includes(u.hostname) && /^\/video-?\d+_\d+\/?$/.test(u.pathname);
    }
    if (!validVideo) continue; // Do not expose "Próximamente" as playable.
    seen.add(id);
    episodes.push({
      id, number, title: text(e.episodeTitle) || "Capítulo " + number,
      still: safeHttps(e.episodePreview) || safeHttps(e.episodePreviewBackup) || undefined,
      airDate: /^\d{4}-\d{2}-\d{2}$/.test(e.releaseDate || "") ? e.releaseDate : undefined,
      videoUrl: url,
      hash: /^[a-f0-9]{8,64}$/i.test(e.episodeHash || "") ? e.episodeHash : "",
      runtime: Number.parseInt(e.episodeDuration, 10) || 24,
    });
  }
  episodes.sort((a, b) => a.number - b.number);
  return {
    title: text(raw.titleEN || raw.title) || "Kamen Rider Gavv",
    poster: safeHttps(raw.poster) || safeHttps(raw.posterBackup) || undefined,
    overview: text(raw.synopsis, 5000),
    year: /^\d{4}$/.test(String(raw.releaseDate || "")) ? String(raw.releaseDate) : undefined,
    episodes,
  };
}

async function seriesData(fresh = false) {
  await null;
  if (!fresh) {
    try {
      const cached = kino.storage.get(CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        if (data && data.id === SERIES_ID && data.title && Array.isArray(data.episodes)) return data;
      }
    } catch { /* Replace malformed cached data from the source. */ }
  }
  let r;
  try {
    r = await kino.fetch(API_URL, { timeoutMs: 12000, headers: { Accept: "application/json" } });
  } catch (e) {
    log("warn", "ULS_API_FETCH " + (e.code || "network"));
    throw error("unavailable", "No se pudo consultar el catálogo de UnlimitedSubs");
  }
  if (!r.ok) throw statusError(r.status, "Catálogo");
  let payload;
  try { payload = r.json(); } catch { throw error("unavailable", "El catálogo no respondió con datos válidos"); }
  if (!payload || !Array.isArray(payload.results)) throw error("unavailable", "El catálogo cambió su formato");
  const data = normalizeSeries(payload.results.find((x) => x && x.ID === SERIES_ID));
  if (!data) throw error("not_found", "La serie de prueba no está en el catálogo");
  data.id = SERIES_ID;
  try { kino.storage.set(CACHE_KEY, JSON.stringify(data), { ttlMs: CACHE_TTL }); } catch { /* The cache is optional. */ }
  log("info", "ULS_CATALOG episodes=" + data.episodes.length);
  return data;
}

function item(data) {
  return {
    id: "uls-" + SERIES_ID, ref: SERIES_REF, title: data.title, kind: "series",
    year: data.year, poster: data.poster, backdrop: data.poster, overview: data.overview,
    lang: "ja", badges: ["Subtitulado"], genres: ["Tokusatsu"],
  };
}

export async function home() {
  const data = await seriesData();
  return [{ id: "unlimitedsubs-series", title: "Toku Kino", genre: "series", items: [item(data)] }];
}

export async function search(query) {
  await null;
  const forms = [query && query.q, query && query.originalTitle]
    .concat(query && Array.isArray(query.altTitles) ? query.altTitles.slice(0, 5) : [])
    .filter((q) => typeof q === "string" && q.trim());
  if (!forms.length) return [];
  const matches = forms.some((q) => {
    const words = q.toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
    return words.length > 0 && words.every((w) => "kamen rider gavv".includes(w));
  });
  if (!matches) return [];
  return [item(await seriesData())];
}

export async function episodes(ref) {
  await null;
  if (ref !== SERIES_REF) throw error("not_found", "Esta prueba incluye solamente Kamen Rider Gavv");
  const data = await seriesData();
  return {
    series: { title: data.title, poster: data.poster, backdrop: data.poster, overview: data.overview, year: data.year },
    episodes: data.episodes.map((e) => ({
      // s39 is a franchise index, not season 39 of Gavv.
      season: 1, number: e.number, ref: "episode:" + e.id, title: e.title,
      still: e.still, airDate: e.airDate, runtimeMinutes: e.runtime,
    })),
  };
}

function embedUrl(episode) {
  const video = new URL(episode.videoUrl);
  const ids = /^\/video(-?\d+)_(\d+)\/?$/.exec(video.pathname);
  if (!ids || !VIDEO_HOSTS.includes(video.hostname)) throw error("not_found", "El capítulo no tiene un servidor compatible");
  const u = new URL("/video_ext.php", video.origin);
  u.searchParams.set("oid", ids[1]);
  u.searchParams.set("id", ids[2]);
  if (episode.hash) u.searchParams.set("hash", episode.hash);
  return u.href;
}

// Balanced JSON parser. Nothing from the page is evaluated as JavaScript.
function jsonObjectAt(html, start) {
  const first = html.indexOf("{", start);
  if (first < 0 || first - start > 80) return null;
  let depth = 0, quoted = false, escaped = false;
  for (let i = first; i < html.length && i - first <= 1500000; i++) {
    const c = html[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try { return JSON.parse(html.slice(first, i + 1)); } catch { return null; }
    }
  }
  return null;
}

function playerData(html) {
  const assignment = /\b(?:var|let|const)\s+playerParams\s*=\s*/g;
  let match;
  for (let n = 0; n < 4 && (match = assignment.exec(html)); n++) {
    const player = jsonObjectAt(html, assignment.lastIndex);
    if (player && Array.isArray(player.params) && player.params[0] && typeof player.params[0] === "object") return player.params[0];
  }
  return null;
}

function pageRestriction(html) {
  const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ");
  if (/copyright holder|rightholder complaint|правообладател|has been deleted|author has been blocked/i.test(visible)) return "not_found";
  if (/not available in your region|недоступн.{0,20}регион/i.test(visible)) return "geo_blocked";
  if (/please log in|only available for registered|sign in to watch|войдите.{0,30}просмотр/i.test(visible)) return "auth_required";
  if (/verify (?:that )?you are human|confirme que es humano|подтвердите.{0,25}человек/i.test(visible) || /act=security_check/.test(html)) return "blocked";
  return null;
}

function subtitlesOf(entries) {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  return entries.slice(0, 40).flatMap((s) => {
    if (!s || typeof s !== "object") return [];
    const url = safeHttps(s.url);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    const lang = text(s.lang || s.language, 12) || "es";
    const path = new URL(url).pathname;
    const format = /\.srt$/i.test(path) ? "srt" : /\.vtt$/i.test(path) ? "vtt" : undefined;
    return [{ url, lang, format }];
  });
}

function directStream(html, embed) {
  const params = playerData(html);
  if (!params) return null;
  if (params.drm || params.licenseUrl) throw kino.error("unavailable", "Este reproductor requiere un tipo de video protegido que la prueba no admite");
  const formats = [], seen = new Set();
  const headers = { Referer: embed };
  for (const key of Object.keys(params)) {
    let mime, priority;
    if (/^hls(?:$|_)/.test(key) && !/live/.test(key)) { mime = "application/vnd.apple.mpegurl"; priority = 0; }
    else if (/^(?:url|cache)\d+$/.test(key)) {
      mime = "video/mp4";
      const height = Number(key.replace(/\D/g, ""));
      priority = height <= 1080 ? 10000 - height : 20000 + height;
    } else continue;
    const url = safeHttps(params[key]);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    formats.push({ url, mime, headers, priority });
  }
  formats.sort((a, b) => a.priority - b.priority);
  if (!formats.length) return null;
  const clean = ({ priority, ...f }) => f;
  const stream = { ...clean(formats[0]), label: "VK", expiresInSeconds: 180 };
  if (formats.length > 1) stream.alternatives = formats.slice(1, 9).map(clean);
  const subtitles = subtitlesOf(params.subs);
  if (subtitles.length) stream.subtitles = subtitles;
  return stream;
}

async function captureStream(embed, referer) {
  await null;
  let captured;
  try {
    log("info", "ULS_CAPTURE started");
    captured = await kino.browser.capture(embed, { timeoutMs: 18000, headers: { Referer: referer } });
  } catch (e) {
    const code = e.code || "network";
    log("warn", "ULS_CAPTURE " + code);
    const details = {
      browser_unavailable: "Este dispositivo no dispone del navegador integrado necesario para VK",
      blocked: "VK no permite abrir este reproductor automáticamente",
      busy: "El navegador integrado está ocupado; intenta nuevamente",
      timeout: "VK no inició el video dentro del tiempo disponible",
      not_allowed: "El permiso de navegador del plugin no está activo",
    };
    const detail = details[code] || "No se pudo abrir el video de VK";
    // Kino rejects custom userMessage text when the plugin name contains "Kino".
    // Keep the requested name; the native debug panel and Registro show this detail.
    throw error("unavailable", detail);
  }
  const media = captured && Array.isArray(captured.media) ? captured.media : [];
  const seen = new Set();
  const usable = media.filter((m) => {
    const url = m && safeHttps(m.url);
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
  if (!usable.length) {
    log("warn", "ULS_CAPTURE empty");
    throw error("unavailable", "VK no entregó un enlace de video");
  }
  const copy = (m) => ({ url: safeHttps(m.url), mime: m.mime || undefined, headers: m.headers || {} });
  // Captured request headers and session cookies must reach the player unchanged.
  const stream = { ...copy(usable[0]), label: "VK", expiresInSeconds: 180 };
  if (usable.length > 1) stream.alternatives = usable.slice(1, 9).map(copy);
  const subtitles = subtitlesOf(captured.subtitles);
  if (subtitles.length) stream.subtitles = subtitles;
  log("info", "ULS_RESOLVE browser media=" + usable.length);
  return stream;
}

export async function resolve(ref) {
  await null;
  const match = /^episode:(kamen-rider-gavv-[a-z0-9-]{1,80})$/.exec(String(ref || ""));
  if (!match) throw error("not_found", "Capítulo de prueba no válido");
  const data = await seriesData(true);
  const episode = data.episodes.find((e) => e.id === match[1]);
  if (!episode) throw error("not_found", "Ese capítulo ya no está disponible");
  const embed = embedUrl(episode);
  const referer = SITE + "/series/" + SERIES_ID + "/" + episode.id;
  let response;
  try {
    response = await kino.fetch(embed, { timeoutMs: 8000, headers: { Referer: referer, Accept: "text/html" } });
  } catch (e) { log("warn", "ULS_VK_FETCH " + (e.code || "network")); }
  if (response) {
    log("info", "ULS_VK_FETCH http=" + response.status);
    if ([404, 410, 429, 451].includes(response.status)) throw statusError(response.status, "VK");
    const html = response.text();
    const restriction = pageRestriction(html);
    if (restriction === "blocked") throw error("unavailable", "VK está solicitando una verificación humana");
    if (restriction === "auth_required") throw error("unavailable", "VK solicita iniciar sesión para este video");
    if (restriction) throw error(restriction, "VK restringió este capítulo");
    if (response.ok) {
      const stream = directStream(html, embed);
      if (stream) { log("info", "ULS_RESOLVE direct"); return stream; }
    }
  }
  // One ordinary capture of the same public embed; no retries or CAPTCHA handling.
  return await captureStream(embed, referer);
}
