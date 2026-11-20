// Renders a storefront to a full HTML document. Used by the server for the public page
// (/s/:slug) and by the editor's live preview, so preview and published page always match.
// Three themes with genuinely different compositions:
//   minimal  – centred profile, clean card grid, price top-right
//   bold     – full-bleed colour hero, sticker prices, offset-shadow cards, "Start here" entry offer
//   elegant  – editorial: serif, hairline rules, numbered offers instead of boxes
import { escapeHtml as e, formatInr, FORMATS, ACCENTS, whatsappLink, assetUrl, visibleTestimonials } from './shared.js';

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
.preview-banner{position:sticky;top:0;z-index:5;background:#16161A;color:#fff;font-size:13px;text-align:center;padding:8px 12px}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
`;

const THEME_CSS = {
  minimal: `
body{background:#F6F7F9;color:#15161A}
:root{--maxw:960px}
.hero{text-align:center;padding:52px 0 8px}
.avatar{width:84px;height:84px;border-radius:50%;background:var(--accent);color:#fff;font-size:30px;margin:0 auto 14px;box-shadow:0 0 0 6px #fff,0 0 0 7px #E6E7EC}
.name{font-weight:650;font-size:16px}
.niche{display:inline-block;margin-top:8px;font-size:12.5px;font-weight:600;color:var(--accent);background:var(--accent-soft);padding:4px 11px;border-radius:999px}
h1{font-size:clamp(25px,6vw,36px);line-height:1.18;letter-spacing:-.02em;font-weight:750;margin:16px auto 0;max-width:640px}
.bio{color:#4A4D57;margin:12px auto 0;max-width:560px;font-size:16px}
.links{justify-content:center;margin-top:20px}
.links a{background:#fff;border:1px solid #E3E5EA;color:#15161A}
.section-title{color:#8A8D98;margin:44px 0 14px;text-align:center}
.card{background:#fff;border:1px solid #E7E8EC;border-radius:18px;padding:22px;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(20,20,30,.04)}
.card-top{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:10px}
.format{color:#8A8D98}
.price{font-size:22px;font-weight:750;letter-spacing:-.01em;white-space:nowrap}
.card h3{font-size:19px;line-height:1.3;margin-bottom:6px}
.short{color:#4A4D57}
.buy{margin-top:auto;padding-top:18px}
.cta{width:100%;background:var(--accent);color:#fff;border-radius:12px}
.cta:hover{filter:brightness(1.08)}
.badge{background:var(--accent-soft);color:var(--accent);margin-bottom:10px;align-self:flex-start}
.pimg{margin:-22px -22px 16px;border-radius:17px 17px 0 0;border-bottom:1px solid #E7E8EC}
footer{color:#5C5F6A}
@media (min-width:760px){.products{grid-template-columns:repeat(2,1fr)}.products.one{grid-template-columns:minmax(0,520px);justify-content:center}}
@media (min-width:1100px){.products.three{grid-template-columns:repeat(3,1fr)}}
.hero.has-cover{padding-top:0}.hero.has-cover .avatar{margin-top:-42px}
.tcard{background:#fff;border:1px solid #E6E7EC;border-radius:16px;padding:18px 18px 16px}
`,
  bold: `
body{background:#FFFBF5;color:#111}
:root{--maxw:980px}
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
.section-title span{display:inline-block;background:#111;color:#fff;padding:9px 16px;border-radius:999px;letter-spacing:.1em}
.card{background:#fff;border:2.5px solid #111;border-radius:22px;padding:22px;box-shadow:6px 6px 0 #111;position:relative;display:flex;flex-direction:column}
.card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}
.format{background:var(--accent-soft);color:#111;padding:4px 9px;border-radius:8px}
.price{background:var(--accent);color:#fff;font-weight:900;font-size:22px;padding:6px 12px;border-radius:12px;border:2.5px solid #111;transform:rotate(-3deg);white-space:nowrap}
.card h3{font-size:22px;line-height:1.15;font-weight:850;letter-spacing:-.01em;margin-bottom:8px}
.short{color:#333}
.buy{margin-top:auto;padding-top:18px}
.cta{width:100%;background:#111;color:#fff;border-radius:14px}
.cta:hover{background:var(--accent)}
.badge{position:absolute;top:-13px;left:18px;background:#FFD43B;color:#111;border:2px solid #111;z-index:2}
.pimg{margin:-22px -22px 16px;border-radius:19px 19px 0 0;border-bottom:2.5px solid #111}
footer{color:#333}
@media (min-width:760px){.products{grid-template-columns:repeat(2,1fr);gap:24px}.hero{padding:56px 0 84px}}
@media (min-width:1100px){.products.three{grid-template-columns:repeat(3,1fr)}}
.hero.has-cover{padding-top:0}.hero.has-cover:after{display:none}.hero.has-cover .cover{border-bottom:3px solid #111}.hero.has-cover .id{margin-top:-29px}.hero.has-cover .id>div{margin-top:29px}
.tcard{background:#fff;border:2.5px solid #111;border-radius:16px;padding:18px;box-shadow:4px 4px 0 #111}.tcard blockquote{font-weight:500}
`,
  elegant: `
body{background:#F6F1E9;color:#2A2420}
:root{--maxw:680px}
h1,h3,.price,.name,.num{font-family:var(--serif)}
.hero{text-align:center;padding:64px 0 10px}
.avatar{width:92px;height:92px;border-radius:50%;background:transparent;color:var(--accent);border:1px solid var(--accent);font-family:var(--serif);font-size:32px;font-weight:400;margin:0 auto 18px}
.name{font-size:19px}
.niche{display:block;margin-top:6px;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#8C7B68}
.rule{width:56px;height:1px;background:var(--accent);margin:26px auto}
h1{font-size:clamp(28px,7vw,40px);line-height:1.2;font-weight:400;letter-spacing:-.005em}
.bio{margin-top:16px;color:#5A4E44;font-size:16.5px}
.links{justify-content:center;margin-top:22px}
.links a{color:#2A2420;border-bottom:1px solid #CBBBA6;border-radius:0;padding:0 2px;min-height:36px}
.section-title{text-align:center;color:#8C7B68;font-size:11px;letter-spacing:.3em;margin:52px 0 6px}
.products{gap:0}
.card{padding:30px 0;border-top:1px solid #DDD0BE;display:grid;grid-template-columns:auto 1fr;column-gap:18px}
.card:last-child{border-bottom:1px solid #DDD0BE}
.num{font-size:15px;color:var(--accent);padding-top:5px}
.card-body{min-width:0}
.card-top{display:flex;justify-content:space-between;align-items:baseline;gap:14px}
.format{color:#8C7B68;letter-spacing:.16em;font-weight:600;font-size:10.5px;margin-bottom:6px}
.card h3{font-size:23px;line-height:1.25;font-weight:400}
.price{font-size:22px;white-space:nowrap}
.short{color:#5A4E44;margin-top:6px;font-style:italic}
.buy{padding-top:18px}
.cta{display:inline-flex;background:transparent;color:var(--accent);border:1px solid var(--accent);border-radius:999px;min-height:46px;padding:0 22px;font-weight:600;font-size:15px}
.cta:hover{background:var(--accent);color:#fff}
.badge{background:transparent;color:var(--accent);border:1px solid var(--accent);font-size:10px;letter-spacing:.18em;margin-bottom:8px}
.pimg{margin-bottom:16px;border-radius:3px}
footer{color:#8C7B68}
.hero.has-cover{padding-top:0}.hero.has-cover .avatar{margin-top:-46px;background:#F6F1E9;box-shadow:0 0 0 5px #F6F1E9}.hero.has-cover .cover{max-height:300px}
.tgrid{gap:0}.tcard{padding:22px 0;border-top:1px solid #DDD0BE}.tcard blockquote{font-family:var(--serif);font-style:italic;font-size:18px;line-height:1.55}.tcard blockquote:before{font-size:48px}.tcard figcaption b{font-family:var(--serif);font-weight:400;font-size:16px}@media (min-width:760px){.tgrid{grid-template-columns:1fr}}
`,
};

// Where a product's button takes the buyer. Order: creator's payment link → WhatsApp enquiry →
// Instagram DM → website → in-page explanation. Never a dead end, never a fake checkout.
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
  return { kind: 'info' };
}

function productHtml(p, i, content, handle, theme, entryId, src) {
  const imgSrc = src(p.cover);
  const img = imgSrc ? `<div class="pimg"><img src="${e(imgSrc)}" alt="" width="1200" height="675" loading="lazy" decoding="async"></div>` : '';
  const cta = ctaFor(p, content, handle);
  const benefits = (p.benefits || []).map((b) => `<li>${e(b)}</li>`).join('');
  const label = e(p.ctaLabel || 'Get it now');
  const fmt = e(FORMATS[p.format]?.label || p.format);
  const price = e(formatInr(p.priceInr, p.format));
  const attrs = `data-cta="${cta.kind}" data-pid="${e(p.id)}" data-format="${e(p.format)}" data-position="${i + 1}"`;
  const button = cta.kind === 'info'
    ? `<button class="cta" type="button" ${attrs} aria-expanded="false" aria-controls="note-${e(p.id)}">${label}</button>
       <p class="note" id="note-${e(p.id)}" role="status">The creator hasn't connected payments yet. Bookmark this page and check back soon.</p>`
    : `<a class="cta" href="${e(cta.href)}" target="_blank" rel="noopener noreferrer nofollow" ${attrs}>${label}${ICON.arrow}</a>
       <p class="via">${e(cta.via)}</p>`;
  const badge = p.id === entryId ? `<span class="badge">Start here</span>` : '';
  const details = p.description ? `<details><summary>What's inside</summary><p>${e(p.description)}</p></details>` : '';
  const head = `<div class="card-top"><span class="format">${fmt}</span><span class="price">${price}</span></div>`;

  if (theme === 'elegant') {
    return `<article class="card" id="p-${e(p.id)}"><span class="num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
      <div class="card-body">${img}${badge}<span class="format">${fmt}</span>
        <div class="card-top"><h3>${e(p.title)}</h3><span class="price">${price}</span></div>
        <p class="short">${e(p.shortDescription)}</p>
        ${benefits ? `<ul class="benefits">${benefits}</ul>` : ''}${details}
        <div class="buy">${button}</div>
      </div></article>`;
  }
  return `<article class="card" id="p-${e(p.id)}">${img}${badge}${head}
    <h3>${e(p.title)}</h3>
    <p class="short">${e(p.shortDescription)}</p>
    ${benefits ? `<ul class="benefits">${benefits}</ul>` : ''}${details}
    <div class="buy">${button}</div></article>`;
}

function linksHtml(content, handle) {
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
  return out.length ? `<nav class="links" aria-label="Contact and social links">${out.join('')}</nav>` : '';
}

function heroHtml(content, handle, theme, src) {
  const c = content.creator;
  const avatarSrc = src(c.avatar);
  const coverSrc = src(c.cover);
  // Images are decorative here: the creator's name is the next thing on the page.
  const av = avatarSrc
    ? `<div class="avatar has-img"><img src="${e(avatarSrc)}" alt="" width="160" height="160" decoding="async"></div>`
    : `<div class="avatar" aria-hidden="true">${e(initials(c.displayName))}</div>`;
  const cover = coverSrc ? `<div class="cover"><img src="${e(coverSrc)}" alt="" width="1600" height="600" decoding="async" fetchpriority="high"></div>` : '';
  const cls = `hero${coverSrc ? ' has-cover' : ''}`;
  const links = linksHtml(content, handle);
  if (theme === 'bold') {
    return `<header class="${cls}">${cover}<div class="wrap">
      <div class="id">${av}<div><p class="name">${e(c.displayName)}</p>${c.niche ? `<span class="niche">${e(c.niche)}</span>` : ''}</div></div>
      <h1>${e(c.headline)}</h1><p class="bio">${e(c.bio)}</p>${links}</div></header>`;
  }
  if (theme === 'elegant') {
    return `<header class="${cls}">${cover}<div class="wrap">${av}<p class="name">${e(c.displayName)}</p>
      ${c.niche ? `<span class="niche">${e(c.niche)}</span>` : ''}<div class="rule"></div>
      <h1>${e(c.headline)}</h1><p class="bio">${e(c.bio)}</p>${links}</div></header>`;
  }
  return `<header class="${cls}">${cover}<div class="wrap">${av}<p class="name">${e(c.displayName)}</p>
    ${c.niche ? `<span class="niche">${e(c.niche)}</span>` : ''}
    <h1>${e(c.headline)}</h1><p class="bio">${e(c.bio)}</p>${links}</div></header>`;
}

function faviconSvg(letters, accent) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${accent}"/><text x="32" y="41" font-family="Arial,sans-serif" font-size="26" font-weight="700" fill="#fff" text-anchor="middle">${letters}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// assetSrc: optional (id) => URL for the profile picture / cover. The editor's sandboxed preview
// passes data: URLs because it can't load images from the site.
export function renderStorefront(content, { handle = '', slug = '', baseUrl = '', mode = 'public', published = false, year = new Date().getFullYear(), assetSrc = null } = {}) {
  const src = assetSrc || ((assetId) => assetUrl(assetId, baseUrl));
  const c = content.creator;
  const theme = content.theme?.style in THEME_CSS ? content.theme.style : 'minimal';
  const accent = ACCENTS[content.theme?.accent] || ACCENTS.indigo;
  const lang = content.language === 'hi' ? 'hi' : 'en';
  const url = slug ? `${baseUrl}/s/${slug}` : '';
  const title = `${c.displayName} · ${c.headline}`;
  const desc = String(c.bio || '').replace(/\s+/g, ' ').slice(0, 158);
  const products = content.products || [];
  const coverAbs = baseUrl && mode !== 'preview' ? assetUrl(c.cover, baseUrl) : '';

  // "Start here" marks the cheapest paid offer, a fact about price, never a popularity claim.
  let entryId = null;
  if (products.length > 1) {
    const paid = products.filter((p) => Number(p.priceInr) > 0);
    if (paid.length > 1) entryId = paid.reduce((a, b) => (Number(b.priceInr) < Number(a.priceInr) ? b : a)).id;
  }

  const items = products.map((p, i) => productHtml(p, i, content, handle, theme, entryId, src)).join('');
  const quotes = visibleTestimonials(content);
  const tTitle = theme === 'bold' ? '<h2 class="section-title" id="t-h"><span>What people say</span></h2>' : '<h2 class="section-title" id="t-h">What people say</h2>';
  const testimonials = quotes.length
    ? `<section class="testimonials" aria-labelledby="t-h">${tTitle}<div class="tgrid">${quotes.map((t) => `<figure class="tcard"><blockquote>${e(t.quote)}</blockquote><figcaption><b>${e(t.name)}</b>${t.detail ? `<span>${e(t.detail)}</span>` : ''}</figcaption></figure>`).join('')}</div></section>`
    : '';
  const sectionTitle = theme === 'bold' ? '<h2 class="section-title"><span>What I offer</span></h2>' : '<h2 class="section-title">What I offer</h2>';
  const share = url
    ? `<div class="share"><button type="button" data-copy="${e(url)}">Copy store link</button>
        <a href="https://wa.me/?text=${encodeURIComponent(`${c.displayName}: ${c.headline} ${url}`)}" target="_blank" rel="noopener noreferrer">Share on WhatsApp</a></div>`
    : '';
  const banner = mode === 'preview'
    ? `<div class="preview-banner">${published ? 'Preview · saved edits appear on your live page within ~30s' : 'Preview · only you can see this until you publish'}</div>`
    : '';

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${e(title)}</title>
<meta name="description" content="${e(desc)}">
${url ? `<link rel="canonical" href="${e(url)}">` : ''}
<link rel="icon" href="${faviconSvg(e(initials(c.displayName)), accent)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${e(c.displayName)}">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(desc)}">
${url ? `<meta property="og:url" content="${e(url)}">` : ''}
<meta property="og:locale" content="${lang === 'hi' ? 'hi_IN' : 'en_IN'}">
${coverAbs ? `<meta property="og:image" content="${e(coverAbs)}">\n<meta property="og:image:width" content="1600">\n<meta property="og:image:height" content="600">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="${e(coverAbs)}">` : '<meta name="twitter:card" content="summary">'}
<meta name="twitter:title" content="${e(title)}">
<meta name="twitter:description" content="${e(desc)}">
<meta name="theme-color" content="${theme === 'bold' ? accent : theme === 'elegant' ? '#F6F1E9' : '#F6F7F9'}">
${mode === 'preview' ? '<meta name="robots" content="noindex">' : ''}
<style>:root{--accent:${accent};--accent-soft:${soft(accent, 0.12)}}${BASE_CSS}${THEME_CSS[theme]}</style>
</head>
<body class="t-${theme}" data-mode="${mode === 'preview' ? 'preview' : 'public'}" data-slug="${e(slug)}" data-theme="${theme}">
${banner}
${heroHtml(content, handle, theme, src)}
<main class="wrap" id="offers">
  ${sectionTitle}
  <section class="products${products.length === 1 ? ' one' : products.length === 3 ? ' three' : ''}" aria-label="Products">${items}</section>
  ${testimonials}
</main>
<footer>${share}<p>© ${year} ${e(c.displayName)}</p><small><a class="made" href="/">Made with Sell Sphere</a></small></footer>
${mode === 'preview' ? '' : '<script type="module" src="/assets/store.js"></script>'}
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
