-- Edge Cases tab — demo seed tables
-- Created once per environment. The 4-section Edge Cases page reads these.

-- 1. Duplicate audit table — synthesised but realistic. Each row represents a
--    duplicate (METER_ID, READ_TS) where two payloads were received minutes apart
--    with slightly different values. The canonical DT's MERGE on PK
--    (METER_ID, CHANNEL_ID, READ_TS) applies last-write-wins, keeping VALUE_SECOND.
CREATE OR REPLACE TABLE AMI_DEMO.AMI_OBSERVABILITY.DT_DUPLICATE_AUDIT AS
WITH ranked AS (
  SELECT METER_ID, READ_TS, VALUE, INGESTED_AT, CHANNEL_CODE, UTILITY_TERRITORY,
    ROW_NUMBER() OVER (ORDER BY HASH(METER_ID, READ_TS)) AS RN
  FROM AMI_DEMO.AMI_CURATED.INTERVAL_READ_CHANNEL
  WHERE CHANNEL_CODE = 'KWH_DEL'
    AND READ_TS >= DATEADD(day, -2, (SELECT MAX(READ_TS) FROM AMI_DEMO.AMI_CURATED.INTERVAL_READ_CHANNEL))
)
SELECT
  RN AS DUPLICATE_ID,
  METER_ID,
  UTILITY_TERRITORY,
  READ_TS,
  VALUE                                                      AS VALUE_FIRST,
  ROUND(VALUE * (1 + (UNIFORM(-15, 15, RANDOM()) / 100.0)), 4) AS VALUE_SECOND,
  INGESTED_AT                                                AS RECEIVED_FIRST,
  DATEADD(minute, UNIFORM(5, 240, RANDOM()), INGESTED_AT)   AS RECEIVED_SECOND,
  'last-write-wins (kept VALUE_SECOND)'                      AS RESOLUTION,
  CHANNEL_CODE
FROM ranked
WHERE RN <= 200;

-- 2. Meter ↔ premise mismatch audit. Computes hourly load shape per meter
--    over the last 7 days and classifies each meter (RES/SMB/CNI) by load
--    pattern. Rows where the suggested type disagrees with the assigned
--    METER_TYPE are flagged for review with a confidence score (load-shape
--    divergence). 50 sampled mismatches.
CREATE OR REPLACE TABLE AMI_DEMO.AMI_OBSERVABILITY.DT_METER_PREMISE_MISMATCH AS
WITH
  cur AS (SELECT MAX(READ_TS) AS m FROM AMI_DEMO.AMI_CURATED.INTERVAL_READ_CHANNEL),
  sampled AS (
    SELECT METER_ID, METER_TYPE FROM AMI_DEMO.AMI_CURATED.METER TABLESAMPLE (5000 ROWS)
  ),
  shape AS (
    SELECT
      i.METER_ID,
      s.METER_TYPE,
      AVG(IFF(HOUR(i.READ_TS) BETWEEN 17 AND 21, i.VALUE, NULL)) AS EVE,
      AVG(IFF(HOUR(i.READ_TS) BETWEEN 9 AND 16,  i.VALUE, NULL)) AS DAY,
      AVG(IFF(HOUR(i.READ_TS) BETWEEN 0 AND 5,   i.VALUE, NULL)) AS NIGHT,
      AVG(i.VALUE) AS OVERALL
    FROM AMI_DEMO.AMI_CURATED.INTERVAL_READ_CHANNEL i
    JOIN sampled s USING (METER_ID)
    JOIN cur ON 1=1
    WHERE i.CHANNEL_CODE = 'KWH_DEL'
      AND i.READ_TS >= DATEADD(day, -7, cur.m)
    GROUP BY 1, 2
  ),
  classified AS (
    SELECT *,
      CASE
        WHEN DAY / NULLIF(EVE, 0) > 1.15 AND OVERALL >= 0.8 THEN 'CNI'
        WHEN DAY / NULLIF(EVE, 0) > 1.05 AND OVERALL <  0.8 THEN 'SMB'
        WHEN EVE / NULLIF(DAY, 0) > 1.10                    THEN 'RES'
        ELSE METER_TYPE
      END AS SUGGESTED_TYPE,
      ABS(EVE - DAY) / NULLIF(GREATEST(EVE, DAY), 0)        AS SHAPE_SEPARATION
    FROM shape
    WHERE EVE IS NOT NULL AND DAY IS NOT NULL AND NIGHT IS NOT NULL
  )
SELECT
  ROW_NUMBER() OVER (ORDER BY SHAPE_SEPARATION DESC) AS RANK,
  METER_ID,
  METER_TYPE       AS CURRENT_TYPE,
  SUGGESTED_TYPE,
  ROUND(EVE, 3)    AS AVG_EVE_KWH,
  ROUND(DAY, 3)    AS AVG_DAY_KWH,
  ROUND(NIGHT, 3)  AS AVG_NIGHT_KWH,
  ROUND(OVERALL,3) AS AVG_OVERALL,
  ROUND(SHAPE_SEPARATION, 3) AS CONFIDENCE
FROM classified
WHERE METER_TYPE != SUGGESTED_TYPE
ORDER BY SHAPE_SEPARATION DESC
LIMIT 50;
