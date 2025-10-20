-- Query 2: Distinct device types for Vietnamese users with flag (last 7 days)
-- Optimized version with proper indexing and join order

SELECT DISTINCT d.device_type
FROM users u
INNER JOIN events e ON e.user_id = u.user_id
INNER JOIN devices d ON d.device_id = e.device_id
WHERE u.country = 'VN'
  AND (e.payload->>'flag') = 'true'
  AND e.event_ts BETWEEN now() - interval '7 days' AND now();
