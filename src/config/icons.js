/**
 * Iconos del menú.
 *
 * Estilo común: 24×24, trazo fino y una capa de relleno suave para dar volumen.
 * Para cambiar un icono, edita su marcado aquí. Los nombres coinciden con el
 * campo `icon` de src/config/ambients.js.
 */

const icons = {
  lluvia: `
    <path class="i-two" d="M6.9 14.3h9.7a3.7 3.7 0 0 0 .3-7.3 5.7 5.7 0 0 0-10.9 0 3.4 3.4 0 0 0 .9 7.3Z"/>
    <path d="M6.9 14.3h9.7a3.7 3.7 0 0 0 .3-7.3 5.7 5.7 0 0 0-10.9 0 3.4 3.4 0 0 0 .9 7.3Z"/>
    <path class="i-solid" d="M8.4 16.4c.9.9 1.3 1.6 1.3 2.2a1.3 1.3 0 1 1-2.6 0c0-.6.5-1.3 1.3-2.2Z"/>
    <path class="i-solid" d="M12 16.4c.9.9 1.3 1.6 1.3 2.2a1.3 1.3 0 1 1-2.6 0c0-.6.5-1.3 1.3-2.2Z"/>
    <path class="i-solid" d="M15.6 16.4c.9.9 1.3 1.6 1.3 2.2a1.3 1.3 0 1 1-2.6 0c0-.6.5-1.3 1.3-2.2Z"/>
  `,

  tormenta: `
    <path class="i-solid" d="M13.8 2.6 6.8 13.8h4.6l-1.8 7.6 8.2-11.7h-4.9l1.1-7.1Z"/>
    <path d="M5.1 8.3c1.2 0 2.1.7 2.6 1.8M4.7 12.7h2.5M19.4 10.4c1.1 0 1.9.6 2.4 1.7" opacity="0.55"/>
    <path class="i-soft-line" d="M5.7 16.9 4.7 19.6M19.9 15.9l1 2.7"/>
  `,
  fuego: `
    <path class="i-two" d="M12 2.8c2.9 3.7 5 5.8 5 9.3a5 5 0 0 1-10 0c0-2.1.9-3.7 2.5-5.4.2 1.8 1 2.8 2.1 3.4.1-2.8.3-4.7.4-7.3Z"/>
    <path d="M12 2.8c2.9 3.7 5 5.8 5 9.3a5 5 0 0 1-10 0c0-2.1.9-3.7 2.5-5.4.2 1.8 1 2.8 2.1 3.4.1-2.8.3-4.7.4-7.3Z"/>
    <path class="i-solid" d="M12 19.6c1.7 0 3-1.3 3-3 0-1.5-1-2.6-3-4.4-2 1.8-3 2.9-3 4.4 0 1.7 1.3 3 3 3Z"/>
    <circle class="i-dot" cx="8.2" cy="7.3" r="0.8"/>
    <circle class="i-dot" cx="17.1" cy="10.2" r="0.55"/>
  `,

  mar: `
    <circle cx="18" cy="5.8" r="2.1" opacity="0.5"/>
    <path d="M2.5 10.5c2.4-2.9 4.7-2.9 7.1 0s4.7 2.9 7.1 0c1.4-1.7 2.8-2.4 4.3-2.1"/>
    <path d="M2.5 14.8c2.4-2.9 4.7-2.9 7.1 0s4.7 2.9 7.1 0c1.4-1.7 2.8-2.4 4.3-2.1"/>
    <path d="M2.5 19.1c2.4-2.9 4.7-2.9 7.1 0s4.7 2.9 7.1 0c1.4-1.7 2.8-2.4 4.3-2.1" opacity="0.55"/>
  `,

  rio: `
    <path d="M8.8 2.8c5.1 4.1-2.8 7.2 2.1 11.3s-2.6 5.4 2.3 7.4" stroke-width="3.4" opacity="0.16"/>
    <path d="M8.8 2.8c5.1 4.1-2.8 7.2 2.1 11.3s-2.6 5.4 2.3 7.4"/>
    <path d="M14 6.4c2.5 2.4-1.5 5 1.2 7.6" opacity="0.6"/>
    <circle class="i-dot" cx="6.6" cy="9.7" r="1"/>
    <circle class="i-dot" cx="16.3" cy="17.3" r="1.25"/>
    <path class="i-solid" d="M18.5 4.2l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6Z"/>
  `,

  viento: `
    <path d="M2.8 8.4h9.4a2.7 2.7 0 1 0-2.7-2.7"/>
    <path d="M2.8 12.4h13.4a2.8 2.8 0 1 1-2.8 2.8"/>
    <path d="M2.8 16.4h6.8"/>
    <path class="i-solid" d="M18.2 4.6c1.9 0 3.2 1 3.2 2.4 0 1.2-1 2-2.2 2h-1.4c.8-.6 1.2-1.1 1.2-1.8 0-.8-.7-1.3-1.7-1.3v-1.3Z" opacity="0.5"/>
  `,

  espacio: `
    <ellipse cx="12" cy="12.3" rx="9.2" ry="3.4" transform="rotate(-24 12 12.3)" opacity="0.55"/>
    <circle class="i-two" cx="12" cy="12.3" r="4.7"/>
    <circle cx="12" cy="12.3" r="4.7"/>
    <circle class="i-dot" cx="10.3" cy="10.5" r="0.7"/>
    <path class="i-solid" d="M5.2 5.3l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5Z"/>
    <path class="i-solid" d="M18.6 16.7l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5Z"/>
  `,

  cuento: `
    <path class="i-two" d="M12 6.5C10 4.9 7.4 4.6 4.4 4.9v13.3c3-.3 5.6 0 7.6 1.7 2-1.7 4.6-2 7.6-1.7V4.9c-3-.3-5.6 0-7.6 1.6Z"/>
    <path d="M12 6.5C10 4.9 7.4 4.6 4.4 4.9v13.3c3-.3 5.6 0 7.6 1.7 2-1.7 4.6-2 7.6-1.7V4.9c-3-.3-5.6 0-7.6 1.6Z"/>
    <path d="M12 6.5v13.4"/>
    <path d="M6.8 8.2c1.1 0 2 .2 2.9.6M6.8 11c1.1 0 2 .2 2.9.6" opacity="0.6"/>
    <path class="i-solid" d="M18.1 2.2l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6Z"/>
  `,

  meditacion: `
    <circle cx="12" cy="12" r="8.4" opacity="0.45"/>
    <circle cx="12" cy="12" r="5.2"/>
    <circle class="i-two" cx="12" cy="12" r="2.5"/>
    <circle class="i-dot" cx="12" cy="12" r="1"/>
    <circle class="i-dot" cx="12" cy="3.6" r="0.7"/>
    <circle class="i-dot" cx="19.2" cy="16" r="0.6"/>
    <circle class="i-dot" cx="4.7" cy="16" r="0.6"/>
  `,

  pajaros: `
    <ellipse class="i-two" cx="10.2" cy="13" rx="5.2" ry="3.6" transform="rotate(-12 10.2 13)"/>
    <ellipse cx="10.2" cy="13" rx="5.2" ry="3.6" transform="rotate(-12 10.2 13)"/>
    <circle class="i-two" cx="15.6" cy="9.6" r="2.5"/>
    <circle cx="15.6" cy="9.6" r="2.5"/>
    <path d="M17.9 9.1l2.4-1-1.5 2.4"/>
    <circle class="i-dot" cx="16.1" cy="9.1" r="0.55"/>
    <path d="M5.3 14.4 2.6 12.9l1 3.2"/>
    <path d="M8.2 16.3v2.5M12.2 16.3v2.5"/>
    <path d="M3.2 21h17.3"/>
    <path d="M8.2 12.6c1.3.8 2.5.9 3.7.2" opacity="0.55"/>
  `,

  bichos: `
    <path class="i-two" d="M12 7.9c3.7 0 6 2.8 6 6.1s-2.4 5.8-6 5.8-6-2.5-6-5.8 2.3-6.1 6-6.1Z"/>
    <path d="M12 7.9c3.7 0 6 2.8 6 6.1s-2.4 5.8-6 5.8-6-2.5-6-5.8 2.3-6.1 6-6.1Z"/>
    <path d="M12 7.9v11.9"/>
    <path d="M9.9 6.3 8.2 4.4M14.1 6.3l1.7-1.9"/>
    <circle class="i-dot" cx="9.4" cy="11.7" r="1.05"/>
    <circle class="i-dot" cx="14.6" cy="11.7" r="1.05"/>
    <circle class="i-dot" cx="10.2" cy="16" r="0.8"/>
    <circle class="i-dot" cx="13.8" cy="16" r="0.8"/>
    <path d="M6.1 12.2 3.7 12M6.1 16.2 3.8 17M17.9 12.2H20.3M17.9 16.2 20.2 17" opacity="0.7"/>
  `,

  bosque: `
    <path class="i-two" d="M8.4 2.7 13 9.2h-2.9l3 4.4H4.1l3-4.4H4.2l4.2-6.5Z"/>
    <path d="M8.4 2.7 13 9.2h-2.9l3 4.4H4.1l3-4.4H4.2l4.2-6.5Z"/>
    <path d="M8.4 13.6v7"/>
    <path class="i-two" d="M16.2 7.1l3.3 4.9h-2.1l2.2 3.1h-6.8l2.2-3.1h-2.1l3.3-4.9Z" opacity="0.75"/>
    <path d="M16.2 7.1l3.3 4.9h-2.1l2.2 3.1h-6.8l2.2-3.1h-2.1l3.3-4.9Z" opacity="0.75"/>
    <path d="M16.2 15.1v5.1" opacity="0.75"/>
    <path d="M2.5 21.2c3-1.4 5.7-1.4 9 0 3.3-1.4 6-1.4 9 0"/>
  `,

  noche: `
    <path class="i-two" d="M16.1 3.7a6.6 6.6 0 1 0 4.2 10.9A7.3 7.3 0 0 1 16.1 3.7Z"/>
    <path d="M16.1 3.7a6.6 6.6 0 1 0 4.2 10.9A7.3 7.3 0 0 1 16.1 3.7Z"/>
    <path class="i-solid" d="M6.3 3.6l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5L4.3 5.6l1.5-.5Z"/>
    <path class="i-solid" d="M19.2 14.3l.4 1.2 1.2.4-1.2.4-.4 1.2-.4-1.2-1.2-.4 1.2-.4Z"/>
    <path d="M2.8 20.2c3-4 5.6-4 8.6 0 2.5-3 5-3 7.5 0"/>
  `,

  burbujas: `
    <circle class="i-two" cx="9.2" cy="13.5" r="5.5"/>
    <circle cx="9.2" cy="13.5" r="5.5"/>
    <circle cx="16.7" cy="7.7" r="3.2" opacity="0.8"/>
    <circle cx="17" cy="17.3" r="2.2" opacity="0.65"/>
    <circle cx="4.6" cy="5.9" r="1.35" opacity="0.75"/>
    <path d="M6.5 11.1c.4-1.5 1.5-2.5 2.8-2.9M15.5 6.4c.3-.8 1-1.4 1.8-1.6" opacity="0.8"/>
    <circle class="i-dot" cx="20.1" cy="12.3" r="0.75"/>
  `,
};

export function iconSvg(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.lluvia}</svg>`;
}
