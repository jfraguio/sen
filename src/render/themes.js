/**
 * sen · animaciones
 * -----------------
 * Cada tema es una fábrica: (ambient) => { draw(ctx, t, dt, w, h) }.
 * Las coordenadas de las partículas son normalizadas (0..1), así que la
 * animación se adapta a cualquier tamaño de pantalla sin reiniciarse.
 *
 * Para crear un tema nuevo: añade una fábrica y regístrala en THEMES.
 */

const TAU = Math.PI * 2;
const rand = (min = 0, max = 1) => min + Math.random() * (max - min);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (v) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};

const rgbCache = new Map();

function rgb(hex) {
  let value = rgbCache.get(hex);
  if (value) return value;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = Number.parseInt(h, 16);
  value = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  rgbCache.set(hex, value);
  return value;
}

function rgba(hex, alpha = 1) {
  const { r, g, b } = rgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* --------------------------------------------------------------------------
   Sprites de resplandor reutilizables (mucho más rápidos que crear
   gradientes radiales en cada fotograma).
   -------------------------------------------------------------------------- */

const glowCache = new Map();

function glowSprite(color) {
  let sprite = glowCache.get(color);
  if (sprite) return sprite;
  const size = 128;
  sprite = document.createElement('canvas');
  sprite.width = sprite.height = size;
  const ctx = sprite.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, rgba(color, 1));
  grad.addColorStop(0.2, rgba(color, 0.55));
  grad.addColorStop(0.5, rgba(color, 0.16));
  grad.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  glowCache.set(color, sprite);
  return sprite;
}

function glow(ctx, x, y, size, color, alpha = 1) {
  if (alpha <= 0.001 || size <= 0) return;
  ctx.globalAlpha = clamp01(alpha);
  ctx.drawImage(glowSprite(color), x - size / 2, y - size / 2, size, size);
}

function sparkle(ctx, x, y, radius, color, alpha) {
  if (alpha <= 0.01) return;
  ctx.globalAlpha = clamp01(alpha);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.7, radius * 0.12);
  ctx.beginPath();
  ctx.moveTo(x - radius, y);
  ctx.lineTo(x + radius, y);
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x, y + radius);
  ctx.moveTo(x - radius * 0.42, y - radius * 0.42);
  ctx.lineTo(x + radius * 0.42, y + radius * 0.42);
  ctx.moveTo(x + radius * 0.42, y - radius * 0.42);
  ctx.lineTo(x - radius * 0.42, y + radius * 0.42);
  ctx.stroke();
}

function background(ctx, w, h, stops) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  const n = stops.length;
  stops.forEach((color, i) => grad.addColorStop(n === 1 ? 0 : i / (n - 1), color));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

/* --------------------------------------------------------------------------
   Lluvia · azules oscuros, reflejos y caída vertical suave
   -------------------------------------------------------------------------- */

function rain(ambient) {
  const p = ambient.palette;
  const layers = [
    { count: 64, speed: 0.36, length: 0.028, width: 0.8, alpha: 0.18, drift: 0.012 },
    { count: 46, speed: 0.62, length: 0.05, width: 1.1, alpha: 0.22, drift: 0.026 },
    { count: 30, speed: 0.92, length: 0.085, width: 1.5, alpha: 0.26, drift: 0.04 },
  ];
  const drops = [];
  for (let layer = 0; layer < layers.length; layer++) {
    for (let i = 0; i < layers[layer].count; i++) {
      drops.push({
        layer,
        x: rand(-0.1, 1.05),
        y: rand(-0.3, 1.1),
        alpha: rand(0.55, 1),
      });
    }
  }

  return {
    draw(ctx, t, dt, w, h) {
      background(ctx, w, h, p.sky);

      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, w * (0.32 + Math.sin(t * 0.05) * 0.06), -h * 0.14, Math.max(w, h) * 1.05, p.deep, 0.4);
      glow(ctx, w * (0.7 + Math.cos(t * 0.04) * 0.05), h * 0.12, Math.max(w, h) * 0.72, p.accent, 0.1);
      glow(ctx, w * 0.5, h * 1.12, w * 1.6, p.deep, 0.35);

      ctx.lineCap = 'round';
      for (let layer = 0; layer < layers.length; layer++) {
        const cfg = layers[layer];
        ctx.beginPath();
        for (const drop of drops) {
          if (drop.layer !== layer) continue;
          drop.y += cfg.speed * dt * (0.75 + drop.alpha * 0.3);
          drop.x -= cfg.drift * dt;
          if (drop.y > 1.18) {
            drop.y = rand(-0.25, -0.05);
            drop.x = rand(-0.1, 1.05);
          }
          if (drop.x < -0.12) drop.x += 1.22;
          const x = drop.x * w;
          const y = drop.y * h;
          ctx.moveTo(x, y);
          ctx.lineTo(x - cfg.length * w * 0.28, y + cfg.length * h);
        }
        ctx.strokeStyle = p.accent;
        ctx.globalAlpha = cfg.alpha;
        ctx.lineWidth = cfg.width;
        ctx.stroke();
      }

      // bruma muy tenue en la base
      ctx.globalCompositeOperation = 'lighter';
      const mist = ctx.createLinearGradient(0, h * 0.72, 0, h);
      mist.addColorStop(0, rgba(p.deep, 0));
      mist.addColorStop(1, rgba(p.deep, 0.22));
      ctx.globalAlpha = 1;
      ctx.fillStyle = mist;
      ctx.fillRect(0, h * 0.72, w, h * 0.28);

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

/* --------------------------------------------------------------------------
   Tormenta · crepúsculo, nubarrones y relámpagos
   -------------------------------------------------------------------------- */

function storm(ambient) {
  const p = ambient.palette;
  const clouds = Array.from({ length: 10 }, () => ({
    x: rand(-0.25, 1.2),
    y: rand(-0.08, 0.55),
    size: rand(0.35, 0.85),
    speed: rand(0.004, 0.012) * (Math.random() < 0.5 ? -1 : 1),
    color: Math.random() < 0.5 ? p.cloud : p.rain,
    alpha: rand(0.07, 0.16),
    phase: rand(0, TAU),
  }));

  const drops = Array.from({ length: 90 }, () => ({
    x: rand(-0.1, 1.05),
    y: rand(-0.2, 1.1),
    speed: rand(0.5, 0.95),
    length: rand(0.035, 0.09),
    alpha: rand(0.08, 0.24),
  }));

  let nextStrike = 4 + rand(0, 4);
  let strikeAt = -100;
  let bolt = null;

  function makeBolt() {
    const points = [];
    let x = rand(0.28, 0.72);
    let y = -0.06;
    points.push([x, y]);
    const steps = 11;
    for (let i = 0; i < steps; i++) {
      x += rand(-0.055, 0.055);
      y += rand(0.035, 0.075);
      points.push([x, y]);
    }
    const branch = [points[4]];
    let bx = points[4][0];
    let by = points[4][1];
    for (let i = 0; i < 4; i++) {
      bx += rand(0.01, 0.07) * (Math.random() < 0.5 ? -1 : 1);
      by += rand(0.02, 0.05);
      branch.push([bx, by]);
    }
    return { points, branch };
  }

  function flashAt(t) {
    const age = t - strikeAt;
    if (age < 0 || age > 1.1) return 0;
    const pulse = (start, duration, power) => {
      const local = age - start;
      if (local < 0 || local > duration) return 0;
      return Math.sin((local / duration) * Math.PI) * power;
    };
    return Math.max(pulse(0, 0.16, 1), pulse(0.3, 0.1, 0.7), pulse(0.52, 0.26, 0.5));
  }

  return {
    draw(ctx, t, dt, w, h) {
      if (t > nextStrike) {
        strikeAt = t;
        bolt = makeBolt();
        nextStrike = t + 9 + rand(0, 13);
      }

      background(ctx, w, h, p.sky);
      ctx.globalCompositeOperation = 'lighter';

      for (const cloud of clouds) {
        cloud.x += cloud.speed * dt;
        if (cloud.x > 1.35) cloud.x = -0.25;
        if (cloud.x < -0.35) cloud.x = 1.25;
        const pulse = 0.85 + Math.sin(t * 0.12 + cloud.phase) * 0.15;
        glow(ctx, cloud.x * w, cloud.y * h, cloud.size * Math.max(w, h), cloud.color, cloud.alpha * pulse);
      }

      const flash = flashAt(t);

      // lluvia tenue
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const drop of drops) {
        drop.y += drop.speed * dt;
        drop.x -= drop.speed * 0.14 * dt;
        if (drop.y > 1.15) {
          drop.y = rand(-0.25, -0.05);
          drop.x = rand(-0.1, 1.08);
        }
        ctx.moveTo(drop.x * w, drop.y * h);
        ctx.lineTo(drop.x * w + drop.length * w * 0.12, drop.y * h + drop.length * h);
      }
      ctx.strokeStyle = p.rain;
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 1;
      ctx.stroke();

      // relámpago
      if (flash > 0.01 && bolt) {
        ctx.globalAlpha = flash * 0.24;
        const wash = ctx.createLinearGradient(0, 0, 0, h);
        wash.addColorStop(0, rgba(p.bolt, 0.55));
        wash.addColorStop(0.55, rgba(p.cloud, 0.12));
        wash.addColorStop(1, rgba(p.bolt, 0));
        ctx.fillStyle = wash;
        ctx.fillRect(0, 0, w, h);

        ctx.globalAlpha = flash;
        ctx.strokeStyle = p.bolt;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        for (const pass of [
          { width: 9, alpha: 0.08 },
          { width: 2.2, alpha: 0.85 },
        ]) {
          ctx.globalAlpha = flash * pass.alpha;
          ctx.lineWidth = pass.width;
          ctx.beginPath();
          bolt.points.forEach(([x, y], i) => {
            if (i === 0) ctx.moveTo(x * w, y * h);
            else ctx.lineTo(x * w, y * h);
          });
          ctx.stroke();
          ctx.beginPath();
          bolt.branch.forEach(([x, y], i) => {
            if (i === 0) ctx.moveTo(x * w, y * h);
            else ctx.lineTo(x * w, y * h);
          });
          ctx.stroke();
        }
        glow(ctx, bolt.points[6][0] * w, bolt.points[6][1] * h, Math.max(w, h) * 0.6, p.bolt, flash * 0.18);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

/* --------------------------------------------------------------------------
   Fuego · brasas y resplandor irregular
   -------------------------------------------------------------------------- */

function fire(ambient) {
  const p = ambient.palette;
  const sprites = p.flame.map((color) => glowSprite(color));
  const total = 68;

  function spawn(initial) {
    const life = initial ? rand(0, 0.9) : 0;
    return {
      baseX: 0.5 + rand(-0.16, 0.16),
      life,
      speed: rand(0.24, 0.5),
      size: rand(0.09, 0.22),
      wobble: rand(0, TAU),
      wobbleSpeed: rand(0.6, 1.5),
      shade: rand(0, 1),
    };
  }

  const flames = Array.from({ length: total }, () => spawn(true));
  const embers = Array.from({ length: 38 }, () => ({
    x: rand(0.32, 0.68),
    life: rand(0, 1),
    speed: rand(0.18, 0.42),
    wobble: rand(0, TAU),
    size: rand(0.8, 2.2),
    alpha: rand(0.3, 0.9),
  }));

  function warmColumn(ctx, w, h, t, alpha) {
    const band = [
      { y: 0.98, size: 1.15, color: p.flame[1], a: 0.13 },
      { y: 0.86, size: 0.9, color: p.flame[2], a: 0.12 },
      { y: 0.73, size: 0.68, color: p.flame[2], a: 0.09 },
      { y: 0.6, size: 0.48, color: p.flame[3], a: 0.07 },
      { y: 0.47, size: 0.3, color: p.flame[3], a: 0.05 },
    ];
    band.forEach((layer, index) => {
      const sway = Math.sin(t * (0.9 + index * 0.17) + index) * w * 0.018;
      glow(
        ctx,
        w * 0.5 + sway,
        h * layer.y,
        Math.max(w, h) * layer.size,
        layer.color,
        layer.a * alpha,
      );
    });
  }

  return {
    draw(ctx, t, dt, w, h) {
      background(ctx, w, h, p.sky);
      const unit = Math.min(w, h);
      const flicker = 0.84 + Math.sin(t * 8.7) * 0.08 + Math.sin(t * 14.3 + 1.7) * 0.06;

      ctx.globalCompositeOperation = 'lighter';

      // resplandor continuo de la hoguera
      warmColumn(ctx, w, h, t, flicker);

      // lenguas de partículas
      for (const flame of flames) {
        flame.life += flame.speed * dt;
        if (flame.life >= 1) Object.assign(flame, spawn(false));
        const age = flame.life;
        const x = (flame.baseX + Math.sin(t * flame.wobbleSpeed + flame.wobble) * 0.035 * age) * w;
        const y = h * (1.05 - age * 0.74);
        const size = unit * flame.size * (0.8 + age * 1.1);
        const fade = Math.sin(Math.PI * Math.min(1, age)) ** 0.7;
        const spriteIndex = age < 0.3 ? Math.min(1, Math.floor(flame.shade * 2)) : Math.min(3, 1 + Math.floor(flame.shade * 3));
        ctx.globalAlpha = clamp01(fade * 0.42 * flicker);
        ctx.drawImage(sprites[spriteIndex], x - size / 2, y - size / 2, size, size);
        if (age < 0.42) {
          const coreSize = size * 0.3;
          ctx.globalAlpha = clamp01(fade * 0.5 * (1 - age / 0.42));
          ctx.drawImage(glowSprite(p.flame[0]), x - coreSize / 2, y - coreSize / 2, coreSize, coreSize);
        }
      }

      // brasas
      ctx.fillStyle = p.flame[0];
      for (const ember of embers) {
        ember.life += ember.speed * dt;
        if (ember.life >= 1) {
          ember.life = 0;
          ember.x = rand(0.32, 0.68);
          ember.wobble = rand(0, TAU);
        }
        const x = (ember.x + Math.sin(t * 1.4 + ember.wobble) * 0.035 * ember.life) * w;
        const y = h * (1.03 - ember.life * 0.95);
        ctx.globalAlpha = ember.alpha * Math.sin(Math.PI * ember.life) * 0.75;
        const r = ember.size;
        ctx.fillRect(x - r / 2, y - r / 2, r, r);
      }

      // calor que tiñe la parte alta
      const heat = ctx.createLinearGradient(0, h * 0.55, 0, h);
      heat.addColorStop(0, rgba(p.flame[3], 0));
      heat.addColorStop(1, rgba(p.flame[2], 0.08));
      ctx.globalAlpha = 1;
      ctx.fillStyle = heat;
      ctx.fillRect(0, h * 0.55, w, h * 0.45);

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

/* --------------------------------------------------------------------------
   Mar · oleaje lento y turquesas
   -------------------------------------------------------------------------- */

function sea(ambient) {
  const p = ambient.palette;
  const bands = [
    { y: 0.5, amp: 0.012, freq: 1.5, speed: 0.09, crest: 0.22, top: 0.32, bottom: 0.62 },
    { y: 0.58, amp: 0.016, freq: 1.3, speed: 0.07, crest: 0.3, top: 0.34, bottom: 0.72 },
    { y: 0.67, amp: 0.02, freq: 1.1, speed: 0.055, crest: 0.38, top: 0.3, bottom: 0.82 },
    { y: 0.77, amp: 0.024, freq: 0.95, speed: 0.04, crest: 0.42, top: 0.24, bottom: 0.9 },
    { y: 0.88, amp: 0.028, freq: 0.8, speed: 0.028, crest: 0.46, top: 0.18, bottom: 0.95 },
  ].map((band) => ({ ...band, phase: rand(0, TAU) }));

  const glints = Array.from({ length: 46 }, () => ({
    u: rand(0.02, 0.98),
    band: Math.floor(rand(0, bands.length)),
    phase: rand(0, TAU),
    speed: rand(0.4, 1.2),
    length: rand(0.004, 0.02),
    alpha: rand(0.25, 0.85),
  }));

  function bandY(band, u, t) {
    return (
      band.y +
      Math.sin(u * TAU * band.freq + t * band.speed * 1.6 + band.phase) * band.amp +
      Math.sin(u * TAU * band.freq * 2.2 - t * band.speed) * band.amp * 0.35
    );
  }

  return {
    draw(ctx, t, dt, w, h) {
      background(ctx, w, h, p.sea);

      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, w * 0.74, h * 0.2, Math.max(w, h) * 0.55, p.light, 0.15);
      glow(ctx, w * 0.74, h * 0.26, Math.max(w, h) * 0.2, p.foam, 0.1);
      glow(ctx, w * 0.2, h * 0.9, Math.max(w, h) * 0.8, p.deep, 0.35);

      for (let i = bands.length - 1; i >= 0; i--) {
        const band = bands[i];
        const points = [];
        for (let x = 0; x <= w; x += w / 56) {
          points.push([x, bandY(band, x / w, t) * h]);
        }

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(0, points[0][1]);
        for (const [x, y] of points) ctx.lineTo(x, y);
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        const fill = ctx.createLinearGradient(0, band.y * h, 0, h);
        fill.addColorStop(0, rgba(p.deep, band.top));
        fill.addColorStop(1, rgba(p.sea[2], band.bottom));
        ctx.fillStyle = fill;
        ctx.fill();

        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath();
        ctx.moveTo(0, points[0][1]);
        for (const [x, y] of points) ctx.lineTo(x, y);
        ctx.strokeStyle = p.foam;
        ctx.globalAlpha = band.crest * 0.22;
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.globalAlpha = band.crest;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const glint of glints) {
        const band = bands[glint.band];
        const y = bandY(band, glint.u, t) * h;
        const twinkle = 0.5 + 0.5 * Math.sin(t * glint.speed + glint.phase);
        const x = glint.u * w;
        ctx.globalAlpha = glint.alpha * twinkle;
        ctx.strokeStyle = p.foam;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(x - glint.length * w, y);
        ctx.lineTo(x + glint.length * w, y);
        ctx.stroke();
      }

      // reflejo del resplandor sobre el agua
      const sheen = ctx.createLinearGradient(w * 0.6, 0, w * 0.85, 0);
      sheen.addColorStop(0, rgba(p.light, 0));
      sheen.addColorStop(0.5, rgba(p.light, 0.07));
      sheen.addColorStop(1, rgba(p.light, 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, w, h);

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

/* --------------------------------------------------------------------------
   Río · agua en bosque, turquesas y destellos dorados
   -------------------------------------------------------------------------- */

function river(ambient) {
  const p = ambient.palette;
  const streaks = Array.from({ length: 54 }, () => ({
    x: rand(0.08, 0.92),
    y: rand(-0.1, 1),
    length: rand(0.04, 0.16),
    speed: rand(0.07, 0.2),
    width: rand(0.8, 2.4),
    phase: rand(0, TAU),
    gold: Math.random() < 0.22,
    alpha: rand(0.1, 0.32),
  }));

  const sparkles = Array.from({ length: 30 }, () => ({
    x: rand(0.05, 0.95),
    y: rand(0.05, 0.95),
    phase: rand(0, TAU),
    speed: rand(0.6, 1.8),
    size: rand(0.8, 2),
    drift: rand(0.01, 0.04),
  }));

  return {
    draw(ctx, t, dt, w, h) {
      background(ctx, w, h, p.forest);

      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, w * 0.15, h * 0.1, Math.max(w, h) * 0.65, p.gold, 0.12);
      glow(ctx, w * 0.85, h * 0.95, Math.max(w, h) * 0.8, p.deep, 0.4);
      glow(ctx, w * 0.5, h * 0.55, Math.max(w, h) * 0.6, p.water, 0.07);

      // cintas de corriente
      for (let i = 0; i < 3; i++) {
        const baseY = 0.3 + i * 0.22;
        const amp = 0.03 + i * 0.012;
        for (const pass of [
          { width: 26, alpha: 0.035 },
          { width: 8, alpha: 0.06 },
          { width: 1.4, alpha: 0.13 },
        ]) {
          ctx.beginPath();
          for (let x = 0; x <= w; x += w / 40) {
            const u = x / w;
            const y = (baseY + Math.sin(u * TAU * 1.2 + t * 0.35 + i) * amp + Math.sin(u * TAU * 2.1 - t * 0.2) * amp * 0.4) * h;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = p.water;
          ctx.globalAlpha = pass.alpha;
          ctx.lineWidth = pass.width;
          ctx.stroke();
        }
      }

      // vetas que discurren
      ctx.lineCap = 'round';
      for (const streak of streaks) {
        streak.y += streak.speed * dt;
        if (streak.y > 1.15) {
          streak.y = rand(-0.2, -0.02);
          streak.x = rand(0.08, 0.92);
        }
        const sway = Math.sin(t * 0.6 + streak.phase) * 0.025;
        const x = (streak.x + sway) * w;
        const y = streak.y * h;
        ctx.strokeStyle = streak.gold ? p.gold : p.water;
        ctx.globalAlpha = streak.alpha;
        ctx.lineWidth = streak.width;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.sin(t * 0.8 + streak.phase) * w * 0.012, y + streak.length * h * 0.5, x + sway * w * 0.4, y + streak.length * h);
        ctx.stroke();
      }

      // motas doradas
      for (const dot of sparkles) {
        dot.y -= dot.drift * dt;
        if (dot.y < -0.05) dot.y = 1.05;
        const twinkle = Math.max(0, Math.sin(t * dot.speed + dot.phase));
        ctx.globalAlpha = twinkle * 0.55;
        ctx.fillStyle = p.gold;
        const size = dot.size;
        ctx.fillRect(dot.x * w - size / 2, dot.y * h - size / 2, size, size);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

/* --------------------------------------------------------------------------
   Viento · corrientes difusas gris azuladas y verdes pálidos
   -------------------------------------------------------------------------- */

function wind(ambient) {
  const p = ambient.palette;
  const streams = Array.from({ length: 30 }, (_, i) => ({
    x: rand(-0.2, 1.1),
    y: rand(0.06, 0.95),
    phase: rand(0, TAU),
    speed: rand(0.03, 0.09),
    width: rand(0.7, 2.1),
    alpha: rand(0.08, 0.2),
    color: i % 3 === 0 ? p.pale : i % 3 === 1 ? p.gust : p.haze,
  }));

  const motes = Array.from({ length: 34 }, () => ({
    x: rand(0, 1),
    y: rand(0.05, 0.95),
    size: rand(0.8, 2.4),
    speed: rand(0.01, 0.035),
    phase: rand(0, TAU),
    alpha: rand(0.08, 0.3),
  }));

  return {
    draw(ctx, t, dt, w, h) {
      background(ctx, w, h, p.air);

      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, w * (0.2 + Math.sin(t * 0.04) * 0.08), h * 0.28, Math.max(w, h) * 0.85, p.haze, 0.13);
      glow(ctx, w * (0.8 + Math.cos(t * 0.05) * 0.06), h * 0.72, Math.max(w, h) * 0.9, p.gust, 0.1);
      glow(ctx, w * (0.35 + Math.sin(t * 0.03 + 1) * 0.1), h * 0.08, Math.max(w, h) * 0.6, p.pale, 0.05);

      ctx.lineCap = 'round';
      for (const stream of streams) {
        const startX = ((stream.x + t * stream.speed) % 1.35) - 0.15;
        let x = startX;
        let y = stream.y + Math.sin(t * 0.28 + stream.phase) * 0.04;
        ctx.beginPath();
        ctx.moveTo(x * w, y * h);
        for (let step = 0; step < 46; step++) {
          const angle =
            Math.sin(y * 6.2 + t * 0.45 + stream.phase) * 0.85 +
            Math.cos(x * 4.4 - t * 0.3) * 0.5;
          x += Math.cos(angle * 0.7) * 0.011;
          y += Math.sin(angle * 0.7) * 0.0075;
          ctx.lineTo(x * w, y * h);
        }
        ctx.strokeStyle = stream.color;
        ctx.globalAlpha = stream.alpha;
        ctx.lineWidth = stream.width;
        ctx.stroke();
      }

      for (const mote of motes) {
        mote.x += mote.speed * dt;
        if (mote.x > 1.05) mote.x = -0.05;
        const twinkle = 0.35 + 0.65 * Math.max(0, Math.sin(t * 0.8 + mote.phase));
        ctx.globalAlpha = mote.alpha * twinkle;
        ctx.fillStyle = p.pale;
        const s = mote.size;
        ctx.fillRect(mote.x * w, mote.y * h, s, s);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

/* --------------------------------------------------------------------------
   Espacio · nebulosas, estrellas y destellos
   -------------------------------------------------------------------------- */

function space(ambient) {
  const p = ambient.palette;
  const unitGlow = p.nebula.map((color) => glowSprite(color));

  const nebulae = Array.from({ length: 6 }, (_, i) => ({
    x: rand(0.1, 0.9),
    y: rand(0.1, 0.9),
    size: rand(0.55, 1.1),
    rotation: rand(0, TAU),
    spin: rand(-0.004, 0.004),
    phase: rand(0, TAU),
    alpha: rand(0.09, 0.19),
    color: unitGlow[i % unitGlow.length],
    stretch: rand(1.3, 1.9),
  }));

  const stars = Array.from({ length: 210 }, () => ({
    x: rand(0, 1),
    y: rand(0, 1),
    depth: rand(0.15, 1),
    size: rand(0.4, 1.6),
    phase: rand(0, TAU),
    speed: rand(0.3, 1.1),
    bright: Math.random() < 0.06,
  }));

  let nextShoot = rand(5, 11);
  let shooting = null;

  return {
    draw(ctx, t, dt, w, h) {
      const bg = ctx.createRadialGradient(w * 0.55, h * 0.42, 0, w * 0.55, h * 0.42, Math.max(w, h) * 0.9);
      bg.addColorStop(0, p.void[1]);
      bg.addColorStop(0.6, p.void[0]);
      bg.addColorStop(1, p.void[2]);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'lighter';

      // nebulosas
      for (const nebula of nebulae) {
        nebula.rotation += nebula.spin * dt;
        const breathe = 0.9 + Math.sin(t * 0.06 + nebula.phase) * 0.12;
        const size = nebula.size * Math.max(w, h) * breathe;
        ctx.save();
        ctx.translate(nebula.x * w, nebula.y * h);
        ctx.rotate(nebula.rotation);
        ctx.scale(nebula.stretch, 1);
        ctx.globalAlpha = nebula.alpha;
        ctx.drawImage(nebula.color, -size / 2, -size / 2, size, size);
        ctx.restore();
      }

      // estrellas
      for (const star of stars) {
        star.x -= 0.0016 * star.depth * dt;
        star.y += 0.0007 * star.depth * dt;
        if (star.x < -0.01) star.x = 1.01;
        if (star.y > 1.01) star.y = -0.01;
        const twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * star.speed + star.phase));
        const alpha = clamp01(twinkle * (0.35 + star.depth * 0.65));
        if (star.bright) {
          glow(ctx, star.x * w, star.y * h, star.size * 26, p.star, alpha * 0.32);
          sparkle(ctx, star.x * w, star.y * h, star.size * 4.5, p.star, alpha * 0.55);
        } else {
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.star;
          const s = star.size;
          ctx.fillRect(star.x * w, star.y * h, s, s);
        }
      }

      // estrella fugaz
      if (t > nextShoot) {
        shooting = { x: rand(0.15, 0.85), y: rand(0.08, 0.45), start: t, speed: rand(0.35, 0.65) };
        nextShoot = t + 10 + rand(0, 14);
      }
      if (shooting) {
        const age = t - shooting.start;
        if (age < 1.1) {
          const progress = age / 1.1;
          const headX = (shooting.x + progress * shooting.speed) * w;
          const headY = (shooting.y + progress * shooting.speed * 0.35) * h;
          const tail = 0.09 * w * (1 - progress * 0.4);
          const grad = ctx.createLinearGradient(headX - tail, headY - tail * 0.35, headX, headY);
          grad.addColorStop(0, rgba(p.star, 0));
          grad.addColorStop(1, rgba(p.star, 0.7 * (1 - progress)));
          ctx.strokeStyle = grad;
          ctx.globalAlpha = 1;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(headX - tail, headY - tail * 0.35);
          ctx.lineTo(headX, headY);
          ctx.stroke();
          glow(ctx, headX, headY, 26, p.star, 0.35 * (1 - progress));
        } else {
          shooting = null;
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

/* --------------------------------------------------------------------------
   Cuento · luz onírica, partículas lentas y magia
   -------------------------------------------------------------------------- */

function story(ambient) {
  const p = ambient.palette;
  const motes = Array.from({ length: 52 }, () => ({
    x: rand(0.03, 0.97),
    y: rand(0.05, 0.98),
    size: rand(0.006, 0.035),
    speed: rand(0.006, 0.022),
    phase: rand(0, TAU),
    drift: rand(-0.008, 0.008),
    color: p.warm[Math.floor(rand(0, p.warm.length))],
    alpha: rand(0.18, 0.65),
    twinkle: rand(0.3, 1.4),
  }));

  const sparkles = Array.from({ length: 16 }, () => ({
    x: rand(0.05, 0.95),
    y: rand(0.05, 0.95),
    phase: rand(0, TAU),
    speed: rand(0.3, 0.9),
    size: rand(0.8, 2.4),
  }));

  const ribbons = [
    { y: 0.32, amp: 0.045, speed: 0.1, phase: rand(0, TAU), color: p.warm[0] },
    { y: 0.52, amp: 0.06, speed: 0.075, phase: rand(0, TAU), color: p.warm[2] },
    { y: 0.7, amp: 0.05, speed: 0.055, phase: rand(0, TAU), color: p.warm[1] },
  ];

  return {
    draw(ctx, t, dt, w, h) {
      background(ctx, w, h, p.dream);

      ctx.globalCompositeOperation = 'lighter';
      const breath = 0.5 + 0.5 * Math.sin(t * 0.16);
      glow(ctx, w * 0.3, h * 0.72, Math.max(w, h) * 1.1, p.warm[1], 0.1 + breath * 0.05);
      glow(ctx, w * 0.78, h * 0.22, Math.max(w, h) * 0.8, p.warm[2], 0.09);
      glow(ctx, w * 0.62, h * 0.5, Math.max(w, h) * 0.45, p.warm[0], 0.07 + breath * 0.04);

      // cintas de luz
      for (const ribbon of ribbons) {
        const points = [];
        for (let x = 0; x <= w; x += w / 42) {
          const u = x / w;
          const y =
            (ribbon.y +
              Math.sin(u * TAU * 1.3 + t * ribbon.speed + ribbon.phase) * ribbon.amp +
              Math.sin(u * TAU * 2.4 - t * ribbon.speed * 0.7) * ribbon.amp * 0.35) *
            h;
          points.push([x, y]);
        }
        for (const pass of [
          { width: 34, alpha: 0.025 },
          { width: 10, alpha: 0.05 },
          { width: 1.2, alpha: 0.14 },
        ]) {
          ctx.beginPath();
          points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
          ctx.strokeStyle = ribbon.color;
          ctx.globalAlpha = pass.alpha * (0.7 + breath * 0.4);
          ctx.lineWidth = pass.width;
          ctx.stroke();
        }
      }

      // partículas flotantes
      for (const mote of motes) {
        mote.y -= mote.speed * dt;
        mote.x += mote.drift * dt;
        if (mote.y < -0.05) {
          mote.y = 1.05;
          mote.x = rand(0.03, 0.97);
        }
        if (mote.x < -0.03) mote.x = 1.03;
        if (mote.x > 1.03) mote.x = -0.03;
        const twinkle = 0.45 + 0.55 * Math.max(0, Math.sin(t * mote.twinkle + mote.phase));
        const size = mote.size * Math.min(w, h) * 10;
        glow(ctx, mote.x * w, mote.y * h, size, mote.color, mote.alpha * twinkle);
        if (mote.size > 0.025) {
          glow(ctx, mote.x * w, mote.y * h, size * 0.18, p.warm[0], mote.alpha * twinkle * 0.8);
        }
      }

      // destellos
      for (const star of sparkles) {
        const twinkle = Math.max(0, Math.sin(t * star.speed + star.phase + 0.4));
        sparkle(ctx, star.x * w, star.y * h, star.size, p.warm[0], twinkle * 0.35);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

/* --------------------------------------------------------------------------
   Meditación · respiración lenta y profunda
   -------------------------------------------------------------------------- */

function meditation(ambient) {
  const p = ambient.palette;
  const orbit = Array.from({ length: 22 }, () => ({
    angle: rand(0, TAU),
    radius: rand(0.21, 0.38),
    speed: rand(0.02, 0.07) * (Math.random() < 0.5 ? -1 : 1),
    size: rand(0.8, 2),
    phase: rand(0, TAU),
    alpha: rand(0.12, 0.4),
  }));

  const PERIOD = 10;

  return {
    draw(ctx, t, dt, w, h) {
      background(ctx, w, h, p.deep);
      const unit = Math.min(w, h);
      const cx = w * 0.5;
      const cy = h * 0.52;
      const breath = 0.5 + 0.5 * Math.sin((t / PERIOD) * TAU - Math.PI / 2);
      const scale = 0.72 + breath * 0.45;

      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, cx, cy, unit * 1.2, p.breath[1], 0.14 + breath * 0.06);
      glow(ctx, cx, cy, unit * 0.82 * scale, p.breath[0], 0.1 + breath * 0.06);
      glow(ctx, cx + unit * 0.18, cy - unit * 0.12, unit * 0.46 * scale, p.breath[2], 0.11);
      glow(ctx, cx - unit * 0.24, cy + unit * 0.18, unit * 0.5, p.breath[1], 0.08);

      // anillos que se expanden con la respiración
      for (let i = 0; i < 3; i++) {
        const progress = ((t / PERIOD + i / 3) % 1);
        const radius = unit * (0.1 + progress * 0.44) * (0.85 + breath * 0.15);
        ctx.globalAlpha = (1 - progress) * 0.22;
        ctx.strokeStyle = i % 2 === 0 ? p.breath[0] : p.breath[2];
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, TAU);
        ctx.stroke();
      }

      // orbe central
      const orb = unit * 0.17 * scale;
      const orbGrad = ctx.createRadialGradient(cx - orb * 0.25, cy - orb * 0.3, 0, cx, cy, orb);
      orbGrad.addColorStop(0, rgba(p.breath[0], 0.22 + breath * 0.14));
      orbGrad.addColorStop(0.7, rgba(p.breath[1], 0.07 + breath * 0.05));
      orbGrad.addColorStop(1, rgba(p.breath[1], 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = orbGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, orb, 0, TAU);
      ctx.fill();

      ctx.globalAlpha = 0.24 + breath * 0.12;
      ctx.strokeStyle = p.breath[0];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, orb, 0, TAU);
      ctx.stroke();

      // partículas en órbita
      for (const dot of orbit) {
        dot.angle += dot.speed * dt;
        const radius = unit * dot.radius * (0.9 + breath * 0.1);
        const x = cx + Math.cos(dot.angle) * radius;
        const y = cy + Math.sin(dot.angle) * radius * 0.55;
        const twinkle = 0.4 + 0.6 * Math.max(0, Math.sin(t * 0.5 + dot.phase));
        ctx.globalAlpha = dot.alpha * twinkle;
        ctx.fillStyle = p.breath[0];
        const s = dot.size;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

/* --------------------------------------------------------------------------
   Pájaros · amanecer, bandadas y polen
   -------------------------------------------------------------------------- */

function birds(ambient) {
  const p = ambient.palette;
  const flocks = Array.from({ length: 5 }, (_, index) => ({
    x: rand(0.05, 1.1),
    y: rand(0.12, 0.55),
    speed: rand(0.012, 0.028),
    direction: Math.random() < 0.5 ? -1 : 1,
    count: 3 + Math.floor(rand(0, 3)),
    size: rand(0.012, 0.024),
    spread: rand(0.07, 0.12),
    phase: rand(0, TAU),
    flap: rand(2.8, 5.2),
    index,
  }));

  const dust = Array.from({ length: 40 }, () => ({
    x: rand(0, 1),
    y: rand(0.1, 0.95),
    size: rand(0.6, 2.6),
    speed: rand(0.004, 0.02),
    phase: rand(0, TAU),
    alpha: rand(0.05, 0.3),
  }));

  function drawBird(ctx, x, y, size, flap, alpha) {
    const lift = Math.sin(flap) * size * 0.55;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = p.bird;
    ctx.lineWidth = Math.max(1.1, size * 0.13);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - size, y + lift);
    ctx.quadraticCurveTo(x - size * 0.45, y - size * 0.22, x, y);
    ctx.quadraticCurveTo(x + size * 0.45, y - size * 0.22, x + size, y + lift);
    ctx.stroke();
  }

  function flockY(flock, t, offset, h) {
    return (flock.y + Math.sin(t * 0.25 + flock.phase) * 0.025 + offset * 0.008) * h;
  }

  return {
    draw(ctx, t, dt, w, h) {
      background(ctx, w, h, p.sky);
      const unit = Math.min(w, h);

      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, w * 0.73, h * 0.72, unit * 1.25, p.sun, 0.28);
      glow(ctx, w * 0.72, h * 0.7, unit * 0.52, p.sun, 0.2);
      glow(ctx, w * 0.2, h * 0.25, unit * 0.8, p.leaf, 0.06);
      glow(ctx, w * 0.5, h * 1.04, w * 1.4, p.sky[2], 0.35);

      // nubes bajas y cálidas
      for (let i = 0; i < 3; i++) {
        const x = w * ((i * 0.37 + t * 0.004) % 1.2 - 0.1);
        glow(ctx, x, h * (0.62 + i * 0.05), w * 0.55, p.sun, 0.045);
      }

      // sol naciente
      const sunX = w * 0.73;
      const sunY = h * 0.7;
      const sunR = unit * 0.045;
      const sunGrad = ctx.createRadialGradient(
        sunX - sunR * 0.2,
        sunY - sunR * 0.25,
        0,
        sunX,
        sunY,
        sunR,
      );
      sunGrad.addColorStop(0, rgba(p.sun, 0.95));
      sunGrad.addColorStop(0.6, rgba(p.sun, 0.65));
      sunGrad.addColorStop(1, rgba(p.sun, 0.05));
      ctx.globalAlpha = 1;
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR, 0, TAU);
      ctx.fill();

      // siluetas de pájaros
      ctx.globalCompositeOperation = 'source-over';
      for (const flock of flocks) {
        flock.x += flock.direction * flock.speed * dt;
        if (flock.x > 1.3) flock.x = -0.25;
        if (flock.x < -0.3) flock.x = 1.25;
        for (let i = 0; i < flock.count; i++) {
          const offset = i - (flock.count - 1) / 2;
          const x = (flock.x + offset * flock.spread * flock.direction) * w;
          const y =
            flockY(flock, t, offset, h);
          const size = unit * flock.size * (0.75 + 0.35 * Math.abs(offset));
          drawBird(
            ctx,
            x,
            y,
            size,
            t * flock.flap + flock.phase + i * 0.7,
            0.5 + 0.25 * Math.abs(Math.sin(t * 0.4 + i)),
          );
        }
      }

      ctx.globalCompositeOperation = 'lighter';
      for (const mote of dust) {
        mote.y += mote.speed * dt;
        mote.x += Math.sin(t * 0.2 + mote.phase) * 0.004 * dt;
        if (mote.y > 1.02) {
          mote.y = -0.02;
          mote.x = rand(0, 1);
        }
        const twinkle = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.7 + mote.phase));
        ctx.globalAlpha = mote.alpha * twinkle;
        ctx.fillStyle = p.sun;
        ctx.fillRect(mote.x * w, mote.y * h, mote.size, mote.size);
      }

      // horizonte suave
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = p.bird;
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, h * 0.88);
      ctx.bezierCurveTo(w * 0.2, h * 0.84, w * 0.34, h * 0.91, w * 0.54, h * 0.87);
      ctx.bezierCurveTo(w * 0.74, h * 0.83, w * 0.9, h * 0.9, w, h * 0.86);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = p.sky[0];
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, h * 0.95);
      ctx.bezierCurveTo(w * 0.28, h * 0.91, w * 0.48, h * 0.97, w * 0.7, h * 0.93);
      ctx.bezierCurveTo(w * 0.84, h * 0.9, w * 0.94, h * 0.94, w, h * 0.92);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

/* --------------------------------------------------------------------------
   Bichos · pradera, hierba y luciérnagas
   -------------------------------------------------------------------------- */

function bugs(ambient) {
  const p = ambient.palette;
  const blades = Array.from({ length: 56 }, () => ({
    x: rand(-0.05, 1.05),
    height: rand(0.08, 0.38),
    lean: rand(-0.08, 0.08),
    phase: rand(0, TAU),
    width: rand(0.8, 2.2),
    alpha: rand(0.08, 0.26),
  }));

  const flies = Array.from({ length: 42 }, () => ({
    x: rand(0.03, 0.97),
    y: rand(0.35, 0.95),
    phase: rand(0, TAU),
    speed: rand(0.15, 0.55),
    drift: rand(0.01, 0.04),
    radius: rand(0.01, 0.035),
    size: rand(0.08, 0.2),
    warm: Math.random() < 0.72,
  }));

  return {
    draw(ctx, t, dt, w, h) {
      background(ctx, w, h, p.meadow);
      const unit = Math.min(w, h);

      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, w * 0.28, h * 0.72, unit * 1.1, p.grass, 0.12);
      glow(ctx, w * 0.8, h * 0.35, unit * 0.7, p.pale, 0.06);
      glow(ctx, w * 0.5, h * 1.05, w * 1.5, p.grass, 0.18);

      // hierba en silueta
      ctx.globalCompositeOperation = 'source-over';
      for (const blade of blades) {
        const sway = Math.sin(t * 0.45 + blade.phase) * 0.035;
        const baseX = blade.x * w;
        const tipX = (blade.x + blade.lean + sway) * w;
        const tipY = h - blade.height * h;
        ctx.strokeStyle = p.grass;
        ctx.globalAlpha = blade.alpha;
        ctx.lineWidth = blade.width;
        ctx.beginPath();
        ctx.moveTo(baseX, h + 4);
        ctx.quadraticCurveTo((blade.x + blade.lean * 0.3) * w, h - blade.height * h * 0.55, tipX, tipY);
        ctx.stroke();
      }

      // luciérnagas
      ctx.globalCompositeOperation = 'lighter';
      for (const fly of flies) {
        fly.phase += fly.speed * dt;
        const x = (fly.x + Math.sin(fly.phase * 0.8) * fly.radius) * w;
        const y = (fly.y + Math.cos(fly.phase * 0.55) * fly.radius * 0.55) * h;
        const pulse = Math.max(0, Math.sin(t * 0.9 + fly.phase * 3));
        const alpha = 0.1 + pulse * 0.7;
        glow(ctx, x, y, unit * fly.size, fly.warm ? p.glow : p.pale, alpha * 0.55);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = fly.warm ? p.glow : p.pale;
        const dot = Math.max(1, unit * 0.0022);
        ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot);
      }

      // polvo vegetal
      for (let i = 0; i < 24; i++) {
        const x = ((i * 0.137 + t * 0.003) % 1.1 - 0.05) * w;
        const y = (0.2 + ((i * 0.091) % 0.75)) * h;
        const a = 0.08 + 0.08 * Math.sin(t * 0.5 + i);
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = p.pale;
        ctx.fillRect(x, y, 1, 1);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

/* --------------------------------------------------------------------------
   Bosque · troncos, rayos y hojas
   -------------------------------------------------------------------------- */

function forest(ambient) {
  const p = ambient.palette;
  const trees = Array.from({ length: 7 }, (_, i) => ({
    x: rand(0.05, 0.95),
    width: rand(0.018, 0.055),
    height: rand(0.55, 0.95),
    lean: rand(-0.025, 0.025),
    alpha: rand(0.28, 0.7),
    phase: rand(0, TAU),
    canopy: rand(0.18, 0.3),
    distance: i,
  }));

  const motes = Array.from({ length: 44 }, () => ({
    x: rand(0, 1),
    y: rand(0, 1),
    size: rand(0.7, 2.2),
    speed: rand(0.005, 0.018),
    drift: rand(-0.012, 0.012),
    phase: rand(0, TAU),
    warm: Math.random() < 0.45,
  }));

  const rays = Array.from({ length: 3 }, (_, i) => ({
    x: rand(0.15, 0.8),
    width: rand(0.08, 0.18),
    alpha: rand(0.03, 0.08),
    phase: rand(0, TAU),
    speed: rand(0.01, 0.03),
    index: i,
  }));

  return {
    draw(ctx, t, dt, w, h) {
      background(ctx, w, h, p.forest);
      const unit = Math.min(w, h);

      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, w * 0.3, h * 0.18, unit * 1.1, p.leaf, 0.1);
      glow(ctx, w * 0.78, h * 0.08, unit * 0.75, p.light, 0.08);
      glow(ctx, w * 0.5, h * 0.62, unit * 0.9, p.leaf, 0.05);

      // rayos de luz entre los árboles
      for (const ray of rays) {
        const shift = Math.sin(t * ray.speed * 0.25 + ray.phase) * w * 0.03;
        const x = ray.x * w + shift;
        const grad = ctx.createLinearGradient(x, 0, x + w * 0.22, h);
        grad.addColorStop(0, rgba(p.light, 0));
        grad.addColorStop(0.28, rgba(p.light, ray.alpha));
        grad.addColorStop(1, rgba(p.light, 0));
        ctx.globalAlpha = 1;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x - ray.width * w * 0.35, -10);
        ctx.lineTo(x + ray.width * w * 0.35, -10);
        ctx.lineTo(x + ray.width * w * 1.4 + w * 0.15, h + 10);
        ctx.lineTo(x + ray.width * w * 0.4 + w * 0.08, h + 10);
        ctx.closePath();
        ctx.fill();
      }

      // copas difusas
      ctx.globalCompositeOperation = 'source-over';
      for (const tree of trees) {
        const canopyY = h * (1 - tree.height) + h * 0.08;
        glow(ctx, tree.x * w, canopyY, unit * tree.canopy, p.leaf, 0.035 + tree.alpha * 0.04);
      }

      // troncos
      for (const tree of trees) {
        const base = h + 8;
        const top = h * (1 - tree.height);
        const sway = Math.sin(t * 0.12 + tree.phase) * w * 0.006;
        const x = tree.x * w;
        const width = tree.width * w;
        ctx.globalAlpha = tree.alpha;
        ctx.fillStyle = p.bark;
        ctx.beginPath();
        ctx.moveTo(x - width * 0.5, base);
        ctx.quadraticCurveTo(x - width * 0.35 + tree.lean * w, h * 0.55, x - width * 0.22 + sway, top);
        ctx.lineTo(x + width * 0.22 + sway, top);
        ctx.quadraticCurveTo(x + width * 0.35 + tree.lean * w, h * 0.55, x + width * 0.5, base);
        ctx.closePath();
        ctx.fill();
      }

      // hojas y motas
      ctx.globalCompositeOperation = 'lighter';
      for (const mote of motes) {
        mote.y += mote.speed * dt;
        mote.x += mote.drift * dt;
        if (mote.y > 1.02) {
          mote.y = -0.02;
          mote.x = rand(0, 1);
        }
        if (mote.x < -0.02) mote.x = 1.02;
        if (mote.x > 1.02) mote.x = -0.02;
        const twinkle = 0.35 + 0.65 * Math.max(0, Math.sin(t * 0.6 + mote.phase));
        ctx.globalAlpha = (mote.warm ? 0.4 : 0.24) * twinkle;
        ctx.fillStyle = mote.warm ? p.light : p.leaf;
        ctx.fillRect(mote.x * w, mote.y * h, mote.size, mote.size);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

/* --------------------------------------------------------------------------
   Noche · luna, colinas y luciérnagas
   -------------------------------------------------------------------------- */

function night(ambient) {
  const p = ambient.palette;
  const stars = Array.from({ length: 140 }, () => ({
    x: rand(0, 1),
    y: rand(0, 0.75),
    size: rand(0.5, 1.8),
    phase: rand(0, TAU),
    speed: rand(0.15, 0.7),
    bright: Math.random() < 0.05,
  }));

  const flies = Array.from({ length: 36 }, () => ({
    x: rand(0.05, 0.95),
    y: rand(0.68, 0.96),
    phase: rand(0, TAU),
    speed: rand(0.12, 0.4),
    radius: rand(0.008, 0.03),
    size: rand(0.07, 0.18),
  }));

  let nextShoot = rand(8, 16);
  let shoot = null;

  return {
    draw(ctx, t, dt, w, h) {
      background(ctx, w, h, p.sky);
      const unit = Math.min(w, h);

      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, w * 0.78, h * 0.2, unit * 0.95, p.moon, 0.14);
      glow(ctx, w * 0.78, h * 0.2, unit * 0.32, p.moon, 0.3);
      glow(ctx, w * 0.25, h * 0.42, unit * 0.75, p.moon, 0.04);

      // luna
      const moonX = w * 0.78;
      const moonY = h * 0.2;
      const moonR = unit * 0.055;
      const moonGrad = ctx.createRadialGradient(moonX - moonR * 0.25, moonY - moonR * 0.3, 0, moonX, moonY, moonR);
      moonGrad.addColorStop(0, rgba(p.moon, 0.9));
      moonGrad.addColorStop(0.65, rgba(p.moon, 0.55));
      moonGrad.addColorStop(1, rgba(p.moon, 0.05));
      ctx.globalAlpha = 1;
      ctx.fillStyle = moonGrad;
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonR, 0, TAU);
      ctx.fill();

      // estrellas
      for (const star of stars) {
        const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * star.speed + star.phase));
        if (star.bright) {
          glow(ctx, star.x * w, star.y * h, star.size * 22, p.moon, twinkle * 0.25);
          sparkle(ctx, star.x * w, star.y * h, star.size * 3.5, p.moon, twinkle * 0.4);
        } else {
          ctx.globalAlpha = twinkle * 0.7;
          ctx.fillStyle = p.moon;
          ctx.fillRect(star.x * w, star.y * h, star.size, star.size);
        }
      }

      // estrella fugaz ocasional
      if (t > nextShoot) {
        shoot = { x: rand(0.15, 0.8), y: rand(0.05, 0.3), start: t };
        nextShoot = t + rand(10, 22);
      }
      if (shoot) {
        const age = t - shoot.start;
        if (age < 0.9) {
          const headX = (shoot.x + age * 0.2) * w;
          const headY = (shoot.y + age * 0.07) * h;
          const tail = w * 0.07 * (1 - age);
          ctx.globalAlpha = (1 - age) * 0.6;
          ctx.strokeStyle = p.moon;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(headX - tail, headY - tail * 0.35);
          ctx.lineTo(headX, headY);
          ctx.stroke();
        } else {
          shoot = null;
        }
      }

      // colinas
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.hill;
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, h * 0.8);
      ctx.bezierCurveTo(w * 0.22, h * 0.73, w * 0.42, h * 0.84, w * 0.62, h * 0.78);
      ctx.bezierCurveTo(w * 0.8, h * 0.73, w * 0.92, h * 0.8, w, h * 0.76);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, h * 0.9);
      ctx.bezierCurveTo(w * 0.2, h * 0.84, w * 0.38, h * 0.94, w * 0.58, h * 0.88);
      ctx.bezierCurveTo(w * 0.78, h * 0.83, w * 0.9, h * 0.91, w, h * 0.87);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();

      // luciérnagas
      ctx.globalCompositeOperation = 'lighter';
      for (const fly of flies) {
        fly.phase += fly.speed * dt;
        const x = (fly.x + Math.sin(fly.phase * 0.7) * fly.radius) * w;
        const y = (fly.y + Math.cos(fly.phase * 0.5) * fly.radius * 0.4) * h;
        const pulse = Math.max(0, Math.sin(t * 0.8 + fly.phase * 3));
        const alpha = 0.08 + pulse * 0.65;
        glow(ctx, x, y, unit * fly.size, p.firefly, alpha * 0.5);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.firefly;
        ctx.fillRect(x, y, 1.4, 1.4);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}


export const THEMES = {
  rain,
  storm,
  fire,
  sea,
  river,
  wind,
  space,
  story,
  meditation,
  birds,
  bugs,
  forest,
  night,
};

/** Tema de reserva si la animación configurada no existe. */
export function fallbackTheme(ambient) {
  return space(ambient);
}
