/**
 * Pájaros (cantos por especie o genérico) y ranas.
 */

import { subSeed } from '../../rng.js';
import { chain, natureKit, syl, syllableEvent, syllablesLength } from './kit.js';

/* ------------------------------------------------------------ especies */

function songGeneric(rng, p) {
  const [lo, hi] = p.register;
  const n = Math.round(p.syllables);
  const parts = [];
  if (p.shape === 'silbido') {
    const k = Math.max(2, Math.round(n / 3));
    for (let i = 0; i < k; i++) {
      const f0 = rng.logRange(lo, hi);
      const f1 = Math.min(hi * 1.2, Math.max(lo * 0.8, f0 * rng.range(0.75, 1.3)));
      parts.push([syl(0, rng.range(0.18, 0.45), f0, f1, { shape: rng.pick(['arch', 'exp', 'hook']), vib: rng.range(0, 0.012), vibRate: rng.range(5, 9), h2: 0.05 }), rng.range(0.05, 0.15)]);
    }
  } else if (p.shape === 'trino') {
    const f = rng.logRange(lo, hi);
    for (let i = 0; i < n * 2; i++) parts.push([syl(0, 0.035, f, f * 0.85, { h2: 0.04 }), 0.025]);
  } else {
    for (let i = 0; i < n; i++) {
      const f0 = rng.logRange(lo, hi);
      parts.push([syl(0, rng.range(0.03, 0.12), f0, f0 * rng.range(0.65, 1.4), { shape: rng.pick(['line', 'arch', 'exp', 'hook']), h2: 0.04, vib: rng.range(0, 0.03), vibRate: rng.range(30, 70) }), rng.range(0.015, 0.07)]);
    }
  }
  return chain(parts);
}

function songMirlo(rng) {
  const parts = [];
  let base = rng.range(1500, 2300);
  for (let i = 0, n = rng.int(3, 6); i < n; i++) {
    const f0 = base * (1 + (rng.next() - 0.5) * 0.36);
    const f1 = f0 * rng.pick([rng.range(1.1, 1.45), rng.range(0.7, 0.92), rng.range(0.95, 1.05)]);
    parts.push([syl(0, rng.range(0.09, 0.3), f0, f1, { shape: rng.pick(['line', 'arch', 'hook', 'exp']), vib: rng.range(0, 0.02), vibRate: rng.range(20, 40), h2: 0.1, amp: rng.range(0.6, 1) }), rng.range(0.03, 0.09)]);
    base *= 1 + (rng.next() - 0.5) * 0.24;
  }
  if (rng.chance(0.75)) {
    for (let i = 0, n = rng.int(3, 7); i < n; i++) {
      const f = rng.range(3600, 6200);
      parts.push([syl(0, rng.range(0.025, 0.05), f, f * rng.range(0.75, 1.25), { h2: 0.02, amp: rng.range(0.2, 0.4) }), rng.range(0.01, 0.03)]);
    }
  }
  return chain(parts);
}

function songPetirrojo(rng) {
  const parts = [];
  for (let i = 0, n = rng.int(7, 14); i < n; i++) {
    if (rng.chance(0.18)) {
      const f = rng.range(3500, 6500);
      for (let j = 0, k = rng.int(4, 8); j < k; j++) parts.push([syl(0, 0.03, f, f * 0.85, { h2: 0.03, amp: 0.6 }), 0.025]);
    } else {
      const f0 = rng.range(2600, 7200);
      parts.push([syl(0, rng.range(0.03, 0.13), f0, f0 * rng.range(0.65, 1.4), { shape: rng.pick(['line', 'arch', 'exp']), h2: 0.03, vib: rng.range(0, 0.03), vibRate: rng.range(40, 80), amp: rng.range(0.5, 1) }), rng.range(0.015, 0.07)]);
    }
  }
  return chain(parts);
}

function songCarbonero(rng) {
  const hi = rng.range(4800, 5800);
  const lo = hi * rng.range(0.62, 0.72);
  const parts = [];
  for (let i = 0, n = rng.int(3, 6); i < n; i++) {
    parts.push([syl(0, 0.075, hi, hi * 0.97, { h2: 0.03, amp: 0.9 }), 0.035]);
    parts.push([syl(0, 0.1, lo * 1.05, lo, { shape: 'exp', h2: 0.05 }), 0.11]);
  }
  return chain(parts);
}

function songPinzon(rng) {
  const parts = [];
  let f = rng.range(5200, 6000);
  for (let i = 0, a = rng.int(4, 6); i < a; i++) {
    parts.push([syl(0, 0.055, f, f * 0.8, { h2: 0.04, amp: 0.8 }), 0.05 - i * 0.004]);
    f *= 0.97;
  }
  f = rng.range(3800, 4400);
  for (let i = 0, b = rng.int(3, 5); i < b; i++) {
    parts.push([syl(0, 0.07, f * 1.1, f * 0.85, { shape: 'arch', h2: 0.05 }), 0.035]);
    f *= 0.95;
  }
  parts.push([syl(0, 0.28, rng.range(4600, 5200), rng.range(2400, 2900), { shape: 'hook', vib: 0.03, vibRate: 55, h2: 0.06 }), 0]);
  return chain(parts);
}

function songCuco(rng) {
  const f = rng.range(640, 720);
  return chain([
    [syl(0, 0.17, f, f * 0.98, { h2: 0.12, h3: 0.03, curve: 0.5, attack: 0.1 }), 0.13],
    [syl(0, 0.3, f * 0.81, f * 0.79, { h2: 0.12, h3: 0.03, curve: 0.5, attack: 0.1 }), 0],
  ]);
}

function songTortola(rng) {
  const f = rng.range(500, 580);
  const parts = [];
  for (let i = 0, n = rng.int(3, 5); i < n; i++) {
    parts.push([syl(0, rng.range(0.55, 0.75), f, f * 0.92, { h2: 0.3, h3: 0.1, curve: 0.6, attack: 0.15, am: 22, amDepth: 0.45, breath: 0.02 }), rng.range(0.35, 0.6)]);
  }
  return chain(parts);
}

function songAutillo(rng) {
  const f = rng.range(1150, 1350);
  return [syl(0, 0.2, f * 1.02, f * 0.97, { h2: 0.07, curve: 0.7, attack: 0.12 })];
}

function songCarabo(rng) {
  const f = rng.range(400, 450);
  return chain([
    [syl(0, 0.95, f, f * 0.96, { shape: 'arch', h2: 0.12, h3: 0.04, attack: 0.08, curve: 0.6, breath: 0.03 }), 3.2],
    [syl(0, 0.14, f, f * 0.97, { h2: 0.1, amp: 0.7 }), 0.25],
    [syl(0, 1.7, f * 0.98, f * 0.95, { h2: 0.12, h3: 0.04, attack: 0.03, curve: 0.8, am: 17, amDepth: 0.5, breath: 0.03 }), 0],
  ]);
}

const SONGS = {
  generico: songGeneric,
  mirlo: songMirlo,
  petirrojo: songPetirrojo,
  carbonero: songCarbonero,
  pinzon: songPinzon,
  cuco: songCuco,
  tortola: songTortola,
  autillo: songAutillo,
  carabo: songCarabo,
};

const SPECIES_GAIN = { cuco: 0.7, tortola: 0.7, carabo: 0.8, autillo: 0.8 };

export function compilePajaro(track, el, ctx) {
  const k = natureKit(track, el, ctx);
  const { p, rng } = k;
  const make = SONGS[p.species] || songGeneric;
  const n = Math.round(p.individuals);
  const pans = k.pans(n);
  const out = [];
  const mean = 60 / Math.max(1, p.songRate);
  for (let j = 0; j < n && out.length < k.budget; j++) {
    const bank = [0, 1, 2, 3].map(() => make(rng, p));
    const lvl = rng.range(0.6, 1) * (SPECIES_GAIN[p.species] || 1);
    const seed = subSeed(ctx.elementSeed, j);
    let t = k.audition ? 0.05 + j * 0.4 : rng.range(0, mean);
    while (t < k.len && out.length < k.budget) {
      const song = rng.pick(bank);
      const dur = syllablesLength(song);
      if (rng.next() < k.densityAt(t)) {
        const g = k.levelAt(t) * lvl * rng.range(0.8, 1) * 0.32;
        if (g > 0.0003) out.push(syllableEvent(t, () => song, { pan: pans[j], amp: g, seed, dur }));
      }
      t += dur + Math.max(0.3, mean - dur) * rng.range(1 - 0.6 * k.variation, 1 + 0.6 * k.variation);
    }
  }
  return out;
}

/* ------------------------------------------------------------ ranas */

function callSapo(rng, f) {
  return [syl(0, 0.14, f * 1.01, f * 0.975, { h2: 0.05, curve: 0.6, attack: 0.15 })];
}

function callRanita(rng) {
  const f = rng.range(950, 1100);
  const list = [];
  let t = 0;
  for (let i = 0, n = rng.int(2, 5); i < n; i++) {
    const d = rng.range(0.22, 0.34);
    list.push(syl(t, d, f, f * 0.97, { h2: 0.6, h3: 0.2, attack: 0.3, curve: 0.5, am: rng.range(105, 135), amDepth: 1, amSharp: 3, breath: 0.12 }));
    t += d + rng.range(0.12, 0.2);
  }
  return list;
}

function callCroar(rng) {
  const f = rng.range(150, 260);
  return [syl(0, rng.range(0.35, 0.5), f, f * 0.85, { h2: 0.5, h3: 0.35, attack: 0.15, curve: 0.5, am: rng.range(25, 35), amDepth: 0.8, breath: 0.1 })];
}

export function compileRana(track, el, ctx) {
  const k = natureKit(track, el, ctx);
  const { p, rng } = k;
  const n = Math.round(p.individuals);
  const pans = k.pans(n);
  const out = [];
  const period = 60 / Math.max(1, p.callsPerMin);
  for (let j = 0; j < n && out.length < k.budget; j++) {
    const f = rng.range(1400, 2100);
    const per = period * rng.range(0.85, 1.15);
    const lvl = rng.range(0.6, 1);
    const seed = subSeed(ctx.elementSeed, j);
    let t = k.audition ? 0.05 + j * 0.3 : rng.range(0, per);
    while (t < k.len && out.length < k.budget) {
      const call = p.species === 'ranita' ? callRanita(rng) : p.species === 'croar' ? callCroar(rng) : callSapo(rng, f);
      const dur = syllablesLength(call);
      if (rng.next() < k.densityAt(t)) {
        const g = k.levelAt(t) * lvl * (p.species === 'sapoPartero' ? 0.32 : 0.26);
        if (g > 0.0003) out.push(syllableEvent(t, () => call, { pan: pans[j], amp: g, seed, dur }));
      }
      t += Math.max(dur + 0.1, per * (1 + (rng.next() - 0.5) * 0.3 * k.variation));
    }
  }
  return out;
}
