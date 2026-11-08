import React from 'react';
import {motion,AnimatePresence} from 'framer-motion';
import {Link} from 'react-router-dom';
import {Leaf,ArrowRight,Check,Phone,Mail,Clock,MapPin,Truck,ShieldCheck,RotateCcw,Sparkles,Camera,Ruler,Palette,Package,Award,Users,Recycle,Plus,Minus,Send,MessageCircle,Sprout,Heart,Star,Sun,Droplets,Bug} from 'lucide-react';
import {L,LBtn,Reveal,Head,ICON,money,WaBtn} from './Sections.jsx';
import {Included,Steps,ServiceBanner,Plans,Story,Reviews,Transformations} from './Sections.jsx';
import {ProductSvg} from './Scenes.jsx';
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
      <div className="pc-rate"><b>4.9<Star size={18} fill="currentColor"/></b><span>from 1,240+ cared-for plants</span></div>
      <ul>{C.HERO_TICKS.map(t=><li key={t}><span><Check size={13}/></span>{t}</li>)}</ul>
      <div className="pc-icons"><i><Droplets size={16}/></i><i><Sun size={16}/></i><i><Bug size={16}/></i><i><Sprout size={16}/></i></div>
    </motion.aside>
  </section>;
}

function StatBand({stats=C.HERO_STATS}){
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
  ['How do I book a visit?','Pick a service, choose a day and slot, and tell us which plants you have. A verified gardener is matched to your area and confirms within a few hours.'],
  ['Are your gardeners verified?','Yes. Every T-Care gardener goes through identity and background checks, and is trained on our care checklist before their first visit.'],
  ['What areas do you serve?','We currently serve Ahmedabad and nearby neighbourhoods. More areas are on the way — drop us a message and we will let you know when we reach you.'],
  ['Do I need to be home during the visit?','Not necessarily. Many customers leave access instructions with a neighbour or security desk. You will get a care report either way.'],
  ['What if my plant does not improve?','Plant Rescue visits include a follow-up plan. If something is not right, tell us and we will send a gardener back to take another look.'],
];

/* ============ SERVICES ============ */
const DETAILS={
  'Plant Care':['Health check of leaves, stems and roots','Watering, feeding and gentle pruning','Written care notes after the visit'],
  'Plant Setup':['Space and light assessment','Plant, pot and placement selection','Planting, styling and a starter care guide'],
  'Plant Rescue':['Diagnosis of pests, rot or stress','Treatment and repotting where needed','Recovery plan with follow-up check-in'],
  'Maintenance':['Scheduled recurring visits','Seasonal feeding and pest watch','Priority booking and reminders'],
  'Events':['Green styling for weddings and parties','Setup, display and take-down','Rental and purchase options'],
  'Green Makeover':['Full space redesign with plants','Planters, soil and drip-line setup','Before and after photo record'],
  'Plant Store':['Healthy, acclimatised plants','Pots, soil mixes and tools','Doorstep delivery in Ahmedabad'],
  'AI Care':['Instant answers to plant questions','Photo-based problem spotting','Reminders tuned to each plant'],
};
const SERVICE_TO={'Plant Store':'/store','Green Makeover':'/makeover','AI Care':'/garden/shop'};

export function ServicesPage({services}){
  const cats=['All',...Array.from(new Set(services.map(s=>s.cat)))];
  const [cat,setCat]=React.useState('All');
  const list=services.filter(s=>cat==='All'||s.cat===cat);
  return <>
    <PageHero eyebrow="Our services" title={<>Care for every <em>green corner</em></>} sub="From a single thirsty fern to a full terrace makeover, pick the service that fits your plants and your schedule.">
      <LBtn to="/garden/book" variant="gold">Book a visit <ArrowRight size={15}/></LBtn><LBtn to="/plans" variant="outline">Compare plans</LBtn>
    </PageHero>
    <section className="lsec svc-list">
      <div className="chips" role="tablist" aria-label="Service categories">{cats.map(c=><button key={c} role="tab" aria-selected={cat===c} className={cat===c?'on':''} onClick={()=>setCat(c)}>{c}</button>)}</div>
      <div className="svc-grid">{list.map((s,i)=><Reveal key={s.name} delay={(i%4)*.05} className="svc-card">
        <div className="svc-top"><span className="ic" style={{'--h':s.hue}}><s.icon size={24} strokeWidth={1.5}/></span><em>{s.cat}</em></div>
        <h3>{s.name}</h3><p>{s.desc}</p>
        <ul>{(DETAILS[s.name]||[]).map(d=><li key={d}><Check size={13}/>{d}</li>)}</ul>
        <div className="svc-foot"><div><b>{s.price?`from ${money(s.price)}`:'Free'}</b><small>{s.time}</small></div><LBtn to={SERVICE_TO[s.name]||'/garden/book'} variant="dark">{SERVICE_TO[s.name]?'Explore':'Book'} <ArrowRight size={14}/></LBtn></div>
      </Reveal>)}</div>
    </section>
    <Included/>
    <Steps/>
    <StatBand/>
    <ServiceBanner services={services}/>
    <Faq items={FAQ_GENERAL}/>
  </>;
}

/* ============ ABOUT ============ */
const MILESTONES=[
  ['2023','A small idea','It started with one question: why is it so hard to get good plant care at home? The first gardener visits were booked by phone.'],
  ['2024','Verified gardeners','We built our vetting and training program so every visit follows the same careful checklist.'],
  ['2025','Living care records','Care reports, reminders and plant profiles moved into one simple account for every customer.'],
  ['2026','Growing across the city','Subscriptions, the plant store and Green Makeovers brought T-Care to more balconies and homes.'],
];
const TEAM=[
  ['Aarav Patel','Senior gardener','Indoor tropicals and plant rescue'],
  ['Meera Shah','Lead designer','Balcony and terrace makeovers'],
  ['Kabir Joshi','Plant doctor','Pest, soil and root diagnosis'],
  ['Isha Trivedi','Customer care','Scheduling and plant advice'],
];
const COMMIT=[
  [Recycle,'Low-waste by default','Reusable pots, compost-friendly feeds and minimal plastic in every delivery.'],
  [Users,'Fair to our gardeners','Fair pay, steady schedules and ongoing training for the people who do the work.'],
  [Award,'Care you can verify','Photo-backed reports after each visit, so you can see exactly what was done.'],
];
export function AboutPage(){
  return <>
    <PageHero eyebrow="About T-Care" title={<>The people behind <em>T-Care</em></>} sub="We are a team of gardeners, designers and plant lovers making it easy for every home in Ahmedabad to stay green.">
      <LBtn to="/garden/book" variant="gold">Meet your gardener <ArrowRight size={15}/></LBtn><LBtn to="/contact" variant="outline">Get in touch</LBtn>
    </PageHero>
    <Story/>
    <StatBand/>
    <section className="lsec timeline-sec"><Head center eyebrow="Our journey">Small roots, <em>steady growth</em></Head>
      <ol className="timeline">{MILESTONES.map(([y,t,d],i)=><Reveal as="li" key={y} delay={i*.08}><span className="yr">{y}</span><div><h3>{t}</h3><p>{d}</p></div></Reveal>)}</ol></section>
    <section className="lsec commit"><Head center eyebrow="What we stand for">Good for plants, <em>good for people</em></Head>
      <div className="commit-grid">{COMMIT.map(([I,t,d],i)=><Reveal key={t} delay={i*.08} className="commit-card"><span className="ic"><I size={22}/></span><h3>{t}</h3><p>{d}</p></Reveal>)}</div></section>
    <section className="lsec team"><Head center eyebrow="The people" sub="A few of the faces you might meet. Sample profiles — replace with your real team.">Meet the <em>gardeners</em></Head>
      <div className="team-grid">{TEAM.map(([n,r,s],i)=><Reveal key={n} delay={i*.07} className="team-card"><span className="avatar">{n.split(' ').map(x=>x[0]).join('')}</span><h3>{n}</h3><b>{r}</b><p>{s}</p></Reveal>)}</div></section>
    <Reviews/>
  </>;
}

/* ============ PLANS ============ */
const COMPARE=[
  ['Visits included','1','2 per month','4 per month'],
  ['Plants covered','Up to 5','Up to 12','Up to 25'],
  ['Health report after each visit',true,true,true],
  ['Watering & feeding reminders',false,true,true],
  ['Pest watch',true,true,true],
  ['Priority slots',false,false,true],
  ['Plant store discount',false,'5%','10%'],
  ['Pause or cancel anytime','—',true,true],
];
const FAQ_PLANS=[
  ['Can I switch plans later?','Yes. Upgrade or downgrade whenever you like and the change applies from your next billing cycle.'],
  ['What happens if I need to skip a month?','You can pause your subscription from your account. Unused visits do not roll over, but your plan stays safe.'],
  ['Are prices inclusive of tax?','Prices shown are sample rates and will be confirmed at checkout with taxes included.'],
  ['Do I get a discount on plants and supplies?','Subscribers get a store discount that grows with the plan, applied automatically in your cart.'],
];
export function PlansPage(){
  const cell=v=>v===true?<Check size={16} className="yes"/>:v===false?<span className="no">–</span>:v;
  return <>
    <PageHero eyebrow="Plans & pricing" title={<>Care plans that <em>grow with you</em></>} sub="Start with a single visit or let us look after your plants every month. Simple pricing, no surprises.">
      <LBtn to="/garden/plan" variant="gold">Start a subscription <ArrowRight size={15}/></LBtn>
    </PageHero>
    <Plans/>
    <section className="lsec compare"><Head center eyebrow="Compare" sub="Everything at a glance.">What is in <em>each plan</em></Head>
      <Reveal className="table-wrap"><table className="ctable"><thead><tr><th/><th>Single visit</th><th className="hl">Essential</th><th>Flourish</th></tr></thead>
        <tbody>{COMPARE.map(([k,...v])=><tr key={k}><th scope="row">{k}</th>{v.map((x,i)=><td key={i} className={i===1?'hl':''}>{cell(x)}</td>)}</tr>)}</tbody></table></Reveal></section>
    <section className="lsec perks"><div className="perk-row">{[[ShieldCheck,'Verified gardeners'],[RotateCcw,'Cancel anytime'],[Heart,'Happy-plant promise'],[Clock,'On-time arrival']].map(([I,t],i)=><Reveal key={t} delay={i*.06} className="perk"><I size={20}/><b>{t}</b></Reveal>)}</div></section>
    <Faq items={FAQ_PLANS} eyebrow="Billing FAQ" title="Plan questions"/>
  </>;
}

/* ============ STORE ============ */
const STORE_PERKS=[
  [Truck,'Doorstep delivery','Careful packing and delivery across Ahmedabad.'],
  [ShieldCheck,'Healthy-plant guarantee','Arrives unwell? We replace it, no questions asked.'],
  [Sprout,'Acclimatised plants','Raised for Indian homes, not just greenhouses.'],
  [Package,'Gift-ready','Add a note and we will wrap it nicely.'],
];
export function StorePage({cart}){
  const cats=['All',...Array.from(new Set(C.PRODUCTS.map(p=>p.cat)))];
  const [cat,setCat]=React.useState('All');
  const list=C.PRODUCTS.filter(p=>cat==='All'||p.cat===cat);
  return <>
    <PageHero eyebrow="T-Care market" title={<>Everything your <em>plants</em> need</>} sub="Healthy plants, handsome pots and everyday essentials, picked by the gardeners who use them.">
      <LBtn onClick={()=>cart.setOpen(true)} variant="gold">View cart{cart.count>0?` (${cart.count})`:''} <ArrowRight size={15}/></LBtn>
    </PageHero>
    <section className="lsec store">
      <div className="chips" role="tablist" aria-label="Product categories">{cats.map(c=><button key={c} role="tab" aria-selected={cat===c} className={cat===c?'on':''} onClick={()=>setCat(c)}>{c}</button>)}</div>
      <div className="store-grid">{list.map((p,i)=><Reveal key={p.id} delay={(i%4)*.05} className="pcard"><span className="off">{p.off}% OFF</span><div className="pimg"><ProductSvg kind={p.kind} pot={p.pot}/></div>
        <div className="pbody"><small>{p.cat}</small><h4>{p.name}</h4><div className="pfoot"><div><b>{money(p.price)}</b><s>{money(p.mrp)}</s></div><button className="add" onClick={()=>cart.add(p)}>Add to Cart</button></div></div></Reveal>)}</div>
    </section>
    <section className="lsec perks"><Head center eyebrow="Why shop with us">Shop with <em>confidence</em></Head>
      <div className="commit-grid four">{STORE_PERKS.map(([I,t,d],i)=><Reveal key={t} delay={i*.06} className="commit-card"><span className="ic"><I size={22}/></span><h3>{t}</h3><p>{d}</p></Reveal>)}</div></section>
    <section className="lsec guide"><Reveal className="guide-card"><div><span className="eyebrow">Not sure what to pick?</span><h2>Let a gardener <em>choose with you</em></h2><p>Tell us about your light, space and routine and we will suggest plants that will actually thrive.</p></div><div className="cta-btns"><LBtn to="/garden/shop" variant="gold">Ask AI Care <ArrowRight size={15}/></LBtn><LBtn to="/garden/book" variant="outline">Book a consultation</LBtn></div></Reveal></section>
  </>;
}

/* ============ MAKEOVER ============ */
const MAKE_STEPS=[
  [Camera,'Share your space','Send a few photos and tell us how you use the area.'],
  [Ruler,'We measure & plan','A designer checks light, size and drainage, then proposes a layout.'],
  [Palette,'Pick your palette','Choose plants, planters and finishes that suit your taste and budget.'],
  [Sparkles,'Makeover day','Our team installs everything in a day and leaves a care guide behind.'],
];
const MAKE_TIERS=[
  ['Balcony Bloom','Compact balconies and window ledges',3499,['Up to 10 plants','Planters and soil included','1 follow-up visit']],
  ['Living-room Jungle','Indoor corners and shelves',5999,['Up to 20 plants','Statement planters','2 follow-up visits']],
  ['Terrace Retreat','Large terraces and rooftop gardens',12999,['Custom layout and drip line','Seating-friendly planting','Monthly care for 3 months']],
];
const FAQ_MAKE=[
  ['How long does a makeover take?','Most balconies and indoor corners are finished in a day. Larger terraces can take two days.'],
  ['Can I use my existing plants and pots?','Absolutely. We design around what you already love and add what is missing.'],
  ['Is aftercare included?','Every makeover includes a care guide and at least one follow-up visit. Ongoing care plans are optional.'],
];
export function MakeoverPage(){
  return <>
    <PageHero eyebrow="Green Makeover" title={<>Spaces, <em>reimagined</em></>} sub="See how plants change a balcony, a living room or a terrace, one thoughtful makeover at a time.">
      <LBtn to="/garden/book" variant="gold">Plan my makeover <ArrowRight size={15}/></LBtn>
    </PageHero>
    <Transformations/>
    <section className="lsec how4"><Head center eyebrow="How it works">From photo to <em>paradise</em></Head>
      <div className="how4-grid">{MAKE_STEPS.map(([I,t,d],i)=><Reveal key={t} delay={i*.08} className="commit-card"><span className="step-no">0{i+1}</span><span className="ic"><I size={22}/></span><h3>{t}</h3><p>{d}</p></Reveal>)}</div></section>
    <section className="lsec tiers"><Head center eyebrow="Makeover packages" sub="Sample starting prices. Final quotes depend on your space.">Pick a <em>starting point</em></Head>
      <div className="plan-grid">{MAKE_TIERS.map(([n,b,p,f],i)=><Reveal key={n} delay={i*.08} className={'plan'+(i===1?' dark':'')}><small>Makeover</small><h3>{n}</h3><p>{b}</p>
        <ul>{f.map(x=><li key={x}><Leaf size={13}/>{x}</li>)}</ul>
        <div className="plan-price"><span>from</span><b>{money(p)}</b></div><LBtn to="/garden/book" variant={i===1?'gold':'dark'} full>Get a quote <ArrowRight size={14}/></LBtn></Reveal>)}</div></section>
    <Faq items={FAQ_MAKE} eyebrow="Makeover FAQ" title="Before you begin"/>
  </>;
}

/* ============ CONTACT ============ */
export function ContactPage({toast}){
  const [f,setF]=React.useState({name:'',email:'',msg:''}),[sent,setSent]=React.useState(false);
  const set=k=>e=>setF({...f,[k]:e.target.value});
  const submit=e=>{e.preventDefault();if(!f.name.trim()||!f.msg.trim()){toast?.('Please add your name and a short message.');return}setSent(true);toast?.('Thanks! We will get back to you soon.')};
  const cards=[[Phone,'Call us','Mon to Sat, 9am to 7pm','+91 00000 00000'],[Mail,'Email','We reply within a day','hello@t-care.example'],[MapPin,'Visit','Ahmedabad, Gujarat','Studio address coming soon'],[Clock,'Hours','Mon to Sat','9:00 am to 7:00 pm']];
  return <>
    <PageHero eyebrow="Contact" title={<>We would love to <em>hear from you</em></>} sub="Questions about a plant, a booking or a makeover? Send us a note and a real person will reply."/>
    <section className="lsec contact">
      <div className="contact-cards">{cards.map(([I,t,s,v],i)=><Reveal key={t} delay={i*.06} className="ccard"><span className="ic"><I size={20}/></span><div><b>{t}</b><small>{s}</small><span>{v}</span></div></Reveal>)}
        <WaBtn toast={toast} variant="outline">Chat on WhatsApp</WaBtn></div>
      <Reveal className="cform">{sent?<div className="sent"><span className="ic"><Check size={26}/></span><h3>Message sent</h3><p>Thank you, {f.name.split(' ')[0]}. Our team will reply shortly.</p><LBtn variant="outline" onClick={()=>{setSent(false);setF({name:'',email:'',msg:''})}}>Send another</LBtn></div>
        :<form onSubmit={submit} noValidate><h3>Send a message</h3>
          <label>Your name<input value={f.name} onChange={set('name')} placeholder="Neha Shah" autoComplete="name"/></label>
          <label>Email<input type="email" value={f.email} onChange={set('email')} placeholder="you@example.com" autoComplete="email"/></label>
          <label>How can we help?<textarea rows={5} value={f.msg} onChange={set('msg')} placeholder="Tell us about your plants or your space…"/></label>
          <button type="submit" className="lb lb-gold full"><Send size={15}/>Send message</button></form>}</Reveal>
    </section>
    <Faq items={FAQ_GENERAL}/>
  </>;
}

/* ============ TERMS ============ */
const TERMS=[
  ['Using T-Care','By booking a service or buying from the T-Care market you agree to these terms. Please keep your account details accurate and up to date.'],
  ['Bookings & cancellations','You can reschedule or cancel a visit from your account. Late cancellations close to the visit time may incur a small fee to cover the gardener\u2019s time.'],
  ['Payments & refunds','Prices are shown in Indian rupees. Refunds for unsatisfactory service are reviewed case by case, usually within a few working days.'],
  ['Plants & guarantees','Living things carry some risk. We guarantee healthy plants on delivery and will replace those that arrive damaged. Ongoing results depend on conditions in your home.'],
  ['Your data','We collect only what we need to run your bookings and care records. We never sell personal data, and you can ask us to export or delete it at any time.'],
  ['Contact','Questions about these terms? Reach us from the Contact page and we will be happy to help.'],
];
export function TermsPage(){
  return <>
    <PageHero eyebrow="Legal" crumb="Terms & privacy" title={<>Terms &amp; <em>privacy</em></>} sub="The short, plain-language version. Sample text — have it reviewed before launch."/>
    <section className="lsec terms"><div className="terms-card">{TERMS.map(([t,d],i)=><Reveal key={t} delay={i*.04} className="term"><span>{String(i+1).padStart(2,'0')}</span><div><h3>{t}</h3><p>{d}</p></div></Reveal>)}</div></section>
  </>;
}
