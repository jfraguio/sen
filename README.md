# sen

**App:** <https://fraguio.com/sen/> · <https://jfraguio.github.io/sen/><br>
**Laboratorio:** <https://fraguio.com/sen/lab/>

Luz y sonido para descansar. Catorce ambientes, sesiones de **10, 15 o 30
minutos** y ningún ajuste que distraiga: eliges un tema, la pantalla se llena
de color y el audio suena en bucle hasta completar la sesión.

Sitio estático hecho con HTML, CSS y JavaScript sin dependencias, pensado para
móvil y publicado en GitHub Pages.

## Usar

```bash
python3 -m http.server 4173
```

Abre <http://localhost:4173>. No abras `index.html` con `file://`: los módulos
ES y el audio necesitan un servidor.

## Qué incluye

- Menú de constelación con **14 ambientes** identificados solo por su icono.
- Selector de duración con tres opciones: **10, 15 y 30 minutos**.
- Sesión a pantalla completa con animación propia, progreso y fundido final.
- **Escenas de audio por ambiente**: el motor genera hasta seis
  (`01.wav` … `06.wav`), tres de síntesis base y tres paisajes de alta calidad.
  **El repositorio conserva dos por ambiente**; la app elige una al azar entre
  las que existan.
- **Indicador de pista discreto** arriba a la izquierda (`1/2`, `2/2`…): al
  pulsarlo se pasa a la siguiente pista del ambiente. Arriba a la derecha hay
  una **X** para cerrar y volver al menú.
- Audio sintético, sin cuentas, sin anuncios y sin peticiones a servidores.
- Laboratorio en **`/lab/`** para editar el carácter del ambiente base, mezclar
  capas y exportar los parámetros en JSON.

La funcionalidad completa, la arquitectura y la descripción precisa de cada
ambiente están en **[`SPEC.md`](SPEC.md)**.

## Estructura

```
index.html
SPEC.md
assets/
  audio/<id>/<escena>.wav (dos por ambiente)
  audio/README.md
  favicon.svg
lab/
  index.html
  lab.js
  lab.css
  synth.js
  dsp.js
  sources.js
  soundscapes.js
scripts/
  make-audio-variants.mjs
  make-soundscapes.mjs
  analyze-audio.mjs
src/
  config/ambients.js
  config/icons.js
  core/audio.js
  core/session.js
  core/variants.js
  core/wake-lock.js
  main.js
  render/engine.js
  render/themes.js
  styles/main.css
```

## Regenerar el audio

El motor genera seis escenas sintéticas por ambiente; el repositorio conserva
solo dos de ellas. Las otras cuatro se pueden regenerar:

- **01–03**, síntesis base (`lab/synth.js`): 16 s, mono, 16 kHz.
- **04–06**, paisajes de alta calidad (`lab/soundscapes.js`): 30 s, mono,
  22,05 kHz, bucle sin costura, deterministas y a ≈ −23 LUFS.

```bash
node scripts/make-audio-variants.mjs              # 01–03 de todos
node scripts/make-audio-variants.mjs --only=lluvia
node scripts/make-soundscapes.mjs                 # 04–06 de todos
node scripts/make-soundscapes.mjs --only=mar,fuego
node scripts/analyze-audio.mjs                    # nivel, picos y costura
```

Los archivos se escriben en `assets/audio/<id>/`. La app los descubre con
peticiones `HEAD` al iniciar cada sesión, así que puedes borrar las escenas que
no te gusten sin tocar código.

## Laboratorio

El laboratorio vive en **`/lab/`** y comparte la configuración y el motor de
síntesis de la app. Permite:

- Cambiar el ambiente base y editar sus parámetros.
- Añadir capas de bichos, pájaros, lluvia, viento, olas y burbujas.
- Ajustar ruido, brillo, velocidad de las olas y volumen general.
- Descargar o copiar un JSON `sen-lab/2` con la mezcla.

## Publicar en GitHub Pages

1. Sube el proyecto a un repositorio.
2. En GitHub: **Settings → Pages → Build and deployment**.
3. Elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`.

No hay que compilar. `.nojekyll` ya está incluido y todas las rutas son
relativas, así que funciona tanto en un dominio propio como en
`usuario.github.io/repositorio/`.
