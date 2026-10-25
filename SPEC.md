# sen · especificación funcional y técnica

**Versión:** 3.2<br>
**Estado:** vigente<br>
**Alcance:** aplicación web, generador de audio y laboratorio de sonido

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
3. **Laboratorio** en `/lab/` para editar la síntesis del ambiente base, mezclar
   capas y exportar los parámetros en JSON.

La aplicación usa **seis escenas de audio por ambiente**. Las escenas no son
copias: cada una es un paisaje distinto del mismo ambiente. Las escenas 01–03
salen de la síntesis base y las 04–06 son paisajes sonoros de alta calidad
(más resolución, bucles más largos y modelos más realistas). Al comenzar una
sesión se elige una al azar entre las que existan en la carpeta del ambiente.

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
| Laboratorio | `/lab/` |
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

- Se dibuja un fondo de constelación animado en `#menu-canvas`.
- Se generan catorce botones circulares, uno por ambiente, en las posiciones
  definidas en `NODE_LAYOUT`.
- Se dibuja una línea suave que une los nodos en el orden de `NODE_PATH`.
- Cada nodo muestra **solo su icono**. No hay texto visible debajo.
- El nombre y la pista del ambiente se conservan en el `aria-label` y en el
  `title` del botón.
- El foco visible usa el color de acento del ambiente.
- En la parte inferior hay un único botón: **`10 minutos`**.

Un clic o toque en un nodo inicia la sesión de ese ambiente con la duración
seleccionada.

### 4.2 Selector de duración

El botón inferior abre un diálogo con:

- Título **“Duración de la sesión”**.
- Botón de cierre **×**.
- Tres opciones, y solo tres: **10 minutos**, **15 minutos**, **30 minutos**.
- Una nota: “La sesión termina con un fundido de 30 segundos”.

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
7. Se baraja el orden de las escenas disponibles y se empieza por la primera
   (`1/N`). La primera pista sigue siendo aleatoria, pero el indicador siempre
   arranca en `1`.
8. Se reproduce la pista en bucle y se arranca la animación del ambiente y el
   reloj de sesión.
9. Se solicita el Screen Wake Lock.
10. Se añade `#<id>` al historial mediante `pushState`.

Durante la sesión:

- La escena llena la pantalla; no hay controles inferiores.
- Arriba a la izquierda hay un indicador discreto `posición/total` (por ejemplo
  `1/6`). Al pulsarlo se pasa a la siguiente pista del ambiente, con un
  crossfade corto y sin reiniciar la sesión ni la barra de progreso.
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
al volver a la pestaña visible, se solicita de nuevo si la sesión sigue activa.
Si la API no está disponible no se muestra ningún error: la app funciona igual.

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
- Los nombres válidos son `01.wav` … `06.wav`.
- Al iniciar cada sesión se hacen seis peticiones `HEAD` con
  `cache: 'no-store'`.
- Solo se consideran las escenas que responden correctamente.
- El orden de las escenas disponibles se baraja al iniciar cada sesión
  (Fisher-Yates). La pista inicial es uniforme entre las disponibles, pero el
  indicador siempre muestra `1/N`.
- Al pulsar el indicador se avanza cíclicamente por ese orden: `1/N`, `2/N`…
  y de nuevo `1/N`. No se reinicia el reloj de la sesión.
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

### 6.1 Tabla general

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

### 6.2 Lluvia · `lluvia`

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
- **Laboratorio:** `intensity` 0.60, `drops` 0.45, `hiss` 0.55, `wind` 0.20,
  `brightness` 0.60.

### 6.3 Tormenta · `tormenta`

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
- **Laboratorio:** `rain` 0.55, `thunder` 0.50, `wind` 0.45, `rumble` 0.55,
  `brightness` 0.50.

### 6.4 Fuego · `fuego`

- **Sensación:** hoguera íntima, con brasas, chasquidos y un resplandor cálido
  irregular.
- **Visual:** 68 partículas de llama en cuatro tonos (crema, ámbar, naranja y
  rojo) y 38 brasas que suben. El fondo es casi negro, con un degradado de calor
  en la mitad inferior y parpadeo continuo.
- **Escena 01 — brasas:** tres grupos de chasquidos y cinco pops graves. El
  fuego está bajo y tranquilo.
- **Escena 02 — fuego vivo:** siete grupos de chasquidos, dieciséis pops y más
  presencia de ascuas.
- **Escena 03 — fuego con viento:** cinco grupos de chasquidos, diez pops y dos
  ráfagas que avivan la llama. Los graves están más presentes.
- **Escena 04 — chimenea:** rugido grave suave, siseo, racimos de chasquidos
  (~1,3 por segundo), ticks finos, estallidos ocasionales de nudos y algún
  silbido de savia, en una sala pequeña.
- **Escena 05 — hoguera al aire libre:** más llama y parpadeo, chasquidos más
  frecuentes (~2,2 por segundo), estallidos, grillos lejanos y brisa.
- **Escena 06 — brasas:** casi sin llama: siseo, ticks escasos, tintineo de
  ascuas (~1,4 por segundo) y dos asentamientos de leña.
- **Laboratorio:** `intensity` 0.55, `crackle` 0.65, `rumble` 0.50, `flicker`
  0.45, `brightness` 0.55.

### 6.5 Mar · `mar`

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
- **Laboratorio:** `speed` 0.45, `depth` 0.60, `foam` 0.50, `wind` 0.25,
  `brightness` 0.55.

### 6.6 Río · `rio`

- **Sensación:** agua clara entre piedras, con remolinos y destellos dorados.
- **Visual:** tres cintas de corriente con tres pasadas de distinto grosor, 54
  vetas de agua y 30 motas doradas. El fondo es verde bosque con reflejos
  turquesa.
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
- **Laboratorio:** `flow` 0.55, `bubbles` 0.40, `width` 0.50, `air` 0.30,
  `brightness` 0.55.

### 6.7 Viento · `viento`

- **Sensación:** ráfagas que atraviesan un paisaje abierto, con hojas y algún
  silbido.
- **Visual:** 30 corrientes onduladas en gris azulado y verdes pálidos, 34 motas
  que se desplazan con el aire y resplandores difusos.
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
- **Laboratorio:** `gust` 0.55, `speed` 0.50, `air` 0.50, `brightness` 0.50.

### 6.8 Espacio · `espacio`

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
- **Laboratorio:** `drone` 0.55, `shimmer` 0.35, `movement` 0.40, `brightness`
  0.50.

### 6.9 Cuento · `cuento`

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
- **Laboratorio:** `pads` 0.55, `notes` 0.55, `tempo` 0.50, `sparkle` 0.40,
  `brightness` 0.55.

### 6.10 Meditación · `meditacion`

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
- **Laboratorio:** `drone` 0.55, `breath` 0.40, `bowls` 0.45, `brightness` 0.50.

### 6.11 Pájaros · `pajaros`

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
- **Laboratorio:** `birds` 0.60, `variety` 0.55, `wind` 0.30, `leaves` 0.40,
  `brightness` 0.55.

### 6.12 Bichos · `bichos`

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
- **Laboratorio:** `crickets` 0.60, `cicadas` 0.45, `air` 0.30, `brightness`
  0.50.

### 6.13 Bosque · `bosque`

- **Sensación:** sombra verde, hojas que se mueven y ramas que crujen.
- **Visual:** siete árboles con copas difusas, tres haces de luz entre troncos y
  44 motas de hojas y polen.
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
- **Laboratorio:** `wind` 0.50, `leaves` 0.55, `birds` 0.35, `rustle` 0.45,
  `brightness` 0.55.

### 6.14 Noche · `noche`

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
- **Laboratorio:** `crickets` 0.55, `owl` 0.35, `wind` 0.30, `drone` 0.40,
  `brightness` 0.40.

### 6.15 Burbujas · `burbujas`

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
- **Laboratorio:** `bubbles` 0.55, `pops` 0.50, `water` 0.50, `fizz` 0.40,
  `brightness` 0.50.

---

## 7. Laboratorio

### 7.1 Acceso

- URL: `/lab/`.
- Es una página independiente que reutiliza `src/config/ambients.js`,
  `src/render/engine.js` y `src/core/variants.js`.
- No requiere registro ni servidor de aplicación.

### 7.2 Funcionalidad

- **Ambiente base:** selector con los catorce ambientes.
- **Síntesis en vivo:** sliders propios de cada ambiente (`BASE_CONTROLS`).
  Los cambios se aplican con un debounce de 180 ms y un crossfade corto.
- **Capas:** bichos, pájaros, lluvia, viento, olas y burbujas. Cada capa usa un
  WAV de su ambiente, elegido al azar entre las escenas disponibles.
- **Ruido ambiente:** capa de ruido marrón con filtro paso bajo.
- **Mezcla:** volumen base, capas, velocidad de las olas, brillo general
  (1000–16000 Hz), volumen maestro.
- **Transporte:** Escuchar / Detener. El contexto de audio se suspende al
  detener.
- **Presets:** Espacio personalizado, Lluvia + grillos, Olas al amanecer, Baño
  de burbujas y Bosque nocturno.
- **Exportación:** descargar JSON o copiarlo al portapapeles.
- **Reset:** vuelve a los valores por defecto.

### 7.3 Esquema JSON

```json
{
  "schema": "sen-lab/2",
  "engine": "synth/1",
  "name": "Lluvia personalizada",
  "base": "lluvia",
  "baseName": "Lluvia",
  "baseParams": {
    "intensity": 0.6,
    "drops": 0.45,
    "hiss": 0.55,
    "wind": 0.2,
    "brightness": 0.6
  },
  "mix": {
    "base": 0.9,
    "noise": 0.12,
    "bichos": 0,
    "pajaros": 0,
    "lluvia": 0,
    "viento": 0,
    "olas": 0,
    "burbujas": 0
  },
  "wavesRate": 1,
  "brightness": 12000,
  "master": 0.85,
  "notes": ""
}
```

Al descargar se añade `savedAt` con la fecha ISO.

---

## 8. Arquitectura técnica

### 8.1 Estructura

```
index.html                  Entrada de la app
SPEC.md                     Esta especificación
README.md                   Guía breve
assets/
  audio/<id>/01..06.wav     Escenas de audio
  audio/README.md           Nota sobre las escenas
  favicon.svg
lab/
  index.html                Laboratorio
  lab.js                    Estado, audio y UI del laboratorio
  lab.css
  synth.js                  Motor de síntesis base y recetas (01–03)
  dsp.js                    Núcleo DSP de alta calidad (04–06)
  sources.js                Fuentes sonoras: agua, viento, fuego, aves…
  soundscapes.js            Recetas de las escenas 04–06
scripts/
  make-audio-variants.mjs   Generador de las escenas 01–03
  make-soundscapes.mjs      Generador de las escenas 04–06
  analyze-audio.mjs         QA: formato, LUFS, picos, costura, espectrogramas
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

### 8.2 Módulos de la app

- **`src/config/ambients.js`**: exporta `APP`, `ambients` y `hexToRgb`. Es la
  única fuente de verdad para nombres, iconos, paletas, animaciones y carpetas
  de audio.
- **`src/config/icons.js`**: mapa de iconos SVG. `iconSvg(name)` devuelve el
  marcado o el icono de lluvia como fallback.
- **`src/core/session.js`**: reloj basado en `performance.now()` con fases
  `running`, `hold`, `manual` y `done`. Emite snapshots `{ phase, elapsed,
  light, gain }`.
- **`src/core/audio.js`**: envuelve `AudioContext`, `AudioBufferSourceNode` y
  un `GainNode` por voz. Cachea buffers por URL, hace loop, aplica la ganancia
  de sesión y cruza pistas con un crossfade corto. Si falla, avisa mediante
  `onError` sin cortar la pista que ya suena.
- **`src/core/variants.js`**: `resolveAudioVariants(directory, prefix)` devuelve
  las rutas existentes; `pickAudioVariant(paths)` elige una al azar.
- **`src/core/wake-lock.js`**: solicita y libera el bloqueo de pantalla; vuelve
  a solicitarlo al recuperar visibilidad.
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
  tracks,        // escenas disponibles, en orden barajado
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

- Formato de las escenas 01–03: WAV PCM mono, 16 kHz, 16 bits, 16 s
  (~500 KB por escena; 42 escenas ≈ 21 MB).
- Formato de las escenas 04–06: WAV PCM mono, 22,05 kHz, 16 bits con dither
  TPDF, 30 s (~1,3 MB por escena; 42 escenas ≈ 54 MB).
- Nivel: todas las escenas rondan −23 LUFS (las 04–06 se normalizan a −23,
  o −24/−25 en las escenas musicales y espaciales) con pico ≤ −3 dBFS.
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
- El menú dibuja un fondo de Vía Láctea y una constelación; los nodos y la línea
  son DOM/SVG.
- La sesión dibuja la animación del ambiente seleccionado y aplica un velo
  negro (`#dim`) para el fundido.
- `prefers-reduced-motion` dibuja una composición estática en `t = 2.4`.

### 8.7 Generación de audio

`lab/synth.js` es la fuente de verdad de la síntesis. Cada receta acepta un
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

Los valores de “Laboratorio” de la sección 6 son los de esta síntesis base.

### 8.8 Paisajes de alta calidad (escenas 04–06)

`lab/soundscapes.js` define tres recetas por ambiente (`SCENES[id]`) que
mezclan fuentes de `lab/sources.js` sobre el núcleo de `lab/dsp.js`. Son
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
- **Espacio:** reverb FDN de 8 líneas con difusores y amortiguación; cada
  fuente se aleja con pérdida de agudos, de nivel y más envío a reverb.
- **Mezcla y masterización:** cada capa se normaliza por su nivel activo y se
  limita su cresta; después, filtro de DC, sonoridad integrada (BS.1770
  aproximada) a −23 LUFS por defecto, limitador con anticipación a −3 dBFS y
  dither TPDF al escribir a 16 bits.

`scripts/make-soundscapes.mjs` escribe `04.wav`, `05.wav` y `06.wav` sin tocar
las escenas 01–03 y muestra la sonoridad y la reducción del limitador de cada
archivo. Acepta `--only=<id>[,<id>]` y `--scene=<4|5|6>`.

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
- El diálogo de duración tiene `role="dialog"`, título, cierre, `aria-expanded`
  y foco gestionado.
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
- [ ] El botón inferior dice `10 minutos` al cargar.
- [ ] El layout se adapta a móvil vertical, móvil horizontal y escritorio.

### 11.2 Duración

- [ ] Al pulsar el botón se abre el diálogo.
- [ ] Solo aparecen `10 minutos`, `15 minutos` y `30 minutos`.
- [ ] No existe campo de duración personalizada.
- [ ] La opción activa está marcada.
- [ ] Elegir 15 o 30 actualiza el botón y la sesión.
- [ ] `Escape`, la × y un clic fuera cierran el diálogo.
- [ ] El foco vuelve al botón al cerrar con teclado o con la ×.

### 11.3 Sesión

- [ ] Cada uno de los 14 ambientes inicia una sesión.
- [ ] La barra de progreso avanza con la duración elegida.
- [ ] El audio carga una de las seis escenas y suena en bucle.
- [ ] No hay controles inferiores durante la sesión.
- [ ] Un toque termina la sesión con fundido.
- [ ] `Escape` termina la sesión.
- [ ] El botón Atrás termina la sesión.
- [ ] Al terminar se vuelve al menú y el foco vuelve al nodo.
- [ ] El fundido final empieza 30 s antes del final.
- [ ] La sesión natural hace una pausa casi negra de 4 s.

### 11.4 Audio

- [ ] Las 84 escenas existen: 01–03 pesan ~500 KB y 04–06 ~1,3 MB.
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

- [ ] `/lab/` carga sin errores.
- [ ] El selector de ambiente base funciona.
- [ ] Los sliders actualizan la síntesis en directo.
- [ ] Las capas cargan una escena aleatoria.
- [ ] Los presets aplican sus parámetros.
- [ ] Descargar y copiar generan un JSON `sen-lab/2` válido.
- [ ] Reset vuelve a los valores por defecto.
- [ ] Detener suspende el audio.

### 11.7 Generación

- [ ] `node scripts/make-audio-variants.mjs` produce 42 WAV.
- [ ] `--only=lluvia` solo toca `assets/audio/lluvia/`.
- [ ] Los archivos 01–03 tienen 16 s, mono, 16 kHz, 16 bits.
- [ ] `node scripts/make-soundscapes.mjs` produce 42 WAV (04–06) y regenerar
      da archivos idénticos.
- [ ] Los archivos 04–06 tienen 30 s, mono, 22,05 kHz, 16 bits, ≈ −23 LUFS y
      pico ≤ −3 dBFS.
- [ ] No hay NaN, clipping extremo ni saltos audibles en el bucle
      (`node scripts/analyze-audio.mjs` no marca ninguna escena).

---

## 12. Mantenimiento

### 12.1 Añadir un ambiente

1. Añade un objeto a `ambients` en `src/config/ambients.js` con un `id` único,
   `name`, `hint`, `icon`, `audioDir`, `animation`, `accent` y `palette`.
2. Crea el icono en `src/config/icons.js` si la clave es nueva.
3. Crea la animación en `src/render/themes.js` y regístrala en `THEMES`.
4. Añade la receta y los controles en `lab/synth.js`.
5. Añade el ambiente a `BASE_VARIANTS` y `VARIANTS` en
   `scripts/make-audio-variants.mjs`.
6. Genera su audio: `node scripts/make-audio-variants.mjs --only=<id>`.
7. Añade sus tres paisajes a `SCENES` en `lab/soundscapes.js` y genéralos con
   `node scripts/make-soundscapes.mjs --only=<id>`.
8. Añade una posición en `NODE_LAYOUT` y un índice en `NODE_PATH` en
   `src/main.js`.

### 12.2 Cambiar la duración

Edita `APP.durationOptions` en `src/config/ambients.js`. La interfaz se
construye automáticamente a partir de esa lista. Si cambias el valor por
defecto, actualiza también `defaultDurationMin` y el texto inicial del botón en
`index.html` si quieres que coincida antes de cargar JavaScript.

### 12.3 Cambiar una escena de audio

- Escenas 01–03: edita la receta en `lab/synth.js` y, si hace falta, los
  parámetros de `BASE_VARIANTS` / `VARIANTS`; regenera con
  `make-audio-variants.mjs --only=<id>`.
- Escenas 04–06: edita la receta en `lab/soundscapes.js` (o la fuente en
  `lab/sources.js`); regenera con `make-soundscapes.mjs --only=<id>`.
- Verifica con `node scripts/analyze-audio.mjs assets/audio/<id>` que el bucle
  no hace clic y que el nivel está en el rango habitual.

### 12.4 Borrar una escena

Borra `assets/audio/<id>/0N.wav`. No hay que tocar código. La app la ignorará en
la siguiente sesión.

---

## 13. Decisiones y límites

- **Sin persistencia:** la duración y el ambiente no se recuerdan entre visitas.
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

---

## 14. Historial mínimo

- **3.1:** tres paisajes sonoros de alta calidad por ambiente (escenas 04–06,
  22,05 kHz, 30 s, deterministas, bucle sin costura y −23 LUFS), selección
  entre seis escenas y herramienta de análisis de audio.
- **3.2:** indicador de pista `1/N` con cambio cíclico y crossfade, botón X
  para cerrar la escena, orden de pistas barajado por sesión.
- **3.0:** selector limitado a 10/15/30, eliminación de etiquetas bajo los
  nodos, nueva síntesis de los 14 ambientes con tres escenas y fondo mínimo,
  retirada del banco largo y del generador legacy, esta especificación.
- **2.0:** selector de duración, tres WAV por ambiente con elección aleatoria,
  laboratorio en `/lab/`.
- **1.0:** menú de constelación, sesiones de 10 minutos y catorce animaciones.
