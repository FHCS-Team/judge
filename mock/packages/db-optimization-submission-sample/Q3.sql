-- Query 3: Top 100 users by purchases (last 90 days)
-- Optimized version with proper indexing

SELECT e.user_id, u.signup_ts, count(*) AS purchases
FROM events e
INNER JOIN users u ON u.user_id = e.user_id
WHERE e.event_type = 'purchase'
  AND e.event_ts >= now() - interval '90 days'
GROUP BY e.user_id, u.signup_ts
ORDER BY purchases DESC
LIMIT 100;
