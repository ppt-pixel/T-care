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
      <div className="pc-rate"><b>Care, made visible</b><span>Meet Gardeners, read customer reviews and browse the store.</span></div>
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
  ['How do I book a visit?','Choose a service, date and time, then add the plants you would like included. You can follow your booking and see its assigned Gardener in your account.'],
  ['Are your gardeners verified?','Gardeners shown in the public directory have completed identity verification and have an active account.'],
  ['What areas do you serve?','Visit availability depends on the Gardener and the booking address. Check the booking form for available dates and times.'],
  ['Do I need to be home during the visit?','Please coordinate access arrangements with T-Care before the scheduled visit.'],
  ['What if my plant does not improve?','Use your booking and service report to share an update with T-Care. Any follow-up depends on the terms agreed for that booking.'],
];

/* ============ SERVICES ============ */
const DETAILS={}; // Only Admin-published descriptions and prices are presented as service facts.
const SERVICE_TO={'Plant Store':'/store','Green Makeover':'/makeover','AI Care':'/garden/shop'};

export function ServicesPage({services=[],loading=false,error='',onRetry}){
  const cats=['All',...Array.from(new Set(services.map(s=>s.cat)))];
  const [cat,setCat]=React.useState('All');
  const list=services.filter(s=>cat==='All'||s.cat===cat);
  return <>
    <PageHero eyebrow="Our services" title={<>Care for every <em>green corner</em></>} sub="Explore plant-care services and their prices.">
      <LBtn to="/garden/book" variant="gold">Book a visit <ArrowRight size={15}/></LBtn><LBtn to="/plans" variant="outline">Compare plans</LBtn>
    </PageHero>
    <section className="lsec svc-list">
      {loading&&!services.length?<div className="public-state">Loading services…</div>:null}
      {error&&!services.length?<div className="public-state" role="alert"><p>Services are temporarily unavailable.</p><button className="tl" onClick={onRetry}>Try again</button></div>:null}
      {!loading&&!error&&!services.length?<div className="public-state">No services are available right now.</div>:null}
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
  [Recycle,'Thoughtful choices','Compare care services and product details.'],
  [Users,'People at the centre','Customers and Gardeners can review visits and service reports.'],
  [Award,'Clear care records','Keep plant details and visit reports together.'],
];
function GardenerDirectory(){
  const {items:gardeners,loading,error,retry}=usePublicList('/gardener/public','gardeners');
  return <section className="lsec team"><Head center eyebrow="Verified Gardeners" sub="Meet active Gardeners who have completed identity verification.">Meet the <em>Gardeners</em></Head>
    {loading&&!gardeners.length?<div className="public-state">Loading verified Gardener profiles…</div>:null}
    {error&&!gardeners.length?<div className="public-state" role="alert"><p>Gardener profiles are temporarily unavailable.</p><button className="tl" onClick={retry}>Try again</button></div>:null}
    {!loading&&!error&&!gardeners.length?<div className="public-state">No Gardener profiles are available right now.</div>:null}
    {!!gardeners.length&&<div className="team-grid">{gardeners.map((g,i)=><Reveal key={g.id} delay={(i%4)*.06} className="team-card"><span className="avatar">{String(g.name||'T-Care').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()}</span><h3>{g.name}</h3><b>Verified Gardener</b>
      {g.rating!=null&&<span className="team-rating"><Star size={13} fill="currentColor"/> {Number(g.rating).toFixed(1)} / 5</span>}
      {g.serviceArea&&<small className="team-area"><MapPin size={12}/> {g.serviceArea}</small>}
      {g.bio&&<p>{g.bio}</p>}
      <small>{g.completedVisits} completed visits</small></Reveal>)}</div>}
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
  ['Can I change my plan later?','Contact T-Care before your next billing date. Available changes depend on your subscription.'],
  ['Can I pause or cancel?','If pause or cancellation is available for your plan, you can manage it from your subscription account.'],
  ['When will I be charged?','Your plan stays pending until payment is confirmed.'],
  ['Where can I see what my plan includes?','Each plan lists its billing period, price and plant limit.'],
];
export function PlansPage(){
  return <>
    <PageHero eyebrow="Plans & pricing" title={<>Care plans that <em>grow with you</em></>} sub="Compare available plans, prices, billing periods and plant limits.">
      <LBtn to="/services" variant="gold">Explore care services <ArrowRight size={15}/></LBtn>
    </PageHero>
    <Plans/>
    <section className="lsec perks"><div className="perk-row">{[[ShieldCheck,'Verified gardeners'],[RotateCcw,'Plan status in your account'],[Heart,'Plant-care records'],[Clock,'Scheduled visits']].map(([I,t],i)=><Reveal key={t} delay={i*.06} className="perk"><I size={20}/><b>{t}</b></Reveal>)}</div></section>
    <Faq items={FAQ_PLANS} eyebrow="Billing FAQ" title="Plan questions"/>
  </>;
}

/* ============ STORE ============ */
const STORE_PERKS=[
  [Truck,'Product availability','See stock on each listing.'],
  [ShieldCheck,'Clear product details','Review product information and prices.'],
  [Sprout,'Plant and garden essentials','Browse plants and gardening products.'],
  [Package,'Your cart','Save items while you browse.'],
];
export function StorePage({cart}){
  const {items:products,loading,error,retry}=usePublicList('/products?limit=100','products');
  const cats=['All',...Array.from(new Set(products.map(p=>p.category).filter(Boolean)))];
  const [cat,setCat]=React.useState('All');
  const list=products.filter(p=>cat==='All'||p.category===cat);
  React.useEffect(()=>{if(cat!=='All'&&!cats.includes(cat))setCat('All')},[cat,cats.join('|')]);
  return <>
    <PageHero eyebrow="T-Care market" title={<>Everything your <em>plants</em> need</>} sub="Browse plants and gardening essentials, with prices and stock shown on each listing.">
      <LBtn onClick={()=>cart.setOpen(true)} variant="gold">View cart{cart.count>0?` (${cart.count})`:''} <ArrowRight size={15}/></LBtn>
    </PageHero>
    <section className="lsec store">
      {loading&&!products.length?<div className="public-state" role="status">Loading products…</div>:null}
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
        {!list.length&&<div className="public-state">No products are available in this category.</div>}
      </>}
      {!loading&&!error&&!products.length&&<div className="public-state">No products are available right now.</div>}
    </section>
    <section className="lsec perks"><Head center eyebrow="Shop with clarity">Product details, <em>clear pricing</em></Head>
      <div className="commit-grid four">{STORE_PERKS.map(([I,t,d],i)=><Reveal key={t} delay={i*.06} className="commit-card"><span className="ic"><I size={22}/></span><h3>{t}</h3><p>{d}</p></Reveal>)}</div></section>
    <section className="lsec guide"><Reveal className="guide-card"><div><span className="eyebrow">Need help with plant care?</span><h2>Find care that <em>suits your space</em></h2><p>Explore available services and book a visit for your plants.</p></div><div className="cta-btns"><LBtn to="/services" variant="gold">Explore care services <ArrowRight size={15}/></LBtn><LBtn to="/garden/book" variant="outline">Book a care visit</LBtn></div></Reveal></section>
    <p className="catalog-note">Products can be browsed and saved in your cart. Orders, payment and delivery are not available in the store.</p>
  </>;
}

/* ============ MAKEOVER ============ */
const MAKE_STEPS=[
  [Camera,'Share your space','Describe the area and your goals in a request.'],
  [Ruler,'Review the requirements','Discuss the space and work involved with T-Care.'],
  [Palette,'Confirm the proposal','Agree the plants, materials, price and timing before work begins.'],
  [Sparkles,'Schedule the work','The booking record will show the agreed service and status.'],
];
const FAQ_MAKE=[
  ['How much does a makeover cost?','The price depends on your space and the work involved. Confirm the scope and price before accepting a quote.'],
  ['Can I use my existing plants and pots?','Mention your existing plants and pots in your request so they can be considered when discussing the work.'],
  ['Is aftercare included?','Check whether follow-up or maintenance is included in the agreed service.'],
];
export function MakeoverPage(){
  return <>
    <PageHero eyebrow="Green Makeover" title={<>Spaces, <em>reimagined</em></>} sub="Explore ideas for balconies, indoor corners and terraces. Images show concepts, not completed projects.">
      <LBtn to="/garden/book" variant="gold">Plan my makeover <ArrowRight size={15}/></LBtn>
    </PageHero>
    <Transformations/>
    <section className="lsec how4"><Head center eyebrow="How it works">Plan your <em>green space</em></Head>
      <div className="how4-grid">{MAKE_STEPS.map(([I,t,d],i)=><Reveal key={t} delay={i*.08} className="commit-card"><span className="step-no">0{i+1}</span><span className="ic"><I size={22}/></span><h3>{t}</h3><p>{d}</p></Reveal>)}</div></section>
    <section className="lsec tiers"><Head center eyebrow="Scope & pricing">A proposal built for <em>your space</em></Head>
      <div className="public-state"><p>Share your space and ideas, then agree on the work, price and schedule before accepting a quote.</p><LBtn to="/garden/book" variant="dark">Request a makeover quote <ArrowRight size={14}/></LBtn></div></section>
    <Faq items={FAQ_MAKE} eyebrow="Makeover FAQ" title="Before you begin"/>
  </>;
}

/* ============ CONTACT ============ */
export function ContactPage(){
  const whatsappConfigured=/^[1-9]\d{7,14}$/.test(C.WHATSAPP_NUMBER);
  const email=C.PUBLIC_CONTACT_EMAIL;
  const phone=String(import.meta.env.VITE_PUBLIC_PHONE_NUMBER||'').trim();
  const location=String(import.meta.env.VITE_PUBLIC_LOCATION||'').trim();
  const officeAddress=String(import.meta.env.VITE_PUBLIC_OFFICE_ADDRESS||'').trim();
  const cards=[
    ...(whatsappConfigured?[[MessageCircle,'WhatsApp','Message T-Care on WhatsApp',C.WHATSAPP_NUMBER]]:[]),
    ...(email?[[Mail,'Customer care','Support and account enquiries',email]]:[]),
    ...(phone?[[Phone,'Phone','Call T-Care',phone]]:[]),
    ...(officeAddress?[[MapPin,'Main office','Published office address',officeAddress]]:[]),
    ...(location?[[MapPin,'Service location','Published service location',location]]:[]),
  ];
  return <>
    <PageHero eyebrow="Contact" title={<>We would love to <em>hear from you</em></>} sub="Choose an available contact option below."/>
    <section className="lsec contact">
      <div className="contact-cards">
        {cards.map(([I,t,sub,value],i)=><Reveal key={t} delay={i*.06} className="ccard"><span className="ic"><I size={20}/></span><div><b>{t}</b><small>{sub==='Published office address'||sub==='Published service location'?'':sub}</small><span>{t==='Customer care'?<a href={`mailto:${value}`}>{value}</a>:t==='Phone'?<a href={`tel:${String(value).replace(/[^+\d]/g,'')}`}>{value}</a>:value}</span></div></Reveal>)}
        {whatsappConfigured?<WaBtn variant="outline">Chat on WhatsApp</WaBtn>:null}
        {!cards.length&&<div className="public-state">Contact options are not available right now.</div>}
      </div>
      <div className="cform"><h3>Need help with an existing booking?</h3><p>Sign in to review your booking, assigned Gardener and service report.</p><LBtn to="/login" variant="dark">Sign in to T-Care <ArrowRight size={15}/></LBtn></div>
    </section>
    <Faq items={FAQ_GENERAL}/>
  </>;
}

/* ============ TERMS & PRIVACY ============ */
const TERMS_SECTIONS = [
  ['Using T-CARE', 'T-CARE lets customers manage plant information, request plant-care services and contact the service team. Provide accurate account and contact information, keep your sign-in details private and use the services lawfully. You are responsible for activity carried out through your account until you report suspected unauthorized access to T-CARE.'],
  ['Customer and Gardener accounts', 'Customers may maintain plant and address records and submit service requests. Gardeners may need to complete identity and document checks before receiving or carrying out assignments. Administrator accounts are created by T-CARE and are not available through public sign-up. Account access depends on the role assigned to each person.'],
  ['Bookings and service scope', 'A booking request is not a confirmed appointment until T-CARE has accepted and scheduled it and, where applicable, assigned a Gardener. The service, price, date, time and scope shown in the booking record are the reference for the requested work. Any change to scope or schedule must be agreed through T-CARE before it is treated as part of the booking.'],
  ['Prices and payments', 'Prices may depend on the service, number of plants or selected plan. The amount due is calculated from the prices shown when you book. Online payment is available for supported transactions and is complete only after the payment provider confirms it. An order or payment attempt is not proof of payment. T-CARE records confirmed payments and sends a receipt to the email address on your account.'],
  ['Refunds and cancellations', 'Cancellation, rescheduling and refund eligibility depend on the status of the booking, the applicable service terms and the payment provider’s confirmed transaction or refund status. A paid booking must follow the refund process; cancelling a booking alone does not represent a completed refund. Any refund record shown in the account is subject to provider confirmation.'],
  ['Plans and subscriptions', 'A subscription request remains pending until payment is confirmed. A plan becomes active only after T-Care records the payment. Renewal dates and any pause or cancellation status are shown in your account. Plan changes depend on the options available when you make the request.'],
  ['Plant care and service reports', 'Plant health depends on environmental conditions, plant species, previous care and other factors outside T-CARE’s control. Service notes and recommendations record observations made during a visit; they are not a guarantee that a plant will recover or remain healthy. Customers should follow any safety or care instructions shared for their plants and premises.'],
  ['Products and other catalogue items', 'You can browse products and save them in your cart. The store does not currently accept orders or payment, and delivery is not available. Adding an item to your cart does not create an order or charge.'],
  ['Account security and acceptable use', 'Do not share passwords or verification codes. Do not attempt to access another person’s account, interfere with the website or services, submit false documents or misuse customer, Gardener or business information. T-CARE may restrict accounts when needed to protect users or its services.'],
  ['Changes and support', 'T-CARE may update these terms when its services or legal obligations change. Material updates will be published with a new policy version and may require renewed consent. Questions about a booking or account should be raised through the contact channels published on the Contact page.']
];

const PRIVACY_SECTIONS = [
  ['Information collected', 'T-CARE uses account details such as your name, email address, phone number and account type; plant records and care notes; service addresses, booking details and reports; and related messages and notifications. For Gardeners, this may include identity documents and professional profile information. Payment records include transaction references, amounts, status and refund information. T-CARE does not store a readable copy of your payment card details.'],
  ['Passwords and account security', 'Your password is stored in a protected form that cannot be read as plain text. It is not shared with other account holders or T-CARE staff. Secure sign-in cookies help keep your account signed in.'],
  ['How information is used', 'T-CARE uses information to create and secure accounts, verify email addresses and Gardener identities, manage plants and addresses, schedule and provide services, record service reports, handle confirmed payments and refunds, send receipts and service notifications, respond to support requests, prevent misuse and meet legal or accounting obligations.'],
  ['When information is shared', 'A Gardener assigned to a booking may receive your name, service address, contact details and the plant or service information needed for that booking. T-CARE may use service providers to host its services, store files, send email and process payments. Each provider receives only the information needed for its work. Access by T-CARE staff is limited to authorized personnel.'],
  ['Payments', 'Payment details are entered with the payment provider during checkout. T-CARE stores transaction references, amounts, statuses, dates and refund details needed to track payments and assist customers. Receipts are sent to the email address on your account.'],
  ['Cookies and browser storage', 'T-CARE uses secure cookies to keep you signed in. Your browser may also store preferences, such as your theme, and your shopping cart for browsing. Your browser or password manager may separately save sign-in details according to your settings.'],
  ['Retention and deletion', 'T-CARE keeps account, service, payment and security information for as long as needed to provide services, resolve disputes and meet legal or accounting obligations. Some transaction records may need to be kept after an account is closed. You can use T-CARE’s published contact details to request a correction or deletion; requests are assessed against these obligations.'],
  ['Your choices and rights', 'You can review and update available profile information from your account. You may contact T-CARE to request access to, correction of or deletion of personal information, or to raise a privacy concern. T-CARE may need to verify your identity before acting on a request and may retain information where legally required or necessary to complete an outstanding service or resolve a dispute.'],
  ['Policy updates and contact', 'This notice may be updated when T-CARE’s information practices change. The current version and publication date are shown above. For privacy questions, use the email, phone number or address on the Contact page.']
];

function LegalDocument({ eyebrow, title, intro, version, sections }) {
  return <>
    <PageHero eyebrow={eyebrow} crumb={eyebrow} title={title} sub={intro}/>
    <section className="lsec terms">
      <div className="legal-document-meta"><span>Policy version: {version}</span><span>Published: 18 November 2026</span></div>
      <div className="terms-card">{sections.map(([heading,body],index)=><Reveal key={heading} delay={index*.025} className="term"><span>{String(index+1).padStart(2,'0')}</span><div><h3>{heading}</h3><p>{body}</p></div></Reveal>)}</div>
    </section>
  </>;
}

export function TermsPage(){
  return <LegalDocument eyebrow="Terms & Conditions" title={<>Clear terms for <em>care and service</em></>} sub="Please review the terms for creating an account and using T-CARE services." version={C.TERMS_POLICY_VERSION} sections={TERMS_SECTIONS}/>;
}

export function PrivacyPage(){
  return <LegalDocument eyebrow="Privacy Policy" title={<>Your information, <em>handled with care</em></>} sub="Learn what information T-CARE collects and how it is used." version={C.PRIVACY_POLICY_VERSION} sections={PRIVACY_SECTIONS}/>;
}
