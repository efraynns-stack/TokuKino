// Toku Kino 0.1.9: catalog load status and manual refresh in settings.
// Public metadata only. Video addresses are discovered again at play time.
const VERSION = "0.1.9";
const SITE = "https://www.subsunlimiteds.com";
const API_URL = "https://ulsapi.unlimiteds.workers.dev/search?q=Gavv";
const SERIES_ID = "kamen-rider-gavv";
const SERIES_REF = "series:" + SERIES_ID;
const CACHE_KEY = "gavv-metadata-v1";
const CACHE_TTL = 5 * 60 * 1000;
const VIDEO_HOSTS = ["vk.com", "vkvideo.ru"];
// VK's progressive video URLs can have no file extension. Keep the normal
// media patterns and add only the observed signed VK CDN forms, not all assets.
const VK_FILE_MATCH = "^https://vkvd[0-9]+\\.mycdn\\.me/(?:\\?(?=[^#]*\\bid=[0-9]+(?:&|$))(?=[^#]*\\bexpires=[0-9]+(?:&|$))[^#]*|expires/[0-9]+/[^#]*/id/[0-9]+(?:/[^#]*)?)$";
const VIDEO_MATCH = "\\.(?:m3u8|mpd|mp4)(?:[/?#]|$)|master\\.txt|videoplayback|/hls/|" + VK_FILE_MATCH;
const VK_FILE_RE = new RegExp(VK_FILE_MATCH, "i");
const SHADOW_SITE = "https://shadowrangers.live";
const SHADOW_SERIES = SHADOW_SITE + "/series/mirai-sentai-timeranger/";
const SHADOW_REF = "shadow:timeranger";
const SHADOW_CACHE = "shadow-timeranger-v1";
const SENTAI_URL = SHADOW_SITE + "/genero/super-sentai/";
const SENTAI_CACHE = "shadow-sentai-catalog-v1";
const CATALOG_STATE = "shadow-sentai-load-state-v1";
const SERIES_CACHE = "shadow-sentai-series-v1";
const TIMERANGER = "mirai-sentai-timeranger";
const SENTAI_CATEGORY = "category:super-sentai";
const RIDER_CATEGORY = "category:kamen-rider";
const CATEGORY_ART = "https://raw.githubusercontent.com/efraynns-stack/TokuKino/HEAD/assets/";
const SHADOW_PLAYERS = ["voe.sx", "teresapoliticallearn.com", "shadowliv.xyz"];

function unescapeHtml(value) {
  return String(value || "").replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (all, entity) => {
    const e = entity.toLowerCase();
    const named = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
    if (e[0] !== "#") return named[e] || all;
    const n = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "";
  });
}

function htmlText(html, max = 200) {
  return text(unescapeHtml(String(html || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " "), max);
}

function attribute(tag, key) {
  const m = new RegExp("\\b" + key + "\\s*=\\s*([\"'])((?:(?!\\1)[\\s\\S])*)\\1", "i").exec(tag);
  return m ? unescapeHtml(m[2]).trim() : "";
}

function shadowSeriesRef(slug) { return slug === TIMERANGER ? SHADOW_REF : "shadow:sentai:" + slug; }
function shadowEpisodeRef(e, slug = TIMERANGER) { return shadowSeriesRef(slug) + ":" + e.season + "x" + e.number; }

function shadowItem(data) {
  return { id: "shadow-" + data.slug, ref: shadowSeriesRef(data.slug), title: data.title, kind: "series",
    year: data.year, poster: data.poster, overview: data.overview, lang: "ja", badges: ["ShadowRangers"], genres: ["Super Sentai", "Tokusatsu"] };
}

function catalogState() {
  try {
    const state = JSON.parse(kino.storage.get(CATALOG_STATE) || "null");
    return state && typeof state === "object" && !Array.isArray(state) ? state : {};
  } catch { return {}; }
}

function storeCatalogState(state) {
  try { kino.storage.set(CATALOG_STATE, JSON.stringify(state), { ttlMs: 30 * 24 * 60 * 60 * 1000 }); }
  catch { log("warn", "SENTAI_STATUS storage_unavailable"); }
}

async function sentaiCatalog(fresh = false, timeoutMs = 12000) {
  await null;
  if (!fresh) try {
    const cached = JSON.parse(kino.storage.get(SENTAI_CACHE) || "null");
    if (cached && Array.isArray(cached.items) && cached.items.length) return cached.items;
  } catch { /* Refresh malformed or expired metadata. */ }
  const previous = catalogState();
  storeCatalogState({ ...previous, phase: "loading", startedAt: Date.now(), failure: undefined });
  try {
    const items = await loadSentaiCatalog(timeoutMs);
    storeCatalogState({ phase: "complete", count: items.length, loadedAt: Date.now() });
    return items;
  } catch (e) {
    const failure = ["unavailable", "rate_limited", "geo_blocked", "not_found"].includes(e.code) ? e.code : "unavailable";
    storeCatalogState({ ...previous, phase: "failed", failure, failedAt: Date.now() });
    throw e;
  }
}

async function loadSentaiCatalog(timeoutMs) {
  await null;
  const html = await shadowHtml(SENTAI_URL, timeoutMs, SHADOW_SITE + "/");
  // Scope to the category's cards, excluding unrelated sidebar recommendations.
  const start = /<div\b[^>]*class=["']content\b[^"']*["'][^>]*>/i.exec(html);
  if (!start) throw error("unavailable", "No se pudo reconocer el catálogo de Super Sentai");
  const body = html.slice(start.index).split(/<div\b[^>]*class=["']sidebar\b/i)[0];
  const items = [], seen = new Set();
  for (const m of body.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)) {
    const block = m[0], tag = block.slice(0, block.indexOf(">") + 1);
    if (!attribute(tag, "class").split(/\s+/).includes("tvshows")) continue;
    const heading = /<h3\b[^>]*>\s*(<a\b[^>]*>)([\s\S]*?)<\/a>/i.exec(block);
    if (!heading) continue;
    const url = safeHttps(attribute(heading[1], "href"));
    if (!url) continue;
    const u = new URL(url), slug = /^\/series\/([a-z0-9-]{1,110})\/$/.exec(u.pathname);
    if (u.hostname !== "shadowrangers.live" || u.search || u.hash || !slug || seen.has(slug[1])) continue;
    const date = /<\/h3>\s*<span\b[^>]*>([\s\S]*?)<\/span>/i.exec(block);
    const year = date && /\b(19\d{2}|20\d{2})\b/.exec(htmlText(date[1]));
    const img = /<img\b[^>]*>/i.exec(block);
    const title = htmlText(heading[2]);
    if (!title) continue;
    seen.add(slug[1]);
    items.push({ slug: slug[1], title, year: year ? year[1] : undefined,
      poster: img ? safeHttps(attribute(img[0], "src")) || undefined : undefined });
  }
  if (!items.length) throw error("unavailable", "El catálogo de Super Sentai no contiene series reconocibles");
  items.sort((a, b) => Number(a.year || 9999) - Number(b.year || 9999) || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  try { kino.storage.set(SENTAI_CACHE, JSON.stringify({ items, savedAt: Date.now() }), { ttlMs: CACHE_TTL }); } catch { /* Optional metadata cache. */ }
  log("info", "SENTAI_CATALOG version=" + VERSION + " series=" + items.length);
  return items;
}

export async function settingsStatus() {
  await null;
  const state = catalogState();
  let count = Number.isInteger(state.count) && state.count > 0 ? state.count : 0;
  let loadedAt = Number.isFinite(state.loadedAt) && state.loadedAt > 0 ? state.loadedAt : 0;
  // Updating from 0.1.8 can retain a valid cache without the new status record.
  if (!count) try {
    const cached = JSON.parse(kino.storage.get(SENTAI_CACHE) || "null");
    if (cached && Array.isArray(cached.items)) {
      count = cached.items.length;
      if (Number.isFinite(cached.savedAt)) loadedAt = cached.savedAt;
    }
  } catch { /* Status never performs network requests. */ }
  let status = count ? "100% · " + count + " series · última carga completa" : "0% · sin carga registrada";
  if (state.phase === "loading") status = Date.now() - state.startedAt > 35000
    ? "Carga interrumpida · pulsa Actualizar catálogo" : "Actualizando catálogo…";
  if (state.phase === "failed") status = "Error al actualizar" + (count ? " · " + count + " series de la última carga" : " · sin catálogo cargado");
  return { catalogStatus: status,
    catalogUpdated: loadedAt ? new Date(loadedAt).toISOString().slice(0, 19).replace("T", " ") + " UTC" : "Sin fecha registrada",
    riderStatus: "1 serie · prueba de Kamen Rider Gavv" };
}

export async function action(key) {
  await null;
  if (key !== "refreshCatalog") throw error("not_found", "La acción no existe");
  const items = await sentaiCatalog(true, 20000);
  return { message: "100% · " + items.length + " series de Super Sentai cargadas. Abre Toku Kino o Categorías para verlas." };
}

function shadowTimeout(wanted, deadline) {
  if (!deadline) return wanted;
  const remaining = deadline - Date.now() - 1500;
  if (remaining < 1000) throw error("unavailable", "Se agotó el tiempo de consulta de las fuentes del capítulo");
  return Math.min(wanted, remaining);
}

async function shadowHtml(url, timeoutMs, referer, deadline) {
  await null;
  let r;
  try { r = await kino.fetch(url, { timeoutMs: shadowTimeout(timeoutMs, deadline), headers: { Accept: "text/html", Referer: referer } }); }
  catch (e) {
    log("warn", "SHADOW_FETCH failed=" + (e.code || "network"));
    throw error("unavailable", "No se pudo consultar la fuente de ShadowRangers");
  }
  log("info", "SHADOW_FETCH http=" + r.status + " host=" + new URL(url).hostname);
  if (!r.ok) throw statusError(r.status, "ShadowRangers");
  const html = r.text();
  const restriction = pageRestriction(html);
  if (restriction) throw error(restriction === "blocked" || restriction === "auth_required" ? "unavailable" : restriction,
    "La fuente requiere una sesión, una verificación o tiene una restricción de acceso");
  return html;
}

async function shadowSeries(slug = TIMERANGER) {
  await null;
  let entries = [];
  try {
    entries = JSON.parse(kino.storage.get(SERIES_CACHE) || "[]");
    if (!Array.isArray(entries)) entries = [];
    const cached = entries.find((e) => e.slug === slug && Date.now() - e.savedAt < CACHE_TTL);
    if (cached && Array.isArray(cached.episodes) && cached.episodes.length) return cached;
    if (slug === TIMERANGER) {
      const old = JSON.parse(kino.storage.get(SHADOW_CACHE) || "null");
      if (old && old.title === "Mirai Sentai Timeranger" && Array.isArray(old.episodes) && old.episodes.length)
        return { ...old, slug, year: "2000" };
    }
  } catch { /* Metadata can always be fetched again. */ }
  const card = slug === TIMERANGER ? { slug, title: "Mirai Sentai Timeranger", year: "2000" }
    : (await sentaiCatalog()).find((s) => s.slug === slug);
  if (!card) throw error("not_found", "La serie no está publicada en el catálogo de Super Sentai");
  const html = await shadowHtml(SHADOW_SITE + "/series/" + slug + "/", 12000, SENTAI_URL);
  const episodes = [], seen = new Set();
  for (const m of html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/gi)) {
    const block = m[0];
    const link = /<a\b[^>]*href\s*=\s*(["'])([^"']+)\1[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!link) continue;
    const url = safeHttps(unescapeHtml(link[2]));
    if (!url) continue;
    const u = new URL(url);
    const ids = /^\/capitulos\/([a-z0-9-]+)-([0-9]{1,2})x([0-9]{1,3})\/$/.exec(u.pathname);
    if (u.hostname !== "shadowrangers.live" || u.search || u.hash || !ids || ids[1] !== slug) continue;
    const season = Number(ids[2]), number = Number(ids[3]);
    if (season < 1 || number < 1 || seen.has(season + ":" + number)) continue;
    seen.add(season + ":" + number);
    const img = /<img\b[^>]*>/i.exec(block);
    episodes.push({ season, number, title: htmlText(link[3]) || "Capítulo " + number,
      still: img ? safeHttps(attribute(img[0], "src")) || undefined : undefined });
  }
  if (!episodes.length) throw error("unavailable", "La ficha de la serie no contiene capítulos reconocibles");
  episodes.sort((a, b) => a.season - b.season || a.number - b.number);
  const poster = /<img\b[^>]*itemprop\s*=\s*(["'])image\1[^>]*>/i.exec(html);
  const synopsis = /<div\b[^>]*class\s*=\s*(["'])wp-content\1[^>]*>\s*<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  const data = { ...card, savedAt: Date.now(), poster: poster ? safeHttps(attribute(poster[0], "src")) || card.poster : card.poster,
    overview: synopsis ? htmlText(synopsis[2], 5000) : undefined, episodes: episodes.slice(0, 5000) };
  try {
    // Bound both entry count and serialized size within the shared 256 KB storage quota.
    const next = [data, ...entries.filter((e) => e.slug !== slug && Date.now() - e.savedAt < CACHE_TTL)].slice(0, 4);
    while (next.length && JSON.stringify(next).length > 50000) next.pop();
    kino.storage.set(SERIES_CACHE, JSON.stringify(next), { ttlMs: CACHE_TTL });
  } catch { /* Optional metadata cache. */ }
  log("info", "SHADOW_CATALOG version=" + VERSION + " series=" + slug + " episodes=" + data.episodes.length);
  return data;
}

function shadowSources(html) {
  const options = new Map(), sources = [], seen = new Set();
  for (const m of html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/gi)) {
    const n = attribute(m[0].slice(0, m[0].indexOf(">") + 1), "data-nume");
    if (!/^\d{1,3}$/.test(n)) continue;
    const title = /<span\b[^>]*class\s*=\s*(["'])title\1[^>]*>([\s\S]*?)<\/span>/i.exec(m[0]);
    if (title) options.set(n, htmlText(title[2], 25));
  }
  // Match a source container to its iframe; never pair by DOM position or follow advertisements.
  for (const m of html.matchAll(/<div\b[^>]*id\s*=\s*(["'])source-player-(\d{1,3})\1[^>]*>\s*<div\b[^>]*>\s*(<iframe\b[^>]*>)/gi)) {
    const n = m[2], url = safeHttps(attribute(m[3], "src"));
    if (!url || seen.has(n) || !options.has(n)) continue;
    const u = new URL(url);
    const provider = ["voe.sx", "teresapoliticallearn.com"].includes(u.hostname) && /^\/e\/[a-z0-9]{8,32}\/?$/i.test(u.pathname) ? "voe"
      : u.hostname === "shadowliv.xyz" && u.pathname === "/" && /^#[a-z0-9]{3,40}$/i.test(u.hash) ? "shadowliv" : null;
    if (!provider) continue;
    seen.add(n);
    sources.push({ key: n, url, provider, label: text(options.get(n) + " · " + (provider === "voe" ? "VOE" : "ShadowLiv"), 48) });
  }
  return sources.slice(0, 9);
}

function voeConfig(html) {
  // Decode the data format used by the inspected public loader. Do not evaluate scripts.
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*(["'])application\/json\1[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (m[2].length > 200000) continue;
    try {
      const data = JSON.parse(m[2]);
      if (!Array.isArray(data) || typeof data[0] !== "string" || data[0].length > 150000) continue;
      let value = data[0].replace(/[a-zA-Z]/g, (c) => {
        const n = c.charCodeAt(0), base = n <= 90 ? 65 : 97;
        return String.fromCharCode(base + (n - base + 13) % 26);
      });
      for (const marker of ["@$", "^^", "~@", "%?", "*~", "!!", "#&"]) value = value.split(marker).join("");
      value = value.split("_").join("");
      value = atob(value).split("").map((c) => String.fromCharCode(c.charCodeAt(0) - 3)).reverse().join("");
      const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
      const config = JSON.parse(new TextDecoder().decode(bytes));
      if (config && typeof config === "object" && !Array.isArray(config)) return config;
    } catch { /* A changed data format is handled by ordinary browser capture. */ }
  }
  return null;
}

function voeStream(html, referer) {
  const data = voeConfig(html);
  if (!data || data.drm || data.licenseUrl) return null;
  const url = safeHttps(data.source);
  if (!url || !/\.m3u8(?:[?#]|$)/i.test(url)) return null;
  const stream = { url, mime: "application/vnd.apple.mpegurl", headers: { Referer: referer }, expiresInSeconds: 180 };
  const tracks = Array.isArray(data.captions) ? data.captions.map((c) => c && ({ url: c.file, lang: c.language })) : [];
  const subs = subtitlesOf(tracks);
  if (subs.length) stream.subtitles = subs;
  return stream;
}

async function resolveShadowSource(source, pageUrl, deadline) {
  await null;
  let captureUrl = source.url;
  if (source.provider === "voe") {
    let html = await shadowHtml(source.url, 12000, pageUrl, deadline);
    let stream = voeStream(html, source.url);
    if (stream) return stream;
    // VOE currently publishes this ordinary JS navigation before its player.
    const redirect = /window\.location\.href\s*=\s*(["'])(https:\/\/[^"']+)\1/.exec(html);
    const target = redirect && safeHttps(redirect[2]);
    if (target) {
      const a = new URL(source.url), b = new URL(target);
      if (!SHADOW_PLAYERS.includes(b.hostname) || b.pathname !== a.pathname || b.search || b.hash) {
        throw error("unavailable", "VOE cambió el dominio de su reproductor; hay que revisar la fuente");
      }
      captureUrl = target;
      html = await shadowHtml(target, 12000, pageUrl, deadline);
      stream = voeStream(html, target);
      if (stream) { log("info", "SHADOW_RESOLVE route=voe_hls"); return stream; }
    }
  }
  const timeoutMs = shadowTimeout(source.provider === "voe" ? 20000 : 25000, deadline);
  log("info", "SHADOW_CAPTURE started version=" + VERSION + " provider=" + source.provider + " timeout_ms=" + timeoutMs);
  let captured;
  try { captured = await kino.browser.capture(captureUrl, { timeoutMs, autoplay: true, headers: { Referer: pageUrl },
    match: "\\.(?:m3u8|mpd|mp4)(?:[/?#]|$)|/hls/|videoplayback" }); }
  catch (e) {
    log("warn", "SHADOW_CAPTURE provider=" + source.provider + " code=" + (e.code || "network"));
    throw error("unavailable", "El reproductor de " + (source.provider === "voe" ? "VOE" : "ShadowLiv") + " no entregó video: " + text(e.code || "network", 40));
  }
  const media = (captured && Array.isArray(captured.media) ? captured.media : []).find((m) => m && safeHttps(m.url));
  if (!media) throw error("unavailable", "El servidor no entregó un enlace de video compatible");
  const stream = { url: safeHttps(media.url), headers: media.headers || {}, mime: media.mime, expiresInSeconds: 180 };
  const subs = subtitlesOf(captured.subtitles);
  if (subs.length) stream.subtitles = subs;
  return stream;
}

async function resolveShadow(ref) {
  await null;
  const legacy = /^shadow:timeranger:([1-9]\d?)x([1-9]\d{0,2})(?::server:([1-9]\d{0,2}))?$/.exec(ref);
  const generic = /^shadow:sentai:([a-z0-9-]{1,110}):([1-9]\d?)x([1-9]\d{0,2})(?::server:([1-9]\d{0,2}))?$/.exec(ref);
  if (!legacy && !generic) throw error("not_found", "La referencia del capítulo no es válida");
  const slug = legacy ? TIMERANGER : generic[1];
  const m = legacy || [generic[0], generic[2], generic[3], generic[4]];
  const deadline = Date.now() + 70000;
  const data = await shadowSeries(slug);
  const episode = data.episodes.find((e) => e.season === Number(m[1]) && e.number === Number(m[2]));
  if (!episode) throw error("not_found", "Este capítulo no está publicado en la ficha de la serie");
  const pageUrl = SHADOW_SITE + "/capitulos/" + slug + "-" + episode.season + "x" + episode.number + "/";
  const html = await shadowHtml(pageUrl, 18000, SHADOW_SITE + "/series/" + slug + "/", deadline);
  let sources = shadowSources(html);
  log("info", "SHADOW_RESOLVE started version=" + VERSION + " episode=" + episode.number + " sources=" + sources.length);
  if (m[3]) sources = sources.filter((s) => s.key === m[3]);
  else {
    const preferred = kino.config.get("shadowServer") === "shadowliv" ? "shadowliv" : "voe";
    sources.sort((a, b) => Number(b.provider === preferred) - Number(a.provider === preferred));
  }
  if (!sources.length) throw error("not_found", "El capítulo no tiene una fuente compatible o la fuente elegida fue retirada");
  let last;
  // At most two providers. A lazy request resolves only its requested server.
  for (const source of sources.slice(0, m[3] ? 1 : 2)) {
    try {
      const stream = await resolveShadowSource(source, pageUrl, deadline);
      stream.label = source.label;
      if (!m[3]) stream.alternatives = sources.filter((s) => s.key !== source.key).slice(0, 8)
        .map((s) => ({ label: s.label, ref: shadowEpisodeRef(episode, slug) + ":server:" + s.key }));
      log("info", "SHADOW_RESOLVE success provider=" + source.provider);
      return stream;
    } catch (e) {
      last = e;
      log("warn", "SHADOW_SOURCE failed provider=" + source.provider + " code=" + (e.code || "network"));
      if (e.code === "rate_limited" || e.code === "geo_blocked") throw e;
    }
  }
  throw last || error("unavailable", "Las fuentes del capítulo no están disponibles");
}

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
  const catalog = await sentaiCatalog();
  const rows = [];
  for (let i = 0; i < catalog.length && rows.length < 20; i += 60) {
    rows.push({ id: i === 0 ? "shadowrangers-series" : "shadowrangers-series-" + i,
      title: "Super Sentai · por año" + (i ? " · continuación" : ""), genre: "series", ref: SENTAI_CATEGORY,
      items: catalog.slice(i, i + 60).map(shadowItem) });
  }
  return rows;
}

export async function categories() {
  await null;
  return [
    { id: "super-sentai", title: "Super Sentai", ref: SENTAI_CATEGORY, art: CATEGORY_ART + "super-sentai.jpg" },
    { id: "kamen-rider", title: "Kamen Rider", ref: RIDER_CATEGORY, art: CATEGORY_ART + "kamen-rider.jpg" },
  ];
}

export async function browse(ref, cursor = null) {
  await null;
  if (ref !== SENTAI_CATEGORY && ref !== RIDER_CATEGORY) throw error("not_found", "La categoría no existe");
  // Category-bound cursors cannot accidentally continue into the other catalog.
  const prefix = ref + ":offset:";
  if (cursor !== null && (typeof cursor !== "string" || !cursor.startsWith(prefix) || !/^(0|[1-9]\d{0,5})$/.test(cursor.slice(prefix.length))))
    throw error("not_found", "La página de la categoría no es válida");
  const offset = cursor === null ? 0 : Number(cursor.slice(prefix.length));
  const items = ref === SENTAI_CATEGORY ? (await sentaiCatalog()).map(shadowItem) : [item(await seriesData())];
  return { items: items.slice(offset, offset + 100), next: offset + 100 < items.length ? prefix + (offset + 100) : null };
}

export async function section({ tab } = {}) {
  await null;
  const chosen = tab === "kamen-rider" ? "kamen-rider" : "super-sentai";
  const tabs = [{ id: "super-sentai", label: "Super Sentai" }, { id: "kamen-rider", label: "Kamen Rider" }];
  if (chosen === "super-sentai") return { tabs, tab: chosen,
    hero: { title: "Super Sentai", image: CATEGORY_ART + "super-sentai.jpg", text: "Series ordenadas por año de estreno." },
    rows: await home() };
  return { tabs, tab: chosen,
    hero: { title: "Kamen Rider", image: CATEGORY_ART + "kamen-rider.jpg", text: "Series de Kamen Rider." },
    rows: [{ id: "kamen-rider-series", title: "Kamen Rider", genre: "series", ref: RIDER_CATEGORY,
      items: [item(await seriesData())] }] };
}

function searchWords(value) {
  const accents = { á: "a", à: "a", â: "a", ä: "a", ā: "a", é: "e", è: "e", ê: "e", ë: "e", ē: "e",
    í: "i", ì: "i", î: "i", ï: "i", ī: "i", ó: "o", ò: "o", ô: "o", ö: "o", ō: "o",
    ú: "u", ù: "u", û: "u", ü: "u", ū: "u", ñ: "n" };
  return value.toLowerCase().replace(/[áàâäāéèêëēíìîïīóòôöōúùûüūñ]/g, (c) => accents[c])
    .replace(/[^a-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
}

export async function search(query) {
  await null;
  const forms = [query && query.q, query && query.originalTitle]
    .concat(query && Array.isArray(query.altTitles) ? query.altTitles.slice(0, 5) : [])
    .filter((q) => typeof q === "string" && q.trim());
  if (!forms.length) return [];
  const words = forms.map(searchWords).filter((w) => w.length);
  if (!words.length) return [];
  const gavv = words.some((w) => w.every((v) => "kamen rider gavv".includes(v)));
  if (gavv) return [item(await seriesData())];
  const catalog = await sentaiCatalog();
  return catalog.filter((s) => {
    const haystack = searchWords(s.title).join(" ") + " " + s.year;
    return words.some((w) => w.every((v) => haystack.includes(v))) || words.some((w) => w.join(" ") === "super sentai");
  }).slice(0, 100).map(shadowItem);
}

export async function episodes(ref) {
  await null;
  const sentai = typeof ref === "string" && /^shadow:sentai:([a-z0-9-]{1,110})$/.exec(ref);
  if (ref === SHADOW_REF || sentai) {
    const data = await shadowSeries(sentai ? sentai[1] : TIMERANGER);
    return {
      series: { title: data.title, poster: data.poster, overview: data.overview, year: data.year },
      episodes: data.episodes.map((e) => ({ season: e.season, number: e.number,
        ref: shadowEpisodeRef(e, data.slug), title: e.title, still: e.still })),
    };
  }
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
  return streamFromParams(playerData(html), embed);
}

function streamFromParams(params, referer) {
  if (!params) return null;
  if (params.drm || params.licenseUrl) throw kino.error("unavailable", "Este reproductor requiere un tipo de video protegido que la prueba no admite");
  const formats = [], seen = new Set();
  const headers = { Referer: referer };
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

async function captureStream(pageUrl, referer) {
  await null;
  let captured;
  try {
    log("info", "ULS_CAPTURE started version=" + VERSION + " mode=web timeout_ms=25000");
    captured = await kino.browser.capture(pageUrl, {
      timeoutMs: 25000, autoplay: true, match: VIDEO_MATCH, headers: { Referer: referer },
    });
  } catch (e) {
    const code = e.code || "network";
    log("warn", "ULS_CAPTURE " + code + " version=" + VERSION + " mode=web");
    const details = {
      browser_unavailable: "Este dispositivo no dispone del navegador integrado necesario para VK",
      blocked: "VK no permite abrir este reproductor automáticamente",
      busy: "El navegador integrado está ocupado; intenta nuevamente",
      timeout: "Prueba " + VERSION + ": la página del capítulo no inició un video dentro del tiempo disponible",
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
  const copy = (m) => ({
    url: safeHttps(m.url),
    mime: m.mime || (VK_FILE_RE.test(m.url) ? "video/mp4" : undefined),
    headers: m.headers || {},
  });
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
  if (typeof ref === "string" && ref.startsWith("shadow:")) return await resolveShadow(ref);
  const match = /^episode:(kamen-rider-gavv-[a-z0-9-]{1,80})$/.exec(String(ref || ""));
  if (!match) throw error("not_found", "Capítulo de prueba no válido");
  const data = await seriesData(true);
  const episode = data.episodes.find((e) => e.id === match[1]);
  if (!episode) throw error("not_found", "Ese capítulo ya no está disponible");
  log("info", "ULS_RESOLVE started version=" + VERSION + " episode=" + episode.number + " host=" + new URL(episode.videoUrl).hostname);
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
  log("info", "ULS_RESOLVE fallback=web_page version=" + VERSION);
  // Use the real embedding page so its iframe runs with its original context.
  // One ordinary capture; no retries or CAPTCHA handling.
  return await captureStream(referer, SITE + "/series/" + SERIES_ID);
}
