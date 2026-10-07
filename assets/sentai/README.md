# Imágenes de Super Sentai

Guarda los logos horizontales en esta carpeta y los fondos en `backgrounds/`.
Ambas carpetas usan los mismos 49 nombres exactos de `nombres.txt`, en minúsculas,
con extensión `.jpg`. Tamaño recomendado: 1920 × 1080.

Ejemplo:

- Logo: `assets/sentai/mirai-sentai-timeranger.jpg`
- Fondo: `assets/sentai/backgrounds/mirai-sentai-timeranger.jpg`

El póster vertical sigue siendo el de ShadowRangers.

## Después de subir los JPG a GitHub

1. En Kino, instala la actualización 0.3.3 y acepta el nuevo dominio GitHub.
2. Abre Ajustes → Toku Kino → Actualizar imágenes de Sentai.
3. Revisa los contadores de fondos disponibles y logos preparados.
4. Vuelve a abrir una serie para consultar sus metadatos con el nuevo fondo.

Puedes subir archivos por partes. No necesitas editar una lista ni cambiar el
código. La acción consulta los nombres publicados en la rama principal de
`efraynns-stack/TokuKino`; no descarga todas las imágenes. Si acabas de subirlas,
GitHub puede tardar unos minutos en servirlas. Repite la acción después.

## Límite de Kino 0.9.50

El plugin devuelve `poster` (póster vertical actual) y `backdrop` (fondo propio,
o póster de ShadowRangers cuando no hay fondo propio). No hay un tercer campo
para el logo horizontal. Los logos de esta carpeta se detectan y conservan
preparados, pero **todavía no se utilizan en las tarjetas**. El plugin no controla
qué imagen decide utilizar cada pantalla de Kino. Para distinguir las tres
imágenes en todas las pantallas, hace falta ampliar el contrato y la app.

Estos directorios contienen instrucciones; no se incluyen JPG falsos ni logos
reutilizados como fondos.
