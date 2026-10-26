# Escenas de audio

El motor genera hasta seis escenas en WAV por ambiente (`01.wav` … `06.wav`).
**Este repositorio conserva dos escenas por ambiente**, las elegidas
manualmente. Las demás se pueden regenerar con los scripts.

Cada archivo es una escena distinta del mismo ambiente.

- **01–03 · síntesis base** (`scripts/lib/synth.js`): 16 s, mono, 16 kHz. Cambian el
  patrón del sonido y dejan el fondo en un plano mínimo.
- **04–06 · paisajes de alta calidad** (`scripts/lib/soundscapes.js`): 30 s, mono,
  22,05 kHz, 16 bits con dither. Usan modelos más fieles (burbujas de
  Minnaert, truenos por sub-ráfagas, cantos de especies reales, cuencos con
  batidos…), reverb, bucle sin costura y sonoridad ≈ −23 LUFS.

La aplicación comprueba al iniciar la sesión qué archivos siguen existiendo y
elige uno al azar. Puedes borrar más escenas; no hace falta tocar código ni
configuración. Si dejas una sola, siempre sonará esa.

- Regenerar las escenas 01–03: `node scripts/make-audio-variants.mjs`
- Regenerar las escenas 04–06: `node scripts/make-soundscapes.mjs`
- Solo un ambiente: añade `--only=lluvia` a cualquiera de los dos.
- Revisar nivel, picos y costura del bucle: `node scripts/analyze-audio.mjs`

No renombres los archivos si quieres que el frontal los descubra
automáticamente.
