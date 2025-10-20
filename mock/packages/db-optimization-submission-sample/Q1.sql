-- Query 1: Event counts by type for Pro users (last 30 days)
-- Optimized version with proper indexing

SELECT e.event_type, count(*) as cnt
FROM events e
INNER JOIN users u ON u.user_id = e.user_id
WHERE e.event_ts >= now() - interval '30 days'
  AND u.plan = 'pro'
GROUP BY e.event_type
ORDER BY cnt DESC;
