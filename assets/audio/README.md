# Escenas de audio

Cada ambiente publica dos escenas en WAV:

```
assets/audio/lluvia/01.wav
assets/audio/lluvia/02.wav
```

- `01.wav` es la escena por defecto; `02.wav` es la alternativa.
- Ambas son paisajes de alta calidad (`scripts/lib/soundscapes.js`): 30 s,
  mono, 22,05 kHz, 16 bits con dither, bucle sin costura y ≈ −23 LUFS.
- El motor puede generar más escenas (síntesis base y variantes con melodía),
  pero no se publican en este repositorio.

La aplicación comprueba al iniciar la sesión qué archivos existen, empieza por
`01.wav` y permite pasar a la siguiente desde el indicador de pista. Si borras
una escena, la app usa solo las que queden; no hace falta tocar código.

- Publicar las dos pistas: `node scripts/make-soundscapes.mjs --publish`
- Solo un ambiente: añade `--only=lluvia`
- Generar escenas de trabajo: `node scripts/make-soundscapes.mjs`
- Revisar nivel, picos y costura: `node scripts/analyze-audio.mjs`

No renombres los archivos si quieres que el frontal los descubra
automáticamente.
