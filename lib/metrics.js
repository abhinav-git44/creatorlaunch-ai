// Turns raw events into the activation funnel described in DECISION_DOC.md §6.
// Pure function (easy to test); /api/metrics feeds it events from the database.
//
// Definitions
// - Session: anonymous browser session id; a new id starts after 30 minutes of inactivity
//   (public/assets/analytics.js). Events without a session (API calls, eval scripts) are
//   excluded from funnel metrics.
// - Eligible new creator: a session with an `onboarding_started` event in the window.
// - First-session publishing rate = sessions in which the creator published at least one store
//   (store_published with the same session id) / eligible sessions.
// - Time to first published store = for each onboarding session, the time from its
//   onboarding_started to the first store_published of a store created in that session
//   (may happen in a later session, via meta.onboardingSession). Median reported.
// - Material-edit rate = AI-suggested products materially edited before publish / all
//   AI-suggested products in first publishes (see shared.js materialEdits for the rule).

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

export function computeMetrics(events, { from, to } = {}) {
  const byName = (n) => events.filter((e) => e.name === n);
  const ts = (e) => new Date(e.created_at).getTime();

  const starts = new Map(); // session -> first onboarding_started time
  for (const e of byName('onboarding_started')) {
    if (!e.session_id) continue;
    const t = ts(e);
    if (!starts.has(e.session_id) || t < starts.get(e.session_id)) starts.set(e.session_id, t);
  }
  const eligible = new Set(starts.keys());

  const sessionsWith = (name) => new Set(byName(name).filter((e) => e.session_id && eligible.has(e.session_id)).map((e) => e.session_id));
  const submitted = sessionsWith('creator_input_submitted');
  const created = sessionsWith('store_created');
  const publishedSameSession = sessionsWith('store_published');

  const firstPublishByOnboarding = new Map();
  for (const e of byName('store_published')) {
    const origin = e.meta?.onboardingSession || e.session_id;
    if (!origin || !starts.has(origin) || e.meta?.republish) continue;
    const t = ts(e);
    if (!firstPublishByOnboarding.has(origin) || t < firstPublishByOnboarding.get(origin)) firstPublishByOnboarding.set(origin, t);
  }
  const minutesToPublish = [...firstPublishByOnboarding].map(([s, t]) => (t - starts.get(s)) / 60000).filter((m) => m >= 0);

  const gens = byName('generation_completed').filter((e) => e.meta?.kind === 'storefront');
  const genFails = byName('generation_failed').filter((e) => e.meta?.kind === 'storefront');
  const regenerations = byName('product_regenerated').length + byName('store_regenerated').length;
  const storesCreated = byName('store_created').length;

  let suggested = 0; let edited = 0;
  for (const e of byName('store_published')) {
    if (e.meta?.republish) continue;
    suggested += Number(e.meta?.aiSuggested) || 0;
    edited += Number(e.meta?.aiEdited) || 0;
  }

  const ctaByDest = {};
  for (const e of byName('product_cta_clicked')) {
    const d = e.meta?.destination || 'unknown';
    ctaByDest[d] = (ctaByDest[d] || 0) + 1;
  }

  return {
    window: { from, to },
    dataSource: 'Live events table. Real traffic only: no demo or seeded data. Sessions without an anonymous session id (API scripts, evals) are excluded from funnel rates.',
    counts: {
      onboardingStarts: eligible.size,
      inputsSubmitted: submitted.size,
      generationAttempts: gens.length + genFails.length,
      generationSuccesses: gens.length,
      clarificationsRequested: byName('clarification_requested').length,
      storesCreated,
      firstPublishes: byName('store_published').filter((e) => !e.meta?.republish).length,
      regenerations,
      storefrontViews: byName('storefront_viewed').length,
      productCtaClicks: byName('product_cta_clicked').length,
      ctaClicksByDestination: ctaByDest,
    },
    rates: {
      generationSuccessRatePct: pct(gens.length, gens.length + genFails.length),
      storeCreationRatePct: pct(created.size, eligible.size),
      firstSessionPublishRatePct: pct(publishedSameSession.size, eligible.size),
      medianMinutesToFirstPublish: minutesToPublish.length ? Math.round(median(minutesToPublish) * 10) / 10 : null,
      regenerationsPerStore: storesCreated ? Math.round((regenerations / storesCreated) * 100) / 100 : null,
      aiMaterialEditRatePct: pct(edited, suggested),
      ctaClicksPerView: byName('storefront_viewed').length ? Math.round((byName('product_cta_clicked').length / byName('storefront_viewed').length) * 1000) / 1000 : null,
    },
    notCalculated: {
      fourteenDayFirstSaleRate: 'Needs order/payment data. This prototype has no checkout, so it is not calculated.',
    },
  };
}
