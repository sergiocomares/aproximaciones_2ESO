'use strict';

const LEVELS = [
  { name: 'ROOKIE', subtitle: 'Primeros pasos', icon: '🚀' },
  { name: 'EXPLORER', subtitle: 'Explorando números', icon: '🧭' },
  { name: 'DECIMAL HUNTER', subtitle: 'Cazador decimal', icon: '💎' },
  { name: 'MASTER OF NUMBERS', subtitle: 'Maestro de los números', icon: '🧠' },
  { name: 'FINAL BOSS', subtitle: 'El desafío final', icon: '👾' }
];
const QUESTIONS_PER_LEVEL = 4;
const TOTAL_QUESTIONS = LEVELS.length * QUESTIONS_PER_LEVEL;
const NUMBER_SCALE = 10000n;
const MATH_TRANSLATIONS = {
  'redondeo': 'Rounding',
  'truncamiento': 'Truncation',
  'decenas de millar': 'Ten thousands',
  'unidades de millar': 'Thousands',
  'centenas': 'Hundreds',
  'decenas': 'Tens',
  'unidades': 'Units',
  'décimas': 'Tenths',
  'centésimas': 'Hundredths',
  'milésimas': 'Thousandths',
  'diezmilésimas': 'Ten-thousandths'
};
const MATH_TERMS = new RegExp(
  `(^|[^a-záéíóúüñ])(${Object.keys(MATH_TRANSLATIONS).sort((a, b) => b.length - a.length).join('|')})(?![a-záéíóúüñ])`,
  'gi'
);
const PLACES = [
  { name: 'DECENAS DE MILLAR', unit: 100000000n, integer: true, digitName: 'decenas de millar', observe: 'unidades de millar' },
  { name: 'UNIDADES DE MILLAR', unit: 10000000n, integer: true, digitName: 'unidades de millar', observe: 'centenas' },
  { name: 'CENTENAS', unit: 1000000n, integer: true, digitName: 'centenas', observe: 'decenas' },
  { name: 'DECENAS', unit: 100000n, integer: true, digitName: 'decenas', observe: 'unidades' },
  { name: 'UNIDADES', unit: 10000n, integer: true, digitName: 'unidades', observe: 'décimas' },
  { name: 'DÉCIMAS', unit: 1000n, integer: false, digitName: 'décimas', observe: 'centésimas' },
  { name: 'CENTÉSIMAS', unit: 100n, integer: false, digitName: 'centésimas', observe: 'milésimas' },
  { name: 'MILÉSIMAS', unit: 10n, integer: false, digitName: 'milésimas', observe: 'diezmilésimas' }
];
const state = {
  questions: [], questionIndex: 0, correct: 0, wrong: 0, score: 0,
  streak: 0, bestStreak: 0, levelCorrect: 0, startedAt: 0, timerId: null,
  errors: [], badges: new Set(), studentName: '', studentClass: '',
  answered: false, sound: true, currentAudio: null
};
const $ = (id) => document.getElementById(id);

function bilingualHTML(text) {
  return escapeHtml(text).replace(MATH_TERMS, (match, prefix, spanish) => {
    let english = MATH_TRANSLATIONS[spanish.toLocaleLowerCase('es-ES')];
    if (spanish === spanish.toLocaleUpperCase('es-ES')) english = english.toUpperCase();
    else if (spanish[0] === spanish[0].toLocaleLowerCase('es-ES')) english = english.toLowerCase();
    return `${prefix}<span class="math-es">${spanish}</span> <span class="math-en" lang="en">(${english})</span>`;
  });
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.toggle('active', screen.id === screenId));
  scrollToTop();
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(items) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function buildQuestions() {
  const questions = [];
  const decimalPlaces = shuffle(PLACES.slice(5));
  while (decimalPlaces.length < 10) decimalPlaces.push(PLACES[randomInt(5, 7)]);
  const integerPlaces = shuffle([PLACES[3], PLACES[4]]);
  const remainingIntegerPlaces = shuffle(PLACES.slice(0, 3));
  while (remainingIntegerPlaces.length < 8) remainingIntegerPlaces.push(PLACES[randomInt(0, 4)]);
  integerPlaces.push(...shuffle(remainingIntegerPlaces));
  for (let pair = 0; pair < TOTAL_QUESTIONS / 2; pair += 1) {
    const level = Math.floor(pair * 2 / QUESTIONS_PER_LEVEL);
    const procedures = shuffle(['REDONDEO', 'TRUNCAMIENTO']);
    questions.push(makeQuestion(level, decimalPlaces[pair], procedures[0], pair));
    questions.push(makeQuestion(level, integerPlaces[pair], procedures[1], pair));
  }
  return questions;
}

function makeQuestion(level, place, procedure, pair) {
  const maxWhole = [999, 9999, 99999, 999999, 999999][level];
  const minWhole = place.integer && place.unit > NUMBER_SCALE ? Number(place.unit / NUMBER_SCALE) : 0;
  const whole = BigInt(randomInt(minWhole, Math.max(minWhole * 10 - 1, maxWhole)));
  let fraction = 0;
  let decimalPlaces = 0;
  if (!place.integer) {
    fraction = pair === 0 ? 1057 : pair === 1 ? 1200 : randomInt(1, 9999);
    decimalPlaces = 4;
  } else if (place.unit === NUMBER_SCALE || Math.random() < 0.5) {
    decimalPlaces = randomInt(1, 4);
    fraction = randomInt(1, 10 ** decimalPlaces - 1) * 10 ** (4 - decimalPlaces);
  } else {
    decimalPlaces = 0;
  }
  const number = whole * NUMBER_SCALE + BigInt(fraction);
  return { level, number, isDecimal: decimalPlaces > 0, decimalPlaces, place, procedure, answer: approximate(number, place.unit, procedure) };
}

function approximate(number, unit, procedure) {
  if (procedure === 'TRUNCAMIENTO') return (number / unit) * unit;
  return ((number + unit / 2n) / unit) * unit;
}

function formatNumber(value, decimalPlaces) {
  const whole = value / NUMBER_SCALE;
  const fraction = String(value % NUMBER_SCALE).padStart(4, '0');
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  let result = grouped;
  if (decimalPlaces > 0) result += ',' + fraction.slice(0, decimalPlaces);
  return result;
}

function formatQuestionNumber(question) {
  return formatNumber(question.number, question.decimalPlaces);
}

function parseAnswer(raw) {
  const normalized = raw.trim().replace(/\s/g, '').replace(/'/g, '');
  if (!normalized || !/^\d+(?:[,.]\d{1,4})?$/.test(normalized)) return null;
  const parts = normalized.replace(',', '.').split('.');
  const whole = BigInt(parts[0]);
  const fraction = (parts[1] || '').padEnd(4, '0');
  return whole * NUMBER_SCALE + BigInt(fraction || '0');
}

function getExplanation(question) {
  const { number, place, procedure, answer } = question;
  const answerShown = formatNumber(answer, place.integer ? 0 : place.name === 'DÉCIMAS' ? 1 : place.name === 'CENTÉSIMAS' ? 2 : 3);
  if (procedure === 'TRUNCAMIENTO') {
    return `En el truncamiento a ${place.name.toLowerCase()}, conservamos hasta las ${place.digitName} y eliminamos las cifras posteriores, a partir de las ${place.observe}. Resultado: ${answerShown}.`;
  }
  const digit = Number((number / (place.unit / 10n)) % 10n);
  const inc = digit >= 5;
  return `Conservamos hasta las ${place.digitName} y observamos las ${place.observe}: es un ${digit}. ${inc ? 'Como es 5 o superior, aumentamos una unidad la cifra conservada.' : 'Como es menor que 5, la cifra conservada no cambia.'} Resultado: ${answerShown}.`;
}

function updateQuestion() {
  const q = state.questions[state.questionIndex];
  if (!q) return finishGame();
  const level = LEVELS[q.level];
  $('level-icon').textContent = level.icon;
  $('level-kicker').textContent = `NIVEL ${q.level + 1}`;
  $('level-title').textContent = level.name;
  $('level-subtitle').textContent = level.subtitle;
  $('question-level-tag').textContent = level.name;
  $('question-count').textContent = `PREGUNTA ${state.questionIndex + 1} / ${TOTAL_QUESTIONS}`;
  $('progress-count').textContent = `${state.questionIndex} / ${TOTAL_QUESTIONS}`;
  $('progress-fill').style.width = `${state.questionIndex / TOTAL_QUESTIONS * 100}%`;
  $('progress-track').setAttribute('aria-valuenow', String(state.questionIndex));
  $('number-display').textContent = formatQuestionNumber(q);
  $('procedure-display').innerHTML = bilingualHTML(q.procedure);
  $('place-display').innerHTML = bilingualHTML(q.place.name);
  $('answer-input').value = '';
  $('answer-input').disabled = false;
  $('check-button').disabled = false;
  $('feedback').hidden = true;
  $('feedback').classList.remove('incorrect');
  $('answer-form').hidden = false;
  $('answer-input').focus({ preventScroll: true });
  if (q.level === 4 && state.questionIndex === 4 * QUESTIONS_PER_LEVEL) $('game-motto').textContent = '👾 ¡Último desafío! El Final Boss te espera.';
  else $('game-motto').innerHTML = '<span aria-hidden="true">💡</span> ¡Piensa, aproxima y conquista cada nivel!';
  updateStats();
}

function updateStats() {
  $('score-value').textContent = String(state.score);
  $('streak-value').textContent = String(state.streak);
  const elapsed = state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0;
  $('timer-value').textContent = formatTime(elapsed);
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function handleAnswer(event) {
  event.preventDefault();
  if (state.answered) return;
  const input = $('answer-input');
  const answer = parseAnswer(input.value);
  if (answer === null) {
    input.setCustomValidity('Escribe un número válido, con un máximo de tres cifras decimales.');
    input.reportValidity();
    input.addEventListener('input', () => input.setCustomValidity(''), { once: true });
    return;
  }
  const question = state.questions[state.questionIndex];
  const correct = answer === question.answer;
  state.answered = true;
  $('progress-count').textContent = `${state.questionIndex + 1} / ${TOTAL_QUESTIONS}`;
  $('progress-fill').style.width = `${(state.questionIndex + 1) / TOTAL_QUESTIONS * 100}%`;
  $('progress-track').setAttribute('aria-valuenow', String(state.questionIndex + 1));
  input.disabled = true;
  $('check-button').disabled = true;
  $('feedback').hidden = false;
  $('feedback').classList.toggle('incorrect', !correct);
  $('feedback-icon').textContent = correct ? '✓' : '✕';
  $('feedback-title').textContent = correct ? '¡CORRECTO!' : '¡REVISA TU RESPUESTA!';
  const correctText = formatNumber(question.answer, question.place.integer ? 0 : question.place.name === 'DÉCIMAS' ? 1 : question.place.name === 'CENTÉSIMAS' ? 2 : 3);
  const task = `${question.procedure.toLowerCase()} a ${question.place.name.toLowerCase()}`;
  $('feedback-copy').innerHTML = bilingualHTML(correct
    ? `En ${task}, la respuesta correcta es ${correctText}. ¡Sigue así!`
    : `En ${task}, la respuesta correcta es ${correctText}. ${getExplanation(question)}`);
  if (correct) {
    state.correct += 1;
    state.levelCorrect += 1;
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.score += 100;
    if (state.streak % 5 === 0) {
      state.score += 25;
      showToast(`🔥 ¡Racha de ${state.streak}! +25 puntos`);
    }
    playSound(true);
    $('question-card').classList.remove('celebrate');
    void $('question-card').offsetWidth;
    $('question-card').classList.add('celebrate');
  } else {
    state.wrong += 1;
    state.streak = 0;
    state.errors.push({ question, response: input.value.trim(), questionNumber: state.questionIndex + 1, explanation: getExplanation(question) });
    playSound(false);
  }
  const currentLevel = question.level;
  const nextLevel = state.questions[state.questionIndex + 1] ? state.questions[state.questionIndex + 1].level : null;
  if (nextLevel !== currentLevel) {
    if (state.levelCorrect === QUESTIONS_PER_LEVEL) {
      state.score += 200;
      state.badges.add(`🏅 ${LEVELS[currentLevel].name} · SIN ERRORES`);
      $('feedback-copy').insertAdjacentText('beforeend', ' ¡Nivel perfecto! +200 puntos y una insignia.');
      showToast(`🏆 Nivel ${currentLevel + 1} perfecto: +200 puntos`);
    } else {
      state.badges.add(`🎖️ ${LEVELS[currentLevel].name} · COMPLETADO`);
      showToast(`${LEVELS[currentLevel].name} completado`);
    }
    state.levelCorrect = 0;
  }
  if (state.questionIndex + 1 === TOTAL_QUESTIONS / 2) state.badges.add('🌟 ¡MITAD DEL CAMINO!');
  if (state.bestStreak >= 10) state.badges.add('🔥 RACHA IMPARABLE');
  updateStats();
}

function advanceQuestion() {
  state.questionIndex += 1;
  state.answered = false;
  updateQuestion();
}

function startGame(event) {
  event.preventDefault();
  const name = $('student-name').value.trim();
  const groupSelect = $('student-class');
  const className = groupSelect.value === 'other' ? $('other-class').value.trim() : groupSelect.value;
  if (!name || !className) {
    $('form-error').textContent = 'Completa tu nombre y curso/grupo para continuar.';
    return;
  }
  state.studentName = name;
  state.studentClass = className;
  Object.assign(state, {
    questions: buildQuestions(), questionIndex: 0, correct: 0, wrong: 0,
    score: 0, streak: 0, bestStreak: 0, levelCorrect: 0, errors: [],
    badges: new Set(), answered: false, startedAt: Date.now()
  });
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = window.setInterval(updateStats, 1000);
  showScreen('game-screen');
  updateQuestion();
}

function finishGame() {
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
  state.badges.add('🏆 EXPERTO EN APROXIMACIONES');
  const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
  const grade = state.correct / TOTAL_QUESTIONS * 10;
  $('report-student').textContent = state.studentName;
  $('report-class').textContent = state.studentClass;
  $('report-date').textContent = `Realizado el ${new Intl.DateTimeFormat('es-ES', { dateStyle: 'full', timeStyle: 'short' }).format(new Date())}`;
  $('report-grade').textContent = grade.toFixed(2).replace('.', ',');
  $('report-correct').textContent = String(state.correct);
  $('report-wrong').textContent = String(state.wrong);
  $('report-percent').textContent = `${Math.round((state.correct / TOTAL_QUESTIONS) * 100)}%`;
  $('report-time').textContent = formatTime(elapsed);
  $('report-best-streak').textContent = String(state.bestStreak);
  $('report-score').textContent = `${state.score} puntos`;
  $('report-level').textContent = 'EXPERTO · 5 niveles completados';
  $('report-overview').innerHTML = bilingualHTML('20 preguntas realizadas: 10 de aproximaciones decimales y 10 de unidades y órdenes superiores.');
  $('report-comment').innerHTML = bilingualHTML(grade >= 9 ? '¡Excelente! Dominas las aproximaciones.' :
    grade >= 7 ? '¡Muy buen trabajo! Tienes un buen dominio.' :
      grade >= 5 ? '¡Buen esfuerzo! Debes seguir practicando.' :
        'Necesitas repasar el redondeo y el truncamiento.');
  $('report-error-advice').innerHTML = bilingualHTML(getErrorAdvice());
  renderDiagnosis();
  $('badge-list').replaceChildren(...Array.from(state.badges).map((text) => {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.innerHTML = bilingualHTML(text);
    return badge;
  }));
  $('error-total').textContent = `${state.errors.length} ${state.errors.length === 1 ? 'error' : 'errores'}`;
  $('error-categories').replaceChildren(...makeCategoryChips());
  $('errors-table').replaceChildren(...state.errors.map(makeErrorRow));
  $('error-section').hidden = state.errors.length === 0;
  $('perfect-message').hidden = state.errors.length !== 0;
  document.body.classList.remove('capture-mode');
  showScreen('results-screen');
}

function renderDiagnosis() {
  const categories = [
    ['Aproximaciones decimales', (question) => !question.place.integer],
    ['Unidades y órdenes superiores', (question) => question.place.integer],
    ['Redondeo', (question) => question.procedure === 'REDONDEO'],
    ['Truncamiento', (question) => question.procedure === 'TRUNCAMIENTO']
  ];
  $('diagnosis-list').replaceChildren(...categories.map(([label, matches]) => {
    const total = state.questions.filter(matches).length;
    const wrong = state.errors.filter((error) => matches(error.question)).length;
    const correct = total - wrong;
    const item = document.createElement('div');
    item.className = 'diagnosis-item';
    const title = document.createElement('strong');
    title.innerHTML = bilingualHTML(label);
    const detail = document.createElement('span');
    detail.textContent = `${correct} aciertos · ${wrong} errores / ${total} — ${correct / total >= 0.7 ? 'Buen dominio' : 'Necesita practicar'}`;
    item.append(title, detail);
    return item;
  }));
}

function getErrorAdvice() {
  if (!state.errors.length) return 'Has resuelto correctamente todos los ejercicios. ¡Enhorabuena!';
  const round = state.errors.filter((error) => error.question.procedure === 'REDONDEO').length;
  const truncate = state.errors.length - round;
  const decimals = state.errors.filter((error) => !error.question.place.integer).length;
  const messages = [];
  if (round) messages.push(`Repasa el redondeo (${round} ${round === 1 ? 'error' : 'errores'}): observa la cifra inmediatamente posterior.`);
  if (truncate) messages.push(`Practica el truncamiento (${truncate} ${truncate === 1 ? 'error' : 'errores'}): elimina las cifras posteriores sin cambiar la última conservada.`);
  if (decimals) messages.push(`Revisa también las aproximaciones decimales (${decimals}).`);
  return messages.join(' ');
}

function makeCategoryChips() {
  const categories = [
    ['Redondeo', (error) => error.question.procedure === 'REDONDEO'],
    ['Truncamiento', (error) => error.question.procedure === 'TRUNCAMIENTO'],
    ['Números enteros', (error) => !error.question.isDecimal],
    ['Números decimales', (error) => error.question.isDecimal],
    ['Décimas', (error) => error.question.place.name === 'DÉCIMAS'],
    ['Centésimas', (error) => error.question.place.name === 'CENTÉSIMAS'],
    ['Milésimas', (error) => error.question.place.name === 'MILÉSIMAS']
  ];
  return categories.map(([name, matches]) => {
    const count = state.errors.filter(matches).length;
    const chip = document.createElement('span');
    chip.className = 'category-chip';
    chip.innerHTML = bilingualHTML(`${name}: ${count}`);
    return chip;
  });
}

function makeErrorRow(error) {
  const { question } = error;
  const row = document.createElement('tr');
  const number = formatQuestionNumber(question);
  const correctAnswer = formatNumber(question.answer, question.place.integer ? 0 : question.place.name === 'DÉCIMAS' ? 1 : question.place.name === 'CENTÉSIMAS' ? 2 : 3);
  const cells = [
    String(error.questionNumber),
    `${number}<br>${bilingualHTML(question.procedure)} a ${bilingualHTML(question.place.name.toLowerCase())}`,
    escapeHtml(error.response || '—'),
    `<strong>${correctAnswer}</strong><br>${bilingualHTML(error.explanation)}`
  ];
  cells.forEach((value, index) => {
    const cell = document.createElement('td');
    if (index === 0 || index === 1 || index === 3) cell.innerHTML = value;
    else cell.textContent = value;
    row.appendChild(cell);
  });
  return row;
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => toast.classList.remove('visible'), 2300);
}

function updateSoundToggle() {
  $('sound-toggle').setAttribute('aria-pressed', String(state.sound));
  $('sound-toggle').setAttribute('aria-label', state.sound ? 'Desactivar sonidos' : 'Activar sonidos');
  $('sound-toggle').innerHTML = state.sound
    ? '<span aria-hidden="true">🔊</span><span class="sound-label">Sonido activado</span>'
    : '<span aria-hidden="true">🔇</span><span class="sound-label">Sonido apagado</span>';
}

function stopSound() {
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio = null;
  }
}

function playSound(correct) {
  if (!state.sound) return;
  stopSound();
  let audio;
  try {
    audio = new Audio(correct ? 'audio/sonidoAcierto.mp3' : 'audio/sonidoError.mp3');
    audio.volume = 0.4;
    state.currentAudio = audio;
    audio.play().catch((error) => {
      if (state.currentAudio !== audio) return;
      soundPlaybackFailed(error);
    });
  } catch (error) {
    soundPlaybackFailed(error);
  }
}

function soundPlaybackFailed(error) {
  console.warn('No se pudo reproducir el sonido:', error);
  stopSound();
  if (error.name === 'NotAllowedError') {
    showToast('El navegador ha bloqueado el sonido. Interactúa con la página para volver a intentarlo.');
    return;
  }
  state.sound = false;
  updateSoundToggle();
  showToast('No se pudo reproducir el sonido. Comprueba los archivos de audio.');
}

let introTimer = null;
let introFinished = false;
let introInteracted = false;
let introAudioContext = null;
let introMusic = null;
let introMusicAttempt = 0;
let introMusicPending = false;
const introMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function pauseIntroMusic(reset = false) {
  introMusicAttempt += 1;
  introMusicPending = false;
  if (introMusic) {
    introMusic.pause();
    if (reset) introMusic.currentTime = 0;
  }
}

function playIntroMusic() {
  if (!state.sound || !$('welcome-screen').classList.contains('active') || introMusicPending) return;
  try {
    if (!introMusic) {
      introMusic = new Audio('audio/entradilla.mp3');
      introMusic.volume = 0.2;
      introMusic.loop = true;
    }
    if (!introMusic.paused) return;
    const attempt = ++introMusicAttempt;
    introMusicPending = true;
    introMusic.play().then(() => {
      if (attempt !== introMusicAttempt) return;
      introMusicPending = false;
      $('intro-music-hint').hidden = true;
    }).catch((error) => {
      if (attempt !== introMusicAttempt) return;
      introMusicPending = false;
      console.warn('No se pudo reproducir la música de la portada:', error);
      $('intro-music-hint').hidden = false;
      showToast(error.name === 'NotAllowedError'
        ? 'El navegador ha bloqueado la música. Pulsa en la pantalla para intentarlo de nuevo.'
        : 'No se pudo reproducir la música de la portada. Comprueba el archivo de audio.');
    });
  } catch (error) {
    introMusicPending = false;
    console.warn('No se pudo reproducir la música de la portada:', error);
    $('intro-music-hint').hidden = false;
    showToast('No se pudo reproducir la música de la portada. Comprueba el archivo de audio.');
  }
}

function stopIntroCue() {
  const context = introAudioContext;
  introAudioContext = null;
  if (context && context.state !== 'closed') {
    context.close().catch((error) => console.warn('No se pudo cerrar el sonido de la introducción:', error));
  }
}

function playIntroCue(fromGesture) {
  if (!state.sound) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    console.warn('El navegador no admite el sonido de la introducción.');
    return;
  }
  try {
    stopIntroCue();
    const context = new AudioContext();
    introAudioContext = context;
    if (context.state === 'suspended' && !fromGesture) {
      stopIntroCue();
      return;
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, now);
    oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.3);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => {
      if (introAudioContext === context) stopIntroCue();
    };
    oscillator.start(now);
    oscillator.stop(now + 0.5);
    if (context.state === 'suspended') {
      context.resume().catch((error) => {
        console.warn('No se pudo reproducir el sonido de la introducción:', error);
        if (introAudioContext === context) stopIntroCue();
      });
    }
  } catch (error) {
    console.warn('No se pudo reproducir el sonido de la introducción:', error);
    stopIntroCue();
  }
}

function finishIntro(staticVersion = false, fromGesture = false) {
  if (introFinished) return;
  introFinished = true;
  window.clearTimeout(introTimer);
  const returnFocus = fromGesture || document.activeElement === $('skip-intro');
  $('intro-stage').classList.toggle('intro-static', staticVersion);
  $('intro-crawl').hidden = !staticVersion;
  $('skip-intro').hidden = true;
  $('intro-landing').hidden = false;
  if (returnFocus) $('start-button').focus();
  if (!staticVersion && (fromGesture || introInteracted)) playIntroCue(fromGesture);
}

document.addEventListener('pointerdown', () => { introInteracted = true; }, { once: true });
document.addEventListener('keydown', () => { introInteracted = true; }, { once: true });
document.addEventListener('click', playIntroMusic);
playIntroMusic();
$('skip-intro').addEventListener('click', () => finishIntro(false, true));
if (introMotion.matches) finishIntro(true);
else introTimer = window.setTimeout(() => finishIntro(), 15000);
introMotion.addEventListener('change', (event) => {
  if (event.matches && !introFinished) finishIntro(true);
});

$('start-button').addEventListener('click', () => {
  pauseIntroMusic(true);
  playIntroCue(true);
  showScreen('student-screen');
});
$('student-class').addEventListener('change', () => {
  const other = $('student-class').value === 'other';
  $('other-class').classList.toggle('hidden', !other);
  $('other-class').required = other;
});
$('student-form').addEventListener('submit', startGame);
$('answer-form').addEventListener('submit', handleAnswer);
$('next-button').addEventListener('click', advanceQuestion);
$('sound-toggle').addEventListener('click', () => {
  state.sound = !state.sound;
  updateSoundToggle();
  if (state.sound) {
    if ($('welcome-screen').classList.contains('active')) playIntroMusic();
    else playSound(true);
  }
  else {
    stopSound();
    stopIntroCue();
    pauseIntroMusic();
    $('intro-music-hint').hidden = true;
  }
});
$('capture-button').addEventListener('click', () => {
  document.body.classList.add('capture-mode');
  scrollToTop();
  showToast('Informe limpio listo para capturar. Pulsa Esc para volver.');
});
$('print-button').addEventListener('click', () => window.print());
$('restart-button').addEventListener('click', () => {
  document.body.classList.remove('capture-mode');
  $('student-form').reset();
  $('other-class').classList.add('hidden');
  $('other-class').required = false;
  showScreen('welcome-screen');
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('capture-mode')) {
    document.body.classList.remove('capture-mode');
  }
});
