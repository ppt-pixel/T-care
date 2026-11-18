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
      <LBtn to="/services" variant="gold">Explore care services <ArrowRight size={15}/></LBtn>
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
    <section className="lsec guide"><Reveal className="guide-card"><div><span className="eyebrow">Not sure what to pick?</span><h2>Let a gardener <em>choose with you</em></h2><p>Share your light, space and routine with T-Care, then choose plants that suit your home.</p></div><div className="cta-btns"><LBtn to="/services" variant="gold">Explore care services <ArrowRight size={15}/></LBtn><LBtn to="/garden/book" variant="outline">Book a consultation</LBtn></div></Reveal></section>
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
  const officeAddress=String(import.meta.env.VITE_PUBLIC_OFFICE_ADDRESS||'').trim();
  const cards=[
    ...(whatsappConfigured?[[MessageCircle,'WhatsApp','Open the configured T-Care business chat',C.WHATSAPP_NUMBER]]:[]),
    ...(email?[[Mail,'Email','Contact the published T-Care email',email]]:[]),
    ...(phone?[[Phone,'Phone','Call the published T-Care number',phone]]:[]),
    ...(officeAddress?[[MapPin,'Main office','Published office address',officeAddress]]:[]),
    ...(location?[[MapPin,'Service location','Published service location',location]]:[]),
  ];
  return <>
    <PageHero eyebrow="Contact" title={<>We would love to <em>hear from you</em></>} sub="Choose a contact channel configured by T-Care."/>
    <section className="lsec contact">
      <div className="contact-cards">
        {cards.map(([I,t,sub,value],i)=><Reveal key={t} delay={i*.06} className="ccard"><span className="ic"><I size={20}/></span><div><b>{t}</b><small>{sub}</small><span>{t==='Email'?<a href={`mailto:${value}`}>{value}</a>:t==='Phone'?<a href={`tel:${String(value).replace(/[^+\d]/g,'')}`}>{value}</a>:value}</span></div></Reveal>)}
        {whatsappConfigured?<WaBtn variant="outline">Chat on WhatsApp</WaBtn>:<div className="public-state"><b>WhatsApp is not configured yet.</b><p>T-Care needs to set its public WhatsApp business number before this channel can be opened.</p></div>}
        {!cards.length&&<div className="public-state">No public contact details have been configured yet. Sign in to manage your bookings and account notifications.</div>}
      </div>
      <div className="cform"><h3>Need help with an existing booking?</h3><p>Sign in to review the booking, its assignment, service report and notification history. Please do not send private account details through an unconfigured contact channel.</p><LBtn to="/login" variant="dark">Sign in to T-Care <ArrowRight size={15}/></LBtn></div>
    </section>
    <Faq items={FAQ_GENERAL}/>
  </>;
}

/* ============ TERMS & PRIVACY ============ */
const TERMS_SECTIONS = [
  ['Using T-CARE', 'T-CARE provides a platform for customers to manage plant information, request plant-care services and communicate with the service team. You must provide accurate account and contact information, keep your sign-in credentials private and use the service lawfully. You are responsible for activity carried out through your account until you notify T-CARE of suspected unauthorized access.'],
  ['Customer and Gardener accounts', 'Customers may maintain plant and address records and submit service requests. Gardener accounts may be subject to identity and document verification before receiving or performing assignments. Admin accounts are provisioned by T-CARE and are not available through public registration. Access to each workspace is limited by the role assigned to the account.'],
  ['Bookings and service scope', 'A booking request is not a confirmed appointment until T-CARE has accepted and scheduled it and, where applicable, assigned a Gardener. The service, price, date, time and scope shown in the booking record are the reference for the requested work. Any change to scope or schedule must be agreed through T-CARE before it is treated as part of the booking.'],
  ['Prices and payments', 'Prices are displayed from the active T-CARE catalogue and may depend on the service, plant count or selected plan. The server calculates the payable amount for a booking. Online payment is available only when the checkout is enabled and the payment provider confirms the transaction. An order or payment attempt is not proof of payment. T-CARE records provider-confirmed payments and issues an email receipt to the registered account address.'],
  ['Refunds and cancellations', 'Cancellation, rescheduling and refund eligibility depend on the status of the booking, the applicable service terms and the payment provider’s confirmed transaction or refund status. A paid booking must follow the refund process; cancelling a booking alone does not represent a completed refund. Any refund record shown in the account is subject to provider confirmation.'],
  ['Plans and subscriptions', 'Subscription requests remain pending until their payment is verified. A plan becomes active only after T-CARE records the provider-confirmed payment. Renewal dates, pause and cancellation status are shown in the account. Plan changes are subject to the options published by T-CARE at the time of the request.'],
  ['Plant care and service reports', 'Plant health depends on environmental conditions, plant species, previous care and other factors outside T-CARE’s control. Service notes and recommendations record observations made during a visit; they are not a guarantee that a plant will recover or remain healthy. Customers should follow any safety or care instructions shared for their plants and premises.'],
  ['Products and other catalogue items', 'Product listings and the cart may be displayed for browsing. Product checkout, order placement and delivery fulfilment are not available in this release unless a completed checkout flow is explicitly presented in the T-CARE website. Adding an item to a cart does not create an order or charge.'],
  ['Account security and acceptable use', 'Do not share passwords or verification codes. Do not attempt to access another person’s account, interfere with the platform, submit false documents or misuse customer, Gardener or business information. T-CARE may restrict accounts or sessions where required to protect users, service operations or the platform.'],
  ['Changes and support', 'T-CARE may update these terms when its services or legal obligations change. Material updates will be published with a new policy version and may require renewed consent. Questions about a booking or account should be raised through the contact channels published on the Contact page.']
];

const PRIVACY_SECTIONS = [
  ['Information collected', 'T-CARE processes account details such as name, email address, phone number and account role; plant records and care notes; service addresses, booking details and service reports; and messages or notifications associated with the account. For Gardeners, this may include verification documents and professional profile information. Payment records include transaction references, amounts, payment status and refund information. T-CARE does not need or store a readable copy of your payment card credentials.'],
  ['Passwords and account security', 'Account passwords are transformed into one-way password hashes before storage and are not returned in account or profile responses. Authentication uses protected, HTTP-only session cookies. T-CARE staff and other account holders are not provided with your password. Browser or device password-manager synchronization is controlled by the browser or password-manager account and its owner settings, not by T-CARE.'],
  ['How information is used', 'Information is used to create and secure accounts, verify email addresses and Gardener eligibility, manage plants and addresses, schedule and perform services, record service reports, process provider-confirmed payments and refunds, issue receipts, send service notifications, respond to support requests, prevent misuse and meet legal or accounting obligations.'],
  ['When information is shared', 'A Gardener assigned to a booking may receive the customer’s name, service address, contact details and the plants or service information needed to perform that booking. T-CARE may use service providers for database hosting, secure file storage, email delivery and payment processing. Access is limited to information needed for the relevant service or operation. Admin access is restricted to authorized business operators.'],
  ['Payments', 'Payment credentials are handled by the configured payment provider during checkout. T-CARE stores transaction identifiers, payment amounts, statuses, dates, provider event records and refund details needed to reconcile payments and support customers. Payment receipts are sent to the email address associated with the customer’s account.'],
  ['Cookies and local browser storage', 'T-CARE uses HTTP-only cookies for authentication. The website may use local browser storage for non-sensitive preferences such as theme choice and for a shopping cart used for browsing. Passwords and authentication tokens are not intentionally stored in localStorage or shared between T-CARE accounts. Browser password-manager features are separately controlled by the user’s browser or device account.'],
  ['Retention and deletion', 'T-CARE retains account, service, payment, security and audit information for as long as it is reasonably needed to operate the account and services, resolve disputes, protect the platform and meet applicable legal or accounting obligations. Some transaction and audit records may need to be retained after an account is closed. Requests to correct or delete personal information can be submitted through T-CARE’s published contact channels and will be assessed against these obligations.'],
  ['Your choices and rights', 'You can review and update available profile information from your account. You may contact T-CARE to request access to, correction of or deletion of personal information, or to raise a privacy concern. T-CARE may need to verify your identity before acting on a request and may retain information where legally required or necessary to complete an outstanding service or resolve a dispute.'],
  ['Policy updates and contact', 'This notice may be updated when the platform’s information practices change. The current version and publication date are shown above. For privacy questions, use the email, telephone or address published on the T-CARE Contact page.']
];

function LegalDocument({ eyebrow, title, intro, version, sections }) {
  return <>
    <PageHero eyebrow={eyebrow} crumb={eyebrow} title={title} sub={intro}/>
    <section className="lsec terms">
      <div className="legal-document-meta"><span>Policy version: {version}</span><span>Published: 18 November 2026</span></div>
      <div className="terms-card">{sections.map(([heading,body],index)=><Reveal key={heading} delay={index*.025} className="term"><span>{String(index+1).padStart(2,'0')}</span><div><h3>{heading}</h3><p>{body}</p></div></Reveal>)}</div>
      <p className="legal-review-note">These policies describe the current T-CARE service experience. T-CARE should obtain jurisdiction-specific legal review and confirm its business contact and retention arrangements before treating this publication as final legal advice.</p>
    </section>
  </>;
}

export function TermsPage(){
  return <LegalDocument eyebrow="Terms & Conditions" title={<>Clear terms for <em>care and service</em></>} sub="Please review the terms that apply when you create an account, request a service or use a T-CARE workspace." version={C.TERMS_POLICY_VERSION} sections={TERMS_SECTIONS}/>;
}

export function PrivacyPage(){
  return <LegalDocument eyebrow="Privacy Policy" title={<>Your information, <em>handled with care</em></>} sub="This notice explains the account, plant-care, booking and transaction information T-CARE uses to operate its services." version={C.PRIVACY_POLICY_VERSION} sections={PRIVACY_SECTIONS}/>;
}
