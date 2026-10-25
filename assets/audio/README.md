# Escenas de audio

Cada ambiente tiene su propia carpeta con tres escenas en WAV:

```
assets/audio/lluvia/01.wav
assets/audio/lluvia/02.wav
assets/audio/lluvia/03.wav
assets/audio/fuego/01.wav
...
```

Los tres archivos no son copias: cambian el patrón del mismo ambiente. La
síntesis prioriza su carácter (gotas, truenos, chasquidos, olas, trinos…) y
deja el fondo en un plano mínimo.

La aplicación comprueba al iniciar la sesión qué archivos siguen existiendo y
elige uno al azar. Puedes borrar las escenas que no te gusten; no hace falta
tocar código ni configuración. Si dejas una sola, siempre sonará esa.

- Regenerar las tres escenas de todos los ambientes:
  `node scripts/make-audio-variants.mjs`
- Regenerar solo un ambiente: `node scripts/make-audio-variants.mjs --only=lluvia`
- Regenerar la escena 01 con el generador histórico:
  `node scripts/make-placeholder-audio.mjs`

No renombres los archivos si quieres que el frontal los descubra
automáticamente.
