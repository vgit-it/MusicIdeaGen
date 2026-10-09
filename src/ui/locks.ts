// Keep / reroll: lock the parts you like, reroll the rest (or one part at a time).

import type { Idea, Seeds } from '../idea';

export type PartKey = keyof Seeds;

export const LOCK_PARTS: { key: PartKey; label: string; title: string }[] = [
  { key: 'song', label: 'Song', title: 'Key, tempo, time signature and overall plan' },
  { key: 'chords', label: 'Chords', title: 'The chord progression' },
  { key: 'strum', label: 'Rhythm', title: 'The strumming pattern or riff' },
  { key: 'guitar2', label: 'Guitar 2', title: 'The second guitar part' },
  { key: 'drums', label: 'Drums', title: 'The drum groove and fills' },
  { key: 'bass', label: 'Bass', title: 'The bass line' },
  { key: 'keys', label: 'Piano', title: 'The piano part' },
  { key: 'pad', label: 'Pad', title: 'The pad voicing' },
  { key: 'strings', label: 'Strings', title: 'The string part' },
  { key: 'perc', label: 'Percussion', title: 'The percussion part' },
];

const LOCK_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none"/></svg>';
const OPEN_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1" fill="none"/></svg>';
const REROLL_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5V5h-2.5" fill="none"/></svg>';

export interface LockPanel {
  /** Refresh for a new idea (e.g. the bass follows the riff in riff genres, so it can't be rerolled alone). */
  update(idea: Idea | null): void;
}

export function buildLockPanel(
  root: HTMLElement,
  locks: Set<PartKey>,
  onReroll: (k: PartKey) => void,
  onChange: () => void,
  /** Whether a part is shown (added layers only once added). */
  shown: (k: PartKey) => boolean = () => true,
): LockPanel {
  root.innerHTML = LOCK_PARTS.map((p) => `
    <div class="lock" data-k="${p.key}" title="${p.title}">
      <span class="ln">${p.label}</span>
      <button class="lk" aria-pressed="false" aria-label="Lock ${p.label}">${OPEN_ICON}</button>
      <button class="rr" aria-label="Reroll ${p.label}">${REROLL_ICON}</button>
    </div>`).join('');

  const paint = () => {
    root.querySelectorAll<HTMLElement>('.lock').forEach((el) => {
      const k = el.dataset.k as PartKey;
      const on = locks.has(k);
      // locking any part keeps the song (key, tempo, time), or that part couldn't stay the same
      const implied = k === 'song' && !on && locks.size > 0;
      const btn = el.querySelector<HTMLButtonElement>('.lk')!;
      btn.innerHTML = on || implied ? LOCK_ICON : OPEN_ICON;
      btn.setAttribute('aria-pressed', String(on));
      btn.title = implied ? 'Kept while other parts are locked' : on ? 'Locked: kept when you Generate' : 'Lock: keep this when you Generate';
      el.classList.toggle('on', on);
      el.classList.toggle('implied', implied);
      el.hidden = !shown(k);
    });
  };

  root.onclick = (e) => {
    const t = e.target as HTMLElement;
    const el = t.closest<HTMLElement>('.lock');
    if (!el) return;
    const k = el.dataset.k as PartKey;
    if (t.closest('.lk')) {
      if (locks.has(k)) locks.delete(k); else locks.add(k);
      paint();
      onChange();
    } else if (t.closest('.rr')) onReroll(k);
  };

  paint();
  return {
    update(idea) {
      const riffBass = !!idea?.guitar;
      const el = root.querySelector<HTMLElement>('.lock[data-k="bass"]')!;
      el.classList.toggle('disabled', riffBass);
      el.title = riffBass ? 'In riff genres the bass doubles the riff: reroll the rhythm to change it' : LOCK_PARTS[5].title;
      el.querySelectorAll('button').forEach((b) => { b.disabled = riffBass; });
      paint();
    },
  };
}
