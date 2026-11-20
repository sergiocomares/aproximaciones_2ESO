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
      textContent: '', children: [],
      addEventListener() {},
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
          if (q.place.unit === 1000n && q.number % 1000n === 0n) throw Error('Unidades sin decimales');
          if (!q.place.integer && q.decimalPlaces < 3) throw Error('Faltan cifras decimales');
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
    approximate(38572000n, 100000n, 'REDONDEO'),
    approximate(38572000n, 100000n, 'TRUNCAMIENTO'),
    approximate(45789n, 10n, 'REDONDEO'),
    approximate(45789n, 10n, 'TRUNCAMIENTO'),
    parseAnswer('12,005'),
    parseAnswer('45,780') === parseAnswer('45,78')
  ]`, context);
  assert.deepEqual(Array.from(result), [38600000n, 38500000n, 45790n, 45780n, 12005n, true]);
});

test('el vocabulario matemático es bilingüe, sin confundir órdenes ni interpretar HTML', () => {
  const { context } = loadGame();
  const terms = {
    'REDONDEO': 'ROUNDING', 'TRUNCAMIENTO': 'TRUNCATION',
    'DECENAS DE MILLAR': 'TEN THOUSANDS', 'UNIDADES DE MILLAR': 'THOUSANDS',
    'CENTENAS': 'HUNDREDS', 'DECENAS': 'TENS', 'UNIDADES': 'UNITS',
    'DÉCIMAS': 'TENTHS', 'CENTÉSIMAS': 'HUNDREDTHS', 'MILÉSIMAS': 'THOUSANDTHS'
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
