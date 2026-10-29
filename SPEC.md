# sen · especificación funcional y técnica

**Versión:** 4.2<br>
**Estado:** vigente<br>
**Alcance:** aplicación web, generador de audio y laboratorio de música ambiental

---

## 1. Resumen

`sen` es una aplicación web estática para elegir un ambiente de luz y sonido y
descansar durante una sesión de duración fija. No hay cuentas, backend,
analítica ni persistencia: todo ocurre en el navegador.

La experiencia tiene tres piezas:

1. **Menú de constelación** con catorce ambientes representados solo por su
   icono.
2. **Sesión a pantalla completa** con una animación propia, audio en bucle,
   progreso y fundido final.
3. **Laboratorio** en `/lab/`: un editor de música ambiental sintética,
   independiente de los ambientes, para componer temas con notas sostenidas,
   notas puntuales, ruidos y simulaciones de naturaleza y descargarlos como WAV
   (sección 7).

El motor puede generar **hasta ocho escenas de audio por ambiente**. Las
escenas no son copias: cada una es un paisaje distinto del mismo ambiente. Las
escenas 01–03 salen de la síntesis base, las 04–06 son paisajes sonoros de
alta calidad (más resolución, bucles más largos y modelos más realistas) y las
07–08 son esos paisajes con una melodía sutil y, cuando encaja, un pad
sostenido. **El repositorio conserva cuatro por ambiente, renombradas `01.wav`
… `04.wav`**: `01` y `02` son paisaje puro, `03` y `04` llevan melodía. Al
comenzar una sesión suena siempre `01.wav`; las demás quedan como alternativas.

---

## 2. Objetivos y no objetivos

### Objetivos

- Ofrecer una experiencia de descanso inmediata, sin configuración previa.
- Mantener una estética sobria, oscura y cinematográfica.
- Que el sonido característico de cada ambiente quede por delante del ruido de
  fondo.
- Permitir variar la duración entre 10, 15 y 30 minutos.
- Ser accesible, responsive y funcionar en móvil, tablet y escritorio.
- Publicarse como sitio estático en GitHub Pages sin build.
- Permitir que el usuario borre escenas de audio sin tocar código.

### No objetivos

- Cuentas, sincronización, favoritos persistentes o historial.
- Backend, base de datos, analítica o cookies.
- Controles de reproducción dentro de la sesión (pausa, volumen, saltar).
- Reproducción en segundo plano garantizada por el sistema operativo.
- Banco de versiones largas en MP3. Se retiró por peso y por usar una síntesis
  antigua que ya no representa la app actual.
- URLs heredadas `/sounds/` y `/sound/`. La única URL de laboratorio es
  `/lab/`.

---

## 3. URLs y despliegue

| Recurso | Ruta |
| --- | --- |
| Aplicación | `/` |
| Laboratorio (editor) | `/lab/` |
| Render local de temas del laboratorio | `scripts/render-lab.mjs` |
| Audio de un ambiente | `/assets/audio/<id>/0N.wav` |
| Configuración | `/src/config/ambients.js` |

- El sitio funciona en la raíz de un dominio y en un subdirectorio
  (`usuario.github.io/repositorio/`), porque todas las rutas son relativas.
- No hay proceso de compilación. `.nojekyll` evita el procesado de Jekyll.
- El despliegue se hace desde la rama `main`, carpeta raíz del repositorio.

---

## 4. Flujo de usuario

### 4.1 Menú principal

Al cargar `/`:

- Se dibuja un cielo místico animado en `#menu-canvas`: nebulosas violetas,
  magenta, cian y turquesa que derivan, cintas de aurora, polvo, un mandala
  (flor de la vida y hexagrama) que respira muy tenue, 320 estrellas con
  paralaje según el puntero y estrellas fugaces ocasionales.
- Se generan catorce botones circulares, uno por ambiente, en las posiciones
  definidas en `NODE_LAYOUT`. Cada nodo tiene un halo, un anillo rúnico
  (`ringSvg()`: marcas, arco y gemas) que gira despacio y un sigilo de estilo
  alquímico que se dibuja trazo a trazo al entrar. La entrada escalonada de
  nodos e iconos dura ~1,2 s y solo se ejecuta al cargar la página.
- Se dibuja una línea suave que une los nodos en el orden de `NODE_PATH`, con
  un flujo de luz que la recorre.
- La constelación y el título se desplazan ligeramente con el puntero
  (paralaje).
- Cada nodo muestra **solo su icono**. No hay texto visible debajo.
- El nombre y la pista del ambiente se conservan en el `aria-label` y en el
  `title` del botón.
- El foco visible usa el color de acento del ambiente.
- En la parte inferior hay un único botón: **`10 MIN`**.

Un clic o toque en un nodo inicia la sesión de ese ambiente con la duración
seleccionada. La invocación es animada: el resto de nodos se pliega hacia el
elegido, salen ondas desde él y una luz de su color de acento crece hasta cubrir
la pantalla (`#portal`) mientras un velo oscurece el menú; la escena aparece al
cabo de ~1 s. El audio se arranca dentro del gesto, y el escenario permanece
oculto (`.stage.is-awaiting`) hasta que termina la transición. Al volver de una
sesión los nodos permanecen como estaban y no repiten la animación de entrada.
Con `prefers-reduced-motion` no hay portal, ondas ni paralaje.

### 4.2 Selector de duración

El botón inferior abre un diálogo con:

- Tres opciones, y solo tres: **`10 MIN`**, **`15 MIN`**, **`30 MIN`**.
- Sin título, nota ni botón de cierre visibles.
- Se cierra al elegir una opción, con `Escape` o tocando fuera.
- Las etiquetas visibles usan `MIN`; los lectores de pantalla reciben el nombre
  completo (“10 minutos”, etc.).

Comportamiento:

- La duración inicial es **10 minutos** en cada carga. No se persiste.
- La opción activa se marca con `aria-pressed="true"`.
- Al elegir una opción se actualiza el texto del botón, se cierra el diálogo y
  el foco vuelve al botón.
- `Escape` cierra el diálogo y devuelve el foco al botón.
- Un clic fuera del diálogo lo cierra sin devolver el foco.
- Mientras hay una sesión activa el diálogo no puede abrirse.
- El diálogo usa `role="dialog"`, `aria-label="Duración de la sesión"` y
  `aria-expanded` en el botón que lo controla.

### 4.3 Sesión

Al iniciar una sesión:

1. Se cierra el selector de duración.
2. Se crea un estado `active` con un token único de sesión.
3. Se muestra `#stage` a pantalla completa.
4. Se mueve el foco al propio `#stage`.
5. Se prepara el contexto de audio **de forma síncrona** dentro del gesto del
   usuario, antes de cualquier petición asíncrona.
6. Se comprueban las escenas disponibles del ambiente con peticiones `HEAD`.
7. El orden es siempre `01.wav`, `02.wav`, `03.wav`, `04.wav`. Se empieza por
   `01.wav`; si no existe, por la primera disponible. El indicador arranca en
   `1/N`.
8. Se reproduce la pista en bucle y se arranca la animación del ambiente y el
   reloj de sesión.
9. Se solicita el Screen Wake Lock.
10. Se añade `#<id>/<pista>` al historial mediante `pushState`, por ejemplo
    `#mar/01`.

Durante la sesión:

- La escena llena la pantalla; no hay controles inferiores.
- Arriba a la izquierda hay un indicador discreto `posición/total` (por ejemplo
  `1/4`). Al pulsarlo se pasa a la siguiente pista del ambiente, con un
  crossfade corto y sin reiniciar la sesión ni la barra de progreso. El hash de
  la URL se actualiza a `#<id>/<pista>` (`#mar/02`) con `replaceState`.
- Arriba a la derecha hay una **X** discreta para cerrar el ambiente y volver al
  menú. Hace el mismo cierre con fundido que un toque o `Escape`.
- Los dos controles desaparecen durante el fundido final.
- La barra superior de progreso avanza según el tiempo transcurrido y la
  duración elegida.
- Un toque en cualquier punto de la escena, fuera de los dos controles,
  termina la sesión.
- `Escape` termina la sesión.
- El botón Atrás del navegador termina la sesión.
- El audio entra con un fundido de 1,4 s y se mantiene en bucle.
- En los últimos **30 segundos** el audio baja de volumen y la pantalla se
  oscurece progresivamente.
- Al llegar al final, la pantalla queda casi negra durante **4 segundos** y
  después vuelve al menú.
- Al terminar a mano, el fundido dura **2 segundos** y después se vuelve al
  menú.
- La transición de salida del escenario dura **440 ms**.
- Al volver al menú, el foco regresa al nodo que inició la sesión.
- El hash de la URL se elimina con `replaceState`.

### 4.4 Audio no disponible

Si no existe ninguna escena del ambiente, o falla la descarga o la
decodificación:

- La sesión visual continúa.
- Aparece el aviso **“Audio no disponible”**.
- El aviso se oculta a los 8 segundos.
- La región `aria-live` anuncia: “Audio no disponible. La sesión continúa solo
  con luz.”
- No se interrumpe la animación ni el reloj de la sesión.

Si una escena falla después de haber empezado a sonar, se aplica el mismo
tratamiento de aviso.

### 4.5 Movimiento reducido

Si el usuario tiene activado `prefers-reduced-motion: reduce`:

- La animación se dibuja una vez en una composición estática.
- La sesión y el audio continúan con normalidad.
- Los fundidos de luz y volumen siguen funcionando.
- Las transiciones CSS se reducen al mínimo.

### 4.6 Pantalla encendida

Al iniciar la sesión se solicita un **Screen Wake Lock** si el navegador lo
admite. Si la pestaña pasa a segundo plano, el sistema puede liberar el bloqueo;
al volver a la pestaña visible o recuperar el foco, se solicita de nuevo si la
sesión sigue activa. Si el sistema libera el bloqueo sin ocultar la página, o la
petición falla, se reintenta con una espera creciente. Si la API no está
disponible no se muestra ningún error: la app funciona igual.

---

## 5. Reglas funcionales

### 5.1 Duración

- Valores permitidos: **10, 15 y 30 minutos**.
- Valor por defecto: **10 minutos**.
- No se guarda en `localStorage` ni en la URL.
- El temporizador usa la duración elegida como denominador del progreso.
- El fundido final siempre empieza 30 segundos antes del final.

### 5.2 Selección de escena

- Cada ambiente tiene una carpeta `assets/audio/<id>/`.
- Los nombres válidos son `01.wav`, `02.wav`, `03.wav` y `04.wav`.
- Al iniciar cada sesión se hacen cuatro peticiones `HEAD` con
  `cache: 'no-store'`.
- Solo se consideran las escenas que responden correctamente.
- El orden es fijo: `01.wav`, `02.wav`, `03.wav`, `04.wav`. La sesión empieza
  siempre por `01.wav`; si no existe, por la primera disponible. El indicador
  siempre muestra `1/N`.
- Al pulsar el indicador se avanza cíclicamente por ese orden: `1/N`, `2/N`…
  y de nuevo `1/N`. No se reinicia el reloj de la sesión.
- El hash de la URL indica el número real del archivo que está sonando, por
  ejemplo `#mar/01` o `#mar/03`.
- Si el usuario borra una escena, deja de elegirse en la siguiente sesión.
- Si solo queda una, el indicador muestra `1/1` desactivado y siempre suena esa.
- Si no queda ninguna, se aplica el comportamiento de “Audio no disponible”.
- La comprobación se repite en cada sesión, no se cachea el resultado.

### 5.3 Sesión única

- Solo puede haber una sesión activa a la vez.
- Un clic en otro nodo durante una sesión no hace nada.
- Un token de sesión evita que callbacks antiguos (audio, reloj, historial)
  modifiquen una sesión nueva.
- El cierre se marca con `ending` / `finishing` para que no se ejecute dos
  veces.

---

## 6. Ambientes

### 6.1 Nota sobre las escenas

Las fichas de este apartado describen las escenas de paisaje (01–06) que puede
generar el motor y, al final de cada ficha, las dos escenas con melodía
(07–08). El repositorio actual conserva cuatro por ambiente: dos de paisaje,
renombradas `01.wav` y `02.wav` y elegidas manualmente, y las dos con melodía,
publicadas como `03.wav` (escena 07) y `04.wav` (escena 08). Las demás pueden
regenerarse con los scripts de audio.

### 6.2 Tabla general

| # | id | Nombre | Pista | Icono | Animación | Acento |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `lluvia` | Lluvia | agua y ventana | `lluvia` | `rain` | `#8fbdff` |
| 2 | `tormenta` | Tormenta | truenos y viento | `tormenta` | `storm` | `#a99bff` |
| 3 | `fuego` | Fuego | brasas y calor | `fuego` | `fire` | `#ffa45c` |
| 4 | `mar` | Mar | olas y espuma | `mar` | `sea` | `#5cebd5` |
| 5 | `rio` | Río | corriente y piedras | `rio` | `river` | `#79e8b7` |
| 6 | `viento` | Viento | ráfagas y hojas | `viento` | `wind` | `#b7d8d3` |
| 7 | `espacio` | Espacio | deriva y estrellas | `espacio` | `space` | `#a48bff` |
| 8 | `cuento` | Cuento | imaginar | `cuento` | `story` | `#ffd08a` |
| 9 | `meditacion` | Meditación | respirar | `meditacion` | `meditation` | `#9dded8` |
| 10 | `pajaros` | Pájaros | amanecer | `pajaros` | `birds` | `#e6d891` |
| 11 | `bichos` | Bichos | grillos y luciérnagas | `bichos` | `bugs` | `#d7e08f` |
| 12 | `bosque` | Bosque | hojarasca | `bosque` | `forest` | `#9ed6a0` |
| 13 | `noche` | Noche | luna y luciérnagas | `noche` | `night` | `#9fb2d9` |
| 14 | `burbujas` | Burbujas | baño de espuma | `burbujas` | `bubbles` | `#8fe9e3` |

### 6.3 Lluvia · `lluvia`

- **Sensación:** lluvia tranquila vista desde una ventana, con gotas cercanas
  sobre el cristal y un fondo azul profundo.
- **Visual:** tres capas de gotas (64 finas, 46 medianas y 30 cercanas) caen con
  deriva lateral sobre un degradado azul-negro. Hay resplandores fríos, una
  bruma tenue en la base y reflejos verticales.
- **Escena 01 — ventana:** unas 27 gotas espaciadas, de 850 a 1900 Hz, con pings
  cortos y cuerpo grave suave. Alguna gota doble ocasional. El fondo es casi
  inaudible.
- **Escena 02 — lluvia constante:** unas 73 gotas medianas, de 1200 a 2700 Hz,
  más solapadas y regulares.
- **Escena 03 — aguacero:** unas 131 gotas rápidas, de 1500 a 3300 Hz, con una
  capa de ráfaga filtrada que sube y baja cada 4 s.
- **Escena 04 — lluvia sobre hojas:** unas 55 gotas por segundo sobre hojas
  (impactos resonantes de 1,3–4,8 kHz), goterones de rama que caen en charcos
  (uno cada ~2 s), lecho de lluvia fino y lluvia lejana muy baja. La intensidad
  sube y baja despacio.
- **Escena 05 — lluvia sobre el lago:** unas 85 gotas por segundo sobre agua,
  modeladas como burbujas de Minnaert (1–4,8 kHz, con el tono que sube), plops
  graves (~2 por segundo), siseo de superficie y reverb abierta.
- **Escena 06 — tienda de campaña:** golpes de gota sobre la lona (resonancias
  de 150–330 Hz, ~20 por segundo), goteo regular del borde en un charco cada
  ~1,75 s, lluvia exterior apagada y un espacio muy pequeño.
- **Escena 07 — piano junto a la ventana** (`03.wav`): lluvia sobre hojas más
  suave y una melodía de piano de fieltro en Fa mayor (64 BPM, Fa–Lam–Si♭–Do)
  con bajo discreto y cuerdas muy lejanas.
- **Escena 08 — lluvia mansa y arpa** (`04.wav`): lluvia fina con goterones,
  arpegios lentos de arpa en Re mayor (80 BPM) con una frase arriba y un pad
  Re–La–Mi sostenido.
- **Síntesis base:** `intensity` 0.60, `drops` 0.45, `hiss` 0.55, `wind` 0.20,
  `brightness` 0.60.

### 6.4 Tormenta · `tormenta`

- **Sensación:** tormenta de crepúsculo, con lluvia, viento y descargas
  lejanas o cercanas.
- **Visual:** diez nubarrones violetas a la deriva, noventa líneas de lluvia y
  relámpagos ramificados cada 9–22 s. Cada descarga tiene tres pulsos de luz y
  tiñe el cielo de violeta y blanco.
- **Escena 01 — tormenta lejana:** un trueno largo entre los segundos 2 y 4,
  con lluvia y viento suaves.
- **Escena 02 — tormenta cercana:** tres truenos (aprox. 1,4 s, 6,2 s y 10,8 s),
  cada uno con un chasquido inicial, y lluvia más presente.
- **Escena 03 — tormenta que pasa:** dos truenos (aprox. 3 y 10 s) y ráfagas de
  lluvia y viento que barren la escena.
- **Escena 04 — tormenta lejana:** lluvia constante, viento suave y un trueno
  largo (13 s) muy lejano hacia el segundo 6, con otro más débil hacia el 21.
  Reverb grande.
- **Escena 05 — tormenta sobre el tejado:** lluvia sobre tejas (~110 golpes por
  segundo), un canalón que borbotea y un trueno a media distancia con chasquido
  suave hacia el segundo 8, más otro lejano hacia el 23.
- **Escena 06 — tormenta con viento:** ráfagas con aullido, lluvia cuya
  intensidad sigue al viento, gotas que azotan el cristal en las rachas y dos
  truenos lejanos (aprox. 3 y 18 s).
- **Escena 07 — tormenta lejana y cuerdas** (`03.wav`): lluvia constante, un
  único trueno muy lejano, cuerdas en Re menor (Rem–Si♭–Fa–Do) y piano de
  fieltro lento.
- **Escena 08 — refugio bajo la lluvia** (`04.wav`): lluvia apagada sobre el
  tejado vista desde dentro, un trueno lejano, pad cálido en La menor y una
  melodía de celesta.
- **Síntesis base:** `rain` 0.55, `thunder` 0.50, `wind` 0.45, `rumble` 0.55,
  `brightness` 0.50.

### 6.5 Fuego · `fuego`

- **Sensación:** hoguera íntima, con brasas, chasquidos y un resplandor cálido
  irregular.
- **Visual:** hoguera dibujada: tres leños cruzados con corteza y cortes
  claros, un lecho de 34 brasas que laten, 17 lenguas de llama en tres capas
  (rojizas y anchas detrás, doradas delante, núcleo crema) que ondulan y
  respiran, y 46 chispas que suben en remolino. Resplandor cálido con parpadeo
  irregular y degradado de calor en la mitad inferior.
- **Escena 01 — brasas:** tres grupos de chasquidos y cinco pops graves. El
  fuego está bajo y tranquilo.
- **Escena 02 — fuego vivo:** siete grupos de chasquidos, dieciséis pops y más
  presencia de ascuas.
- **Escena 03 — fuego con viento:** cinco grupos de chasquidos, diez pops y dos
  ráfagas que avivan la llama. Los graves están más presentes.
- **Escena 04 — chimenea:** modelo `hearth`: cuerpo de llama cálido (150–1000
  Hz) que parpadea y «lame», avivamientos breves, chasquidos de madera modales
  (resonancias de 1–4 kHz más golpe sordo) en racimos con amplitudes de cola
  larga, crepitar fino que sigue a la llama, estallidos de nudos y algún silbido
  de vapor, con agudos suavizados. Sala pequeña.
- **Escena 05 — hoguera al aire libre:** llama más grande y viva, más
  chasquidos y avivamientos, grillos lejanos y brisa suave.
- **Escena 06 — brasas** (receta disponible, sin publicar): casi sin llama,
  crepitar, tintineo de ascuas y dos asentamientos de leña.
- **Escena 07 — chimenea y guitarra** (`03.wav`): chimenea sin silbidos y
  guitarra de nailon que arpegia Mim–Do–Sol–Re/Fa♯ en corcheas con una melodía
  arriba; pad cálido muy bajo.
- **Escena 08 — brasas y piano** (`04.wav`): brasas tranquilas, piano de
  fieltro en Mi♭ mayor y pad cálido.
- **Síntesis base:** `intensity` 0.55, `crackle` 0.65, `rumble` 0.50, `flicker`
  0.45, `brightness` 0.55.

### 6.6 Mar · `mar`

- **Sensación:** oleaje lento, espuma y aire salado, con el sol bajo sobre el
  agua.
- **Visual:** cinco bandas de olas con crestas turquesa, 46 destellos sobre la
  superficie y resplandores de espuma. El horizonte se mueve con un ritmo
  hipnótico.
- **Escena 01 — marea calmada:** olas cada 8 s, poca espuma y un aire mínimo.
- **Escena 02 — oleaje:** olas cada 5,33 s, más profundidad y espuma.
- **Escena 03 — mar agitado:** olas cada 4 s, una segunda serie de olas cada
  2 s, más espuma y graves.
- **Escena 04 — playa de arena:** tres olas largas (aprox. 1,5, 11 y 21 s) con
  crecida grave, rompiente y resaca con espuma burbujeante; rumor de fondo y
  brisa.
- **Escena 05 — orilla de guijarros:** cuatro olas cada ~7,5 s; en cada resaca
  ruedan cientos de guijarros.
- **Escena 06 — cala tranquila:** chapoteos contra las rocas (uno cada ~2 s) con
  gorgoteos, dos olas pequeñas lejanas y un rumor grave.
- **Escena 07 — mar en calma y flauta** (`03.wav`): tres olas suaves, pad
  Sol–Re–La que se abre despacio y una flauta lejana en pentatónica de Sol con
  frases que respiran.
- **Escena 08 — atardecer en la cala** (`04.wav`): chapoteos de cala, arpa en
  La mayor (arpegio y frase) y cuerdas lejanas.
- **Síntesis base:** `speed` 0.45, `depth` 0.60, `foam` 0.50, `wind` 0.25,
  `brightness` 0.55.

### 6.7 Río · `rio`

- **Sensación:** agua clara entre piedras, con remolinos y destellos dorados.
- **Visual:** tres cintas de corriente con tres pasadas de distinto grosor; 54
  vetas que viajan siguiendo la corriente con cola desvanecida; cinco piedras
  con espuma río arriba que palpita y estela en V aguas abajo; 30 destellos
  dorados sobre la superficie. Fondo verde bosque con reflejos turquesa.
- **Escena 01 — arroyo claro:** corriente brillante, remolinos lentos y pocas
  burbujas.
- **Escena 02 — río rápido:** corriente más ancha y rápida, con muchas burbujas
  pequeñas y más aire.
- **Escena 03 — cauce ancho:** flujo más grave y lento, cuerpo profundo, menos
  burbujas y piedras ocasionales.
- **Escena 04 — arroyo de montaña:** dieciséis fuentes de burbujas (450–2600 Hz)
  que repiten su gorgoteo con ritmo propio, corriente brillante y graves
  mínimos.
- **Escena 05 — río ancho y sereno:** siete fuentes graves (180–650 Hz) y
  lentas, corriente profunda y chapoteos suaves en la orilla.
- **Escena 06 — pequeña cascada:** chorro turbulento de banda ancha, golpe grave
  del agua, veintidós fuentes de burbujas y salpicaduras, con paso bajo a 7,5
  kHz.
- **Escena 07 — arroyo y kalimba** (`03.wav`): arroyo claro, kalimba en Do
  mayor a 96 BPM y pad cálido Do–Lam–Fa–Sol.
- **Escena 08 — río sereno y celesta** (`04.wav`): río ancho y lento, celesta en
  Si♭ mayor y cuerdas.
- **Síntesis base:** `flow` 0.55, `bubbles` 0.40, `width` 0.50, `air` 0.30,
  `brightness` 0.55.

### 6.8 Viento · `viento`

- **Sensación:** ráfagas que atraviesan un paisaje abierto, con hojas y algún
  silbido.
- **Visual:** una ráfaga lenta que sube y baja gobierna toda la escena: 30
  cintas de aire con los extremos desvanecidos, nubes alargadas a la deriva, 18
  hojas que vuelan girando y 70 briznas de hierba que se doblan con el viento.
- **Escena 01 — brisa:** ráfagas suaves, más peso en las frecuencias medias,
  pocos silbidos y pocas hojas.
- **Escena 02 — vendaval:** graves y agudos más fuertes, nueve silbidos y diez
  golpes de hojas.
- **Escena 03 — viento seco:** graves más finos, doce silbidos y seis ráfagas
  de hojas; suena más alto y silbante.
- **Escena 04 — brisa entre pinos:** soplo suave cuya frecuencia sube con cada
  ráfaga y siseo de acículas, con momentos casi en calma.
- **Escena 05 — viento de montaña:** viento grave y profundo con tres aullidos
  estrechos que afinan con la velocidad del aire y eco de valle.
- **Escena 06 — ráfagas entre las hojas:** hojas agitadas cuya densidad sigue a
  la ráfaga, soplo medio y correteo ocasional de hojas secas.
- **Escena 07 — brisa y flauta** (`03.wav`): brisa entre pinos, drone Mi–Si
  y flauta pastoral en pentatónica de Mi menor.
- **Escena 08 — valle con viento y cuerdas** (`04.wav`): viento grave sin
  aullidos, hojas, cuerdas en Sol mayor y notas sueltas de arpa.
- **Síntesis base:** `gust` 0.55, `speed` 0.50, `air` 0.50, `brightness` 0.50.

### 6.9 Espacio · `espacio`

- **Sensación:** deriva sideral, vasta y lenta, con drones graves y destellos
  lejanos.
- **Visual:** seis nebulosas a la deriva, 210 estrellas con parpadeo y una
  estrella fugaz cada 5–11 s. El fondo es negro azulado con luz violeta y azul.
- **Escena 01 — deriva:** drone en 55, 82,5, 110, 165 y 220 Hz, respiración
  lenta de 16 s y cuatro campanas largas.
- **Escena 02 — destellos:** drone con parciales más altos (hasta 330 Hz),
  pulso de 4 s, catorce campanas y shimmer más brillante.
- **Escena 03 — púlsar:** drone grave con sub de 27,5 Hz, pulso de 8 s, siete
  campanas y ecos cortos y oscuros.
- **Escena 04 — nebulosa:** pad en Re mayor con novena (73–330 Hz) cuyo timbre
  se abre y se cierra despacio, viento solar filtrado y reverb de 6,5 s.
- **Escena 05 — órbita:** drone en La (55, 82,5 y 110 Hz), tres barridos de
  radio y seis destellos pentatónicos agudos en una reverb de 7 s.
- **Escena 06 — vacío profundo:** drone subgrave en Mi (41, 62 y 82 Hz) con
  batidos lentos, tres tonos de cristal y reverb de 9 s.
- **Escena 07 — deriva estelar** (`03.wav`): pad Fa lidio (65–330 Hz), viento
  solar y una celesta lejana con reverb de 6 s.
- **Escena 08 — luz lejana** (`04.wav`): drone Re–La–Do♯ y piano de fieltro a
  48 BPM en una sala enorme.
- **Síntesis base:** `drone` 0.55, `shimmer` 0.35, `movement` 0.40, `brightness`
  0.50.

### 6.10 Cuento · `cuento`

- **Sensación:** música de caja de música y pads cálidos, como un cuento antes
  de dormir.
- **Visual:** 52 motas flotantes, 16 destellos y tres cintas de luz cálida que
  se mecen sobre un fondo violeta onírico.
- **Escena 01 — nana:** melodía lenta en Do mayor, pads en 220, 261,6, 329,6 y
  440 Hz, notas cada 2,6–4,2 s.
- **Escena 02 — caja de música:** registro agudo (523–1046 Hz), notas más
  rápidas (0,95–2 s), pads altos y destellos.
- **Escena 03 — cuento nocturno:** registro grave (220–392 Hz), tempo lento
  (2–3,4 s), pads en 110–330 Hz y aire casi nulo.
- **Escena 04 — caja de música:** nana original en Do mayor a 64 BPM (ocho
  compases exactos en el bucle), caja de música con bajo y pads suaves.
- **Escena 05 — kalimba de cuna:** vals en La menor (60 BPM, 3/4, diez compases)
  con arpegios de kalimba y pad cálido.
- **Escena 06 — nana de celesta:** melodía de celesta en Fa mayor a 48 BPM sobre
  cuerdas suaves (seis compases).
- **Escena 07 — arpa de cuna** (`03.wav`): nana original en Re mayor (72 BPM,
  3/4, doce compases) con arpa y cuerdas suaves.
- **Escena 08 — nana al piano** (`04.wav`): nana de piano de fieltro en Sol
  mayor con acompañamiento quebrado y pad cálido.
- **Síntesis base:** `pads` 0.55, `notes` 0.55, `tempo` 0.50, `sparkle` 0.40,
  `brightness` 0.55.

### 6.11 Meditación · `meditacion`

- **Sensación:** respiración profunda, cuencos lejanos y un orbe que se expande
  y contrae.
- **Visual:** un orbe central con tres anillos que se expanden cada 10 s, 22
  partículas en órbita y resplandores turquesa, azules y lilas.
- **Escena 01 — cuencos:** drone en 55, 82,5, 110 y 165 Hz, respiración de 16 s
  y entre 3 y 8 cuencos largos.
- **Escena 02 — respiración:** drone más grave (41–110 Hz), respiración de 8 s
  muy marcada y pocos cuencos.
- **Escena 03 — armonía:** drone en quintas (55, 110, 165 y 220 Hz),
  respiración lenta y entre 5 y 11 cuencos.
- **Escena 04 — cuencos tibetanos:** tres cuencos (≈148, 222 y 296 Hz) con modos
  inarmónicos y batidos, cinco golpes por bucle y un zumbido grave.
- **Escena 05 — tanpura:** ciclo Pa–Sa–Sa–Sa en Do (ocho ciclos de 3,75 s) con
  armónicos que barren hacia arriba como el jawari.
- **Escena 06 — campanas de viento y respiración:** tres rachas de campanas
  pentatónicas en Re, aire que respira cada 7,5 s (ocho respiraciones por
  minuto) y drone en Re–La.
- **Escena 07 — cuencos y flauta** (`03.wav`): dos cuencos (Re y La), drone en
  Re y una flauta suave en pentatónica de Re con notas largas.
- **Escena 08 — jardín zen** (`04.wav`): fuente pequeña, kalimba pentatónica en
  Sol y drone Sol–Re.
- **Síntesis base:** `drone` 0.55, `breath` 0.40, `bowls` 0.45, `brightness` 0.50.

### 6.12 Pájaros · `pajaros`

- **Sensación:** amanecer en un bosque, con pájaros claros y aire limpio.
- **Visual:** cinco bandadas en silueta, 40 motas de polen dorado, sol naciente,
  nubes bajas y horizonte cálido.
- **Escena 01 — amanecer:** entre 4 y 12 frases de pájaro, claras y espaciadas,
  con un cuco probable.
- **Escena 02 — coro:** entre 10 y 26 frases, más agudas y solapadas, con mucho
  menos cuco.
- **Escena 03 — bosque lejano:** entre 3 y 9 frases graves y distantes, con cuco
  y algo más de aire.
- **Escena 04 — amanecer en el jardín:** mirlo cercano, petirrojo a media
  distancia, carbonero lejano y gorjeos diminutos de fondo.
- **Escena 05 — bosque en primavera:** pinzón, carbonero, mirlo y petirrojo a
  distintas distancias, un cuco lejano y hojas.
- **Escena 06 — palomas al sol:** paloma torcaz, tórtola turca y tórtola
  europea, pájaros lejanos y brisa cálida.
- **Escena 07 — mañana con arpa** (`03.wav`): petirrojo y mirlo, arpa en Mi
  mayor (arpegio y frase) y cuerdas muy bajas.
- **Escena 08 — prado soleado y piano** (`04.wav`): pinzón, carbonero y
  petirrojo, hojas, piano de fieltro en Re mayor y cuerdas.
- **Síntesis base:** `birds` 0.60, `variety` 0.55, `wind` 0.30, `leaves` 0.40,
  `brightness` 0.55.

### 6.13 Bichos · `bichos`

- **Sensación:** pradera de noche, con grillos, cigarras y luciérnagas.
- **Visual:** 56 briznas de hierba en silueta, 42 luciérnagas que parpadean y
  polvo vegetal suspendido. El fondo es verde oscuro con destellos cálidos.
- **Escena 01 — grillos dispersos:** diez llamadas espaciadas, algunas
  respuestas y cuatro cigarras lejanas. El suelo de aire es mínimo.
- **Escena 02 — trinos densos:** grupos de trinos rápidos cada 0,85–1,55 s y
  cinco cigarras.
- **Escena 03 — dúo:** alternancia de grillos graves (2,5–3,2 kHz) y agudos
  (4,7–5,4 kHz) cada 1,9–2,7 s, con tres cigarras altas.
- **Escena 04 — pradera de grillos:** doce grillos de campo (4,1–5,2 kHz) a
  distintas distancias y dos grillos arbóreos lejanos.
- **Escena 05 — siesta de cigarras:** cuatro cigarras lejanas con pausas,
  grillos al fondo y brisa, con paso bajo a 6,5 kHz para que no resulte
  estridente.
- **Escena 06 — grillos arbóreos:** cuatro trinos continuos (2,4–3,1 kHz), dos
  saltamontes y grillos de campo lejanos.
- **Escena 07 — pradera al anochecer** (`03.wav`): ocho grillos, pad cálido en
  Sol menor (Solm–Mi♭–Si♭–Fa) y celesta.
- **Escena 08 — tarde de verano y guitarra** (`04.wav`): grillos arbóreos y de
  campo lejanos, brisa, guitarra de nailon en 6/8 (Re mayor) y pad.
- **Síntesis base:** `crickets` 0.60, `cicadas` 0.45, `air` 0.30, `brightness`
  0.50.

### 6.14 Bosque · `bosque`

- **Sensación:** sombra verde, hojas que se mueven y ramas que crujen.
- **Visual:** tres planos de profundidad: abetos pálidos en la bruma, árboles
  de copa redonda que se mecen y grandes troncos oscuros que enmarcan. Cuatro
  haces de luz que respiran, bruma baja a la deriva, 22 hojas que caen girando y
  44 motas de polen.
- **Escena 01 — sombra:** pocas ráfagas de hojas, dos crujidos y tres pájaros.
- **Escena 02 — viento en las hojas:** once ráfagas, seis crujidos y cuatro
  pájaros; el viento mueve la escena.
- **Escena 03 — atardecer:** siete ráfagas, tres crujidos y siete pájaros, con
  menos viento y más presencia de aves.
- **Escena 04 — hayedo con brisa:** hojas y viento en ráfagas, petirrojo y mirlo
  lejanos y un pájaro carpintero hacia el segundo 14.
- **Escena 05 — bosque después de la lluvia:** goteo de las hojas que se
  intensifica con la brisa, gotas en charcos, un arroyo lejano y pájaros.
- **Escena 06 — pinar al atardecer:** siseo de pinos, dos crujidos de tronco,
  cucos lejanos y una tórtola.
- **Escena 07 — claro del bosque** (`03.wav`): petirrojo y mirlo, brisa grave
  y un arroyo lejano (todo por debajo de 2 kHz, sin hojarasca ni siseo),
  cuerdas en Fa mayor y una flauta suave.
- **Escena 08 — musgo y gotas** (`04.wav`): goteo tras la lluvia hecho solo de
  gotas tonales con ataque suave (sin ráfagas de ruido), arroyo lejano, brisa
  grave, kalimba en Mi menor y pad cálido.
- **Síntesis base:** `wind` 0.50, `leaves` 0.55, `birds` 0.35, `rustle` 0.45,
  `brightness` 0.55.

### 6.15 Noche · `noche`

- **Sensación:** noche quieta, con grillos, un búho y luciérnagas bajo la luna.
- **Visual:** luna en la esquina superior derecha, 140 estrellas, colinas en
  silueta, 36 luciérnagas y una estrella fugaz cada 8–16 s.
- **Escena 01 — noche quieta:** siete llamadas de grillos, una capa secundaria
  más lejana, aire mínimo y uno o dos búhos.
- **Escena 02 — campo:** dieciocho llamadas principales, nueve secundarias y un
  búho.
- **Escena 03 — noche profunda:** cuatro llamadas, dos búhos y un drone grave
  más presente.
- **Escena 04 — noche de verano en el campo:** coro lejano de dieciséis grillos,
  un autillo regular cada ~2,5 s con una pausa y otro autillo lejano que
  responde.
- **Escena 05 — cárabo en el bosque:** dos cantos de cárabo macho (ulular y
  trémolo), dos «ke-wick» de la hembra, grillos y viento en las hojas, con
  reverb de bosque.
- **Escena 06 — noche junto al lago:** cuatro sapos parteros con su nota de
  campanita, coros de ranitas lejanas, grillos y agua que lame la orilla.
- **Escena 07 — noche estrellada** (`03.wav`): coro lejano de grillos, brisa,
  pad cálido en Re♭ mayor y vibráfono suave.
- **Escena 08 — nocturno junto al lago** (`04.wav`): agua en la orilla, grillos
  lejanos, nocturno de piano en Si menor y cuerdas.
- **Síntesis base:** `crickets` 0.55, `owl` 0.35, `wind` 0.30, `drone` 0.40,
  `brightness` 0.40.

### 6.16 Burbujas · `burbujas`

- **Sensación:** baño de espuma, con burbujas que suben y estallan en agua
  cálida.
- **Visual:** 34 burbujas de tres tonos, 70 motas de espuma en la superficie y
  tres haces de luz que atraviesan el agua.
- **Escena 01 — baño:** unas 35 burbujas grandes, cuatro pops y agua cálida.
- **Escena 02 — efervescencia:** unas 77 burbujas pequeñas, veinte pops y más
  fizz; suena chispeante.
- **Escena 03 — burbujas profundas:** unas 18 burbujas graves y lentas, seis
  pops y cuatro golpes profundos.
- **Escena 04 — baño de espuma:** crepitar de espuma, pops agudos, tres
  chapoteos con burbujas y un grifo que gotea cada ~3,3 s, en un baño alicatado.
- **Escena 05 — burbujeo bajo el agua:** burbujeo grave (120–700 Hz) a ráfagas,
  zumbido y movimiento del agua, todo por debajo de 1,8 kHz.
- **Escena 06 — acuario:** corriente de burbujas de un aireador, pops en la
  superficie y el retorno del filtro.
- **Escena 07 — burbujas y caja de música** (`03.wav`): burbujeo suave y cálido,
  caja de música (Fa–Sol–Mim–Lam) y pad.
- **Escena 08 — acuario sereno** (`04.wav`): aireador y filtro, pad Si♭ y
  vibráfono.
- **Síntesis base:** `bubbles` 0.55, `pops` 0.50, `water` 0.50, `fizz` 0.40,
  `brightness` 0.50.

---

## 7. Laboratorio · editor de música ambiental

> **Estado:** vigente desde la versión 4.0. Sustituye al mezclador de ambientes
> anterior (7.16). Las pruebas del motor están en `scripts/test-lab.mjs`.

### 7.1 Propósito

El modo **lab** es un entorno de trabajo para componer, desde cero, temas de
música ambiental sintética: notas sostenidas, notas puntuales, ruidos y
simulaciones de naturaleza (bichos, pájaros, agua…), colocados en una línea de
tiempo, escuchados en directo y exportados como **WAV generado en el propio
navegador**.

Principios:

- **Desacoplado de la app.** El motor del laboratorio (`lab/engine/`) no
  importa nada de `src/` ni de los generadores de escenas (`synth.js`,
  `dsp.js`, `sources.js`, `soundscapes.js`) y tiene sus propios instrumentos.
  Puede **portar** algoritmos de los generadores (copiándolos y adaptándolos),
  nunca importarlos: cambiar uno no puede alterar el otro. La única excepción
  es **retocar una pista de sen** (7.17): un Worker propio,
  `lab/scene-worker.js`, usa `scripts/lib/published.js` para calcular las capas
  de una pista publicada (o leer su WAV) y el motor solo recibe ese audio. Solo
  comparte además el favicon y la estética oscura, con CSS propio.
- **Un solo motor.** El mismo código JavaScript produce la escucha en directo,
  el WAV que se descarga desde el navegador y el WAV que se genera en local con
  Node. No hay una versión “aproximada” para escuchar y otra para exportar.
- **Determinista.** Un mismo proyecto, con la misma versión del motor y las
  mismas opciones de exportación, produce siempre el mismo audio (garantías
  exactas en 7.7.6).
- **Local.** Sin servidor, sin dependencias, sin build, sin peticiones a
  terceros. Nada sale del navegador.
- **Se trabaja de oído.** Cualquier cambio se oye en menos de 1 s mientras el
  tema suena.

No objetivos:

- No es un DAW general: no graba audio, no admite plugins ni MIDI externo y no
  importa samples arbitrarios (las únicas capas de audio son las de las pistas
  de sen, 7.17, que se recalculan y no se guardan en el proyecto).
- Sin partitura ni notación musical clásica.
- Sin cuentas, nube ni colaboración.
- No publica temas en la app. Sí puede exportar un WAV con el formato exacto de
  una pista de `sen` (7.8.1), para que el usuario lo copie a mano en
  `assets/audio/<id>/` si quiere.

### 7.2 Acceso y requisitos

- URL: **`/lab/`**. Página independiente; la app no enlaza al laboratorio
  desde el menú (se mantiene la sobriedad) y el laboratorio enlaza de vuelta a
  `/` con “← sen”.
- Diseñado para **escritorio** (≥ 1024 px). En tablet horizontal funciona
  completo. Por debajo de 900 px se usa el modo compacto (7.5.6).
- Requisitos del navegador: Web Audio, `AudioWorklet`, Web Workers de tipo
  módulo (`new Worker(url, { type: 'module' })`), `structuredClone` y contexto
  seguro (HTTPS o `localhost`). Chrome/Edge ≥ 98, Firefox ≥ 114 y Safari ≥ 15,4.
- Si falta algún requisito se muestra un aviso claro con lo que falta y no se
  carga el editor.

### 7.3 Modelo

#### 7.3.1 Conceptos

- **Tema** (proyecto): nombre, duración, modo de final, tonalidad, afinación,
  tempo opcional, semilla, pistas y bus maestro. Es un documento JSON pequeño
  (KB), esquema `sen-lab/3` (7.10).
- **Pista = instrumento.** Cada pista tiene una **familia**, un
  **instrumento** de esa familia y sus **parámetros de timbre**, además de la
  mezcla (volumen, panorama, envíos, silencio y solo).
- **Elemento** = cuándo y qué suena en una pista. Los elementos tienen inicio,
  duración, nivel, fundidos y el contenido propio de su tipo (notas, densidad,
  frase…). Pueden solaparse dentro de una pista: se suman.

#### 7.3.2 Familias

| Familia | Etiqueta en la UI | Qué es | Tipos de elemento |
| --- | --- | --- | --- |
| `sustain` | Notas sostenidas | Pads, drones, cuerdas, flauta, coros: tonos que duran lo que dura el elemento. | `tone` |
| `strike` | Notas puntuales | Campanas, cuencos, kalimba, piano, arpa, guitarra, vibráfono: golpes con decaimiento natural. | `hit`, `phrase`, `cloud` |
| `noise` | Ruidos | Ruido de color filtrado y con movimiento (aire, rumor, oleaje abstracto). | `span` |
| `nature` | Simulaciones | Generadores estocásticos de naturaleza: grillos, pájaros, ranas, gotas, lluvia, arroyo, olas, viento, fuego, campanillas. | `span` |
| `layer` | Capas de pistas de sen | Una capa de una pista publicada de la app, en bucle (7.17). No está en la biblioteca. | `clip` |

#### 7.3.3 Tipos de elemento

- **`tone`** (sostenidas): de 1 a 8 notas simultáneas (nota, acorde o
  cluster). La envolvente del sonido **es** la del elemento: `fadeIn` actúa como
  ataque y `fadeOut` como relajación, ambos dentro de la duración. Lo que se ve
  es lo que suena.
- **`hit`** (puntuales): un golpe en un instante, con nota, velocidad y nivel.
  Su cola (decaimiento) se dibuja rayada después del golpe.
- **`phrase`** (puntuales): un patrón de golpes `{ t, note, v }` de longitud
  propia que se repite hasta llenar el elemento. Se edita en una mini rejilla
  de tipo *piano roll* dentro del inspector.
- **`cloud`** (puntuales): **nube generativa** de notas. Elige notas de la
  escala del tema (o de una lista propia) dentro de un registro, con:
  - `density`: notas por minuto (1–120).
  - `timing`: 0 regular, 1 completamente aleatorio (Poisson).
  - `motion`: 0 saltos libres, 1 pasos cercanos (paseo por los grados).
  - `gravity`: preferencia por tónica y quinta (0–1).
  - `chord`: probabilidad de que caigan 2–3 notas juntas (0–1).
  - `velocity`: rango `[min, max]`.
  - `seed`: semilla propia; “Aleatorizar” la incrementa.
- **`span`** (ruidos y simulaciones): un tramo de actividad. En simulaciones,
  además del nivel, define la **densidad** (0–1) de la actividad.
- **`clip`** (capas de pistas de sen): un tramo de la capa, que se repite en
  bucle; `offset` es el punto de la capa (s) que suena al empezar el elemento.
  Al dividirlo, la segunda parte avanza su `offset`.

Todos los elementos con duración (`tone`, `phrase`, `cloud`, `span`, `clip`) admiten
una **curva de intensidad**: lista de puntos `[x, y]` con `x` relativo a la
duración (0–1) e `y` en 0–1. En `tone`, `phrase` y los `span` de ruido escala
el nivel; en `cloud` y los `span` de simulaciones escala la densidad (y, más
suavemente, el nivel). Hay curvas
predefinidas: **plana**, **crece**, **decrece**, **respira** (sube y baja una
vez) y **olas** (n ciclos); sus ids son `plana`, `crece`, `decrece`, `respira`
y `olas:<n>`.

#### 7.3.4 Tiempo, tono y azar

- **Tiempo:** el modelo trabaja en segundos con resolución de 1 ms. La rejilla
  de ajuste puede ser libre, 0,1 s, 0,25 s, 0,5 s o 1 s; si el tema tiene tempo
  (30–160 BPM, compás de 2, 3, 4 o 6 pulsos), también pulsos y compases. El
  tempo es opcional: la música ambiental a menudo no lo usa.
- **Tonalidad:** raíz (Do…Si) y escala: mayor, menor natural, dórica, lidia,
  mixolidia, pentatónica mayor, pentatónica menor, *hirajoshi*, tonos enteros o
  cromática (ids `mayor`, `menor`, `dorica`, `lidia`, `mixolidia`,
  `pentatonica-mayor`, `pentatonica-menor`, `hirajoshi`, `tonos-enteros`,
  `cromatica`). Afinación `A4` entre 415 y 466 Hz (440 por defecto; 432 es una
  opción habitual).
- **Notas:** se guardan en notación científica anglosajona (`D3`, `F#4`) o como
  frecuencia libre `{ "hz": 136.1 }` para tonos fuera de la escala. La UI las
  muestra en notación latina (`Re3`) con opción de cambiar a anglosajona.
- **Cambiar la tonalidad** no mueve las notas escritas, salvo que se elija
  “Transponer todo”. Las nubes generativas sí siguen la nueva escala.
- **Semillas:** el tema tiene una semilla (`seed`, texto) y cada elemento con
  azar su propia semilla entera. La semilla efectiva de un elemento es
  `hash(tema.seed, pista.id, elemento.id, elemento.seed)`, de modo que **editar
  un elemento no cambia el azar de los demás**. Cambiar la semilla del tema
  re-tira todo.

#### 7.3.5 Final del tema

- **`tail`** (con cola): suena la duración del tema y después las colas
  naturales (golpes, reverb, eco) hasta caer por debajo de −90 dBFS, con un
  máximo de 20 s extra.
- **`cut`** (duración exacta): el archivo dura exactamente la duración del tema,
  con un fundido de salida configurable (0–30 s, 4 s por defecto).
- **`loop`** (bucle sin costura): el archivo dura exactamente la duración del
  tema y su final enlaza con su principio sin clic ni salto de nivel. Lo que
  sobresale del final (un elemento que cruza el borde, una cola de reverb) se
  oye al principio. En la línea de tiempo la parte que se pliega se dibuja
  rayada al inicio. Duración mínima del bucle: 10 s. Detalle técnico en 7.7.5.

### 7.4 Catálogo de instrumentos

Todos los parámetros tienen un valor por defecto que suena bien por sí solo.
Rangos entre paréntesis; unidades en 7.10.2.

#### 7.4.1 Notas sostenidas (`sustain`)

| Instrumento | Nombre | Síntesis |
| --- | --- | --- |
| `pad` | Pad | Aditiva: parciales armónicos con caída configurable y varias voces desafinadas. |
| `drone` | Drone | Pocas parciales graves, batidos lentos entre voces y subgrave opcional. |
| `cuerdas` | Cuerdas | Diente de sierra limitado en banda por voz, paso bajo lento y vibrato suave. |
| `flauta` | Flauta suave | Tabla casi senoidal (armónicos 1 : 0,14 : 0,05 : 0,015), soplo (ruido en banda en torno al tercer armónico) y vibrato. Una voz; su elemento por defecto dura 2 s con ataque 0,12 s y relajación 0,45 s. |
| `coro` | Coro | Fuente rica con tres formantes vocales interpolables (a–o–u). |
| `vidrio` | Vidrio | Parciales inarmónicos sostenidos, brillo frío. |
| `seno` | Seno | Una sinusoide pura, para graves y tonos de prueba. |

Parámetros comunes: parciales (1–32), caída de armónicos (0,5–3), voces (1–7),
desafinación entre voces (0–30 cents), deriva lenta de afinación (0–20 cents),
filtro (paso bajo, alto o banda; 40–18 000 Hz; Q 0,5–12), vibrato
(0–50 cents, 0,05–8 Hz), trémolo (0–1, 0,05–8 Hz), barrido de filtro
(0–4 octavas, 0,01–1 Hz) y ancho estéreo (0–1). Propios: `drone` subgrave
(0–1) y batido (0–2 Hz); `coro` vocal (0–1); `vidrio` inarmonicidad (0–1).
`flauta` usa solo vibrato, deriva, soplo (0–1), corte del filtro, trémolo y
ancho.

#### 7.4.2 Notas puntuales (`strike`)

| Instrumento | Nombre | Síntesis |
| --- | --- | --- |
| `campana` | Campana | Modal con parciales de campana y golpe metálico. |
| `cuenco` | Cuenco | Modal inarmónico con pares de modos que baten. |
| `kalimba` | Kalimba | Lengüeta modal con ataque blando y cuerpo de madera. |
| `cajaMusica` | Caja de música | Púa metálica brillante, decaimiento corto. |
| `celesta` | Celesta | Láminas metálicas suaves con resonador. |
| `marimba` | Marimba | Láminas de madera con resonador tubular. |
| `vibrafono` | Vibráfono | Modal 1 : 4 : 10 con baqueta blanda y trémolo común (motor) de profundidad y velocidad ajustables. |
| `piano` | Piano de fieltro | Modal armónico ligeramente estirado; cada armónico tiene una parte breve (golpe) y otra larga; martillo blando. |
| `arpa` | Arpa | Cuerda modal pulsada cerca del centro: amplitudes sen(π·h·0,2)/h y agudos que se apagan antes. |
| `guitarra` | Guitarra de nailon | Cuerda modal pulsada cerca del puente (p = 0,14), más corta y cálida. |
| `pulsada` | Cuerda pulsada | Karplus-Strong, entre arpa y guitarra suave. |
| `gotaTonal` | Gota tonal | Burbuja de Minnaert afinada (el tono sube al final). |

Parámetros comunes: decaimiento (0,2–30 s), brillo (0–1), dureza del golpe
(0–1), inarmonicidad (0–1), batido (0–3 Hz), curva de velocidad (0–1) y ancho
estéreo (0–1); el vibráfono cambia inarmonicidad y batido por trémolo (0–1,
0,05–8 Hz). Polifonía: 16 golpes simultáneos por pista y 64 en total; al
superarla se corta el más antiguo con un fundido de 10 ms.

Un elemento nuevo de una pista de notas puntuales es una **nube**; el selector
«Tipo» del inspector lo convierte en golpe o frase conservando inicio,
duración y nivel.

#### 7.4.3 Ruidos (`noise`)

Un único instrumento, `ruido`, con:

- Color: blanco, rosa o marrón.
- Filtro: paso bajo, paso alto o banda; corte y Q.
- Movimiento:
  - **ráfagas**: modulación aleatoria suave (0,01–2 Hz, profundidad 0–1) sobre
    el nivel, el filtro o ambos;
  - **oleaje**: modulación periódica de nivel y filtro (periodo 3–20 s,
    asimetría subida/bajada).
- Estéreo: correlación entre canales (0 mono, 1 totalmente decorrelado).

#### 7.4.4 Simulaciones (`nature`)

| Instrumento | Nombre | Parámetros propios |
| --- | --- | --- |
| `grillo` | Grillos | individuos (1–24), registro (2–6 kHz), llamadas por segundo, pulsos por llamada (1–8), sincronía entre individuos (0–1). |
| `cigarra` | Cigarras | individuos (1–6), registro (3–7 kHz), duración de tandas y de pausas. |
| `pajaro` | Pájaros | especie: genérico, mirlo, petirrojo, carbonero, pinzón, cuco, tórtola, autillo o cárabo; individuos (1–8); frases por minuto. El genérico añade registro, sílabas por frase y forma (silbido, trino, gorjeo). |
| `rana` | Ranas | especie: sapo partero, ranita o croar grave; individuos (1–12). |
| `gotas` | Gotas | superficie (agua, hoja, cristal, piedra), gotas por segundo (0,1–200), registro. |
| `lluvia` | Lluvia | intensidad (50–3000 impactos/s), superficie (hojas, tejado, cristal, agua, lona). |
| `arroyo` | Arroyo | caudal (0–1), fuentes de burbujeo (1–24), registro. |
| `olas` | Olas | periodo (4–20 s), tamaño, espuma (0–1), guijarros (0–1). |
| `viento` | Viento | fuerza, racheo, aullido (0–1) y su afinación, hojas (0–1). |
| `fuego` | Fuego | tamaño, chasquidos por segundo, estallidos, siseo. |
| `campanillas` | Campanillas | material (metal, bambú, vidrio), tubos (3–8, afinados a la escala del tema), actividad del viento. |

Parámetros comunes a todas las simulaciones:

- **distancia** (0 cerca – 1 lejos): baja el nivel, quita agudos y aumenta el
  envío a reverb, todo a la vez;
- **posición** (panorama) y **dispersión** estéreo (0–1) de los individuos;
- **variación** (0–1): cuánto cambia cada evento respecto al anterior;
- la **densidad** del elemento `span` y su curva de intensidad.

Los modelos se implementan en el motor del laboratorio. Se pueden portar ideas
de `scripts/lib/sources.js` (burbujas de Minnaert, cantos por especie, grillos con
portadora casi pura…), pero el código vive y evoluciona por separado.

#### 7.4.5 Bus maestro

- **Reverb** global (envío por pista 0–1): tamaño (0–1), decaimiento
  (0,3–12 s), amortiguación (1–16 kHz), predelay (0–200 ms).
- **Eco** global (envío por pista 0–1): tiempo (20–2000 ms o sincronizado al
  tempo), realimentación (0–0,9), tono (filtro en la realimentación), ping-pong.
- **Ecualización:** corte de graves (20–200 Hz), corte de agudos
  (2–20 kHz) e inclinación (±6 dB). `eq.on` (por defecto `true`) la desactiva
  entera; los proyectos de pistas de sen la traen desactivada.
- **Volumen** y **techo** del limitador (−6 a −0,1 dBFS). En la exportación el
  techo se mide como **pico real** (sobremuestreo 4×).

#### 7.4.6 Automatización por pista

Cada pista puede automatizar a lo largo del tema su **volumen**, **panorama**,
**envío a reverb**, **envío a eco** y un **filtro paso bajo de pista**
(80–20 000 Hz). Son listas de puntos `[segundos, valor]` con interpolación
lineal (logarítmica en el filtro); antes del primer punto y después del último
se mantiene el valor. Mientras una automatización tiene puntos, sustituye al
valor fijo de la mezcla. En bucle se repite en cada vuelta. Hasta 512 puntos
por parámetro.

### 7.5 Interfaz

#### 7.5.1 Disposición (escritorio)

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ ← sen   Estanque al anochecer ✎     guardado ·  ↶  ↷   Abrir   Exportar │
├──────────────────────────────────────────────────────────────────────────┤
│ ▶  ■   01:12,4 / 03:00   ⟲ región   rejilla 0,5 s   zoom −/+   vol escucha │
├────────────┬───────────────────────────────────────────────┬─────────────┤
│ Biblioteca │ 0:00     0:30     1:00     1:30     2:00   ▼   │ Inspector   │
│            │                                     cabezal   │             │
│ Sostenidas │ Pad      M S ▮▮ │████████ Re3 La3 Mi4 ███████ │ (pista o    │
│ Puntuales  │ Campana  M S ▮▮ │   · ·  ·░░ nube ░░·  ·   ·  │  elemento   │
│ Ruidos     │ Grillos  M S ▮▮ │        ▒▒▒▒▒▒ crece ▒▒▒▒▒▒▒ │  seleccio-  │
│ Simulac.   │ Aire     M S ▮▮ │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  nado)      │
│ Plantillas │ + pista                                       │             │
│            │ Maestro  reverb · eco · eq · techo            │             │
├────────────┴───────────────────────────────────────────────┴─────────────┤
│ nivel ▮▮▮▮▮▯ −14 LUFS · pico −2,1 · motor 18 % · Do mayor · sin tempo     │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Cabecera:** volver, nombre editable del tema, estado de guardado, enlace
  **?** a las instrucciones (`lab/guia.html`, en otra pestaña),
  deshacer/rehacer, abrir y exportar.
- **Transporte:** reproducir/pausa, detener (vuelve al inicio), posición y
  duración (`mm:ss,d`), región de escucha en bucle, rejilla, zoom y volumen de
  escucha (no afecta a la exportación).
- **Biblioteca:** «Pistas de sen» (7.17), las cuatro familias con sus
  instrumentos y las plantillas. Cada instrumento tiene un botón ▶ que suena
  3 s de muestra sin añadir nada.
- **Línea de tiempo:** una fila por pista, con cabecera (nombre, color,
  silencio, solo, **volumen**, medidor y una «A» si tiene automatización) y sus
  elementos.
  Cada elemento muestra su envolvente (fundidos y curva), los golpes de las
  nubes y frases como puntos y una **forma de onda resumida** que calcula en
  segundo plano un Worker de vistas (elementos de hasta 10 min). La
  automatización de la pista se dibuja como una línea discontinua. La regla
  admite clic para mover el cabezal y arrastre para marcar la región de
  escucha. Zoom con −/+ o con Cmd/Ctrl + rueda.
- **Inspector:** controles de la pista o del elemento seleccionado, del bus
  maestro o del tema (sin selección). En las notas incluye un mini teclado de
  dos octavas que suena al pulsar.
- **Pie:** medidor maestro (pico y sonoridad a corto plazo), carga del motor,
  tonalidad y tempo.

Estética: la de `sen` (fondo casi negro, tipografía sobria, color por pista),
sin animaciones de fondo que compitan con el trabajo.

#### 7.5.2 Interacciones

- **Añadir:** arrastrar un instrumento desde la biblioteca a la línea de tiempo
  crea una pista con un elemento por defecto en ese instante. Un clic en el
  instrumento hace lo mismo en el cabezal. Doble clic en un hueco de una pista
  existente crea un elemento por defecto de esa pista.
- **Editar elementos:** arrastrar para mover; bordes para cambiar la duración;
  asas de las esquinas superiores para los fundidos; `Alt` + arrastrar
  duplica; `S` divide en el cabezal; `Supr` borra. Selección múltiple con
  `Mayús` o marco. Copiar, cortar y pegar en el cabezal. Ajuste magnético a la
  rejilla y a los bordes de otros elementos (`Mayús` lo desactiva).
- **Pistas:** en la cabecera, silencio, solo y volumen (deslizador de −60 a
  +6 dB; doble clic vuelve al valor por defecto de la familia; si la pista
  automatiza el volumen, el deslizador se desactiva). En el inspector,
  renombrar, cambiar color, duplicar y borrar. Máximo 32. El orden de las
  pistas es el de creación (no se reordenan ni se pliegan).
- **Inspector:** deslizadores con valor numérico editable; doble clic devuelve
  el valor por defecto; la rueda con `Mayús` hace ajuste fino. Los generadores
  tienen **Aleatorizar** (nueva semilla) y todos los elementos **Escuchar solo
  esto** (solo temporal mientras se mantiene pulsado).
- **Arrastrar un archivo** `.sen.json` o un WAV exportado por el laboratorio
  (7.8.1) a la ventana lo abre. Un archivo **MIDI** (`.mid`) se importa en el
  tema actual (7.8.5).
- **Automatización:** en el inspector de la pista, sección «Automatización»:
  se elige el parámetro y se dibujan puntos sobre la duración del tema.

#### 7.5.3 Teclado

| Atajo | Acción |
| --- | --- |
| `Espacio` | Reproducir / pausa |
| `Inicio` | Cabezal al principio |
| `←` / `→` | Mover el cabezal 1 s (o el elemento seleccionado 0,1 s; `Mayús`: 1 s) |
| `Alt` + `←` / `→` | Cambiar la duración del elemento seleccionado |
| `Cmd/Ctrl` + `Z` / `Mayús` + `Cmd/Ctrl` + `Z` | Deshacer / rehacer |
| `Cmd/Ctrl` + `C`, `X`, `V`, `D` | Copiar, cortar, pegar, duplicar |
| `Supr` / `Retroceso` | Borrar selección |
| `S` | Dividir en el cabezal |
| `M` / `Mayús` + `S` | Silenciar / solo de la pista seleccionada |
| `L` | Activar la región de escucha en bucle |
| `+` / `−` | Zoom |
| `Cmd/Ctrl` + `S` | Descargar el proyecto `.sen.json` |
| `Cmd/Ctrl` + `E` | Abrir el diálogo de exportación |
| `?` | Abrir las instrucciones en otra pestaña |
| `Escape` | Cerrar diálogo o deseleccionar |

Los atajos de una letra no actúan mientras el foco está en un campo de texto.

#### 7.5.4 Plantillas

Al abrir el laboratorio sin proyecto guardado se ofrece empezar con:

- **Vacío:** 3 min, Do mayor, sin pistas.
- **Drone y campanas:** drone en Re con quinta, nube de campanas en pentatónica
  mayor y aire.
- **Noche en el estanque:** grillos, sapos parteros, gotas sobre agua y pad
  grave en La menor.
- **Amanecer:** pad que crece, pájaros (mirlo y petirrojo), arroyo y kalimba.
- **Espacio profundo:** drone subgrave, vidrio, ruido marrón con oleaje y eco
  largo.

Las plantillas son proyectos `sen-lab/3` incluidos en `lab/templates/`,
compuestos con el motor del laboratorio; no derivan de los ambientes de la app.

#### 7.5.5 Ejemplo de flujo

1. Abrir `/lab/` y elegir **Vacío**. Poner la tonalidad en Re pentatónica mayor.
2. Arrastrar **Drone** al inicio; en el inspector, notas `D2` y `A2`, fundido
   de entrada de 10 s.
3. Arrastrar **Campana** a 0:20 (crea una **nube**): 6 notas por minuto,
   registro `Re4`–`Re6`, pasos cercanos 0,7.
4. Arrastrar **Grillos** a 0:30 con curva **crece** y distancia 0,6.
5. Marcar una región de 0:20 a 1:00 y escucharla en bucle mientras se ajusta.
6. **Exportar → WAV**, preajuste **Estudio**, final **bucle sin costura**.

#### 7.5.6 Modo compacto (< 900 px)

- Sin línea de tiempo arrastrable: las pistas se listan en vertical y cada
  elemento es una tarjeta con inicio, duración y nivel editables con campos
  numéricos.
- El inspector se abre como hoja inferior; el transporte queda fijo abajo.
- Escucha, edición de parámetros, plantillas, abrir y exportar funcionan igual.

#### 7.5.7 Accesibilidad

- Todos los controles son elementos nativos (`button`, `input`, `select`) con
  nombre accesible.
- Cada elemento de la línea de tiempo es un botón enfocable con un
  `aria-label` completo, por ejemplo: “Pad, Re3 La3 Mi4, de 0:12 a 1:40”.
  Se mueve y redimensiona con el teclado (7.5.3).
- Región `aria-live="polite"` para reproducción, guardado, errores y progreso
  de exportación (cada 10 %).
- Foco visible con el color de la pista. Contraste suficiente sobre fondo
  oscuro.
- Con `prefers-reduced-motion` los medidores se actualizan a 4 fps y no hay
  transiciones decorativas.

### 7.6 Escucha en directo

#### 7.6.1 Arquitectura

```text
UI (hilo principal) ──proyecto + revisión──▶ Worker de render (lab/engine)
                                               │ bloques Float32 L/R
                                               ▼ (MessageChannel directo)
                                 AudioWorkletNode "lab-player" ──▶ salida
                                               │ nivel, posición, faltas
UI ◀───────────────────────────────────────────┘
```

- El **Worker** compila el proyecto y renderiza bloques de 50 ms por delante
  del cabezal, con 0,25 s en cola como objetivo. El worklet confirma cada bloque
  reproducido y el Worker rellena la cola.
- Los bloques viajan del Worker al **AudioWorklet** por un `MessageChannel`
  directo (transferibles, sin pasar por el hilo principal). El worklet los
  reproduce en cola, sin huecos por construcción, y hace un fundido de 5 ms al
  vaciar la cola (pausa o salto).
- No se usa `SharedArrayBuffer`: exige cabeceras COOP/COEP que GitHub Pages no
  permite.
- El `AudioContext` se crea o reanuda dentro del gesto del usuario (iOS).
- La audición de la biblioteca y del mini teclado se renderiza aparte en el
  mismo Worker y suena con un `AudioBufferSourceNode`.

#### 7.6.2 Edición mientras suena

- Cada cambio genera una nueva **revisión** del proyecto (los proyectos son
  inmutables). Los deslizadores envían como mucho una revisión cada 60 ms.
- El Worker recompila solo las pistas afectadas (caché por pista) y las
  sustituye en caliente con un fundido cruzado de 30 ms; el resto sigue sonando
  sin cortes. Como la cola es de 0,25 s, el cambio se oye en ≈ 0,3 s.
- Silencio, solo, volumen, panorama, envíos y automatización se aplican en el
  mezclador sin recompilar, con un suavizado de 15 ms.
- Los cambios del bus maestro se aplican en sitio; los tiempos de reverb y eco
  se deslizan hacia su nuevo valor (efecto de cinta, sin cortes).

#### 7.6.3 Saltos, región y calidad

- Al mover el cabezal el Worker renderiza en silencio un **precalentamiento**
  (el mayor entre 2 s y la reverb, con tope de 4 s) para que filtros y reverb
  lleguen con estado, y después reproduce. Tras un salto la escucha puede
  diferir de forma inaudible de la exportación (las colas anteriores al
  precalentamiento no existen); la exportación siempre se calcula desde el
  principio.
- La región de escucha en bucle (y el tema completo con final `loop`) se
  reproduce de forma continua: al llegar al final, el Worker prepara un render
  nuevo desde el inicio con precalentamiento y lo funde 30 ms con la cola del
  anterior, de modo que el salto no deja hueco.
- La escucha usa la frecuencia del `AudioContext`. Si el motor no alcanza
  1,5× tiempo real durante 3 s seguidos, baja a media frecuencia (22,05 o
  24 kHz) y lo indica en el pie (“escucha en calidad reducida”). La
  exportación no se ve afectada.
- Si se vacía la cola del worklet suena silencio, se anota la falta y el pie
  muestra la carga del motor en rojo.

#### 7.6.4 Medición

El Worker mide en cada bloque el pico por canal, el pico de cada pista y la
sonoridad a corto plazo (ventana de 3 s, K-weighting); el worklet entrega esas
medidas a la UI cuando empieza a sonar el bloque, así que van sincronizadas con
lo que se oye. La UI las pinta a 15 fps (4 fps con movimiento reducido). El
pico se marca en rojo por encima de −0,2 dBFS.

### 7.7 Motor de síntesis (`lab/engine/`)

#### 7.7.1 Requisitos

- Módulos ES puros, sin DOM ni Web Audio ni dependencias: funcionan igual en
  un Worker del navegador y en Node ≥ 18.
- Frecuencia de muestreo parametrizable (22 050, 24 000, 44 100 o 48 000 Hz).
- Estéreo interno siempre. La salida mono es `(L + R) / 2`.
- Render por bloques de longitud arbitraria con estado continuo entre bloques.
- Búferes `Float32Array`; fases y acumuladores en `Float64` para que un drone
  de 30 min no derive.
- Versión del motor (`ENGINE_VERSION`, actualmente `sen-synth/2`). Cualquier
  cambio que altere la salida de proyectos existentes sube la versión. La 2
  corrigió el retardo del limitador de exportación (los WAV de la 1 salían
  desplazados una muestra).

#### 7.7.2 API

```js
import { compile, createRenderer, renderToWav, ENGINE_VERSION } from './engine/index.js';

const plan = compile(project, { sampleRate: 48000 });       // planifica
const r = createRenderer(plan, { from: 0, warmup: 2 });     // estado de render
const { L, R } = r.render(12000);                           // siguiente bloque
r.update(compile(edited, { sampleRate: 48000, cache }));    // cambio en caliente
const { parts, stats } = await renderToWav(project, options, { onProgress, signal, samples }); // 7.8.1
```

`samples` (en `compile` y `renderToWav`) es el audio de las capas de pistas de
sen, `{ 'ambiente/NN#capa': { rate, data } }` o un `Map` equivalente (7.17).
Sin él, esas pistas no suenan y el plan lleva un aviso.

- `compile` valida el proyecto, resuelve notas a frecuencias y **planifica**
  todo el azar: para cada pista produce una lista ordenada de voces (inicio,
  fin, parámetros y semilla de voz). El render solo recorre las voces activas
  en cada bloque.
- `createRenderer` admite `from` (segundos), `warmup` (precalentamiento),
  `limiter` y `meter`. `update(plan)` sustituye solo las pistas cuyo plan ha
  cambiado.
- `auditionProject(project, track, { note, seconds })` crea el mini proyecto de
  las audiciones.
- `renderToWav` es la exportación completa (7.8.1); se usa igual en el Worker
  de exportación y en `scripts/render-lab.mjs`.

#### 7.7.3 Azar

Dos tipos de azar, ambos sin estado global:

- **Planificación** (cuándo canta cada pájaro, qué nota toca la nube…): RNG
  secuencial `mulberry32` por elemento, con la semilla efectiva de 7.3.4. Se
  resuelve entero en `compile`, así que es idéntico a cualquier frecuencia de
  muestreo y en cualquier tamaño de bloque.
- **Señal** (ruido por muestra): RNG **basado en contador**,
  `hash32(semillaVoz, índiceDeMuestra)` con operaciones enteras (`Math.imul`).
  Permite saltar a cualquier punto de una voz sin recorrer las muestras
  anteriores.

#### 7.7.4 Bloques de síntesis

- **Osciladores:** aditivos con limitación de banda (no se generan parciales
  por encima de 0,45 × fs), diente de sierra y pulso por suma de armónicos;
  fase inicial de cada voz desde su semilla.
- **Filtros:** SVF de estado (paso bajo, alto, banda) modulables por muestra;
  biquads para EQ y *shelving*.
- **Envolventes:** fundidos con curva exponencial; ADSR interno para los golpes.
- **Moduladores:** LFO senoidales y ruido de valor suavizado (para ráfagas y
  deriva), con la fase referida al inicio de la voz.
- **Modal:** suma de modos sinusoidales amortiguados para campanas, cuencos,
  kalimba, celesta, marimba, vibráfono (con trémolo común), piano de fieltro,
  arpa y guitarra; ráfaga de ruido filtrada para el golpe.
- **Capa de audio:** lectura en bucle de un búfer mono con interpolación
  lineal y la envolvente del elemento (exacta a la misma frecuencia).
- **Karplus-Strong** para la cuerda pulsada, con afinación fraccional.
- **Ruido de color:** blanco, rosa (filtro de Kellet) y marrón (integrador con
  fuga).
- **Espacio:** panorama de potencia constante, ancho por decorrelación,
  distancia (nivel + paso bajo + envío) y reverb FDN de 8 líneas estéreo con
  difusores y amortiguación.
- **Eco:** línea estéreo con filtro en la realimentación y ping-pong.
- **Maestro:** EQ, limitador con anticipación de 5 ms y techo configurable. En
  la exportación la detección es de **pico real** (interpolación 4× con sinc
  enventanado de 8 tomas por fase).
- **Pista:** filtro paso bajo automatizable y, en simulaciones, la distancia
  (paso bajo, nivel y más envío a reverb).

Las simulaciones combinan estos bloques en eventos (sílabas con contorno de
tono, chirridos de grillo, burbujas de Minnaert, impactos filtrados…).

#### 7.7.5 Bucle sin costura

Con final `loop` y duración `L`:

1. Los elementos y eventos se planifican de forma **periódica**: lo que pasa
   de `L` se pliega al principio, y los ciclos sucesivos repiten exactamente
   los mismos eventos con las mismas semillas.
2. Las modulaciones de tiempo absoluto del bus maestro se ajustan a un número
   entero de ciclos por bucle; las de voz están referidas al inicio de la voz.
   Las voces sostenidas que cubren el bucle completo sin fundidos se tratan
   como **permanentes** y su frecuencia se ajusta a un número entero de ciclos
   por bucle (el inspector muestra la frecuencia real si cambia más de
   0,5 cents).
3. Se renderizan **de dos a cuatro ciclos seguidos** (según la cola más larga:
   elementos que sobresalen, reverb y eco) y se exporta el último. El
   limitador se alimenta con el principio del ciclo siguiente, también
   planificado, para que su anticipación vea lo mismo que verá en la costura. Como todo es periódico y la memoria de filtros,
   reverb y eco cabe en un ciclo, el final del ciclo exportado enlaza con su
   principio exactamente, sin crossfade.

El coste es 2–3× el de un render normal. No hay costura que tapar.

#### 7.7.6 Determinismo

- Mismo proyecto + misma `ENGINE_VERSION` + mismas opciones ⇒ mismo WAV **byte
  a byte en el mismo motor JavaScript**: Chrome, Edge y Node comparten V8, así
  que el WAV del navegador y el de `scripts/render-lab.mjs` son idénticos.
- Entre motores distintos (Safari con JavaScriptCore, Firefox con
  SpiderMonkey) las funciones `Math.sin`, `Math.exp` o `Math.pow` pueden diferir
  en el último bit. Ahí se garantiza equivalencia perceptual: diferencia
  ≤ −90 dBFS respecto a V8.
- El dither usa el RNG por contador con una semilla fija por exportación, así
  que también es reproducible.

#### 7.7.7 Presupuesto de rendimiento

Referencia: portátil de gama media de 2020, Chrome, 44,1 kHz estéreo.

| Proyecto | Velocidad mínima |
| --- | --- |
| Típico: 12 pistas, polifonía media | ≥ 10× tiempo real (medido: ≈ 18–20× en Node) |
| Máximo permitido (7.11) | ≥ 2× tiempo real |
| Compilación de un proyecto típico | ≤ 50 ms |
| Recompilación de una pista | ≤ 10 ms |

### 7.8 Exportación

**Sí se genera el WAV en el navegador.** Es la vía principal. El proyecto
`.sen.json` y el render local con Node existen para reeditar, versionar y
reproducir el tema fuera del navegador con el mismo motor.

#### 7.8.1 WAV desde el navegador

Diálogo **Exportar → WAV** con:

| Opción | Valores | Por defecto |
| --- | --- | --- |
| Preajuste | Estudio · CD · Escena para sen · Personalizado | Estudio |
| Frecuencia | 22 050 · 44 100 · 48 000 Hz | 48 000 |
| Resolución | 16 bits (dither TPDF) · 24 bits · 32 bits flotante | 24 |
| Canales | estéreo · mono | estéreo |
| Final | con cola · duración exacta con fundido · bucle sin costura | el del tema |
| Sonoridad | solo limitador · −25 · −24 · −23 · −18 · −16 · −14 LUFS integrados | −18 |
| Techo | −0,1 a −6 dBFS (pico real, sobremuestreo 4×) | −1 |
| Rango | tema completo · región de escucha | tema completo |

Preajustes:

- **Estudio:** 48 kHz, 24 bits, estéreo, −18 LUFS, techo −1 dBFS.
- **CD:** 44,1 kHz, 16 bits, estéreo, −16 LUFS, techo −1 dBFS.
- **Escena para sen:** 22,05 kHz, 16 bits, mono, bucle sin costura, −23 LUFS,
  techo −3 dBFS. Es el formato de las pistas de la app (8.5). En un proyecto de
  pista de sen usa la sonoridad de esa pista (−23, −24 o −25 LUFS) y el
  diálogo dice qué archivo de `assets/audio/` sustituir.

Proceso, en un Worker de exportación propio:

1. **Pasada de medida:** renderiza el tema completo y mide la sonoridad
   integrada (BS.1770-4: K-weighting a la frecuencia de exportación, puertas
   absoluta de −70 LUFS y relativa de −10 LU) sin guardar el audio.
2. **Pasada de escritura:** vuelve a renderizar (el motor es determinista),
   aplica la ganancia de normalización, el limitador al techo y el dither si
   hay 16 bits, y escribe el PCM en trozos de ~1 MB que se acumulan en un
   `Blob`. Nunca se guarda el tema entero en `Float32`, así que la memoria
   necesaria es aproximadamente el tamaño del WAV.
3. Al terminar, se descarga `<nombre-del-tema>-<AAAAMMDD-HHmm>.wav` y se
   informa de la sonoridad final, el pico y la reducción máxima del limitador
   (`stats` incluye también el pico real).
   Si el limitador ha bajado más de 0,5 LU la sonoridad, se avisa de que el
   objetivo es demasiado alto para ese tema.

Con “solo limitador” se omite la pasada de medida. En la exportación, la
ganancia de normalización se aplica antes del limitador, y el techo de
exportación sustituye al del bus maestro (no se limita dos veces). Si el rango
es la región de escucha, el final `loop` hace bucle de la región.

Durante la exportación se ven el progreso, el tiempo estimado y **Cancelar**.
La escucha se detiene para liberar CPU. Cancelar no descarga nada.

Formato del archivo:

- RIFF/WAVE con `fmt ` PCM (formato 1) para 16 y 24 bits, o IEEE float
  (formato 3) con chunk `fact` para 32 bits.
- Chunk `LIST/INFO` con `INAM` (nombre del tema), `ISFT` (`sen lab ·
  sen-synth/2`) e `ICMT` (notas del tema).
- Chunk propio **`senp`** con el proyecto `sen-lab/3` en UTF-8. Los
  reproductores lo ignoran; el laboratorio lo lee al arrastrar el WAV, así que
  **cada WAV exportado sirve también para reabrir su proyecto**.
- El WAV no lleva fechas ni datos variables: el proyecto de `senp` se escribe
  en forma canónica (sin `createdAt` ni `savedAt`, claves ordenadas, con las
  opciones de exportación usadas). Así dos exportaciones iguales dan el mismo
  archivo.

Límites: duración del tema 10 s – 30 min (bucle: 10 s – 10 min). Antes de
exportar se muestra el tamaño estimado; por encima de 300 MB se avisa de que en
móvil puede fallar.

#### 7.8.2 Proyecto `.sen.json`

- **Descargar proyecto** (`Cmd/Ctrl` + `S`): `<nombre-del-tema>.sen.json`,
  formateado con dos espacios, con `savedAt` en ISO 8601.
- **Abrir** con selector de archivos o arrastrando el archivo (también un WAV
  con chunk `senp`).
- Guarda también las últimas opciones de exportación (`export`), para que el
  render local produzca lo mismo sin repetir opciones.

#### 7.8.3 Render local con Node

```bash
node scripts/render-lab.mjs tema.sen.json
node scripts/render-lab.mjs tema.sen.json --out tema.wav --rate 44100 --bits 16 \
  --mono --end loop --lufs -23 --peak -3
node scripts/render-lab.mjs tema.wav            # usa el proyecto del chunk senp
```

- Importa `lab/engine/` directamente; no hay segunda implementación.
- Sin opciones, usa las de `export` del proyecto. Las opciones de la línea de
  comandos las sustituyen.
- Escribe al lado del proyecto si no hay `--out`, muestra progreso, sonoridad,
  pico y reducción del limitador, y el SHA-256 del archivo.
- Si la `engine` del proyecto no coincide con `ENGINE_VERSION`, avisa de que la
  salida puede diferir de la original, pero renderiza.
- Si el tema usa capas de pistas de sen, las recalcula con
  `scripts/lib/published.js` (o lee el WAV publicado) antes de renderizar.

#### 7.8.4 Script autónomo

**Exportar → Descargar script** descarga `<nombre-del-tema>.render.mjs`: un
único archivo con el motor y el proyecto dentro. `node <archivo> [salida.wav]`
escribe el WAV sin necesidad del repositorio, idéntico al del navegador con las
mismas opciones. Lo genera `lab/app/standalone.js` en el navegador: lee los
módulos de `lab/engine/` en el orden de `ENGINE_MODULES`, envuelve cada uno en
una función que devuelve sus exportaciones y convierte sus `import` en
desestructuraciones. Reglas que cumple el motor (y comprueba
`scripts/test-lab.mjs --full`):

- solo usa `import { a, b as c } from './x.js'` entre sus propios módulos;
- exporta por declaración (`export const/function/class`) o con
  `export { a, b }` de nombres ya declarados;
- no tiene dependencias circulares.

Un tema con capas de pistas de sen no puede llevarse en el script (necesita el
generador de la app): el botón se desactiva y remite a `render-lab.mjs`.

#### 7.8.5 Importar MIDI

**Abrir** (o arrastrar) un archivo `.mid` lo importa en el tema actual como
pistas nuevas, en un solo paso deshacible:

- SMF formatos 0 y 1, con mapa de tempo (y SMPTE).
- Un grupo por pista y canal; el canal 10 (percusión) se ignora con aviso.
- Grupos de notas largas (mediana ≥ 1,2 s) → pista **Pad** con un elemento
  `tone` por acorde (hasta 8 notas; nivel según la velocidad).
- El resto → pista **Kalimba** con elementos `phrase` de hasta 60 s y 256 notas.
- La duración del tema crece si hace falta. Se respetan los límites de 7.11 y
  se avisa de lo que no cabe.

### 7.9 Persistencia, deshacer y errores

- **Autoguardado** en `localStorage` (`sen-lab/current`) con 1 s de espera tras
  el último cambio. Al volver se recupera el tema; **Nuevo** pregunta antes de
  descartarlo si no se ha descargado. Es la única persistencia de `sen`: la app
  sigue sin guardar nada.
- **Deshacer/rehacer** de 200 pasos sobre instantáneas del proyecto. Un arrastre
  o un gesto de deslizador cuenta como un solo paso.
- **Archivo no válido:** “No se puede abrir este archivo” con el motivo
  (JSON roto, esquema desconocido…). Un JSON `sen-lab/2` del mezclador anterior
  muestra: “Este archivo es del mezclador anterior y no se puede abrir en el
  editor”.
- **Valores fuera de rango:** se recortan al abrir y se avisa una vez. Los
  campos desconocidos se conservan al guardar (compatibilidad hacia delante).
- **Fallo del motor:** si el Worker cae, se avisa (“El motor se ha detenido”),
  se ofrece **Reiniciar motor** y el proyecto no se pierde.

### 7.10 Esquema `sen-lab/3`

#### 7.10.1 Ejemplo

```json
{
  "schema": "sen-lab/3",
  "engine": "sen-synth/2",
  "name": "Estanque al anochecer",
  "notes": "",
  "createdAt": "2026-10-26T10:00:00.000Z",
  "savedAt": "2026-10-26T11:42:10.000Z",
  "seed": "estanque",
  "duration": 180,
  "end": { "mode": "loop", "fadeOut": 4 },
  "tuning": { "a4": 440 },
  "key": { "root": "D", "scale": "pentatonica-mayor" },
  "tempo": null,
  "region": null,
  "tracks": [
    {
      "id": "t1",
      "name": "Drone",
      "color": "#9dded8",
      "family": "sustain",
      "instrument": "drone",
      "params": {
        "partials": 6, "rolloff": 1.8, "voices": 3, "detune": 6, "drift": 4,
        "sub": 0.4, "beat": 0.3,
        "filterType": "lp", "cutoff": 900, "q": 0.7,
        "vibratoDepth": 0, "vibratoRate": 0.2,
        "tremoloDepth": 0.1, "tremoloRate": 0.07,
        "sweepDepth": 0.8, "sweepRate": 0.03,
        "width": 0.6
      },
      "mix": { "gain": -8, "pan": 0, "mute": false, "solo": false, "reverb": 0.4, "echo": 0 },
      "automation": { "gain": [[0, -14], [60, -8], [170, -8], [180, -20]] },
      "elements": [
        {
          "id": "e1", "type": "tone", "start": 0, "length": 180,
          "level": 0, "fadeIn": 10, "fadeOut": 12,
          "notes": ["D2", "A2"],
          "curve": [[0, 0.8], [0.5, 1], [1, 0.8]]
        }
      ]
    },
    {
      "id": "t2",
      "name": "Campanas",
      "color": "#ffd08a",
      "family": "strike",
      "instrument": "campana",
      "params": { "decay": 7, "brightness": 0.45, "hardness": 0.3, "inharmonic": 0.15, "beat": 0.4, "width": 0.7 },
      "mix": { "gain": -12, "pan": 0.1, "mute": false, "solo": false, "reverb": 0.6, "echo": 0.25 },
      "elements": [
        { "id": "e2", "type": "hit", "start": 12.5, "note": "A4", "velocity": 0.7, "level": 0 },
        {
          "id": "e3", "type": "cloud", "start": 20, "length": 140,
          "level": 0, "fadeIn": 0, "fadeOut": 0,
          "density": 6, "range": ["D4", "D6"], "pitches": null,
          "timing": 0.7, "motion": 0.7, "gravity": 0.5, "chord": 0.1,
          "velocity": [0.3, 0.8], "seed": 3, "curve": "respira"
        },
        {
          "id": "e4", "type": "phrase", "start": 160, "length": 16,
          "level": -3, "fadeIn": 0, "fadeOut": 4,
          "pattern": 8,
          "events": [
            { "t": 0, "note": "D5", "v": 0.6 },
            { "t": 1.5, "note": "F#5", "v": 0.5 },
            { "t": 3, "note": "A5", "v": 0.45 }
          ]
        }
      ]
    },
    {
      "id": "t3",
      "name": "Grillos",
      "color": "#d7e08f",
      "family": "nature",
      "instrument": "grillo",
      "params": {
        "individuals": 6, "pitch": [4200, 5000], "callRate": 1.6, "pulses": 3, "sync": 0.2,
        "distance": 0.6, "pan": 0, "spread": 0.8, "variation": 0.4
      },
      "mix": { "gain": -10, "pan": 0, "mute": false, "solo": false, "reverb": 0.3, "echo": 0 },
      "elements": [
        {
          "id": "e5", "type": "span", "start": 30, "length": 150,
          "level": 0, "fadeIn": 6, "fadeOut": 6,
          "density": 0.6, "seed": 1, "curve": "crece"
        }
      ]
    }
  ],
  "master": {
    "gain": 0,
    "ceiling": -1,
    "reverb": { "size": 0.7, "decay": 5.5, "damping": 6000, "predelay": 0.03 },
    "echo": { "time": 0.62, "sync": "libre", "feedback": 0.35, "tone": 3000, "pingPong": true },
    "eq": { "lowCut": 35, "highCut": 16000, "tilt": 0 }
  },
  "export": {
    "sampleRate": 48000, "bits": 24, "channels": 2,
    "end": null, "loudness": -18, "ceiling": -1, "range": "all"
  }
}
```

`curve` admite el nombre de una curva predefinida o una lista de puntos.
`export.end: null` significa “el del tema”. `tempo` es `null` o
`{ "bpm": 60, "beatsPerBar": 4 }`; `region` es `null` o `{ "start", "end" }`
(región de escucha, también exportable). `master.echo.sync` es `libre` o una
figura (`1/16`, `1/8`, `1/8.`, `1/4`, `1/4.`, `1/2`, `1`). `automation` es
opcional (7.4.6).

#### 7.10.2 Unidades y reglas

| Magnitud | Unidad |
| --- | --- |
| Tiempos (`start`, `length`, `fadeIn`, `fadeOut`, `t`, `pattern`, `duration`, puntos de automatización) | segundos |
| Ganancias (`level`, `gain`, `ceiling`) | dB |
| Frecuencias (`cutoff`, `damping`, `lowCut`, `highCut`, `pitch`) | Hz |
| Velocidades de modulación (`rate`) | Hz |
| Desafinación, deriva, vibrato | cents |
| `pan` | −1 (izquierda) a 1 (derecha) |
| Sonoridad | LUFS |
| Resto de parámetros normalizados | 0–1 |

- `id` de pistas y elementos: cadenas cortas aleatorias, únicas en el tema.
- Las claves estructurales van en inglés (`tracks`, `family`, `start`…); los
  valores con nombre visible (instrumentos, escalas, curvas, superficies,
  especies, colores de ruido) van en español, sin tildes. Las notas, en
  notación anglosajona (`F#4`).
- Los campos de timbre que falten toman su valor por defecto. Así los proyectos
  siguen siendo pequeños y legibles.
- `lab/engine/schema.js` contiene la validación, los valores por defecto, los
  rangos y `migrate(project)` para futuras versiones del esquema. Es la fuente
  de verdad de 7.4: la UI construye el inspector a partir de esas
  definiciones.

### 7.11 Límites

| Límite | Valor |
| --- | --- |
| Duración del tema | 10 s – 30 min (bucle: 10 s – 10 min) |
| Pistas | 32 |
| Elementos por tema | 500 |
| Notas por elemento `tone` | 8 |
| Voces sostenidas simultáneas (notas × voces) | 96 |
| Golpes simultáneos | 16 por pista, 64 en total |
| Eventos planificados de simulaciones | 200 000 por tema |
| Reverb | decaimiento ≤ 12 s |
| Tamaño de proyecto | ≤ 1 MB |

Al alcanzar un límite la acción (cualquier cambio del proyecto) se impide y se
explica por qué. El de eventos de simulación solo avisa en la barra de estado:
el render sigue siendo correcto, solo más lento. El límite de voces sostenidas
cuenta las que suenan a la vez (notas × voces de unísono).

### 7.12 Decisiones de diseño

- **Motor propio en JavaScript, no nodos de Web Audio.** Con nodos de Web Audio
  y `OfflineAudioContext` el WAV del navegador sería fácil, pero no podría
  reproducirse en Node sin dependencias, variaría entre navegadores y obligaría
  a mantener dos motores para el render local. Un motor puro da el mismo
  resultado en todas partes, a costa de implementar osciladores, filtros y
  reverb (que el proyecto ya domina en los generadores de escenas).
- **Worklet alimentado por bloques, sin `SharedArrayBuffer`,** porque GitHub
  Pages no permite las cabeceras COOP/COEP.
- **Exportación en dos pasadas en streaming:** se renderiza dos veces en vez de
  guardar el tema en memoria. Así un tema de 30 min es viable en el navegador.
- **Bucle por render de ciclos periódicos**, no por crossfade: es la misma idea
  que ya da costuras perfectas en las escenas 04–06, generalizada.
- **Pista = instrumento:** el timbre se ajusta una vez por pista y los elementos
  solo dicen cuándo y qué. Es el modelo más fácil de leer en una línea de
  tiempo y en el JSON.
- **Desacople por copia:** el motor del laboratorio puede inspirarse en
  `sources.js`, pero no lo importa. Las escenas de la app y el editor pueden
  evolucionar sin romperse mutuamente. Para retocar pistas de la app, el único
  puente es un Worker que calcula sus capas y pasa audio al motor (7.17).
- **Persistencia solo en el laboratorio:** un editor sin autoguardado pierde
  trabajo; la app sigue sin guardar nada.
- **Vistas en su propio hilo:** las formas de onda de los elementos se calculan
  en un Worker aparte, a 11 025 Hz, para no competir con la escucha.

### 7.13 Estructura

```text
lab/
  index.html                Página del editor
  guia.html                 Instrucciones para el usuario (página estática)
  lab.css
  worker.js                 Worker de escucha: compila y emite bloques
  export-worker.js          Worker de exportación: dos pasadas y WAV
  overview-worker.js        Worker de vistas: formas de onda resumidas
  scene-worker.js           Worker de pistas de sen: capas con scripts/lib/published.js
  player-worklet.js         AudioWorkletProcessor "lab-player"
  app/
    main.js                 Arranque, requisitos, acciones, transporte, teclado
    store.js                Estado inmutable, deshacer/rehacer, gestos
    storage.js              Autoguardado, abrir y descargar proyectos
    audio.js                AudioContext, worklet, Worker de escucha, audición
    timeline.js             Línea de tiempo, selección, arrastres, regla
    inspector.js            Paneles del tema, pista, elemento y maestro
    controls.js             Deslizadores, notas y teclado, curvas, piano roll, automatización
    library.js              Biblioteca, audición de 3 s, pistas de sen y plantillas
    scenes.js               Catálogo y audio de las capas de pistas de sen
    export.js               Diálogo de exportación y progreso
    standalone.js           Generador del script autónomo
    midi.js                 Lectura de MIDI e importación
    compact.js              Modo compacto
    util.js                 DOM, formato y avisos
  engine/
    index.js                compile, createRenderer, renderToWav, ENGINE_MODULES
    schema.js               Esquema, catálogo, defaults, rangos, validación, curvas, automatización
    rng.js                  mulberry32, hash por contador, semillas
    music.js                Notas, escalas, afinación
    dsp.js                  Tablas de onda, filtros, ruido, envolventes, control
    space.js                Reverb FDN y eco
    master.js               EQ, limitador (pico real), sonoridad BS.1770
    wav.js                  Escritura RIFF por trozos, chunks INFO y senp, lectura
    voices/
      sustain.js            pad, drone, cuerdas, flauta, coro, vidrio, seno
      strike.js             campana, cuenco, kalimba, cajaMusica, celesta, marimba, vibrafono, piano, arpa, guitarra, pulsada, gotaTonal
      layer.js              capa (capas de pistas de sen)
      noise.js              ruido
      nature/kit.js         Planificación, sílabas y partículas
      nature/insects.js     grillo, cigarra
      nature/animals.js     pajaro, rana
      nature/water.js       gotas, lluvia, arroyo, olas
      nature/air.js         viento, fuego, campanillas
  templates/*.sen.json      Plantillas de inicio
scripts/
  render-lab.mjs            Render local de proyectos y WAV con senp
  test-lab.mjs              Pruebas del motor (`--full`: plantillas y script autónomo)
```

Añadir un instrumento: definir sus parámetros en `engine/schema.js`,
implementar la voz en `engine/voices/`, registrarla en `engine/index.js` y, si
cambia la salida de proyectos existentes, subir `ENGINE_VERSION`. La UI no
necesita cambios. Si se añade un módulo al motor, va también en
`ENGINE_MODULES` (orden de dependencias).

### 7.14 Alcance implementado

Las tres fases previstas están implementadas en la versión 4.0:

- **Base:** los instrumentos del catálogo (hoy 31: 7 sostenidas, 12 puntuales,
  ruido y 11 simulaciones con todas sus especies y superficies), elementos `tone`,
  `hit`, `phrase`, `cloud` y `span`, línea de tiempo, inspector, biblioteca con
  audición, escucha en directo, reverb y eco maestros, EQ y limitador,
  exportación WAV (tres finales, chunk `senp`), `.sen.json`,
  `scripts/render-lab.mjs`, autoguardado, deshacer y las cinco plantillas.
- **Edición:** mini piano roll de frases, tempo y rejilla musical, eco
  sincronizado, script autónomo, modo compacto y forma de onda resumida en los
  elementos.
- **Avanzado:** automatización por pista (7.4.6), pico real con sobremuestreo
  4× en la exportación e importación de MIDI (7.8.5).
- **4.3:** flauta suave, vibráfono, piano de fieltro, arpa y guitarra de nailon;
  volumen en la cabecera de cada pista; retocar pistas de sen por capas (7.17).

### 7.15 Criterios de aceptación

`node scripts/test-lab.mjs --full` comprueba automáticamente los marcados con
**(auto)**.

- [x] `/lab/` carga sin errores y sin peticiones fuera del mismo origen.
- [x] Ningún módulo de `lab/engine/` ni de `lab/app/` importa de `src/` ni de
      `scripts/lib/`; solo `lab/scene-worker.js` usa `scripts/lib/published.js`
      (comprobable con `grep`).
- [x] Sin requisitos del navegador, se muestra el aviso y no el editor.
- [x] Se pueden añadir, mover, redimensionar, duplicar, dividir y borrar
      elementos con ratón y con teclado.
- [x] Cada instrumento suena en la audición de 3 s de la biblioteca **(auto)**.
- [x] Un cambio de parámetro se oye en ≤ 1 s mientras suena el tema.
- [x] Silencio y solo actúan al instante, sin clics.
- [ ] No hay clics en las uniones de bloques de la escucha (grabación de 60 s
      de un seno puro sin discontinuidades). Pendiente de verificar con una
      grabación en un navegador real.
- [x] La región de escucha enlaza sin cortes.
- [x] Deshacer y rehacer recorren 200 pasos; un arrastre es un paso.
- [x] El autoguardado recupera el tema tras recargar la página.
- [x] Descargar y abrir un `.sen.json` devuelve exactamente el mismo proyecto
      **(auto)**.
- [x] Un JSON `sen-lab/2` muestra el aviso del mezclador anterior **(auto)**.
- [x] Exportar WAV en cada preajuste produce un archivo válido que abre en un
      reproductor estándar y en `node scripts/analyze-audio.mjs` **(auto)**.
- [x] La sonoridad integrada queda a ±0,5 LU del objetivo y el pico no supera
      el techo **(auto)**.
- [x] El final `loop` no marca costura en `analyze-audio.mjs` **(auto)**.
- [x] El final `tail` termina en silencio; `cut` dura exactamente la duración
      con el fundido pedido **(auto)**.
- [x] Arrastrar un WAV exportado al laboratorio reabre su proyecto.
- [x] `node scripts/render-lab.mjs` sobre el mismo proyecto y opciones produce
      un WAV con el mismo SHA-256 que el exportado desde Chrome (verificado
      también con el script autónomo) **(auto)**.
- [x] Exportar dos veces el mismo proyecto da archivos idénticos **(auto)**.
- [x] Editar un elemento no cambia el azar de los demás **(auto)**.
- [ ] Exportar 30 min a 48 kHz/24 bits estéreo termina en Chrome de escritorio
      sin agotar la memoria, y Cancelar no descarga nada. Pendiente de
      verificar en un navegador real con un tema de 30 min.
- [x] Se cumple el presupuesto de rendimiento de 7.7.7 **(auto)**.
- [x] La línea de tiempo es usable solo con teclado y los elementos tienen
      `aria-label` completo.
- [x] El modo compacto permite editar, escuchar y exportar en un móvil.
- [x] La automatización de volumen cambia el nivel donde se dibuja y el
      limitador de exportación respeta el techo en pico real **(auto)**.
- [x] Una pista de sen abierta sin cambios exporta la misma pista de la app
      (correlación > 0,999), bajar una capa 6 dB la baja 6 dB, enlaza sin
      costura y `render-lab.mjs` da el mismo WAV **(auto)**.
- [x] Un MIDI se importa como pistas válidas **(auto)**.

### 7.16 Transición desde el mezclador anterior

Hasta la versión 3.7, `/lab/` era un **mezclador de ambientes**: elegía uno de
los catorce ambientes, editaba su síntesis base, sumaba capas de WAV de otros
ambientes y exportaba un JSON `sen-lab/2`. En la versión 4.0:

1. `synth.js`, `dsp.js`, `sources.js` y `soundscapes.js` se movieron de `lab/`
   a **`scripts/lib/`**, porque solo los usan los generadores de escenas.
2. Se retiraron `lab/lab.js` y `lab/lab.css`; el esquema `sen-lab/2` ya no se
   admite (al abrirlo se muestra un aviso).
3. `/lab/` sirve el editor. La URL no cambió.

### 7.17 Retocar una pista de sen

Cualquiera de las 56 pistas publicadas de la app (`assets/audio/<id>/01–04.wav`)
se abre en el laboratorio **separada en capas**, para cambiar sus volúmenes (u
otra mezcla) y exportarla de nuevo.

- **Entrada:** «Retocar una pista de sen…» en el diálogo **Empezar** y en la
  biblioteca («Pistas de sen»). Un diálogo lista los catorce ambientes con sus
  cuatro pistas (título de cada una).
- **Capas:** las pistas que salen del generador de paisajes (52 de 56) se
  recalculan con su receta y semilla, y cada capa del `mix()` de la receta
  (lluvia, pájaros, pad, melodía…, con nombre en `soundscapes.js`) se entrega
  por separado: su parte seca más su reverb y el filtro final, todo lineal, así
  que **la suma de las capas es la pista** antes del limitador final. Las
  cuatro de síntesis base (la 1 de Mar, Río, Bichos y Noche) no son
  reproducibles: se lee su WAV como una sola capa («Escena completa»). Lo
  calcula `lab/scene-worker.js` con `scripts/lib/published.js` (la tabla
  `PUBLISHED` de `soundscapes.js` dice de qué escena sale cada pista).
- **Proyecto** (`createSceneProject` en `engine/schema.js`): una pista de
  familia `layer` (instrumento `capa`) por capa, a 0 dB, sin envíos, con un
  elemento `clip` que cubre el bucle; final en bucle con la duración de la
  pista; maestro sin ecualización (`eq.on: false`); exportación «Escena para
  sen» con la sonoridad de la pista. Cada pista guarda su origen en `source`
  (`{ ambient, track, layer, name, title }`) y el proyecto en `scene`. **No se
  guarda audio**: al abrir o recuperar el proyecto, las capas se recalculan
  (unos segundos; el pie muestra «preparando las capas…»).
- **Fidelidad:** sin cambios, la exportación coincide con la pista publicada
  (correlación 1,0; la diferencia es el limitador final y el dither, unos
  −32 dB por debajo). Probado en `scripts/test-lab.mjs`.
- **Edición:** volumen, panorama, silencio, solo, automatización, fundidos y
  curva por capa; dividir un `clip` avanza el `offset` de la segunda parte. Se
  pueden añadir pistas de instrumentos encima. El timbre de una capa no se
  edita.
- **Publicar:** Exportar → «Escena para sen» y sustituir a mano el archivo que
  indica el diálogo (`assets/audio/<id>/NN.wav`).
- **Fuera del navegador:** `scripts/render-lab.mjs` recalcula las capas igual;
  el script autónomo no puede (se desactiva para estos temas).

---

## 8. Arquitectura técnica

### 8.1 Estructura

```
index.html                  Entrada de la app
SPEC.md                     Esta especificación
README.md                   Guía breve
assets/
  audio/<id>/01..04.wav     Escenas de audio
  audio/README.md           Nota sobre las escenas
  favicon.svg
lab/                        Laboratorio (editor); estructura detallada en 7.13
scripts/
  lib/synth.js              Motor de síntesis base y recetas (01–03)
  lib/dsp.js                Núcleo DSP de alta calidad (04–08)
  lib/sources.js            Fuentes sonoras e instrumentos suaves
  lib/soundscapes.js        Recetas de las escenas 04–08, capas y tabla PUBLISHED
  lib/published.js          Capas de las pistas publicadas (para el laboratorio)
  make-audio-variants.mjs   Generador de las escenas 01–03
  make-soundscapes.mjs      Generador de las escenas 04–08
  analyze-audio.mjs         QA: formato, LUFS, picos, costura, espectrogramas
  render-lab.mjs            Render local de temas del laboratorio
  test-lab.mjs              Pruebas del motor del laboratorio
src/
  config/ambients.js        Fuente de verdad de ambientes y APP
  config/icons.js           Iconos SVG
  core/audio.js             Web Audio: contexto, bucle, gain, caché
  core/session.js           Reloj y fases de sesión
  core/variants.js          Descubrimiento y elección de escenas
  core/wake-lock.js         Screen Wake Lock
  main.js                   Orquestador de la app
  render/engine.js          Renderer de canvas
  render/themes.js          Catorce animaciones + constelación
  styles/main.css           Estilos de la app
```

Los generadores de escenas de la app (`scripts/lib/`) y el motor del
laboratorio (`lab/engine/`) son independientes: no comparten código.

### 8.2 Módulos de la app

- **`src/config/ambients.js`**: exporta `APP`, `ambients` y `hexToRgb`. Es la
  única fuente de verdad para nombres, iconos, paletas, animaciones y carpetas
  de audio.
- **`src/config/icons.js`**: mapa de sigilos SVG. `iconSvg(name)` devuelve el
  marcado o el icono de lluvia como fallback; `ringSvg()` devuelve el anillo
  rúnico de los nodos.
- **`src/core/session.js`**: reloj basado en `performance.now()` con fases
  `running`, `hold`, `manual` y `done`. Emite snapshots `{ phase, elapsed,
  light, gain }`.
- **`src/core/audio.js`**: envuelve `AudioContext`, `AudioBufferSourceNode` y
  un `GainNode` por voz. Cachea buffers por URL, hace loop, aplica la ganancia
  de sesión y cruza pistas con un crossfade corto. Si falla, avisa mediante
  `onError` sin cortar la pista que ya suena.
- **`src/core/variants.js`**: `resolveAudioVariants(directory, prefix)` devuelve
  las rutas `01.wav` … `04.wav` que existan, en ese orden. La sesión empieza
  siempre por la primera.
- **`src/core/wake-lock.js`**: solicita y libera el bloqueo de pantalla; vuelve
  a solicitarlo al recuperar visibilidad o foco, cuando el sistema libera el
  sentinel y, si la petición falla, reintenta con espera creciente.
- **`src/render/engine.js`**: renderer de canvas con resize, DPR máximo 1,5,
  pausa/reanudación, `prefers-reduced-motion` y limpieza.
- **`src/render/themes.js`**: fábricas de animación. Cada una recibe el
  ambiente y devuelve `{ draw(ctx, t, dt, w, h) }`. También incluye
  `constellation` para el fondo del menú.
- **`src/main.js`**: construye el menú, gestiona duración, sesión, audio,
  historial, foco y eventos globales.

### 8.3 Estado de la app

Estado global mínimo:

```js
let active = null;
let durationMinutes = APP.defaultDurationMin;
```

`active` contiene:

```js
{
  token,          // identidad de la sesión
  ambient,        // objeto de configuración
  trigger,        // botón que abrió la sesión
  durationMs,
  session,        // instancia de Session
  phase,
  ending,
  finishing,
  audioFailed,
  noteTimer,
  tracks,        // escenas disponibles, en orden fijo 01, 02
  trackIndex,    // posición actual (0..N-1)
  trackRequest   // evita que una carga antigua pise a la actual
}
```

### 8.4 Ciclo de una sesión

```text
click nodo
  → startSession()
  → prepare audio + HEAD de escenas
  → renderer.start + Session.start + WakeLock
  → updateSession() en cada frame
  → hold (final natural) o manual (toque/Escape/Atrás)
  → finishSession()
  → audio.stop + WakeLock.release + renderer.stop
  → 440 ms de salida
  → active = null + foco al nodo
```

### 8.5 Audio de la app

- `01.wav` es la escena por defecto y `02.wav` la alternativa de paisaje; `03.wav`
  y `04.wav` son paisajes con melodía (escenas 07 y 08). Según el ambiente,
  pueden proceder de la síntesis base (WAV PCM mono, 16 kHz, 16 bits, 16 s) o de
  los paisajes de alta calidad (WAV PCM mono, 22,05 kHz, 16 bits con dither TPDF,
  30 s).
- Nivel: todas las escenas rondan −23 LUFS (las de alta calidad se normalizan a
  −23, o −24/−25 en las escenas musicales y espaciales) con pico ≤ −3 dBFS.
- La app solo descarga la escena elegida en cada sesión.
- Reproducción: una voz `AudioBufferSourceNode` con `loop = true` y su propio
  `GainNode`, conectada a la ganancia maestra de la sesión.
- Ganancia maestra: `session.gain × fadeIn × 0.9`.
- Cambio de pista: se carga la siguiente escena sin detener la actual y se hace
  un crossfade de 0,3 s. Si la carga falla, la pista actual sigue sonando.
- Fundido de entrada: 1,4 s.
- Fundido final: 30 s.
- El contexto se prepara síncronamente antes de las peticiones `HEAD` para no
  perder el permiso de autoplay en iOS.
- La caché de buffers es por URL y vive durante la página.

### 8.6 Render de la app

- Dos renderers: `menuRenderer` para el fondo del menú y `renderer` para la
  sesión.
- El menú se pausa mientras dura la sesión.
- El canvas se redimensiona a `innerWidth × innerHeight` con DPR limitado a 1,5.
- El menú dibuja el cielo místico (tema `constellation`); los nodos, la línea y
  el portal de invocación son DOM/SVG/CSS.
- La sesión dibuja la animación del ambiente seleccionado y aplica un velo
  negro (`#dim`) para el fundido.
- `prefers-reduced-motion` dibuja una composición estática en `t = 2.4`.

### 8.7 Generación de audio

`scripts/lib/synth.js` es la fuente de verdad de la síntesis. Cada receta acepta un
parámetro `scene` (0, 1 o 2) y devuelve 16 s de audio mono a 16 kHz.

`scripts/make-audio-variants.mjs`:

- Define `BASE_VARIANTS` (escena 0 de cada ambiente) y `VARIANTS` (escenas 1 y 2
  con parámetros propios).
- Renderiza y escribe `assets/audio/<id>/01.wav`, `02.wav` y `03.wav`.
- Aplica un crossfade de 1,5 s para que el bucle no tenga costura.
- Normaliza el pico de cada receta; Fuego usa además una compresión suave para
  que sus chasquidos no dejen la escena demasiado baja.
- Acepta `--only=<id>[,<id>]` para regenerar solo algunos ambientes.

Comandos:

```bash
node scripts/make-audio-variants.mjs
node scripts/make-audio-variants.mjs --only=lluvia
node scripts/make-audio-variants.mjs --only=fuego,bichos
```

Los valores de “Síntesis base” de la sección 6 son los parámetros por defecto
de esta síntesis (`BASE_CONTROLS`).

Los scripts mantienen su numeración de generación (`01`–`08`). La app solo lee
`01.wav` … `04.wav`. La tabla `PUBLISHED` de `soundscapes.js` dice de qué
escena sale cada pista publicada, y `make-soundscapes.mjs --publish` las
escribe directamente con su nombre publicado. Para publicar otra escena,
cambia la tabla o renombra el archivo a mano.

### 8.8 Paisajes de alta calidad (escenas 04–08)

`scripts/lib/soundscapes.js` define cinco recetas por ambiente (`SCENES[id]`) que
mezclan fuentes de `scripts/lib/sources.js` sobre el núcleo de `scripts/lib/dsp.js`. Son
módulos ES sin dependencias, válidos en Node y en el navegador.

- **Deterministas:** RNG `mulberry32` con semilla `<id>/<escena>`; regenerar
  produce los mismos archivos byte a byte.
- **Bucle sin costura por construcción:** los filtros, la reverb y el limitador
  se procesan de forma circular (dos pasadas), los eventos que pasan del final
  se pliegan al principio, los LFO tienen un número entero de ciclos por bucle
  y los osciladores sostenidos se ajustan a frecuencias con ciclos enteros. No
  hay crossfade.
- **Modelos físicos y de especie:** burbujas de Minnaert con tono ascendente
  (lluvia sobre agua, ríos, burbujas), lechos de miles de impactos (lluvia,
  espuma, hojas), truenos formados por decenas de sub-ráfagas filtradas según
  la distancia, olas con crecida, rompiente, espuma y guijarros, fuego con
  chasquidos en racimos, viento con banda que sube con la ráfaga y aullidos
  afinados, cantos con contornos de especies reales (mirlo, petirrojo,
  carbonero, pinzón, palomas, cuco, autillo, cárabo), grillos con portadora
  casi pura, cigarras, sapos parteros y ranitas, cuencos con modos inarmónicos
  y batidos, tanpura con jawari y piezas musicales que caben exactas en 30 s.
- **Escenas con melodía (07–08):** el paisaje del ambiente con una melodía sutil
  compuesta para el bucle (acordes y frases que encajan exactos en 30 s) y,
  cuando encaja, un pad sostenido. Instrumentos suaves de `sources.js`: piano de
  fieltro (cuerdas al unísono con batido lento y martillo blando), arpa y
  guitarra de nailon (cuerda pulsada modal), vibráfono con motor lento, flauta
  suave (casi senoidal, soplo leve y vibrato tardío), celesta, kalimba y caja de
  música. Los pads (`pads`) encadenan acordes con fundido cruzado exacto y se
  pliegan sobre el inicio del bucle; los drones usan `evolvingPad`. La música
  lleva su propia sala y queda unos 3–6 LU por debajo del paisaje.
- **Espacio:** reverb FDN de 8 líneas con difusores y amortiguación; cada
  fuente se aleja con pérdida de agudos, de nivel y más envío a reverb.
- **Mezcla y masterización:** cada capa se normaliza por su nivel activo y se
  limita su cresta; después, filtro de DC, sonoridad integrada (BS.1770
  aproximada) a −23 LUFS por defecto, limitador con anticipación a −3 dBFS y
  dither TPDF al escribir a 16 bits.

Cada capa de `mix()` lleva un nombre (`[señal, dB, envío, cresta, 'Pad']`) y
un posible filtro final lineal (`post`). `renderLayers(id, i)` devuelve las
capas por separado, ya a la sonoridad de la escena: su suma es la escena antes
del limitador (lo usa el laboratorio, 7.17). `renderScene` sigue dando
exactamente los mismos archivos.

`scripts/make-soundscapes.mjs` escribe `04.wav` … `08.wav` sin tocar las
escenas 01–03 y muestra la sonoridad y la reducción del limitador de cada
archivo. Acepta `--only=<id>[,<id>]`, `--scene=<n>[,<n>]` (por ejemplo
`--scene=7,8` para las musicales) y `--publish` (escribe `01.wav` … `04.wav`
según `PUBLISHED`; regenerar así da los mismos archivos publicados).

`scripts/analyze-audio.mjs [ruta] [--png=<carpeta>]` revisa cualquier WAV:
frecuencia de muestreo, duración, pico, LUFS, salto en la costura (relativo a
los saltos internos; > 1 se marca) y, opcionalmente, espectrogramas PNG.

```bash
node scripts/make-soundscapes.mjs
node scripts/make-soundscapes.mjs --only=mar --scene=5
node scripts/analyze-audio.mjs assets/audio/mar --png=/tmp/espectros
```

---

## 9. Accesibilidad

- `h1` oculto que describe la pantalla.
- Cada nodo es un `<button>` con `aria-label` que incluye nombre, pista y acción.
- El diálogo de duración tiene `role="dialog"`, `aria-label`, grupo de
  opciones, `aria-expanded` y foco gestionado.
- `#live` es una región `aria-live="polite"` que anuncia inicio, final y
  errores de audio.
- El escenario tiene `role="dialog"`, `aria-modal="true"`, `tabindex="-1"` y
  recibe el foco al abrirse.
- Al cerrar, el foco vuelve al nodo que inició la sesión.
- `Escape` cierra el diálogo o termina la sesión.
- El botón Atrás termina la sesión.
- El indicador de pista y la X son botones reales, con `aria-label`; se puede
  llegar a ellos con `Tab` y activarlos con `Enter` o `Espacio`.
- Se respeta `prefers-reduced-motion`.
- Los iconos son `aria-hidden`; el nombre siempre está en el `aria-label`.
- Los colores tienen contraste suficiente sobre fondo oscuro; el foco visible
  usa el acento del ambiente.

---

## 10. Rendimiento

- Sin dependencias, sin build, sin frameworks.
- Canvas con DPR limitado a 1,5 para evitar sobrecoste en pantallas de alta
  densidad.
- Sprites de resplandor cacheados; no se crean gradientes radiales por
  partícula en cada frame.
- Partículas en coordenadas normalizadas; el resize no reinicia la animación.
- Audio decodificado una vez por URL y reutilizado.
- El menú se pausa durante la sesión y el renderer de sesión se detiene al
  terminar.
- Las peticiones `HEAD` de escenas son ligeras y se hacen solo al iniciar una
  sesión.

---

## 11. Criterios de aceptación y QA

### 11.1 Menú

- [ ] Carga `/` sin errores de consola.
- [ ] Se ven 14 nodos y una línea de constelación.
- [ ] No hay texto visible bajo los nodos.
- [ ] Cada nodo tiene `aria-label` con nombre y pista.
- [ ] El botón inferior dice `10 MIN` al cargar.
- [ ] El layout se adapta a móvil vertical, móvil horizontal y escritorio.

### 11.2 Duración

- [ ] Al pulsar el botón se abre el diálogo.
- [ ] Solo aparecen `10 MIN`, `15 MIN` y `30 MIN`.
- [ ] No existe campo de duración personalizada.
- [ ] La opción activa está marcada.
- [ ] Elegir 15 o 30 actualiza el botón y la sesión.
- [ ] `Escape` y un clic fuera cierran el diálogo.
- [ ] El foco vuelve al botón al cerrar con teclado o al elegir una opción.

### 11.3 Sesión

- [ ] Cada uno de los 14 ambientes inicia una sesión.
- [ ] La barra de progreso avanza con la duración elegida.
- [ ] El audio carga siempre `01.wav` por defecto (cuatro escenas por ambiente
  en el repositorio actual) y suena en bucle.
- [ ] La URL muestra `#<id>/<pista>` (por ejemplo `#mar/01`) y cambia al pasar
  de pista.
- [ ] No hay controles inferiores durante la sesión.
- [ ] Un toque termina la sesión con fundido.
- [ ] `Escape` termina la sesión.
- [ ] El botón Atrás termina la sesión.
- [ ] Al terminar se vuelve al menú y el foco vuelve al nodo.
- [ ] El fundido final empieza 30 s antes del final.
- [ ] La sesión natural hace una pausa casi negra de 4 s.

### 11.4 Audio

- [ ] Las 56 escenas existen: `01.wav` … `04.wav` en cada ambiente.
- [ ] Si se borra una escena, deja de elegirse.
- [ ] Si solo queda una, siempre suena esa.
- [ ] Si no queda ninguna, aparece “Audio no disponible” y la sesión sigue.
- [ ] No hay errores de decodificación ni de reproducción.
- [ ] El audio no se solapa entre sesiones.

### 11.5 Accesibilidad y preferencias

- [ ] Con `prefers-reduced-motion` la animación se queda estática.
- [ ] La sesión y el audio siguen funcionando con movimiento reducido.
- [ ] El Screen Wake Lock se solicita y se libera.
- [ ] La región `aria-live` anuncia los cambios importantes.
- [ ] El diálogo y el escenario tienen roles y nombres accesibles.

### 11.6 Laboratorio

Los criterios del editor están en **7.15**; `node scripts/test-lab.mjs --full`
comprueba automáticamente los del motor.

### 11.7 Generación

- [ ] `node scripts/make-audio-variants.mjs` produce 42 WAV.
- [ ] `--only=lluvia` solo toca `assets/audio/lluvia/`.
- [ ] Los archivos 01–03 tienen 16 s, mono, 16 kHz, 16 bits.
- [ ] `node scripts/make-soundscapes.mjs` produce 70 WAV (04–08) y regenerar
      da archivos idénticos.
- [ ] Los archivos 04–08 tienen 30 s, mono, 22,05 kHz, 16 bits, ≈ −23 LUFS y
      pico ≤ −3 dBFS.
- [ ] No hay NaN, clipping extremo ni saltos audibles en el bucle
      (`node scripts/analyze-audio.mjs` no marca ninguna escena).
- [ ] `analyze-audio.mjs` lee WAV de 16 y 24 bits y de 32 bits flotante
      (también los que exporta el laboratorio).

---

## 12. Mantenimiento

### 12.1 Añadir un ambiente

1. Añade un objeto a `ambients` en `src/config/ambients.js` con un `id` único,
   `name`, `hint`, `icon`, `audioDir`, `animation`, `accent` y `palette`.
2. Crea el icono en `src/config/icons.js` si la clave es nueva.
3. Crea la animación en `src/render/themes.js` y regístrala en `THEMES`.
4. Añade la receta y los controles en `scripts/lib/synth.js`.
5. Añade el ambiente a `BASE_VARIANTS` y `VARIANTS` en
   `scripts/make-audio-variants.mjs`.
6. Genera su audio: `node scripts/make-audio-variants.mjs --only=<id>`.
7. Añade sus tres paisajes a `SCENES` y sus dos escenas con melodía a `MUSICAL`
   en `scripts/lib/soundscapes.js` y genéralos con
   `node scripts/make-soundscapes.mjs --only=<id>`.
8. Añade una posición en `NODE_LAYOUT` y un índice en `NODE_PATH` en
   `src/main.js`.

### 12.2 Cambiar la duración

Edita `APP.durationOptions` en `src/config/ambients.js`. La interfaz se
construye automáticamente a partir de esa lista. Si cambias el valor por
defecto, actualiza también `defaultDurationMin` y el texto inicial del botón en
`index.html` si quieres que coincida antes de cargar JavaScript.

### 12.3 Cambiar una escena de audio

- Escenas 01–03: edita la receta en `scripts/lib/synth.js` y, si hace falta, los
  parámetros de `BASE_VARIANTS` / `VARIANTS`; regenera con
  `make-audio-variants.mjs --only=<id>`.
- Escenas 04–08: edita la receta en `scripts/lib/soundscapes.js` (o la fuente en
  `scripts/lib/sources.js`); regenera con `make-soundscapes.mjs --only=<id>`.
  Las musicales (07–08) se publican renombrándolas a `03.wav` y `04.wav`.
- Verifica con `node scripts/analyze-audio.mjs assets/audio/<id>` que el bucle
  no hace clic y que el nivel está en el rango habitual.

### 12.4 Borrar una escena

Borra `assets/audio/<id>/0N.wav`. No hay que tocar código. La app la ignorará en
la siguiente sesión.

### 12.5 Laboratorio

- **Añadir un instrumento:** ver el final de 7.13. Solo se tocan
  `lab/engine/schema.js`, `lab/engine/voices/` y `lab/engine/index.js`.
- **Cambiar el sonido de un instrumento:** si la salida de proyectos existentes
  cambia, sube `ENGINE_VERSION`.
- **Cambiar el esquema:** sube `sen-lab/N` y añade el paso en
  `migrate(project)`; los proyectos anteriores deben seguir abriéndose.
- **Usar un tema del laboratorio en la app:** exporta con el preajuste
  **Escena para sen** y copia el WAV como `assets/audio/<id>/0N.wav` (de `01`
  a `06`). La app lo descubre sola.

---

## 13. Decisiones y límites

- **Sin persistencia:** la duración y el ambiente no se recuerdan entre visitas.
  El laboratorio es la única excepción: autoguarda el tema en `localStorage`
  (7.9).
- **Sin pausa:** la sesión solo se puede terminar, no pausar. El reloj no se
  detiene si la pestaña pasa a segundo plano.
- **Una sesión a la vez:** no se pueden abrir dos ambientes simultáneamente.
- **Audio local:** todo se sintetiza o se sirve desde el mismo origen; no hay
  peticiones a terceros.
- **Escenas borrables:** el usuario puede conservar solo las que le gusten.
- **Sin banco largo:** se eliminó el MP3 de 10 minutos por peso y por usar una
  síntesis anterior. La app y el laboratorio son la referencia actual.
- **Sin redirects heredados:** solo `/` y `/lab/`; las antiguas rutas
  `/sounds/` y `/sound/` ya no existen.
- **Laboratorio desacoplado:** el editor de `/lab/` tiene su propio motor y no
  depende de los ambientes, de sus escenas ni de sus generadores (7.12).

---

## 14. Historial mínimo

- **4.3:** dos escenas nuevas por ambiente con melodía sutil y pad (escenas
  07–08, publicadas como `03.wav` y `04.wav`); nuevos instrumentos suaves
  (piano de fieltro, arpa, guitarra de nailon, vibráfono y flauta); la app lee
  hasta cuatro escenas (`1/4`); `--scene` admite varias escenas y `--publish`
  escribe las pistas publicadas. Laboratorio: los cinco instrumentos nuevos,
  volumen en la cabecera de pista, **retocar pistas de sen por capas** (7.17),
  ecualización maestra desactivable y sonoridades −24/−25 LUFS; motor
  `sen-synth/2` (corrige un desfase de una muestra del limitador de
  exportación); la escucha hace el fundido final en «duración exacta» y vuelve
  a intentar la calidad completa en cada reproducción; se corrigen textos de
  la guía que describían funciones inexistentes (reordenar y plegar pistas,
  ajustes rápidos de ruido).
- **4.2:** las escenas de cada ambiente se renombran a `01.wav` y `02.wav`; la
  sesión empieza siempre por `01.wav`; la URL indica el ambiente y la pista
  (`#mar/01`) y se actualiza al cambiar de pista; el Wake Lock se readquiere al
  recuperar visibilidad o foco y reintenta si falla.
- **4.1:** instrucciones del laboratorio (`lab/guia.html`), enlazadas desde la
  cabecera, el diálogo de inicio y el atajo `?`; menú rediseñado (cielo místico, sigilos alquímicos con anillo
  rúnico, paralaje, animación de invocación con portal de luz y retorno
  escalonado); nuevas animaciones de fuego, río, viento y bosque; nuevo modelo
  de fuego `hearth` para las escenas 04–05 de `fuego`.
- **4.0:** nuevo laboratorio implementado: editor de música ambiental con 26
  instrumentos, línea de tiempo, escucha en directo, automatización por pista,
  exportación WAV en el navegador (pico real, tres finales, proyecto incrustado),
  render local idéntico con `scripts/render-lab.mjs`, script autónomo,
  importación MIDI, plantillas y modo compacto. Los generadores de escenas se
  mueven a `scripts/lib/` y se retira el mezclador `sen-lab/2`.
- **3.7:** se especifica el nuevo laboratorio: editor de música ambiental con
  línea de tiempo, notas sostenidas y puntuales, ruidos y simulaciones, motor
  propio determinista, escucha en directo y exportación WAV desde el navegador
  y con Node (implementado en 4.0).
- **3.1:** tres paisajes sonoros de alta calidad por ambiente (escenas 04–06,
  22,05 kHz, 30 s, deterministas, bucle sin costura y −23 LUFS), selección
  entre seis escenas y herramienta de análisis de audio.
- **3.6:** el repositorio conserva dos escenas por ambiente; la app sigue
  eligiendo al azar entre las disponibles y muestra `1/2`.
- **3.5:** se retira la X del selector de duración; se cierra al elegir una
  opción, con `Escape` o tocando fuera.
- **3.4:** las etiquetas visibles de duración pasan a `10 MIN`, `15 MIN` y
  `30 MIN`; los nombres accesibles siguen completos.
- **3.3:** se retiran el título y la nota del selector de duración; quedan la X
  y las tres opciones.
- **3.2:** indicador de pista `1/N` con cambio cíclico y crossfade, botón X
  para cerrar la escena, orden de pistas barajado por sesión.
- **3.0:** selector limitado a 10/15/30, eliminación de etiquetas bajo los
  nodos, nueva síntesis de los 14 ambientes con tres escenas y fondo mínimo,
  retirada del banco largo y del generador legacy, esta especificación.
- **2.0:** selector de duración, tres WAV por ambiente con elección aleatoria,
  laboratorio en `/lab/`.
- **1.0:** menú de constelación, sesiones de 10 minutos y catorce animaciones.
