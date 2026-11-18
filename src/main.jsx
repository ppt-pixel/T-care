import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, MotionConfig, useMotionValue, animate } from 'framer-motion';
import {AppBackground,AuthScenery} from './Backgrounds.jsx';
import {useCart,CartDrawer,LandingNav,Hero,WhyChoose,Included,Steps,Market,Reviews,FinalCta,SiteFooter,WhatsAppFab} from './landing/Sections.jsx';
import { Leaf, ArrowUpRight, Check, Bell, Search, Sun, Moon, Scissors, MapPin, Star, X, CircleAlert,
  LayoutGrid, CalendarDays, Flower2, Sprout, WalletCards, CreditCard, UserRound, Stethoscope, Users, Package, BarChart3, FileText,
  ClipboardList, Bot, ShoppingBag, Wand2, CornerDownLeft, Menu, ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';
import {ServicesPage,AboutPage,PlansPage,StorePage,MakeoverPage,ContactPage,TermsPage,PrivacyPage} from './landing/Pages.jsx';
import {usePublicList} from './landing/publicData.js';
import './styles.css';
import * as Phase5 from './phase5.jsx';
import { setNotificationUser, useNotificationFeed, refreshNotificationFeed } from './notificationStore.js';
import { restoreAuthSession, logoutAuthSession } from './apiRequest.js';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '' : 'http://localhost:4000')).replace(/\/+$/, '');
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

/* ---------- role navigation ---------- */
const roles={
  garden:{label:'Customer',base:'/garden',nav:[['','Today',LayoutGrid],['visits','Visits',ClipboardList],['plants','Plants',Flower2],['addresses','Addresses',MapPin],['shop','Services',Sprout],['plan','Subscriptions',WalletCards],['billing','Billing',CreditCard],['inbox','Inbox',Bell],['me','Me',UserRound]]},
  crew:{label:'Gardener',base:'/crew',nav:[['','Route',LayoutGrid],['jobs','Jobs',ClipboardList],['reports','Reports',Stethoscope],['hours','Hours',CalendarDays],['kyc','Verification',FileText],['pay','Pay',WalletCards],['inbox','Inbox',Bell],['me','Me',UserRound]]},
  hq:{label:'Admin',base:'/hq',nav:[['','Pulse',LayoutGrid],['people','Customers',Users],['crew','Gardeners',Flower2],['visits','Bookings',ClipboardList],['catalog','Services',Package],['store','Store',ShoppingBag],['botany','Plants',Sprout],['reviews','Reviews',Star],['issues','Issues',FileText],['notifications','Notifications',Bell],['insights','Analytics',BarChart3],['cms','Content',FileText],['plans','Plans',WalletCards],['money','Finance',CreditCard]]}};
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
  const [toasts,setToasts]=React.useState([]);
  const toastSequence=React.useRef(0);
  const toastTimers=React.useRef(new Map());
  const [paletteOpen,setPaletteOpen]=React.useState(false);
  const [authUser,setAuthUser]=React.useState(null);
  const [authReady,setAuthReady]=React.useState(false);
  const [theme,setTheme]=React.useState(()=>{try{return localStorage.getItem('tcare-theme')||'light'}catch{return'light'}});

  React.useEffect(()=>{
    document.documentElement.dataset.theme=theme;
    try{localStorage.setItem('tcare-theme',theme)}catch{}
  },[theme]);

  React.useEffect(()=>{
    let active=true;
    const restore=async()=>{
      try{
        const user=await restoreAuthSession({apiV1:API_V1});
        if(active&&user)setAuthUser(user);
      }catch{
        // Public pages remain available while the API is offline; protected pages stay guarded.
      }finally{
        if(active)setAuthReady(true);
      }
    };
    restore();
    return()=>{active=false};
  },[]);

  React.useEffect(()=>{
    const onSessionExpired=()=>setAuthUser(null);
    window.addEventListener('tcare:session-expired',onSessionExpired);
    return()=>window.removeEventListener('tcare:session-expired',onSessionExpired);
  },[]);
  React.useEffect(()=>{setNotificationUser(authUser);},[authUser?.id,authUser?.role]);

  React.useEffect(()=>{
    const onShortcut=event=>{
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){
        event.preventDefault();
        setPaletteOpen(value=>!value);
      }
    };
    addEventListener('keydown',onShortcut);
    return()=>removeEventListener('keydown',onShortcut);
  },[]);

  const dismissToast=React.useCallback(id=>{
    const timer=toastTimers.current.get(id);
    if(timer)clearTimeout(timer);
    toastTimers.current.delete(id);
    setToasts(current=>current.filter(item=>item.id!==id));
  },[]);
  const toast=React.useCallback((message,{type='success',duration}={})=>{
    const id=++toastSequence.current;
    const toastType=['success','warning','error'].includes(type)?type:'success';
    const timeout=Number.isFinite(duration)?Math.max(0,duration):toastType==='error'?8000:toastType==='warning'?6000:4500;
    setToasts(current=>[...current,{id,message,type:toastType}]);
    if(timeout>0)toastTimers.current.set(id,setTimeout(()=>dismissToast(id),timeout));
  },[dismissToast]);
  React.useEffect(()=>()=>{for(const timer of toastTimers.current.values())clearTimeout(timer);toastTimers.current.clear()},[]);
  const cart=useCart(toast);
  const toggleTheme=React.useCallback(()=>setTheme(current=>current==='dark'?'light':'dark'),[]);
  const openPalette=React.useCallback(()=>setPaletteOpen(true),[]);
  const logout=React.useCallback(async()=>{
    let logoutFailed=false;
    try{await logoutAuthSession({apiV1:API_V1})}catch(error){
      logoutFailed=true;
      console.error('[auth] sign-out request failed',error);
    }
    setAuthUser(null);
    if(logoutFailed)toast('Sign-out could not be confirmed with T-CARE. Please try again when your connection is restored.',{type:'warning'});
  },[toast]);
  const value=React.useMemo(()=>({cart,toast,theme,toggleTheme,openPalette,authUser,authReady,setAuthUser,logout}),
    [cart,toast,theme,toggleTheme,openPalette,authUser,authReady,logout]);

  return <Ctx.Provider value={value}>
    <PerformanceManager/>
    {children}
    <AnimatePresence>{paletteOpen&&<Palette onClose={()=>setPaletteOpen(false)}/>}</AnimatePresence>
    <div className="toasts" aria-label="Notifications"><AnimatePresence>{toasts.map(item=><motion.div key={item.id} className={`toast is-${item.type}`} role={item.type==='error'?'alert':'status'} aria-live={item.type==='error'?'assertive':'polite'} aria-atomic="true" layout initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}>
      {item.type==='success'?<Check size={16}/>:<CircleAlert size={16}/>}<span>{item.message}</span><button type="button" className="toast-close" aria-label="Dismiss notification" onClick={()=>dismissToast(item.id)}><X size={15}/></button>
    </motion.div>)}</AnimatePresence></div>
  </Ctx.Provider>;
}

/* ---------- small parts ---------- */
const Badge=({children,tone})=>{const text=String(children??'');const t=tone||(/Completed|Paid|Inactive|Blocked/.test(text)?'n':/Assigned|Needs|Pending|attention/.test(text)?'a':'g');return <span className={'badge '+t}>{children}</span>};
const Btn=({children,to,onClick,ghost,arrow=true,full})=>{const c='btn'+(ghost?' ghost':'')+(full?' full':'');const icon=arrow&&<ArrowUpRight size={16}/>;return to?<Link to={to} className={c}>{children}{icon}</Link>:<button type="button" className={c} onClick={onClick} disabled={!onClick}>{children}{icon}</button>};
function Palette({onClose}){const nav=useNavigate();const {authUser,toggleTheme,theme}=useApp();const [q,setQ]=React.useState(''),[i,setI]=React.useState(0);
  const mine=authUser?.role==='ADMIN'?['hq']:authUser?.role==='GARDENER'?['crew']:authUser?.role==='CUSTOMER'?['garden']:[];
  const all=[...(authUser?.role==='CUSTOMER'?[{label:'Book a service',group:'Action',icon:CalendarDays,run:()=>nav('/garden/book')}]:[]),{label:theme==='dark'?'Switch to light':'Switch to dark',group:'Action',icon:theme==='dark'?Sun:Moon,run:toggleTheme,keep:1},...Object.entries(roles).filter(([k])=>mine.includes(k)).flatMap(([,r])=>r.nav.map(([p,l,I])=>({label:l,group:r.label,icon:I,run:()=>nav(r.base+(p?'/'+p:''))}))),{label:'Home page',group:'Action',icon:Leaf,run:()=>nav('/')}];
  const res=all.filter(x=>(x.label+x.group).toLowerCase().includes(q.toLowerCase())).slice(0,9);const run=x=>{if(!x)return;x.run();if(!x.keep)onClose()};
  const key=e=>{const n=Math.max(res.length,1);if(e.key==='ArrowDown'){e.preventDefault();setI((i+1)%n)}else if(e.key==='ArrowUp'){e.preventDefault();setI((i-1+n)%n)}else if(e.key==='Enter')run(res[i]);else if(e.key==='Escape')onClose()};
  return <motion.div className="overlay top" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose}><motion.div className="palette" initial={{scale:.9,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.95,opacity:0}} onClick={e=>e.stopPropagation()}><div className="pin"><Search size={18}/><input autoFocus value={q} onChange={e=>{setQ(e.target.value);setI(0)}} onKeyDown={key} placeholder="Jump to a page or action…"/><kbd>esc</kbd></div><div className="pl">{res.length?res.map((x,n)=><button key={x.group+x.label} className={n===i?'on':''} onMouseEnter={()=>setI(n)} onClick={()=>run(x)}><x.icon size={16}/><span>{x.label}</span><small>{x.group}</small>{n===i&&<CornerDownLeft size={13}/>}</button>):<p className="empty">Nothing for “{q}”</p>}</div></motion.div></motion.div>}
function Notif(){
  const {authUser}=useApp();
  const role=authUser?.role;
  const live=role==='CUSTOMER'||role==='GARDENER';
  const inbox=role==='ADMIN'?'/hq/notifications':role==='GARDENER'?'/crew/inbox':'/garden/inbox';
  const [o,setO]=React.useState(false);
  const feed=useNotificationFeed();
  const box=React.useRef(null);
  React.useEffect(()=>{if(o&&live)refreshNotificationFeed();},[o,live]);
  React.useEffect(()=>{
    if(!o)return undefined;
    const away=e=>{if(box.current&&!box.current.contains(e.target))setO(false)};
    const esc=e=>{if(e.key==='Escape')setO(false)};
    document.addEventListener('pointerdown',away);document.addEventListener('keydown',esc);
    return()=>{document.removeEventListener('pointerdown',away);document.removeEventListener('keydown',esc)};
  },[o]);
  const when=v=>{try{return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v))}catch{return''}};
  const unread=live?feed.unreadCount:0;
  return <div className="notif" ref={box}>
    <button className="ib" onClick={()=>setO(v=>!v)} aria-label={unread?`Open notifications, ${unread} unread`:'Open notifications'} aria-expanded={o} aria-haspopup="true" title="Notifications"><Bell size={17}/>{unread>0&&<i className="ping"/>}</button>
    <AnimatePresence>{o&&<motion.div className="nmenu" role="region" aria-label="Notifications" initial={{opacity:0,scale:.9,y:8}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:.9,y:8}} transition={{duration:.18}}>
      <b>Notifications{unread>0?` · ${unread} unread`:''}</b>
      {!live?<p className="nmenu-note">Review and send in-app notifications from the notification centre.</p>
        :feed.status==='loading'?<p className="nmenu-note">Loading…</p>
        :feed.status==='error'&&!feed.items.length?<p className="nmenu-note">Notifications could not be loaded right now.</p>
        :!feed.items.length?<p className="nmenu-note">You’re all caught up.</p>
        :feed.items.map(n=><div key={n.id} className={n.readAt?'':'unread'}><span className={'dot'+(n.readAt?' read':'')}/><p>{n.title||'Update'}<small>{when(n.createdAt)}</small></p></div>)}
      <Link to={inbox} className="nmenu-all" onClick={()=>setO(false)}>{live?'View all notifications':'Open notification centre'}</Link>
    </motion.div>}</AnimatePresence>
  </div>}

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
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){clip.set('none');return undefined}
    const r=Math.max(innerWidth,innerHeight)*1.6;
    clip.set(`circle(0px at ${x}px ${y}px)`);
    const a=animate(clip,`circle(${r}px at ${x}px ${y}px)`,{duration:.45,ease:[.22,1,.36,1],onComplete:()=>clip.set('none')});
    return()=>a.stop();
  },[pathname,clip]);
  return <motion.div key={pathname} style={{minHeight:'100vh',clipPath:clip}}>{children}</motion.div>}
const safeDecode=v=>{try{return decodeURIComponent(v)}catch{return v}};
function Breadcrumbs({pathname}){
  const rk=roleOf(pathname),R=roles[rk];
  const parts=pathname.split('/').filter(Boolean);
  const labels={garden:'Today',crew:'Route',hq:'Pulse',visits:'Visits',plants:'Plants',shop:'Services',book:'Book a service',plan:'Plan',billing:'Billing',inbox:'Inbox',me:'Profile',jobs:'Jobs',reports:'Reports',pay:'Pay',hours:'Hours',people:'Customers',catalog:'Services',store:'Store',plans:'Plans',botany:'Plants',money:'Finance',insights:'Analytics',cms:'Content',addresses:'Addresses',kyc:'Verification',notifications:'Notifications'};
  return <nav className="crumbs" aria-label="Breadcrumb"><Link to={R.base}>{R.label}</Link>{parts.slice(1).map((part,i)=><React.Fragment key={part}><span>/</span><span>{labels[part]||safeDecode(part).replace(/-/g,' ')}</span></React.Fragment>)}</nav>
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
  return <div className="account"><button className="avatar" onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-label="Open account menu" title="Account menu">{initials||'T'}</button><AnimatePresence>{open&&<motion.div className="account-menu" initial={{opacity:0,y:8,scale:.96}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:8,scale:.96}}><strong>{R.label} workspace</strong><span className="account-name">{authUser?.fullName||'Account'}</span><span className="account-email">{authUser?.email||''}</span><Link to={profileTarget} onClick={()=>setOpen(false)}>{role==='hq'?'Admin overview':'Profile & preferences'}</Link><Link to={secondary[1]} onClick={()=>setOpen(false)}>{secondary[0]}</Link><Link to={`${R.base}/security`} onClick={()=>setOpen(false)}>Security & password</Link><button type="button" onClick={signOut} className="danger">Sign out</button></motion.div>}</AnimatePresence></div>
}
const Dock=React.memo(function Dock({R,pathname}){const [hover,setHover]=React.useState(null);const dockRef=React.useRef(null);
  React.useEffect(()=>{const c=dockRef.current,a=c?.querySelector('a.on');if(c&&a)c.scrollTo({left:Math.max(0,a.offsetLeft-(c.clientWidth-a.offsetWidth)/2)})},[pathname]);
  return <nav className="dock" ref={dockRef} aria-label={`${R.label} navigation`}>{R.nav.map(([p,l,I],i)=>{const to=R.base+(p?'/'+p:''),on=pathname===to||(p&&pathname.startsWith(to+'/'));const d=hover===null?0:Math.abs(hover-i);
      return <Link key={to} to={to} className={on?'on':''} aria-label={l} aria-current={on?'page':undefined} title={l} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)}><motion.span animate={{scale:hover===null?1:d===0?1.35:d===1?1.15:1,y:hover===null?0:d===0?-8:d===1?-3:0}} transition={{type:'spring',stiffness:500,damping:26}}><I size={20}/></motion.span><em>{l}</em><span className="dock-label">{l}</span></Link>})}</nav>});
function WorkspaceSidebar({R,pathname,collapsed,onToggle,mobileOpen,onClose}){
  const showLabels=!collapsed||mobileOpen;
  return <>
    {mobileOpen&&<button className="workspace-sidebar-backdrop" aria-label="Close navigation" onClick={onClose}/>}
    <motion.aside id="workspace-sidebar" className={`workspace-sidebar${collapsed&&!mobileOpen?' is-collapsed':''}${mobileOpen?' mobile-open':''}`} animate={{width:collapsed&&!mobileOpen?82:252}} transition={{type:'spring',stiffness:260,damping:30}} aria-label={`${R.label} workspace sidebar`}>
      <div className="workspace-sidebar-head"><span className="workspace-sidebar-mark"><Leaf size={20}/></span>{showLabels&&<span><b>{R.label}</b><small>Workspace</small></span>}<button className="workspace-sidebar-toggle" type="button" onClick={onToggle} aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} title={collapsed?'Expand sidebar':'Collapse sidebar'}>{collapsed&&!mobileOpen?<ChevronRight size={17}/>:<ChevronLeft size={17}/>}</button>{mobileOpen&&<button className="workspace-sidebar-close" type="button" onClick={onClose} aria-label="Close workspace navigation"><X size={17}/></button>}</div>
      <nav className="workspace-sidebar-nav" aria-label={`${R.label} pages`}>
        {R.nav.map(([p,label,Icon])=>{const to=R.base+(p?'/'+p:''),active=pathname===to||(p&&pathname.startsWith(to+'/'));return <Link key={to} to={to} className={active?'active':''} aria-current={active?'page':undefined} title={!showLabels?label:undefined} onClick={onClose}><Icon size={19}/><span>{label}</span></Link>})}
      </nav>
      <div className="workspace-sidebar-foot">{showLabels&&<small>Plant care, thoughtfully managed.</small>}<button type="button" onClick={onToggle} aria-label={collapsed?'Expand navigation':'Collapse navigation'}>{collapsed&&!mobileOpen?<ChevronRight size={17}/>:<ChevronLeft size={17}/>}<span>{collapsed?'Expand':'Collapse'}</span></button></div>
    </motion.aside>
  </>;
}
function Shell({title,sub,action,children}){
  const {pathname}=useLocation();const rk=roleOf(pathname),R=roles[rk];const {theme,toggleTheme,openPalette}=useApp();
  const hasSidebar=rk==='hq'||rk==='crew';
  const [collapsed,setCollapsed]=React.useState(()=>{try{return localStorage.getItem(`tcare-sidebar-${rk}`)==='collapsed'}catch{return false}});
  React.useEffect(()=>{try{localStorage.setItem(`tcare-sidebar-${rk}`,collapsed?'collapsed':'expanded')}catch{}},[rk,collapsed]);
  const [mobileOpen,setMobileOpen]=React.useState(false);
  React.useEffect(()=>{setMobileOpen(false)},[pathname]);
  React.useEffect(()=>{
    if(!mobileOpen)return undefined;
    const closeOnEscape=event=>{if(event.key==='Escape')setMobileOpen(false)};
    window.addEventListener('keydown',closeOnEscape);
    return()=>window.removeEventListener('keydown',closeOnEscape);
  },[mobileOpen]);
  return <div className={`shell${hasSidebar?' has-workspace-sidebar':''}${collapsed?' sidebar-collapsed':''}`}><AppBackground role={rk}/>
    <header className="top"><button className="ib workspace-mobile-menu" type="button" onClick={()=>setMobileOpen(true)} aria-label="Open workspace navigation" aria-expanded={mobileOpen} aria-controls="workspace-sidebar"><Menu size={18}/></button><Link to="/" className="brand" aria-label="T-CARE home"><Leaf size={20}/><b>T-CARE</b></Link>
      <div className="seg"><span className="on"><motion.i layoutId="seg"/><span>{R.label}</span></span></div>
      <div className="tools"><button className="ib" onClick={openPalette} aria-label="Open command search" title="Search · Ctrl/Cmd K"><Search size={17}/></button><button className="ib" onClick={toggleTheme} aria-label="Toggle light and dark theme" title="Toggle theme">{theme==='dark'?<Sun size={17}/>:<Moon size={17}/>}</button><Notif/><AccountMenu role={rk}/></div></header>
    {hasSidebar&&<WorkspaceSidebar R={R} pathname={pathname} collapsed={collapsed} onToggle={()=>setCollapsed(value=>!value)} mobileOpen={mobileOpen} onClose={()=>setMobileOpen(false)}/>}
    <main className="page"><Breadcrumbs pathname={pathname}/><div className="ph"><div><span className="eyebrow">{R.label}</span><h1>{title}</h1><p>{sub}</p></div>{action}</div>{children}</main>
    {!hasSidebar&&<Dock R={R} pathname={pathname}/>}<WhatsAppFab/></div>}

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
  const {theme,toggleTheme,cart,authUser,logout}=useApp();
  return <div className="landing"><GardenBackground theme={theme}/>
    <LandingNav theme={theme} toggleTheme={toggleTheme} cart={cart} authUser={authUser} logout={logout}/>
    <main>{children}</main>
    <FinalCta/>
    <SiteFooter/>
    <WhatsAppFab/>
    <CartDrawer cart={cart}/>
  </div>}
const PUBLIC_SERVICE_ICONS={'Plant Care':Leaf,'Plant Setup':Flower2,'Plant Rescue':Stethoscope,'Maintenance':Scissors,'Events':Sprout,'Green Makeover':Wand2,'Plant Store':ShoppingBag,'AI Care':Bot};
function ServicesRoute(){
  const {items:records,loading,error,retry}=usePublicList('/services','services');
  const list=records.map(service=>({
    ...service,cat:service.category||'Services',hue:140,icon:PUBLIC_SERVICE_ICONS[service.name]||Leaf,
    price:service.prices?.length?Math.min(...service.prices.map(price=>Number(price.amount))):null,
    time:service.durationLabel||'Duration shared during booking',desc:service.description
  }));
  return <PublicPage><ServicesPage services={list} loading={loading} error={error} onRetry={retry}/></PublicPage>;
}
const AboutRoute=()=><PublicPage><AboutPage/></PublicPage>;
const PlansRoute=()=><PublicPage><PlansPage/></PublicPage>;
const StoreRoute=()=>{const {cart}=useApp();return <PublicPage><StorePage cart={cart}/></PublicPage>};
const MakeoverRoute=()=><PublicPage><MakeoverPage/></PublicPage>;
const ContactRoute=()=><PublicPage><ContactPage/></PublicPage>;
const TermsRoute=()=><PublicPage><TermsPage/></PublicPage>;
const PrivacyRoute=()=><PublicPage><PrivacyPage/></PublicPage>;
function Home(){
  const {theme,toggleTheme,cart,authUser,logout}=useApp();
  return <div className="landing"><GardenBackground theme={theme}/>
    <LandingNav theme={theme} toggleTheme={toggleTheme} cart={cart} authUser={authUser} logout={logout}/>
    <Hero theme={theme}/>
    <WhyChoose/>
    <Included/>
    <Steps/>
    <Market cart={cart}/>
    <Reviews/>
    <FinalCta/>
    <SiteFooter/>
    <WhatsAppFab/>
    <CartDrawer cart={cart}/>
  </div>}

/* ---------- reusable loading and error states ---------- */
function LoadingState({label='Loading your workspace…'}){
  return <div className="loading-state" role="status" aria-live="polite"><span className="loader"/><p>{label}</p></div>;
}
function ErrorState({title='Something needs attention',text='Please try again or contact T-Care support.',onRetry}){
  return <div className="error-state" role="alert"><div><b>{title}</b><p>{text}</p></div>{onRetry&&<Btn ghost arrow={false} onClick={onRetry}>Try again</Btn>}</div>;
}

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
        <p className="gardener-profile-footnote">Profile information is loaded from your T-CARE account. Skills are not yet represented in the Gardener profile API; KYC document submission and review are available separately in the Verification section.</p>
      </section>
    </>}
  </Shell>;
}

/* ---------- authentication workflow ---------- */
function Auth(){
  const nav=useNavigate();
  const location=useLocation();
  const {pathname}=location;
  const {toast,setAuthUser}=useApp();
  const [mode,setMode]=React.useState(pathname==='/register'?'register':'login');
  const [showPassword,setShowPassword]=React.useState(false);
  const [accountType,setAccountType]=React.useState('CUSTOMER');
  const [step,setStep]=React.useState('form');
  const [form,setForm]=React.useState({fullName:'',email:'',password:'',phone:''});
  const [verificationEmail,setVerificationEmail]=React.useState('');
  const [code,setCode]=React.useState('');
  const [busy,setBusy]=React.useState(false);
  const [error,setError]=React.useState('');
  const [resendSeconds,setResendSeconds]=React.useState(0);
  const [legalConsent,setLegalConsent]=React.useState({terms:false,privacy:false});
  const [recovery,setRecovery]=React.useState({email:'',code:'',newPassword:'',confirmPassword:''});
  const [recoveryNotice,setRecoveryNotice]=React.useState('');

  React.useEffect(()=>{
    if(resendSeconds<=0)return;
    const timer=setTimeout(()=>setResendSeconds(value=>Math.max(0,value-1)),1000);
    return()=>clearTimeout(timer);
  },[resendSeconds]);

  const update=(key,value)=>setForm(current=>({...current,[key]:value}));
  const goToWorkspace=user=>{
    setAuthUser(user);
    toast(`Signed in as ${user.role.toLowerCase()}.`);
    const rolePrefix=user.role==='ADMIN'?'/hq':user.role==='GARDENER'?'/crew':'/garden';
    const requestedPath=location.state?.from;
    const destination=typeof requestedPath==='string'
      && (requestedPath===rolePrefix||requestedPath.startsWith(`${rolePrefix}/`))
      ? requestedPath
      : workspaceForRole(user.role);
    nav(destination,{replace:true});
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
          accountType,
          acceptTerms: legalConsent.terms,
          acceptPrivacy: legalConsent.privacy
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
    setShowPassword(false);
    setStep('form');
    setError('');
    setCode('');
    setRecoveryNotice('');
    setLegalConsent({terms:false,privacy:false});
  };

  const requestPasswordReset=async event=>{
    event.preventDefault();
    setError('');setRecoveryNotice('');setBusy(true);
    try{
      await authApi('forgot-password',{email:recovery.email.trim()});
      setStep('forgot-reset');
      setRecovery(current=>({...current,code:'',newPassword:'',confirmPassword:''}));
      setRecoveryNotice('If an active, verified T-CARE account exists for that email, a password reset code has been sent.');
    }catch(requestError){setError(requestError.message||'Unable to request a reset code.');}
    finally{setBusy(false);}
  };

  const completePasswordReset=async event=>{
    event.preventDefault();
    setError('');setRecoveryNotice('');
    if(recovery.newPassword!==recovery.confirmPassword){setError('The new passwords do not match.');return;}
    setBusy(true);
    try{
      const result=await authApi('reset-password',{email:recovery.email.trim(),code:recovery.code,newPassword:recovery.newPassword});
      setMode('login');setStep('form');
      setForm(current=>({...current,email:recovery.email.trim(),password:''}));
      setRecovery({email:'',code:'',newPassword:'',confirmPassword:''});
      setRecoveryNotice(result.message||'Your password has been reset. Sign in with your new password.');
    }catch(requestError){setError(requestError.message||'Unable to reset the password.');}
    finally{setBusy(false);}
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

      {step==='forgot-request' ? <>
        <div className="auth-heading"><span className="eyebrow">Account recovery</span><h2>Forgot your password?</h2><p>Enter the email address associated with your T-CARE account. If it is eligible, we will send a one-time reset code.</p></div>
        <form onSubmit={requestPasswordReset}>
          <label>Email address<input required type="email" autoComplete="email" value={recovery.email} onChange={event=>setRecovery(current=>({...current,email:event.target.value}))} placeholder="you@example.com"/></label>
          {error&&<p className="auth-alert" role="alert">{error}</p>}
          <button className="btn full" type="submit" disabled={busy||!recovery.email.trim()}>{busy?'Requesting…':'Send reset code'} <ArrowUpRight size={16}/></button>
          <button className="text-btn auth-resend" type="button" onClick={()=>{setStep('form');setMode('login');setError('')}}>Back to sign in</button>
        </form>
      </> : step==='forgot-reset' ? <>
        <div className="auth-heading"><span className="eyebrow">Account recovery</span><h2>Choose a new password.</h2><p>{recoveryNotice || 'Enter the one-time code sent to your registered email address.'}</p></div>
        <form onSubmit={completePasswordReset}>
          <label>Registered email<input required type="email" autoComplete="email" value={recovery.email} onChange={event=>setRecovery(current=>({...current,email:event.target.value}))}/></label>
          <label>Six-digit reset code<input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={recovery.code} onChange={event=>setRecovery(current=>({...current,code:event.target.value.replace(/\D/g,'').slice(0,6)}))} placeholder="000000"/></label>
          <label>New password<input required type="password" minLength={12} maxLength={72} autoComplete="new-password" value={recovery.newPassword} onChange={event=>setRecovery(current=>({...current,newPassword:event.target.value}))} placeholder="At least 12 characters"/></label>
          <label>Confirm new password<input required type="password" minLength={12} maxLength={72} autoComplete="new-password" value={recovery.confirmPassword} onChange={event=>setRecovery(current=>({...current,confirmPassword:event.target.value}))} placeholder="Enter the new password again"/></label>
          {error&&<p className="auth-alert" role="alert">{error}</p>}
          <button className="btn full" type="submit" disabled={busy||recovery.code.length!==6||!recovery.newPassword||!recovery.confirmPassword}>{busy?'Updating password…':'Reset password'} <ArrowUpRight size={16}/></button>
          <button className="text-btn auth-resend" type="button" onClick={()=>{setStep('forgot-request');setError('');setRecoveryNotice('')}}>Request another code</button>
          <button className="text-btn auth-resend" type="button" onClick={()=>{setStep('form');setMode('login');setError('')}}>Back to sign in</button>
        </form>
      </> : step==='verify' ? <>
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
          <button className="text-btn auth-resend" type="button" onClick={()=>{setMode('login');setStep('form');setError('');setCode('')}}>Back to sign in</button>
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
          {recoveryNotice&&<p className="auth-success" role="status">{recoveryNotice}</p>}
          {mode==='register'&&<label>Full name<input required minLength={2} maxLength={100} autoComplete="name" value={form.fullName} onChange={event=>update('fullName',event.target.value)} placeholder="Your full name"/></label>}
          <label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={event=>update('email',event.target.value)} placeholder="you@example.com"/></label>
          {mode==='register'&&<label>Phone number <span className="field-optional">(optional)</span><input type="tel" autoComplete="tel" value={form.phone} onChange={event=>update('phone',event.target.value)} placeholder="Your contact number"/></label>}
          <div className="auth-password-field">
            <label htmlFor="auth-password">Password</label>
            <div className="auth-password-control">
              <input id="auth-password" required type={showPassword?'text':'password'} minLength={mode==='register'?8:1} maxLength={72} autoComplete={mode==='login'?'current-password':'new-password'} value={form.password} onChange={event=>update('password',event.target.value)} placeholder="At least 8 characters"/>
              <button className="auth-password-toggle" type="button" aria-label={showPassword?'Hide password':'Show password'} onClick={()=>setShowPassword(value=>!value)}>
                {showPassword?<EyeOff size={18} aria-hidden="true"/>:<Eye size={18} aria-hidden="true"/>}
              </button>
            </div>
          </div>
          {mode==='register'&&<div className="legal-consent" aria-label="Required legal consent">
            <label className="legal-consent-item"><input type="checkbox" required checked={legalConsent.terms} onChange={event=>setLegalConsent(current=>({...current,terms:event.target.checked}))}/><span>I agree to the <Link to="/terms" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</Link>.</span></label>
            <label className="legal-consent-item"><input type="checkbox" required checked={legalConsent.privacy} onChange={event=>setLegalConsent(current=>({...current,privacy:event.target.checked}))}/><span>I have read and agree to the <Link to="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>.</span></label>
          </div>}
          {error&&<p className="auth-alert" role="alert">{error}</p>}
          <button className="btn full" type="submit" disabled={busy||(mode==='register'&&(!legalConsent.terms||!legalConsent.privacy))}>{busy?(mode==='login'?'Signing in…':'Creating account…'):(mode==='login'?'Sign in to workspace':'Create account')} <ArrowUpRight size={16}/></button>
        </form>
        {mode==='login'&&<button className="text-btn auth-forgot" type="button" onClick={()=>{setRecovery(current=>({...current,email:form.email,code:'',newPassword:'',confirmPassword:''}));setStep('forgot-request');setError('');setRecoveryNotice('')}}>Forgot password?</button>}
        <p className="auth-note">{location.state?.from?.startsWith('/garden/book')
          ? 'A Customer account is required to book. After you sign in or verify your Customer account, we will return you to the booking form.'
          : 'Email verification is required before an account can sign in. Admin accounts are provisioned separately.'}</p>
      </>}
      <Link className="back-home" to="/">← Back to T-CARE home</Link>
    </div>
    <WhatsAppFab/>
  </div>
}

/* ---------- routes ---------- */
function NF(){const {theme}=useApp();return <div className="nf"><GardenBackground theme={theme}/><Leaf size={64} strokeWidth={1}/><h1>Lost in the <em>undergrowth</em></h1><p>This page doesn't exist — let's get you back to greener ground.</p><Btn to="/">Back home</Btn></div>}
const routes=[['/',Home],['/services',ServicesRoute],['/about',AboutRoute],['/plans',PlansRoute],['/store',StoreRoute],['/makeover',MakeoverRoute],['/contact',ContactRoute],['/terms',TermsRoute],['/privacy',PrivacyRoute],['/login',Auth],['/register',()=> <Auth/>],['/garden',()=> <Phase5.CustomerDashboardPage Shell={Shell}/>],['/garden/visits',()=> <Phase5.CustomerBookingsPage Shell={Shell}/>],['/garden/shop',()=> <Phase5.CustomerServicesPage Shell={Shell}/>],['/garden/book',()=> <Phase5.CustomerBookingCreatePage Shell={Shell}/>],['/garden/booking-confirmed/:id',()=> <Phase5.CustomerBookingDetailPage Shell={Shell}/>],['/garden/visits/:id',()=> <Phase5.CustomerBookingDetailPage Shell={Shell}/>],['/garden/tracking/:id',()=> <Phase5.CustomerBookingDetailPage Shell={Shell}/>],['/garden/plants',()=> <Phase5.CustomerPlantsPage Shell={Shell}/>],['/garden/addresses',()=> <Phase5.CustomerAddressesPage Shell={Shell}/>],['/garden/plants/:id',()=> <Phase5.CustomerPlantDetailPage Shell={Shell}/>],
['/garden/plan',()=> <Phase5.CustomerSubscriptionsPage Shell={Shell}/>],['/garden/billing',()=> <Phase5.CustomerPaymentsPage Shell={Shell}/>],['/garden/inbox',()=> <Phase5.NotificationsPage Shell={Shell}/>],['/garden/me',()=> <Phase5.CustomerProfilePage Shell={Shell}/>],['/garden/security',()=> <Phase5.AccountSecurityPage Shell={Shell}/>],
['/crew',()=> <Phase5.GardenerDashboardPage Shell={Shell}/>],['/crew/jobs',()=> <Phase5.GardenerJobsPage Shell={Shell}/>],['/crew/jobs/:id',()=> <Phase5.GardenerJobDetailPage Shell={Shell}/>],['/crew/jobs/:id/report',()=> <Phase5.GardenerReportPage Shell={Shell}/>],['/crew/reports',()=> <Phase5.GardenerReportsPage Shell={Shell}/>],['/crew/pay',()=> <Phase5.GardenerPayoutsPage Shell={Shell}/>],['/crew/inbox',()=> <Phase5.NotificationsPage Shell={Shell}/>],['/crew/hours',()=> <Phase5.GardenerAvailabilityPage Shell={Shell}/>],['/crew/kyc',()=> <Phase5.GardenerKycDocumentsPage Shell={Shell}/>],['/crew/me',GardenerProfile],['/crew/security',()=> <Phase5.AccountSecurityPage Shell={Shell}/>],
['/hq',()=> <Phase5.AdminDashboardPage Shell={Shell}/>],['/hq/security',()=> <Phase5.AccountSecurityPage Shell={Shell}/>],['/hq/notifications',()=> <Phase5.AdminNotificationsPage Shell={Shell}/>],['/hq/people',()=> <Phase5.AdminUsersPage Shell={Shell} role="CUSTOMER"/>],['/hq/people/:id',()=> <Phase5.AdminUserDetailPage Shell={Shell}/>],['/hq/crew',()=> <Phase5.AdminGardenersKycPage Shell={Shell}/>],['/hq/visits',()=> <Phase5.AdminBookingsPage Shell={Shell}/>],['/hq/catalog',()=> <Phase5.AdminServicesPage Shell={Shell}/>],['/hq/store',()=> <Phase5.AdminProductsPage Shell={Shell}/>],['/hq/plans',()=> <Phase5.AdminSubscriptionsPage Shell={Shell}/>],['/hq/botany',()=> <Phase5.AdminPlantKnowledgePage Shell={Shell}/>],['/hq/money',()=> <Phase5.AdminFinancePage Shell={Shell}/>],['/hq/insights',()=> <Phase5.AdminAnalyticsPage Shell={Shell}/>],['/hq/cms',()=> <Phase5.AdminCmsPage Shell={Shell}/>],['/hq/reviews',()=> <Phase5.AdminReviewsIssuesPage Shell={Shell} mode="reviews"/>],['/hq/issues',()=> <Phase5.AdminReviewsIssuesPage Shell={Shell} mode="issues"/>],['*',NF]];
function ProtectedRole({role,children}){
  const {authUser,authReady}=useApp();
  const nav=useNavigate();
  const location=useLocation();
  React.useEffect(()=>{
    if(!authReady)return;
    if(!authUser)nav('/login',{replace:true,state:{from:`${location.pathname}${location.search}${location.hash}`}});
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

class AppErrorBoundary extends React.Component {
  constructor(props){
    super(props);
    this.state={hasError:false};
  }
  static getDerivedStateFromError(){ return {hasError:true}; }
  componentDidCatch(error,info){
    console.error('T-CARE interface rendering error:',error,info?.componentStack||'');
  }
  render(){
    if(this.state.hasError){
      return <main role="alert" style={{minHeight:'100vh',display:'grid',placeContent:'center',gap:16,padding:24,textAlign:'center',background:'#f6f8f4',color:'#1d2b22'}}>
        <h1 style={{margin:0}}>T-CARE encountered a display problem.</h1>
        <p style={{maxWidth:520,margin:'0 auto'}}>Your saved account and booking data have not been intentionally changed. Reload the page to retry the interface.</p>
        <button type="button" onClick={()=>window.location.reload()} style={{justifySelf:'center',padding:'12px 20px',border:0,borderRadius:10,background:'#245c3c',color:'#fff',cursor:'pointer'}}>Reload T-CARE</button>
      </main>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(<BrowserRouter><MotionConfig reducedMotion="user"><Provider><AppErrorBoundary><App/></AppErrorBoundary></Provider></MotionConfig></BrowserRouter>);
