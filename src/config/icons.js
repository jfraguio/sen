/**
 * Iconos del menú: sigilos.
 *
 * Cada ambiente es un glifo de inspiración alquímica y esotérica dibujado con
 * trazo fino sobre una geometría tenue (círculos, triángulos elementales,
 * vesica piscis). Clases:
 *   - sin clase: trazo principal
 *   - i-two:   relleno muy suave bajo el trazo
 *   - i-solid / i-dot: relleno sólido sin trazo
 *   - i-faint: geometría guía, casi invisible
 * 24×24. Los nombres coinciden con el campo `icon` de src/config/ambients.js.
 */

const star4 = (x, y, r = 1.6) => {
  const k = r * 0.28;
  return `<path class="i-solid" d="M${x} ${y - r}L${x + k} ${y - k}L${x + r} ${y}L${x + k} ${y + k}L${x} ${y + r}L${x - k} ${y + k}L${x - r} ${y}L${x - k} ${y - k}Z"/>`;
};

const icons = {
  // Agua: triángulo invertido y gotas que se desvanecen.
  lluvia: `
    <circle class="i-faint" cx="12" cy="12" r="10.2"/>
    <path class="i-faint" d="M2.4 8.4h19.2"/>
    <path class="i-two" d="M4.6 6.4h14.8L12 19.4Z"/>
    <path d="M4.6 6.4h14.8L12 19.4Z"/>
    <path d="M12 1.8v2.4"/>
    <circle class="i-dot" cx="12" cy="9.7" r="1.05"/>
    <circle class="i-dot" cx="12" cy="12.7" r="0.75"/>
    <circle class="i-dot" cx="12" cy="15.3" r="0.48"/>
    <circle class="i-dot" cx="12" cy="21.8" r="0.5"/>
  `,

  // Aire y rayo: triángulo elemental atravesado por la descarga.
  tormenta: `
    <circle class="i-faint" cx="12" cy="12" r="10.2"/>
    <path class="i-faint" d="M12 3.2 20.4 17.8H3.6Z"/>
    <path d="M6.2 13.2h11.6" opacity="0.5"/>
    <path class="i-solid" d="M13.6 4.4 8.6 12.4h3.5l-1.7 6.8 5.7-9h-3.6l1.1-5.8Z"/>
    <circle class="i-dot" cx="4.2" cy="6.2" r="0.55"/>
    <circle class="i-dot" cx="19.8" cy="6.2" r="0.55"/>
    <circle class="i-dot" cx="12" cy="21.6" r="0.5"/>
  `,

  // Fuego: triángulo alquímico con la llama interior y la brasa.
  fuego: `
    <path class="i-faint" d="M3.8 7.4A9.8 9.8 0 0 1 20.2 7.4M20.2 16.6A9.8 9.8 0 0 1 3.8 16.6"/>
    <path class="i-two" d="M12 3.2 20.4 18.2H3.6Z"/>
    <path d="M12 3.2 20.4 18.2H3.6Z"/>
    <path d="M12 8.6c1.8 1.9 2.7 3.2 2.7 4.8a2.7 2.7 0 0 1-5.4 0c0-.9.4-1.7 1.1-2.5.3.9.8 1.4 1.4 1.6-.2-1.5-.1-2.6.2-3.9Z"/>
    <circle class="i-dot" cx="12" cy="21" r="0.75"/>
    <circle class="i-dot" cx="2.6" cy="12" r="0.45"/>
    <circle class="i-dot" cx="21.4" cy="12" r="0.45"/>
  `,

  // Mar: el círculo de las mareas, olas y la luna que las gobierna.
  mar: `
    <circle cx="12" cy="12" r="8.8"/>
    <circle class="i-faint" cx="12" cy="12" r="10.8"/>
    <path class="i-solid" d="M13.9 4.6a2.6 2.6 0 1 1-3.6 3.5 2.2 2.2 0 0 0 3.6-3.5Z"/>
    <path d="M4.4 12.6c1.3-1.2 2.5-1.2 3.8 0s2.5 1.2 3.8 0 2.5-1.2 3.8 0 2.5 1.2 3.8 0"/>
    <path d="M5.8 15.8c1.1-1 2.1-1 3.1 0s2.1 1 3.1 0 2.1-1 3.1 0 2.1 1 3.1 0" opacity="0.65"/>
    <path d="M8.4 18.8c1.2-.9 2.4-.9 3.6 0s2.4.9 3.6 0" opacity="0.4"/>
  `,

  // Río: la corriente como una serpiente dentro de la vesica piscis.
  rio: `
    <path class="i-faint" d="M12 1.8c5.2 3.8 5.2 16.6 0 20.4C6.8 18.4 6.8 5.6 12 1.8Z"/>
    <path class="i-faint" d="M3 12h3.4M17.6 12H21"/>
    <path d="M9.4 3.4c4.6 2.8-2.4 6.2 2.4 8.8s-2.2 6.2 2.6 8.6"/>
    <circle class="i-solid" cx="9.4" cy="3.4" r="1"/>
    <circle class="i-dot" cx="17.6" cy="6.6" r="0.6"/>
    <circle class="i-dot" cx="6.4" cy="17.4" r="0.6"/>
    ${star4(18.6, 18, 1.2)}
  `,

  // Viento: espiral que se abre bajo el triángulo del aire.
  viento: `
    <path class="i-faint" d="M12 2.8 21 18.4H3Z"/>
    <path class="i-faint" d="M6.8 13.4h10.4"/>
    <path d="M12 12a1 1 0 0 1 2 0 2 2 0 0 1-4 0 3 3 0 0 1 6 0 4 4 0 0 1-8 0 5 5 0 0 1 10 0"/>
    <path d="M18 12h3.4"/>
    <path d="M2.6 17.6h6.2M4.6 20.2h8.4" opacity="0.55"/>
    <circle class="i-dot" cx="21.4" cy="12" r="0.55"/>
  `,

  // Espacio: órbita, planeta y estrella guía.
  espacio: `
    <circle class="i-faint" cx="12" cy="12" r="10.2"/>
    <ellipse cx="12" cy="12" rx="9.4" ry="3.3" transform="rotate(-28 12 12)"/>
    <circle class="i-two" cx="12" cy="12" r="3.5"/>
    <circle cx="12" cy="12" r="3.5"/>
    <circle class="i-solid" cx="19.6" cy="8" r="1.05"/>
    ${star4(5.4, 4.8, 1.9)}
    <circle class="i-dot" cx="6.2" cy="18" r="0.5"/>
    <circle class="i-dot" cx="17.4" cy="19.6" r="0.4"/>
  `,

  // Cuento: el ojo que imagina, dentro del triángulo y con rayos.
  cuento: `
    <path class="i-faint" d="M12 2 22 19.6H2Z"/>
    <path d="M12 4.2v1.9M8 6l.9 1.5M16 6l-.9 1.5" opacity="0.7"/>
    <path class="i-two" d="M5 13.4c3.8-4.4 10.2-4.4 14 0-3.8 4.4-10.2 4.4-14 0Z"/>
    <path d="M5 13.4c3.8-4.4 10.2-4.4 14 0-3.8 4.4-10.2 4.4-14 0Z"/>
    <circle cx="12" cy="13.4" r="2.2"/>
    <circle class="i-solid" cx="12" cy="13.4" r="0.95"/>
    <circle class="i-dot" cx="12" cy="21.8" r="0.45"/>
  `,

  // Meditación: loto sobre la línea de la calma.
  meditacion: `
    <circle class="i-faint" cx="12" cy="12" r="10.2"/>
    <circle class="i-faint" cx="12" cy="12" r="6.2"/>
    <path class="i-two" d="M12 5.2c2.5 2.5 2.5 8.1 0 11-2.5-2.9-2.5-8.5 0-11Z"/>
    <path d="M12 5.2c2.5 2.5 2.5 8.1 0 11-2.5-2.9-2.5-8.5 0-11Z"/>
    <path d="M12 16.2c-3.5-.2-6.4-2.5-7-6.2 3.1.2 5.6 1.9 7 6.2Z"/>
    <path d="M12 16.2c3.5-.2 6.4-2.5 7-6.2-3.1.2-5.6 1.9-7 6.2Z"/>
    <path d="M6.2 19h11.6" opacity="0.6"/>
    <circle class="i-dot" cx="12" cy="2.6" r="0.75"/>
  `,

  // Pájaros: el vuelo que asciende sobre el sol naciente.
  pajaros: `
    <path class="i-faint" d="M3.2 19.4a8.8 8.8 0 0 1 17.6 0"/>
    <path d="M2.4 19.4h19.2" opacity="0.55"/>
    <path class="i-two" d="M3.6 9.2c3.6-.4 6.6 1.3 8.4 4.6 1.8-3.3 4.8-5 8.4-4.6-2.9.9-5.2 3-6.6 6.1-.7-.5-1.2-.7-1.8-.7s-1.1.2-1.8.7c-1.4-3.1-3.7-5.2-6.6-6.1Z"/>
    <path d="M3.6 9.2c3.6-.4 6.6 1.3 8.4 4.6 1.8-3.3 4.8-5 8.4-4.6-2.9.9-5.2 3-6.6 6.1-.7-.5-1.2-.7-1.8-.7s-1.1.2-1.8.7c-1.4-3.1-3.7-5.2-6.6-6.1Z"/>
    <circle class="i-solid" cx="12" cy="12.4" r="0.9"/>
    <path d="M15.6 4.4l1 .8 1-.8M18.6 6l.7.6.7-.6" opacity="0.6"/>
  `,

  // Bichos: la polilla nocturna, simétrica como un emblema.
  bichos: `
    <circle class="i-faint" cx="12" cy="12.4" r="10"/>
    <ellipse class="i-two" cx="12" cy="13.2" rx="1.5" ry="4.8"/>
    <ellipse cx="12" cy="13.2" rx="1.5" ry="4.8"/>
    <path d="M10.6 10.6C7 6.8 3.4 7.8 3.6 11.2c.2 2.8 3.4 3.4 6.9 2.2"/>
    <path d="M13.4 10.6c3.6-3.8 7.2-2.8 7 .6-.2 2.8-3.4 3.4-6.9 2.2"/>
    <path d="M10.6 14.8c-2.6 1.6-4 3.6-2.8 5 1.2 1.2 3-.4 4-2.6" opacity="0.75"/>
    <path d="M13.4 14.8c2.6 1.6 4 3.6 2.8 5-1.2 1.2-3-.4-4-2.6" opacity="0.75"/>
    <path d="M11.3 8.6c-.4-2-1.4-3.4-2.8-4M12.7 8.6c.4-2 1.4-3.4 2.8-4"/>
    <circle class="i-dot" cx="8.5" cy="4.6" r="0.6"/>
    <circle class="i-dot" cx="15.5" cy="4.6" r="0.6"/>
    <circle class="i-solid" cx="6.6" cy="10.8" r="0.8"/>
    <circle class="i-solid" cx="17.4" cy="10.8" r="0.8"/>
  `,

  // Bosque: el árbol-runa, con ramas y raíces.
  bosque: `
    <circle class="i-faint" cx="12" cy="12" r="10.2"/>
    <path d="M12 3.4v16.4"/>
    <path d="M12 9.4 6.6 4.4M12 9.4l5.4-5"/>
    <path d="M12 13.8 7.2 9.8M12 13.8l4.8-4"/>
    <path d="M12 19.8 8.8 21.6M12 19.8l3.2 1.8" opacity="0.6"/>
    <circle class="i-solid" cx="12" cy="3.4" r="0.9"/>
    <circle class="i-dot" cx="6.6" cy="4.4" r="0.55"/>
    <circle class="i-dot" cx="17.4" cy="4.4" r="0.55"/>
    <circle class="i-dot" cx="7.2" cy="9.8" r="0.45"/>
    <circle class="i-dot" cx="16.8" cy="9.8" r="0.45"/>
  `,

  // Noche: la triple luna (creciente, llena y menguante) bajo una estrella.
  noche: `
    <circle class="i-two" cx="12" cy="12.6" r="3.6"/>
    <circle cx="12" cy="12.6" r="3.6"/>
    <path class="i-two" d="M6.4 8.4A4.4 4.4 0 0 0 6.4 16.8 5.6 5.6 0 0 1 6.4 8.4Z"/>
    <path d="M6.4 8.4A4.4 4.4 0 0 0 6.4 16.8 5.6 5.6 0 0 1 6.4 8.4Z"/>
    <path class="i-two" d="M17.6 8.4a4.4 4.4 0 0 1 0 8.4 5.6 5.6 0 0 0 0-8.4Z"/>
    <path d="M17.6 8.4a4.4 4.4 0 0 1 0 8.4 5.6 5.6 0 0 0 0-8.4Z"/>
    ${star4(12, 4.2, 1.9)}
    <path class="i-faint" d="M3.2 20.6h17.6"/>
    <circle class="i-dot" cx="4" cy="4.6" r="0.45"/>
    <circle class="i-dot" cx="20" cy="4.6" r="0.45"/>
  `,

  // Burbujas: tres esferas entrelazadas, como una trinidad de agua.
  burbujas: `
    <circle class="i-faint" cx="12" cy="12.4" r="10"/>
    <circle class="i-two" cx="12" cy="8.8" r="4"/>
    <circle cx="12" cy="8.8" r="4"/>
    <circle cx="8.6" cy="14.6" r="4"/>
    <circle cx="15.4" cy="14.6" r="4"/>
    <circle class="i-solid" cx="12" cy="12.6" r="0.85"/>
    <path d="M9.9 7.4a2.3 2.3 0 0 1 1.6-1" opacity="0.7"/>
    <circle class="i-dot" cx="3.8" cy="6.2" r="0.55"/>
    <circle class="i-dot" cx="20.2" cy="5.2" r="0.75"/>
  `,
};

export function iconSvg(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.lluvia}</svg>`;
}

/**
 * Marco del nodo: anillo con marcas, tres puntos y un arco abierto. Gira
 * despacio por CSS; se dibuja en un viewBox de 100×100.
 */
export function ringSvg() {
  let ticks = '';
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const r1 = k % 6 === 0 ? 43 : 45;
    const x1 = 50 + Math.cos(a) * r1;
    const y1 = 50 + Math.sin(a) * r1;
    const x2 = 50 + Math.cos(a) * 47.5;
    const y2 = 50 + Math.sin(a) * 47.5;
    ticks += `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <circle class="r-orbit" cx="50" cy="50" r="47.5"/>
    <path class="r-ticks" d="${ticks}"/>
    <path class="r-arc" d="M50 8.5A41.5 41.5 0 0 1 91.5 50"/>
    <circle class="r-gem" cx="50" cy="2.5" r="1.6"/>
    <circle class="r-gem" cx="91.1" cy="73.75" r="1.1"/>
    <circle class="r-gem" cx="8.9" cy="73.75" r="1.1"/>
  </svg>`;
}
