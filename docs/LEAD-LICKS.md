# Real licks (switch)

Paul: the solo licks are limiting and the same ones come back a lot. The app's licks were hand-written: about 50 player licks (`src/parts/licks.ts`) and 17 box licks (`src/parts/solo.ts`), and every solo climbed to its peak with one of three cells. The Licks switch in the Guitar 2 row (Classic / Real, Classic by default) adds licks written from real lead guitar parts. Classic: exactly as before (checked note for note over 126 songs, 4/4, 6/8, 3/4). Kept with the idea and in shared links (`leadLicks`).

## From the database (`npm run lick-mine`, `scripts/study/lick-mine.ts`, `src/realism/licks.json`)
The lead guitar study's songs (`docs/STUDY-LEAD.md`: 1,967 real lead guitar parts in the Lakh MIDI collection), only where the singer rests (solos, fills between lines):
- **Whole licks, copied:** tried first. Few licks are played alike in many songs by many artists (about 200, nearly all plain 8th-note arpeggios), so whole licks aren't taken.
- **Rhythms:** 3,043 lick rhythms (3-10 notes, at most two bars, ending on a held note), each played by 8+ songs from 6+ artists: the instrument's shared vocabulary, no one song's line. Slow 984, mid 1,463, fast 596.
- **Notes:** how real leads move, as counts only: the next step by the note they're on in the key, the step before and how quick the next note comes (major and minor keys apart); the notes licks start on.
No song's notes, names or phrases are kept.

## In the app (`src/parts/reallicks.ts`)
- **A real lick:** a shared rhythm that fits the slot, at the player's speed (by how common it is, how much the genre plays it, the player: shredders long quick ones, raw players short ones, funk players short and clipped), its notes chosen one by one by the real odds, then fitted like any lick: in the key (a quick passing note outside it now and then), held notes that don't rub, nothing clashing with the riff, chord notes at chord changes, the last note a chord note (the root to close). Ten tries a rhythm, the most likely kept.
- **Each rhythm once a song**, across solos, breaks and verse fills.
- **Where:** in solos, 65% of lick slots, 45% of sung phrases and half the quick bursts; the climb into the peak on a short real rhythm; in verses, half the licks answering the singer. The player's own licks (bends, double-stops, trills) and the solo's shape (the arc, call and answer, the motif, the peak) stay; bends and hands are added the player's way as before.

## Measured (40 tracks a genre with a solo, `scripts/study/lick-variety.ts`)
Any 5 notes in a row in the solos (their rhythm and steps), wherever they fall:

| | Classic | Real |
|---|---|---|
| heard in 3+ other songs of the genre | 28% | 8% |
| played twice or more in the same song | 6% | 4% |

Hard rock 22% → 8%, metal 20% → 11%, funk 36% → 9%. The lead study's measures (steps, lengths, where notes fall, in the scale, on the band's notes) stay where they were, about as near real songs.

## Next
- Paul listens: solos with Licks Real against Classic (hard rock, metal, rock).
- Then: triplets (the rhythms are 16ths only), bends from the real parts (2% of real lead notes carry a pitch bend in these files, too few to learn from).
