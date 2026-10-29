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
- **Dos escenas de audio por ambiente** (`01.wav` y `02.wav`), elegidas entre
  los paisajes de alta calidad que genera el motor. La sesión empieza siempre
  por `01.wav`; el resto de escenas del generador son opcionales y no se
  publican.
- **Indicador de pista discreto** arriba a la izquierda (`1/2`, `2/2`…): al
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
  audio/<id>/01.wav, 02.wav (dos por ambiente)
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

El motor puede generar ocho escenas por ambiente, pero el repositorio publica
solo dos, renombradas `01.wav` y `02.wav`. Son paisajes de alta calidad
(`scripts/lib/soundscapes.js`): 30 s, mono, 22,05 kHz, 16 bits con dither,
bucle sin costura y ≈ −23 LUFS.

```bash
# Publicar las dos pistas de todos los ambientes (01/02)
node scripts/make-soundscapes.mjs --publish

# Publicar solo algunos
node scripts/make-soundscapes.mjs --publish --only=mar,fuego

# Generar escenas de trabajo 04–08 (no las publica)
node scripts/make-soundscapes.mjs

# Revisar nivel, picos y costura del bucle
node scripts/analyze-audio.mjs
```

La tabla `PUBLISHED` de `scripts/lib/soundscapes.js` decide qué dos escenas se
publican y con qué nombre. La app solo lee `01.wav` y `02.wav`, los descubre con
peticiones `HEAD` al iniciar cada sesión y respeta los que existan: si borras
uno, se usa el otro; si no queda ninguno, la sesión continúa solo con luz.

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
