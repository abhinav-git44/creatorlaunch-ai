// "Choose Your Storefront Template": the template gallery, used on the home page (pick a template
// before generating) and in the editor (switch at any time). One component, two places.
// Preview renders a real storefront with the same renderer as the live page: the creator's own
// content in the editor, a clearly labelled fictional example on the home page.
import { TEMPLATES, TEMPLATE_IDS, TEMPLATE_CATEGORIES, matchesFilter, applyTemplate } from './templates.js';
import { escapeHtml as e } from './shared.js';
import { renderStorefront } from './render.js';
import { openSheet } from './ui.js';

export const thumbUrl = (id) => `/templates/${id}.jpg`;

export function galleryHtml({ current = '', prefix = 'g' } = {}) {
  const filters = Object.entries(TEMPLATE_CATEGORIES).map(([k, label]) => `<button type="button" class="chip" data-gfilter="${k}" aria-pressed="${k === 'all'}">${e(label)}</button>`).join('');
  const cards = TEMPLATE_IDS.map((id) => {
    const t = TEMPLATES[id];
    const inUse = id === current;
    return `<article class="tpl-card${inUse ? ' current' : ''}" data-tid="${id}" aria-labelledby="${prefix}-${id}-h">
      <div class="tpl-thumb"><img src="${thumbUrl(id)}" alt="Preview of the ${e(t.name)} template" width="390" height="520" loading="lazy" decoding="async"><span class="tpl-free">Free</span>${inUse ? '<span class="tpl-inuse">In use</span>' : ''}</div>
      <div class="tpl-body">
        <h3 id="${prefix}-${id}-h">${e(t.name)}</h3>
        <p class="tpl-for">For ${e(t.audience.charAt(0).toLowerCase() + t.audience.slice(1))}</p>
        <p class="tpl-desc">${e(t.description)}</p>
        <div class="tpl-cats">${t.categories.map((c) => `<span>${e(TEMPLATE_CATEGORIES[c])}</span>`).join('')}</div>
        <div class="tpl-actions">
          <button type="button" class="btn btn-secondary" data-gaction="preview">Preview</button>
          <button type="button" class="btn btn-primary" data-gaction="use" ${inUse ? 'disabled' : ''}>${inUse ? 'In use' : 'Use template'}</button>
        </div>
      </div>
    </article>`;
  }).join('');
  return `<div class="tpl-gallery" data-gallery>
    <div class="tpl-tools">
      <div class="tpl-filters" role="group" aria-label="Filter templates">${filters}</div>
      <label class="tpl-search"><span class="sr-only">Search templates</span>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input type="search" data-gsearch placeholder="Search, e.g. yoga, coach, artist" autocomplete="off" enterkeyhint="search"></label>
    </div>
    <p class="tpl-count" data-gcount aria-live="polite">10 templates, all free</p>
    <div class="tpl-grid">${cards}</div>
    <p class="tpl-empty" data-gempty hidden>No template matches that. Try another word, or <button type="button" class="linklike" data-gclear>show all 10</button>.</p>
  </div>`;
}

// Wire up a rendered gallery. onUse(id) applies the template; previewContent(id) returns the
// content to preview (with theme already set to that template); assetSrc maps image ids to URLs.
export function mountGallery(root, { onUse, previewContent, assetSrc, useLabel = 'Use this template' }) {
  const state = { category: 'all', query: '' };
  const apply = () => {
    let n = 0;
    root.querySelectorAll('[data-tid]').forEach((card) => {
      const ok = matchesFilter(card.dataset.tid, state);
      card.hidden = !ok;
      if (ok) n += 1;
    });
    root.querySelector('[data-gempty]').hidden = n > 0;
    root.querySelector('[data-gcount]').textContent = n === TEMPLATE_IDS.length ? '10 templates, all free' : `${n} of 10 templates`;
  };
  root.addEventListener('click', (ev) => {
    const f = ev.target.closest('[data-gfilter]');
    if (f) {
      state.category = f.dataset.gfilter;
      root.querySelectorAll('[data-gfilter]').forEach((b) => b.setAttribute('aria-pressed', String(b === f)));
      apply();
      return;
    }
    if (ev.target.closest('[data-gclear]')) {
      state.category = 'all'; state.query = '';
      root.querySelector('[data-gsearch]').value = '';
      root.querySelectorAll('[data-gfilter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.gfilter === 'all')));
      apply();
      return;
    }
    const action = ev.target.closest('[data-gaction]')?.dataset.gaction;
    const id = ev.target.closest('[data-tid]')?.dataset.tid;
    if (!action || !id) return;
    if (action === 'use') onUse(id);
    if (action === 'preview') openTemplatePreview(id, { content: previewContent(id), assetSrc, onUse, useLabel, inUse: ev.target.closest('.tpl-card')?.classList.contains('current') });
  });
  root.querySelector('[data-gsearch]').addEventListener('input', (ev) => { state.query = ev.target.value; apply(); });
  apply();
}

// Full preview of one template in a sheet, phone or desktop width, with "Use this template".
export function openTemplatePreview(id, { content, assetSrc, onUse, useLabel, inUse = false, note = '' }) {
  const t = TEMPLATES[id];
  let device = 'phone';
  return openSheet((sheet, close) => {
    sheet.classList.add('sheet-wide');
    sheet.setAttribute('aria-label', `${t.name} template preview`);
    sheet.innerHTML = `<div class="tpv-head"><div><h3>${e(t.name)} <span class="tpl-free inline">Free</span></h3><p class="sub">For ${e(t.audience.charAt(0).toLowerCase() + t.audience.slice(1))}.${note ? ` ${e(note)}` : ''}</p></div>
      <div class="segmented tpv-device" role="group" aria-label="Preview size"><button type="button" data-dev="phone" aria-pressed="true">Phone</button><button type="button" data-dev="desktop" aria-pressed="false">Desktop</button></div></div>
      <div class="tpv-stage tpv-phone"><iframe title="${e(t.name)} template preview" sandbox="allow-popups"></iframe></div>
      <div class="sheet-actions"><button type="button" class="btn btn-secondary" data-close>Close</button><button type="button" class="btn btn-primary" data-use ${inUse ? 'disabled' : ''}>${inUse ? 'Already in use' : e(useLabel)}</button></div>`;
    const frame = sheet.querySelector('iframe');
    const stage = sheet.querySelector('.tpv-stage');
    const draw = () => {
      frame.srcdoc = renderStorefront(content, { mode: 'preview', assetSrc: assetSrc || (() => '') });
    };
    const fit = () => {
      if (device !== 'desktop') { frame.style.transform = ''; frame.style.width = ''; frame.style.height = ''; return; }
      const scale = Math.min(1, stage.clientWidth / 1200);
      frame.style.width = '1200px';
      frame.style.height = `${stage.clientHeight / scale}px`;
      frame.style.transform = `scale(${scale})`;
    };
    sheet.querySelector('.tpv-device').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-dev]');
      if (!b) return;
      device = b.dataset.dev;
      sheet.querySelectorAll('[data-dev]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      stage.className = `tpv-stage tpv-${device}`;
      fit();
    });
    sheet.querySelector('[data-close]').onclick = close;
    sheet.querySelector('[data-use]').onclick = () => { close(); onUse(id); };
    window.addEventListener('resize', fit, { passive: true });
    draw();
    requestAnimationFrame(fit);
    // Images may arrive after the first draw (they're converted to data: URLs for the sandbox).
    sheet.redraw = draw;
  });
}

// Sandboxed previews can't load images from the site, so convert them to data: URLs once.
const dataUrls = new Map();
export function dataUrlFor(url, onReady) {
  if (!url) return '';
  const hit = dataUrls.get(url);
  if (typeof hit === 'string') return hit;
  if (!hit) {
    dataUrls.set(url, fetch(url).then((r) => (r.ok ? r.blob() : null)).then((b) => b && new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.readAsDataURL(b);
    })).then((d) => { if (d) { dataUrls.set(url, d); onReady?.(); } else dataUrls.delete(url); }).catch(() => dataUrls.delete(url)));
  }
  return '';
}

export { applyTemplate };
