// Fictional sample creators used only to show what a template looks like (gallery thumbnails and
// the home page "Preview" button). Clearly labelled as examples wherever they appear. No real
// people, no invented reviews or numbers. Images are the app's own example covers.

const P = (id, title, format, priceInr, shortDescription, benefits, ctaLabel = 'Get it now') => ({ id, title, format, priceInr, shortDescription, benefits, ctaLabel, description: '' });

export const SAMPLE_CREATORS = {
  fitness: {
    creator: { displayName: 'Riya Sharma', niche: 'Desk fitness', headline: 'Fix your posture and feel stronger in 20 minutes a day', bio: 'Certified trainer helping office workers move better, at home or at the desk.', cover: 'ex:fitness' },
    links: { whatsapp: '919800000000', instagram: 'riya.moves', website: '', email: '' },
    products: [
      P('s1', 'Desk Posture Reset Guide', 'ebook', 199, 'A 30-page guide with 12 stretches you can do at your desk.', ['12 illustrated stretches', 'A 14-day plan']),
      P('s2', '21-Day Strength at Home', 'recorded_course', 799, 'Follow-along videos, no equipment needed.', ['21 short workouts', 'Beginner to intermediate']),
      P('s3', '1:1 Movement Check', 'one_on_one_call', 1499, 'A 45-minute video call to fix your form and plan.', ['Personal plan', 'WhatsApp follow-up'], 'Book a call'),
    ],
  },
  teacher: {
    creator: { displayName: 'Neha Verma', niche: 'SSC & Bank exam maths', headline: 'Exam maths made simple for Hindi-medium aspirants', bio: 'Short tricks, clear concepts and practice sets for SSC CGL and bank exams.' },
    links: { whatsapp: '919800000001', instagram: 'neha.maths', website: '', email: '' },
    products: [
      P('t1', 'Formula & Short Tricks PDF', 'ebook', 149, 'Every formula you need, with worked shortcuts.', ['120+ formulas', 'Hindi and English']),
      P('t2', 'Quant Foundation Course', 'recorded_course', 999, '40 recorded lessons from basics to exam level.', ['40 lessons', 'Practice sets after each topic']),
      P('t3', 'Weekend Doubt Webinar', 'live_webinar', 99, 'Bring your hardest questions every Sunday.', ['Live Q&A', 'Recording included'], 'Reserve a seat'),
    ],
  },
  artist: {
    creator: { displayName: 'Kavya Rao', niche: 'Watercolour artist · Bengaluru', headline: 'Loose, joyful watercolour for complete beginners', bio: 'I paint flowers and city corners, and teach people who think they can\'t draw.', cover: 'ex:watercolour' },
    links: { whatsapp: '', instagram: 'kavya.paints', website: '', email: 'hello@example.com' },
    products: [
      P('a1', 'Brush Practice Sheets', 'template_pack', 249, 'Printable sheets to build brush control.', ['18 printable sheets', 'Video walkthrough']),
      P('a2', 'Weekend Watercolour Class', 'live_webinar', 599, 'Two live sessions: one flower, one city scene.', ['Supply list', 'Live feedback']),
      P('a3', 'Florals from Scratch', 'recorded_course', 1299, 'Eight lessons from first wash to finished bouquet.', ['8 lessons', 'Lifetime access']),
    ],
  },
  finance: {
    creator: { displayName: 'Arjun Mehta', niche: 'Personal finance for first jobbers', headline: 'Build your first ₹1 lakh without giving up your weekends', bio: 'Simple money systems for people in their first five years of work.', cover: 'ex:finance' },
    links: { whatsapp: '919800000002', instagram: 'arjun.money', website: 'example.com', email: '' },
    products: [
      P('f1', 'Salary Budget Template', 'template_pack', 299, 'A ready-made sheet that splits your salary in minutes.', ['Google Sheets + Excel', 'Setup video']),
      P('f2', 'Money Basics Cohort', 'cohort_course', 2999, 'Four live weeks: budget, save, invest, protect.', ['4 live sessions', 'Small group']),
      P('f3', 'Personal Money Review', 'one_on_one_call', 1999, 'A 60-minute call to set up your own system.', ['Written action plan', 'One follow-up'], 'Book a call'),
    ],
  },
  cook: {
    creator: { displayName: 'Meera Shah', niche: 'Gujarati home cooking', headline: 'Wholesome thalis for busy working mothers', bio: 'Weeknight-friendly Gujarati meals, planned so you cook once and eat well all week.', cover: 'ex:cooking' },
    links: { whatsapp: '919800000003', instagram: 'meera.thali.kitchen', website: '', email: '' },
    products: [
      P('c1', 'Weekday Thali Planner', 'ebook', 199, 'Five thalis, one shopping list, an hour of prep.', ['5 full menus', 'Shopping list']),
      P('c2', 'Meal Prep Masterclass', 'recorded_course', 699, 'Batch-cook a week of meals on Sunday.', ['6 videos', 'Printable plans']),
      P('c3', 'Kitchen Circle', 'community', 149, 'A members\' group with new menus every month.', ['Monthly menus', 'Members\' Q&A']),
    ],
  },
  comic: {
    creator: { displayName: 'Rohan Iyer', niche: 'Stand-up comedy', headline: 'Learn to write jokes that actually land', bio: 'Stand-up comic and open-mic host. I teach writing, timing and stage presence.' },
    links: { whatsapp: '', instagram: 'rohan.on.stage', website: '', email: '' },
    products: [
      P('r1', 'Joke Writing Workbook', 'ebook', 249, 'Prompts and structures to write a five-minute set.', ['30 writing prompts', 'Set-list template']),
      P('r2', 'Open Mic Bootcamp', 'cohort_course', 1999, 'Three weeks from first draft to first open mic.', ['6 live sessions', 'Final showcase'], 'Get a ticket'),
    ],
  },
};

// Which sample shows off each template best.
export const SAMPLE_FOR = {
  minimal: 'finance', bold: 'comic', elegant: 'artist', fitness: 'fitness', edupro: 'teacher',
  studio: 'artist', authority: 'finance', lifestyle: 'cook', spotlight: 'comic', elite: 'finance',
};

export const SAMPLE_IMAGES = {
  'ex:fitness': '/brand/examples/fitness.jpg',
  'ex:watercolour': '/brand/examples/watercolour.jpg',
  'ex:finance': '/brand/examples/finance.jpg',
  'ex:cooking': '/brand/examples/cooking.jpg',
};

export function sampleContent(templateId, theme) {
  const s = SAMPLE_CREATORS[SAMPLE_FOR[templateId] || 'finance'];
  return { creator: { ...s.creator }, links: { ...s.links }, products: s.products.map((p) => ({ ...p })), theme, language: 'en', tone: 'friendly', testimonials: [] };
}
