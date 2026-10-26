# Escenas de audio

El motor puede generar hasta seis escenas en WAV por ambiente (`01.wav` …
`06.wav`). **Este repositorio conserva dos escenas por ambiente, renombradas
`01.wav` (la que suena por defecto) y `02.wav` (alternativa).** Las demás se
pueden regenerar con los scripts.

Cada archivo es una escena distinta del mismo ambiente.

- **01–03 · síntesis base** (`scripts/lib/synth.js`): 16 s, mono, 16 kHz. Cambian el
  patrón del sonido y dejan el fondo en un plano mínimo.
- **04–06 · paisajes de alta calidad** (`scripts/lib/soundscapes.js`): 30 s, mono,
  22,05 kHz, 16 bits con dither. Usan modelos más fieles (burbujas de
  Minnaert, truenos por sub-ráfagas, cantos de especies reales, cuencos con
  batidos…), reverb, bucle sin costura y sonoridad ≈ −23 LUFS.

La aplicación comprueba al iniciar la sesión qué archivos existen, empieza
siempre por `01.wav` y permite pasar a `02.wav` desde el indicador de pista. Si
borras `02.wav`, siempre sonará `01.wav`; no hace falta tocar código ni
configuración.

- Regenerar las escenas 01–03: `node scripts/make-audio-variants.mjs`
- Regenerar las escenas 04–06: `node scripts/make-soundscapes.mjs`
- Solo un ambiente: añade `--only=lluvia` a cualquiera de los dos.
- Revisar nivel, picos y costura del bucle: `node scripts/analyze-audio.mjs`

Los generadores mantienen su numeración de generación. Para publicar otra
escena, renómbrala o cópiala como `01.wav` o `02.wav`.
