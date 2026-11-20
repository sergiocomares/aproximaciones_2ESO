'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadGame() {
  const elements = new Map();
  function element() {
    return {
      textContent: '', children: [], listeners: {}, attributes: {},
      addEventListener(type, handler) { this.listeners[type] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; },
      style: {},
      replaceChildren(...children) { this.children = children; },
      append(...children) { this.children.push(...children); },
      classList: { add() {}, remove() {}, toggle() {} }
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
  const context = vm.createContext({ document, window: {}, console, Intl });
  const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  vm.runInContext(source, context);
  return { context, elements };
}

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
