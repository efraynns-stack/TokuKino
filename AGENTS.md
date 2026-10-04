# AGENTS.md: building a Kino plugin with an AI assistant

You are helping a person write a **Kino plugin**: a public GitHub repository with one JSON manifest
(`kino-plugin.json`) and one JavaScript ES module (`plugin.js`) that Kino, an Android video app for
phones and TVs, runs inside a QuickJS sandbox. The plugin turns one video source into search
results, Home rows, episodes and playable streams (and, optionally, live TV channels).

Your job: produce a plugin that **Kino accepts and that actually plays**, verified with the Node kit
before anyone installs it. Kino is strict: every rule below is enforced by the app, not a style
suggestion. When this file and your prior knowledge disagree, this file and the guide win.

## 1. Read first, in this order

1. This file, whole.
2. The complete guide as one text file: <https://kinotvapp.github.io/kino-plugins/llms-full.txt>
   (English; the same pages in Spanish live at <https://kinotvapp.github.io/kino-plugins/>). If you
   cannot fetch it, read at least these pages, in order:
   [The contract](https://kinotvapp.github.io/kino-plugins/en/contract/),
   [The manifest](https://kinotvapp.github.io/kino-plugins/en/manifest/),
   [The `kino` API](https://kinotvapp.github.io/kino-plugins/en/kino-api/),
   [Limits and engine quirks](https://kinotvapp.github.io/kino-plugins/en/engine-limits/),
   [Test it locally](https://kinotvapp.github.io/kino-plugins/en/test-locally/),
   [Publishing](https://kinotvapp.github.io/kino-plugins/en/publish/),
   [Signed plugins](https://kinotvapp.github.io/kino-plugins/en/signed/),
   [What's new](https://kinotvapp.github.io/kino-plugins/en/changelog/), and for live TV
   [Live channels](https://kinotvapp.github.io/kino-plugins/en/live-channels/). For apiVersion 6
   features, the page of each one (and, for an overview of everything a plugin can change in how Kino
   shows it, [Customize your plugin](https://kinotvapp.github.io/kino-plugins/en/customize/)):
   [The settings form](https://kinotvapp.github.io/kino-plugins/en/settings-form/),
   [Signing every request](https://kinotvapp.github.io/kino-plugins/en/signed-streams/),
   [Moving saved titles](https://kinotvapp.github.io/kino-plugins/en/migrate/),
   [Section, categories and colors](https://kinotvapp.github.io/kino-plugins/en/section-theme/),
   [Logs and telemetry](https://kinotvapp.github.io/kino-plugins/en/diagnostics/),
   [Hidden browser](https://kinotvapp.github.io/kino-plugins/en/browser/).
3. The machine-readable contract: `contract.json` (every number and rule) and `kino.d.ts` (every
   shape and the whole `kino` API), at <https://kinotvapp.github.io/kino-plugins/reference/contract.json>
   and <https://kinotvapp.github.io/kino-plugins/reference/kino.d.ts>, and also in the template.
4. The complete reference: `plugin.js` and `kino-plugin.json` in
   [kinotvapp/kino-plugin-own-server](https://github.com/kinotvapp/kino-plugin-own-server) -- raw at
   <https://raw.githubusercontent.com/kinotvapp/kino-plugin-own-server/main/plugin.js> and
   <https://raw.githubusercontent.com/kinotvapp/kino-plugin-own-server/main/kino-plugin.json> -- use
   nearly every apiVersion 2/3 feature a plugin can have: settings, a session, `kino.storage`,
   downloads, `live` items and `channels`. Study it whenever the plugin needs settings, auth,
   downloads or live channels. For a plain plugin with no settings or login, read
   `plugin.js` in [kinotvapp/kino-plugin-archive](https://github.com/kinotvapp/kino-plugin-archive)
   instead, the simpler reference for the five basic capabilities.

Do not rely on memory of other plugin systems (Kodi, Stremio, Cloudstream…): the contract is different.

## 2. Before writing code, settle these with the person

- **The source**: the site or API, and whether it needs a login, an API key or a server address the
  person types. Credentials always come from `settings` (type `password` for secrets), never from
  the code.
- **The hosts**: every host your code calls **and** every host the video, subtitles, audio tracks,
  HLS/DASH segments and keys, and redirects land on. Look at real responses (`curl -sIL`) to find
  redirect targets and CDNs.
- **What it offers**: movies, series (with `episodes`), Home rows (`home`, and `browse` for "Ver más"),
  live channels (`live` items at apiVersion 2, or the En vivo tab with `channels` at apiVersion 3).
- **The lowest `apiVersion` that works**: `1` unless you need `download`, `drm`, `insecureHttp`,
  `"hosts": []`, or `live` items (`2`), `channels`/`liveStreamHosts` (`3`), or a `list` setting,
  `"streamHosts": "any"` or sealed `secrets` (`4`), or an author `signature` (`5`, Kino 0.9.45+), or
  anything in "apiVersion 6" in section 4 (`6`, **Kino 0.9.50+**; Kino 0.9.49 and older refuse the
  whole plugin with "Este plugin necesita una versión más nueva de Kino"). `apiVersion` 6 = Kino
  0.9.50: never declare 6 "just in case".
- **Whether to sign it** (optional, `apiVersion` 5): ask whether the person wants people to know every
  update comes from them. If yes, follow "Signing" in section 4. Never sign without telling them
  what it is and that the key must be kept and backed up.
- Whether the person has the right to use the source. Do not help circumvent DRM: the only DRM path
  is a Widevine license the source itself hands out (the `drm` capability).
- **Offline downloads**: declare `download` (apiVersion 2) when the source allows saving titles.
  Kino (phones only) saves a movie or episode that is a progressive file (`mp4`, `mkv`, `webm`,
  `ts`…) or an HLS VOD stream (AES-128 keys fine; discontinuities kept unless the video/audio codecs
  change at one, which is refused); a live stream, DASH, SAMPLE-AES or any DRM never downloads. A
  download never asks about a host: a refused server ends it for good (the person plays the title
  once to approve a server playback would ask about, then downloads again).
- **Whether plain `kino.fetch` is enough** (it almost always is): fetch the real pages with `curl` and
  look for the video address in the HTML, JSON or a script. Only if a server's embed builds the address
  by running its own scripts does the plugin need the hidden browser (`"browser": true`,
  `kino.browser.capture`, apiVersion 6, a red consent line): see "The hidden browser" in section 4. If
  the site shows a captcha or "verify you are human", tell the person Kino cannot use that source that
  way: **never** try to get around it.
- **Several servers or languages per title?** Plan labelled lazy copies (apiVersion 6): resolve one,
  list the rest as `{ label, ref }` (section 4).
- **Optional apiVersion 6 extras to offer only when they fit**: a settings form with a status line and
  action buttons (an account to link and a "Cerrar sesión"), a section of its own and Categorías
  tiles, colors, `adult` marks for 18+ content, `telemetry` so its errors reach Kino's error tracker,
  `migrate` when the plugin replaces an older one. Each has a cost (approval prompts, more code): ask.
- If the person wants a **Nuvio scraper**, stop: Kino installs Nuvio repositories directly
  ([Nuvio scrapers](https://kinotvapp.github.io/kino-plugins/en/nuvio/)); no plugin needs writing.
- If the person wants a **Stremio addon** in Kino, stop too: Kino installs it from its `manifest.json`
  URL ([Stremio addons](https://kinotvapp.github.io/kino-plugins/en/stremio/)). Write a Kino plugin only
  for what an addon cannot do there (torrents and P2P are refused either way).

**The person may not program.** Explain each step in plain Spanish, run the commands yourself (say
which and why first), ask before anything irreversible (deleting files, pushing, publishing), and
give exact clicks for what they must do on GitHub or in Kino. Ask for the full terminal output or the
exact message Kino shows, never a summary.

## 3. Workflow

1. **Start from the template, not a fork** (Kino's community search leaves forks out). Use
   `kinotvapp/kino-plugin-archive` for a plain plugin (no settings, no login); use
   `kinotvapp/kino-plugin-own-server` instead when the plugin needs settings, auth, downloads or
   live channels:
    - `gh repo create my-plugin --public --template kinotvapp/kino-plugin-archive --clone` (swap the
      template name for `kinotvapp/kino-plugin-own-server` when that fits better), or
    - `git clone https://github.com/kinotvapp/kino-plugin-archive` (or `-own-server`) somewhere
      else, then `node kino-plugin-archive/sdk/init.mjs my-plugin --host example.com` and copy its
      `sdk/` and `contract.json` into `my-plugin/` (the kit looks for `contract.json` next to
      `sdk/`). `init.mjs` never overwrites a file.
2. **Write `kino-plugin.json`**: a new `id` (`^[a-z0-9][a-z0-9-]{1,39}$`, never a reserved one, never
   changed after release), `name`, `version` `0.1.0`, the lowest `apiVersion`, `entry`, `hosts`,
   `capabilities`, `settings` if needed, `description` in Spanish.
3. **Implement one named `export async function` per declared capability** (`search`, `home`,
   `browse`, `episodes`, `resolve`; `liveCategories` + `liveChannels` (+ optional `guide`, and optional `liveSearch` for a
   catalog too big to list whole: `liveSearch({ query })` returns channels like a `liveChannels`
   page, with the same `id`s; export it only if the source can really search) for `channels`; `migrate`
   for `migrate`; `meta` for `meta`; `subtitles` for `subtitles`). `download`, `drm` and `scopedSearch` are declarative: nothing to export. Other
   exports are required by a manifest field, not a capability: `section` (by `"section"`),
   `settingsStatus` (by a `status` setting), `action` (by an `action` setting), `sign` (by any stream
   with `signing: "request"`); `categories` (needs `browse`) and `validateSettings` are optional.
   Return plain JSON only.
   Kino loads exactly one file (`entry`), with no `require` and no module resolver, so do not split
   source across files that `plugin.js` imports at runtime. If the plugin is big enough to want more
   than one file for its own sake, write it split (e.g. `src/plugin.js` importing from
   `src/animeav1.js`) and bundle it to a single `plugin.js` before validating or publishing:
   `npx esbuild src/plugin.js --bundle --format=esm --outfile=plugin.js`. `plugin.js` is always the
   finished, single-file output — never hand-edit it if a `src/` exists.
4. **Validate the manifest and exports**: `node sdk/validate.mjs .` must exit 0.
5. **Run every function against the real source** and read what Kino would drop (stderr):

    ```
    node sdk/run.mjs . search "algo"
    node sdk/run.mjs . home
    node sdk/run.mjs . browse <row-ref>
    node sdk/run.mjs . episodes '<series-ref>'
    node sdk/run.mjs . resolve '<ref>'
    node sdk/validate.mjs . --run search "algo"
    ```

    For live channels: `node sdk/run.mjs . live categories`, `node sdk/run.mjs . live channels <categoryId>`,
    `node sdk/run.mjs . live guide <id,id>`, `node sdk/run.mjs . live search <query>` (for `liveSearch`), `node sdk/run.mjs live playlist <url|file> [--epg <url|file>]`,
    and `resolve <ref> --live` for a channel's ref. Settings: `--config key=value` (repeatable) or
    `sdk/config.json` (never committed). apiVersion 6: `node sdk/run.mjs . section [tab]`,
    `. categories`, `. theme`, `. settingsStatus`, `. action <key>`, `. validateSettings '<json>'`,
    `./plugin.js migrate '{"kind":"title","ref":"…"}'`, `--within '<ref>' ./plugin.js search "…"`,
    `./plugin.js sign '{"url":…,"kind":"segment","ref":…,"context":…}'`,
    `--retry conflict:1 ./plugin.js resolve '<ref>'`, and `node sdk/validate.mjs . --run liveSearch <q>`
    for the 18+ marks. Lines marked `[dropped by Kino]` are what the app would drop.
6. **Record fixtures and test offline**: `node sdk/run.mjs --record test/fixtures.json . search "algo"`,
   then `node --test test/plugin.test.mjs` (the scaffold's test: it validates the manifest and
   replays the fixtures offline). Name the file explicitly: a bare `node --test test/` does not work
   on every Node version, and a bare `node --test` would also run the kit's own suite. The kit's
   tests (`node --test sdk/test/kit.test.mjs`) are only for someone changing the kit (you should not).
7. **Check what Node hides** (the kit is more permissive than Kino): grep `plugin.js` for the
   missing globals (section 4) and for any `throw` before the first `await` of an async function.
8. **Publish**: public repository, `kino-plugin.json` and `plugin.js` at the root, `.gitignore` with
   `.kino-storage.json`, `.kino-cookies.json`, `.kino-secrets.json`, `sdk/config.json`; tag a release (`v1.0.0`);
   add the topic and a one-line GitHub description:
   `gh repo edit owner/repo --add-topic kino-plugin --description "…"` (or, on the repo page,
   About → ⚙ → Description + Topics → Save changes). Write a good Spanish `name` and `description` in
   the manifest: that is what Kino's cards show (see section 6). The person installs it from Kino (on
   a phone: menu ☰ → Plugins → the + button; on a TV: Ajustes → Plugins → Agregar), typing
   `owner/repo` → Agregar → Instalar, and must try it in the app (search, episodes, play, and download
   if declared). The same field ("Escribe usuario/repositorio de GitHub o pega la URL del manifest
   (kino-plugin.json)") also takes the URL of the `kino-plugin.json` (GitHub `blob`/`raw`,
   raw.githubusercontent.com or `cdn.jsdelivr.net/gh/owner/repo@<exact ref>/…`, which all become
   `owner/repo`; jsDelivr needs an exact ref such as `@main` or `@v1.0.0`, `@latest` is the default
   branch, a range like `@1` is refused). From the Kino version after 0.9.49 a plugin can also live
   **outside GitHub**, shared as the `https` URL of its `kino-plugin.json` on any public server (the
   file must be named exactly that; `entry`/`icon` are read next to it; no IPs, `localhost` or local
   names). Such a `url:` install cannot use sealed `secrets` (refused), always counts as unsigned,
   updates from that same URL, and is never listed in "De la comunidad" (discovery only finds GitHub
   repositories with the topic). Recommend GitHub + topic unless the person has a reason not to.
9. **Updates**: raise `version` every time (an equal or lower version never reaches anyone). Adding
   hosts, `permissions`, `download`, `drm`, `channels`, `migrate`, `telemetry` (or `true` → `"verbose"`),
   `liveStreamHosts`, `streamHosts`, `browser` (or `true` → `"pages"`), an `insecureHttp` host, or `secrets` to a plugin that had none
   makes the update wait for the person's approval. From Kino 0.9.50 updates are also checked at app
   start (at most every 12 h), a badge counts the waiting ones, and a failed call of a plugin whose
   update waits says "Hay una versión nueva de <name>: actualízala en Ajustes ▸ Plugins".

## 4. Hard rules (with the exact numbers)

**Network**

- `kino.fetch` reaches only the manifest's `hosts` (and servers the person typed in a `url`
  setting), over `https`, checked on **every redirect hop**. `*.example.com` does **not** cover
  `example.com`: list both. No IPs, no `localhost`, no `.local`/`.lan`/`.internal`/`.localhost`/`.home.arpa`,
  no bare `*`, no scheme/port/path in `hosts`. At least 1 entry (`[]` only from apiVersion 2 with a
  `url` setting) and **no maximum from Kino 0.9.45**; Kino 0.9.44 and older refuse more than 20 (the
  kit warns "Más de 20 hosts: ..."), so with more than 20 hosts tell the person it needs 0.9.45+. During `resolve` and `episodes` only, a fetch to an undeclared `https` host asks the
  person (the call's clock stops meanwhile) -- at most 3 hosts per call, and none after the person
  rejects one; everywhere else it just fails as `host_not_allowed`. Declared names that resolve into
  the home network (including IPv6 prefixes embedding such an address) are refused, and plugin
  traffic never goes through a device proxy.
  Likewise, when the person opens a title, an undeclared `https` host of the returned `Stream` (video,
  subtitle, audio track, license) or one the player meets mid-playback is asked about once; a
  download or anything in the background is never asked. Never design around those questions:
  declare every host.
- Kino strips `Accept-Encoding` (and `Host`, `Content-Length`, `Transfer-Encoding`, `Connection`,
  `Cookie2`) from your headers and always hands you decompressed bodies.
- The `Stream` URL, subtitles, `audioTracks`, every HLS variant/segment/key, DASH `BaseURL`, and the
  `drm` `licenseUrl` must be on those same hosts. Images (`poster`, `backdrop`, `still`, `logo`) are
  the only exception: any `http` or `https` URL (a public IPv4 is fine), never a private address or local name.
- Plain `http` only for a server the person typed, or a host declared
  `{ "host": "…", "insecureHttp": true }` (apiVersion 2, no wildcard; shown in red to the person).
- **`"entry"` and `"icon"` never start with `./`.** Write `"plugin.js"`, not `"./plugin.js"`: Kino
  0.9.45 and older refuse the `./` (`El campo "entry" debe ser una ruta relativa a un archivo .js`)
  and the plugin does not install (an AI-generated plugin did exactly this and failed for about 35
  installs). Kino 0.9.46 and later tolerate it, but never rely on that. The kit's `validate.mjs` refuses it.
- `"liveStreamHosts": "any"` (apiVersion 3 + `channels`) frees only live channel streams, never
  `kino.fetch`, playlists, subtitles, licenses, movies or images.
- `"streamHosts": "any"` (apiVersion 4) lets what the plugin plays be on any public host: for a movie
  or episode the video, its manifest, redirects, `subtitles` and `audioTracks` (and its download);
  for a channel the `liveStreamHosts` rule. Never `kino.fetch`, images or DRM licenses, never the
  home network. Shown in red; prefer listing real domains. The person can grant the same rule
  themselves ("Permitir video de cualquier servidor", the broad video permission).
- `"fetchHosts"` exists only for plugins Kino converts from Nuvio scrapers; in a hand-written plugin
  it does nothing (`sdk/validate.mjs` warns "fetchHosts solo tiene efecto en plugins convertidos desde
  Nuvio; en tu plugin se ignora"). Do not use it. From apiVersion 4 any value but `"any"` is refused.

**The engine is QuickJS, not Node, not a browser.** Missing: `setTimeout`, `setInterval`,
`setImmediate`, `queueMicrotask`, `Buffer`, `process`, `require`, `fetch`, `AbortController`,
`structuredClone`, `performance`, `crypto`, `WeakRef`, `Intl`. Present: `URL` (no punycode),
`URLSearchParams`, `atob`, `btoa`, `TextEncoder`, `TextDecoder` (UTF-8), `console` (`URL` has the
usual setters: `url.hostname = …` works). The extra globals Nuvio-converted scrapers get
(`setTimeout`, `AbortController`, `crypto.subtle`, `require`…) are **not** available to your plugin. Use
`kino.fetch`, `kino.sleep`, `kino.crypto`, `kino.storage`, `kino.html.select` (only in the app; the
Node kit's version throws). No `import`: one file; bundle anything else into it. `localeCompare`
and `toLocaleString` do not localize. No network calls at the module's top level (install loads it
offline). Never write a synchronous infinite loop: it cannot be interrupted.

**Limits** (from `contract.json`)

| What | Limit |
| --- | --- |
| Manifest / entry file / icon | 16 KB / 1 MB / 128 KB |
| Memory / stack | 64 MB / 1 MB |
| Time per call | `search` 15 s; `home`, `browse`, `episodes`, `resolve` 20 s (`resolve` 75 s for an approved `"browser": true` or `"pages"` plugin, and for one Kino generates from a Nuvio scraper or a Stremio addon); `liveCategories`, `liveChannels`, `guide` 20 s; `liveSearch` 15 s; `subtitles` 10 s; apiVersion 6: `section`, `categories`, `validateSettings` 20 s, `settingsStatus` 10 s, `action` 30 s, `migrate` 10 s, `sign` 1.5 s; `meta` 6 s per plugin (no answer after that); all fetches and sleeps count (not the time the person spends answering a host question) |
| Module top level | 10 s |
| Idle sandbox | closed after 5 minutes |
| Timeouts | 3 in a row disable the plugin ("No responde") |
| `kino.fetch` | 15 s default, 30 s max; body 5 MB; request 1,048,576 characters; 60 requests per call (every redirect hop counts, refused ones too); 6 in flight at once; 3 host questions per call; 10 redirects |
| Cookies | 50 per domain, 64 KB total |
| `kino.storage` | 256 KB; `ttlMs` 1..2,592,000,000 (30 days) |
| `kino.sleep` | 0..5,000 ms |
| `kino.crypto` | 5 MB data; PBKDF2 100,000 iterations, 64-byte keys; `randomBytes` 1,024 |
| Log message | 2,000 characters; for a plugin with `"telemetry"` (apiVersion 6; no other plugin sends lines), a failed call's last 30 lines (300 chars each, scrubbed, 2 KB) go with the error report: log steps and statuses, never what the person typed, a secret or a setting value |
| Return value | 2,000,000 characters of JSON |
| Results | `search` 100; `home` 20 rows × 60; `browse` 100/page; `episodes` 5,000 (+50 `seasons`); `ref` 4,096 chars; `next` 2,048 chars; `id` `^[A-Za-z0-9._~-]{1,128}$` |
| Live (apiVersion 3) | 200 categories; 500 channels/page, 10 pages at first then 5 more per scroll, up to 10,000 channels (200 pages)/category; `liveSearch` keeps 100 channels, asked from 2 characters; `guide` 50 channels, 24 h, 100 entries/channel; `number` 1..9999 |
| Settings | 12 with a value, plus 16 `section`/`status`/`action` (apiVersion 6); `text` 500, `url` 2,048, `password` 500 characters; a `list` holds up to `max` entries (1..50, default 20), each of 1..4 `text`/`url` fields; `status` text 200, action `message` 300, `confirm` 120, `clearSettings` 12 keys |
| `secrets` (apiVersion 4) | 16; names `^[A-Za-z][A-Za-z0-9_]{0,31}$`; values 1..4,096 bytes (1..8,192 at apiVersion 6); typed cipher keys 16/24/32 bytes (apiVersion 6) |
| Stream (apiVersion 6) | `alternatives` 8 (any apiVersion; lazy and concrete together); `label` 48 chars; lazy `ref` 512 chars; `alternateHosts` 6; `signContext` 4,096 chars; 3 `resolve` retries |
| Hidden browser (apiVersion 6) | one page at a time in the whole app; `capture` `timeoutMs` ≤ 25,000 (default 18,000), ≤ 8 media, 10 subtitles; `page` `timeoutMs` ≤ 25,000 (default 15,000; Kino cuts it to the call's remaining time minus 1.5 s; pass ~12,000 in `search`), never from `categories`, top document on your hosts, 20 reads a minute; automatic fallback waits ≤ 20 s per lazy copy |
| Section / categories (apiVersion 6) | label 20; 8 tabs × 24 chars; hero text 300; 24 category tiles, titles 40 |
| Error text | `kino.error` detail 200 characters; `userMessage` 160 (apiVersion 6) |

**Data rules that silently drop things**: an item `id` outside `^[A-Za-z0-9._~-]{1,128}$` (derive a
slug); a repeated `id`; `adult: true` below apiVersion 6 (from 6 it is kept behind the person's 18+
code); a `series` without the `episodes` capability; a `live` item at apiVersion 1, or in a `home` row
below apiVersion 6; an episode `number` 0; images that are not `http`/`https` or point at a local
address; in `search`, a `live` item whose name shares too few words with the query (so never
answer a search with your whole channel list). `id` must be stable across calls (library
and progress hang off it); `ref` may change but must keep working later (put a stable id in it and
look fresh links up inside `resolve`). A `Stream` is all or nothing; `mime` must look like
`video/mp4` or be omitted.

**Errors**: `throw kino.error(code, detail)` with one of these codes; the person reads Kino's Spanish
sentence, your detail (cut at 200 characters) goes to the log.

| Code | The person sees |
| --- | --- |
| `auth_required` | "Configura {plugin} en Ajustes ▸ Plugins" (from Kino 0.9.50 "… Ajustes ▸ {plugin}" when it has settings: its own tab), with a button to Configurar |
| `not_found` | "No se encontró en {plugin}" |
| `geo_blocked` | "Este contenido no está disponible en tu región" |
| `rate_limited` | "{plugin} está limitando las peticiones; intenta en unos minutos" |
| `unavailable` | "{plugin} no está disponible ahora" |

**`userMessage` (apiVersion 6)**: `throw kino.error("not_found", "E100006", { userMessage: "Este capítulo
ya no está disponible." })` shows "Mensaje de <plugin name>: <sentence>" **instead of** Kino's line,
only for the five codes above and only if the sentence passes every safety rule; otherwise Kino's line
shows and the sentence is dropped silently. The rules, in short: 1 to 160 characters of Spanish/Latin-1
letters, digits and plain punctuation (no emoji, `@`, other scripts or invisible characters); at least
two words; no URL, domain, `www` or "punto com"; fewer than 6 digits in all, no digit glued to a
letter; never spells "Kino"; never asks for money, credentials, codes or contact (`pag…`, `recarg…`,
`transfer…`, `contraseñ…`, `clave…`, `token…`, `tarjeta`, `PIN`, Nequi, Daviplata, WhatsApp, Telegram,
SMS/verification codes); never contains a password the person typed or a sealed value. The plugin
name itself must be plain (no `:`, no digit glued to a letter). **A plugin that uses `userMessage` to
ask for money, credentials or contact outside Kino breaks the rules for plugins.** Each author is responsible
for their own plugin; Kino only lists community plugins (no recommendation or promotion), and removes one
that breaks the rules (asking for money, passwords or contact data, malware, rights claims) from the
community index through [`community-blocklist.json`](https://github.com/kinotvapp/kino-plugins/blob/main/community-blocklist.json); anyone can report it with the
["Reclamo / retiro de plugin"](https://github.com/kinotvapp/kino-plugins/issues/new?template=reclamo-retiro-plugin.yml) issue template. An installed copy stays installed, shows
"Retirado del índice de la comunidad." and gets no more updates; a fork needs its own report. Build it where you
throw, write it in Spanish, and never echo what the person typed. Full rules:
[Your own sentence](https://kinotvapp.github.io/kino-plugins/en/contract/#user-message).

`kino.fetch` does not throw on non-2xx (check `r.ok`); it throws with `e.code` one of
`host_not_allowed`, `timeout`, `network`, `too_large`, `invalid_request`. `kino.crypto` errors carry
`code: "crypto_error"`.

**The unhandled-rejection trap**: in Kino 0.9.49 and older a `throw` inside an `async` function
**before its first `await`** aborts the whole call even if the caller wraps it in `try`/`catch` (also
`return Promise.reject(e)` and a `new Promise` rejected at once). Kino 0.9.50 catches it like Node; only a
rejection nobody ever handles still fails the call. The Node kit does not show the old behaviour.
Since people update late, keep `await`ing first (a fetch, or `await null;`) and validate after.

**Language**: everything the person sees (the manifest's `name` and `description`, settings `label`
and `hint`, Home row titles, error details, badges) is **Spanish from Bogotá, with tuteo** ("Configura",
"Escribe tu usuario"), **never voseo** ("Configurá", "Escribí" are wrong). Code, identifiers and
comments may be English.

**Secrets**: never hardcode a password, token, API key or cookie in `plugin.js` or the repository;
ask for it in a `settings` entry of type `password`, keep derived tokens in `kino.storage` keyed by
user and server, and never log a setting. A `url` setting cannot have a `default` (use `hint`).
A fixed key that belongs to the plugin's author (not the person) can be **sealed** instead:
`node sdk/seal.mjs --repo owner/repo --name apiKey` prints `kino-sealed:v1:…` for the manifest's
`"secrets"` (apiVersion 4); the code uses `kino.secret("apiKey")` (fine at module top level too),
a marker Kino swaps for the
value only inside `kino.fetch`, toward the manifest's `hosts` over https, and redacts from everything
the code reads back. It is obfuscation, not secrecy; seals only open when the plugin is installed
from its default branch (no `@ref`); the Node kit reads plain values from `.kino-secrets.json`
(never commit it). Full rules: [Sealed secrets](https://kinotvapp.github.io/kino-plugins/en/manifest/#secrets).

**Downloads are declarative.** `"download"` in `capabilities` (apiVersion 2) is a flag the app acts
on: export nothing extra, there is no separate "resolve for download" call (Kino calls your
`resolve(ref)` when the queued download actually runs). Progressive files and non-live HLS save;
DASH, live, SAMPLE-AES and DRM never do. Phones only.

**Signing (apiVersion 5, Kino 0.9.45+, optional).** The author signs `plugin.js` with their own
Ed25519 key; the manifest carries `"signature": { "authorKey": <64 hex>, "value": <128 hex> }`;
Kino checks it at install and at every update (never at runtime), pins the key at the first install
(trust on first use) and refuses an update signed with another key or no longer signed. People see
"Firmado por su autor" and a "Firmado" badge. It does not hide the code. Full page:
[Signed plugins](https://kinotvapp.github.io/kino-plugins/en/signed/). When the person wants it:

1. Explain it in plain Spanish first. Then `node sdk/seal.mjs --keygen` **once** (writes
   `kino-author-key.pem`; refuses to overwrite). Add `*.pem` to `.gitignore` **before any commit**
   (the scaffold's `.gitignore` does not have it). Tell them to back the key up and never share it:
   there is no recovery, and a new key makes every existing install refuse the update (they must
   uninstall and reinstall). **Never put the key in the repository, the chat or a log.**
2. Set `"apiVersion": 5`, then `node sdk/seal.mjs --sign --repo owner/repo[/folder]` **after the last
   change** to `plugin.js` or `version`, and **again after every later change** (the signature covers
   the exact entry file, repo, `id` and `version`).
3. `node sdk/validate.mjs . --repo owner/repo` verifies it and fails if a `.pem` is tracked.
4. If it says "La firma del autor no es válida…", the code, `id`, `version` or repo changed after
   signing: sign again. If a person reports "firmada con otra clave de autor", the key changed.

**apiVersion 6 (Kino 0.9.50+): every widening, when to use it, its limits.** Declare `"apiVersion": 6`
only when you use one of these.

- **Typed / larger sealed secrets.** Values up to 8,192 bytes; a key for `kino.crypto` can be sealed as
  `{ "seal": "kino-sealed:v1:…", "use": "cipher-key", "encoding": "hex"|"base64" }`
  (`seal.mjs --use cipher-key --encoding hex`), 16/24/32 bytes, usable as the whole key of any cipher
  (DES-EDE3 too) and **nothing else**: never HMAC/PBKDF2 input, never in `kino.fetch`. Use it when a
  site's own player ships a fixed cipher key.
- **`migrate`** (capability + export, needs approval): Kino asks it about saved library titles,
  chapters and live favorites it can no longer open; answer what `search()` would return today, or
  `null`. 10 s each; avoid fetching; never return a `plg1:` ref. Use it only when the plugin replaces
  an older source or changes its ref format.
- **Request-signed streams** (`signing: "request"` + export `sign`): only for an HLS origin that wants a
  fresh signature on every playlist/segment request. `sign()` runs in a separate **signing lane**: only
  `kino.crypto`, `kino.secret`, `kino.config`, `kino.html`, `kino.log`; no network, no storage, no
  cookies, no sleep, no memory shared with the main runtime; 1.5 s per call; three failures stop the
  video. Everything it needs travels in `signContext` (a string ≤ 4,096 chars, never a `kino.secret`
  marker: call `kino.secret()` inside `sign`). No `drm`, no `audioTracks`, not downloadable, not for an
  inline channel stream. `resolve(ref, { retry: { reason: "conflict"|"expired", attempt, status } })`
  is called again on 409 or repeated 401/403 (3 tries). `alternateHosts` (≤ 6, same host rules as `url`)
  are other hosts serving the same stream. Casting works through the phone, which must stay on the
  same Wi-Fi. [Signing every request](https://kinotvapp.github.io/kino-plugins/en/signed-streams/).
- **Settings form**: `section` (heading), `status` (needs export `settingsStatus()` → `{ key: text }`,
  10 s) and `action` (needs export `action(key)` → `{ message?, refresh?, clearSettings? }`, 30 s,
  optional `confirm`) hold no value; at most 16 on top of the 12 valued settings. `clearSettings`
  empties up to 12 of the plugin's own optional valued settings (never `required` ones); use it for
  "Cerrar sesión". Optional `validateSettings(values)` (20 s) returns `null` to accept, a text, or
  `{ key: "message" }` to refuse. Every plugin with settings gets its own Ajustes tab; settings sync
  between paired devices and arrive **without** `validateSettings`, so key any `kino.storage` session
  by account and never store a device identity in a setting. A `toggle` without `default` reads
  `false`, a `select` without one its first option, a `list` an array of `{ [field key]: string }`;
  `confirm` only on `action`, `fields`/`max` only on `list`, `options` only on `select`. There are no
  conditional fields: group with a `section` and check combinations in `validateSettings`. Every type
  and attribute: [The settings form](https://kinotvapp.github.io/kino-plugins/en/settings-form/#types).
- **`debug: true`**: on-screen error panels and a "Registro" page (last 200 events); logcat tag
  `KinoPlugin/<id>` (and `KinoPlay` for playback metrics). Development only: **remove before
  publishing** (`validate.mjs` warns).
- **`telemetry: true | "verbose"`**: asks the person (consent line, and an update that adds it waits
  for approval) to share the failed call's scrubbed `kino.log` lines with Kino's error tracker; only
  plugins that declare it ever send lines (recommended or not), and for now there is no switch (a later
  Kino adds a per-device one). `"verbose"` adds playback metrics of a sample of good plays and
  edge cases (60 events per run). `kino.log.report("myplugin:area", "code", "count=2")` flags a
  degraded-but-working result (area: lowercase namespaced word with `_` or `:`, ≤ 24 chars; 1/hour per
  area, 3 per run). Log codes and counts, never values from a response, never what the person typed.
  [Logs and telemetry](https://kinotvapp.github.io/kino-plugins/en/diagnostics/).
- **`section`** (`"section": { "label": "…" }` ≤ 20 chars + export `section({ tab })` →
  `{ tabs?, tab, hero?, rows }`, 20 s): a section of its own (TV sidebar, max 3 plugins; phone chip strip,
  max 8). **`categories()`** (needs `browse`, 20 s): up to 24 tiles in Categorías, each opening
  `browse(ref, null)`. **`theme`**: up to five `#RRGGBB` colors (`accent`, `onAccent`, `background`,
  `surface`, `highlight`); dark backgrounds only, contrast 3:1 / 4.5:1, nothing close to Kino's red
  `#E50914`; a failing color falls back to Kino's (accent+onAccent as a pair); errors are always Kino's
  red. Preview with `node sdk/run.mjs . theme`.
- **`scopedSearch`** (capability, needs `search`): your `search` gets `query.within` (the browse `ref`
  of a "Ver más" page) and answers inside that category; `null` means "let Kino filter". Kino gives up
  on you after 6 s. Without it Kino filters the loaded titles itself.
- **`adult: true`** on items, Categorías tiles, live categories and channels: kept and shown only while
  the person's 18+ code is unlocked (Ajustes ▸ Adultos). Below apiVersion 6 they are dropped. With an
  18+ live category, mark **every** `liveSearch` hit with `adult` or its `categoryId` (unmarked hits
  count as 18+). Never try to detect or bypass the lock: always send the mark.
- **Live channels in Home rows**: `kind: "live"` items now stay in `home` rows (a country's channels,
  for example); below 6 they are dropped from Home.
- **`kino.crypto` key pairs**: `generateKeyPair` (`ec` P-256/P-384, `ed25519`, `x25519`), `sign`,
  `verify`, `importKey`, `deriveSharedSecret`; private keys are handles that live only in the sandbox
  that made them (not in `sign()`'s lane), at most 64. For a player that proves itself by signing a
  challenge. Map Node/WebCrypto calls with the table in
  [The kino API](https://kinotvapp.github.io/kino-plugins/en/kino-api/#key-pairs).
- **`Stream.label` and labelled lazy copies**: `label` (≤ 48 chars, e.g. `"Latino · Servidor 1"`) names
  a copy in the player's **Servidor** menu; an alternative may be `{ label, ref }` (ref ≤ 512 chars) that
  Kino passes to `resolve(ref)` only when needed: the person picks it (whole `resolve` limit; if it fails
  they keep watching the copy they had), the automatic fallback reaches it (≤ 20 s, then the next copy),
  or a download's copy choice probes it (inside its 30 s budget). From that answer only `url`,
  `headers`, `mime`, `subtitles`, `expiresInSeconds` and `skip` are used; its own `alternatives` are
  ignored. Use it for **every** source with several servers or languages: never resolve all of them up
  front. [Labelled and lazy copies](https://kinotvapp.github.io/kino-plugins/en/contract/#lazy-copies).
- **`"browser": true`** (`kino.browser.capture`) or **`"browser": "pages"`** (capture plus `kino.browser.page`): see "The hidden browser"
  below.
- **`meta`** (capability + export `meta(query)`, no consent line, 6 s): fill a title's info page when
  TMDB/AniList have nothing (e.g. `kitsu:` anime); return `null` for titles you do not know.
- **Any apiVersion**: `Stream.alternatives` (≤ 8 `{ url, mime?, headers? }`, other copies of the same
  video, best first; Kino switches when one cannot decode or is gone; ignored with `drm`, `signing` and
  for live). `Stream.skip` (`{ openingStartMs?, openingEndMs?, endingStartMs? }` for this exact file:
  "Saltar intro"/"Saltar outro"; wins over AniSkip, a hand correction wins over it). The `subtitles`
  export (10 s, background): tracks for any title Kino knows by IMDb/TMDB id, alongside your videos or
  as a pure subtitle provider (`"capabilities": ["subtitles"]` alone). The manifest's `categories`
  field (`movies`, `series`, `anime`, `live`, `radio`, `subtitles`, `utilities`, `adult`) only tags the
  plugin in the marketplace; it is not the `categories()` export. `settingsStatus()` is asked again after
  every `action` (no need for `refresh: true`).

**The hidden browser (`"browser": true` or `"pages"`, apiVersion 6, Kino 0.9.50+).** Rules, in order:

1. **Prefer `kino.fetch`.** Use the browser only for a server whose embed builds the video address by
   running its own scripts, after you checked the HTML, JSON and scripts with `curl`. It costs the
   person a red consent line ("Puede abrir páginas web ocultas para encontrar el video"), 5-25 s per page,
   and it never runs in the Node kit (`browser_unavailable` there): keep a `kino.fetch` path wherever one
   exists.
2. **`kino.browser.capture(url, { timeoutMs, headers, match, autoplay })` only inside `resolve`**, and
   only a `resolve` the person started (play or a download); anywhere else `not_allowed`. The start
   `url` must be on your `hosts`, https, public. It returns `{ media: [{ url, mime?, headers }],
   subtitles, finalUrl }`: return `media[0].url` with **its `headers`** (Referer, User-Agent, cookies…)
   as the Stream's `headers`. Add `"streamHosts": "any"` because the video lives on hosts you cannot list.
   An approved plugin's `resolve` gets 75 s: plan for two or three servers, not all of them.
3. **`kino.browser.page(url, { waitFor, timeoutMs })`**, only with `"browser": "pages"` (its own red line,
   "Puede abrir páginas web ocultas para mostrar contenido y encontrar el video"; `true` is capture-only and
   gets `not_allowed`; an update from `true` to `"pages"` asks the person again), returns `{ html, finalUrl, status, truncated }` for
   a site whose plain fetch only gets its automatic check page ("Just a moment…"): only from `search`,
   `home`, `browse`, `episodes`, `section` or `resolve` while the person is using the app (never
   background calls; **never from `categories`**, which is always Kino's own call), 20 reads a minute,
   Kino never touches the page. The top document must stay on your hosts: every redirect or navigation
   hop is checked, and the first one off your hosts ends the read with `blocked` (no HTML). Kino cuts
   `timeoutMs` to the call's remaining time minus 1.5 s; still pass ~12000 in `search`. Try `kino.fetch`
   first and cache with `kino.storage`.
4. **Never try to defeat a captcha or bot protection.** Kino never solves, clicks or ticks a CAPTCHA,
   Turnstile, hCaptcha, reCAPTCHA or "verify you are human": the call ends with `blocked`. Do not add
   solver services, fingerprint spoofing, stealth tricks, or retry loops; on `blocked`, `timeout` or
   `busy` move to the next server or return nothing. The author is responsible for their own plugin;
   Kino only lists community plugins (community search), it does not recommend or promote them (see
   "Community takedowns" for what happens to a plugin that breaks the rules).
5. **One page at a time in the whole app** (`busy`); a device without WebView gets
   `browser_unavailable`. Each page starts with no cookies and is wiped after; it never reaches the
   home network.
6. **Combine it with labelled lazy copies**: capture the first server in `resolve`, list the other
   servers/languages as `{ label, ref }`, and capture each only when its `ref` comes back. ([Maratón](https://github.com/xuper-plugin/maraton),
   a signed community plugin, works this way; "Tu servidor" stays the complete
   reference for everything else.) Full page:
   [Hidden browser](https://kinotvapp.github.io/kino-plugins/en/browser/).

What Kino 0.9.50 does for every plugin, with no field: plays a plugin title on the paired TV through
the TV's own copy of the plugin (keep `id` and refs identical across devices), checks followed series
for new chapters through `episodes(ref)` (keep series refs stable), saves "Para ti" picks by `ref`,
and treats a **signed** plugin installed from two repos with the same `id` and author key as one
plugin across devices.

**Community takedowns**: each author is responsible for their own plugin; Kino only lists community
plugins (no recommendation or promotion). A plugin that breaks the rules for plugins (a `userMessage`
asking for money, passwords or contact data, malware, a rights claim) is removed from the community
index through `community-blocklist.json` at the root of `kinotvapp/kino-plugins` (reasons `claim`,
`malware`, `broken`, `rules`, `author_request`); anyone can report one with the "Reclamo / retiro de
plugin" issue template. Installed copies stay installed, show "Retirado del índice de la comunidad."
and stop updating; a fork needs its own report. Do not build anything that infringes rights or harms
people. See
[Claims and plugin takedowns](https://kinotvapp.github.io/kino-plugins/en/claims/).

**Sending to the TV** needs nothing from the plugin; it casts best with a correct `mime` and no
`headers` (see [What people see](https://kinotvapp.github.io/kino-plugins/en/what-people-see/#cast)).

## 5. Checklist before publishing

- [ ] `node sdk/validate.mjs .` exits 0, and `node sdk/validate.mjs . --run <fn> …` passes for every
      declared capability.
- [ ] `node --test test/plugin.test.mjs` passes offline from recorded fixtures.
- [ ] Every host the code, the stream, its segments, subtitles and redirects touch is in `hosts`,
      with the bare domain next to its `*.` form.
- [ ] No missing global (`setTimeout`, `fetch`, `Buffer`, `process`, `require`, `crypto`, `Intl`…)
      in `plugin.js`; no `import`.
- [ ] No `throw` before the first `await` in any async function.
- [ ] Every declared capability is an exported async function (except `download`/`drm`); nothing
      exported that the manifest does not declare is ever called.
- [ ] `id`s are stable and match the pattern; `ref`s keep working when replayed later.
- [ ] User-facing text in Spanish (Bogotá, tuteo); no secrets in the repository.
- [ ] `version` raised; `apiVersion` is the lowest that works (6 only for an apiVersion 6 feature:
      it needs Kino 0.9.50+).
- [ ] No `"debug": true` in the manifest unless the person asked for it (every plugin has a
      "Modo debug" switch in Kino's Ajustes; `true` only turns it on by default for everyone). If `telemetry` is declared, the person agreed and
      the logs hold codes and counts only.
- [ ] Every `userMessage` passes the rules (Spanish, ≤ 160, no URL/digits/money/credentials/contact)
      and `run.mjs` shows it; 18+ content carries `adult: true`.
- [ ] `"entry"` and `"icon"` have **no leading `./`** (`"plugin.js"`).
- [ ] If `"browser": true`: every server that works with `kino.fetch` uses it; `kino.browser.capture`
      is only called from `resolve`; nothing tries to solve, click or bypass a captcha or bot check;
      `blocked`/`timeout`/`busy`/`browser_unavailable` move on to the next server or end cleanly; the
      captured `headers` are returned with the Stream; several servers are labelled lazy copies.
- [ ] If signed: `"apiVersion": 5`, `signature` present, `node sdk/validate.mjs . --repo owner/repo`
      verified it after the last edit, `*.pem` in `.gitignore`, no `.pem` tracked, the person knows to
      back the key up.
- [ ] Public repository, manifest at the root, topic `kino-plugin` on THAT repository (mandatory: without it the
      app never finds the plugin), not a fork. Manifest `description` written (the card shows it);
      the GitHub About description is optional and not read by the app.
- [ ] The person installed it in Kino and it searched, listed episodes and played.

## 6. Being discovered ("De la comunidad")

Kino lists community plugins itself; nobody approves them. The step-by-step for the person, with
exact clicks and how to check it, is [Get listed in Kino](https://kinotvapp.github.io/kino-plugins/en/listed/).
Every rule, as the app applies it (full detail:
[Publishing › Get found](https://kinotvapp.github.io/kino-plugins/en/publish/#get-found)):

1. Public GitHub repository at `https://github.com/<owner>/<repo>` (owner `^[A-Za-z0-9][A-Za-z0-9-]{0,38}$`,
   repo `^[A-Za-z0-9._-]{1,100}$`), **not a fork** (use the template's "Use this template").
2. Topic exactly `kino-plugin`, **mandatory**, on the repository that holds `kino-plugin.json`
   (`gh repo edit owner/repo --add-topic kino-plugin`). Verify:
   `curl -s https://api.github.com/repos/owner/repo | tr -d ' \n' | grep -o '"topics":\[[^]]*\]'` must list it. The card shows the
   manifest `description`; the GitHub About description is optional and does not affect discovery.
3. `kino-plugin.json` at the repository **root on the default branch**
   (`https://raw.githubusercontent.com/<owner>/<repo>/HEAD/kino-plugin.json`), at most 16 KB, valid
   by the installer's rules, `apiVersion` not above the person's Kino (6 from Kino 0.9.50, 5 on 0.9.45 to 0.9.49; a signed plugin needs Kino 0.9.45+), and not
   `"discoverable": false`.
4. An `id` of your own: never a recommended plugin's id from another repo (today `internet-archive`,
   `own-server`), never the template's `archive-org`; the same id installed from
   another repo hides it on that device.
5. Stars: the app makes one unauthenticated request,
   `https://api.github.com/search/repositories?q=topic:kino-plugin+fork:false&sort=stars&order=desc&per_page=50`,
   keeps the first 30 well-formed results, then drops the ones whose manifest fails (they still used a
   slot). Below the top 30 a plugin is not listed.
6. Timing: each device searches when its plugins screen opens and its copy is older than 12 hours,
   or on "Actualizar" (never twice within 60 s); 403/429 means waiting `Retry-After` /
   `X-RateLimit-Reset` / 15 min (1 min to 24 h). GitHub indexes new topics on its own schedule;
   raw files are cached about 5 minutes.
7. If GitHub cannot answer, a backup list published by the Kino team is used; it is rebuilt from the
   same search, so nothing needs requesting. A repository in `community-blocklist.json` (a claim was
   upheld) never shows, in either list.
8. Nothing installs by itself: the person always sees the consent sheet ("Plugin no verificado…").
9. Where to look in the app: Plugins (phone: menu ☰ → Plugins; TV: Ajustes → Plugins), tab
   "Recomendados" (only Internet Archive and Tu servidor), section "De la comunidad" ("Plugins de la
   comunidad — Kino no los revisa ni responde por su contenido.") with its "Actualizar" button; also the first-run "Elige
   tus fuentes". On the web: <https://github.com/topics/kino-plugin>.

To debug "it does not appear": open the search URL in a browser and find the repo in `items`; open
the raw manifest URL; run `node sdk/validate.mjs .`; check the id; tap "Actualizar" after 60 s.

## 7. Common mistakes

- Declaring `*.site.com` only, then failing on `site.com` (or the reverse after a redirect).
- A CDN, a subtitle host or a license server missing from `hosts`: playback stops with an error.
- Using `fetch`, `setTimeout` or `Buffer` because the Node kit ran fine.
- Writing `plugin.js` with an `import`/`require` of a second local file: Kino only loads `entry`,
  there is nothing for it to resolve on-device. Bundle to one file first (section 3, step 3).
- Validating arguments with `throw` before the first `await` in a helper wrapped in `try`/`catch`.
- Returning ids with `/`, `:` or spaces (dropped), or ids that change between calls (the library
  loses the title).
- Returning `next` or a row `ref` without declaring and exporting `browse` (they are dropped).
- Putting expiring links in `ref` instead of resolving them fresh in `resolve`.
- Network calls at the top level of the module (install fails).
- Forgetting to raise `version`, so the fix never reaches anyone.
- Writing `"entry": "./plugin.js"` (or `"icon": "./icon.png"`): refused by Kino 0.9.45 and older.
- Signing, then editing `plugin.js` or `version` without signing again; committing the `.pem`; making
  a new key for an already published plugin (everyone must reinstall).
- Declaring `apiVersion` 2 or 3 without needing it (older Kino builds cannot install it); declaring
  6 for nothing (Kino 0.9.49 and older refuse it).
- Publishing with `"debug": true` without being asked (it turns error panels on by default for everyone).
- Calling `kino.fetch`, `kino.storage` or a private-key handle from `sign()`, or putting a
  `kino.secret()` marker in `signContext`.
- A `userMessage` with a URL, a phone number, "WhatsApp", "paga"/"recarga" or the person's own input:
  dropped silently at best, the plugin removed at worst.
- A `status` or `action` setting without exporting `settingsStatus` / `action`; `"section"` without
  exporting `section` (install fails).
- `kino.html.select` "failing" under Node: it only exists in the app; test that part in Kino.
- Forking the template: forks never appear in "De la comunidad".
- Keeping the template's `"id": "archive-org"`: install refused ("Ya hay un plugin con ese id") and
  hidden from the community list wherever the Internet Archive plugin is installed.
- English or voseo in what the person reads.
- Copying a browser's `Accept-Encoding` or `Host` header and expecting it to be sent.
- Pasting a secret into `kino-plugin.json` or `plugin.js` instead of sealing it (author keys) or
  asking for it in a `password` setting (the person's credentials); committing `.kino-secrets.json`.
