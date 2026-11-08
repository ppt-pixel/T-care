import React from 'react';
import {BASE,CENTER,STEMS,FLOWER,SPARKLES,leafPath,leafHalf,leafRib,leafVeins,palette} from './heroPlant.js';

/* Home-page hero illustration: a potted plant that grows in, sways, blooms a flower,
   with a butterfly, sparkles, ripples on the soil and a slow-turning orbit halo.
   Pure SVG + CSS (see "hero plant" block in styles.css) — theme-aware via the `theme` prop. */
const Leaf=({s,i,P})=>{
  const id=`hpLg${i}`;
  return <g transform={`translate(${s.end[0]} ${s.end[1]}) rotate(${s.angle})`}>
    <g className="hp-grow" style={{'--d':`${s.delay+.25}s`}}>
      <g className="hp-sway" style={{animationDelay:`${-i*1.4}s`,animationDuration:`${5.4+i*.6}s`}}>
        <defs><linearGradient id={id} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor={P.leafB(s.hue)}/><stop offset="1" stopColor={P.leafA(s.hue)}/></linearGradient></defs>
        <path d={leafPath(s.L,s.W)} fill={`url(#${id})`}/>
        <path d={leafHalf(s.L,s.W)} fill="#000" opacity=".13"/>
        <path d={leafVeins(s.L,s.W)} fill="none" stroke="#fff" strokeOpacity=".3" strokeWidth="1.2" strokeLinecap="round"/>
        <path d={leafRib(s.L)} fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="2.2" strokeLinecap="round"/>
      </g>
    </g>
  </g>;
};
const Stem=({s,P})=><path className="hp-draw" pathLength="1" d={s.d} fill="none" stroke={P.stem} strokeWidth="6.5" strokeLinecap="round" style={{'--d':`${s.delay-.45}s`}}/>;
const Petals=({n,len,wid,rot,fill,delay})=>Array.from({length:n},(_,k)=>
  <g key={k} transform={`rotate(${rot+k*360/n})`}><g className="hp-grow" style={{'--d':`${delay+k*.07}s`}}>
    <path d={`M0 0C${-wid} ${-len*.2} ${-wid*1.1} ${-len*.75} 0 ${-len}C${wid*1.1} ${-len*.75} ${wid} ${-len*.2} 0 0Z`} fill={fill}/>
    <path d={`M0 ${-len*.12}L0 ${-len*.8}`} stroke="#fff" strokeOpacity=".35" strokeWidth="1.4" strokeLinecap="round"/>
  </g></g>);

function HeroPlant({theme}){
  const svgRef=React.useRef(null);
  React.useEffect(()=>{const el=svgRef.current;if(!el||typeof IntersectionObserver==='undefined')return;
    const io=new IntersectionObserver(([e])=>{const on=e.isIntersecting;el.classList.toggle('is-paused',!on);try{on?el.unpauseAnimations():el.pauseAnimations()}catch{}},{threshold:0});
    io.observe(el);return()=>io.disconnect()},[]);
  const dark=theme==='dark',P=palette(dark);
  const [cx,cy]=CENTER,[fx,fy]=FLOWER.at;
  const back=STEMS.filter(s=>s.layer===0),mid=STEMS.filter(s=>s.layer===1),front=STEMS.filter(s=>s.layer===2);
  const idx=s=>STEMS.indexOf(s);
  return <svg ref={svgRef} viewBox="0 0 520 620" className="hero-plant" role="img" aria-label="A potted plant blooming with a butterfly and sparkles around it">
    <defs>
      <radialGradient id="hpHalo" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor={P.haloA}/><stop offset="1" stopColor={P.haloB}/></radialGradient>
      <linearGradient id="hpPot" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={P.potB}/><stop offset=".35" stopColor={P.potA}/><stop offset="1" stopColor={P.potB}/></linearGradient>
      <linearGradient id="hpPetal" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor={P.petalB}/><stop offset="1" stopColor={P.petal}/></linearGradient>
      <linearGradient id="hpPetalIn" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#ffd36b"/><stop offset="1" stopColor={P.petalB}/></linearGradient>
      <radialGradient id="hpShadow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor={P.shadow}/><stop offset="1" stopColor="rgba(0,0,0,0)"/></radialGradient>
    </defs>

    {/* halo + slowly turning orbit with little satellites */}
    <circle cx={cx} cy={cy} r="232" fill="url(#hpHalo)"/>
    <circle cx={cx} cy={cy} r="196" fill="none" stroke={P.ring} strokeOpacity=".45" strokeWidth="1"/>
    <g className="hp-orbit">
      <circle cx={cx} cy={cy} r="236" fill="none" stroke={P.ring} strokeWidth="1.4" strokeDasharray="2 9" strokeLinecap="round"/>
      <circle cx={cx+236} cy={cy} r="9" fill={P.petal}/><circle cx={cx+236} cy={cy} r="15" fill={P.petal} opacity=".18"/>
      <circle cx={cx-118} cy={cy+204} r="6" fill={P.stem}/>
      <path d={`M${cx-118} ${cy-204}c8 -6 16 -2 14 8c-9 3 -15 -1 -14 -8z`} fill={P.stem}/>
    </g>

    {/* ground shadow + soil */}
    <ellipse cx="260" cy="604" rx="104" ry="11" fill="url(#hpShadow)"/>
    <ellipse cx="260" cy="474" rx="64" ry="9" fill={P.soil}/>

    {/* plant — back to front */}
    <path className="hp-draw" pathLength="1" d={FLOWER.stem} fill="none" stroke={P.stem} strokeWidth="6.5" strokeLinecap="round" style={{'--d':'.5s'}}/>
    {back.map(s=><Stem key={'s'+idx(s)} s={s} P={P}/>)}
    {back.map(s=><Leaf key={'l'+idx(s)} s={s} i={idx(s)} P={P}/>)}
    <g transform={`translate(${fx} ${fy})`}><g className="hp-spin">
      <Petals n={9} len={56} wid={15} rot={0} fill="url(#hpPetal)" delay={FLOWER.delay}/>
      <Petals n={9} len={36} wid={11} rot={20} fill="url(#hpPetalIn)" delay={FLOWER.delay+.6}/>
    </g>
      <g className="hp-grow" style={{'--d':`${FLOWER.delay+1.1}s`}}><circle r="12" fill="#ffcf5e"/><circle r="12" fill="none" stroke="#b9732e" strokeOpacity=".35" strokeWidth="1.5"/>
        {Array.from({length:6},(_,k)=><circle key={k} cx={Math.cos(k*Math.PI/3)*6.2} cy={Math.sin(k*Math.PI/3)*6.2} r="1.5" fill="#b9732e" opacity=".7"/>)}</g>
    </g>
    {mid.map(s=><Stem key={'s'+idx(s)} s={s} P={P}/>)}
    {mid.map(s=><Leaf key={'l'+idx(s)} s={s} i={idx(s)} P={P}/>)}
    {front.map(s=><Stem key={'s'+idx(s)} s={s} P={P}/>)}
    {front.map(s=><Leaf key={'l'+idx(s)} s={s} i={idx(s)} P={P}/>)}

    {/* terracotta pot (drawn last so stems look planted) */}
    <g transform="translate(260 593) scale(1.14) translate(-260 -593)"><g className="hp-pot">
      <path d="M200 492L320 492L306 580Q304 593 291 593L229 593Q216 593 214 580Z" fill="url(#hpPot)"/>
      <path d="M208 524L312 524" stroke="#fff" strokeOpacity=".16" strokeWidth="5"/>
      <rect x="188" y="470" width="144" height="26" rx="9" fill={P.potRim}/>
      <rect x="188" y="470" width="144" height="26" rx="9" fill="none" stroke="#000" strokeOpacity=".1"/>
      <path d="M200 478H318" stroke="#fff" strokeOpacity=".35" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="260" cy="545" r="17" fill="#fffaf0" opacity=".92"/>
      <path d="M260 555c-9-2 -12-10 -10-18c7 0 12 4 13 10c1-6 5-10 11-10c1 8 -3 16 -14 18z" fill={P.stem}/>
    </g></g>

    {/* sparkles */}
    {SPARKLES.map(([x,y,k],i)=><g key={i} transform={`translate(${x} ${y}) scale(${k})`}><path className="hp-spark" style={{animationDelay:`${-i*.7}s`}} d="M0 -9C1 -3 3 -1 9 0C3 1 1 3 0 9C-1 3 -3 1 -9 0C-3 -1 -1 -3 0 -9Z" fill={dark?'#eef2df':'#fff'} stroke={dark?'none':'#e4b34a'} strokeWidth=".8"/></g>)}

    {/* butterfly flutters along a looping path (SMIL; hidden when reduced motion is on) */}
    <g className="hp-bfly"><g transform="scale(1.7)">
      <animateMotion dur="22s" repeatCount="indefinite" rotate="auto" path="M60 250C120 150 210 215 250 175S400 70 455 190S385 335 300 292S115 392 60 250Z"/>
      <g className="hp-flap"><path d="M0 0C-6 -20 -26 -30 -30 -14C-32 -2 -14 4 0 0Z" fill={P.petal}/><path d="M0 0C-4 -9 -14 -10 -14 -3C-14 2 -6 3 0 0Z" fill="#ffd36b" opacity=".9"/></g>
      <g className="hp-flap"><path d="M0 0C-6 20 -26 30 -30 14C-32 2 -14 -4 0 0Z" fill={P.petal}/><path d="M0 0C-4 9 -14 10 -14 3C-14 -2 -6 -3 0 0Z" fill="#ffd36b" opacity=".9"/></g>
      <ellipse cx="2" cy="0" rx="9" ry="2.2" fill={dark?'#eef2df':'#1d2a1f'}/>
      <path d="M10 -1Q18 -8 22 -7M10 1Q18 8 22 7" fill="none" stroke={dark?'#eef2df':'#1d2a1f'} strokeWidth="1" strokeLinecap="round"/>
    </g></g>
  </svg>;
}

export default React.memo(HeroPlant);
