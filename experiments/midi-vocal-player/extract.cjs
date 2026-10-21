// node extract.cjs <file.mid> <melodyTrackIndex> <wordsTrackIndex> -> writes data into index.html
const {createRequire}=require('module');
const r=createRequire(__dirname+'/../../package.json');
const {parseMidi}=r('midi-file');
const fs=require('fs');
const [,,file,mi,wi]=process.argv;
const m=parseMidi(fs.readFileSync(file));
const tpq=m.header.ticksPerBeat;
const tempos=[];let tk=0;
for(const e of m.tracks[0]){tk+=e.deltaTime;if(e.type==='setTempo')tempos.push([tk,e.microsecondsPerBeat]);}
if(!tempos.length)tempos.push([0,500000]);
function sec(tick){let s=0,lt=0,mp=tempos[0][1];for(const[t,v]of tempos){if(t>tick)break;s+=(t-lt)/tpq*mp/1e6;lt=t;mp=v;}return s+(tick-lt)/tpq*mp/1e6;}
const notes=[];const on={};tk=0;
for(const e of m.tracks[mi]){tk+=e.deltaTime;
  if(e.type==='noteOn'&&e.velocity>0)on[e.noteNumber]=[tk,e.velocity];
  else if(e.type==='noteOff'||(e.type==='noteOn'&&e.velocity===0)){const s=on[e.noteNumber];if(s){notes.push([+sec(s[0]).toFixed(3),+(sec(tk)-sec(s[0])).toFixed(3),e.noteNumber,s[1]]);delete on[e.noteNumber];}}}
notes.sort((a,b)=>a[0]-b[0]);
const words=[];tk=0;
for(const e of m.tracks[wi]){tk+=e.deltaTime;if(e.type==='text'&&!e.text.startsWith('@'))words.push([+sec(tk).toFixed(3),e.text]);}
const title=(m.tracks[wi].find(e=>e.text&&e.text.startsWith('@T'))||{text:'@T'+file}).text.slice(2);
const data=JSON.stringify({title,notes,words});
let h=fs.readFileSync(__dirname+'/index.html','utf8');
h=h.replace(/\/\*DATA\*\/.*?\/\*END\*\//s,'/*DATA*/'+data+'/*END*/');
fs.writeFileSync(__dirname+'/index.html',h);
console.log(title,notes.length,'notes',words.length,'words');
