# sen

**En línea:** <https://fraguio.com/sen/> · <https://jfraguio.github.io/sen/> · **Laboratorio:** <https://fraguio.com/sen/lab/>

Luz y sonido para descansar. Catorce ambientes de diez minutos, sin cuentas, sin
ajustes y sin distracciones: eliges un tema, la pantalla se llena de color y el
audio suena en bucle hasta completar la sesión.

Hecha como sitio estático (HTML, CSS y JavaScript sin dependencias), pensada
para móvil y publicable directamente en GitHub Pages.

## Usar

```bash
# desde la raíz del proyecto
python3 -m http.server 4173
```

Abre <http://localhost:4173>. También puedes usar cualquier servidor estático
(`npx serve`, Live Server, etc.). No abras `index.html` con `file://`: los
módulos ES y el audio necesitan un servidor.

## Publicar en GitHub Pages

1. Sube el proyecto a un repositorio.
2. En GitHub: **Settings → Pages → Build and deployment**.
3. Elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`.

No hace falta compilar nada. El archivo `.nojekyll` ya está incluido para que
GitHub sirva los archivos tal cual. Todas las rutas son relativas, así que
funciona también en `usuario.github.io/repositorio/`.

## Ambientes

| Ambiente  | Identidad visual                                          | Audio              |
| --------- | --------------------------------------------------------- | ------------------ |
| Lluvia    | azules oscuros, reflejos y caída vertical                 | `lluvia.wav`       |
| Tormenta  | crepúsculo violeta, nubarrones y relámpagos               | `tormenta.wav`     |
| Fuego     | rojos, naranjas y amarillos con brasas                    | `fuego.wav`        |
| Mar       | azules y turquesas con oleaje lento                       | `mar.wav`          |
| Río       | verdes, turquesas y destellos dorados                     | `rio.wav`          |
| Viento    | corrientes gris azuladas y verdes pálidas                 | `viento.wav`       |
| Espacio   | negro azulado, nebulosas, estrellas y destellos           | `espacio.wav`      |
| Cuento    | luz cálida onírica, partículas y magia                    | `cuento.wav`       |
| Meditación| orbe que respira, tonos profundos y suaves                | `meditacion.wav`   |
| Pájaros   | amanecer, bandadas en silueta y polen dorado               | `pajaros.wav`      |
| Bichos    | pradera, hierba y luciérnagas                              | `bichos.wav`       |
| Bosque    | troncos, rayos de luz y hojas                              | `bosque.wav`       |
| Noche     | luna, colinas, estrellas y luciérnagas                     | `noche.wav`        |
| Burbujas  | baño de espuma, borboteo y luz sumergida                  | `burbujas.wav`     |

## Laboratorio de sonido

La app incluye un laboratorio en **`/lab/`** para crear variaciones de los
ambientes sin tocar código. El ambiente base no
es un archivo cerrado: se sintetiza en el navegador a partir de sus parámetros.

- Editar el carácter del ambiente base: intensidad, chasquidos, graves,
  parpadeo, brillo, velocidad y profundidad del oleaje, etc.
- Añadir capas de ruido ambiente, bichos, pájaros, lluvia, viento, olas o
  burbujas.
- Ajustar el brillo general y el volumen.
- Escuchar la mezcla en directo.
- Descargar los parámetros en un JSON (`sen-lab/2`) con nombre, notas,
  `baseParams` y mezcla de capas.

Ese JSON es lo que puedes enviarme para que replique una variación en la app.
El laboratorio está en `lab/` y el banco de versiones largas en
`sounds/generados/`.

## Estructura

```
index.html
assets/
  audio/            audios locales (ahora: bucles sintéticos de 16 s)
  favicon.svg
scripts/
  make-placeholder-audio.mjs
lab/
  index.html        laboratorio de mezclas
  lab.js / lab.css
  synth.js          síntesis paramétrica de los ambientes base
sounds/
  index.html        redirección al banco largo
  generados/        versiones largas sintéticas (10 min)
src/
  config/
    ambients.js     ← configuración de los ambientes
    icons.js        iconos SVG del menú
  core/
    session.js      reloj de 10 min, pausa y fundidos
    audio.js        bucle y volumen con Web Audio
    wake-lock.js    Screen Wake Lock API
  render/
    engine.js       canvas a pantalla completa
    themes.js       las catorce animaciones
  styles/main.css
```

## Cambiar o añadir ambientes

Todo se edita en **`src/config/ambients.js`**:

- `name`: nombre visible del nodo.
- `hint`: descripción breve que se usa en el tooltip y en la etiqueta accesible.
- `icon`: rutas SVG de 24×24 (solo trazo).
- `accent`: color del icono, del brillo y del foco.
- `audio`: ruta local al bucle. Cambia el archivo por un MP3/OGG y actualiza
  esta ruta (por ejemplo `assets/audio/lluvia.mp3`).
- `animation`: clave de la animación en `src/render/themes.js`.
- `palette`: colores que consume esa animación.

Para añadir un ambiente nuevo:

1. Copia un objeto de `ambients` y cambia el `id` (único).
2. Deja el audio en `assets/audio/` con el nombre que indiques.
3. Usa una animación existente, o crea una fábrica en `src/render/themes.js`
   y regístrala en el objeto `THEMES`.
4. Si el menú ya tiene sus 14 nodos, añade una posición en `NODE_LAYOUT` y el
   recorrido de la línea en `NODE_PATH`, ambos en `src/main.js`.

El menú de constelación, los colores de cada nodo y el resto de la interfaz se
generan automáticamente a partir de esa lista.

### Audios generados

Los 14 WAV incluidos están sintetizados por
`scripts/make-placeholder-audio.mjs`; la app no depende de grabaciones
externas. Para regenerarlos:

```bash
node scripts/make-placeholder-audio.mjs
```

También puedes sustituir un WAV por una pista propia manteniendo el nombre en
`assets/audio` (o actualizando la ruta en la configuración).

También hay un modo largo que genera versiones de **10 minutos** de los mismos
catorce ambientes (MP3 mono, 64 kbps) en `sounds/generados/`, con su propio
reproductor. La app usa los WAV de `assets/audio/`; este banco es la versión
larga para escuchar y comparar. Se incluye en el repositorio y se publica en
`/sounds/generados/`:

```bash
node scripts/make-placeholder-audio.mjs --long
```

La síntesis reparte gotas, chasquidos, truenos y notas a lo largo de toda la
pista, así que no se limita a repetir el bucle de 16 segundos.

## Comportamiento de la sesión

- Cada sesión dura exactamente **10 minutos**.
- En los **últimos 30 segundos** baja el volumen y se oscurece la luz de forma
  progresiva.
- Al terminar, la pantalla queda casi negra unos segundos y vuelve a la
  menú principal.
- **Terminar a mano** aplica un fundido de unos 2 segundos.
- Un toque en la escena termina la sesión con fundido y vuelve al menú. No hay
  controles inferiores.
- Durante la sesión se solicita un **Screen Wake Lock**. Si el navegador no lo
  admite, la app funciona igual.
- Se respeta **`prefers-reduced-motion`**: la animación se detiene en una
  composición estática, mientras la sesión y el audio continúan.
- `Esc` termina la sesión. El botón Atrás del móvil también la termina con
  fundido.

La duración y los fundidos se pueden ajustar en `APP`, al principio de
`src/config/ambients.js`.
