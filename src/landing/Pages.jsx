import React from 'react';
import {motion,AnimatePresence} from 'framer-motion';
import {Link} from 'react-router-dom';
import {Leaf,ArrowRight,Check,Phone,Mail,Clock,MapPin,Truck,ShieldCheck,RotateCcw,Sparkles,Camera,Ruler,Palette,Package,Award,Users,Recycle,Plus,Minus,MessageCircle,Sprout,Heart,Star,Sun,Droplets,Bug} from 'lucide-react';
import {LBtn,Reveal,Head,money,WaBtn,ProductArt} from './Sections.jsx';
import {Included,Steps,ServiceBanner,Plans,Story,Reviews,Transformations} from './Sections.jsx';
import {usePublicList} from './publicData.js';
import * as C from './content.js';
import './pages.css';

/* ---------- shared bits ---------- */
export function PageHero({eyebrow,title,sub,crumb,children}){
  return <section className="phero">
    <Leaf className="phero-leaf a" size={190} strokeWidth={.7}/><Leaf className="phero-leaf b" size={110} strokeWidth={.7}/>
    <motion.div className="phero-in" initial={{opacity:0,y:26}} animate={{opacity:1,y:0}} transition={{duration:.65,ease:[.22,1,.36,1]}}>
      <nav className="crumb" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><b>{crumb||eyebrow}</b></nav>
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{sub}</p>
      {children&&<div className="phero-actions">{children}</div>}
    </motion.div>
    <motion.aside className="phero-card" aria-label="Why T-Care" initial={{opacity:0,y:30,rotate:-4}} animate={{opacity:1,y:0,rotate:-2}} transition={{duration:.8,delay:.15,ease:[.22,1,.36,1]}}>
      <div className="pc-rate"><b>Care, made visible</b><span>Explore verified profiles, published reviews and live catalogues.</span></div>
      <ul>{C.HERO_TICKS.map(t=><li key={t}><span><Check size={13}/></span>{t}</li>)}</ul>
      <div className="pc-icons"><i><Droplets size={16}/></i><i><Sun size={16}/></i><i><Bug size={16}/></i><i><Sprout size={16}/></i></div>
    </motion.aside>
  </section>;
}

function StatBand({stats=C.HERO_STATS}){
  if(!stats?.length)return null;
  return <section className="lsec statband"><div className="stat-grid">{stats.map(([ic,v,l],i)=><Reveal key={l} delay={i*.07} className="stat"><b>{v}</b><span>{l}</span></Reveal>)}</div></section>;
}

function Faq({items,title='Questions, answered',eyebrow='FAQ'}){
  const [open,setOpen]=React.useState(0);
  return <section className="lsec faq"><Head center eyebrow={eyebrow}>{title}</Head>
    <div className="faq-list">{items.map(([q,a],i)=><div key={q} className={'faq-item'+(open===i?' open':'')}>
      <button type="button" aria-expanded={open===i} onClick={()=>setOpen(open===i?-1:i)}><span>{q}</span>{open===i?<Minus size={17}/>:<Plus size={17}/>}</button>
      <AnimatePresence initial={false}>{open===i&&<motion.div key="a" className="faq-a" initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:.3}}><p>{a}</p></motion.div>}</AnimatePresence>
    </div>)}</div></section>;
}

const FAQ_GENERAL=[
  ['How do I book a visit?','Choose an active service, select a suitable date and time, and add the plants you would like included. Booking and assignment status are shown in your account.'],
  ['Are your gardeners verified?','The public Gardener directory lists only profiles whose T-Care KYC status is verified and whose account is active.'],
  ['What areas do you serve?','Availability depends on the service area configured for the Gardener and the booking address. Check the booking flow for the available options.'],
  ['Do I need to be home during the visit?','Please coordinate access arrangements with T-Care before the scheduled visit.'],
  ['What if my plant does not improve?','Use your booking record and service report to share an update with T-Care. Any follow-up depends on the service terms agreed for that booking.'],
];

/* ============ SERVICES ============ */
const DETAILS={}; // Only Admin-published descriptions and prices are presented as service facts.
const SERVICE_TO={'Plant Store':'/store','Green Makeover':'/makeover','AI Care':'/garden/shop'};

export function ServicesPage({services=[],loading=false,error='',onRetry}){
  const cats=['All',...Array.from(new Set(services.map(s=>s.cat)))];
  const [cat,setCat]=React.useState('All');
  const list=services.filter(s=>cat==='All'||s.cat===cat);
  return <>
    <PageHero eyebrow="Our services" title={<>Care for every <em>green corner</em></>} sub="Explore the active services and current prices published by T-Care.">
      <LBtn to="/garden/book" variant="gold">Book a visit <ArrowRight size={15}/></LBtn><LBtn to="/plans" variant="outline">Compare plans</LBtn>
    </PageHero>
    <section className="lsec svc-list">
      {loading&&!services.length?<div className="public-state">Loading active services…</div>:null}
      {error&&!services.length?<div className="public-state" role="alert"><p>Live services are temporarily unavailable.</p><button className="tl" onClick={onRetry}>Try again</button></div>:null}
      {!loading&&!error&&!services.length?<div className="public-state">No active services are published yet. Please check back later.</div>:null}
      {!!services.length&&<>
      <div className="chips" role="tablist" aria-label="Service categories">{cats.map(c=><button key={c} role="tab" aria-selected={cat===c} className={cat===c?'on':''} onClick={()=>setCat(c)}>{c}</button>)}</div>
      <div className="svc-grid">{list.map((s,i)=><Reveal key={s.id||s.name} delay={(i%4)*.05} className="svc-card">
        <div className="svc-top"><span className="ic" style={{'--h':s.hue}}><s.icon size={24} strokeWidth={1.5}/></span><em>{s.cat}</em></div>
        <h3>{s.name}</h3><p>{s.desc}</p>
        
        <div className="svc-foot"><div><b>{s.price === 0 ? 'Free' : s.price != null ? `from ${money(s.price)}` : 'Price on request'}</b><small>{s.time}</small></div><LBtn to={SERVICE_TO[s.name]||'/garden/book'} variant="dark">{SERVICE_TO[s.name]?'Explore':'Book'} <ArrowRight size={14}/></LBtn></div>
      </Reveal>)}</div>
      </>}
    </section>
    <Included/>
    <Steps/>
    <StatBand/>
    <ServiceBanner services={services}/>
    <Faq items={FAQ_GENERAL}/>
  </>;
}

/* ============ ABOUT ============ */
const COMMIT=[
  [Recycle,'Thoughtful choices','Care guidance and product information are presented in one place.'],
  [Users,'People at the centre','Customers and verified gardeners use the same service records to stay aligned.'],
  [Award,'Clear care records','Plant updates and completed-service reports remain linked to the customer account.'],
];
function GardenerDirectory(){
  const {items:gardeners,loading,error,retry}=usePublicList('/gardener/public','gardeners');
  return <section className="lsec team"><Head center eyebrow="Verified gardeners" sub="Only active profiles that have completed T-Care verification are shown here.">Meet the <em>gardeners</em></Head>
    {loading&&!gardeners.length?<div className="public-state">Loading verified Gardener profiles…</div>:null}
    {error&&!gardeners.length?<div className="public-state" role="alert"><p>Gardener profiles are temporarily unavailable.</p><button className="tl" onClick={retry}>Try again</button></div>:null}
    {!loading&&!error&&!gardeners.length?<div className="public-state">No verified Gardener profiles are publicly listed yet. Profiles will appear here after Admin verification.</div>:null}
    {!!gardeners.length&&<div className="team-grid">{gardeners.map((g,i)=><Reveal key={g.id} delay={(i%4)*.06} className="team-card"><span className="avatar">{String(g.name||'T-Care').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()}</span><h3>{g.name}</h3><b>Verified Gardener</b>
      {g.rating!=null&&<span className="team-rating"><Star size={13} fill="currentColor"/> {Number(g.rating).toFixed(1)} / 5</span>}
      {g.serviceArea&&<small className="team-area"><MapPin size={12}/> {g.serviceArea}</small>}
      {g.bio&&<p>{g.bio}</p>}
      <small>{g.completedVisits} completed visits recorded</small></Reveal>)}</div>}
  </section>;
}

export function AboutPage(){
  return <>
    <PageHero eyebrow="About T-Care" title={<>Plant care, built around <em>people</em></>} sub="T-Care brings customers, verified gardeners and plant-care records together in one place.">
      <LBtn to="/garden/book" variant="gold">Book a visit <ArrowRight size={15}/></LBtn><LBtn to="/contact" variant="outline">Get in touch</LBtn>
    </PageHero>
    <Story/>
    <section className="lsec commit"><Head center eyebrow="What guides our work">Thoughtful care, <em>clear records</em></Head>
      <div className="commit-grid">{COMMIT.map(([I,t,d],i)=><Reveal key={t} delay={i*.08} className="commit-card"><span className="ic"><I size={22}/></span><h3>{t}</h3><p>{d}</p></Reveal>)}</div></section>
    <GardenerDirectory/>
    <Reviews/>
  </>;
}

/* ============ PLANS ============ */
const FAQ_PLANS=[
  ['Can I change my plan later?','Contact T-Care before your next billing cycle. Available changes depend on your current subscription status.'],
  ['Can I pause or cancel?','Available pause and cancellation actions are shown in your subscription account, based on the current status of your plan.'],
  ['When will I be charged?','A plan request is recorded as pending. It does not become active until payment is verified.'],
  ['Where can I see what my plan includes?','Each active plan shows its billing duration, price and plant limit as configured by T-Care.'],
];
export function PlansPage(){
  return <>
    <PageHero eyebrow="Plans & pricing" title={<>Care plans that <em>grow with you</em></>} sub="Compare the active plans currently published by T-Care. Plan duration, plant limits and price come directly from the subscription catalogue.">
      <LBtn to="/garden/plan" variant="gold">Open subscriptions <ArrowRight size={15}/></LBtn>
    </PageHero>
    <Plans/>
    <section className="lsec perks"><div className="perk-row">{[[ShieldCheck,'Verified gardeners'],[RotateCcw,'Plan status in your account'],[Heart,'Plant-care records'],[Clock,'Scheduled visits']].map(([I,t],i)=><Reveal key={t} delay={i*.06} className="perk"><I size={20}/><b>{t}</b></Reveal>)}</div></section>
    <Faq items={FAQ_PLANS} eyebrow="Billing FAQ" title="Plan questions"/>
  </>;
}

/* ============ STORE ============ */
const STORE_PERKS=[
  [Truck,'Current stock','Availability is shown from the live product inventory.'],
  [ShieldCheck,'Clear product details','Descriptions, prices and categories come from the catalogue.'],
  [Sprout,'Plant and garden essentials','Browse the products T-Care has published.'],
  [Package,'Simple cart summary','Review selected items before checkout becomes available.'],
];
export function StorePage({cart}){
  const {items:products,loading,error,retry}=usePublicList('/products?limit=100','products');
  const cats=['All',...Array.from(new Set(products.map(p=>p.category).filter(Boolean)))];
  const [cat,setCat]=React.useState('All');
  const list=products.filter(p=>cat==='All'||p.category===cat);
  React.useEffect(()=>{if(cat!=='All'&&!cats.includes(cat))setCat('All')},[cat,cats.join('|')]);
  return <>
    <PageHero eyebrow="T-Care market" title={<>Everything your <em>plants</em> need</>} sub="Browse the current plant and gardening essentials catalogue. Prices and available stock are loaded from T-Care's live inventory.">
      <LBtn onClick={()=>cart.setOpen(true)} variant="gold">View cart{cart.count>0?` (${cart.count})`:''} <ArrowRight size={15}/></LBtn>
    </PageHero>
    <section className="lsec store">
      {loading&&!products.length?<div className="public-state" role="status">Loading the live product catalogue…</div>:null}
      {error&&!products.length?<div className="public-state" role="alert"><p>The product catalogue is temporarily unavailable.</p><button className="tl" onClick={retry}>Try again</button></div>:null}
      {!!products.length&&<>
        <div className="chips" role="tablist" aria-label="Product categories">{cats.map(c=><button type="button" key={c} role="tab" aria-selected={cat===c} className={cat===c?'on':''} onClick={()=>setCat(c)}>{c}</button>)}</div>
        <div className="store-grid">{list.map((p,i)=>{
          const discount=p.compareAtPrice>p.price?Math.round((p.compareAtPrice-p.price)/p.compareAtPrice*100):0;
          return <Reveal key={p.id} delay={(i%4)*.05} className="pcard">{discount>0&&<span className="off">{discount}% OFF</span>}<ProductArt product={p}/>
            <div className="pbody"><small>{p.category} · {p.stockQuantity>0?`${p.stockQuantity} in stock`:'Out of stock'}</small><h4>{p.name}</h4>{p.description&&<p className="product-desc">{p.description}</p>}
              <div className="pfoot"><div><b>{money(p.price)}</b>{p.compareAtPrice>p.price&&<s>{money(p.compareAtPrice)}</s>}</div>
                <button className="add" type="button" disabled={p.stockQuantity<=0} onClick={()=>cart.add({...p,kind:p.kind||'snake',pot:p.potColor||'#e8e1d2'})}>{p.stockQuantity>0?'Add to Cart':'Out of stock'}</button></div></div></Reveal>;
        })}</div>
        {!list.length&&<div className="public-state">No products are currently listed in this category.</div>}
      </>}
      {!loading&&!error&&!products.length&&<div className="public-state">No products are listed yet. The catalogue will appear here once T-Care adds products.</div>}
    </section>
    <section className="lsec perks"><Head center eyebrow="Shop with clarity">Current stock, <em>clear pricing</em></Head>
      <div className="commit-grid four">{STORE_PERKS.map(([I,t,d],i)=><Reveal key={t} delay={i*.06} className="commit-card"><span className="ic"><I size={22}/></span><h3>{t}</h3><p>{d}</p></Reveal>)}</div></section>
    <section className="lsec guide"><Reveal className="guide-card"><div><span className="eyebrow">Not sure what to pick?</span><h2>Let a gardener <em>choose with you</em></h2><p>Share your light, space and routine with T-Care, then choose plants that suit your home.</p></div><div className="cta-btns"><LBtn to="/garden/shop" variant="gold">Explore care services <ArrowRight size={15}/></LBtn><LBtn to="/garden/book" variant="outline">Book a consultation</LBtn></div></Reveal></section>
    <p className="catalog-note">The cart is a browsing aid in this release. Online product checkout and payment are not enabled yet.</p>
  </>;
}

/* ============ MAKEOVER ============ */
const MAKE_STEPS=[
  [Camera,'Share your space','Describe the area and your goals in a booking request.'],
  [Ruler,'Review the requirements','T-Care can assess the space and clarify the scope with you.'],
  [Palette,'Confirm the proposal','Agree the plants, materials, price and timing before work begins.'],
  [Sparkles,'Schedule the work','The booking record will show the agreed service and status.'],
];
const FAQ_MAKE=[
  ['How much does a makeover cost?','Makeover pricing is not published as a fixed package in this release. Submit a request so the scope and price can be confirmed before you proceed.'],
  ['Can I use my existing plants and pots?','Mention your existing plants and pots in the booking notes so the team can review them as part of the request.'],
  ['Is aftercare included?','Any follow-up, aftercare or maintenance must be explicitly included in the service proposal agreed for your booking.'],
];
export function MakeoverPage(){
  return <>
    <PageHero eyebrow="Green Makeover" title={<>Spaces, <em>reimagined</em></>} sub="Explore illustrative concepts for balconies, indoor corners and terraces. These visuals are not customer project photographs.">
      <LBtn to="/garden/book" variant="gold">Plan my makeover <ArrowRight size={15}/></LBtn>
    </PageHero>
    <Transformations/>
    <section className="lsec how4"><Head center eyebrow="How it works">From photo to <em>paradise</em></Head>
      <div className="how4-grid">{MAKE_STEPS.map(([I,t,d],i)=><Reveal key={t} delay={i*.08} className="commit-card"><span className="step-no">0{i+1}</span><span className="ic"><I size={22}/></span><h3>{t}</h3><p>{d}</p></Reveal>)}</div></section>
    <section className="lsec tiers"><Head center eyebrow="Scope & pricing" sub="No sample prices or unverified package inclusions.">A proposal built for <em>your space</em></Head>
      <div className="public-state"><p>Describe your space and requirements in a booking request. T-Care should confirm scope, deliverables, price and schedule before you accept the work.</p><LBtn to="/garden/book" variant="dark">Request a makeover quote <ArrowRight size={14}/></LBtn></div></section>
    <Faq items={FAQ_MAKE} eyebrow="Makeover FAQ" title="Before you begin"/>
  </>;
}

/* ============ CONTACT ============ */
export function ContactPage(){
  const whatsappConfigured=/^[1-9]\d{7,14}$/.test(C.WHATSAPP_NUMBER);
  const email=String(import.meta.env.VITE_PUBLIC_CONTACT_EMAIL||'').trim();
  const phone=String(import.meta.env.VITE_PUBLIC_PHONE_NUMBER||'').trim();
  const location=String(import.meta.env.VITE_PUBLIC_LOCATION||'').trim();
  const cards=[
    ...(whatsappConfigured?[[MessageCircle,'WhatsApp','Open the configured T-Care business chat',C.WHATSAPP_NUMBER]]:[]),
    ...(email?[[Mail,'Email','Contact the published T-Care email',email]]:[]),
    ...(phone?[[Phone,'Phone','Call the published T-Care number',phone]]:[]),
    ...(location?[[MapPin,'Location','Published service location',location]]:[]),
  ];
  return <>
    <PageHero eyebrow="Contact" title={<>We would love to <em>hear from you</em></>} sub="Choose a contact channel configured by T-Care."/>
    <section className="lsec contact">
      <div className="contact-cards">
        {cards.map(([I,t,sub,value],i)=><Reveal key={t} delay={i*.06} className="ccard"><span className="ic"><I size={20}/></span><div><b>{t}</b><small>{sub}</small><span>{value}</span></div></Reveal>)}
        {whatsappConfigured?<WaBtn variant="outline">Chat on WhatsApp</WaBtn>:<div className="public-state"><b>WhatsApp is not configured yet.</b><p>T-Care needs to set its public WhatsApp business number before this channel can be opened.</p></div>}
        {!cards.length&&<div className="public-state">No public contact details have been configured yet. Sign in to manage your bookings and account notifications.</div>}
      </div>
      <div className="cform"><h3>Need help with an existing booking?</h3><p>Sign in to review the booking, its assignment, service report and notification history. Please do not send private account details through an unconfigured contact channel.</p><LBtn to="/login" variant="dark">Sign in to T-Care <ArrowRight size={15}/></LBtn></div>
    </section>
    <Faq items={FAQ_GENERAL}/>
  </>;
}

/* ============ TERMS ============ */
const TERMS=[
  ['Publication status','This page is a draft placeholder, not the final T-Care terms or privacy notice. Do not treat it as a contractual policy.'],
  ['Bookings and cancellations','The applicable booking, cancellation and rescheduling terms must be provided and accepted before a service is confirmed.'],
  ['Payments and refunds','Payment collection, refunds and applicable refund timelines are not enabled or confirmed by this release. Any future policy must be published before those features go live.'],
  ['Products and delivery','Product checkout, delivery commitments, replacement guarantees and return terms are not enabled or confirmed in this release.'],
  ['Privacy','The final privacy notice must describe the actual data collected, processing purposes, retention periods and user rights before launch.'],
  ['Contact','Use only contact details configured on the Contact page.'],
];
export function TermsPage(){
  return <>
    <PageHero eyebrow="Legal" crumb="Terms & privacy" title={<>Terms &amp; <em>privacy</em></>} sub="This is a publication placeholder. The final policy must be approved before transactional features launch."/>
    <section className="lsec terms"><div className="terms-card">{TERMS.map(([t,d],i)=><Reveal key={t} delay={i*.04} className="term"><span>{String(i+1).padStart(2,'0')}</span><div><h3>{t}</h3><p>{d}</p></div></Reveal>)}</div></section>
  </>;
}
