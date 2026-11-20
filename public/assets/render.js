// Renders a storefront to a full HTML document. Used by the server for the public page
// (/s/:slug) and by the editor's live preview, so preview and published page always match.
// Ten templates (defined in templates.js), each with its own header composition, product card
// and section styling, not just a colour swap. Colours and type come from CSS variables set by
// the creator's template settings (background, accent, heading font), so every combination works.
import { escapeHtml as e, formatInr, FORMATS, ACCENTS, accentLight, normaliseTheme, whatsappLink, assetUrl, visibleTestimonials } from './shared.js';
import { TEMPLATES, FONTS } from './templates.js';

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const s = (parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
  return (s || '★').toUpperCase();
}

function soft(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const ICON = {
  instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.3" fill="currentColor"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 9.5c.5 2 2 3.6 4.2 4.4l1.1-1 1.7.8c-.2 1-1.1 1.6-2.1 1.5C10.8 14.8 8.6 12.5 8.4 9.6 8.3 8.7 9 7.8 10 7.7l.8 1.7z" fill="currentColor"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans","Noto Sans Devanagari",Helvetica,Arial,sans-serif;--serif:Georgia,"Iowan Old Style","Times New Roman","Noto Serif Devanagari",serif}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{min-height:100vh;line-height:1.55;font-size:16px;font-family:var(--sans);-webkit-font-smoothing:antialiased}
a{color:inherit}
img,svg{display:block}
.wrap{max-width:var(--maxw,560px);margin:0 auto;padding:0 18px}
.avatar{display:inline-flex;align-items:center;justify-content:center;font-weight:700;flex:none;overflow:hidden;position:relative;z-index:1}
.avatar.has-img img{width:100%;height:100%;object-fit:cover;border-radius:inherit}
.cover{position:relative;width:100%;aspect-ratio:8/3;min-height:150px;max-height:340px;overflow:hidden;background:var(--accent-soft)}
.cover img{width:100%;height:100%;object-fit:cover}
.hero.has-cover{padding-top:0}
.hero.has-cover .wrap{position:relative;z-index:1}
.links{display:flex;flex-wrap:wrap;gap:8px}
.links a{display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:0 14px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none}
.links svg{width:17px;height:17px}
.bio{white-space:pre-line}
.section-title{font-size:13px;letter-spacing:.14em;text-transform:uppercase;font-weight:700}
.products{display:grid;gap:16px}
.format{display:inline-block;font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.short{font-size:15px}
.benefits{list-style:none;display:grid;gap:7px;margin:14px 0 2px}
.benefits li{font-size:14.5px;padding-left:24px;position:relative}
.benefits li:before{content:"";position:absolute;left:3px;top:6px;width:11px;height:6px;border-left:2px solid var(--accent);border-bottom:2px solid var(--accent);transform:rotate(-45deg)}
details{margin-top:10px;font-size:14.5px}
summary{cursor:pointer;font-weight:600;font-size:14px;color:var(--accent);padding:6px 0;list-style:none;display:inline-block}
summary::-webkit-details-marker{display:none}
summary:after{content:" +"}
details[open] summary:after{content:" –"}
details p{white-space:pre-line;opacity:.85;padding-top:2px}
.cta{display:flex;align-items:center;justify-content:center;gap:8px;min-height:50px;padding:0 20px;font:inherit;font-size:16px;font-weight:700;border:0;cursor:pointer;text-decoration:none;transition:transform .1s,background .15s,color .15s}
.cta svg{width:18px;height:18px}
.cta:active{transform:scale(.98)}
.via{font-size:12.5px;opacity:.65;margin-top:7px}
.note{display:none;margin-top:12px;font-size:13.5px;padding:10px 12px;border-radius:10px;background:var(--accent-soft)}
.note.show{display:block}
.note a{color:var(--accent);font-weight:600}
.testimonials{margin-top:8px}
.tgrid{display:grid;gap:14px}
.tcard{margin:0;display:flex;flex-direction:column;gap:12px}
.tcard blockquote{margin:0;white-space:pre-line;font-size:15.5px;line-height:1.6}
.tcard blockquote:before{content:"\\201C";display:block;font-family:Georgia,serif;font-size:40px;line-height:.6;height:16px;color:var(--accent)}
.tcard figcaption{font-size:14px}
.tcard figcaption b{display:block;font-weight:700}
.tcard figcaption span{opacity:.7;font-size:13px}
@media (min-width:760px){.tgrid{grid-template-columns:repeat(2,1fr)}}
.pimg{overflow:hidden;aspect-ratio:16/9;background:var(--accent-soft)}
.pimg img{display:block;width:100%;height:100%;object-fit:cover}
.badge{display:inline-block;font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:4px 9px;border-radius:999px}
footer{text-align:center;font-size:13px;padding:40px 18px 48px}
footer .share{display:flex;gap:10px;justify-content:center;margin-bottom:18px;flex-wrap:wrap}
footer .share a,footer .share button{font:inherit;font-size:14px;font-weight:600;min-height:42px;padding:0 16px;border-radius:999px;border:1px solid currentColor;background:transparent;color:inherit;text-decoration:none;cursor:pointer;display:inline-flex;align-items:center;opacity:.85}
footer small{display:block;opacity:.7;margin-top:6px}footer small a{color:inherit;text-decoration:none}footer small a:hover{text-decoration:underline}
.copy-fallback{font:inherit;font-size:14px;padding:10px 12px;border-radius:10px;border:1px solid #ccc;width:min(100%,360px)}
.contact{margin-top:8px}
.contact-box{padding:20px;border-radius:16px;border:1px solid var(--line);background:var(--surface)}
.contact-box p{color:var(--muted);margin-bottom:14px;font-size:15px}
.contact .links{margin-top:0}
.ph-box{border-style:dashed}.ph-box p{margin:0}
.ph{display:inline-block;border:1.5px dashed currentColor;border-radius:8px;padding:0 8px;opacity:.6;font-style:italic}
.ph small{display:inline-block;font-size:11px;font-style:normal;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-left:8px;vertical-align:middle}
.preview-banner{position:sticky;top:0;z-index:5;background:#16161A;color:#fff;font-size:13px;text-align:center;padding:8px 12px}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
`;

const THEME_CSS = {
  minimal: `
body{background:var(--bg);color:var(--ink)}
:root{--maxw:960px}
h1,.card h3{font-family:var(--display)}
.hero{text-align:center;padding:52px 0 8px}
.avatar{width:84px;height:84px;border-radius:50%;background:var(--accent);color:var(--on-accent);font-size:30px;margin:0 auto 14px;box-shadow:0 0 0 6px var(--surface),0 0 0 7px var(--line)}
.name{font-weight:650;font-size:16px}
.niche{display:inline-block;margin-top:8px;font-size:12.5px;font-weight:600;color:var(--accent);background:var(--accent-soft);padding:4px 11px;border-radius:999px}
h1{font-size:clamp(25px,6vw,36px);line-height:1.18;letter-spacing:-.02em;font-weight:750;margin:16px auto 0;max-width:640px}
.bio{color:var(--muted);margin:12px auto 0;max-width:560px;font-size:16px}
.links{justify-content:center;margin-top:20px}
.links a{background:var(--surface);border:1px solid var(--line);color:var(--ink)}
.section-title{color:var(--muted);margin:44px 0 14px;text-align:center}
.card{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:22px;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(20,20,30,.04)}
.card-top{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:10px}
.format{color:var(--muted)}
.price{font-size:22px;font-weight:750;letter-spacing:-.01em;white-space:nowrap}
.card h3{font-size:19px;line-height:1.3;margin-bottom:6px}
.short{color:var(--muted)}
.buy{margin-top:auto;padding-top:18px}
.cta{width:100%;background:var(--accent);color:var(--on-accent);border-radius:12px}
.cta:hover{filter:brightness(1.08)}
.badge{background:var(--accent-soft);color:var(--accent);margin-bottom:10px;align-self:flex-start}
.pimg{margin:-22px -22px 16px;border-radius:17px 17px 0 0;border-bottom:1px solid var(--line)}
footer{color:var(--muted)}
@media (min-width:760px){.products{grid-template-columns:repeat(2,1fr)}.products.one{grid-template-columns:minmax(0,520px);justify-content:center}}
@media (min-width:1100px){.products.three{grid-template-columns:repeat(3,1fr)}}
.hero.has-cover{padding-top:0}.hero.has-cover .avatar{margin-top:-42px}
.tcard{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:18px 18px 16px}
.contact-box{text-align:center}.contact .links{justify-content:center}
`,
  bold: `
body{background:var(--bg);color:var(--ink)}
:root{--maxw:980px}
h1,.card h3,.name{font-family:var(--display)}
.hero{background:var(--accent);color:#fff;padding:40px 0 64px;position:relative;overflow:hidden}
.hero:after{content:"";position:absolute;right:-90px;top:-90px;width:260px;height:260px;border-radius:50%;background:rgba(255,255,255,.12)}
.hero .wrap{position:relative;z-index:1}
.id{display:flex;align-items:center;gap:12px}
.avatar{width:58px;height:58px;border-radius:16px;background:#fff;color:var(--accent);font-size:22px;border:3px solid #111;box-shadow:3px 3px 0 #111}
.name{font-weight:800;font-size:17px}
.niche{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.85}
h1{font-size:clamp(32px,9vw,54px);line-height:1.02;letter-spacing:-.035em;font-weight:900;margin-top:24px;max-width:760px}
.bio{margin-top:16px;font-size:17px;max-width:620px;color:rgba(255,255,255,.92)}
.links{margin-top:22px}
.links a{background:#fff;color:#111;border:2px solid #111;box-shadow:3px 3px 0 #111}
.section-title{margin:-26px 0 18px;position:relative;z-index:2}
.section-title{margin-top:40px}main>section:first-child .section-title{margin-top:-26px}
.section-title span{display:inline-block;background:#111;color:#fff;padding:9px 16px;border-radius:999px;letter-spacing:.1em}
.card{background:var(--surface);border:2.5px solid #111;border-radius:22px;padding:22px;box-shadow:6px 6px 0 #111;position:relative;display:flex;flex-direction:column}
.card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}
.format{background:var(--accent-soft);color:#111;padding:4px 9px;border-radius:8px}
.price{background:var(--accent);color:#fff;font-weight:900;font-size:22px;padding:6px 12px;border-radius:12px;border:2.5px solid #111;transform:rotate(-3deg);white-space:nowrap}
.card h3{font-size:22px;line-height:1.15;font-weight:850;letter-spacing:-.01em;margin-bottom:8px}
.short{color:var(--muted)}
.buy{margin-top:auto;padding-top:18px}
.cta{width:100%;background:#111;color:#fff;border-radius:14px}
.cta:hover{background:var(--accent)}
.badge{position:absolute;top:-13px;left:18px;background:#FFD43B;color:#111;border:2px solid #111;z-index:2}
.pimg{margin:-22px -22px 16px;border-radius:19px 19px 0 0;border-bottom:2.5px solid #111}
footer{color:var(--muted)}
@media (min-width:760px){.products{grid-template-columns:repeat(2,1fr);gap:24px}.hero{padding:56px 0 84px}}
@media (min-width:1100px){.products.three{grid-template-columns:repeat(3,1fr)}}
.hero.has-cover{padding-top:0}.hero.has-cover:after{display:none}.hero.has-cover .cover{border-bottom:3px solid #111}.hero.has-cover .id{margin-top:-29px}.hero.has-cover .id>div{margin-top:29px}
.tcard{background:var(--surface);border:2.5px solid #111;border-radius:16px;padding:18px;box-shadow:4px 4px 0 #111}.tcard blockquote{font-weight:500}
.contact-box{border:2.5px solid #111;box-shadow:5px 5px 0 #111;border-radius:18px}.contact .links a{box-shadow:2px 2px 0 #111}
`,
  elegant: `
body{background:var(--bg);color:var(--ink)}
:root{--maxw:680px}
h1,h3,.price,.name,.num{font-family:var(--display)}
.hero{text-align:center;padding:64px 0 10px}
.avatar{width:92px;height:92px;border-radius:50%;background:transparent;color:var(--accent);border:1px solid var(--accent);font-family:var(--display);font-size:32px;font-weight:400;margin:0 auto 18px}
.name{font-size:19px}
.niche{display:block;margin-top:6px;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--muted)}
.rule{width:56px;height:1px;background:var(--accent);margin:26px auto}
h1{font-size:clamp(28px,7vw,40px);line-height:1.2;font-weight:400;letter-spacing:-.005em}
.bio{margin-top:16px;color:var(--muted);font-size:16.5px}
.links{justify-content:center;margin-top:22px}
.links a{color:var(--ink);border-bottom:1px solid var(--line);border-radius:0;padding:0 2px;min-height:36px}
.section-title{text-align:center;color:var(--muted);font-size:11px;letter-spacing:.3em;margin:52px 0 6px}
.products{gap:0}
.card{padding:30px 0;border-top:1px solid var(--line);display:grid;grid-template-columns:auto 1fr;column-gap:18px}
.card:last-child{border-bottom:1px solid var(--line)}
.num{font-size:15px;color:var(--accent);padding-top:5px}
.card-body{min-width:0}
.card-top{display:flex;justify-content:space-between;align-items:baseline;gap:14px}
.format{color:var(--muted);letter-spacing:.16em;font-weight:600;font-size:10.5px;margin-bottom:6px}
.card h3{font-size:23px;line-height:1.25;font-weight:400}
.price{font-size:22px;white-space:nowrap}
.short{color:var(--muted);margin-top:6px;font-style:italic}
.buy{padding-top:18px}
.cta{display:inline-flex;background:transparent;color:var(--accent);border:1px solid var(--accent);border-radius:999px;min-height:46px;padding:0 22px;font-weight:600;font-size:15px}
.cta:hover{background:var(--accent);color:var(--on-accent)}
.badge{background:transparent;color:var(--accent);border:1px solid var(--accent);font-size:10px;letter-spacing:.18em;margin-bottom:8px}
.pimg{margin-bottom:16px;border-radius:3px}
footer{color:var(--muted)}
.hero.has-cover{padding-top:0}.hero.has-cover .avatar{margin-top:-46px;background:var(--bg);box-shadow:0 0 0 5px var(--bg)}.hero.has-cover .cover{max-height:300px}
.tgrid{gap:0}.tcard{padding:22px 0;border-top:1px solid var(--line)}.tcard blockquote{font-family:var(--display);font-style:italic;font-size:18px;line-height:1.55}.tcard blockquote:before{font-size:48px}.tcard figcaption b{font-family:var(--display);font-weight:400;font-size:16px}@media (min-width:760px){.tgrid{grid-template-columns:1fr}}
.contact-box{background:transparent;border:0;border-top:1px solid var(--line);border-radius:0;text-align:center;padding:24px 0 0}.contact .links{justify-content:center}
`,
  fitness: `
body{background:var(--bg);color:var(--ink)}
:root{--maxw:1040px}
h1,.card h3,.price,.name{font-family:var(--display)}
.hero{position:relative;overflow:hidden;padding:40px 0 34px;border-bottom:4px solid var(--accent)}
.hero .bgimg{position:absolute;inset:0;z-index:0}
.hero .bgimg img{width:100%;height:100%;object-fit:cover;opacity:.32}
.hero .bgimg:after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,var(--bg) 35%,transparent 120%)}
.hero .wrap{position:relative;z-index:1}
.split{display:grid;gap:20px;align-items:center}
.pic{display:flex;align-items:center;gap:12px;order:-1}
.avatar{width:62px;height:62px;border-radius:18px;background:var(--accent);color:var(--on-accent);font-size:24px;font-family:var(--display)}
.name{font-weight:800;font-size:17px;text-transform:uppercase;letter-spacing:.04em}
.niche{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
h1{font-size:clamp(34px,9.5vw,66px);line-height:.98;font-weight:900;text-transform:uppercase;letter-spacing:-.01em;margin-top:10px;font-stretch:condensed}
.bio{margin-top:14px;color:var(--muted);max-width:560px;font-size:16.5px}
.links{margin-top:18px}
.links a{background:transparent;border:1.5px solid var(--line);color:var(--ink)}
.section-title{display:flex;align-items:center;gap:12px;margin:40px 0 16px;font-size:14px;letter-spacing:.2em;color:var(--ink)}
.section-title:before{content:"";width:28px;height:4px;background:var(--accent);border-radius:2px}
.card{background:var(--surface);border:1px solid var(--line);border-left:5px solid var(--accent);border-radius:14px;padding:20px;display:flex;flex-direction:column;position:relative}
.meta{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap}
.format{color:var(--accent)}
.badge{background:var(--accent);color:var(--on-accent)}
.card h3{font-size:25px;line-height:1.05;text-transform:uppercase;font-weight:850;margin-bottom:8px;font-stretch:condensed}
.short{color:var(--muted)}
.pricebar{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-top:auto;padding-top:14px;border-top:1px dashed var(--line)}
.card .benefits+.pricebar,.card .short+.pricebar,.card details+.pricebar{margin-top:18px}
.pricebar span{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:700}
.price{font-size:30px;font-weight:900;white-space:nowrap}
.buy{padding-top:12px}
.cta{width:100%;background:var(--accent);color:var(--on-accent);border-radius:999px;text-transform:uppercase;letter-spacing:.08em;font-size:15px}
.cta:hover{filter:brightness(1.08)}
.pimg{margin:-20px -20px 16px -20px;border-radius:9px 13px 0 0}
footer{color:var(--muted)}
.tcard{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px}
@media (min-width:760px){.split{grid-template-columns:1fr auto;gap:40px}.pic{order:0;flex-direction:column;text-align:center}.pic .avatar{width:160px;height:160px;border-radius:50%;font-size:56px;box-shadow:0 0 0 6px var(--bg),0 0 0 10px var(--accent)}.products{grid-template-columns:repeat(2,1fr)}.hero{padding:72px 0 56px}}
@media (min-width:1100px){.products.three{grid-template-columns:repeat(3,1fr)}}
`,
  edupro: `
body{background:var(--bg);color:var(--ink)}
body.bg-notebook{background-image:repeating-linear-gradient(transparent 0 31px,rgba(40,70,140,.07) 31px 32px)}
:root{--maxw:1000px}
h1,.card h3,.name{font-family:var(--display)}
.topbar{border-bottom:1px solid var(--line);background:var(--surface)}
.topbar .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:66px}
.id{display:flex;align-items:center;gap:10px;min-width:0}
.avatar{width:42px;height:42px;border-radius:11px;background:var(--accent);color:var(--on-accent);font-size:16px}
.name{font-weight:750;font-size:15.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.niche{font-size:12.5px;font-weight:650;color:var(--accent);background:var(--accent-soft);padding:5px 10px;border-radius:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:45%}
.intro{padding:36px 18px 4px}
.hero .cover{border-radius:16px;margin-bottom:26px;max-height:300px}
h1{font-size:clamp(28px,6.5vw,44px);line-height:1.12;font-weight:800;letter-spacing:-.02em;max-width:740px}
.bio{margin-top:12px;color:var(--muted);max-width:660px;font-size:16.5px}
.links{margin-top:18px}
.links a{background:var(--surface);border:1px solid var(--line);border-radius:10px;color:var(--ink)}
.section-title{margin:40px 0 16px;color:var(--ink);font-size:13px;border-bottom:2px solid var(--ink);padding-bottom:10px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 3px 0 var(--line)}
.strip{display:flex;justify-content:space-between;align-items:center;gap:8px;background:var(--accent-soft);padding:10px 18px;font-size:12px;font-weight:750;letter-spacing:.06em;text-transform:uppercase}
.strip .no{color:var(--accent);font-variant-numeric:tabular-nums}
.format{color:var(--muted);letter-spacing:.06em}
.cbody{padding:18px 18px 0;flex:1}
.card h3{font-size:20px;line-height:1.25;font-weight:750;margin-bottom:6px}
.short{color:var(--muted)}
.badge{background:var(--accent);color:var(--on-accent);margin-bottom:10px}
.cfoot{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 18px 18px;border-top:1px solid var(--line);margin-top:16px;flex-wrap:wrap}
.price{font-size:22px;font-weight:800;white-space:nowrap;padding-top:10px}
.cfoot .buy{flex:1;min-width:160px;max-width:250px}
.cta{width:100%;background:var(--accent);color:var(--on-accent);border-radius:10px;min-height:46px;font-size:15px}
.cta:hover{filter:brightness(1.08)}
.cfoot .via{text-align:center}
footer{color:var(--muted)}
.tcard{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:10px;padding:18px}
@media (min-width:760px){.products{grid-template-columns:repeat(2,1fr)}.intro{padding-top:52px}}
@media (min-width:1100px){.products.three{grid-template-columns:repeat(3,1fr)}}
`,
  studio: `
body{background:var(--bg);color:var(--ink)}
:root{--maxw:1080px}
.hero{padding:26px 0 6px}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:13px;color:var(--muted)}
.avatar{width:46px;height:46px;border-radius:50%;background:var(--ink);color:var(--bg);font-size:16px}
.niche{letter-spacing:.04em;text-align:right}
.bigname{font-family:var(--display);font-size:clamp(46px,14.5vw,136px);line-height:.92;font-weight:800;letter-spacing:-.05em;margin:30px 0 0;overflow-wrap:anywhere}
.bigname .dot{color:var(--accent)}
.hero .cover{margin-top:26px;border-radius:4px;aspect-ratio:16/7}
.lede{display:grid;gap:14px;margin-top:24px;padding-top:18px;border-top:1px solid var(--ink)}
h1{font-family:var(--display);font-size:clamp(20px,4.6vw,28px);line-height:1.28;font-weight:500;max-width:640px}
.bio{color:var(--muted);max-width:520px}
.links{margin-top:16px}
.links a{border:1px solid var(--ink);color:var(--ink);border-radius:0}
.section-title{margin:60px 0 20px;font-size:12px;letter-spacing:.24em;color:var(--muted)}
.products{gap:40px 26px}
.card{display:flex;flex-direction:column;position:relative}
.pimg{aspect-ratio:4/3;border-radius:4px;background:var(--surface)}
.ph-art{display:flex;align-items:flex-end;justify-content:space-between;padding:16px;background:linear-gradient(135deg,var(--surface) 30%,var(--accent-soft-strong));font-family:var(--display);color:var(--ink)}
.ph-art span{font-size:72px;font-weight:800;line-height:.8;letter-spacing:-.05em}
.ph-art em{font-style:normal;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);text-align:right;max-width:50%}
.cap{display:flex;justify-content:space-between;align-items:baseline;gap:14px;margin-top:14px}
.card h3{font-family:var(--display);font-size:21px;font-weight:600;line-height:1.25}
.price{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:15px;white-space:nowrap}
.format{color:var(--muted);font-weight:500;letter-spacing:.14em;font-size:11px;margin-top:4px}
.short{color:var(--muted);margin-top:8px}
.badge{background:var(--ink);color:var(--bg);border-radius:0;position:absolute;top:10px;left:10px;z-index:2}
.buy{margin-top:auto;padding-top:14px}
.cta{display:inline-flex;justify-content:flex-start;min-height:44px;padding:0 0 2px;background:none;color:var(--ink);border-bottom:2px solid var(--accent);border-radius:0;align-self:flex-start;width:auto}
.cta:hover{color:var(--accent)}
.buy .via{margin-top:4px}
footer{color:var(--muted)}
.tcard{border-top:1px solid var(--ink);padding-top:16px}.tcard blockquote{font-family:var(--display);font-size:18px}
.contact-box{background:transparent;border:0;border-top:1px solid var(--ink);border-radius:0;padding:18px 0 0}
@media (min-width:760px){.lede{grid-template-columns:1.2fr 1fr;gap:40px}.products{grid-template-columns:repeat(2,1fr)}.products>.card:nth-child(even){margin-top:56px}}
@media (min-width:1100px){.products.three{grid-template-columns:repeat(3,1fr)}.products.three>.card:nth-child(even){margin-top:56px}}
`,
  authority: `
body{background:var(--bg);color:var(--ink)}
:root{--maxw:1060px}
h1,.card h3,.price,.name{font-family:var(--display)}
.hero{background:#0E1A2B;color:#fff;padding:44px 0 48px}
body.dark .hero{background:#070B12;border-bottom:1px solid var(--line)}
.lead-grid{display:grid;gap:28px}
.eyebrow{font-size:12px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--accent-light)}
h1{font-size:clamp(30px,7vw,50px);line-height:1.1;font-weight:700;margin-top:12px;letter-spacing:-.01em}
.bio{color:rgba(255,255,255,.8);margin-top:14px;max-width:560px;font-size:16.5px}
.hero .links{margin-top:20px}
.hero .links a{border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:6px}
.idcard{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.idcard .cover{width:100%;border-radius:6px;min-height:0;aspect-ratio:16/7}
.avatar{width:64px;height:64px;border-radius:8px;background:var(--accent);color:var(--on-accent);font-size:24px;border:2px solid rgba(255,255,255,.55)}
.name{font-weight:700;font-size:18px}
.role{display:block;font-size:13px;color:rgba(255,255,255,.7);margin-top:2px}
.section-title{text-align:center;margin:52px 0 30px;font-size:13px;letter-spacing:.2em;color:var(--muted)}
.section-title:after{content:"";display:block;width:40px;height:3px;background:var(--accent);margin:12px auto 0}
.products{gap:22px;align-items:stretch}
.card{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:26px 22px;display:flex;flex-direction:column;text-align:center;position:relative}
.card.entry{border:2px solid var(--accent);box-shadow:0 18px 36px -22px var(--accent)}
.badge{position:absolute;top:0;left:50%;transform:translate(-50%,-50%);background:var(--accent);color:var(--on-accent);white-space:nowrap;z-index:2}
.format{color:var(--accent);font-size:11.5px;letter-spacing:.14em}
.card h3{font-size:21px;line-height:1.25;margin:8px 0 16px;font-weight:700}
.price{font-size:38px;font-weight:800;letter-spacing:-.02em;line-height:1}
.short{color:var(--muted);margin-top:14px}
.benefits{text-align:left;border-top:1px solid var(--line);padding-top:16px;margin-top:16px}
details{text-align:left}
.buy{margin-top:auto;padding-top:20px}
.cta{width:100%;background:var(--ink);color:var(--bg);border-radius:6px}
.card.entry .cta,.cta:hover{background:var(--accent);color:var(--on-accent)}
.pimg{margin:-26px -22px 18px;border-radius:7px 7px 0 0}
.card.entry .pimg{margin:-26px -22px 18px;border-radius:6px 6px 0 0}
footer{color:var(--muted)}
.tcard{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:20px}
@media (min-width:860px){.lead-grid{grid-template-columns:1.5fr 1fr;align-items:center;gap:48px}.hero{padding:64px 0 68px}}
@media (min-width:760px){.products{grid-template-columns:repeat(2,1fr)}.products.one{grid-template-columns:minmax(0,440px);justify-content:center}}
@media (min-width:1100px){.products.three{grid-template-columns:repeat(3,1fr)}}
`,
  lifestyle: `
body{background:var(--bg);color:var(--ink)}
:root{--maxw:980px}
h1,.card h3,.name,.section-title{font-family:var(--display)}
.hero{text-align:center;padding:36px 0 10px}
.hero.has-cover .cover{border-radius:0 0 48px 48px;max-height:260px}
.arch{width:150px;height:196px;margin:0 auto 18px;border-radius:999px 999px 26px 26px;padding:6px;background:var(--surface);box-shadow:0 14px 34px -16px rgba(80,30,40,.4);position:relative;z-index:1}
.hero.has-cover .arch{margin-top:-110px}
.avatar{width:100%;height:100%;border-radius:999px 999px 21px 21px;background:var(--accent-soft);color:var(--accent);font-size:46px;font-family:var(--display);font-style:italic;font-weight:400}
.name{font-size:28px;font-style:italic;font-weight:400;line-height:1.2}
.niche{display:inline-block;margin-top:8px;font-size:11.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--accent)}
h1{font-size:clamp(23px,5.6vw,33px);line-height:1.28;font-weight:400;margin:14px auto 0;max-width:620px}
.bio{color:var(--muted);margin:12px auto 0;max-width:540px}
.links{justify-content:center;margin-top:18px}
.links a{background:var(--surface);color:var(--ink);box-shadow:0 3px 12px -5px rgba(60,20,30,.25)}
.section-title{text-align:center;margin:48px 0 20px;font-style:italic;text-transform:none;letter-spacing:0;font-size:26px;font-weight:400}
.products{gap:20px}
.card{background:var(--surface);border-radius:30px;padding:10px 10px 24px;display:flex;flex-direction:column;text-align:center;box-shadow:0 16px 36px -24px rgba(80,30,40,.4);position:relative}
.pimg{border-radius:22px;margin-bottom:16px;aspect-ratio:4/3}
.pimg.soft{aspect-ratio:2/1;display:flex;align-items:center;justify-content:center;background:radial-gradient(70% 80% at 30% 20%,var(--accent-soft-strong),transparent 70%),radial-gradient(60% 70% at 80% 90%,var(--accent-soft),transparent 70%),var(--bg)}
.pimg.soft span{font-family:var(--display);font-style:italic;font-size:64px;color:var(--accent);opacity:.7}
.cbody{padding:0 12px;display:flex;flex-direction:column;flex:1}
.format{color:var(--accent);letter-spacing:.16em;font-size:11px}
.card h3{font-size:23px;line-height:1.25;font-weight:400;font-style:italic;margin:6px 0}
.price{font-size:18px;font-weight:700;letter-spacing:.02em}
.short{color:var(--muted);margin-top:8px}
.benefits{text-align:left;margin:14px auto 2px}
.buy{margin-top:auto;padding-top:18px}
.cta{display:inline-flex;margin:0 auto;background:var(--accent);color:var(--on-accent);border-radius:999px;min-height:46px;padding:0 28px;font-size:15px}
.cta:hover{filter:brightness(1.08)}
.badge{position:absolute;top:22px;left:22px;background:var(--surface);color:var(--accent);z-index:2;box-shadow:0 2px 10px rgba(0,0,0,.12)}
footer{color:var(--muted)}
.tcard{background:var(--surface);border-radius:26px;padding:22px;text-align:center}.tcard blockquote{font-family:var(--display);font-style:italic;font-size:17px}.tcard blockquote:before{margin:0 auto}
.contact-box{border:0;border-radius:28px;text-align:center}.contact .links{justify-content:center}
@media (min-width:760px){.products{grid-template-columns:repeat(2,1fr)}.products.one{grid-template-columns:minmax(0,460px);justify-content:center}}
@media (min-width:1100px){.products.three{grid-template-columns:repeat(3,1fr)}}
`,
  spotlight: `
body{background:var(--bg);color:var(--ink)}
:root{--maxw:900px}
.hero{position:relative;overflow:hidden;text-align:center;padding:56px 0 34px;background:radial-gradient(55% 60% at 50% 0%,var(--accent-soft-strong),transparent 72%)}
.hero .stagebg{position:absolute;inset:0;z-index:0}
.hero .stagebg img{width:100%;height:100%;object-fit:cover;opacity:.28}
.hero .stagebg:after{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,transparent,var(--bg) 92%)}
.hero .wrap{position:relative;z-index:1}
.avatar{width:124px;height:124px;border-radius:50%;margin:0 auto 20px;background:var(--surface);color:var(--accent);font-size:44px;font-family:var(--display);box-shadow:0 0 0 4px var(--bg),0 0 0 7px var(--accent),0 0 70px 8px var(--accent-soft-strong)}
.name{font-family:var(--display);font-size:clamp(42px,12.5vw,88px);line-height:.92;font-weight:900;text-transform:uppercase;font-stretch:condensed;overflow-wrap:anywhere}
.niche{display:inline-block;margin-top:16px;font-size:11.5px;font-weight:800;letter-spacing:.3em;text-transform:uppercase;color:var(--accent);border:1px solid var(--accent);padding:6px 14px;border-radius:999px}
h1{font-size:clamp(19px,4.6vw,24px);line-height:1.35;font-weight:600;margin:18px auto 0;max-width:600px}
.bio{color:var(--muted);margin:10px auto 0;max-width:560px}
.links{justify-content:center;margin-top:20px}
.links a{background:var(--surface);color:var(--ink);border:1px solid var(--line)}
.section-title{text-align:center;font-family:var(--display);font-size:clamp(26px,6.5vw,38px);text-transform:uppercase;letter-spacing:.04em;margin:42px 0 22px;font-weight:900;color:var(--ink);font-stretch:condensed}
.products{gap:20px}
.card{display:grid;grid-template-columns:92px minmax(0,1fr);background:var(--surface);border-radius:16px;position:relative}
.card:before,.card:after{content:"";position:absolute;left:83px;width:18px;height:18px;border-radius:50%;background:var(--bg);z-index:2}
.card:before{top:-9px}.card:after{bottom:-9px}
.stub{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:16px 6px;border-right:2px dashed var(--line);text-align:center;background:var(--accent-soft);border-radius:16px 0 0 16px}
.stub .price{font-family:var(--display);font-size:20px;font-weight:900;line-height:1.05;overflow-wrap:anywhere}
.stub .format{font-size:9.5px;letter-spacing:.12em;color:var(--muted)}
.main{padding:18px;min-width:0;display:flex;flex-direction:column}
.card h3{font-family:var(--display);font-size:22px;line-height:1.12;font-weight:850;text-transform:uppercase;font-stretch:condensed}
.short{color:var(--muted);margin-top:6px}
.badge{background:var(--accent);color:var(--on-accent);align-self:flex-start;margin-bottom:8px}
.buy{margin-top:auto;padding-top:16px}
.cta{background:var(--accent);color:var(--on-accent);border-radius:10px;width:100%;text-transform:uppercase;letter-spacing:.06em;font-size:15px}
.cta:hover{filter:brightness(1.1)}
.pimg{margin:-18px -18px 14px;border-radius:0 16px 0 0}
footer{color:var(--muted)}
.tcard{background:var(--surface);border-radius:16px;padding:20px;border:1px solid var(--line)}
.contact-box{text-align:center}.contact .links{justify-content:center}
@media (min-width:760px){.card{grid-template-columns:132px minmax(0,1fr)}.card:before,.card:after{left:123px}.stub .price{font-size:28px}.main{padding:22px 24px}.pimg{margin:-22px -24px 16px}}
`,
  elite: `
body{background-color:var(--bg);color:var(--ink);background-image:radial-gradient(55% 45% at 88% 0%,var(--accent-soft-strong),transparent 70%),radial-gradient(45% 35% at 0% 40%,rgba(255,255,255,.045),transparent 70%)}
:root{--maxw:1000px}
h1,.card h3,.name,.price{font-family:var(--display)}
.hero{padding:28px 0 8px}
.hero .cover{border-radius:24px;max-height:320px;-webkit-mask-image:linear-gradient(to bottom,#000 55%,transparent);mask-image:linear-gradient(to bottom,#000 55%,transparent)}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:26px;padding:26px 22px;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 30px 60px -30px rgba(0,0,0,.7)}
.hero.has-cover .panel{margin-top:-70px;position:relative}
.id{display:flex;align-items:center;gap:14px}
.avatar{width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-base));color:#0B0B0F;font-size:26px;font-family:var(--display);box-shadow:0 0 0 2px var(--bg),0 0 0 3.5px var(--accent)}
.name{font-size:20px;font-weight:500}
.niche{display:block;font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:var(--accent);margin-top:4px}
h1{font-size:clamp(30px,7.5vw,52px);line-height:1.08;font-weight:500;margin-top:24px;background:linear-gradient(100deg,var(--ink) 25%,var(--accent) 75%);-webkit-background-clip:text;background-clip:text;color:transparent}
.bio{color:var(--muted);margin-top:14px;max-width:640px;font-size:16.5px}
.links{margin-top:20px}
.links a{background:rgba(255,255,255,.04);border:1px solid var(--line);color:var(--ink)}
.section-title{margin:52px 0 20px;color:var(--accent);font-size:11.5px;letter-spacing:.32em;display:flex;align-items:center;gap:14px}
.section-title:after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--line),transparent)}
.products{gap:20px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:22px;display:flex;flex-direction:column;position:relative;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:inset 0 1px 0 rgba(255,255,255,.07)}
.card.entry{border-color:var(--accent)}
.format{color:var(--muted);letter-spacing:.2em;font-size:10.5px}
.badge{background:transparent;color:var(--accent);border:1px solid var(--accent);font-size:10px;letter-spacing:.22em;margin-bottom:10px;align-self:flex-start}
.card h3{font-size:24px;line-height:1.2;font-weight:500;margin:8px 0}
.short{color:var(--muted)}
.foot{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-top:auto;padding-top:18px;border-top:1px solid var(--line);flex-wrap:wrap}
.card .short+.foot,.card .benefits+.foot,.card details+.foot{margin-top:18px}
.price{font-size:27px;color:var(--accent);white-space:nowrap;padding-top:6px}
.foot .buy{flex:1;min-width:160px;max-width:240px}
.cta{width:100%;background-color:var(--accent);background-image:linear-gradient(135deg,rgba(255,255,255,.4),transparent 55%);color:var(--on-accent);border-radius:999px}
.cta:hover{filter:brightness(1.06)}
.foot .via{text-align:center}
.pimg{margin:-22px -22px 16px;border-radius:21px 21px 0 0}
footer{color:var(--muted)}
.tcard{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:20px}
@media (min-width:760px){.products{grid-template-columns:repeat(2,1fr)}.panel{padding:34px 36px}}
@media (min-width:1100px){.products.three{grid-template-columns:repeat(3,1fr)}}
`,
};

// Where a product's button takes the buyer. Order: creator's payment link → WhatsApp enquiry →
// Instagram DM → website → email → in-page explanation. Never a dead end, never a fake checkout.
function ctaFor(p, content, handle) {
  const links = content.links || {};
  const price = formatInr(p.priceInr, p.format);
  if (p.buyUrl) return { kind: 'payment_link', href: p.buyUrl, via: "Opens the creator's payment page" };
  if (links.whatsapp) {
    return { kind: 'whatsapp', href: whatsappLink(links.whatsapp, `Hi ${content.creator.displayName}! I'd like "${p.title}" (${price}) from your store.`), via: 'Opens a WhatsApp chat with the creator' };
  }
  const ig = links.instagram || handle;
  if (ig) return { kind: 'instagram', href: `https://instagram.com/${encodeURIComponent(ig)}`, via: `Message @${ig} on Instagram to buy` };
  if (links.website) return { kind: 'website', href: links.website, via: "Opens the creator's website" };
  if (links.email) return { kind: 'email', href: `mailto:${links.email}?subject=${encodeURIComponent(`${p.title} (${price})`)}`, via: 'Opens an email to the creator' };
  return { kind: 'info' };
}

// In the editor preview, a missing required field shows a dashed placeholder that says it's
// needed before publishing. The public page never has empty required fields (saves are validated).
function field(value, placeholder, preview) {
  if (value) return e(value);
  return preview ? `<span class="ph">${e(placeholder)}<small>Needed to publish</small></span>` : '';
}

function productHtml(p, i, ctx) {
  const { content, handle, theme, entryId, src, preview } = ctx;
  const cta = ctaFor(p, content, handle);
  const benefits = (p.benefits || []).map((b) => `<li>${e(b)}</li>`).join('');
  const label = e(p.ctaLabel || 'Get it now');
  const fmtText = FORMATS[p.format]?.label || p.format;
  const fmt = e(fmtText);
  const price = e(formatInr(p.priceInr, p.format));
  const attrs = `data-cta="${cta.kind}" data-pid="${e(p.id)}" data-format="${e(p.format)}" data-position="${i + 1}"`;
  const button = cta.kind === 'info'
    ? `<button class="cta" type="button" ${attrs} aria-expanded="false" aria-controls="note-${e(p.id)}">${label}</button>
       <p class="note" id="note-${e(p.id)}" role="status">The creator hasn't connected payments yet. Bookmark this page and check back soon.</p>`
    : `<a class="cta" href="${e(cta.href)}" target="_blank" rel="noopener noreferrer nofollow" ${attrs}>${label}${ICON.arrow}</a>
       <p class="via">${e(cta.via)}</p>`;
  const badge = p.id === entryId ? `<span class="badge">Start here</span>` : '';
  const details = p.description ? `<details><summary>What's inside</summary><p>${e(p.description)}</p></details>` : '';
  const list = benefits ? `<ul class="benefits">${benefits}</ul>` : '';
  const title = field(p.title, 'Add a product title', preview);
  const short = field(p.shortDescription, 'Add a one-line pitch', preview);
  const imgSrc = src(p.cover);
  const img = imgSrc ? `<div class="pimg"><img src="${e(imgSrc)}" alt="" width="1200" height="675" loading="lazy" decoding="async"></div>` : '';
  const num = String(i + 1).padStart(2, '0');
  const open = `<article class="card${p.id === entryId ? ' entry' : ''}" id="p-${e(p.id)}">`;
  const buy = `<div class="buy">${button}</div>`;

  switch (theme) {
    case 'elegant':
      return `${open}<span class="num" aria-hidden="true">${num}</span>
      <div class="card-body">${img}${badge}<span class="format">${fmt}</span>
        <div class="card-top"><h3>${title}</h3><span class="price">${price}</span></div>
        <p class="short">${short}</p>${list}${details}${buy}
      </div></article>`;
    case 'fitness':
      return `${open}${img}<div class="meta"><span class="format">${fmt}</span>${badge}</div>
      <h3>${title}</h3><p class="short">${short}</p>${list}${details}
      <div class="pricebar"><span>Price</span><b class="price">${price}</b></div>${buy}</article>`;
    case 'edupro':
      return `${open}${img}<div class="strip"><span class="no">${num}</span><span class="format">${fmt}</span></div>
      <div class="cbody">${badge}<h3>${title}</h3><p class="short">${short}</p>${list}${details}</div>
      <div class="cfoot"><span class="price">${price}</span>${buy}</div></article>`;
    case 'studio':
      return `${open}${badge}${img || `<div class="pimg ph-art" aria-hidden="true"><span>${num}</span></div>`}
      <div class="cap"><h3>${title}</h3><span class="price">${price}</span></div><span class="format">${fmt}</span>
      <p class="short">${short}</p>${list}${details}${buy}</article>`;
    case 'authority':
      return `${open}${badge}${img}<span class="format">${fmt}</span><h3>${title}</h3>
      <div class="price">${price}</div><p class="short">${short}</p>${list}${details}${buy}</article>`;
    case 'lifestyle':
      return `${open}${badge}${img || `<div class="pimg soft" aria-hidden="true"><span>${e((p.title || '★').trim().charAt(0).toUpperCase())}</span></div>`}
      <div class="cbody"><span class="format">${fmt}</span><h3>${title}</h3><span class="price">${price}</span>
      <p class="short">${short}</p>${list}${details}${buy}</div></article>`;
    case 'spotlight':
      return `${open}<div class="stub"><span class="format">${fmt}</span><b class="price">${price}</b></div>
      <div class="main">${img}${badge}<h3>${title}</h3><p class="short">${short}</p>${list}${details}${buy}</div></article>`;
    case 'elite':
      return `${open}${img}${badge}<span class="format">${fmt}</span><h3>${title}</h3>
      <p class="short">${short}</p>${list}${details}
      <div class="foot"><span class="price">${price}</span>${buy}</div></article>`;
    default: {
      const head = `<div class="card-top"><span class="format">${fmt}</span><span class="price">${price}</span></div>`;
      return `${open}${img}${badge}${head}
    <h3>${title}</h3>
    <p class="short">${short}</p>
    ${list}${details}
    ${buy}</article>`;
    }
  }
}

function linksHtml(content, handle, label = 'Contact and social links') {
  const l = content.links || {};
  const ig = l.instagram || handle;
  const out = [];
  if (ig) out.push(`<a href="https://instagram.com/${encodeURIComponent(ig)}" target="_blank" rel="noopener noreferrer">${ICON.instagram}@${e(ig)}</a>`);
  if (l.whatsapp) out.push(`<a href="${e(whatsappLink(l.whatsapp, `Hi ${content.creator.displayName}!`))}" target="_blank" rel="noopener noreferrer">${ICON.whatsapp}WhatsApp</a>`);
  if (l.website) {
    let host = l.website;
    try { host = new URL(l.website).hostname.replace(/^www\./, ''); } catch { /* keep */ }
    out.push(`<a href="${e(l.website)}" target="_blank" rel="noopener noreferrer nofollow">${ICON.link}${e(host)}</a>`);
  }
  if (l.email) out.push(`<a href="mailto:${e(l.email)}">${ICON.mail}Email</a>`);
  return out.length ? `<nav class="links" aria-label="${e(label)}">${out.join('')}</nav>` : '';
}

function heroHtml(content, handle, theme, src, preview) {
  const c = content.creator;
  const avatarSrc = src(c.avatar);
  const coverSrc = src(c.cover);
  // Images are decorative here: the creator's name is the next thing on the page.
  const av = avatarSrc
    ? `<div class="avatar has-img"><img src="${e(avatarSrc)}" alt="" width="160" height="160" decoding="async"></div>`
    : `<div class="avatar" aria-hidden="true">${e(initials(c.displayName))}</div>`;
  const coverImg = coverSrc ? `<img src="${e(coverSrc)}" alt="" width="1600" height="600" decoding="async" fetchpriority="high">` : '';
  const cover = coverImg ? `<div class="cover">${coverImg}</div>` : '';
  const cls = `hero${coverSrc ? ' has-cover' : ''}`;
  const links = linksHtml(content, handle);
  const name = field(c.displayName, 'Add your name', preview);
  const headline = field(c.headline, 'Add a headline', preview);
  const bio = field(c.bio, 'Add a short bio', preview);
  const niche = c.niche ? `<span class="niche">${e(c.niche)}</span>` : '';

  switch (theme) {
    case 'bold':
      return `<header class="${cls}">${cover}<div class="wrap">
      <div class="id">${av}<div><p class="name">${name}</p>${niche}</div></div>
      <h1>${headline}</h1><p class="bio">${bio}</p>${links}</div></header>`;
    case 'elegant':
      return `<header class="${cls}">${cover}<div class="wrap">${av}<p class="name">${name}</p>
      ${niche}<div class="rule"></div>
      <h1>${headline}</h1><p class="bio">${bio}</p>${links}</div></header>`;
    case 'fitness':
      return `<header class="${cls}">${coverImg ? `<div class="bgimg">${coverImg}</div>` : ''}<div class="wrap split">
      <div class="txt">${niche}<h1>${headline}</h1><p class="bio">${bio}</p>${links}</div>
      <div class="pic">${av}<p class="name">${name}</p></div></div></header>`;
    case 'edupro':
      return `<header class="${cls}"><div class="topbar"><div class="wrap"><div class="id">${av}<p class="name">${name}</p></div>${niche}</div></div>
      <div class="wrap intro">${cover}<h1>${headline}</h1><p class="bio">${bio}</p>${links}</div></header>`;
    case 'studio':
      return `<header class="${cls}"><div class="wrap"><div class="top">${av}${niche}</div>
      <p class="bigname">${name}${c.displayName ? '<span class="dot">.</span>' : ''}</p>${cover}
      <div class="lede"><h1>${headline}</h1><div><p class="bio">${bio}</p>${links}</div></div></div></header>`;
    case 'authority':
      return `<header class="${cls}"><div class="wrap lead-grid">
      <div>${c.niche ? `<span class="eyebrow">${e(c.niche)}</span>` : ''}<h1>${headline}</h1><p class="bio">${bio}</p>${links}</div>
      <aside class="idcard">${cover}${av}<div><p class="name">${name}</p>${c.niche ? `<span class="role">${e(c.niche)}</span>` : ''}</div></aside>
      </div></header>`;
    case 'lifestyle':
      return `<header class="${cls}">${cover}<div class="wrap"><div class="arch">${av}</div><p class="name">${name}</p>
      ${niche}<h1>${headline}</h1><p class="bio">${bio}</p>${links}</div></header>`;
    case 'spotlight':
      return `<header class="${cls}">${coverImg ? `<div class="stagebg">${coverImg}</div>` : ''}<div class="wrap">${av}
      <p class="name">${name}</p>${niche}<h1>${headline}</h1><p class="bio">${bio}</p>${links}</div></header>`;
    case 'elite':
      return `<header class="${cls}"><div class="wrap">${cover}<div class="panel">
      <div class="id">${av}<div><p class="name">${name}</p>${niche}</div></div>
      <h1>${headline}</h1><p class="bio">${bio}</p>${links}</div></div></header>`;
    default:
      return `<header class="${cls}">${cover}<div class="wrap">${av}<p class="name">${name}</p>
    ${niche}
    <h1>${headline}</h1><p class="bio">${bio}</p>${links}</div></header>`;
  }
}

function faviconSvg(letters, accent) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${accent}"/><text x="32" y="41" font-family="Arial,sans-serif" font-size="26" font-weight="700" fill="#fff" text-anchor="middle">${letters}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Colours and type for the chosen template + background + font. On dark backgrounds the accent is
// lifted to a brighter shade (and buttons use dark text), so all 9 accents work on every template.
function themeVars(themeIn) {
  const t = normaliseTheme(themeIn);
  const tpl = TEMPLATES[t.style];
  const b = tpl.backgrounds[t.background];
  const base = ACCENTS[t.accent];
  const accent = b.dark ? accentLight(base) : base;
  const vars = {
    '--accent': accent,
    '--accent-base': base,
    '--accent-light': accentLight(base),
    '--on-accent': b.dark ? '#0B0B0F' : '#FFFFFF',
    '--accent-soft': soft(accent, b.dark ? 0.14 : 0.12),
    '--accent-soft-strong': soft(accent, b.dark ? 0.3 : 0.22),
    '--bg': b.page,
    '--surface': b.surface,
    '--ink': b.ink,
    '--muted': b.muted,
    '--line': b.line,
    '--display': FONTS[t.font].stack,
  };
  return { t, b, base, css: `:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')}}` };
}

// assetSrc: optional (id) => URL for images. The editor's sandboxed preview passes data: URLs
// because it can't load images from the site.
export function renderStorefront(content, { handle = '', slug = '', baseUrl = '', mode = 'public', published = false, year = new Date().getFullYear(), assetSrc = null } = {}) {
  const src = assetSrc || ((assetId) => assetUrl(assetId, baseUrl));
  const preview = mode === 'preview';
  const c = content.creator;
  const { t, b, base, css } = themeVars(content.theme);
  const theme = t.style;
  const lang = content.language === 'hi' ? 'hi' : 'en';
  const url = slug ? `${baseUrl}/s/${slug}` : '';
  const title = `${c.displayName || 'Your name'} · ${c.headline || 'Your store'}`;
  const desc = String(c.bio || '').replace(/\s+/g, ' ').slice(0, 158);
  const products = content.products || [];
  const coverAbs = baseUrl && !preview ? assetUrl(c.cover, baseUrl) : '';

  // "Start here" marks the cheapest paid offer, a fact about price, never a popularity claim.
  let entryId = null;
  if (products.length > 1) {
    const paid = products.filter((p) => Number(p.priceInr) > 0);
    if (paid.length > 1) entryId = paid.reduce((a, x) => (Number(x.priceInr) < Number(a.priceInr) ? x : a)).id;
  }

  const heading = (text, id = '') => (theme === 'bold'
    ? `<h2 class="section-title"${id ? ` id="${id}"` : ''}><span>${text}</span></h2>`
    : `<h2 class="section-title"${id ? ` id="${id}"` : ''}>${text}</h2>`);
  const ctx = { content, handle, theme, entryId, src, preview };
  const items = products.map((p, i) => productHtml(p, i, ctx)).join('');
  const quotes = visibleTestimonials(content);
  const contactLinks = linksHtml(content, handle, 'Ways to get in touch');
  const blocks = {
    products: `<section class="offers" aria-labelledby="o-h">${heading('What I offer', 'o-h')}
  <div class="products${products.length === 1 ? ' one' : products.length === 3 ? ' three' : ''}">${items}</div></section>`,
    testimonials: quotes.length
      ? `<section class="testimonials" aria-labelledby="t-h">${heading('What people say', 't-h')}<div class="tgrid">${quotes.map((q) => `<figure class="tcard"><blockquote>${e(q.quote)}</blockquote><figcaption><b>${e(q.name)}</b>${q.detail ? `<span>${e(q.detail)}</span>` : ''}</figcaption></figure>`).join('')}</div></section>`
      : '',
    contact: contactLinks
      ? `<section class="contact" aria-labelledby="c-h">${heading('Get in touch', 'c-h')}<div class="contact-box"><p>Questions before you buy? Reach out directly.</p>${contactLinks}</div></section>`
      : preview
        ? `<section class="contact" aria-labelledby="c-h">${heading('Get in touch', 'c-h')}<div class="contact-box ph-box"><p>Add your WhatsApp, Instagram, email or website under "Where buyers go" so buyers can reach you.</p></div></section>`
        : '',
  };
  const main = t.sections.order.filter((k) => !t.sections.hidden.includes(k)).map((k) => blocks[k]).join('\n');
  const share = url
    ? `<div class="share"><button type="button" data-copy="${e(url)}">Copy store link</button>
        <a href="https://wa.me/?text=${encodeURIComponent(`${c.displayName}: ${c.headline} ${url}`)}" target="_blank" rel="noopener noreferrer">Share on WhatsApp</a></div>`
    : '';
  const banner = preview
    ? `<div class="preview-banner">${published ? 'Preview · saved edits appear on your live page within ~30s' : 'Preview · only you can see this until you publish'}</div>`
    : '';
  const themeColor = theme === 'bold' ? base : theme === 'authority' && !b.dark ? '#0E1A2B' : b.page;

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${e(title)}</title>
<meta name="description" content="${e(desc)}">
${url ? `<link rel="canonical" href="${e(url)}">` : ''}
<link rel="icon" href="${faviconSvg(e(initials(c.displayName)), base)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${e(c.displayName)}">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(desc)}">
${url ? `<meta property="og:url" content="${e(url)}">` : ''}
<meta property="og:locale" content="${lang === 'hi' ? 'hi_IN' : 'en_IN'}">
${coverAbs ? `<meta property="og:image" content="${e(coverAbs)}">\n<meta property="og:image:width" content="1600">\n<meta property="og:image:height" content="600">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="${e(coverAbs)}">` : '<meta name="twitter:card" content="summary">'}
<meta name="twitter:title" content="${e(title)}">
<meta name="twitter:description" content="${e(desc)}">
<meta name="theme-color" content="${themeColor}">
${preview ? '<meta name="robots" content="noindex">' : ''}
<style>${css}${BASE_CSS}${THEME_CSS[theme]}</style>
</head>
<body class="t-${theme} bg-${t.background} f-${t.font}${b.dark ? ' dark' : ''}" data-mode="${preview ? 'preview' : 'public'}" data-slug="${e(slug)}" data-theme="${theme}">
${banner}
${heroHtml(content, handle, theme, src, preview)}
<main class="wrap" id="offers">
${main}
</main>
<footer>${share}<p>© ${year} ${e(c.displayName)}</p><small><a class="made" href="/">Made with Sell Sphere</a></small></footer>
${preview ? '' : '<script type="module" src="/assets/store.js"></script>'}
</body>
</html>`;
}

export function renderNotFound(message = 'This store isn\'t live right now.') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Store not found · Sell Sphere</title><link rel="icon" href="/brand/favicon.svg" type="image/svg+xml"><meta name="theme-color" content="#090B12"><meta name="robots" content="noindex">
<style>body{font-family:"Space Grotesk",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#090B12;color:#F8FAFC;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}
.box{max-width:400px;background:rgba(27,29,42,.72);border:1px solid rgba(255,216,122,.18);border-radius:18px;padding:32px 24px}.brand{display:flex;align-items:center;justify-content:center;gap:8px;font-weight:700;font-size:17px;color:#F8FAFC;margin-bottom:18px}.brand b{color:#FFB301}h1{font-size:22px;line-height:1.3;margin:0 0 8px}p{color:#A1A1AA;margin:0 0 22px;line-height:1.5}a.cta{display:inline-block;background:#FFB301;color:#090B12;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600}a.cta:focus-visible{outline:3px solid rgba(255,216,122,.5);outline-offset:2px}</style></head>
<body><main class="box"><span class="brand"><img src="/brand/sell-sphere-icon.svg" alt="" width="29" height="24">Sell <b>Sphere</b></span><h1>${e(message)}</h1><p>The link may be mistyped, or the creator may have taken their store offline.</p><a class="cta" href="/">Create your own store</a></main></body></html>`;
}
