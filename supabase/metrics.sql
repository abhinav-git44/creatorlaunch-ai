-- Sell Sphere: activation reporting (read-only). Run in the Supabase SQL editor.
-- Definitions match lib/metrics.js and DECISION_DOC.md §6. Real traffic only, nothing seeded.
-- Change the window in the first CTE.

with params as (select now() - interval '30 days' as since),
starts as (                       -- eligible new creators = sessions that started onboarding
  select session_id, min(created_at) as started_at
  from events, params
  where name = 'onboarding_started' and session_id is not null and created_at >= params.since
  group by session_id
),
pub_same_session as (            -- published in the same session
  select distinct e.session_id
  from events e join starts s on s.session_id = e.session_id
  where e.name = 'store_published'
),
first_pub as (                   -- first publish of a store created in that onboarding session
  select coalesce(e.meta->>'onboardingSession', e.session_id) as origin, min(e.created_at) as published_at
  from events e
  where e.name = 'store_published' and coalesce((e.meta->>'republish')::boolean, false) = false
  group by 1
),
gens as (
  select count(*) filter (where name = 'generation_completed') as ok,
         count(*) filter (where name = 'generation_failed') as failed
  from events, params
  where name in ('generation_completed', 'generation_failed') and meta->>'kind' = 'storefront' and created_at >= params.since
),
edits as (
  select sum((meta->>'aiSuggested')::int) as suggested, sum((meta->>'aiEdited')::int) as edited
  from events, params
  where name = 'store_published' and coalesce((meta->>'republish')::boolean, false) = false and created_at >= params.since
)
select
  (select count(*) from starts)                                                         as onboarding_starts,
  round(100.0 * (select count(*) from pub_same_session) / nullif((select count(*) from starts), 0), 1) as first_session_publish_rate_pct,
  (select round((percentile_cont(0.5) within group (order by extract(epoch from f.published_at - s.started_at) / 60))::numeric, 1)
     from first_pub f join starts s on s.session_id = f.origin)                       as median_minutes_to_first_publish,
  (select round(100.0 * ok / nullif(ok + failed, 0), 1) from gens)                      as generation_success_rate_pct,
  (select round(100.0 * edited / nullif(suggested, 0), 1) from edits)                   as ai_material_edit_rate_pct,
  (select count(*) from events, params where name = 'storefront_viewed' and created_at >= params.since)   as storefront_views,
  (select count(*) from events, params where name = 'product_cta_clicked' and created_at >= params.since) as product_cta_clicks;
