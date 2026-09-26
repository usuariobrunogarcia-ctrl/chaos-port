# Sonic Chaos (SMS) — Turquoise Hill Zone 1 en HTML

Recreación del primer nivel de Sonic Chaos (Master System) en HTML/JavaScript.

- **Los assets salen de tu ROM**: gráficos, mapa, colisiones, paletas, objetos y animaciones se extraen en el navegador desde `SonicChaos.sms` (CRC32 `AEDF3BDF`). El repositorio no incluye gráficos extraídos.
- **Se siente igual**: la lógica (física de Sonic, colisiones, cámara, objetos, aparición de objetos) está portada rutina por rutina desde el código Z80 original y se verificó cuadro por cuadro contra la ROM corriendo en un emulador (`tools/lockstep.js`, `tools/frame_check.js`).
- **Pantalla ancha**: 224 líneas de alto y el ancho según la ventana (hasta 512). Las ventanas de actividad de objetos, la cámara y los límites de pantalla están adaptados.

## Cómo jugar

Serví la carpeta del repo con cualquier servidor estático y abrí `web/index.html`:

```bash
python3 -m http.server 8000
# http://localhost:8000/web/index.html
```

Si la ROM está en `Sonic Chaos/SonicChaos.sms` se carga sola. Si no, usá el botón **Cargar ROM** o arrastrá el archivo (también funciona abriendo `web/index.html` directamente).

Controles: flechas/WASD, salto con Z / X / Espacio. Abajo + salto = spin dash, arriba + salto = super peel out. Gamepad y controles táctiles.

## Personajes

Al empezar se elige personaje (← → y Enter, o tocando la tarjeta):

- **Sonic** — el original, sin cambios.
- **Nimbo** — personaje original (una ardilla voladora) que usa el mismo motor: misma física en el suelo, salto un poco más bajo (unos 85 px contra 96) y, si presionás salto otra vez en el aire, **planea** mientras mantengas el botón (cae lento y sigue avanzando).

La lógica está en `web/js/player.js` (`SC.CHARACTERS`) y el dibujo en `web/js/character.js`.

### Hoja de sprites propia

Si existe `web/custom_character.png`, se usa en lugar del arte incluido. Formato: una fila de celdas de 32×32, fondo transparente, mirando a la derecha, pies en la última fila de la celda:

| Celdas | Animación |
| --- | --- |
| 0 | quieto |
| 1–4 | caminar |
| 5–8 | correr |
| 9–12 | bola (salto / rodar) |
| 13–14 | planear |
| 15 | golpeado |

Para partir de una plantilla: `node tools/export_character.js web/custom_character.png` exporta el arte incluido en ese formato.

## Estructura

- `web/js/core.js` — ROM, mapper, RAM con el mismo mapa que el original.
- `web/js/player.js`, `collision.js`, `camera.js` — Sonic.
- `web/js/objects*.js`, `spawner.js`, `bank12.js` — sistema de objetos y scripts de animación.
- `web/js/level.js` — carga del nivel, trabajo de VBlank, bucle principal.
- `web/js/vdp.js`, `render.js` — VRAM y renderizador.
- `web/js/character.js` — gráficos del personaje original y carga de `custom_character.png`.
- `tools/` — herramientas de verificación e ingeniería inversa (emulador de referencia en `tools/re`).

Pendiente: sonido y música.
