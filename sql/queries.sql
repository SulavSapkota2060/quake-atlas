-- events and max magnitude per year
SELECT strftime('%Y', time) AS year, COUNT(*) AS n, MAX(mag) AS max_mag
FROM events GROUP BY year ORDER BY year;


-- magnitude histogram (0.1 steps)
SELECT ROUND(mag, 1) AS mag, COUNT(*) AS n FROM events GROUP BY ROUND(mag, 1) ORDER BY mag;

-- aftershocks within 30 days and about 1 degree (about 110km) of each M>=6 event
SELECT m.id, m.time, m.mag, m.place, COUNT(a.id) AS aftershocks_30d
FROM events m
LEFT JOIN events a 
    ON a.id != m.id AND a.mag >= 4.5
    AND a.time > m.time
    AND julianday(a.time) - julianday(m.time) <=30
    AND ABS(a.latitude - m.latitude) < 1 AND ABS(a.longitude - m.longitude) < 1
WHERE m.mag >= 6.0
    AND julianday((SELECT MAX(time) FROM events)) - julianday(m.time) >= 30
GROUP BY m.id ORDER BY m.mag DESC;

-- 12-MONTH ROLLING COUNT, LAST 24 MONTHS

WITH monthly AS(
    SELECT strftime('%Y-%m', time) AS ym, COUNT(*) AS n FROM events GROUP BY ym
)
SELECT ym, SUM(n) OVER (ORDER BY ym ROWS BETWEEN 11 PRECEDING AND CURRENT ROW) AS rolling_12m
FROM monthly ORDER BY ym DESC LIMIT 24;

-- shallow (<=70 km) vs deep events by region
SELECT region, SUM(depth_km <= 70) AS shallow, SUM(depth_km > 70) AS deep, COUNT(*) AS total
FROM events GROUP BY region;
