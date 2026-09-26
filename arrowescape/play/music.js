/* Generated copy of MusicForGames/music-engine.js: edit it there, test it there (node tools/test-engine.js),
   then run node tools/sync-to-game.js. */
/* PuzzleMusic: a compact procedural music engine for calm puzzle games.
 *
 * Everything is synthesised with the Web Audio API. There are no samples and no dependencies.
 * The one generated buffer is a short reverb impulse, plus half a second of noise for the
 * softest percussion.
 *
 * Model: style → form (sections) → chord progression → per-bar patterns → notes → synthesis.
 * A style is pure data (see STYLES). The engine turns it into six coordinated layers:
 *   pad     sustained chords, two detuned oscillators per note, spread left and right
 *   arp     broken chords over a rhythm template
 *   melody  motif-based phrases (A A' B A'') that prefer chord tones on strong beats
 *   bass    roots, fifths and approach notes from a pattern
 *   drone   a held tonic that breathes
 *   perc    a very soft pulse (shaker, tick, soft kick, raindrops)
 * The layers feed a per-layer low-pass filter with a slow LFO, a per-song stereo delay and a
 * shared synthetic reverb.
 *
 * Scheduling: a 250 ms timer renders one whole bar at a time, about a second ahead of the audio
 * clock. Notes are created at their own start times, so the timer never needs to be precise and
 * the music keeps its time when the page is busy.
 */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ theory */

  const SCALES = {
    major:          [0, 2, 4, 5, 7, 9, 11],
    minor:          [0, 2, 3, 5, 7, 8, 10],
    aeolian:        [0, 2, 3, 5, 7, 8, 10],
    dorian:         [0, 2, 3, 5, 7, 9, 10],
    mixolydian:     [0, 2, 4, 5, 7, 9, 10],
    lydian:         [0, 2, 4, 6, 7, 9, 11],
    harmonicMinor:  [0, 2, 3, 5, 7, 8, 11],
    melodicMinor:   [0, 2, 3, 5, 7, 9, 11],
    majorPentatonic:[0, 2, 4, 7, 9],
    minorPentatonic:[0, 3, 5, 7, 10],
    blues:          [0, 3, 5, 6, 7, 10],
    hirajoshi:      [0, 2, 3, 7, 8],
    japanese:       [0, 1, 5, 7, 8],          // In scale
    wholeTone:      [0, 2, 4, 6, 8, 10],
    suspended:      [0, 2, 5, 7, 10]          // Egyptian / suspended pentatonic
  };

  const CHORDS = {
    maj:  [0, 4, 7],        min:  [0, 3, 7],        dim: [0, 3, 6],       aug: [0, 4, 8],
    sus2: [0, 2, 7],        sus4: [0, 5, 7],
    maj7: [0, 4, 7, 11],    m7:   [0, 3, 7, 10],    '7': [0, 4, 7, 10],   m7b5: [0, 3, 6, 10],
    add9: [0, 4, 7, 14],    madd9:[0, 3, 7, 14],    '6': [0, 4, 7, 9],    m6: [0, 3, 7, 9],
    maj9: [0, 4, 7, 11, 14], m9:  [0, 3, 7, 10, 14], '7sus4': [0, 5, 7, 10]
  };

  const NUMERALS = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
  const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  /* 'bVII:add9' → { off: 10, q: 'add9' }. Lower case numerals default to minor. */
  function parseChord(sym) {
    const m = /^([b#]?)([ivIV]+)(?::(.+))?$/.exec(sym);
    if (!m) throw new Error('bad chord ' + sym);
    let off = NUMERALS[m[2].toUpperCase()];
    if (m[1] === 'b') off -= 1; if (m[1] === '#') off += 1;
    const q = m[3] || (m[2] === m[2].toUpperCase() ? 'maj' : 'min');
    if (!CHORDS[q]) throw new Error('bad quality ' + q);
    return { sym, off: (off + 12) % 12, q, iv: CHORDS[q] };
  }

  /* Progressions grouped by mood. Styles pick from here, so a new style can reuse them. */
  const PROGRESSIONS = {
    peaceful:      [['I:maj7', 'IV:maj7', 'vi:m7', 'IV:add9'], ['IV:maj7', 'I:add9', 'ii:m7', 'V:sus4'], ['I:add9', 'iii:m7', 'IV:maj7', 'I:maj7']],
    dreamy:        [['I:maj7', 'II:add9', 'I:maj7', 'II:sus2'], ['vi:m7', 'II:add9', 'V:maj7', 'I:sus2']],
    meditative:    [['i:m7', 'IV:add9', 'i:m9', 'IV:6'], ['bVII:add9', 'i:m7', 'bIII:maj7', 'IV:sus2']],
    magical:       [['I:maj7', 'II:add9', 'vii:m7', 'II:maj'], ['I:aug', 'II:add9', 'I:maj7', 'V:sus4']],
    uplifting:     [['I:add9', 'V:6', 'vi:m7', 'IV:maj7'], ['IV:maj7', 'V:sus4', 'iii:m7', 'vi:m7']],
    contemplative: [['i:m9', 'IV:add9', 'bIII:maj7', 'bVII:sus2'], ['bVI:maj7', 'bVII:add9', 'i:m7', 'IV:sus2']],
    mysterious:    [['i:madd9', 'bVI:maj7', 'i:min', 'V:sus4'], ['bVI:maj7', 'V:sus4', 'bVI:maj7', 'i:madd9']],
    nostalgic:     [['I:maj7', 'vi:m7', 'ii:m7', 'V:7'], ['IV:maj7', 'iii:m7', 'ii:m7', 'V:sus4']],
    playful:       [['I:maj', 'bVII:add9', 'IV:add9', 'I:sus4'], ['vi:m7', 'IV:maj7', 'bVII:maj', 'v:m7']],
    deep:          [['i:m9', 'bVI:maj7', 'iv:m7', 'i:sus2'], ['bVI:maj7', 'bVII:sus2', 'i:m9', 'i:m9']]
  };

  /* Chord-tone index patterns for the arpeggiator. Index n beyond the chord wraps up an octave. */
  const ARP_PATTERNS = {
    up: [0, 1, 2, 3], down: [3, 2, 1, 0], updown: [0, 1, 2, 3, 2, 1], broken: [0, 2, 1, 3],
    alternating: [0, 2, 0, 3, 0, 1], '1353': [0, 1, 2, 1], '1535': [0, 2, 1, 2], '1357': [0, 1, 2, 3],
    '1573': [0, 2, 3, 1], wide: [0, 2, 4, 5, 4, 2], rise: [0, 1, 2, 3, 4, 5], rain: [2, 0, 1, 3, 1, 0]
  };

  /* ------------------------------------------------------------------ instruments */
  /* One oscillator per note. Its timbre is a harmonic recipe baked once into a PeriodicWave
     (amplitudes of harmonics 1, 2, 3, …), or a built-in wave name.
     fm:     a sine modulator for the strike of bells and keys {ratio, index, decay (s)}; it fades
             and leaves after the strike, so the ring costs one plain oscillator
     env:    attack, decay, sustain (0-1), release in seconds
     mod:    what the layer's shared modulation delay does for this sound: 'chorus' (a slowly
             moving copy on the other side: width and the beating of detuned voices, for all the
             notes at once) or 'vibrato'. A style can add 'wobble' for lo-fi tape drift.
     Every harmonic recipe stays soft on purpose: nothing above the eighth harmonic is strong. */
  const INSTRUMENTS = {
    warmPad:    { wave: [1, .35, .19, .12, .09, .068, .054, .044], env: { a: 2.2, d: 1.5, s: 0.8, r: 2.8 }, gain: 0.5, mod: 'chorus' },
    airPad:     { wave: [1, .12, .1, .02, .03], env: { a: 3.0, d: 2, s: 0.85, r: 3.6 }, gain: 0.6, mod: 'chorus' },
    glassPad:   { wave: [1, .3, .11, .05, .04, 0, .02], env: { a: 2.5, d: 2, s: 0.8, r: 3.2 }, gain: 0.55, mod: 'chorus' },
    darkPad:    { wave: [1, .5, .33, .25, .2, .17, .14, .125, .11, .1], env: { a: 3.5, d: 2, s: 0.8, r: 4.0 }, gain: 0.4, mod: 'chorus' },
    softPluck:  { wave: 'triangle', env: { a: 0.006, d: 0.5, s: 0.0, r: 0.6 }, gain: 0.8 },
    harp:       { wave: [1, .25, .11, .03, .04, .01], env: { a: 0.004, d: 0.9, s: 0.0, r: 0.9 }, gain: 0.72 },
    bell:       { wave: 'sine', fm: { ratio: 3.5, index: 1.6, decay: 0.35 }, env: { a: 0.004, d: 1.6, s: 0.0, r: 1.6 }, gain: 0.7 },
    glass:      { wave: 'sine', fm: { ratio: 5, index: 0.9, decay: 0.2 }, env: { a: 0.006, d: 1.2, s: 0.0, r: 1.2 }, gain: 0.6 },
    ePiano:     { wave: 'sine', fm: { ratio: 1, index: 1.2, decay: 0.5 }, env: { a: 0.005, d: 1.4, s: 0.15, r: 0.9 }, gain: 0.75 },
    marimba:    { wave: 'sine', fm: { ratio: 4, index: 1.1, decay: 0.06 }, env: { a: 0.003, d: 0.45, s: 0.0, r: 0.4 }, gain: 0.85 },
    koto:       { wave: 'triangle', fm: { ratio: 2, index: 1.4, decay: 0.12 }, env: { a: 0.003, d: 0.8, s: 0.0, r: 0.7 }, gain: 0.7 },
    softSquare: { wave: [1, .12, .21, .04, .09, 0, .05, 0, .03], env: { a: 0.01, d: 0.45, s: 0.2, r: 0.4 }, gain: 0.5 },
    flute:      { wave: [1, .08, .03], env: { a: 0.12, d: 0.6, s: 0.7, r: 0.8 }, gain: 0.55, mod: 'vibrato' },
    subBass:    { wave: [1, .25, .08], env: { a: 0.05, d: 1.0, s: 0.7, r: 0.8 }, gain: 0.9 },
    roundBass:  { wave: [1, .3, .11, .05, .04], env: { a: 0.02, d: 0.7, s: 0.45, r: 0.5 }, gain: 0.8 },
    drone:      { wave: [1, .2, .15, .05], env: { a: 4, d: 1, s: 1, r: 4 }, gain: 0.8 }
  };

  /* ------------------------------------------------------------------ styles */
  /* Rhythm strings use one character per sixteenth: x onset, X accent, o ghost, - hold, . rest.
     Bass strings use R root, F fifth, O octave, T third, P approach note to the next chord.
     fx.delayBeats: the echo in beats, so it stays in time with the tempo.
     trim: a level correction in dB so every style plays equally loud (measured, not guessed).
     Form rows: [name, bars, 'layers' (a layer may carry :amount), progression key].
     An augmented chord automatically borrows the whole-tone scale for melody and bass. */
  const STYLES = {
    garden: {
      name: 'Peaceful Garden', desc: 'Warm plucked arpeggios, soft maj7 pads and a bell that sings now and then.',
      mood: 'peaceful', root: 5, scale: 'majorPentatonic', harmonyScale: 'major', tempo: 76, beatsPerBar: 4, barsPerChord: 1,
      progressions: { A: PROGRESSIONS.peaceful[0], B: PROGRESSIONS.peaceful[1] },
      form: [['intro', 4, 'pad arp:0.6', 'A'], ['A', 8, 'pad arp bass:0.6', 'A'], ['A2', 8, 'pad arp bass:0.6 melody', 'A'],
             ['B', 8, 'pad arp:0.8 bass:0.6 melody:0.7', 'B'], ['rest', 4, 'pad arp:0.5', 'A']],
      loopFrom: 1,
      pad:    { inst: 'warmPad', vol: 0.10, voicing: 'close', register: [53, 72], cutoff: 1500, lfo: [0.05, 350] },
      arp:    { inst: 'harp', vol: 0.13, pattern: '1535', alt: 'updown', register: 60, span: 2, rhythm: ['x.x.x.x.x.x.x.x.', 'x.x.x...x.x.x.x.'], pan: -0.25, cutoff: 3200, octaveProb: 0.08 },
      melody: { inst: 'bell', vol: 0.085, register: 72, phraseBars: 2, stepProb: 0.7, leapProb: 0.08, restProb: 0.1, phrasePlay: [1, 1, 0, 1], pan: 0.2,
                rhythms: ['x---x-x-x-------x-------x-------', 'x-x-x---x-------x---x---x-------', '....x-x-x---x---x-------x-------'] },
      bass:   { inst: 'subBass', vol: 0.12, register: 41, patterns: ['R---------------', 'R-------F-------'], cutoff: 600 },
      fx: { delayBeats: 0.75, feedback: 0.22, delayWet: 0.14, reverb: 0.18 }, humanize: { time: 0.009, vel: 0.08 }, variation: 0.12, trim: -0.6
    },

    sky: {
      name: 'Dreamy Sky', desc: 'Lydian and slow in three, glassy notes drifting high over a long open pad.',
      mood: 'dreamy', root: 2, scale: 'lydian', tempo: 62, beatsPerBar: 3, barsPerChord: 2,
      progressions: { A: PROGRESSIONS.dreamy[0], B: PROGRESSIONS.dreamy[1] },
      form: [['intro', 4, 'pad', 'A'], ['A', 8, 'pad arp', 'A'], ['A2', 8, 'pad arp melody:0.8', 'A'],
             ['B', 8, 'pad arp:0.7 melody:0.6 bass:0.5', 'B'], ['float', 8, 'pad arp:0.5', 'A']],
      loopFrom: 1,
      pad:    { inst: 'airPad', vol: 0.11, voicing: 'open', register: [55, 79], cutoff: 2200, lfo: [0.04, 600], width: 0.7 },
      arp:    { inst: 'glass', vol: 0.09, pattern: 'up', alt: '1357', register: 74, span: 2, rhythm: ['x.x.x.x.x.x.', 'x...x.x.x...'], pan: -0.35, cutoff: 5000, octaveProb: 0.1 },
      melody: { inst: 'flute', vol: 0.06, register: 76, phraseBars: 2, stepProb: 0.65, leapProb: 0.12, restProb: 0.15, phrasePlay: [1, 0, 1, 0], pan: 0.35,
                rhythms: ['x-----x-----x-----------', 'x-----x---x-x-----------', '......x-----x-----x-----'] },
      bass:   { inst: 'subBass', vol: 0.08, register: 38, patterns: ['R-----------'], cutoff: 450 },
      fx: { delayBeats: 0.5, feedback: 0.3, delayWet: 0.17, reverb: 0.28 }, humanize: { time: 0.012, vel: 0.08 }, variation: 0.15, trim: -0.2
    },

    rain: {
      name: 'Quiet Rain', desc: 'A Dorian vamp of soft falling notes, a hushed shaker and a low patient bass.',
      mood: 'meditative', root: 9, scale: 'dorian', tempo: 84, beatsPerBar: 4, barsPerChord: 2,
      progressions: { A: PROGRESSIONS.meditative[0], B: PROGRESSIONS.meditative[1] },
      form: [['intro', 4, 'arp:0.6 perc:0.5', 'A'], ['A', 8, 'pad arp perc bass', 'A'], ['A2', 8, 'pad arp perc bass melody:0.6', 'A'],
             ['B', 8, 'pad arp perc:0.7 bass melody:0.5', 'B'], ['drift', 8, 'pad arp:0.7 perc:0.6', 'A']],
      loopFrom: 1,
      pad:    { inst: 'glassPad', vol: 0.085, voicing: 'close', register: [52, 71], cutoff: 1300, lfo: [0.06, 300] },
      arp:    { inst: 'marimba', vol: 0.12, pattern: 'rain', alt: 'broken', register: 64, span: 2, rhythm: ['x..x..x.x..x..x.', 'x..x..x...x.x...'], pan: -0.2, cutoff: 2600, octaveProb: 0.05 },
      melody: { inst: 'ePiano', vol: 0.07, register: 76, phraseBars: 2, stepProb: 0.75, leapProb: 0.06, restProb: 0.2, phrasePlay: [0, 1, 0, 1], pan: 0.25,
                rhythms: ['........x-------......x-x-------', '....x---x-------........x-------'] },
      bass:   { inst: 'subBass', vol: 0.12, register: 33, patterns: ['R-------......P-', 'R---------------'], cutoff: 500 },
      perc:   { vol: 0.05, parts: [{ kind: 'shaker', pattern: 'o.x.o.x.o.x.o.x.' }, { kind: 'drop', prob: 0.18 }] },
      fx: { delayBeats: 0.75, feedback: 0.2, delayWet: 0.11, reverb: 0.2 }, humanize: { time: 0.01, vel: 0.1 }, variation: 0.12, trim: -1
    },

    magic: {
      name: 'Magical Path', desc: 'Rising bell arpeggios in Lydian, with a whole-tone turn now and then.',
      mood: 'magical', root: 4, scale: 'lydian', tempo: 92, beatsPerBar: 4, barsPerChord: 1,
      progressions: { A: PROGRESSIONS.magical[0], B: PROGRESSIONS.magical[1] },
      form: [['intro', 4, 'pad arp:0.7', 'A'], ['A', 8, 'pad arp bass:0.7', 'A'], ['A2', 8, 'pad arp bass:0.7 melody', 'A'],
             ['B', 8, 'pad arp bass:0.7 melody:0.7', 'B'], ['A3', 8, 'pad arp:0.6 melody:0.5', 'A']],
      loopFrom: 1,
      pad:    { inst: 'glassPad', vol: 0.085, voicing: 'close', register: [55, 74], cutoff: 1800, lfo: [0.05, 400] },
      arp:    { inst: 'bell', vol: 0.085, pattern: 'rise', alt: 'up', register: 67, span: 2, rhythm: ['x.x.x.x.x.x.x...', 'x.x.x.x.x...x.x.'], pan: -0.3, cutoff: 4200, octaveProb: 0.15 },
      melody: { inst: 'glass', vol: 0.075, register: 79, phraseBars: 2, stepProb: 0.6, leapProb: 0.14, restProb: 0.1, phrasePlay: [1, 0, 1, 1], pan: 0.3,
                rhythms: ['x---x---x-x-x-------x---x-------', 'x-x-x---x---x-------x-x-x-------'] },
      bass:   { inst: 'roundBass', vol: 0.1, register: 40, patterns: ['R-------O-------', 'R-----------F---'], cutoff: 700 },
      fx: { delayBeats: 0.75, feedback: 0.25, delayWet: 0.15, reverb: 0.22 }, humanize: { time: 0.008, vel: 0.08 }, variation: 0.15, trim: 1.4
    },

    morning: {
      name: 'Soft Morning', desc: 'Bright and hopeful: electric piano, a walking bass and a simple tune.',
      mood: 'uplifting', root: 7, scale: 'majorPentatonic', harmonyScale: 'major', tempo: 96, beatsPerBar: 4, barsPerChord: 1,
      progressions: { A: PROGRESSIONS.uplifting[0], B: PROGRESSIONS.uplifting[1] },
      form: [['intro', 4, 'pad arp', 'A'], ['A', 8, 'pad arp bass perc:0.6', 'A'], ['A2', 8, 'pad arp bass perc:0.6 melody', 'A'],
             ['B', 8, 'pad arp bass perc:0.6 melody:0.8', 'B'], ['A3', 8, 'pad arp:0.7 bass melody:0.6', 'A']],
      loopFrom: 1,
      pad:    { inst: 'warmPad', vol: 0.085, voicing: 'close', register: [52, 71], cutoff: 1700, lfo: [0.07, 350] },
      arp:    { inst: 'ePiano', vol: 0.1, pattern: 'updown', alt: '1353', register: 60, span: 1, rhythm: ['x.x.x.x.x.x.x.x.', 'x..x..x.x.x.x...'], pan: -0.2, cutoff: 3000, octaveProb: 0.04 },
      melody: { inst: 'flute', vol: 0.065, register: 72, phraseBars: 2, stepProb: 0.78, leapProb: 0.06, restProb: 0.08, phrasePlay: [1, 0, 1, 1], pan: 0.2,
                rhythms: ['x-x-x---x-x-x---x---x---x-------', 'x---x-x-x---x---x-x-x---x-------', '..x-x-x-x---x---x---x-x-x-------'] },
      bass:   { inst: 'roundBass', vol: 0.11, register: 43, patterns: ['R-------F-----P-', 'R-----R-F-------'], cutoff: 800 },
      perc:   { vol: 0.04, parts: [{ kind: 'tick', pattern: '....x.......x...' }] },
      fx: { delayBeats: 0.75, feedback: 0.18, delayWet: 0.1, reverb: 0.16 }, humanize: { time: 0.008, vel: 0.08 }, variation: 0.12, trim: -0.2
    },

    islands: {
      name: 'Floating Islands', desc: 'Wide Dorian intervals in a slow six-eight, sustained bass and open sky.',
      mood: 'contemplative', root: 4, scale: 'dorian', tempo: 68, beatsPerBar: 3, barsPerChord: 2,
      progressions: { A: PROGRESSIONS.contemplative[0], B: PROGRESSIONS.contemplative[1] },
      form: [['intro', 4, 'pad arp:0.6', 'A'], ['A', 8, 'pad arp bass', 'A'], ['A2', 8, 'pad arp bass melody:0.7', 'A'],
             ['B', 8, 'pad arp:0.8 bass melody:0.6', 'B'], ['space', 8, 'pad bass arp:0.4', 'A']],
      loopFrom: 1,
      pad:    { inst: 'airPad', vol: 0.1, voicing: 'open', register: [50, 76], cutoff: 1900, lfo: [0.035, 500], width: 0.6 },
      arp:    { inst: 'harp', vol: 0.11, pattern: 'wide', alt: '1573', register: 64, span: 2, rhythm: ['x.x.x.x.x.x.', 'x.x.x.....x.', 'x...x.x.x...'], pan: -0.3, cutoff: 3600, octaveProb: 0.12 },
      melody: { inst: 'ePiano', vol: 0.07, register: 76, phraseBars: 2, stepProb: 0.5, leapProb: 0.25, restProb: 0.2, phrasePlay: [1, 0, 1, 0], pan: 0.3,
                rhythms: ['x-----x-----x-----------', 'x-----------x---x-x-----'] },
      bass:   { inst: 'subBass', vol: 0.12, register: 40, patterns: ['R-----------', 'R-----F-----'], cutoff: 450, hold: true },
      fx: { delayBeats: 0.5, feedback: 0.28, delayWet: 0.16, reverb: 0.26 }, humanize: { time: 0.012, vel: 0.08 }, variation: 0.15, trim: -3.3
    },

    forest: {
      name: 'Mysterious Forest', desc: 'Hirajoshi plucks over a low drone, with a far-off bell answering.',
      mood: 'mysterious', root: 9, scale: 'hirajoshi', harmonyScale: 'aeolian', tempo: 66, beatsPerBar: 4, barsPerChord: 2,
      progressions: { A: PROGRESSIONS.mysterious[0], B: PROGRESSIONS.mysterious[1] },
      form: [['intro', 4, 'drone pad:0.6', 'A'], ['A', 8, 'drone pad arp', 'A'], ['A2', 8, 'drone pad arp melody', 'A'],
             ['B', 8, 'drone pad arp:0.7 melody:0.8', 'B'], ['hush', 4, 'drone pad arp:0.4', 'A']],
      loopFrom: 1,
      pad:    { inst: 'darkPad', vol: 0.08, voicing: 'close', register: [50, 69], cutoff: 850, lfo: [0.03, 250] },
      arp:    { inst: 'koto', vol: 0.12, pattern: 'broken', alt: 'alternating', register: 57, span: 2, rhythm: ['x.....x...x.....', 'x...x......x.x..', 'x.....x.x.......'], pan: -0.25, cutoff: 2400, octaveProb: 0.1, melodic: true },
      melody: { inst: 'bell', vol: 0.06, register: 81, phraseBars: 2, stepProb: 0.55, leapProb: 0.15, restProb: 0.25, phrasePlay: [0, 1, 0, 1], pan: 0.4, answer: true,
                rhythms: ['........x-----x-..........x-----', '............x---x---x-----------'] },
      drone:  { inst: 'drone', vol: 0.09, register: 33, fifth: true },
      fx: { delayBeats: 0.75, feedback: 0.3, delayWet: 0.16, reverb: 0.3 }, humanize: { time: 0.014, vel: 0.1 }, variation: 0.15, trim: 2.2
    },

    nostalgia: {
      name: 'Warm Nostalgia', desc: 'Retro soft-square keys, lazy swing and gentle tape wobble, never harsh.',
      mood: 'nostalgic', root: 0, scale: 'majorPentatonic', harmonyScale: 'major', tempo: 86, beatsPerBar: 4, barsPerChord: 1, swing: 0.14,
      progressions: { A: PROGRESSIONS.nostalgic[0], B: PROGRESSIONS.nostalgic[1] },
      form: [['intro', 4, 'arp pad:0.6', 'A'], ['A', 8, 'pad arp bass perc:0.6', 'A'], ['A2', 8, 'pad arp bass perc melody', 'A'],
             ['B', 8, 'pad arp bass perc melody:0.8', 'B'], ['A3', 8, 'pad arp bass:0.8 melody:0.5', 'A']],
      loopFrom: 1,
      pad:    { inst: 'warmPad', vol: 0.075, voicing: 'close', register: [52, 70], cutoff: 1400, lfo: [0.06, 300] },
      arp:    { inst: 'softSquare', vol: 0.075, pattern: '1357', alt: '1535', register: 60, span: 1, rhythm: ['x.x.x.x.x.x.x.x.', 'x.x.x.x.x..xx.x.'], pan: -0.2, cutoff: 1900, octaveProb: 0.06, wobble: 9 },
      melody: { inst: 'softSquare', vol: 0.06, register: 72, phraseBars: 2, stepProb: 0.72, leapProb: 0.08, restProb: 0.1, phrasePlay: [1, 0, 1, 1], pan: 0.15, doubling: 0.3, wobble: 9,
                rhythms: ['x-x-x---x-x-----x-x-x---x-------', 'x---x-x-x-x-x---x-------x-------'] },
      bass:   { inst: 'roundBass', vol: 0.11, register: 36, patterns: ['R-------F-------', 'R-----F-O-----P-'], cutoff: 750 },
      perc:   { vol: 0.035, parts: [{ kind: 'tick', pattern: '..x...x...x...x.' }, { kind: 'kick', pattern: 'x.......x.......' }] },
      fx: { delayBeats: 0.75, feedback: 0.18, delayWet: 0.1, reverb: 0.14 }, humanize: { time: 0.01, vel: 0.1 }, variation: 0.12, trim: 1.3
    },

    adventure: {
      name: 'Gentle Adventure', desc: 'Mixolydian and a little livelier: a steady pulse, bass and short answering phrases.',
      mood: 'playful', root: 2, scale: 'mixolydian', tempo: 104, beatsPerBar: 4, barsPerChord: 1,
      progressions: { A: PROGRESSIONS.playful[0], B: PROGRESSIONS.playful[1] },
      form: [['intro', 4, 'pad arp perc:0.5', 'A'], ['A', 8, 'pad arp bass perc', 'A'], ['A2', 8, 'pad arp bass perc melody', 'A'],
             ['B', 8, 'pad arp bass perc melody', 'B'], ['break', 4, 'pad arp:0.6 bass:0.6', 'A'], ['A3', 8, 'pad arp bass perc melody:0.7', 'A']],
      loopFrom: 1,
      pad:    { inst: 'warmPad', vol: 0.08, voicing: 'close', register: [52, 71], cutoff: 1800, lfo: [0.08, 400] },
      arp:    { inst: 'harp', vol: 0.1, pattern: '1535', alt: 'broken', register: 62, span: 1, rhythm: ['x.xx.x.xx.x.x.x.', 'x.x.x.xxx.x.x.x.'], pan: -0.25, cutoff: 3200, octaveProb: 0.05 },
      melody: { inst: 'ePiano', vol: 0.08, register: 74, phraseBars: 2, stepProb: 0.7, leapProb: 0.1, restProb: 0.08, phrasePlay: [1, 0, 1, 1], pan: 0.25, answer: true,
                rhythms: ['x-x-x-x-x---....x-x-x---x-------', 'x---x-x-x-------x-x-x-x-x-------'] },
      bass:   { inst: 'roundBass', vol: 0.12, register: 38, patterns: ['R--R--F-R--R--P-', 'R--R--F-O--F--R-'], cutoff: 900 },
      perc:   { vol: 0.045, parts: [{ kind: 'kick', pattern: 'x.......x.......' }, { kind: 'shaker', pattern: 'o.x.o.x.o.x.o.xo' }] },
      fx: { delayBeats: 0.75, feedback: 0.18, delayWet: 0.1, reverb: 0.15 }, humanize: { time: 0.007, vel: 0.08 }, variation: 0.12, trim: -0.6
    },

    deep: {
      name: 'Deep Calm', desc: 'Very slow minor-ninth harmony, a deep drone and long echoing notes with space between.',
      mood: 'deep', root: 0, scale: 'aeolian', tempo: 54, beatsPerBar: 4, barsPerChord: 2,
      progressions: { A: PROGRESSIONS.deep[0], B: PROGRESSIONS.deep[1] },
      form: [['intro', 4, 'drone pad', 'A'], ['A', 8, 'drone pad melody:0.6', 'A'], ['B', 8, 'drone pad bass arp:0.4 melody:0.5', 'B'],
             ['A2', 8, 'drone pad melody:0.7', 'A']],
      loopFrom: 1,
      pad:    { inst: 'darkPad', vol: 0.085, voicing: 'open', register: [48, 72], cutoff: 1100, lfo: [0.025, 350], width: 0.6 },
      arp:    { inst: 'glass', vol: 0.06, pattern: 'up', alt: '1573', register: 72, span: 1, rhythm: ['x.......x.......', 'x.......x...x...'], pan: -0.3, cutoff: 3000, octaveProb: 0.1 },
      melody: { inst: 'flute', vol: 0.055, register: 67, phraseBars: 4, stepProb: 0.7, leapProb: 0.1, restProb: 0.2, phrasePlay: [1, 0, 1, 0], pan: 0.25,
                rhythms: ['x-------x-------x---------------......x-------x-----------------', 'x-----------x---x-----------------------x-------x---------------'] },
      bass:   { inst: 'subBass', vol: 0.1, register: 36, patterns: ['R---------------'], cutoff: 350, hold: true },
      drone:  { inst: 'drone', vol: 0.1, register: 24, fifth: true },
      fx: { delayBeats: 0.75, feedback: 0.35, delayWet: 0.18, reverb: 0.32 }, humanize: { time: 0.014, vel: 0.08 }, variation: 0.15, trim: 0.4
    }
  };

  /* One style per world by default; the order follows the ten worlds of the game using this. */
  const WORLD_STYLES = ['garden', 'nostalgia', 'rain', 'magic', 'morning', 'sky', 'islands', 'forest', 'adventure', 'deep'];
  /* When a player fixes one style for every world, each world still moves the key a little. */
  const WORLD_SHIFTS = [0, 2, -3, 5, -2, 3, -5, 1, 4, -1];

  /* ------------------------------------------------------------------ helpers */

  function rng(seed) {                               // mulberry32
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash(...parts) { let h = 2166136261; for (const c of parts.join('|')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  const mod = (n, m) => ((n % m) + m) % m;
  const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];

  function parseLayers(spec) {
    const out = {};
    for (const tok of spec.split(/\s+/).filter(Boolean)) { const [k, v] = tok.split(':'); out[k] = v == null ? 1 : +v; }
    return out;
  }
  /* 'x-.X' → [{step, len, vel}] */
  function parseRhythm(str, steps) {
    const s = str.length >= steps ? str.slice(0, steps) : str.repeat(Math.ceil(steps / str.length)).slice(0, steps);
    const out = [];
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === 'x' || c === 'X' || c === 'o') {
        let len = 1; while (i + len < s.length && s[i + len] === '-') len++;
        out.push({ step: i, len, vel: c === 'X' ? 1 : c === 'o' ? 0.45 : 0.8 });
      }
    }
    return out;
  }

  /* Scale arithmetic: a melody pitch is a scale index d; its MIDI note depends on the key. */
  const degToMidi = (d, scale, base) => base + scale[mod(d, scale.length)] + 12 * Math.floor(d / scale.length);
  /* Close voicing with smooth voice leading: every candidate inversion inside the register is
     scored by how far its notes move from the previous chord. */
  function voiceChord(pcs, prev, lo, hi, open) {
    const cands = [];
    for (let inv = 0; inv < pcs.length; inv++) {
      for (let base = lo - 12; base <= hi; base++) {
        if (mod(base, 12) !== pcs[inv]) continue;
        const notes = [base]; let last = base;
        for (let k = 1; k < pcs.length; k++) { let n = last + 1; while (mod(n, 12) !== pcs[(inv + k) % pcs.length]) n++; notes.push(n); last = n; }
        if (open && notes.length >= 3) notes[1] += 12;          // drop the second voice up an octave: open and airy
        notes.sort((a, b) => a - b);
        if (notes[0] < lo || notes[notes.length - 1] > hi) continue;
        cands.push(notes);
      }
    }
    if (!cands.length) return pcs.map(p => lo + mod(p - lo, 12)).sort((a, b) => a - b);
    const centre = (lo + hi) / 2;
    let best = null, bestScore = Infinity;
    for (const c of cands) {
      let s = 0;
      if (prev && prev.length) for (const n of c) s += Math.min(...prev.map(p => Math.abs(p - n)));
      else s = Math.abs(c.reduce((a, b) => a + b, 0) / c.length - centre) * 2;
      s += Math.abs(c.reduce((a, b) => a + b, 0) / c.length - centre) * 0.3;   // stay near the middle over time
      if (s < bestScore) { bestScore = s; best = c; }
    }
    return best;
  }

  /* ------------------------------------------------------------------ motif system */
  /* A motif is a rhythm and a contour of scale indices. Its transformations keep its identity. */
  function makeMotif(r, rhythm, cfg, scaleLen) {
    const notes = parseRhythm(rhythm, rhythm.length);
    let d = pick([0, 2, 4, scaleLen], r) % (scaleLen + 1), dir = r() < 0.6 ? 1 : -1, lastLeap = 0;
    const out = [];
    notes.forEach((n, i) => {
      if (i > 0) {
        const x = r();
        let mv;
        if (lastLeap) mv = -Math.sign(lastLeap);                 // after a leap, step back the other way
        else if (x < cfg.stepProb) mv = dir;
        else if (x < cfg.stepProb + cfg.leapProb) mv = dir * (r() < 0.6 ? 2 : 3);
        else if (x < cfg.stepProb + cfg.leapProb + 0.08) mv = 0;  // an occasional repeated note
        else mv = -dir;
        d += mv; lastLeap = Math.abs(mv) >= 2 ? mv : 0;
        if (r() < 0.3) dir = -dir;
        if (d > scaleLen + 3) { d -= 2; dir = -1; } if (d < -2) { d += 2; dir = 1; }
      }
      out.push({ step: n.step, len: n.len, d, vel: n.vel });
    });
    return out;
  }
  const T = {
    transpose: (m, k) => m.map(n => ({ ...n, d: n.d + k })),
    invert:    m => m.map(n => ({ ...n, d: 2 * m[0].d - n.d })),
    reverse:   m => { const ds = m.map(n => n.d).reverse(); return m.map((n, i) => ({ ...n, d: ds[i] })); },
    step:      (m, i, k) => m.map((n, j) => j === i ? { ...n, d: n.d + k } : n),
    octave:    (m, i, k, len) => m.map((n, j) => j === i ? { ...n, d: n.d + k * len } : n),
    omit:      (m, i) => m.length > 3 ? m.filter((_, j) => j !== i || j === 0) : m,
    neighbour: (m, i, len) => m.map((n, j) => j === i ? { ...n, d: n.d + (n.d % 2 ? 1 : -1) } : n),
    cadence:   (m, len, target) => m.map((n, j) => j === m.length - 1 ? { ...n, d: Math.round((n.d - target) / len) * len + target } : n)
  };

  /* ------------------------------------------------------------------ engine */

  function createEngine(opts) {
    opts = opts || {};
    const getCtx = opts.getContext || (() => null);
    const canPlay = opts.canPlay || (() => true);
    const quality = opts.quality || 'high', low = quality === 'low';
    /* Bars are planned whole (the musical decisions need the bar), but a note's nodes are created
       only when it is at most LOOKAHEAD away, so a stop or a change of style is heard at once. */
    const LOOKAHEAD = opts.lookahead || 0.4, TICK = 120;
    const DRONE_TC = 1.6;                 // the drone fades in and out with the same curve, so a loop seam sums flat
    const mode = opts.mode || 'live';     // 'recorded': play a rendered loop of each piece (see record below)

    let ctx = null, master = null, reverbIn = null, noiseBuf = null, waves = {}, cue = null;
    let song = null, timer = null, volume = 0.4, intensity = 0.45, targetIntensity = 0.45;
    const debug = { mutes: {}, overrides: {}, listeners: [] };

    function setupContext(c) {
      if (ctx === c) return;
      ctx = c;
      /* no compressor or clipper: the styles are mixed to peak near -9 dBFS at full volume, and
         even an idle dynamics node costs as much as a few voices */
      master = ctx.createGain(); master.gain.value = volume;
      master.connect(opts.destination || ctx.destination);
      reverbIn = ctx.createGain();
      (low ? makeAmbience(reverbIn) : makeRoom(reverbIn)).connect(master);
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0); const nr = rng(7); for (let i = 0; i < nd.length; i++) nd[i] = nr() * 2 - 1;
      waves = {};
      for (const k in INSTRUMENTS) {
        const h = INSTRUMENTS[k].wave; if (!Array.isArray(h)) continue;
        const re = new Float32Array(h.length + 1), im = new Float32Array(h.length + 1);
        h.forEach((a, i) => { im[i + 1] = a; });
        waves[k] = ctx.createPeriodicWave(re, im);
      }
      /* the solved cue has its own small bus, so it works over a recording as well as live */
      const cueIn = ctx.createGain(), cueOut = ctx.createGain(), cueRv = ctx.createGain();
      cueOut.gain.value = 0.09; cueRv.gain.value = 0.3;
      cueIn.connect(cueOut); cueOut.connect(master); cueOut.connect(cueRv); cueRv.connect(reverbIn);
      cue = { layers: { arp: { cfg: { inst: 'bell' }, inC: cueIn } }, voices: [], sources: [], key: 0, chord: null };
    }

    /* A small room: decaying noise, darkened as it decays. Generated, never loaded. One mono
       convolution (half the work of a stereo one); the right side hears it 17 ms later. */
    function makeRoom(inp) {
      const conv = ctx.createConvolver();
      conv.channelCount = 1; conv.channelCountMode = 'explicit';
      const len = Math.floor(ctx.sampleRate * 1.6), buf = ctx.createBuffer(1, len, ctx.sampleRate), r = rng(99), d = buf.getChannelData(0);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len, env = Math.pow(1 - t, 2.2) * Math.exp(-t * 3), k = 0.55 - 0.45 * t;   // a one-pole low-pass closing over time
        lp += k * ((r() * 2 - 1) - lp);
        d[i] = lp * env * Math.min(1, i / (ctx.sampleRate * 0.008));
      }
      conv.buffer = buf;
      const out = ctx.createChannelMerger(2), late = ctx.createDelay(0.05);
      late.delayTime.value = 0.017;
      inp.connect(conv); conv.connect(out, 0, 0); conv.connect(late); late.connect(out, 0, 1);
      return out;
    }
    /* The cheaper room for phones: four damped feedback delays at unrelated lengths, alternated
       left and right. About a third of the convolution's cost. */
    function makeAmbience(inp) {
      const out = ctx.createChannelMerger(2);
      [0.0297, 0.0371, 0.0411, 0.0437].forEach((len, i) => {
        const d = ctx.createDelay(0.1), f = ctx.createBiquadFilter(), g = ctx.createGain();
        d.delayTime.value = len * 1.6; f.type = 'lowpass'; f.frequency.value = 2400; g.gain.value = 0.72;
        inp.connect(d); d.connect(f); f.connect(g); g.connect(d);
        const o = ctx.createGain(); o.gain.value = 0.35; f.connect(o); o.connect(out, 0, i % 2);
      });
      return out;
    }

    /* ---------- a song is one running style, with its own buses, delay and state ---------- */
    function makeSong(styleId, rootShift, seedBase, loopSec) {
      const base = STYLES[styleId];
      const st = Object.assign({}, base, debug.overrides.tempo ? { tempo: debug.overrides.tempo } : {});
      const key = mod(st.root + (rootShift || 0) + (debug.overrides.rootShift || 0), 12);
      const scaleName = debug.overrides.scale || st.scale;
      const barDur = 60 / st.tempo * st.beatsPerBar;
      const S = {
        id: styleId, st, key, scaleName, scale: SCALES[scaleName], hScale: SCALES[st.harmonyScale || scaleName],
        stepsPerBar: st.beatsPerBar * 4, stepDur: 60 / st.tempo / 4, seed: seedBase, barDur,
        sectionIdx: 0, barInSection: 0, loop: 0, barCount: 0, nextBar: 0,
        prevVoicing: null, arpPos: 0, voices: [], layers: {}, lfos: [], drone: null,
        queue: [], sources: [], progressions: {}, motifs: null, chord: null, sectionName: '',
        /* slow modulators turn a whole number of times per loop, so a recording's seam lines up */
        loopSec: loopSec || cycleBars(st) * barDur
      };
      S.rate = hzRate => Math.max(1, Math.round(hzRate * S.loopSec)) / S.loopSec;
      for (const k in st.progressions) S.progressions[k] = st.progressions[k].map(parseChord);

      /* Everything the song makes passes through its bus, echoes included, so fading the bus
         fades all of it. The reverb is shared: its send is faded beside the bus. */
      const bus = ctx.createGain();
      bus.connect(master);
      const delay = makeDelay(st.fx, st.fx.delayBeats * 60 / st.tempo);
      delay.out.connect(bus);
      const rvSend = ctx.createGain(); rvSend.gain.value = st.fx.reverb; rvSend.connect(reverbIn);
      S.bus = bus; S.delay = delay; S.rvSend = rvSend;
      /* every style is mixed to the same loudness, so moving between worlds never jumps */
      S.trim = Math.pow(10, (st.trim || 0) / 20);
      bus.gain.setValueAtTime(0.0001, ctx.currentTime); bus.gain.linearRampToValueAtTime(S.trim, ctx.currentTime + 1.2);

      for (const name of ['pad', 'arp', 'melody', 'answer', 'bass', 'drone', 'perc']) {
        const cfg = name === 'answer' ? (st.melody && st.melody.answer ? st.melody : null) : st[name];
        if (cfg) S.layers[name] = makeLayer(name, cfg, S);
      }
      buildMotifs(S);
      return S;
    }

    /* An echo with darkened repeats, one per song, so a new style never inherits the old one's
       tail at the wrong tempo. Stereo ping-pong on high quality, a single line on low. */
    function makeDelay(fx, time) {
      const inp = ctx.createGain(), fb = ctx.createGain(), tone = ctx.createBiquadFilter(), dl = ctx.createDelay(2);
      dl.delayTime.value = time; fb.gain.value = fx.feedback; tone.type = 'lowpass'; tone.frequency.value = 2600;
      inp.connect(tone); tone.connect(dl);
      if (low) { dl.connect(fb); fb.connect(tone); return { inp, out: dl, fb }; }
      const dr = ctx.createDelay(2), out = ctx.createChannelMerger(2);
      dr.delayTime.value = time;                                         // the right echo lands one repeat later
      dl.connect(dr); dr.connect(fb); fb.connect(tone);
      dl.connect(out, 0, 0); dr.connect(out, 0, 1);
      return { inp, out, fb };
    }

    /* A slowly moving delay: chorus when heard beside the dry sound, vibrato or tape wobble when
       it is all you hear. One node for the whole layer instead of a modulator on every note. */
    function modDelay(S, base, depth, rate) {
      const d = ctx.createDelay(0.1), lfo = ctx.createOscillator(), lg = ctx.createGain();
      d.delayTime.value = base; lfo.frequency.value = S.rate(rate); lg.gain.value = depth;
      lfo.connect(lg); lg.connect(d.delayTime); lfo.start(); S.lfos.push(lfo);
      return d;
    }
    const centsToDepth = (cents, rate) => (Math.pow(2, cents / 1200) - 1) / (2 * Math.PI * rate);

    /* A layer: one input → (modulation) → panning → one low-pass → level → song bus, delay, reverb.
       Nodes that would do nothing, such as a centred panner or an open filter, are left out. */
    function makeLayer(name, cfg, S) {
      const out = ctx.createGain(), inC = ctx.createGain(), L = { name, cfg, inC, out, detune: 0 };
      let into = out;
      if (cfg.cutoff) {
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = cfg.cutoff; filt.Q.value = 0.5;
        try { filt.frequency.automationRate = 'k-rate'; } catch (e) {}
        filt.connect(out); into = filt; L.filt = filt;
      }
      const panTo = (node, p) => {
        if (p && ctx.createStereoPanner) { const n = ctx.createStereoPanner(); n.pan.value = p; node.connect(n); n.connect(into); }
        else node.connect(into);
      };
      const pan = name === 'answer' ? Math.abs(cfg.pan || 0.25) + 0.15 : (cfg.pan || 0);   // the answer comes from the right
      const inst = INSTRUMENTS[cfg.inst] || {};
      const kind = name === 'answer' ? null : cfg.wobble ? 'wobble' : inst.mod;
      if (low) {
        /* no moving delays on phones: each note gets a small fixed detune instead, which keeps
           some of the chorus's life for none of its cost */
        L.detune = kind === 'chorus' ? 5 : kind === 'wobble' ? cfg.wobble * 0.6 : 0;
        panTo(inC, pan);
      } else if (kind === 'chorus') {
        /* dry on one side, a moving copy on the other: width, and the beating of detuned voices */
        const w = cfg.width != null ? cfg.width : 0.45;
        panTo(inC, -w);
        const d = modDelay(S, 0.012, 0.0035, 0.23); inC.connect(d); panTo(d, w);
      } else if (kind) {
        const d = kind === 'wobble' ? modDelay(S, 0.006, centsToDepth(cfg.wobble, 0.55), 0.55) : modDelay(S, 0.003, centsToDepth(7, 4.8), 4.8);
        inC.connect(d); panTo(d, pan);
      } else panTo(inC, pan);
      out.connect(S.bus);
      out.gain.value = name === 'answer' ? S.st.melody.vol * 0.9 : cfg.vol;
      /* sends: the melody and the bells get the most space, the bass none */
      const dSend = { pad: 0.25, arp: 1, melody: 1, answer: 1.2, bass: 0, drone: 0, perc: 0.4 }[name];
      const rSend = { pad: 1, arp: 0.8, melody: 1, answer: 1.2, bass: 0.15, drone: 0.4, perc: 0.5 }[name];
      if (dSend) { const g = ctx.createGain(); g.gain.value = dSend * S.st.fx.delayWet / 0.15; out.connect(g); g.connect(S.delay.inp); }
      if (rSend) { const g = ctx.createGain(); g.gain.value = rSend; out.connect(g); g.connect(S.rvSend); }
      return L;
    }

    /* Fade a song out from time `at` (now by default): its bus, which carries its echoes, and its
       reverb and echo sends. Nothing still waiting in its queue is made, and any source already
       made but not yet started is cancelled, so nothing sounds after the fade. */
    function disposeSong(S, fade, at) {
      const now = ctx.currentTime, t = Math.max(at || now, now);
      S.dead = true; S.queue = [];
      const down = (p, v) => {
        try { p.cancelScheduledValues(t); p.setValueAtTime(v, t); p.linearRampToValueAtTime(0.0001, t + fade); } catch (e) {}
      };
      down(S.bus.gain, t > now + 0.01 ? S.trim : Math.max(0.0001, S.bus.gain.value));
      down(S.rvSend.gain, S.st.fx.reverb);
      down(S.delay.inp.gain, 1);
      for (const x of S.sources) if (x.t > t) try { x.n.stop(t); } catch (e) {}
      setTimeout(() => {
        try { S.bus.disconnect(); S.rvSend.disconnect(); S.delay.out.disconnect(); } catch (e) {}
        S.lfos.concat(S.drone || []).forEach(o => { try { o.stop(); o.disconnect(); } catch (e) {} });
      }, (t - now + fade + 2) * 1000);
    }

    /* ---------- the note: one oscillator, an FM strike for bells and keys, one envelope ---------- */
    function note(S, layerName, midi, t, dur, vel, instName, keep) {
      const L = S.layers[layerName]; if (!L) return;
      const key = instName || L.cfg.inst, inst = INSTRUMENTS[key]; if (!inst) return;
      const f = hz(midi), env = inst.env, peak = clamp(vel, 0, 1.2) * inst.gain;
      const end = t + dur + env.r + 0.05;
      /* voice budget: a busy moment drops a quiet arpeggio or percussion note rather than stutter
         on a phone. A voice counts until it is half released. */
      S.voices = S.voices.filter(e => e > t);
      if (!keep && S.voices.length >= (low ? 10 : 28) && (layerName === 'arp' || layerName === 'perc')) return;
      S.voices.push(t + dur + env.r * 0.5);
      if (opts.trace) opts.trace({ layer: layerName, midi, t, dur, vel, chord: (S.noteChord || S.chord || {}).sym, key: S.key });   // the chord the note was planned over

      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + env.a);                            // linear from zero: no click
      if (env.s < 1) g.gain.setTargetAtTime(peak * env.s, t + env.a, env.d / 3);
      g.gain.setTargetAtTime(0, t + Math.max(dur, env.a), env.r / 5);              // release from wherever it is
      const o = ctx.createOscillator();
      if (waves[key]) o.setPeriodicWave(waves[key]); else o.type = inst.wave;
      o.frequency.value = f;
      if (L.detune) o.detune.value = (Math.random() * 2 - 1) * L.detune;
      o.connect(g); g.connect(L.inC);
      if (inst.fm) {
        /* two-operator FM, bright at the strike and mellow as it rings. The modulator fades and
           leaves after the strike, so the rest of the note is a plain sine. */
        const m = ctx.createOscillator(), mg = ctx.createGain(), mEnd = Math.min(end, t + inst.fm.decay * 5);
        m.frequency.value = f * inst.fm.ratio;
        mg.gain.setValueAtTime(f * inst.fm.index * (0.6 + 0.4 * vel), t);
        mg.gain.setTargetAtTime(0, t, inst.fm.decay);
        m.connect(mg); mg.connect(o.frequency);
        m.start(t); m.stop(mEnd);
        m.onended = () => { try { m.disconnect(); mg.disconnect(); } catch (e) {} };
        S.sources.push({ n: m, t, end: mEnd });
      }
      o.start(t); o.stop(end);
      S.sources.push({ n: o, t, end });
      /* a finished note leaves the graph entirely, or its nodes would go on being processed */
      o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (e) {} };
    }

    /* Percussion hits share one filter per kind; each hit is a source and a gain, released when done. */
    function perc(S, kind, t, vel) {
      const L = S.layers.perc; if (!L) return;
      const g = ctx.createGain(); let src, end;
      if (kind === 'shaker' || kind === 'tick') {
        L.filters = L.filters || {};
        let f = L.filters[kind];
        if (!f) {
          f = L.filters[kind] = ctx.createBiquadFilter();
          f.type = kind === 'shaker' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'shaker' ? 7000 : 3200; f.Q.value = kind === 'tick' ? 3 : 0.7;
          f.connect(L.inC);
        }
        src = ctx.createBufferSource(); src.buffer = noiseBuf;
        const len = kind === 'shaker' ? 0.07 : 0.03;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * (kind === 'tick' ? 1.4 : 0.8), t + 0.004);
        g.gain.setTargetAtTime(0, t + 0.006, len / 3);
        end = t + len * 3;
        src.connect(g); g.connect(f); src.start(t, Math.random() * 0.3); src.stop(end);
      } else {
        src = ctx.createOscillator(); src.type = 'sine';
        if (kind === 'kick') {
          src.frequency.setValueAtTime(120, t); src.frequency.exponentialRampToValueAtTime(48, t + 0.12);
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 2.2, t + 0.005); g.gain.setTargetAtTime(0, t + 0.01, 0.08);
        } else {                                     // a raindrop: a tiny high note from the chord, falling slightly
          const f0 = hz(vel.midi); src.frequency.setValueAtTime(f0 * 1.02, t); src.frequency.exponentialRampToValueAtTime(f0, t + 0.05);
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel.v * 1.3, t + 0.003); g.gain.setTargetAtTime(0, t + 0.005, 0.07);
        }
        end = t + 0.45;
        src.connect(g); g.connect(L.inC); src.start(t); src.stop(end);
      }
      S.sources.push({ n: src, t, end });
      src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (e) {} };
    }

    /* ---------- drone: the tonic (and a quiet fifth) held for the whole song, breathing ---------- */
    function startDrone(S, t) {
      const cfg = S.st.drone, L = S.layers.drone; if (!cfg || !L || S.drone) return;
      const f = hz(cfg.register + S.key), g = ctx.createGain(), breath = ctx.createGain();
      const br = ctx.createOscillator(), bg = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      breath.gain.value = 0.8; br.frequency.value = S.rate(0.07); bg.gain.value = 0.2;   // a slow swell, never to silence
      br.connect(bg); bg.connect(breath.gain);
      const o = ctx.createOscillator(); o.setPeriodicWave(waves.drone); o.frequency.value = f; o.connect(g);
      const oscs = [o, br];
      if (cfg.fifth) {
        const o5 = ctx.createOscillator(), g5 = ctx.createGain(); o5.frequency.value = f * 1.5; o5.detune.value = 3; g5.gain.value = 0.18;
        o5.connect(g5); g5.connect(g); oscs.push(o5);
      }
      g.connect(breath); breath.connect(L.inC);
      oscs.forEach(x => x.start(t));
      S.drone = oscs; S.droneGain = g;
    }

    /* ---------- form and harmony ---------- */
    const sectionAt = (S, idx) => S.st.form[idx];
    function chordFor(S, sIdx, bar) {
      const sec = sectionAt(S, sIdx), prog = S.progressions[sec[3]] || S.progressions.A;
      return prog[Math.floor(bar / S.st.barsPerChord) % prog.length];
    }
    function nextPos(S, sIdx, bar) {
      bar++;
      if (bar >= sectionAt(S, sIdx)[1]) { bar = 0; sIdx++; if (sIdx >= S.st.form.length) sIdx = S.st.loopFrom || 0; }
      return [sIdx, bar];
    }

    /* ---------- melody: motifs, periods, realisation on the harmony ---------- */
    function buildMotifs(S, epoch) {
      const m = S.st.melody; if (!m) return;
      const n = S.scale.length;
      /* the call is the world's identity and never changes; the answer is reshaped every epoch */
      const r = rng(hash(S.seed, S.id, 'motif'));
      const rhythmA = pick(m.rhythms, r);
      const A = S.motifs ? S.motifs.A : makeMotif(r, rhythmA, m, n);
      const rb2 = rng(hash(S.seed, S.id, 'answer', epoch || 0));
      const rhythmB = pick(m.rhythms, rb2);
      /* the answer takes a second rhythm and is an inversion or a lift of the call */
      let B = rb2() < 0.5 ? T.invert(A) : T.transpose(A, rb2() < 0.5 ? 2 : -1);
      const rb = parseRhythm(rhythmB, rhythmB.length);
      B = rb.map((x, i) => ({ step: x.step, len: x.len, vel: x.vel, d: (B[i % B.length] || B[0]).d }));
      S.motifs = { A, B, stepsPerPhrase: m.phraseBars * S.stepsPerBar };
    }
    /* phrase k of the four-phrase period: A, A' (small change), B (answer), A'' (ends home) */
    function phraseNotes(S, k, r) {
      const n = S.scale.length, M = S.motifs, v = S.st.variation || 0.12;
      let p;
      if (k === 0) p = M.A;
      else if (k === 1) p = r() < 0.5 ? T.step(M.A, M.A.length - 1, r() < 0.5 ? 1 : -1) : T.neighbour(M.A, Math.floor(M.A.length / 2));
      else if (k === 2) p = M.B;
      else p = T.cadence(M.A, n, 0);
      /* constrained variation: the same rng gives the same answer on every stable loop */
      if (r() < v) p = T.omit(p, 1 + Math.floor(r() * (p.length - 1)));
      if (r() < v * 0.7) p = T.octave(p, Math.floor(r() * p.length), r() < 0.5 ? 1 : -1, n);
      /* a varied loop reshapes every phrase but the opening call, which carries the identity */
      if (S.variant && k === 2) p = r() < 0.5 ? T.reverse(p) : T.transpose(p, 1);
      else if (S.variant && k === 0) p = r() < 0.5 ? T.neighbour(p, Math.floor(p.length / 2)) : T.octave(p, p.length - 1, 1, n);   // the call only gains an ornament or a lifted ending
      else if (S.variant && k > 0) p = r() < 0.5 ? T.transpose(p, r() < 0.5 ? 1 : -1) : T.octave(T.neighbour(p, 0), p.length - 1, 1, n);
      if (k === 3) p = T.cadence(p, n, 0);
      if (k === 1 && r() < 0.5) p = T.cadence(p, n, 2);               // half cadence: end on the third
      return p;
    }
    /* The melody's pitch for scale index d over a chord.
       Strong notes land on a stable chord tone: one with no semitone neighbour in the chord, so the
       root and the seventh of a maj7 never rub against the pad. Longer weak notes may be any scale
       tone that does not sit a semitone from a chord tone. Short notes pass freely. When snapping
       would repeat the previous note although the motif moves, the next tone its way is taken. */
    function realise(S, scale, d, chord, strong, len, base, prev, dir) {
      const target = degToMidi(d, scale, base);
      if (!strong && len < 2 && target !== prev) return target;
      const pcs = chord.iv.map(i => mod(S.key + chord.off + i, 12));
      const semi = (a, b) => { const x = mod(a - b, 12); return x === 1 || x === 11; };
      let stable = pcs.filter(p => !pcs.some(q => semi(p, q)));
      if (!stable.length) stable = pcs.slice(0, 3);
      const inScale = x => scale.includes(mod(x - base, 12));
      const ok = strong ? x => stable.includes(mod(x, 12))
               : len >= 2 ? x => (inScale(x) || pcs.includes(mod(x, 12))) && !pcs.some(c => semi(x, c))
               : x => inScale(x);
      let best = target, bestScore = Infinity;
      for (let x = target - 9; x <= target + 9; x++) {
        if (!ok(x)) continue;
        let s = Math.abs(x - target);
        if (prev != null && x === prev) s += dir ? 9 : 4;                      // the motif moves, so should we; even a written repeat prefers a neighbour
        if (prev != null && dir && Math.sign(x - prev) === -dir) s += 1.5;     // and the same way
        if (s < bestScore) { bestScore = s; best = x; }
      }
      /* never leap more than an octave: fold back toward the last note (same pitch class, same harmony) */
      if (prev != null) { while (best - prev > 12) best -= 12; while (prev - best > 12) best += 12; }
      return best;
    }

    /* ---------- one bar ----------
       Plans a whole bar and queues its events; flush() turns them into nodes shortly before they
       sound. In a dry bar (the silent pre-roll of a recording) only the state moves on. */
    function renderBar(S, t0) {
      const st = S.st, sec = sectionAt(S, S.sectionIdx), bar = S.barInSection;
      S.rendered = true;
      /* variation schedule: two loops the same, the third varied; every eighth loop a new epoch
         reshapes the answer phrase. Every seed below takes vKey, so stable loops repeat exactly. */
      const epoch = Math.floor(S.loop / 8);
      S.variant = S.loop % 3 === 2;
      S.vKey = S.variant ? 'v' + S.loop : 'e' + epoch;
      if (S.epoch !== epoch) { if (S.epoch != null) buildMotifs(S, epoch); S.epoch = epoch; }
      const layers = parseLayers(sec[2]);
      for (const k in debug.mutes) if (debug.mutes[k]) delete layers[k];
      const chord = chordFor(S, S.sectionIdx, bar);
      const [ns, nb] = nextPos(S, S.sectionIdx, bar), next = chordFor(S, ns, nb);
      const chordStart = bar % st.barsPerChord === 0;
      const barSeed = hash(S.seed, S.id, S.sectionIdx, bar, S.vKey);
      const r = rng(barSeed), rv = Math.random;              // r: follows the variation schedule, rv: humanising only
      const I = intensity, hum = st.humanize || { time: 0.008, vel: 0.08 };
      const spb = S.stepsPerBar, sd = S.stepDur;
      const at = (step, human) => {
        let t = t0 + step * sd;
        if (st.swing && step % 4 === 2) t += st.swing * sd * 2;
        if (human !== false) t += (rv() * 2 - 1) * hum.time;
        /* a recording never starts a note before its bar line, or the loop would cut into the attack */
        return Math.max(t, S.recording ? t0 : t0 - 0.004);
      };
      const hv = v => v * (1 + (rv() * 2 - 1) * hum.vel);
      /* queue helpers: a note, a percussion hit, anything else. `hold` events (pads, drone, held
         bass) are still made if the page was late; short notes that are late are skipped. */
      const N = (layer, m, t, dur, vel, inst, hold) => S.queue.push({ t, hold, fn: () => { S.noteChord = chord; note(S, layer, m, Math.max(t, ctx.currentTime), dur, vel, inst); } });
      const P = (kind, t, vel) => S.queue.push({ t, fn: () => perc(S, kind, t, vel) });
      S.chord = chord; S.sectionName = sec[0]; S.activeLayers = Object.keys(layers);
      /* chord-scale pairing: an augmented chord borrows the whole-tone scale for its bar */
      const scaleOverride = chord.q === 'aug' ? SCALES.wholeTone : null;
      const rootPc = mod(S.key + chord.off, 12);
      const chordPcs = chord.iv.map(i => mod(rootPc + i, 12));

      /* pad: one voicing per chord, held to the next change with an overlapping release */
      if (layers.pad && chordStart && st.pad) {
        const [lo, hi] = st.pad.register;
        /* a ninth chord drops its fifth, so four voices carry the colour */
        const ivs = chord.iv.length > 4 ? chord.iv.filter((_, i) => i !== 2) : chord.iv;
        const pcs = ivs.slice(0, low ? 3 : 4).map(i => mod(rootPc + i, 12));
        const v = voiceChord(pcs, S.prevVoicing, lo, hi, st.pad.voicing === 'open');
        S.prevVoicing = v;
        const dur = S.barDur * st.barsPerChord;
        v.forEach((m, i) => N('pad', m, t0 + i * 0.012, dur, hv(0.75 * layers.pad) / Math.sqrt(v.length / 3), null, true));
      }

      /* bass: pattern symbols on the grid; 'hold' styles tie across the whole chord */
      if (layers.bass && st.bass && (!st.bass.hold || chordStart)) {
        const pat = pick(st.bass.patterns, rng(hash(S.seed, 'bass', S.sectionIdx, S.vKey)));
        const lowB = st.bass.register, rootMidi = lowB + mod(rootPc - lowB, 12);
        const nextRoot = lowB + mod(S.key + next.off - lowB, 12);
        const bassScale = scaleOverride || S.hScale;
        for (const n of parseRhythm(pat.replace(/[RFOTP]/g, 'x'), spb)) {
          const c = pat[n.step];
          let m = rootMidi;
          if (c === 'F') m = rootMidi + (chord.iv.includes(6) ? 6 : chord.iv.includes(8) ? 8 : 7);
          else if (c === 'O') m = rootMidi + 12;
          else if (c === 'T') m = rootMidi + chord.iv[1];
          else if (c === 'P') {                                   // approach the next root by a scale step
            const nr = nextRoot, up = nr + 12 * (nr < rootMidi - 5 ? 1 : 0);
            const cands = [-2, -1, 1, 2].map(x => up + x).filter(x => bassScale.includes(mod(x - S.key, 12)));
            m = cands.length ? cands.sort((a, b) => Math.abs(a - rootMidi) - Math.abs(b - rootMidi))[0] : rootMidi + 7;
          }
          let len = n.len * sd;
          if (st.bass.hold) len = S.barDur * st.barsPerChord - 0.05;
          N('bass', m, at(n.step), len * 0.95, hv(0.8 * layers.bass * (c === 'P' ? 0.75 : 1)), null, st.bass.hold);
        }
      }

      /* drone: started once, then left alone; a section without it lets it fade */
      if (st.drone && !S.dry) {
        if (layers.drone && !S.droneStarted) { S.droneStarted = true; S.queue.push({ t: t0, hold: true, fn: () => startDrone(S, Math.max(t0, ctx.currentTime)) }); }
        if (S.droneOn !== !!layers.drone) {
          const on = S.droneOn = !!layers.drone;
          S.queue.push({ t: t0, hold: true, fn: () => { if (S.droneGain) S.droneGain.gain.setTargetAtTime(on ? 0.6 : 0, Math.max(t0, ctx.currentTime), DRONE_TC); } });
        }
      }

      /* arpeggio: chord tones in a rising register, a stable rhythm per section, gentle thinning;
         phones drop the sixteenth offbeats and a little more */
      if (layers.arp && st.arp) {
        const A = st.arp, secR = rng(hash(S.seed, 'arp', S.sectionIdx, S.vKey));
        const rhythm = parseRhythm(pick(A.rhythm, secR), spb);
        const patName = (S.variant && A.alt) ? A.alt : A.pattern;
        const pat = ARP_PATTERNS[patName];
        const tones = chord.iv.map(i => A.register + mod(rootPc - A.register, 12) + i).sort((a, b) => a - b);
        if (chordStart) S.arpPos = r() < 0.15 ? 1 : 0;          // occasional inversion of the pattern's start
        const density = clamp(layers.arp * (0.65 + I * 0.6) * (low ? 0.8 : 1), 0, 1);
        rhythm.forEach((n, j) => {
          const strong = n.step % 4 === 0;
          if (!strong && r() > density) { S.arpPos++; return; }
          if (low && n.step % 2 === 1) { S.arpPos++; return; }
          if (rv() < 0.04 && !strong) { S.arpPos++; return; }   // a breath now and then
          const idx = pat[S.arpPos % pat.length]; S.arpPos++;
          const span = A.span || 1;
          let m = tones[idx % tones.length] + 12 * Math.floor(idx / tones.length);
          if (m > A.register + 12 * span + 4) m -= 12;
          if (j === rhythm.length - 1 && r() < (A.octaveProb || 0)) m += 12;
          N('arp', m, at(n.step), Math.max(n.len * sd, sd * 2), hv(n.vel * (strong ? 0.95 : 0.75)));
        });
      }

      /* melody: a four-phrase period, some phrases left silent on purpose */
      if (layers.melody && st.melody && S.motifs) {
        const M = st.melody, spp = S.motifs.stepsPerPhrase;
        const phraseBar = S.barCount % M.phraseBars;
        const phraseIdx = Math.floor(S.barCount / M.phraseBars) % 4;
        const plays = M.phrasePlay[phraseIdx] && (layers.melody >= 1 || rng(hash(S.seed, 'mp', S.barCount - phraseBar, S.epoch))() < layers.melody + I * 0.3);
        if (plays) {
          const pr = rng(hash(S.seed, 'phr', phraseIdx, S.sectionIdx, S.vKey));
          const phrase = phraseNotes(S, phraseIdx, pr);
          const lo = phraseBar * spb, hi = lo + spb;
          const base = S.key + 12 * Math.floor((M.register - S.key) / 12);
          const sc = scaleOverride || S.scale;
          const answerVoice = M.answer && phraseIdx === 2 && S.layers.answer;
          /* continue from the note actually played last, not from the motif's unsnapped pitch */
          const before = phrase.filter(n => n.step < lo), last = before[before.length - 1];
          let prevM = S.lastMel != null ? S.lastMel : null, prevD = last ? last.d : null;
          for (const n of phrase) {
            if (n.step < lo || n.step >= hi) continue;
            if (n.step > 0 && rng(hash(S.seed, 'rest', S.sectionIdx, bar, S.epoch, n.step))() < M.restProb * (1.2 - I)) continue;
            /* strong: the downbeat, the middle of a four-beat bar, or a note of half a bar or more */
            const step = n.step - lo, strong = step === 0 || (spb === 16 && step === 8) || n.len >= spb / 2;
            const m = realise(S, sc, n.d, chord, strong, n.len, base, prevM, prevD == null ? 0 : Math.sign(n.d - prevD));
            prevM = m; prevD = n.d; S.lastMel = m;
            const len = Math.min(n.len, spp - n.step) * sd;
            const v = hv(n.vel * 0.85);
            if (answerVoice) N('answer', m + 12, at(step), len, v * 0.8, st.melody.inst === 'bell' ? 'glass' : 'bell');
            else {
              const tt = at(step);                              // a doubling sounds with its note, not beside it
              N('melody', m, tt, len, v);
              if (M.doubling && rv() < M.doubling * 0.5 && strong) N('melody', m + 12, tt, len, v * 0.35);
            }
          }
        }
      }

      /* percussion: a pulse you feel more than hear */
      if (layers.perc && st.perc) {
        for (const part of st.perc.parts) {
          if (part.kind === 'drop') {
            for (let s = 0; s < spb; s += 2) if (rv() < part.prob * layers.perc * (0.7 + I * 0.6) * (low ? 0.6 : 1)) {
              const pc = pick(chordPcs, rv), m = 84 + mod(pc - 84, 12) + (rv() < 0.4 ? 12 : 0);
              P('drop', at(s), { midi: m, v: hv(0.35) });
            }
            continue;
          }
          for (const n of parseRhythm(part.pattern, spb)) {
            if (n.vel < 0.5 && (I < 0.3 || low)) continue;
            P(part.kind, at(n.step), hv(n.vel * layers.perc * (0.6 + I * 0.6)));
          }
        }
      }

      /* filter movement: the cutoff follows a very slow sine, set in small steps through the bar
         rather than by an audio-rate LFO, which would make every filter recompute on every sample */
      if (!S.dry) for (const k in S.layers) {
        const L = S.layers[k]; if (!L.filt || !L.cfg.lfo) continue;
        const [rate, depth] = L.cfg.lfo, bright = 1 + (I - 0.45) * 0.3, rq = S.rate(rate);
        for (let i = 0; i < 8; i++) {
          const t = t0 + i * S.barDur / 8;
          L.filt.frequency.setValueAtTime(Math.max(200, (L.cfg.cutoff + depth * Math.sin(2 * Math.PI * rq * t)) * bright), t);
        }
      }

      /* advance the form */
      S.barCount++;
      const [s2, b2] = nextPos(S, S.sectionIdx, bar);
      if (s2 < S.sectionIdx || (s2 === S.sectionIdx && b2 === 0 && st.form.length === 1)) S.loop++;
      if (b2 === 0 && s2 === (st.loopFrom || 0)) S.barCount = 0;       // phrases count from the start of each cycle
      S.sectionIdx = s2; S.barInSection = b2;
      intensity += (targetIntensity - intensity) * 0.35;
      if (!S.dry) notify();
    }

    /* Make the queued events due before `until`. Short events already late by more than 60 ms
       are dropped (a late note is worse than a missing one); held ones are made anyway. */
    function flush(S, until, lateBefore) {
      if (!S.queue.length) return;
      const keep = [];
      for (const e of S.queue) {
        if (e.t >= until) { keep.push(e); continue; }
        if (e.t < lateBefore && !e.hold) continue;
        try { e.fn(); } catch (err) { if (opts.onError) opts.onError(err); }
      }
      S.queue = keep;
      if (S.sources.length > 64) { const now = ctx.currentTime; S.sources = S.sources.filter(x => x.end > now); }
    }

    /* ---------- the solved cue: a brief rising arpeggio in the chord of the moment ---------- */
    function flourish(chord, key, stepDur) {
      if (!cue || !chord) return;
      cue.chord = chord; cue.key = key;
      const t = ctx.currentTime + 0.08, rootPc = mod(key + chord.off, 12);
      const tones = [0, chord.iv[1], chord.iv[2], 12, chord.iv[1] + 12, chord.iv[2] + 12].map(i => 72 + mod(rootPc - 72, 12) + i);   // the chord's own tones
      tones.forEach((m, i) => note(cue, 'arp', m, t + i * stepDur * 1.1, 0.3, 0.55 - i * 0.04, 'bell', true));
    }

    /* ---------- live scheduler ---------- */
    function tick() {
      timer = null;
      if (!song) return;
      try {
        const c = getCtx();
        if (c && c !== ctx) setupContext(c);
        if (ctx && ctx.state === 'running' && canPlay()) {
          const now = ctx.currentTime;
          if (!song.nextBar || song.nextBar < now + 0.05) song.nextBar = now + 0.1;
          if (song.handover && handOver(song)) return;
          while (song.nextBar < now + LOOKAHEAD) { renderBar(song, song.nextBar); song.nextBar += song.barDur; }
          flush(song, now + LOOKAHEAD, now - 0.06);
        }
      } catch (e) { if (opts.onError) opts.onError(e); }
      timer = setTimeout(tick, TICK);
    }

    function notify() { debug.listeners.forEach(f => { try { f(api.info()); } catch (e) {} }); }

    /* ---------- recorded mode ----------
       A piece is rendered once, in the background, with an OfflineAudioContext: a silent pre-roll
       of the intro and one full cycle, so the state at the loop start is exactly the state at its
       end, then `cycles` form cycles. The tail that rings past the end (reverb, echo, pad releases,
       the drone's fade) is added onto the start, so the buffer loops sample-exactly with no seam
       and no crossfade. Playback is one buffer source: about the cost of a single voice.
       24 kHz stereo float: roughly 190 KB per second, so 15-21 MB for one 80-107 s cycle. */
    const recs = { cache: new Map(), job: null, pending: null, failed: new Set() };
    let player = null, want = null;
    const canRecord = () => mode === 'recorded' && typeof OfflineAudioContext !== 'undefined';

    function recordPiece(id, rootShift, seed) {
      const st = STYLES[id], sr = opts.recordRate || 24000, cycles = opts.recordCycles || 1;
      const barDur = 60 / st.tempo * st.beatsPerBar, loopSec = cycleBars(st) * barDur * cycles;
      const R0 = 0.05, TAIL = 6, total = R0 + loopSec + TAIL;
      const oc = new OfflineAudioContext(2, Math.ceil(total * sr), sr);
      const rec = createEngine({ getContext: () => oc, quality: opts.recordQuality || 'high', onError: opts.onError });
      return rec._record(oc, id, rootShift, seed, cycles, R0, loopSec).then(({ buffer, log }) => {
        const a = Math.round(R0 * sr), b = Math.round((R0 + loopSec) * sr);
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
          const d = buffer.getChannelData(ch);
          for (let i = b; i < d.length; i++) d[a + i - b] += d[i];     // fold the tail onto the start
        }
        return { buffer, log, loopStart: a / sr, loopEnd: b / sr, loopSec, barDur, cycles, id, key: mod(st.root + rootShift, 12),
                 stepDur: 60 / st.tempo / 4, mb: buffer.length * buffer.numberOfChannels * 4 / 1048576 };
      });
    }
    /* runs inside the private engine made for one recording */
    /* async so the planning can yield: a few bars per slice, never one long task on the main thread */
    async function recordInto(oc, id, rootShift, seed, cycles, R0, loopSec) {
      const breathe = () => new Promise(r => setTimeout(r, 0));
      volume = 1;                                     // recorded at unity: the player applies the volume
      setupContext(oc);
      intensity = targetIntensity = 0.45;
      const S = makeSong(id, rootShift, seed, loopSec);
      S.bus.gain.cancelScheduledValues(0); S.bus.gain.setValueAtTime(S.trim, 0);
      const st = S.st, intro = st.form.slice(0, st.loopFrom || 0).reduce((n, r) => n + r[1], 0);
      S.dry = true; S.recording = true;
      for (let i = 0; i < intro + cycleBars(st); i++) { renderBar(S, 0); if (i % 8 === 7) await breathe(); }
      S.dry = false; S.queue = [];
      const bars = cycleBars(st) * cycles, log = [];
      for (let i = 0; i < bars; i++) {
        renderBar(S, R0 + i * S.barDur);
        log.push({ section: S.sectionName, chord: S.chord, layers: S.activeLayers.slice(), loop: S.loop });
        if (i % 8 === 7) await breathe();
      }
      /* at the seam the drone fades out on the curve it faded in on, so the folded sum is flat */
      const B = R0 + loopSec;
      S.queue.push({ t: B, hold: true, fn: () => { if (S.droneGain) S.droneGain.gain.setTargetAtTime(0, B, DRONE_TC); } });
      /* make the nodes a couple of seconds at a time, so the main thread never builds the whole
         piece at once, and finished notes are released as the render goes */
      const STEP = 2, dur = oc.length / oc.sampleRate;
      flush(S, STEP + 0.5, -Infinity);
      for (let s = STEP; s < dur - 0.1; s += STEP) {
        oc.suspend(s).then(() => { flush(S, s + STEP + 0.5, -Infinity); oc.resume(); });
      }
      const buffer = await oc.startRendering();
      return { buffer, log };
    }

    function requestRecording(k, id, rootShift, seed) {
      if (recs.cache.has(k) || recs.failed.has(k) || (recs.job && recs.job.k === k)) return;
      recs.pending = { k, id, rootShift, seed };          // only the latest request waits
      pump();
    }
    function pump() {
      if (recs.job || !recs.pending) return;
      const job = recs.job = recs.pending; recs.pending = null;
      const t0 = Date.now();
      recordPiece(job.id, job.rootShift, job.seed).then(entry => {
        entry.renderMs = Date.now() - t0;
        recs.cache.set(job.k, entry);
        /* keep the newest few, never the one playing */
        const limit = opts.cacheSize || 2;
        for (const key of recs.cache.keys()) {
          if (recs.cache.size <= limit) break;
          if (key !== job.k && !(player && player.k === key) && !(want && want.k === key)) recs.cache.delete(key);
        }
        recs.job = null;
        onRecorded(job.k);
        pump();
      }).catch(e => {
        recs.job = null; recs.failed.add(job.k);
        if (opts.onError) opts.onError(e);
        pump();
      });
    }
    function onRecorded(k) {
      if (!want || want.k !== k) return;
      const entry = recs.cache.get(k);
      if (song && song.k === k) { song.handover = entry; return; }   // the live version hands over at a bar line
      if (song) { disposeSong(song, 0.8); song = null; }
      startPlayer(entry, k, ctx.currentTime + 0.05, 0, 1.5);
      notify();
    }
    /* Live and recorded play the same notes, so the live piece hands over at the next bar line,
       once it is inside the looping cycle, to the matching place in the recording. */
    function handOver(S) {
      const e = S.handover, st = S.st, from = st.loopFrom || 0;
      if (S.sectionIdx < from) return false;                        // still in the intro: wait for the cycle
      let bars = S.barInSection;
      for (let i = from; i < S.sectionIdx; i++) bars += st.form[i][1];
      const idx = Math.max(0, e.log.findIndex((l, i) => i % cycleBars(st) === 0 && ((l.loop % 3 === 2) === !!S.variant)));
      const at = S.nextBar;
      flush(S, Infinity, ctx.currentTime - 0.06);                    // what is already planned still plays
      startPlayer(e, S.k, at, (idx + bars) * e.barDur % e.loopSec, 0.08);
      disposeSong(S, 0.35, at);
      song = null;
      notify();
      return true;
    }
    function startPlayer(entry, k, when, offset, fadeIn) {
      if (player) stopPlayer(0.8);
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = entry.buffer; src.loop = true; src.loopStart = entry.loopStart; src.loopEnd = entry.loopEnd;
      g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(1, when + fadeIn);
      src.connect(g); g.connect(master);
      src.start(when, entry.loopStart + offset);
      player = { src, g, entry, k, t0: when, offset };
    }
    function stopPlayer(fade) {
      const p = player; player = null; if (!p) return;
      const t = ctx.currentTime;
      try { p.g.gain.cancelScheduledValues(t); p.g.gain.setValueAtTime(p.g.gain.value, t); p.g.gain.linearRampToValueAtTime(0, t + fade); p.src.stop(t + fade + 0.05); } catch (e) {}
      p.src.onended = () => { try { p.src.disconnect(); p.g.disconnect(); } catch (e) {} };
    }
    /* where a recording is now: its bar, and from the log its section and chord */
    function playerPos() {
      const e = player.entry, pos = mod(Math.max(0, ctx.currentTime - player.t0) + player.offset, e.loopSec);   // before a handover starts, where it will start
      return { e, l: e.log[Math.min(e.log.length - 1, Math.floor(Math.max(0, pos) / e.barDur))] };
    }

    function playLive(styleId, rootShift, seed, k, fade) {
      if (song && !song.dead && song.k === k) { if (!timer) tick(); return; }
      /* crossfade; a piece replaced before it played a bar has nothing to fade, so it goes at once */
      if (song) disposeSong(song, !song.rendered ? 0.05 : fade);
      song = makeSong(styleId, rootShift, seed);
      song.rootShift = rootShift; song.seedBase = seed; song.k = k;
      if (timer) clearTimeout(timer);
      tick();
    }

    const api = {
      /* Start a style. Asking again for what is already playing changes nothing: the music runs on. */
      play(styleId, o) {
        o = o || {};
        if (!STYLES[styleId]) styleId = 'garden';
        const c = getCtx(); if (!c) return false;
        setupContext(c);
        const rootShift = o.rootShift || 0, seed = o.seed != null ? o.seed : (o.world || 0);
        const fade = o.fade != null ? o.fade : 0.8;
        const k = styleId + '|' + rootShift + '|' + seed + '|' + JSON.stringify(debug.overrides);
        if (o.restart) { if (song && song.k === k) { disposeSong(song, fade); song = null; } if (player && player.k === k) stopPlayer(fade); }
        want = { k, id: styleId, rootShift, seed };
        if (canRecord() && !o.live) {
          if (player && player.k === k) return true;
          const entry = recs.cache.get(k);
          if (entry) {
            if (song) { disposeSong(song, fade); song = null; }
            startPlayer(entry, k, ctx.currentTime + 0.05, 0, 1.2);
            notify(); return true;
          }
          if (player) stopPlayer(fade);
          requestRecording(k, styleId, rootShift, seed);
          if (!recs.failed.has(k) && opts.whileRecording === 'silent') { if (song) { disposeSong(song, fade); song = null; } notify(); return true; }
        } else if (player) stopPlayer(fade);
        playLive(styleId, rootShift, seed, k, fade);
        return true;
      },
      /* Play the world's own style (or a fixed one), at the world's key. */
      playWorld(world, fixedStyle) {
        const byWorld = !fixedStyle || fixedStyle === 'world' || !STYLES[fixedStyle];
        const id = byWorld ? WORLD_STYLES[world % WORLD_STYLES.length] : fixedStyle;
        return api.play(id, { rootShift: byWorld ? 0 : WORLD_SHIFTS[world % WORLD_SHIFTS.length], seed: world });
      },
      stop(fade) {
        fade = fade != null ? fade : 0.8;
        if (timer) { clearTimeout(timer); timer = null; }
        if (song && ctx) disposeSong(song, fade);
        if (player) stopPlayer(fade);
        song = null; want = null; recs.pending = null; notify();
      },
      isPlaying: () => !!(song || player || (want && recs.job)),
      setVolume(v) {
        volume = clamp(v, 0, 1);
        if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.15);
      },
      setIntensity(x) { targetIntensity = clamp(x, 0, 1); },
      getIntensity: () => intensity,
      setMood(styleOrMood) {
        const id = STYLES[styleOrMood] ? styleOrMood : Object.keys(STYLES).find(k => STYLES[k].mood === styleOrMood);
        if (id) api.play(id, { rootShift: want ? want.rootShift : 0, seed: want ? want.seed : 0 });
      },
      /* gameplay hooks: all gentle, none of them restarts the music. A recording cannot change
         its density, so intensity only shapes the live engine. */
      onLevelStart() { targetIntensity = 0.35; },
      onPuzzleProgress(frac) { targetIntensity = clamp(0.35 + 0.4 * frac, 0, 1); },
      onPuzzleSolved() {
        targetIntensity = 0.5;
        if (!ctx || ctx.state !== 'running') return;
        if (song && song.chord) flourish(song.chord, song.key, song.stepDur);
        else if (player) { const { e, l } = playerPos(); if (l) flourish(l.chord, e.key, e.stepDur); }
      },
      onLevelComplete() { targetIntensity = 0.3; },
      /* developer controls: they act on the live engine */
      debug: {
        mute(layer, on) { debug.mutes[layer] = !!on; notify(); },
        override(k, v) { if (v == null || v === '') delete debug.overrides[k]; else debug.overrides[k] = v; if (want) api.play(want.id, { rootShift: want.rootShift, seed: want.seed, restart: true }); },
        subscribe(f) { debug.listeners.push(f); return () => { debug.listeners = debug.listeners.filter(x => x !== f); }; }
      },
      info() {
        const cur = song || (player && player.entry) || (want && STYLES[want.id] && { id: want.id });
        if (!cur || !ctx) return { playing: false };
        const id = song ? song.id : player ? player.entry.id : want.id, st = STYLES[id];
        const base = {
          playing: true, style: id, name: st.name, mood: st.mood, scale: st.scale,
          tempo: st.tempo, meter: st.beatsPerBar + '/4', quality,
          progression: Object.entries(st.progressions).map(([k, p]) => k + ': ' + p.join(' - ')).join('   '),
          cycleSeconds: Math.round(cycleBars(st) * 60 / st.tempo * st.beatsPerBar), intensity: +intensity.toFixed(2),
          audio: ctx.sampleRate + ' Hz, ' + ctx.state, cachedMB: +[...recs.cache.values()].reduce((a, e) => a + e.mb, 0).toFixed(1)
        };
        const chordName = (c, key) => c ? NOTE_NAMES[mod(key + c.off, 12)] + ' ' + c.q + ' (' + c.sym + ')' : '';
        if (song) return Object.assign(base, {
          mode: recs.job && recs.job.k === song.k ? 'live, recording in the background' : 'live',
          key: NOTE_NAMES[song.key], scale: song.scaleName, section: song.sectionName, loop: song.loop, bar: song.barCount,
          chord: chordName(song.chord, song.key), layers: song.activeLayers || [],
          voices: song.voices.filter(e => e > ctx.currentTime).length
        });
        if (player) {
          const { e, l } = playerPos();
          return Object.assign(base, { mode: 'recorded (' + e.renderMs + ' ms to render, ' + e.mb.toFixed(1) + ' MB)', key: NOTE_NAMES[e.key],
            section: l.section, loop: l.loop, chord: chordName(l.chord, e.key), layers: l.layers, voices: 1 });
        }
        return Object.assign(base, { mode: 'recording…', key: NOTE_NAMES[mod(st.root + want.rootShift, 12)], layers: [], voices: 0 });
      },
      /* Schedule a stretch of a style without a clock, for tests and offline listening. */
      renderInto(offlineCtx, styleId, seconds, o) {
        o = o || {};
        setupContext(offlineCtx);
        if (o.intensity != null) { intensity = targetIntensity = o.intensity; }
        const S = makeSong(styleId, o.rootShift || 0, o.seed || 0);
        S.bus.gain.cancelScheduledValues(0); S.bus.gain.setValueAtTime(S.trim, 0);
        let t = 0.05; const log = [];
        while (t < seconds) { renderBar(S, t); log.push({ t, section: S.sectionName, chord: S.chord.sym, layers: S.activeLayers.join(' ') }); t += S.barDur; }
        flush(S, Infinity, -Infinity);
        return { song: S, log };
      },
      /* Record a piece now (for example the next world) so it is ready when it is asked for. */
      prepare(styleId, o) {
        o = o || {};
        if (!canRecord() || !STYLES[styleId]) return;
        const k = styleId + '|' + (o.rootShift || 0) + '|' + (o.seed || 0) + '|' + JSON.stringify(debug.overrides);
        if (!recs.job && !recs.pending) requestRecording(k, styleId, o.rootShift || 0, o.seed || 0);
      },
      /* a recording of this piece, if one is ready (for tests and tools) */
      recording(styleId, o) {
        o = o || {};
        return recs.cache.get(styleId + '|' + (o.rootShift || 0) + '|' + (o.seed || 0) + '|' + JSON.stringify(debug.overrides)) || null;
      },
      _record: recordInto
    };
    return api;
  }

  function cycleBars(st) { return st.form.slice(st.loopFrom || 0).reduce((a, s) => a + s[1], 0); }

  /* 'low' on every phone and tablet: core counts say nothing there (an 8-core phone has a few
     fast cores and a thermal budget), so detect the platform instead. Also 'low' on small desktops. */
  function suggestQuality() {
    const n = typeof navigator !== 'undefined' ? navigator : {}, ua = n.userAgent || '';
    const cap = typeof window !== 'undefined' && window.Capacitor;
    const native = !!(cap && (cap.isNativePlatform ? cap.isNativePlatform() : cap.platform && cap.platform !== 'web'));
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && n.maxTouchPoints > 1);
    if (native || mobile) return 'low';
    return (n.hardwareConcurrency && n.hardwareConcurrency <= 4) || (n.deviceMemory && n.deviceMemory <= 2) ? 'low' : 'high';
  }

  const PuzzleMusic = { createEngine, suggestQuality, STYLES, SCALES, CHORDS, PROGRESSIONS, ARP_PATTERNS, INSTRUMENTS, WORLD_STYLES, WORLD_SHIFTS, parseChord, cycleBars, NOTE_NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = PuzzleMusic;
  else root.PuzzleMusic = PuzzleMusic;
})(typeof window !== 'undefined' ? window : this);
