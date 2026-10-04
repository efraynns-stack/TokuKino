# UnlimitedSubs para Kino — prueba 0.1.0

Plugin de prueba con **Kamen Rider Gavv** de [UnlimitedSubs](https://www.subsunlimiteds.com/series/kamen-rider-gavv).
Consulta los datos de la propia web para mostrar portada, sinopsis y capítulos. La consulta verificada el 4 de octubre de 2026 devolvió 50 capítulos con enlaces de VK/VK Video.

**Requiere Kino 0.9.50 o superior.** El plugin declara API 6 porque puede usar el navegador integrado para encontrar el video. Kino 0.9.49 rechaza su instalación.

## Instalar la prueba

1. Actualiza Kino desde la [publicación oficial 0.9.50](https://github.com/kinotvapp/kino-light/releases/tag/v0.9.50). El archivo `kino.apk` es la versión universal para Android y Android TV.
2. Descomprime este ZIP en el computador.
3. En GitHub, crea un repositorio **Public** en tu cuenta, llamado `KinoUnlimitedSubs`. Usa un repositorio nuevo para esta prueba.
4. Dentro del repositorio, pulsa **Add file → Upload files**. Sube los archivos descomprimidos y sus carpetas. `kino-plugin.json` y `plugin.js` deben quedar directamente en la raíz de la rama principal; no subas el ZIP como único archivo ni los dejes dentro de otra carpeta.
5. Guarda con **Commit changes**.
6. En la TV: **Ajustes → Plugins → Agregar**, escribe `efraynns-stack/KinoUnlimitedSubs` y continúa con **Agregar → Instalar**. Si elegiste otro nombre para el repositorio, usa ese nombre.
7. La instalación mostrará los permisos para abrir páginas ocultas y reproducir video desde los servidores que entregue VK. Son necesarios para el método de captura y los servidores variables de video.
8. Busca **Gavv** o abre la fila **UnlimitedSubs** del inicio.

No hace falta configurar una cuenta ni escribir URLs para esta prueba.

## Qué comprobar en la TV

- Aparece la portada de Kamen Rider Gavv y su sinopsis.
- Al abrir la serie, aparecen los capítulos 1 a 50 dentro de la primera temporada. El `s39` de los identificadores de la web pertenece a la numeración de la franquicia y no se muestra como temporada 39.
- El capítulo 1 inicia con imagen, audio y el subtitulado esperado.
- Pausar, continuar y adelantar funcionan desde el reproductor de Kino.
- Volver al catálogo y abrir otro capítulo funciona. El capítulo 26 permite comprobar también el servidor VK Video.

Los subtítulos pueden estar incrustados en la imagen. En ese caso no habrá una pista de subtítulos para activar o desactivar. Las pistas externas se entregan cuando el reproductor las ofrece.

## Cómo resuelve el video

Al iniciar un capítulo, consulta nuevamente los datos públicos de UnlimitedSubs. Construye el mismo reproductor incrustado de VK con el identificador y el hash publicados por la fuente.

Primero lee el JSON `playerParams` del reproductor. Si hay HLS o MP4, entrega ese enlace a Kino con su Referer y las copias disponibles. Si el documento no trae un video, intenta **una captura** del mismo reproductor con el navegador integrado de Kino. Conserva las cabeceras que devuelve la captura.

Los enlaces temporales de video y las sesiones de la captura no se guardan. Solo se conserva por cinco minutos la información de la serie y sus capítulos. Una página que exige sesión, muestra una verificación humana o indica que el video fue retirado termina con un error controlado.

## Validación y límites de esta entrega

- El manifiesto y sus cuatro exportaciones pasan el validador oficial de Kino.
- Inicio, búsqueda y capítulos se comprobaron con respuestas reales de la API, sin elementos descartados por el SDK.
- Las pruebas sin conexión comprueban los datos grabados, el parser de VK, las referencias estables, las cabeceras de captura y los errores.
- Las muestras de un reproductor VK que contiene HLS/MP4 y las respuestas de captura en las pruebas son **sintéticas**, no grabaciones de una reproducción real.
- Desde el entorno de desarrollo, VK responde `Site Unavailable`; además, el SDK de Node no implementa el navegador Android y responde `browser_unavailable`. **La captura real, la reproducción y los controles en Android TV quedan pendientes de esta prueba.**

Los resultados de la consulta real están en `test/source-results.json`. Los datos públicos grabados están en `test/source-fixtures.json`.

## Si falla la reproducción

Anota el mensaje completo que muestra Kino y el capítulo probado. En **Ajustes → Plugins → UnlimitedSubs**, activa **Modo debug**, vuelve a probar y revisa **Registro**.

Los eventos propios del plugin son `ULS_CATALOG`, `ULS_API_FETCH`, `ULS_VK_FETCH`, `ULS_RESOLVE` y `ULS_CAPTURE`. Solo registran etapas, cantidades y códigos de error. No incluyen cookies, hashes de video ni direcciones temporales.

## Comandos para desarrollo

Node 18 o posterior; no necesita instalar paquetes.

```bash
node sdk/validate.mjs .
node sdk/run.mjs . home
node sdk/run.mjs . search Gavv
node sdk/run.mjs . episodes series:kamen-rider-gavv
node sdk/run.mjs . resolve episode:kamen-rider-gavv-s39e01
node --test test/plugin.test.mjs
```

`test/check-source.mjs` vuelve a consultar la fuente con el SDK y transporte HTTPS de curl, porque el `fetch` de Node no alcanza esos servidores desde el entorno de esta entrega. Requiere curl. El código que ejecuta Kino usa únicamente `kino.fetch` y `kino.browser.capture`.

El SDK y el contrato incluidos proceden de `kinotvapp/kino-plugin-own-server`, referencia `94d80528ae78509a4d3905464857218b1c2de7e6`. El formato público del reproductor se contrastó con la implementación VK de yt-dlp. El plugin usa código propio, sin ejecutar scripts extraídos del sitio.

## Cambios

### 0.1.0

- Inicio y búsqueda con una serie de prueba.
- Portada, sinopsis, miniaturas y capítulos obtenidos de la fuente.
- Referencias estables para la serie y cada capítulo.
- Resolución directa de VK y captura opcional del reproductor en Kino 0.9.50.
- Errores controlados y registro de diagnóstico.

Después de comprobar la reproducción en la TV se puede ampliar al resto del catálogo, conservando los identificadores ya publicados.
