// Public copy and environment-backed contact configuration. Transactional catalogues
// (services, plans, products, reviews and verified Gardener profiles) come from the API.

export const WHATSAPP_NUMBER=String(import.meta.env.VITE_WHATSAPP_NUMBER || '').replace(/\D/g, '');
export const PUBLIC_CONTACT_EMAIL=String(import.meta.env.VITE_PUBLIC_CONTACT_EMAIL || '').trim();
export const PUBLIC_PHONE_NUMBER=String(import.meta.env.VITE_PUBLIC_PHONE_NUMBER || '').trim();
export const PUBLIC_LOCATION=String(import.meta.env.VITE_PUBLIC_LOCATION || '').trim();

export const NAV_LINKS=[['Services','/services'],['Book visit','/garden/book'],['Plant store','/store'],['AI care','/garden/shop'],['About us','/about']];

export const TYPED=['Plant care, without the guesswork','Healthier leaves, happier homes','A gardener for every green corner'];
export const HERO_TICKS=['Care plans for different plant collections','Profiles of verified gardeners','Care records after completed visits'];
// Live metrics are loaded from the public API; do not hard-code sample counts.
export const HERO_STATS=[];

export const WHY=[
  {kind:'report',title:'Care notes after every visit',text:'A clear health report lands in your account after each visit.'},
  {kind:'reminder',title:'Gentle reminders, on time',text:'Watering and feeding nudges tuned to every plant you own.'},
  {kind:'growth',title:'Watch them thrive',text:'Track growth and health week after week in one living record.'},
];
export const WHY_PAINS=['Busy schedule, thirsty plants?','Leaves browning at the edges?','Never sure what each plant wants?'];

export const INCLUDED=[
  ['health','Health assessment','A plant-health review may be included when it is part of the selected service scope.'],
  ['water','Watering guidance','Watering support depends on the selected service and the plant requirements.'],
  ['prune','Pruning & tidy-up','Pruning or leaf-cleaning can be agreed as part of the service scope.'],
  ['pest','Pest observations','Pest or disease observations can be recorded in an appropriate plant-care service.'],
  ['soil','Soil & feeding','Soil and feeding requirements can be reviewed when included in the booking.'],
];

export const STEPS=[
  ['pin','Pick your place','Share the booking address and the plants you want included.'],
  ['calendar','Choose a time','Select an available date and slot shown in the booking flow.'],
  ['leaf','Follow the booking','Track the booking and review its status and any service report in your account.'],
];

// Plans are loaded from the Admin-managed public subscription catalogue.
export const PLANS=[];

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

// Product catalogue and published reviews are loaded from the database.
export const PRODUCTS=[];
export const REVIEWS=[];

export const FOOTER_COLS=[
  ['Services',[['Our services','/services'],['Subscription plans','/plans'],['Green Makeover','/makeover'],['Plant store','/store'],['Book a visit','/garden/book']]],
  ['Account',[['Dashboard','/garden'],['My bookings','/garden/visits'],['My plants','/garden/plants'],['Billing','/garden/billing'],['Profile','/garden/me']]],
  ['Company',[['About us','/about'],['Contact & FAQ','/contact'],['Join as a gardener','/register'],['Sign in','/login'],['Terms & privacy','/terms']]],
];
