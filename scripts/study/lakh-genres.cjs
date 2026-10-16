// Lakh MIDI study: the measures by genre, for a hand-picked list of artists. Run after lakh-measure: node scripts/study/lakh-genres.cjs
const s = JSON.parse(require('fs').readFileSync('songs.json','utf8'));
const G = {
 metal: ['Metallica','Iron_Maiden','Black_Sabbath','Megadeth','Judas_Priest','Ozzy_Osbourne','Slayer','Pantera','Motorhead','Dio','Anthrax','Korn','Tool','Deftones','Rage_Against_the_Machine','Disturbed','Slipknot','Sepultura'],
 grunge: ['Nirvana','Pearl_Jam','Soundgarden','Alice_in_Chains','Stone_Temple_Pilots','Foo_Fighters','Smashing_Pumpkins','Bush','Silverchair','Hole'],
 hardrock: ['AC_DC','Led_Zeppelin','Deep_Purple','Aerosmith','Van_Halen','Kiss','Def_Leppard','Bon_Jovi','Scorpions','Whitesnake','Guns_N_Roses','Motley_Crue','Europe','Rainbow','Thin_Lizzy','Uriah_Heep','Twisted_Sister','Skid_Row','Poison','Cinderella'],
 rock: ['The_Beatles','The_Rolling_Stones','U2','Queen','Green_Day','Oasis','Radiohead','The_Who','Pink_Floyd','R.E.M.','Bruce_Springsteen','Eagles','Dire_Straits','The_Police','Creedence_Clearwater_Revival','Tom_Petty_and_the_Heartbreakers','The_Doors','Blur','The_Kinks','ZZ_Top','The_Cure','Red_Hot_Chili_Peppers','Bryan_Adams','Fleetwood_Mac'],
 pop: ['Madonna','Michael_Jackson','ABBA','Britney_Spears','Backstreet_Boys','Spice_Girls','Kylie_Minogue','Whitney_Houston','Mariah_Carey','Celine_Dion','Elton_John','George_Michael','Phil_Collins','Roxette','Duran_Duran','Pet_Shop_Boys','Madness','Bee_Gees','Lionel_Richie','Cyndi_Lauper','Wham!','Robbie_Williams','Take_That','Westlife','Shania_Twain'],
 funk: ['James_Brown','Stevie_Wonder','Earth,_Wind_&_Fire','Kool_&_the_Gang','Prince','Chic','Sly_&_the_Family_Stone','Parliament','Rick_James','The_Commodores','Jamiroquai','Tower_of_Power','Average_White_Band'],
};
const by = {};
for (const x of s) { const a = x.f.split(/[\\/]/)[0].replace(/ /g,'_').replace(/'/g,''); for (const [g, l] of Object.entries(G)) if (l.includes(a)) (by[g] ??= []).push(x); }
const av = (a, k) => (a.reduce((t, x) => t + x[k], 0) / a.length).toFixed(2);
for (const [g, a] of Object.entries(by)) console.log(g.padEnd(9), 'songs', String(a.length).padStart(4), 'chordTone', av(a,'chordTone'), 'strongCT', av(a,'strongCT'), 'range', av(a,'range'), 'repeat2bar', av(a,'repeat2bar'), 'minor', (a.filter(x=>x.minor).length/a.length).toFixed(2), 'grid', av(a,'grid'));
