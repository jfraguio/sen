# Escenas de audio

El motor puede generar hasta diez escenas en WAV por ambiente (`01.wav` …
`10.wav`). **Este repositorio conserva seis escenas por ambiente, renombradas
`01.wav` (la que suena por defecto) … `06.wav`.** Todas son bucles de 60 s de
paisaje con una melodía baja: el sonido ambiente manda y la música queda de
fondo (≈ 10 LU por debajo). En el cuento es al revés: la música es lo
principal. Las demás escenas se pueden regenerar con los scripts.

Cada archivo es una escena distinta del mismo ambiente.

- **01–03 · síntesis base** (`scripts/lib/synth.js`): 16 s, mono, 16 kHz. Cambian el
  patrón del sonido y dejan el fondo en un plano mínimo. Ya no se publican.
- **04–06 · paisajes de alta calidad** (`scripts/lib/soundscapes.js`): 60 s, mono,
  22,05 kHz, 16 bits con dither. Usan modelos más fieles (burbujas de
  Minnaert, truenos por sub-ráfagas, cantos de especies reales, cuencos con
  batidos…), reverb, bucle sin costura y sonoridad ≈ −23 LUFS. Las que se
  publican llevan además una melodía baja compuesta para el bucle.
- **07–08 · paisajes con melodía** (mismo motor y formato): el paisaje con una
  melodía por debajo (piano de fieltro, arpa, guitarra de nailon, celesta,
  vibráfono, kalimba, caja de música o flauta suave) y, cuando encaja, un pad
  sostenido o un colchón de cuerdas. Melodías y acordes encajan exactamente
  en frases de 30 s, dos por bucle, y la música lleva su propia sala.
- **09–10 · paisajes nuevos con melodía** (mismo motor y formato): la melodía
  se compone para el minuto entero (la segunda frase responde a la primera).

La música (las capas de `play`, `pads` y `tune`) se nivela sola en `mix` para
quedar `MUSIC_LU` (−10 LU) por debajo del paisaje; para subirla o bajarla en
todas las pistas basta con cambiar esa constante y volver a publicar.

La aplicación comprueba al iniciar la sesión qué archivos existen, empieza
siempre por `01.wav` y permite pasar a la siguiente desde el indicador de pista
(`1/6` → `2/6` → …). Si borras alguna escena, la app usa solo las que queden;
no hace falta tocar código ni configuración.

- Regenerar las escenas 01–03: `node scripts/make-audio-variants.mjs`
  (¡sobrescribe `01.wav` … `03.wav`!)
- Regenerar las escenas 04–10: `node scripts/make-soundscapes.mjs`
- Solo algunas: `node scripts/make-soundscapes.mjs --scene=9,10`
- Las pistas publicadas, con su nombre (`01.wav` … `06.wav`): `node scripts/make-soundscapes.mjs --publish`
- Solo un ambiente: añade `--only=lluvia` a cualquiera de ellos.
- Revisar nivel, picos y costura del bucle: `node scripts/analyze-audio.mjs`

Los generadores mantienen su numeración de generación. La tabla `PUBLISHED` de
`scripts/lib/soundscapes.js` dice de qué escena sale cada pista publicada
(`--publish` la usa). Para publicar otra escena, cambia la tabla o renombra el
archivo a mano.

Para editar una pista (por ejemplo, bajar su pad), ábrela en el laboratorio
(`/lab/` → elige la canción en las plantillas): se abre separada en capas,
cambias sus volúmenes y la exportas con «Escena para sen» para sustituir el
archivo.

| Ambiente | 01 | 02 | 03 | 04 | 05 | 06 |
|---|---|---|---|---|---|---|
| lluvia | Lluvia sobre hojas (04) | Lluvia sobre el lago (05) | Piano junto a la ventana (07) | Lluvia mansa y arpa (08) | Lluvia en el invernadero (09) | Lluvia en el porche (10) |
| tormenta | Tormenta lejana (04) | Tormenta sobre el tejado (05) | Tormenta lejana y cuerdas (07) | Refugio bajo la lluvia (08) | Tormenta en el bosque (09) | Tormenta que se aleja (10) |
| fuego | Chimenea (04) | Hoguera al aire libre (05) | Chimenea y guitarra (07) | Brasas y piano (08) | Estufa de leña y lluvia (09) | Fogata en la playa (10) |
| mar | Playa de arena (04) | Orilla de guijarros (05) | Mar en calma y flauta (07) | Atardecer en la cala (08) | Mar de fondo (09) | Velero en el puerto (10) |
| rio | Arroyo de montaña (04) | Río ancho y sereno (05) | Arroyo y kalimba (07) | Río sereno y celesta (08) | Orilla del río con pájaros (09) | Lluvia sobre el río (10) |
| viento | Brisa entre pinos (04) | Viento de montaña (05) | Brisa y flauta (07) | Valle con viento y cuerdas (08) | Campo de trigo al viento (09) | Viento de invierno en la cabaña (10) |
| espacio | Nebulosa (04) | Órbita (05) | Deriva estelar (07) | Luz lejana (08) | Aurora (09) | Estación orbital (10) |
| cuento | Caja de música (04) | Nana de celesta (06) | Arpa de cuna (07) | Nana al piano (08) | Cuento junto al fuego (09) | Vals de las estrellas (10) |
| meditacion | Cuencos tibetanos (04) | Campanas de viento y respiración (06) | Cuencos y flauta (07) | Jardín zen (08) | Cuencos de cristal (09) | Fuente del monasterio (10) |
| pajaros | Amanecer en el jardín (04) | Bosque en primavera (05) | Mañana con arpa (07) | Prado soleado y piano (08) | Pájaros junto al arroyo (09) | Huerto a mediodía (10) |
| bichos | Pradera de grillos (04) | Grillos arbóreos (06) | Pradera al anochecer (07) | Tarde de verano y guitarra (08) | Noche de luciérnagas (09) | Grillos junto al arroyo (10) |
| bosque | Bosque después de la lluvia (05) | Pinar al atardecer (06) | Claro del bosque (07) | Musgo y gotas (08) | Robledal en otoño (09) | Bosque bajo la lluvia (10) |
| noche | Noche de verano en el campo (04) | Cárabo en el bosque (05) | Noche estrellada (07) | Nocturno junto al lago (08) | Noche de luna llena (09) | Noche en el pinar (10) |
| burbujas | Burbujeo bajo el agua (05) | Acuario (06) | Burbujas y caja de música (07) | Acuario sereno (08) | Pecera de noche (09) | Gotas en la cueva (10) |

Entre paréntesis, la escena del generador de la que sale cada pista.
