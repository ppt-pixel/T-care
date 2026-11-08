// All home-page copy and sample data lives here so it is easy to edit.
// ⚠ SAMPLE content (marked below) should be replaced with T-Care's real prices, reviews and numbers.

export const WHATSAPP_NUMBER='';            // e.g. '91XXXXXXXXXX' — leave empty to show a "coming soon" toast

export const NAV_LINKS=[['Services','/services'],['Book visit','/garden/book'],['Plant store','/store'],['AI care','/garden/shop'],['About us','/about']];

export const TYPED=['Plant care, without the guesswork','Healthier leaves, happier homes','A gardener for every green corner'];
export const HERO_TICKS=['A care plan for every plant','Free plant consultation','60-minute expert visit'];
// numbers already used on T-Care's existing home page
export const HERO_STATS=[['star','4.9★','Rating'],['home','1,240+','Plants cared for'],['shield','42','Verified gardeners'],['heart','98%','Happy customers']];

export const WHY=[
  {kind:'report',title:'Care notes after every visit',text:'A clear health report lands in your account after each visit.'},
  {kind:'reminder',title:'Gentle reminders, on time',text:'Watering and feeding nudges tuned to every plant you own.'},
  {kind:'growth',title:'Watch them thrive',text:'Track growth and health week after week in one living record.'},
];
export const WHY_PAINS=['Busy schedule, thirsty plants?','Leaves browning at the edges?','Never sure what each plant wants?'];

export const INCLUDED=[
  ['health','Health assessment','A careful look at leaves, stems and roots for early signs of trouble.'],
  ['water','Smart watering','The right amount for each plant type, plus a gentle leaf wipe-down.'],
  ['prune','Tidy-up & shaping','Dead growth removed so your plants stay full, fresh and balanced.'],
  ['pest','Pest watch','Early detection and on-the-spot treatment before pests spread.'],
  ['soil','Soil & feeding','Soil condition checked and nutrition topped up for stronger roots.'],
];

export const STEPS=[
  ['pin','Pick your place','Share your area and the plants you have so we can match the right gardener.'],
  ['calendar','Choose a time','Select a day and slot that suits you. Your gardener arrives prepared and on time.'],
  ['leaf','Relax, we’ve got it','Watering, pruning, pest checks and a health report — done while you unwind.'],
];

// ⚠ SAMPLE: One-time and Basic reuse prices from the existing services list; Plus is a sample tier
export const PLANS=[
  {id:'once',tag:'On demand',name:'Single visit',blurb:'Urgent help for a thirsty or struggling plant.',price:499,per:'/visit',cta:'Book a visit',to:'/garden/book',features:[]},
  {id:'basic',tag:'Subscription',name:'Essential',blurb:'Steady upkeep for a small balcony or shelf.',price:1299,per:'/mo',cta:'Subscribe now',to:'/garden/plan',dark:true,features:['2 visits a month','Up to 12 plants']},
  {id:'plus',tag:'Subscription',name:'Flourish',blurb:'Growing, improving and thriving collections.',price:2199,per:'/mo',cta:'Subscribe now',to:'/garden/plan',features:['4 visits a month','Up to 25 plants','Priority slots']},
];

export const TRANSFORMS=[
  {id:'balcony',tab:'Balcony',chip:'Balcony Bloom',title:'A balcony that glows at dusk'},
  {id:'indoor',tab:'Indoor',chip:'Living-room Jungle',title:'An indoor corner full of life'},
  {id:'terrace',tab:'Terrace',chip:'Terrace Retreat',title:'A terrace made for evenings'},
];

export const STORY_VALUES=[
  ['shield','Honesty','Verified gardeners and clear, upfront care you can rely on.'],
  ['leaf','Patience','Time and attention for every plant, with a routine that suits it.'],
  ['star','Craft','Skilled work that is checked and recorded after every visit.'],
  ['sprout','Greener living','Mindful, low-waste habits that keep homes and plants healthier.'],
];

// ⚠ SAMPLE products and prices
export const PRODUCTS=[
  {id:'snake',kind:'snake',cat:'Plants',name:'Snake plant in 8 inch pot',price:799,mrp:999,off:20,pot:'#e8e1d2'},
  {id:'money',kind:'money',cat:'Plants',name:'Golden pothos in hanging-style pot',price:349,mrp:449,off:22,pot:'#c8693d'},
  {id:'rubber',kind:'rubber',cat:'Plants',name:'Rubber plant in 10 inch pot',price:1299,mrp:1599,off:19,pot:'#3b4a43'},
  {id:'lily',kind:'lily',cat:'Plants',name:'Peace lily in ceramic pot',price:649,mrp:849,off:24,pot:'#e8e1d2'},
  {id:'palm',kind:'palm',cat:'Plants',name:'Areca palm in 12 inch pot',price:1499,mrp:1999,off:25,pot:'#c8693d'},
  {id:'jade',kind:'jade',cat:'Plants',name:'Jade plant in 6 inch pot',price:429,mrp:549,off:22,pot:'#c9b88f'},
  {id:'food',kind:'food',cat:'Essentials',name:'Organic plant food, 500 ml',price:249,mrp:299,off:17,pot:'#2f6b3a'},
  {id:'trowel',kind:'trowel',cat:'Essentials',name:'Stainless gardening trowel',price:299,mrp:399,off:25,pot:'#2f6b3a'},
];

// ⚠ SAMPLE reviews (the first one already exists on the current home page)
export const REVIEWS=[
  {n:'Neha S.',a:'Ahmedabad',t:'My fiddle leaf fig was dying. Two visits later it’s growing new leaves — and I finally understand why.',s:5},
  {n:'Rohan M.',a:'Ahmedabad',t:'On time, polite and genuinely knowledgeable. My balcony has never looked this fresh.',s:5},
  {n:'Kavya P.',a:'Ahmedabad',t:'I travel a lot. Monthly care means I come home to plants that are thriving, not just surviving.',s:5},
  {n:'Arjun D.',a:'Ahmedabad',t:'The reminders alone are worth it. Watering is finally on a schedule I can keep.',s:4},
  {n:'Meera T.',a:'Ahmedabad',t:'They rescued my peace lily when I had completely given up on it. Wonderful team.',s:5},
];

export const FOOTER_COLS=[
  ['Services',[['Our services','/services'],['Subscription plans','/plans'],['Green Makeover','/makeover'],['Plant store','/store'],['Book a visit','/garden/book']]],
  ['Account',[['Dashboard','/garden'],['My bookings','/garden/visits'],['My plants','/garden/plants'],['Billing','/garden/billing'],['Profile','/garden/me']]],
  ['Company',[['About us','/about'],['Contact & FAQ','/contact'],['Join as a gardener','/register'],['Sign in','/login'],['Terms & privacy','/terms']]],
];
