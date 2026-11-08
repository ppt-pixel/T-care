import React from 'react';
import {motion,AnimatePresence} from 'framer-motion';
import {Link} from 'react-router-dom';
import {Leaf,ArrowRight,ArrowUpRight,Check,Star,MapPin,CalendarDays,Droplets,Scissors,ShieldCheck,Sprout,Stethoscope,Bug,Sun,Moon,Menu,X,ShoppingBag,MessageCircle,Smartphone,Heart,ChevronLeft,ChevronRight,Minus,Plus,Trash2} from 'lucide-react';
import HeroPlant from '../HeroPlant.jsx';
import {ProductSvg,ShowcaseArt,TransformScene} from './Scenes.jsx';
import * as C from './content.js';
import './landing.css';

/* ---------- small helpers ---------- */
const money=n=>'₹'+n.toLocaleString('en-IN');
const L=({to,children,className,onClick,toast})=>to==='soon'
  ?<button type="button" className={className} onClick={()=>toast?.('This page is coming soon.')}>{children}</button>
  :to.startsWith('#')?<a href={to} className={className} onClick={onClick}>{children}</a>:<Link to={to} className={className} onClick={onClick}>{children}</Link>;
const LBtn=({to,children,variant='gold',onClick,toast,full})=>{const c=`lb lb-${variant}${full?' full':''}`;return to?<L to={to} className={c} toast={toast} onClick={onClick}>{children}</L>:<button type="button" className={c} onClick={onClick}>{children}</button>};
const Reveal=({children,delay=0,className='',as='div'})=>{const M=motion[as];return <M className={className} initial={{opacity:0,y:28}} whileInView={{opacity:1,y:0}} viewport={{once:true,margin:'-40px'}} transition={{duration:.6,delay,ease:[.22,1,.36,1]}}>{children}</M>};
const Head=({eyebrow,children,sub,center,light})=><div className={'lhead'+(center?' c':'')+(light?' light':'')}><i className="lline"/><span className="eyebrow">{eyebrow}</span><h2>{children}</h2>{sub&&<p>{sub}</p>}</div>;
const ICON={health:Stethoscope,water:Droplets,prune:Scissors,pest:Bug,soil:Sprout,pin:MapPin,calendar:CalendarDays,leaf:Leaf,shield:ShieldCheck,star:Star,sprout:Sprout,heart:Heart};
const reduceMotion=()=>typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches;

/* social glyphs (drawn here so we don't depend on brand icons) */
const Social={
  instagram:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".9" fill="currentColor"/></svg>,
  youtube:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2.8" y="5.5" width="18.4" height="13" rx="4"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/></svg>,
  facebook:<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21z"/></svg>,
  linkedin:<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 9.5h3V19H5zM6.5 5a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5zM10.3 9.5h2.9v1.3c.4-.8 1.5-1.5 3-1.5 3 0 3.6 2 3.6 4.6V19h-3v-4.6c0-1.1 0-2.4-1.5-2.4s-1.7 1.1-1.7 2.3V19h-3z"/></svg>,
};

/* ---------- cart ---------- */
export function useCart(toast){
  const [items,setItems]=React.useState([]),[open,setOpen]=React.useState(false);
  const add=React.useCallback(p=>{setItems(a=>a.find(x=>x.id===p.id)?a.map(x=>x.id===p.id?{...x,qty:x.qty+1}:x):[...a,{id:p.id,name:p.name,price:p.price,kind:p.kind,pot:p.pot,qty:1}]);toast?.('Added to cart')},[toast]);
  const setQty=React.useCallback((id,q)=>setItems(a=>q<=0?a.filter(x=>x.id!==id):a.map(x=>x.id===id?{...x,qty:q}:x)),[]);
  // stable identity until the cart really changes, so unrelated context updates don't re-render every cart consumer
  return React.useMemo(()=>({items,add,setQty,open,setOpen,count:items.reduce((n,x)=>n+x.qty,0),total:items.reduce((n,x)=>n+x.qty*x.price,0)}),[items,add,setQty,open]);
}
export function CartDrawer({cart,toast}){
  React.useEffect(()=>{if(!cart.open)return;const k=e=>e.key==='Escape'&&cart.setOpen(false);addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[cart.open]);
  return <AnimatePresence>{cart.open&&<>
    <motion.div key="ov" className="ld-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>cart.setOpen(false)}/>
    <motion.aside key="cd" className="ld-panel cart" role="dialog" aria-label="Shopping cart" initial={{x:'100%'}} animate={{x:0}} exit={{x:'100%'}} transition={{type:'tween',duration:.35,ease:[.22,1,.36,1]}}>
      <div className="ld-head"><h3>Your cart <small>({cart.count})</small></h3><button className="ib" onClick={()=>cart.setOpen(false)} aria-label="Close cart"><X size={17}/></button></div>
      {cart.items.length?<>
        <div className="cart-list">{cart.items.map(x=><div className="cart-item" key={x.id}><div className="ci-art"><ProductSvg kind={x.kind} pot={x.pot}/></div><div><b>{x.name}</b><span>{money(x.price)}</span><div className="qty"><button onClick={()=>cart.setQty(x.id,x.qty-1)} aria-label="Decrease"><Minus size={13}/></button><i>{x.qty}</i><button onClick={()=>cart.setQty(x.id,x.qty+1)} aria-label="Increase"><Plus size={13}/></button></div></div><button className="ci-x" onClick={()=>cart.setQty(x.id,0)} aria-label="Remove"><Trash2 size={15}/></button></div>)}</div>
        <div className="cart-foot"><div><span>Subtotal</span><b>{money(cart.total)}</b></div><LBtn variant="dark" full onClick={()=>toast?.('Checkout connects with the backend later.')}>Checkout</LBtn><button className="tl" onClick={()=>cart.setOpen(false)}>Keep browsing</button></div>
      </>:<div className="cart-empty"><ShoppingBag size={34}/><p>Your cart is empty.</p><LBtn variant="gold" to="#market" onClick={()=>cart.setOpen(false)}>Browse the market</LBtn></div>}
    </motion.aside></>}</AnimatePresence>;
}

/* ---------- navigation ---------- */
export function LandingNav({theme,toggleTheme,cart,toast}){
  const [menu,setMenu]=React.useState(false);
  React.useEffect(()=>{if(!menu)return;const k=e=>e.key==='Escape'&&setMenu(false);addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[menu]);
  const app=()=>toast?.('The T-Care app is coming soon.');
  return <>
    <header className="lnav2">
      <Link to="/" className="brand"><Leaf size={20}/><b>T-CARE</b></Link>
      <nav className="ln-links" aria-label="Main">{C.NAV_LINKS.map(([t,to])=><L key={t} to={to}>{t}</L>)}</nav>
      <div className="ln-right">
        <Link to="/garden/shop" className="ln-pill ln-green"><Leaf size={13}/>Green Makeover</Link>
        <button className="ln-pill ln-store" onClick={app}><Smartphone size={13}/>App Store</button>
        <button className="ln-pill ln-store" onClick={app}><Smartphone size={13}/>Play Store</button>
        <button className="ib" onClick={toggleTheme} aria-label="Toggle theme">{theme==='dark'?<Sun size={17}/>:<Moon size={17}/>}</button>
        <button className="ib ln-cart" onClick={()=>cart.setOpen(true)} aria-label={`Open cart, ${cart.count} items`}><ShoppingBag size={17}/>{cart.count>0&&<i>{cart.count}</i>}</button>
        <Link to="/login" className="tl ln-sign">Sign in</Link>
        <button className="ib ln-burger" onClick={()=>setMenu(true)} aria-label="Open menu"><Menu size={18}/></button>
      </div>
    </header>
    <AnimatePresence>{menu&&<>
      <motion.div key="ov" className="ld-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setMenu(false)}/>
      <motion.aside key="mn" className="ld-panel menu" role="dialog" aria-label="Menu" initial={{x:'100%'}} animate={{x:0}} exit={{x:'100%'}} transition={{type:'tween',duration:.35,ease:[.22,1,.36,1]}}>
        <div className="ld-head"><span className="brand"><Leaf size={18}/><b>T-CARE</b></span><button className="ib" onClick={()=>setMenu(false)} aria-label="Close menu"><X size={17}/></button></div>
        <nav className="menu-links">{C.NAV_LINKS.map(([t,to],i)=><motion.div key={t} initial={{opacity:0,x:24}} animate={{opacity:1,x:0}} transition={{delay:.08+i*.05}}><L to={to} onClick={()=>setMenu(false)}>{t}<ArrowUpRight size={17}/></L></motion.div>)}</nav>
        <div className="menu-foot"><LBtn to="/garden/shop" variant="gold" onClick={()=>setMenu(false)}><Leaf size={15}/>Green Makeover</LBtn><div className="two"><button className="ln-pill ln-store" onClick={app}><Smartphone size={13}/>App Store</button><button className="ln-pill ln-store" onClick={app}><Smartphone size={13}/>Play Store</button></div><LBtn to="/login" variant="ghost" onClick={()=>setMenu(false)}>Sign in</LBtn></div>
      </motion.aside></>}</AnimatePresence>
  </>;
}

/* ---------- hero ---------- */
function Typewriter({phrases}){
  const still=React.useMemo(reduceMotion,[]);const [t,setT]=React.useState(still?phrases[0]:''),[i,setI]=React.useState(0),[del,setDel]=React.useState(false);
  React.useEffect(()=>{if(still)return;const full=phrases[i%phrases.length];let id;
    if(!del&&t===full)id=setTimeout(()=>setDel(true),1700);
    else if(del&&t===''){setDel(false);setI(n=>n+1)}
    else id=setTimeout(()=>setT(del?full.slice(0,t.length-1):full.slice(0,t.length+1)),del?26:52);
    return()=>clearTimeout(id)},[t,del,i,phrases,still]);
  return <span className="typed">{t}<i className="caret"/></span>;
}
function HeroImpl({theme}){
  return <section className="hero2" id="top">
    <div className="h2-copy">
      <motion.span className="h2-pill" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}}><i/>Plant care, made calm</motion.span>
      <p className="h2-typed" aria-label={C.TYPED[0]}><Typewriter phrases={C.TYPED}/></p>
      <h1 className="h2-title"><span className="w"><motion.span style={{display:'inline-block'}} initial={{y:'110%'}} animate={{y:0}} transition={{delay:.2,duration:.8,ease:[.22,1,.36,1]}}>T-Care</motion.span></span></h1>
      <motion.p className="h2-sub" initial={{opacity:0}} animate={{opacity:1}} transition={{delay:.7}}><em>every leaf has a keeper.</em></motion.p>
      <p className="h2-text">Expert gardeners, living care records and gentle reminders — one calm home for every plant you love.</p>
      <div className="h2-cta"><LBtn to="/garden/book" variant="gold">Book a visit <ArrowRight size={15}/></LBtn><LBtn to="/garden/shop" variant="ghost"><Leaf size={15}/>See our services</LBtn></div>
      <ul className="h2-ticks">{C.HERO_TICKS.map(x=><li key={x}><Check size={14}/>{x}</li>)}</ul>
      <div className="h2-stats">{C.HERO_STATS.map(([ic,v,l],k)=>{const I=ICON[ic]||Star;return <motion.div key={l} className="h2-stat" initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} transition={{delay:.9+k*.08}}><I size={14}/><b>{v}</b><span>{l}</span></motion.div>})}</div>
    </div>
    <div className="art"><HeroPlant theme={theme}/>
      <motion.div className="tag t1" animate={{y:[0,-8,0]}} transition={{repeat:Infinity,duration:4}}><Droplets size={16}/>Next watering <b>Today, 6 PM</b></motion.div>
      <motion.div className="tag t2" animate={{y:[0,8,0]}} transition={{repeat:Infinity,duration:5}}><Heart size={16}/>Plant health <b>Thriving 96%</b></motion.div>
      <motion.div className="tag t3" animate={{y:[0,-6,0]}} transition={{repeat:Infinity,duration:6}}><Sun size={16}/>Light <b>Bright · indirect</b></motion.div>
    </div>
  </section>;
}

/* ---------- why choose ---------- */
function WhyChooseImpl(){
  const [i,setI]=React.useState(0),[hold,setHold]=React.useState(false);
  React.useEffect(()=>{if(hold||reduceMotion())return;const id=setInterval(()=>setI(n=>(n+1)%C.WHY.length),4200);return()=>clearInterval(id)},[hold]);
  const s=C.WHY[i];
  return <section className="lsec why" id="about">
    <div className="why-copy"><Head eyebrow="Why T-Care">Why choose <em>T-Care</em>?</Head>
      <p className="lead">Expert home-gardening care that fits around your life, so every plant gets what it needs.</p>
      <ul className="pains">{C.WHY_PAINS.map((x,k)=><Reveal as="li" key={x} delay={k*.08}><span><Check size={13}/></span>{x}</Reveal>)}</ul>
      <LBtn to="/garden/book" variant="gold">Book a first visit <ArrowRight size={15}/></LBtn></div>
    <div className="why-stage" onMouseEnter={()=>setHold(true)} onMouseLeave={()=>setHold(false)}>
      <AnimatePresence mode="wait"><motion.div key={s.kind} className="why-card" initial={{opacity:0,rotate:-9,y:34,scale:.96}} animate={{opacity:1,rotate:-3,y:0,scale:1}} exit={{opacity:0,rotate:3,y:-24}} transition={{duration:.55,ease:[.22,1,.36,1]}}>
        <ShowcaseArt kind={s.kind}/><div className="why-cap"><b>{s.title}</b><span>{s.text}</span></div>
      </motion.div></AnimatePresence>
      <div className="why-dots" role="tablist" aria-label="Highlights">{C.WHY.map((x,k)=><button key={x.kind} role="tab" aria-selected={k===i} aria-label={x.title} className={k===i?'on':''} onClick={()=>setI(k)}/>)}</div>
      <div className="why-badge"><b>4.9/5</b><span>User satisfaction</span></div>
    </div>
  </section>;
}

/* ---------- what every visit includes ---------- */
function IncludedImpl(){
  return <section className="lsec incl"><Head center eyebrow="Every visit includes" sub="One expert visit covers everything below.">Care that goes <em>beyond watering</em></Head>
    <div className="incl-grid">{C.INCLUDED.map(([ic,t,d],i)=>{const I=ICON[ic];return <Reveal key={t} delay={i*.06} className="incl-card"><span className="ic"><I size={20}/></span><h3>{t}</h3><p>{d}</p></Reveal>})}</div></section>;
}

/* ---------- three steps ---------- */
function StepsImpl(){
  return <section className="lsec steps2" id="how"><Head center eyebrow="How it works">Three quiet <em>steps.</em></Head>
    <div className="steps2-grid">{C.STEPS.map(([ic,t,d],i)=>{const I=ICON[ic];return <Reveal key={t} delay={i*.1} className={'step-card'+(i===1?' dark':'')}><span className="step-pill"><i/>Step 0{i+1}</span><span className="step-ic"><I size={22}/></span><h3>{t}</h3><p>{d}</p></Reveal>})}</div></section>;
}

/* ---------- not sure which service ---------- */
export function ServiceBanner({services}){
  const rows=[['Plant Care','Routine care, pruning and nourishment','Popular'],['Maintenance','Reliable recurring care for your collection','Best value'],['Plant Setup','Create a healthy green space from scratch','Custom']];
  return <section className="lsec nsure"><Reveal className="nsure-card">
    <div><h2>Not sure where <em>to start?</em></h2><p>Explore all {services.length} services, compare what each one covers and find the right fit before you book.</p></div>
    <div className="nsure-side"><div className="nsure-rows">{rows.map(([t,d,b])=><div key={t}><i/><div><b>{t}</b><span>{d}</span></div><em>{b}</em></div>)}</div>
      <div className="nsure-cta"><LBtn to="/garden/shop" variant="mint">See all {services.length} services <ArrowRight size={15}/></LBtn><LBtn to="/garden/book" variant="glass">Book a visit</LBtn></div></div>
  </Reveal></section>;
}

/* ---------- plans ---------- */
export function Plans(){
  return <section className="lsec plans" id="plans"><Head center eyebrow="Plans & pricing">Care plans that <em>grow with you</em></Head>
    <div className="plan-grid">{C.PLANS.map((p,i)=><Reveal key={p.id} delay={i*.08} className={'plan'+(p.dark?' dark':'')}>
      <small>{p.tag}</small><h3>{p.name}</h3><p>{p.blurb}</p>
      {p.features.length>0&&<ul>{p.features.map(f=><li key={f}><Leaf size={13}/>{f}</li>)}</ul>}
      <div className="plan-price"><b>{money(p.price)}</b><span>{p.per}</span></div>
      <LBtn to={p.to} variant={p.dark?'gold':'dark'} full>{p.cta} <ArrowRight size={14}/></LBtn></Reveal>)}</div>
    <div className="plan-more"><LBtn to="/garden/plan" variant="outline">Explore subscriptions</LBtn></div></section>;
}

/* ---------- mid-page call to action ---------- */
function CtaCardImpl({toast}){
  return <section className="lsec cta1"><Reveal className="cta-card"><Leaf className="cta-leaf a" size={120} strokeWidth={.8}/><Leaf className="cta-leaf b" size={80} strokeWidth={.8}/>
    <h2>Ready for happier, <em>healthier plants?</em></h2><p>Book a visit in minutes and let a verified gardener take it from there.</p>
    <div className="cta-btns"><LBtn to="/garden/book" variant="gold">Book now <ArrowRight size={15}/></LBtn><WaBtn toast={toast} variant="outline">Chat with us</WaBtn></div></Reveal></section>;
}
function WaBtn({toast,children,variant='outline'}){
  const href=C.WHATSAPP_NUMBER?`https://wa.me/${C.WHATSAPP_NUMBER}`:null;
  return href?<a className={`lb lb-${variant}`} href={href} target="_blank" rel="noreferrer"><MessageCircle size={15}/>{children}</a>
    :<button type="button" className={`lb lb-${variant}`} onClick={()=>toast?.('Add your WhatsApp number in landing/content.js to enable chat.')}><MessageCircle size={15}/>{children}</button>;
}

/* ---------- real transformations ---------- */
export function Transformations(){
  const [i,setI]=React.useState(0),[hold,setHold]=React.useState(false);
  React.useEffect(()=>{if(hold||reduceMotion())return;const id=setInterval(()=>setI(n=>(n+1)%C.TRANSFORMS.length),5200);return()=>clearInterval(id)},[hold]);
  const t=C.TRANSFORMS[i];
  return <section className="trans" id="makeover"><div className="trans-in">
    <div className="trans-media" onMouseEnter={()=>setHold(true)} onMouseLeave={()=>setHold(false)}>
      <AnimatePresence initial={false}><motion.div key={t.id} className="trans-scene" initial={{opacity:0,scale:1.07}} animate={{opacity:1,scale:1}} exit={{opacity:0}} transition={{duration:.9,ease:[.22,1,.36,1]}}><TransformScene id={t.id}/></motion.div></AnimatePresence>
      <span className="trans-chip">{t.chip}</span>
      <div className="trans-dots">{C.TRANSFORMS.map((x,k)=><button key={x.id} aria-label={x.tab} className={k===i?'on':''} onClick={()=>setI(k)}/>)}</div>
      <div className="trans-thumbs">{C.TRANSFORMS.map((x,k)=><button key={x.id} className={k===i?'on':''} onClick={()=>setI(k)}><span className="thumb-art"><TransformScene id={x.id}/></span><em>{x.tab}</em></button>)}</div>
    </div>
    <div className="trans-copy"><h2>Spaces, <em>reimagined</em></h2><p>See how plants change a balcony, a living room or a terrace — one thoughtful makeover at a time.</p><i className="trans-rule"/><span className="trans-note"><Check size={13}/>Makeovers from ₹3,499</span><LBtn to="/garden/shop" variant="light">See makeover options <ArrowRight size={15}/></LBtn></div>
  </div></section>;
}

/* ---------- brand story ---------- */
export function Story(){
  return <section className="lsec story"><div className="story-copy"><Head eyebrow="Our story">Plant care that feels <em>personal</em></Head>
      <h3><Sun size={20}/>Why we exist</h3><p>Good plant care shouldn’t depend on luck or free weekends. Our gardeners bring skill, patience and a clear record of every visit, so you always know how your plants are doing and what they need next.</p></div>
    <div className="values">{C.STORY_VALUES.map(([ic,t,d],i)=>{const I=ICON[ic];return <Reveal key={t} delay={i*.07} className="value"><I size={20}/><b>{t}</b><p>{d}</p></Reveal>})}</div></section>;
}

/* ---------- scrolling rows (store + reviews) ---------- */
function Row({children,label}){
  const ref=React.useRef(null);const go=d=>ref.current?.scrollBy({left:d*ref.current.clientWidth*.8,behavior:'smooth'});
  return <div className="row-wrap"><button className="row-arrow l" onClick={()=>go(-1)} aria-label={`Previous ${label}`}><ChevronLeft size={17}/></button><div className="row-track" ref={ref} tabIndex={0} aria-label={label}>{children}</div><button className="row-arrow r" onClick={()=>go(1)} aria-label={`Next ${label}`}><ChevronRight size={17}/></button></div>;
}
export function Market({cart}){
  return <section className="lsec market" id="market"><div className="lsec-top"><Head eyebrow="T-Care market" sub="Healthy plants, handsome pots and everyday essentials.">Everything your <em>plants</em> need</Head><LBtn to="/garden/shop" variant="outline">Explore marketplace</LBtn></div>
    <Row label="products">{C.PRODUCTS.map(p=><article className="pcard" key={p.id}><span className="off">{p.off}% OFF</span><div className="pimg"><ProductSvg kind={p.kind} pot={p.pot}/></div><div className="pbody"><small>{p.cat}</small><h4>{p.name}</h4><div className="pfoot"><div><b>{money(p.price)}</b><s>{money(p.mrp)}</s></div><button className="add" onClick={()=>cart.add(p)}>Add to Cart</button></div></div></article>)}</Row></section>;
}
function ReviewsImpl(){
  return <section className="lsec reviews"><Head center eyebrow="Kind words">Loved by <em>plant parents in Ahmedabad</em></Head>
    <Row label="reviews">{C.REVIEWS.map(r=><figure className="review" key={r.n}><div className="stars" aria-label={`${r.s} out of 5`}>{[0,1,2,3,4].map(k=><Star key={k} size={13} className={k<r.s?'on':''}/>)}</div><blockquote>“{r.t}”</blockquote><figcaption><span className="av">{r.n[0]}</span><div><b>{r.n}</b><small>{r.a}</small></div></figcaption></figure>)}</Row></section>;
}

/* ---------- final call to action + footer ---------- */
function FinalCtaImpl({toast}){
  return <section className="lsec cta2"><Reveal className="cta2-card"><div><span className="eyebrow">Let’s get growing</span><h2>Give your plants a <em>happier home</em></h2></div><div className="cta-btns"><LBtn to="/garden/book" variant="gold">Book now <ArrowRight size={15}/></LBtn><WaBtn toast={toast} variant="outline">WhatsApp us</WaBtn></div></Reveal></section>;
}
function SiteFooterImpl({toast}){
  return <footer className="lfoot"><div className="lfoot-top">
    <div className="lfoot-brand"><span className="brand"><Leaf size={22}/><b>T-CARE</b></span><p>Plant care, thoughtfully delivered. Verified gardeners, living care records and gentle reminders.</p>
      <div className="socials">{Object.entries(Social).map(([k,v])=><button key={k} onClick={()=>toast?.('Social links go live once your accounts are added.')} aria-label={k}>{v}</button>)}<button onClick={()=>toast?.('Add your WhatsApp number in landing/content.js to enable chat.')} aria-label="whatsapp"><MessageCircle size={17}/></button></div></div>
    <div className="lfoot-cols">{C.FOOTER_COLS.map(([h,ls])=><div key={h}><h5>{h}</h5>{ls.map(([t,to])=><L key={t} to={to} toast={toast}>{t}</L>)}</div>)}</div></div>
    <div className="lfoot-bot"><span>© {new Date().getFullYear()} T-Care. All rights reserved.</span><span>Made with care for plants and the people who love them.</span></div></footer>;
}

/* ---------- floating WhatsApp button ---------- */
function WhatsAppFabImpl({toast}){
  const href=C.WHATSAPP_NUMBER?`https://wa.me/${C.WHATSAPP_NUMBER}`:null;
  const inner=<><i className="fab-ring"/><MessageCircle size={26}/></>;
  return href?<a className="fab" href={href} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp">{inner}</a>
    :<button className="fab" onClick={()=>toast?.('Add your WhatsApp number in landing/content.js to enable chat.')} aria-label="Chat on WhatsApp">{inner}</button>;
}


/* shared building blocks reused by the standalone pages (landing/Pages.jsx) */
export {L,LBtn,Reveal,Head,ICON,money,Row,WaBtn};

/* Memoised exports: these sections only depend on `theme`/`toast` (both referentially stable), so cart/toast/plant
   context updates no longer re-render the whole landing tree (incl. the large HeroPlant SVG). */
export const Hero=React.memo(HeroImpl);
export const WhyChoose=React.memo(WhyChooseImpl);
export const Included=React.memo(IncludedImpl);
export const Steps=React.memo(StepsImpl);
export const CtaCard=React.memo(CtaCardImpl);
export const Reviews=React.memo(ReviewsImpl);
export const FinalCta=React.memo(FinalCtaImpl);
export const SiteFooter=React.memo(SiteFooterImpl);
export const WhatsAppFab=React.memo(WhatsAppFabImpl);
