// Renders a storefront to a full HTML document. Used by the server for the public page
// (/s/:slug) and by the editor for its live preview, so preview and published page match.
import { escapeHtml as e, formatInr, FORMATS, ACCENTS } from './shared.js';

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const s = (parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
  return (s || '★').toUpperCase();
}

const THEME_CSS = {
  minimal: `
    body{background:#F7F7F8;color:#16161A;font-family:var(--sans)}
    .hero{padding:40px 20px 8px;text-align:center}
    .avatar{background:var(--accent);color:#fff}
    .niche{background:var(--accent-soft);color:var(--accent)}
    h1{font-size:26px;line-height:1.2;font-weight:700;letter-spacing:-.01em}
    .card{background:#fff;border:1px solid #E7E7EB;border-radius:16px}
    .btn{background:var(--accent);color:#fff;border-radius:12px}
    .price{color:#16161A}`,
  bold: `
    body{background:#FFFFFF;color:#111;font-family:var(--sans)}
    .hero{background:var(--accent);color:#fff;padding:44px 20px 36px;text-align:left;border-radius:0 0 28px 28px}
    .hero .bio,.hero .handle{color:rgba(255,255,255,.88)}
    .avatar{background:#fff;color:var(--accent)}
    .niche{background:rgba(255,255,255,.18);color:#fff}
    h1{font-size:31px;line-height:1.12;font-weight:800;letter-spacing:-.02em}
    .section-title{font-weight:800}
    .card{background:#fff;border:2px solid #111;border-radius:20px;box-shadow:5px 5px 0 #111}
    .btn{background:#111;color:#fff;border-radius:14px;font-weight:800}
    .format{background:var(--accent);color:#fff}
    .price{color:var(--accent);font-weight:800}`,
  elegant: `
    body{background:#F6F1E9;color:#2A2420;font-family:var(--sans)}
    h1,h2,h3,.price,.name{font-family:var(--serif)}
    .hero{padding:52px 24px 12px;text-align:center}
    .avatar{background:transparent;color:var(--accent);border:1.5px solid var(--accent)}
    .niche{background:transparent;color:var(--accent);border:1px solid currentColor;text-transform:uppercase;letter-spacing:.14em;font-size:11px}
    h1{font-size:28px;line-height:1.25;font-weight:500}
    .card{background:#FFFDF9;border:1px solid #E4D9C8;border-radius:6px}
    .btn{background:transparent;color:var(--accent);border:1.5px solid var(--accent);border-radius:999px}
    .btn:hover{background:var(--accent);color:#fff}
    .format{background:transparent;color:#8A7B6A;padding-left:0;text-transform:uppercase;letter-spacing:.12em;font-size:11px}
    .price{font-weight:500}`,
};

const BASE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  :root{--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans","Noto Sans Devanagari",Helvetica,Arial,sans-serif;
        --serif:Georgia,"Times New Roman","Noto Serif Devanagari",serif}
  html{-webkit-text-size-adjust:100%}
  body{min-height:100vh;line-height:1.55;font-size:16px}
  .wrap{max-width:560px;margin:0 auto}
  .avatar{width:76px;height:76px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;margin-bottom:14px}
  .name{font-size:17px;font-weight:600;margin-bottom:6px}
  .niche{display:inline-block;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;margin-bottom:14px}
  .bio{margin-top:12px;font-size:15.5px;opacity:.92;white-space:pre-line}
  .handle{display:inline-block;margin-top:12px;font-size:14px;color:inherit;opacity:.8}
  .section-title{font-size:13px;text-transform:uppercase;letter-spacing:.12em;opacity:.6;margin:28px 20px 12px}
  .products{display:grid;gap:16px;padding:0 16px}
  .card{padding:20px}
  .format{display:inline-block;font-size:12px;font-weight:600;padding:3px 9px;border-radius:999px;background:rgba(0,0,0,.06);margin-bottom:10px}
  .card h3{font-size:19px;line-height:1.3;margin-bottom:6px}
  .short{font-size:15px;opacity:.85}
  .benefits{list-style:none;margin:14px 0 4px;display:grid;gap:7px}
  .benefits li{font-size:14.5px;padding-left:24px;position:relative}
  .benefits li:before{content:"";position:absolute;left:3px;top:6px;width:11px;height:6px;border-left:2px solid var(--accent);border-bottom:2px solid var(--accent);transform:rotate(-45deg)}
  details{margin-top:10px;font-size:14.5px}
  summary{cursor:pointer;font-weight:600;font-size:14px;color:var(--accent);padding:6px 0;list-style:none}
  summary::-webkit-details-marker{display:none}
  summary:after{content:" ↓"}
  details[open] summary:after{content:" ↑"}
  details p{opacity:.85;white-space:pre-line;padding-top:4px}
  .buy{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px}
  .price{font-size:24px;font-weight:700;white-space:nowrap}
  .btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;font-size:15.5px;font-weight:700;border:0;cursor:pointer;text-decoration:none;font-family:inherit;transition:transform .1s}
  .btn:active{transform:scale(.98)}
  .note{display:none;margin-top:12px;font-size:13.5px;padding:10px 12px;border-radius:10px;background:var(--accent-soft)}
  .note.show{display:block}
  .note a{color:var(--accent);font-weight:600}
  footer{text-align:center;padding:36px 20px 44px;font-size:13px;opacity:.75}
  .share{display:flex;gap:10px;justify-content:center;margin-bottom:18px;flex-wrap:wrap}
  .share a,.share button{font:inherit;font-size:14px;font-weight:600;padding:10px 16px;border-radius:999px;border:1px solid rgba(0,0,0,.15);background:rgba(255,255,255,.7);color:inherit;text-decoration:none;cursor:pointer}
  .preview-banner{position:sticky;top:0;z-index:5;background:#16161A;color:#fff;font-size:13px;text-align:center;padding:8px 12px}
  :focus-visible{outline:3px solid var(--accent);outline-offset:2px}
  @media (min-width:700px){.hero{padding-top:64px}.products{padding:0}}
`;

function hexToSoft(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
  return `rgba(${r},${g},${b},.12)`;
}

export function renderStorefront(content, { handle = '', slug = '', baseUrl = '', mode = 'public', published = false } = {}) {
  const c = content.creator;
  const theme = content.theme?.style in THEME_CSS ? content.theme.style : 'minimal';
  const accent = ACCENTS[content.theme?.accent] || ACCENTS.indigo;
  const lang = content.language === 'hi' ? 'hi' : 'en';
  const url = slug ? `${baseUrl}/s/${slug}` : '';
  const title = `${c.displayName} · ${c.headline}`;
  const desc = String(c.bio || '').slice(0, 160);

  const products = content.products.map((p) => {
    const benefits = (p.benefits || []).map((b) => `<li>${e(b)}</li>`).join('');
    const dm = handle
      ? `Checkout isn't connected in this preview store yet. To buy, message <a href="https://instagram.com/${e(handle)}" target="_blank" rel="noopener">@${e(handle)}</a> on Instagram.`
      : 'Checkout isn\'t connected in this preview store yet. Payments would be added when the creator goes live on SuperProfile.';
    return `
    <article class="card" id="p-${e(p.id)}">
      <span class="format">${e(FORMATS[p.format]?.label || p.format)}</span>
      <h3>${e(p.title)}</h3>
      <p class="short">${e(p.shortDescription)}</p>
      ${benefits ? `<ul class="benefits">${benefits}</ul>` : ''}
      ${p.description ? `<details><summary>What's inside</summary><p>${e(p.description)}</p></details>` : ''}
      <div class="buy">
        <span class="price">${e(formatInr(p.priceInr, p.format))}</span>
        <button class="btn" type="button" data-buy="${e(p.id)}">${e(p.ctaLabel || 'Get it now')}</button>
      </div>
      <p class="note" id="note-${e(p.id)}" role="status">${dm}</p>
    </article>`;
  }).join('');

  const share = url
    ? `<div class="share">
        <button type="button" data-copy="${e(url)}">Copy link</button>
        <a href="https://wa.me/?text=${encodeURIComponent(`${c.displayName}: ${c.headline} ${url}`)}" target="_blank" rel="noopener">Share on WhatsApp</a>
      </div>`
    : '';

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${e(title)}</title>
<meta name="description" content="${e(desc)}">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(desc)}">
${url ? `<meta property="og:url" content="${e(url)}">` : ''}
<meta property="og:type" content="website">
<meta name="theme-color" content="${accent}">
${mode === 'preview' ? '<meta name="robots" content="noindex">' : ''}
<style>:root{--accent:${accent};--accent-soft:${hexToSoft(accent)}}${BASE_CSS}${THEME_CSS[theme]}</style>
</head>
<body>
${mode === 'preview' ? `<div class="preview-banner">${published ? 'Preview · saved edits appear on your live page within ~30s' : 'Preview · only you can see this until you publish'}</div>` : ''}
<main class="wrap">
  <header class="hero">
    <div class="avatar" aria-hidden="true">${e(initials(c.displayName))}</div>
    <p class="name">${e(c.displayName)}</p>
    ${c.niche ? `<span class="niche">${e(c.niche)}</span>` : ''}
    <h1>${e(c.headline)}</h1>
    <p class="bio">${e(c.bio)}</p>
    ${handle ? `<a class="handle" href="https://instagram.com/${e(handle)}" target="_blank" rel="noopener">@${e(handle)} on Instagram</a>` : ''}
  </header>
  <h2 class="section-title">What I offer</h2>
  <section class="products">${products}</section>
  <footer>${share}<p>Built with CreatorLaunch AI</p></footer>
</main>
<script>
document.addEventListener('click', function (ev) {
  var b = ev.target.closest('[data-buy]');
  if (b) { var n = document.getElementById('note-' + b.getAttribute('data-buy')); if (n) n.classList.toggle('show'); return; }
  var c = ev.target.closest('[data-copy]');
  if (c) {
    var u = c.getAttribute('data-copy');
    if (navigator.share && /Mobi/i.test(navigator.userAgent)) { navigator.share({ url: u }).catch(function () {}); return; }
    (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { c.textContent = 'Link copied'; }, function () { prompt('Copy this link', u); });
  }
});
</script>
</body>
</html>`;
}

export function renderNotFound(message = 'This store isn\'t live right now.') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Store not found</title><meta name="robots" content="noindex">
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#F7F7F8;color:#16161A;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}
.box{max-width:380px}h1{font-size:22px;margin:0 0 8px}p{color:#5b5b66;margin:0 0 20px;line-height:1.5}a{display:inline-block;background:#5B4BDB;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600}</style></head>
<body><div class="box"><h1>${e(message)}</h1><p>The link may be mistyped, or the creator may have taken their store offline.</p><a href="/">Build your own store</a></div></body></html>`;
}
