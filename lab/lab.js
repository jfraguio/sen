import { ambients } from '../src/config/ambients.js';
import { AmbientRenderer } from '../src/render/engine.js';
import { BASE_CONTROLS, defaultBaseParams, renderAmbient, SAMPLE_RATE } from './synth.js';
import { resolveAudioVariants, pickAudioVariant } from '../src/core/variants.js';

/* --------------------------------------------------------------------------
   Fondo
   -------------------------------------------------------------------------- */

const backdrop = new AmbientRenderer(document.getElementById('lab-canvas'));
backdrop.start({
  animation: 'constellation',
  palette: {
    void: ['#010107', '#070b20', '#010005'],
    nebula: ['#6f4cff', '#3b6dff', '#d9d1ff'],
    star: '#f0f3ff',
  },
});

/* --------------------------------------------------------------------------
   Configuración de la mezcla
   -------------------------------------------------------------------------- */

const ambientById = new Map(ambients.map((ambient) => [ambient.id, ambient]));

const LAYERS = [
  { key: 'bichos', label: 'Bichos', ambient: 'bichos' },
  { key: 'pajaros', label: 'Pájaros', ambient: 'pajaros' },
  { key: 'lluvia', label: 'Lluvia', ambient: 'lluvia' },
  { key: 'viento', label: 'Viento', ambient: 'viento' },
  { key: 'olas', label: 'Olas', ambient: 'mar' },
  { key: 'burbujas', label: 'Burbujas', ambient: 'burbujas' },
];

const SLIDERS = [
  { key: 'baseGain', label: 'Volumen base', min: 0, max: 1, step: 0.01, format: 'percent' },
  { key: 'noise', label: 'Ruido ambiente', min: 0, max: 1, step: 0.01, format: 'percent' },
  { key: 'bichos', label: 'Bichos', min: 0, max: 1, step: 0.01, format: 'percent' },
  { key: 'pajaros', label: 'Pájaros', min: 0, max: 1, step: 0.01, format: 'percent' },
  { key: 'lluvia', label: 'Lluvia', min: 0, max: 1, step: 0.01, format: 'percent' },
  { key: 'viento', label: 'Viento', min: 0, max: 1, step: 0.01, format: 'percent' },
  { key: 'olas', label: 'Olas', min: 0, max: 1, step: 0.01, format: 'percent' },
  { key: 'burbujas', label: 'Burbujas', min: 0, max: 1, step: 0.01, format: 'percent' },
  { key: 'wavesRate', label: 'Velocidad de las olas', min: 0.5, max: 2, step: 0.05, format: 'rate' },
  { key: 'brightness', label: 'Brillo general', min: 1000, max: 16000, step: 100, format: 'hz' },
  { key: 'master', label: 'Volumen general', min: 0, max: 1, step: 0.01, format: 'percent' },
];

const DEFAULTS = {
  base: 'lluvia',
  baseGain: 0.9,
  noise: 0.12,
  bichos: 0,
  pajaros: 0,
  lluvia: 0,
  viento: 0,
  olas: 0,
  burbujas: 0,
  wavesRate: 1,
  brightness: 12000,
  master: 0.85,
  name: '',
  notes: '',
};

const PRESETS = [
  {
    id: 'espacio-personalizado',
    name: 'Espacio personalizado',
    baseParams: { drone: 0.55, shimmer: 0.35, movement: 0.4, brightness: 0.5 },
    values: {
      base: 'espacio',
      baseGain: 0.56,
      noise: 0,
      bichos: 0,
      pajaros: 0,
      lluvia: 0,
      viento: 0,
      olas: 0,
      burbujas: 0,
      wavesRate: 0.5,
      brightness: 1000,
      master: 0.45,
    },
  },
  {
    id: 'lluvia-grillos',
    name: 'Lluvia + grillos',
    baseParams: { intensity: 0.7, drops: 0.55, hiss: 0.4, wind: 0.15, brightness: 0.6 },
    values: {
      base: 'lluvia',
      baseGain: 0.9,
      noise: 0.14,
      bichos: 0.3,
      pajaros: 0,
      lluvia: 0,
      viento: 0,
      olas: 0,
      burbujas: 0,
      wavesRate: 1,
      brightness: 11000,
      master: 0.85,
    },
  },
  {
    id: 'olas-amanecer',
    name: 'Olas al amanecer',
    baseParams: { speed: 0.7, depth: 0.7, foam: 0.55, wind: 0.2, brightness: 0.6 },
    values: {
      base: 'mar',
      baseGain: 0.9,
      noise: 0.08,
      bichos: 0,
      pajaros: 0.22,
      lluvia: 0,
      viento: 0,
      olas: 0.18,
      burbujas: 0,
      wavesRate: 0.82,
      brightness: 12000,
      master: 0.85,
    },
  },
  {
    id: 'bano-burbujas',
    name: 'Baño de burbujas',
    baseParams: { bubbles: 0.75, pops: 0.6, water: 0.6, fizz: 0.5, brightness: 0.5 },
    values: {
      base: 'burbujas',
      baseGain: 0.9,
      noise: 0.1,
      bichos: 0,
      pajaros: 0,
      lluvia: 0,
      viento: 0,
      olas: 0,
      burbujas: 0.22,
      wavesRate: 1,
      brightness: 9000,
      master: 0.8,
    },
  },
  {
    id: 'bosque-noche',
    name: 'Bosque nocturno',
    baseParams: { wind: 0.6, leaves: 0.65, birds: 0.75, rustle: 0.5, brightness: 0.55 },
    values: {
      base: 'bosque',
      baseGain: 0.9,
      noise: 0.18,
      bichos: 0.24,
      pajaros: 0.1,
      lluvia: 0,
      viento: 0.1,
      olas: 0,
      burbujas: 0,
      wavesRate: 1,
      brightness: 10000,
      master: 0.85,
    },
  },
];

const state = { ...DEFAULTS };
const baseParams = Object.fromEntries(ambients.map((ambient) => [ambient.id, defaultBaseParams(ambient.id)]));
let baseRegenTimer = 0;

const els = {
  base: document.getElementById('base'),
  play: document.getElementById('play'),
  playIcon: document.querySelector('#play .button__icon'),
  playText: document.getElementById('play-text'),
  status: document.getElementById('status'),
  statusText: document.getElementById('status-text'),
  presets: document.getElementById('presets'),
  sliders: document.getElementById('sliders'),
  baseSliders: document.getElementById('base-sliders'),
  baseName: document.getElementById('base-name'),
  name: document.getElementById('preset-name'),
  notes: document.getElementById('preset-notes'),
  json: document.getElementById('json'),
  download: document.getElementById('download'),
  copy: document.getElementById('copy'),
  reset: document.getElementById('reset'),
};

const sliderInputs = new Map();
const baseSliderInputs = new Map();

/* --------------------------------------------------------------------------
   Audio
   -------------------------------------------------------------------------- */

const layerAmbientIds = [...new Set(LAYERS.map((layer) => layer.ambient))];

const audio = {
  ctx: null,
  filter: null,
  compressor: null,
  master: null,
  baseGain: null,
  noiseGain: null,
  noiseFilter: null,
  noiseSource: null,
  baseSource: null,
  baseMix: null,
  baseExtras: new Set(),
  layerSources: new Map(),
  layerGains: new Map(),
  playing: false,
  loading: false,
  generation: 0,
  buffers: new Map(),

  ensureContext() {
    if (this.ctx) return this.ctx;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio no disponible');
    this.ctx = new AudioContextClass();
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 0.6;
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.2;
    this.master = this.ctx.createGain();
    this.filter.connect(this.compressor);
    this.compressor.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.baseGain = this.ctx.createGain();
    this.baseGain.connect(this.filter);
    this.noiseFilter = this.ctx.createBiquadFilter();
    this.noiseFilter.type = 'lowpass';
    this.noiseFilter.frequency.value = 1500;
    this.noiseGain = this.ctx.createGain();
    this.noiseGain.connect(this.filter);
    this.noiseFilter.connect(this.noiseGain);
    return this.ctx;
  },

  async loadAmbient(id) {
    if (this.buffers.has(id)) return this.buffers.get(id);
    const ambient = ambientById.get(id);
    if (!ambient) throw new Error(`Ambiente desconocido: ${id}`);
    const paths = await resolveAudioVariants(ambient.audioDir, '../');
    const src = pickAudioVariant(paths);
    if (!src) throw new Error(`No hay audio para ${ambient.name}`);
    const response = await fetch(src, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`No se pudo cargar ${ambient.name}`);
    const data = await response.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(data);
    this.buffers.set(id, buffer);
    return buffer;
  },

  generateBaseBuffer() {
    const samples = renderAmbient(state.base, baseParams[state.base]);
    const buffer = this.ctx.createBuffer(1, samples.length, SAMPLE_RATE);
    buffer.copyToChannel(samples, 0);
    return buffer;
  },

  makeNoiseBuffer() {
    const seconds = 3;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + 0.025 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.2;
    }
    return buffer;
  },

  makeSource(buffer, gain, rate = 1) {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = rate;
    source.connect(gain);
    return source;
  },

  startBase(buffer, when = this.ctx.currentTime) {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.baseGain);
    const source = this.makeSource(
      buffer,
      gain,
      state.base === 'mar' ? state.wavesRate : 1,
    );
    source.start(when);
    gain.gain.setTargetAtTime(1, this.ctx.currentTime + 0.01, 0.05);

    if (this.baseSource && this.baseMix) {
      const oldSource = this.baseSource;
      const oldGain = this.baseMix;
      oldGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
      const extra = { source: oldSource, gain: oldGain };
      this.baseExtras.add(extra);
      window.setTimeout(() => {
        try { oldSource.stop(); } catch { /* ya parado */ }
        try { oldSource.disconnect(); } catch { /* sin conexión */ }
        try { oldGain.disconnect(); } catch { /* sin conexión */ }
        this.baseExtras.delete(extra);
      }, 260);
    }

    this.baseSource = source;
    this.baseMix = gain;
  },

  setGain(node, value) {
    const now = this.ctx.currentTime;
    node.gain.setTargetAtTime(Math.max(0, value), now, 0.035);
  },

  apply() {
    if (!this.ctx) return;
    this.setGain(this.baseGain, state.baseGain);
    this.setGain(this.noiseGain, state.noise * 0.22);
    this.setGain(this.master, state.master);
    for (const layer of LAYERS) {
      const gain = this.layerGains.get(layer.key);
      if (gain) this.setGain(gain, state[layer.key]);
    }
    this.filter.frequency.setTargetAtTime(state.brightness, this.ctx.currentTime, 0.05);
    if (this.baseSource) {
      this.baseSource.playbackRate.value = state.base === 'mar' ? state.wavesRate : 1;
    }
    const olas = this.layerSources.get('olas');
    if (olas) olas.playbackRate.value = state.wavesRate;
  },

  async start() {
    if (this.playing || this.loading) return;
    this.loading = true;
    this.generation += 1;
    const generation = this.generation;
    setStatus('cargando', true);
    els.play.disabled = true;

    try {
      const ctx = this.ensureContext();
      if (ctx.state !== 'running') await ctx.resume();
      await Promise.all(layerAmbientIds.map((id) => this.loadAmbient(id)));
      if (generation !== this.generation) return;
      const baseBuffer = this.generateBaseBuffer();

      this.stopSources();

      const when = ctx.currentTime + 0.08;
      this.noiseSource = this.makeSource(this.makeNoiseBuffer(), this.noiseFilter);
      this.noiseSource.start(when);

      this.startBase(baseBuffer, when);

      for (const layer of LAYERS) {
        const buffer = this.buffers.get(layer.ambient);
        const gain = ctx.createGain();
        gain.connect(this.filter);
        const source = this.makeSource(buffer, gain, layer.key === 'olas' ? state.wavesRate : 1);
        source.start(when);
        this.layerGains.set(layer.key, gain);
        this.layerSources.set(layer.key, source);
      }

      this.apply();
      this.playing = true;
      this.loading = false;
      els.play.disabled = false;
      els.playIcon.textContent = '■';
      els.playText.textContent = 'Detener';
      setStatus('reproduciendo', true);
    } catch (error) {
      console.error(error);
      this.loading = false;
      this.playing = false;
      els.play.disabled = false;
      els.playIcon.textContent = '▶';
      setStatus(error.message || 'error al cargar', true, true);
    }
  },

  stop() {
    this.generation += 1;
    this.stopSources();
    this.playing = false;
    this.loading = false;
    els.play.disabled = false;
    els.playIcon.textContent = '▶';
    els.playText.textContent = 'Escuchar';
    if (this.ctx?.state === 'running') this.ctx.suspend().catch(() => {});
    setStatus('detenido');
  },

  stopSources() {
    if (this.baseSource) {
      try { this.baseSource.stop(); } catch { /* ya parado */ }
      try { this.baseSource.disconnect(); } catch { /* sin conexión */ }
      this.baseSource = null;
    }
    if (this.baseMix) {
      try { this.baseMix.disconnect(); } catch { /* sin conexión */ }
      this.baseMix = null;
    }
    for (const extra of this.baseExtras) {
      try { extra.source.stop(); } catch { /* ya parado */ }
      try { extra.source.disconnect(); } catch { /* sin conexión */ }
      try { extra.gain.disconnect(); } catch { /* sin conexión */ }
    }
    this.baseExtras.clear();
    for (const source of this.layerSources.values()) {
      try { source.stop(); } catch { /* ya parado */ }
      try { source.disconnect(); } catch { /* sin conexión */ }
    }
    for (const gain of this.layerGains.values()) {
      try { gain.disconnect(); } catch { /* sin conexión */ }
    }
    this.layerSources.clear();
    this.layerGains.clear();
    if (this.noiseSource) {
      try { this.noiseSource.stop(); } catch { /* ya parado */ }
      try { this.noiseSource.disconnect(); } catch { /* sin conexión */ }
      this.noiseSource = null;
    }
  },

  changeBase() {
    if (!this.playing) return;
    try {
      const baseBuffer = this.generateBaseBuffer();
      this.startBase(baseBuffer);
      this.apply();
      setStatus('reproduciendo', true);
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'error de síntesis', true, true);
    }
  },
};

/* --------------------------------------------------------------------------
   Interfaz
   -------------------------------------------------------------------------- */

function baseName(id) {
  return ambientById.get(id)?.name || id;
}

function formatValue(value, format) {
  if (format === 'rate') return `${Number(value).toFixed(2)}×`;
  if (format === 'hz') return `${Math.round(Number(value) / 1000)} kHz`;
  return `${Math.round(Number(value) * 100)}%`;
}

function setStatus(text, active = false, error = false) {
  els.statusText.textContent = text;
  els.status.classList.toggle('is-playing', active && !error);
  els.status.classList.toggle('is-error', error);
}

function buildBaseSelect() {
  els.base.innerHTML = ambients
    .map((ambient) => `<option value="${ambient.id}">${ambient.name}</option>`)
    .join('');
  els.base.value = state.base;
}

function buildBaseControls() {
  els.baseName.textContent = baseName(state.base);
  els.baseSliders.replaceChildren();
  baseSliderInputs.clear();
  const controls = BASE_CONTROLS[state.base] || [];

  for (const config of controls) {
    const row = document.createElement('div');
    row.className = 'slider';
    row.innerHTML = `
      <label for="base-${config.key}">${config.label}</label>
      <input id="base-${config.key}" type="range" min="0" max="1" step="0.01" value="${baseParams[state.base][config.key]}" />
      <output for="base-${config.key}"></output>
    `;
    const input = row.querySelector('input');
    const output = row.querySelector('output');
    baseSliderInputs.set(config.key, { input, output, config });
    input.addEventListener('input', () => {
      baseParams[state.base][config.key] = Number(input.value);
      updateBaseSlider(config.key);
      updateJson();
      clearActivePreset();
      scheduleBaseChange();
    });
    els.baseSliders.append(row);
  }

  syncBaseSliders();
}

function updateBaseSlider(key) {
  const entry = baseSliderInputs.get(key);
  if (!entry) return;
  const { input, output, config } = entry;
  const value = baseParams[state.base][key];
  input.value = String(value);
  input.style.setProperty('--fill', `${value * 100}%`);
  output.textContent = formatValue(value, 'percent');
}

function syncBaseSliders() {
  for (const key of baseSliderInputs.keys()) updateBaseSlider(key);
}

function scheduleBaseChange() {
  if (!audio.playing) return;
  window.clearTimeout(baseRegenTimer);
  baseRegenTimer = window.setTimeout(() => audio.changeBase(), 180);
}

function buildSliders() {
  for (const config of SLIDERS) {
    const row = document.createElement('div');
    row.className = 'slider';
    row.innerHTML = `
      <label for="slider-${config.key}">${config.label}</label>
      <input id="slider-${config.key}" type="range" min="${config.min}" max="${config.max}" step="${config.step}" value="${state[config.key]}" />
      <output for="slider-${config.key}"></output>
    `;
    const input = row.querySelector('input');
    const output = row.querySelector('output');
    sliderInputs.set(config.key, { input, output, config });
    input.addEventListener('input', () => {
      state[config.key] = Number(input.value);
      updateSlider(config.key);
      updateJson();
      audio.apply();
      clearActivePreset();
    });
    els.sliders.append(row);
  }
  syncSliders();
}

function updateSlider(key) {
  const entry = sliderInputs.get(key);
  if (!entry) return;
  const { input, output, config } = entry;
  const value = state[key];
  input.value = String(value);
  const percent = ((value - config.min) / (config.max - config.min)) * 100;
  input.style.setProperty('--fill', `${percent}%`);
  output.textContent = formatValue(value, config.format);
}

function syncSliders() {
  for (const key of sliderInputs.keys()) updateSlider(key);
}

function buildPresets() {
  for (const preset of PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset';
    button.textContent = preset.name;
    button.addEventListener('click', () => applyPreset(preset));
    els.presets.append(button);
  }
}

function clearActivePreset() {
  for (const button of els.presets.querySelectorAll('.preset')) {
    button.classList.remove('is-active');
  }
}

function applyPreset(preset) {
  Object.assign(state, preset.values);
  baseParams[state.base] = {
    ...defaultBaseParams(state.base),
    ...(preset.baseParams || {}),
  };
  els.base.value = state.base;
  buildBaseControls();
  syncSliders();
  updateJson();
  clearActivePreset();
  const button = [...els.presets.querySelectorAll('.preset')].find(
    (item) => item.textContent === preset.name,
  );
  button?.classList.add('is-active');
  if (audio.playing) audio.changeBase();
}

function paramsObject(withDate = false) {
  const data = {
    schema: 'sen-lab/2',
    engine: 'synth/1',
    name: state.name.trim() || `${baseName(state.base)} personalizado`,
    base: state.base,
    baseName: baseName(state.base),
    baseParams: Object.fromEntries(
      Object.entries(baseParams[state.base]).map(([key, value]) => [key, Number(value.toFixed(2))]),
    ),
    mix: {
      base: Number(state.baseGain.toFixed(2)),
      noise: Number(state.noise.toFixed(2)),
      bichos: Number(state.bichos.toFixed(2)),
      pajaros: Number(state.pajaros.toFixed(2)),
      lluvia: Number(state.lluvia.toFixed(2)),
      viento: Number(state.viento.toFixed(2)),
      olas: Number(state.olas.toFixed(2)),
      burbujas: Number(state.burbujas.toFixed(2)),
    },
    wavesRate: Number(state.wavesRate.toFixed(2)),
    brightness: Math.round(state.brightness),
    master: Number(state.master.toFixed(2)),
    notes: state.notes.trim(),
  };
  if (withDate) data.savedAt = new Date().toISOString();
  return data;
}

function updateJson() {
  els.json.textContent = JSON.stringify(paramsObject(), null, 2);
}

function slug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

els.base.addEventListener('change', () => {
  state.base = els.base.value;
  buildBaseControls();
  updateJson();
  clearActivePreset();
  if (audio.playing) audio.changeBase();
});

els.play.addEventListener('click', () => {
  if (audio.playing || audio.loading) audio.stop();
  else audio.start();
});

els.name.addEventListener('input', () => {
  state.name = els.name.value;
  updateJson();
});

els.notes.addEventListener('input', () => {
  state.notes = els.notes.value;
  updateJson();
});

els.download.addEventListener('click', () => {
  const params = paramsObject(true);
  const blob = new Blob([`${JSON.stringify(params, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `sen-${slug(params.base)}-${slug(params.name) || 'variacion'}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setStatus('parámetros descargados', false);
  window.setTimeout(() => {
    if (!audio.playing) setStatus('listo');
  }, 2200);
});

els.copy.addEventListener('click', async () => {
  const text = JSON.stringify(paramsObject(true), null, 2);
  try {
    await navigator.clipboard.writeText(`${text}\n`);
    setStatus('JSON copiado', false);
  } catch {
    setStatus('no se pudo copiar', false, true);
  }
  window.setTimeout(() => {
    if (!audio.playing) setStatus('listo');
  }, 2200);
});

els.reset.addEventListener('click', () => {
  Object.assign(state, DEFAULTS);
  for (const ambient of ambients) {
    baseParams[ambient.id] = defaultBaseParams(ambient.id);
  }
  els.base.value = state.base;
  els.name.value = '';
  els.notes.value = '';
  buildBaseControls();
  syncSliders();
  updateJson();
  clearActivePreset();
  if (audio.playing) audio.changeBase();
});

window.addEventListener('beforeunload', () => {
  audio.stop();
  backdrop.dispose();
});

buildBaseSelect();
buildBaseControls();
buildSliders();
buildPresets();
updateJson();
setStatus('listo');
