# Toku Kino — 0.1.7

Catálogo de **Super Sentai** de [ShadowRangers](https://shadowrangers.live/genero/super-sentai/), para **Kino 0.9.50 o superior**. La categoría consultada publica **49 series**, desde **Himitsu Sentai Goranger (1975)** hasta **No. 1 Sentai Gozyuger (2025)**.

## Qué cambia

- Fila **Super Sentai · por año**: una portada por serie, de la más antigua a la más nueva.
- Cada portada abre los capítulos de esa serie, ordenados por temporada y número.
- Búsqueda por nombre, año y títulos alternativos; reconoce variantes como Avataro/Avatarō.
- Las fichas se consultan al abrirlas. El inicio carga solamente el catálogo de portadas.
- Se mantiene el resolvedor VOE que el usuario confirmó funcionando con varios capítulos de Timeranger en 0.1.6.
- Se conservan el identificador `unlimitedsubs`, las referencias anteriores de Timeranger y Gavv, y la preferencia de servidor.

El catálogo se obtiene de la categoría publicada por la fuente y se renueva tras cinco minutos; no se inventan series ausentes. Los años son los de estreno indicados en sus tarjetas. Los capítulos disponibles son los publicados por cada ficha, no una promesa de que todas las series estén completas.

## Instalar o actualizar

1. Descomprime **Toku-Kino-0.1.7.zip**.
2. En [efraynns-stack/TokuKino](https://github.com/efraynns-stack/TokuKino), abre **Add file → Upload files**. Sube el contenido descomprimido: `kino-plugin.json` y `plugin.js` deben quedar en la raíz de la rama principal. No subas solamente el ZIP ni una carpeta contenedora adicional.
3. Guarda con **Commit changes**.
4. En la TV: **Ajustes → Plugins → Toku Kino → Buscar actualización de Toku Kino**. Comprueba que muestre **0.1.7**. Para instalar desde cero, agrega `efraynns-stack/TokuKino`.
5. Abre **Super Sentai · por año** o busca una serie. Elige su portada y un capítulo.

Esta actualización conserva los dominios y permisos de 0.1.6.

## Elegir fuente

Se prefiere **VOE**. El menú **Servidor** ofrece **ShadowLiv** cuando ese capítulo lo publica. Cada servidor se resuelve al seleccionarlo; sus identificadores se leen de la página del capítulo. La numeración interna puede cambiar entre series.

Puedes cambiar la preferencia en **Ajustes → Toku Kino → Fuente preferida**. Una selección explícita resuelve solamente ese servidor. En la selección inicial se intenta como máximo una segunda fuente independiente si la primera falla. Las restricciones regionales y límites de peticiones terminan la llamada.

Se admiten los reproductores VOE y ShadowLiv observados. Otros servidores publicados por la web, como Goodstream o VK en fichas de ShadowRangers, no se agregan automáticamente. La prueba anterior de Gavv/VK se conserva por separado.

## Resolución

La ficha se consulta con `kino.fetch` y sus metadatos se conservan cinco minutos. Cada reproducción consulta nuevamente la página del capítulo y asocia el identificador `source-player` con su opción de servidor; no usa los iframes publicitarios ni reutiliza el enlace de otro capítulo.

**VOE:** se lee el iframe publicado y, si aparece, su redirección normal por JavaScript al dominio observado `teresapoliticallearn.com`, conservando la ruta del video. Se interpreta el JSON codificado con el mismo formato que utiliza el cargador público inspeccionado: rotación de letras, eliminación de separadores, Base64 y reversión de caracteres. No se ejecutan scripts extraídos de la web. El campo `source` entrega HLS al reproductor, con el Referer del iframe. No se utiliza la URL de descarga directa ni se interpreta una URL de publicidad como video.

Si el formato de los datos cambia sin una restricción explícita, VOE puede usar una captura de hasta 20 segundos. Un nuevo dominio de redirección requiere revisar el plugin; no se consulta un dominio desconocido automáticamente.

**ShadowLiv:** el reproductor arma sus medios mediante scripts. Esta prueba usa una captura de hasta 25 segundos del iframe publicado y conserva las cabeceras que entrega Kino. Su API pública observada devuelve datos codificados o rechaza peticiones incompletas; esta versión no implementa esa API, sus verificaciones ni sus sesiones.

Se entregan únicamente URLs públicas HTTPS de medios. La alternativa lleva una referencia breve al capítulo y al servidor. Los enlaces HLS temporales se resuelven de nuevo al reproducir; no se guardan en el catálogo ni en el registro. No se implementa P2P, resolución de CAPTCHA ni evasión de verificaciones.

## Verificación

- **52 pruebas locales** y validador oficial de Kino: catálogo completo, orden anual, aislamiento de recomendaciones laterales, búsqueda, capítulos propios, referencias, caché, selección de fuentes y regresiones de VOE y Gavv.
- HTML público mínimo real: 49 tarjetas, Goranger con 84 capítulos, Timeranger con 50 y Gozyuger con 49; fuentes de los primeros capítulos de Goranger y Timeranger.
- Los datos de medios y sesiones en las pruebas offline son sintéticos. No se guardan enlaces firmados ni cookies de la fuente.
- Las consultas nuevas con el SDK aceptaron las 49 series del inicio, la búsqueda de Gozyuger, las fichas de Goranger y Gozyuger y el HLS de VOE del capítulo 1 de Goranger, sin elementos descartados. Resultados: `test/sentai-live-results.json` y `test/validation-results.json`. Esto verifica la resolución HTTP, no imagen y sonido en Android TV.
- **El usuario confirmó VOE en Timeranger con varios capítulos en Android TV, versión 0.1.6.** El catálogo ampliado de 0.1.7 todavía requiere instalarse y probarse en la TV; no se ha reproducido cada capítulo de cada serie. ShadowLiv continúa sin confirmación audiovisual.
- Los informes anteriores `shadow-*.json` documentan la investigación de 0.1.6; no sustituyen las pruebas del catálogo ampliado.

La caché guarda metadatos durante cinco minutos, con un máximo de cuatro fichas y un límite de tamaño. Cada ficha tiene su propia fecha de vencimiento. Los enlaces de reproducción se consultan de nuevo al abrir el capítulo.

## Diagnóstico

En **Ajustes → Toku Kino**, activa **Modo debug**, reproduce el capítulo y abre **Registro**. Conserva la serie, capítulo, servidor y las líneas anteriores al fallo. Apagar debug borra su registro.

| Evento | Significado |
| --- | --- |
| `SENTAI_CATALOG` | Cantidad de series reconocidas |
| `SHADOW_CATALOG` | Serie consultada y cantidad de capítulos |
| `SHADOW_FETCH` | Estado de la consulta a la fuente |
| `SHADOW_RESOLVE started` | Versión, capítulo y fuentes reconocidas |
| `SHADOW_RESOLVE route=voe_hls` | VOE publicó HLS sin captura |
| `SHADOW_CAPTURE` | Inicio o error de captura por proveedor |
| `SHADOW_SOURCE failed` | Fallo de una fuente |
| `SHADOW_RESOLVE success` | Medio entregado al reproductor |

## Desarrollo

```bash
npm run validate
npm test
node test/check-sentai-source.mjs
```

El plugin instalado es un único módulo JavaScript y utiliza solamente las APIs de Kino. Los scripts de pruebas usan Node y el SDK oficial. No se incorpora descarga, P2P, credenciales ni resolución de verificaciones humanas.

## Cambios

### 0.1.7

Catálogo completo de Super Sentai por año y fichas individuales; búsqueda y resolución por serie, sin cambiar el resolvedor VOE probado. Caché de fichas limitada y referencias antiguas conservadas.

### 0.1.6

Prueba de Timeranger de ShadowRangers con VOE, alternativa ShadowLiv y preferencia de servidor. VOE confirmado por el usuario en varios capítulos.

### 0.1.0–0.1.5

Prueba de Gavv de UnlimitedSubs; nombre Toku Kino desde 0.1.1 e investigación de VK. Esa investigación queda separada de la fuente actual.
