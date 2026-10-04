import { makeScene, cornerError } from '../tests/helpers/synth.js';
import { detectDocument } from '../js/edges.js';
import { orderCorners } from '../js/geom.js';
const bgs=(process.argv[2]||'wood,dark,light,gray,green').split(',');
let n=0; const res=[];
for (const bg of bgs) for (let k=0;k<8;k++){
  const seed=n*7+3; n++;
  const rot=(k*13)%50-25; const persp=(k%4)*0.12; const shadow=process.argv[3]==='strong'?'strong':k%2==1;
  const s=makeScene({seed,bg,rot,persp,scale:0.55+ (k%3)*0.12,shadow});
  const t0=performance.now();
  const r=detectDocument(s.img);
  const dt=performance.now()-t0;
  const e=cornerError(r.corners, orderCorners(s.truth), 800,600);
  res.push({bg,k,rot,persp,shadow,found:r.found,score:+r.score.toFixed(2),m:r.method,mean:+(e.mean*100).toFixed(2),max:+(e.max*100).toFixed(2),dt:Math.round(dt)});
}
for(const r of res) console.log(JSON.stringify(r));
const ok=res.filter(r=>r.max<2); console.log('ok<2%',ok.length,'/',res.length, 'mean',(res.reduce((a,r)=>a+r.mean,0)/res.length).toFixed(2));
