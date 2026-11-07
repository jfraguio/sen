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
- **Escenas de audio por ambiente**: el motor puede generar hasta diez
  (`01.wav` … `10.wav`): tres de síntesis base y siete paisajes de alta
  calidad. **El repositorio conserva seis por ambiente, `01.wav` … `06.wav`**:
  bucles de 60 s de paisaje con una melodía baja (el sonido ambiente manda; en
  el cuento, la música). La sesión empieza siempre por `01.wav`.
- **Indicador de pista discreto** arriba a la izquierda (`1/6`, `2/6`…): al
  pulsarlo se pasa a la siguiente pista del ambiente. La URL indica el ambiente
  y la pista (`#mar/01`); abrir `#ambiente/NN` (por ejemplo `#bosque/02`)
  inicia directamente esa sesión con esa pista. Arriba a la derecha hay una **X**
  para cerrar y volver
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
  audio/<id>/01.wav … 06.wav (seis por ambiente)
  audio/README.md
  favicon.svg
lab/
  index.html, guia.html, lab.css
  worker.js, export-worker.js, overview-worker.js
  player-worklet.js (escucha), live-worklet.js (modo teclado)
  app/        interfaz del editor
  engine/     motor de síntesis del laboratorio (sin DOM, también en Node)
  templates/  proyectos de ejemplo para las pruebas (.sen.json)
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

El motor genera diez escenas sintéticas por ambiente; el repositorio conserva
seis, renombradas `01.wav` (por defecto) … `06.wav`. Las demás se pueden
regenerar:

- **01–03**, síntesis base (`scripts/lib/synth.js`): 16 s, mono, 16 kHz.
- **04–06**, paisajes de alta calidad (`scripts/lib/soundscapes.js`): 60 s, mono,
  22,05 kHz, bucle sin costura, deterministas y a ≈ −23 LUFS. Las publicadas
  llevan una melodía baja compuesta para el bucle.
- **07–08**, paisajes con una melodía (piano de fieltro, arpa, guitarra,
  celesta, vibráfono, kalimba o flauta) en frases de 30 s y, cuando encaja, un
  pad sostenido.
- **09–10**, paisajes nuevos con melodía compuesta para el minuto entero.

La música se nivela sola para quedar unos 10 LU por debajo del paisaje
(`MUSIC_LU` en `soundscapes.js`); en el cuento la música es lo principal.

```bash
node scripts/make-audio-variants.mjs              # 01–03 de todos (sobrescribe 01–03)
node scripts/make-audio-variants.mjs --only=lluvia
node scripts/make-soundscapes.mjs                 # 04–10 de todos
node scripts/make-soundscapes.mjs --only=mar,fuego
node scripts/make-soundscapes.mjs --scene=9,10    # solo algunas escenas
node scripts/make-soundscapes.mjs --publish       # escribe 01–06 tal como se publican
node scripts/analyze-audio.mjs                    # nivel, picos y costura
```

Los archivos se escriben en `assets/audio/<id>/`. La app solo lee `01.wav` …
`06.wav`; la tabla `PUBLISHED` de `scripts/lib/soundscapes.js` dice de qué
escena sale cada una y `--publish` las escribe con ese nombre. La app los
descubre con peticiones `HEAD` al iniciar cada sesión, así que puedes borrar
cualquier escena sin tocar código.

## Laboratorio

**`/lab/`** es un editor de música ambiental sintética con su propio motor:

- **Canciones de sen por capas:** las plantillas abren cualquier canción de la
  app separada en capas (lluvia, pájaros, pad, melodía…), para cambiar sus
  volúmenes o añadir instrumentos y exportar el WAV con el formato de la app.
  Sin tocar nada, suena igual que en la app.
- **Línea de tiempo** con pistas y elementos: notas sostenidas (pad, drone,
  cuerdas, arpa eólica, flauta suave, coro, cuenco tibetano frotado, vidrio,
  seno, theremin, pad 80, metales 80, bajo 80 y lead 80), notas puntuales
  (campana, cuenco tibetano, kalimba, caja de música, celesta, marimba,
  vibráfono, piano de fieltro, handpan, tambor de lengüeta, steel drum, arpa, guitarra de nailon, ukelele, slide
  hawaiana, cuerda pulsada, gota tonal, palo de lluvia, piano FM y campana FM)
  como golpes, frases o nubes de
  notas, ruidos de color y **simulaciones** (grillos, cigarras, pájaros
  por especie, gaviotas incluidas, gotas, lluvia normal/fina/lejana, arroyo,
  olas, viento, fuego, campanillas).
  Cada pista tiene silencio, solo y volumen en su cabecera.
- **Biblioteca plegable por gesto y timbre:** Sostenidos, Puntuales, Texturas y
  Naturaleza, con subgrupos como Sintes, Teclados, Láminas, Agua o Animales.
  Las secciones y subsecciones empiezan plegadas.
- **Escucha en directo** mientras editas; región de escucha en bucle.
- Tonalidad, tempo opcional, reverb y eco maestros, automatización por pista,
  deshacer, autoguardado, plantillas (Vacío y las canciones de sen), modo
  compacto en móvil e importación MIDI.
- **Notas con el teclado:** en una capa sostenida, «Notas» reúne la fila base
  de 0 s y los cambios posteriores; si solo hay una fila, esa nota dura todo el
  elemento. «Teclado» te deja tocar con las letras sin modificar el tema y
  «Grabar» guarda las notas dentro del mismo elemento mientras avanza el
  cabezal, con el mismo popup y las mismas tarjetas para usarlas como guía.
  Los acordes se cruzan con un fundido entre notas ajustable; la
  octava se puede cambiar en caliente y la lista se edita a mano (segundo y
  notas). Las nubes de notas y los golpes usan el mismo diseño de «Notas»:
  «Teclado» y, cuando se puede grabar, el botón de grabación (solo el punto
  rojo) arriba. Una nube nueva empieza vacía: «Grabar» añade cada nota tocada a
  la lista con su tiempo, y la lista se edita y se escucha fila a fila con ▶.
  La casilla «Notas aleatorias» genera una lista de solo lectura con la escala
  y los controles de «Nube generativa». El teclado suena con las mismas
  voces del motor, la mezcla de la pista y la reverb del tema, así que lo que
  tocas suena igual en la pista. El popup incluye un piano de dos octavas, un
  conmutador de acordes/arpegios y progresiones agrupadas por carácter y
  ordenadas alfabéticamente dentro de cada grupo, con sus notas y las teclas
  para tocarlas, los segundos que dura cada paso,
  reproducción en bucle y un botón para llevarlas a Notas una vez, con esos
  tiempos (4 acordes de 5 s quedan en 0, 5, 10 y 15 s y el elemento acaba en
  20 s). En pistas puntuales, el mismo botón crea o sustituye una frase con una
  entrada por paso y nota, editable como lista de tiempos. La progresión se
  puede construir a mano: **+** añade acordes o notas
  desde un desplegable (de la escala de la tonalidad o libres); **×** quita
  tarjetas, se reordenan arrastrándolas, se escuchan al pulsarlas y el lápiz
  de cada acorde abre un editor de notas para invertirlo. Bajo las
  notas, «Repetir» repite el patrón, con sus tiempos, hasta el final del tema.
  El patrón termina en la última fila (que dura lo mismo que el hueco anterior),
  así que no arrastra el silencio que quedaba al final del elemento; si el
  elemento ya ocupa todo el tema, lo repite dentro de él. «Limpiar» elimina
  todas las notas y cambios del elemento. La intensidad de cada elemento
  empieza y termina al máximo, sin fundidos de entrada ni salida: la forma
  gradual se define con la curva del inspector.
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
