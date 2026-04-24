-- =====================================================================
-- AMI 2.0 - End-to-end validation tests
-- =====================================================================

USE DATABASE AMI_DEMO;
USE WAREHOUSE AMI_QUERY_WH;

-- T1. Dimension counts
SELECT 'T1_DIMS' AS test,
  (SELECT COUNT(*) FROM AMI_CURATED.SUBSTATION)    AS substations,
  (SELECT COUNT(*) FROM AMI_CURATED.FEEDER)        AS feeders,
  (SELECT COUNT(*) FROM AMI_CURATED.TRANSFORMER)   AS transformers,
  (SELECT COUNT(*) FROM AMI_CURATED.SERVICE_POINT) AS service_points,
  (SELECT COUNT(*) FROM AMI_CURATED.METER)         AS meters,
  (SELECT COUNT(*) FROM AMI_CURATED.CUSTOMER)      AS customers,
  (SELECT COUNT(*) FROM AMI_CURATED.TIME_DIM)      AS time_dim_rows,
  (SELECT COUNT(*) FROM AMI_CURATED.BILLING_PERIOD) AS billing_periods;
-- Expected: 50 / 2000 / 20000 / 100000 / 100000 / ~94K / ~35K / ~1.1M

-- T2. Interval row count
SELECT 'T2_INTERVAL' AS test, COUNT(*) AS interval_rows,
       (COUNT(*) / 3504000000.0 * 100)::NUMBER(5,2) AS pct_of_target
FROM AMI_CURATED.INTERVAL_READ_15MIN;
-- Expected: ~3.5B, >= 99%

-- T3. VEE distribution
SELECT 'T3_VEE' AS test, VEE_STATUS, COUNT(*) AS rows,
       (COUNT(*) / SUM(COUNT(*)) OVER () * 100)::NUMBER(5,2) AS pct
FROM AMI_CURATED.INTERVAL_READ_15MIN
GROUP BY VEE_STATUS;
-- Expected: VALID ~97%, ESTIMATED ~2%, FAILED ~1%

-- T4. Rollup row counts
SELECT 'T4_ROLLUPS' AS test,
  (SELECT COUNT(*) FROM AMI_CURATED.DT_HOURLY_ROLLUP)  AS hourly,
  (SELECT COUNT(*) FROM AMI_CURATED.DT_DAILY_ROLLUP)   AS daily,
  (SELECT COUNT(*) FROM AMI_CURATED.DT_MONTHLY_ROLLUP) AS monthly;
-- Expected: ~876M / ~36.5M / ~1.3M

-- T5. TOU charge sanity for a TOU3 meter / summer weekday
SELECT 'T5_TOU' AS test, TOU_BUCKET, COUNT(*) AS intervals,
       SUM(KWH)::NUMBER(10,2) AS kwh,
       SUM(ENERGY_CHARGE)::NUMBER(10,4) AS energy_charge,
       (SUM(ENERGY_CHARGE) / NULLIF(SUM(KWH),0))::NUMBER(7,5) AS implied_rate
FROM AMI_MART.DT_INTERVAL_CHARGE_LINE
WHERE RATE_PLAN_ID = 'RP-TOU3' AND READ_TS >= '2025-07-15' AND READ_TS < '2025-07-16'
GROUP BY TOU_BUCKET;
-- Expected: implied_rate ~0.08 off-peak, ~0.14 shoulder, ~0.28 on-peak

-- T6. Billing reconciliation
SELECT 'T6_BILLING' AS test,
  COUNT(*) AS total_periods,
  COUNT_IF(IS_BILLING_READY) AS ready,
  (COUNT_IF(IS_BILLING_READY) / COUNT(*) * 100)::NUMBER(5,2) AS pct_ready
FROM AMI_MART.DT_BILLING_PERIOD_CONSUMPTION;

-- T7. SLA + DQ dashboard spot check
SELECT 'T7_OBSERVABILITY' AS test, DATE_KEY, UTILITY_TERRITORY,
       PCT_ARRIVED_WITHIN_15MIN, VEE_PASS_RATE, COMPLETENESS_PCT
FROM AMI_OBSERVABILITY.V_AMI_OBSERVABILITY_DASHBOARD
WHERE DATE_KEY = DATEADD(day,-1,CURRENT_DATE())
ORDER BY UTILITY_TERRITORY;

-- T8. Anomaly model output
SELECT 'T8_ANOMALIES' AS test,
  COUNT(*) AS scored_rows,
  COUNT_IF(IS_ANOMALY) AS anomalies,
  AVG(DISTANCE)::NUMBER(6,3) AS avg_distance,
  MAX(DISTANCE)::NUMBER(6,3) AS max_distance
FROM AMI_MART.AMI_ANOMALY_EVENTS;

-- T9. Streaming blueprint
SELECT 'T9_STREAMING' AS test,
  (SELECT COUNT(*) FROM AMI_RAW.INTERVAL_READ_15MIN_RAW) AS raw_rows,
  (SELECT COUNT(*) FROM AMI_CURATED.DT_NEW_READS_NORMALIZED) AS dt_rows;
