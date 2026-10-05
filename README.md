# Toku Kino — 0.2.0

Catálogos de **Super Sentai** y **Kamen Rider** de ShadowRangers, para **Kino 0.9.50 o superior**. Las categorías consultadas publican **49 series de Super Sentai** y **38 de Kamen Rider**. Cada serie abre su propia ficha de capítulos.

## Categorías

Toku Kino dispone de dos accesos separados, con las imágenes que proporcionaste:

| Categoría | Contenido actual |
| --- | --- |
| Super Sentai | 49 series de ShadowRangers, ordenadas por año |
| Kamen Rider | 38 series de [ShadowRangers](https://shadowrangers.live/genero/kamen-rider/), ordenadas por año y fecha de estreno |

En Android TV puedes entrar por **Toku Kino** en el menú lateral y elegir **Super Sentai** o **Kamen Rider**. También aparecen dos portadas en **Categorías → Toku Kino**, cada una abre exclusivamente su catálogo. **Ver más** abre la categoría correspondiente.

Kamen Rider muestra todas las tarjetas publicadas en esa categoría: desde **Kamen Rider (1971)** hasta la ficha de **Kamen Rider MY-TH (2026)**. La fecha y el nombre se toman de la fuente. Se incluyen Black Sun y las series publicadas, sin agregar películas o series que no estén en la categoría. Entre estrenos del mismo año se respeta la fecha: por ejemplo, Decade aparece antes que W.

Gavv en el catálogo y la búsqueda ahora abre **ShadowRangers**, con VOE y ShadowLiv cuando están publicados. Las referencias antiguas guardadas de Gavv/UnlimitedSubs siguen funcionando con su resolvedor anterior de VK, todavía sin confirmación audiovisual.

Las portadas se incluyen en `assets/super-sentai.jpg` y `assets/kamen-rider.jpg`. Sube también la carpeta `assets` al repositorio. Kino carga las imágenes desde esa carpeta pública en la rama predeterminada; no agrega permisos de red al plugin.

## Qué cambia

- Filas **Super Sentai · por año** y **Kamen Rider · por año** en sus pestañas: una portada por serie, de la más antigua a la más nueva.
- Cada portada abre los capítulos de esa serie, ordenados por temporada y número.
- Búsqueda por nombre, año y títulos alternativos; reconoce variantes como Avataro/Avatarō.
- Las fichas se consultan al abrirlas. Cada pestaña carga solamente su lista de portadas; los capítulos se consultan al abrir una serie. El Inicio general conserva la fila de Super Sentai, y Kamen Rider se abre desde la sección propia o Categorías.
- Se mantiene el resolvedor VOE que el usuario confirmó funcionando con varios capítulos de Timeranger en 0.1.6.
- Se conservan el identificador `unlimitedsubs`, las referencias anteriores de Timeranger y Gavv, y la preferencia de servidor.

El catálogo se obtiene de la categoría publicada por la fuente y se renueva tras cinco minutos; no se inventan series ausentes. Los años son los de estreno indicados en sus tarjetas. Los capítulos disponibles son los publicados por cada ficha, no una promesa de que todas las series estén completas.

## Instalar o actualizar

1. Descomprime **Toku-Kino-0.2.0.zip**.
2. En [efraynns-stack/TokuKino](https://github.com/efraynns-stack/TokuKino), abre **Add file → Upload files**. Sube el contenido descomprimido: `kino-plugin.json` y `plugin.js` deben quedar en la raíz de la rama principal. No subas solamente el ZIP ni una carpeta contenedora adicional.
3. Guarda con **Commit changes**.
4. En la TV: **Ajustes → Plugins → Toku Kino → Buscar actualización de Toku Kino**. Comprueba que muestre **0.2.0**. Para instalar desde cero, agrega `efraynns-stack/TokuKino`.
5. Abre **Toku Kino → Kamen Rider**. Si necesitas forzar una carga nueva, ve a **Ajustes → Toku Kino → Actualizar catálogo Kamen Rider**. Elige una serie y un capítulo.

Esta actualización conserva los dominios y permisos de 0.1.6.

## Estado y actualización del catálogo

En **Ajustes → Toku Kino** verás:

- **Super Sentai:** `0% · sin carga registrada`, `100% · 49 series · última carga completa`, o el estado de error/interrupción de la última consulta.
- **Última carga Super Sentai (UTC):** fecha y hora de la última carga completa. El porcentaje sigue describiendo esa carga aunque pasen los cinco minutos de la caché.
- **Actualizar catálogo Super Sentai:** consulta nuevamente la categoría publicada, sin esperar a que venza la caché. Al terminar muestra la cantidad real de series. La consulta manual espera hasta 20 segundos por la respuesta de la web.
- **Kamen Rider:** su propio estado: `0% · sin carga registrada`, `100% · 38 series · última carga completa` o error/interrupción.
- **Última carga Kamen Rider (UTC):** fecha de la última carga completa de esta categoría.
- **Actualizar catálogo Kamen Rider:** consulta de nuevo esa categoría, hasta 20 segundos, sin modificar el estado de Super Sentai. Cada familia tiene su propia caché y estado.

Las consultas de portadas disponen de hasta 18 segundos en Inicio, Categorías y la sección propia. Al abrir una ficha, la consulta se limita al tiempo restante de la llamada de Kino; con la categoría ya cargada dispone de hasta 18 segundos. La búsqueda consulta ambas categorías en paralelo con hasta 12 segundos por respuesta.

El **100% se refiere al listado de series**. No indica que se descargaron todas las portadas, todos los capítulos o los videos. Los totales se cuentan en las respuestas reales; no están fijados en 49 ni 38.

Kino 0.9.50 consulta estas líneas al abrir el formulario o al finalizar una acción. No existe una barra de porcentaje en tiempo real para el plugin: no se muestran porcentajes intermedios inventados. Durante la acción Kino muestra su estado de espera. Si una consulta falla se conserva la última lista válida, su cantidad y su fecha de carga.

Tras actualizar, abre la sección **Toku Kino → Super Sentai / Kamen Rider** o la portada correspondiente en **Categorías → Toku Kino** para consultar el catálogo. El Inicio general de Kino puede conservar sus filas anteriores durante hasta seis horas; esta acción no invalida esa caché de la app.

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

- **75 pruebas locales** y validador oficial de Kino: ambos catálogos, orden de estrenos, capítulos propios, búsqueda global, estados independientes, caché, alternativas por servidor y regresiones de Timeranger y Gavv.
- HTML público mínimo real: 49 tarjetas de Super Sentai y 38 de Kamen Rider; Goranger (84 capítulos), Timeranger (50), Gozyuger (49), Kamen Rider (98), Gavv (50) y MY-TH (5 al consultar la fuente). Estos números describen las fichas observadas; pueden cambiar.
- Las pruebas offline de medios y sesiones usan datos sintéticos. No se incluyen enlaces firmados ni cookies de la fuente.
- La consulta real de 0.2.0 aceptó las 38 series, Categorías, la pestaña Kamen Rider, las fichas de Kamen Rider (98), Gavv (50) y MY-TH (5), la búsqueda de Gavv y el estado de carga sin elementos descartados. Ver `test/rider-live-results.json`.
- VOE del capítulo 1 de Gavv entregó HLS aceptado por el SDK tras ajustar las consultas del reproductor a hasta 18 segundos, respetando el tiempo restante de resolución. Ver `test/rider-play-live-results.json`. Esto verifica HTTP y el contrato, no imagen y sonido en Android TV.
- El primer intento y el informe del catálogo conservan los timeouts observados. La consulta de Super Sentai en la búsqueda superó los 12 segundos; Gavv siguió disponible desde Kamen Rider. Se registran ambos resultados, sin presentar una consulta fallida como éxito. Ver `test/rider-live-first-attempt.json` y `test/validation-results.json`.
- **El usuario confirmó VOE en Timeranger con varios capítulos en Android TV, versión 0.1.6.** La versión 0.2.0 debe probarse en la TV. No se ha reproducido cada capítulo de cada serie. ShadowLiv sigue sin confirmación audiovisual.
- Los otros informes `*-live-*.json` conservan su versión y fecha originales como evidencia histórica.

La caché guarda metadatos durante cinco minutos, con un máximo de cuatro fichas y un límite de tamaño. Cada ficha tiene su propia fecha de vencimiento. Los enlaces de reproducción se consultan de nuevo al abrir el capítulo.

## Diagnóstico

En **Ajustes → Toku Kino**, activa **Modo debug**, reproduce el capítulo y abre **Registro**. Conserva la serie, capítulo, servidor y las líneas anteriores al fallo. Apagar debug borra su registro.

| Evento | Significado |
| --- | --- |
| `SHADOW_CATALOG_LIST` | Familia y cantidad de series reconocidas |
| `SHADOW_SEARCH partial` | Una categoría falló; se buscaron resultados en la otra |
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
node test/check-sentai-source.mjs --categories
node test/check-sentai-source.mjs --status
node test/check-sentai-source.mjs --rider
node test/check-sentai-source.mjs --rider-play
```

El plugin instalado es un único módulo JavaScript y utiliza solamente las APIs de Kino. Los scripts de pruebas usan Node y el SDK oficial. No se incorpora descarga, P2P, credenciales ni resolución de verificaciones humanas.

## Cambios

### 0.2.0

Kamen Rider incorpora las 38 series publicadas en ShadowRangers, con capítulos por serie y fuentes VOE/ShadowLiv. Catálogos ordenados por año y fecha de estreno. Búsqueda en ambas familias; si una falla temporalmente, la otra sigue disponible. Kamen Rider tiene porcentaje de completitud, cantidad, fecha y actualización manual independientes. Se conservan los iconos y referencias anteriores.

### 0.1.9

Estado de carga del catálogo de Super Sentai, porcentaje de completitud del listado, cantidad real de series, fecha de la última carga completa y botón para actualizar sin esperar a la caché. Errores conservan el último catálogo válido. Los estados se registran también en las cargas automáticas. No cambia la reproducción.

### 0.1.8

Dos categorías con las portadas adjuntas, sección propia de Toku Kino con dos pestañas y navegación independiente por categoría. Super Sentai conserva sus 49 series; Kamen Rider contiene la prueba existente de Gavv. La reproducción no cambia.

### 0.1.7

Catálogo completo de Super Sentai por año y fichas individuales; búsqueda y resolución por serie, sin cambiar el resolvedor VOE probado. Caché de fichas limitada y referencias antiguas conservadas.

### 0.1.6

Prueba de Timeranger de ShadowRangers con VOE, alternativa ShadowLiv y preferencia de servidor. VOE confirmado por el usuario en varios capítulos.

### 0.1.0–0.1.5

Prueba de Gavv de UnlimitedSubs; nombre Toku Kino desde 0.1.1 e investigación de VK. Esa investigación queda separada de la fuente actual.
