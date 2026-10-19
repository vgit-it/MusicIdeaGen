// The word bank for the singer (docs/VOICE-WORDS.md, "Real words"): real words chosen for how they sing, not what they mean.
// Each word is listed with a hyphen between its syllables (as it is shown in the lyric line); its sounds come from the CMU dictionary,
// split into syllables as the Words tab does, with stress, the flapped t and syllabic l/n. The words are picked by number of syllables, which
// syllable is stressed and which sounds they hold (src/parts/lyrics.ts), so the lines need make no sense.
// Run: npm run word-bank   (writes src/parts/wordbank.json)

import { writeFileSync } from 'node:fs';
import { loadDictionary, wordsOf } from '../src/lab/words';

const LIST = `
sea free deep dream green seed keep feel heat street beat speed breeze lean clean leaf team steam tree three knee key me she he we see be reel peace piece weak week
this big ring sing wind win thin trip drink pink hill still fill skin lift mist twist list sink thing king wing bridge kiss miss lip ship chip skip tip rip grip whip spin grin
day rain name play stay way lane wave shade grave brave change chase fate gate late space face race trail pay say may great waste taste paint faint saint train brain chain
red bed best rest west nest left end send spend bend step held tell well bell shell edge fresh friend ten then pen when yes less chest breath death wreck neck check deck
back black hand land sand stand crash flash trap track last fast glad grab map snap plan man can ran bad had sad mad fat cat bat match catch cash
dock stop lock shock rock top drop pop not hot spot shot box job knot lot got pot crop plot block clock cross toss lost fog dog
all call fall wall small long song strong wrong dawn lawn law draw saw claw storm born horn torn warm door floor more shore four core pour roar score bore sore sword
go low slow glow flow show snow grow know throw road gold cold hold old soul home stone bone phone rose close smoke spoke broke note boat coat float rope hope hole whole role toes nose those
blue true new few moon soon room bloom tune food mood cool school tool fool loose choose shoe two who you through group move prove truth proof suit fruit
book look good wood hood took shook hook foot put pull full bull push cook
love up sun run fun one done come some much touch rush crush dust trust just bus cup drum thumb numb jump bump gun hung lung strung blood flood mud
light night fight sky high fly die eyes time line mine shine ride side wide bright white right life knife price ice nice mind find blind kind climb smile mile style tide pride cry try dry why buy by my hide guide bite flight sight tight height wine sign
now down town crown loud cloud proud out shout house mouse sound round ground found drown brown how wow south mouth crowd bow
boy joy toy noise voice choice coin point join oil spoil
bird word world girl burn turn learn hurt work first worst curve search church earth her serve nerve verse shirt dirt skirt fur stir
ba-by may-be ne-ver e-ver ri-ver sha-dow win-dow yel-low fol-low hol-low sil-ver gol-den heav-en sev-en sum-mer win-ter thun-der won-der un-der o-ver af-ter wa-ter mo-ther bro-ther sis-ter flow-er pow-er tow-er ci-ty pret-ty la-dy hap-py on-ly lone-ly sun-ny rai-ny
mov-ing lov-ing burn-ing fall-ing run-ning call-ing roll-ing shin-ing sing-ing danc-ing dream-ing wait-ing ring-ing fad-ing cry-ing fly-ing pass-ing driv-ing break-ing o-cean mo-tion bro-ken o-pen spo-ken sto-len fro-zen cho-sen hid-den kit-ten but-ton lit-tle bot-tle mid-dle rid-dle cir-cle sim-ple dou-ble trou-ble can-dle han-dle ta-ble a-ble peo-ple cas-tle bat-tle rat-tle gen-tle jun-gle tan-gle moun-tain foun-tain cap-tain gar-den bur-den par-don les-son sea-son rea-son hu-man mu-sic ma-gic tra-gic si-lent vi-o-lent pa-tient an-cient dis-tance si-lence en-gine fin-ger an-ger hun-ger su-gar dan-ger stran-ger
fire-light moon-light sun-light day-light mid-night door-way high-way play-ground fire-fly moon-shine star-light
a-way a-gain a-lone a-long a-round a-bove a-cross be-fore be-hind be-yond be-low be-tween be-gin be-lieve be-cause be-long for-give for-get to-night to-day al-low ar-rive a-wake a-ware a-part a-fraid at-tack col-lapse con-trol re-main re-turn re-fuse re-lease re-peat re-wind sur-round sur-vive sup-port sup-pose es-cape ex-plode ex-pect en-gage di-vide de-cide de-ny de-light de-sire de-spair dis-guise dis-play dis-miss pre-tend pre-pare pro-tect pro-vide ex-plain com-plain con-tain in-vite ig-nite in-side out-side a-shore a-dore a-broad ap-proach a-maze a-muse ap-pear
beau-ti-ful won-der-ful ev-ery-thing a-ny-thing mem-o-ry mel-o-dy har-mo-ny en-er-gy fam-i-ly grav-i-ty vic-to-ry mys-ter-y his-to-ry sym-pho-ny del-i-cate des-per-ate dan-ger-ous glo-ri-ous mar-vel-ous in-no-cent el-e-phant en-e-my rem-e-dy des-ti-ny gal-ax-y fan-ta-sy ec-sta-sy jeal-ous-y i-vo-ry gal-ler-y fac-to-ry bat-ter-y com-e-dy trag-e-dy mer-cu-ry
to-mor-row for-ev-er to-geth-er re-mem-ber sur-ren-der No-vem-ber De-cem-ber Sep-tem-ber Oc-to-ber e-lec-tric ro-man-tic fan-tas-tic ma-jes-tic e-ter-nal in-fer-nal col-li-sion de-ci-sion di-vi-sion re-li-gion be-liev-ing sur-viv-ing ar-riv-ing be-long-ing for-giv-ing pre-tend-ing re-turn-ing re-main-ing a-wak-ing be-gin-ning di-vid-ing de-cid-ing con-fus-ing mis-ta-ken for-got-ten for-bid-den a-wo-ken un-spo-ken un-bro-ken
`;

await loadDictionary();
const bank: [string, [string[], string, string[], number, number?][]][] = [];
const bad: string[] = [];
const seen = new Set<string>();
for (const entry of LIST.split(/\s+/).filter(Boolean)) {
  const word = entry.replace(/-/g, '').toLowerCase();
  if (seen.has(entry)) continue;
  seen.add(entry);
  const info = wordsOf(word)[0];
  if (!info || info.unknown || !info.syllables.length) { bad.push(`${entry}: not in the dictionary`); continue; }
  const parts = entry.split('-');
  const syls = info.syllables;
  if (parts.length !== syls.length && entry.includes('-')) { bad.push(`${entry}: spelled in ${parts.length}, sung in ${syls.length} (${info.sounds})`); continue; }
  // (a word without hyphens that is sung in more than one syllable keeps its whole spelling on the first)
  const text = parts.length === syls.length ? parts : syls.map((_, k) => (k === 0 ? entry : ''));
  // (the stress: only the primary, 1; a secondary stress sings as light)
  const codes = info.sounds.split(' ');
  const prim = codes.filter((c) => /[A-Z]+[012]$/.test(c) && /[AEIOU]/.test(c)).map((c) => c.endsWith('1'));
  const row = syls.map((s, k): [string[], string, string[], number, number?] => [s.onset, s.vowel, s.coda, prim[k] ? 1 : 0, s.syllabic ? 1 : undefined]);
  void text;
  bank.push([text.join('-'), row.map((r) => (r[4] === undefined ? r.slice(0, 4) : r)) as typeof row]);
}
writeFileSync('src/parts/wordbank.json', JSON.stringify(bank));
const byPat: Record<string, number> = {};
for (const [, r] of bank) { const p = r.map((x) => (x[3] ? 'S' : 'w')).join(''); byPat[p] = (byPat[p] ?? 0) + 1; }
console.log(`${bank.length} words`, JSON.stringify(byPat));
if (bad.length) console.log('skipped:\n' + bad.join('\n'));
