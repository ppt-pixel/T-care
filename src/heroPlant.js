// Geometry + palette for the home-page hero illustration (pure data, no JSX).
export const BASE=[260,478];            // where every stem meets the soil
export const CENTER=[260,318];          // centre of the halo / orbit rings

// leaf outline pointing "up" from (0,0): broad base, pointed tip
export const leafPath=(L,W)=>`M0 0C${W*.55} ${-L*.02} ${W*1.05} ${-L*.38} ${W*.7} ${-L*.68}C${W*.5} ${-L*.88} ${W*.15} ${-L*.97} 0 ${-L}C${-W*.15} ${-L*.97} ${-W*.5} ${-L*.88} ${-W*.7} ${-L*.68}C${-W*1.05} ${-L*.38} ${-W*.55} ${-L*.02} 0 0Z`;
export const leafHalf=(L,W)=>`M0 0C${W*.55} ${-L*.02} ${W*1.05} ${-L*.38} ${W*.7} ${-L*.68}C${W*.5} ${-L*.88} ${W*.15} ${-L*.97} 0 ${-L}Z`;
export const leafRib=(L)=>`M0 -2Q${L*.03} ${-L*.5} 0 ${-L*.97}`;
export const leafVeins=(L,W)=>[.2,.36,.52,.68].map(t=>{const y=-L*t,r=W*(.62-t*.42);return `M0 ${y}Q${r*.55} ${y-L*.02} ${r} ${y-L*.14}M0 ${y}Q${-r*.55} ${y-L*.02} ${-r} ${y-L*.14}`}).join('');

// each stem: quadratic curve BASE → end (control point c), then a leaf grows from `end`
// angle = direction of the stem's final tangent, so the leaf continues the curve naturally
const mk=(end,c,L,W,hue,delay,layer)=>({end,c,L,W,hue,delay,layer,angle:Math.round(Math.atan2(end[0]-c[0],-(end[1]-c[1]))*180/Math.PI*10)/10,d:`M${BASE[0]} ${BASE[1]}Q${c[0]} ${c[1]} ${end[0]} ${end[1]}`});
export const STEMS=[
  mk([176,246],[258,350],126,52,128,.55,0),
  mk([345,236],[262,350],122,50,118,.65,0),
  mk([112,352],[252,392],124,52,112,.8,1),
  mk([412,346],[268,396],124,52,104,.95,1),
  mk([120,452],[225,420],92,40,96,1.1,2),
  mk([400,452],[300,424],92,40,136,1.2,2),
];
export const FLOWER={stem:`M${BASE[0]} ${BASE[1]}Q238 330 262 168`,at:[262,142],petals:9,delay:1.5};
export const SPARKLES=[[96,176,1],[430,150,.8],[470,300,1.15],[60,330,.7],[212,60,.9],[352,520,.8]];

// theme-aware colours (lightness shifts so greens glow on dark, stay rich on light)
export const palette=(dark)=>({
  leafA:h=>`hsl(${h} ${dark?46:50}% ${dark?60:50}%)`,
  leafB:h=>`hsl(${h+8} ${dark?52:56}% ${dark?36:30}%)`,
  stem:dark?'#9bcf68':'#3d7a3f',
  haloA:dark?'rgba(168,214,114,.22)':'rgba(255,224,150,.75)',
  haloB:dark?'rgba(31,95,85,.0)':'rgba(159,212,138,0)',
  ring:dark?'rgba(238,242,223,.28)':'rgba(29,42,31,.28)',
  potA:dark?'#e0794b':'#e48a5a',potB:dark?'#a8441f':'#bf5a31',potRim:dark?'#f19062':'#f3a374',
  soil:dark?'#2a1d14':'#5b3d27',
  petal:dark?'#ff8a5c':'#e4572e',petalB:dark?'#ffc08a':'#ffa76f',
  shadow:dark?'rgba(0,0,0,.45)':'rgba(29,42,31,.22)',
});
