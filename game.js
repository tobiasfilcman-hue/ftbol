/* Penales — juego de tanda de penales, 1 o 2 jugadores.
 *
 * Todo corre en el navegador: no hay dependencias, no hay pedidos de red,
 * y lo único que se guarda son los récords, en el localStorage de esta máquina.
 */
'use strict';

(function () {

  /* ============================ constantes ============================ */

  var W = 900, H = 560;

  // Geometría del arco (plano delantero) y profundidad de la red.
  var GOAL = { x0: 235, x1: 665, y0: 135, y1: 348, post: 9, dx: 30, dy: -34 };

  var BALL_HOME = { x: 450, y: 470, r: 12 };
  var KICK_SPOT = { x: 450, y: 494 };
  var GROUND_NEAR = 502, GROUND_FAR = 352;   // línea del piso cerca y en el arco

  // Línea de tiempo de la animación, en segundos.
  var T_RUN = 0.42, T_FLIGHT_END = 0.92, T_DIVE = 0.50, T_DIVE_DUR = 0.42, T_END = 2.05;

  var ZONE_NAMES = [
    'al ángulo izquierdo', 'por arriba del medio', 'al ángulo derecho',
    'abajo a la izquierda', 'al medio, abajo', 'abajo a la derecha'
  ];

  var DIFF = {
    facil:   { label: 'Fácil',   guess: 0.20, pmin: 0.40, pmax: 0.74, wild: 0.12 },
    normal:  { label: 'Normal',  guess: 0.35, pmin: 0.58, pmax: 0.86, wild: 0.06 },
    dificil: { label: 'Difícil', guess: 0.55, pmin: 0.70, pmax: 0.885, wild: 0.02 }
  };

  var PALETTE = [
    '#e63946', '#2f6fdb', '#f4a300', '#2fd27a', '#f5f7fa',
    '#7b4ae2', '#12b5c9', '#111823', '#ff7ab8', '#8d6e3a'
  ];

  var REGULATION = 5;

  /* ============================ utilidades ============================ */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOut(t) { return 1 - (1 - t) * (1 - t); }
  function rndInt(n) { return Math.floor(Math.random() * n); }
  function col(z) { return z % 3; }
  function row(z) { return Math.floor(z / 3); }

  function adjacency(a, b) {
    var dc = Math.abs(col(a) - col(b)), dr = Math.abs(row(a) - row(b));
    if (dc === 0 && dr === 0) return 'exacta';
    if (dc <= 1 && dr <= 1) return (dc === 1 && dr === 1) ? 'diagonal' : 'vecina';
    return 'lejos';
  }

  function zoneRect(z) {
    var ix0 = GOAL.x0 + GOAL.post, ix1 = GOAL.x1 - GOAL.post, iy0 = GOAL.y0 + GOAL.post;
    var cw = (ix1 - ix0) / 3, ch = (GOAL.y1 - iy0) / 2;
    var x = ix0 + col(z) * cw, y = iy0 + row(z) * ch;
    return { x: x, y: y, w: cw, h: ch, cx: x + cw / 2, cy: y + ch / 2 };
  }

  /* ============================ preferencias ==========================
   * Se guardan en localStorage. Al leer no se confía en nada: cada campo
   * se valida por tipo y rango, y si algo no cierra se usa el valor por
   * defecto. Nunca se guarda información personal.
   */

  var STORE_KEY = 'ftbol_penales_v1';

  function defaults() {
    return {
      names: ['Local', 'Visitante'],
      colors: ['#e63946', '#2f6fdb'],
      difficulty: 'normal',
      muted: false,
      wins: 0, losses: 0, streak: 0, best: 0
    };
  }

  function cleanName(v, fallback) {
    if (typeof v !== 'string') return fallback;
    var s = v.replace(/\s+/g, ' ').trim().slice(0, 16);
    return s.length ? s : fallback;
  }

  function cleanColor(v, fallback) {
    return (typeof v === 'string' && PALETTE.indexOf(v) !== -1) ? v : fallback;
  }

  function cleanCount(v) {
    return (typeof v === 'number' && isFinite(v) && v >= 0) ? Math.min(Math.floor(v), 999999) : 0;
  }

  function loadPrefs() {
    var d = defaults();
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return d;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return d;
      var names = Array.isArray(o.names) ? o.names : [];
      var colors = Array.isArray(o.colors) ? o.colors : [];
      d.names = [cleanName(names[0], d.names[0]), cleanName(names[1], d.names[1])];
      d.colors = [cleanColor(colors[0], d.colors[0]), cleanColor(colors[1], d.colors[1])];
      if (d.colors[0] === d.colors[1]) d.colors[1] = defaults().colors[1];
      if (Object.prototype.hasOwnProperty.call(DIFF, o.difficulty)) d.difficulty = o.difficulty;
      d.muted = o.muted === true;
      d.wins = cleanCount(o.wins);
      d.losses = cleanCount(o.losses);
      d.streak = cleanCount(o.streak);
      d.best = cleanCount(o.best);
    } catch (e) {
      return defaults();
    }
    return d;
  }

  function savePrefs() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify({
        names: P.names, colors: P.colors, difficulty: P.difficulty, muted: P.muted,
        wins: P.wins, losses: P.losses, streak: P.streak, best: P.best
      }));
    } catch (e) { /* modo privado o storage lleno: el juego sigue igual */ }
  }

  var P = loadPrefs();

  /* ============================== sonido ==============================
   * Generado con Web Audio API: ni un solo archivo de audio.
   * El contexto se crea recién con el primer gesto del usuario.
   */

  var ac = null;

  function audio() {
    if (P.muted) return null;
    if (!ac) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ac = new AC(); } catch (e) { return null; }
    }
    if (ac.state === 'suspended' && ac.resume) { ac.resume(); }
    return ac;
  }

  function tone(freq, start, dur, type, vol) {
    var c = audio(); if (!c) return;
    var t0 = c.currentTime + start;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(start, dur, freq, q, vol) {
    var c = audio(); if (!c) return;
    var t0 = c.currentTime + start;
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol || 0.2, t0 + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  var SFX = {
    click: function () { tone(660, 0, 0.06, 'square', 0.05); },
    kick:  function () { noise(0, 0.11, 900, 0.8, 0.28); tone(120, 0, 0.13, 'sine', 0.22); },
    goal:  function () {
      tone(523, 0.00, 0.20, 'square', 0.13);
      tone(659, 0.09, 0.20, 'square', 0.13);
      tone(784, 0.18, 0.36, 'square', 0.15);
      noise(0.05, 1.5, 760, 0.55, 0.20);
    },
    save:  function () { tone(90, 0, 0.16, 'sine', 0.26); noise(0, 0.18, 400, 1.2, 0.22); noise(0.10, 0.85, 520, 0.6, 0.11); },
    post:  function () { tone(1180, 0, 0.42, 'triangle', 0.2); tone(1790, 0, 0.30, 'sine', 0.1); noise(0.12, 0.7, 480, 0.6, 0.09); },
    wide:  function () { tone(330, 0, 0.30, 'sawtooth', 0.11); tone(220, 0.14, 0.34, 'sawtooth', 0.1); noise(0.1, 0.8, 300, 0.7, 0.1); },
    whistle: function () { tone(2100, 0, 0.16, 'triangle', 0.1); tone(2400, 0.16, 0.22, 'triangle', 0.1); }
  };

  /* ============================== estado ============================== */

  var S = {
    screen: 'MENU',      // MENU | CONFIG | GAME
    mode: 'CPU',         // CPU | DUO
    phase: 'IDLE',       // HANDOFF_K | KEEPER | HANDOFF_S | SHOOTER | ANIM | OUTCOME | END
    sub: 'zone',         // dentro de SHOOTER: zone | power
    kicks: [[], []],     // 'G' (gol) o 'X' (errado) por equipo
    turn: 0,             // equipo que patea
    roundNo: 1,
    sudden: false,
    cursor: 4,
    keeperPick: null,
    shooterPick: null,
    power: 0,
    powerT: 0,
    cpuLast: [],
    shot: null,
    anim: 0,
    shake: 0,
    netHit: 0,
    over: false
  };

  // En modo CPU el humano es siempre el equipo 1.
  function humanKicks() { return S.mode === 'DUO' || S.turn === 0; }
  function humanSaves() { return S.mode === 'DUO' || S.turn === 1; }
  function score(t) { return S.kicks[t].filter(function (k) { return k === 'G'; }).length; }
  function kickerTeam() { return S.turn; }
  function keeperTeam() { return 1 - S.turn; }

  /* ============================== DOM ================================= */

  function $(id) { return document.getElementById(id); }

  var CV = $('cv'), ctx = CV.getContext('2d');
  var SCREENS = { MENU: $('scMenu'), CONFIG: $('scConfig'), HANDOFF: $('scHandoff'), OUTCOME: $('scOutcome'), FINAL: $('scFinal') };

  function show(which) {
    Object.keys(SCREENS).forEach(function (k) { SCREENS[k].hidden = (k !== which); });
  }
  function hideAll() { show(''); }

  function setHint(txt) { $('hint').textContent = txt; }

  function fitCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    CV.width = Math.round(W * dpr);
    CV.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textBaseline = 'middle';
  }

  // La cancha tiene que entrar entera: se ajusta al ancho y también al alto
  // disponible, que es lo que aprieta cuando el celular está acostado.
  function layout() {
    var app = $('app');
    for (var pass = 0; pass < 2; pass++) {
      var bs = window.getComputedStyle(document.body);
      var gap = parseFloat(window.getComputedStyle(app).rowGap) || 0;
      var used = (parseFloat(bs.paddingTop) || 0) + (parseFloat(bs.paddingBottom) || 0) + 4;
      if (!$('hud').hidden) used += $('hud').offsetHeight + gap;
      used += $('bar').offsetHeight + gap;
      if ($('rotate').offsetHeight) used += $('rotate').offsetHeight + gap;

      var availH = Math.max(180, window.innerHeight - used);
      var byHeight = availH * (W / H);
      app.style.maxWidth = Math.round(Math.min(980, byHeight)) + 'px';
    }
  }

  /* ============================ menú y setup ========================== */

  function renderRecords() {
    var t = P.wins + P.losses;
    $('records').textContent = t === 0
      ? 'Todavía no jugaste ninguna tanda contra la máquina.'
      : 'Ganaste ' + P.wins + ' · Perdiste ' + P.losses + ' · Mejor racha: ' + P.best;
  }

  function buildSwatches(box, idx) {
    box.textContent = '';
    PALETTE.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sw';
      b.style.background = c;
      b.setAttribute('aria-label', 'Color ' + c);
      b.setAttribute('aria-pressed', String(P.colors[idx] === c));
      b.addEventListener('click', function () {
        if (P.colors[1 - idx] === c) return;   // los dos equipos no pueden ir iguales
        P.colors[idx] = c;
        SFX.click();
        refreshSwatches();
      });
      box.appendChild(b);
    });
  }

  function refreshSwatches() {
    [[$('sw1'), 0], [$('sw2'), 1]].forEach(function (pair) {
      var kids = pair[0].children;
      for (var i = 0; i < kids.length; i++) {
        var c = PALETTE[i];
        kids[i].setAttribute('aria-pressed', String(P.colors[pair[1]] === c));
        kids[i].disabled = (P.colors[1 - pair[1]] === c);
      }
    });
  }

  function buildDifficulty() {
    var seg = $('diffSeg');
    seg.textContent = '';
    Object.keys(DIFF).forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = DIFF[k].label;
      b.setAttribute('aria-pressed', String(P.difficulty === k));
      b.addEventListener('click', function () {
        P.difficulty = k;
        SFX.click();
        var kids = seg.children;
        for (var i = 0; i < kids.length; i++) kids[i].setAttribute('aria-pressed', String(Object.keys(DIFF)[i] === k));
      });
      seg.appendChild(b);
    });
  }

  function openConfig(mode) {
    S.mode = mode;
    S.screen = 'CONFIG';
    $('name1').value = P.names[0];
    $('name2').value = P.names[1];
    $('diffBox').hidden = (mode !== 'CPU');
    document.querySelector('label[for="name1"]').textContent = mode === 'CPU' ? 'Tu equipo' : 'Jugador 1';
    document.querySelector('label[for="name2"]').textContent = mode === 'CPU' ? 'La máquina' : 'Jugador 2';
    buildSwatches($('sw1'), 0);
    buildSwatches($('sw2'), 1);
    refreshSwatches();
    buildDifficulty();
    show('CONFIG');
    setHint(mode === 'CPU' ? 'Elegí tu equipo y qué tan brava la querés' : 'Cada uno elige su equipo');
  }

  /* ============================ tanda de penales ====================== */

  function startMatch() {
    P.names[0] = cleanName($('name1').value, 'Local');
    P.names[1] = cleanName($('name2').value, 'Visitante');
    savePrefs();

    S.screen = 'GAME';
    S.kicks = [[], []];
    S.turn = 0;
    S.roundNo = 1;
    S.sudden = false;
    S.cpuLast = [];
    S.over = false;
    $('hud').hidden = false;
    layout();
    updateHud();
    hideAll();
    SFX.whistle();
    beginKick();
  }

  function updateHud() {
    $('hudName1').textContent = P.names[0];
    $('hudName2').textContent = P.names[1];
    $('hudColor1').style.background = P.colors[0];
    $('hudColor2').style.background = P.colors[1];
    $('hudScore1').textContent = String(score(0));
    $('hudScore2').textContent = String(score(1));
    $('hudStage').textContent = S.sudden
      ? 'Muerte súbita — remate ' + S.roundNo
      : 'Ronda ' + Math.min(S.roundNo, REGULATION) + ' de ' + REGULATION;

    [[$('marks1'), 0], [$('marks2'), 1]].forEach(function (pair) {
      var host = pair[0], team = pair[1];
      host.textContent = '';
      var total = Math.max(REGULATION, S.kicks[team].length);
      for (var i = 0; i < total; i++) {
        var d = document.createElement('span');
        d.className = 'mark' + (S.kicks[team][i] === 'G' ? ' goal' : (S.kicks[team][i] === 'X' ? ' miss' : ''));
        host.appendChild(d);
      }
    });
  }

  function beginKick() {
    S.keeperPick = null;
    S.shooterPick = null;
    S.power = 0;
    S.powerT = 0;
    S.shot = null;
    S.cursor = 4;
    S.netHit = 0;
    S.shake = 0;
    updateHud();
    goPhase(S.mode === 'DUO' ? 'HANDOFF_K' : 'KEEPER');
  }

  function goPhase(ph) {
    S.phase = ph;

    if (ph === 'HANDOFF_K') {
      showHandoff('Arquero', P.names[keeperTeam()], 'Elegí tu palo sin que el pateador mire.');
      return;
    }

    if (ph === 'KEEPER') {
      hideAll();
      if (!humanSaves()) { goPhase(S.mode === 'DUO' ? 'HANDOFF_S' : 'SHOOTER'); return; }
      S.cursor = 4;
      setHint('Arquero de ' + P.names[keeperTeam()] + ': elegí a dónde te tirás — flechas o clic, Espacio para confirmar');
      return;
    }

    if (ph === 'HANDOFF_S') {
      showHandoff('Pateador', P.names[kickerTeam()], 'Ahora te toca definir.');
      return;
    }

    if (ph === 'SHOOTER') {
      hideAll();
      if (!humanKicks()) { var s = cpuShot(); S.shooterPick = s.zone; S.power = s.power; fire(); return; }
      S.sub = 'zone';
      S.cursor = 4;
      setHint('Pateador de ' + P.names[kickerTeam()] + ': apuntá con las flechas o el clic, Espacio para confirmar');
      return;
    }
  }

  function showHandoff(role, team, hint) {
    $('handRole').textContent = role;
    $('handTeam').textContent = team;
    $('handHint').textContent = hint;
    show('HANDOFF');
    setHint('Pasale el control a ' + team);
  }

  /* ------------------------------- la máquina ------------------------- */

  function cpuKeeperGuess(shotZone) {
    var d = DIFF[P.difficulty];
    if (Math.random() < d.guess) return shotZone;
    var others = [0, 1, 2, 3, 4, 5].filter(function (z) { return z !== shotZone; });
    if (P.difficulty === 'dificil') {
      var near = others.filter(function (z) { return adjacency(z, shotZone) !== 'lejos'; });
      if (near.length && Math.random() < 0.6) return near[rndInt(near.length)];
    }
    return others[rndInt(others.length)];
  }

  function cpuShot() {
    var d = DIFF[P.difficulty], z, guard = 0;
    do { z = rndInt(6); guard++; } while (guard < 16 && S.cpuLast.indexOf(z) !== -1);
    S.cpuLast.push(z);
    if (S.cpuLast.length > 2) S.cpuLast.shift();
    var power = d.pmin + Math.random() * (d.pmax - d.pmin);
    if (Math.random() < d.wild) power = 0.90 + Math.random() * 0.10;
    return { zone: z, power: power };
  }

  /* ------------------------------ resolución -------------------------- */

  function resolve(zone, power, kZone) {
    var r = zoneRect(zone);
    var impact = { x: r.cx, y: r.cy };

    // Pasarse de rosca con la barra: la pelota se va al muñeco.
    if (power >= 0.90) {
      if (Math.random() < 0.30) {
        var side = r.cx < 450 ? GOAL.x0 + 4 : GOAL.x1 - 4;
        return { result: 'PALO', impact: { x: side, y: r.cy }, detail: 'Se estrelló en el palo.' };
      }
      var out = { x: r.cx + (r.cx < 450 ? -95 : 95), y: row(zone) === 0 ? GOAL.y0 - 55 : r.cy };
      if (row(zone) === 0) out.x = r.cx;
      return { result: 'AFUERA', impact: out, detail: 'Le pegó con todo y la mandó afuera.' };
    }

    // Buscar el ángulo alto con mucha fuerza también tiene su precio.
    if (row(zone) === 0 && power > 0.84) {
      var risk = Math.min(0.45, (power - 0.84) * 3);
      if (Math.random() < risk) {
        return { result: 'PALO', impact: { x: r.cx, y: GOAL.y0 + 5 }, detail: 'Travesaño. De pelo.' };
      }
    }

    var rel = adjacency(kZone, zone), chance = 0;
    if (rel === 'exacta') chance = 0.62 + (1 - power) * 0.28;
    else if (rel === 'vecina') chance = 0.20 - power * 0.12;
    else if (rel === 'diagonal') chance = 0.09 - power * 0.05;
    if (power < 0.25 && rel !== 'exacta' && rel !== 'lejos') chance += 0.12;

    if (Math.random() < chance) {
      return {
        result: 'ATAJADA',
        impact: impact,
        detail: rel === 'exacta' ? 'El arquero adivinó el palo.' : 'Manotazo salvador.'
      };
    }
    return { result: 'GOL', impact: impact, detail: 'La clavó ' + ZONE_NAMES[zone] + '.' };
  }

  function fire() {
    if (S.keeperPick === null) S.keeperPick = cpuKeeperGuess(S.shooterPick);
    var res = resolve(S.shooterPick, S.power, S.keeperPick);
    S.shot = {
      zone: S.shooterPick,
      power: S.power,
      keeper: S.keeperPick,
      result: res.result,
      detail: res.detail,
      impact: res.impact,
      sounded: false
    };
    S.anim = 0;
    S.phase = 'ANIM';
    setHint('¡Ahí va!');
  }

  function finishKick() {
    var t = kickerTeam(), scored = S.shot.result === 'GOL';
    S.kicks[t].push(scored ? 'G' : 'X');
    updateHud();

    var title = { GOL: '¡GOL!', ATAJADA: '¡ATAJÓ!', PALO: '¡AL PALO!', AFUERA: '¡AFUERA!' }[S.shot.result];
    $('outTitle').textContent = title;
    $('outTitle').className = scored ? 'goal' : 'miss';
    $('outDetail').textContent = P.names[t] + ': ' + S.shot.detail;

    var w = decide();
    if (w !== -1) { S.over = true; endMatch(w); return; }

    S.phase = 'OUTCOME';
    show('OUTCOME');
    setHint('Tocá "Seguir" para el próximo penal');
  }

  function remaining(t) { return S.sudden ? 0 : Math.max(0, REGULATION - S.kicks[t].length); }

  function decide() {
    var a = score(0), b = score(1);
    if (!S.sudden) {
      if (a > b + remaining(1)) return 0;
      if (b > a + remaining(0)) return 1;
      if (S.kicks[0].length >= REGULATION && S.kicks[1].length >= REGULATION) {
        if (a !== b) return a > b ? 0 : 1;
        S.sudden = true;
        S.roundNo = 1;
      }
      return -1;
    }
    if (S.kicks[0].length === S.kicks[1].length && a !== b) return a > b ? 0 : 1;
    return -1;
  }

  function nextKick() {
    S.turn = 1 - S.turn;
    if (S.turn === 0) S.roundNo++;
    beginKick();
  }

  function endMatch(winner) {
    $('hudStage').textContent = 'Final';
    if (S.mode === 'CPU') {
      if (winner === 0) { P.wins++; P.streak++; if (P.streak > P.best) P.best = P.streak; }
      else { P.losses++; P.streak = 0; }
      savePrefs();
    }
    $('finLabel').textContent = (S.mode === 'CPU' && winner === 1) ? 'Perdiste' : 'Ganador';
    $('finTitle').textContent = P.names[winner];
    $('finDetail').textContent = 'Serie ' + score(0) + ' a ' + score(1) +
      (S.sudden ? ' en muerte súbita.' : '.') +
      (S.mode === 'CPU' ? ' Racha: ' + P.streak + '.' : '');
    S.phase = 'END';
    show('FINAL');
    setHint('Fin de la tanda');
    SFX.whistle();
    renderRecords();
  }

  /* ============================== dibujo ============================== */

  // La tribuna se dibuja una sola vez y después se estampa como imagen.
  var crowdCv = document.createElement('canvas');
  (function buildCrowd() {
    crowdCv.width = W; crowdCv.height = 120;
    var c = crowdCv.getContext('2d');
    var g = c.createLinearGradient(0, 0, 0, 120);
    g.addColorStop(0, '#0b131d'); g.addColorStop(1, '#16202e');
    c.fillStyle = g; c.fillRect(0, 0, W, 120);
    for (var i = 0; i < 1400; i++) {
      var x = Math.random() * W, y = 8 + Math.random() * 104;
      var shade = 0.10 + Math.random() * 0.30;
      var hue = Math.random() < 0.5 ? '255,255,255' : (Math.random() < 0.5 ? '120,180,255' : '255,200,140');
      c.fillStyle = 'rgba(' + hue + ',' + shade.toFixed(2) + ')';
      c.beginPath(); c.arc(x, y, 1.1 + Math.random() * 1.6, 0, 6.2832); c.fill();
    }
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 108, W, 12);
  })();

  function drawBackground() {
    ctx.drawImage(crowdCv, 0, 0);

    // Focos del estadio.
    ctx.save();
    ctx.globalAlpha = 0.16;
    [180, 450, 720].forEach(function (x) {
      var g = ctx.createRadialGradient(x, 40, 5, x, 300, 330);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 330, 0, 660, 420);
    });
    ctx.restore();

    // Césped con rayas en perspectiva.
    var g2 = ctx.createLinearGradient(0, 120, 0, H);
    g2.addColorStop(0, '#1d5f31'); g2.addColorStop(0.45, '#227038'); g2.addColorStop(1, '#2d8a46');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 120, W, H - 120);

    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < 7; i++) {
      var yTop = 120 + i * 20 + i * i * 4.2;
      var yBot = 120 + (i + 1) * 20 + (i + 1) * (i + 1) * 4.2;
      if (i % 2 === 0) ctx.fillRect(0, yTop, W, Math.max(0, yBot - yTop));
    }
    ctx.restore();

    // Líneas del área y punto del penal.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-60, 352); ctx.lineTo(W + 60, 352);           // línea de fondo
    ctx.moveTo(95, 452); ctx.lineTo(160, 352);               // área grande, izquierda
    ctx.moveTo(805, 452); ctx.lineTo(740, 352);              // área grande, derecha
    ctx.moveTo(95, 452); ctx.lineTo(805, 452);
    ctx.moveTo(300, 392); ctx.lineTo(600, 392);              // área chica
    ctx.moveTo(300, 392); ctx.lineTo(322, 352);
    ctx.moveTo(600, 392); ctx.lineTo(578, 352);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.ellipse(450, GROUND_NEAR, 7, 2.5, 0, 0, 6.2832); ctx.fill();
  }

  function drawGoal() {
    var x0 = GOAL.x0, x1 = GOAL.x1, y0 = GOAL.y0, y1 = GOAL.y1, dx = GOAL.dx, dy = GOAL.dy;

    // Red: plano de fondo + laterales, dibujada a línea fina.
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth = 1;
    var bx0 = x0 + dx, bx1 = x1 - dx, by0 = y0 + dy, by1 = y1 + dy * 0.35;

    ctx.fillStyle = 'rgba(10, 30, 45, 0.45)';
    ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);

    var n;
    ctx.beginPath();
    for (n = 0; n <= 18; n++) {
      var xx = bx0 + (bx1 - bx0) * (n / 18);
      ctx.moveTo(xx, by0); ctx.lineTo(xx, by1);
    }
    for (n = 0; n <= 10; n++) {
      var yy = by0 + (by1 - by0) * (n / 10);
      ctx.moveTo(bx0, yy); ctx.lineTo(bx1, yy);
    }
    // Techo de la red: del travesaño hacia el fondo.
    for (n = 0; n <= 14; n++) {
      var f = n / 14;
      ctx.moveTo(lerp(x0, x1, f), y0); ctx.lineTo(lerp(bx0, bx1, f), by0);
    }
    for (n = 1; n <= 3; n++) {
      var g3 = n / 4;
      ctx.moveTo(lerp(x0, bx0, g3), lerp(y0, by0, g3));
      ctx.lineTo(lerp(x1, bx1, g3), lerp(y0, by0, g3));
    }
    // Paredes laterales.
    for (n = 0; n <= 6; n++) {
      var t = n / 6;
      ctx.moveTo(lerp(x0, bx0, t), lerp(y0, by0, t)); ctx.lineTo(lerp(x0, bx0, t), lerp(y1, by1, t));
      ctx.moveTo(lerp(x1, bx1, t), lerp(y0, by0, t)); ctx.lineTo(lerp(x1, bx1, t), lerp(y1, by1, t));
    }
    ctx.stroke();
    ctx.restore();

    // La red se infla cuando entra.
    if (S.netHit > 0 && S.shot && S.shot.result === 'GOL') {
      var b = S.netHit;
      var rad = 62 * b;
      var gr = ctx.createRadialGradient(S.shot.impact.x, S.shot.impact.y, 2, S.shot.impact.x, S.shot.impact.y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)');
      gr.addColorStop(0.55, 'rgba(255,255,255,0.18)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(S.shot.impact.x, S.shot.impact.y, rad, 0, 6.2832); ctx.fill();
    }

    // Postes y travesaño.
    ctx.fillStyle = '#f2f6fa';
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.fillRect(x0 - GOAL.post, y0, GOAL.post, y1 - y0 + 4);
    ctx.strokeRect(x0 - GOAL.post, y0, GOAL.post, y1 - y0 + 4);
    ctx.fillRect(x1, y0, GOAL.post, y1 - y0 + 4);
    ctx.strokeRect(x1, y0, GOAL.post, y1 - y0 + 4);
    ctx.fillRect(x0 - GOAL.post, y0 - GOAL.post, (x1 - x0) + GOAL.post * 2, GOAL.post);
    ctx.strokeRect(x0 - GOAL.post, y0 - GOAL.post, (x1 - x0) + GOAL.post * 2, GOAL.post);
  }

  function drawKeeper(dive, color) {
    var baseX = 450, baseY = GOAL.y1;
    var tx = 0, ty = 0, rot = 0;

    if (dive > 0 && S.shot) {
      var kr = zoneRect(S.shot.keeper);
      var e = easeOut(dive);
      tx = (kr.cx - baseX) * 0.86 * e;
      ty = (kr.cy - 250) * 0.42 * e;
      rot = (kr.cx - baseX) / 210 * e * 1.15;
    }

    // Sombra: siempre apoyada en la línea del arco.
    ctx.save();
    ctx.globalAlpha = 0.26 - dive * 0.10;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(baseX + tx, baseY + 6, 34 + dive * 16, 8, 0, 0, 6.2832);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(baseX + tx, baseY + ty);
    ctx.rotate(rot);

    var HGT = 132, SH = 17;              // alto del arquero y medio ancho de hombros
    var stretch = dive > 0 ? 1 : 0;

    ctx.strokeStyle = '#1c1f27';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';

    // Piernas.
    ctx.strokeStyle = '#243043';
    ctx.beginPath();
    ctx.moveTo(-5, -HGT * 0.46); ctx.lineTo(-11 - stretch * 10, 0);
    ctx.moveTo(5, -HGT * 0.46); ctx.lineTo(11 + stretch * 16, -stretch * 8);
    ctx.stroke();

    // Torso.
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-SH, -HGT * 0.84);
    ctx.lineTo(SH, -HGT * 0.84);
    ctx.lineTo(SH - 3, -HGT * 0.44);
    ctx.lineTo(-SH + 3, -HGT * 0.44);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Brazos: se estiran al volar.
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    var reach = 26 + stretch * dive * 34;
    ctx.beginPath();
    ctx.moveTo(-SH + 2, -HGT * 0.80); ctx.lineTo(-SH - reach, -HGT * 0.80 - 14 - stretch * dive * 10);
    ctx.moveTo(SH - 2, -HGT * 0.80); ctx.lineTo(SH + reach, -HGT * 0.80 - 14 - stretch * dive * 10);
    ctx.stroke();

    // Guantes.
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(-SH - reach, -HGT * 0.80 - 14 - stretch * dive * 10, 7, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(SH + reach, -HGT * 0.80 - 14 - stretch * dive * 10, 7, 0, 6.2832); ctx.fill();

    // Cabeza.
    ctx.fillStyle = '#e8b78c';
    ctx.beginPath(); ctx.arc(0, -HGT * 0.93, 11, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#2b2118';
    ctx.beginPath(); ctx.arc(0, -HGT * 0.97, 11, Math.PI, 6.2832); ctx.fill();

    ctx.restore();
  }

  function drawKicker(runP, color) {
    // Visto desde atrás: figura chica que corre y remata.
    var x = KICK_SPOT.x - 62 + 40 * runP;
    var y = KICK_SPOT.y - 6 * Math.sin(runP * Math.PI * 3);

    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x, KICK_SPOT.y + 12, 22, 6, 0, 0, 6.2832); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);

    var swing = runP > 0.75 ? (runP - 0.75) * 4 : 0;

    ctx.strokeStyle = '#243043';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-5, -42); ctx.lineTo(-9, 6);
    ctx.moveTo(5, -42); ctx.lineTo(10 + swing * 16, 4 - swing * 20);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-17, -78); ctx.lineTo(17, -78); ctx.lineTo(14, -40); ctx.lineTo(-14, -40);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(-15, -74); ctx.lineTo(-26 - swing * 8, -48);
    ctx.moveTo(15, -74); ctx.lineTo(26 + swing * 8, -48);
    ctx.stroke();

    ctx.fillStyle = '#e8b78c';
    ctx.beginPath(); ctx.arc(0, -88, 11, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#2b2118';
    ctx.beginPath(); ctx.arc(0, -92, 11, Math.PI, 6.2832); ctx.fill();

    ctx.restore();
  }

  function ballAt(p) {
    var imp = S.shot.impact;
    var bend = (imp.x - BALL_HOME.x) * 0.10;
    return {
      x: lerp(BALL_HOME.x, imp.x, p) + Math.sin(Math.PI * p) * bend,
      y: lerp(BALL_HOME.y, imp.y, p) - Math.sin(Math.PI * p) * 26,
      r: lerp(BALL_HOME.r, 6.5, p),
      gy: lerp(GROUND_NEAR, GROUND_FAR, p)
    };
  }

  function ballRest() {
    return { x: BALL_HOME.x, y: BALL_HOME.y, r: BALL_HOME.r, gy: GROUND_NEAR };
  }

  function ballAfter(q) {
    // Movimiento posterior al impacto, según lo que haya pasado.
    var imp = S.shot.impact, res = S.shot.result;
    var side = imp.x < 450 ? -1 : 1;
    if (res === 'GOL') return { x: imp.x + side * 58 * q, y: imp.y + (GOAL.y1 - imp.y) * q * q, r: lerp(6.5, 7.5, q), gy: GROUND_FAR };
    if (res === 'ATAJADA') return { x: imp.x + side * 150 * q, y: imp.y + 150 * q * q, r: lerp(6.5, 10, q), gy: lerp(GROUND_FAR, 430, q) };
    if (res === 'PALO') return { x: imp.x + side * 190 * q, y: imp.y + 170 * q * q, r: lerp(6.5, 10.5, q), gy: lerp(GROUND_FAR, 450, q) };
    return { x: imp.x + side * 40 * q, y: imp.y - 30 * q, r: lerp(6.5, 4, q), gy: GROUND_FAR };
  }

  function drawBall(b) {
    // Sombra apoyada en el piso, debajo de donde esté la pelota.
    var air = clamp((b.gy - b.y - b.r) / 200, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.30 * (1 - air * 0.65);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(b.x, b.gy, b.r * (1.6 - air * 0.5), b.r * 0.45, 0, 0, 6.2832);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(b.x, b.y);
    var g = ctx.createRadialGradient(-b.r * 0.35, -b.r * 0.4, b.r * 0.15, 0, 0, b.r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c9d3da');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, b.r, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#16202b';
    ctx.beginPath(); ctx.arc(0, 0, b.r * 0.34, 0, 6.2832); ctx.fill();
    for (var i = 0; i < 5; i++) {
      var a = i * 1.2566 + 0.4;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * b.r * 0.66, Math.sin(a) * b.r * 0.66, b.r * 0.19, 0, 6.2832);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, b.r, 0, 6.2832); ctx.stroke();
    ctx.restore();
  }

  function drawZones(selected, accent, label) {
    ctx.save();
    for (var z = 0; z < 6; z++) {
      var r = zoneRect(z), on = (z === selected);
      ctx.globalAlpha = on ? 0.34 : 0.10;
      ctx.fillStyle = on ? accent : '#ffffff';
      ctx.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
      ctx.globalAlpha = on ? 0.95 : 0.35;
      ctx.strokeStyle = on ? accent : 'rgba(255,255,255,0.7)';
      ctx.lineWidth = on ? 3 : 1.5;
      ctx.setLineDash(on ? [] : [6, 6]);
      ctx.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
    }
    ctx.setLineDash([]);

    // Mirilla sobre la zona elegida.
    var sr = zoneRect(selected);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sr.cx, sr.cy, 15, 0, 6.2832);
    ctx.moveTo(sr.cx - 23, sr.cy); ctx.lineTo(sr.cx - 8, sr.cy);
    ctx.moveTo(sr.cx + 8, sr.cy); ctx.lineTo(sr.cx + 23, sr.cy);
    ctx.moveTo(sr.cx, sr.cy - 23); ctx.lineTo(sr.cx, sr.cy - 8);
    ctx.moveTo(sr.cx, sr.cy + 8); ctx.lineTo(sr.cx, sr.cy + 23);
    ctx.stroke();
    ctx.restore();

    banner(label);
  }

  function banner(text) {
    if (!text) return;
    ctx.save();
    ctx.font = 'bold 19px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    var w = ctx.measureText(text).width + 34;
    ctx.fillStyle = 'rgba(5,10,16,0.75)';
    ctx.beginPath();
    var x = 450 - w / 2, y = 62, h = 34, rr = 10;
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.fill();
    ctx.fillStyle = '#eef4f8';
    ctx.fillText(text, 450, y + h / 2 + 1);
    ctx.restore();
  }

  function drawPowerBar() {
    var x = 340, y = 528, w = 260, h = 16;
    ctx.save();
    ctx.fillStyle = 'rgba(5,10,16,0.80)';
    ctx.fillRect(0, 516, W, H - 516);

    var g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#2fd27a'); g.addColorStop(0.62, '#ffd166'); g.addColorStop(0.88, '#ff8c42'); g.addColorStop(1, '#ff4d4d');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);

    // Franja roja: si la barra se lockea acá, la pelota se va.
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(x + w * 0.90, y, w * 0.10, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    var mx = x + w * clamp(S.power, 0, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(mx - 2, y - 6, 4, h + 12);

    ctx.font = 'bold 12px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = '#eef4f8';
    ctx.textAlign = 'right';
    ctx.fillText('POTENCIA', x - 14, y + h / 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#93a6b6';
    ctx.fillText('ESPACIO o CLIC para frenar', x + w + 14, y + h / 2);
    ctx.restore();
  }

  function render() {
    ctx.save();
    if (S.shake > 0) {
      ctx.translate((Math.random() - 0.5) * S.shake * 14, (Math.random() - 0.5) * S.shake * 14);
    }

    drawBackground();
    drawGoal();

    var kColor = P.colors[keeperTeam()], sColor = P.colors[kickerTeam()];
    var showKeeper = S.screen === 'GAME';
    var dive = 0, runP = 0, ball = null, ballBehind = false;

    if (S.phase === 'ANIM' && S.shot) {
      var t = S.anim;
      runP = clamp(t / T_RUN, 0, 1);
      dive = clamp((t - T_DIVE) / T_DIVE_DUR, 0, 1);
      if (t < T_RUN) {
        ball = ballRest();
      } else if (t < T_FLIGHT_END) {
        var p = (t - T_RUN) / (T_FLIGHT_END - T_RUN);
        ball = ballAt(p);
        ballBehind = p > 0.88;
      } else {
        var q = clamp((t - T_FLIGHT_END) / (T_END - T_FLIGHT_END), 0, 1);
        ball = ballAfter(q);
        ballBehind = S.shot.result === 'GOL';
      }
    } else if (S.screen === 'GAME') {
      ball = ballRest();
    }

    if (ball && ballBehind) drawBall(ball);
    if (showKeeper) drawKeeper(dive, kColor);
    if (S.screen === 'GAME') drawKicker(runP, sColor);
    if (ball && !ballBehind) drawBall(ball);

    // Interfaz de puntería.
    if (S.phase === 'KEEPER') {
      drawZones(S.cursor, '#8fe8ff', 'ARQUERO · ' + P.names[keeperTeam()]);
    } else if (S.phase === 'SHOOTER') {
      if (S.sub === 'zone') {
        drawZones(S.cursor, sColor, 'PATEA · ' + P.names[kickerTeam()]);
      } else {
        drawZones(S.shooterPick, sColor, 'Marcá la potencia');
        drawPowerBar();
      }
    } else if (S.phase === 'ANIM' && S.anim > T_FLIGHT_END && S.shot) {
      banner({ GOL: '¡GOL!', ATAJADA: '¡ATAJADA!', PALO: '¡PALO!', AFUERA: '¡AFUERA!' }[S.shot.result]);
    }

    ctx.restore();
  }

  /* ============================== bucle =============================== */

  var last = 0;

  function frame(now) {
    var dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;

    if (S.phase === 'SHOOTER' && S.sub === 'power') {
      S.powerT += dt;
      S.power = (Math.sin(S.powerT * Math.PI * 1.45 - Math.PI / 2) + 1) / 2;
    }

    if (S.phase === 'ANIM') {
      var before = S.anim;
      S.anim += dt;
      if (before < T_RUN && S.anim >= T_RUN) SFX.kick();
      if (before < T_FLIGHT_END && S.anim >= T_FLIGHT_END) {
        if (S.shot.result === 'GOL') { SFX.goal(); S.netHit = 1; }
        else if (S.shot.result === 'ATAJADA') { SFX.save(); S.shake = 1; }
        else if (S.shot.result === 'PALO') { SFX.post(); S.shake = 1; }
        else { SFX.wide(); }
      }
      if (S.anim >= T_END) finishKick();
    }

    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 5);
    if (S.netHit > 0) S.netHit = Math.max(0, S.netHit - dt * 1.2);

    render();
    window.requestAnimationFrame(frame);
  }

  /* ============================== entrada ============================= */

  function confirmZone() {
    if (S.phase === 'KEEPER') {
      S.keeperPick = S.cursor;
      SFX.click();
      goPhase(S.mode === 'DUO' ? 'HANDOFF_S' : 'SHOOTER');
      return;
    }
    if (S.phase === 'SHOOTER') {
      if (S.sub === 'zone') {
        S.shooterPick = S.cursor;
        S.sub = 'power';
        S.powerT = 0;
        S.power = 0;
        SFX.click();
        setHint('Frená la barra: cuanto más fuerte, mejor… pero en rojo se va afuera');
      } else {
        fire();
      }
    }
  }

  function aiming() {
    return S.phase === 'KEEPER' || (S.phase === 'SHOOTER' && S.sub === 'zone');
  }

  function moveCursor(dc, dr) {
    var c = clamp(col(S.cursor) + dc, 0, 2), r = clamp(row(S.cursor) + dr, 0, 1);
    var next = r * 3 + c;
    if (next !== S.cursor) { S.cursor = next; SFX.click(); }
  }

  document.addEventListener('keydown', function (e) {
    if (S.screen !== 'GAME') return;
    var k = e.key;
    if (aiming()) {
      if (k === 'ArrowLeft') { moveCursor(-1, 0); e.preventDefault(); return; }
      if (k === 'ArrowRight') { moveCursor(1, 0); e.preventDefault(); return; }
      if (k === 'ArrowUp') { moveCursor(0, -1); e.preventDefault(); return; }
      if (k === 'ArrowDown') { moveCursor(0, 1); e.preventDefault(); return; }
    }
    if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (aiming() || (S.phase === 'SHOOTER' && S.sub === 'power')) confirmZone();
      else if (S.phase === 'OUTCOME') { SFX.click(); nextKick(); }
    }
  });

  function canvasPoint(e) {
    var r = CV.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }

  CV.addEventListener('pointerdown', function (e) {
    if (S.screen !== 'GAME') return;
    e.preventDefault();

    if (S.phase === 'SHOOTER' && S.sub === 'power') { confirmZone(); return; }
    if (!aiming()) return;

    var pt = canvasPoint(e);
    for (var z = 0; z < 6; z++) {
      var r = zoneRect(z);
      if (pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h) {
        S.cursor = z;
        confirmZone();
        return;
      }
    }
  });

  /* ============================== botones ============================= */

  $('btnCpu').addEventListener('click', function () { SFX.click(); openConfig('CPU'); });
  $('btnDuo').addEventListener('click', function () { SFX.click(); openConfig('DUO'); });
  $('btnBack').addEventListener('click', function () {
    SFX.click();
    S.screen = 'MENU';
    $('hud').hidden = true;
    layout();
    show('MENU');
    renderRecords();
    setHint('Elegí un modo para empezar');
  });
  $('btnStart').addEventListener('click', function () { SFX.click(); startMatch(); });
  $('btnHand').addEventListener('click', function () {
    SFX.click();
    goPhase(S.phase === 'HANDOFF_K' ? 'KEEPER' : 'SHOOTER');
  });
  $('btnNext').addEventListener('click', function () { SFX.click(); nextKick(); });
  $('btnAgain').addEventListener('click', function () { SFX.click(); startMatch(); });
  $('btnMenu').addEventListener('click', function () {
    SFX.click();
    S.screen = 'MENU';
    S.phase = 'IDLE';
    $('hud').hidden = true;
    layout();
    show('MENU');
    renderRecords();
    setHint('Elegí un modo para empezar');
  });

  $('btnMute').addEventListener('click', function () {
    P.muted = !P.muted;
    savePrefs();
    var b = $('btnMute');
    b.textContent = 'Sonido: ' + (P.muted ? 'no' : 'sí');
    b.setAttribute('aria-pressed', String(P.muted));
    if (!P.muted) SFX.click();
  });

  /* ============================== arranque ============================ */

  window.addEventListener('resize', function () { fitCanvas(); layout(); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);
  fitCanvas();
  layout();
  renderRecords();
  show('MENU');
  $('btnMute').textContent = 'Sonido: ' + (P.muted ? 'no' : 'sí');
  $('btnMute').setAttribute('aria-pressed', String(P.muted));
  window.requestAnimationFrame(frame);

})();
