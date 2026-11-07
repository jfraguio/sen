# AGENTS.md

## Recordatorio obligatorio de la URL local

Al terminar cualquier tarea, incluir siempre al final de la respuesta un recordatorio breve de la URL local de pruebas:

- **App:** http://127.0.0.1:4173/
- **Laboratorio:** http://127.0.0.1:4173/lab/

Antes de indicarla, comprobar que el servidor sigue levantado:

```bash
lsof -nP -iTCP:4173 -sTCP:LISTEN
```

Si el puerto ha cambiado, indicar el puerto real en el que esté escuchando el servidor.

## Servidor local

El sitio es estático, sin build. Para levantarlo desde la raíz del repositorio:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

No es necesario ningún paso de compilación.
