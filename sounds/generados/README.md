# Ambientes sintéticos largos

Versiones de 10 minutos de los 13 ambientes generados con
`scripts/make-placeholder-audio.mjs --long`. Son las mismas texturas que los
placeholders de 16 s, pero con eventos y modulaciones repartidos a lo largo de
toda la pista para evitar que se note el bucle.

- Formato: MP3 mono, 64 kbps, 16000 Hz.
- Duración: 10:00 por pista.
- Peso total: 60 MB.
- Carácter: ruido filtrado, drones, gotas, chasquidos y melodías sintetizadas.

## Escuchar

Desde la raíz del proyecto:

```bash
python3 -m http.server 4174
```

Y abre <http://localhost:4174/sounds/generados/>.

## Regenerar

```bash
node scripts/make-placeholder-audio.mjs --long
```

La carpeta `sounds/generados/` se incluye en el repositorio y se publica con
la app. Para usar uno de estos MP3 en la app, copia el archivo a
`assets/audio/` y apunta el ambiente correspondiente en
`src/config/ambients.js`.

## Pistas

- `lluvia.mp3` — Lluvia: Azules oscuros, gotas y aire húmedo.
- `tormenta.mp3` — Tormenta: Lluvia, viento y truenos que llegan de lejos.
- `fuego.mp3` — Fuego: Brasas, chasquidos y un resplandor irregular.
- `mar.mp3` — Mar: Oleaje lento, espuma y resaca.
- `rio.mp3` — Río: Agua entre piedras, con pájaros al fondo.
- `viento.mp3` — Viento: Ráfagas, hojas y corriente.
- `espacio.mp3` — Espacio: Drones graves, polvo estelar y destellos.
- `cuento.mp3` — Cuento: Kalimba, pads y melodías oníricas.
- `meditacion.mp3` — Meditación: Drone profundo, respiración y cuencos.
- `pajaros.mp3` — Pájaros: Trinos, hojas y luz de amanecer.
- `bichos.mp3` — Bichos: Grillos, cigarras y luciérnagas.
- `bosque.mp3` — Bosque: Hojas, ramas y sombra verde.
- `noche.mp3` — Noche: Grillos lejanos, búho y luna.
