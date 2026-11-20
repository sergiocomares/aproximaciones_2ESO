'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadGame({ reducedMotion = false, initialWelcome = false, Audio } = {}) {
  const elements = new Map();
  const timers = [];
  function element() {
    const classes = new Set();
    return {
      textContent: '', children: [], listeners: {}, attributes: {},
      addEventListener(type, handler) { this.listeners[type] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; },
      focus() { this.focused = true; },
      style: {},
      replaceChildren(...children) { this.children = children; },
      append(...children) { this.children.push(...children); },
      classList: {
        add(name) { classes.add(name); },
        remove(name) { classes.delete(name); },
        toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
        contains(name) { return classes.has(name); }
      }
    };
  }
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    createElement: element,
    addEventListener() {}
  };
  const window = {
    matchMedia: () => ({ matches: reducedMotion, addEventListener() {} }),
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeout() {}
  };
  if (initialWelcome) document.getElementById('welcome-screen').classList.add('active');
  const context = vm.createContext({ document, window, console, Intl, Audio });
  const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  vm.runInContext(source, context);
  return { context, elements, timers };
}

test('la introducción termina tras 15 segundos o al saltarla sin repetirse', () => {
  const timed = loadGame();
  assert.equal(timed.timers[0].delay, 15000);
  timed.timers[0].callback();
  assert.equal(timed.elements.get('intro-crawl').hidden, true);
  assert.equal(timed.elements.get('intro-landing').hidden, false);
  assert.equal(timed.elements.get('skip-intro').hidden, true);

  const skipped = loadGame();
  vm.runInContext('state.sound = false', skipped.context);
  skipped.elements.get('skip-intro').listeners.click();
  assert.equal(skipped.elements.get('intro-landing').hidden, false);
  assert.equal(skipped.elements.get('start-button').focused, true);
  skipped.timers[0].callback();
  assert.equal(skipped.elements.get('intro-crawl').hidden, true);
});

test('la introducción con movimiento reducido muestra el texto y la portada estáticos', () => {
  const { elements, timers } = loadGame({ reducedMotion: true });
  assert.equal(timers.length, 0);
  assert.equal(elements.get('intro-stage').classList.contains('intro-static'), true);
  assert.equal(elements.get('intro-crawl').hidden, false);
  assert.equal(elements.get('intro-landing').hidden, false);
  assert.equal(elements.get('skip-intro').hidden, true);
});

test('el efecto original de la portada solo suena tras una interacción y respeta el silencio', () => {
  const { context, elements, timers } = loadGame();
  const contexts = [];
  context.window.AudioContext = class {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; contexts.push(this); }
    createOscillator() {
      return {
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {}, start() {}, stop() {}
      };
    }
    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
    }
    close() { this.state = 'closed'; return Promise.resolve(); }
  };
  timers[0].callback();
  assert.equal(contexts.length, 0);

  vm.runInContext('playIntroCue(true)', context);
  assert.equal(contexts.length, 1);
  elements.get('sound-toggle').listeners.click();
  assert.equal(contexts[0].state, 'closed');
  vm.runInContext('playIntroCue(true)', context);
  assert.equal(contexts.length, 1);
});

test('la música de la portada se inicia al cargar, se pausa y se reinicia al salir', async () => {
  const tracks = [];
  const Audio = class {
    constructor(src) { this.src = src; this.paused = true; this.currentTime = 0; tracks.push(this); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  };
  const { context, elements } = loadGame({ initialWelcome: true, Audio });
  assert.equal(tracks.length, 1);
  await Promise.resolve();
  assert.equal(tracks[0].src, 'audio/entradilla.mp3');
  assert.equal(tracks[0].volume, 0.2);
  assert.equal(tracks[0].loop, true);
  assert.equal(elements.get('intro-music-hint').hidden, true);
  tracks[0].currentTime = 8;
  elements.get('sound-toggle').listeners.click();
  assert.equal(tracks[0].paused, true);
  assert.equal(tracks[0].currentTime, 8);
  elements.get('sound-toggle').listeners.click();
  await Promise.resolve();
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].paused, false);
  vm.runInContext('pauseIntroMusic(true)', context);
  assert.equal(tracks[0].paused, true);
  assert.equal(tracks[0].currentTime, 0);
});

test('un bloqueo de la música mantiene activado el sonido y permite reintentar', async () => {
  let attempts = 0;
  const Audio = class {
    constructor() { this.paused = true; }
    play() {
      attempts += 1;
      if (attempts === 1) return Promise.reject(Object.assign(new Error('Bloqueado'), { name: 'NotAllowedError' }));
      this.paused = false;
      return Promise.resolve();
    }
    pause() {}
  };
  const { context, elements } = loadGame({ initialWelcome: true, Audio });
  context.console = { warn() {} };
  await new Promise(setImmediate);
  assert.equal(attempts, 1);
  assert.equal(vm.runInContext('state.sound', context), true);
  assert.equal(elements.get('intro-music-hint').hidden, false);
  assert.match(elements.get('toast').textContent, /ha bloqueado la música/);
  vm.runInContext('playIntroMusic()', context);
  await Promise.resolve();
  assert.equal(attempts, 2);
  assert.equal(elements.get('intro-music-hint').hidden, true);
});

test('el sonido utiliza los archivos correspondientes y se detiene al desactivarlo', () => {
  const { context, elements } = loadGame();
  const played = [];
  context.Audio = class {
    constructor(src) { this.src = src; this.paused = false; played.push(this); }
    play() { return Promise.resolve(); }
    pause() { this.paused = true; }
  };
  assert.equal(vm.runInContext('state.sound', context), true);
  assert.equal(played.length, 0);
  const toggle = elements.get('sound-toggle');
  toggle.listeners.click();
  assert.equal(toggle.attributes['aria-pressed'], 'false');
  vm.runInContext('playSound(true)', context);
  assert.equal(played.length, 0);

  toggle.listeners.click();
  assert.equal(played[0].src, 'audio/sonidoAcierto.mp3');
  assert.equal(played[0].volume, 0.4);
  assert.equal(toggle.attributes['aria-pressed'], 'true');
  vm.runInContext('playSound(false)', context);
  assert.equal(played[0].paused, true);
  assert.equal(played[1].src, 'audio/sonidoError.mp3');
  toggle.listeners.click();
  assert.equal(played[1].paused, true);
  assert.equal(toggle.attributes['aria-pressed'], 'false');
  vm.runInContext('playSound(false)', context);
  assert.equal(played.length, 2);
});

test('un fallo de reproducción desactiva el sonido y avisa al usuario', async () => {
  const { context, elements } = loadGame();
  const warnings = [];
  context.console = { warn: (...args) => warnings.push(args) };
  context.window.clearTimeout = () => {};
  context.window.setTimeout = () => 1;
  context.Audio = class {
    play() { return Promise.reject(new Error('Audio no disponible')); }
    pause() {}
  };
  vm.runInContext('playSound(true)', context);
  await new Promise(setImmediate);
  assert.equal(elements.get('sound-toggle').attributes['aria-pressed'], 'false');
  assert.match(elements.get('toast').textContent, /No se pudo reproducir el sonido/);
  assert.equal(warnings.length, 1);
});

test('el bloqueo temporal de reproducción no desactiva la preferencia de sonido', async () => {
  const { context, elements } = loadGame();
  context.console = { warn() {} };
  context.window.clearTimeout = () => {};
  context.window.setTimeout = () => 1;
  context.Audio = class {
    play() { return Promise.reject(Object.assign(new Error('Bloqueado'), { name: 'NotAllowedError' })); }
    pause() {}
  };
  vm.runInContext('playSound(true)', context);
  await new Promise(setImmediate);
  assert.equal(vm.runInContext('state.sound', context), true);
  assert.match(elements.get('toast').textContent, /ha bloqueado el sonido/);
});

test('aciertos y errores se identifican con texto y símbolos diferentes', () => {
  for (const [response, title, symbol] of [
    ['12', '¡CORRECTO!', '✓'],
    ['13', '¡REVISA TU RESPUESTA!', '✕']
  ]) {
    const { context, elements } = loadGame();
    vm.runInContext(`
      state.questions = [
        { level: 0, number: 123000n, answer: 120000n, place: PLACES[4], procedure: 'TRUNCAMIENTO' },
        { level: 0 }
      ];
      state.sound = false;
    `, context);
    vm.runInContext(`document.getElementById('answer-input').value = ${JSON.stringify(response)}`, context);
    vm.runInContext('handleAnswer({ preventDefault() {} })', context);
    assert.equal(elements.get('feedback-title').textContent, title);
    assert.equal(elements.get('feedback-icon').textContent, symbol);
  }
});

test('el desplazamiento respeta la preferencia de movimiento reducido', () => {
  const { context } = loadGame();
  for (const [reduced, expected] of [[true, 'auto'], [false, 'smooth']]) {
    context.window.matchMedia = () => ({ matches: reduced });
    let behavior;
    context.window.scrollTo = (options) => { behavior = options.behavior; };
    vm.runInContext('scrollToTop()', context);
    assert.equal(behavior, expected);
  }
});

test('las partidas garantizan alternancia, cobertura, equilibrio y números adecuados', () => {
  const { context } = loadGame();
  for (let run = 0; run < 1000; run += 1) {
    vm.runInContext(`
      {
        const questions = buildQuestions();
        if (questions.length !== 20) throw Error('Número incorrecto de preguntas');
        if (questions.filter(q => q.procedure === 'REDONDEO').length !== 10) throw Error('Procedimientos desequilibrados');
        if (new Set(questions.map(q => q.place.name)).size !== 8) throw Error('Falta una posición');
        questions.forEach((q, i) => {
          if (q.level !== Math.floor(i / 4)) throw Error('Nivel incorrecto');
          if (q.place.integer !== (i % 2 === 1)) throw Error('Alternancia incorrecta');
          if (q.place.unit === 10000n && q.number % 10000n === 0n) throw Error('Unidades sin decimales');
          if (!q.place.integer && q.decimalPlaces < 3) throw Error('Faltan cifras decimales');
          if (q.place.name === 'MILÉSIMAS' && q.decimalPlaces !== 4) throw Error('Falta la cifra de las diezmilésimas');
          if (i >= 2 && q.procedure === questions[i - 1].procedure && q.procedure === questions[i - 2].procedure) throw Error('Demasiados procedimientos seguidos');
        });
        if (!questions.some(q => !q.place.integer && formatQuestionNumber(q).split(',')[1][1] === '0')) throw Error('Falta cero intermedio');
        if (!questions.some(q => !q.place.integer && formatQuestionNumber(q).endsWith('0'))) throw Error('Falta cero final');
      }
    `, context);
  }
});

test('los cálculos y las respuestas equivalentes conservan la precisión decimal', () => {
  const { context } = loadGame();
  const result = vm.runInContext(`[
    approximate(385720000n, 1000000n, 'REDONDEO'),
    approximate(385720000n, 1000000n, 'TRUNCAMIENTO'),
    approximate(457890n, 100n, 'REDONDEO'),
    approximate(457890n, 100n, 'TRUNCAMIENTO'),
    approximate(2781057n, 10n, 'REDONDEO'),
    approximate(2781057n, 10n, 'TRUNCAMIENTO'),
    formatNumber(2781057n, 4),
    getExplanation({ number: 2781057n, place: PLACES[7], procedure: 'REDONDEO', answer: 2781060n }),
    parseAnswer('12,005'),
    parseAnswer('45,780') === parseAnswer('45,78')
  ]`, context);
  assert.deepEqual(Array.from(result), [
    386000000n, 385000000n, 457900n, 457800n, 2781060n, 2781050n,
    '278,1057',
    'Conservamos hasta las milésimas y observamos las diezmilésimas: es un 7. Como es 5 o superior, aumentamos una unidad la cifra conservada. Resultado: 278,106.',
    120050n, true
  ]);
});

test('el vocabulario matemático es bilingüe, sin confundir órdenes ni interpretar HTML', () => {
  const { context } = loadGame();
  const terms = {
    'REDONDEO': 'ROUNDING', 'TRUNCAMIENTO': 'TRUNCATION',
    'DECENAS DE MILLAR': 'TEN THOUSANDS', 'UNIDADES DE MILLAR': 'THOUSANDS',
    'CENTENAS': 'HUNDREDS', 'DECENAS': 'TENS', 'UNIDADES': 'UNITS',
    'DÉCIMAS': 'TENTHS', 'CENTÉSIMAS': 'HUNDREDTHS', 'MILÉSIMAS': 'THOUSANDTHS',
    'DIEZMILÉSIMAS': 'TEN-THOUSANDTHS'
  };
  for (const [spanish, english] of Object.entries(terms)) {
    const result = vm.runInContext(`bilingualHTML(${JSON.stringify(spanish)})`, context);
    assert.ok(result.includes(`>${spanish}</span>`));
    assert.ok(result.includes(`lang="en">(${english})</span>`));
    assert.equal((result.match(/class="math-en"/g) || []).length, 1);
  }
  const sentence = vm.runInContext(`bilingualHTML('las décimas y las centésimas <script>')`, context);
  assert.ok(sentence.includes('(tenths)'));
  assert.ok(sentence.includes('(hundredths)'));
  assert.ok(sentence.includes('&lt;script&gt;'));
});

test('el diagnóstico cuenta errores reales y aplica el umbral del 70 %', () => {
  const { context, elements } = loadGame();
  vm.runInContext(`
    state.questions = buildQuestions();
    state.errors = state.questions.filter(q => !q.place.integer).slice(0, 4)
      .map(question => ({ question }));
    renderDiagnosis();
  `, context);
  const items = elements.get('diagnosis-list').children;
  assert.equal(items[0].children[1].textContent, '6 aciertos · 4 errores / 10 — Necesita practicar');
  assert.equal(items[1].children[1].textContent, '10 aciertos · 0 errores / 10 — Buen dominio');
  for (const item of items.slice(2)) {
    const text = item.children[1].textContent;
    const errors = Number(text.match(/(\d+) errores/)[1]);
    assert.ok(text.includes(errors <= 3 ? 'Buen dominio' : 'Necesita practicar'));
  }
});
