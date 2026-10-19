// The Words tab of the voice creator: real words, sung, to hear whether they sound as they are written. Type lines
// (or pick a test set), the page looks each word up in a pronouncing dictionary (ARPAbet, as CMUdict writes
// it), splits it into syllables, shows the sounds the singer was given, and flags the ones the engine can only
// approximate today (zh so far; each new sound built leaves this list): those are the sounds still to be built.
// The full CMU dictionary loads when the tab opens (the small list is the fallback). A word not in either can be given as its sounds in braces: {HH AH0 L OW1}. The plan for testing it is in
// docs/VOICE-WORDS.md.

import { FOF_RATE, type FofVoice, renderFof } from '../audio/fof';
import type { SungNote } from '../audio/sing';
import type { Cons, Syllable, Vowel } from '../parts/lyrics';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

/* ---- a small pronouncing dictionary (common lyric words, checked by hand; the full CMUdict backs it up) */

const DICT_TEXT = `
i AY1|you Y UW1|me M IY1|my M AY1|we W IY1|he HH IY1|she SH IY1|it IH1 T|is IH1 Z|the DH AH0|a AH0|and AE1 N D|to T UW1|of AH1 V|in IH1 N|on AA1 N|at AE1 T|for F AO1 R|with W IH1 DH|all AO1 L|so S OW1|but B AH1 T|not N AA1 T|no N OW1|yes Y EH1 S|oh OW1|yeah Y EH1 AH0
love L AH1 V|heart HH AA1 R T|night N AY1 T|day D EY1|light L AY1 T|fire F AY1 ER0|time T AY1 M|life L AY1 F|dream D R IY1 M|dreams D R IY1 M Z|stay S T EY1|go G OW1|know N OW1|feel F IY1 L|fall F AO1 L|fly F L AY1|run R AH1 N|hold HH OW1 L D|hear HH IH1 R|see S IY1|say S EY1|give G IH1 V|take T EY1 K|make M EY1 K|come K AH1 M|home HH OW1 M|down D AW1 N|up AH1 P|out AW1 T|back B AE1 K|again AH0 G EH1 N
never N EH1 V ER0|ever EH1 V ER0|forever F ER0 EH1 V ER0|together T AH0 G EH1 DH ER0|remember R IH0 M EH1 M B ER0|river R IH1 V ER0|water W AO1 T ER0|heaven HH EH1 V AH0 N|little L IH1 T AH0 L|world W ER1 L D|girl G ER1 L|bird B ER1 D|burn B ER1 N|turn T ER1 N|learn L ER1 N|hurt HH ER1 T|her HH ER1|your Y AO1 R|our AW1 ER0|there DH EH1 R|where W EH1 R|here HH IH1 R|what W AH1 T|when W EH1 N|why W AY1|how HH AW1|who HH UW1|this DH IH1 S|that DH AE1 T|they DH EY1|them DH EH1 M|then DH EH1 N|will W IH1 L|can K AE1 N|just JH AH1 S T|like L AY1 K|one W AH1 N|two T UW1|three TH R IY1
thing TH IH1 NG|think TH IH1 NG K|through TH R UW1|sing S IH1 NG|song S AO1 NG|wrong R AO1 NG|strong S T R AO1 NG|street S T R IY1 T|blue B L UW1|green G R IY1 N|black B L AE1 K|red R EH1 D|gold G OW1 L D|cold K OW1 L D|sky S K AY1|sun S AH1 N|moon M UW1 N|rain R EY1 N|wind W IH1 N D|sea S IY1|stars S T AA1 R Z|star S T AA1 R|eyes AY1 Z|tears T IH1 R Z|face F EY1 S|hands HH AE1 N D Z|mind M AY1 N D|soul S OW1 L|free F R IY1|alone AH0 L OW1 N|away AH0 W EY1|tonight T AH0 N AY1 T|tomorrow T AH0 M AA1 R OW0|yesterday Y EH1 S T ER0 D EY2|baby B EY1 B IY0|ready R EH1 D IY0|lonely L OW1 N L IY0|beautiful B Y UW1 T AH0 F AH0 L|every EH1 V R IY0|nothing N AH1 TH IH0 NG|something S AH1 M TH IH0 NG|everything EH1 V R IY0 TH IH2 NG
wanna W AA1 N AH0|gonna G AH1 N AH0|let L EH1 T|get G EH1 T|got G AA1 T|need N IY1 D|want W AA1 N T|tell T EH1 L|call K AO1 L|cry K R AY1|die D AY1|live L IH1 V|break B R EY1 K|broken B R OW1 K AH0 N|shine SH AY1 N|burning B ER1 N IH0 NG|falling F AO1 L IH0 NG|running R AH1 N IH0 NG|walking W AO1 K IH0 NG|waiting W EY1 T IH0 NG|calling K AO1 L IH0 NG|hello HH AH0 L OW1|goodbye G UH2 D B AY1|rock R AA1 K|roll R OW1 L|fight F AY1 T|hit HH IH1 T|kick K IH1 K|shout SH AW1 T|scream S K R IY1 M|chains CH EY1 N Z|judge JH AH1 JH|jump JH AH1 M P|zero Z IH1 R OW0|better B EH1 T ER0|city S IH1 T IY0|party P AA1 R T IY0|butter B AH1 T ER0|button B AH1 T AH0 N|bottle B AA1 T AH0 L|vision V IH1 ZH AH0 N|treasure T R EH1 ZH ER0
heed HH IY1 D|hid HH IH1 D|hayed HH EY1 D|head HH EH1 D|had HH AE1 D|hod HH AA1 D|hawed HH AO1 D|hoed HH OW1 D|hood HH UH1 D|whod HH UW1 D|hud HH AH1 D|heard HH ER1 D|hide HH AY1 D|howd HH AW1 D|hoyd HH OY1 D
bat B AE1 T|pat P AE1 T|bit B IH1 T|pit P IH1 T|sheep SH IY1 P|cheap CH IY1 P|ship SH IH1 P|chip CH IH1 P|thin TH IH1 N|sin S IH1 N|fin F IH1 N|tin T IH1 N|ban B AE1 N|man M AE1 N|van V AE1 N|zip Z IH1 P|sip S IH1 P|rice R AY1 S|lice L AY1 S|wine W AY1 N|dime D AY1 M|time T AY1 M|goat G OW1 T|coat K OW1 T|bed B EH1 D|bad B AE1 D|dog D AO1 G|dock D AA1 K|bake B EY1 K|back B AE1 K
`;
const DICT = new Map<string, string[]>();
for (const e of DICT_TEXT.split(/[|\n]/)) { const t = e.trim().split(/\s+/); if (t.length > 1) DICT.set(t[0], t.slice(1)); }

/** The full CMU pronouncing dictionary (about 135,000 words), loaded when the tab opens; the small list above wins where both have a word. */
let FULL: Record<string, string> | null = null;
export async function loadDictionary(): Promise<number> {
  FULL ??= (await import('cmu-pronouncing-dictionary')).dictionary;
  return Object.keys(FULL).length;
}
const lookup = (tok: string): string[] | undefined => {
  const w = tok.toLowerCase(), bare = w.replace(/'/g, '');
  return DICT.get(bare) ?? (FULL?.[w] ?? FULL?.[bare])?.split(' ');
};

/* ---- sounds: ARPAbet to the engine's own, and where the engine only approximates */

const VOWEL_OF: Record<string, Vowel> = { AA: 'AA', AE: 'AE', AO: 'AO', AW: 'AW', AY: 'AY', EH: 'EH', EY: 'EY', IH: 'IH', IY: 'IY', OW: 'OW', OY: 'OY', UH: 'UH', UW: 'UW', ER: 'ER' };
const CONS_OF: Record<string, Cons> = { P: 'P', B: 'B', T: 'T', D: 'D', K: 'K', G: 'G', M: 'M', N: 'N', NG: 'NG', F: 'F', V: 'V', TH: 'TH', DH: 'DH', S: 'S', Z: 'Z', SH: 'SH', CH: 'CH', JH: 'JH', HH: 'HH', L: 'L', R: 'R', W: 'W', Y: 'Y', ZH: 'SH' };
const LEGAL_PAIRS = new Set(['BL', 'BR', 'KL', 'KR', 'DR', 'FL', 'FR', 'GL', 'GR', 'PL', 'PR', 'TR', 'THR', 'SP', 'ST', 'SK', 'SL', 'SM', 'SN', 'SW', 'KW', 'TW', 'SHR', 'THW', 'DW', 'GW', 'HY', 'BY', 'PY', 'FY', 'MY', 'VY']);
const legalOnset = (c: string[]) => c.length === 1 ? c[0] !== 'NG' && c[0] !== 'ZH' : c.length === 2 ? LEGAL_PAIRS.has(c.join('')) : c.length === 3 && c[0] === 'S' && ['P', 'T', 'K'].includes(c[1]) && ['R', 'L', 'W'].includes(c[2]);

interface Ph { p: string; stress: number; v: boolean }
function parse(codes: string[]): Ph[] {
  return codes.map((c) => { const m = c.match(/^([A-Z]+)([012])?$/)!; return { p: m[1], stress: Number(m[2] ?? 0), v: m[1] in VOWEL_OF || m[1] === 'AH' || m[1] === 'ER' || m[1] === 'AX' }; });
}

export interface WordInfo { word: string; sounds: string; syllables: Syllable[]; approx: string[]; unknown?: boolean }
/** Split a word's sounds into syllables (the longest legal onset to each vowel) and map them to the engine's sounds. */
export function syllabify(word: string, codes: string[]): WordInfo {
  const ph = parse(codes);
  const approx: string[] = [];
  const nuc = ph.map((x, i) => (x.v ? i : -1)).filter((i) => i >= 0);
  const syls: { on: Ph[]; nu: Ph; co: Ph[] }[] = nuc.map((i) => ({ on: [], nu: ph[i], co: [] }));
  if (!syls.length) return { word, sounds: codes.join(' '), syllables: [], approx, unknown: true };
  syls[0].on = ph.slice(0, nuc[0]);
  nuc.forEach((n, k) => {
    const run = ph.slice(n + 1, k + 1 < nuc.length ? nuc[k + 1] : ph.length);
    if (k + 1 === nuc.length) { syls[k].co = run; return; }
    let cut = run.length;
    while (cut > 0 && run.length - cut < 3 && legalOnset(run.slice(cut - 1).map((x) => x.p))) cut--;
    // (a legal onset taken as long as it goes: cut is where the onset starts; a stressed vowel keeps a single consonant after it only if none is left)
    syls[k].co = run.slice(0, cut);
    syls[k + 1].on = run.slice(cut);
  });
  const out: Syllable[] = syls.map((s, k) => {
    const coda: Cons[] = s.co.map((x) => CONS_OF[x.p]).filter(Boolean);
    let vowel: Vowel;
    if (s.nu.p === 'AH') vowel = s.nu.stress ? 'AH' : 'AX';
    else vowel = VOWEL_OF[s.nu.p] ?? 'AX';
    if (s.co.concat(s.on).some((x) => x.p === 'ZH') && !approx.includes('zh (as sh)')) approx.push('zh (as sh)');
    return { onset: s.on.map((x) => CONS_OF[x.p]).filter(Boolean), vowel, coda, stress: s.nu.stress > 0, text: k === 0 ? word : '', wordStart: k === 0 };
  });
  // (a flapped t or d: after a stressed vowel and before an unstressed one, as in "water", "better", "city": a quick voiced tap, not a hard t)
  syls.forEach((s, k) => {
    if (k > 0 && s.on.length === 1 && (s.on[0].p === 'T' || s.on[0].p === 'D') && syls[k - 1].nu.stress > 0 && s.nu.stress === 0) out[k].onset = ['DX'];
    // (a syllabic l or n: "little", "bottle", "button": the l or n is the syllable, with hardly a vowel before it)
    if (s.on.length > 0 && s.nu.stress === 0 && (s.nu.p === 'AH' || s.nu.p === 'IH') && s.co.length > 0 && (s.co[0].p === 'L' || s.co[0].p === 'N')) out[k].syllabic = true;
  });
  return { word, sounds: codes.join(' '), syllables: out, approx };
}

/** A line's words: from the dictionary, or as the sounds given in braces. */
export function wordsOf(line: string): WordInfo[] {
  const out: WordInfo[] = [];
  for (const tok of line.match(/\{[^}]*\}|[A-Za-z']+/g) ?? []) {
    if (tok.startsWith('{')) { const codes = tok.slice(1, -1).trim().split(/\s+/).filter(Boolean); out.push(syllabify(tok, codes)); continue; }
    const codes = lookup(tok);
    out.push(codes ? syllabify(tok, codes) : { word: tok, sounds: '?', syllables: [], approx: [], unknown: true });
  }
  return out;
}

/* ---- test sets */

const CONS_CONTEXTS = ['P', 'B', 'T', 'D', 'K', 'G', 'M', 'N', 'NG', 'F', 'V', 'TH', 'DH', 'S', 'Z', 'SH', 'CH', 'JH', 'HH', 'L', 'R', 'W', 'Y'];
const SETS: Record<string, { label: string; text: string; hint: string }> = {
  vowels: { label: 'Vowels (h-V-d words)', hint: 'Fifteen words that differ only in the vowel: heed hid hayed head had hod hawed hoed hood whod hud heard hide howd hoyd. Can you tell which is which?', text: 'heed hid hayed head had hod hawed hoed\nhood whod hud heard hide howd hoyd' },
  cons: { label: 'Consonants (a-C-a)', hint: 'Each consonant between two "ah" sounds. Listen for ones that blur into another (b/v, t/d, f/th, s/sh, m/n).', text: CONS_CONTEXTS.slice(0, 8).map((c) => `{AA1 ${c} AA1}`).join(' ') + '\n' + CONS_CONTEXTS.slice(8, 16).map((c) => `{AA1 ${c} AA1}`).join(' ') + '\n' + CONS_CONTEXTS.slice(16).map((c) => `{AA1 ${c} AA1}`).join(' ') },
  pairs: { label: 'Minimal pairs', hint: 'Words that differ in one sound. If a pair sounds the same, that sound needs work.', text: 'bat pat bit pit\nsheep cheap ship chip\nthin sin fin tin\nban man van zip sip\nrice lice wine dime time\ngoat coat bed bad' },
  rcolor: { label: 'R sounds and endings', hint: 'The sounds built so far: the r-coloured vowel (world, bird, never), the dark l (all, cold), the flapped t (water, better; DX in the table) and the syllabic l/n (little, bottle, button).', text: 'never ever forever together\nwater better city butter\nworld girl bird burn turn\nall fall cold gold little bottle' },
  lines: { label: 'Real lines', hint: 'Plain lyric lines, as a singer would meet them. Does it sound like what is written?', text: 'i will never let you go\nthe river is calling me home\nwe are burning in the night\nhold on to the light\nwhat is the world without you' },
};

/* ---- what to sing it on */

type Tune = 'flat' | 'speech';
export function noteList(lines: WordInfo[][], base: number, tune: Tune, step: number): SungNote[][] {
  return lines.map((words) => {
    const syls = words.flatMap((w) => w.syllables);
    let t = 0;
    return syls.map((s, i): SungNote => {
      const dur = (s.stress ? 1.2 : 0.85) * step * (s.wordStart ? 1 : 0.95), n = i === syls.length - 1;
      const midi = base + (tune === 'speech' ? (s.stress ? 2 : 0) + (n ? -2 : 0) : 0);
      const note: SungNote = { t, end: t + dur * (n ? 1.6 : 0.92), midi, vel: s.stress ? 0.75 : 0.62, syl: s };
      t += dur;
      return note;
    });
  });
}

/* ---- the tab */

let ctx: AudioContext | null = null, playing: AudioBufferSourceNode | null = null;
function stop() { try { playing?.stop(); } catch { /* (not started) */ } playing = null; }

export function initWords(getVoice: () => Partial<FofVoice>, getName: () => string) {
  const st = { base: 55, tune: 'speech' as Tune, step: 0.34 };
  const box = $<HTMLTextAreaElement>('wText');
  function lines() { return box.value.split('\n').map((l) => l.trim()).filter(Boolean).map(wordsOf); }

  function show() {
    const ls = lines();
    const rows: string[] = [], gaps = new Map<string, number>();
    for (const l of ls) for (const w of l) {
      for (const a of w.approx) gaps.set(a, (gaps.get(a) ?? 0) + 1);
      const syl = w.syllables.map((s) => [...s.onset, `<b>${s.vowel}</b>`, ...s.coda].join(' ') + (s.syllabic ? ' (syllabic)' : '')).join(' · ');
      rows.push(`<tr><td>${w.word}</td><td>${w.unknown ? '<span class="miss">not in the dictionary: give its sounds in braces, e.g. {HH AH0 L OW1}</span>' : w.sounds}</td><td>${syl}</td><td>${w.approx.map((a) => `<span class="miss">${a}</span>`).join('<br>')}</td></tr>`);
    }
    $('wTable').innerHTML = rows.length ? `<table class="words"><tr><th>Word</th><th>Sounds (ARPAbet)</th><th>As sung (onset, <b>vowel</b>, coda)</th><th>Only approximated</th></tr>${rows.join('')}</table>` : '<p class="hint">Type something above.</p>';
    $('wGaps').innerHTML = gaps.size ? [...gaps].map(([k, n]) => `<li>${k}: ${n} time${n > 1 ? 's' : ''}</li>`).join('') : '<li>None in this text.</li>';
    $('wVoice').textContent = `${getName()}`;
  }

  async function sing() {
    const ls = lines();
    const sung = noteList(ls, st.base, st.tune, st.step).filter((l) => l.length);
    if (!sung.length) { $('wStatus').textContent = 'Nothing to sing'; return; }
    $('wStatus').textContent = 'Singing…';
    await new Promise((r) => setTimeout(r, 20));
    const t0 = performance.now();
    const v = { seed: 17, energy: 0.5, ...getVoice() } as FofVoice;
    const parts = sung.map((l, i) => renderFof(l, { ...v, seed: 17 + i }, 0.3).map((x) => x * 0.85));
    const gap = Math.round(0.5 * FOF_RATE);
    const pcm = new Float32Array(parts.reduce((a, p) => a + p.length + gap, 0));
    let at = 0;
    for (const p of parts) { pcm.set(p, at); at += p.length + gap; }
    ctx ??= new AudioContext();
    stop();
    const buf = ctx.createBuffer(1, pcm.length, FOF_RATE);
    buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
    playing = src;
    $('wStatus').textContent = `Sung in ${Math.round(performance.now() - t0)} ms`;
  }

  const setBtns = $('wSets');
  for (const [k, s] of Object.entries(SETS)) {
    const b = document.createElement('button');
    b.textContent = s.label;
    b.onclick = () => { box.value = s.text; $('wSetHint').textContent = s.hint; show(); };
    b.dataset.set = k;
    setBtns.append(b);
  }
  $('wDict').textContent = 'loading the full dictionary…';
  void loadDictionary().then((n) => { $('wDict').textContent = `full dictionary loaded (${n.toLocaleString()} words)`; show(); }).catch(() => { $('wDict').textContent = 'full dictionary not available: small built-in list only'; });
  box.value = SETS.lines.text;
  $('wSetHint').textContent = SETS.lines.hint;
  box.oninput = show;
  $<HTMLSelectElement>('wTune').onchange = (e) => { st.tune = (e.target as HTMLSelectElement).value as Tune; };
  $<HTMLInputElement>('wPitch').oninput = (e) => { st.base = Number((e.target as HTMLInputElement).value); $('wPitchName').textContent = noteName(st.base); };
  $<HTMLInputElement>('wStep').oninput = (e) => { st.step = Number((e.target as HTMLInputElement).value); $('wStepVal').textContent = `${st.step.toFixed(2)} s`; };
  $('wSing').onclick = () => { void sing(); };
  $('wStop').onclick = stop;
  show();
  return { show, stop };
}
