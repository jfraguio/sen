# Escenas de audio

Cada ambiente tiene su propia carpeta con seis escenas en WAV:

```
assets/audio/lluvia/01.wav
...
assets/audio/lluvia/06.wav
assets/audio/fuego/01.wav
...
```

Los archivos no son copias: cada uno es una escena distinta del mismo ambiente.

- **01–03 · síntesis base** (`lab/synth.js`): 16 s, mono, 16 kHz. Cambian el
  patrón del sonido y dejan el fondo en un plano mínimo.
- **04–06 · paisajes de alta calidad** (`lab/soundscapes.js`): 30 s, mono,
  22,05 kHz, 16 bits con dither. Usan modelos más fieles (burbujas de
  Minnaert, truenos por sub-ráfagas, cantos de especies reales, cuencos con
  batidos…), reverb, bucle sin costura y sonoridad ≈ −23 LUFS.

La aplicación comprueba al iniciar la sesión qué archivos siguen existiendo y
elige uno al azar. Puedes borrar las escenas que no te gusten; no hace falta
tocar código ni configuración. Si dejas una sola, siempre sonará esa.

- Regenerar las escenas 01–03: `node scripts/make-audio-variants.mjs`
- Regenerar las escenas 04–06: `node scripts/make-soundscapes.mjs`
- Solo un ambiente: añade `--only=lluvia` a cualquiera de los dos.
- Revisar nivel, picos y costura del bucle: `node scripts/analyze-audio.mjs`

No renombres los archivos si quieres que el frontal los descubra
automáticamente.
