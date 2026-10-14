# Dominios de VOE · 0.3.5

Requiere Kino 0.9.55+ y la aprobación del permiso general HTTPS de API 9.

- El validador acepta manifiesto y exportaciones; muestra la nueva línea de consentimiento en rojo.
- 134 pruebas del plugin pasan, incluidas 20 regresiones añadidas desde 0.3.4.
- Las pruebas del kit pasan: 207 aprobadas, 11 omitidas por sus condiciones originales, sin fallos. Se actualizaron las expectativas de versión, campos y textos a la referencia oficial API 9. El shim sigue siendo anterior: las API nativas que no simula se enumeran explícitamente, no se presentan como implementadas.
- Las pruebas de dominio nuevo modelan la aprobación de Kino y permiten exclusivamente el host ficticio de la prueba. El permiso real, sus cuotas y el bloqueo DNS los controla Kino, no el plugin ni el SDK antiguo.
- Se verificaron Timeranger y Gavv: HLS VOD y variantes HTTP 200, primer segmento por rango HTTP 206. Informe: test/voe-update-live-results.json.
- Redirecciones HTTP y JavaScript se inspeccionan por salto, hasta tres páginas, conservando el mismo video. Se rechazan rutas distintas, consultas, fragmentos, ciclos y direcciones incompatibles con HTTPS.
- No se han instalado esta versión ni probado el permiso general en Android TV; queda la comprobación del usuario tras actualizar la app. No se ha reproducido todo el catálogo.
- Catálogos, referencias, imágenes y alternativas de ShadowLiv se conservan. Bump no se modifica.

Fuentes de la referencia: https://kinotvapp.github.io/kino-plugins/reference/contract.json y https://kinotvapp.github.io/kino-plugins/reference/kino.d.ts, descargadas el 14 de octubre de 2026 UTC. Las plantillas oficiales consultadas todavía contienen SDK de API 6 y 7.

Los informes no contienen enlaces de reproducción temporales, cookies ni credenciales.
