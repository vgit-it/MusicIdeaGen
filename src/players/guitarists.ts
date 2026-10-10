// The guitarists: play a track's written guitar parts their own way, after the drummer and bassist.
// They read the whole song and keep their habits all the way through.
// Rhythm guitar:
// - the song grows: the first verse and chorus played a little softer (and the first verse plainer,
//   without the quick 16th up-strums), the last chorus hardest, strumming every 8th
// - a habit at the end of four-bar phrases: a breath, a muted scratch, or an up-strum pushing over
// Guitar 2:
// - a feel: on the beat, or laid back behind it
// - a habit: sliding into each phrase (or not)
// - the song grows the same way
// Riff genres: the riff is the song, so the rhythm guitar only changes how hard it plays.

import type { GuitarHit, Idea, SectionKind } from '../idea';
import { Rng } from '../rng';
import { groupStarts } from '../rhythm';
import { fillSteps } from './drummer';

type PhraseEnd = 'breath' | 'scratch' | 'push' | 'none';

const END_DESC: Record<Exclude<PhraseEnd, 'none'>, string> = {
  breath: 'a breath at the end of each phrase',
  scratch: 'a muted scratch at the end of each phrase',
  push: 'an up-strum pushing into each new phrase',
};

/** Single notes Guitar 2 can slide into (not chords, mutes, swells or ringing arpeggios). */
const slidable = (h: GuitarHit) => h.notes.length === 1 && !h.mute && !h.letRing && !h.swell && !h.slide && h.len >= 2;

/** The guitarists play every section of a track (in place). `seed`: who the band is. */
export function playGuitars(sections: Idea[], seed: string) {
  const rng = new Rng(`${seed}-guitarists`);
  const end = rng.weighted<PhraseEnd>([['breath', 2], ['scratch', 2], ['push', 1], ['none', 1]]);
  const late = rng.chance(0.5) ? 10 : 0;
  const slides = rng.chance(0.5);
  const kinds = sections.map((s) => s.section!.kind);
  const firstChorus = kinds.indexOf('chorus'), lastChorus = kinds.lastIndexOf('chorus');
  const seen: Partial<Record<SectionKind, number>> = {};
  let told = false;

  sections.forEach((idea, i) => {
    const { song, strum, chords } = idea, info = idea.section!;
    const kind = info.kind, e = info.energy;
    const round = seen[kind] ?? 0;
    seen[kind] = round + 1;
    const last = i === lastChorus && lastChorus !== firstChorus;
    const first = round === 0 && (kind === 'verse' || kind === 'chorus') && !last;
    const gain = last ? 1.06 : first ? 0.94 : 1;
    const notes: string[] = [];
    if (!told) {
      idea.notes.push(`Band feel: Guitar 2 ${late ? 'lays back behind the beat' : 'plays right on the beat'}${slides ? ', sliding into each phrase' : ''}`);
      told = true;
    }

    // how hard they play
    if (idea.guitar) idea.guitar = idea.guitar.map((h) => ({ ...h, vel: Math.min(1, h.vel * gain) }));
    else idea.strumGain = gain;
    idea.guitar2 = idea.guitar2.map((h) => ({ ...h, vel: Math.min(1, h.vel * gain) }));
    idea.g2Feel = late;

    // Guitar 2 slides into a note that starts a phrase (after a rest of a beat or more)
    if (slides) {
      let lastEnd = -99;
      for (const h of [...idea.guitar2].sort((a, b) => a.step - b.step)) {
        if (h.step - lastEnd >= 4 && slidable(h)) h.slide = 2;
        lastEnd = Math.max(lastEnd, h.step + h.len);
      }
    }

    // the rhythm guitar's touches (strummed genres, once the band's in)
    if (!idea.guitar && e >= 3 && strum.some((s) => s !== '.')) {
      const inFill = fillSteps(idea);
      const from = info.bandFrom ?? 0;
      const lastBar = song.bars[song.bars.length - 1];
      const changes = new Set(chords.timeline.map((t) => t.step));
      const ok = (g: number) => g >= from && g < lastBar.start && !inFill.has(g);

      if (round === 0 && kind === 'verse') {
        let n = 0;
        for (let g = 0; g < song.total; g++) if (ok(g) && g % 2 && strum[g] === 'U' && !changes.has(g)) { strum[g] = '.'; n++; }
        if (n) notes.push('Rhythm guitar: plainer the first time, without the quick up-strums');
      }
      if (last && e >= 4) {
        let n = 0;
        for (const bar of song.bars) {
          const beats = new Set(groupStarts(bar.groups));
          for (let j = 0; j < bar.len; j += 2) {
            const g = bar.start + j;
            if (ok(g) && !beats.has(j) && strum[g] === '.') { strum[g] = 'U'; n++; }
          }
        }
        if (n) notes.push('Rhythm guitar: strums every 8th in the last chorus, playing it hardest');
      }
      if (end !== 'none') {
        let n = 0;
        song.bars.forEach((bar, bi) => {
          const b = bar.start + bar.len;
          if (bi % 4 !== 3 || bar === lastBar || !ok(b - 2) || !ok(b - 1) || changes.has(b - 2) || changes.has(b - 1)) return;
          if (end === 'breath') { strum[b - 2] = '.'; strum[b - 1] = '.'; }
          else if (end === 'scratch') strum[b - 1] = 'x';
          else if (strum[b - 1] === '.') strum[b - 1] = 'U';
          n++;
        });
        if (n) notes.push(`Rhythm guitar: ${END_DESC[end]}`);
      }
    }
    idea.notes.push(...notes);
  });
}
