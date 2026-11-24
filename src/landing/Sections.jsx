import React from 'react';
import {motion,AnimatePresence} from 'framer-motion';
import {Link} from 'react-router-dom';
import {Leaf,ArrowRight,ArrowUpRight,Check,Star,MapPin,CalendarDays,Droplets,Scissors,ShieldCheck,Sprout,Stethoscope,Bug,Sun,Moon,Menu,X,ShoppingBag,MessageCircle,Heart,ChevronLeft,ChevronRight,Minus,Plus,Trash2,UserRound,Phone,Mail} from 'lucide-react';
import HeroPlant from '../HeroPlant.jsx';
import {ProductSvg,ShowcaseArt,TransformScene} from './Scenes.jsx';
import * as C from './content.js';
import { usePublicList } from './publicData.js';
import { parseCustomerCart } from '../cartStorage.js';
import './landing.css';

/* ---------- small helpers ---------- */
const money=n=>'₹'+Number(n||0).toLocaleString('en-IN');
const L=({to,children,className,onClick})=>to.startsWith('#')
  ?<a href={to} className={className} onClick={onClick}>{children}</a>
  :<Link to={to} className={className} onClick={onClick}>{children}</Link>;
const LBtn=({to,children,variant='gold',onClick,full})=>{const c=`lb lb-${variant}${full?' full':''}`;return to?<L to={to} className={c} onClick={onClick}>{children}</L>:<button type="button" className={c} onClick={onClick}>{children}</button>};
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
export function useCart(toast,authReady,customerId){
  const [items,setItems]=React.useState([]),[open,setOpen]=React.useState(false);
  const [loadedCustomerId,setLoadedCustomerId]=React.useState(null);
  const storageWarningShown=React.useRef(false);

  React.useEffect(()=>{
    if(!authReady)return;
    try{localStorage.removeItem('tcare-cart')}catch{}
    if(typeof customerId!=='string'||!customerId){
      setItems([]);
      setOpen(false);
      setLoadedCustomerId(null);
      try{localStorage.removeItem('tcare-cart-v2')}catch{}
      return;
    }
    let restored=[];
    try{restored=parseCustomerCart(localStorage.getItem('tcare-cart-v2'),customerId)}catch{}
    setItems(restored);
    setOpen(false);
    setLoadedCustomerId(customerId);
  },[authReady,customerId]);

  React.useEffect(()=>{
    if(!authReady)return;
    try{localStorage.removeItem('tcare-cart')}catch{}
    if(typeof customerId!=='string'||!customerId){
      try{localStorage.removeItem('tcare-cart-v2')}catch{}
      return;
    }
    if(loadedCustomerId!==customerId)return;
    try{
      localStorage.setItem('tcare-cart-v2',JSON.stringify({customerId,items}));
      storageWarningShown.current=false;
    }catch{
      if(!storageWarningShown.current){
        storageWarningShown.current=true;
        toast?.('Your cart could not be saved in this browser.',{type:'warning'});
      }
    }
  },[items,toast,authReady,customerId,loadedCustomerId]);

  const isCustomerReady=authReady&&typeof customerId==='string'&&Boolean(customerId)&&loadedCustomerId===customerId;
  const add=React.useCallback(p=>{
    if(!isCustomerReady){toast?.('Sign in with a Customer account before adding products to your cart.',{type:'warning'});return;}
    setItems(a=>{
      const existing=a.find(x=>x.id===p.id);
      if(existing&&existing.qty>=20){toast?.('Maximum quantity per product is 20.',{type:'warning'});return a;}
      return existing?a.map(x=>x.id===p.id?{...x,qty:Math.min(20,x.qty+1),name:p.name,price:p.price}:x):[...a,{id:p.id,name:p.name,price:p.price,kind:p.kind,pot:p.pot,qty:1}];
    });
    toast?.('Added to cart');
  },[isCustomerReady,toast]);
  const setQty=React.useCallback((id,q)=>{
    if(!isCustomerReady)return;
    setItems(a=>q<=0?a.filter(x=>x.id!==id):a.map(x=>x.id===id?{...x,qty:Math.min(20,q)}:x));
  },[isCustomerReady]);
  const clear=React.useCallback(()=>setItems([]),[]);
  const setCartOpen=React.useCallback(value=>{
    const next=typeof value==='function'?Boolean(value(open)):Boolean(value);
    if(next&&!isCustomerReady){toast?.('Sign in with a Customer account to open your cart.',{type:'warning'});return;}
    setOpen(next);
  },[open,isCustomerReady,toast]);
  return React.useMemo(()=>({items,add,setQty,clear,open,setOpen:setCartOpen,customerReady:isCustomerReady,count:items.reduce((n,x)=>n+x.qty,0),total:items.reduce((n,x)=>n+x.qty*x.price,0)}),[items,add,setQty,clear,open,setCartOpen,isCustomerReady]);
}
export function CartDrawer({cart,authUser}){
  React.useEffect(()=>{if(cart.open&&authUser?.role!=='CUSTOMER')cart.setOpen(false)},[cart.open,authUser?.id,authUser?.role,cart.setOpen]);
  React.useEffect(()=>{if(!cart.open)return;const k=e=>e.key==='Escape'&&cart.setOpen(false);addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[cart.open]);
  return <AnimatePresence>{cart.open&&<>
    <motion.div key="ov" className="ld-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>cart.setOpen(false)}/>
    <motion.aside key="cd" className="ld-panel cart" role="dialog" aria-label="Shopping cart" initial={{x:'100%'}} animate={{x:0}} exit={{x:'100%'}} transition={{type:'tween',duration:.35,ease:[.22,1,.36,1]}}>
      <div className="ld-head"><h3>Your cart <small>({cart.count})</small></h3><button className="ib" onClick={()=>cart.setOpen(false)} aria-label="Close cart"><X size={17}/></button></div>
      {cart.items.length?<>
        <div className="cart-list">{cart.items.map(x=><div className="cart-item" key={x.id}><div className="ci-art"><ProductSvg kind={x.kind} pot={x.pot}/></div><div><b>{x.name}</b><span>{money(x.price)}</span><div className="qty"><button type="button" onClick={()=>cart.setQty(x.id,x.qty-1)} aria-label={`Decrease quantity of ${x.name}`}><Minus size={13}/></button><i aria-live="polite">{x.qty}</i><button type="button" onClick={()=>cart.setQty(x.id,x.qty+1)} disabled={x.qty>=20} aria-label={`Increase quantity of ${x.name}`} title={x.qty>=20?"Maximum quantity is 20":"Increase quantity"}><Plus size={13}/></button></div></div><button className="ci-x" onClick={()=>cart.setQty(x.id,0)} aria-label="Remove"><Trash2 size={15}/></button></div>)}</div>
        <div className="cart-foot"><div><span>Subtotal</span><b>{money(cart.total)}</b></div><p className="cart-unavailable" role="status">Final price and stock are verified securely at checkout. Your cart is saved in this browser.</p><Link className="lb lb-gold full" to="/store/checkout" onClick={()=>cart.setOpen(false)}>Proceed to checkout <ArrowRight size={15}/></Link><button className="tl" onClick={()=>cart.setOpen(false)}>Keep browsing</button></div>
      </>:<div className="cart-empty"><ShoppingBag size={34}/><p>Your cart is empty.</p><LBtn variant="gold" to="#market" onClick={()=>cart.setOpen(false)}>Browse the market</LBtn></div>}
    </motion.aside></>}</AnimatePresence>;
}

/* ---------- navigation ---------- */
export function LandingNav({theme,toggleTheme,cart,authUser,logout,onCartClick}){
  const [menu,setMenu]=React.useState(false);
  const [accountOpen,setAccountOpen]=React.useState(false);
  const accountRef=React.useRef(null);
  React.useEffect(()=>{if(!menu)return;const k=e=>e.key==='Escape'&&setMenu(false);addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[menu]);
  React.useEffect(()=>{
    if(!accountOpen)return;
    const onPointerDown=event=>{if(!accountRef.current?.contains(event.target))setAccountOpen(false)};
    const onKeyDown=event=>{if(event.key==='Escape')setAccountOpen(false)};
    addEventListener('pointerdown',onPointerDown);
    addEventListener('keydown',onKeyDown);
    return()=>{removeEventListener('pointerdown',onPointerDown);removeEventListener('keydown',onKeyDown)};
  },[accountOpen]);
  const workspace=authUser?.role==='ADMIN'?'/hq':authUser?.role==='GARDENER'?'/crew':'/garden';
  const profile=authUser?.role==='ADMIN'?'/hq':authUser?.role==='GARDENER'?'/crew/me':'/garden/me';
  const initials=(authUser?.fullName||'').trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()||'').join('');
  const signOut=async()=>{await logout?.();setAccountOpen(false);setMenu(false)};
  return <>
    <header className="lnav2">
      <Link to="/" className="brand" aria-label="T-CARE home"><img className="brand-mark" src="/brand/t-care-mark.png" width="30" height="38" alt=""/><b>T-CARE</b></Link>
      <nav className="ln-links" aria-label="Main">{C.NAV_LINKS.map(([t,to])=><L key={t} to={to}>{t}</L>)}</nav>
      <div className="ln-right">
        <Link to="/makeover" className="ln-pill ln-green"><Leaf size={13}/>Green Makeover</Link>
        <button className="ib" onClick={toggleTheme} aria-label="Toggle theme">{theme==='dark'?<Sun size={17}/>:<Moon size={17}/>}</button>
        <button className="ib ln-cart" onClick={onCartClick||(()=>cart.setOpen(true))} aria-label={authUser?.role==='CUSTOMER'?`Open cart, ${cart.count} items`:'Sign in with a Customer account to use the cart'} title={authUser?.role==='CUSTOMER'?'Open cart':'Customer sign-in required'}><ShoppingBag size={17}/>{authUser?.role==='CUSTOMER'&&cart.count>0&&<i>{cart.count}</i>}</button>
        {authUser
          ? <div className="ln-account" ref={accountRef}>
              <button className="ln-profile" type="button" aria-label={`Account options for ${authUser.fullName||'your account'}`} aria-expanded={accountOpen} onClick={()=>setAccountOpen(value=>!value)}>{initials||<UserRound size={17}/>}</button>
              <AnimatePresence>{accountOpen&&<motion.div className="ln-account-menu" initial={{opacity:0,y:8,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:6,scale:.98}}>
                <strong>{authUser.fullName||'Your account'}</strong><small>{authUser.email}</small>
                <Link to={workspace} onClick={()=>setAccountOpen(false)}>Open workspace</Link>
                <Link to={profile} onClick={()=>setAccountOpen(false)}>{authUser.role==='ADMIN'?'Admin overview':'Profile'}</Link>
                <Link to={`${workspace}/security`} onClick={()=>setAccountOpen(false)}>Security & password</Link>
                <button type="button" onClick={signOut}>Sign out</button>
              </motion.div>}</AnimatePresence>
            </div>
          : <Link to="/login" className="tl ln-sign">Sign in</Link>}
        <button className="ib ln-burger" onClick={()=>setMenu(true)} aria-label="Open menu"><Menu size={18}/></button>
      </div>
    </header>
    <AnimatePresence>{menu&&<>
      <motion.div key="ov" className="ld-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setMenu(false)}/>
      <motion.aside key="mn" className="ld-panel menu" role="dialog" aria-label="Menu" initial={{x:'100%'}} animate={{x:0}} exit={{x:'100%'}} transition={{type:'tween',duration:.35,ease:[.22,1,.36,1]}}>
        <div className="ld-head"><Link to="/" className="brand" aria-label="T-CARE home"><img className="brand-mark" src="/brand/t-care-mark.png" width="30" height="38" alt=""/><b>T-CARE</b></Link><button className="ib" onClick={()=>setMenu(false)} aria-label="Close menu"><X size={17}/></button></div>
        <nav className="menu-links">{C.NAV_LINKS.map(([t,to],i)=><motion.div key={t} initial={{opacity:0,x:24}} animate={{opacity:1,x:0}} transition={{delay:.08+i*.05}}><L to={to} onClick={()=>setMenu(false)}>{t}<ArrowUpRight size={17}/></L></motion.div>)}</nav>
        <div className="menu-foot">
          <LBtn to="/makeover" variant="gold" onClick={()=>setMenu(false)}><Leaf size={15}/>Green Makeover</LBtn>
          {authUser
            ? <><LBtn to={workspace} variant="ghost" onClick={()=>setMenu(false)}>Open workspace</LBtn><LBtn to={profile} variant="ghost" onClick={()=>setMenu(false)}>{authUser.role==='ADMIN'?'Admin overview':'Profile'}</LBtn><LBtn to={`${workspace}/security`} variant="ghost" onClick={()=>setMenu(false)}>Security & password</LBtn><button className="lb lb-ghost" type="button" onClick={signOut}>Sign out</button></>
            : <><LBtn to="/login" variant="ghost" onClick={()=>setMenu(false)}>Sign in</LBtn><LBtn to="/register" variant="outline" onClick={()=>setMenu(false)}>Create account</LBtn></>}
        </div>
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
      <p className="h2-text">Book plant-care visits, manage your plants and keep service reports in one place.</p>
      <div className="h2-cta"><LBtn to="/garden/book" variant="gold">Book a visit <ArrowRight size={15}/></LBtn><LBtn to="/services" variant="ghost"><Leaf size={15}/>See our services</LBtn></div>
      <ul className="h2-ticks">{C.HERO_TICKS.map(x=><li key={x}><Check size={14}/>{x}</li>)}</ul>
      <div className="h2-stats">{C.HERO_STATS.map(([ic,v,l],k)=>{const I=ICON[ic]||Star;return <motion.div key={l} className="h2-stat" initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} transition={{delay:.9+k*.08}}><I size={14}/><b>{v}</b><span>{l}</span></motion.div>})}</div>
    </div>
    <div className="art"><HeroPlant theme={theme}/>
      <motion.div className="tag t1" animate={{y:[0,-8,0]}} transition={{repeat:Infinity,duration:4}}><Droplets size={16}/>Care notes <b>After each visit</b></motion.div>
      <motion.div className="tag t2" animate={{y:[0,8,0]}} transition={{repeat:Infinity,duration:5}}><Heart size={16}/>Plant health <b>Tracked in your account</b></motion.div>
      <motion.div className="tag t3" animate={{y:[0,-6,0]}} transition={{repeat:Infinity,duration:6}}><Sun size={16}/>Care tips <b>For each plant</b></motion.div>
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
      <p className="lead">Book plant-care visits and keep each plant’s details and service notes together.</p>
      <ul className="pains">{C.WHY_PAINS.map((x,k)=><Reveal as="li" key={x} delay={k*.08}><span><Check size={13}/></span>{x}</Reveal>)}</ul>
      <LBtn to="/garden/book" variant="gold">Book a first visit <ArrowRight size={15}/></LBtn></div>
    <div className="why-stage" onMouseEnter={()=>setHold(true)} onMouseLeave={()=>setHold(false)}>
      <AnimatePresence mode="wait"><motion.div key={s.kind} className="why-card" initial={{opacity:0,rotate:-9,y:34,scale:.96}} animate={{opacity:1,rotate:-3,y:0,scale:1}} exit={{opacity:0,rotate:3,y:-24}} transition={{duration:.55,ease:[.22,1,.36,1]}}>
        <ShowcaseArt kind={s.kind}/><div className="why-cap"><b>{s.title}</b><span>{s.text}</span></div>
      </motion.div></AnimatePresence>
      <div className="why-dots" role="tablist" aria-label="Highlights">{C.WHY.map((x,k)=><button key={x.kind} role="tab" aria-selected={k===i} aria-label={x.title} className={k===i?'on':''} onClick={()=>setI(k)}/>)}</div>
      <div className="why-badge"><b>Care records</b><span>For your plant collection</span></div>
    </div>
  </section>;
}

/* ---------- what every visit includes ---------- */
function IncludedImpl(){
  return <section className="lsec incl"><Head center eyebrow="Care areas" sub="What’s included depends on the service you book.">Thoughtful care for <em>your plants</em></Head>
    <div className="incl-grid">{C.INCLUDED.map(([ic,t,d],i)=>{const I=ICON[ic];return <Reveal key={t} delay={i*.06} className="incl-card"><span className="ic"><I size={20}/></span><h3>{t}</h3><p>{d}</p></Reveal>})}</div></section>;
}

/* ---------- three steps ---------- */
function StepsImpl(){
  return <section className="lsec steps2" id="how"><Head center eyebrow="How bookings work">Three clear <em>steps.</em></Head>
    <div className="steps2-grid">{C.STEPS.map(([ic,t,d],i)=>{const I=ICON[ic];return <Reveal key={t} delay={i*.1} className={'step-card'+(i===1?' dark':'')}><span className="step-pill"><i/>Step 0{i+1}</span><span className="step-ic"><I size={22}/></span><h3>{t}</h3><p>{d}</p></Reveal>})}</div></section>;
}

/* ---------- not sure which service ---------- */
export function ServiceBanner({services=[]}){
  const {items:popular,loading,error,retry}=usePublicList('/services/popular?range=30d','services');
  if(!loading&&!error&&!popular.length)return null;
  return <section className="lsec nsure"><Reveal className="nsure-card">
    <div><h2>Popular with <em>plant parents</em></h2><p>These are the most-booked services from the past 30 days.</p></div>
    <div className="nsure-side">
      {loading&&!popular.length?<div className="public-state">Loading popular services…</div>:null}
      {error&&!popular.length?<div className="public-state" role="alert"><p>Popular services are temporarily unavailable.</p><button className="tl" onClick={retry}>Try again</button></div>:null}
      {!!popular.length&&<div className="nsure-rows">{popular.slice(0,3).map(item=><div key={item.id}><i/><div><b>{item.name}</b><span>{item.description}</span></div><em>{item.bookingCount} bookings</em></div>)}</div>}
      <div className="nsure-cta"><LBtn to="/services" variant="mint">Browse care services <ArrowRight size={15}/></LBtn><LBtn to="/garden/book" variant="glass">Book a visit</LBtn></div>
    </div>
  </Reveal></section>;
}

/* ---------- plans ---------- */
function PublicPlanDetails({ plan }) {
  const services = plan.includedServices || [];
  const benefits = plan.benefits || [];
  const limitations = plan.limitations || [];
  return <div className="plan-details">
    <div className="plan-facts">
      <div><span>Service frequency</span><b>{plan.serviceFrequency || 'Not configured'}</b></div>
      <div><span>Plant limit</span><b>{plan.plantLimit == null ? 'No stated limit' : `Up to ${plan.plantLimit} plants`}</b></div>
    </div>
    <div className="plan-detail-group">
      <b>Included services</b>
      {services.length ? <ul>{services.map(service => <li key={service.id}><span><b>{service.name}</b>{service.description && <em>{service.description}</em>}</span>{service.durationLabel && <small>{service.durationLabel}</small>}</li>)}</ul> : <p className="plan-detail-empty">Included services are being confirmed.</p>}
    </div>
    {benefits.length > 0 && <div className="plan-detail-group"><b>Benefits</b><ul>{benefits.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}
    {limitations.length > 0 && <div className="plan-detail-group"><b>Limitations</b><ul>{limitations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}
    <div className="plan-renewal-note">
      {plan.planType === 'ONE_TIME_SERVICE'
        ? 'One-time payment. This plan does not renew automatically.'
        : plan.autoRenew
          ? 'Automatic renewal through UPI AutoPay requires your explicit mandate approval. Cancel the mandate in your UPI app to stop future renewals; paid benefits remain available until the paid-through date.'
          : 'Existing billing terms apply. Contact T-CARE before choosing this legacy plan.'}
    </div>
    {plan.autoRenew && !plan.upiAutopayEligible && <p className="plan-warning">This plan is not currently eligible for UPI AutoPay at its listed amount. It cannot be purchased as an automatic-renewal plan.</p>}
  </div>;
}

export function Plans(){
  const {items:plans,loading,error,retry}=usePublicList('/subscriptions/plans','plans');
  return <section className="lsec plans" id="plans"><Head center eyebrow="Plans & pricing">Care plans that <em>grow with you</em></Head>
    {loading&&!plans.length?<div className="public-state" role="status">Loading plans…</div>:null}
    {error&&!plans.length?<div className="public-state" role="alert"><p>Plans are temporarily unavailable.</p><button type="button" className="tl" onClick={retry}>Try again</button></div>:null}
    {!loading&&!error&&!plans.length?<div className="public-state"><p>No plans are available right now.</p><div className="public-state-actions"><LBtn to="/services" variant="dark">Browse care services <ArrowRight size={14}/></LBtn><LBtn to="/contact" variant="outline">Contact T-Care</LBtn></div></div>:null}
    {!!plans.length&&<div className="plan-grid">{plans.map((p,i)=><Reveal key={p.id} delay={i*.08} className={'plan'+(i===1?' dark':'')}>
      <div className="plan-topline"><small>{p.planTypeLabel || 'Care plan'}</small>{p.autoRenew && <span className="plan-auto-tag">Auto-renew</span>}</div>
      <h3>{p.name}</h3>{p.description&&<p>{p.description}</p>}
      <PublicPlanDetails plan={p}/>
      <div className="plan-price"><b>{money(p.price)}</b><span>/ {p.planType === 'ONE_TIME_SERVICE' ? 'one-time' : p.billingCycle}</span></div>
      <LBtn to="/garden/plan" variant={i===1?'gold':'dark'} full>View plan details <ArrowRight size={14}/></LBtn>
    </Reveal>)}</div>}
    <p className="catalog-note">Recurring plans renew only after you approve a UPI AutoPay mandate. Cancelling that mandate stops future renewals; benefits already paid for continue until the paid-through date.</p>
    <div className="plan-more"><LBtn to="/garden/plan" variant="outline">Open your subscription account</LBtn></div></section>;
}

function WaBtn({children,variant='outline'}){
  const href=/^[1-9]\d{7,14}$/.test(C.WHATSAPP_NUMBER)?`https://wa.me/${C.WHATSAPP_NUMBER}?text=${encodeURIComponent('Hello T-Care, I would like to know more about your plant care services.')}`:null;
  return href?<a className={`lb lb-${variant}`} href={href} target="_blank" rel="noopener noreferrer"><MessageCircle size={15}/>{children}</a>:null;
}

/* ---------- illustrative makeover concepts ---------- */
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
    <div className="trans-copy"><h2>Spaces, <em>reimagined</em></h2><p>Explore plant ideas for a balcony, indoor corner or terrace.</p><i className="trans-rule"/><span className="trans-note"><Check size={13}/>Illustrative concepts</span><LBtn to="/services" variant="light">See makeover options <ArrowRight size={15}/></LBtn></div>
  </div></section>;
}

/* ---------- brand story ---------- */
export function Story(){
  return <section className="lsec story"><div className="story-copy"><Head eyebrow="Our story">Plant care that feels <em>personal</em></Head>
      <h3><Sun size={20}/>Why we exist</h3><p>Plant care takes time and attention. T-CARE helps you find services, request visits and keep plant details and service notes together.</p></div>
    <div className="values">{C.STORY_VALUES.map(([ic,t,d],i)=>{const I=ICON[ic];return <Reveal key={t} delay={i*.07} className="value"><I size={20}/><b>{t}</b><p>{d}</p></Reveal>})}</div></section>;
}

/* ---------- scrolling rows (store + reviews) ---------- */
function Row({children,label}){
  const ref=React.useRef(null);const go=d=>ref.current?.scrollBy({left:d*ref.current.clientWidth*.8,behavior:'smooth'});
  return <div className="row-wrap"><button className="row-arrow l" onClick={()=>go(-1)} aria-label={`Previous ${label}`}><ChevronLeft size={17}/></button><div className="row-track" ref={ref} tabIndex={0} aria-label={label}>{children}</div><button className="row-arrow r" onClick={()=>go(1)} aria-label={`Next ${label}`}><ChevronRight size={17}/></button></div>;
}
export function Market({cart,authUser,authReady=true,onRequireCustomer}){
  const {items:products,loading,error,retry}=usePublicList('/products?limit=100','products');
  const requireCustomer=returnTo=>typeof onRequireCustomer==='function'&&onRequireCustomer(returnTo);
  return <section className="lsec market" id="market"><div className="lsec-top"><Head eyebrow="T-Care market" sub="Browse plants and gardening essentials available in the store.">Everything your <em>plants</em> need</Head><LBtn to="/store" variant="outline">Open plant store</LBtn></div>
    {loading&&!products.length?<div className="public-state public-loading" role="status" aria-live="polite" aria-busy="true"><span>Loading products…</span><div className="public-product-skeletons" aria-hidden="true">{Array.from({length:4},(_,i)=><i key={i}/>)}</div></div>:null}
    {error&&!products.length?<div className="public-state" role="alert"><p>Plant catalogue is temporarily unavailable.</p><button className="tl" onClick={retry}>Try again</button></div>:null}
    {!loading&&!error&&!products.length?<div className="public-state"><p>No products are available right now.</p><div className="public-state-actions"><LBtn to="/services" variant="dark">Explore care services <ArrowRight size={14}/></LBtn></div></div>:null}
    {!!products.length&&<Row label="products">{products.slice(0,8).map(p=><article className="pcard" key={p.id}><ProductArt product={p}/><div className="pbody"><small>{p.category}</small><h4>{p.name}</h4><div className="pfoot"><div><b>{money(p.price)}</b>{p.compareAtPrice>p.price&&<s>{money(p.compareAtPrice)}</s>}</div><button className="add" type="button" disabled={p.stockQuantity<=0||(authUser?.role==='CUSTOMER'&&!cart.customerReady)} onClick={()=>{if(requireCustomer('/store'))cart.add({...p,kind:p.kind||'snake',pot:p.potColor||'#e8e1d2'});}}>{p.stockQuantity>0?(authUser?.role==='CUSTOMER'?(cart.customerReady?'Add to Cart':'Preparing cart…'):(authReady?'Sign in to add':'Checking…')):'Out of stock'}</button></div></div></article>)}</Row>}
  </section>;
}

export function ProductArt({product}){
  const [failed,setFailed]=React.useState(false);
  return <div className="pimg">{product.imageUrl&&!failed?<img src={product.imageUrl} alt={product.name} loading="lazy" onError={()=>setFailed(true)}/>:<ProductSvg kind={product.kind||'snake'} pot={product.potColor||'#e8e1d2'}/>}</div>;
}
function ReviewsImpl(){
  const {items:reviews,loading,error,retry}=usePublicList('/reviews-issues/public','reviews');
  return <section className="lsec reviews"><Head center eyebrow="Published customer feedback">Experiences shared by <em>T-Care customers</em></Head>
    {loading&&!reviews.length?<div className="public-state">Loading published reviews…</div>:null}
    {error&&!reviews.length?<div className="public-state" role="alert"><p>Published reviews are temporarily unavailable.</p><button className="tl" onClick={retry}>Try again</button></div>:null}
    {!loading&&!error&&!reviews.length?<div className="public-state"><p>No customer reviews are available yet.</p><div className="public-state-actions"><LBtn to="/services" variant="dark">Explore care services <ArrowRight size={14}/></LBtn></div></div>:null}
    {!!reviews.length&&<Row label="published customer reviews">{reviews.map(r=><figure className="review" key={r.id}><div className="stars" aria-label={`${r.rating} out of 5`}>{[0,1,2,3,4].map(k=><Star key={k} size={13} className={k<r.rating?'on':''}/>)}</div>
      {r.comment?<blockquote>“{r.comment}”</blockquote>:<blockquote>Rated this completed T-Care service.</blockquote>}
      <figcaption><span className="av">T</span><div><b>T-Care customer</b><small>{r.booking?.service?.name||'Completed service'}{r.booking?.assignment?.gardener?.user?.fullName?` · Gardener ${r.booking.assignment.gardener.user.fullName}`:''}</small><small>{new Date(r.createdAt).toLocaleDateString('en-IN')}</small></div></figcaption></figure>)}</Row>}
  </section>;
}

/* ---------- final call to action + footer ---------- */
function FinalCtaImpl(){
  return <section className="lsec cta2"><Reveal className="cta2-card"><div><span className="eyebrow">Let’s get growing</span><h2>Give your plants a <em>happier home</em></h2></div><div className="cta-btns"><LBtn to="/garden/book" variant="gold">Book now <ArrowRight size={15}/></LBtn><WaBtn variant="outline">WhatsApp us</WaBtn></div></Reveal></section>;
}
function safeSocialUrl(value){
  try{
    const url=new URL(String(value||''));
    return url.protocol==='https:'?url.href:null;
  }catch{return null;}
}
const SOCIAL_LINKS=Object.entries({
  instagram:import.meta.env.VITE_INSTAGRAM_URL,
  youtube:import.meta.env.VITE_YOUTUBE_URL,
  facebook:import.meta.env.VITE_FACEBOOK_URL,
  linkedin:import.meta.env.VITE_LINKEDIN_URL
}).map(([name,value])=>({name,url:safeSocialUrl(value)})).filter(item=>item.url&&Social[item.name]);
function SiteFooterImpl(){
  const phoneHref=C.PUBLIC_PHONE_NUMBER?`tel:${C.PUBLIC_PHONE_NUMBER.replace(/[^+\d]/g,'')}`:null;
  return <footer className="lfoot"><div className="lfoot-top">
    <div className="lfoot-brand"><Link to="/" className="lfoot-logo-link" aria-label="T-CARE home"><img src="/brand/t-care-wordmark.png" width="445" height="158" alt="T-CARE — Plant Care Management as a Service. Greener Tomorrow Together."/></Link><p>Plant Care Management as a Service — helping people care for the plants and spaces around them.</p>
      {SOCIAL_LINKS.length>0&&<div className="socials">{SOCIAL_LINKS.map(({name,url})=><a key={name} href={url} target="_blank" rel="noopener noreferrer" aria-label={name}>{Social[name]}</a>)}</div>}</div>
    <div className="lfoot-cols">{C.FOOTER_COLS.map(([heading,links])=><div key={heading}><h5>{heading}</h5>{links.map(([label,to])=><L key={label} to={to}>{label}</L>)}</div>)}</div></div>
    <div className="lfoot-contact"><h5>Customer care & contact</h5><div className="lfoot-contact-grid">
      <div><Mail size={16}/><span><small>Customer care</small><a href={`mailto:${C.PUBLIC_CONTACT_EMAIL}`}>{C.PUBLIC_CONTACT_EMAIL}</a></span></div>
      {C.PUBLIC_OFFICE_ADDRESS&&<div><MapPin size={16}/><span><small>Main office</small>{C.PUBLIC_OFFICE_ADDRESS}</span></div>}
      {C.PUBLIC_LOCATION&&<div><MapPin size={16}/><span><small>Service location</small>{C.PUBLIC_LOCATION}</span></div>}
      {C.PUBLIC_PHONE_NUMBER&&<div><Phone size={16}/><span><small>Phone</small><a href={phoneHref}>{C.PUBLIC_PHONE_NUMBER}</a></span></div>}
    </div></div>
    <div className="lfoot-bot"><span>© {new Date().getFullYear()} T-Care. All rights reserved.</span><span>Made with care for plants and the people who love them.</span></div></footer>;
}

/* ---------- floating WhatsApp button ---------- */
function WhatsAppFabImpl(){
  const href=/^[1-9]\d{7,14}$/.test(C.WHATSAPP_NUMBER)?`https://wa.me/${C.WHATSAPP_NUMBER}?text=${encodeURIComponent('Hello T-Care, I would like to know more about your plant care services.')}`:null;
  if(!href)return null;
  return <a className="fab" href={href} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp"><i className="fab-ring"/><MessageCircle size={26}/></a>;
}


/* shared building blocks reused by the standalone pages (landing/Pages.jsx) */
export {L,LBtn,Reveal,Head,ICON,money,Row,WaBtn};

/* Memoised exports keep the public landing tree stable during local cart and theme updates. */
export const Hero=React.memo(HeroImpl);
export const WhyChoose=React.memo(WhyChooseImpl);
export const Included=React.memo(IncludedImpl);
export const Steps=React.memo(StepsImpl);
export const Reviews=React.memo(ReviewsImpl);
export const FinalCta=React.memo(FinalCtaImpl);
export const SiteFooter=React.memo(SiteFooterImpl);
export const WhatsAppFab=React.memo(WhatsAppFabImpl);
