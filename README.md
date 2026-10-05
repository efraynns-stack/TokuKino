# Toku Kino — prueba 0.1.4

Plugin de tokusatsu para Kino. Su primera fuente de prueba es **Kamen Rider Gavv** de [UnlimitedSubs](https://www.subsunlimiteds.com/series/kamen-rider-gavv).
Consulta los datos de la propia web para mostrar portada, sinopsis y capítulos. La consulta verificada el 4 de octubre de 2026 devolvió 50 capítulos con enlaces de VK/VK Video.

El nombre es **Toku Kino** para poder incorporar otras fuentes después de comprobar la reproducción. Esta entrega incluye solamente la serie de prueba. Conserva el identificador `unlimitedsubs` y todas las referencias publicadas, de modo que el cambio de nombre no rompe los títulos ni los capítulos guardados.

**Requiere Kino 0.9.50 o superior.** El plugin declara API 6 porque puede usar el navegador integrado para encontrar el video. Kino 0.9.49 rechaza su instalación.

## Instalar la prueba

1. Actualiza Kino desde la [publicación oficial 0.9.50](https://github.com/kinotvapp/kino-light/releases/tag/v0.9.50). El archivo `kino.apk` es la versión universal para Android y Android TV.
2. Descomprime este ZIP en el computador.
3. Abre el repositorio existente [efraynns-stack/TokuKino](https://github.com/efraynns-stack/TokuKino). Conserva ese repositorio para actualizar el plugin instalado.
4. Dentro del repositorio, pulsa **Add file → Upload files**. Sube los archivos descomprimidos y sus carpetas. `kino-plugin.json` y `plugin.js` deben quedar directamente en la raíz de la rama principal; no subas el ZIP como único archivo ni los dejes dentro de otra carpeta.
5. Guarda con **Commit changes**.
6. Si el plugin ya está instalado, en **Ajustes → Plugins → Toku Kino → Buscar actualización de Toku Kino** aplica la versión **0.1.4**. Para una instalación nueva, usa **Ajustes → Plugins → Agregar**, escribe `efraynns-stack/TokuKino` y continúa con **Agregar → Instalar**.
7. En una instalación nueva, la pantalla de consentimiento de Kino incluye **«Puede abrir páginas web ocultas para encontrar el video»**. Se aprueba al instalar; no hay un permiso de navegador separado de Android. También muestra el permiso para reproducir video de cualquier servidor. La versión 0.1.4 conserva estos permisos de la 0.1.0, por lo que esa actualización no los vuelve a pedir.
8. Busca **Gavv** o abre la fila **Toku Kino** del inicio.

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

Primero lee el JSON `playerParams` del reproductor. Si hay HLS o MP4, entrega ese enlace a Kino con su Referer y las copias disponibles. Si no aparecen formatos, consulta una vez la respuesta pública del reproductor web de VK (`al_video.php`, `act=show`), un método usado por la implementación VK de yt-dlp. Si la respuesta ofrece formatos públicos, entrega el video sin abrir el navegador. Los códigos explícitos de sesión y error, y los mensajes de restricción, terminan con un error. Un código diferente de cero por sí solo ya no se interpreta como rechazo: si no contiene formatos ni una restricción explícita, se continúa con la página original.

Si ninguna consulta ofrece un video, intenta **una captura de la página original del capítulo en UnlimitedSubs**, con su iframe de VK, inicio automático y hasta 25 segundos de espera. Así el iframe se abre dentro de su página original, en lugar de cargarlo como documento principal. Conserva las cabeceras que devuelve la captura. No hace otra captura ni reintenta una página bloqueada.

Un [reporte de agosto de 2026 en yt-dlp](https://github.com/yt-dlp/yt-dlp/issues/17537) describe un reproductor incrustado que falla mientras la página correspondiente del video funciona. No demuestra la causa del timeout de esta TV, pero respalda comprobar el método público del reproductor en lugar de depender solamente del iframe directo.

La captura reconoce los formatos habituales y las direcciones firmadas sin extensión del CDN `vkvd<numero>.mycdn.me`. El [caso original documentado en yt-dlp](https://github.com/yt-dlp/yt-dlp/issues/5675) incluye un video sin `.mp4` en la URL. Esa es una hipótesis para el timeout observado, no una confirmación de que estos capítulos usen ese formato. El filtro no incluye todos los archivos de ese dominio: exige una URL de video con identificador y vencimiento.

Los enlaces temporales de video y las sesiones de la captura no se guardan. Solo se conserva por cinco minutos la información de la serie y sus capítulos. Una página que exige sesión, muestra una verificación humana o indica que el video fue retirado termina con un error controlado.

## Validación y límites de esta entrega

- El manifiesto y sus cuatro exportaciones pasan el validador oficial de Kino.
- Inicio, búsqueda y capítulos se comprobaron con respuestas reales de la API, sin elementos descartados por el SDK.
- Las pruebas sin conexión comprueban los datos grabados, el parser de VK, las referencias estables, las cabeceras de captura y los errores.
- Las muestras de un reproductor VK que contiene HLS/MP4 y las respuestas de captura en las pruebas son **sintéticas**, no grabaciones de una reproducción real.
- Desde el entorno de desarrollo, VK responde `Site Unavailable`; además, el SDK de Node no implementa el navegador Android y responde `browser_unavailable`. **La captura real, la reproducción y los controles en Android TV quedan pendientes de esta prueba.**
- Las pruebas 0.1.1 y 0.1.2 en la TV terminaron con `timeout`. El registro enviado a las 21:29 del 4 de octubre muestra que la 0.1.3 obtuvo HTTP 200 del reproductor público y se detuvo en `ULS_VK_PUBLIC refused`, sin llegar a la captura. Ese evento no guardó el código de respuesta; por tanto no permite conocer el motivo del rechazo. La 0.1.4 corrige la interpretación de códigos y añade ese diagnóstico. Su reproducción en TV sigue pendiente.
- Las pruebas del JSON del reproductor público son sintéticas. La última consulta con el SDK agotó su límite de ocho segundos; una consulta separada con curl respondió HTTP 405. Ninguna entregó el JSON del video. El SDK pasó entonces a la captura de la página original, que requiere Android. No se afirma que el nuevo método entregue un video real para estos capítulos.

Los resultados de la consulta real están en `test/source-results.json`. Los datos públicos grabados están en `test/source-fixtures.json`. La observación de la prueba en TV está en `test/android-tv-observation.json`.

## Si falla la reproducción

Comprueba la versión de Kino y la del plugin. Anota el mensaje completo que muestra Kino y el capítulo probado. En **Ajustes → Toku Kino**, activa **Modo debug**, vuelve a probar y revisa **Registro**. Todos los plugins habilitados tienen su propia pestaña en Ajustes desde Kino 0.9.50.

Los eventos propios del plugin son `ULS_CATALOG`, `ULS_API_FETCH`, `ULS_VK_FETCH`, `ULS_VK_PUBLIC_FETCH`, `ULS_VK_PUBLIC`, `ULS_RESOLVE` y `ULS_CAPTURE`. Solo registran etapas, cantidades, versión, número de capítulo, host de VK y códigos de respuesta o error. No incluyen el texto arbitrario del servidor, cookies, hashes de video ni direcciones temporales.

La línea `ULS_VK_PUBLIC reply code=… reason=…` identifica la respuesta del sitio. Los motivos reconocidos incluyen `auth_required`, `followers`, `blocked`, `not_found`, `geo_blocked`, `access_denied` y `unavailable`. `refused code=8 reason=unclassified` indica un error de VK cuyo mensaje no reconoce esta prueba; no se reintenta. `no_formats` indica que no se obtuvo video de esa consulta y se pasará a una captura normal de la página original.

| Último evento de captura | Qué significa |
| --- | --- |
| `ULS_CAPTURE not_allowed` | El navegador no está aprobado o la llamada se inició fuera del contexto de reproducción permitido. |
| `ULS_CAPTURE browser_unavailable` | No está disponible el WebView que necesita el navegador integrado en ese dispositivo. |
| `ULS_CAPTURE timeout` | La captura no encontró un video que coincidiera con el filtro dentro de 25 segundos. Puede ser un fallo de inicio o un formato aún no reconocido. |
| `ULS_CAPTURE blocked` | El navegador detuvo la página por un bloqueo o una verificación. |
| `ULS_CAPTURE busy` | Otra página está usando el navegador integrado. |
| `ULS_CAPTURE empty` | La captura terminó sin un enlace de video compatible. |

Kino no muestra frases personalizadas de error cuando el nombre del plugin contiene la palabra «Kino». Por eso Toku Kino conserva el detalle del fallo en el panel de debug y en Registro, en lugar de depender de una frase personalizada que la app descartaría.

Después de subir los archivos y actualizar, el detalle del plugin debe indicar **0.1.4**. Al abrir un capítulo, el registro incluirá `ULS_RESOLVE started version=0.1.4 episode=…`. Si reproduce desde los datos públicos, aparecerá `ULS_RESOLVE public_player`. Si usa el navegador, aparecerá `ULS_CAPTURE started version=0.1.4 mode=web timeout_ms=25000`. En caso de timeout, el propio detalle del error también dice «Prueba 0.1.4».

El panel rojo solo muestra las últimas líneas. Para enviar el diagnóstico completo: ciérralo con **Atrás**, abre **Ajustes → Toku Kino → Ver registro** y toma una foto de las líneas anteriores al fallo, o copia el registro. Deja debug activado: apagarlo borra el registro. Anota el capítulo probado. No desinstales ni cambies los permisos por este timeout.

## API oficial de VK

El [esquema oficial de VK](https://github.com/VKCOM/vk-api-schema/blob/master/video/methods.json) declara el método `video.get` con un token de usuario. Sus [objetos de respuesta](https://github.com/VKCOM/vk-api-schema/blob/master/video/objects.json) incluyen enlaces MP4 opcionales bajo `files`. La presencia del método no garantiza que un video concreto permita obtener esos archivos.

Esta entrega no utiliza la API autenticada: no tenemos una respuesta real con un token propio que confirme que devuelve un enlace reproducible para estos capítulos. La consulta nueva a `al_video.php` pertenece al reproductor público del sitio y **no es** la API oficial `video.get`. No solicita ni utiliza un token de usuario. No escribas credenciales en el repositorio ni las envíes por el chat; si se incorpora autenticación después, deberá configurarse dentro de Kino.

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

### 0.1.4

- Corrige la interpretación que consideraba rechazo cualquier código público distinto de cero.
- Mantiene el fin de la llamada cuando VK pide sesión, devuelve su código de error o indica una restricción explícita.
- Añade código de respuesta y motivo clasificado al registro, sin copiar datos del servidor.
- Identifica versión, capítulo y host al inicio de cada reproducción.
- Pruebas de respuestas no reconocidas, restricciones y ausencia de datos sensibles en los registros.

### 0.1.3

- Consulta del reproductor público de VK mediante una petición acotada, antes de abrir el navegador.
- Captura de la página original del capítulo en UnlimitedSubs, con su iframe de VK.
- Código de versión y modo de captura incluidos en el registro y en el detalle de timeout.
- Referencias, configuración de permisos y límite de una sola captura conservados.
- Pruebas de formatos públicos, rechazos de acceso, límites de peticiones y captura de la página original.

### 0.1.2

- Filtro de captura ampliado a los formatos firmados de VK sin extensión de archivo.
- Inicio automático declarado y espera ampliada de 18 a 25 segundos.
- Tipo MP4 como valor de respaldo para esas direcciones cuando la captura no trae un tipo.
- Registro de la versión y de las opciones de captura, sin direcciones ni datos de sesión.
- Una sola captura; los bloqueos y los errores siguen terminando sin reintentos.

### 0.1.1

- Nombre y fila de inicio cambiados a Toku Kino.
- Identificador y referencias de capítulos conservados.
- Registro del inicio de captura y del estado HTTP del reproductor.
- Una captura sin video mantiene el detalle específico del error.
- Instrucciones corregidas para el consentimiento y la pestaña de diagnóstico.

### 0.1.0

- Inicio y búsqueda con una serie de prueba.
- Portada, sinopsis, miniaturas y capítulos obtenidos de la fuente.
- Referencias estables para la serie y cada capítulo.
- Resolución directa de VK y captura opcional del reproductor en Kino 0.9.50.
- Errores controlados y registro de diagnóstico.

Después de comprobar la reproducción en la TV se puede ampliar al resto del catálogo, conservando los identificadores ya publicados.
