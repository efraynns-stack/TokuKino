# Toku Kino — prueba 0.1.6

Prueba de **Mirai Sentai Timeranger** de [ShadowRangers](https://shadowrangers.live/series/mirai-sentai-timeranger/), para **Kino 0.9.50 o superior**. Incluye portada y 50 capítulos. El primer y segundo capítulo publican **Server 2 · VOE** y **Server 3 · ShadowLiv**.

## Instalar o actualizar

1. Descomprime el ZIP.
2. En [efraynns-stack/TokuKino](https://github.com/efraynns-stack/TokuKino), abre **Add file → Upload files** y sube los archivos y carpetas descomprimidos. `kino-plugin.json` y `plugin.js` deben quedar en la raíz de la rama principal; no subas solo el ZIP.
3. Guarda con **Commit changes**.
4. En la TV: **Ajustes → Plugins → Toku Kino → Buscar actualización de Toku Kino**. Comprueba que muestre **0.1.6**. Para instalar desde cero, agrega `efraynns-stack/TokuKino`.
5. Acepta los nuevos dominios de la fuente cuando Kino presente el consentimiento de la actualización: ShadowRangers, VOE, el dominio publicado de su reproductor y ShadowLiv. Se mantienen los permisos de navegador y de reproducción desde servidores públicos.
6. Busca **Timeranger**, o abre la fila **Toku Kino · ShadowRangers** del inicio. Prueba primero el capítulo 1.

La portada del inicio se centra ahora en Timeranger. La búsqueda de Gavv y sus referencias anteriores siguen disponibles; su resolución no cambia.

## Elegir fuente

Por defecto se utiliza **Server 2 · VOE**. Cuando un video está abierto, el menú **Servidor** de Kino ofrece **Server 3 · ShadowLiv** como alternativa. Cada fuente se resuelve al seleccionarla; no se abren las dos por anticipado.

También puedes cambiar la preferencia antes de reproducir en **Ajustes → Toku Kino → Fuente preferida para Timeranger**. Es útil para probar ShadowLiv aunque la primera fuente no inicie. Guarda el ajuste y vuelve a abrir el capítulo.

Si una fuente falla durante la primera resolución, se intenta una vez la otra. Una selección explícita de servidor resuelve solamente ese servidor. Las limitaciones de peticiones y de región terminan la llamada. No se reintenta una página que solicita una verificación humana.

## Qué comprobar en Android TV

- Timeranger muestra portada y capítulos 1 a 50.
- El capítulo 1 comienza con imagen y audio; verifica el subtitulado que ofrece la fuente.
- Pausa, continuación y avance funcionan.
- Puedes volver al catálogo, abrir el capítulo 2 y regresar al primero.
- El cambio de **Servidor** funciona, o muestra un diagnóstico específico si ShadowLiv no entrega medios.

No se declara descarga ni se incorpora una cuenta. La prueba no reproduce páginas HTML como si fueran archivos de video.

## Resolución

La ficha se consulta con `kino.fetch` y sus metadatos se conservan cinco minutos. Cada reproducción consulta nuevamente la página del capítulo y asocia el identificador `source-player` con su opción de servidor; no usa los iframes publicitarios ni reutiliza el enlace de otro capítulo.

**VOE:** se lee el iframe publicado y, si aparece, su redirección normal por JavaScript al dominio observado `teresapoliticallearn.com`, conservando la ruta del video. Se interpreta el JSON codificado con el mismo formato que utiliza el cargador público inspeccionado: rotación de letras, eliminación de separadores, Base64 y reversión de caracteres. No se ejecutan scripts extraídos de la web. El campo `source` entrega HLS al reproductor, con el Referer del iframe. No se utiliza la URL de descarga directa ni se interpreta una URL de publicidad como video.

Si el formato de los datos cambia sin una restricción explícita, VOE puede usar una captura de hasta 20 segundos. Un nuevo dominio de redirección requiere revisar el plugin; no se consulta un dominio desconocido automáticamente.

**ShadowLiv:** el reproductor arma sus medios mediante scripts. Esta prueba usa una captura de hasta 25 segundos del iframe publicado y conserva las cabeceras que entrega Kino. Su API pública observada devuelve datos codificados o rechaza peticiones incompletas; esta versión no implementa esa API, sus verificaciones ni sus sesiones.

Se entregan únicamente URLs públicas HTTPS de medios. La alternativa lleva una referencia breve al capítulo y al servidor. Los enlaces HLS temporales se resuelven de nuevo al reproducir; no se guardan en el catálogo ni en el registro. No se implementa P2P, resolución de CAPTCHA ni evasión de verificaciones.

## Verificación y límites

- El validador oficial acepta el manifiesto y las exportaciones. El código de Kino sigue siendo un único módulo, sin dependencias de Node.
- Las pruebas locales verifican los datos reales mínimos de la ficha y de los capítulos 1 y 2, selección de servidor, referencias, codificación del reproductor, captura, cabeceras, restricciones y renovación de enlaces.
- Las direcciones de medios y cookies de las pruebas offline son **sintéticas**. Los HTML mínimos del catálogo y de opciones de capítulo provienen de las páginas consultadas.
- Se obtuvo un HLS real del reproductor VOE del capítulo 1; su lista maestra respondió HTTP 200 y contiene el encabezado de HLS. El resultado de la comprobación con el SDK está en `test/shadow-live-results.json`.
- El resolvedor también se ejecutó con el SDK sobre las respuestas reales guardadas: reconoció VOE, devolvió HLS y conservó ShadowLiv como alternativa, sin elementos descartados. Ese resultado es una reproducción de respuestas HTTP, no una consulta nueva ni una reproducción audiovisual; está en `test/shadow-real-player-results.json`.
- **El acceso al manifiesto no prueba que se decodifique el video. Imagen, sonido, avance y cambio de servidor deben comprobarse en la TV.** Node no ejecuta el navegador de Android; la captura real de ShadowLiv sigue pendiente.
- Las consultas con el SDK desde este entorno han tenido timeouts intermitentes. El informe separa esos fallos del HLS comprobado mediante HTTP; no presenta una resolución incompleta como reproducción confirmada.
- Solo se inspeccionaron los reproductores de los primeros dos capítulos. Los demás se consultan al abrirlos y podrían tener enlaces retirados, otra disponibilidad o proveedores todavía no admitidos.
- Las capturas independientes no conservan la página de una llamada anterior. Este plugin no amplía el límite de 25 segundos del navegador de Kino.

## Diagnóstico

En **Ajustes → Toku Kino**, activa **Modo debug**, reproduce el capítulo y abre **Registro**. Anota el capítulo y el servidor. Conserva el mensaje completo o una foto de las líneas anteriores al fallo. Apagar debug borra su registro.

Eventos principales:

| Evento | Significado |
| --- | --- |
| `SHADOW_CATALOG` | Se reconoció el catálogo y se muestra el número de capítulos |
| `SHADOW_FETCH` | Estado de la consulta a la web o al reproductor |
| `SHADOW_RESOLVE started` | Versión, capítulo y cantidad de fuentes reconocidas |
| `SHADOW_RESOLVE route=voe_hls` | El reproductor publicó HLS sin necesitar captura |
| `SHADOW_CAPTURE` | Inicio o código de error de la captura por proveedor |
| `SHADOW_SOURCE failed` | Una fuente falló antes de intentar la otra |
| `SHADOW_RESOLVE success` | El plugin devolvió un medio; todavía puede fallar el reproductor de la TV |

No se registran cookies, consultas firmadas ni datos arbitrarios del servidor.

## Desarrollo

```bash
node sdk/validate.mjs .
node --test test/plugin.test.mjs test/shadow.test.mjs
node test/check-shadow-source.mjs
```

`check-shadow-source.mjs` consulta la fuente mediante el control de hosts del SDK y transporte HTTPS de curl. Guarda estados y cantidades; no guarda medios ni datos codificados con enlaces temporales. El plugin instalado utiliza solamente las APIs de Kino.

## Cambios

### 0.1.6

- Prueba de Timeranger en el inicio y búsqueda, con 50 capítulos de ShadowRangers.
- VOE con lectura de HLS desde los datos del reproductor; ShadowLiv con captura individual.
- Alternativas nombradas en **Servidor** y ajuste de fuente preferida.
- Referencias anteriores de Gavv e identificador `unlimitedsubs` conservados.
- Diagnóstico por proveedor y validación de dominios y referencias.

### 0.1.0–0.1.5

Prueba de Gavv de UnlimitedSubs; nombre Toku Kino desde 0.1.1; diagnóstico de VK y captura de la página original desde 0.1.5. La TV confirmó timeout en 0.1.5. Esa investigación queda aparte de la prueba actual.
