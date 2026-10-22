// The vocal melody's report (docs/VERSE-SECTIONS.md): the verse melody writer is the main voice (src/verse/sing.ts); this card shows
// what it wrote for the song on screen: the words, each section's form, phrases, notes and the rules' choices, and the personality
// the song drew. The Writer menu switches between it and the classic vocal writer (the same song, only the lead vocal changes).

import type { Idea } from '../idea';
import { NOTE_NAMES } from '../theory';
import { gridOf, type BarArg } from './grid';
import { quarterOf, type BandNote, type Gap } from './verse';
import { accentsOf, isBridge, isChorus, isInterlude, isOutro, isPre, isShared, personalityOf, songGrid } from './section';
import { describe, dialsFor } from './personality';
import { EMO_IDS, EMO_INFO, emoSummary, type EmoId } from './emotion';
import { isSung, voiceOf } from './sing';
import { MOOD_LABEL } from '../tension';

export interface VersePanel {
  /** Show the song's vocal melody again after new music. */
  update(list: Idea[]): void;
}

export function buildVersePanel(root: HTMLElement, ctl: { writer(): 'verse' | 'classic'; setWriter(w: 'verse' | 'classic'): void; moodOff(): string[]; setMoodOff(off: string[]): void }): VersePanel {
  root.innerHTML = `
    <h2>Vocal melody</h2>
    <p class="hint">The lead vocal is written by the verse melody writer, section by section: phrases with breaks, 16th runs, long notes and bent ones, and rules for the pre-chorus climb, the bridge's dwell, the interlude and outro echoing the chorus. A song's choruses (and pre-choruses, bridges, interludes, outros) are one melody over their own chords, and every song draws its own personality. Below: the words and what was written.</p>
    <div class="guiderow">
      <label title="Who writes the lead vocal: the verse melody writer (new), or the classic writer. Same song, only the lead vocal changes">Writer <select id="v-writer" class="gsing"><option value="verse">New</option><option value="classic">Classic</option></select></label>
    </div>
    <p class="hint" style="margin-bottom:6px">Mood notes: what music research says about feeling in the notes, each its own switch (on = used). The song's Mood (Track options) shapes them; off, the line is as it was.</p>
    <div class="guiderow" id="v-emo"></div>
    <p class="hint" id="v-lyrics" style="white-space:pre-line"></p>
    <p class="hint" id="v-info" style="white-space:pre-line"></p>`;
  const $ = (id: string) => root.querySelector<HTMLElement>('#' + id)!;
  const sel = $('v-writer') as HTMLSelectElement;
  sel.value = ctl.writer();
  sel.addEventListener('change', () => ctl.setWriter(sel.value as 'verse' | 'classic'));
  // the mood-note switches: one button each, on by default; a click regenerates the vocal with that rule on or off
  const emoRow = $('v-emo');
  const emoBtns = EMO_IDS.map((id) => {
    const b = document.createElement('button');
    b.className = 'small secondary';
    b.textContent = EMO_INFO[id].name;
    b.title = EMO_INFO[id].hint;
    b.addEventListener('click', () => {
      const off = new Set(ctl.moodOff());
      if (off.has(id)) off.delete(id); else off.add(id);
      ctl.setMoodOff(EMO_IDS.filter((x) => off.has(x)));
    });
    emoRow.appendChild(b);
    return [id, b] as [EmoId, HTMLButtonElement];
  });
  const syncEmo = () => { const off = new Set(ctl.moodOff()); for (const [id, b] of emoBtns) b.classList.toggle('on', !off.has(id)); };
  syncEmo();
  let list: Idea[] = [];
  const noteName = (m: number) => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  const accents = new WeakMap<Idea, number[]>();
  const accOf = (idea: Idea): number[] => { let a = accents.get(idea); if (!a) { a = accentsOf(idea); accents.set(idea, a); } return a; };
  const wordsFor = (idea: Idea) => voiceOf(idea)!.words;
  const persFor = (idea: Idea) => personalityOf(idea, voiceOf(idea)!.seed, voiceOf(idea)!.mood);
  const notesFor = (idea: Idea): BandNote[] => voiceOf(idea)!.built.notes;
  const pos = (step: number, bar: BarArg) => { const G = gridOf(bar), i = G.index(step); return +(i + (step - G.start(i)) / G.len(i) + 1).toFixed(2); };
  const at = (g: Gap, bar: number) => `${pos(g.step, bar)} (${bar / g.len > 6 ? '⅛' : bar / g.len > 3 ? '¼' : '½'} bar)`;
  /** "walks: 2→3 (2 steps), ...": the bars whose end walks into the next bar's core. */
  const walks = (notes: BandNote[], bar: BarArg) => {
    const G = gridOf(bar);
    const by = new Map<number, number>();
    for (const n of notes) if (n.walk) by.set(G.index(n.step), (by.get(G.index(n.step)) ?? 0) + 1);
    return by.size ? `walks into bar ${[...by].map(([b, c]) => `${b + 2} (${c} step${c > 1 ? 's' : ''})`).join(', ')}` : 'no walks';
  };
  /** The mood notes a section got (nothing when they are all off). */
  const moodNotes = (notes: BandNote[], bar: BarArg): string[] => {
    const m = emoSummary(notes);
    if (!m.colour.length && !m.ends.length && !m.suspensions && !m.surprises.length) return [];
    return [
      `Mood notes: colour ${m.colour.length ? notes.filter((n) => n.colour).map((n) => `${n.colour} (bar ${pos(n.step, bar)})`).join(', ') : 'none'} · delayed resolutions ${m.suspensions ? notes.filter((n) => n.inner?.startsWith('suspension')).map((n) => `${n.inner!.slice(11)} (bar ${pos(n.step, bar)})`).join(', ') : 'none'} · surprises ${m.surprises.length ? notes.filter((n) => n.surprise).map((n) => `${n.surprise} (bar ${pos(n.step, bar)})`).join(', ') : 'none'}`,
      `Phrase ends by degree: ${m.ends.length ? m.ends.join(', ') : 'unchanged'}`,
    ];
  };
  /** What the card shows about one section: its form, phrases, notes and the rules' choices. */
  const report = (first: Idea): string[] => {
    const G = songGrid(first), bar = G.bar, built = voiceOf(first)!.built, { phrases, breaks, runs, holds, bars, leaves } = built;
    const notes = built.notes;
    return [
      `Form: ${leaves.map((l) => `${l.name} (bars ${l.from + 1}–${l.from + l.bars}${l.source === null ? '' : `, varies ${leaves.find((x) => x.id === l.source)!.name}: ${l.varied.join(', ') || 'nothing'}`})`).join(' · ')}`,
      `Phrases (bar from–to): ${phrases.map((p) => `${pos(p.step, G)}–${pos(p.step + p.len, G)}`).join(' · ')}`,
      `Breaks after: ${breaks.map((g) => `${+(g.len / (bar / 4)).toFixed(2)} beat${g.len === bar / 4 ? '' : 's'}`).join(' · ')}`,
      `Chord note per bar: ${bars.join(' · ')}`,
      `Range ${notes.length ? `${noteName(Math.min(...notes.map((n) => n.midi)))}–${noteName(Math.max(...notes.map((n) => n.midi)))}` : "none"}, ${notes.filter((n) => n.midi < voiceOf(first)!.range.lo || n.midi > voiceOf(first)!.range.hi).length} notes in the extended zone`,
      `${notes.length} notes (${notes.filter((n) => n.nb).length} neighbour, ${walks(notes, G)}, ${notes.filter((n) => n.third).length / 3} third-bar shapes) · energy ${first.section?.energy ?? 3} · 16th runs: ${runs.length ? runs.map((g) => at(g, bar)).join(', ') : 'none'}`,
      `On the band's hits: ${Math.round((100 * notes.filter((n) => accOf(first)[Math.floor(n.step + 1e-6)] >= 0.5).length) / Math.max(1, notes.length))}% of notes start on a drum or chord hit (${Math.round((100 * accOf(first).filter((a) => a >= 0.5).length) / accOf(first).length)}% of steps are one)`,
      `Bends (${notes.filter((n) => n.bend).length}): ${notes.filter((n) => n.bend).map((n) => `${pos(n.step, G)} ${n.bend} ${n.fadeBy ? `fades out ${n.fadeBy} dB` : n.slide! > 0 ? `from ${n.slide} below` : `from ${-n.slide!} above`}`).join(', ') || 'none'}`,
      `Bends inside notes (${notes.filter((n) => n.inner).length}): ${notes.filter((n) => n.inner).map((n) => `${pos(n.step, G)} ${n.inner} (${n.bendTo! > n.midi ? '+' : ''}${n.bendTo! - n.midi}, note ${+(n.len / (bar / 4)).toFixed(1)} beats, ${n.bendAt === 0 ? 'bends from its start' : `bends after ${+(n.bendAt! / (bar / 4)).toFixed(2)} beats`})`).join(', ') || 'none'}`,
      `Notes starting in each quarter of the bar: ${[0, 1, 2, 3].map((q) => notes.filter((n) => quarterOf(n.step, G) === q).length).join(' · ')}`,
      `Phrase endings (${notes.filter((n) => n.end).length} of ${phrases.length} phrases): ${notes.filter((n) => n.end).map((n) => `${pos(n.step + n.len, G)} ${n.style ?? 'held'} (${+(n.len / (bar / 4)).toFixed(1)} beats)`).join(', ') || 'none'}`,
      `Long holds (1–2 bars): ${notes.filter((n) => n.longHold).map((n) => `${pos(n.step, G)} ${+(n.len / bar).toFixed(2)} bars${n.bendTo === undefined ? '' : `, moves ${1 + (n.more?.length ?? 0)}`}`).join(', ') || 'none'}`,
      `Long notes: ${holds.length ? holds.map((g) => `${pos(g.step, G)} (${+(g.len / (bar / 4)).toFixed(1)} ${g.len === bar / 4 ? 'beat' : 'beats'})`).join(', ') : 'none'}`,
      ...moodNotes(notes, G),
    ];
  };

  const info = () => {
    const written = list.filter((i) => voiceOf(i));
    if (!written.length) { $('v-info').textContent = list.some((i) => i.vocal?.length) ? 'The classic writer wrote this vocal (no report).' : 'No vocal in this song.'; $('v-lyrics').textContent = ''; return; }
    const verse = list.find((i) => isSung(i) && !isShared(i)), pre = list.find(isPre), bridge = list.find(isBridge), inter = list.find(isInterlude), outro = list.find(isOutro), chorus = list.find(isChorus), any = verse ?? pre ?? chorus ?? bridge ?? inter ?? outro;
    if (!any) { $('v-info').textContent = 'No verse in this song.'; $('v-lyrics').textContent = ''; return; }
    $('v-lyrics').textContent = [verse && ['VERSE', verse], pre && ['PRE-CHORUS', pre], chorus && ['CHORUS', chorus], inter && ['INTERLUDE', inter], bridge && ['BRIDGE', bridge], outro && ['OUTRO', outro]].filter((x): x is [string, Idea] => !!x).map(([t, i]) => `${t}\n${wordsFor(i).lines.map((l, k) => `${k + 1}  ${l}`).join('\n')}`).join('\n\n');
    const v0 = voiceOf(any)!;
    const lines = [`This song: ${describe(persFor(any))}`, `Mood: ${MOOD_LABEL[v0.mood]}${v0.emo ? `; mood notes on: ${EMO_IDS.filter((id) => v0.emo!.on.has(id)).map((id) => EMO_INFO[id].name).join(', ') || 'none'}` : ''}`];
    if (verse) lines.push('', 'VERSE', ...report(verse));
    if (pre) lines.push('', 'PRE-CHORUS', `Pre-chorus climbs ${dialsFor('prechorus', persFor(pre)).climb} semitones`, ...report(pre));
    if (chorus) lines.push('', 'CHORUS', `Chorus range lifted ${dialsFor('chorus', persFor(chorus)).lift} semitones`, ...report(chorus));
    if (bridge) lines.push('', 'BRIDGE', `Bridge sits ${dialsFor('bridge', persFor(bridge)).lift} semitones from the verse, circling a ${Math.round(100 * dialsFor('bridge', persFor(bridge)).dwell!)}%-height note, ${Math.round(100 * (1 - notesFor(bridge).reduce((t, n) => t + n.len, 0) / bridge.chords.chordIdx.length))}% silent`, ...report(bridge));
    if (inter) lines.push('', 'INTERLUDE', `Interlude echoes the chorus, ${Math.round(100 * (1 - notesFor(inter).reduce((t, n) => t + n.len, 0) / inter.chords.chordIdx.length))}% silent`, ...report(inter));
    if (outro) lines.push('', 'OUTRO', `Outro is the chorus's tail, ${dialsFor('outro', persFor(outro)).end![0] > 0.6 ? 'fading out' : 'held to the end'}, ${Math.round(100 * (1 - notesFor(outro).reduce((t, n) => t + n.len, 0) / outro.chords.chordIdx.length))}% silent`, ...report(outro));
    $('v-info').textContent = lines.join('\n');
  };

  return {
    update(l) {
      list = l;
      sel.value = ctl.writer();
      syncEmo();
      info();
    },
  };
}
