import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence, useInView, useMotionValue, animate } from 'framer-motion';
import HeroPlant from './HeroPlant.jsx';
import {AppBackground,AuthScenery} from './Backgrounds.jsx';
import {useCart,CartDrawer,LandingNav,Hero,WhyChoose,Included,Steps,ServiceBanner,Plans,CtaCard,Transformations,Story,Market,Reviews,FinalCta,SiteFooter,WhatsAppFab} from './landing/Sections.jsx';
import { Leaf, ArrowUpRight, Check, Bell, Search, Sun, Moon, Plus, X, Droplets, Heart, Scissors, MapPin, Clock3, Star,
  LayoutGrid, CalendarDays, Flower2, Sprout, WalletCards, CreditCard, UserRound, Stethoscope, Users, Package, BarChart3, FileText,
  ClipboardList, Bot, ShoppingBag, Wand2, CornerDownLeft, TrendingUp, MoreHorizontal, UserPlus, UserCheck, Receipt, RefreshCcw, SearchCheck, Save, SlidersHorizontal } from 'lucide-react';
import {ServicesPage,AboutPage,PlansPage,StorePage,MakeoverPage,ContactPage,TermsPage} from './landing/Pages.jsx';
import './styles.css';
import * as Phase5 from './phase5.jsx';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');
const API_V1 = `${API_BASE_URL}/api/v1`;

async function authApi(path, body) {
  const response = await fetch(`${API_V1}/auth/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `Request failed (${response.status}).`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function workspaceForRole(role) {
  return role === 'ADMIN' ? '/hq' : role === 'GARDENER' ? '/crew' : '/garden';
}

/* ---------- data ---------- */
const services=[['Plant Care','Routine care, pruning and nourishment.',Leaf,499,'60 min','Care'],['Plant Setup','Create a healthy green space from scratch.',Flower2,1499,'2–3 hrs','Design'],['Plant Rescue','Diagnose stressed plants and restore them.',Stethoscope,799,'90 min','Care'],['Maintenance','Reliable recurring care for your collection.',Scissors,1299,'Monthly','Care'],['Events','Green styling for memorable occasions.',Sprout,2999,'Half day','Design'],['Green Makeover','Transform ordinary spaces with plants.',Wand2,3499,'1 day','Design'],['Plant Store','Discover plants and essentials.',ShoppingBag,199,'Delivery','Shop & Learn'],['AI Care','Smart guidance for everyday plant care.',Bot,0,'Instant','Shop & Learn']].map(([name,desc,icon,price,time,cat],i)=>({name,desc,icon,price,time,cat,hue:[140,95,20,60,190,290,40,160][i]}));
const seedPlants=[{name:'Monstera deliciosa',type:'Indoor • Tropical',status:'Excellent',next:'Today'},{name:'Snake Plant',type:'Indoor • Succulent',status:'Healthy',next:'2 days'},{name:'Peace Lily',type:'Indoor • Flowering',status:'Needs water',next:'Today'},{name:'Fiddle Leaf Fig',type:'Indoor • Tree',status:'Healthy',next:'5 days'}];
const bookings=[{service:'Plant Care',plants:'3 plants',date:'30 Sep',time:'10:30 AM',gardener:'Aarav Patel',status:'Confirmed'},{service:'Green Makeover',plants:'12 plants',date:'04 Oct',time:'02:00 PM',gardener:'Meera Shah',status:'Assigned'},{service:'Maintenance',plants:'8 plants',date:'12 Oct',time:'11:00 AM',gardener:'Aarav Patel',status:'Scheduled'},{service:'Plant Rescue',plants:'2 plants',date:'21 Sep',time:'04:30 PM',gardener:'Riya Mehta',status:'Completed'}];
const bookingMeta=[{id:'TC-1042',state:'Confirmed',service:'Plant Care',plants:'3 plants',date:'30 Sep 2026',time:'10:30 AM',gardener:'Aarav Patel',address:'Home · 24 Green Avenue',price:499,eta:'Saturday, 10:30 AM'},{id:'TC-1038',state:'Gardener Assigned',service:'Green Makeover',plants:'12 plants',date:'04 Oct 2026',time:'02:00 PM',gardener:'Meera Shah',address:'Home · 24 Green Avenue',price:3499,eta:'Sunday, 2:00 PM'},{id:'TC-1027',state:'Completed',service:'Plant Rescue',plants:'2 plants',date:'21 Sep 2026',time:'04:30 PM',gardener:'Riya Mehta',address:'Office · 8 Riverfront Road',price:799,eta:'Completed'}];
const bookingTimeline=['Booking Confirmed','Gardener Assigned','Gardener Accepted','On the way','Arrived','Service started','Service completed'];
const bookingStateIndex={Confirmed:0,'Gardener Assigned':1,'Gardener Accepted':2,'On the way':3,Arrived:4,'Service started':5,Completed:6,'Service completed':6,Cancelled:-1};
const bookingStatusLabel={Confirmed:'Confirmed','Gardener Assigned':'Assigned','Gardener Accepted':'Accepted','On the way':'On the way',Arrived:'Arrived','Service started':'In progress',Completed:'Completed',Cancelled:'Cancelled'};
const bookingById=id=>bookingMeta.find(x=>x.id===id)||bookingMeta[0];
const crewJobs=[
{id:'JOB-1042',bookingId:'TC-1042',customer:'Kabir Mehta',address:'24 Green Avenue, Ahmedabad',service:'Plant Care',plants:['Monstera deliciosa','Peace Lily','Fiddle Leaf Fig'],date:'30 Sep 2026',time:'10:30 AM',status:'Assigned',instructions:'Check soil moisture before watering. Inspect the Peace Lily for drooping and clean the Monstera leaves.',price:499,priority:'Next'},
{id:'JOB-1038',bookingId:'TC-1038',customer:'Neha Shah',address:'8 Riverfront Road, Ahmedabad',service:'Green Makeover',plants:['12 plants · mixed collection'],date:'04 Oct 2026',time:'02:00 PM',status:'Accepted',instructions:'Review the proposed placement plan before moving any plants.',price:3499,priority:'Scheduled'},
{id:'JOB-1027',bookingId:'TC-1027',customer:'Aisha Patel',address:'17 Garden Lane, Ahmedabad',service:'Plant Rescue',plants:['Fiddle Leaf Fig','Peace Lily'],date:'21 Sep 2026',time:'04:30 PM',status:'Completed',instructions:'Document leaf damage and recommend follow-up care.',price:799,priority:'Completed'},
{id:'JOB-1019',bookingId:'TC-1019',customer:'Rohan Desai',address:'5 Palm Court, Ahmedabad',service:'Maintenance',plants:['8 plants · home collection'],date:'12 Oct 2026',time:'11:00 AM',status:'New',instructions:'Routine maintenance visit. Confirm pruning and feeding requirements.',price:1299,priority:'Upcoming'}
];
const careChecklist=['Inspect plant health','Check soil moisture','Water as required','Prune / clean leaves','Check pests & disease','Record photos and observations'];
const roles={
  garden:{label:'Customer',base:'/garden',nav:[['','Today',LayoutGrid],['visits','Visits',ClipboardList],['plants','Plants',Flower2],['addresses','Addresses',MapPin],['shop','Services',Sprout],['plan','Plan',WalletCards],['billing','Billing',CreditCard],['inbox','Inbox',Bell],['me','Me',UserRound]]},
  crew:{label:'Gardener',base:'/crew',nav:[['','Route',LayoutGrid],['jobs','Jobs',ClipboardList],['reports','Reports',Stethoscope],['hours','Hours',CalendarDays],['kyc','Verification',FileText],['pay','Pay',WalletCards],['me','Me',UserRound]]},
  hq:{label:'Admin',base:'/hq',nav:[['','Pulse',LayoutGrid],['people','Customers',Users],['crew','Gardeners',Flower2],['visits','Bookings',ClipboardList],['catalog','Services',Package],['botany','Plants',Sprout],['reviews','Reviews',Star],['issues','Issues',FileText],['notifications','Notifications',Bell],['insights','Analytics',BarChart3],['cms','Content',FileText],['plans','Plans',WalletCards],['money','Finance',CreditCard]]}};
const roleOf=p=>p.startsWith('/crew')?'crew':p.startsWith('/hq')?'hq':'garden';

/* ---------- app state ---------- */
const Ctx=React.createContext(null);const useApp=()=>React.useContext(Ctx);
function getPerformanceTier(){
  if(typeof window==='undefined')return'balanced';
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const coarse=window.matchMedia?.('(pointer: coarse)').matches;
  const memory=navigator.deviceMemory||8;
  const cores=navigator.hardwareConcurrency||8;
  return reduce?'reduced':(coarse||memory<=4||cores<=4)?'low':(memory<=8||cores<=8)?'balanced':'high';
}
function PerformanceManager(){
  React.useEffect(()=>{document.documentElement.dataset.perf=getPerformanceTier()},[]);
  return null;
}

function Provider({children}){
  const [plants,setPl]=React.useState(seedPlants),[toasts,setT]=React.useState([]),[pal,setPal]=React.useState(false),[add,setAdd]=React.useState(false),[jobOverrides,setJobOverrides]=React.useState({});
  const [adminOverrides,setAdminOverrides]=React.useState({});
  const [bookingOverrides,setBookingOverrides]=React.useState({});
  const [authUser,setAuthUser]=React.useState(null),[authReady,setAuthReady]=React.useState(false);
  const [theme,setTheme]=React.useState(()=>{try{return localStorage.getItem('tcare-theme')||'light'}catch{return'light'}});
  React.useEffect(()=>{document.documentElement.dataset.theme=theme;try{localStorage.setItem('tcare-theme',theme)}catch{}},[theme]);
  React.useEffect(()=>{
    let active=true;
    const readSession=()=>fetch(`${API_V1}/auth/session`,{credentials:'include'});
    const restore=async()=>{
      try{
        let response=await readSession();
        if(response.status===401){
          const refresh=await fetch(`${API_V1}/auth/refresh`,{method:'POST',credentials:'include'});
          response=refresh.ok?await readSession():null;
        }
        if(response?.ok){
          const payload=await response.json();
          if(active) setAuthUser(payload.user||null);
        }
      }catch{
        // Public pages remain available while the API is offline; protected pages stay guarded.
      }finally{
        if(active) setAuthReady(true);
      }
    };
    restore();
    return()=>{active=false};
  },[]);
  React.useEffect(()=>{const k=e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setPal(p=>!p)}};addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[]);
  const toast=React.useCallback(m=>{const id=Math.random();setT(t=>[...t,{id,m}]);setTimeout(()=>setT(t=>t.filter(x=>x.id!==id)),3200)},[]);
  const cart=useCart(toast);
  const addPlant=React.useCallback(p=>{setPl(x=>[p,...x]);toast(`${p.name} planted in your garden`)},[toast]);
  const toggleTheme=React.useCallback(()=>setTheme(t=>t==='dark'?'light':'dark'),[]);
  const openPalette=React.useCallback(()=>setPal(true),[]),openAdd=React.useCallback(()=>setAdd(true),[]);
  const updateJob=React.useCallback((id,patch)=>setJobOverrides(v=>({...v,[id]:{...v[id],...patch}})),[]);
  const updateAdmin=React.useCallback((key,patch)=>setAdminOverrides(v=>({...v,[key]:{...v[key],...patch}})),[]);
  const updateBooking=React.useCallback((id,patch)=>setBookingOverrides(v=>({...v,[id]:{...v[id],...patch}})),[]);
  const logout=React.useCallback(async()=>{
    try{await fetch(`${API_V1}/auth/logout`,{method:'POST',credentials:'include'})}catch{}
    setAuthUser(null);
  },[]);
  const value=React.useMemo(()=>({cart,plants,addPlant,toast,theme,toggleTheme,openPalette,openAdd,jobOverrides,updateJob,adminOverrides,updateAdmin,bookingOverrides,updateBooking,authUser,authReady,setAuthUser,logout}),[cart,plants,addPlant,toast,theme,toggleTheme,openPalette,openAdd,jobOverrides,updateJob,adminOverrides,updateAdmin,bookingOverrides,updateBooking,authUser,authReady,setAuthUser,logout]);
  return <Ctx.Provider value={value}><PerformanceManager/>{children}
    <AnimatePresence>{pal&&<Palette onClose={()=>setPal(false)}/>}{add&&<AddPlant onClose={()=>setAdd(false)}/>}</AnimatePresence>
    <div className="toasts"><AnimatePresence>{toasts.map(t=><motion.div key={t.id} className="toast" layout initial={{opacity:0,y:40,scale:.9}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,scale:.9}}><Check size={16}/>{t.m}</motion.div>)}</AnimatePresence></div></Ctx.Provider>}


/* ---------- small parts ---------- */
const Badge=({children,tone})=>{const text=String(children??'');const t=tone||(/Completed|Paid|Inactive|Blocked/.test(text)?'n':/Assigned|Needs|Pending|attention/.test(text)?'a':'g');return <span className={'badge '+t}>{children}</span>};
const Btn=({children,to,onClick,ghost,arrow=true,full})=>{const {toast}=useApp();const c='btn'+(ghost?' ghost':'')+(full?' full':'');const i=arrow&&<ArrowUpRight size={16}/>;const fallback=()=>toast('This frontend action is ready for its backend connection.');return to?<Link to={to} className={c}>{children}{i}</Link>:<button className={c} onClick={onClick||fallback}>{children}{i}</button>};
function CountUp({to,suffix=''}){const r=React.useRef(),v=useInView(r,{once:true}),[n,setN]=React.useState(0);React.useEffect(()=>{if(!v)return;let f,t0;const s=t=>{t0=t0||t;const p=Math.min((t-t0)/1400,1);setN(Math.round(to*(1-(1-p)**3)));if(p<1)f=requestAnimationFrame(s)};f=requestAnimationFrame(s);return()=>cancelAnimationFrame(f)},[v,to]);return <span ref={r}>{n.toLocaleString()}{suffix}</span>}
const Metric=({icon:I,label,value,meta,tone})=><motion.div className="metric" whileHover={{rotate:-1,y:-4}}><I size={18}/><small>{label}</small><b>{value}</b><em className={tone}>{meta}</em></motion.div>;
function Modal({title,onClose,children}){React.useEffect(()=>{const onKey=e=>e.key==='Escape'&&onClose();addEventListener('keydown',onKey);return()=>removeEventListener('keydown',onKey)},[onClose]);return <motion.div className="overlay" role="presentation" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose}><motion.div className="modal" role="dialog" aria-modal="true" aria-label={title} initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%'}} transition={{type:'spring',damping:30,stiffness:300}} onClick={e=>e.stopPropagation()}><div className="mh"><h3>{title}</h3><button className="ib" onClick={onClose} aria-label="Close dialog" title="Close"><X size={16}/></button></div>{children}</motion.div></motion.div>}
function AddPlant({onClose}){const {addPlant}=useApp();const [f,setF]=React.useState({name:'',type:'Indoor',room:''});const go=()=>{if(!f.name.trim())return;addPlant({name:f.name.trim(),type:f.type,status:'Healthy',next:'Tomorrow'});onClose()};
  return <Modal title="Plant something new" onClose={onClose}><label>Plant name<input autoFocus value={f.name} onChange={e=>setF({...f,name:e.target.value})} onKeyDown={e=>e.key==='Enter'&&go()} placeholder="e.g. Snake plant"/></label><label>Type<select value={f.type} onChange={e=>setF({...f,type:e.target.value})}>{['Indoor','Outdoor','Succulent','Herb'].map(t=><option key={t}>{t}</option>)}</select></label><label>Location<input value={f.room} onChange={e=>setF({...f,room:e.target.value})} placeholder="Living room"/></label><div className="acts"><Btn ghost arrow={false} onClick={onClose}>Cancel</Btn><Btn onClick={go}>Save plant</Btn></div></Modal>}
function Palette({onClose}){const nav=useNavigate();const {plants,toggleTheme,theme}=useApp();const [q,setQ]=React.useState(''),[i,setI]=React.useState(0);
  const all=[{label:'Book a service',group:'Action',icon:CalendarDays,run:()=>nav('/garden/book')},{label:theme==='dark'?'Switch to light':'Switch to dark',group:'Action',icon:theme==='dark'?Sun:Moon,run:toggleTheme,keep:1},...Object.values(roles).flatMap(r=>r.nav.map(([p,l,I])=>({label:l,group:r.label,icon:I,run:()=>nav(r.base+(p?'/'+p:''))}))),...plants.map((p,n)=>({label:p.name,group:'Plant',icon:Leaf,run:()=>nav(`/garden/plants/${n}`)})),{label:'Home page',group:'Action',icon:Leaf,run:()=>nav('/')}];
  const res=all.filter(x=>(x.label+x.group).toLowerCase().includes(q.toLowerCase())).slice(0,9);const run=x=>{if(!x)return;x.run();if(!x.keep)onClose()};
  const key=e=>{const n=Math.max(res.length,1);if(e.key==='ArrowDown'){e.preventDefault();setI((i+1)%n)}else if(e.key==='ArrowUp'){e.preventDefault();setI((i-1+n)%n)}else if(e.key==='Enter')run(res[i]);else if(e.key==='Escape')onClose()};
  return <motion.div className="overlay top" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose}><motion.div className="palette" initial={{scale:.9,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.95,opacity:0}} onClick={e=>e.stopPropagation()}><div className="pin"><Search size={18}/><input autoFocus value={q} onChange={e=>{setQ(e.target.value);setI(0)}} onKeyDown={key} placeholder="Jump to a page, plant or action…"/><kbd>esc</kbd></div><div className="pl">{res.length?res.map((x,n)=><button key={x.group+x.label} className={n===i?'on':''} onMouseEnter={()=>setI(n)} onClick={()=>run(x)}><x.icon size={16}/><span>{x.label}</span><small>{x.group}</small>{n===i&&<CornerDownLeft size={13}/>}</button>):<p className="empty">Nothing for “{q}”</p>}</div></motion.div></motion.div>}
function Notif(){const [o,setO]=React.useState(false);return <div className="notif"><button className="ib" onClick={()=>setO(!o)} aria-label="Open notifications" title="Notifications"><Bell size={17}/><i className="ping"/></button><AnimatePresence>{o&&<motion.div className="nmenu" initial={{opacity:0,scale:.8,y:10}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:.8}}><b>Notifications</b>{[['Watering due today','Monstera · 6 PM'],['Gardener assigned','Aarav will visit Sat 10 AM'],['Report ready','Fiddle Leaf health report']].map(([a,b])=><div key={a}><span className="dot"/><p>{a}<small>{b}</small></p></div>)}</motion.div>}</AnimatePresence></div>}

/* ---------- shell: floating dock + seed-bloom transition ---------- */
const clickPos={x:innerWidth/2,y:innerHeight/2};
addEventListener('pointerdown',e=>{clickPos.x=e.clientX;clickPos.y=e.clientY},true);
function Bloom({children}){const {pathname}=useLocation();
  /* Seed-bloom reveal. The clip circle is only ~160vmax wide, so on tall pages (the home page is ~8000px) it used to stay applied and leave
     everything below ~2700px clipped, showing an empty background. We drive the clip through a motion value and set it to 'none' when the
     bloom finishes, so the whole page is visible afterwards. */
  const clip=useMotionValue('none');
  React.useLayoutEffect(()=>{
    const {x,y}={...clickPos};scrollTo(0,0);
    const r=Math.max(innerWidth,innerHeight)*1.6;
    clip.set(`circle(0px at ${x}px ${y}px)`);
    const a=animate(clip,`circle(${r}px at ${x}px ${y}px)`,{duration:.9,ease:[.22,1,.36,1],onComplete:()=>clip.set('none')});
    return()=>a.stop();
  },[pathname,clip]);
  return <motion.div key={pathname} style={{minHeight:'100vh',clipPath:clip}}>{children}</motion.div>}
function Breadcrumbs({pathname}){
  const rk=roleOf(pathname),R=roles[rk];
  const parts=pathname.split('/').filter(Boolean);
  const labels={garden:'Today',crew:'Route',hq:'Pulse',visits:'Visits',plants:'Plants',shop:'Services',book:'Book a service',plan:'Plan',billing:'Billing',inbox:'Inbox',me:'Profile',jobs:'Jobs',reports:'Reports',pay:'Pay',hours:'Hours',people:'Customers',catalog:'Services',plans:'Plans',botany:'Plants',money:'Finance',insights:'Analytics',cms:'Content'};
  return <nav className="crumbs" aria-label="Breadcrumb"><Link to={R.base}>{R.label}</Link>{parts.slice(1).map((part,i)=><React.Fragment key={part}><span>/</span><span>{labels[part]||decodeURIComponent(part).replace(/-/g,' ')}</span></React.Fragment>)}</nav>
}
function AccountMenu({role}){
  const R=roles[role];
  const {authUser,logout}=useApp();
  const nav=useNavigate();
  const [open,setOpen]=React.useState(false);
  const secondary=role==='garden'?['Notifications',`${R.base}/inbox`]:role==='crew'?['My jobs',`${R.base}/jobs`]:['Bookings',`${R.base}/visits`];
  const profileTarget=role==='hq'?R.base:`${R.base}/me`;
  const initials=(authUser?.fullName||'T').trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()||'').join('');
  const signOut=async()=>{await logout();setOpen(false);nav('/login',{replace:true})};
  return <div className="account"><button className="avatar" onClick={()=>setOpen(v=>!v)} aria-label="Open account menu" title="Account menu">{initials||'T'}</button><AnimatePresence>{open&&<motion.div className="account-menu" initial={{opacity:0,y:8,scale:.96}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:8,scale:.96}}><strong>{R.label} workspace</strong><span className="account-name">{authUser?.fullName||'Account'}</span><span className="account-email">{authUser?.email||''}</span><Link to={profileTarget} onClick={()=>setOpen(false)}>Profile & preferences</Link><Link to={secondary[1]} onClick={()=>setOpen(false)}>{secondary[0]}</Link><button type="button" onClick={signOut} className="danger">Sign out</button></motion.div>}</AnimatePresence></div>
}
const Dock=React.memo(function Dock({R,pathname}){const [hover,setHover]=React.useState(null);
  return <nav className="dock" aria-label={`${R.label} navigation`}>{R.nav.map(([p,l,I],i)=>{const to=R.base+(p?'/'+p:''),on=pathname===to||(p&&pathname.startsWith(to+'/'));const d=hover===null?0:Math.abs(hover-i);
      return <Link key={to} to={to} className={on?'on':''} aria-label={l} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)}><motion.span animate={{scale:hover===null?1:d===0?1.35:d===1?1.15:1,y:hover===null?0:d===0?-8:d===1?-3:0}} transition={{type:'spring',stiffness:500,damping:26}}><I size={20}/></motion.span><em>{l}</em><span className="dock-label">{l}</span></Link>})}</nav>});
function Shell({title,sub,action,children}){
  const {pathname}=useLocation();const rk=roleOf(pathname),R=roles[rk];const {theme,toggleTheme,openPalette,authUser}=useApp();
  return <div className="shell"><AppBackground role={rk}/>
    <header className="top"><Link to="/" className="brand" aria-label="T-CARE home"><Leaf size={20}/><b>T-CARE</b></Link>
      <div className="seg"><span className="on"><motion.i layoutId="seg"/><span>{R.label}</span></span></div>
      <div className="tools"><button className="ib" onClick={openPalette} aria-label="Open command search" title="Search · Ctrl/Cmd K"><Search size={17}/></button><button className="ib" onClick={toggleTheme} aria-label="Toggle light and dark theme" title="Toggle theme">{theme==='dark'?<Sun size={17}/>:<Moon size={17}/>}</button><Notif/><AccountMenu role={rk}/></div></header>
    <main className="page"><Breadcrumbs pathname={pathname}/><div className="ph"><div><span className="eyebrow">{R.label}</span><h1>{title}</h1><p>{sub}</p></div>{action}</div>{children}</main>
    <Dock R={R} pathname={pathname}/></div>}

/* ---------- landing ---------- */
/* ---------- living garden background (home page) ---------- */
function GardenBackground({theme}){
  const ref=React.useRef(null);
  React.useEffect(()=>{
    const cv=ref.current;if(!cv)return;const ctx=cv.getContext('2d');if(!ctx)return;
    const dark=theme==='dark';
    const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W=0,H=0,dpr=1,raf=0,last=0,lastFrame=0,t=0,running=true;
    const perf=getPerformanceTier();
    const cfg={
      high:{dpr:1.5,leafMax:24,leafMin:12,leafDiv:56,speckMax:28,speckDiv:48,flyMax:16,flyMin:8,flyDiv:80,fps:30},
      balanced:{dpr:1.25,leafMax:18,leafMin:9,leafDiv:70,speckMax:18,speckDiv:80,flyMax:10,flyMin:6,flyDiv:110,fps:28},
      low:{dpr:1,leafMax:11,leafMin:6,leafDiv:95,speckMax:10,speckDiv:110,flyMax:6,flyMin:5,flyDiv:150,fps:22},
      reduced:{dpr:1,leafMax:0,leafMin:0,leafDiv:999,speckMax:0,speckDiv:999,flyMax:0,flyMin:0,flyDiv:999,fps:1}
    }[perf]||null;
    const settings=cfg||{dpr:1.25,leafMax:18,leafMin:9,leafDiv:70,speckMax:18,speckDiv:80,flyMax:10,flyMin:6,flyDiv:110,fps:28};
    const frameMs=1000/settings.fps;
    const rnd=(a,b)=>a+Math.random()*(b-a);
    const leafHues=dark?[95,110,125,140,28]:[96,112,128,144,22];
    const makeLeaf=(initial)=>{const z=rnd(.35,1);const L={x:rnd(0,W),y:initial?rnd(-H*.1,H):rnd(-80,-20),z,size:rnd(14,30)*(.55+z*.7),rot:rnd(0,6.28),vr:rnd(-.9,.9),fall:rnd(22,48)*(.5+z),sway:rnd(18,46),ph:rnd(0,6.28),sp:rnd(.4,.9),hue:0,light:0,fill:'',alpha:(dark?.28:.34)+z*.34,push:0};const hue=leafHues[Math.floor(Math.random()*leafHues.length)],light=dark?rnd(38,58):rnd(30,48);L.hue=hue;L.light=light;L.fill=`hsl(${hue} ${dark?40:46}% ${light}%)`;return L};
    const makeSpeck=(initial)=>({x:rnd(0,W),y:initial?rnd(0,H):H+rnd(10,60),r:rnd(1,2.8),vy:-rnd(6,18),ph:rnd(0,6.28),sp:rnd(.4,1.1),drift:rnd(10,28)});
    const makeFly=()=>({x:rnd(0,W),y:rnd(H*.2,H),ph:rnd(0,6.28),sp:rnd(.5,1.2),r:rnd(14,30),vx:rnd(-9,9),vy:rnd(-9,9),tx:rnd(0,6.28)});
    let leaves=[],specks=[],flies=[];
    // pre-rendered glow sprite for fireflies / pollen
    const glow=document.createElement('canvas');glow.width=glow.height=64;
    {const g=glow.getContext('2d');const gr=g.createRadialGradient(32,32,0,32,32,32);
      gr.addColorStop(0,dark?'rgba(214,255,150,1)':'rgba(255,214,120,1)');gr.addColorStop(.25,dark?'rgba(168,214,114,.55)':'rgba(255,196,96,.45)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);}
    const isStatic=reduce||perf==='reduced';
    const build=()=>{
      const nl=perf==='reduced'?0:Math.round(Math.min(settings.leafMax,Math.max(settings.leafMin,W/settings.leafDiv)));leaves=Array.from({length:nl},()=>makeLeaf(true));
      specks=Array.from({length:dark||perf==='reduced'?0:Math.round(Math.min(settings.speckMax,W/settings.speckDiv))},()=>makeSpeck(true));
      flies=Array.from({length:dark&&perf!=='reduced'?Math.round(Math.min(settings.flyMax,Math.max(settings.flyMin,W/settings.flyDiv))):0},makeFly);};
    // Height-only changes (mobile URL bar collapsing) keep the existing particles; only a width change rebuilds them.
    const resize=()=>{
      const w=cv.clientWidth,h=cv.clientHeight,widthChanged=Math.abs(w-W)>=1;
      dpr=Math.min(window.devicePixelRatio||1,settings.dpr);W=w;H=h;cv.width=Math.max(1,Math.round(W*dpr));cv.height=Math.max(1,Math.round(H*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);
      if(widthChanged)build();};
    const drawLeaf=(l)=>{
      ctx.save();ctx.translate(l.x,l.y);ctx.rotate(l.rot);ctx.scale(Math.cos(l.ph*1.3)*.35+.75,1); // gentle 3D flutter
      const s=l.size;ctx.globalAlpha=l.alpha;ctx.fillStyle=l.fill;
      ctx.beginPath();ctx.moveTo(0,-s);ctx.bezierCurveTo(s*.75,-s*.55,s*.65,s*.5,0,s);ctx.bezierCurveTo(-s*.65,s*.5,-s*.75,-s*.55,0,-s);ctx.fill();
      ctx.globalAlpha=l.alpha*.55;ctx.strokeStyle=dark?'rgba(238,242,223,.5)':'rgba(255,250,240,.7)';ctx.lineWidth=Math.max(.8,s*.05);
      ctx.beginPath();ctx.moveTo(0,-s*.9);ctx.lineTo(0,s*.95);ctx.stroke();ctx.restore();};
    const frame=(now)=>{
      if(!running)return;raf=requestAnimationFrame(frame);
      if(lastFrame&&now-lastFrame<frameMs-3)return; // 3ms tolerance: avoids rAF jitter silently halving the capped frame rate
      lastFrame=now;
      const dt=Math.min((now-last)/1000||1/settings.fps,.05);last=now;t+=dt;
      ctx.clearRect(0,0,W,H);
      const gust=Math.sin(t*.35)*.6+Math.sin(t*.9+1.7)*.4; // global wind, -1..1
      for(const l of leaves){
        l.ph+=dt*l.sp;
        l.push*=.96;
        l.x+=(Math.sin(l.ph)*l.sway*dt+gust*38*l.z*dt+l.push*60*dt);
        l.y+=l.fall*dt+Math.abs(l.push)*14*dt;
        l.rot+=(l.vr*dt)+Math.cos(l.ph)*dt*.5;
        if(l.y>H+50||l.x<-80||l.x>W+80){Object.assign(l,makeLeaf(false));}
        drawLeaf(l);
      }
      ctx.globalAlpha=1;
      if(!dark){for(const p of specks){p.ph+=dt*p.sp;p.y+=p.vy*dt;p.x+=Math.sin(p.ph)*p.drift*dt+gust*10*dt;if(p.y<-20){Object.assign(p,makeSpeck(false));}
        ctx.globalAlpha=.35+Math.sin(p.ph*2)*.25;ctx.drawImage(glow,p.x-p.r*4,p.y-p.r*4,p.r*8,p.r*8);}}
      else{ctx.globalCompositeOperation='lighter';
        for(const f of flies){f.ph+=dt*f.sp;f.tx+=dt*.6;f.x+=(f.vx+Math.cos(f.tx*2.1)*14)*dt;f.y+=(f.vy+Math.sin(f.tx*1.7)*14)*dt;
          if(f.x<-30)f.x=W+30;if(f.x>W+30)f.x=-30;if(f.y<-30)f.y=H+30;if(f.y>H+30)f.y=-30;
          const a=Math.max(0,Math.sin(f.ph*2.2)); // blink
          ctx.globalAlpha=.15+a*.85;ctx.drawImage(glow,f.x-f.r,f.y-f.r,f.r*2,f.r*2);}
        ctx.globalCompositeOperation='source-over';}
      ctx.globalAlpha=1;
    };
    const drawStatic=()=>{ctx.clearRect(0,0,W,H);leaves.forEach(drawLeaf);ctx.globalAlpha=1;};
    const onVis=()=>{if(document.hidden){running=false;cancelAnimationFrame(raf);}else if(!reduce&&!running){running=true;last=performance.now();raf=requestAnimationFrame(frame);}};
    let rt=0;const onResize=()=>{clearTimeout(rt);rt=setTimeout(()=>{resize();if(isStatic)drawStatic();},120)};
    resize();window.addEventListener('resize',onResize);
    if(isStatic){drawStatic();}else{last=performance.now();raf=requestAnimationFrame(frame);document.addEventListener('visibilitychange',onVis);}
    return()=>{running=false;cancelAnimationFrame(raf);clearTimeout(rt);window.removeEventListener('resize',onResize);document.removeEventListener('visibilitychange',onVis);};
  },[theme]);
  return <div className="gbg" aria-hidden="true"><i className="gb-orb o1"/><i className="gb-orb o2"/><i className="gb-orb o3"/><i className="gb-rays"/><i className="gb-grain"/><canvas ref={ref} className="gb-canvas"/></div>;
}
function PublicPage({children}){
  const {theme,toggleTheme,toast,cart}=useApp();
  return <div className="landing"><GardenBackground theme={theme}/>
    <LandingNav theme={theme} toggleTheme={toggleTheme} cart={cart} toast={toast}/>
    <main>{children}</main>
    <FinalCta toast={toast}/>
    <SiteFooter toast={toast}/>
    <WhatsAppFab toast={toast}/>
    <CartDrawer cart={cart} toast={toast}/>
  </div>}
const ServicesRoute=()=><PublicPage><ServicesPage services={services}/></PublicPage>;
const AboutRoute=()=><PublicPage><AboutPage/></PublicPage>;
const PlansRoute=()=><PublicPage><PlansPage/></PublicPage>;
const StoreRoute=()=>{const {cart}=useApp();return <PublicPage><StorePage cart={cart}/></PublicPage>};
const MakeoverRoute=()=><PublicPage><MakeoverPage/></PublicPage>;
const ContactRoute=()=>{const {toast}=useApp();return <PublicPage><ContactPage toast={toast}/></PublicPage>};
const TermsRoute=()=><PublicPage><TermsPage/></PublicPage>;
function Home(){
  const {theme,toggleTheme,toast,cart}=useApp();
  return <div className="landing"><GardenBackground theme={theme}/>
    <LandingNav theme={theme} toggleTheme={toggleTheme} cart={cart} toast={toast}/>
    <Hero theme={theme}/>
    <WhyChoose/>
    <Included/>
    <Steps/>
    <CtaCard toast={toast}/>
    <Reviews/>
    <FinalCta toast={toast}/>
    <SiteFooter toast={toast}/>
    <WhatsAppFab toast={toast}/>
    <CartDrawer cart={cart} toast={toast}/>
  </div>}

/* ---------- shared views ---------- */
function Bookings({rows=bookings}){const {bookingOverrides}=useApp();return <div className="rows">{rows.map((x,i)=>{const meta=bookingMeta.find(m=>m.id===x.id)||bookingMeta[i%bookingMeta.length];const ov=bookingOverrides[meta.id]||{};const state=ov.state||meta.state;const gardener=ov.gardener||meta.gardener;const status=bookingStatusLabel[state]||x.status;return <Link key={`${meta.id}-${i}`} to={`/garden/visits/${meta.id}`} className="row row-link" aria-label={`Open booking ${meta.id}, ${x.service}, ${status}`}><div className="rt"><b>{x.time}</b><small>{x.date}</small></div><div className="rm"><h3>{x.service}</h3><p>{x.plants} · {gardener}</p></div><Badge>{status}</Badge><ArrowUpRight size={17}/></Link>})}</div>}
function EmptyState({title,text,action}){return <div className="empty-state"><div className="empty-orb"><Leaf size={22}/></div><h3>{title}</h3><p>{text}</p>{action}</div>}
function LoadingState({label='Loading your workspace…'}){return <div className="loading-state" role="status" aria-live="polite"><span className="loader"/><p>{label}</p></div>}
function ErrorState({title='Something needs attention',text='This is a frontend error state. The backend will provide detailed recovery information later.',onRetry}){return <div className="error-state" role="alert"><div><b>{title}</b><p>{text}</p></div>{onRetry&&<Btn ghost arrow={false} onClick={onRetry}>Try again</Btn>}</div>}
function Filter({items,value,onChange}){const [local,setLocal]=React.useState(items[0]);const selected=value??local;const change=x=>{setLocal(x);onChange?.(x)};return <div className="filters" role="tablist" aria-label="Filter results">{items.map(x=><button type="button" role="tab" aria-selected={selected===x} key={x} className={selected===x?'on':''} onClick={()=>change(x)}>{selected===x&&<motion.i layoutId={`flt-${items.join('-')}`}/>}<span>{x}</span></button>)}</div>}
function BookingManager({admin=false}){const {bookingOverrides}=useApp();const [filter,setFilter]=React.useState('All');const states=['All','Pending','Assigned','In progress','Completed','Cancelled'];const visible=bookings.filter((b,i)=>{const id=bookingMeta[i%bookingMeta.length].id;const state=bookingOverrides[id]?.state||bookingMeta[i%bookingMeta.length].state;const label=bookingStatusLabel[state]||b.status;return filter==='All'||filter===label||filter==='Pending'&&label==='Scheduled'});return <><Filter items={states} value={filter} onChange={setFilter}/>{visible.length?<Bookings rows={visible}/>:<EmptyState title="No bookings here" text="Try another status filter or create a new service booking." action={<Btn to="/garden/book">Book a service</Btn>}/>}</>}
function JobManager(){const {jobOverrides}=useApp();const [filter,setFilter]=React.useState('All');const states=['All','New','Accepted','In progress','Completed'];const source=crewJobs.map(x=>({...x,...(jobOverrides[x.id]||{})}));const visible=filter==='All'?source:source.filter(x=>x.status===filter);return <><Filter items={states} value={filter} onChange={setFilter}/><Jobs all rows={visible}/></>}
function Table({cols,rows}){return <div className="tbl"><div className="tr th">{cols.map(c=><span key={c}>{c}</span>)}</div>{rows.map((r,i)=><motion.div className="tr" key={i} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:i*.05}}>{r.map((v,j)=><span key={j}>{j===0?<b>{v}</b>:/^(Active|Blocked|Pending|Inactive)$/.test(v)?<Badge>{v}</Badge>:v}</span>)}</motion.div>)}</div>}
const Generic=({title,sub})=>{const D=[['Overview','Everything at a glance','Live'],['Active work','Items in progress right now','3 open'],['History','Past records and receipts','24 entries'],['Insights','Trends and recommendations','Updated today']];const [o,setO]=React.useState(0);
return <Shell title={title} sub={sub}><div className="metrics"><Metric icon={LayoutGrid} label="Status" value="All good" meta="Synced just now" tone="ok"/><Metric icon={ClipboardList} label="Open items" value="3" meta="1 needs attention" tone="warn"/><Metric icon={CalendarDays} label="Next update" value="Tomorrow" meta="Auto-scheduled"/></div>
<div className="sh"><h2>Explore</h2></div><div className="filters">{D.map(([x],i)=><button key={x} className={o===i?'on':''} onClick={()=>setO(i)}>{o===i&&<motion.i layoutId="flt"/>}<span>{x}</span></button>)}</div>
<AnimatePresence mode="wait"><motion.div key={o} className="rows" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0}}>{[0,1,2].map(i=><div className="row" key={i}><div className="rm"><h3>{D[o][0]} · item {i+1}</h3><p>{D[o][1]}</p></div><Badge tone={i===1?'a':undefined}>{i===1?'Pending':D[o][2]}</Badge></div>)}</motion.div></AnimatePresence></Shell>};

function GardenerProfile(){
  const {authUser,setAuthUser,toast}=useApp();
  const [profile,setProfile]=React.useState(null);
  const [loading,setLoading]=React.useState(true);
  const [loadError,setLoadError]=React.useState('');
  const [editing,setEditing]=React.useState(false);
  const [saving,setSaving]=React.useState(false);
  const [saveError,setSaveError]=React.useState('');
  const [form,setForm]=React.useState({fullName:'',phone:'',bio:'',serviceArea:''});

  const loadProfile=React.useCallback(async()=>{
    setLoading(true);setLoadError('');
    try{
      const response=await fetch(`${API_V1}/gardener/profile`,{credentials:'include'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||`Unable to load profile (${response.status}).`);
      if(!data.profile)throw new Error('The server did not return a Gardener profile.');
      const next=data.profile;
      setProfile(next);
      setForm({
        fullName:next.user?.fullName||authUser?.fullName||'',
        phone:next.user?.phone||'',
        bio:next.bio||'',
        serviceArea:next.serviceArea||''
      });
    }catch(error){setLoadError(error.message||'Unable to load your profile.');}
    finally{setLoading(false);}
  },[authUser?.fullName]);

  React.useEffect(()=>{loadProfile();},[loadProfile]);

  const saveProfile=async(event)=>{
    event.preventDefault();
    setSaving(true);setSaveError('');
    try{
      const response=await fetch(`${API_V1}/gardener/profile`,{
        method:'PATCH',credentials:'include',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          fullName:form.fullName.trim(),
          phone:form.phone.trim()||null,
          bio:form.bio.trim()||null,
          serviceArea:form.serviceArea.trim()||null
        })
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||`Unable to save profile (${response.status}).`);
      if(!data.profile)throw new Error('The server did not return the updated profile.');
      setProfile(data.profile);
      setForm({
        fullName:data.profile.user?.fullName||'',
        phone:data.profile.user?.phone||'',
        bio:data.profile.bio||'',
        serviceArea:data.profile.serviceArea||''
      });
      setAuthUser(current=>current?{...current,fullName:data.profile.user?.fullName||current.fullName,phone:data.profile.user?.phone??null}:current);
      setEditing(false);
      toast('Professional profile updated.');
    }catch(error){setSaveError(error.message||'Unable to save your profile.');}
    finally{setSaving(false);}
  };

  const dateLabel=value=>value?new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric'}).format(new Date(value)):'Not available';
  const kycLabels={NOT_STARTED:'Not started',PENDING:'Under review',VERIFIED:'Verified',REJECTED:'Needs attention'};
  const kycTone=profile?.kycStatus==='VERIFIED'?'g':profile?.kycStatus==='REJECTED'?'n':'a';
  const kycDescription={
    NOT_STARTED:'Identity verification has not been started. Your account is active, but KYC approval is required before you can receive job assignments.',
    PENDING:'Your identity verification is awaiting review. Job assignments remain restricted until verification is approved.',
    VERIFIED:'Your identity verification is approved. You meet the KYC requirement for Gardener job assignments.',
    REJECTED:'Your identity verification needs attention. Please contact T-CARE support for the next steps.'
  };

  return <Shell title="Profile" sub="Manage your professional details, service area and account verification." action={!loading&&!loadError?<Btn ghost arrow={false} onClick={()=>{setEditing(value=>!value);setSaveError('');}}> {editing?'Cancel editing':'Edit profile'} </Btn>:null}>
    {loading?<LoadingState label="Loading your Gardener profile…"/>:loadError?<ErrorState title="Your profile could not be loaded" text={loadError} onRetry={loadProfile}/>:<>
      <div className="gardener-profile-summary">
        <div className="gardener-profile-avatar"><UserRound size={25}/></div>
        <div className="gardener-profile-intro">
          <span className="eyebrow">Gardener account</span>
          <h2>{profile.user?.fullName||authUser?.fullName||'Gardener'}</h2>
          <p>{profile.user?.email||authUser?.email||'Email not available'}</p>
        </div>
        <span className="gardener-profile-role">GARDENER</span>
      </div>

      <section className="gardener-profile-section" aria-labelledby="account-verification-title">
        <div className="sh"><div><span className="eyebrow">Account security</span><h2 id="account-verification-title">Account verification</h2></div></div>
        <div className="gardener-status-grid">
          <div className="gardener-status-card"><span>Account status</span><b>{profile.user?.status==='ACTIVE'?'Active':profile.user?.status||'Unknown'}</b><Badge tone={profile.user?.status==='ACTIVE'?'g':'a'}>{profile.user?.status==='ACTIVE'?'Active':'Needs attention'}</Badge></div>
          <div className="gardener-status-card"><span>Email verification</span><b>{authUser?.emailVerified?'Verified':'Not verified'}</b><Badge tone={authUser?.emailVerified?'g':'a'}>{authUser?.emailVerified?'Verified':'Unverified'}</Badge></div>
          <div className="gardener-status-card"><span>Account type</span><b>Gardener</b><Badge>GARDENER</Badge></div>
        </div>
      </section>

      <section className="gardener-profile-section" aria-labelledby="kyc-title">
        <div className="sh"><div><span className="eyebrow">Professional verification</span><h2 id="kyc-title">KYC status</h2></div><Badge tone={kycTone}>{kycLabels[profile.kycStatus]||'Unknown'}</Badge></div>
        <div className={`gardener-kyc-panel ${profile.kycStatus==='VERIFIED'?'is-verified':''}`}>
          <div className="gardener-kyc-icon"><FileText size={21}/></div>
          <div><h3>{kycLabels[profile.kycStatus]||'KYC status unavailable'}</h3><p>{kycDescription[profile.kycStatus]||'Your KYC status could not be interpreted. Please contact T-CARE support.'}</p><Link className="btn ghost" to="/crew/kyc">Manage identity documents <ArrowUpRight size={14}/></Link></div>
        </div>
      </section>

      <section className="gardener-profile-section" aria-labelledby="professional-details-title">
        <div className="sh"><div><span className="eyebrow">Your information</span><h2 id="professional-details-title">Professional details</h2></div></div>
        {editing?<form className="gardener-profile-editor" onSubmit={saveProfile}>
          <label className="field">Full name<input required minLength={2} maxLength={120} value={form.fullName} onChange={event=>setForm(current=>({...current,fullName:event.target.value}))}/></label>
          <label className="field">Phone number<input maxLength={30} value={form.phone} onChange={event=>setForm(current=>({...current,phone:event.target.value}))} placeholder="Add a contact number"/></label>
          <label className="field">Service area<input maxLength={500} value={form.serviceArea} onChange={event=>setForm(current=>({...current,serviceArea:event.target.value}))} placeholder="Areas or locations you serve"/></label>
          <label className="field">Professional bio<textarea maxLength={3000} value={form.bio} onChange={event=>setForm(current=>({...current,bio:event.target.value}))} placeholder="Introduce your gardening experience and services"/></label>
          {saveError&&<div className="gardener-profile-error" role="alert">{saveError}</div>}
          <div className="gardener-profile-actions"><button type="button" className="btn ghost" onClick={()=>{setEditing(false);setSaveError('');}}>Cancel</button><button type="submit" className="btn" disabled={saving}>{saving?'Saving…':'Save profile'}</button></div>
        </form>:<div className="gardener-details-grid">
          <div className="gardener-detail"><span>Full name</span><b>{profile.user?.fullName||'Not added yet'}</b></div>
          <div className="gardener-detail"><span>Email address</span><b>{profile.user?.email||'Not available'}</b></div>
          <div className="gardener-detail"><span>Phone number</span><b>{profile.user?.phone||'Not added yet'}</b></div>
          <div className="gardener-detail"><span>Service area</span><b>{profile.serviceArea||'Not added yet'}</b></div>
          <div className="gardener-detail gardener-detail-wide"><span>Professional bio</span><p>{profile.bio||'No professional bio has been added yet.'}</p></div>
          <div className="gardener-detail"><span>Gardener rating</span><b>{profile.rating==null?'No ratings yet':`${Number(profile.rating).toFixed(1)} / 5`}</b></div>
          <div className="gardener-detail"><span>Profile created</span><b>{dateLabel(profile.createdAt)}</b></div>
        </div>}
        <p className="gardener-profile-footnote">Profile information is loaded from your T-CARE account. Skills and KYC document submission are not yet represented in the current Gardener profile API, so this page does not display placeholder values for them.</p>
      </section>
    </>}
  </Shell>;
}

/* ---------- authentication workflow ---------- */
function Auth(){
  const nav=useNavigate();
  const {pathname}=useLocation();
  const {toast,setAuthUser}=useApp();
  const [mode,setMode]=React.useState(pathname==='/register'?'register':'login');
  const [accountType,setAccountType]=React.useState('CUSTOMER');
  const [step,setStep]=React.useState('form');
  const [form,setForm]=React.useState({fullName:'',email:'',password:'',phone:''});
  const [verificationEmail,setVerificationEmail]=React.useState('');
  const [code,setCode]=React.useState('');
  const [busy,setBusy]=React.useState(false);
  const [error,setError]=React.useState('');
  const [resendSeconds,setResendSeconds]=React.useState(0);

  React.useEffect(()=>{
    if(resendSeconds<=0)return;
    const timer=setTimeout(()=>setResendSeconds(value=>Math.max(0,value-1)),1000);
    return()=>clearTimeout(timer);
  },[resendSeconds]);

  const update=(key,value)=>setForm(current=>({...current,[key]:value}));
  const goToWorkspace=user=>{
    setAuthUser(user);
    toast(`Signed in as ${user.role.toLowerCase()}.`);
    nav(workspaceForRole(user.role),{replace:true});
  };

  const submit=async event=>{
    event.preventDefault();
    setError('');
    setBusy(true);
    try{
      if(mode==='login'){
        const result=await authApi('login',{email:form.email,password:form.password});
        goToWorkspace(result.user);
      }else{
        const result=await authApi('register',{
          fullName:form.fullName,
          email:form.email,
          password:form.password,
          ...(form.phone.trim()?{phone:form.phone.trim()}:{}),
          accountType
        });
        setVerificationEmail(result.email||form.email);
        setStep('verify');
        setResendSeconds(60);
        toast('Verification code sent to your email.');
      }
    }catch(requestError){
      const data=requestError.data||{};
      setError(requestError.message||'Unable to complete the request.');
      if(data.verificationRequired||data.accountCreated){
        setVerificationEmail(data.email||form.email);
        setStep('verify');
        setCode('');
      }
    }finally{
      setBusy(false);
    }
  };

  const verify=async event=>{
    event.preventDefault();
    setError('');
    setBusy(true);
    try{
      const result=await authApi('verify-email',{email:verificationEmail,code});
      goToWorkspace(result.user);
    }catch(requestError){
      setError(requestError.message||'Unable to verify this code.');
    }finally{
      setBusy(false);
    }
  };

  const resend=async()=>{
    if(resendSeconds>0||busy)return;
    setError('');
    setBusy(true);
    try{
      await authApi('resend-verification',{email:verificationEmail});
      setResendSeconds(60);
      toast('If the account is eligible, a new verification code has been sent.');
    }catch(requestError){
      setError(requestError.message||'Unable to request a new code.');
    }finally{
      setBusy(false);
    }
  };

  const switchMode=next=>{
    setMode(next);
    setStep('form');
    setError('');
    setCode('');
  };

  return <div className="auth">
    <div className="auth-art">
      <Link to="/" className="brand"><Leaf size={22}/><b>T-CARE</b></Link>
      <div><span className="eyebrow">A quieter way to care</span><h1>Welcome to your <em>green space.</em></h1><p>Manage plants, book trusted care and keep every visit beautifully organized.</p></div>
      <div className="auth-proof"><Check size={16}/> Secure access for every T-CARE account.</div>
      <AuthScenery/>
    </div>
    <div className="auth-card">
      <div className="auth-tabs">
        <button className={mode==='login'?'on':''} onClick={()=>switchMode('login')}>Sign in</button>
        <button className={mode==='register'?'on':''} onClick={()=>switchMode('register')}>Create account</button>
      </div>

      {step==='verify' ? <>
        <div className="auth-heading">
          <span className="eyebrow">Email verification</span>
          <h2>Check your inbox.</h2>
          <p>Enter the six-digit code sent to <strong>{verificationEmail}</strong>. The code expires in 10 minutes.</p>
        </div>
        <form onSubmit={verify}>
          <label>Verification code
            <input required autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000"/>
          </label>
          {error&&<p className="auth-alert" role="alert">{error}</p>}
          <button className="btn full" type="submit" disabled={busy||code.length!==6}>{busy?'Verifying…':'Verify email'} <ArrowUpRight size={16}/></button>
          <button className="text-btn auth-resend" type="button" onClick={resend} disabled={busy||resendSeconds>0}>
            {resendSeconds>0?`Resend code in ${resendSeconds}s`:'Resend verification code'}
          </button>
          <button className="text-btn auth-resend" type="button" onClick={()=>{setStep('form');setError('');setCode('')}}>Back to sign in</button>
        </form>
      </> : <>
        <div className="auth-heading">
          <span className="eyebrow">{mode==='login'?'Secure workspace access':'Start your T-CARE journey'}</span>
          <h2>{mode==='login'?'Welcome back.':'Create your account.'}</h2>
          <p>{mode==='login'?'Your workspace is selected from your verified account role.': 'Choose how you will use T-CARE. Your account type is recorded and enforced by the backend.'}</p>
        </div>
        {mode==='register'&&<div className="role-pick">
          {[
            ['CUSTOMER','🌿','Customer','Manage plants and book care.'],
            ['GARDENER','🧑‍🌾','Gardener','Receive and complete service jobs.']
          ].map(([value,icon,label,description])=><button type="button" key={value} className={accountType===value?'on':''} onClick={()=>setAccountType(value)}><span>{icon}</span><b>{label}</b><small>{description}</small></button>)}
        </div>}
        <form onSubmit={submit}>
          {mode==='register'&&<label>Full name<input required minLength={2} maxLength={100} autoComplete="name" value={form.fullName} onChange={event=>update('fullName',event.target.value)} placeholder="Your full name"/></label>}
          <label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={event=>update('email',event.target.value)} placeholder="you@example.com"/></label>
          {mode==='register'&&<label>Phone number <span className="field-optional">(optional)</span><input type="tel" autoComplete="tel" value={form.phone} onChange={event=>update('phone',event.target.value)} placeholder="Your contact number"/></label>}
          <label>Password<input required type="password" minLength={mode==='register'?8:1} maxLength={72} autoComplete={mode==='login'?'current-password':'new-password'} value={form.password} onChange={event=>update('password',event.target.value)} placeholder="At least 8 characters"/></label>
          {error&&<p className="auth-alert" role="alert">{error}</p>}
          <div className="form-row">
            <label className="check"><input type="checkbox"/> Remember me</label>
            {mode==='login'&&<button type="button" className="text-btn" onClick={()=>toast('Password recovery will be configured in the account-management phase.')}>Forgot password?</button>}
          </div>
          <button className="btn full" type="submit" disabled={busy}>{busy?(mode==='login'?'Signing in…':'Creating account…'):(mode==='login'?'Sign in to workspace':'Create account')} <ArrowUpRight size={16}/></button>
        </form>
        <p className="auth-note">Email verification is required before an account can sign in. Admin accounts are provisioned separately.</p>
      </>}
      <Link className="back-home" to="/">← Back to T-CARE home</Link>
    </div>
  </div>
}

/* ---------- customer ---------- */
function GardenHome(){const {plants}=useApp();return <Shell title="Good afternoon, Kazumi." sub="Here’s what’s happening with your plants today.">
  <div className="hero-card"><div><span className="eyebrow">Next care</span><h2>{plants[0].name}</h2><p>Water + soil check recommended today.</p><Btn to="/garden/plants/0">Open plant</Btn></div><motion.div className="blob" animate={{rotate:360}} transition={{repeat:Infinity,duration:40,ease:'linear'}}><Leaf size={64} strokeWidth={1.2}/></motion.div></div>
  <div className="metrics"><Metric icon={CalendarDays} label="Upcoming service" value="Plant Care · 30 Sep" meta="10:30 AM · Confirmed"/><Metric icon={Heart} label="Plant health" value="3 of 4 thriving" meta="1 needs attention" tone="warn"/><Metric icon={WalletCards} label="Subscription" value="Green Monthly" meta="12 plants · Active" tone="ok"/></div>
  <div className="sh"><h2>Your care plan</h2><Link className="tl" to="/garden/visits">All visits <ArrowUpRight size={15}/></Link></div><Bookings rows={bookings.slice(0,3)}/></Shell>}
function GardenShop(){const [cat,setCat]=React.useState('All');const list=services.filter(s=>cat==='All'||s.cat===cat);
  return <Shell title="Services" sub="Choose the kind of care your plants need.">
  <div className="feature"><div><span className="chip">Most booked this month</span><h2>Plant <em>Rescue</em></h2><p>Yellowing leaves, drooping stems, mystery pests — we diagnose and bring your plant back.</p><Btn to="/garden/book">Book a rescue</Btn> <span className="rate"><Star size={14}/> 4.9 · 320 rescues</span></div><div className="orb"><i/><i/><Stethoscope size={54} strokeWidth={1.3}/></div></div>
  <div className="filters">{['All','Care','Design','Shop & Learn'].map(c=><button key={c} className={cat===c?'on':''} onClick={()=>setCat(c)}>{cat===c&&<motion.i layoutId="flt"/>}<span>{c}</span></button>)}</div>
  <motion.div layout className="cards"><AnimatePresence mode="popLayout">{list.map((s,n)=><motion.article layout key={s.name} className="scard flat" style={{'--h':s.hue}} initial={{opacity:0,scale:.9}} animate={{opacity:1,scale:1,transition:{delay:n*.05}}} exit={{opacity:0,scale:.9}} whileHover={{y:-6}}><s.icon size={28} strokeWidth={1.4}/><span className="price">{s.price?<>from <b>₹{s.price.toLocaleString()}</b></>:<b>Free</b>}</span><h3>{s.name}</h3><p>{s.desc}</p><div className="foot"><span><Clock3 size={13}/> {s.time}</span><Link to="/garden/book">Book <ArrowUpRight size={14}/></Link></div></motion.article>)}</AnimatePresence></motion.div></Shell>}
function GardenPlants(){const {plants,openAdd}=useApp();const [filter,setFilter]=React.useState('All');const visible=plants.filter(p=>filter==='All'||(filter==='Healthy'&&/Healthy|Excellent/.test(p.status))||(filter==='Needs attention'&&!/Healthy|Excellent/.test(p.status)));return <Shell title="My plants" sub="Your collection, care history and next actions." action={<Btn onClick={openAdd} arrow={false}><Plus size={16}/> Add plant</Btn>}>
  <Filter items={['All','Healthy','Needs attention']} value={filter} onChange={setFilter}/>
  <div className="cards"><AnimatePresence mode="popLayout">{visible.map((p,i)=>{const realIndex=plants.findIndex(x=>x.name===p.name);return <motion.div layout key={p.name} className="ptile" initial={{opacity:0,scale:.8,rotate:-4}} animate={{opacity:1,scale:1,rotate:0}} exit={{opacity:0,scale:.8}} whileHover={{y:-6,rotate:1}}><div className="pp" style={{'--h':90+i*35}}><Leaf size={40} strokeWidth={1.2}/></div><small>{p.type}</small><h3>{p.name}</h3><Badge>{p.status}</Badge><p><Droplets size={13}/> Next care: {p.next}</p><Link to={`/garden/plants/${realIndex}`}>View plant <ArrowUpRight size={14}/></Link></motion.div>})}</AnimatePresence></div>
  {!visible.length&&<div className="empty-state"><Leaf size={30}/><h3>No plants in this view</h3><p>Add a plant or switch the filter to see your collection.</p><Btn onClick={openAdd}>Add plant</Btn></div>}
</Shell>}
function PlantDetail(){const {id}=useParams();const {plants}=useApp();const p=plants[id]||plants[0];const [tab,setTab]=React.useState('Overview');return <Shell title={p.name} sub="Living record · Indoor · Living room" action={<Btn to="/garden/book" ghost arrow={false}>Book care</Btn>}>
  <div className="hero-card"><div><Badge tone={/Needs/.test(p.status)?'a':'g'}>{p.status}</Badge><h2>{p.name}</h2><p>Last serviced 18 Sep · Next care {p.next.toLowerCase()}</p><div className="mini-actions"><Btn to="/garden/book" arrow={false}>Book service</Btn><Btn ghost arrow={false} onClick={()=>{}}>Edit plant</Btn></div></div><div className="blob"><Leaf size={64} strokeWidth={1.2}/></div></div>
  <div className="filters">{['Overview','Care plan','History'].map(x=><button type="button" key={x} className={tab===x?'on':''} onClick={()=>setTab(x)}>{tab===x&&<motion.i layoutId="plant-tab"/>}<span>{x}</span></button>)}</div>
  {tab==='Overview'&&<><div className="quad">{[[Droplets,'Watering','Today','Medium moisture'],[Sun,'Sunlight','Bright indirect','6–8 hrs/day'],[Scissors,'Pruning','Due soon','2 leaves to inspect'],[Heart,'Health',p.status,/Needs/.test(p.status)?'Check leaves and soil today':'No issues reported']].map(([I,t,v,m],i)=><motion.div key={t} className="qc" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:i*.07}}><I size={20}/><small>{t}</small><h3>{v}</h3><p>{m}</p></motion.div>)}</div><div className="split-note"><div><span className="eyebrow">Next action</span><h3>{/Needs/.test(p.status)?'Inspect leaves and check soil moisture':'Water + rotate toward the light'}</h3><p>This task is shown as a frontend reminder. The care schedule will become data-driven in the backend phase.</p></div><Btn to="/garden/book">Book a visit</Btn></div></>}
  {tab==='Care plan'&&<div className="detail-grid"><div className="detail-card"><span className="eyebrow">Routine</span><h3>Weekly care</h3><p>Water when the top layer is dry, rotate weekly and inspect leaves for pests.</p></div><div className="detail-card"><span className="eyebrow">Environment</span><h3>Bright indirect light</h3><p>Keep away from harsh afternoon sun and cold drafts.</p></div><div className="detail-card"><span className="eyebrow">Reminder</span><h3>Next check · {p.next}</h3><p>Frontend mock reminder — notifications will be connected later.</p></div></div>}
  {tab==='History'&&<><div className="sh"><h2>Recent activity</h2></div><div className="tline">{['Plant Care completed · 18 Sep','Soil check completed · 18 Sep','Watering reminder · 12 Sep'].map((x,i)=><div key={x}><span className="dot"/><p>{x}<small>{i?'Previously':'Latest'}</small></p></div>)}</div></>}
</Shell>}

function BookingConfirmation(){const {id}=useParams();const {updateBooking}=useApp();React.useEffect(()=>updateBooking(id,{state:'Confirmed'}),[id]);return <Shell title="Booking confirmed" sub="Your request is saved in this frontend workflow."><div className="confirmation"><div className="confirm-icon"><Check size={32}/></div><span className="eyebrow">Booking {id}</span><h2>Your plants are on the calendar.</h2><p>Plant Care for 3 plants · 30 Sep 2026 · 10:30 AM. A gardener will be assigned before the visit.</p><div className="confirm-grid"><div><small>Service</small><b>Plant Care</b></div><div><small>Location</small><b>Home · 24 Green Avenue</b></div><div><small>Estimated total</small><b>₹499</b></div></div><div className="acts"><Btn to={`/garden/visits/${id}`}>View booking</Btn><Btn to="/garden" ghost arrow={false}>Back to dashboard</Btn></div></div></Shell>}

function BookingDetail(){const {id}=useParams();const {bookingOverrides}=useApp();const base=bookingById(id);const ov=bookingOverrides[id]||{};const b={...base,...ov};const state=b.state||base.state;const completed=state==='Completed';const activeIndex=bookingStateIndex[state]??0;return <Shell title={`Booking ${b.id}`} sub="One shared record across customer, gardener and admin."><div className="booking-head"><div><Badge>{bookingStatusLabel[state]||state}</Badge><h2>{b.service}</h2><p>{b.plants} · {b.date} · {b.time}</p></div><Btn to={completed?`/garden/plants/0`:`/garden/tracking/${b.id}`}>{completed?'View plant report':'Track gardener'}</Btn></div><div className="detail-grid"><div className="detail-card"><span className="eyebrow">Gardener</span><h3>{b.gardener||'Awaiting assignment'}</h3><p>{b.gardener?'Verified T-CARE gardener · 4.9 rating':'Admin will assign an available gardener.'}</p><Btn ghost arrow={false} onClick={()=>{}}>View profile</Btn></div><div className="detail-card"><span className="eyebrow">Visit</span><h3>{b.time}</h3><p>{b.date}<br/>{b.address}</p></div><div className="detail-card"><span className="eyebrow">Payment</span><h3>₹{b.price.toLocaleString()}</h3><p>Payment status · Frontend demo state</p></div></div><div className="status-panel"><div className="sh"><h2>Service timeline</h2><Badge>{bookingStatusLabel[state]||state}</Badge></div><div className="status-line">{bookingTimeline.map((x,i)=><div className={i<=activeIndex?'done':''} key={x}><span>{i<=activeIndex?<Check size={12}/>:i+1}</span><p>{x}<small>{i===activeIndex?'Current status':i<activeIndex?'Completed':'Upcoming'}</small></p></div>)}</div></div>{completed&&<div className="report-card"><span className="eyebrow">Health report</span><h3>Plant rescue completed</h3><p>Soil moisture improved, damaged leaves pruned and a follow-up check recommended in 7 days.</p><Btn to="/garden/plants/0">View plant history</Btn></div>}</Shell>}
function Tracking(){const {id}=useParams();const {bookingOverrides}=useApp();const base=bookingById(id);const b={...base,...(bookingOverrides[id]||{})};const state=b.state||base.state;const active=bookingStateIndex[state]??0;return <Shell title="Track your gardener" sub={`${b.service} · ${b.date} · ${b.time}`}><div className="track-hero"><div className="map-placeholder" role="img" aria-label="Live map placeholder"><MapPin size={42}/><span>Live map placeholder</span><small>GPS tracking connects in the backend phase.</small></div><div className="track-card"><Badge>{bookingStatusLabel[state]||state}</Badge><h2>{b.gardener||'Awaiting assignment'}</h2><p>{b.gardener?'Verified gardener · 4.9 rating':'Admin assignment is pending.'}</p><div className="eta"><Clock3 size={18}/><div><small>Next update</small><b>{state==='Completed'?'Visit completed':b.eta}</b></div></div><Btn to={`/garden/visits/${b.id}`} ghost arrow={false}>Back to booking</Btn></div></div><div className="status-panel"><div className="sh"><h2>Visit status</h2></div><div className="status-line">{bookingTimeline.map((x,i)=><div className={i<=active?'done':''} key={x}><span>{i<=active?<Check size={12}/>:i+1}</span><p>{x}<small>{i<=active?'Done':'Waiting'}</small></p></div>)}</div></div></Shell>}
function Book(){
  const {toast,plants,updateBooking}=useApp();const nav=useNavigate();const [step,setStep]=React.useState(0);
  const [b,setB]=React.useState({svc:services[0],pl:['Monstera deliciosa'],date:'30 Sep',time:'10:30 AM',addr:'Home · 24 Green Avenue'});
  const S=['Service','Plants','Schedule','Address','Review'];const togglePl=n=>setB(x=>({...x,pl:x.pl.includes(n)?x.pl.filter(a=>a!==n):[...x.pl,n]}));
  const go=()=>{if(step<4)setStep(step+1);else{updateBooking('TC-1042',{state:'Confirmed',gardener:''});toast('Booking confirmed — a gardener will be assigned shortly');nav('/garden/booking-confirmed/TC-1042')}};
  return <Shell title="Book a service" sub="Tell us what your plants need. Review everything before payment.">
  <p className="sentence">I need <u onClick={()=>setStep(0)}>{b.svc.name}</u> for <u onClick={()=>setStep(1)}>{b.pl.length} plant{b.pl.length!==1&&'s'}</u> on <u onClick={()=>setStep(2)}>{b.date}, {b.time}</u> at <u onClick={()=>setStep(3)}>{b.addr.split(' · ')[0]}</u>.</p>
  <div className="dots">{S.map((x,i)=><button key={x} className={i===step?'on':i<step?'done':''} onClick={()=>setStep(i)}>{i<step?<Check size={12}/>:i+1}<span>{x}</span></button>)}</div>
  <div className="bk"><AnimatePresence mode="wait"><motion.div key={step} className="bmain" initial={{opacity:0,x:60}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-60}} transition={{duration:.3}}>
   {step===0&&<div className="pick">{services.slice(0,6).map(s=><button key={s.name} className={b.svc.name===s.name?'on':''} onClick={()=>{setB({...b,svc:s});setStep(1)}}><s.icon size={22}/><b>{s.name}</b><small>{s.desc}</small></button>)}</div>}
   {step===1&&<div className="pick one">{plants.map(p=><button key={p.name} className={b.pl.includes(p.name)?'on':''} onClick={()=>togglePl(p.name)}><Leaf size={20}/><b>{p.name}</b><small>{p.type} · Included</small>{b.pl.includes(p.name)&&<Check size={16}/>}</button>)}</div>}
   {step===2&&<><div className="pills">{['30 Sep','01 Oct','02 Oct','04 Oct'].map((d,i)=><button key={d} className={b.date===d?'on':''} onClick={()=>setB({...b,date:d})}><b>{d}</b><small>{['Tue','Wed','Thu','Sat'][i]}</small></button>)}</div><div className="pills t">{['10:30 AM','12:00 PM','02:00 PM','04:30 PM'].map(t=><button key={t} className={b.time===t?'on':''} onClick={()=>setB({...b,time:t})}>{t}</button>)}</div></>}
   {step===3&&<div className="pick one">{['Home · 24 Green Avenue','Office · 8 Riverfront Road'].map(a=><button key={a} className={b.addr===a?'on':''} onClick={()=>setB({...b,addr:a})}><MapPin size={20}/><b>{a.split(' · ')[0]}</b><small>{a.split(' · ')[1]}, Ahmedabad</small></button>)}</div>}
   {step===4&&<div className="rev">{[['Service',b.svc.name],['Plants',b.pl.join(', ')||'—'],['Date',`${b.date} · ${b.time}`],['Address',b.addr],['Notes','Please check the soil before watering.']].map(([a,v])=><div key={a}><span>{a}</span><b>{v}</b></div>)}</div>}
  </motion.div></AnimatePresence>
  <aside className="sum"><span className="eyebrow">Summary</span><h3>{b.svc.name}</h3><div><span>Service</span><b>₹{b.svc.price}</b></div><div><span>{b.pl.length} plants</span><b>Included</b></div><div><span>Convenience</span><b>₹0</b></div><div className="tot"><span>Total</span><b>₹{b.svc.price}</b></div><Btn full onClick={go}>{step<4?'Continue':'Confirm booking'}</Btn></aside></div></Shell>}

/* ---------- gardener + admin ---------- */
function Jobs({all,rows}){const {jobOverrides}=useApp();const source=crewJobs.map(x=>({...x,...(jobOverrides[x.id]||{})}));const list=rows??(all?source:source.slice(0,3));return <div className="rows">{list.map((x,i)=><Link key={x.id} to={`/crew/jobs/${x.id}`} className="row row-link crew-job-row"><div className="rt"><b>{x.time}</b><small>{x.date}</small></div><div className="rm"><Badge tone={x.status==='Assigned'&&i===0?'a':undefined}>{x.priority==='Next'?'Next':x.status}</Badge><h3>{x.service}</h3><p>{x.customer} · {x.address}</p></div><ArrowUpRight size={18}/></Link>)}</div>}
const CrewHome=()=> <Shell title="Good afternoon, Aarav." sub="Your route and earnings snapshot."><div className="metrics four"><Metric icon={ClipboardList} label="Today's jobs" value="4" meta="1 completed"/><Metric icon={Clock3} label="Next visit" value="10:30 AM" meta="Plant Care · Kabir"/><Metric icon={Star} label="Rating" value="4.9 / 5" meta="128 reviews"/><Metric icon={WalletCards} label="This month" value="₹28,450" meta="+12% vs last month" tone="ok"/></div><div className="sh"><h2>Today's route</h2><Link className="tl" to="/crew/jobs">All jobs <ArrowUpRight size={15}/></Link></div><Jobs/></Shell>;
function CrewJobDetail(){
 const {id}=useParams(); const {toast,jobOverrides,updateJob,updateBooking}=useApp(); const baseJob=crewJobs.find(x=>x.id===id)||crewJobs[0]; const job={...baseJob,...(jobOverrides[baseJob.id]||{})};
 const [status,setStatus]=React.useState(job.status); const [checked,setChecked]=React.useState(()=>job.status==='Completed'?Object.fromEntries(careChecklist.map(x=>[x,true])):{}); const [obs,setObs]=React.useState(''); const [recommendation,setRecommendation]=React.useState(''); const [photos,setPhotos]=React.useState(job.status==='Completed'?3:0); const started=status==='In progress'||status==='Completed'; const completed=status==='Completed';
 const accept=()=>{setStatus('Accepted');updateJob(job.id,{status:'Accepted',priority:'Accepted'});updateBooking(job.bookingId,{state:'Gardener Accepted'});toast(`${job.id} accepted — the customer has been notified in this frontend workflow`)}; const start=()=>{setStatus('In progress');updateJob(job.id,{status:'In progress'});updateBooking(job.bookingId,{state:'Service started'});toast(`${job.id} started — service checklist is now active`)}; const complete=()=>{if(!careChecklist.every(x=>checked[x])){toast('Complete every care checklist item before closing the job');return}setStatus('Completed');updateJob(job.id,{status:'Completed',priority:'Completed'});updateBooking(job.bookingId,{state:'Completed'});toast(`${job.id} completed — health report is ready`)};
 return <Shell title={job.service} sub={`${job.id} · ${job.customer} · ${job.date} · ${job.time}`} action={completed?<Btn to={`/crew/jobs/${job.id}/report`}>View report</Btn>:status==='New'||status==='Assigned'?<Btn onClick={accept}>Accept job</Btn>:<Btn onClick={started?complete:start}>{started?'Complete job':'Start job'}</Btn>}>
 <div className="job-head"><div><Badge tone={completed?'n':status==='In progress'?'a':undefined}>{status}</Badge><h2>{job.customer}</h2><p>{job.address}</p></div><div className="job-head-meta"><span><small>Service</small><b>{job.service}</b></span><span><small>Value</small><b>₹{job.price}</b></span><span><small>Booking</small><b>{job.bookingId}</b></span></div></div>
 <div className="job-grid"><div>
 <section className="workflow-card"><div className="sh"><div><span className="eyebrow">Step 1</span><h2>Visit brief</h2></div><Badge>{job.priority}</Badge></div><div className="brief-grid"><div><small>Plants</small><b>{job.plants.join(' · ')}</b></div><div><small>Instructions</small><b>{job.instructions}</b></div></div></section>
 <section className="workflow-card"><div className="sh"><div><span className="eyebrow">Step 2</span><h2>Care checklist</h2></div><span className="progress-note">{Object.values(checked).filter(Boolean).length}/{careChecklist.length}</span></div><div className="checklist">{careChecklist.map(x=><label key={x} className={checked[x]?'checked':''}><input type="checkbox" checked={!!checked[x]} onChange={()=>setChecked(v=>({...v,[x]:!v[x]}))} disabled={!started||completed}/><span>{checked[x]?<Check size={14}/>:null}</span><b>{x}</b></label>)}</div>{!started&&<p className="workflow-hint">Start the job to unlock the care checklist.</p>}</section>
 <section className="workflow-card"><div className="sh"><div><span className="eyebrow">Step 3</span><h2>Observations & photos</h2></div><Badge>{photos} photo{photos!==1?'s':''}</Badge></div><div className="photo-strip">{Array.from({length:Math.max(photos,1)}).slice(0,4).map((_,i)=><div className={i<photos?'mock-photo':'mock-photo empty-photo'} key={i}><Leaf size={22}/><small>{i<photos?`Photo ${i+1}`:'Add photo'}</small></div>)}<button className="photo-add" onClick={()=>{setPhotos(p=>Math.min(p+1,4));toast('Photo placeholder added to this frontend report')}} disabled={!started||photos>=4}><Plus size={18}/><span>Add photo</span></button></div><label className="field">Observations<textarea value={obs} onChange={e=>setObs(e.target.value)} disabled={!started||completed} placeholder="Describe plant condition, soil, pests or visible changes…"/></label></section>
 <section className="workflow-card"><div className="sh"><div><span className="eyebrow">Step 4</span><h2>Recommendation</h2></div></div><label className="field">Next-care recommendation<textarea value={recommendation} onChange={e=>setRecommendation(e.target.value)} disabled={!started||completed} placeholder="What should the customer do next, and when?"/></label>{completed?<div className="complete-note"><Check size={18}/><div><b>Job completed</b><p>The report is ready to review and will later sync to the customer's plant history.</p></div></div>:<p className="workflow-hint">This report will become the customer's plant health record in the backend phase.</p>}</section>
 </div><aside className="job-side"><div className="workflow-card"><span className="eyebrow">Job actions</span><h3>{completed?'Service completed':started?'Service in progress':status==='Accepted'?'Ready to start':'New assignment'}</h3><p>{completed?'The health report is ready for review.':started?'Work through the checklist, capture observations and close the visit when complete.':status==='Accepted'?'Review the address and instructions, then start the service when you arrive.':'Accept the assignment first, then prepare for the visit.'}</p>{status==='New'||status==='Assigned'?<Btn full onClick={accept}>Accept job</Btn>:status==='Accepted'?<Btn full onClick={start}>Start job</Btn>:completed?<Btn full to={`/crew/jobs/${job.id}/report`}>Open health report</Btn>:<Btn full onClick={complete}>Complete job</Btn>}</div><div className="workflow-card"><span className="eyebrow">Customer</span><h3>{job.customer}</h3><p>{job.address}</p><div className="mini-actions"><Btn ghost arrow={false} onClick={()=>toast('Customer contact will connect to the backend phase')}>Contact</Btn><Btn ghost arrow={false} onClick={()=>toast('Navigation will connect to maps in the integration phase')}>Navigate</Btn></div></div><Link className="back-link" to="/crew/jobs">← Back to jobs</Link></aside></div>
 </Shell>;
}
function CrewReport(){const {id}=useParams();const {jobOverrides}=useApp();const baseJob=crewJobs.find(x=>x.id===id)||crewJobs[2];const job={...baseJob,...(jobOverrides[baseJob.id]||{})};return <Shell title="Health report" sub={`${job.id} · ${job.customer} · Completed visit`} action={<Btn to={`/crew/jobs/${job.id}`} ghost arrow={false}>Back to job</Btn>}><div className="report-hero"><div><Badge>Completed</Badge><h2>{job.service} report</h2><p>This frontend report is the handoff between the gardener's visit and the customer's plant history.</p></div><div className="report-score"><b>Good</b><span>Plant condition</span></div></div><div className="report-grid"><div className="workflow-card"><span className="eyebrow">Observations</span><h3>Overall plant condition is stable.</h3><p>Soil moisture was checked, damaged foliage was addressed and no major pest activity was observed during the visit.</p></div><div className="workflow-card"><span className="eyebrow">Work performed</span><h3>Care checklist completed</h3><p>Inspection · watering · leaf cleaning · pruning · pest check · photos.</p></div><div className="workflow-card"><span className="eyebrow">Recommendation</span><h3>Follow-up in 7 days</h3><p>Keep the Peace Lily away from direct afternoon sun and re-check soil moisture before the next watering.</p></div></div><div className="report-footer"><div><span className="eyebrow">Next system handoff</span><h3>Customer plant history</h3><p>Backend phase will persist this report against the booking and each affected plant.</p></div><Btn to="/crew/jobs">Return to jobs</Btn></div></Shell>}
const CrewReports=()=> <Shell title="Plant health reports" sub="Document condition, work performed and next-care recommendations." action={<Btn to="/crew/jobs/JOB-1042">New report</Btn>}><div className="cards">{crewJobs.filter(x=>x.status==='Completed'||x.id==='JOB-1042').map((j,i)=><Link to={`/crew/jobs/${j.id}/report`} key={j.id} className="ptile"><div className="pp" style={{'--h':90+i*40}}><Leaf size={34} strokeWidth={1.2}/></div><Badge tone={j.status==='Completed'?'g':'a'}>{j.status==='Completed'?'Healthy':'Draft'}</Badge><h3>{j.plants[0]}</h3><p>{j.service} · {j.customer} · {j.date}</p><small>Report {j.status==='Completed'?'ready':'in progress'}</small></Link>)}</div></Shell>;

const CrewPay=()=><Shell title="Earnings" sub="Track service earnings and payout history."><div className="metrics"><Metric icon={WalletCards} label="Available" value="₹12,840" meta="Ready for payout" tone="ok"/><Metric icon={TrendingUp} label="This month" value="₹28,450" meta="31 completed jobs"/><Metric icon={CalendarDays} label="Last payout" value="₹18,200" meta="25 Sep 2026"/></div><div className="sh"><h2>Recent payouts</h2></div><div className="rows">{['25 Sep · ₹18,200','10 Sep · ₹21,650','25 Aug · ₹19,480','10 Aug · ₹17,900'].map(x=><div className="row" key={x}><div className="rm"><h3>{x}</h3></div><Badge>Paid</Badge></div>)}</div></Shell>;
const adminCustomers=[
{id:'CUS-001',name:'Kabir Mehta',email:'kabir@example.com',phone:'+91 98••• 2145',bookings:12,plants:8,plan:'Green Monthly',status:'Active',joined:'12 Jan 2026'},
{id:'CUS-002',name:'Neha Shah',email:'neha@example.com',phone:'+91 97••• 8042',bookings:8,plants:14,plan:'None',status:'Active',joined:'08 Feb 2026'},
{id:'CUS-003',name:'Aisha Patel',email:'aisha@example.com',phone:'+91 99••• 6710',bookings:21,plants:19,plan:'Green Quarterly',status:'Active',joined:'21 Nov 2025'},
{id:'CUS-004',name:'Rohan Desai',email:'rohan@example.com',phone:'+91 96••• 3318',bookings:3,plants:4,plan:'None',status:'Blocked',joined:'04 Mar 2026'}
];
const adminGardenerData=[
{id:'GRD-001',name:'Aarav Patel',email:'aarav@tcare.example',phone:'+91 98••• 1022',jobs:148,rating:'4.9',status:'Active',area:'Ahmedabad West',services:'Care · Rescue · Maintenance'},
{id:'GRD-002',name:'Meera Shah',email:'meera@tcare.example',phone:'+91 97••• 4431',jobs:126,rating:'4.8',status:'Active',area:'Ahmedabad Central',services:'Design · Setup · Events'},
{id:'GRD-003',name:'Riya Mehta',email:'riya@tcare.example',phone:'+91 99••• 8120',jobs:98,rating:'4.7',status:'Pending',area:'Ahmedabad East',services:'Care · Rescue'},
{id:'GRD-004',name:'Dev Joshi',email:'dev@tcare.example',phone:'+91 96••• 5524',jobs:172,rating:'4.9',status:'Active',area:'Ahmedabad North',services:'Maintenance · Care'}
];
const adminTx=[['TX-2048','30 Sep 2026','Kabir Mehta','Plant Care','₹499','Paid'],['TX-2047','30 Sep 2026','Neha Shah','Green Makeover','₹3,499','Paid'],['TX-2046','29 Sep 2026','Aisha Patel','Maintenance','₹1,299','Pending'],['TX-2041','27 Sep 2026','Rohan Desai','Plant Rescue','₹799','Refunded']];
function AdminHeader({eyebrow='Operations',title,sub,action}){return <div className="admin-context"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{sub}</p></div>{action}</div>}
function AdminCustomers(){const {adminOverrides,updateAdmin,toast}=useApp();const [filter,setFilter]=React.useState('All');const [q,setQ]=React.useState('');const source=adminCustomers.map(x=>({...x,...(adminOverrides[x.id]||{})}));const visible=source.filter(x=>(filter==='All'||x.status===filter)&&(`${x.name} ${x.email}`.toLowerCase().includes(q.toLowerCase())));return <Shell title="Customers" sub="Manage customer profiles, plants, bookings and subscription status." action={<Btn onClick={()=>toast('Customer creation form is ready for the backend phase')}>Add customer</Btn>}><AdminHeader title="Customer operations" sub={`${visible.length} visible customers · profile and account controls are frontend-only.`} action={<div className="admin-search"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search customers"/></div>}/><Filter items={['All','Active','Blocked']} value={filter} onChange={setFilter}/><div className="admin-table"><div className="admin-row admin-head"><span>Customer</span><span>Plants</span><span>Bookings</span><span>Plan</span><span>Status</span><span>Actions</span></div>{visible.map(c=><motion.div className="admin-row" key={c.id} layout><div><b>{c.name}</b><small>{c.email}</small></div><span>{c.plants}</span><span>{c.bookings}</span><span>{c.plan}</span><Badge>{c.status}</Badge><div className="admin-actions"><Btn ghost arrow={false} to={`/hq/people/${c.id}`}>View</Btn><button className="icon-action" title="Toggle customer status" onClick={()=>updateAdmin(c.id,{status:c.status==='Active'?'Blocked':'Active'})}><SlidersHorizontal size={15}/></button></div></motion.div>)}</div></Shell>}
function AdminCustomerDetail(){const {id}=useParams();const c=adminCustomers.find(x=>x.id===id)||adminCustomers[0];const {toast}=useApp();return <Shell title={c.name} sub={`${c.id} · Joined ${c.joined}`} action={<Btn to="/hq/people" ghost arrow={false}>Back to customers</Btn>}><div className="admin-profile"><div className="profile-orb">{c.name.split(' ').map(x=>x[0]).join('')}</div><div><Badge>{c.status}</Badge><h2>{c.name}</h2><p>{c.email} · {c.phone}</p></div><div className="profile-actions"><Btn ghost arrow={false} onClick={()=>toast('Customer edit form is ready for the backend phase')}>Edit profile</Btn><Btn onClick={()=>toast('Booking creation will connect to the backend phase')}>New booking</Btn></div></div><div className="metrics four"><Metric icon={Flower2} label="Plants" value={c.plants} meta="Active plant records"/><Metric icon={ClipboardList} label="Bookings" value={c.bookings} meta="All-time services"/><Metric icon={WalletCards} label="Plan" value={c.plan} meta="Subscription state"/><Metric icon={CreditCard} label="Account" value={c.status} meta="Current access"/></div><div className="detail-grid"><div className="detail-card"><span className="eyebrow">Plants</span><h3>8 tracked plants</h3><p>Plant profiles, care history and upcoming tasks will be linked here.</p><Btn ghost arrow={false} to="/hq/botany">Open plant database</Btn></div><div className="detail-card"><span className="eyebrow">Bookings</span><h3>{c.bookings} service records</h3><p>Bookings, gardener assignments, reports and payment states belong to the same customer record.</p><Btn ghost arrow={false} to="/hq/visits">View bookings</Btn></div><div className="detail-card"><span className="eyebrow">Payments</span><h3>₹18,420 lifetime</h3><p>Transactions and refunds will be persisted by the payment layer in Phase 4.</p><Btn ghost arrow={false} to="/hq/money">View finance</Btn></div></div></Shell>}
function AdminGardeners(){const {adminOverrides,updateAdmin,toast}=useApp();const [filter,setFilter]=React.useState('All');const source=adminGardenerData.map(x=>({...x,...(adminOverrides[x.id]||{})}));const visible=source.filter(x=>filter==='All'||x.status===filter);return <Shell title="Gardeners" sub="Manage gardener profiles, access, service areas and operational status." action={<Btn onClick={()=>toast('Gardener onboarding form is ready for the backend phase')}>Add gardener</Btn>}><AdminHeader title="Gardener access" sub="Admin controls the operational roster. Login credentials will be created by the backend later."/><Filter items={['All','Active','Pending','Inactive']} value={filter} onChange={setFilter}/><div className="admin-table"><div className="admin-row admin-head"><span>Gardener</span><span>Jobs</span><span>Rating</span><span>Service area</span><span>Status</span><span>Actions</span></div>{visible.map(g=><motion.div className="admin-row" key={g.id} layout><div><b>{g.name}</b><small>{g.email}</small></div><span>{g.jobs}</span><span>★ {g.rating}</span><span>{g.area}</span><Badge>{g.status}</Badge><div className="admin-actions"><Btn ghost arrow={false} onClick={()=>toast(`${g.name} profile selected — backend profile editor pending`)}>View</Btn><button className="icon-action" title="Change gardener status" onClick={()=>updateAdmin(g.id,{status:g.status==='Active'?'Inactive':'Active'})}><UserCheck size={15}/></button></div></motion.div>)}</div></Shell>}
function AdminBookings(){const {adminOverrides,updateAdmin,updateBooking,bookingOverrides,toast}=useApp();const [filter,setFilter]=React.useState('All');const source=bookings.map((b,i)=>{const id=bookingMeta[i%bookingMeta.length].id;const meta=bookingMeta[i%bookingMeta.length];const ov=bookingOverrides[id]||{};const state=ov.state||meta.state;return {...b,id,gardener:ov.gardener||(state==='Gardener Assigned'||state==='Gardener Accepted'||state==='On the way'||state==='Arrived'||state==='Service started'||state==='Completed'?meta.gardener:''),status:bookingStatusLabel[state]||b.status,...(adminOverrides[id]||{})}});const visible=source.filter(x=>filter==='All'||x.status===filter);const assign=(id,name)=>{if(!name){updateBooking(id,{gardener:'',state:'Confirmed'});updateAdmin(id,{gardener:'',status:'Confirmed'});toast(`${id} is awaiting gardener assignment`);return}updateBooking(id,{gardener:name,state:'Gardener Assigned'});updateAdmin(id,{gardener:name,status:'Assigned'});toast(`${name} assigned to ${id}`)};return <Shell title="Booking management" sub="Review bookings, assign gardeners and follow operational status." action={<Btn to="/hq/crew" ghost arrow={false}>Manage gardeners</Btn>}><AdminHeader title="Booking queue" sub={`${visible.length} bookings in this view. Assignment changes are frontend-only and reset on refresh.`}/><Filter items={['All','Scheduled','Confirmed','Assigned','Completed']} value={filter} onChange={setFilter}/><div className="admin-bookings">{visible.map((b,i)=>{const meta=bookingMeta[i%bookingMeta.length];const id=b.id||meta.id;const assigned=b.gardener||'';return <motion.div className="admin-booking" key={`${id}-${i}`} layout><div className="admin-booking-main"><div className="booking-id"><span>{id}</span><Badge>{b.status}</Badge></div><h3>{b.service}</h3><p>{b.date} · {b.time} · {b.plants}</p><small>{assigned?'Gardener: '+assigned:'No gardener assigned'} · ₹{meta.price}</small></div><div className="assign-box"><label>Gardener<select value={assigned||''} onChange={e=>assign(id,e.target.value)}><option value="">Assign gardener</option>{adminGardenerData.filter(g=>g.status==='Active').map(g=><option key={g.id}>{g.name}</option>)}</select></label><div className="admin-actions"><Btn ghost arrow={false} to={`/garden/visits/${id}`}>Open booking</Btn><Btn arrow={false} onClick={()=>toast(`Payment status for ${id}: Paid in this demo`) }>Payment</Btn></div></div></motion.div>})}</div></Shell>}
function AdminFinance(){return <Shell title="Finance & payouts" sub="Payment processing is intentionally excluded from the current Phase 5 implementation."><div className="p5-panel"><h3>Payment workflows are out of scope</h3><p>Razorpay checkout, payment webhooks, refunds, subscription billing and payout execution have not been changed. Existing payment records remain in the database and can be reviewed after the separate payment phase is approved.</p></div></Shell>}
function AdminAnalytics(){const points=[42,55,49,68,61,78,72,88,81,94,89,100];return <Shell title="Reports & analytics" sub="Understand revenue, booking demand and gardener performance."><div className="metrics four"><Metric icon={TrendingUp} label="Booking growth" value="+14.2%" meta="vs previous month" tone="ok"/><Metric icon={WalletCards} label="Revenue growth" value="+11.8%" meta="vs previous month" tone="ok"/><Metric icon={Star} label="Avg. rating" value="4.86" meta="Across 1,240 reviews"/><Metric icon={Clock3} label="Completion" value="96.4%" meta="Service success rate" tone="ok"/></div><div className="analytics-grid"><div className="analytics-card"><div className="sh"><div><span className="eyebrow">Bookings</span><h2>12-week trend</h2></div><Badge>Updated today</Badge></div><div className="sparkline">{points.map((v,i)=><div key={i} style={{height:v+'%'}}><span>{v}</span></div>)}</div><div className="axis"><span>Week 1</span><span>Week 12</span></div></div><div className="analytics-card"><div className="sh"><div><span className="eyebrow">Service demand</span><h2>Share by category</h2></div></div><div className="bars">{[['Plant Care',78],['Maintenance',62],['Green Makeover',49],['Plant Rescue',34],['Plant Setup',27]].map(([x,v])=><div key={x}><span>{x}<b>{v}%</b></span><i><motion.u initial={{width:0}} animate={{width:v+'%'}} transition={{delay:.2,duration:.7}}/></i></div>)}</div></div></div></Shell>}
function AdminContent(){const {toast}=useApp();const [saved,setSaved]=React.useState(false);const [title,setTitle]=React.useState('Care that grows with you.');const [announcement,setAnnouncement]=React.useState('Book your next plant-care visit in a few quiet clicks.');const save=()=>{setSaved(true);toast('Content draft saved in this frontend session');setTimeout(()=>setSaved(false),2200)};return <Shell title="Content management" sub="Manage banners, FAQs, plant-care content and testimonials." action={<Btn onClick={save}><Save size={15}/>{saved?'Saved':'Save draft'}</Btn>}><div className="cms-grid"><section className="workflow-card"><span className="eyebrow">Homepage hero</span><h3>Primary message</h3><label className="field">Headline<input value={title} onChange={e=>setTitle(e.target.value)}/></label><label className="field">Announcement<input value={announcement} onChange={e=>setAnnouncement(e.target.value)}/></label><div className="cms-preview"><span className="eyebrow">Live preview</span><h2>{title}</h2><p>{announcement}</p></div></section><section className="workflow-card"><span className="eyebrow">Content modules</span><h3>Publishing queue</h3>{['FAQ · Plant watering basics','Blog · Monsoon plant care','Testimonial · Neha S.','Banner · October maintenance'].map((x,i)=><div className="cms-item" key={x}><div><b>{x}</b><small>{i<2?'Draft':'Published'} · Updated recently</small></div><Badge tone={i<2?'a':'g'}>{i<2?'Draft':'Live'}</Badge></div>)}<Btn ghost arrow={false} onClick={()=>toast('Content editor module is ready for backend/CMS persistence')}>Add content</Btn></section></div></Shell>}
function AdminPlants(){const {toast}=useApp();const [q,setQ]=React.useState('');const visible=seedPlants.filter(x=>x.name.toLowerCase().includes(q.toLowerCase()));return <Shell title="Plant database" sub="Maintain the care knowledge base used by customer and gardener workflows." action={<Btn onClick={()=>toast('Plant record editor is ready for the backend phase')}>Add plant</Btn>}><AdminHeader title="Care knowledge" sub="Plant records will later power recommendations, care plans and reports." action={<div className="admin-search"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search plants"/></div>}/><div className="admin-table"><div className="admin-row admin-head"><span>Plant</span><span>Category</span><span>Health</span><span>Next care</span><span>Watering</span><span>Actions</span></div>{visible.map(p=><div className="admin-row" key={p.name}><div><b>{p.name}</b><small>{p.type}</small></div><span>Indoor</span><Badge>{p.status}</Badge><span>{p.next}</span><span>Weekly</span><Btn ghost arrow={false} onClick={()=>toast(`${p.name} editor is ready for backend persistence`)}>Edit</Btn></div>)}</div></Shell>}
const HqHome=()=><Shell title="Operations pulse" sub="T-CARE activity across customers, gardeners and bookings."><div className="metrics four"><Metric icon={Users} label="Customers" value="2,842" meta="+8.4% this month" tone="ok"/><Metric icon={Flower2} label="Gardeners" value="86" meta="42 active today"/><Metric icon={ClipboardList} label="Bookings" value="1,248" meta="74 pending"/><Metric icon={WalletCards} label="Revenue" value="₹8.42L" meta="+14.2% this month" tone="ok"/></div><div className="duo"><div><div className="sh"><h2>Recent activity</h2><Link className="tl" to="/hq/visits">View all <ArrowUpRight size={15}/></Link></div><Bookings/></div><div><div className="sh"><h2>Popular services</h2></div><div className="bars">{[['Plant Care',78],['Maintenance',62],['Green Makeover',49],['Plant Rescue',34]].map(([x,v],i)=><div key={x}><span>{x}<b>{v}%</b></span><i><motion.u initial={{width:0}} animate={{width:v+'%'}} transition={{delay:.3+i*.1,duration:.9}}/></i></div>)}</div></div></div></Shell>;
const T=(title,cols,rows,add)=>()=><Shell title={title} sub="Manage this area with frontend-only mock data." action={<Btn>{add}</Btn>}><Table cols={cols} rows={rows}/></Shell>;

/* ---------- routes ---------- */
function NF(){const {theme}=useApp();return <div className="nf"><GardenBackground theme={theme}/><Leaf size={64} strokeWidth={1}/><h1>Lost in the <em>undergrowth</em></h1><p>This page doesn't exist — let's get you back to greener ground.</p><Btn to="/">Back home</Btn></div>}
const G=(title,sub)=>()=><Generic title={title} sub={sub}/>;
const routes=[['/',Home],['/services',ServicesRoute],['/about',AboutRoute],['/plans',PlansRoute],['/store',StoreRoute],['/makeover',MakeoverRoute],['/contact',ContactRoute],['/terms',TermsRoute],['/login',Auth],['/register',()=> <Auth/>],['/garden',()=> <Phase5.CustomerDashboardPage Shell={Shell}/>],['/garden/visits',()=> <Phase5.CustomerBookingsPage Shell={Shell}/>],['/garden/shop',()=> <Phase5.CustomerServicesPage Shell={Shell}/>],['/garden/book',()=> <Phase5.CustomerBookingCreatePage Shell={Shell}/>],['/garden/booking-confirmed/:id',()=> <Phase5.CustomerBookingDetailPage Shell={Shell}/>],['/garden/visits/:id',()=> <Phase5.CustomerBookingDetailPage Shell={Shell}/>],['/garden/tracking/:id',()=> <Phase5.CustomerBookingDetailPage Shell={Shell}/>],['/garden/plants',()=> <Phase5.CustomerPlantsPage Shell={Shell}/>],['/garden/addresses',()=> <Phase5.CustomerAddressesPage Shell={Shell}/>],['/garden/plants/:id',()=> <Phase5.CustomerPlantDetailPage Shell={Shell}/>],
['/garden/plan',()=> <Phase5.OutOfScopePage Shell={Shell} title="Subscription plans" sub="Payment-dependent subscription billing is excluded from the current completion scope."/>],['/garden/billing',()=> <Phase5.OutOfScopePage Shell={Shell} title="Payments & invoices" sub="Payment collection, invoices and refunds are excluded from the current completion scope."/>],['/garden/inbox',()=> <Phase5.NotificationsPage Shell={Shell}/>],['/garden/me',G('Profile','Your personal details, contact information and saved preferences.')],
['/crew',()=> <Phase5.GardenerDashboardPage Shell={Shell}/>],['/crew/jobs',()=> <Phase5.GardenerJobsPage Shell={Shell}/>],['/crew/jobs/:id',()=> <Phase5.GardenerJobDetailPage Shell={Shell}/>],['/crew/jobs/:id/report',()=> <Phase5.GardenerReportPage Shell={Shell}/>],['/crew/reports',()=> <Phase5.GardenerReportsPage Shell={Shell}/>],['/crew/pay',()=> <Phase5.OutOfScopePage Shell={Shell} title="Gardener payouts" sub="Payment and payout processing are excluded from the current completion scope."/>],['/crew/hours',()=> <Phase5.GardenerAvailabilityPage Shell={Shell}/>],['/crew/kyc',()=> <Phase5.GardenerKycDocumentsPage Shell={Shell}/>],['/crew/me',GardenerProfile],
['/hq',()=> <Phase5.AdminDashboardPage Shell={Shell}/>],['/hq/notifications',()=> <Phase5.AdminNotificationsPage Shell={Shell}/>],['/hq/people',()=> <Phase5.AdminUsersPage Shell={Shell} role="CUSTOMER"/>],['/hq/people/:id',()=> <Phase5.AdminUserDetailPage Shell={Shell}/>],['/hq/crew',()=> <Phase5.AdminGardenersKycPage Shell={Shell}/>],['/hq/visits',()=> <Phase5.AdminBookingsPage Shell={Shell}/>],['/hq/catalog',()=> <Phase5.AdminServicesPage Shell={Shell}/>],['/hq/plans',()=> <Phase5.OutOfScopePage Shell={Shell} title="Subscription plans" sub="Payment-dependent subscription billing is excluded from the current completion scope."/>],['/hq/botany',()=> <Phase5.AdminPlantKnowledgePage Shell={Shell}/>],['/hq/money',()=> <Phase5.OutOfScopePage Shell={Shell} title="Finance operations" sub="Payment processing, refunds and payouts are excluded from the current completion scope."/>],['/hq/insights',()=> <Phase5.AdminAnalyticsPage Shell={Shell}/>],['/hq/cms',()=> <Phase5.AdminCmsPage Shell={Shell}/>],['/hq/reviews',()=> <Phase5.AdminReviewsIssuesPage Shell={Shell} mode="reviews"/>],['/hq/issues',()=> <Phase5.AdminReviewsIssuesPage Shell={Shell} mode="issues"/>],['*',NF]];
function ProtectedRole({role,children}){
  const {authUser,authReady}=useApp();
  const nav=useNavigate();
  const location=useLocation();
  React.useEffect(()=>{
    if(!authReady)return;
    if(!authUser)nav('/login',{replace:true,state:{from:location.pathname}});
    else if(authUser.role!==role)nav(workspaceForRole(authUser.role),{replace:true});
  },[authReady,authUser,role,nav,location.pathname]);
  if(!authReady||!authUser||authUser.role!==role)return <div className="auth-loading" role="status">Checking your secure T-CARE session…</div>;
  return children;
}
function App(){
  const loc=useLocation();
  return <Bloom><Routes location={loc}>{routes.map(([p,C])=>{
    const role=p.startsWith('/garden')?'CUSTOMER':p.startsWith('/crew')?'GARDENER':p.startsWith('/hq')?'ADMIN':null;
    const element=role?<ProtectedRole role={role}><C/></ProtectedRole>:<C/>;
    return <Route key={p} path={p} element={element}/>;
  })}</Routes></Bloom>
}
createRoot(document.getElementById('root')).render(<BrowserRouter><Provider><App/></Provider></BrowserRouter>);
