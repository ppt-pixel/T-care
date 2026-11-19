// Public copy and environment-backed contact configuration. Transactional catalogues
// (services, plans, products, reviews and verified Gardener profiles) come from the API.

export const WHATSAPP_NUMBER=String(import.meta.env.VITE_WHATSAPP_NUMBER || '').replace(/\D/g, '');
export const PUBLIC_CONTACT_EMAIL=String(import.meta.env.VITE_PUBLIC_CONTACT_EMAIL || '').trim();
export const PUBLIC_PHONE_NUMBER=String(import.meta.env.VITE_PUBLIC_PHONE_NUMBER || '').trim();
export const PUBLIC_LOCATION=String(import.meta.env.VITE_PUBLIC_LOCATION || '').trim();
export const PUBLIC_OFFICE_ADDRESS=String(import.meta.env.VITE_PUBLIC_OFFICE_ADDRESS || '').trim();
export const TERMS_POLICY_VERSION='2026-11-18-v1';
export const PRIVACY_POLICY_VERSION='2026-11-18-v1';

export const NAV_LINKS=[['Services','/services'],['Book visit','/garden/book'],['Plant store','/store'],['My care','/garden/shop'],['About us','/about']];

export const TYPED=['Plant care, made easier','Care for the plants you love','Book a visit with a verified Gardener'];
export const HERO_TICKS=['Plant-care services and plans','Verified Gardener profiles','Visit reports in your account'];
// Live metrics are loaded from the public API; do not hard-code sample counts.
export const HERO_STATS=[];

export const WHY=[
  {kind:'report',title:'Visit notes in one place',text:'Review service reports from your completed visits in your account.'},
  {kind:'reminder',title:'Keep plant details together',text:'Save each plant’s condition, care dates and notes in your account.'},
  {kind:'growth',title:'Follow each plant’s care',text:'Update plant health and review its care history over time.'},
];
export const WHY_PAINS=['Need help keeping up with plant care?','Not sure what is affecting a plant?','Looking for care advice for your plants?'];

export const INCLUDED=[
  ['health','Plant health','Review visible signs of stress and note any concerns during the visit.'],
  ['water','Watering guidance','Discuss watering frequency and signs of over- or under-watering.'],
  ['prune','Pruning & tidy-up','Tidy leaves and discuss pruning needs when included in your service.'],
  ['pest','Pest observations','Your Gardener can note visible signs of pests or disease during the visit.'],
  ['soil','Soil & feeding','Discuss soil condition and feeding needs when included in your service.'],
];

export const STEPS=[
  ['pin','Choose your location','Select the visit address and the plants you would like cared for.'],
  ['calendar','Choose a time','Pick a date and time that suit you.'],
  ['leaf','Follow your visit','Track the visit and read the service report in your account.']
];

// Plans are loaded from the Admin-managed public subscription catalogue.
export const PLANS=[];

export const TRANSFORMS=[
  {id:'balcony',tab:'Balcony',chip:'Balcony greenery',title:'Planting ideas for a balcony'},
  {id:'indoor',tab:'Indoor',chip:'Indoor plants',title:'Ideas for an indoor plant corner'},
  {id:'terrace',tab:'Terrace',chip:'Terrace plants',title:'Greenery for a terrace'},
];

export const STORY_VALUES=[
  ['shield','Trust','Review Gardener profiles and service details before you book.'],
  ['leaf','Care','Keep plant details and visit notes together.'],
  ['star','Attention','Review completed work and care recommendations.'],
  ['sprout','Growth','Build a care history for the plants in your collection.'],
];

// Product catalogue and published reviews are loaded from the database.
export const PRODUCTS=[];
export const REVIEWS=[];

export const FOOTER_COLS=[
  ['Services',[['Our services','/services'],['Subscription plans','/plans'],['Green Makeover','/makeover'],['Plant store','/store'],['Book a visit','/garden/book']]],
  ['Account',[['Dashboard','/garden'],['My bookings','/garden/visits'],['My plants','/garden/plants'],['Billing','/garden/billing'],['Profile','/garden/me']]],
  ['Company',[['About us','/about'],['Contact & FAQ','/contact'],['Gardener enquiries','/contact'],['Sign in','/login'],['Terms & Conditions','/terms'],['Privacy Policy','/privacy']]],
];
