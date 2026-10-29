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
- **Escenas de audio por ambiente**: el motor puede generar hasta ocho
  (`01.wav` … `08.wav`): tres de síntesis base, tres paisajes de alta calidad y
  dos paisajes con melodía sutil y pad. **El repositorio conserva cuatro por
  ambiente, `01.wav` … `04.wav`** (01–02 paisaje, 03–04 con melodía), y la
  sesión empieza siempre por `01.wav`.
- **Indicador de pista discreto** arriba a la izquierda (`1/4`, `2/4`…): al
  pulsarlo se pasa a la siguiente pista del ambiente. La URL indica el ambiente
  y la pista (`#mar/01`). Arriba a la derecha hay una **X** para cerrar y volver
  al menú.
- Audio sintético, sin cuentas, sin anuncios y sin peticiones a servidores.
- **Laboratorio** en **`/lab/`**: un editor de música ambiental sintética para
  componer temas propios y descargarlos como WAV (ver más abajo).

La funcionalidad completa, la arquitectura y la descripción precisa de cada
ambiente están en **[`SPEC.md`](SPEC.md)**.

## Estructura

```
index.html
SPEC.md
assets/
  audio/<id>/01.wav … 04.wav (cuatro por ambiente)
  audio/README.md
  favicon.svg
lab/
  index.html, guia.html, lab.css
  worker.js, export-worker.js, overview-worker.js, player-worklet.js
  app/        interfaz del editor
  engine/     motor de síntesis del laboratorio (sin DOM, también en Node)
  templates/  plantillas de inicio (.sen.json)
scripts/
  lib/        generadores de escenas (synth, dsp, sources, soundscapes)
  make-audio-variants.mjs
  make-soundscapes.mjs
  analyze-audio.mjs
  render-lab.mjs
  test-lab.mjs
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

El motor genera ocho escenas sintéticas por ambiente; el repositorio conserva
cuatro, renombradas `01.wav` (por defecto) … `04.wav`. Las demás se pueden
regenerar:

- **01–03**, síntesis base (`scripts/lib/synth.js`): 16 s, mono, 16 kHz.
- **04–06**, paisajes de alta calidad (`scripts/lib/soundscapes.js`): 30 s, mono,
  22,05 kHz, bucle sin costura, deterministas y a ≈ −23 LUFS.
- **07–08**, los mismos paisajes con una melodía sutil (piano de fieltro, arpa,
  guitarra, celesta, vibráfono, kalimba o flauta) y, cuando encaja, un pad
  sostenido. Se publican como `03.wav` y `04.wav`.

```bash
node scripts/make-audio-variants.mjs              # 01–03 de todos
node scripts/make-audio-variants.mjs --only=lluvia
node scripts/make-soundscapes.mjs                 # 04–08 de todos
node scripts/make-soundscapes.mjs --only=mar,fuego
node scripts/make-soundscapes.mjs --scene=7,8     # solo las musicales
node scripts/make-soundscapes.mjs --publish       # escribe 01–04 tal como se publican
node scripts/analyze-audio.mjs                    # nivel, picos y costura
```

Los archivos se escriben en `assets/audio/<id>/`. La app solo lee `01.wav` …
`04.wav`; la tabla `PUBLISHED` de `scripts/lib/soundscapes.js` dice de qué
escena sale cada una y `--publish` las escribe con ese nombre. La app los
descubre con peticiones `HEAD` al iniciar cada sesión, así que puedes borrar
cualquier escena sin tocar código.

## Laboratorio

**`/lab/`** es un editor de música ambiental sintética con su propio motor:

- **Retocar una pista de sen:** abre cualquiera de las pistas de la app
  separada en capas (lluvia, pájaros, pad, melodía…), cambia sus volúmenes o
  añade instrumentos y exporta el WAV con el formato de la app. Sin tocar nada,
  suena igual que en la app.
- **Línea de tiempo** con pistas y elementos: notas sostenidas (pad, drone,
  cuerdas, flauta suave, coro, vidrio, seno), notas puntuales (campana, cuenco,
  kalimba, caja de música, celesta, marimba, vibráfono, piano de fieltro, arpa,
  guitarra de nailon, cuerda pulsada, gota tonal) como golpes, frases o nubes
  generativas, ruido de color y **simulaciones** (grillos, cigarras, pájaros
  por especie, ranas, gotas, lluvia, arroyo, olas, viento, fuego, campanillas).
  Cada pista tiene silencio, solo y volumen en su cabecera.
- **Escucha en directo** mientras editas; región de escucha en bucle.
- Tonalidad, tempo opcional, reverb y eco maestros, automatización por pista,
  deshacer, autoguardado, plantillas, modo compacto en móvil e importación MIDI.
- **Exportar → WAV** directamente desde el navegador (48 kHz/24 bits,
  44,1 kHz/16 bits o «Escena para sen»), con final con cola, exacto o en bucle
  sin costura, y sonoridad normalizada. Cada WAV lleva el proyecto dentro y se
  puede volver a abrir.

Las instrucciones de uso están en **`/lab/guia.html`** (botón **?** de la
cabecera del laboratorio o tecla `?`).

El mismo motor genera el WAV en local, byte a byte igual que Chrome:

```bash
node scripts/render-lab.mjs tema.sen.json                 # opciones del proyecto
node scripts/render-lab.mjs tema.wav --rate 44100 --bits 16 --end loop
node tema.render.mjs                                      # script autónomo descargado
node scripts/test-lab.mjs --full                          # pruebas del motor
```

## Publicar en GitHub Pages

1. Sube el proyecto a un repositorio.
2. En GitHub: **Settings → Pages → Build and deployment**.
3. Elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`.

No hay que compilar. `.nojekyll` ya está incluido y todas las rutas son
relativas, así que funciona tanto en un dominio propio como en
`usuario.github.io/repositorio/`.
