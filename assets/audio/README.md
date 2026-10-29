# Escenas de audio

El motor puede generar hasta ocho escenas en WAV por ambiente (`01.wav` …
`08.wav`). **Este repositorio conserva cuatro escenas por ambiente, renombradas
`01.wav` (la que suena por defecto), `02.wav`, `03.wav` y `04.wav`.** `01` y
`02` son paisaje puro; `03` y `04` son el paisaje con una melodía sutil. Las
demás se pueden regenerar con los scripts.

Cada archivo es una escena distinta del mismo ambiente.

- **01–03 · síntesis base** (`scripts/lib/synth.js`): 16 s, mono, 16 kHz. Cambian el
  patrón del sonido y dejan el fondo en un plano mínimo.
- **04–06 · paisajes de alta calidad** (`scripts/lib/soundscapes.js`): 30 s, mono,
  22,05 kHz, 16 bits con dither. Usan modelos más fieles (burbujas de
  Minnaert, truenos por sub-ráfagas, cantos de especies reales, cuencos con
  batidos…), reverb, bucle sin costura y sonoridad ≈ −23 LUFS.
- **07–08 · paisajes con melodía** (mismo motor y formato): el paisaje con una
  melodía sutil por debajo (piano de fieltro, arpa, guitarra de nailon,
  celesta, vibráfono, kalimba, caja de música o flauta suave) y, cuando encaja,
  un pad sostenido o un colchón de cuerdas. Melodías y acordes encajan
  exactamente en los 30 s del bucle y la música lleva su propia sala.

La aplicación comprueba al iniciar la sesión qué archivos existen, empieza
siempre por `01.wav` y permite pasar a la siguiente desde el indicador de pista
(`1/4` → `2/4` → …). Si borras alguna escena, la app usa solo las que queden;
no hace falta tocar código ni configuración.

- Regenerar las escenas 01–03: `node scripts/make-audio-variants.mjs`
- Regenerar las escenas 04–08: `node scripts/make-soundscapes.mjs`
- Solo las musicales: `node scripts/make-soundscapes.mjs --scene=7,8`
- Las pistas publicadas, con su nombre (`01.wav` … `04.wav`): `node scripts/make-soundscapes.mjs --publish`
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

| Ambiente | 03 (generada como 07) | 04 (generada como 08) |
|---|---|---|
| lluvia | Piano junto a la ventana | Lluvia mansa y arpa |
| tormenta | Tormenta lejana y cuerdas | Refugio bajo la lluvia |
| fuego | Chimenea y guitarra | Brasas y piano |
| mar | Mar en calma y flauta | Atardecer en la cala |
| rio | Arroyo y kalimba | Río sereno y celesta |
| viento | Brisa y flauta | Valle con viento y cuerdas |
| espacio | Deriva estelar | Luz lejana |
| cuento | Arpa de cuna | Nana al piano |
| meditacion | Cuencos y flauta | Jardín zen |
| pajaros | Mañana con arpa | Prado soleado y piano |
| bichos | Pradera al anochecer | Tarde de verano y guitarra |
| bosque | Claro del bosque | Musgo y gotas |
| noche | Noche estrellada | Nocturno junto al lago |
| burbujas | Burbujas y caja de música | Acuario sereno |
