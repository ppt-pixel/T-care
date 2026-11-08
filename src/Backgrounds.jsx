import React from 'react';

/* Backgrounds for the non-landing pages:
   - AppBackground  → customer / gardener / admin workspaces (calm, role-tinted, low contrast)
   - AuthScenery    → animated left panel of the sign-in / register page
   Pure SVG + CSS; styles live in the "page backgrounds" block of styles.css. */

// Line-art fern: leaflet pairs placed along a curved stem (deterministic, no randomness)
const fernData=(()=>{
  const P0=[150,420],P1=[78,230],P2=[196,26];
  const pt=t=>[(1-t)**2*P0[0]+2*(1-t)*t*P1[0]+t*t*P2[0],(1-t)**2*P0[1]+2*(1-t)*t*P1[1]+t*t*P2[1]];
  const tan=t=>{const dx=2*(1-t)*(P1[0]-P0[0])+2*t*(P2[0]-P1[0]),dy=2*(1-t)*(P1[1]-P0[1])+2*t*(P2[1]-P1[1]);const m=Math.hypot(dx,dy);return[dx/m,dy/m]};
  const leaflets=[];
  for(let k=0;k<11;k++){const t=.1+k*.082,[x,y]=pt(t),[tx,ty]=tan(t),L=(78*(1-t*.78)+10),w=L*.3;
    for(const side of [-1,1]){
      const a=side*(58-t*14)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
      const dx=tx*c-ty*s,dy=tx*s+ty*c;           // leaflet direction
      const ex=x+dx*L,ey=y+dy*L,nx=-dy,ny=dx;     // tip + normal
      const mx=x+dx*L*.5,my=y+dy*L*.5;
      leaflets.push({d:`M${x.toFixed(1)} ${y.toFixed(1)}Q${(mx+nx*w).toFixed(1)} ${(my+ny*w).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}Q${(mx-nx*w).toFixed(1)} ${(my-ny*w).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}Z`,rib:`M${x.toFixed(1)} ${y.toFixed(1)}L${(x+dx*L*.92).toFixed(1)} ${(y+dy*L*.92).toFixed(1)}`});
    }}
  return{stem:`M${P0[0]} ${P0[1]}Q${P1[0]} ${P1[1]} ${P2[0]} ${P2[1]}`,leaflets};
})();
export const Fern=React.memo(function Fern({className=''}){
  return <svg viewBox="0 0 300 430" className={`fern ${className}`} fill="none" aria-hidden="true">
    <path d={fernData.stem} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" pathLength="1" className="fern-draw"/>
    {fernData.leaflets.map((l,i)=><g key={i} className="fern-leaf" style={{'--i':i}}>
      <path d={l.d} fill="currentColor" fillOpacity=".07" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d={l.rib} stroke="currentColor" strokeWidth=".9" strokeOpacity=".7" strokeLinecap="round"/>
    </g>)}
  </svg>;
});

// slow drifting motes: leaves (customer), seeds (gardener), none (admin)
const MOTES=[[8,26,19,0,1],[22,16,24,-8,.8],[38,22,21,-4,1.1],[55,14,27,-13,.7],[68,24,20,-2,.95],[82,18,25,-10,.85],[93,20,22,-6,1]];
const Mote=({role,m,i})=>{
  const [x,s,dur,del,k]=m;
  return <span className={`ab-mote ${role}`} style={{left:`${x}%`,'--s':`${s*k}px`,animationDuration:`${dur}s`,animationDelay:`${del}s`,'--r':`${i%2?-1:1}`}}>
    {role==='garden'
      ?<svg viewBox="0 0 20 20"><path d="M10 1C16 4 18 12 10 19C2 12 4 4 10 1Z" fill="currentColor"/><path d="M10 3V17" stroke="var(--bg)" strokeOpacity=".5" strokeWidth="1"/></svg>
      :<svg viewBox="0 0 20 20"><circle cx="10" cy="14" r="2.2" fill="currentColor"/><path d="M10 12L10 4M10 6L5 3M10 6L15 3M10 8L4 7M10 8L16 7" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>}
  </span>;
};

export const AppBackground=React.memo(function AppBackground({role='garden'}){
  return <div className={`abg abg-${role}`} aria-hidden="true">
    <i className="ab-orb a1"/><i className="ab-orb a2"/><i className="ab-orb a3"/>
    <i className="ab-pattern"/>
    <Fern className="f1"/><Fern className="f2"/>
    {role!=='hq'&&MOTES.map((m,i)=><Mote key={i} role={role} m={m} i={i}/>)}
    <i className="ab-grain"/>
  </div>;
});

// deterministic pollen specks for the auth panel
const SPECKS=Array.from({length:18},(_,i)=>({x:(i*37+11)%96+2,s:2+(i*7)%5,d:11+(i*5)%9,l:-((i*3)%13),o:.25+((i*11)%6)/10}));
export const AuthScenery=React.memo(function AuthScenery(){
  return <div className="auth-scenery" aria-hidden="true">
    <i className="as-rays"/><i className="as-orb o1"/><i className="as-orb o2"/>
    <Fern className="af1"/><Fern className="af2"/>
    {SPECKS.map((p,i)=><b key={i} className="as-speck" style={{left:`${p.x}%`,width:p.s,height:p.s,animationDuration:`${p.d}s`,animationDelay:`${p.l}s`,opacity:p.o}}/>)}
  </div>;
});
