(function () {
'use strict';

/* =========================================================
   CONFIGURATION
   ========================================================= */
const TEST_MODE_DEFAULT = false;              // true unlocks every world and level (for testing)
const DEBUG_DEFAULT = false;
const DEV_TOOLS = true;                       // false in a release build: the developer tools are built out entirely
const SAVE_KEY = 'arrowEscape.save.v6';
/* Coins are kept scarce enough that a hint or a continue is a real choice: roughly half of what
   the early builds paid, from every source. */
const CFG = { startCoins: 50, hintCost: 40, hintStage2: 25, hintStage3: 35, continueCost: 60, extraSeconds: 30,
              revealFromWorld: 5, revealCost: 20, revealRadius: 4, weeklyReward: 20, weeklyBonus: 60, secretReward: 40,
              dailyLadder: [10, 12, 15, 18, 20, 25, 40], levelsPerWorld: 20, lives: 3,
              unlockStars: 50, maxHints: 3, monthlyW: 30, monthlyLives: 5, monthlyReward: 150, timeStarShare: 0.25, warnShare: 0.30, dangerSeconds: 10,
              minZoom: 0.6, maxZoom: 6 };

const DIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
const MIRROR = { '/': [1, 0, 3, 2], '\\': [3, 2, 1, 0] };
const dirIndex = (dx, dy) => dy < 0 ? 0 : dx > 0 ? 1 : dy > 0 ? 2 : 3;

const KIND_COL = { clock: '#e8590c', boom: '#d6336c', slide: '#1c7ed6', hungry: '#2b8a3e', design: '#9c36b5',
                   key: '#f2b01e', lock: '#343a40' };
const NORMAL_COLS = ['#3f7fd0', '#2f9e6b', '#e0822b', '#8a4fd8', '#d9468f', '#1c9aa6', '#c2410c', '#4b5a72'];
const PORTAL_COLS = ['#7048e8', '#0c8599', '#c2255c', '#5c940d'];
const GATE_COLORS = ['#e03131', '#0ca678', '#f59f00'];

const WORLDS = [
  { name: 'Meadow', key: 'bent', color: '#2f9e6b', tint: '#e6f2ea', finale: 'tree', icon: '🌿',
    tagline: 'Quiet fields, gentle paths.',
    desc: 'Straight and bent arrows. Find the arrow that can escape, then follow the chain.' },
  { name: 'Clock Tower', key: 'clock', color: '#e8590c', tint: '#f9ece1', finale: 'castle', icon: '🕰',
    tagline: 'Something is moving...',
    desc: 'New: clockwork arrows turn a quarter clockwise every time another arrow leaves the board.' },
  { name: 'Mirror Lake', key: 'mirrors', color: '#2b8fd6', tint: '#e5eff8', finale: 'butterfly', icon: '🪞',
    tagline: 'Nothing flies straight here.',
    desc: 'New: mirrors bend flight paths by 90 degrees. Clockwork arrows appear as well.' },
  { name: 'Portal Nebula', key: 'portals', color: '#7048e8', tint: '#ece8fb', finale: 'star', icon: '🪐',
    tagline: 'Space folds around you.',
    desc: 'New: an arrow that enters a portal comes out of its twin. Mirrors and clockwork appear as well.' },
  { name: 'Colour Gates', key: 'gates', color: '#e03131', tint: '#fae6e6', finale: 'trophy', icon: '🚪',
    tagline: 'Only the right colour may leave.',
    desc: 'New: a coloured arrow may only leave through a gate of its own colour, after a path full of mirrors and portals.' },
  { name: 'Ice Cave', key: 'sliders', color: '#1c7ed6', tint: '#e4eef9', finale: 'mushroom', icon: '❄️',
    tagline: 'Nothing stops where you expect.',
    desc: 'New: ice arrows never crash; they slide until they hit something. All earlier mechanics appear as well.' },
  { name: 'Boomerang Bay', key: 'boom', color: '#d6336c', tint: '#f9e6ee', finale: 'bird', icon: '🪃',
    tagline: 'What leaves may come back.',
    desc: 'New: boomerang arrows fly out, come back reversed and leave on the second tap.' },
  { name: 'Hungry Jungle', key: 'hungry', color: '#2b8a3e', tint: '#e5f2e7', finale: 'cat', icon: '🌴',
    tagline: 'The board is growing.',
    desc: 'New: hungry arrows grow one cell forward after every release.' },
  { name: 'Castle', key: 'keys', color: '#7d4f16', tint: '#f4ece0', finale: 'castle', icon: '🏰',
    tagline: 'Locked gates, hidden keys.',
    desc: 'New: a padlocked arrow cannot move until the key arrow with the same letter has left the board.' },
  { name: "Architect's Studio", key: 'design', color: '#9c36b5', tint: '#f3e8f7', finale: 'robot', icon: '🏗',
    tagline: 'You draw the last lines.',
    desc: 'The final world: choose the direction of every dashed tile before you start, with every mechanic on the board.' }
];
const MECH_ORDER = ['bent', 'clock', 'mirrors', 'portals', 'gates', 'sliders', 'boom', 'hungry', 'keys', 'design'];

/* A rhythm of hard levels, breathers and a boss finale, so the world does not exhaust the player. */
const LEVEL_RHYTHM = ['intro', 'easy', 'easy', 'easy+', 'medium-', 'breather', 'medium', 'medium+', 'hard-', 'hard',
                      'hard', 'hard+', 'breather', 'hard+', 'hard', 'expert-', 'expert', 'expert', 'expert+', 'boss'];

const SHAPES_SIMPLE = ['circle', 'diamond', 'triangle', 'hexagon', 'heart', 'oval', 'cross', 'star'];
const SHAPES_MID = ['house', 'tree', 'bird', 'fish', 'rocket', 'mushroom', 'boat', 'key', 'butterfly'];
const SHAPES_HARD = ['cat', 'car', 'castle', 'robot', 'ghost', 'trophy', 'crown', 'butterfly'];
function shapeFor(w, l) {
  if (l === 19) return WORLDS[w].finale;
  if (LEVEL_RHYTHM[l] === 'breather') return ['heart', 'butterfly', 'star', 'circle'][(w + l) % 4];
  if (l < 5) return 'rect';
  if (l < 10) return SHAPES_SIMPLE[(w * 3 + l) % SHAPES_SIMPLE.length];
  if (l < 15) return SHAPES_MID[(w * 2 + l) % SHAPES_MID.length];
  return SHAPES_HARD[(w + l) % SHAPES_HARD.length];
}

function params(w, l) {
  const tut = l === 0;
  const rhythm = LEVEL_RHYTHM[l] || 'medium';
  const breather = rhythm === 'breather', boss = rhythm === 'boss';
  const shape = tut ? 'rect' : shapeFor(w, l);
  const rectBoard = tut || shape === 'rect';
  // rectangles can be much larger because the border-first pass fills them reliably
  let base = tut ? 9 + Math.floor(w / 4)
           : Math.min(10 + Math.floor(w / 2) + Math.floor(l / 3), rectBoard ? 19 : 16);
  if (boss) base = Math.min(base + 2, 20);
  if (breather) base = Math.max(8, base - 1);
  const p = { shape, W: base, H: Math.round(base * 1.33), tut, rhythm, boss, breather, gravity: false,
    maxLen: tut ? 5 + Math.floor(w / 3) : Math.min(6 + Math.floor(l / 4) + Math.floor(w / 3) + (boss ? 3 : 0), 16),
    minLen: tut ? 2 : (l < 6 ? 2 : 3),
    bend: tut ? 0.3 : Math.min(0.35 + w * 0.02 + l * 0.01, 0.62),
    timeFactor: boss ? 1.15 : breather ? 1.3 : 1,
    openings: tut ? 3 : breather ? 3 : boss ? 1 : (l < 3 ? 2 : 1),
    clock: 0, mirrors: 0, portals: 0, gates: 0, sliders: 0, boom: 0, hungry: 0, keys: 0, design: 0 };
  if (tut) {
    const t = { 1: { clock: 3 }, 2: { mirrors: 0.06 }, 3: { portals: 2 },
                4: { gates: 3, portals: 2, mirrors: 0.04 }, 5: { sliders: 1, minSlides: 1 }, 6: { boom: 3 },
                7: { hungry: 3 }, 8: { keys: 2 }, 9: { design: 2 } }[w] || {};
    return Object.assign(p, t);
  }
  const soft = breather ? 0.5 : 1;
  const extra = Math.max(1, Math.round((2 + Math.floor(l / 5) + Math.floor(w / 3)) * soft));
  const main = Math.max(2, Math.round((2 + Math.floor(l / 3) + Math.floor(w / 3) + (boss ? 2 : 0)) * soft));
  const is = k => WORLDS[w].key === k;
  const has = k => MECH_ORDER.indexOf(k) <= w;
  if (has('clock'))   p.clock   = is('clock') ? main : extra;
  if (has('mirrors')) p.mirrors = (is('mirrors') ? 0.035 + 0.0015 * l : (is('gates') ? 0.03 + 0.0015 * l : 0.018 + 0.001 * l)) * soft;
  if (has('portals')) p.portals = Math.max(1, Math.round((is('portals') ? 1 + Math.floor(l / 5) : (is('gates') ? 2 + Math.floor(l / 6) : 1 + Math.floor(l / 9))) * soft));
  if (has('gates'))   p.gates   = Math.max(1, Math.round((is('gates') ? 3 + Math.floor(l / 2) : 1 + Math.floor(l / 5)) * soft));
  /* One, whatever the world. Asking for more does not produce more: the generator manages about
     one slider per board at any setting, because unslide raises need[] on the cells it frees and
     they become very hard to fill again. A higher number only makes the fill fail and the build
     restart, which costs nine times the generation for the same board. minSlides is what actually
     keeps a slide in the solution of the world that teaches them. */
  if (has('sliders')) { p.sliders = 1; p.minSlides = is('sliders') ? 1 : 0; }
  if (has('boom'))    p.boom    = is('boom') ? main : extra;
  if (has('hungry'))  p.hungry  = is('hungry') ? main : extra;
  if (has('keys'))    p.keys    = is('keys') ? 2 + Math.floor(l / 3) : Math.max(1, Math.round((1 + Math.floor(l / 7)) * soft));
  if (has('design'))  p.design  = is('design') ? main : Math.max(1, extra - 1);
  return p;
}
function worldMechanics(w) {
  const learned = MECH_ORDER.slice(0, w + 1);
  return { fresh: [WORLDS[w].key], earlier: learned.slice(0, -1) };
}

/* =========================================================
   SAVE DATA (on the device only)
   ========================================================= */
/* ---------- languages ----------
   The interface stays in English in this prototype. The selector stores the choice so the
   translation files can be attached later without changing any screen. */
const LANGUAGES = {
  en: { name: 'English', native: 'English', flag: '\uD83C\uDDEC\uD83C\uDDE7' },
  de: { name: 'German', native: 'Deutsch', flag: '\uD83C\uDDE9\uD83C\uDDEA' },
  es: { name: 'Spanish', native: 'Espa\u00f1ol', flag: '\uD83C\uDDEA\uD83C\uDDF8' },
  fr: { name: 'French', native: 'Fran\u00e7ais', flag: '\uD83C\uDDEB\uD83C\uDDF7' },
  it: { name: 'Italian', native: 'Italiano', flag: '\uD83C\uDDEE\uD83C\uDDF9' },
  pt: { name: 'Portuguese', native: 'Portugu\u00eas', flag: '\uD83C\uDDF5\uD83C\uDDF9' },
  nl: { name: 'Dutch', native: 'Nederlands', flag: '\uD83C\uDDF3\uD83C\uDDF1' },
  sk: { name: 'Slovak', native: 'Sloven\u010dina', flag: '\uD83C\uDDF8\uD83C\uDDF0' },
  cs: { name: 'Czech', native: '\u010ce\u0161tina', flag: '\uD83C\uDDE8\uD83C\uDDFF' },
  pl: { name: 'Polish', native: 'Polski', flag: '\uD83C\uDDF5\uD83C\uDDF1' },
  hu: { name: 'Hungarian', native: 'Magyar', flag: '\uD83C\uDDED\uD83C\uDDFA' },
  el: { name: 'Greek', native: '\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac', flag: '\uD83C\uDDEC\uD83C\uDDF7' },
  sv: { name: 'Swedish', native: 'Svenska', flag: '\uD83C\uDDF8\uD83C\uDDEA' },
  fi: { name: 'Finnish', native: 'Suomi', flag: '\uD83C\uDDEB\uD83C\uDDEE' },
  da: { name: 'Danish', native: 'Dansk', flag: '\uD83C\uDDE9\uD83C\uDDF0' },
  no: { name: 'Norwegian', native: 'Norsk', flag: '\uD83C\uDDF3\uD83C\uDDF4' },
  ro: { name: 'Romanian', native: 'Rom\u00e2n\u0103', flag: '\uD83C\uDDF7\uD83C\uDDF4' },
  hr: { name: 'Croatian', native: 'Hrvatski', flag: '\uD83C\uDDED\uD83C\uDDF7' },
  bg: { name: 'Bulgarian', native: '\u0411\u044a\u043b\u0433\u0430\u0440\u0441\u043a\u0438', flag: '\uD83C\uDDE7\uD83C\uDDEC' },
  uk: { name: 'Ukrainian', native: '\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430', flag: '\uD83C\uDDFA\uD83C\uDDE6' },
  tr: { name: 'Turkish', native: 'T\u00fcrk\u00e7e', flag: '\uD83C\uDDF9\uD83C\uDDF7' },
  ar: { name: 'Arabic', native: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629', flag: '\uD83C\uDDF8\uD83C\uDDE6' },
  hi: { name: 'Hindi', native: '\u0939\u093f\u0928\u094d\u0926\u0940', flag: '\uD83C\uDDEE\uD83C\uDDF3' },
  id: { name: 'Indonesian', native: 'Bahasa Indonesia', flag: '\uD83C\uDDEE\uD83C\uDDE9' },
  vi: { name: 'Vietnamese', native: 'Ti\u1ebfng Vi\u1ec7t', flag: '\uD83C\uDDFB\uD83C\uDDF3' },
  ja: { name: 'Japanese', native: '\u65e5\u672c\u8a9e', flag: '\uD83C\uDDEF\uD83C\uDDF5' },
  ko: { name: 'Korean', native: '\ud55c\uad6d\uc5b4', flag: '\uD83C\uDDF0\uD83C\uDDF7' },
  zh: { name: 'Chinese', native: '\u4e2d\u6587', flag: '\uD83C\uDDE8\uD83C\uDDF3' }
};

function defaultOpts() {
  return { theme: 'paper', arrowStyle: 'classic', celebrationFx: 'confetti', releaseCue: 'glow', soundVol: 70, vibroVol: 70,
           music: false, musicVol: 40, musicStyle: 'world', reducedMotion: false, lefty: false, colorBlind: false, bigHeads: false,
           lang: 'en', textSize: 'medium', clearJingle: 'a' };
}
function defaultSave() {
  return { coins: CFG.startCoins, progress: {}, mastery: {}, badges: {}, stats: {}, daily: {}, monthly: {}, weekly: {}, secrets: {},
           lastPlayed: null, testMode: TEST_MODE_DEFAULT, debug: DEBUG_DEFAULT, sound: true, vibro: true, seenIntro: {},
           rated: false, adClears: 0, adSeenAt: 0, opts: defaultOpts() };
}
/* The bridge global Capacitor injects. The game is one plain script with no bundler, so
   plugins are reached through it rather than through their npm packages. Absent in a browser. */
const nativePlugin = name => { const c = window.Capacitor; return (c && c.Plugins && c.Plugins[name]) || null; };

/* Every stored save passes through here, whichever store it came from. A renamed option needs
   one line in this function or players silently lose the setting. */
/* the music styles a save may name; the engine is loaded before this file */
const MUSIC_STYLE_IDS = ['world'].concat(window.PuzzleMusic ? Object.keys(PuzzleMusic.STYLES) : []);
function migrateSave(obj) {
  const sv = Object.assign(defaultSave(), obj);
  sv.opts = Object.assign(defaultOpts(), sv.opts || {});
  if (sv.opts.escapeFx) { sv.opts.celebrationFx = sv.opts.escapeFx; delete sv.opts.escapeFx; }  // renamed in 0.9
  if (!MUSIC_STYLE_IDS.includes(sv.opts.musicStyle)) sv.opts.musicStyle = 'world';               // the twelve motif styles of 0.11
  const d = defaultOpts();
  for (const k in d) if (sv.opts[k] === undefined) sv.opts[k] = d[k];
  if (!DEV_TOOLS) { sv.testMode = false; sv.debug = false; }  // a release build never inherits developer flags
  return sv;
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return migrateSave(JSON.parse(raw));
  } catch (e) {}
  return defaultSave();
}
/* Written to both stores. SharedPreferences is the copy that survives, because Android may
   clear the WebView's data; the localStorage copy keeps a browser session working and stands
   as a second copy if Preferences ever fails. */
function persist() {
  const raw = JSON.stringify(save);
  try { localStorage.setItem(SAVE_KEY, raw); } catch (e) {}
  const pref = nativePlugin('Preferences');
  if (pref) pref.set({ key: SAVE_KEY, value: raw }).catch(() => {});
}
/* The game boots from localStorage so that the first paint never waits on a plugin round
   trip, then adopts the durable copy. An empty native store means this is the first run since
   the move, so whatever localStorage holds is seeded into it rather than being lost. */
async function loadSaveAsync() {
  const pref = nativePlugin('Preferences');
  if (!pref) return false;
  let raw;
  try { raw = (await pref.get({ key: SAVE_KEY })).value; } catch (e) { return false; }
  if (!raw) { persist(); return false; }
  /* If the player has touched the game in the moment before the durable copy arrived, what is
     in memory is the newer save, so it is kept and written back rather than replaced. */
  if (touchedSinceBoot) { persist(); return false; }
  try { save = migrateSave(JSON.parse(raw)); } catch (e) { return false; }
  return true;
}
let save = loadSave();
/* set by the first touch, so the durable copy is only adopted before the player has done anything */
let touchedSinceBoot = false;
document.addEventListener('pointerdown', () => { touchedSinceBoot = true; }, { capture: true, once: true });
function worldStatus(w) {
  let levels = 0, stars = 0;
  for (let l = 0; l < CFG.levelsPerWorld; l++) { const s = save.progress[w + '-' + l] || 0; if (s) levels++; stars += s; }
  return { levels, stars, mastered: levels === CFG.levelsPerWorld && stars >= CFG.unlockStars };
}
/* A world opens once the one before it has fifty stars, finished or not. An opened world is
   remembered, so it can never close again, not even for a player who opened it under the old
   rule of forty five stars and every level. */
const isWorldUnlocked = w => save.testMode || w === 0 || !!(save.worldsOpen && save.worldsOpen[w])
  || worldStatus(w - 1).stars >= CFG.unlockStars;
function rememberOpenWorlds() {
  const o = save.worldsOpen || (save.worldsOpen = {});
  let changed = false;
  for (let w = 1; w < WORLDS.length; w++) {
    const prev = worldStatus(w - 1);
    const oldRule = !save.unlockRule2 && prev.levels === CFG.levelsPerWorld && prev.stars >= 45;
    if (!o[w] && (oldRule || prev.stars >= CFG.unlockStars)) { o[w] = 1; changed = true; }
  }
  if (!save.unlockRule2) { save.unlockRule2 = true; changed = true; }
  if (changed) persist();
}
/* The daily, weekly and monthly boards draw their mechanics from the worlds the player has
   opened, so nobody meets keys, padlocks or design tiles there before the campaign teaches them. */
function reachedWorlds() { let n = 1; while (n < WORLDS.length && isWorldUnlocked(n)) n++; return n; }
/* Held for the day, the week or the month it was first asked for, so opening a new world does
   not change a daily, weekly or monthly board halfway through its period. */
function reachedFor(period) {
  const r = save.reach || (save.reach = {});
  if (r[period] == null) { r[period] = reachedWorlds(); persist(); }
  return r[period];
}
const isLevelUnlocked = (w, l) => save.testMode || (isWorldUnlocked(w) && (l === 0 || (save.progress[w + '-' + (l - 1)] || 0) > 0));

/* =========================================================
   HELPERS
   ========================================================= */
const $ = s => document.querySelector(s);
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
let toastTimer = null;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
function updateCoins() { document.querySelectorAll('.coin-val').forEach(el => el.textContent = save.coins); }
function addCoins(n) { save.coins = Math.max(0, save.coins + n); persist(); updateCoins(); }

let actx = null;
/* Reasons the sound must stay off even though something asks for it: a rewarded video is playing,
   or the game is off screen. The music asks for the audio on every beat, so without this hold it
   would wake the sound back up half a second after it was paused. */
const audioHold = { ad: false, away: false };
const audioHeld = () => audioHold.ad || audioHold.away;
/* A browser creates an audio context in the suspended state until the player has touched the page.
   Every sound path goes through this helper, and the first touch resumes the context. */
function ensureAudio() {
  try {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      /* 32 kHz: every sound in the game lives far below its 16 kHz ceiling, and the music's
         layers then cost a third less than at a phone's usual 48 kHz */
      try { actx = new AC({ sampleRate: 32000 }); } catch (e) { actx = new AC(); }
    }
    if (actx.state === 'suspended' && !audioHeld()) { actx.resume(); warmAudio(); }
  } catch (e) { return null; }
  return actx;
}
/* Android starts an audio stream quietly and takes a moment to reach full volume, and over
   Bluetooth it can swallow the beginning altogether. The first sounds of a level would be the
   ones to suffer, so a silent tone opens the stream as soon as the sound is allowed to play and
   it is already running when the first arrow leaves. */
let warmedAt = -1e9;
function warmAudio() {
  if (!actx || audioHeld() || actx.currentTime - warmedAt < 5) return;
  warmedAt = actx.currentTime;
  try {
    const o = actx.createOscillator(), g = actx.createGain();
    g.gain.value = 0.00001;                       // inaudible, but the stream is open
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + 0.9);
    o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (e) {} };
  } catch (e) {}
}
document.addEventListener('pointerdown', function unlockAudio() {
  ensureAudio();
  /* the first touch is when sound may start, on whatever screen the player is: the home screen too */
  if (save && save.opts && save.opts.music && music && !music.isPlaying()) musicStart(G && currentScreen === 's-game' ? G.w : musicWorld);
}, { capture: true });
/* ---------- the board-clear celebration ----------
   A short happy piece in the voice of the background music: the same FM bell, glass and electric
   piano as music.js, a quick climb up a major chord, a warm chord to land on, a sparkle on top and
   a soft echo. It plays in the key of the piece that is playing, so it sounds like part of the
   music rather than a sound laid over it. Pure Web Audio, no file, about two seconds. */
const JINGLE_VOICES = {
  bell:   { fm: { ratio: 3.5, index: 1.6, decay: 0.35 }, a: 0.004, d: 1.6, gain: 0.7 },
  glass:  { fm: { ratio: 5, index: 0.9, decay: 0.2 }, a: 0.006, d: 1.2, gain: 0.6 },
  piano:  { fm: { ratio: 1, index: 1.2, decay: 0.5 }, a: 0.005, d: 1.4, gain: 0.75 },
  marimba:{ fm: { ratio: 4, index: 1.1, decay: 0.06 }, a: 0.003, d: 0.45, gain: 0.85 }
};
/* Three candidates, to be tried on the phone before one is kept. Each is a list of notes:
   [voice, semitones from the root, start in seconds, length, strength]. */
const JINGLES = {
  a: { name: 'Sparkle climb', notes: [
    ['bell', 0, 0, .5, .5], ['bell', 4, .085, .5, .55], ['bell', 7, .17, .5, .6], ['glass', 12, .255, .5, .65], ['glass', 16, .34, .5, .7], ['glass', 19, .425, .5, .75],
    ['piano', -12, .55, 1.4, .42], ['piano', -5, .55, 1.4, .42], ['piano', 0, .55, 1.4, .42], ['piano', 4, .55, 1.4, .42], ['piano', 7, .55, 1.4, .42],
    ['bell', 24, .55, 1.6, .6], ['glass', 28, .77, .8, .4], ['glass', 31, .89, .9, .36]] },
  b: { name: 'Happy bounce', notes: [
    ['marimba', 0, 0, .3, .7], ['marimba', 4, .12, .3, .7], ['marimba', 7, .24, .3, .75], ['marimba', 4, .36, .3, .6],
    ['marimba', 7, .42, .3, .7], ['marimba', 12, .54, .3, .85],
    ['piano', -12, .72, 1.1, .4], ['piano', 0, .72, 1.1, .4], ['piano', 4, .72, 1.1, .4], ['piano', 7, .72, 1.1, .4],
    ['glass', 16, .72, .25, .5], ['glass', 19, .80, .25, .5], ['glass', 16, .88, .25, .45], ['glass', 19, .96, .25, .45], ['glass', 24, 1.04, .9, .55]] },
  c: { name: 'Triumph', notes: [
    ['piano', -7, 0, .45, .45], ['piano', -3, 0, .45, .45], ['piano', 0, 0, .45, .45], ['piano', 5, 0, .45, .45], ['bell', 17, 0, .45, .55],
    ['piano', -12, .42, 1.8, .5], ['piano', -5, .42, 1.8, .45], ['piano', 0, .42, 1.8, .45], ['piano', 4, .42, 1.8, .45], ['piano', 7, .42, 1.8, .45],
    ['bell', 12, .42, 1.8, .55], ['bell', 19, .42, 1.8, .5],
    ['glass', 24, .78, .6, .4], ['glass', 28, .88, .6, .42], ['glass', 31, .98, .6, .44], ['glass', 36, 1.08, 1.2, .5]] },
  d: { name: 'Music box', notes: [
    ['glass', 12, 0, .4, .55], ['glass', 16, .16, .4, .5], ['glass', 19, .32, .4, .55], ['glass', 24, .48, .5, .6],
    ['glass', 19, .64, .4, .5], ['glass', 24, .80, .5, .55], ['glass', 28, .96, .9, .6],
    ['piano', 0, .96, 1.2, .35], ['piano', 7, .96, 1.2, .3], ['bell', 24, 1.12, 1.4, .45]] },
  e: { name: 'Harp run', notes: [
    ...[0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24].map((iv, i) => [i < 6 ? 'bell' : 'glass', iv, i * .045, .45, .4 + i * .025]),
    ['piano', -12, .55, 1.5, .42], ['piano', 0, .55, 1.5, .42], ['piano', 4, .55, 1.5, .42], ['piano', 7, .55, 1.5, .42],
    ['bell', 28, .55, 1.5, .5]] },
  f: { name: 'Chimes', notes: [
    ['bell', 24, 0, .6, .55], ['bell', 19, .18, .6, .5], ['bell', 16, .36, .6, .5], ['bell', 12, .54, .7, .5],
    ['bell', 16, .78, .6, .5], ['bell', 19, .96, .6, .55], ['bell', 24, 1.14, 1.6, .65],
    ['piano', 0, 1.14, 1.4, .35], ['piano', 4, 1.14, 1.4, .3], ['piano', 7, 1.14, 1.4, .3]] },
  g: { name: 'Level up', notes: [
    ['marimba', 0, 0, .25, .7], ['marimba', 4, .07, .25, .7], ['marimba', 7, .14, .25, .75],
    ['marimba', 2, .30, .25, .7], ['marimba', 5, .37, .25, .7], ['marimba', 9, .44, .25, .75],
    ['marimba', 4, .60, .25, .75], ['marimba', 7, .67, .25, .75], ['marimba', 11, .74, .25, .8], ['marimba', 12, .81, .4, .9],
    ['piano', -12, .81, 1.2, .4], ['piano', 0, .81, 1.2, .4], ['piano', 4, .81, 1.2, .4], ['piano', 7, .81, 1.2, .4],
    ['glass', 24, .95, .7, .5], ['glass', 28, 1.05, .8, .45]] },
  none: { name: 'None', notes: [] }
};
function jingleNote(c, out, voice, midi, t, dur, vel) {
  const v = JINGLE_VOICES[voice], f = 440 * Math.pow(2, (midi - 69) / 12);
  const o = c.createOscillator(), g = c.createGain(), m = c.createOscillator(), mg = c.createGain();
  o.type = 'sine'; o.frequency.value = f;
  m.frequency.value = f * v.fm.ratio;
  mg.gain.setValueAtTime(f * v.fm.index * (0.6 + 0.4 * vel), t); mg.gain.setTargetAtTime(0, t, v.fm.decay);
  m.connect(mg); mg.connect(o.frequency);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * v.gain, t + v.a);
  g.gain.setTargetAtTime(0, t + v.a, Math.min(v.d, dur) / 3);
  o.connect(g); g.connect(out);
  const end = t + v.a + Math.min(v.d, dur) + 0.2;
  o.start(t); m.start(t); o.stop(end); m.stop(end);
  o.onended = () => { try { o.disconnect(); g.disconnect(); m.disconnect(); mg.disconnect(); } catch (e) {} };
}
/* Builds the whole piece on any audio context, so the same code plays it live and measures it. */
function jingleInto(c, dest, t0, root, level, which) {
  const out = c.createGain(); out.gain.value = level; out.connect(dest);
  const echo = c.createDelay(0.5), fb = c.createGain(), tone = c.createBiquadFilter(), wet = c.createGain();
  echo.delayTime.value = 0.19; fb.gain.value = 0.3; tone.type = 'lowpass'; tone.frequency.value = 3000; wet.gain.value = 0.35;
  out.connect(echo); echo.connect(tone); tone.connect(fb); fb.connect(echo); tone.connect(wet); wet.connect(dest);
  const J = JINGLES[which] || JINGLES.a;
  let last = 0;
  for (const [voice, iv, at, dur, vel] of J.notes) { jingleNote(c, out, voice, root + iv, t0 + at, dur, vel); last = Math.max(last, at + dur); }
  setTimeout(() => { try { out.disconnect(); wet.disconnect(); fb.disconnect(); } catch (e) {} }, (t0 - (c.currentTime || 0) + last + 4) * 1000);
}
/* Measured with jingleInto on an offline context: at a level of 1 its average loudness is about
   JINGLE_UNIT_RMS. It is set to the music's own average (0.015 times the music factor), or to the
   old sweeps' level when the music is off. */
const JINGLE_UNIT_RMS = { a: 0.337, b: 0.288, c: 0.354, d: 0.21, e: 0.283, f: 0.249, g: 0.327 };
function celebrateClear(which) {
  which = which || save.opts.clearJingle || 'a';
  if (which === 'none' || !JINGLES[which]) return;
  if (!save.sound || !save.opts.soundVol) return;
  const c = ensureAudio(); if (!c || audioHeld()) return;
  let root = 72;                                   // C, a bright octave, when no music is playing
  try {
    const inf = music && music.info();
    const pc = inf && inf.playing && inf.key ? PuzzleMusic.NOTE_NAMES.indexOf(inf.key) : -1;
    if (pc >= 0) root = 72 + ((pc + 6) % 12) - 6;   // the music's key, kept between F#4 and F5
  } catch (e) {}
  const target = save.opts.music && save.opts.musicVol && music
    ? 0.015 * musicLevel() * (save.opts.soundVol / 70)
    : 0.007 * (save.opts.soundVol / 70);
  try { jingleInto(c, c.destination, c.currentTime + 0.03, root, target / (JINGLE_UNIT_RMS[which] || 0.34), which); } catch (e) {}
}

/* The celebration sweeps sit at the loudness of the music, so a cleared board neither shouts over
   the piece nor gets lost in it. Measured: the music's average level is about 0.015 times its
   volume factor, and a sweep's is a sixth of its gain, so a gain of 0.09 times the music factor
   matches them; the sound slider still moves it, from its default of 70. With the music off the
   sweeps keep their usual level. */
const CELEBRATION_SFX = { clear: 1, win: 1, fanfare: 1 };
function sfxLevel(type) {
  const base = 0.06 * (save.opts.soundVol / 100);
  if (!CELEBRATION_SFX[type] || !save.opts.music || !save.opts.musicVol || !music) return base;
  return Math.max(0.0005, 0.09 * musicLevel() * (save.opts.soundVol / 70));
}
function sfx(type) {
  if (!save.sound || !save.opts || !save.opts.soundVol) return;
  try {
    if (!ensureAudio()) return;
    const cfg = { whoosh: [520, 900, 0.12, 'triangle'], bump: [200, 80, 0.2, 'square'], tick: [900, 700, 0.05, 'square'],
                  coin: [880, 1400, 0.16, 'sine'], win: [523, 1046, 0.4, 'triangle'], lose: [300, 110, 0.5, 'sawtooth'],
                  slide: [300, 500, 0.15, 'sine'], boom: [400, 800, 0.25, 'sine'],
                  beep: [1200, 1200, 0.08, 'square'], alarm: [880, 440, 0.35, 'sawtooth'],
                  clear: [660, 1760, 0.45, 'triangle'], chain: [700, 1500, 0.22, 'square'],
                  fanfare: [523, 1568, 0.6, 'triangle'], click: [1500, 1200, 0.04, 'sine'] }[type];
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = cfg[3]; o.connect(g); g.connect(actx.destination);
    const t = actx.currentTime;
    o.frequency.setValueAtTime(cfg[0], t); o.frequency.exponentialRampToValueAtTime(cfg[1], t + cfg[2]);
    g.gain.setValueAtTime(sfxLevel(type), t); g.gain.exponentialRampToValueAtTime(0.0001, t + cfg[2]);
    o.start(t); o.stop(t + cfg[2] + 0.03);
  } catch (e) {}
}

/* The only place the game asks for an advertisement. `placement` picks the AdMob unit (help,
   continue or double, see ads.js). The reward is paid only for a video watched to the end; any
   other outcome says why and calls `onBack`, which puts back the choice the player came from, so
   nothing is charged and nothing is left half open. The loading modal also holds the level
   timer, which does not run while a modal is showing. */
const AD_MESSAGES = {
  closed: 'The video was closed before the end, so there is no reward this time.',
  offline: 'Videos need an internet connection. Connect and try again, or pay with coins.',
  unavailable: 'No video is available right now. Please try again in a moment.'
};
/* The interstitial. It is the only advert in the game nobody chose, so it is held on a short
   lead: whichever comes first of five cleared levels and fifteen minutes, counted from the last
   one. It is never shown on a board, only in the moment between leaving one level and arriving at
   the next, never on top of a world opening, and never within a minute and a half of a rewarded
   video, because two adverts in a row is both rude and against AdMob's rules. It is preloaded and
   skipped outright when nothing is waiting: an advert the player did not ask for must never cost
   them a wait. */
const AD_GAP = 15 * 60 * 1000;
const AD_LEVELS = 5;
const AD_AFTER_VIDEO = 90 * 1000;
let lastRewardedAt = 0;
function interstitialDue() {
  if (!window.Ads || !Ads.isNative || !Ads.interstitialReady()) return false;
  if (document.hidden || !appActive) return false;
  /* A save that has never seen one, and a clock set forward, both start the fifteen minutes here.
     Without this a new player would meet an advert on the first level they finished, because time
     counted from zero has always passed. */
  if (!save.adSeenAt || save.adSeenAt > Date.now()) { save.adSeenAt = Date.now(); persist(); return false; }
  if (Date.now() - lastRewardedAt < AD_AFTER_VIDEO) return false;
  return (save.adClears || 0) >= AD_LEVELS || Date.now() - save.adSeenAt >= AD_GAP;
}
/* Runs `go` either straight away or once the advert has closed. */
function interstitialThen(go) {
  if (!interstitialDue()) { go(); return; }
  save.adClears = 0; save.adSeenAt = Date.now(); persist();
  audioHold.ad = true;
  if (actx && actx.state === 'running') try { actx.suspend(); } catch (e) {}
  Ads.interstitial().then(() => {
    audioHold.ad = false;
    if (actx && !audioHeld()) try { actx.resume(); } catch (e) {}
    go();
  });
}

/* The simulated video below keeps every path playable in the test harness (file://) and on a
   development server. The public website has no advertising at all, so a free simulated reward
   there would be a hole in the economy: no video is offered on it, and none can be shown. The
   Android WebView is served from https://localhost, so this never touches the app. */
const PUBLIC_WEB = /^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
function videosOffered() { return !!(window.Ads && Ads.isNative) || !PUBLIC_WEB; }

function showRewardedAd(placement, onReward, onBack) {
  lastRewardedAt = Date.now();                // no interstitial on the heels of a chosen video
  const back = () => { if (onBack) onBack(); else closeModal(); };
  if (!videosOffered()) { back(); toast(AD_MESSAGES.unavailable); return; }
  if (!window.Ads || !Ads.isNative) {
    /* a browser has no advertising: simulate one so every path stays playable and testable */
    openModal('<h3>Advertisement</h3><p>A simulated rewarded advertisement is playing.</p>', {});
    setTimeout(() => { closeModal(); onReward(); }, 1300);
    return;
  }
  openModal('<h3>Advertisement</h3><p>Loading a video&hellip;</p>', {});
  /* the video brings its own sound, so the music steps aside until it has finished */
  /* the video brings its own sound: the game's music and effects hold until it has finished */
  audioHold.ad = true;
  if (actx && actx.state === 'running') try { actx.suspend(); } catch (e) {}
  Ads.rewarded(placement).then(result => {
    audioHold.ad = false;
    if (actx && !audioHeld()) try { actx.resume(); } catch (e) {}
    if (result === 'rewarded') { closeModal(); onReward(); return; }
    back();
    toast(AD_MESSAGES[result] || AD_MESSAGES.unavailable);
  });
}

/* ---------- Board shapes (masks) ---------- */
/* Art is written as half rows: each row is mirrored, so shapes stay symmetric. */
function mir(rows) { return rows.map(r => r + r.split('').reverse().join('')); }
const SHAPE_ART = {
  house: mir(['.......', '......#', '.....##', '....###', '...####', '..#####', '.######', '#######',
              '.######', '.######', '.######', '.######', '.######', '.######', '.######', '.######']),
  tree: mir(['......#', '.....##', '....###', '...####', '..#####', '.######', '..#####', '.######',
             '#######', '..#####', '.....##', '.....##', '.....##', '.....##', '....###', '...####']),
  cat: mir(['#......', '##.....', '###....', '####...', '#####..', '######.', '#######', '#######',
            '#######', '.######', '..#####', '...####', '..#####', '.######', '#######', '##...##']),
  car: mir(['.......', '.......', '....###', '...####', '..#####', '.######', '#######', '#######',
            '#######', '#######', '.######', '..##..#', '..##..#', '..##..#', '.......', '.......']),
  bird: mir(['.......', '....###', '...####', '..#####', '.######', '#######', '#######', '#######',
             '.######', '..#####', '...####', '....###', '.....##', '.....##', '....###', '...####']),
  fish: mir(['.......', '...####', '..#####', '.######', '#######', '#######', '#######', '#######',
             '#######', '#######', '.######', '..#####', '...####', '.......']),
  rocket: mir(['......#', '.....##', '.....##', '....###', '....###', '....###', '...####', '..#####',
               '.######', '#######', '#######', '.######', '....###', '...#.##', '..##.##', '.###.##']),
  trophy: mir(['.######', '.######', '#######', '#######', '.######', '.######', '..#####', '...####',
               '....###', '.....##', '.....##', '.....##', '....###', '..#####', '.######', '.######']),
  castle: mir(['##..###', '##..###', '#######', '#######', '#######', '#######', '#######', '#######',
               '#######', '#######', '#######', '#######', '#######', '#######', '#######', '#######']),
  ghost: mir(['....###', '..#####', '.######', '#######', '#######', '#######', '#######', '#######',
              '#######', '#######', '#######', '#######', '#######', '###.###', '##...##', '#.....#']),
  robot: mir(['......#', '......#', '...####', '...####', '...####', '.######', '#######', '#######',
              '#######', '#######', '.######', '..#####', '...####', '...####', '..##..#', '..##..#']),
  butterfly: mir(['###....', '####...', '#####..', '######.', '#######', '#######', '######.', '#####..',
                  '######.', '#######', '#######', '######.', '#####..', '####...', '###....', '##.....']),
  mushroom: mir(['...####', '.######', '#######', '#######', '#######', '.######', '...####', '.....##',
                 '.....##', '.....##', '.....##', '.....##', '....###', '....###', '...####', '..#####']),
  boat: mir(['......#', '......#', '....###', '...####', '..#####', '.######', '#######', '......#',
             '......#', '#######', '#######', '#######', '.######', '..#####', '...####', '.......']),
  key: mir(['..#####', '.######', '#######', '#######', '#######', '.######', '..#####', '.....##',
            '.....##', '.....##', '..#..##', '.....##', '..#..##', '.....##', '.....##', '.....##']),
  rabbit: mir(['..##...', '..##...', '..##...', '..##...', '..###..', '.######', '.######', '.######',
               '..#####', '...####', '..#####', '.######', '#######', '#######', '.######', '..##.##']),
  turtle: mir(['.....##', '.....##', '##...##', '###.###', '.######', '..#####', '.######', '.######',
               '.######', '.######', '..#####', '.######', '###.###', '##...##', '......#']),
  crown: mir(['#.....#', '#.....#', '#..#..#', '##.##.#', '#######', '#######', '#######', '#######',
              '#######', '#######', '#######', '#######'])
};
const SHAPE_PARAM = ['circle', 'diamond', 'triangle', 'hexagon', 'heart', 'star', 'oval', 'cross'];

function paramInside(kind, u, v) {          // u, v in -1 .. 1
  switch (kind) {
    case 'circle': return u * u + v * v <= 0.98;
    case 'oval': return (u * u) / 0.72 + (v * v) / 1.0 <= 1;
    case 'diamond': return Math.abs(u) + Math.abs(v) <= 1.02;
    case 'triangle': return Math.abs(u) <= (v + 1) * 0.52;
    case 'hexagon': return Math.abs(u) <= 0.98 && Math.abs(u) * 0.55 + Math.abs(v) * 0.9 <= 1.0;
    case 'cross': return Math.abs(u) <= 0.36 || Math.abs(v) <= 0.36;
    case 'heart': {
      const x = u * 1.25, y = -v * 1.2 + 0.25;
      const a = x * x + y * y - 1;
      return a * a * a - x * x * y * y * y <= 0;
    }
    case 'star': {
      const r = Math.hypot(u, v * 1.02);
      if (r < 1e-6) return true;
      let ang = Math.atan2(v, u) + Math.PI / 2;
      const step = Math.PI * 2 / 5;
      ang = ((ang % step) + step) % step;
      const k = Math.cos(Math.PI / 5) / Math.cos(Math.abs(ang - step / 2) + Math.PI / 5 - step / 2);
      return r <= Math.min(1, k) * 1.0;
    }
    default: return true;
  }
}

function rawMask(shape, W, H) {
  const m = new Uint8Array(W * H);
  if (shape === 'rect') { m.fill(1); return m; }
  const art = SHAPE_ART[shape];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let on;
    if (art) {
      const ay = Math.min(art.length - 1, Math.floor((y + 0.5) / H * art.length));
      const ax = Math.min(art[0].length - 1, Math.floor((x + 0.5) / W * art[0].length));
      on = art[ay][ax] === '#';
    } else {
      on = paramInside(shape, (x + 0.5) / W * 2 - 1, (y + 0.5) / H * 2 - 1);
    }
    m[y * W + x] = on ? 1 : 0;
  }
  return m;
}

/* Keep the largest connected part, fill inner holes, remove single-cell spurs. */
function cleanMask(m, W, H) {
  const idx = (x, y) => y * W + x;
  const nb = (x, y) => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < W && b < H);
  // largest component
  const seen = new Int8Array(W * H);
  let best = null;
  for (let i = 0; i < W * H; i++) {
    if (!m[i] || seen[i]) continue;
    const comp = [i]; seen[i] = 1;
    for (let k = 0; k < comp.length; k++) {
      const c = comp[k], x = c % W, y = (c - x) / W;
      for (const [a, b] of nb(x, y)) { const j = idx(a, b); if (m[j] && !seen[j]) { seen[j] = 1; comp.push(j); } }
    }
    if (!best || comp.length > best.length) best = comp;
  }
  const out = new Uint8Array(W * H);
  if (!best) return out;
  best.forEach(i => out[i] = 1);
  // fill holes: outside cells are those reachable from the border through empty cells
  const outside = new Int8Array(W * H), q = [];
  for (let x = 0; x < W; x++) { for (const y of [0, H - 1]) { const i = idx(x, y); if (!out[i] && !outside[i]) { outside[i] = 1; q.push(i); } } }
  for (let y = 0; y < H; y++) { for (const x of [0, W - 1]) { const i = idx(x, y); if (!out[i] && !outside[i]) { outside[i] = 1; q.push(i); } } }
  for (let k = 0; k < q.length; k++) {
    const c = q[k], x = c % W, y = (c - x) / W;
    for (const [a, b] of nb(x, y)) { const j = idx(a, b); if (!out[j] && !outside[j]) { outside[j] = 1; q.push(j); } }
  }
  for (let i = 0; i < W * H; i++) if (!out[i] && !outside[i]) out[i] = 1;
  // remove spurs (cells with a single neighbour)
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!out[idx(x, y)]) continue;
      let n = 0;
      for (const [a, b] of nb(x, y)) if (out[idx(a, b)]) n++;
      if (n <= 1) { out[idx(x, y)] = 0; changed = true; }
    }
    if (!changed) break;
  }
  return out;
}

function buildMask(shape, W, H) {
  const m = cleanMask(rawMask(shape, W, H), W, H);
  let n = 0;
  for (let i = 0; i < m.length; i++) n += m[i];
  return { mask: m, cells: n };
}


/* =========================================================
   GAME ENGINE (shared by the generator, the solver and play)
   State S = { L, occ, arr, exits }
   occ: -1 empty, -2 tile (mirror or portal), otherwise arrow id
   ========================================================= */
function trace(S, a) {
  const L = S.L, W = L.W, H = L.H;
  const own = new Set(a.cells.map(c => c[1] * W + c[0]));
  let [x, y] = a.cells[a.cells.length - 1];
  let d = a.dir;
  const path = [], seen = new Set();
  for (let step = 0; step < 600; step++) {
    const nx = x + DIRS[d].x, ny = y + DIRS[d].y;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) return { ok: true, path, dir: d };
    const id = ny * W + nx, key = id * 4 + d;
    if (!L.mask[id]) {                       // gap inside the board: keep flying across it
      if (seen.has(key)) return { ok: false, loop: true, path, dir: d, by: -1 };
      seen.add(key);
      path.push({ x: nx, y: ny, gap: true });
      x = nx; y = ny;
      continue;
    }
    if (seen.has(key)) return { ok: false, loop: true, path, dir: d, by: -1 };
    seen.add(key);
    if (own.has(id)) return { ok: false, self: true, path, dir: d, by: a.id };
    const o = S.occ[id];
    if (o >= 0) return { ok: false, path, dir: d, by: o };
    const t = L.tiles.get(id);
    path.push({ x: nx, y: ny });
    x = nx; y = ny;
    if (t) {
      if (t.type === 'w') { path.pop(); return { ok: false, path, dir: d, by: -2 }; }
      if (t.type === 'm') d = MIRROR[t.m][d];
      else { x = t.to[0]; y = t.to[1]; path.push({ x, y, jump: true }); }
    }
  }
  return { ok: false, loop: true, path, dir: d, by: -1 };
}

/* Where a flight leaves the board: side (0 up, 1 right, 2 down, 3 left) and index along that side */
function exitSlot(a, tr) {
  const last = tr.path.length ? tr.path[tr.path.length - 1] : { x: a.cells[a.cells.length - 1][0], y: a.cells[a.cells.length - 1][1] };
  return last.x + ',' + last.y + ',' + tr.dir;
}
function gateColorAt(L, a, tr) {
  const g = L.gates.get(exitSlot(a, tr));
  return g === undefined ? -1 : g;
}
function lockedBy(S, id) {
  const L = S.L;
  if (L.arrows[id].kind !== 'lock') return -1;
  const k = L.keyOf[id];
  return (k !== undefined && !S.arr[k].gone) ? k : -1;
}

function revDir(cells, dir) {
  const n = cells.length;
  if (n === 1) return (dir + 2) % 4;
  return dirIndex(cells[n - 1][0] - cells[n - 2][0], cells[n - 1][1] - cells[n - 2][1]);
}

function makeState(L, designDirs) {
  const occ = new Int16Array(L.W * L.H).fill(-3);
  for (let i = 0; i < occ.length; i++) if (L.mask[i]) occ[i] = -1;
  for (const id of L.tiles.keys()) occ[id] = -2;
  const arr = L.arrows.map(a => {
    let dir = a.initDir;
    if (a.kind === 'design') dir = designDirs ? designDirs[a.id] : a.trueDir;
    return { id: a.id, cells: a.initCells.map(c => c.slice()), dir, gone: false, used: false, ev: 0 };
  });
  arr.forEach(a => a.cells.forEach(([x, y]) => occ[y * L.W + x] = a.id));
  return { L, occ, arr, exits: 0 };
}
function cloneS(S) {
  return { L: S.L, occ: S.occ.slice(), exits: S.exits,
           arr: S.arr.map(a => ({ id: a.id, cells: a.cells.slice(), dir: a.dir, gone: a.gone, used: a.used, ev: a.ev })) };
}

function canSlide(S, tr) {
  return !tr.self && !tr.loop && tr.path.length > 0 && tr.path.every(q => !S.L.tiles.has(q.y * S.L.W + q.x));
}

function doTap(S, id) {
  const L = S.L, W = L.W, a = S.arr[id], kind = L.arrows[id].kind;
  if (a.gone) return { type: 'none' };
  const lk = lockedBy(S, id);
  if (lk >= 0) return { type: 'locked', keyId: lk };
  const tr = trace(S, a);
  const old = { cells: a.cells, dir: a.dir };
  if (kind === 'boom' && !a.used) {
    if (!tr.ok) return { type: 'crash', tr, old };
    const rc = a.cells.slice().reverse();
    a.dir = revDir(rc, a.dir); a.cells = rc; a.used = true; a.ev++;
    return { type: 'boom', tr, old };
  }
  if (tr.ok) {
    const gc = L.arrows[id].gcol;
    if (gc != null && gateColorAt(L, a, tr) !== gc) return { type: 'gate', tr, old };
    a.cells.forEach(([x, y]) => S.occ[y * W + x] = -1);
    a.gone = true; a.ev++; S.exits++;
    return { type: 'exit', tr, old, fx: effects(S) };
  }
  if (kind === 'slide' && canSlide(S, tr)) {
    const chain = a.cells.concat(tr.path.map(q => [q.x, q.y]));
    const nc = chain.slice(chain.length - a.cells.length);
    a.cells.forEach(([x, y]) => S.occ[y * W + x] = -1);
    nc.forEach(([x, y]) => S.occ[y * W + x] = id);
    a.cells = nc; a.ev++;
    return { type: 'slide', tr, old, m: tr.path.length };
  }
  return { type: 'crash', tr, old };
}

function effects(S) {
  const L = S.L, W = L.W, H = L.H, fx = { rot: [], grow: [], fall: {} };
  for (const a of S.arr) if (!a.gone && L.arrows[a.id].kind === 'clock') { a.dir = (a.dir + 1) % 4; fx.rot.push(a.id); }
  for (const a of S.arr) {
    if (a.gone || L.arrows[a.id].kind !== 'hungry') continue;
    const h = a.cells[a.cells.length - 1];
    const nx = h[0] + DIRS[a.dir].x, ny = h[1] + DIRS[a.dir].y;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const i = ny * W + nx;
    if (S.occ[i] !== -1) continue;
    a.cells = a.cells.concat([[nx, ny]]); S.occ[i] = a.id; fx.grow.push(a.id);
  }
  if (L.gravity) fx.fall = settle(S);
  return fx;
}

function settle(S) {
  const L = S.L, W = L.W, H = L.H, falls = {};
  const list = S.arr.filter(a => !a.gone);
  const maxY = a => { let m = 0; for (const c of a.cells) if (c[1] > m) m = c[1]; return m; };
  let moved = true;
  while (moved) {
    moved = false;
    list.sort((p, q) => maxY(q) - maxY(p));
    for (const a of list) {
      let ok = true;
      for (const [x, y] of a.cells) {
        if (y + 1 >= H) { ok = false; break; }
        const o = S.occ[(y + 1) * W + x];
        if (o !== -1 && o !== a.id) { ok = false; break; }
      }
      if (!ok) continue;
      a.cells.forEach(([x, y]) => S.occ[y * W + x] = -1);
      a.cells = a.cells.map(([x, y]) => [x, y + 1]);
      a.cells.forEach(([x, y]) => S.occ[y * W + x] = a.id);
      falls[a.id] = (falls[a.id] || 0) + 1; moved = true;
    }
  }
  return falls;
}

function legalMoves(S) {
  const L = S.L, out = [];
  for (const a of S.arr) {
    if (a.gone) continue;
    if (lockedBy(S, a.id) >= 0) continue;
    const k = L.arrows[a.id].kind, tr = trace(S, a), gc = L.arrows[a.id].gcol;
    let type = null;
    if (k === 'boom' && !a.used) { if (tr.ok) type = 'boom'; }
    else if (tr.ok && (gc == null || gateColorAt(L, a, tr) === gc)) type = 'exit';
    else if (k === 'slide' && canSlide(S, tr)) type = 'slide';
    if (type) {
      const list = L.evIdx[a.id];
      out.push({ id: a.id, type, pr: list && list[a.ev] !== undefined ? list[a.ev] : 1e6 });
    }
  }
  return out.sort((p, q) => p.pr - q.pr);
}

/* Depth first search, guided by the stored solution. Used for hints. */
function solve(S0, budget) {
  let nodes = 0;
  const seen = new Set();
  const key = S => S.arr.map(a => a.gone ? 'x' : a.cells[0][0] + ',' + a.cells[0][1] + ',' + a.cells.length + ',' + a.dir + (a.used ? 'u' : '')).join(';');
  function rec(S) {
    if (S.arr.every(a => a.gone)) return [];
    if (++nodes > budget) return null;
    const k = key(S);
    if (seen.has(k)) return null;
    seen.add(k);
    for (const mv of legalMoves(S)) {
      const S2 = cloneS(S); doTap(S2, mv.id);
      const r = rec(S2);
      if (r) return [mv].concat(r);
      if (nodes > budget) return null;
    }
    return null;
  }
  return rec(S0);
}

/* =========================================================
   LEVEL GENERATION
   Standard boards: reverse construction. Arrows are placed in the
   reverse of their removal order, each with a clear flight path.
   Empty cells are then filled so the board is completely full.
   ========================================================= */
/* =========================================================
   LEVEL GENERATION
   Reverse construction inside a board mask. Arrows are placed in the
   reverse of their removal order, each with a clear flight path. Only a
   chosen number of arrows may reach the border directly, so at the start
   of the level just one or two arrows can escape.
   ========================================================= */
let genFail = {};
function failGen(r) { genFail[r] = (genFail[r] || 0) + 1; return null; }
function buildStandard(p, rng) {
  const { W, H, mask } = p, N = W * H;
  const ri = n => Math.floor(rng() * n);
  const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
  const occ = new Int16Array(N).fill(-3);                 // -3 outside the board
  for (let i = 0; i < N; i++) if (mask[i]) occ[i] = -1;
  const need = new Float64Array(N).fill(-1);
  const tiles = new Map();
  const cellList = [];
  for (let i = 0; i < N; i++) if (mask[i]) cellList.push(i);

  const nM = Math.round(cellList.length * p.mirrors);
  for (let k = 0, t = 0; k < nM && t < 800; t++) {
    const id = cellList[ri(cellList.length)];
    if (tiles.has(id)) continue;
    tiles.set(id, { type: 'm', m: rng() < 0.5 ? '/' : '\\' }); occ[id] = -2; k++;
  }
  for (let k = 0; k < p.portals; k++) {
    for (let t = 0; t < 300; t++) {
      const a = cellList[ri(cellList.length)], b = cellList[ri(cellList.length)];
      if (a === b || tiles.has(a) || tiles.has(b)) continue;
      const ax = a % W, ay = (a - ax) / W, bx = b % W, by = (b - bx) / W;
      if (Math.abs(ax - bx) + Math.abs(ay - by) < 5) continue;
      tiles.set(a, { type: 'p', to: [bx, by], pair: k });
      tiles.set(b, { type: 'p', to: [ax, ay], pair: k });
      occ[a] = occ[b] = -2; break;
    }
  }

  const S = { L: { W, H, tiles, mask }, occ };
  // Border-first: the ring of cells along the outline is kept for a final chain of
  // arrows that block each other, so the board opens with very few legal moves.
  const reserved = new Uint8Array(N);
  let ringPhase = false;
  if (p.borderFirst !== false && p.shape === 'rect') {
    const onEdge = i => {
      if (tiles.has(i)) return false;
      const x = i % W, y = (i - x) / W;
      for (const d of DIRS) {
        const nx = x + d.x, ny = y + d.y;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || !mask[ny * W + nx]) return true;
      }
      return false;
    };
    const edge = new Uint8Array(N);
    for (const i of cellList) if (onEdge(i)) edge[i] = 1;
    // Only straight runs of the outline are reserved; corners stay free so the
    // inside of a silhouette can still be filled.
    for (const i of cellList) {
      if (!edge[i]) continue;
      const x = i % W, y = (i - x) / W;
      const hor = x > 0 && x < W - 1 && edge[y * W + x - 1] && edge[y * W + x + 1];
      const ver = y > 0 && y < H - 1 && edge[(y - 1) * W + x] && edge[(y + 1) * W + x];
      if (hor || ver) reserved[i] = 1;
    }
  }
  const blocked = i => reserved[i] && !ringPhase;
  const arrows = [], slideEvents = [], sliders = [], special = new Set(), pending = [];
  let nextOrd = 0, openings = 0;
  // Arrows that reach the border directly are the only ones free at the start.
  // The quota stays closed until the generator runs out of other options, so the
  // openings end up belonging to the very last arrows placed (the first removed).
  const allowedOpenings = Math.max(6, Math.round(cellList.length / 16));
  // Arrows that reach the border directly are the only ones free at the start.
  // The generator prefers inward placements while it still has other options, and the
  // level chooser then keeps the candidate with the fewest first moves.
  let quota = Math.max(1, Math.round(cellList.length / 110));

  const freeNeighbours = (x, y) => {
    let n = 0;
    for (const d of DIRS) { const a = x + d.x, b = y + d.y; if (inB(a, b) && occ[b * W + a] === -1) n++; }
    return n;
  };

  function tryPlace(hx, hy, d, len, allowShort) {
    if (!inB(hx, hy) || occ[hy * W + hx] !== -1 || blocked(hy * W + hx)) return null;
    const tr = trace(S, { id: -9, cells: [[hx, hy]], dir: d });
    if (!tr.ok) return null;
    const pathIds = tr.path.map(q => q.y * W + q.x);
    const load = pathIds.filter(i => mask[i] && !tiles.has(i)).length;   // cells that will block this arrow at the start
    if (load === 0 && openings >= quota) return null;         // keep the number of first moves small
    const banned = new Set(pathIds);
    const body = [[hx, hy]], inPath = new Set([hy * W + hx]);
    let bd = (d + 2) % 4, cx = hx, cy = hy;
    for (let i = 1; i < len; i++) {
      const straight = bd, left = (bd + 3) % 4, right = (bd + 1) % 4;
      const turnFirst = rng() < p.bend;
      const cands = [];
      // the first cell behind the head must line up with the arrowhead
      for (const nd of (i === 1 ? [straight] : [straight, left, right])) {
        const nx = cx + DIRS[nd].x, ny = cy + DIRS[nd].y, id = ny * W + nx;
        if (!inB(nx, ny) || occ[id] !== -1 || blocked(id) || inPath.has(id) || banned.has(id)) continue;
        // hug walls and other arrows: prefer cells with few free neighbours, so bodies wrap around things
        let score = freeNeighbours(nx, ny) + rng() * 0.6;
        score += (nd === straight ? (turnFirst ? 0.8 : -0.8) : (turnFirst ? -0.4 : 0.4));
        cands.push({ nd, nx, ny, id, score });
      }
      if (!cands.length) break;
      cands.sort((a, b) => a.score - b.score);
      const c = cands[0];
      cx = c.nx; cy = c.ny; bd = c.nd; body.push([cx, cy]); inPath.add(c.id);
    }
    if (body.length < (allowShort ? 1 : Math.min(len, p.minLen))) return null;
    const cells = body.reverse();
    const id = arrows.length, ord = nextOrd++;
    const a = { id, ord, cells, dir: d, kind: 'n', ray: new Set(pathIds.filter(i => mask[i] && !tiles.has(i))), load,
                front: pathIds.length && mask[pathIds[0]] && !tiles.has(pathIds[0]) ? pathIds[0] : -1 };
    arrows.push(a);
    if (load === 0) openings++;
    cells.forEach(([x, y]) => occ[y * W + x] = id);
    for (const c of a.ray) if (need[c] < ord) need[c] = ord;
    for (let k = pending.length - 1; k >= 0; k--) {
      const s = pending[k];
      if (occ[s.front] === id) { pending.splice(k, 1); unslide(arrows[s.id], ord); }
    }
    return a;
  }

  function unslide(A, j) {
    const len = A.cells.length, [tx, ty] = A.cells[0];
    const fd = len > 1 ? [A.cells[1][0] - tx, A.cells[1][1] - ty] : [DIRS[A.dir].x, DIRS[A.dir].y];
    const [hx, hy] = A.cells[len - 1];
    let straight = 0;
    while (straight < len - 1) {
      const c = A.cells[len - 2 - straight];
      if (c[0] !== hx - DIRS[A.dir].x * (straight + 1) || c[1] !== hy - DIRS[A.dir].y * (straight + 1)) break;
      straight++;
    }
    const cap = len === 1 ? 1 : straight;
    if (!cap) { special.delete(A.id); return; }
    const target = 1 + ri(Math.min(cap, 3));
    const back = [];
    for (let s = 1; s <= target; s++) {
      const bx = tx - fd[0] * s, by = ty - fd[1] * s;
      if (!inB(bx, by) || occ[by * W + bx] !== -1 || blocked(by * W + bx)) break;
      back.push([bx, by]);
    }
    const m = back.length;
    if (!m) { special.delete(A.id); return; }
    const chain = back.reverse().concat(A.cells);
    const init = chain.slice(0, len);
    const freed = A.cells.slice(len - m);
    const freedIds = [];
    freed.forEach(([x, y]) => { const c = y * W + x; occ[c] = -1; freedIds.push(c); if (need[c] < j) need[c] = j; });
    init.forEach(([x, y]) => occ[y * W + x] = A.id);
    A.cells = init; A.kind = 'slide';
    slideEvents.push({ t: 'slide', id: A.id, key: j + 1e-9 });
    sliders.push({ i: A.ord, j, cells: freedIds });
  }

  function tryExtend(c) {
    const cx = c % W, cy = (c - cx) / W;
    const dirsByOrd = [0, 1, 2, 3].sort((p1, p2) => {
      const g = d => { const nx = cx + DIRS[d].x, ny = cy + DIRS[d].y;
        if (!inB(nx, ny)) return -Infinity;
        const o = occ[ny * W + nx];
        return o >= 0 ? arrows[o].ord : -Infinity; };
      return g(p2) - g(p1);
    });
    for (const d of dirsByOrd) {
      const nx = cx + DIRS[d].x, ny = cy + DIRS[d].y;
      if (!inB(nx, ny)) continue;
      const o = occ[ny * W + nx];
      if (o < 0) continue;
      const A = arrows[o];
      if (special.has(o) || A.kind !== 'n') continue;
      if (A.cells[0][0] !== nx || A.cells[0][1] !== ny) continue;
      if (A.ord <= need[c] || A.ray.has(c)) continue;
      if (blocked(c)) continue;
      if (A.cells.length >= p.maxLen + 4) continue;
      if (A.cells.length === 1 && (cx !== nx - DIRS[A.dir].x || cy !== ny - DIRS[A.dir].y)) continue;
      A.cells.unshift([cx, cy]); occ[c] = A.id;
      return true;
    }
    return false;
  }

  // An arrow may take a small detour (one or two cells) so that its body swallows leftover cells.
  function tryDetour(c) {
    const cx = c % W, cy = (c - cx) / W;
    const adj = (p1, p2) => Math.abs(p1[0] - p2[0]) + Math.abs(p1[1] - p2[1]) === 1;
    const usable = (A, cell) => {
      const id = cell[1] * W + cell[0];
      return inB(cell[0], cell[1]) && occ[id] === -1 && !blocked(id) && !A.ray.has(id) && A.ord > need[id];
    };
    const options = [];
    for (const d of DIRS) {
      const nx = cx + d.x, ny = cy + d.y;
      if (!inB(nx, ny)) continue;
      const o = occ[ny * W + nx];
      if (o < 0) continue;
      const A = arrows[o];
      if (special.has(o) || A.kind !== 'n') continue;
      if (!usable(A, [cx, cy])) continue;
      for (let i = 0; i + 2 < A.cells.length; i++) {      // never touch the segment that carries the head
        const p1 = A.cells[i], p2 = A.cells[i + 1];
        if (A.cells.length + 1 <= p.maxLen + 5 && adj(p1, [cx, cy]) && adj(p2, [cx, cy])) options.push({ A, i, cells: [[cx, cy]] });
        if (A.cells.length + 2 > p.maxLen + 5) continue;
        // two cell detour: p1 -> c -> c2 -> p2
        for (const e of DIRS) {
          const ex = cx + e.x, ey = cy + e.y, eid = ey * W + ex;
          if (!inB(ex, ey) || occ[eid] !== -1) continue;
          if (!usable(A, [ex, ey])) continue;
          if (adj(p1, [cx, cy]) && adj(p2, [ex, ey])) options.push({ A, i, cells: [[cx, cy], [ex, ey]] });
          if (adj(p2, [cx, cy]) && adj(p1, [ex, ey])) options.push({ A, i, cells: [[ex, ey], [cx, cy]] });
        }
      }
    }
    if (!options.length) return false;
    const o = options[ri(options.length)];
    o.A.cells.splice(o.i + 1, 0, ...o.cells);
    o.cells.forEach(([x, y]) => occ[y * W + x] = o.A.id);
    return true;
  }

  // An arrow may also grow forward into the first cell of its own flight path.
  function tryHeadExtend(c) {
    const cx = c % W, cy = (c - cx) / W;
    for (const d of shuffle([0, 1, 2, 3], rng)) {
      const hx = cx - DIRS[d].x, hy = cy - DIRS[d].y;
      if (!inB(hx, hy)) continue;
      const o = occ[hy * W + hx];
      if (o < 0) continue;
      const A = arrows[o];
      if (special.has(o) || A.kind !== 'n' || A.dir !== d) continue;
      const head = A.cells[A.cells.length - 1];
      if (head[0] !== hx || head[1] !== hy) continue;
      if (!A.ray.has(c) || need[c] > A.ord || blocked(c)) continue;
      const load = A.load - 1;
      if (load === 0 && openings >= quota) continue;
      if (A.cells.length >= p.maxLen + 4) continue;
      A.cells.push([cx, cy]); A.ray.delete(c); A.load = load;
      if (load === 0) openings++;
      occ[c] = A.id;
      return true;
    }
    return false;
  }

  function traceAll(c0, d) {
    let x = c0 % W, y = (c0 - x) / W;
    const empties = [], occs = new Set(), cellSet = new Set(), seen = new Set();
    for (let step = 0; step < 600; step++) {
      const nx = x + DIRS[d].x, ny = y + DIRS[d].y;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) return { empties, occs, cellSet };
      const id = ny * W + nx, key = id * 4 + d;
      if (seen.has(key) || id === c0) return null;
      seen.add(key);
      x = nx; y = ny;
      if (!mask[id]) continue;                      // gap inside the board
      const t = tiles.get(id);
      if (t) { if (t.type === 'm') d = MIRROR[t.m][d]; else { x = t.to[0]; y = t.to[1]; } continue; }
      cellSet.add(id);
      if (occ[id] >= 0) occs.add(occ[id]); else empties.push(id);
    }
    return null;
  }

  function tryInsert(c) {
    if (blocked(c)) return false;
    let bestOpt = null;
    for (const d of [0, 1, 2, 3]) {
      const r = traceAll(c, d);
      if (!r) continue;
      if (r.cellSet.size === 0 && openings >= quota) continue;
      const lo = need[c];
      let hi = Infinity;
      for (const o of r.occs) hi = Math.min(hi, arrows[o].ord);
      const top = hi === Infinity ? lo + 1 : hi;
      if (!(top > lo)) continue;
      const forb = [];
      for (const s of sliders) if (s.cells.some(cc => r.cellSet.has(cc))) forb.push([s.i, s.j + 1e-6]);
      let z;
      for (let k = 1; k <= 7 && z === undefined; k++) {
        const v = lo + (top - lo) * k / 8;
        if (forb.every(([a, b]) => !(v > a && v < b))) z = v;
      }
      if (z === undefined) continue;
      const width = (top - lo) + (r.cellSet.size > 0 ? 5 : 0) + rng();
      if (!bestOpt || width > bestOpt.width) bestOpt = { d, r, z, width };
    }
    if (!bestOpt) return false;
    const { d, r, z } = bestOpt;
    const id = arrows.length;
    arrows.push({ id, ord: z, cells: [[c % W, (c - c % W) / W]], dir: d, kind: 'n', ray: r.cellSet,
                  load: r.cellSet.size, front: -1 });
    if (r.cellSet.size === 0) openings++;
    occ[c] = id;
    for (const e of r.empties) if (need[e] < z) need[e] = z;
    return true;
  }

  const target = cellList.length - tiles.size;
  let filled = 0;
  let misses = 0;
  /* the budgets follow the size of the board, so very large boards still fill completely */
  const iterCap = Math.max(2500, cellList.length * 8), missCap = Math.max(400, cellList.length * 2);
  for (let t = 0; t < iterCap && filled < target * 0.85 && misses < missCap; t++) {
    const len = p.minLen + Math.floor(Math.pow(rng(), 0.7) * (p.maxLen - p.minLen + 1));
    // start where the board is tightest, so that no isolated holes are left behind
    let c = -1, bestFree = 9;
    for (let k = 0; k < 6; k++) {
      const cand = cellList[ri(cellList.length)];
      if (occ[cand] !== -1 || blocked(cand)) continue;
      const f = freeNeighbours(cand % W, (cand - cand % W) / W);
      if (f < bestFree) { bestFree = f; c = cand; }
    }
    if (c < 0) continue;
    let a = null;
    for (const d of shuffle([0, 1, 2, 3], rng)) {
      a = tryPlace(c % W, (c - c % W) / W, d, len, false);
      if (a) break;
    }
    if (!a) { misses++; continue; }
    misses = 0;
    filled += a.cells.length;
    if (p.sliders && sliders.length < p.sliders && pending.length < p.sliders * 3 && a.front >= 0 && rng() < 0.8) {
      special.add(a.id); pending.push({ id: a.id, front: a.front });
    }
  }
  for (let round = 0; round < 10; round++) {
    let progress = true;
    while (progress) {
      progress = false;
      const empties = [];
      for (const i of cellList) if (occ[i] === -1 && !blocked(i)) empties.push(i);
      if (!empties.length) break;
      shuffle(empties, rng);
      for (const c of empties) {
        if (occ[c] !== -1) continue;
        if (tryExtend(c)) { progress = true; continue; }
        if (tryHeadExtend(c)) { progress = true; continue; }
        if (tryDetour(c)) { progress = true; continue; }
        if (tryInsert(c)) { progress = true; continue; }
        const x = c % W, y = (c - x) / W;
        for (const d of shuffle([0, 1, 2, 3], rng)) {
          if (tryPlace(x, y, d, p.minLen + ri(p.maxLen), true)) { progress = true; break; }
        }
      }
    }
    let left = 0;
    for (const i of cellList) if (occ[i] === -1) left++;
    if (!left) break;
    if (quota >= allowedOpenings) break;
    quota += 1;                                  // release one more opening and keep filling
  }
  let walls = 0;
  let leftover = 0;
  for (const i of cellList) if (occ[i] === -1) leftover++;
  if (leftover) { genFail.leftSum = (genFail.leftSum || 0) + leftover; genFail.leftN = (genFail.leftN || 0) + 1; }
  // ---- ring phase: arrows along the outline, each blocked by the next one ----
  ringPhase = true;
  quota = p.openings;
  const ringCells = [];
  for (const i of cellList) if (reserved[i] && occ[i] === -1) ringCells.push(i);
  for (let round = 0; round < 6 && ringCells.some(i => occ[i] === -1); round++) {
    let progress = false;
    for (const c of shuffle(ringCells.slice(), rng)) {
      if (occ[c] !== -1) continue;
      const x = c % W, y = (c - x) / W;
      // prefer flying along the outline, so the ring becomes one long chain
      const along = shuffle([0, 1, 2, 3], rng).sort((d1, d2) => {
        const f = d => { const nx = x + DIRS[d].x, ny = y + DIRS[d].y;
          return (inB(nx, ny) && reserved[ny * W + nx]) ? 0 : 1; };
        return f(d1) - f(d2);
      });
      let ok = false;
      for (const d of along) {
        const len = 2 + ri(Math.max(2, Math.min(p.maxLen, 7)));
        if (tryPlace(x, y, d, len, true)) { ok = true; break; }
      }
      if (!ok) ok = tryExtend(c) || tryHeadExtend(c) || tryDetour(c) || tryInsert(c);
      if (ok) progress = true;
    }
    if (!progress) {
      if (quota >= p.openings + 12) break;
      quota++;                                   // allow one more opening and keep going
    }
  }
  // if the ring could not be completed, finish it with the ordinary fill
  for (let round = 0; round < (cellList.length > 400 ? 9 : 4); round++) {
    let left = [];
    for (const i of cellList) if (occ[i] === -1) left.push(i);
    if (!left.length) break;
    let progress = false;
    for (const c of shuffle(left, rng)) {
      if (occ[c] !== -1) continue;
      const x = c % W, y = (c - x) / W;
      if (tryExtend(c) || tryHeadExtend(c) || tryDetour(c) || tryInsert(c)) { progress = true; continue; }
      for (const d of shuffle([0, 1, 2, 3], rng)) if (tryPlace(x, y, d, p.minLen + ri(p.maxLen), true)) { progress = true; break; }
    }
    if (!progress) { if (quota > cellList.length) break; quota += 2; }
  }
  /* Final plug pass. A cell can only stay empty because filling it would add one more opening
     than the quota allows. On a large board that is the difference between a full board and no
     board at all, so the quota is lifted here and the leftover holes are plugged with short
     arrows. They are placed last, which means they are the first that may leave in play. */
  {
    let left = [];
    for (const i of cellList) if (occ[i] === -1) left.push(i);
    if (left.length) {
      quota = cellList.length;
      for (let round = 0; round < 3 && left.length; round++) {
        for (const c of shuffle(left, rng)) {
          if (occ[c] !== -1) continue;
          const x = c % W, y = (c - x) / W;
          if (tryExtend(c) || tryHeadExtend(c) || tryDetour(c) || tryInsert(c)) continue;
          for (const d of shuffle([0, 1, 2, 3], rng)) if (tryPlace(x, y, d, 1 + ri(3), true)) break;
        }
        left = [];
        for (const i of cellList) if (occ[i] === -1) left.push(i);
      }
    }
  }
  for (const i of cellList) {
    if (occ[i] !== -1) continue;
    if (need[i] >= 0) return failGen('notFull');      // an arrow must fly through this cell
    tiles.set(i, { type: 'w' }); occ[i] = -2; walls++;
    if (walls > Math.max(4, cellList.length * 0.05)) return failGen('walls');
  }
  if (openings < 1 || openings > allowedOpenings) return failGen('openings');
  if (p.sliders && sliders.length < Math.min(p.sliders, p.minSlides || 1)) return failGen('slides');
  for (const a of arrows) {                  // the arrowhead must continue the body
    const n = a.cells.length;
    if (n < 2) continue;
    const dx = a.cells[n - 1][0] - a.cells[n - 2][0], dy = a.cells[n - 1][1] - a.cells[n - 2][1];
    if (dirIndex(dx, dy) !== a.dir) return failGen('headDir');
  }
  const evs = arrows.map(a => ({ t: 'exit', id: a.id, key: a.ord })).concat(slideEvents);
  evs.sort((a, b) => b.key - a.key);
  return { W, H, mask, tiles, gravity: false, gates: new Map(), keyOf: {}, shape: p.shape,
           arrows: arrows.map(a => ({ id: a.id, kind: a.kind, initCells: a.cells, initDir: a.dir })),
           solution: evs.map(e => ({ t: e.t, id: e.id })) };
}

/* Gravity boards: columns are stacks. Down arrows are added at the
   bottom, up arrows on top, and sideways arrows at a height where the
   neighbouring columns are low enough for a clear flight. */
function buildGravity(p, rng) {
  const { W, H } = p;
  const ri = n => Math.floor(rng() * n);
  const cols = Array.from({ length: W }, () => []);
  const heights = new Array(W).fill(0);
  const pieces = [], events = [];
  let filled = 0;
  const maxLen = Math.min(p.maxLen, 5);
  for (let guard = 0; guard < 20000 && filled < W * H; guard++) {
    const c = ri(W);
    if (heights[c] >= H) continue;
    const room = H - heights[c];
    const roll = rng();
    let piece = null;
    if (roll < 0.4) {
      const d = rng() < 0.5 ? 1 : 3;
      let maxSide = 0;
      if (d === 1) for (let k = c + 1; k < W; k++) maxSide = Math.max(maxSide, heights[k]);
      else for (let k = 0; k < c; k++) maxSide = Math.max(maxSide, heights[k]);
      const bounds = [];
      let h = 0;
      for (let m = 0; m <= cols[c].length; m++) {
        if (h >= maxSide) bounds.push(m);
        if (m < cols[c].length) h += cols[c][m].len;
      }
      if (!bounds.length) continue;
      piece = { id: pieces.length, dir: d, len: 1, col: c };
      cols[c].splice(bounds[ri(bounds.length)], 0, piece);
    } else if (roll < 0.68) {
      piece = { id: pieces.length, dir: 2, len: 1 + ri(Math.min(maxLen, room)), col: c };
      cols[c].unshift(piece);
    } else {
      piece = { id: pieces.length, dir: 0, len: 1 + ri(Math.min(maxLen, room)), col: c };
      cols[c].push(piece);
    }
    pieces.push(piece); events.push({ t: 'exit', id: piece.id });
    heights[c] += piece.len; filled += piece.len;
  }
  if (filled < W * H) return null;
  const arrows = [];
  for (let c = 0; c < W; c++) {
    let y = H;
    for (const pc of cols[c]) {
      const ys = [];
      for (let k = 0; k < pc.len; k++) ys.push(y - pc.len + k);   // top to bottom
      y -= pc.len;
      let cells = ys.map(yy => [c, yy]);
      if (pc.dir === 0) cells = cells.reverse();                  // tail at bottom, head on top
      arrows[pc.id] = { id: pc.id, kind: 'n', initCells: cells, initDir: pc.dir };
    }
  }
  return { W, H, tiles: new Map(), gravity: true, arrows, solution: events.slice().reverse() };
}

function computeEvIdx(L) {
  L.evIdx = {};
  L.solution.forEach((ev, i) => { (L.evIdx[ev.id] = L.evIdx[ev.id] || []).push(i); });
}

function verify(L) {
  const S = makeState(L);
  for (const ev of L.solution) if (doTap(S, ev.id).type !== ev.t) return false;
  return S.arr.every(a => a.gone);
}

function postProcess(L, p, rng) {
  const ri = n => Math.floor(rng() * n);
  // Boomerangs: the return trip is added just before the final exit.
  if (p.boom > 0) {
    const cands = new Set(shuffle(L.arrows.filter(a => a.kind === 'n').map(a => a.id), rng).slice(0, p.boom * 5));
    const S = makeState(L);
    const sol = [];
    let made = 0;
    for (const ev of L.solution) {
      if (ev.t === 'exit' && made < p.boom && cands.has(ev.id)) {
        const a = S.arr[ev.id];
        const rc = a.cells.slice().reverse();
        const probe = { id: a.id, cells: rc, dir: revDir(rc, a.dir) };
        if (trace(S, probe).ok) {
          const A = L.arrows[ev.id];
          const ic = A.initCells.slice().reverse();
          A.initDir = revDir(ic, A.initDir); A.initCells = ic; A.kind = 'boom';
          a.cells = probe.cells; a.dir = probe.dir;
          sol.push({ t: 'boom', id: ev.id });
          doTap(S, ev.id);
          made++;
        }
      }
      sol.push(ev);
      if (doTap(S, ev.id).type !== ev.t) return false;
    }
    L.solution = sol;
  }
  // Clockwork arrows: start rotated back by the number of exits before them.
  if (p.clock > 0) {
    const before = {};
    let n = 0;
    for (const ev of L.solution) if (ev.t === 'exit') before[ev.id] = n++;
    const cands = shuffle(L.arrows.filter(a => a.kind === 'n' && a.initCells.length === 1 && before[a.id] % 4 !== 0), rng);
    for (const A of cands.slice(0, p.clock)) { A.kind = 'clock'; A.initDir = (A.initDir - (before[A.id] % 4) + 4) % 4; }
  }
  // Design tiles: the player chooses the direction.
  if (p.design > 0) {
    const cands = shuffle(L.arrows.filter(a => a.kind === 'n' && a.initCells.length === 1), rng);
    for (const A of cands.slice(0, p.design)) { A.kind = 'design'; A.trueDir = A.initDir; A.initDir = (A.trueDir + 1 + ri(3)) % 4; }
  }
  // Key and padlock pairs (Castle): the key always leaves before the padlocked arrow.
  L.keyOf = {};
  if (p.keys > 0) {
    const order = {};
    L.solution.forEach((ev, i) => { if (ev.t === 'exit') order[ev.id] = i; });
    const plain = shuffle(L.arrows.filter(a => a.kind === 'n' && order[a.id] !== undefined), rng);
    const letters = 'ABCDEFGH';
    const used = new Set();
    let made = 0;
    for (const K of plain) {
      if (made >= p.keys) break;
      if (used.has(K.id)) continue;
      const cand = plain.filter(A => !used.has(A.id) && A.id !== K.id && order[A.id] > order[K.id] + 2);
      if (!cand.length) continue;
      const Lk = cand[Math.floor(rng() * cand.length)];
      K.kind = 'key'; Lk.kind = 'lock'; K.pair = Lk.pair = letters[made];
      L.keyOf[Lk.id] = K.id;
      used.add(K.id); used.add(Lk.id); made++;
    }
  }
  // Hungry arrows: keep only those that still allow the solution.
  if (p.hungry > 0) {
    const cands = shuffle(L.arrows.filter(a => a.kind === 'n'), rng);
    let made = 0, tries = 0;
    for (const A of cands) {
      if (made >= p.hungry || tries++ > p.hungry * 6) break;
      A.kind = 'hungry';
      if (verify(L)) made++; else A.kind = 'n';
    }
  }
  // Coloured gates: gates are opened where the chosen arrows leave in the intended solution.
  L.gates = new Map();
  if (p.gates > 0) {
    const S = makeState(L);
    const info = [];
    const tricky = ['clock', 'boom', 'slide', 'hungry', 'design'];
    for (const ev of L.solution) {
      const a = S.arr[ev.id];
      if (ev.t === 'exit') {
        const tr = trace(S, a);
        if (tr.ok) info.push({ id: ev.id, slot: exitSlot(a, tr),
          tricky: tricky.includes(L.arrows[ev.id].kind) || tr.path.some(q => L.tiles.has(q.y * L.W + q.x)) });
      }
      doTap(S, ev.id);
    }
    const nCol = Math.min(GATE_COLORS.length, 1 + Math.floor(p.gates / 3));
    const pick = shuffle(info.filter(x => x.tricky), rng).concat(shuffle(info.filter(x => !x.tricky), rng)).slice(0, p.gates);
    let next = 0;
    for (const x of pick) {
      let col = L.gates.get(x.slot);
      if (col === undefined) { col = next % nCol; next++; L.gates.set(x.slot, col); }
      L.arrows[x.id].gcol = col;
    }
    const border = [];
    for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
      if (!L.mask[y * L.W + x]) continue;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d].x, ny = y + DIRS[d].y;
        if (nx < 0 || ny < 0 || nx >= L.W || ny >= L.H || !L.mask[ny * L.W + nx]) border.push(x + ',' + y + ',' + d);
      }
    }
    const decoys = Math.min(5, 1 + Math.floor(p.gates / 3));
    for (let i = 0, t = 0; i < decoys && t < 120 && border.length; t++) {
      const slot = border[Math.floor(rng() * border.length)];
      if (L.gates.has(slot)) continue;
      L.gates.set(slot, Math.floor(rng() * nCol)); i++;
    }
  }
  return true;
}

/* Quality measures used to pick the best candidate level. */
function levelMetrics(L) {
  const S = makeState(L);
  let steps = 0, sumMoves = 0, minMoves = Infinity;
  const first = legalMoves(S).length;
  for (const ev of L.solution) {
    const n = legalMoves(S).length;
    sumMoves += n; if (n < minMoves) minMoves = n;
    steps++;
    doTap(S, ev.id);
  }
  const lens = L.arrows.map(a => a.initCells.length);
  const avgLen = lens.reduce((a, b) => a + b, 0) / lens.length;
  const shortShare = lens.filter(x => x <= 2).length / lens.length;
  let turns = 0;
  for (const a of L.arrows) {
    const c = a.initCells;
    for (let i = 2; i < c.length; i++) {
      const d1 = dirIndex(c[i - 1][0] - c[i - 2][0], c[i - 1][1] - c[i - 2][1]);
      const d2 = dirIndex(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]);
      if (d1 !== d2) turns++;
    }
  }
  return { first, avgMoves: sumMoves / Math.max(1, steps), minMoves, avgLen,
           maxLen: Math.max.apply(null, lens), shortShare, turns: turns / L.arrows.length, steps };
}
function levelQuality(m) {
  return m.avgLen * 1.2 + m.turns * 0.9 - m.shortShare * 7 - m.avgMoves * 0.7 - m.first * 1.5;
}

/* Time limit: shorter as the game progresses, with extra thinking time for mechanics. */
function timeLimit(L, w, l) {
  const n = L.arrows.length, k = {};
  L.arrows.forEach(a => { k[a.kind] = (k[a.kind] || 0) + 1; if (a.gcol != null) k.gate = (k.gate || 0) + 1; });
  const cells = L.arrows.reduce((s, a) => s + a.initCells.length, 0);
  const slides = L.solution.filter(e => e.t === 'slide').length;
  /* Version 0.8 runs on a tighter clock than 0.7: roughly a quarter less time on every board. */
  const per = l === 0 ? 2.2 : Math.max(0.8, 1.8 - 0.08 * w - 0.03 * l);
  let t = 6 + n * per + cells * 0.07 + (k.clock || 0) * 1.2 + (k.boom || 0) * 1.1 + slides * 1.5
        + (k.hungry || 0) * 0.8 + (k.design || 0) * 1.8 + (k.gate || 0) * 0.9
        + ((k.lock || 0) + (k.key || 0)) * 0.6 + L.tiles.size * 0.35;
  if (l === 0) t += 10;
  t *= (L.timeFactor || 1);
  return Math.ceil(t / 5) * 5;
}

const maskCache = new Map();
function maskFor(shape, W, H) {
  const key = shape + ':' + W + ':' + H;
  if (!maskCache.has(key)) maskCache.set(key, buildMask(shape, W, H));
  return maskCache.get(key);
}

/* The daily and the weekly are played on a wider board than any campaign level, with a higher
   minimum arrow length so that the extra room is spent on arrows worth reading rather than on
   more of the one and two cell plugs. The minimum cannot be pushed much further: the board has
   to end up completely full, and every long arrow laid down leaves small pockets behind it that
   only a short arrow can fill, so asking for five makes a board that is half short arrows and
   takes twenty times as long to build. Four is where that turns. */
function denseBoard(W) {
  return p => {
    p.maxW = W; p.W = W; p.H = Math.round(W * 1.33);
    p.minLen = Math.max(p.minLen, 4);
    p.maxLen = Math.max(p.maxLen, 12);
    p.quick = true;                  // a bounded search: the player is waiting for this one
    return p;
  };
}

/* One puzzle per day, generated from the date so that it is the same for everyone. */
function generateDaily() {
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const key = 'daily-' + seed;
  if (levelCache.has(key)) return levelCache.get(key);
  const w = seed % reachedFor('d' + seed), l = 5 + (seed % 12);
  const saved = levelCache.get(w + '-' + l);
  levelCache.delete(w + '-' + l);
  const L = generateLevel(w, l, seed, denseBoard(24));
  levelCache.delete(w + '-' + l);
  if (saved) levelCache.set(w + '-' + l, saved);
  L.daily = true;
  levelCache.set(key, L);
  return L;
}

/* One enormous board per calendar month. It is the same board for the whole month and for every
   player at the same point in the campaign: it comes from the year, the month and the worlds
   the player has opened. */
const MONTH_SHAPES = ['crown', 'castle', 'butterfly', 'tree', 'ghost', 'rocket', 'fish', 'cat', 'mushroom', 'boat', 'robot', 'trophy'];
function monthKey(d) { d = d || new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1); }
function monthName(d) {
  d = d || new Date();
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
          'October', 'November', 'December'][d.getMonth()] + ' ' + d.getFullYear();
}
function generateMonthly() {
  const d = new Date();
  const seed = d.getFullYear() * 100 + (d.getMonth() + 1);
  const key = 'month-' + seed;
  if (levelCache.has(key)) return levelCache.get(key);
  const w = (d.getMonth() + 3) % reachedFor('m' + seed), l = 14;
  const saved = levelCache.get(w + '-' + l);
  levelCache.delete(w + '-' + l);
  const L = generateLevel(w, l, seed * 7 + 1, p => {
    /* a rectangle, because it is the only board that fills reliably at this size */
    p.shape = 'rect'; p.maxW = CFG.monthlyW; p.W = CFG.monthlyW; p.H = Math.round(CFG.monthlyW * 1.21);
    /* Longer arrows on a wider board: about a hundred and seventy arrows of six and a half cells
       rather than a hundred and seventy five of five. */
    p.minLen = 3; p.maxLen = 14;
    p.quick = true;
    p.openings = 4;
    p.boss = false; p.breather = false;
  });
  levelCache.delete(w + '-' + l);
  if (saved) levelCache.set(w + '-' + l, saved);
  L.monthly = true;
  L.lives = CFG.monthlyLives;
  levelCache.set(key, L);
  return L;
}

const levelCache = new Map();

/* ---------- shipped campaign boards ----------
   The generator is fully seeded, so a campaign level is the same board on every device: the same
   200 boards were being rebuilt from nothing on every phone in the world. They are now built once
   at release by tools/build-levels.js and shipped in www/levels.js, which is a plain script
   rather than data fetched at runtime, because the test harness opens the page over file:// where
   a fetch is refused.

   A level is not plain data. tiles and gates are Maps, every arrow carries a ray Set and the mask
   is a typed array, and all three vanish without a word under JSON. These two functions are the
   one description of how a board is written down, used by the build and by the game alike, so the
   two cannot drift apart. The build round trips every board through them and replays its solution
   with verify() before writing anything, so a board that would not survive the journey fails the
   release rather than a player. */
function packLevel(L) {
  return JSON.parse(JSON.stringify(L, (k, v) => {
    if (v instanceof Map) return { $m: [...v] };
    if (v instanceof Set) return { $s: [...v] };
    if (ArrayBuffer.isView(v)) return { $t: v.constructor.name, d: Array.from(v) };
    return v;
  }));
}
function unpackLevel(o) {
  const walk = v => {
    if (!v || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(walk);
    if (v.$m) return new Map(v.$m.map(([a, b]) => [walk(a), walk(b)]));
    if (v.$s) return new Set(v.$s.map(walk));
    if (v.$t) return new (window[v.$t] || Array)(v.d);
    const out = {};
    for (const k in v) out[k] = walk(v[k]);
    return out;
  };
  return walk(o);
}
/* A shipped board, unpacked once and then kept like any other. Skipped whenever the caller is
   asking for something other than the campaign board: a salt, a tweak, or the testing helper. */
function prebuilt(w, l) {
  const src = window.__LEVELS;
  if (!src) return null;
  const o = src[w + '-' + l];
  return o ? unpackLevel(o) : null;
}
/* The first generation of a session pays for a cold engine on top of the level itself, which
   is why the first board a player opens costs about two seconds where the same world averages a
   fraction of that. Building it while the home screen is being read moves that cost to a moment
   nobody is waiting through, and generateLevel already keeps what it builds.

   Only on the home screen, and once. Generation is synchronous, so doing this during a level
   would block the board and the clock for longer than the wait it saves, and repeating it on
   every return to the menu would trade a wait nobody notices for a menu that keeps locking up. */
/* Where Continue takes the player: the level last played if it is still unfinished, otherwise
   the next unfinished level after it, in that world and then in the worlds that follow. */
function continueTarget() {
  const lp = save.lastPlayed;
  if (!lp || !isLevelUnlocked(lp.w, lp.l)) return null;
  if (!save.progress[lp.w + '-' + lp.l]) return { w: lp.w, l: lp.l };
  for (let w = lp.w; w < WORLDS.length; w++) {
    if (!isWorldUnlocked(w)) break;
    for (let l = w === lp.w ? lp.l + 1 : 0; l < CFG.levelsPerWorld; l++) {
      if (!save.progress[w + '-' + l] && isLevelUnlocked(w, l)) return { w, l };
    }
  }
  return { w: lp.w, l: lp.l };
}
function warmTarget() { return continueTarget() || { w: 0, l: 0 }; }
let warmed = false;
function warmLevel() {
  if (warmed || G || currentScreen !== 's-home') return false;
  warmed = true;
  const t = warmTarget();
  try { generateLevel(t.w, t.l); return true; } catch (e) { return false; }
}
function scheduleWarm() {
  idle(() => warmLevel());
}
function idle(run) {
  if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 700);
}
/* The result modal is up, the board is finished and the clock is stopped, so this is the one
   moment during a level when a blocked second costs the player nothing. Building the next board
   here is what keeps ordinary progression from ever waiting. */
function warmNext(w, l) {
  idle(() => { if (!levelCache.has(w + '-' + l)) { try { generateLevel(w, l); } catch (e) {} } });
}
function generateLevelWith(w, l, tweak) {   // testing helper
  const saved = levelCache.get(w + '-' + l);
  levelCache.delete(w + '-' + l);
  const origParams = params;
  try { window.__tweak = tweak; return generateLevel(w, l); }
  finally { window.__tweak = null; levelCache.delete(w + '-' + l); if (saved) levelCache.set(w + '-' + l, saved); }
}
function generateLevel(w, l, salt, tweak) {
  const ck = w + '-' + l;
  if (!salt && levelCache.has(ck)) return levelCache.get(ck);
  if (!salt && !tweak && !(typeof window !== 'undefined' && window.__tweak)) {
    const pre = prebuilt(w, l);
    if (pre) { levelCache.set(ck, pre); return pre; }
  }
  let p = params(w, l);
  if (tweak) tweak(p);
  if (typeof window !== 'undefined' && window.__tweak) p = window.__tweak(p);
  // keep the playable area similar for every shape by enlarging the grid of thin silhouettes
  let m = maskFor(p.shape, p.W, p.H);
  const ratio = m.cells / (p.W * p.H);
  if (ratio < 0.9) {
    p.W = Math.min(p.maxW || 19, Math.round(p.W / Math.sqrt(Math.max(0.45, ratio))));
    p.H = Math.round(p.W * 1.33);
    m = maskFor(p.shape, p.W, p.H);
  }
  p.mask = m.mask;
  let best = null, found = 0;
  /* A board the size of the monthly one is built while the player waits, and the search below is
     what costs the time: on a large board with long arrows most candidates carry more one and two
     cell plugs than the quality gate allows, and the gate can reject seven hundred of them in a
     row. So a quick board is given a fixed budget instead, keeps the best it finds rather than
     the first, and stops early once a board is good enough. The wait is then bounded at a second
     or two rather than reaching a minute on the worlds with the most mechanics. */
  const maxTries = p.quick ? 100 : 800;
  for (let attempt = 0; attempt < maxTries && found < (p.quick ? maxTries : 4); attempt++) {
    const rng = mulberry32((w + 1) * 7919 + l * 104729 + attempt * 31337 + 24601 + (salt || 0) * 7717);
    const L = buildStandard(p, rng);
    if (!L) continue;
    L.w = w; L.l = l;
    if (!postProcess(L, p, rng)) { failGen('post'); continue; }
    computeEvIdx(L);
    if (!verify(L)) { failGen('verify'); continue; }
    const cells = L.arrows.reduce((s2, a) => s2 + a.initCells.length, 0);
    const allowFirst = p.forceFirst ? p.forceFirst : Math.max(p.openings + 2, Math.round(cells / 18));
    const firstMoves = legalMoves(makeState(L)).length;
    if (firstMoves < 1 || firstMoves > allowFirst) { failGen('first'); continue; }
    L.metrics = levelMetrics(L);
    if (!p.tut && !p.quick && L.metrics.shortShare > 0.34) { failGen('short'); continue; }
    L.quality = levelQuality(L.metrics);
    found++;
    /* A quick board is judged on the one thing the general score barely weighs and the player
       sees at once: how much of the board is one and two cell plugs. The ordinary score is led
       by the number of opening moves, which on a board of two hundred arrows swamps everything
       else and would hand back the plug-ridden candidate. */
    if (p.quick) { if (!best || L.metrics.shortShare < best.metrics.shortShare) best = L; }
    else if (!best || L.quality > best.quality) best = L;
    if (p.quick && L.metrics.shortShare < 0.30) break;
    if (L.metrics.first <= p.openings + 1 && L.metrics.shortShare < 0.22) break;
  }
  if (!best) {                     // fallback: relax the checks, then fall back to a plain board
    for (const relax of [1, 2, 3]) {
      const rp = Object.assign({}, p);
      rp.borderFirst = false;                              // the plain generator is the safety net
      if (relax >= 2) { rp.shape = 'rect'; const mm = maskFor('rect', rp.W, rp.H); rp.mask = mm.mask; }
      if (relax === 3) {                                   // last resort: a smaller plain board
        rp.W = Math.max(8, rp.W - 3); rp.H = Math.round(rp.W * 1.33);
        const mm = maskFor('rect', rp.W, rp.H); rp.mask = mm.mask;
      }
      for (let attempt = 0; attempt < 400 && !best; attempt++) {
        const rng = mulberry32((w + 1) * 5153 + l * 7717 + attempt * 6151 + relax * 999);
        const L = buildStandard(rp, rng);
        if (!L) continue;
        L.w = w; L.l = l;
        if (!postProcess(L, rp, rng)) continue;
        computeEvIdx(L);
        if (!verify(L)) continue;
        L.metrics = levelMetrics(L);
        if (L.metrics.first < 1) continue;
        L.quality = levelQuality(L.metrics);
        best = L;
      }
      if (best) break;
    }
  }
  if (!best) throw new Error('Level generation failed for world ' + w + ' level ' + l);
  best.timeFactor = p.timeFactor || 1;
  best.timeLimit = timeLimit(best, w, l);
  best.lives = p.lives;
  if (!salt && !tweak) levelCache.set(ck, best);
  return best;
}

/* =========================================================
   SCREENS
   ========================================================= */
let currentScreen = 's-home';
function showScreen(id) {
  poke();
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  currentScreen = id;
  updateCoins();
  if (id === 's-home') renderHome();
  if (id === 's-worlds') renderWorlds();
  if (id === 's-levels') renderLevels();
  if (id === 's-settings') renderSettings();
  if (id === 's-badges') renderBadges();
  if (id === 's-trophies') renderTrophies();
  if (id === 's-monthly') renderMonthly();
  $('#quickPanel').classList.add('hidden');
  if (id === 's-weekly') renderWeekly();
  if (id === 's-secrets') renderSecrets();
  /* the music keeps playing on the menus, the piece of the last world visited */
  if (save.opts.music) { if (id !== 's-game') musicStart(musicWorld); } else musicStop();
  if (id === 's-game') requestAnimationFrame(resize);
  tintBars();
}
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => showScreen(b.dataset.go)));

function renderHome() {
  $('#testBadge').style.display = save.testMode ? '' : 'none';
  const d = save.daily || (save.daily = {});
  const done = d.done === dailyKey();
  $('#btnDaily').disabled = done;
  const tried = !done && d.tried === dailyKey();
  const streak = liveStreak();
  $('#dailyText').innerHTML = (done ? 'Done for today &#10003;' : tried ? 'Attempt used today' : 'One attempt') + (streak ? ` &middot; &#128293; ${streak}` : '');
  const ms = monthlyState();
  $('#monthlyText').innerHTML = ms.done ? 'Done this month &#10003;' : monthName();
  const lp = continueTarget();
  const cont = $('#btnContinue');
  if (lp) {
    cont.style.display = '';
    cont.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-play"/></svg>Continue: ${WORLDS[lp.w].name} ${lp.l + 1}`;
    cont.onclick = () => startLevel(lp.w, lp.l);
  } else cont.style.display = 'none';
  const allStars = WORLDS.reduce((n, _, w) => n + worldStatus(w).stars, 0);
  const openWorlds = WORLDS.filter((_, w) => isWorldUnlocked(w)).length;
  $('#worldsSub').textContent = allStars + ' of ' + WORLDS.length * CFG.levelsPerWorld * 3 + ' stars · ' +
    openWorlds + ' of ' + WORLDS.length + ' worlds open';
  const lang = LANGUAGES[save.opts.lang] || LANGUAGES.en;
  $('#langFlag').textContent = lang.flag;
  $('#langCode').textContent = (save.opts.lang || 'en').toUpperCase();
  $('#btnAdPrivacy').style.display = window.Ads && Ads.isNative && Ads.privacyOptionsRequired ? '' : 'none';
}
$('#btnPlay').onclick = () => showScreen('s-worlds');
/* The language sits beside Settings on the home screen, as a flag and its two letters. */
$('#btnLang').onclick = () => {
  haptic('tap');
  const cur = save.opts.lang || 'en';
  const acts = { no: closeModal };
  Object.keys(LANGUAGES).forEach(k => acts['l_' + k] = () => {
    save.opts.lang = k; persist(); closeModal(); sfx('click'); renderHome();
    toast(k === 'en' ? 'Language set to English.'
      : LANGUAGES[k].native + ' selected. The translation is not in the game yet, so the text stays in English.');
  });
  openModal('<h3>Language</h3><div class="langList">' +
    Object.keys(LANGUAGES).map(k => `<button class="langItem${k === cur ? ' on' : ''}" data-act="l_${k}">
      <span class="flag">${LANGUAGES[k].flag}</span><span><b>${LANGUAGES[k].native}</b><small>${LANGUAGES[k].name}</small></span></button>`).join('') +
    '</div><div class="stack"><button class="btn" data-act="no">Close</button></div>', acts);
};

/* the footer of the home screen: rating and privacy, moved out of Settings */
$('#btnRate').onclick = () => { haptic('tap'); openRating(); };
$('#btnPolicy').onclick = () => { haptic('tap'); showScreen('s-privacy'); };

/* Handing the game on. Android's own share sheet does the work and reports nothing back, not even
   whether anything was sent, which is exactly why nothing is paid for pressing this. In a browser,
   and in the test harness, there is no plugin: the Web Share API is used where it exists and the
   line is copied to the clipboard otherwise, so the button always does something. */
const SHARE_URL = 'https://play.google.com/store/apps/details?id=eu.fablestudio.arrowescape';
const SHARE_TEXT = 'A board full of arrows, and only one of them can leave. Find the order, and every '
  + 'escape opens the way for the next. Ten worlds, two hundred boards, and it plays offline.';
function shareGame() {
  const data = { title: 'Arrow Escape', text: SHARE_TEXT, url: SHARE_URL };
  const S = nativePlugin('Share');
  /* closing the sheet without choosing anything rejects, which is not a failure */
  if (S) { S.share(Object.assign({ dialogTitle: 'Share Arrow Escape' }, data)).catch(() => {}); return; }
  if (navigator.share) { navigator.share(data).catch(() => {}); return; }
  const line = SHARE_TEXT + ' ' + SHARE_URL;
  if (navigator.clipboard) navigator.clipboard.writeText(line).then(() => toast('Link copied.'), () => toast(SHARE_URL));
  else toast(SHARE_URL);
}
$('#btnShare').onclick = () => { haptic('tap'); shareGame(); };
$('#btnAdPrivacy').onclick = () => {
  haptic('tap');
  Ads.showPrivacyOptions().then(ok => { if (ok) toast('Your advertising choices are saved.'); });
};
$('#btnSettings').onclick = () => showScreen('s-settings');
$('#btnHow').onclick = () => showRules(-1);
$('#btnBadges').onclick = () => showScreen('s-badges');
$('#btnTrophies').onclick = () => showScreen('s-trophies');
$('#btnQuick').onclick = () => { $('#quickPanel').classList.contains('hidden') ? openQuick() : closeQuick(); };
$('#qBack').onclick = closeQuick;
$('#btnMonthly').onclick = () => showScreen('s-monthly');
$('#btnWeekly').onclick = () => { if (clockTurnedBack()) { clockNote(); return; } showScreen('s-weekly'); };
$('#btnSecrets').onclick = () => showScreen('s-secrets');
$('#btnDaily').onclick = () => {
  const d = save.daily || (save.daily = {});
  const note = (title, text) => openModal(`<div class="medal"><span class="medalIcon"><svg class="ic" aria-hidden="true"><use href="#i-daily"/></svg></span></div><h3>${title}</h3><p>${text}</p>
    <div class="stack"><button class="btn primary" data-act="ok">OK</button></div>`, { ok: closeModal });
  if (clockTurnedBack()) { clockNote(); return; }
  if (d.done === dailyKey()) { note('Today\'s Escape is done', 'You cleared today\'s board. A new one arrives tomorrow.'); return; }
  if (d.tried === dailyKey()) { note('Today\'s attempt is used', 'Each daily board has one attempt, and today\'s has been played. A new board arrives tomorrow.'); return; }
  /* One attempt, and the player agrees to it before seeing the board: the board is only built
     once Start is pressed, Start spends the attempt, and the clock runs from that moment. Not now
     spends nothing. The attempt includes one continue; there is no restart and no retry. */
  const streak = liveStreak();
  openModal(`<div class="medal"><span class="medalIcon"><svg class="ic" aria-hidden="true"><use href="#i-daily"/></svg></span></div><h3>Today's Escape</h3>
    <p>One attempt, with one continue. The attempt begins and the clock starts as soon as you press Start.</p>
    ${streak ? `<p style="font-size:13px">&#128293; Your streak is ${streak} day${streak > 1 ? 's' : ''}. Clear today's board to keep it going.</p>` : ''}
    <div class="stack"><button class="btn primary big" data-act="go">Start</button>
    <button class="btn" data-act="no">Not now</button></div>`, {
    no: closeModal,
    go: () => {
      closeModal();
      startLevel(0, 0, false, { kind: 'daily', onReady: () => {
        if (!G || !G.daily) return;               // the board could not be built: nothing is spent
        G.started = true; G.attemptSpent = true; lastFrame = performance.now();
        spendDailyAttempt(); updateTimer();
      } });
    }
  });
};

let selWorld = 0;
function starsHtml(n) { return '&#9733;'.repeat(n) + '<span class="off">' + '&#9733;'.repeat(3 - n) + '</span>'; }
/* Each world's emblem gets its own shape and a two colour wash, so the list is read by colour
   and silhouette before a single word is read. */
const EMBLEM_SHAPE = ['54% 46% 47% 53% / 52% 42% 58% 48%',  // soft pebble
                      '50%',                                 // circle
                      '28px 6px 28px 6px',                   // leaf
                      '18px',                                // rounded square
                      '6px 28px 6px 28px',                   // reverse leaf
                      '50% 50% 42% 42% / 60% 60% 40% 40%',   // dome
                      '30% 70% 70% 30% / 30% 30% 70% 70%',   // blob
                      '22px 22px 8px 22px',                  // shield
                      '50% 10% 50% 10%',                     // gem
                      '40% 60% 55% 45% / 45% 45% 55% 55%'];  // pebble two
function shade(hex, k) {
  let [r, g, b] = hexToRgb(hex);
  if (k > 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return rgbToHex(r, g, b);
}
function emblemStyle(W) {
  const i = WORLDS.indexOf(W);
  return `background:linear-gradient(140deg, ${shade(W.color, 0.28)}, ${W.color} 55%, ${shade(W.color, -0.22)});` +
         `border-radius:${EMBLEM_SHAPE[i % EMBLEM_SHAPE.length]};box-shadow:0 5px 12px ${withAlpha(W.color, 0.35)}`;
}
function renderWorlds() {
  const list = $('#worldList'); list.innerHTML = '';
  if (save.testMode) list.insertAdjacentHTML('beforeend', '<div class="testbadge">Test mode is on: all worlds are unlocked.</div>');
  WORLDS.forEach((W, w) => {
    const unlocked = isWorldUnlocked(w);
    const st = worldStatus(w);
    const el = document.createElement('div');
    el.className = 'world';
    if (!unlocked) el.style.opacity = '0.75';
    let meta = '';
    if (unlocked) {
      meta = `<div class="meta">&#9733; ${st.stars} / ${CFG.levelsPerWorld * 3} &middot; ${st.levels} of ${CFG.levelsPerWorld} levels ${st.mastered ? '&middot; <b style="color:var(--good)">Mastered</b>' : ''}</div>`;
    } else {
      const prev = worldStatus(w - 1);
      meta = `<div class="req">&#128274; Earn ${CFG.unlockStars} stars in ${WORLDS[w - 1].name} to open this world.
        Progress: ${prev.stars} of ${CFG.unlockStars} stars.</div>`;
    }
    /* Every world is told apart by its colour and its emblem alone: no numbers, and a
       forward chevron in place of the word Open. */
    const action = unlocked ? `<button class="go" data-open="${w}" aria-label="Open ${W.name}" style="background:${W.color}">&#10095;</button>` : '';
    if (unlocked) { el.style.borderColor = W.color; el.style.background = worldTint(W); }
    const tier = unlocked ? trophyTier(w) : 'none';
    const trophy = tier === 'none' ? '' : `<span class="wtro" title="${TROPHY_TIERS[tier].name} trophy">${TROPHY_TIERS[tier].icon}</span>`;
    el.innerHTML = `<div class="sw ${unlocked ? 'on' : ''}" style="${unlocked ? emblemStyle(W) : ''}">
        <span class="swi">${unlocked ? W.icon : '&#128274;'}</span></div>
      <div class="info"><h3 style="color:${unlocked ? worldInk(W) : 'inherit'}">${W.name} ${trophy}</h3>
        <p class="wtagline">${W.tagline}</p><p>${W.desc}</p>${meta}</div>${action}`;
    list.appendChild(el);
  });
  list.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { selWorld = +b.dataset.open; showScreen('s-levels'); });
}
function renderLevels() {
  const W = WORLDS[selWorld];
  const st = worldStatus(selWorld);
  $('#levelsTitle').innerHTML = `<span class="lvlIcon" style="background:${W.color}">${W.icon}</span> ${W.name}`;
  $('#s-levels').style.background = worldPage(W);
  $('#levelsDesc').innerHTML = `${W.desc}<br><b>&#9733; ${st.stars} / ${CFG.levelsPerWorld * 3}</b>` +
    (selWorld < WORLDS.length - 1 ? ` &middot; ${CFG.unlockStars} stars open ${WORLDS[selWorld + 1].name}.` : '');
  const g = $('#levelGrid'); g.innerHTML = '';
  for (let l = 0; l < CFG.levelsPerWorld; l++) {
    const key = selWorld + '-' + l;
    const stars = save.progress[key] || 0;
    const open = isLevelUnlocked(selWorld, l);
    const b = document.createElement('button');
    b.className = 'lvl' + (open ? '' : ' locked') + (l === 0 ? ' tut' : '') + (stars ? ' done' : '');
    /* the whole level list wears the colour of its world, so the player always knows where they are */
    b.style.borderColor = W.color;
    b.style.background = stars ? W.color : worldTint(W);
    b.style.color = stars ? '#fff' : worldInk(W);
    const top = open ? (l === 0 ? '1<span class="sub">intro</span>' : l + 1) : '&#128274;';
    const m = save.mastery[key] || {};
    const marks = stars ? `${m.noCrash ? '&#9829;' : ''}${m.fast ? '&#9201;' : ''}${m.noHint ? '&#128161;' : ''}` : '';
    if (!open) { b.style.background = 'var(--panel)'; b.style.color = 'var(--muted)'; b.style.borderColor = 'var(--line)'; }
    b.innerHTML = `<span>${top}</span><span class="st">${stars ? starsHtml(stars) : '&nbsp;'}</span>` +
      `<span class="mm">${marks || '&nbsp;'}</span>`;
    if (open) b.onclick = () => startLevel(selWorld, l);
    g.appendChild(b);
  }
}
/* ---------- look and feel, reachable from the board ---------- */
function renderQuick() {
  const row = (label, key, list) =>
    `<div class="qSect">${label}</div><div class="chips">` +
    Object.keys(list).map(k => `<button class="chip ${save.opts[key] === k ? 'on' : ''}" data-qopt="${key}" data-qval="${k}">${list[k].name}</button>`).join('') +
    '</div>';
  const box = $('#quickBody');
  box.innerHTML = row('Arrow style', 'arrowStyle', ARROW_STYLES)
    + row('Board theme', 'theme', BOARD_THEMES)
    + row('Release cue', 'releaseCue', RELEASE_CUE)
    + row('Celebration effect', 'celebrationFx', CELEBRATION_FX)
    + '<div class="qSect">Quick switches</div><div class="chips">'
    + `<button class="chip ${save.opts.bigHeads ? 'on' : ''}" data-qtog="bigHeads">Large arrowheads</button>`
    + `<button class="chip ${save.opts.colorBlind ? 'on' : ''}" data-qtog="colorBlind">Colour blind palette</button>`
    + `<button class="chip ${save.opts.reducedMotion ? 'on' : ''}" data-qtog="reducedMotion">Reduced motion</button>`
    + `<button class="chip ${save.sound ? 'on' : ''}" data-qsave="sound">Sound</button>`
    + `<button class="chip ${save.opts.music ? 'on' : ''}" data-qtog="music">Music</button>`
    + `<button class="chip ${save.vibro ? 'on' : ''}" data-qsave="vibro">Vibration</button>`
    + '</div>';
  const after = () => { persist(); applyTheme(); sfx('click'); haptic('tap'); renderQuick(); if (G) draw(performance.now()); };
  box.querySelectorAll('[data-qopt]').forEach(b => b.onclick = () => { save.opts[b.dataset.qopt] = b.dataset.qval; after(); });
  box.querySelectorAll('[data-qtog]').forEach(b => b.onclick = () => {
    const k = b.dataset.qtog; save.opts[k] = !save.opts[k];
    if (k === 'music') save.opts.music ? musicStart(G ? G.w : 0) : musicStop();
    after();
  });
  box.querySelectorAll('[data-qsave]').forEach(b => b.onclick = () => { save[b.dataset.qsave] = !save[b.dataset.qsave]; after(); });
}
function openQuick() {
  renderQuick();
  $('#quickPanel').classList.remove('hidden');
  /* the clock stops while the panel is up: changing the look must never cost time */
  if (G && !G.done) $('#quickNote').textContent = 'The timer is stopped while this is open.';
  sfx('click'); haptic('tap');
}
function closeQuick() { $('#quickPanel').classList.add('hidden'); sfx('click'); }

/* ---------- settings screen ---------- */
function optRow(label, key, list, nameOf) {
  return `<div class="sect">${label}</div><div class="chips">` +
    Object.keys(list).map(k => `<button class="chip ${save.opts[key] === k ? 'on' : ''}" data-opt="${key}" data-val="${k}">${nameOf ? nameOf(list[k]) : list[k].name}</button>`).join('') +
    '</div>';
}
function sliderRow(label, key, min, max, step) {
  return `<div class="slider"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${save.opts[key]}" data-slider="${key}"><b>${save.opts[key]}</b></div>`;
}
function toggleRow(label, sub, key, target) {
  const val = target === 'save' ? save[key] : save.opts[key];
  return `<label class="row"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span>
    <input type="checkbox" class="switch" data-toggle="${key}" data-target="${target || 'opts'}" ${val ? 'checked' : ''}></label>`;
}
function renderSettings() {
  const box = $('#settingsBox');
  const L = LANGUAGES[save.opts.lang] || LANGUAGES.en;
  box.innerHTML =
    '<div class="sect">Look</div>' +
    '<canvas class="preview" id="stylePreview"></canvas>' +
    optRow('Text size', 'textSize', TEXT_SIZES) +
    optRow('Arrow style', 'arrowStyle', ARROW_STYLES) +
    optRow('Board theme', 'theme', BOARD_THEMES) +
    optRow('Release cue', 'releaseCue', RELEASE_CUE) +
    `<p class="desc" style="margin:-4px 0 6px">${RELEASE_CUE[save.opts.releaseCue].desc}. This plays on every arrow that leaves, so it stays quiet.</p>` +
    optRow('Celebration effect', 'celebrationFx', CELEBRATION_FX) +
    '<p class="desc" style="margin:-4px 0 6px">Kept for the big moments: a cleared board, a badge, a world opening.</p>' +
    '<div class="sect">Sound and feel</div>' +
    toggleRow('Sound effects', '', 'sound', 'save') +
    sliderRow('Sound level', 'soundVol', 0, 100, 5) +
    optRow('Board clear sound', 'clearJingle', JINGLES) +
    '<p class="desc" style="margin:-4px 0 6px">Played when the last arrow leaves. Tap one to hear it.</p>' +
    toggleRow('Background music', 'A calm piece for each world', 'music') +
    sliderRow('Music level', 'musicVol', 0, 100, 5) +
    optRow('Music style', 'musicStyle', MUSIC_STYLES) +
    toggleRow('Vibration', 'Every action and mechanic has its own pattern', 'vibro', 'save') +
    sliderRow('Vibration level', 'vibroVol', 0, 100, 10) +
    '<div class="sect">Play</div>' +
    toggleRow('Reduced motion', 'Calm backgrounds, no particles', 'reducedMotion') +
    toggleRow('Left handed layout', 'Mirrors the button bars', 'lefty') +
    toggleRow('Colour blind friendly arrows', 'A palette that separates by brightness', 'colorBlind') +
    toggleRow('Large arrowheads', 'Easier to read on dense boards', 'bigHeads') +
    '<div class="sect">Progress and tools</div>' +
    (DEV_TOOLS ?
      toggleRow('Test mode', 'Unlocks every world and level', 'testMode', 'save') +
      toggleRow('Developer overlay', 'Solution order and level metrics', 'debug', 'save') +
      '<button class="btn" id="btnAddCoins"><i class="coin-ic"></i>Add 500 test coins</button>' +
      '<button class="btn" id="btnMusicLab">Music lab</button>' +
      '<button class="btn" id="btnGuideAgain">Show the first level guide again</button>' : '') +
    '<button class="btn" id="btnResetOpts">Reset settings to default</button>' +
    '<button class="btn" id="btnReset" style="color:var(--bad)">Reset all progress</button>' +
    '<p class="desc" style="text-align:center">Arrow Escape 1.01. Progress is saved on this device.</p>';
  box.querySelectorAll('[data-opt]').forEach(b => b.onclick = () => {
    save.opts[b.dataset.opt] = b.dataset.val; persist(); applyTheme();
    if (b.dataset.opt === 'celebrationFx') { confetti(18, []); }
    if (b.dataset.opt === 'releaseCue') { toast(RELEASE_CUE[save.opts.releaseCue].name + ': ' + RELEASE_CUE[save.opts.releaseCue].desc + '.'); }
    if (b.dataset.opt === 'clearJingle') celebrateClear(b.dataset.val);
    if (b.dataset.opt === 'musicStyle') {
      const m = MUSIC_STYLES[save.opts.musicStyle];
      toast(m.name + ': ' + m.desc);
      if (save.opts.music) musicStart(G ? G.w : musicWorld);   // hear the choice at once
    }
    sfx('click'); haptic('tap'); renderSettings();
  });
  box.querySelectorAll('[data-slider]').forEach(inp => {
    inp.oninput = () => {
      save.opts[inp.dataset.slider] = +inp.value; inp.nextElementSibling.textContent = inp.value;
      if (inp.dataset.slider === 'musicVol' && music) music.setVolume(musicLevel());   // heard while dragging
    };
    inp.onchange = () => { persist(); if (inp.dataset.slider === 'musicVol') musicStart(G ? G.w : musicWorld); sfx('click'); haptic('tap'); };
  });
  box.querySelectorAll('[data-toggle]').forEach(inp => inp.onchange = () => {
    const k = inp.dataset.toggle;
    if (inp.dataset.target === 'save') save[k] = inp.checked; else save.opts[k] = inp.checked;
    persist(); applyTheme();
    if (k === 'music') inp.checked ? musicStart(G ? G.w : musicWorld) : musicStop();
    haptic('tap');
  });
    $('#btnResetOpts').onclick = () => { save.opts = defaultOpts(); persist(); applyTheme(); musicStop(); renderSettings(); toast('Settings reset to default.'); };
  if (DEV_TOOLS) $('#btnMusicLab').onclick = () => { sfx('click'); openMusicLab(); };
  if (DEV_TOOLS) $('#btnGuideAgain').onclick = () => { save.seenGuide = false; persist(); sfx('click'); toast('The guide will run on the first level of Meadow.'); };
  if (DEV_TOOLS) $('#btnAddCoins').onclick = () => { addCoins(500); sfx('coin'); haptic('tap'); toast('500 test coins added. You now have ' + save.coins + '.'); };
  $('#btnReset').onclick = resetProgress;
  drawStylePreview();
}
function drawStylePreview() {
  const c = $('#stylePreview');
  if (!c) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = c.clientWidth || 300, h = 54;
  c.width = w * dpr; c.height = h * dpr;
  const x = c.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.fillStyle = THEME.boardTint || THEME.panel; x.fillRect(0, 0, w, h);
  const st = ARROW_STYLES[save.opts.arrowStyle] || ARROW_STYLES.classic;
  const cols = (save.opts.colorBlind ? CB_COLS : NORMAL_COLS).slice(0, 4);
  cols.forEach((col, i) => {
    const color = styleColor(col), y = 14 + (i % 2) * 22, x0 = 16 + i * 70;
    x.strokeStyle = color; x.lineWidth = 6 * st.width; x.lineCap = 'round'; x.globalAlpha = st.alpha;
    if (st.glow) { x.shadowColor = color; x.shadowBlur = st.glow; }
    x.beginPath(); x.moveTo(x0, y); x.lineTo(x0 + 34, y); x.stroke();
    x.fillStyle = color; x.beginPath();
    x.moveTo(x0 + 48, y); x.lineTo(x0 + 36, y - 7); x.lineTo(x0 + 36, y + 7); x.closePath(); x.fill();
    x.shadowBlur = 0; x.globalAlpha = 1;
  });
}
function resetProgress() {
  openModal(`<h3>Reset progress?</h3><p>All coins, stars, badges and unlocked worlds on this device will be removed. Settings are kept.</p>
    <div class="stack"><button class="btn" style="color:var(--bad)" data-act="yes">Reset</button><button class="btn" data-act="no">Cancel</button></div>`,
    { yes: () => { const o = save.opts, t = save.testMode, d = save.debug, r = save.rated, dl = save.daily, cs = save.clockSeen, rc = save.reach;
        save = defaultSave(); save.opts = o; save.testMode = t; save.debug = d; save.rated = r;
        /* today's daily attempt and the clock guard survive a reset, or a reset would be a second go */
        save.daily = { tried: dl && dl.tried, done: dl && dl.done }; save.clockSeen = cs; save.reach = rc;
        persist(); closeModal(); updateCoins(); renderSettings(); toast('Progress has been reset.'); },
      no: closeModal });
}

/* ---------- paying for help: coins or a rewarded video ---------- */
function askPayment(title, cost, onPay) {
  const short = save.coins < cost;
  const video = videosOffered();
  openModal(`<h3>${title}</h3>
    <p>${short ? `You have ${save.coins} coins and this costs ${cost}.${video ? ' A video pays for it instead.' : ' New stars earn more coins.'}` : 'Choose how to pay for it.'}</p>
    <div class="stack">
      ${short
        ? `${video ? '<button class="btn primary" data-act="ad">&#9654; Watch a video</button>' : ''}
           <button class="btn gold" data-act="coins" disabled>Pay <i class="coin-ic"></i>${cost}</button>`
        : `<button class="btn gold" data-act="coins">Pay <i class="coin-ic"></i>${cost}</button>
           ${video ? '<button class="btn" data-act="ad">Watch a video instead</button>' : ''}`}
      <button class="btn" data-act="no">Cancel</button>
    </div>`, {
    coins: () => { if (save.coins < cost) return; addCoins(-cost); closeModal(); onPay(); },
    ad: () => showRewardedAd('help', onPay, () => askPayment(title, cost, onPay)),
    no: closeModal
  });
}



/* =========================================================
   MODAL AND RULES
   ========================================================= */
let modalHandlers = {};
function openModal(html, handlers) { $('#modalCard').innerHTML = html; modalHandlers = handlers || {}; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); modalHandlers = {}; }
const modalOpen = () => !$('#modal').classList.contains('hidden');
$('#modalCard').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b && modalHandlers[b.dataset.act]) modalHandlers[b.dataset.act]();
});

const ico = inner => `<svg width="44" height="32" viewBox="0 0 44 32">${inner}</svg>`;
const head = (x, y, c) => `<path d="M${x} ${y} l-9 -6 v12z" fill="${c}"/>`;
const MECH_NAME = { bent: 'bent arrows', clock: 'clockwork arrows', mirrors: 'mirrors', portals: 'portals',
  gates: 'colour gates', sliders: 'ice sliders', boom: 'boomerangs', hungry: 'hungry arrows',
  keys: 'keys and padlocks', design: 'design tiles' };
const LEGEND = {
  base: [ico(`<path d="M6 16 H30" stroke="#4b5a72" stroke-width="3.5" stroke-linecap="round"/>${head(38, 16, '#4b5a72')}`),
    '<b>Release.</b> Tap an arrow and it flies off the board if its path is clear. A crash costs one of your ' + CFG.lives + ' lives.'],
  timer: [ico(`<circle cx="22" cy="17" r="11" fill="none" stroke="#e5484d" stroke-width="3"/><path d="M22 17 V10 M22 17 L27 20" stroke="#e5484d" stroke-width="2.5" stroke-linecap="round"/><rect x="18" y="2" width="8" height="3" rx="1" fill="#e5484d"/>`),
    '<b>Timer.</b> Clear the board before the time runs out. The timer turns orange, then red and flashing in the last seconds.'],
  bent: [ico(`<path d="M8 28 V10 H30" stroke="#2f9e6b" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${head(38, 10, '#2f9e6b')}`),
    '<b>Bent arrows</b> follow their own body and leave in the direction of the arrowhead.'],
  clock: [ico(`<circle cx="20" cy="16" r="12" fill="none" stroke="${KIND_COL.clock}" stroke-width="2"/><path d="M14 16 H22" stroke="${KIND_COL.clock}" stroke-width="3.5" stroke-linecap="round"/>${head(30, 16, KIND_COL.clock)}`),
    '<b>Clockwork (orange ring).</b> Turns a quarter clockwise every time another arrow leaves the board.'],
  mirrors: [ico(`<rect x="24" y="4" width="18" height="24" rx="3" fill="#dfe6ee"/><path d="M27 25 L39 7" stroke="#6b7a90" stroke-width="3"/><path d="M4 16 H26" stroke="#4b5a72" stroke-width="3" stroke-dasharray="3 3"/>`),
    '<b>Mirrors</b> turn a flying arrow by 90 degrees.'],
  portals: [ico(`<circle cx="10" cy="16" r="8" fill="none" stroke="${PORTAL_COLS[0]}" stroke-width="3"/><circle cx="34" cy="16" r="8" fill="none" stroke="${PORTAL_COLS[0]}" stroke-width="3"/><circle cx="10" cy="16" r="3" fill="${PORTAL_COLS[0]}"/><circle cx="34" cy="16" r="3" fill="${PORTAL_COLS[0]}"/>`),
    '<b>Portals</b> come in pairs of the same colour. An arrow entering one comes out of the other.'],
  sliders: [ico(`<path d="M6 16 H28" stroke="${KIND_COL.slide}" stroke-width="3.5" stroke-linecap="round"/><path d="M24 10 l6 6 l-6 6" stroke="${KIND_COL.slide}" stroke-width="2.5" fill="none"/>${head(38, 16, KIND_COL.slide)}`),
    '<b>Ice arrows (blue, double head)</b> never crash. When blocked, they slide forward until they touch the obstacle.'],
  boom: [ico(`<circle cx="9" cy="16" r="4" fill="#fff" stroke="${KIND_COL.boom}" stroke-width="2.5"/><path d="M13 16 H30" stroke="${KIND_COL.boom}" stroke-width="3.5" stroke-linecap="round"/>${head(38, 16, KIND_COL.boom)}`),
    '<b>Boomerangs (pink, ring at the tail).</b> First tap: flies out and returns reversed. Second tap: leaves for good.'],
  hungry: [ico(`<circle cx="8" cy="16" r="3" fill="${KIND_COL.hungry}"/><path d="M8 16 H30" stroke="${KIND_COL.hungry}" stroke-width="3.5" stroke-linecap="round"/><path d="M28 8 l9 8 l-9 8" stroke="${KIND_COL.hungry}" stroke-width="3" fill="none" stroke-linejoin="round"/>`),
    '<b>Hungry arrows (green, open head)</b> grow one cell forward after every release if that cell is empty.'],
  gates: [ico(`<rect x="36" y="3" width="6" height="26" rx="2" fill="${GATE_COLORS[0]}"/><path d="M4 16 H24" stroke="${GATE_COLORS[0]}" stroke-width="3.5" stroke-linecap="round"/>${head(33, 16, GATE_COLORS[0])}<rect x="2" y="12" width="7" height="7" rx="1.5" fill="${GATE_COLORS[0]}"/>`),
    '<b>Coloured arrows</b> may only leave through a border gate of the same colour. Grey arrows may leave anywhere.'],
  keys: [ico(`<circle cx="10" cy="16" r="8" fill="${KIND_COL.key}"/><text x="10" y="21" font-size="11" font-weight="800" text-anchor="middle" fill="#3a2a00">A</text><rect x="26" y="12" width="16" height="13" rx="2.5" fill="${KIND_COL.lock}"/><path d="M30 12 v-3 a4 4 0 0 1 8 0 v3" stroke="${KIND_COL.lock}" stroke-width="2.5" fill="none"/><text x="34" y="23" font-size="9" font-weight="800" text-anchor="middle" fill="#fff">A</text>`),
    '<b>Keys and padlocks.</b> A padlocked arrow cannot move until the key arrow with the same letter has left the board.'],
  gravity: [ico(`<rect x="12" y="2" width="12" height="10" rx="2" fill="#9a6a3c"/><path d="M18 14 V26" stroke="#9a6a3c" stroke-width="3" stroke-linecap="round"/><path d="M13 22 l5 6 l5 -6" stroke="#9a6a3c" stroke-width="3" fill="none"/>`),
    '<b>Gravity.</b> When an arrow leaves, everything above it falls down. Down arrows leave from the bottom row.'],
  design: [ico(`<rect x="8" y="3" width="26" height="26" rx="4" fill="none" stroke="${KIND_COL.design}" stroke-width="2" stroke-dasharray="4 3"/><path d="M14 16 H22" stroke="${KIND_COL.design}" stroke-width="3.5" stroke-linecap="round"/>${head(30, 16, KIND_COL.design)}`),
    '<b>Design tiles (purple, dashed).</b> Before you start, tap them to choose their directions, then press Start.']
};
function showRules(w, onClose) {
  const row = k => `<div>${LEGEND[k][0]}<span>${LEGEND[k][1]}</span></div>`;
  let body;
  if (w < 0) {
    body = `<div class="legend">${['base', 'timer'].concat(MECH_ORDER).map(row).join('')}</div>
      <p style="font-size:13px">Each world adds one new mechanic. Its first level is a short introduction; the other levels mix it with everything you learned before.</p>`;
  } else {
    /* Only the mechanic that is new to this world is explained. Everything from the earlier
       worlds is named in a single line, because the player has already met it. */
    const m = worldMechanics(w);
    const older = m.earlier.filter(k => !m.fresh.includes(k));
    const nameOfMech = k => MECH_NAME[k] || k;
    if (w === 0) {
      body = `<p class="wtag">${WORLDS[w].tagline}</p><div class="legend">${['base', 'timer'].map(row).join('')}</div>`;
    } else if (m.fresh.length) {
      body = `<p class="wtag">${WORLDS[w].tagline}</p>`
        + `<p style="text-align:left;margin-top:10px"><b style="color:var(--ink)">New in this world</b></p>`
        + `<div class="legend">${m.fresh.map(row).join('')}</div>`
        + (older.length ? `<p class="carry">Also on these boards, already familiar: ${older.map(nameOfMech).join(', ')}.</p>` : '');
    } else {
      body = `<p class="wtag">${WORLDS[w].tagline}</p>`
        + `<p style="text-align:left;margin-top:10px"><b style="color:var(--ink)">Everything comes together</b></p>`
        + `<p class="carry">No new mechanic here. These boards mix what you already know: ${older.map(nameOfMech).join(', ')}.</p>`;
    }
  }
  const extra = (w <= 0)
    ? `<p style="font-size:13px">At the start usually only one arrow can escape. Find it, and each release opens the next path.
       Stars: 1 for finishing, 1 for finishing with at least ${Math.round(CFG.timeStarShare * 100)}% of the time left, 1 for finishing without a crash.
       Arrows fly across the empty space inside the board and only leave at the outer frame, so a flight can hit a far part of the board.
       Tapping the same blocked arrow again does not cost another life. Pinch to zoom, and once the board is larger than the screen you can drag it with one finger. There is no undo, so look before you tap.</p>
       <p style="font-size:13px">The clock starts with your first tap, or after twenty seconds of looking. If time or lives run out you may continue twice on a board, with coins${videosOffered() ? ' or a video' : ''}.
       ${CFG.unlockStars} stars in a world open the next one. The daily puzzle is one attempt with one continue, and it begins when you press Start.</p>`
    : '<p style="font-size:13px">The first level of the world is a short introduction. The Rules button reopens this at any time.</p>';
  const headLine = w < 0 ? '<h3>How to play</h3>'
    : `<div class="wbadge" style="background:${WORLDS[w].color}">${WORLDS[w].icon}</div><h3 style="color:${WORLDS[w].color}">${WORLDS[w].name}</h3>`;
  openModal(`${headLine}${body}${extra}
    <div class="stack"><button class="btn primary" data-act="ok">${w < 0 ? 'Understood' : 'Start'}</button></div>`,
    { ok: () => { closeModal(); if (onClose) onClose(); } });
}

/* =========================================================
   EXTRA MODES: weekly challenge and secret levels
   ========================================================= */
const CHALLENGES = [
  { id: 'long',  name: 'Long Arrow Week', desc: 'Only very long, winding arrows.',
    apply: p => { p.minLen = 4; p.maxLen = Math.min(p.maxLen + 5, 20); } },
  { id: 'one',   name: 'One Opening',     desc: 'Every board starts with as few openings as possible.',
    apply: p => { p.openings = 1; p.forceFirst = 3; } },
  { id: 'nocrash', name: 'No Crash Challenge', desc: 'One life only. Look before you tap.',
    apply: p => { p.lives = 1; } },
  { id: 'speed', name: 'Speed Escape',    desc: 'Tight timers, smaller boards.',
    apply: p => { p.timeFactor = 0.72; p.W = Math.max(9, p.W - 2); p.H = Math.round(p.W * 1.33); } }
];
/* Every weekly board is an animal, whatever the week's rule, so the set reads as a little zoo. */
const WEEKLY_BOARDS = [
  { shape: 'cat', icon: '\uD83D\uDC31', name: 'Cat' },
  { shape: 'rabbit', icon: '\uD83D\uDC30', name: 'Rabbit' },
  { shape: 'bird', icon: '\uD83D\uDC26', name: 'Bird' },
  { shape: 'fish', icon: '\uD83D\uDC1F', name: 'Fish' },
  { shape: 'turtle', icon: '\uD83D\uDC22', name: 'Turtle' },
  { shape: 'butterfly', icon: '\uD83E\uDD8B', name: 'Butterfly' }
];
function weekKey(d) {
  d = d || new Date();
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() + '-W' + Math.ceil(((t - y0) / 86400000 + 1) / 7);
}
function weekNumber() { const k = weekKey(); return parseInt(k.split('-W')[1], 10) + parseInt(k.split('-')[0], 10) * 53; }
function currentChallenge() { return CHALLENGES[weekNumber() % CHALLENGES.length]; }
function weeklyState() {
  const k = weekKey();
  if (!save.weekly || save.weekly.key !== k) save.weekly = { key: k, done: [], stars: {} };
  if (!save.weekly.stars) save.weekly.stars = {};
  return save.weekly;
}
const SECRETS = [
  { id: 'butterfly', icon: '🦋', name: 'Secret Butterfly', shape: 'butterfly', world: 2,
    desc: 'Clear 5 successive levels with three stars',
    progress: () => (save.stats.starRun || 0) + ' of 5 in a row',
    need: () => (save.stats.bestStarRun || 0) >= 5 },
  { id: 'lion',      icon: '🐱', name: 'Hidden Cat',       shape: 'cat',       world: 7,
    desc: 'Earn the Sharp Eye badge (10 levels with no hint)',
    progress: () => (save.stats.noHintRun || 0) + ' of 10 in a row',
    need: () => !!save.badges.sharpEye },
  { id: 'ghost',     icon: '👻', name: 'Ghost Vault',      shape: 'ghost',     world: 8,
    desc: 'Earn the Chain Master badge (10 releases in a row)',
    progress: () => (save.stats.bestChain || 0) + ' of 10 in a row',
    need: () => !!save.badges.chain },
  { id: 'crown',     icon: '\uD83D\uDC51', name: 'Crown Chamber',    shape: 'crown',     world: 9,
    desc: 'Master two worlds',
    progress: () => [0,1,2,3,4,5,6,7,8,9].filter(w => worldStatus(w).mastered).length + ' of 2 mastered',
    need: () => [0,1,2,3,4,5,6,7,8,9].filter(w => worldStatus(w).mastered).length >= 2 },
  { id: 'rocket',    icon: '\uD83D\uDE80', name: 'Launch Pad',       shape: 'rocket',    world: 3,
    desc: 'Finish 10 levels with a third of the time still on the clock',
    progress: () => (save.stats.fastCount || 0) + ' of 10 fast finishes',
    need: () => (save.stats.fastCount || 0) >= 10 },
  { id: 'fish',      icon: '\uD83D\uDC1F', name: 'Deep Current',     shape: 'fish',      world: 5,
    desc: 'Clear 8 different board shapes',
    progress: () => Object.keys(save.stats.shapes || {}).length + ' of 8 shapes',
    need: () => Object.keys(save.stats.shapes || {}).length >= 8 },
  { id: 'key',       icon: '\uD83D\uDD11', name: 'Locksmith Room',   shape: 'key',       world: 8,
    desc: 'Finish 12 Castle levels',
    progress: () => (save.stats.castle || 0) + ' of 12 Castle levels',
    need: () => (save.stats.castle || 0) >= 12 },
  { id: 'mushroom',  icon: '\uD83C\uDF44', name: 'Hollow Grove',     shape: 'mushroom',  world: 6,
    desc: 'Finish 5 daily puzzles',
    progress: () => (save.stats.dailies || 0) + ' of 5 dailies',
    need: () => (save.stats.dailies || 0) >= 5 },
  { id: 'boat',      icon: '\u26F5', name: 'Harbour Wreck',    shape: 'boat',      world: 4,
    desc: 'Release 14 arrows in a row without a crash',
    progress: () => (save.stats.bestChain || 0) + ' of 14 in a row',
    need: () => (save.stats.bestChain || 0) >= 14 },
  { id: 'robot',     icon: '\uD83E\uDD16', name: 'Workshop Floor',   shape: 'robot',     world: 9,
    desc: 'Finish 3 weekly challenges',
    progress: () => (save.stats.weeklies || 0) + ' of 3 weekly challenges',
    need: () => (save.stats.weeklies || 0) >= 3 },
  { id: 'heart',     icon: '\u2764\uFE0F', name: 'Heart of the Board', shape: 'heart',   world: 1,
    desc: 'Finish 15 levels without losing a single life',
    progress: () => (save.stats.noCrashTotal || 0) + ' of 15 clean clears',
    need: () => (save.stats.noCrashTotal || 0) >= 15 },
  { id: 'star',      icon: '\u2B50', name: 'Star Vault',       shape: 'star',      world: 7,
    desc: 'Collect 200 stars in the campaign',
    progress: () => [0,1,2,3,4,5,6,7,8,9].reduce((n, w) => n + worldStatus(w).stars, 0) + ' of 200 stars',
    need: () => [0,1,2,3,4,5,6,7,8,9].reduce((n, w) => n + worldStatus(w).stars, 0) >= 200 },
  { id: 'castleS',   icon: '\uD83C\uDFF0', name: 'Throne Room',      shape: 'castle',    world: 9,
    desc: 'Clear the puzzle of the month',
    progress: () => (save.stats.monthlies || 0) + ' monthly boards cleared',
    need: () => (save.stats.monthlies || 0) >= 1 },
  { id: 'car',       icon: '\uD83D\uDE97', name: 'Pit Lane',         shape: 'car',       world: 6,
    desc: 'Finish 10 levels without asking for a hint',
    progress: () => (save.stats.noHintRun || 0) + ' of 10 in a row',
    need: () => (save.stats.noHintRun || 0) >= 10 },
  { id: 'bird',      icon: '\uD83D\uDD4A\uFE0F', name: 'Long Flight',      shape: 'bird',      world: 2,
    desc: 'Clear a board of 80 arrows or more',
    progress: () => 'best so far: ' + (save.stats.biggestBoard || 0) + ' arrows',
    need: () => (save.stats.biggestBoard || 0) >= 80 }
];
function renderWeekly() {
  const ch = currentChallenge(), st = weeklyState(), n = WEEKLY_BOARDS.length;
  $('#weeklyTitle').textContent = ch.name;
  $('#weeklyDesc').textContent = ch.desc + ' Six animal boards, a new challenge every week.';
  const g = $('#weeklyList'); g.innerHTML = '';
  WEEKLY_BOARDS.forEach((bd, i) => {
    const stars = st.stars[i] || (st.done.includes(i) ? 1 : 0);
    g.insertAdjacentHTML('beforeend',
      `<button class="lvl wk${stars ? ' done' : ''}" data-ch="${i}"><span class="wkIcon">${bd.icon}</span>
        <span class="wkName">${bd.name}</span><span class="st">${stars ? starsHtml(stars) : '&nbsp;'}</span></button>`);
  });
  g.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => startLevel(0, 0, false, { kind: 'weekly', idx: +b.dataset.ch }));
  $('#weeklyProgress').textContent = st.done.length + ' of ' + n + ' finished this week';
}
function renderSecrets() {
  const g = $('#secretList'); g.innerHTML = '';
  for (const sc of SECRETS) {
    /* once met, a secret stays open, even if the way its condition is counted changes later */
    if (!save.secretsOpen) save.secretsOpen = {};
    if (!save.secretsOpen[sc.id] && sc.need()) { save.secretsOpen[sc.id] = 1; persist(); }
    const open = save.testMode || !!save.secretsOpen[sc.id];
    const done = !!save.secrets[sc.id];
    g.insertAdjacentHTML('beforeend',
      `<div class="badge ${open ? 'on' : ''}"><div class="bIcon">${sc.icon}</div>
        <div class="bText"><b>${sc.name}</b><small>${open ? (done ? 'Cleared' : 'Unlocked: a special board awaits')
          : sc.desc + (sc.progress ? ' &middot; ' + sc.progress() : '')}</small></div>
        ${open ? `<button class="goBtn" data-secret="${sc.id}" aria-label="Play ${sc.name}"><svg class="ic" aria-hidden="true"><use href="#i-chevron"/></svg></button>` : '<div class="bState">&#128274;</div>'}</div>`);
  }
  g.querySelectorAll('[data-secret]').forEach(b => b.onclick = () => {
    const sc = SECRETS.find(x => x.id === b.dataset.secret);
    startLevel(sc.world, 14, false, { kind: 'secret', id: sc.id, shape: sc.shape });
  });
}

/* =========================================================
   LOOK AND FEEL: board themes, arrow styles, escape effects
   ========================================================= */
const BOARD_THEMES = {
  paper:     { name: 'Paper',     bg: '#f3f1ea', panel: '#ffffff', ink: '#1d2433', line: '#e3e0d6', muted: '#6b7385',
               grid: 'rgba(30,40,60,0.05)', edge: 'rgba(40,50,70,0.10)', frame: 'rgba(70,80,100,0.16)', boardTint: null },
  night:     { name: 'Night',     bg: '#11162a', panel: '#1b2340', ink: '#eef2ff', line: '#2b3558', muted: '#9aa6cc',
               grid: 'rgba(255,255,255,0.05)', edge: 'rgba(255,255,255,0.10)', frame: 'rgba(255,255,255,0.16)', boardTint: '#1a2340' },
  blueprint: { name: 'Blueprint', bg: '#0f2f53', panel: '#123a66', ink: '#dbeafe', line: '#1d4f85', muted: '#9ec5ea',
               grid: 'rgba(190,225,255,0.14)', edge: 'rgba(190,225,255,0.22)', frame: 'rgba(190,225,255,0.3)', boardTint: '#123c69' },
  pastel:    { name: 'Pastel',    bg: '#fdf4f7', panel: '#ffffff', ink: '#3b3350', line: '#f0dfe8', muted: '#8a7f9c',
               grid: 'rgba(90,60,90,0.05)', edge: 'rgba(90,60,90,0.10)', frame: 'rgba(90,60,90,0.14)', boardTint: '#fbeef4' },
  dark:      { name: 'Dark',      bg: '#16181d', panel: '#22252c', ink: '#f2f3f5', line: '#33373f', muted: '#9aa0ab',
               grid: 'rgba(255,255,255,0.05)', edge: 'rgba(255,255,255,0.09)', frame: 'rgba(255,255,255,0.14)', boardTint: '#23272f' },
  galaxy:    { name: 'Galaxy',    bg: '#0b0b1f', panel: '#181a3a', ink: '#eae6ff', line: '#2c2a5c', muted: '#a39ecb',
               grid: 'rgba(200,190,255,0.07)', edge: 'rgba(200,190,255,0.12)', frame: 'rgba(200,190,255,0.2)', boardTint: '#161a3d' }
};
const ARROW_STYLES = {
  classic:  { name: 'Classic',  width: 1,    glow: 0,  alpha: 1,    sat: 1,    light: 0 },
  neon:     { name: 'Neon',     width: 0.9,  glow: 12, alpha: 1,    sat: 1.35, light: 0.12 },
  glass:    { name: 'Glass',    width: 1.35, glow: 3,  alpha: 0.55, sat: 0.9,  light: 0.15 },
  candy:    { name: 'Candy',    width: 1.4,  glow: 4,  alpha: 1,    sat: 1.25, light: 0.18 },
  metallic: { name: 'Metallic', width: 1.15, glow: 2,  alpha: 1,    sat: 0.35, light: 0.08 },
  galaxyA:  { name: 'Galaxy',   width: 1.1,  glow: 10, alpha: 0.95, sat: 1.15, light: -0.05 },
  ice:      { name: 'Ice',      width: 1.2,  glow: 8,  alpha: 0.8,  sat: 0.6,  light: 0.25 },
  fire:     { name: 'Fire',     width: 1.1,  glow: 10, alpha: 1,    sat: 1.4,  light: 0.05, hue: 20 },
  nature:   { name: 'Nature',   width: 1.15, glow: 2,  alpha: 1,    sat: 0.85, light: 0.02, hue: 110 }
};
/* Particles are reserved for the moments that deserve them: a cleared board, a badge, a world opening.
   They never play on an ordinary release, which would cover the board in confetti all game long. */
const CELEBRATION_FX = {
  stars:     { name: 'Stars',     shape: 'star',   colors: ['#f2b01e', '#ffe9a8', '#ffffff'] },
  confetti:  { name: 'Confetti',  shape: 'rect',   colors: ['#e03131', '#2f9e6b', '#3f7fd0', '#f2b01e', '#d6336c'] },
  bubbles:   { name: 'Bubbles',   shape: 'circle', colors: ['#8ed0ff', '#c9ecff', '#ffffff'] },
  lightning: { name: 'Lightning', shape: 'bolt',   colors: ['#ffe066', '#fff3bf', '#74c0fc'] },
  leaves:    { name: 'Leaves',    shape: 'leaf',   colors: ['#2f9e6b', '#74c69d', '#b7e4c7'] },
  snow:      { name: 'Snow',      shape: 'circle', colors: ['#ffffff', '#dbeafe', '#c7d2fe'] }
};
/* What an ordinary release looks like. Each one is a single quiet mark drawn on the board itself,
   in the colour of the world, and it is gone within half a second. */
const RELEASE_CUE = {
  glow:  { name: 'Soft glow',  desc: 'The freed space lights up' },
  flash: { name: 'Bright arrow', desc: 'The arrow brightens as it leaves' },
  ring:  { name: 'Ring',       desc: 'A thin circle at the point of exit' },
  trail: { name: 'Trail',      desc: 'A fading line along the flight' },
  none:  { name: 'None',       desc: 'Only the flight itself' }
};
let THEME = BOARD_THEMES.paper;
function hexToRgb(h) { const v = parseInt(h.slice(1), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; }
function rgbToHex(r, g, b) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function styleColor(hex) {
  const st = ARROW_STYLES[save.opts.arrowStyle] || ARROW_STYLES.classic;
  if (st === ARROW_STYLES.classic) return hex;
  let [r, g, b] = hexToRgb(hex);
  const avg = (r + g + b) / 3;
  r = avg + (r - avg) * st.sat; g = avg + (g - avg) * st.sat; b = avg + (b - avg) * st.sat;
  if (st.light) { r += (255 - r) * st.light; g += (255 - g) * st.light; b += (255 - b) * st.light; }
  if (st.hue === 20) { r = Math.min(255, r * 1.25 + 40); g = g * 0.8; b = b * 0.5; }
  if (st.hue === 110) { g = Math.min(255, g * 1.2 + 25); r = r * 0.8; }
  return rgbToHex(r, g, b);
}
/* The game's own text size. It is applied as the WebView's text zoom, which also means the
   phone's system font size no longer enlarges the game behind the player's back: this choice is
   the only one. Medium is the size the screens were designed at. */
const TEXT_SIZES = { small: { name: 'Small', zoom: 88 }, medium: { name: 'Medium', zoom: 100 }, large: { name: 'Large', zoom: 115 } };
function applyTextSize() {
  const z = (TEXT_SIZES[save.opts.textSize] || TEXT_SIZES.medium).zoom;
  const info = nativePlugin('BuildInfo');
  if (info && info.setTextZoom) { try { const r = info.setTextZoom({ zoom: z }); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
}
function applyTheme() {
  applyTextSize();
  THEME = BOARD_THEMES[save.opts.theme] || BOARD_THEMES.paper;
  const r = document.documentElement.style;
  r.setProperty('--bg', THEME.bg); r.setProperty('--panel', THEME.panel); r.setProperty('--ink', THEME.ink);
  r.setProperty('--line', THEME.line); r.setProperty('--muted', THEME.muted);
  document.body.dataset.theme = save.opts.theme;
  /* the dark themes need dark versions of every surface that is otherwise a fixed pale colour */
  document.body.classList.toggle('darkUi', !isLight(THEME.bg));
  document.body.classList.toggle('lefty', !!save.opts.lefty);
  document.body.classList.toggle('calmMotion', !!save.opts.reducedMotion);
  tintBars();
}
/* From Android 15 the status bar is drawn over the page and its own colour is ignored, so the
   tint the player sees is the one the page already paints: the board theme everywhere, with the
   world laid over it on the game screen. The plugin is still worth calling for two things it
   alone can do, namely the colour on the older versions where the bar is opaque, and the icon
   style, which has to stay legible against whatever ends up behind it. */
function hexToRgb(h) {
  const v = h.replace('#', '');
  const n = v.length === 3 ? v.split('').map(c => c + c).join('') : v.slice(0, 6);
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
function mixHex(base, over, amount) {
  const a = hexToRgb(base), b = hexToRgb(over);
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * amount));
  return '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');
}
/* A world's pale tint is a light background, so a dark theme gets a deep version of it instead,
   and a world colour used as text is lifted so it still reads on that deep version. */
const darkTheme = () => !!(THEME && !isLight(THEME.bg));
function worldTint(W) { return darkTheme() ? mixHex(THEME.panel, W.color, 0.18) : W.tint; }
function worldPage(W) { return darkTheme() ? mixHex(THEME.bg, W.color, 0.12) : W.tint; }
function worldInk(W) { return darkTheme() ? mixHex(W.color, '#ffffff', 0.35) : W.color; }
function isLight(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;   // the usual perceived brightness
}
function tintBars() {
  const bg = (THEME && THEME.bg) || '#f3f1ea';
  /* 0.33 matches the 55 alpha the game screen paints the world tint with, so the bar agrees
     with the board rather than sitting a shade away from it. */
  const col = (currentScreen === 's-game' && G) ? mixHex(bg, WORLDS[G.w].tint, 0.33) : bg;
  document.documentElement.style.setProperty('--barTint', col);
  const S = nativePlugin('StatusBar');
  if (!S) return;
  const fire = fn => { try { const r = fn(); if (r && r.catch) r.catch(() => {}); } catch (e) {} };
  fire(() => S.setBackgroundColor({ color: col }));
  fire(() => S.setStyle({ style: isLight(col) ? 'LIGHT' : 'DARK' }));
}

/* ---------- background music: a procedural piece for each world (www/music.js) ----------
   Each world has its own piece: a style with its own scale, harmony, instruments and form of
   pad, arpeggio, melody, bass, drone and a soft pulse. The player can instead fix one style for
   every world, and it then moves key from world to world. Nothing is sampled and no file is
   loaded. The engine never restarts a piece that is already playing, so the menus, the level
   screens and every tap leave it running; asking for another world crossfades. */
const MUSIC_STYLES = Object.assign({ world: { name: 'By world', desc: 'Each world has its own piece.' } },
  window.PuzzleMusic ? Object.fromEntries(Object.entries(PuzzleMusic.STYLES).map(([k, s]) => [k, { name: s.name, desc: s.desc }])) : {});
/* Each piece is recorded once in the background (a few seconds on a phone, on the audio thread)
   and then looped: about one voice of work instead of a live synthesiser. The first visit to a
   world fades its music in when the recording is ready; later visits start at once. Two
   recordings are kept, 15 to 21 MB each. */
const music = window.PuzzleMusic ? PuzzleMusic.createEngine({
  getContext: ensureAudio,
  canPlay: () => !audioHeld() && !document.hidden,
  quality: PuzzleMusic.suggestQuality(),
  mode: 'recorded', whileRecording: 'silent', cacheSize: 2
}) : null;
/* half scale at 100: the music sits under the sound effects, never over them */
const musicLevel = () => 0.5 * (save.opts.musicVol || 0) / 100;
/* the menus play the world last played, the one the player is most likely to go back to */
let musicWorld = save.lastPlayed ? save.lastPlayed.w : 0;
function musicStop() { if (music) music.stop(); }
function musicStart(w) {
  if (!music) return;
  if (!save.opts.music || !save.opts.musicVol) { music.stop(); return; }
  musicWorld = w;
  music.setVolume(musicLevel());
  music.playWorld(w, MUSIC_STYLES[save.opts.musicStyle] ? save.opts.musicStyle : 'world');
}
/* Developer tools only: step through the ten styles and see what each one is doing. */
function openMusicLab() {
  if (!music) return;
  const ids = Object.keys(PuzzleMusic.STYLES);
  let i = Math.max(0, ids.indexOf((music.info().style) || PuzzleMusic.WORLD_STYLES[musicWorld % 10]));
  const play = () => { music.setVolume(musicLevel() || 0.2); music.play(ids[i], { seed: musicWorld }); };
  const row = (k, v) => `<div style="display:flex;gap:10px"><b style="min-width:92px">${k}</b><span>${v}</span></div>`;
  const show = inf => {
    const box = document.getElementById('musicLabInfo'); if (!box) return false;
    box.innerHTML = !inf.playing ? row('State', 'stopped') :
      row('Style', inf.name) + row('Mode', inf.mode) + row('Key', inf.key + ' ' + inf.scale) + row('Tempo', inf.tempo + ' bpm, ' + inf.meter) +
      row('Section', inf.section == null ? '' : inf.section + ', loop ' + inf.loop) + row('Chord', inf.chord || '') + row('Layers', (inf.layers || []).join(', ')) +
      row('Voices', inf.voices) + row('Audio', inf.audio) + row('Cycle', inf.cycleSeconds + ' s') + row('Progression', inf.progression);
    return true;
  };
  const render = () => {
    openModal('<h3>Music lab</h3><div id="musicLabInfo" class="desc" style="text-align:left;font-size:13px"></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">' +
      '<button class="btn" data-act="prev">Previous</button><button class="btn" data-act="next">Next</button>' +
      '<button class="btn" data-act="toggle">' + (music.isPlaying() ? 'Stop' : 'Play') + '</button>' +
      '<button class="btn" data-act="solve">Solved cue</button><button class="btn" data-act="close">Close</button></div>', {
      prev: () => { i = (i + ids.length - 1) % ids.length; play(); render(); },
      next: () => { i = (i + 1) % ids.length; play(); render(); },
      toggle: () => { music.isPlaying() ? music.stop() : play(); render(); },
      solve: () => music.onPuzzleSolved(),
      close: () => { closeModal(); save.opts.music ? musicStart(musicWorld) : musicStop(); }
    });
    show(music.info());
  };
  render();
  const off = music.debug.subscribe(inf => { if (!show(inf)) off(); });
}
/* ---------- animated world background behind the board ---------- */
function drawWorldBackdrop(now) {
  if (save.opts.reducedMotion) return;
  const w = view.w, h = view.h, world = G.w;
  ctx.save();
  ctx.globalAlpha = 0.5;
  const t = now / 1000;
  const c = WORLDS[world].color;
  const n = 14;
  for (let i = 0; i < n; i++) {
    const seed = i * 97.13;
    let x, y, r = 3 + (i % 4);
    if (world === 1) {                                   // clock tower: turning gears
      x = (i % 4) * w / 3.2 + 20; y = ((i * 53) % h);
      ctx.strokeStyle = c + '22'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 16 + (i % 3) * 8, t * (i % 2 ? 0.3 : -0.3) + seed, t * (i % 2 ? 0.3 : -0.3) + seed + 4.4); ctx.stroke();
      continue;
    }
    if (world === 2 || world === 5) {                    // ripples / snow
      x = (seed * 7.3) % w; y = world === 5 ? ((t * 22 + seed * 3) % (h + 40)) - 20 : (seed * 3.1) % h;
      ctx.fillStyle = c + (world === 5 ? '33' : '1f');
      ctx.beginPath(); ctx.arc(x, y + (world === 2 ? Math.sin(t + i) * 6 : 0), world === 5 ? 2.5 : 10 + Math.sin(t * 1.5 + i) * 4, 0, Math.PI * 2);
      world === 5 ? ctx.fill() : (ctx.strokeStyle = c + '22', ctx.lineWidth = 1.5, ctx.stroke());
      continue;
    }
    if (world === 3 || world === 9) {                    // stars / blueprint dots
      x = (seed * 11.7) % w; y = (seed * 5.9) % h;
      ctx.globalAlpha = 0.25 + 0.25 * Math.abs(Math.sin(t * 1.3 + i));
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5;
      continue;
    }
    // meadow, gates, boomerang, jungle, castle: drifting shapes
    x = ((seed * 9.1) + t * (10 + (i % 3) * 6)) % (w + 60) - 30;
    y = (seed * 6.7) % h + Math.sin(t * 0.8 + i) * 8;
    ctx.fillStyle = c + '1a';
    ctx.beginPath();
    if (world === 7) { ctx.ellipse(x, y, 14, 5, Math.sin(t + i) * 0.6, 0, Math.PI * 2); }
    else ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* =========================================================
   GAMEPLAY
   ========================================================= */
/* =========================================================
   GAMEPLAY
   ========================================================= */
/* =========================================================
   GAMEPLAY
   ========================================================= */
const canvas = $('#board');
const ctx = canvas.getContext('2d');
const fxCanvas = $('#fx');
const fxCtx = fxCanvas.getContext('2d');
let G = null;
const view = { cs: 30, scale: 1, panX: 0, panY: 0, w: 0, h: 0 };

/* ---------- words of encouragement ---------- */
const PRAISE = {
  first: ['Great start!', 'You found the opening!', 'Nice move!', 'That is the one!', 'Wonderful!'],
  good: ['Great!', 'Excellent!', 'Fabulous!', 'Wonderful!', 'Superb!', 'Beautiful!', 'Well done!', 'Perfect!',
         'Brilliant move!', 'Great thinking!', 'You cleared the path!', 'Sharp!', 'Unbelievable!', 'Magnificent!'],
  only: ['You found the only opening!', 'Sharp eye!', 'The single way through!', 'Exactly the right arrow!', 'Perfect move!'],
  opened: ['Path opened!', 'A new way appears!', 'That freed another arrow!'],
  chain: ['Chain reaction!', 'The structure is unravelling!', 'Three paths at once!', 'Spectacular!'],
  near: ['Almost there!', 'Just a few left!', 'Nearly clear!'],
  last: ['ONE MORE!'],
  fail: ['That path is blocked.', 'Try another route.', 'The arrow cannot escape yet.', 'Look closely at the path.',
         'You are getting closer.', 'Give it another try!'],
  win: ['You found the way out!', 'Brilliant! The path is clear!', 'Every arrow escaped!', 'Wonderful escape!'],
  perfect: ['PERFECT ESCAPE!', 'Flawless! Three stars!', 'Unbelievable! Not a single crash!']
};
/* a small shape or emoji for each kind of moment, so the strip reads at a glance */
const PRAISE_MARK = {
  first: ['\u2728', '\uD83D\uDC4D', '\uD83C\uDFAF'],
  good: ['\u2705', '\uD83D\uDC4C', '\u2B50', '\uD83D\uDD39', '\uD83D\uDCA1'],
  only: ['\uD83C\uDFAF', '\uD83D\uDC41\uFE0F', '\uD83D\uDD0D'],
  opened: ['\uD83D\uDD13', '\u27A1\uFE0F', '\uD83D\uDEAA'],
  chain: ['\u26A1', '\uD83C\uDF00', '\uD83D\uDCA5'],
  near: ['\uD83D\uDD25', '\u23F3'],
  last: ['\uD83C\uDFC1'],
  fail: ['\uD83D\uDEAB', '\u26D4', '\uD83D\uDD12'],
  win: ['\uD83C\uDF89'],
  perfect: ['\uD83C\uDFC6']
};
const pick = a => a[Math.floor(Math.random() * a.length)];
let praiseTimer = null;
function praise(text, big, mark, hold) {
  const el = $('#praise');
  el.textContent = (mark ? mark + ' ' : '') + text;
  el.classList.toggle('big', !!big);
  el.classList.add('show');
  clearTimeout(praiseTimer);
  praiseTimer = setTimeout(() => el.classList.remove('show'), hold || (big ? 1600 : 1200));
}
function maybePraise(kind, forced) {
  if (!G) return;
  const rate = G.w === 0 ? 0.8 : G.w === 1 ? 0.45 : 0.25;
  if (forced || Math.random() < rate) praise(pick(PRAISE[kind]), false, pick(PRAISE_MARK[kind] || ['\u2705']));
}

/* ---------- haptics: a different pattern for every event and mechanic ---------- */
const HAPTIC = {
  tap: 12, exit: 18, gap: [10, 30, 10], blocked: [50, 40, 50], locked: [15, 40, 15], gate: [30, 30, 30],
  slide: [8, 20, 24], boom: [18, 40, 18], hungry: [10, 25, 10], clock: [8, 30, 8], portal: [12, 24, 12],
  mirror: [10, 20, 10], design: 14, chain: [20, 40, 20, 40, 30], unlock: [12, 30, 12],
  last: [40, 60, 40], win: [40, 50, 40, 50, 90], stars3: [30, 40, 30, 40, 30, 40, 120],
  timer: [15, 90, 15], fail: [90, 60, 90], badge: [20, 40, 20, 40, 60]
};
/* The few events that are an outcome rather than a touch. Android gives these their own
   notification feel, which carries further than a plain buzz of the same length. */
const HAPTIC_NOTIFY = { win: 'SUCCESS', stars3: 'SUCCESS', badge: 'SUCCESS', fail: 'ERROR', timer: 'WARNING' };
function haptic(name) {
  if (!save.vibro || !save.opts.vibroVol) return;
  const k = save.opts.vibroVol / 70;
  let v = HAPTIC[name] || 15;
  v = Array.isArray(v) ? v.map(x => Math.max(5, Math.round(x * k))) : Math.max(5, Math.round(v * k));
  const H = nativePlugin('Haptics');
  if (H) { nativeHaptic(H, name, v); return; }
  try { if (navigator.vibrate) navigator.vibrate(v); } catch (e) {}   // browser, and older WebViews
}
/* navigator.vibrate is unreliable in a WebView, so the plugin plays the table instead. The table
   stays the one description of how each event feels, and the level slider still scales it: a
   quieter setting shortens the pattern, which also softens the impact style chosen for it. */
function nativeHaptic(H, name, v) {
  const fire = fn => { try { const r = fn(); if (r && r.catch) r.catch(() => {}); } catch (e) {} };
  const kind = HAPTIC_NOTIFY[name];
  if (kind) return fire(() => H.notification({ type: kind }));
  if (!Array.isArray(v)) {
    const style = v <= 12 ? 'LIGHT' : v <= 24 ? 'MEDIUM' : 'HEAVY';
    return fire(() => H.impact({ style }));
  }
  /* A pattern reads on, off, on, off, so only the even entries buzz. */
  let at = 0;
  for (let i = 0; i < v.length; i += 2) {
    const ms = v[i];
    setTimeout(() => fire(() => H.vibrate({ duration: ms })), at);
    at += ms + (v[i + 1] || 0);
  }
}
/* each world has its own mechanic haptic, played when its special arrows act */
function mechanicHaptic(kind) {
  const map = { clock: 'clock', slide: 'slide', boom: 'boom', hungry: 'hungry', design: 'design', key: 'unlock', lock: 'locked' };
  if (map[kind]) haptic(map[kind]);
}

/* ---------- confetti and flashes ---------- */
let fxParts = [];
function fxStyle() { return CELEBRATION_FX[save.opts.celebrationFx] || CELEBRATION_FX.confetti; }
/* a small burst where an arrow left the board */
/* One quiet mark for an ordinary release, drawn on the board in the colour of the world.
   No particles: the board has to stay readable while the player is still thinking. */
function releaseCue(r, now) {
  const cue = save.opts.releaseCue || 'glow';
  if (cue === 'none' || save.opts.reducedMotion) return;
  const col = WORLDS[G.w] ? WORLDS[G.w].color : '#1f9d61';
  if (cue === 'glow') {
    G.fx.push({ kind: 'cells', cells: r.old.cells.slice(), t0: now + 50, dur: 520, col });
  } else if (cue === 'flash') {
    G.fx.push({ kind: 'flash', cells: r.old.cells.slice(), t0: now, dur: 300, col });
  } else if (cue === 'ring') {
    const hc = r.old.cells[r.old.cells.length - 1];
    G.fx.push({ kind: 'ring', x: hc[0] + 0.5, y: hc[1] + 0.5, t0: now, dur: 420, col });
  } else if (cue === 'trail') {
    const hc = r.old.cells[r.old.cells.length - 1];
    G.fx.push({ kind: 'trail', col, t0: now, dur: 460,
      pts: [[hc[0] + 0.5, hc[1] + 0.5]].concat(r.tr.path.map(q => [q.x + 0.5, q.y + 0.5])) });
  }
}
function escapeBurst(sx, sy) {
  wakeLoop();
  if (save.opts.reducedMotion) return;
  const f = fxStyle();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.random() * 0.4, sp = 1.6 + Math.random() * 3.4;
    fxParts.push({ x: sx, y: sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2,
      g: f.shape === 'bubbles' ? -0.04 : 0.11, s: 5 + Math.random() * 6, r: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.35, c: f.colors[i % f.colors.length], shape: f.shape, life: 40 + Math.random() * 22 });
  }
  fxRings.push({ x: sx, y: sy, r: 6, life: 22, c: f.colors[0] });
}
/* an expanding ring at the point of escape, drawn under the particles */
let fxRings = [];
function confetti(n, colors) {
  wakeLoop();
  const w = fxCanvas.clientWidth || $('#app').clientWidth, h = fxCanvas.clientHeight || $('#app').clientHeight;
  const f = fxStyle();
  colors = f.colors.concat(colors || []);
  for (let i = 0; i < n; i++) {
    fxParts.push({ shape: f.shape, x: w * (0.2 + 0.6 * Math.random()), y: h * 0.3 + Math.random() * 40,
      vx: (Math.random() - 0.5) * 6, vy: -4 - Math.random() * 6, g: 0.22 + Math.random() * 0.12,
      s: 5 + Math.random() * 7, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)], life: 90 + Math.random() * 60 });
  }
}
function drawFx() {
  if (!fxParts.length && !fxRings.length) {
    if (fxCanvas.style.display !== 'none') { fxCanvas.style.display = 'none'; }
    return;
  }
  /* The canvas must be visible before it is measured: a hidden element reports a size of zero,
     which used to make every particle fall outside the layer and disappear on the first frame. */
  if (fxCanvas.style.display !== 'block') fxCanvas.style.display = 'block';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = fxCanvas.clientWidth || $('#app').clientWidth, h = fxCanvas.clientHeight || $('#app').clientHeight;
  if (fxCanvas.width !== Math.round(w * dpr)) { fxCanvas.width = Math.round(w * dpr); fxCanvas.height = Math.round(h * dpr); }
  fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fxCtx.clearRect(0, 0, w, h);
  fxRings = fxRings.filter(r => r.life > 0);
  for (const r of fxRings) {
    r.r += 3.4; r.life--;
    fxCtx.save();
    fxCtx.globalAlpha = Math.max(0, r.life / 30);
    fxCtx.strokeStyle = r.c; fxCtx.lineWidth = 3;
    fxCtx.beginPath(); fxCtx.arc(r.x, r.y, r.r, 0, Math.PI * 2); fxCtx.stroke();
    fxCtx.restore();
  }
  fxParts = fxParts.filter(p => p.life > 0 && p.y < h + 40);
  for (const p of fxParts) {
    p.x += p.vx; p.y += p.vy; p.vy += p.g; p.r += p.vr; p.life--;
    fxCtx.save(); fxCtx.translate(p.x, p.y); fxCtx.rotate(p.r);
    fxCtx.fillStyle = p.c; fxCtx.strokeStyle = p.c; fxCtx.globalAlpha = Math.max(0, Math.min(1, p.life / 40));
    const S = p.s;
    if (p.shape === 'circle') { fxCtx.beginPath(); fxCtx.arc(0, 0, S / 2, 0, Math.PI * 2); fxCtx.fill(); }
    else if (p.shape === 'star') {
      fxCtx.beginPath();
      for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5, rr2 = k % 2 ? S * 0.22 : S * 0.55;
        k ? fxCtx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2) : fxCtx.moveTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
      fxCtx.closePath(); fxCtx.fill();
    } else if (p.shape === 'bolt') {
      fxCtx.lineWidth = 2; fxCtx.beginPath();
      fxCtx.moveTo(0, -S / 2); fxCtx.lineTo(S * 0.2, 0); fxCtx.lineTo(-S * 0.15, S * 0.1); fxCtx.lineTo(S * 0.1, S / 2);
      fxCtx.stroke();
    } else if (p.shape === 'leaf') {
      fxCtx.beginPath(); fxCtx.ellipse(0, 0, S * 0.5, S * 0.26, 0, 0, Math.PI * 2); fxCtx.fill();
    } else fxCtx.fillRect(-S / 2, -S / 2, S, S * 0.6);
    fxCtx.restore();
  }
  fxCtx.globalAlpha = 1;
}

/* The screen a special board was opened from, so every way out of it goes back there rather
   than to a campaign level list the player never saw. */
function specialHome(sp) {
  const k = sp && sp.kind;
  return k === 'weekly' ? 's-weekly' : k === 'monthly' ? 's-monthly' : k === 'secret' ? 's-secrets' : 's-home';
}

/* Each world is a little tighter on time than the one before. The boards on the shelf keep their
   own limits and this is laid over them, so changing the curve needs no rebuild of levels.js.

   Version 1.1 takes a further slice off every world. The early worlds were the loosest by a wide
   margin, about 2.2 seconds an arrow against 1.7 in the last three, so they lose the most and the
   curve stays the right way up: roughly 1.8 seconds an arrow in Meadow down to 1.4 in Castle. */
const WORLD_TIME_STEP = 0.028;
const worldTimeCut = w => w < 3 ? 0.20 : w < 5 ? 0.22 : 0.18;

/* The daily, the weekly and the monthly are timed straight from their own size instead. They are
   built on the phone and are far larger than any campaign board, and the campaign formula gives a
   large board less and less time per arrow the later the world it borrows its mechanics from,
   which on a board of ninety arrows is the difference between demanding and impossible. Seconds
   per arrow is the number these boards are designed around, so it is the only number the clock is
   set from: no allowance is added for the mechanics on the board, because the campaign paces these
   are measured against already carry theirs. */
const SPECIAL_PACE = { daily: 1.40, weekly: 1.25, monthly: 1.80 };
function timeFor(L, w, special) {
  const pace = special && SPECIAL_PACE[special.kind];
  if (pace) return Math.max(30, Math.ceil(L.arrows.length * pace / 5) * 5);
  const t = L.timeLimit * (1 - WORLD_TIME_STEP * w) * (1 - worldTimeCut(w));
  return Math.max(20, Math.ceil(t / 5) * 5);
}

/* ---------- level start ---------- */
function startLevel(w, l, keepDesign, special) {
  if (G && G.guide) clearTimeout(G.guide.timer);
  if (special === true) special = { kind: 'daily' };
  /* Every special board is built on the phone and takes a second or more, the daily one now as
     well, so a message goes up first. Two frames let it paint before the build holds the main
     thread. */
  if (special && !special.built) {
    const sc = special.kind === 'secret' ? SECRETS.find(x => x.id === special.id) : null;
    const bd = special.kind === 'weekly' ? WEEKLY_BOARDS[special.idx] : sc;
    let cancelled = false;
    openModal(sc
      ? `<div class="medal">${sc.icon}</div><h3>Opening ${sc.name}</h3><p>This takes a moment.</p>`
      : bd
      ? `<div class="medal">${bd.icon}</div><h3>Building the ${bd.name.toLowerCase()} board</h3><p>This takes a moment.</p>`
      : special.kind === 'daily'
      ? '<h3>Building the board of the day</h3><p>This takes a moment.</p>'
      : '<h3>Building the board of the month</h3><p>A board this size takes a few seconds to lay out.</p>',
      { no: () => { cancelled = true; closeModal(); } });      // Back before the build starts cancels it
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (cancelled) return;
      closeModal();
      startLevel(w, l, keepDesign, Object.assign({}, special, { built: true }));
    }));
    return;
  }
  if (special && special.built) {
    special = Object.assign({}, special); delete special.built;
    if (special.kind === 'monthly') {       // counted here so a retry or a restart is an attempt too
      const m = save.monthly || (save.monthly = {});
      if (m.key !== monthKey()) { m.key = monthKey(); m.attempts = 0; m.best = 0; }
      m.attempts = (m.attempts || 0) + 1; persist();
    }
  }
  let L;
  try {
    if (!special) L = generateLevel(w, l);
    else if (special.kind === 'daily') L = generateDaily();
    else if (special.kind === 'monthly') L = generateMonthly();
    else if (special.kind === 'weekly') {
      const ch = currentChallenge(), i = special.idx, wk = weekNumber();
      w = (wk + i) % reachedFor('w' + wk); l = 6 + ((wk + i * 3) % 12);
      special.challenge = ch;
      if (!special.week) special.week = weekKey();
      L = generateLevel(w, l, wk * 10 + i + 1, p => { ch.apply(p, i); p.shape = WEEKLY_BOARDS[i].shape; denseBoard(24)(p); });
    } else {
      const sc = SECRETS.find(x => x.id === special.id);
      L = generateLevel(w, l, 9900 + special.id.length * 13, p => { p.shape = sc.shape; p.maxLen = Math.min(p.maxLen + 3, 18); });
    }
  } catch (e) { toast('This level could not be created.'); return; }
  const designIds = L.arrows.filter(a => a.kind === 'design').map(a => a.id);
  const designDirs = {};
  designIds.forEach(id => designDirs[id] = keepDesign && G && G.designDirs ? G.designDirs[id] : L.arrows[id].initDir);
  G = { w, l, L, special, daily: !!(special && special.kind === 'daily'), designDirs, S: makeState(L, designDirs), lives: L.lives || CFG.lives, maxLives: L.lives || CFG.lives, vis: {}, hint: null,
        hintStage: 0, hintPath: null, hintsUsed: 0, done: false, crashes: 0, crashed: new Set(), moves: 0, chain: 0, bestChain: 0,
        fx: [], design: designIds.length > 0,
        limit: timeFor(L, w, special) * 1000, left: timeFor(L, w, special) * 1000, extended: false, lastBeep: -1, warned: false,
        started: false, continues: 0 };
  G.baseLimit = G.limit;
  const daily = special && special.kind === 'daily';
  const boss = !special && l === CFG.levelsPerWorld - 1;
  const tag = special && special.kind === 'monthly' ? '<span class="newtag boss">MONTH</span>'
            : daily ? '<span class="newtag daily">DAILY</span>'
            : special && special.kind === 'weekly' ? '<span class="newtag daily">WEEKLY</span>'
            : special && special.kind === 'secret' ? '<span class="newtag boss">SECRET</span>'
            : boss ? '<span class="newtag boss">BOSS</span>'
            : l === 0 ? '<span class="newtag">INTRO</span>' : LEVEL_RHYTHM[l] === 'breather' ? '<span class="newtag calm">BREATHER</span>' : '';
  /* "an oval board", not "a oval board" */
  const shape = L.shape === 'rect' ? 'board' : L.shape + ' board';
  const art = L.shape === 'rect' || !'aeiou'.includes(L.shape[0]) ? 'a' : 'an';
  const title = special && special.kind === 'monthly' ? 'Puzzle of the Month'
    : daily ? "Today's Escape"
    : special && special.kind === 'weekly' ? special.challenge.name + ' ' + (special.idx + 1)
    : special && special.kind === 'secret' ? SECRETS.find(x => x.id === special.id).name
    : WORLDS[w].name + ' ' + (l + 1);
  $('#gameLabel').innerHTML = `${title}${tag}` +
    `<small id="gameCount">${L.arrows.length}/${L.arrows.length} arrows on ${art} ${shape}</small>`;
  G.shapeLabel = art + ' ' + shape;
  $('#designBar').classList.toggle('show', G.design);
  $('#btnRestart').disabled = G.daily;
  document.body.dataset.world = w;
  const gs = $('#s-game');
  gs.dataset.tint = '1';
  gs.style.setProperty('--wtint', WORLDS[w].tint + '55');
  tintBars();
  view.scale = 1; view.panX = 0; view.panY = 0;
  if (!special) { save.lastPlayed = { w, l }; persist(); }
  applyTheme();
  if (ensureAudio()) warmAudio();
  musicStart(w);
  if (music) music.onLevelStart();
  updateHud(); updateTimer(); resize();
  showScreen('s-game');
  const wantGuide = !special && w === 0 && l === 0 && !save.seenGuide;
  if (!special && !save.seenIntro[w]) {
    save.seenIntro[w] = true; persist();
    setTimeout(() => showRules(w, wantGuide ? () => setTimeout(startGuide, 350) : null), 150);
  } else if (wantGuide) setTimeout(startGuide, 500);
  else if (l === 0 && w === 0 && !special) setTimeout(() => praise('Find the arrow that can escape.', false, '\uD83D\uDD0D'), 600);
  /* The special boards are built behind a message, two frames after startLevel was called, so a
     caller with something to do once the board exists cannot simply do it on the next line. This
     runs when the board is up and G belongs to it. */
  if (special && special.onReady) special.onReady();
}

/* ---------- timer ---------- */
function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function quickOpen() { return !$('#quickPanel').classList.contains('hidden'); }
let appActive = true;                         // set from appStateChange; document.hidden alone is not dependable on Android
/* The clock waits for the first tap, so looking over a large board before starting is free. */
function timerRunning() { return G && G.started && !G.guide && !G.done && currentScreen === 's-game' && !modalOpen() && !quickOpen() && !document.hidden && appActive; }
let lastFrame = performance.now();
/* Twenty seconds to look the board over before the clock starts by itself, if no arrow has been
   tapped by then. Planning a whole board for free would make the time star meaningless. */
const LOOK_MS = 20000;
function tickTimer(now) {
  const dt = Math.min(250, now - lastFrame);
  lastFrame = now;
  if (G && !G.started) {
    const looking = !G.done && currentScreen === 's-game' && !modalOpen() && !quickOpen() && !document.hidden && appActive;
    if (looking && (G.lookMs = (G.lookMs || 0) + dt) >= LOOK_MS) {
      G.started = true; updateTimer();
      if (G.daily && !G.attemptSpent) { G.attemptSpent = true; spendDailyAttempt(); }
    }
    return;
  }
  if (!timerRunning()) return;
  G.left -= dt;
  const secs = Math.ceil(G.left / 1000);
  if (secs <= CFG.dangerSeconds && secs > 0 && secs !== G.lastBeep) {
    G.lastBeep = secs;
    sfx(secs <= 3 ? 'alarm' : 'beep');
    if (secs === CFG.dangerSeconds) { toast(CFG.dangerSeconds + ' seconds left. Hurry!'); haptic('timer'); }
    if (secs <= 3) haptic('tap');
  }
  if (!G.warned && G.left <= G.limit * CFG.warnShare && secs > CFG.dangerSeconds) {
    G.warned = true; toast('Time is running out.'); sfx('beep');
  }
  if (G.left <= 0) {
    G.left = 0; G.done = true; updateTimer();
    const ref = G;
    setTimeout(() => { if (G === ref) timeUp(); }, 250);
  }
  updateTimer();
}
function updateTimer() {
  if (!G) return;
  const row = $('#timerRow'), frac = Math.max(0, G.left / G.limit);
  $('#timerText').textContent = fmtTime(G.left);
  $('#timerFill').style.width = (frac * 100).toFixed(1) + '%';
  row.classList.toggle('waiting', !G.started);
  const danger = G.left <= CFG.dangerSeconds * 1000;
  const warn = !danger && frac <= CFG.warnShare;
  row.classList.toggle('danger', (danger && !G.done) || G.left <= 0);
  row.classList.toggle('warn', warn);
  $('#boardWrap').classList.toggle('danger', danger && !G.done);
}
document.addEventListener('visibilitychange', () => { lastFrame = performance.now(); quietInBackground(document.hidden); });
/* Nothing may sound while the game is not on screen: the drone styles hold a note that would
   otherwise go on humming behind the home screen. The context is suspended rather than the music
   stopped, so it picks up where it was. A video in progress has its own claim on the sound. */
function quietInBackground(away) {
  audioHold.away = away;
  if (!actx) return;
  try {
    if (away && actx.state === 'running') actx.suspend();
    else if (!away && !audioHeld() && actx.state === 'suspended') actx.resume();
  } catch (e) {}
}

function remaining() { return G.S.arr.filter(a => !a.gone).length; }
function updateHud() {
  if (!G) return;
  let h = '';
  for (let i = 0; i < G.maxLives; i++) h += i < G.lives ? '&#9829;' : '<span class="off">&#9829;</span>';
  $('#lives').innerHTML = h;
  const left = remaining();
  const box = $('#gameCount');
  if (box) {
    box.textContent = G.design ? 'Design phase: choose the directions, then press Start'
      : left + '/' + G.L.arrows.length + ' arrows on ' + (G.shapeLabel || 'a board');
    box.classList.toggle('endgame', !G.design && left > 0 && left <= 5);
  }
  $('#boardWrap').classList.toggle('endgame', !G.design && left > 0 && left <= 5);
  const hintsLeft = Math.max(0, CFG.maxHints - (G.hintsUsed || 0));
  /* the only thing that closes the hint button is running out of hints: without enough
     coins the player is offered a rewarded video instead */
  $('#btnHint').disabled = hintsLeft === 0;
  /* the button is an icon and the hints left, nothing more: the price is explained when it is
     tapped, where the player also chooses between coins and a video */
  $('#hintCount').textContent = hintsLeft;
  $('#btnHint').classList.toggle('empty', hintsLeft === 0);
  $('#btnHint').setAttribute('aria-label', hintsLeft + ' of ' + CFG.maxHints + ' hints left');
  const dbg = $('#debugBox');
  dbg.style.display = save.debug ? 'block' : 'none';
  if (save.debug) {
    const m = G.L.metrics || {};
    dbg.innerHTML = `shape ${G.L.shape} ${G.L.W}x${G.L.H} &middot; arrows ${G.L.arrows.length} &middot; first ${m.first}` +
      ` &middot; avg legal ${(m.avgMoves || 0).toFixed(1)} &middot; avg len ${(m.avgLen || 0).toFixed(1)}` +
      ` &middot; short ${(100 * (m.shortShare || 0)).toFixed(0)}% &middot; legal now ${legalMoves(G.S).length}`;
  }
}

/* ---------- view, zoom, panning ---------- */
function boardBounds(L) {
  return { x0: 0, y0: 0, w: L.W, h: L.H, cx: L.W / 2, cy: L.H / 2 };
}
function resize() {
  const wrap = $('#boardWrap');
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  view.w = w; view.h = h;
  if (G) {
    const b = boardBounds(G.L);
    G.bounds = b;
    const M = 0.5;
    view.cs = Math.min(w / (b.w + 2 * M), h / (b.h + 2 * M));
    clampPan();
  }
}
function clampPan() {
  if (!G || !G.bounds) return;
  /* The board is free to grow past every edge of the screen. Panning is held only loosely,
     so that a magnified board can be pushed until its far corner is reachable, while a corner
     of it always stays on screen and the player cannot lose the board entirely. */
  const k = view.cs * view.scale;
  const limX = Math.max(0, (G.bounds.w * k + view.w) / 2 - 40);
  const limY = Math.max(0, (G.bounds.h * k + view.h) / 2 - 40);
  view.panX = Math.max(-limX, Math.min(limX, view.panX));
  view.panY = Math.max(-limY, Math.min(limY, view.panY));
}
function b2s(bx, by) {
  const k = view.cs * view.scale, b = G.bounds;
  return [view.w / 2 + view.panX + (bx - b.cx) * k, view.h / 2 + view.panY + (by - b.cy) * k];
}
function s2b(sx, sy) {
  const k = view.cs * view.scale, b = G.bounds;
  return [(sx - view.w / 2 - view.panX) / k + b.cx, (sy - view.h / 2 - view.panY) / k + b.cy];
}
window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe($('#boardWrap'));

const pointers = new Map();
let gesture = null, tapCand = null, drag = null;
const TAP_SLOP = 14;                             // the distance a finger may wander and still be a tap
/* Gestures work in canvas coordinates throughout. A client coordinate is measured from the
   corner of the window, and the board sits below the heads up display and the timer and inside
   the screen padding, so the two differ by a few hundred pixels vertically. Anchoring a pinch to
   a client coordinate therefore pulled the board away from the fingers instead of holding it
   still beneath them, which is what made zooming feel as though it were fighting back. */
function localPt(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
canvas.addEventListener('pointerdown', e => {
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  const p = localPt(e);
  pointers.set(e.pointerId, p);
  if (pointers.size === 1) {
    tapCand = { x: p.x, y: p.y, t: performance.now() };
    drag = { x: p.x, y: p.y, panX0: view.panX, panY0: view.panY, on: false };
  }
  if (pointers.size === 2) {
    tapCand = null; drag = null;
    const pts = [...pointers.values()];
    gesture = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
                cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2,
                scale0: view.scale, panX0: view.panX, panY0: view.panY };
  }
});
canvas.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  const p = localPt(e);
  pointers.set(e.pointerId, p);
  if (pointers.size === 2 && gesture) {
    const pts = [...pointers.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;
    const s = Math.max(CFG.minZoom, Math.min(CFG.maxZoom, gesture.scale0 * dist / Math.max(1, gesture.dist)));
    const f = s / gesture.scale0;
    view.scale = s;
    view.panX = gesture.panX0 * f + (cx - gesture.cx) + (1 - f) * (gesture.cx - view.w / 2);
    view.panY = gesture.panY0 * f + (cy - gesture.cy) + (1 - f) * (gesture.cy - view.h / 2);
    clampPan();
  } else if (pointers.size === 1 && drag) {
    if (!drag.on && Math.hypot(p.x - drag.x, p.y - drag.y) > TAP_SLOP) drag.on = true;
    /* Only once the board is larger than the screen. At the resting size there is nowhere to
       go, and letting a fumbled tap shove the board about would be worse than doing nothing.
       A drag past the slop has already given up being a tap, so nothing is taken away. */
    if (drag.on && view.scale > 1.01) {
      view.panX = drag.panX0 + (p.x - drag.x);
      view.panY = drag.panY0 + (p.y - drag.y);
      clampPan();
    }
  }
  if (tapCand && Math.hypot(p.x - tapCand.x, p.y - tapCand.y) > TAP_SLOP) tapCand = null;
});
function endPointer(e) {
  const had = pointers.has(e.pointerId);
  pointers.delete(e.pointerId);
  if (pointers.size < 2) gesture = null;
  if (pointers.size === 0) drag = null;
  if (!had || !tapCand || pointers.size !== 0) { if (pointers.size === 0) tapCand = null; return; }
  const dt = performance.now() - tapCand.t;
  const q = localPt(e);                          // tapCand is in canvas coordinates, so this must be too
  const moved = Math.hypot(q.x - tapCand.x, q.y - tapCand.y);
  tapCand = null;
  if (dt > 900 || moved > TAP_SLOP) return;
  if (!G || G.done || modalOpen()) return;
  const [bx, by] = s2b(q.x, q.y);
  const cx = Math.floor(bx), cy = Math.floor(by);
  if (cx < 0 || cy < 0 || cx >= G.L.W || cy >= G.L.H) return;
  const id = G.S.occ[cy * G.L.W + cx];
  if (id >= 0) { tapArrow(id); return; }
  let best = -1, bd = 0.9;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= G.L.W || ny >= G.L.H) continue;
    const o = G.S.occ[ny * G.L.W + nx];
    if (o < 0) continue;
    const d = Math.hypot(nx + 0.5 - bx, ny + 0.5 - by);
    if (d < bd) { bd = d; best = o; }
  }
  if (best >= 0) tapArrow(best);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); gesture = null; tapCand = null; drag = null; });

function vis(id) { return G.vis[id] || (G.vis[id] = {}); }

function tapArrow(id) {
  poke();
  const now = performance.now();
  if (!G.started) { G.started = true; lastFrame = now; updateTimer(); }
  /* the daily attempt is spent by the first tap, so leaving a board that is going badly and
     opening it again is not a second go */
  if (G.daily && !G.attemptSpent) { G.attemptSpent = true; spendDailyAttempt(); }
  const kind = G.L.arrows[id].kind;
  if (G.design) {
    if (kind !== 'design') { toast('Choose the directions of the dashed tiles, then press Start.'); return; }
    const d = (G.designDirs[id] + 1) % 4;
    G.designDirs[id] = d; G.S.arr[id].dir = d;
    vis(id).rot = { t0: now }; sfx('tick'); haptic('design');
    return;
  }
  if (vis(id).anim) return;
  if (G.hint && G.hint.id === id) { G.hint = null; G.hintPath = null; }
  const before = legalMoves(G.S);
  const beforeIds = new Set(before.map(m => m.id));
  const r = doTap(G.S, id);
  const V = vis(id);
  if (r.type === 'exit') {
    const P = makePoly(r.old.cells, r.old.dir, r.tr, 26);
    const max = r.tr.path.length + r.old.cells.length + 2;
    V.anim = { kind: 'exit', t0: now, dur: 170 + max * 24, max, P };
    /* the quiet mark of a release is pushed by releaseCue below */
    for (const k of r.fx.rot) vis(k).rot = { t0: now + 80 };
    for (const k of r.fx.grow) vis(k).grow = { t0: now + 60 };
    sfx('whoosh'); haptic('exit');
    if (r.fx.rot.length) { setTimeout(() => { sfx('tick'); haptic('clock'); }, 120); }
    if (r.tr.path.some(q => q.gap)) haptic('gap');
    G.moves++; G.chain++;
    if (G.chain > G.bestChain) G.bestChain = G.chain;
    const left = remaining();
    if (music) music.onPuzzleProgress(1 - left / G.L.arrows.length);   // a little more movement as the board empties
    const after = legalMoves(G.S);
    const opened = after.filter(m => !beforeIds.has(m.id));
    if (G.reveal) {                     // only the arrows near the one that just left
      const near = opened.filter(m => {
        const c = G.S.arr[m.id].cells[G.S.arr[m.id].cells.length - 1];
        return r.old.cells.some(([x, y]) => Math.abs(x - c[0]) + Math.abs(y - c[1]) <= CFG.revealRadius);
      });
      for (const m of near.slice(0, 4)) vis(m.id).unlock = { t0: now + 260 };
    }
    releaseCue(r, now);
    if (G.guide) guideAdvance();
    if (left === 0) {
      G.done = true;
      praise('CLEAR!', true, '\uD83C\uDF89'); celebrateClear(); haptic('win');
      /* the celebration is the game's own rising sweeps (sfx clear, then win or fanfare); the music
         only settles, it adds no chord of its own */
      if (music) music.onLevelComplete();
      /* the celebration effect belongs to the last arrow of the board, and to nothing smaller */
      try {
        const hc = r.old.cells[r.old.cells.length - 1];
        const pt = b2s(hc[0] + 0.5, hc[1] + 0.5);
        const cr = canvas.getBoundingClientRect(), ar = $('#app').getBoundingClientRect();
        escapeBurst(pt[0] + cr.left - ar.left, pt[1] + cr.top - ar.top);
      } catch (e) {}
      confetti(70, [WORLDS[G.w].color, '#f2b01e', '#2f9e6b', '#d6336c', '#3f7fd0']);
      /* The result waits for the celebration, but the win must not depend on the player staying
         to watch it: leaving in that moment brings the result forward instead of losing it. */
      G.winPending = true;
      const ref = G; G.winTimer = setTimeout(() => { if (G === ref && G.winPending) winLevel(); }, 950);
    } else {
      if (left === 1) { praise(pick(PRAISE.last), true, '\uD83C\uDFC1'); haptic('last'); }
      else if (G.moves === 1) maybePraise('first', G.w === 0);
      else if (opened.length >= 3) { praise(pick(PRAISE.chain), true, '\u26A1'); haptic('chain'); }
      else if (before.length === 1) maybePraise('only', true);
      else if (opened.length >= 1 && Math.random() < 0.5) { maybePraise('opened', G.w === 0); haptic('unlock'); }
      else if (left <= 4) maybePraise('near');
      else maybePraise('good');
      checkStuck();
    }
  } else if (r.type === 'boom') {
    const P = makePoly(r.old.cells, r.old.dir, r.tr, 26);
    const max = r.tr.path.length + r.old.cells.length + 1;
    V.anim = { kind: 'boom', t0: now, dur: 420 + max * 40, max, P, color: KIND_COL.boom };
    sfx('boom'); haptic('boom'); checkStuck();
  } else if (r.type === 'slide') {
    const P = makePoly(r.old.cells, r.old.dir, r.tr, 1);
    V.anim = { kind: 'slide', t0: now, dur: 150 + r.m * 55, max: r.m, P };
    sfx('slide'); haptic('slide'); checkStuck();
  } else if (r.type === 'locked') {
    V.flash = { t0: now, dur: 700, kind: 'lock' };
    vis(r.keyId).flash = { t0: now, dur: 700, kind: 'key' };
    toast('Locked. Release key arrow ' + G.L.arrows[id].pair + ' first.');
    sfx('tick'); haptic('locked');
    return;
  } else if (r.type === 'crash' || r.type === 'gate') {
    const P = makePoly(r.old.cells, r.old.dir, r.tr, r.type === 'gate' ? 2 : 1);
    const max = r.tr.path.length + (r.type === 'gate' ? 0.75 : 0.3);
    V.anim = { kind: 'bump', t0: now, dur: 280 + max * 45, max, P };
    V.flash = { t0: now, dur: 420 + max * 45, kind: 'bad' };
    if (r.tr.by >= 0 && r.tr.by !== id) vis(r.tr.by).flash = { t0: now + max * 40, dur: 700, kind: 'blocker' };
    sfx('bump');
    const repeat = G.crashed.has(id);
    if (repeat) {                                   // the same arrow again is not counted as a new mistake
      haptic('tap');
      toast('Still blocked. This does not cost a life.');
    } else {
      G.crashed.add(id);
      G.chain = 0;
      G.lives--; G.crashes++;
      haptic(r.type === 'gate' ? 'gate' : 'blocked');
      if (r.type === 'gate') toast('Wrong exit: this arrow needs a gate of its own colour.');
      else if (r.tr.loop) toast('This flight path loops forever.');
      else if (r.tr.self) toast('This arrow would hit its own body.');
      else praise(pick(PRAISE.fail), false, pick(PRAISE_MARK.fail));
      if (G.lives <= 0) { G.done = true; const ref = G; setTimeout(() => { if (G === ref) loseLevel(); }, 750); }
    }
    updateHud();
    return;
  }
  updateHud();
}

/* No legal move with arrows still on the board: the clock stops at once, and the player is
   offered a free restart rather than a paid continue that could not help. */
function checkStuck() {
  if (remaining() === 0 || legalMoves(G.S).length > 0) return;
  G.done = true;
  const ref = G;
  setTimeout(() => {
    if (G !== ref) return;
    sfx('lose'); haptic('fail');
    monthlyAttemptEnd();
    const sp = G.special, w = G.w, l = G.l;
    if (G.daily) spendDailyAttempt();
    const again = !G.daily;
    openModal(`<h3>No moves left</h3><p>Every arrow still on the board is blocked, so it cannot be finished from here.${again ? ' A restart is free.' : ' That was today\'s attempt.'}</p>
      <div class="stack">${again ? '<button class="btn primary" data-act="retry">Restart level</button>' : ''}
      <button class="btn" data-act="levels">${sp ? 'Back' : 'Level list'}</button></div>`, {
      retry: () => { closeModal(); startLevel(w, l, true, sp || false); },
      levels: () => { closeModal(); selWorld = w; G = null; showScreen(sp ? specialHome(sp) : 's-levels'); }
    });
  }, 900);
}

$('#btnStart').onclick = () => {
  if (!G || !G.design) return;
  const lock = () => {
    G.design = false;
    G.S = makeState(G.L, G.designDirs);
    G.started = true;                            // designing was already part of the attempt
    $('#designBar').classList.remove('show');
    updateHud();
    toast('Design locked. Clear the board.');
  };
  /* A design that cannot be finished would only be discovered many taps later, so it is tried
     here first. Many designs work; this only stops one that has no way out. */
  if (designIsOff()) {
    /* the check can take a moment, so it is said out loud and runs once the message is up */
    openModal('<h3>Checking your design</h3><p>This takes a moment.</p>');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      closeModal();
      if (!G || !G.design) return;
      if (solve(makeState(G.L, G.designDirs), 30000)) { lock(); return; }
      openModal('<h3>This design has no way out</h3><p>With the dashed tiles pointing this way, some arrows can never leave the board. Change a few tiles before you start.</p>' +
        '<div class="stack"><button class="btn primary" data-act="no">Change the tiles</button><button class="btn" data-act="yes">Start anyway</button></div>',
        { no: closeModal, yes: () => { closeModal(); lock(); } });
    }));
    return;
  }
  lock();
};
/* ---------- the guide: the first three releases of the very first board ----------
   The first level of Meadow teaches by showing. The board dims, a hand points at the arrow that
   goes first, and a line says why. If the player has not tapped it after fifteen seconds the hand
   presses it itself, so nobody can be stuck on the first move of the game. The clock does not run
   while the guide is talking, the guide costs no hints and no coins, and it is shown once.
   The arrow is worked out again at every step, because an automatic release can change what comes
   next, exactly as a player's own choice would. */
const GUIDE_STEPS = 3, GUIDE_WAIT = 15000;
const GUIDE_LINES = [
  'Tap this arrow: its way out is clear.',
  'That opened a way for this one. Tap it.',
  'Each release opens the next. Tap this one.'
];
const GUIDE_AUTO = 'Watch: this one can leave.';
function guideOn() { return !!(G && G.guide); }
function startGuide() {
  if (!G || G.done || save.seenGuide) return;
  G.guide = { step: 0 };
  guideStep();
}
function guideStep() {
  if (!G || !G.guide || G.done) return;
  const plan = solve(cloneS(G.S), 4000);
  if (!plan || !plan.length) return endGuide();
  const id = plan[0].id;
  G.guide.id = id;
  G.hint = { id, until: performance.now() + 3600e3, type: plan[0].type };   // the same mark a hint draws
  G.hintPath = null;
  praise(GUIDE_LINES[G.guide.step] || GUIDE_LINES[2], false, '\uD83D\uDC46', GUIDE_WAIT);
  poke();
  const ref = G, step = G.guide.step;
  clearTimeout(G.guide.timer);
  G.guide.timer = setTimeout(() => {
    if (G !== ref || !G.guide || G.guide.step !== step || G.done) return;
    G.guide.press = performance.now();                  // the hand presses, then the arrow goes
    praise(GUIDE_AUTO, false, '\uD83D\uDC46', 2500);
    poke();
    setTimeout(() => { if (G === ref && G.guide && G.guide.step === step && !G.done) tapArrow(id); }, 420);
  }, GUIDE_WAIT);
}
/* called after every release while the guide is running */
function guideAdvance() {
  if (!G || !G.guide) return;
  clearTimeout(G.guide.timer);
  G.guide.press = 0;
  G.guide.step++;
  const ref = G;
  if (G.guide.step >= GUIDE_STEPS) {
    setTimeout(() => { if (G === ref && G.guide) { endGuide(); praise('Now clear the rest of the board.', true, '\uD83C\uDFAF', 3000); } }, 900);
    return;
  }
  setTimeout(() => { if (G === ref && G.guide && !G.done) guideStep(); }, 900);   // after the flight
}
function endGuide() {
  if (!G || !G.guide) return;
  clearTimeout(G.guide.timer);
  G.guide = null; G.hint = null; G.hintPath = null;
  save.seenGuide = true; persist();
  poke();
}

/* progressive hints: highlight, then the flight path, then what it opens */
$('#btnHint').onclick = () => {
  if (!G || G.done) return;
  if (G.hintsUsed >= CFG.maxHints) { toast('You have used all ' + CFG.maxHints + ' hints for this level.'); return; }
  const deeper = G.hint && performance.now() < G.hint.until && G.hintStage < 3;
  const cost = G.design ? CFG.hintCost : deeper ? (G.hintStage === 1 ? CFG.hintStage2 : CFG.hintStage3) : CFG.hintCost;
  const label = G.design ? 'Reveal one tile' : deeper ? (G.hintStage === 1 ? 'Show the flight path' : 'Show what it opens') : 'Hint: which arrow can leave';
  /* Work the hint out before asking for payment, so coins or a video are never spent on a hint
     that turns out not to exist. Taps are blocked while the payment is open, so the board cannot
     change between this and the answer. */
  let plan = null;
  if (G.design) {
    if (!G.L.arrows.some(a => a.kind === 'design' && G.designDirs[a.id] !== a.trueDir)) {
      toast('Your design matches a known solution. Press Start.'); return;
    }
  } else if (!deeper) {
    plan = findPlan();
    if (!plan || !plan.length) {
      toast(designIsOff()
        ? 'Your dashed tiles do not lead every arrow out. Restart the level and try another design.'
        : 'No solution was found from here. Restart the level.');
      return;
    }
  }
  askPayment(label, cost, () => applyHint(deeper, plan));
};
/* A quick search first, then a deeper one: most boards answer in a few milliseconds, and the
   larger budget is only spent when the first one runs out. */
function findPlan() {
  return solve(cloneS(G.S), 4000) || solve(cloneS(G.S), 30000);
}
/* On an Architect board the player may lock in a design other than the one the board was built
   with. Many designs work, but one that does not leaves no way out at all, and that is worth
   telling apart from an ordinary dead end. */
function designIsOff() {
  return G.L.arrows.some(a => a.kind === 'design' && G.designDirs[a.id] !== a.trueDir);
}
function applyHint(deeper, plan) {
  poke();
  const now = performance.now();
  if (G.design) {
    const wrong = G.L.arrows.filter(a => a.kind === 'design' && G.designDirs[a.id] !== a.trueDir);
    if (!wrong.length) { toast('Your design matches a known solution. Press Start.'); return; }
    const A = wrong[Math.floor(Math.random() * wrong.length)];
    G.designDirs[A.id] = A.trueDir; G.S.arr[A.id].dir = A.trueDir;
    vis(A.id).rot = { t0: now };
    G.hint = { id: A.id, until: now + 2500 };
    G.hintsUsed++; updateHud();
    return;
  }
  if (deeper) { G.hintStage++; G.hintsUsed++; }   /* a deeper step is one of the three hints as well */
  else {
    if (!plan) plan = solve(cloneS(G.S), 4000);
    if (!plan || !plan.length) { toast('No solution was found from here. Restart the level.'); return; }
    G.hintsUsed++;
    G.hint = { id: plan[0].id, until: now + 9000, type: plan[0].type };
    G.hintStage = 1;
  }
  const a = G.S.arr[G.hint.id];
  G.hint.until = now + 9000;
  if (G.hintStage >= 2) {
    const tr = trace(G.S, a);
    G.hintPath = { pts: [[a.cells[a.cells.length - 1][0] + 0.5, a.cells[a.cells.length - 1][1] + 0.5]]
      .concat(tr.path.map(q => [q.x + 0.5, q.y + 0.5])), until: now + 9000 };
  } else G.hintPath = null;
  if (G.hintStage >= 3) {
    const S2 = cloneS(G.S);
    const beforeIds = new Set(legalMoves(S2).map(m => m.id));
    doTap(S2, G.hint.id);
    legalMoves(S2).filter(m => !beforeIds.has(m.id)).slice(0, 4).forEach(m => vis(m.id).unlock = { t0: now });
    toast('These arrows open next.');
  } else {
    toast(G.hintStage === 1
      ? (G.hint.type === 'boom' ? 'Hint: send this boomerang out.' : G.hint.type === 'slide' ? 'Hint: slide this ice arrow.' : 'Hint: release this arrow. Tap Hint again to see its path.')
      : 'This is where it flies. Tap Hint again to see what it opens.');
  }
  haptic('tap');
  updateHud();
}
$('#btnZoom').onclick = () => {
  haptic('tap');
  if (view.scale <= 1.01 && Math.abs(view.panX) < 1 && Math.abs(view.panY) < 1) {
    /* nothing to reset: the board gives a small shake rather than a message */
    const bw = $('#boardWrap');
    bw.classList.remove('shake'); void bw.offsetWidth; bw.classList.add('shake');
    return;
  }
  view.scale = 1; view.panX = 0; view.panY = 0;
};
$('#btnRestart').onclick = () => {
  if (!G) return;
  if (G.daily) return;
  openModal('<h3>Restart this level?</h3><p>The board is rebuilt from the beginning. The timer returns to the full time and the arrows already released come back.</p>' +
            '<div class="mrow"><button class="btn" data-act="no">Keep playing</button><button class="btn primary" data-act="yes">Restart</button></div>',
    { no: () => { closeModal(); sfx('click'); },
      yes: () => { closeModal(); sfx('click'); haptic('tap'); startLevel(G.w, G.l, true, G.special || false); } });
};
$('#btnHelp').onclick = () => { if (G) showRules(G.w); };
$('#btnGameBack').onclick = () => {
  if (G && G.winPending) { winLevel(); return; }
  if (G && !G.done) monthlyAttemptEnd();       // leaving the monthly board still records how far it got
  selWorld = G ? G.w : 0;
  const sp = G && G.special;
  G = null; showScreen(sp ? specialHome(sp) : 's-levels');
};
$('#btnPause').onclick = () => {
  if (!G || G.done) return;
  openModal(`<h3>Paused</h3><p>The timer is stopped. ${fmtTime(G.left)} left.</p>
    <div class="stack"><button class="btn primary" data-act="resume">Resume</button>
    ${G.daily ? '' : '<button class="btn" data-act="restart">Restart level</button>'}
    ${G.special ? '<button class="btn" data-act="home">Home</button>' : '<button class="btn" data-act="levels">Level list</button>'}</div>
    ${rateInvite()}`, {
    home: () => { closeModal(); monthlyAttemptEnd(); const back = specialHome(G.special); G = null; showScreen(back); },
    resume: closeModal,
    rate: () => { closeModal(); openRating(); },
    restart: () => { closeModal(); startLevel(G.w, G.l, true, G.special || false); },
    levels: () => { closeModal(); selWorld = G.w; G = null; showScreen('s-levels'); }
  });
};

/* ---------- finishing a level ---------- */
/* A thirty second video for five extra coins is a poor trade to offer, so doubling is only
   offered when the reward is worth it. */
const DOUBLE_MIN = 10;
/* A fast finish is what the Launch Pad secret counts. It sits above the time star rather than at
   half the clock, which no longer happens on the tighter limits of version 1.1. */
const FAST_SHARE = 0.35;
function winLevel() {
  G.winPending = false; clearTimeout(G.winTimer);
  const w = G.w, l = G.l, n = G.L.arrows.length;
  const timeStar = !G.extended && G.left >= G.limit * CFG.timeStarShare;
  const noCrash = G.crashes === 0, noHint = G.hintsUsed === 0;
  const stars = 1 + (timeStar ? 1 : 0) + (noCrash ? 1 : 0);
  /* the board-clear piece is still ringing when the result appears, so no second sound joins it */
  haptic(stars === 3 ? 'stars3' : 'win');
  confetti(stars === 3 ? 90 : 45, [WORLDS[w].color, '#f2b01e', '#2f9e6b', '#d6336c', '#3f7fd0']);
  if (G.special && G.special.kind === 'monthly') return monthlyComplete(stars);
  if (G.daily) return dailyComplete(stars);
  if (G.special && G.special.kind === 'weekly') return weeklyComplete(G.special.idx, stars);
  if (G.special && G.special.kind === 'secret') return secretComplete(G.special.id, stars);
  const key = w + '-' + l;
  const prev = save.progress[key] || 0;
  const nextWasOpen = w + 1 < WORLDS.length && isWorldUnlocked(w + 1);
  /* A first clear pays the base and its stars; coming back for more stars pays for the stars
     that are new, never the whole reward again. */
  const reward = stars <= prev ? 0 : prev ? 3 * (stars - prev) : 2 + 3 * stars + Math.floor(n / 30);
  save.progress[key] = Math.max(prev, stars);
  const m = save.mastery[key] || (save.mastery[key] = {});
  if (noCrash) m.noCrash = 1;
  if (timeStar) m.fast = 1;
  if (noHint) m.noHint = 1;
  m.shape = G.L.shape;
  save.adClears = (save.adClears || 0) + 1;     // one step closer to the next interstitial
  addCoins(reward);                             // which persists the count with the coins
  trackStats({ noHint, fast: !G.extended && G.left >= G.limit * FAST_SHARE, noCrash, chain: G.bestChain, shape: G.L.shape, w, l, stars,
               size: G.L.arrows.length, weekly: !!(G.special && G.special.kind === 'weekly') });
  const hasNext = l + 1 < CFG.levelsPerWorld;
  const st = worldStatus(w);
  const justUnlocked = w + 1 < WORLDS.length && !nextWasOpen && isWorldUnlocked(w + 1);
  let note = '';
  if (!justUnlocked && w + 1 < WORLDS.length && !save.testMode && !isWorldUnlocked(w + 1)) {
    const needStars = Math.max(0, CFG.unlockStars - st.stars);
    note = `<p style="font-size:13px">${needStars} more star${needStars > 1 ? 's' : ''} to open ${WORLDS[w + 1].name}.</p>`;
  }
  const check = (ok, text) => `<div class="mastery ${ok ? 'on' : ''}">${ok ? '&#10003;' : '&#9675;'} ${text}</div>`;
  if (justUnlocked) rememberOpenWorlds();
  const nav = () => (justUnlocked ? `<button class="btn primary" data-act="nextWorld">Enter ${WORLDS[w + 1].name}</button>` : '')
    + (hasNext ? `<button class="btn${justUnlocked ? '' : ' primary'}" data-act="next">Next level</button>`
      : justUnlocked ? '' : '<button class="btn primary" data-act="worlds">Back to worlds</button>')
    + '<button class="btn" data-act="replay">Replay</button><button class="btn" data-act="levels">Level list</button>';
  if (hasNext) warmNext(w, l + 1);            // while the player reads their stars
  /* Every way out of a cleared level passes the interstitial gate, which nearly always lets it
     straight through. A world opening is exempt: the celebration is the reward, and nothing is
     sold in front of it. */
  const leave = go => () => { closeModal(); if (justUnlocked) go(); else interstitialThen(go); };
  const navHandlers = {
    next: leave(() => startLevel(w, l + 1)),
    nextWorld: leave(() => startLevel(w + 1, 0)),
    replay: leave(() => startLevel(w, l)),
    worlds: leave(() => { G = null; showScreen('s-worlds'); }),
    levels: leave(() => { selWorld = w; G = null; showScreen('s-levels'); })
  };
  /* a first clear that lands on a milestone is a good moment to ask for a rating, once */
  const askRate = prev === 0 && rateMilestone();
  const timeLeft = G.left, bestChain = G.bestChain;
  let doubled = false;
  const showResult = () => openModal(`<div class="medal">${stars === 3 ? '🏅' : stars === 2 ? '🥈' : '👍'}</div>
    <div class="ribbon">${stars === 3 ? pick(PRAISE.perfect) : pick(PRAISE.win)}</div>
    <div class="stars">${'&#9733;'.repeat(stars)}<span class="off">${'&#9733;'.repeat(3 - stars)}</span></div>
    <div class="masteryBox">${check(true, 'Completed')}${check(noCrash, 'No crashes')}${check(timeStar, 'Fast escape')}${check(noHint, 'Hint free')}</div>
    <div class="scoreline">Time left <b>${fmtTime(timeLeft)}</b> &middot; ${n} arrows &middot; best chain ${bestChain}</div>
    ${reward ? `<div class="reward"><i class="coin-ic" style="width:24px;height:24px"></i>+${reward}</div>`
             : '<p style="font-size:13px">Improve your mastery to earn more coins: finish without crashes, faster, or without a hint.</p>'}
    ${note}
    <div class="stack">${reward >= DOUBLE_MIN && !doubled && videosOffered() ? '<button class="btn gold" data-act="double">&#9654; Watch a video to double your coins</button>' : ''}${nav()}</div>
    ${askRate && !save.rated ? rateInvite() : ''}`,
    Object.assign({
      double: () => {
        if (doubled) return; doubled = true;
        showRewardedAd('double', () => {
          addCoins(reward); sfx('coin');
          openModal(`<h3>Coins doubled</h3><p>Your balance is now ${save.coins} coins.</p><div class="stack">${nav()}</div>`, navHandlers);
        }, () => { doubled = false; showResult(); });
      },
      rate: () => { openRating(); showResult(); }
    }, navHandlers));
  showResult();
  if (justUnlocked) setTimeout(() => worldReveal(w, w + 1), 900);
  checkBadges();
}
/* Continues per board: enough to rescue a good attempt, not enough to buy any board outright.
   The daily has one, since it has only the one attempt. */
const MAX_CONTINUES = 2;
function continuesLeft() { return Math.max(0, (G.daily ? 1 : MAX_CONTINUES) - (G.continues || 0)); }
function failModal(title, text, contLabel, onCont) {
  sfx('lose'); haptic('fail');
  const w = G.w, l = G.l, sp = G.special;
  if (G.daily) spendDailyAttempt();
  const canCont = !!contLabel && continuesLeft() > 0;
  const cont = () => { G.continues = (G.continues || 0) + 1; onCont(); };
  const choices = () => openModal(`<h3>${title}</h3><p>${text}${canCont || !contLabel ? '' : ' There are no continues left on this board.'}</p>
    <div class="stack">
      ${canCont ? `<button class="btn gold" data-act="cont" ${save.coins < CFG.continueCost ? 'disabled' : ''}>${contLabel} <i class="coin-ic"></i>${CFG.continueCost}</button>
      ${videosOffered() ? `<button class="btn" data-act="ad">&#9654; Watch a video: ${contLabel.replace('Continue: ', '')}</button>` : ''}` : ''}
      ${sp && sp.kind === 'daily' ? '' : '<button class="btn primary" data-act="retry">Retry level</button>'}
      <button class="btn" data-act="levels">${sp ? 'Back' : 'Level list'}</button>
    </div>`, {
    cont: () => { if (!canCont || save.coins < CFG.continueCost) return; addCoins(-CFG.continueCost); closeModal(); cont(); },
    ad: () => { if (canCont) showRewardedAd('continue', cont, choices); },
    retry: () => { closeModal(); startLevel(w, l, true, sp || false); },
    levels: () => { closeModal(); selWorld = w; G = null; showScreen(sp ? specialHome(sp) : 's-levels'); }
  });
  choices();
}
/* the monthly board keeps a record of the best attempt, so progress is visible between tries */
function monthlyAttemptEnd() {
  if (!G || !G.special || G.special.kind !== 'monthly') return;
  const m = save.monthly || (save.monthly = {});
  if (m.key !== monthKey()) { m.key = monthKey(); m.attempts = 0; m.best = 0; }
  const cleared = Math.round(100 * (G.L.arrows.length - remaining()) / G.L.arrows.length);
  if (cleared > (m.best || 0)) m.best = cleared;
  persist();
}
function loseLevel() {
  monthlyAttemptEnd();
  /* the No Crash week is one life by its own rule, so it offers no second one */
  const oneLifeWeek = G.special && G.special.kind === 'weekly' && G.special.challenge && G.special.challenge.id === 'nocrash';
  failModal('Out of lives', (G.maxLives === 1 ? 'You crashed once.' : `You crashed ${G.maxLives} times.`) +
    (oneLifeWeek ? ' This week allows one life only, so try the board again.' : ' The path is still there, so try again.'),
    oneLifeWeek ? null : 'Continue: +1 life', () => { if (!G) return; G.lives = 1; G.done = false; updateHud(); });
}
/* Extra time is a share of the board's own limit, so it means the same on a small board and on
   the monthly one. It is a fifth: on a tighter clock a few seconds would not be worth a video,
   and the offer has to be a real way out of a board that is nearly finished. */
const EXTRA_SHARE = 0.20;
function extraSeconds() { return Math.max(3, Math.ceil(G.baseLimit / 1000 * EXTRA_SHARE)); }
function timeUp() {
  haptic('fail');
  monthlyAttemptEnd();
  const extra = extraSeconds();
  failModal('Time is up', `The ${fmtTime(G.baseLimit)} limit ran out with ${remaining()} arrows still on the board.`,
    `Continue: +${extra} seconds`,
    () => { if (!G) return; G.left += extra * 1000; G.limit = Math.max(G.limit, G.left); G.extended = true; G.done = false; G.lastBeep = -1; updateTimer(); });
}

/* ---------- world reveal ---------- */
/* A new world opening is the biggest moment in the game, so it gets the whole screen: the new
   world's colour, turning light rays, its emblem arriving, and waves of confetti and bursts.
   The player can go straight in, or stay and finish the world they are in. */
function worldReveal(from, to) {
  const W = WORLDS[to];
  const el = $('#reveal');
  el.style.setProperty('--rc', W.color);
  el.innerHTML = `<div class="revealRays"></div><div class="revealInner">
    <div class="revealSmall">A NEW WORLD OPENS</div>
    <div class="revealEmblem" style="${emblemStyle(W)}"><span>${W.icon}</span></div>
    <div class="revealBig">${W.name}</div>
    <div class="revealTag">${W.tagline}</div>
    <p class="revealDesc">${W.desc}</p>
    <div class="stack"><button class="btn big revealGo" id="revealGo">Enter ${W.name}</button>
    <button class="btn revealStay" id="revealStay">Stay in ${WORLDS[from].name}</button></div></div>`;
  el.classList.add('show');
  sfx('fanfare'); haptic('stars3');
  const colours = [W.color, '#f2b01e', '#ffffff', '#5fd3a6'];
  const waves = save.opts.reducedMotion ? 1 : 4;
  for (let i = 0; i < waves; i++) setTimeout(() => {
    if (!el.classList.contains('show')) return;
    confetti(i === 0 ? 110 : 60, colours);
    const r = $('#app').getBoundingClientRect();
    for (let k = 0; k < 3; k++) escapeBurst(r.width * (0.2 + 0.6 * Math.random()), r.height * (0.15 + 0.35 * Math.random()));
    if (i) sfx('coin');
  }, i * 650);
  const close = () => el.classList.remove('show');
  $('#revealGo').onclick = () => { close(); closeModal(); startLevel(to, 0); };
  $('#revealStay').onclick = () => { close(); haptic('tap'); };
}

/* ---------- puzzle of the month ---------- */
function monthlyState() {
  const m = save.monthly || (save.monthly = {});
  const key = monthKey();
  if (m.key && m.key !== key) { m.attempts = 0; m.best = 0; }   // a new month, a new board
  m.key = key;
  return { done: m.done === key, attempts: m.attempts || 0, best: m.best || 0, key, m };
}
function renderMonthly() {
  const st = monthlyState();
  const emblem = ['\uD83D\uDC51', '\uD83C\uDFF0', '\uD83E\uDD8B', '\uD83C\uDF33', '\uD83D\uDC7B', '\uD83D\uDE80',
                  '\uD83D\uDC1F', '\uD83D\uDC08', '\uD83C\uDF44', '\u26F5', '\uD83E\uDD16', '\uD83C\uDFC6'][new Date().getMonth()];
  $('#monthTitle').textContent = 'Puzzle of the Month';
  $('#monthCard').innerHTML = `
    <div class="monthHero"><span class="monthEmblem">${emblem}</span>
      <h3>${monthName()}</h3>
      <p>One enormous board of roughly two hundred arrows. It is the same board for the whole month, so you may
         come back to it as often as you like. ${CFG.monthlyLives} lives instead of the usual ${CFG.lives}.</p>
    </div>
    <div class="stack">
      <div class="monthStats">
        <div><b>${st.attempts}</b><span>attempts</span></div>
        <div><b>${st.done ? '\u2713' : '\u2014'}</b><span>cleared</span></div>
        <div><b>${st.best}%</b><span>best board cleared</span></div>
      </div>
      ${st.done ? `<p class="monthDone">\uD83C\uDF96\uFE0F Cleared. The ${monthName()} badge is in your badge case.</p>` : ''}
      <button class="btn primary big" id="btnMonthStart">${st.done ? 'Play it again' : 'Take on the board'}</button>
      <p class="desc" style="text-align:center">Clearing it pays ${CFG.monthlyReward} coins once and earns a badge that
         carries the name of the month. A new board is cast on the first day of every month.</p>
    </div>`;
  $('#btnMonthStart').onclick = () => startLevel(0, 0, false, { kind: 'monthly' });
}
function monthlyComplete(stars) {
  const st = monthlyState();
  const first = !st.done;
  st.m.done = st.key; st.m.key = st.key; st.m.stars = Math.max(st.m.stars || 0, stars); st.m.best = 100;
  if (first) addCoins(CFG.monthlyReward);
  save.stats.monthlies = (save.stats.monthlies || 0) + 1;
  save.badges['month-' + st.key] = Date.now();
  persist();
  openModal(`<div class="ribbon">Puzzle of the Month</div>
    <div class="stars">${'&#9733;'.repeat(stars)}<span class="off">${'&#9733;'.repeat(3 - stars)}</span></div>
    <p style="font-size:17px">\uD83C\uDF96\uFE0F ${monthName()} cleared</p>
    ${first ? `<div class="reward"><i class="coin-ic" style="width:24px;height:24px"></i>+${CFG.monthlyReward}</div>` : '<p>You have cleared this board before, so no further coins are paid.</p>'}
    <div class="stack"><button class="btn primary" data-act="home">Home</button></div>`,
    { home: () => { closeModal(); G = null; showScreen('s-home'); } });
  confetti(120, ['#f2b01e', '#e2b23a', '#2f9e6b', '#d6336c']);
  checkBadges();
}

/* ---------- daily puzzle ---------- */
function dailyKey(d) { d = d || new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
/* Yesterday by the calendar rather than 24 hours ago, which on the night the clocks change can
   land two days back and break a streak that was kept. */
function yesterdayKey() { const d = new Date(); d.setDate(d.getDate() - 1); return dailyKey(d); }
/* A streak only counts while it is alive: finished today or yesterday. */
function liveStreak() { const d = save.daily || {}; return d.last === dailyKey() || d.last === yesterdayKey() ? (d.streak || 0) : 0; }
/* The latest time this save has seen. Setting the phone's clock forward to take tomorrow's daily
   early and then back again shows up as the clock going backwards, and until real time catches
   up the daily and the weekly wait. Time zones do not matter: this is absolute time. */
function clockTurnedBack() {
  const now = Date.now();
  if (now + 10 * 60 * 1000 < (save.clockSeen || 0)) return true;
  if (now > (save.clockSeen || 0)) { save.clockSeen = now; persist(); }
  return false;
}
function clockNote() {
  openModal('<div class="medal">&#9200;</div><h3>The date on this phone has changed</h3><p>The clock on this phone has been set back. ' +
    'The daily and weekly puzzles return once the date catches up with the last time you played.</p>' +
    '<div class="stack"><button class="btn primary" data-act="ok">OK</button></div>', { ok: closeModal });
}
function spendDailyAttempt() { const d = save.daily || (save.daily = {}); d.tried = dailyKey(); persist(); }
function dailyComplete(stars) {
  const key = dailyKey();
  const d = save.daily;
  d.streak = (d.last === yesterdayKey()) ? (d.streak || 0) + 1 : 1;
  d.last = key; d.done = key; d.tried = key; d.stars = stars;
  const reward = CFG.dailyLadder[Math.min(d.streak - 1, CFG.dailyLadder.length - 1)];
  addCoins(reward); persist();
  trackStats({ daily: true });
  openModal(`<div class="ribbon">Daily Escape Complete</div>
    <div class="stars">${'&#9733;'.repeat(stars)}<span class="off">${'&#9733;'.repeat(3 - stars)}</span></div>
    <p style="font-size:17px">&#128293; ${d.streak} day streak</p>
    <div class="reward"><i class="coin-ic" style="width:24px;height:24px"></i>+${reward}</div>
    <p style="font-size:13px">A new board appears every day.</p>
    <div class="stack"><button class="btn primary" data-act="home">Home</button></div>`,
    { home: () => { closeModal(); G = null; showScreen('s-home'); } });
  checkBadges();
}

function weeklyComplete(idx, stars) {
  if (G.special.week && G.special.week !== weekKey()) {
    /* the week turned while this board was being played: it is paid, but it belongs to last
       week's set and must not tick off a board of the new one */
    addCoins(CFG.weeklyReward); persist();
    openModal(`<div class="medal">${WEEKLY_BOARDS[idx].icon}</div><div class="ribbon">Board cleared</div>
      <p>This board was from last week's challenge, which ended while you were playing. A new set is waiting.</p>
      <div class="reward"><i class="coin-ic" style="width:24px;height:24px"></i>+${CFG.weeklyReward}</div>
      <div class="stack"><button class="btn primary" data-act="back">See this week's set</button></div>`,
      { back: () => { closeModal(); G = null; showScreen('s-weekly'); } });
    return;
  }
  const st = weeklyState(), n = WEEKLY_BOARDS.length;
  const first = !st.done.includes(idx);
  if (first) st.done.push(idx);
  const better = stars > (st.stars[idx] || 0);
  st.stars[idx] = Math.max(st.stars[idx] || 0, stars);
  const all = first && st.done.length >= n;
  /* coins for a board once a week, and the set bonus once, never again for a replay */
  const reward = first ? CFG.weeklyReward + (all ? CFG.weeklyBonus : 0) : 0;
  addCoins(reward); persist();
  const bd = WEEKLY_BOARDS[idx];
  openModal(`<div class="medal">${all ? '\uD83C\uDFC6' : bd.icon}</div><div class="ribbon">${all ? 'Weekly challenge complete!' : bd.name + ' board cleared'}</div>
    <div class="stars">${'&#9733;'.repeat(stars)}<span class="off">${'&#9733;'.repeat(3 - stars)}</span></div>
    <p>${st.done.length} of ${n} boards this week.${!first && better ? ' A better result than last time.' : ''}</p>
    ${reward ? `<div class="reward"><i class="coin-ic" style="width:24px;height:24px"></i>+${reward}</div>` : ''}
    <div class="stack"><button class="btn primary" data-act="back">Back to the challenge</button></div>`,
    { back: () => { closeModal(); G = null; showScreen('s-weekly'); } });
  checkBadges();
}
function secretComplete(id, stars) {
  const sc = SECRETS.find(x => x.id === id);
  const first = !save.secrets[id];
  save.secrets[id] = Math.max(save.secrets[id] || 0, stars);
  /* coins for the first clear only, like every other board, so a replay cannot be farmed */
  const reward = first ? CFG.secretReward : 0;
  addCoins(reward); persist();
  confetti(70, ['#f2b01e']);
  openModal(`<div class="medal">${sc.icon}</div><div class="ribbon">${sc.name} cleared!</div>
    <div class="stars">${'&#9733;'.repeat(stars)}<span class="off">${'&#9733;'.repeat(3 - stars)}</span></div>
    ${reward ? `<div class="reward"><i class="coin-ic" style="width:24px;height:24px"></i>+${reward}</div>`
             : '<p>You have cleared this board before, so no further coins are paid.</p>'}
    <div class="stack"><button class="btn primary" data-act="back">Back to the secrets</button></div>`,
    { back: () => { closeModal(); G = null; showScreen('s-secrets'); } });
  checkBadges();
}

/* ---------- badges ---------- */
/* Totals and runs count different levels, so replaying one level cannot earn a badge or open a
   secret. A run keeps the levels it has counted and forgets them when it breaks. */
function countOnce(st, name, key) {
  const seen = st[name + 'Levels'] || (st[name + 'Levels'] = {});
  if (seen[key]) return false;
  seen[key] = 1; return true;
}
function runStep(st, name, ok, key) {
  if (ok === false) { st[name] = 0; st[name + 'Levels'] = {}; return; }
  if (ok && countOnce(st, name, key)) st[name] = (st[name] || 0) + 1;
}
function trackStats(e) {
  const st = save.stats;
  const key = e.w != null ? e.w + '-' + e.l : null;
  if (key) {
    runStep(st, 'noHintRun', e.noHint, key);
    if (e.fast && countOnce(st, 'fastCount', key)) st.fastCount = (st.fastCount || 0) + 1;
    runStep(st, 'noCrashRun', e.noCrash, key);
  }
  if (e.chain && e.chain > (st.bestChain || 0)) st.bestChain = e.chain;
  if (e.shape && (!key || countOnce(st, 'shape', key))) (st.shapes = st.shapes || {})[e.shape] = (st.shapes[e.shape] || 0) + 1;
  if (e.w === 5 && countOnce(st, 'ice', key)) st.ice = (st.ice || 0) + 1;
  if (e.w === 8 && countOnce(st, 'castle', key)) st.castle = (st.castle || 0) + 1;
  if (e.daily) st.dailies = (st.dailies || 0) + 1;
  if (e.weekly) st.weeklies = (st.weeklies || 0) + 1;
  if (e.noCrash && key && countOnce(st, 'noCrashTotal', key)) st.noCrashTotal = (st.noCrashTotal || 0) + 1;
  if (e.size && e.size > (st.biggestBoard || 0)) st.biggestBoard = e.size;
  /* a run of three star finishes, counted only while it is unbroken */
  if (key) runStep(st, 'starRun', e.stars === 3 ? true : e.stars ? false : undefined, key);
  if ((st.starRun || 0) > (st.bestStarRun || 0)) st.bestStarRun = st.starRun;
  persist();
}
/* =========================================================
   WORLD TROPHIES: a shelf with one cast trophy per world
   ========================================================= */
const TROPHY_TIERS = {
  none:   { name: 'Empty plinth', icon: '\u2b1c', body: '#cfcac0', dark: '#a49f95', light: '#e6e2da', need: 0 },
  bronze: { name: 'Bronze',       icon: '\uD83E\uDD49', body: '#c87f3a', dark: '#8f5520', light: '#e6a96a', need: 30 },
  silver: { name: 'Silver',       icon: '\uD83E\uDD48', body: '#b9bfc7', dark: '#878e97', light: '#e3e7ec', need: 45 },
  gold:   { name: 'Gold',         icon: '\uD83C\uDFC6', body: '#e2b23a', dark: '#a87d13', light: '#f7dd8a', need: 60 }
};
const TROPHY_ORDER = ['none', 'bronze', 'silver', 'gold'];
function trophyTier(w) {
  /* test mode casts a trophy on every plinth, cycling the three metals, so the shelf can be
     looked at without first earning sixty stars ten times over */
  if (save.testMode && worldStatus(w).stars < TROPHY_TIERS.bronze.need) return TROPHY_ORDER[1 + (w % 3)];
  const st = worldStatus(w).stars;
  if (st >= TROPHY_TIERS.gold.need) return 'gold';
  if (st >= TROPHY_TIERS.silver.need) return 'silver';
  if (st >= TROPHY_TIERS.bronze.need) return 'bronze';
  return 'none';
}
/* The trophy is drawn rather than written, so it reads as a real object standing on the shelf. */
function drawTrophy(cv, w) {
  const tier = trophyTier(w), T = TROPHY_TIERS[tier], W = WORLDS[w];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = cv.clientWidth || 96, ch = 118;
  cv.width = cw * dpr; cv.height = ch * dpr;
  const x = cv.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = cw / 2, empty = tier === 'none';
  /* shelf shadow under the trophy */
  x.fillStyle = 'rgba(0,0,0,.14)';
  x.beginPath(); x.ellipse(cx, ch - 12, 26, 5, 0, 0, Math.PI * 2); x.fill();
  const grad = x.createLinearGradient(cx - 22, 0, cx + 22, 0);
  grad.addColorStop(0, T.dark); grad.addColorStop(0.45, T.light); grad.addColorStop(1, T.body);
  x.globalAlpha = empty ? 0.5 : 1;
  /* plinth */
  x.fillStyle = '#6b5a45';
  x.beginPath(); x.roundRect(cx - 27, ch - 24, 54, 13, 3); x.fill();
  x.fillStyle = '#8a7358';
  x.beginPath(); x.roundRect(cx - 22, ch - 31, 44, 8, 2); x.fill();
  if (!empty) {
    /* stem */
    x.fillStyle = grad;
    x.beginPath(); x.moveTo(cx - 6, ch - 31); x.lineTo(cx - 4, ch - 48); x.lineTo(cx + 4, ch - 48); x.lineTo(cx + 6, ch - 31); x.closePath(); x.fill();
    /* cup */
    x.beginPath();
    x.moveTo(cx - 20, ch - 86);
    x.lineTo(cx + 20, ch - 86);
    x.quadraticCurveTo(cx + 19, ch - 54, cx, ch - 48);
    x.quadraticCurveTo(cx - 19, ch - 54, cx - 20, ch - 86);
    x.closePath(); x.fill();
    /* handles */
    x.strokeStyle = T.body; x.lineWidth = 4; x.lineCap = 'round';
    x.beginPath(); x.arc(cx - 23, ch - 78, 8, Math.PI * 0.55, Math.PI * 1.6, true); x.stroke();
    x.beginPath(); x.arc(cx + 23, ch - 78, 8, Math.PI * 1.45, Math.PI * 0.4, true); x.stroke();
    /* rim and highlight */
    x.fillStyle = T.light;
    x.beginPath(); x.roundRect(cx - 22, ch - 90, 44, 6, 3); x.fill();
    x.globalAlpha = 0.35; x.fillStyle = '#fff';
    x.beginPath(); x.ellipse(cx - 8, ch - 72, 3.5, 11, -0.2, 0, Math.PI * 2); x.fill();
    x.globalAlpha = 1;
    /* the world icon on the face of the cup */
    x.font = '15px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(W.icon, cx, ch - 68);
    /* a star for every full world */
    if (tier === 'gold') {
      x.fillStyle = '#fff5cc'; x.font = '11px system-ui, sans-serif';
      x.fillText('\u2605', cx, ch - 96);
    }
  } else {
    x.globalAlpha = 0.6;
    x.strokeStyle = '#a49f95'; x.lineWidth = 2; x.setLineDash([4, 4]);
    x.beginPath(); x.roundRect(cx - 20, ch - 88, 40, 42, 8); x.stroke();
    x.setLineDash([]);
  }
  x.globalAlpha = 1;
}
function renderTrophies() {
  const box = $('#trophyShelves');
  let html = '';
  for (let row = 0; row < 5; row++) {
    const pair = [row * 2, row * 2 + 1];
    html += '<div class="shelf">'
      + `<div class="shelfRow">${pair.map(w => `<canvas class="troCv" data-w="${w}"></canvas>`).join('')}</div>`
      + '<div class="shelfBoard"></div><div class="shelfRow">';
    for (const w of pair) {
      const W = WORLDS[w], tier = trophyTier(w), st = worldStatus(w);
      const locked = !isWorldUnlocked(w);
      const next = TROPHY_ORDER[TROPHY_ORDER.indexOf(tier) + 1];
      const note = save.testMode && st.stars < TROPHY_TIERS.bronze.need ? 'Test mode: shown as ' + TROPHY_TIERS[tier].name.toLowerCase()
        : locked ? 'World still locked'
        : tier === 'gold' ? 'Every star collected'
        : `${st.stars} / 60 stars &middot; ${TROPHY_TIERS[next].need - st.stars} more for ${TROPHY_TIERS[next].name.toLowerCase()}`;
      html += `<div class="tro ${tier}"><b style="color:${W.color}">${W.icon} ${W.name}</b>
        <span class="troTier">${tier === 'none' ? 'Empty plinth' : TROPHY_TIERS[tier].name}</span>
        <span class="troNote">${note}</span></div>`;
    }
    html += '</div></div>';
  }
  box.innerHTML = html;
  box.querySelectorAll('.troCv').forEach(cv => drawTrophy(cv, +cv.dataset.w));
  const counts = { gold: 0, silver: 0, bronze: 0 };
  for (let w = 0; w < WORLDS.length; w++) { const t = trophyTier(w); if (counts[t] !== undefined) counts[t]++; }
  $('#trophySummary').innerHTML = `Gold ${counts.gold} &middot; Silver ${counts.silver} &middot; Bronze ${counts.bronze} &middot; ` +
    `${WORLDS.length - counts.gold - counts.silver - counts.bronze} plinths still empty.`;
}

const BADGES = [
  { id: 'sharpEye', icon: '🧠', name: 'Sharp Eye', desc: 'Complete 10 levels without a hint', test: st => (st.noHintRun || 0) >= 10 },
  { id: 'speed', icon: '⚡', name: 'Speed Solver', desc: 'Complete 10 levels with a third of the time left', test: st => (st.fastCount || 0) >= 10 },
  { id: 'streak', icon: '🎯', name: 'Perfect Streak', desc: 'Complete 5 levels in a row without crashing', test: st => (st.noCrashRun || 0) >= 5 },
  { id: 'chain', icon: '🌀', name: 'Chain Master', desc: 'Release 10 arrows in a row without a crash', test: st => (st.bestChain || 0) >= 10 },
  { id: 'explorer', icon: '🔍', name: 'Explorer', desc: 'Clear 12 different board shapes', test: st => Object.keys(st.shapes || {}).length >= 12 },
  { id: 'tree', icon: '🌳', name: 'Shape Collector', desc: 'Clear 3 tree boards', test: st => (st.shapes && st.shapes.tree || 0) >= 3 },
  { id: 'ice', icon: '❄️', name: 'Ice Master', desc: 'Complete 20 Ice Cave levels', test: st => (st.ice || 0) >= 20 },
  { id: 'castle', icon: '🏰', name: 'Castle Master', desc: 'Complete all 20 Castle levels', test: st => (st.castle || 0) >= 20 },
  { id: 'daily7', icon: '🔥', name: 'Regular Escaper', desc: 'Finish 7 daily puzzles', test: st => (st.dailies || 0) >= 7 },
  { id: 'world3', icon: '🏅', name: 'Three Worlds', desc: 'Master three worlds', test: () => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(w => worldStatus(w).mastered).length >= 3 }
];
function checkBadges() {
  for (const b of BADGES) {
    if (save.badges[b.id]) continue;
    let ok = false;
    try { ok = b.test(save.stats); } catch (e) {}
    if (!ok) continue;
    save.badges[b.id] = Date.now(); persist();
    haptic('badge'); sfx('fanfare');
    confetti(40, ['#f2b01e', '#2f9e6b', '#3f7fd0']);
    setTimeout(() => toast('Badge earned: ' + b.icon + ' ' + b.name), 400);
  }
}
function renderBadges() {
  const box = $('#badgeList'); box.innerHTML = '';
  /* every cleared monthly board leaves a badge carrying the name of its month */
  const months = Object.keys(save.badges).filter(k => k.indexOf('month-') === 0).sort().reverse();
  for (const k of months) {
    const parts = k.slice(6).split('-');
    const nm = monthName(new Date(+parts[0], +parts[1] - 1, 1));
    box.insertAdjacentHTML('beforeend',
      `<div class="badge on"><div class="bIcon">&#127894;</div><div><b>${nm}</b><small>Cleared the puzzle of the month</small></div>
       <div class="bState">&#10003;</div></div>`);
  }
  for (const b of BADGES) {
    const got = !!save.badges[b.id];
    box.insertAdjacentHTML('beforeend',
      `<div class="badge ${got ? 'on' : ''}"><div class="bIcon">${b.icon}</div><div><b>${b.name}</b><small>${b.desc}</small></div>
       <div class="bState">${got ? '&#10003;' : ''}</div></div>`);
  }
}

/* =========================================================
   RENDERING
   ========================================================= */
const easeOut = t => 1 - (1 - t) * (1 - t);
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const LW = 0.07;

function makePoly(cells, dir, tr, extra) {
  const pts = cells.map(([x, y]) => [x + 0.5, y + 0.5]);
  const fd = pts.length > 1 ? [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]] : [DIRS[dir].x, DIRS[dir].y];
  const P = [[pts[0][0] - fd[0], pts[0][1] - fd[1]]].concat(pts);
  const jumps = [];
  for (const q of tr.path) { if (q.jump) jumps.push(P.length - 1); P.push([q.x + 0.5, q.y + 0.5]); }
  const last = P[P.length - 1], D = DIRS[tr.dir];
  for (let j = 1; j <= extra; j++) P.push([last[0] + D.x * j, last[1] + D.y * j]);
  return { P, jumps, len: cells.length };
}
function pAt(V, s) {
  const P = V.P, i = Math.max(0, Math.min(Math.floor(s), P.length - 2)), f = s - i;
  if (V.jumps.includes(i)) return (f < 0.5 ? P[i] : P[i + 1]).slice();
  return [P[i][0] + (P[i + 1][0] - P[i][0]) * f, P[i][1] + (P[i + 1][1] - P[i][1]) * f];
}
function sideOf(V, t) { let n = 0; for (const j of V.jumps) if (t >= j + 0.5) n++; return n; }
function strokesFor(V, s, e) {
  const ts = [s];
  for (let i = Math.floor(s) + 1; i < e; i++) ts.push(i);
  for (const j of V.jumps) if (j + 0.5 > s && j + 0.5 < e) { ts.push(j + 0.4999); ts.push(j + 0.5); }
  ts.push(e);
  ts.sort((a, b) => a - b);
  const strokes = [];
  let cur = null, side = -1;
  for (const t of ts) {
    const sd = sideOf(V, t);
    if (sd !== side) { if (cur) strokes.push(cur); cur = []; side = sd; }
    cur.push(pAt(V, t));
  }
  if (cur) strokes.push(cur);
  return strokes;
}
function dirAt(V, e) {
  const P = V.P;
  let i = Math.max(0, Math.min(Math.ceil(e) - 1, P.length - 2));
  if (V.jumps.includes(i)) i = (e - Math.floor(e) >= 0.5 || i === 0) ? Math.min(i + 1, P.length - 2) : i - 1;
  return [P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]];
}
function strokeLine(pts) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.001, pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const CB_COLS = ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#56b4e9', '#d55e00', '#f0e442', '#333333'];
function arrowColor(id) {
  const A = G.L.arrows[id];
  let base;
  if (A.gcol != null) base = GATE_COLORS[A.gcol];
  else {
    const k = A.kind;
    if (k === 'boom') base = G.S.arr[id].used ? '#e7a3bf' : KIND_COL.boom;
    else if (KIND_COL[k]) base = KIND_COL[k];
    else base = (save.opts.colorBlind ? CB_COLS : NORMAL_COLS)[id % (save.opts.colorBlind ? CB_COLS : NORMAL_COLS).length];
  }
  return styleColor(base);
}
function applyArrowStyle(color) {
  const st = ARROW_STYLES[save.opts.arrowStyle] || ARROW_STYLES.classic;
  ctx.lineWidth = LW * st.width;
  ctx.globalAlpha = ctx.globalAlpha * st.alpha;
  if (st.glow) { ctx.shadowColor = color; ctx.shadowBlur = st.glow; }
  return st;
}
function clearArrowStyle() { ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
function drawHead(E, dx, dy, color, kind) {
  const px = -dy, py = dx;
  const hs = save.opts.bigHeads ? 1.25 : 1;
  if (kind === 'hungry') {
    ctx.strokeStyle = color; ctx.lineWidth = LW;
    ctx.beginPath();
    ctx.moveTo(E[0] - dx * 0.08 + px * 0.2, E[1] - dy * 0.08 + py * 0.2);
    ctx.lineTo(E[0] + dx * 0.3, E[1] + dy * 0.3);
    ctx.lineTo(E[0] - dx * 0.08 - px * 0.2, E[1] - dy * 0.08 - py * 0.2);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(E[0] + dx * 0.36 * hs, E[1] + dy * 0.36 * hs);
  ctx.lineTo(E[0] - dx * 0.02 + px * 0.19 * hs, E[1] - dy * 0.02 + py * 0.19 * hs);
  ctx.lineTo(E[0] - dx * 0.02 - px * 0.19 * hs, E[1] - dy * 0.02 - py * 0.19 * hs);
  ctx.closePath(); ctx.fill();
  if (kind === 'slide') {
    ctx.strokeStyle = color; ctx.lineWidth = LW * 0.85;
    ctx.beginPath();
    ctx.moveTo(E[0] - dx * 0.3 + px * 0.15, E[1] - dy * 0.3 + py * 0.15);
    ctx.lineTo(E[0] - dx * 0.1, E[1] - dy * 0.1);
    ctx.lineTo(E[0] - dx * 0.3 - px * 0.15, E[1] - dy * 0.3 - py * 0.15);
    ctx.stroke();
  }
}
function glow(strokes, id, now) {
  const V = G.vis[id] || {};
  if (G.hint && G.hint.id === id && now < G.hint.until) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 110);
    ctx.strokeStyle = `rgba(242,176,30,${0.35 + 0.45 * pulse})`; ctx.lineWidth = 0.42;
    strokes.forEach(strokeLine);
  }
  if (V.unlock) {
    const t = (now - V.unlock.t0) / 1300;
    if (t >= 1) delete V.unlock;
    else if (t >= 0) {
      ctx.strokeStyle = `rgba(31,157,97,${0.65 * (1 - t)})`; ctx.lineWidth = 0.34 + 0.25 * t;
      strokes.forEach(strokeLine);
    }
  }
  if (V.flash) {
    const ft = (now - V.flash.t0) / V.flash.dur;
    if (ft >= 1) delete V.flash;
    else if (ft >= 0) {
      const fc = (V.flash.kind === 'key' || V.flash.kind === 'lock') ? '242,176,30' : '229,72,77';
      ctx.strokeStyle = `rgba(${fc},${(V.flash.kind === 'blocker' ? 0.45 : 0.6) * (1 - ft)})`; ctx.lineWidth = 0.4;
      strokes.forEach(strokeLine);
      return V.flash.kind === 'bad';
    }
  }
  return false;
}
function drawStatic(a, now) {
  const id = a.id, kind = G.L.arrows[id].kind, V = G.vis[id] || {};
  let color = arrowColor(id);
  let ang = 0;
  if (V.rot) {
    const t = (now - V.rot.t0) / 220;
    if (t >= 1) delete V.rot; else ang = -(Math.PI / 2) * (1 - easeOut(Math.max(0, t)));
  }
  const D = DIRS[a.dir];
  const dx = D.x * Math.cos(ang) - D.y * Math.sin(ang), dyv = D.x * Math.sin(ang) + D.y * Math.cos(ang);
  const pts = a.cells.map(([x, y]) => [x + 0.5, y + 0.5]);
  let line;
  if (pts.length === 1) line = [[pts[0][0] - dx * 0.3, pts[0][1] - dyv * 0.3], pts[0]];
  else {
    const fx = pts[1][0] - pts[0][0], fy = pts[1][1] - pts[0][1];
    line = [[pts[0][0] - fx * 0.16, pts[0][1] - fy * 0.16]].concat(pts.slice(1));
  }
  const Hd = pts[pts.length - 1];
  if (kind === 'clock') {
    ctx.strokeStyle = color; ctx.lineWidth = 0.035;
    ctx.beginPath(); ctx.arc(Hd[0], Hd[1], 0.36, 0, Math.PI * 2); ctx.stroke();
  }
  if (kind === 'design' && G.design) {
    ctx.save(); ctx.setLineDash([0.12, 0.08]); ctx.strokeStyle = color; ctx.lineWidth = 0.05;
    rr(Hd[0] - 0.44, Hd[1] - 0.44, 0.88, 0.88, 0.12); ctx.stroke(); ctx.restore();
  }
  if (glow([line], id, now)) color = '#e5484d';
  ctx.strokeStyle = color;
  applyArrowStyle(color);
  strokeLine(line);
  drawHead(Hd, dx, dyv, color, kind);
  clearArrowStyle();
  (G.vis[id] = G.vis[id] || {}).tailPt = line[0];
  if (G.L.arrows[id].gcol != null) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(line[0][0], line[0][1] - 0.14); ctx.lineTo(line[0][0] + 0.14, line[0][1]);
    ctx.lineTo(line[0][0], line[0][1] + 0.14); ctx.lineTo(line[0][0] - 0.14, line[0][1]);
    ctx.closePath(); ctx.fill();
  }
  if (kind === 'boom' && !a.used) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = color; ctx.lineWidth = 0.04;
    ctx.beginPath(); ctx.arc(line[0][0], line[0][1], 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  if (kind === 'hungry') {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(line[0][0], line[0][1], 0.08, 0, Math.PI * 2); ctx.fill();
  }
}
function drawAnimated(a, V, now) {
  const an = V.anim, id = a.id, kind = G.L.arrows[id].kind;
  const t = (now - an.t0) / an.dur;
  if (t >= 1) { delete V.anim; return false; }
  let off = 0, alpha = 1;
  if (an.kind === 'exit') { off = an.max * t * t; alpha = 1 - Math.max(0, (t - 0.55) / 0.45); }
  else if (an.kind === 'slide') off = an.max * easeOut(t);
  else if (an.kind === 'bump') off = t < 0.4 ? an.max * easeOut(t / 0.4) : an.max * (1 - easeInOut((t - 0.4) / 0.6));
  else if (an.kind === 'boom') off = t < 0.5 ? an.max * easeInOut(t * 2) : an.max * (1 - easeInOut((t - 0.5) * 2));
  const P = an.P, len = P.len;
  const s = 1 + off, e = s + len - 1;
  const strokes = strokesFor(P, s - (len === 1 ? 0.3 : 0.16), e);
  const [dx, dy] = dirAt(P, e);
  let color = an.color || arrowColor(id);
  ctx.globalAlpha = alpha;
  if (glow(strokes, id, now)) color = '#e5484d';
  ctx.strokeStyle = color;
  applyArrowStyle(color);
  strokes.forEach(strokeLine);
  drawHead(pAt(P, e), dx, dy, color, kind);
  clearArrowStyle();
  return true;
}
function drawBadgePin(a, kind) {
  const V = G.vis[a.id] || {};
  const pt = V.tailPt;
  if (!pt) return;
  if (kind === 'lock' && (G.L.keyOf[a.id] === undefined || G.S.arr[G.L.keyOf[a.id]].gone)) return;
  const k = view.cs * view.scale;
  const [x, y] = b2s(pt[0], pt[1]);
  const r = Math.max(7, k * 0.3);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (kind === 'key') {
    ctx.fillStyle = KIND_COL.key;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.5, r * 0.16); ctx.stroke();
    ctx.fillStyle = '#3a2a00'; ctx.font = `800 ${Math.round(r * 1.1)}px system-ui,sans-serif`;
    ctx.fillText(G.L.arrows[a.id].pair, x, y + 1);
  } else {
    const bw = r * 1.7, bh = r * 1.35, by = y - bh * 0.25;
    ctx.strokeStyle = KIND_COL.lock; ctx.lineWidth = Math.max(2, r * 0.22);
    ctx.beginPath(); ctx.arc(x, by, r * 0.45, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = KIND_COL.lock;
    ctx.beginPath();
    ctx.moveTo(x - bw / 2 + 3, by); ctx.arcTo(x + bw / 2, by, x + bw / 2, by + bh, 3);
    ctx.arcTo(x + bw / 2, by + bh, x - bw / 2, by + bh, 3); ctx.arcTo(x - bw / 2, by + bh, x - bw / 2, by, 3);
    ctx.arcTo(x - bw / 2, by, x + bw / 2, by, 3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(r * 0.9)}px system-ui,sans-serif`;
    ctx.fillText(G.L.arrows[a.id].pair, x, by + bh / 2 + 1);
  }
}
function drawBoard() {
  const { W, H, mask } = G.L;
  ctx.fillStyle = THEME.boardTint || WORLDS[G.w].tint;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) ctx.fillRect(x, y, 1.002, 1.002);
  ctx.strokeStyle = THEME.grid; ctx.lineWidth = 0.015;
  ctx.beginPath();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask[y * W + x]) continue;
    if (x + 1 < W && mask[y * W + x + 1]) { ctx.moveTo(x + 1, y); ctx.lineTo(x + 1, y + 1); }
    if (y + 1 < H && mask[(y + 1) * W + x]) { ctx.moveTo(x, y + 1); ctx.lineTo(x + 1, y + 1); }
  }
  ctx.stroke();
  ctx.strokeStyle = THEME.edge; ctx.lineWidth = 0.025; ctx.lineCap = 'square';
  ctx.beginPath();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask[y * W + x]) continue;
    if (y === 0 || !mask[(y - 1) * W + x]) { ctx.moveTo(x, y); ctx.lineTo(x + 1, y); }
    if (y === H - 1 || !mask[(y + 1) * W + x]) { ctx.moveTo(x, y + 1); ctx.lineTo(x + 1, y + 1); }
    if (x === 0 || !mask[y * W + x - 1]) { ctx.moveTo(x, y); ctx.lineTo(x, y + 1); }
    if (x === W - 1 || !mask[y * W + x + 1]) { ctx.moveTo(x + 1, y); ctx.lineTo(x + 1, y + 1); }
  }
  ctx.stroke();
  ctx.lineCap = 'round';
  // the outer frame: arrows only leave the puzzle here, gaps inside are flown across
  ctx.save();
  ctx.setLineDash([0.3, 0.45]);
  ctx.strokeStyle = THEME.frame; ctx.lineWidth = 0.03;
  ctx.strokeRect(-0.25, -0.25, W + 0.5, H + 0.5);
  ctx.restore();
}
function drawTiles() {
  const { W } = G.L;
  for (const [id, t] of G.L.tiles) {
    const x = id % W, y = (id - x) / W;
    if (t.type === 'w') {
      ctx.fillStyle = '#b9b3a6'; rr(x + 0.08, y + 0.08, 0.84, 0.84, 0.14); ctx.fill();
      ctx.strokeStyle = '#8d8778'; ctx.lineWidth = 0.05; ctx.stroke();
    } else if (t.type === 'm') {
      ctx.fillStyle = '#dde4ec'; rr(x + 0.06, y + 0.06, 0.88, 0.88, 0.12); ctx.fill();
      ctx.strokeStyle = '#687891'; ctx.lineWidth = 0.08;
      ctx.beginPath();
      if (t.m === '/') { ctx.moveTo(x + 0.2, y + 0.8); ctx.lineTo(x + 0.8, y + 0.2); }
      else { ctx.moveTo(x + 0.2, y + 0.2); ctx.lineTo(x + 0.8, y + 0.8); }
      ctx.stroke();
    } else {
      const c = PORTAL_COLS[t.pair % PORTAL_COLS.length];
      ctx.strokeStyle = c; ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, 0.33, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.22; ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, 0.33, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, 0.1, 0, Math.PI * 2); ctx.fill();
    }
  }
}
function drawGates() {
  for (const [slot, c] of G.L.gates) {
    const parts = slot.split(','), x = +parts[0], y = +parts[1], d = +parts[2];
    ctx.fillStyle = GATE_COLORS[c];
    if (d === 0) rr(x + 0.1, y - 0.3, 0.8, 0.2, 0.07);
    else if (d === 2) rr(x + 0.1, y + 1.1, 0.8, 0.2, 0.07);
    else if (d === 1) rr(x + 1.1, y + 0.1, 0.2, 0.8, 0.07);
    else rr(x - 0.3, y + 0.1, 0.2, 0.8, 0.07);
    ctx.fill();
  }
}
function withAlpha(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function drawEffects(now) {
  G.fx = G.fx.filter(f => now - f.t0 < f.dur);
  for (const f of G.fx) {
    const t = Math.max(0, (now - f.t0) / f.dur);
    if (t <= 0) continue;
    const col = f.col || '#1f9d61';
    if (f.kind === 'ring') {
      ctx.save();
      ctx.strokeStyle = withAlpha(col, 0.75 * (1 - t)); ctx.lineWidth = 0.09;
      ctx.beginPath(); ctx.arc(f.x, f.y, 0.3 + t * 1.1, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if (f.kind === 'trail') {
      ctx.save();
      ctx.strokeStyle = withAlpha(col, 0.5 * (1 - t)); ctx.lineWidth = 0.14;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      f.pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]));
      ctx.stroke();
      ctx.restore();
    } else if (f.kind === 'flash') {
      ctx.fillStyle = withAlpha(col, 0.5 * (1 - t));
      for (const [x, y] of f.cells) rr(x + 0.12, y + 0.12, 0.76, 0.76, 0.2), ctx.fill();
    } else {
      ctx.fillStyle = withAlpha(col, 0.3 * (1 - t));
      for (const [x, y] of f.cells) rr(x + 0.08 - t * 0.08, y + 0.08 - t * 0.08, 0.84 + t * 0.16, 0.84 + t * 0.16, 0.16), ctx.fill();
    }
  }
  if (G.hintPath && now < G.hintPath.until) {
    ctx.save();
    ctx.setLineDash([0.25, 0.2]);
    ctx.strokeStyle = 'rgba(242,176,30,0.85)'; ctx.lineWidth = 0.1;
    ctx.beginPath();
    G.hintPath.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.stroke();
    ctx.restore();
  }
}
function drawDebug() {
  const order = {};
  G.L.solution.forEach((ev, i) => { if (order[ev.id] === undefined) order[ev.id] = i + 1; });
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const a of G.S.arr) {
    if (a.gone) continue;
    const [x, y] = b2s(a.cells[a.cells.length - 1][0] + 0.5, a.cells[a.cells.length - 1][1] + 0.5);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.font = '700 10px system-ui,sans-serif';
    ctx.fillText(order[a.id] || '-', x, y + 1);
  }
}
/* A hint has to be found on a board where a square can be fourteen pixels across, so it is more
   than a thin outline: the rest of the board dims, the arrow's own squares glow, a ring is drawn
   around it in screen pixels (so it never thins as the board grows) and a hand bobs underneath.
   The ring and the hand are drawn outside the board transform, in pixels, for that reason. */
function hintArrow(now) {
  if (!G || !G.hint || now >= G.hint.until) return null;
  const a = G.S.arr[G.hint.id];
  return a && !a.gone ? a : null;
}
function boardTransform() {
  const k = view.cs * view.scale, b = G.bounds;
  ctx.translate(view.w / 2 + view.panX, view.h / 2 + view.panY);
  ctx.scale(k, k);
  ctx.translate(-b.cx, -b.cy);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
}
/* over the dimmed board: the arrow's squares in gold, the arrow itself, and its flight path */
function drawHintFocus(a, now) {
  ctx.save();
  boardTransform();
  const pulse = 0.5 + 0.5 * Math.sin(now / 240);
  ctx.fillStyle = `rgba(242,176,30,${0.22 + 0.16 * pulse})`;
  for (const [x, y] of a.cells) { rr(x + 0.04, y + 0.04, 0.92, 0.92, 0.18); ctx.fill(); }
  drawStatic(a, now);
  if (G.hintPath && now < G.hintPath.until) {
    ctx.setLineDash([0.25, 0.2]);
    ctx.strokeStyle = 'rgba(242,176,30,0.95)'; ctx.lineWidth = 0.12;
    ctx.beginPath();
    G.hintPath.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.stroke();
  }
  ctx.restore();
}
/* in screen pixels, so a dense board is no harder to read than an open one */
function drawHintMarks(a, now) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [cx, cy] of a.cells) {
    const p = b2s(cx, cy), q = b2s(cx + 1, cy + 1);
    x0 = Math.min(x0, p[0], q[0]); y0 = Math.min(y0, p[1], q[1]);
    x1 = Math.max(x1, p[0], q[0]); y1 = Math.max(y1, p[1], q[1]);
  }
  const pulse = 0.5 + 0.5 * Math.sin(now / 240), pad = 7 + 3 * pulse;
  ctx.save();
  ctx.strokeStyle = `rgba(242,176,30,${0.75 + 0.25 * pulse})`;
  ctx.lineWidth = 4; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(242,176,30,0.55)'; ctx.shadowBlur = 10;
  const r = 10, X = x0 - pad, Y = y0 - pad, W = x1 - x0 + pad * 2, H = y1 - y0 + pad * 2;
  ctx.beginPath();
  ctx.moveTo(X + r, Y); ctx.arcTo(X + W, Y, X + W, Y + H, r); ctx.arcTo(X + W, Y + H, X, Y + H, r);
  ctx.arcTo(X, Y + H, X, Y, r); ctx.arcTo(X, Y, X + W, Y, r); ctx.closePath();
  ctx.stroke();
  ctx.shadowBlur = 0;
  /* the hand: it bobs under the arrow, pointing up at what to tap */
  {
    const press = G.guide && G.guide.press ? Math.max(0, 1 - (now - G.guide.press) / 420) : 0;
    const bob = press ? -10 * Math.sin(press * Math.PI) : (save.opts.reducedMotion ? 0 : Math.sin(now / 300) * 5);
    ctx.font = (30 + 6 * press) + 'px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('\uD83D\uDC46', (x0 + x1) / 2, Y + H + 6 + bob);
  }
  ctx.restore();
}
function draw(now) {
  if (!G || !G.bounds) return;                // not measured yet: the board has just opened
  ctx.clearRect(0, 0, view.w, view.h);
  drawWorldBackdrop(now);
  ctx.save();
  boardTransform();
  drawBoard();
  drawTiles();
  drawGates();
  drawEffects(now);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const animated = [];
  for (const a of G.S.arr) {
    const V = G.vis[a.id];
    if (V && V.anim) { animated.push(a); continue; }
    if (!a.gone) drawStatic(a, now);
  }
  for (const a of animated) {
    const V = G.vis[a.id];
    if (!drawAnimated(a, V, now) && !a.gone) drawStatic(a, now);
  }
  ctx.restore();
  const hinted = hintArrow(now);
  if (hinted) {
    ctx.fillStyle = withAlpha(THEME.bg, 0.62);        // everything else steps back
    ctx.fillRect(0, 0, view.w, view.h);
    drawHintFocus(hinted, now);
  }
  for (const a of G.S.arr) {
    if (a.gone) continue;
    const kind = G.L.arrows[a.id].kind;
    if (kind === 'key' || kind === 'lock') drawBadgePin(a, kind);
  }
  if (hinted) drawHintMarks(hinted, now);
  if (save.debug) drawDebug();
}
/* The frame loop runs only while something needs it. On the menus it sleeps, and wakes for a
   touch, a new screen or a celebration; a loop running for nothing still keeps the WebView
   producing frames and costs battery. On the board it draws every frame while something is
   happening (a tap, a flight, a hint, particles) and otherwise only often enough for the slow
   background: about fifteen times a second, or once a second with reduced motion. */
let loopOn = false, lastDraw = 0, lastActivity = 0;
const IDLE_AFTER = 2500;                     // longer than any flight, flash or turn on the board
function wakeLoop() {
  if (loopOn) return;
  loopOn = true;
  lastFrame = performance.now();             // the clock must not count the time asleep
  requestAnimationFrame(loop);
}
function poke() { lastActivity = performance.now(); lastDraw = 0; wakeLoop(); }
function loop(now) {
  const onBoard = !!(G && currentScreen === 's-game');
  const fx = fxParts.length > 0 || fxRings.length > 0;
  if (!onBoard && !fx) { drawFx(); loopOn = false; return; }
  requestAnimationFrame(loop);
  tickTimer(now);
  if (onBoard && view.w && G.bounds) {
    const busy = fx || now - lastActivity < IDLE_AFTER || (G.hint && now < G.hint.until) || (G.hintPath && now < G.hintPath.until);
    const every = save.opts.reducedMotion ? 1000 : 66;
    if (busy || now - lastDraw >= every) { draw(now); lastDraw = now; }
  }
  drawFx();
}
document.addEventListener('pointerdown', poke, { capture: true });
canvas.addEventListener('pointermove', () => { if (pointers.size) poke(); });   // a drag or a pinch is activity too
window.addEventListener('resize', poke);
wakeLoop();

/* ---------- the Android shell ----------
   Reached through the bridge global that Capacitor injects, not through the npm package,
   because the game is one plain script and there is no bundler to resolve a module. In a
   browser the bridge is absent, nothing is wired, and the game behaves as it always did. */
const nativeApp = () => nativePlugin('App');

/* ---------- asking for a rating ----------
   Never a pop-up of its own. The invitation rides inside moments the player is already looking
   at: the result of a first clear on a milestone, the pause and exit questions, and the footer
   of the home screen. The sentence asking for it stops once they have rated; the button stays. */
const PLAY_URL = 'https://play.google.com/store/apps/details?id=eu.fablestudio.arrowescape';
const RATE_MILESTONES = [8, 20, 40, 70, 110];   // levels cleared
function levelsCleared() { return Object.keys(save.progress).filter(k => save.progress[k] > 0).length; }
function rateMilestone() { return !save.rated && RATE_MILESTONES.includes(levelsCleared()); }
function rateButton(id) {
  return `<button class="btn rateBtn" ${id ? 'id="' + id + '"' : 'data-act="rate"'}>` +
    '<span class="rateStars" aria-hidden="true">&#9733;&#9733;&#9733;&#9733;&#9733;</span>Rate Arrow Escape</button>';
}
/* The button is always there; the sentence asking for it only until the player has rated. */
function rateInvite() {
  return '<div class="rateAsk">' + (save.rated ? '' : '<p>Enjoying Arrow Escape? A rating on Google Play helps other puzzlers find it.</p>') +
    rateButton() + '</div>';
}
function openStorePage() {
  /* Capacitor hands any address outside the app to Android, where the Play Store claims
     play.google.com links and the browser is the fallback. */
  if (nativeApp()) window.location.href = PLAY_URL;
  else window.open(PLAY_URL, '_blank', 'noopener');
}
/* Google's in-app review sheet first, so the player rates without leaving the game. Play never
   says whether the sheet appeared: it is rationed per player, and it never appears in a build
   that was not installed from the Play Store. But the sheet pauses the activity while it is up,
   so a tap that produced no pause produced no sheet, and the store page opens instead. A tap on
   Rate must always visibly do something. */
let lastInactive = 0;
async function openRating() {
  save.rated = true; persist();
  const review = nativePlugin('InAppReview');
  if (review) {
    const asked = Date.now();
    try { await review.requestReview(); } catch (e) {}
    await new Promise(r => setTimeout(r, 300));   // the pause event can trail the promise
    if (lastInactive >= asked) return;
  }
  openStorePage();
}
function askExit() {
  openModal('<h3>Leave Arrow Escape?</h3><p>Your progress is saved on this device.</p>' +
    '<div class="stack"><button class="btn primary" data-act="stay">Keep playing</button>' +
    '<button class="btn" data-act="quit">Leave</button></div>' + rateInvite(), {
    stay: closeModal,
    quit: () => { closeModal(); const a = nativeApp(); if (a) a.exitApp(); },
    rate: () => { closeModal(); openRating(); }
  });
}

function backOut() {
  /* the world celebration sits over everything, so Back closes it first, as Stay would */
  if ($('#reveal').classList.contains('show')) { $('#revealStay').click(); return; }
  if (quickOpen()) { closeQuick(); return; }
  if (modalOpen()) {
    /* A modal that asks a question must not be dismissed into a half finished state, so take
       the gentlest way out it offers rather than closing it blind. */
    const act = modalHandlers.resume || modalHandlers.stay || modalHandlers.levels || modalHandlers.home || modalHandlers.no || modalHandlers.ok;
    if (act) act();
    return;
  }
  if (currentScreen === 's-game') {
    /* Pause refuses once the level is over, so fall back to leaving the board rather than
       letting the back button do nothing at all. */
    if (G && !G.done) $('#btnPause').onclick(); else $('#btnGameBack').onclick();
    return;
  }
  if (currentScreen === 's-home') { askExit(); return; }
  /* Every other screen already carries its own back button, so follow that rather than
     keeping a second copy of the hierarchy here. */
  const b = document.querySelector('#' + currentScreen + ' [data-go]');
  showScreen(b ? b.dataset.go : 's-home');
}

(function wireNativeShell() {
  const a = nativeApp();
  if (!a) return;
  a.addListener('backButton', backOut);
  a.addListener('appStateChange', st => {
    appActive = !!(st && st.isActive);
    if (!appActive) lastInactive = Date.now();
    quietInBackground(!appActive);
  });
})();

/* Hook for automated testing */
window.__arrowEscape = { jingleInto, music, musicStart, openMusicLab, applyTheme, askPayment, currentChallenge, weeklyState, SECRETS, showScreen, checkBadges, worldReveal, trace, makeState, s2b, viewState(){return {scale:+view.scale.toFixed(2),panX:Math.round(view.panX)};}, b2s, generateLevelWith, get genFail(){return genFail;}, resetFail(){genFail={};}, params, buildMask, generateLevel, verify, params, solve, makeState, cloneS, doTap, legalMoves,
  get G() { return G; }, startLevel, warmNext, tapArrow, packLevel, unpackLevel, prebuilt, backOut, warmLevel, warmTarget, get warmed(){return warmed;}, get appActive(){return appActive;}, set appActive(v){appActive=v;}, WORLDS, winLevel, timeUp, worldStatus, isWorldUnlocked, get save() { return save; }, persist, loadSaveAsync, migrateSave };

rememberOpenWorlds();
applyTheme();
updateCoins();
renderHome();

/* Two frames, so the hide lands after the home screen has been painted rather than merely
   built. launchShowDuration stays in the configuration as a backstop for the case where this
   never runs at all. */
requestAnimationFrame(() => requestAnimationFrame(() => {
  const S = nativePlugin('SplashScreen');
  if (!S) return;
  try { const r = S.hide({ fadeOutDuration: 200 }); if (r && r.catch) r.catch(() => {}); } catch (e) {}
}));

/* This settles in milliseconds, behind the splash screen, so the first screen is not drawn
   twice in front of the player. */
loadSaveAsync().then(adopted => {
  if (adopted) { rememberOpenWorlds(); applyTheme(); updateCoins(); renderHome(); }
  scheduleWarm();          // after the adopt, so the target is the level Continue really offers
  /* Advertising starts once the home screen is up, so a player who needs the consent form sees
     it over the game rather than over a blank splash. */
  if (window.Ads) Ads.init();
});
document.addEventListener('ads-privacy-changed', () => { if (currentScreen === 's-home') renderHome(); });
})();
