import React from 'react';
import {leafPath} from '../heroPlant.js';

/* Hand-drawn SVG illustrations for the landing page (no photos needed). */
const Lf=({x,y,L,W,r,fill,op=1})=><path transform={`translate(${x} ${y}) rotate(${r})`} d={leafPath(L,W)} fill={fill} opacity={op}/>;
const G=['#2f7a3b','#3d8f48','#276a34','#4aa055','#1f5a2c'];

/* ---------- store products ---------- */
export function ProductArt({kind,pot}){
  const potEl=<g><path d="M62 158h76l-9 52q-1 7-8 7H79q-7 0-8-7z" fill={pot}/><path d="M62 158h76l-2 11H64z" fill="#000" opacity=".12"/><rect x="56" y="150" width="88" height="14" rx="6" fill={pot}/><rect x="56" y="150" width="88" height="14" rx="6" fill="#fff" opacity=".18"/></g>;
  let plant=null;
  if(kind==='snake')plant=[-22,-10,0,12,24,-34,34].map((a,i)=><Lf key={i} x={100+a*.8} y={152} L={[96,120,132,112,92,70,74][i]} W={13} r={a} fill={G[i%5]}/>);
  if(kind==='money')plant=Array.from({length:11},(_,i)=>{const a=-80+i*16;return <Lf key={i} x={100+Math.sin(a*Math.PI/180)*8} y={150} L={52+((i*7)%3)*10} W={20} r={a} fill={[G[1],'#7fc46a',G[0]][i%3]}/>});
  if(kind==='rubber')plant=<g><path d="M100 152C98 120 102 90 100 40" stroke="#5b4a32" strokeWidth="5" fill="none" strokeLinecap="round"/>{[[100,128,-60],[100,112,62],[100,96,-52],[100,80,56],[100,64,-44],[100,50,46],[100,38,0]].map(([x,y,r],i)=><Lf key={i} x={x} y={y} L={50-i*2} W={19-i} r={r} fill={i%2?'#1f5a2c':'#2a6b36'}/>)}</g>;
  if(kind==='lily')plant=<g>{[-70,-48,-26,-6,16,38,60,80].map((a,i)=><Lf key={i} x={100} y={152} L={78+((i*9)%3)*10} W={22} r={a} fill={G[i%5]}/>)}{[[88,70,-10],[116,82,12]].map(([x,y,r],i)=><g key={i} transform={`translate(${x} ${y}) rotate(${r})`}><path d="M0 0C-18 -6 -16 -44 0 -52C16 -44 18 -6 0 0Z" fill="#fffaf0" stroke="#d8d2c0"/><rect x="-2.5" y="-30" width="5" height="22" rx="2.5" fill="#f1d36b"/></g>)}<path d="M88 152V76M116 152V88" stroke="#2f7a3b" strokeWidth="3"/></g>;
  if(kind==='palm')plant=[-72,-52,-32,-12,8,28,48,68].map((a,i)=><Lf key={i} x={100} y={152} L={118-Math.abs(a)*.4} W={9} r={a} fill={G[(i+1)%5]}/>);
  if(kind==='jade')plant=<g><path d="M100 152C98 130 104 118 100 98M100 128C86 120 80 112 78 104M100 118C114 112 122 106 124 98" stroke="#7a6a4a" strokeWidth="6" fill="none" strokeLinecap="round"/>{[[100,92],[88,98],[112,96],[76,102],[124,96],[96,80],[108,84],[84,86],[118,84],[100,106],[82,110],[120,108]].map(([x,y],i)=><ellipse key={i} cx={x} cy={y} rx="12" ry="9" fill={i%2?'#4aa055':'#3d8f48'} transform={`rotate(${i*23} ${x} ${y})`}/>)}</g>;
  if(kind==='food')return <g><rect x="64" y="64" width="72" height="140" rx="16" fill="#2f6b3a"/><rect x="82" y="40" width="36" height="28" rx="6" fill="#e8c46c"/><rect x="72" y="104" width="56" height="62" rx="8" fill="#fffaf0"/><path d="M100 150c-12-3 -16-14 -13-24c9 1 15 6 16 14c2-8 7-13 15-13c1 11 -4 21 -18 23z" fill="#2f6b3a"/><rect x="72" y="78" width="56" height="8" rx="4" fill="#fff" opacity=".3"/></g>;
  if(kind==='trowel')return <g transform="rotate(-24 100 120)"><path d="M100 28C128 54 128 100 100 140C72 100 72 54 100 28Z" fill="#c9d3cc"/><path d="M100 28C128 54 128 100 100 140" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="3"/><rect x="94" y="136" width="12" height="20" fill="#8b949b"/><rect x="88" y="152" width="24" height="56" rx="10" fill="#2f6b3a"/></g>;
  return <g><ellipse cx="100" cy="214" rx="56" ry="6" fill="#000" opacity=".12"/>{plant}{potEl}</g>;
}
export const ProductSvg=({kind,pot})=><svg viewBox="0 0 200 224" className="prod-art" aria-hidden="true"><ProductArt kind={kind} pot={pot}/></svg>;

/* ---------- "why choose" showcase cards ---------- */
export function ShowcaseArt({kind}){
  const bar=(y,w,c='var(--g)')=><rect x="40" y={y} width={w} height="9" rx="4.5" style={{fill:c}} opacity=".28"/>;
  return <svg viewBox="0 0 300 380" className="show-art" aria-hidden="true">
    <defs><linearGradient id={`sg-${kind}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e9f3d8"/><stop offset="1" stopColor="#bfe0a6"/></linearGradient></defs>
    <rect width="300" height="380" fill={`url(#sg-${kind})`}/>
    {kind==='report'&&<g>
      <rect x="24" y="30" width="252" height="320" rx="22" fill="#fffaf0"/>
      <rect x="40" y="48" width="92" height="12" rx="6" style={{fill:'var(--g)'}}/><rect x="196" y="44" width="64" height="22" rx="11" fill="#e8c46c"/><text x="228" y="59" textAnchor="middle" fontSize="11" fontWeight="700" fill="#4b3a0a">Thriving</text>
      <g transform="translate(150 176) scale(.82)"><ellipse cx="0" cy="70" rx="48" ry="7" fill="#000" opacity=".08"/>{[-52,-28,-6,18,40].map((a,i)=><Lf key={i} x={0} y={52} L={92-Math.abs(a)*.4} W={26} r={a} fill={G[i]}/>)}<path d="M-30 52h60l-7 40q-1 6-7 6h-32q-6 0-7-6z" fill="#c8693d"/><rect x="-36" y="46" width="72" height="11" rx="5" fill="#d9794a"/></g>
      {[270,296,322].map((y,i)=><g key={y}><circle cx="52" cy={y} r="8" style={{fill:'var(--g)'}}/><path d={`M48 ${y}l3 3 6-7`} stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round"/><rect x="70" y={y-4} width={[150,120,170][i]} height="8" rx="4" fill="#1d2a1f" opacity=".16"/></g>)}
    </g>}
    {kind==='reminder'&&<g>
      <path transform="translate(150 118)" d="M0 -64C30 -20 46 4 46 30A46 46 0 0 1 -46 30C-46 4 -30 -20 0 -64Z" fill="#5db7e8"/>
      <path transform="translate(150 118)" d="M-24 24C-24 40 -14 50 0 52" stroke="#fff" strokeOpacity=".7" strokeWidth="6" fill="none" strokeLinecap="round"/>
      <rect x="40" y="206" width="220" height="140" rx="20" fill="#fffaf0"/><rect x="40" y="206" width="220" height="34" rx="20" style={{fill:'var(--g)'}}/><rect x="40" y="224" width="220" height="16" style={{fill:'var(--g)'}}/>
      {Array.from({length:14},(_,i)=>{const c=i%7,r=Math.floor(i/7),on=i===9;return <g key={i}>{on&&<circle cx={64+c*30} cy={268+r*34} r="14" style={{fill:'var(--acc)'}}/>}<circle cx={64+c*30} cy={268+r*34} r="3.4" fill={on?'#fff':'#1d2a1f'} opacity={on?1:.35}/></g>})}
      <circle cx="236" cy="52" r="22" fill="#e8c46c"/><path d="M236 40a10 10 0 0 0-10 10v8l-4 6h28l-4-6v-8a10 10 0 0 0-10-10zM231 70a5 5 0 0 0 10 0z" fill="#4b3a0a"/>
    </g>}
    {kind==='growth'&&<g>
      <rect x="24" y="40" width="252" height="300" rx="22" fill="#fffaf0"/>
      {[0,1,2,3].map(i=><line key={i} x1="44" x2="256" y1={100+i*54} y2={100+i*54} stroke="#1d2a1f" strokeOpacity=".1"/>)}
      <path d="M48 300C90 290 110 262 140 236S210 160 252 104" fill="none" style={{stroke:'var(--g)'}} strokeWidth="5" strokeLinecap="round"/>
      <path d="M48 300C90 290 110 262 140 236S210 160 252 104V320H48Z" style={{fill:'var(--g)'}} opacity=".12"/>
      {[[48,300,8],[140,236,14],[252,104,24]].map(([x,y,s],i)=><g key={i}><circle cx={x} cy={y} r="6" fill="#fffaf0" style={{stroke:'var(--g)'}} strokeWidth="3"/><Lf x={x} y={y-6} L={s+10} W={(s+10)*.4} r={-20} fill={G[i+1]}/><Lf x={x} y={y-6} L={s+6} W={(s+6)*.4} r={26} fill={G[i]}/></g>)}
      <rect x="44" y="62" width="70" height="12" rx="6" style={{fill:'var(--g)'}} opacity=".8"/><rect x="190" y="62" width="64" height="12" rx="6" fill="#e8c46c"/>
    </g>}
  </svg>;
}

/* ---------- Real Transformations scenes (portrait, slice-friendly) ---------- */
const Glow=({id,c})=><radialGradient id={id}><stop offset="0" stopColor={c} stopOpacity="1"/><stop offset=".35" stopColor={c} stopOpacity=".5"/><stop offset="1" stopColor={c} stopOpacity="0"/></radialGradient>;
const Bulbs=({y0,y1,sag,n,id})=>Array.from({length:n},(_,i)=>{const t=i/(n-1),x=20+t*560,y=y0+(y1-y0)*t+Math.sin(t*Math.PI)*sag;return <g key={i}><circle cx={x} cy={y+8} r="14" fill={`url(#${id})`}/><circle cx={x} cy={y+8} r="3.4" fill="#fff4c9"/></g>});
const Plant=({x,y,s=1,pot='#e8e1d2',leaves=G,n=7,L=90})=><g transform={`translate(${x} ${y}) scale(${s})`}>{Array.from({length:n},(_,i)=><Lf key={i} x={0} y={0} L={L-(i%3)*12} W={24} r={-66+i*(132/(n-1))} fill={leaves[i%leaves.length]}/>)}<path d="M-34 0h68l-8 54q-1 6-7 6h-38q-6 0-7-6z" fill={pot}/><rect x="-40" y="-8" width="80" height="14" rx="6" fill={pot}/><rect x="-40" y="-8" width="80" height="14" rx="6" fill="#fff" opacity=".18"/></g>;

export function TransformScene({id}){
  const gid=`g-${id}`;
  if(id==='balcony')return <svg viewBox="0 0 600 700" preserveAspectRatio="xMidYMid slice" className="scene" aria-hidden="true">
    <defs><linearGradient id={`${gid}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5d5a93"/><stop offset=".55" stopColor="#e88fa3"/><stop offset="1" stopColor="#f8c58b"/></linearGradient><Glow id={`${gid}b`} c="#ffd98a"/><linearGradient id={`${gid}f`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9a6a43"/><stop offset="1" stopColor="#6e4a2e"/></linearGradient></defs>
    <rect width="600" height="700" fill={`url(#${gid}s)`}/>
    {[[0,330,70,170],[60,290,60,210],[130,350,80,150],[300,300,70,200],[380,340,90,160],[480,280,60,220],[530,330,70,170]].map(([x,y,w,h],i)=><g key={i}><rect x={x} y={y} width={w} height={h} fill="#46497a" opacity=".62"/>{Array.from({length:6},(_,k)=><rect key={k} x={x+8+(k%3)*18} y={y+14+Math.floor(k/3)*26} width="8" height="12" fill="#ffd98a" opacity={(i+k)%3?.8:.15}/>)}</g>)}
    <Bulbs y0={40} y1={70} sag={34} n={11} id={`${gid}b`}/><path d="M20 48Q300 120 580 78" stroke="#2a2a3a" strokeWidth="1.5" fill="none" opacity=".5"/>
    <rect y="500" width="600" height="200" fill={`url(#${gid}f)`}/>{Array.from({length:9},(_,i)=><line key={i} x1="0" x2="600" y1={520+i*22} y2={520+i*22} stroke="#000" strokeOpacity=".16"/>)}
    <rect y="390" width="600" height="8" fill="#23262d"/><rect y="430" width="600" height="6" fill="#23262d"/>{Array.from({length:16},(_,i)=><rect key={i} x={10+i*38} y="396" width="5" height="106" fill="#23262d"/>)}
    <rect x="0" y="456" width="600" height="58" rx="6" fill="#f4eee2"/><rect x="0" y="456" width="600" height="8" fill="#fff"/>
    {Array.from({length:22},(_,i)=><g key={i}><circle cx={14+i*28} cy={446-(i%3)*8} r={14+(i%2)*4} fill={G[i%5]}/>{i%2===0&&<circle cx={20+i*28} cy={430-(i%3)*8} r="6" fill={i%4?'#e75b8b':'#ff9fcf'}/>}</g>)}
    <Plant x={120} y={560} s={1.5} n={9} L={110} pot="#d9d2c0"/><Plant x={470} y={600} s={1.1} n={7} L={90} pot="#c8693d"/>
    <ellipse cx="300" cy="640" rx="90" ry="10" fill="#000" opacity=".15"/>
  </svg>;
  if(id==='indoor')return <svg viewBox="0 0 600 700" preserveAspectRatio="xMidYMid slice" className="scene" aria-hidden="true">
    <defs><linearGradient id={`${gid}w`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f6efe2"/><stop offset="1" stopColor="#e6d9c3"/></linearGradient><linearGradient id={`${gid}fl`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d1a673"/><stop offset="1" stopColor="#b98a57"/></linearGradient></defs>
    <rect width="600" height="700" fill={`url(#${gid}w)`}/><rect y="470" width="600" height="230" fill={`url(#${gid}fl)`}/>{Array.from({length:7},(_,i)=><line key={i} x1="0" x2="600" y1={490+i*34} y2={490+i*34} stroke="#000" strokeOpacity=".1"/>)}
    <rect x="30" y="60" width="150" height="320" fill="#fff" opacity=".55"/><rect x="30" y="60" width="150" height="320" fill="none" stroke="#fff" strokeWidth="6"/><line x1="105" x2="105" y1="60" y2="380" stroke="#fff" strokeWidth="5"/><line x1="30" x2="180" y1="220" y2="220" stroke="#fff" strokeWidth="5"/>
    <polygon points="180,60 330,470 450,470 250,60" fill="#fff" opacity=".22"/><polygon points="180,200 420,470 520,470 250,170" fill="#fff" opacity=".12"/>
    <path d="M300 410C298 330 306 260 300 150" stroke="#5b6b45" strokeWidth="7" fill="none"/>{[[-70,330,150,60],[60,330,150,60],[-40,270,160,56],[50,260,150,54],[0,200,170,50]].map(([r,y,L,W],i)=><Lf key={i} x={300} y={y+60} L={L} W={W} r={r} fill={i%2?'#1f5a2c':'#2f7a3b'}/>)}
    {[[340,240,-28],[270,200,26]].map(([x,y,r],i)=><Lf key={i} x={x} y={y} L={110} W={30} r={r} fill="#2a6b36"/>)}
    <Plant x={150} y={470} s={1.9} n={9} L={120} pot="#e9e1d1"/><Plant x={470} y={560} s={.9} n={7} L={80} pot="#d4c7b0"/><Plant x={64} y={560} s={.7} n={6} L={70} pot="#e9e1d1"/>
    <rect x="360" y="400" width="240" height="120" rx="26" fill="#efe9de"/><rect x="380" y="372" width="200" height="70" rx="20" fill="#f8f3ea"/><rect x="408" y="390" width="46" height="46" rx="10" fill="#c9bfa8"/><rect x="460" y="392" width="46" height="46" rx="10" fill="#e4d9c1"/>
    <ellipse cx="260" cy="640" rx="210" ry="36" fill="#f6efe2"/><ellipse cx="260" cy="640" rx="210" ry="36" fill="none" stroke="#d8cdb6" strokeWidth="3"/>
    <ellipse cx="330" cy="590" rx="78" ry="16" fill="#b98a57"/><rect x="254" y="590" width="152" height="34" fill="#a8794a"/><ellipse cx="330" cy="624" rx="78" ry="14" fill="#9a6d40"/><ellipse cx="330" cy="590" rx="78" ry="16" fill="#c99b6a"/>
    <rect x="314" y="566" width="28" height="22" rx="6" fill="#fff"/><path d="M342 572q10 2 0 12" stroke="#fff" strokeWidth="3" fill="none"/>
  </svg>;
  return <svg viewBox="0 0 600 700" preserveAspectRatio="xMidYMid slice" className="scene" aria-hidden="true">
    <defs><linearGradient id={`${gid}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f2a56a"/><stop offset="1" stopColor="#f6c9a4"/></linearGradient><Glow id={`${gid}b`} c="#ffd98a"/><Glow id={`${gid}l`} c="#ffe3a6"/><linearGradient id={`${gid}t`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8f9298"/><stop offset="1" stopColor="#6f7278"/></linearGradient></defs>
    <rect width="600" height="700" fill={`url(#${gid}s)`}/><rect y="150" width="600" height="320" fill="#f1ece4"/>
    {[170,430].map(x=><g key={x}><ellipse cx={x} cy="270" rx="70" ry="90" fill={`url(#${gid}l)`}/><rect x={x-9} y="250" width="18" height="30" rx="4" fill="#2b2b30"/></g>)}
    <rect y="40" width="600" height="26" fill="#2a2a30"/>{Array.from({length:16},(_,i)=><rect key={i} x={i*40} y="66" width="22" height="64" fill="#8a6a45" opacity=".9"/>)}<rect y="130" width="600" height="14" fill="#2a2a30"/><rect y="40" width="600" height="104" fill="#f6c27a" opacity=".12"/>
    <Bulbs y0={150} y1={160} sag={26} n={11} id={`${gid}b`}/>
    {Array.from({length:7},(_,i)=><circle key={i} cx={30+i*42} cy={456-(i%3)*10} r={22+(i%2)*6} fill={G[i%5]}/>)}<rect x="0" y="468" width="260" height="52" rx="6" fill="#fff"/>{[[60,430,'#e75b8b'],[130,424,'#ff9fcf'],[210,432,'#e8c46c']].map(([x,y,c],i)=><circle key={i} cx={x} cy={y} r="7" fill={c}/>)}
    <rect y="470" width="600" height="230" fill={`url(#${gid}t)`}/>{Array.from({length:6},(_,i)=><line key={i} x1="0" x2="600" y1={500+i*40} y2={500+i*40} stroke="#000" strokeOpacity=".18"/>)}{Array.from({length:6},(_,i)=><line key={i} x1={i*120} x2={i*120-90} y1="470" y2="700" stroke="#000" strokeOpacity=".14"/>)}
    <rect x="130" y="380" width="360" height="110" rx="24" fill="#d8d3ca"/><rect x="150" y="340" width="320" height="70" rx="22" fill="#ece7de"/><rect x="190" y="362" width="46" height="46" rx="8" fill="#a37f5a" opacity=".85"/><rect x="246" y="364" width="44" height="44" rx="8" fill="#6c6a64"/>
    <ellipse cx="300" cy="620" rx="190" ry="44" fill="#9b7347"/><ellipse cx="300" cy="620" rx="150" ry="34" fill="none" stroke="#7c5a33" strokeWidth="3"/><ellipse cx="300" cy="620" rx="110" ry="24" fill="none" stroke="#7c5a33" strokeWidth="3"/><ellipse cx="300" cy="620" rx="64" ry="14" fill="none" stroke="#7c5a33" strokeWidth="3"/>
    <rect x="240" y="552" width="120" height="46" rx="8" fill="#b8b4ac"/><ellipse cx="300" cy="552" rx="60" ry="9" fill="#cfcbc3"/><path d="M300 556C286 544 292 530 300 520C308 530 314 544 300 556Z" fill="#ff8a3d"/><path d="M300 554C294 546 297 538 300 532C303 538 306 546 300 554Z" fill="#ffd36b"/>
    <ellipse cx="300" cy="552" rx="130" ry="28" fill={`url(#${gid}l)`} opacity=".7"/>
    <Plant x={500} y={560} s={1.3} n={8} L={100} pot="#c9c2b4"/>
  </svg>;
}
