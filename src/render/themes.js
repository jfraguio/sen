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
   Fuego · lenguas de llama sobre un lecho de brasas, leños y chispas
   -------------------------------------------------------------------------- */

function fire(ambient) {
  const p = ambient.palette;
  const [core, gold, orange, red] = p.flame;

  // Lenguas de llama en dos capas: detrás anchas y rojizas, delante finas y doradas.
  const tongues = [
    ...Array.from({ length: 6 }, (_, i) => ({ layer: 0, x: -0.11 + (i / 5) * 0.22, width: rand(0.07, 0.1), height: rand(0.34, 0.46), phase: rand(0, TAU), speed: rand(0.8, 1.3) })),
    ...Array.from({ length: 7 }, (_, i) => ({ layer: 1, x: -0.085 + (i / 6) * 0.17, width: rand(0.045, 0.07), height: rand(0.22, 0.36), phase: rand(0, TAU), speed: rand(1.1, 1.8) })),
    ...Array.from({ length: 4 }, (_, i) => ({ layer: 2, x: -0.05 + (i / 3) * 0.1, width: rand(0.03, 0.045), height: rand(0.12, 0.2), phase: rand(0, TAU), speed: rand(1.4, 2.2) })),
  ];

  const sparks = Array.from({ length: 46 }, () => newSpark(true));
  function newSpark(initial) {
    return {
      x: 0.5 + rand(-0.1, 0.1),
      y: initial ? rand(0.15, 0.8) : rand(0.62, 0.74),
      vx: rand(-0.03, 0.03),
      vy: rand(0.12, 0.3),
      life: initial ? rand(0, 1) : 0,
      span: rand(1.4, 3.2),
      size: rand(0.8, 2),
      phase: rand(0, TAU),
    };
  }

  const coals = Array.from({ length: 34 }, () => ({
    x: rand(-0.17, 0.17),
    y: rand(-0.012, 0.03),
    size: rand(1, 2.6),
    phase: rand(0, TAU),
    speed: rand(0.6, 2.2),
  }));

  function tongue(ctx, cx, base, width, height, t, tg, colors, alpha) {
    const pts = 14;
    const sway = (u) => (Math.sin(t * tg.speed * 1.7 + tg.phase + u * 3.1) * 0.28 + Math.sin(t * tg.speed * 3.3 + tg.phase * 2 + u * 5.3) * 0.12) * height * Math.pow(u, 1.5) * 0.45;
    const grad = ctx.createLinearGradient(0, base, 0, base - height);
    grad.addColorStop(0, rgba(colors[0], 0.95 * alpha));
    grad.addColorStop(0.3, rgba(colors[1], 0.8 * alpha));
    grad.addColorStop(0.65, rgba(colors[2], 0.5 * alpha));
    grad.addColorStop(1, rgba(colors[2], 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    for (let k = 0; k <= pts; k++) {
      const u = k / pts;
      const half = (width / 2) * Math.pow(1 - u, 0.75) * (1 + 0.35 * Math.sin(u * Math.PI));
      const x = cx - half + sway(u);
      const y = base - u * height;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let k = pts; k >= 0; k--) {
      const u = k / pts;
      const half = (width / 2) * Math.pow(1 - u, 0.75) * (1 + 0.35 * Math.sin(u * Math.PI));
      ctx.lineTo(cx + half + sway(u), base - u * height);
    }
    ctx.closePath();
    ctx.fill();
  }

  return {
    draw(ctx, t, dt, w, h) {
      background(ctx, w, h, p.sky);
      const unit = Math.min(w, h);
      const cx = w * 0.5;
      const base = h * 0.8;
      const flicker = 0.82 + Math.sin(t * 7.3) * 0.06 + Math.sin(t * 12.9 + 1.7) * 0.05 + Math.sin(t * 2.1) * 0.07;

      // Resplandor que ilumina la escena.
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, cx, base - h * 0.1, Math.max(w, h) * 1.3, red, 0.16 * flicker);
      glow(ctx, cx, base - h * 0.05, Math.max(w, h) * 0.75, orange, 0.16 * flicker);
      glow(ctx, cx, base, unit * 0.5, gold, 0.18 * flicker);

      // Leños cruzados (silueta) con el borde encendido.
      ctx.globalCompositeOperation = 'source-over';
      const logs = [[-0.2, 0.06, 0.3], [0.2, 0.06, -0.3], [0, 0.085, 0.04]];
      for (const [dx, dy, ang] of logs) {
        ctx.save();
        ctx.translate(cx + dx * unit * 0.6, base + dy * unit);
        ctx.rotate(ang);
        const lw = unit * 0.5;
        const lh = unit * 0.07;
        ctx.globalAlpha = 1;
        const bark = ctx.createLinearGradient(0, -lh / 2, 0, lh / 2);
        bark.addColorStop(0, '#3a1a0a');
        bark.addColorStop(0.45, '#1c0b04');
        bark.addColorStop(1, '#0b0402');
        ctx.fillStyle = bark;
        ctx.beginPath();
        ctx.roundRect(-lw / 2, -lh / 2, lw, lh, lh / 2);
        ctx.fill();
        // Corte del tronco en los extremos.
        for (const sx of [-1, 1]) {
          ctx.fillStyle = '#4a2a14';
          ctx.beginPath();
          ctx.ellipse(sx * (lw / 2 - lh * 0.22), 0, lh * 0.22, lh * 0.45, 0, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(20,8,3,0.8)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(sx * (lw / 2 - lh * 0.22), 0, lh * 0.1, lh * 0.22, 0, 0, TAU);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'lighter';
        const edge = ctx.createLinearGradient(-lw * 0.45, 0, lw * 0.45, 0);
        edge.addColorStop(0, rgba(orange, 0));
        edge.addColorStop(0.5, rgba(orange, 0.5 * flicker));
        edge.addColorStop(1, rgba(orange, 0));
        ctx.strokeStyle = edge;
        for (const [lwid, a] of [[5, 0.25], [1.6, 0.8]]) {
          ctx.globalAlpha = a;
          ctx.lineWidth = lwid;
          ctx.beginPath();
          ctx.moveTo(-lw * 0.4, -lh / 2 + 2);
          ctx.lineTo(lw * 0.4, -lh / 2 + 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      }

      // Lecho de brasas.
      ctx.globalCompositeOperation = 'lighter';
      ctx.save();
      ctx.translate(cx, base + unit * 0.03);
      ctx.scale(2.6, 0.55);
      glow(ctx, 0, 0, unit * 0.45, orange, 0.5 * flicker);
      glow(ctx, 0, 0, unit * 0.25, gold, 0.4 * flicker);
      ctx.restore();
      for (const c of coals) {
        const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * c.speed + c.phase));
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = a > 0.75 ? gold : orange;
        ctx.fillRect(cx + c.x * unit * 1.4, base + c.y * unit, c.size, c.size);
      }

      // Llamas.
      for (const tg of tongues) {
        const breathe = 0.78 + 0.22 * Math.sin(t * tg.speed * 1.1 + tg.phase) + 0.12 * Math.sin(t * tg.speed * 4.1 + tg.phase * 3);
        const height = tg.height * h * 1.45 * breathe * (0.92 + 0.08 * flicker);
        const width = tg.width * unit * 1.8;
        const x = cx + tg.x * unit * 1.45;
        const colors = tg.layer === 0 ? [orange, red, red] : tg.layer === 1 ? [gold, orange, red] : [core, gold, orange];
        tongue(ctx, x, base + unit * 0.01, width, height * (tg.layer === 0 ? 0.85 : 1), t, tg, colors, tg.layer === 0 ? 0.32 : tg.layer === 1 ? 0.62 : 0.85);
      }
      glow(ctx, cx, base - h * 0.08, unit * 0.32, core, 0.25 * flicker);

      // Chispas que suben en remolino.
      for (const s of sparks) {
        s.life += dt / s.span;
        if (s.life >= 1) Object.assign(s, newSpark(false));
        s.vx += Math.sin(t * 2.3 + s.phase) * 0.02 * dt;
        s.x += s.vx * dt;
        s.y -= s.vy * dt;
        const a = Math.sin(Math.PI * s.life) * (0.5 + 0.5 * Math.sin(t * 13 + s.phase));
        const color = s.life < 0.35 ? core : s.life < 0.7 ? gold : orange;
        ctx.globalAlpha = clamp01(a);
        ctx.fillStyle = color;
        ctx.fillRect(s.x * w, s.y * h, s.size, s.size);
        if (s.size > 1.5) glow(ctx, s.x * w, s.y * h, s.size * 10, orange, a * 0.25);
      }

      // Calor que tiñe la parte baja.
      const heat = ctx.createLinearGradient(0, h * 0.5, 0, h);
      heat.addColorStop(0, rgba(red, 0));
      heat.addColorStop(1, rgba(orange, 0.1 * flicker));
      ctx.globalAlpha = 1;
      ctx.fillStyle = heat;
      ctx.fillRect(0, h * 0.5, w, h * 0.5);

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
   Río · corriente entre piedras, espuma y destellos dorados
   -------------------------------------------------------------------------- */

function river(ambient) {
  const p = ambient.palette;
  const bands = [0, 1, 2].map((i) => ({ y: 0.3 + i * 0.22, amp: 0.03 + i * 0.012, phase: rand(0, TAU) }));
  const bandY = (b, u, t) => b.y + Math.sin(u * TAU * 1.2 + t * 0.35 + b.phase) * b.amp + Math.sin(u * TAU * 2.1 - t * 0.2) * b.amp * 0.4;

  const streaks = Array.from({ length: 54 }, () => ({
    band: Math.floor(rand(0, 3)),
    u: rand(-0.2, 1.1),
    off: rand(-0.09, 0.09),
    length: rand(0.04, 0.14),
    speed: rand(0.05, 0.14),
    width: rand(0.8, 2.2),
    gold: Math.random() < 0.18,
    alpha: rand(0.12, 0.34),
  }));

  const stones = Array.from({ length: 5 }, (_, i) => ({
    u: 0.12 + i * 0.19 + rand(-0.04, 0.04),
    band: i % 3,
    off: rand(-0.05, 0.05),
    size: rand(0.022, 0.045),
    ripple: rand(0, 1),
  }));

  const sparkles = Array.from({ length: 30 }, () => ({
    band: Math.floor(rand(0, 3)),
    u: rand(0, 1),
    off: rand(-0.07, 0.07),
    phase: rand(0, TAU),
    speed: rand(0.6, 1.8),
    size: rand(0.8, 2),
    drift: rand(0.02, 0.05),
  }));

  return {
    draw(ctx, t, dt, w, h) {
      background(ctx, w, h, p.forest);
      const unit = Math.min(w, h);

      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, w * 0.15, h * 0.1, Math.max(w, h) * 0.65, p.gold, 0.12);
      glow(ctx, w * 0.85, h * 0.95, Math.max(w, h) * 0.8, p.deep, 0.4);
      glow(ctx, w * 0.5, h * 0.55, Math.max(w, h) * 0.6, p.water, 0.08);

      // Cintas de corriente.
      for (const b of bands) {
        for (const pass of [{ width: 30, alpha: 0.035 }, { width: 9, alpha: 0.06 }, { width: 1.4, alpha: 0.14 }]) {
          ctx.beginPath();
          for (let k = 0; k <= 40; k++) {
            const u = k / 40;
            const y = bandY(b, u, t) * h;
            if (k === 0) ctx.moveTo(u * w, y);
            else ctx.lineTo(u * w, y);
          }
          ctx.strokeStyle = p.water;
          ctx.globalAlpha = pass.alpha;
          ctx.lineWidth = pass.width;
          ctx.stroke();
        }
      }

      // Vetas que siguen la corriente.
      ctx.lineCap = 'round';
      for (const s of streaks) {
        s.u += s.speed * dt;
        if (s.u > 1.15) {
          s.u = rand(-0.25, -0.05);
          s.off = rand(-0.09, 0.09);
        }
        const b = bands[s.band];
        const u0 = s.u;
        const u1 = s.u - s.length;
        const grad = ctx.createLinearGradient(u1 * w, 0, u0 * w, 0);
        const c = s.gold ? p.gold : p.water;
        grad.addColorStop(0, rgba(c, 0));
        grad.addColorStop(1, rgba(c, s.alpha));
        ctx.strokeStyle = grad;
        ctx.globalAlpha = 1;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) {
          const u = u1 + ((u0 - u1) * k) / 6;
          const y = (bandY(b, u, t) + s.off) * h;
          if (k === 0) ctx.moveTo(u * w, y);
          else ctx.lineTo(u * w, y);
        }
        ctx.stroke();
      }

      // Piedras que asoman: roca redondeada, espuma río arriba y estela río abajo.
      for (const st of stones) {
        const b = bands[st.band];
        const x = st.u * w;
        const y = (bandY(b, st.u, t) + st.off) * h;
        const r = st.size * unit;
        st.ripple = (st.ripple + dt * 0.5) % 1;
        // Estela en V que se abre aguas abajo.
        ctx.strokeStyle = p.water;
        ctx.lineWidth = 1;
        for (const k of [0, 0.5]) {
          const q = (st.ripple + k) % 1;
          ctx.globalAlpha = (1 - q) * 0.22;
          const len = r * (1.5 + q * 4);
          const spread = r * (0.6 + q * 1.2);
          ctx.beginPath();
          ctx.moveTo(x + len, y - spread);
          ctx.quadraticCurveTo(x + r * 0.6, y - r * 0.5, x + len * 0.35, y);
          ctx.quadraticCurveTo(x + r * 0.6, y + r * 0.5, x + len, y + spread);
          ctx.stroke();
        }
        // Roca.
        ctx.globalCompositeOperation = 'source-over';
        const rock = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r * 1.1);
        rock.addColorStop(0, '#3d5a4c');
        rock.addColorStop(0.55, '#1a3127');
        rock.addColorStop(1, '#0a1913');
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = rock;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.66, -0.15, 0, TAU);
        ctx.fill();
        // Espuma río arriba que palpita.
        ctx.globalCompositeOperation = 'lighter';
        const foam = 0.35 + 0.2 * Math.sin(t * 3 + st.u * 9);
        ctx.strokeStyle = '#d9fff0';
        ctx.lineCap = 'round';
        for (const [off, lw, al] of [[0.12, 4, 0.12], [0.06, 1.6, 0.6]]) {
          ctx.globalAlpha = al * foam;
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.ellipse(x, y, r * (1 + off), r * (0.66 + off), -0.15, Math.PI * 0.62, Math.PI * 1.38);
          ctx.stroke();
        }
        glow(ctx, x - r * 1.1, y, r * 2.2, p.water, 0.1 * foam);
      }

      // Destellos dorados sobre la superficie.
      for (const dot of sparkles) {
        dot.u += dot.drift * dt;
        if (dot.u > 1.05) dot.u = -0.05;
        const b = bands[dot.band];
        const twinkle = Math.max(0, Math.sin(t * dot.speed + dot.phase));
        ctx.globalAlpha = twinkle * 0.6;
        ctx.fillStyle = p.gold;
        const x = dot.u * w;
        const y = (bandY(b, dot.u, t) + dot.off) * h;
        ctx.fillRect(x - dot.size / 2, y - dot.size / 2, dot.size, dot.size);
        if (twinkle > 0.9) sparkle(ctx, x, y, dot.size * 3, p.gold, (twinkle - 0.9) * 4);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

/* --------------------------------------------------------------------------
   Viento · ráfagas que van y vienen, cintas de aire, hojas y hierba
   -------------------------------------------------------------------------- */

function wind(ambient) {
  const p = ambient.palette;
  const ribbons = Array.from({ length: 30 }, (_, i) => newRibbon(i, true));
  function newRibbon(i, initial) {
    return {
      head: initial ? rand(-0.2, 1.4) : rand(-0.5, -0.1),
      y: rand(0.08, 0.8),
      length: rand(0.25, 0.6),
      amp: rand(0.01, 0.04),
      freq: rand(4, 9),
      phase: rand(0, TAU),
      speed: rand(0.16, 0.34),
      width: rand(0.7, 2.2),
      alpha: rand(0.12, 0.32),
      color: i % 3 === 0 ? p.pale : i % 3 === 1 ? p.gust : p.haze,
    };
  }
  const leaves = Array.from({ length: 18 }, () => newLeaf(true));
  function newLeaf(initial) {
    return {
      x: initial ? rand(0, 1) : rand(-0.15, -0.03),
      y: rand(0.15, 0.85),
      size: rand(3, 6),
      spin: rand(-6, 6),
      angle: rand(0, TAU),
      speed: rand(0.12, 0.28),
      bob: rand(0, TAU),
      warm: Math.random() < 0.5,
    };
  }
  const blades = Array.from({ length: 70 }, () => ({ x: rand(-0.02, 1.02), h: rand(0.05, 0.13), phase: rand(0, TAU), lean: rand(0.6, 1.2) }));
  const clouds = Array.from({ length: 5 }, () => ({ x: rand(0, 1), y: rand(0.05, 0.4), size: rand(0.4, 0.8), speed: rand(0.008, 0.02), color: Math.random() < 0.5 ? p.haze : p.gust }));

  return {
    draw(ctx, t, dt, w, h) {
      background(ctx, w, h, p.air);
      const big = Math.max(w, h);
      // Fuerza de la ráfaga: sube y baja despacio.
      const gust = clamp01(0.45 + 0.35 * Math.sin(t * 0.21) + 0.2 * Math.sin(t * 0.53 + 1.3));

      ctx.globalCompositeOperation = 'lighter';
      for (const c of clouds) {
        c.x += c.speed * (0.6 + gust) * dt;
        if (c.x > 1.4) c.x = -0.4;
        ctx.save();
        ctx.translate(c.x * w, c.y * h);
        ctx.scale(2.4, 0.6);
        glow(ctx, 0, 0, big * c.size, c.color, 0.09);
        ctx.restore();
      }

      // Cintas de aire con los extremos desvanecidos.
      ctx.lineCap = 'round';
      for (let i = 0; i < ribbons.length; i++) {
        const r = ribbons[i];
        r.head += r.speed * (0.5 + gust * 1.2) * dt;
        if (r.head - r.length > 1.1) ribbons[i] = newRibbon(i, false);
        const tail = r.head - r.length;
        const grad = ctx.createLinearGradient(tail * w, 0, r.head * w, 0);
        grad.addColorStop(0, rgba(r.color, 0));
        grad.addColorStop(0.6, rgba(r.color, r.alpha * (0.5 + gust * 0.7)));
        grad.addColorStop(1, rgba(r.color, 0));
        ctx.strokeStyle = grad;
        ctx.globalAlpha = 1;
        ctx.lineWidth = r.width;
        ctx.beginPath();
        for (let k = 0; k <= 24; k++) {
          const u = tail + (r.length * k) / 24;
          const y = r.y + Math.sin(u * r.freq + t * 0.9 + r.phase) * r.amp * (0.6 + gust) + Math.sin(u * 2.3 - t * 0.4) * 0.02;
          if (k === 0) ctx.moveTo(u * w, y * h);
          else ctx.lineTo(u * w, y * h);
        }
        ctx.stroke();
      }

      // Hojas que vuelan dando vueltas.
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < leaves.length; i++) {
        const l = leaves[i];
        l.x += l.speed * (0.4 + gust * 1.4) * dt;
        l.angle += l.spin * (0.4 + gust) * dt;
        if (l.x > 1.1) leaves[i] = newLeaf(false);
        const y = (l.y + Math.sin(t * 1.3 + l.bob) * 0.03) * h;
        ctx.save();
        ctx.translate(l.x * w, y);
        ctx.rotate(l.angle);
        ctx.scale(1, Math.abs(Math.cos(l.angle * 0.7)) * 0.8 + 0.2);
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = l.warm ? '#c7a36a' : '#9fc79a';
        ctx.beginPath();
        ctx.ellipse(0, 0, l.size, l.size * 0.45, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      // Hierba que se dobla con la ráfaga.
      ctx.strokeStyle = '#0b1419';
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.95;
      for (const b of blades) {
        const bx = b.x * w;
        const bh = b.h * h;
        const bend = (gust * 0.6 + 0.12 * Math.sin(t * 2.2 + b.phase)) * b.lean * bh;
        ctx.beginPath();
        ctx.moveTo(bx, h + 2);
        ctx.quadraticCurveTo(bx + bend * 0.3, h - bh * 0.6, bx + bend, h - bh);
        ctx.stroke();
      }
      const ground = ctx.createLinearGradient(0, h * 0.86, 0, h);
      ground.addColorStop(0, 'rgba(5,9,12,0)');
      ground.addColorStop(1, 'rgba(5,9,12,0.9)');
      ctx.fillStyle = ground;
      ctx.globalAlpha = 1;
      ctx.fillRect(0, h * 0.86, w, h * 0.14);

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
   Bosque · capas de árboles en la bruma, rayos de luz, hojas y polen
   -------------------------------------------------------------------------- */

function forest(ambient) {
  const p = ambient.palette;
  const far = Array.from({ length: 11 }, (_, i) => ({ x: (i + rand(-0.3, 0.3)) / 10, h: rand(0.32, 0.5), w: rand(0.05, 0.08) }));
  const mid = Array.from({ length: 6 }, (_, i) => ({
    x: (i + 0.5 + rand(-0.3, 0.3)) / 6,
    h: rand(0.55, 0.75),
    trunk: rand(0.012, 0.02),
    crown: rand(0.1, 0.15),
    phase: rand(0, TAU),
    blobs: Array.from({ length: 11 }, () => [rand(-1, 1), rand(-0.8, 0.45), rand(0.35, 0.7)]),
  }));
  const near = [
    { x: 0.04, w: 0.07, lean: 0.01 },
    { x: 0.93, w: 0.09, lean: -0.012 },
    { x: 0.72, w: 0.035, lean: 0.006 },
  ];
  const rays = Array.from({ length: 4 }, (_, i) => ({ x: 0.15 + i * 0.22 + rand(-0.05, 0.05), width: rand(0.05, 0.12), phase: rand(0, TAU), speed: rand(0.08, 0.16) }));
  const leaves = Array.from({ length: 22 }, () => newLeaf(true));
  function newLeaf(initial) {
    return { x: rand(0, 1), y: initial ? rand(0, 1) : -0.03, size: rand(2.5, 5), spin: rand(-3, 3), angle: rand(0, TAU), speed: rand(0.03, 0.07), sway: rand(0, TAU), warm: Math.random() < 0.5 };
  }
  const motes = Array.from({ length: 44 }, () => ({ x: rand(0, 1), y: rand(0, 1), size: rand(0.7, 2), phase: rand(0, TAU), drift: rand(-0.01, 0.01), rise: rand(0.002, 0.008) }));

  function crown(ctx, x, y, r, blobs, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const [dx, dy, s] of blobs) {
      ctx.moveTo(x + dx * r + s * r, y + dy * r);
      ctx.arc(x + dx * r, y + dy * r, s * r, 0, TAU);
    }
    ctx.fill();
  }

  return {
    draw(ctx, t, dt, w, h) {
      background(ctx, w, h, p.forest);
      const unit = Math.min(w, h);

      // Claro luminoso al fondo.
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, w * 0.58, h * 0.3, Math.max(w, h) * 0.9, p.light, 0.1);
      glow(ctx, w * 0.5, h * 0.45, Math.max(w, h) * 0.7, p.leaf, 0.12);

      // Capa lejana: abetos pálidos en la bruma (pisos triangulares).
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#1f3d2c';
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      for (const tr of far) {
        const x = tr.x * w;
        const ground = h * 0.92;
        const H = ground - h * (0.92 - tr.h);
        const half = tr.w * w;
        for (let k = 1; k <= 4; k++) {
          const tierTop = ground - H + ((k - 1) / 4) * H * 0.72;
          const tierBottom = ground - H + (k / 4) * H * 0.92;
          const hw = half * (0.35 + 0.65 * (k / 4));
          ctx.moveTo(x, tierTop);
          ctx.lineTo(x + hw, tierBottom);
          ctx.lineTo(x - hw, tierBottom);
          ctx.closePath();
        }
        ctx.rect(x - half * 0.06, ground - H * 0.1, half * 0.12, H * 0.1);
      }
      ctx.fill();
      // Bruma baja que deriva.
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate(((t * 0.01 + i * 0.37) % 1.4 - 0.2) * w, h * (0.78 + i * 0.05));
        ctx.scale(3, 0.45);
        glow(ctx, 0, 0, unit * 0.9, p.light, 0.06);
        ctx.restore();
      }

      // Rayos de luz que respiran.
      for (const ray of rays) {
        const a = 0.05 + 0.04 * Math.sin(t * ray.speed + ray.phase);
        const x = ray.x * w + Math.sin(t * 0.03 + ray.phase) * w * 0.02;
        const grad = ctx.createLinearGradient(x, 0, x + w * 0.2, h);
        grad.addColorStop(0, rgba(p.light, a * 1.4));
        grad.addColorStop(0.6, rgba(p.light, a * 0.6));
        grad.addColorStop(1, rgba(p.light, 0));
        ctx.globalAlpha = 1;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x - ray.width * w * 0.3, -10);
        ctx.lineTo(x + ray.width * w * 0.3, -10);
        ctx.lineTo(x + ray.width * w * 1.3 + w * 0.18, h + 10);
        ctx.lineTo(x + ray.width * w * 0.2 + w * 0.1, h + 10);
        ctx.closePath();
        ctx.fill();
      }

      // Capa media: troncos y copas redondeadas que se mecen.
      ctx.globalCompositeOperation = 'source-over';
      for (const tr of mid) {
        const x = tr.x * w;
        const top = h * (1 - tr.h);
        const sway = Math.sin(t * 0.25 + tr.phase) * unit * 0.006;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#0a1a11';
        ctx.fillRect(x - tr.trunk * w * 0.5, top, tr.trunk * w, h - top);
        crown(ctx, x + sway, top, tr.crown * unit, tr.blobs, '#0f2a1b', 0.9);
        crown(ctx, x + sway - tr.crown * unit * 0.25, top - tr.crown * unit * 0.3, tr.crown * unit * 0.7, tr.blobs.slice(0, 5), p.leaf, 0.07);
      }

      // Capa cercana: grandes troncos oscuros que enmarcan.
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.bark;
      for (const tr of near) {
        const x = tr.x * w;
        const half = tr.w * w * 0.5;
        ctx.beginPath();
        ctx.moveTo(x - half * 1.2, h + 4);
        ctx.quadraticCurveTo(x - half + tr.lean * w, h * 0.5, x - half * 0.8 + tr.lean * w * 2, -4);
        ctx.lineTo(x + half * 0.8 + tr.lean * w * 2, -4);
        ctx.quadraticCurveTo(x + half + tr.lean * w, h * 0.5, x + half * 1.2, h + 4);
        ctx.closePath();
        ctx.fill();
      }

      // Hojas que caen girando.
      for (let i = 0; i < leaves.length; i++) {
        const l = leaves[i];
        l.y += l.speed * dt;
        l.angle += l.spin * dt;
        if (l.y > 1.04) leaves[i] = newLeaf(false);
        const x = (l.x + Math.sin(t * 0.7 + l.sway) * 0.03) * w;
        ctx.save();
        ctx.translate(x, l.y * h);
        ctx.rotate(l.angle);
        ctx.scale(1, Math.abs(Math.sin(l.angle)) * 0.7 + 0.3);
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = l.warm ? '#b9a25a' : p.leaf;
        ctx.beginPath();
        ctx.ellipse(0, 0, l.size, l.size * 0.45, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      // Polen que brilla en la luz.
      ctx.globalCompositeOperation = 'lighter';
      for (const m of motes) {
        m.y -= m.rise * dt;
        m.x += m.drift * dt;
        if (m.y < -0.02) m.y = 1.02;
        if (m.x < -0.02) m.x = 1.02;
        if (m.x > 1.02) m.x = -0.02;
        const tw = 0.3 + 0.7 * Math.max(0, Math.sin(t * 0.7 + m.phase));
        ctx.globalAlpha = 0.45 * tw;
        ctx.fillStyle = p.light;
        ctx.fillRect(m.x * w, m.y * h, m.size, m.size);
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



/* --------------------------------------------------------------------------
   Fondo del menú · cielo místico
   Nebulosas de color que derivan, cintas de aurora, un mandala tenue (flor de
   la vida) que gira, estrellas con paralaje según el puntero y estrellas
   fugaces ocasionales.
   -------------------------------------------------------------------------- */

function constellation(ambient) {
  const p = ambient.palette;
  const pointer = ambient.pointer || { x: 0, y: 0 };
  const view = { x: 0, y: 0 };
  const colors = p.nebula;

  const clouds = Array.from({ length: 10 }, (_, i) => ({
    color: colors[i % colors.length],
    x: rand(0.05, 0.95),
    y: rand(0.05, 0.95),
    ax: rand(0.04, 0.12),
    ay: rand(0.03, 0.09),
    fx: rand(0.012, 0.03),
    fy: rand(0.01, 0.026),
    phase: rand(0, TAU),
    size: rand(0.55, 1.05),
    alpha: rand(0.13, 0.22),
    depth: rand(0.2, 0.6),
  }));

  const ribbons = [
    { y: 0.3, amp: 0.07, freq: 1.3, speed: 0.05, width: 0.11, a: colors[0], b: colors[2], alpha: 0.075, phase: rand(0, TAU) },
    { y: 0.58, amp: 0.09, freq: 0.9, speed: -0.035, width: 0.14, a: colors[1], b: colors[3], alpha: 0.06, phase: rand(0, TAU) },
    { y: 0.8, amp: 0.05, freq: 1.7, speed: 0.06, width: 0.08, a: colors[3], b: colors[0], alpha: 0.05, phase: rand(0, TAU) },
  ];

  const stars = Array.from({ length: 320 }, () => ({
    x: rand(0, 1),
    y: rand(0, 1),
    size: rand(0.5, 1.9),
    depth: rand(0.15, 1),
    phase: rand(0, TAU),
    speed: rand(0.2, 1.1),
    bright: Math.random() < 0.06,
    tint: Math.random() < 0.22 ? colors[Math.floor(rand(0, colors.length))] : p.star,
  }));

  const dust = Array.from({ length: 40 }, () => ({
    x: rand(0, 1),
    y: rand(0, 1),
    size: rand(0.01, 0.035),
    alpha: rand(0.02, 0.07),
    phase: rand(0, TAU),
    color: colors[Math.floor(rand(0, colors.length))],
    depth: rand(0.3, 1),
  }));

  let shooting = null;
  let nextShot = rand(3, 7);

  function mandala(ctx, cx, cy, r, t) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.012);
    ctx.globalAlpha = 0.032 + 0.014 * Math.sin(t * 0.2);
    ctx.strokeStyle = p.star;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      ctx.moveTo(Math.cos(a) * r + r, Math.sin(a) * r);
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r, r, 0, TAU);
    }
    ctx.moveTo(r * 2, 0);
    ctx.arc(0, 0, r * 2, 0, TAU);
    ctx.moveTo(r * 2.18, 0);
    ctx.arc(0, 0, r * 2.18, 0, TAU);
    ctx.stroke();
    // Hexagrama inscrito, todavía más tenue.
    ctx.globalAlpha *= 0.7;
    ctx.beginPath();
    for (let tri = 0; tri < 2; tri++) {
      for (let k = 0; k <= 3; k++) {
        const a = (k / 3) * TAU + tri * (TAU / 6) - Math.PI / 2;
        const x = Math.cos(a) * r * 2;
        const y = Math.sin(a) * r * 2;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  return {
    draw(ctx, t, dt, w, h) {
      const big = Math.max(w, h);
      view.x += (pointer.x - view.x) * Math.min(1, dt * 2.5);
      view.y += (pointer.y - view.y) * Math.min(1, dt * 2.5);

      // Fondo: violeta profundo arriba, índigo y un fondo azul petróleo.
      const bg = ctx.createLinearGradient(0, 0, w * 0.35, h);
      bg.addColorStop(0, p.void[0]);
      bg.addColorStop(0.5, p.void[1]);
      bg.addColorStop(1, p.void[2]);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'lighter';

      // Nebulosas que derivan despacio y respiran.
      for (const c of clouds) {
        const x = (c.x + Math.sin(t * c.fx + c.phase) * c.ax - view.x * 0.03 * c.depth) * w;
        const y = (c.y + Math.cos(t * c.fy + c.phase) * c.ay - view.y * 0.03 * c.depth) * h;
        const breathe = 0.75 + 0.25 * Math.sin(t * 0.07 + c.phase * 2);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(c.phase + t * 0.004);
        ctx.scale(1.5, 0.75);
        glow(ctx, 0, 0, big * c.size, c.color, c.alpha * breathe);
        ctx.restore();
      }

      // Cintas de aurora: varias pasadas de ancho decreciente fingen el brillo.
      for (const rb of ribbons) {
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, rgba(rb.a, 0));
        grad.addColorStop(0.3, rgba(rb.a, 1));
        grad.addColorStop(0.7, rgba(rb.b, 1));
        grad.addColorStop(1, rgba(rb.b, 0));
        ctx.strokeStyle = grad;
        ctx.lineCap = 'round';
        const passes = [[1, 0.35], [0.45, 0.6], [0.12, 1]];
        for (const [wf, af] of passes) {
          ctx.globalAlpha = rb.alpha * af * (0.75 + 0.25 * Math.sin(t * 0.13 + rb.phase));
          ctx.lineWidth = rb.width * h * wf;
          ctx.beginPath();
          for (let k = 0; k <= 48; k++) {
            const u = k / 48;
            const y = (rb.y + Math.sin(u * TAU * rb.freq + t * rb.speed + rb.phase) * rb.amp
              + Math.sin(u * TAU * rb.freq * 2.3 - t * rb.speed * 1.7) * rb.amp * 0.3 - view.y * 0.02) * h;
            const x = (u * 1.1 - 0.05 - view.x * 0.015) * w;
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      // Polvo de colores.
      for (const mote of dust) {
        const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.1 + mote.phase));
        glow(ctx, (mote.x - view.x * 0.02 * mote.depth) * w, (mote.y - view.y * 0.02 * mote.depth) * h, big * mote.size, mote.color, mote.alpha * pulse);
      }

      // Mandala tenue alrededor del centro de la constelación.
      ctx.globalCompositeOperation = 'source-over';
      mandala(ctx, w * 0.5 - view.x * 6, h * 0.48 - view.y * 6, Math.min(w, h) * 0.17, t);
      ctx.globalCompositeOperation = 'lighter';

      // Estrellas con paralaje.
      for (const star of stars) {
        star.x -= 0.0015 * star.depth * dt;
        star.y += 0.0005 * star.depth * dt;
        if (star.x < -0.02) star.x = 1.02;
        if (star.y > 1.02) star.y = -0.02;
        const x = (star.x - view.x * 0.012 * star.depth) * w;
        const y = (star.y - view.y * 0.012 * star.depth) * h;
        const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * star.speed + star.phase));
        const alpha = clamp01(twinkle * (0.3 + star.depth * 0.7));
        if (star.bright) {
          glow(ctx, x, y, star.size * 30, star.tint, alpha * 0.28);
          sparkle(ctx, x, y, star.size * 4.5, star.tint, alpha * 0.45);
        } else {
          ctx.globalAlpha = alpha;
          ctx.fillStyle = star.tint;
          ctx.fillRect(x, y, star.size, star.size);
        }
      }

      // Estrella fugaz.
      nextShot -= dt;
      if (!shooting && nextShot <= 0) {
        const fromLeft = Math.random() < 0.5;
        shooting = {
          x: fromLeft ? rand(-0.05, 0.4) : rand(0.6, 1.05),
          y: rand(0.02, 0.35),
          vx: (fromLeft ? 1 : -1) * rand(0.45, 0.7),
          vy: rand(0.12, 0.25),
          life: 0,
          dur: rand(0.9, 1.5),
          color: colors[Math.floor(rand(0, colors.length))],
        };
        nextShot = rand(6, 14);
      }
      if (shooting) {
        const s = shooting;
        s.life += dt;
        const u = s.life / s.dur;
        if (u >= 1) shooting = null;
        else {
          const x = (s.x + s.vx * s.life) * w;
          const y = (s.y + s.vy * s.life) * h;
          const tail = 0.16;
          const tx = x - s.vx * tail * w;
          const ty = y - s.vy * tail * h;
          const a = Math.sin(u * Math.PI);
          const grad = ctx.createLinearGradient(tx, ty, x, y);
          grad.addColorStop(0, rgba(s.color, 0));
          grad.addColorStop(1, rgba(p.star, 0.9));
          ctx.globalAlpha = a;
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(x, y);
          ctx.stroke();
          glow(ctx, x, y, 26, s.color, a * 0.5);
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}


/* --------------------------------------------------------------------------
   Burbujas · baño de espuma y luz sumergida
   -------------------------------------------------------------------------- */

function bubbles(ambient) {
  const p = ambient.palette;
  const rimColors = p.bubble;
  const light = p.light;

  const bubbles = Array.from({ length: 34 }, (_, index) => ({
    x: rand(0.05, 0.95),
    y: rand(0.15, 1.1),
    size: rand(0.025, 0.11),
    speed: rand(0.018, 0.06),
    sway: rand(0.004, 0.018),
    phase: rand(0, TAU),
    wobble: rand(0.4, 1.4),
    color: rimColors[index % rimColors.length],
    alpha: rand(0.22, 0.55),
    depth: rand(0.4, 1),
  }));

  const foam = Array.from({ length: 70 }, () => ({
    x: rand(0, 1),
    y: rand(0.88, 1.03),
    size: rand(0.006, 0.022),
    speed: rand(0.004, 0.014),
    phase: rand(0, TAU),
    alpha: rand(0.05, 0.2),
  }));

  return {
    draw(ctx, t, dt, w, h) {
      background(ctx, w, h, p.water);
      const unit = Math.min(w, h);

      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, w * 0.3, h * 0.08, Math.max(w, h) * 0.9, p.light, 0.09);
      glow(ctx, w * 0.82, h * 0.3, Math.max(w, h) * 0.8, p.bubble[1], 0.05);
      glow(ctx, w * 0.5, h * 1.02, w * 1.4, p.bubble[1], 0.1);

      // haces de luz que atraviesan el agua
      for (let i = 0; i < 3; i++) {
        const x = w * (0.18 + i * 0.3) + Math.sin(t * 0.06 + i) * w * 0.025;
        const beam = ctx.createLinearGradient(x, 0, x + w * 0.12, h);
        beam.addColorStop(0, rgba(light, 0));
        beam.addColorStop(0.36, rgba(light, 0.045));
        beam.addColorStop(1, rgba(light, 0));
        ctx.globalAlpha = 1;
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(x - w * 0.035, 0);
        ctx.lineTo(x + w * 0.035, 0);
        ctx.lineTo(x + w * 0.16, h);
        ctx.lineTo(x + w * 0.04, h);
        ctx.closePath();
        ctx.fill();
      }

      // burbujas
      ctx.globalCompositeOperation = 'source-over';
      for (const bubble of bubbles) {
        bubble.y -= bubble.speed * dt;
        bubble.phase += bubble.wobble * dt;
        if (bubble.y < -0.12) {
          bubble.y = rand(1.02, 1.16);
          bubble.x = rand(0.05, 0.95);
          bubble.size = rand(0.025, 0.11);
          bubble.alpha = rand(0.22, 0.55);
        }
        if (bubble.x < 0.02) bubble.x = 0.98;
        if (bubble.x > 0.98) bubble.x = 0.02;
        const x = (bubble.x + Math.sin(bubble.phase) * bubble.sway) * w;
        const y = bubble.y * h;
        const radius = Math.max(2, unit * bubble.size);

        ctx.globalAlpha = bubble.alpha * 0.35;
        glow(ctx, x, y, radius * 3.4, bubble.color, 0.12);
        ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, TAU);
        ctx.fillStyle = rgba(bubble.color, 0.035);
        ctx.fill();
        ctx.strokeStyle = rgba(bubble.color, bubble.alpha);
        ctx.lineWidth = Math.max(1, radius * 0.035);
        ctx.stroke();

        // reflejo interior
        ctx.beginPath();
        ctx.arc(x - radius * 0.26, y - radius * 0.28, radius * 0.62, Math.PI * 1.02, Math.PI * 1.55);
        ctx.strokeStyle = rgba(light, bubble.alpha * 0.9);
        ctx.lineWidth = Math.max(0.8, radius * 0.025);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x - radius * 0.3, y - radius * 0.34, Math.max(0.8, radius * 0.07), 0, TAU);
        ctx.fillStyle = rgba(light, bubble.alpha * 0.9);
        ctx.fill();
      }

      // espuma y microburbujas en la superficie inferior
      ctx.globalCompositeOperation = 'lighter';
      for (const mote of foam) {
        mote.y -= mote.speed * dt;
        if (mote.y < 0.82) {
          mote.y = rand(0.9, 1.05);
          mote.x = rand(0, 1);
        }
        const x = (mote.x + Math.sin(t * 0.45 + mote.phase) * 0.006) * w;
        const y = mote.y * h;
        ctx.globalAlpha = mote.alpha * (0.5 + 0.5 * Math.sin(t * 0.8 + mote.phase));
        ctx.fillStyle = light;
        const s = Math.max(1, unit * mote.size);
        ctx.beginPath();
        ctx.arc(x, y, s, 0, TAU);
        ctx.strokeStyle = rgba(light, 0.18);
        ctx.lineWidth = 0.8;
        ctx.stroke();
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
  constellation,
  bubbles,
};

/** Tema de reserva si la animación configurada no existe. */
export function fallbackTheme(ambient) {
  return space(ambient);
}
