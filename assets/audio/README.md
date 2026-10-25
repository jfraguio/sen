# Variantes de audio

Cada ambiente tiene su propia carpeta con tres alternativas en WAV:

```
assets/audio/lluvia/01.wav
assets/audio/lluvia/02.wav
assets/audio/lluvia/03.wav
assets/audio/fuego/01.wav
...
```

La aplicación comprueba al iniciar la sesión qué archivos siguen existiendo y
elige uno al azar. Puedes borrar las variantes que no te gusten; no hace falta
tocar código ni configuración. Si dejas una sola, siempre sonará esa.

- `01.wav` conserva el sonido principal de cada ambiente.
- `02.wav` y `03.wav` son variaciones sintéticas.
- Regenerar 02 y 03: `node scripts/make-audio-variants.mjs`
- Regenerar 01: `node scripts/make-placeholder-audio.mjs`

No renombres los archivos si quieres que el frontal los descubra
automáticamente.
