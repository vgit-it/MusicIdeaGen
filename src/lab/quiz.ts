// The blind quiz on the voice creator's Words tab: a word is sung, and you pick which word it was from a few that differ in one sound. The page keeps
// how often you were right per pair of sounds, so a change to the voice shows as a number, not an opinion. Optionally every question is sung either with the
// voice as it is now or with the app's earlier consonants, picked at random and not shown, so the two are compared fairly. Plan: docs/VOICE-WORDS.md (layer B).

import { FOF_RATE, type FofVoice, renderFof } from '../audio/fof';
import { noteList, wordsOf } from './words';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Each contrast: a name and the words that differ in it. */
const GROUPS: { name: string; words: string[][] }[] = [
  { name: 'p / b (start)', words: [['pat', 'bat'], ['pit', 'bit'], ['pin', 'bin'], ['pay', 'bay'], ['pull', 'bull']] },
  { name: 't / d (start)', words: [['tin', 'din'], ['tie', 'die'], ['ten', 'den'], ['toe', 'doe'], ['town', 'down']] },
  { name: 'k / g (start)', words: [['came', 'game'], ['coat', 'goat'], ['cap', 'gap'], ['kill', 'gill'], ['curl', 'girl']] },
  { name: 'p / t / k (start)', words: [['pie', 'tie', 'kite'], ['pen', 'ten', 'Ken'], ['pill', 'till', 'kill'], ['pan', 'tan', 'can']] },
  { name: 'f / v', words: [['fan', 'van'], ['fine', 'vine'], ['fail', 'veil'], ['fast', 'vast']] },
  { name: 'f / th / s / t', words: [['thin', 'sin', 'fin', 'tin'], ['thank', 'sank', 'tank'], ['thumb', 'sum', 'fun']] },
  { name: 's / sh', words: [['sip', 'ship'], ['see', 'she'], ['sue', 'shoe'], ['sock', 'shock'], ['sell', 'shell']] },
  { name: 'ch / sh / j', words: [['cheap', 'sheep', 'jeep'], ['chair', 'share'], ['chin', 'shin', 'gin'], ['chop', 'shop', 'job']] },
  { name: 'm / n', words: [['mice', 'nice'], ['map', 'nap'], ['meat', 'neat'], ['mine', 'nine'], ['might', 'night']] },
  { name: 'n / ng (end)', words: [['sin', 'sing'], ['thin', 'thing'], ['win', 'wing'], ['ran', 'rang']] },
  { name: 'l / r / w', words: [['light', 'right', 'white'], ['lake', 'rake', 'wake'], ['low', 'row', 'woe'], ['lie', 'rye', 'why']] },
  { name: 'end p / t / k', words: [['rap', 'rat', 'rack'], ['tap', 'tat', 'tack'], ['lip', 'lit', 'lick'], ['sap', 'sat', 'sack']] },
  { name: 'end p / b, t / d', words: [['cap', 'cab'], ['bat', 'bad'], ['back', 'bag'], ['rope', 'robe'], ['seat', 'seed']] },
  { name: 'ee / i', words: [['sheep', 'ship'], ['cheap', 'chip'], ['feel', 'fill'], ['seat', 'sit'], ['leave', 'live'], ['beat', 'bit']] },
  { name: 'vowels (h_d)', words: [['heed', 'hid', 'head', 'had'], ['hod', 'hawed', 'hoed', 'hood'], ['hood', 'whod', 'hud', 'heard']] },
];

interface Tally { right: number; total: number }
const shuffle = <T,>(a: T[]) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

export function initQuiz(getVoice: () => Partial<FofVoice>, getBase: () => number) {
  const tally: Record<string, Record<'now' | 'orig', Tally>> = {};
  let ctx: AudioContext | null = null;
  let cur: { group: string; word: string; version: 'now' | 'orig'; answered: boolean } | null = null;
  let lastPcm: Float32Array | null = null;

  function play(pcm: Float32Array) {
    ctx ??= new AudioContext();
    const buf = ctx.createBuffer(1, pcm.length, FOF_RATE);
    buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
  }
  function render(word: string, version: 'now' | 'orig') {
    const syls = wordsOf(word.toLowerCase());
    const notes = noteList([syls], getBase(), 'speech', 0.34)[0];
    const base = { seed: 17, energy: 0.5, ...getVoice() } as FofVoice;
    // (the app's earlier consonants: quiet, shortened, dark, barely a burst, no bite)
    const v: FofVoice = version === 'orig' ? { ...base, cons: { blend: 0.04, short: 0.6, level: -6, dark: 0.75 }, stops: { burst: -22, voiced: -20, asp: -14, len: 0.05, hold: 24 } } : base;
    const pcm = renderFof(notes, v, 0.2).map((x) => x * 0.85);
    return pcm;
  }

  function next() {
    const only = $<HTMLSelectElement>('qGroup').value;
    const pool = only ? GROUPS.filter((x) => x.name === only) : GROUPS;
    const g = pool[Math.floor(Math.random() * pool.length)];
    const set = g.words[Math.floor(Math.random() * g.words.length)];
    const word = set[Math.floor(Math.random() * set.length)];
    const version: 'now' | 'orig' = $<HTMLInputElement>('qMix').checked && Math.random() < 0.5 ? 'orig' : 'now';
    cur = { group: g.name, word, version, answered: false };
    lastPcm = render(word, version);
    play(lastPcm);
    $('qChoices').innerHTML = '';
    for (const w of shuffle(set)) {
      const b = document.createElement('button');
      b.textContent = w;
      b.onclick = () => answer(w, b);
      $('qChoices').append(b);
    }
    $('qFeedback').textContent = 'Which word was it?';
    ($('qNext') as HTMLButtonElement).disabled = true;
  }
  function answer(w: string, b: HTMLElement) {
    if (!cur || cur.answered) return;
    cur.answered = true;
    const ok = w.toLowerCase() === cur.word.toLowerCase();
    const t = ((tally[cur.group] ??= { now: { right: 0, total: 0 }, orig: { right: 0, total: 0 } })[cur.version]);
    t.total++;
    if (ok) t.right++;
    b.classList.toggle('right', ok);
    b.classList.toggle('wrong', !ok);
    for (const c of $('qChoices').querySelectorAll('button')) if (c.textContent?.toLowerCase() === cur.word.toLowerCase()) c.classList.add('right');
    $('qFeedback').textContent = ok ? `Yes: ${cur.word}` : `It was "${cur.word}" (you picked "${w}")`;
    ($('qNext') as HTMLButtonElement).disabled = false;
    showTable();
  }
  const pct = (t: Tally) => (t.total ? `${Math.round((100 * t.right) / t.total)}% (${t.right}/${t.total})` : '–');
  function showTable() {
    const rows = Object.entries(tally);
    const all = { now: { right: 0, total: 0 }, orig: { right: 0, total: 0 } };
    for (const [, r] of rows) for (const k of ['now', 'orig'] as const) { all[k].right += r[k].right; all[k].total += r[k].total; }
    const mix = $<HTMLInputElement>('qMix').checked;
    $('qTable').innerHTML = rows.length
      ? `<table class="words"><tr><th>Contrast</th><th>The voice as it is now</th>${mix ? '<th>Earlier consonants</th>' : ''}</tr>${rows.map(([n, r]) => `<tr><td>${n}</td><td>${pct(r.now)}</td>${mix ? `<td>${pct(r.orig)}</td>` : ''}</tr>`).join('')}<tr><th>All</th><th>${pct(all.now)}</th>${mix ? `<th>${pct(all.orig)}</th>` : ''}</tr></table>`
      : '<p class="hint">No answers yet.</p>';
  }

  $<HTMLSelectElement>('qGroup').innerHTML = `<option value="">All contrasts</option>${GROUPS.map((g) => `<option>${g.name}</option>`).join('')}`;
  $('qStart').onclick = next;
  $('qNext').onclick = next;
  $('qAgain').onclick = () => { if (lastPcm) play(lastPcm); };
  $('qReset').onclick = () => { for (const k of Object.keys(tally)) delete tally[k]; showTable(); };
  $('qMix').onchange = showTable;
  showTable();
}
