import { escapeHtml as e } from './shared.js';

const $ = (s) => document.querySelector(s);
try { $('#tok').value = sessionStorage.getItem('cl_admin') || ''; } catch { /* ignore */ }

const LABELS = {
  firstSessionPublishRatePct: ['First-session publishing rate', '%', 'Primary: sessions that published ÷ sessions that started onboarding'],
  medianMinutesToFirstPublish: ['Median time to first published store', ' min', 'From onboarding start to first publish'],
  storeCreationRatePct: ['Store creation rate', '%', 'Sessions that saved a draft ÷ onboarding starts'],
  generationSuccessRatePct: ['AI generation success rate', '%', 'Successful storefront generations ÷ attempts'],
  aiMaterialEditRatePct: ['AI products materially edited before publish', '%', 'Quality signal: lower is better'],
  regenerationsPerStore: ['Regenerations per store', '', ''],
  ctaClicksPerView: ['Product CTA clicks per storefront view', '', ''],
};

$('#f').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('#err').hidden = true;
  const tok = $('#tok').value.trim();
  try { sessionStorage.setItem('cl_admin', tok); } catch { /* ignore */ }
  const res = await fetch(`/api/metrics?days=${$('#days').value}`, { headers: { 'x-admin-token': tok } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { $('#err').textContent = data?.error?.message || 'Could not load metrics.'; $('#err').hidden = false; return; }
  const rows = Object.entries(LABELS).map(([k, [label, unit, hint]]) => {
    const v = data.rates[k];
    return `<tr><td><b>${e(label)}</b>${hint ? `<div class="hint">${e(hint)}</div>` : ''}</td><td style="text-align:right;white-space:nowrap">${v === null ? '–' : e(v) + unit}</td></tr>`;
  }).join('');
  const counts = Object.entries(data.counts).filter(([, v]) => typeof v === 'number').map(([k, v]) => `<tr><td>${e(k.replace(/([A-Z])/g, ' $1').toLowerCase())}</td><td style="text-align:right">${e(v)}</td></tr>`).join('');
  $('#out').innerHTML = `<div class="card-head"><h2>${e(new Date(data.window.from).toLocaleDateString())} – ${e(new Date(data.window.to).toLocaleDateString())}</h2></div>
    <p class="hint">${e(data.dataSource)}</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0" class="metrics">${rows}</table>
    <details><summary class="label">Raw counts</summary><table style="width:100%">${counts}</table></details>
    <p class="hint">14-day first-sale rate: ${e(data.notCalculated.fourteenDayFirstSaleRate)}</p>`;
  $('#out').hidden = false;
});
