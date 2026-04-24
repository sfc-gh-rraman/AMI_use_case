-- =====================================================================
-- Phase 2: Bulk synthetic interval generation
-- Target: 100K meters x 365 days x 96 intervals = ~3.5B rows
-- Strategy: monthly batches using stored procedure
-- Load shape formula:
--   kwh(t) = base_load(segment)
--          * season_factor(month)
--          * weekday_factor(dow)
--          * hour_factor(hour_local)
--          * (1 + N(0, 0.05))
--          + der_offset(has_der, hour_local)
-- Includes realistic imperfections:
--   ~0.5% missing, ~2% estimated, ~2% late arrivals
-- =====================================================================

USE DATABASE AMI_DEMO;
USE SCHEMA AMI_CURATED;
USE WAREHOUSE AMI_LOAD_WH;

-- Base load per segment (kWh per 15-min interval, approximate)
--   RES: ~0.5     SMB: ~3.0     CNI: ~20.0
-- Peak factor 17-21 local: 1.6 / 1.4 / 1.3
-- Summer months: 1.3   Winter: 1.1   Shoulder: 1.0
-- Weekend factor: 0.9 RES, 0.6 CNI

CREATE OR REPLACE PROCEDURE SP_GENERATE_MONTH(MONTH_OFFSET NUMBER)
RETURNS STRING
LANGUAGE SQL
AS
$$
DECLARE
  start_dt DATE;
  end_dt   DATE;
  row_ct   NUMBER;
BEGIN
  start_dt := DATEADD(month, :MONTH_OFFSET, DATE_TRUNC('month', DATEADD(year, -1, CURRENT_DATE())));
  end_dt   := DATEADD(month, 1, :start_dt);

  INSERT INTO AMI_CURATED.INTERVAL_READ_15MIN
  WITH meter_base AS (
    SELECT
      m.METER_ID, m.METER_TYPE, m.HAS_DER, m.UTILITY_TERRITORY, m.TIMEZONE,
      CASE m.METER_TYPE WHEN 'RES' THEN 0.5 WHEN 'SMB' THEN 3.0 ELSE 20.0 END AS base_kwh,
      -- persistent per-meter factor so each meter has its own "level"
      0.7 + (MOD(ABS(HASH(m.METER_ID)), 60)/100.0) AS level_factor
    FROM AMI_CURATED.METER m
  ),
  t AS (
    SELECT TS_UTC, LOCAL_TIME, HOUR_LOCAL, DAY_OF_WEEK, DAY_TYPE, MONTH, SEASON
    FROM AMI_CURATED.TIME_DIM
    WHERE TS_UTC >= :start_dt AND TS_UTC < :end_dt
  )
  SELECT
    mb.METER_ID,
    t.TS_UTC AS READ_TS,
    CONVERT_TIMEZONE('UTC', mb.TIMEZONE, t.TS_UTC::TIMESTAMP_TZ)::TIMESTAMP_NTZ AS READ_LOCAL_TS,
    -- Energy delivered (non-negative). Apply hour-of-day / season / weekday / noise
    GREATEST(0,
      mb.base_kwh
      * mb.level_factor
      * CASE
          WHEN mb.METER_TYPE = 'CNI' AND t.DAY_TYPE = 'WEEKEND' THEN 0.6
          WHEN t.DAY_TYPE = 'WEEKEND' THEN 0.9
          ELSE 1.0 END
      * CASE t.SEASON WHEN 'SUMMER' THEN 1.3 WHEN 'WINTER' THEN 1.1 ELSE 1.0 END
      * CASE
          WHEN t.HOUR_LOCAL BETWEEN 17 AND 20 THEN 1.6
          WHEN t.HOUR_LOCAL BETWEEN 7 AND 9   THEN 1.2
          WHEN t.HOUR_LOCAL BETWEEN 0 AND 5   THEN 0.5
          ELSE 1.0 END
      * (1 + NORMAL(0, 0.05, RANDOM()))
    )::NUMBER(14,4) AS KWH_DELIVERED,
    -- DER solar generation, negative offset via kwh_received (10-14h peak)
    CASE WHEN mb.HAS_DER AND t.HOUR_LOCAL BETWEEN 9 AND 16
         THEN (mb.base_kwh * 0.8 * (1 - ABS(t.HOUR_LOCAL - 12.5)/4.0)
               * (1 + NORMAL(0, 0.1, RANDOM())))::NUMBER(14,4)
         ELSE 0 END AS KWH_RECEIVED,
    -- Demand kW ~ kwh * 4 (per hour) + noise
    (mb.base_kwh * mb.level_factor
     * CASE t.SEASON WHEN 'SUMMER' THEN 1.3 WHEN 'WINTER' THEN 1.1 ELSE 1.0 END
     * 4.5 * (1 + NORMAL(0, 0.08, RANDOM())))::NUMBER(10,4) AS DEMAND_KW,
    (240 + NORMAL(0, 3, RANDOM()))::NUMBER(6,2) AS VOLTAGE_V,
    -- Quality: 97% actual, 2% estimated, 1% late flag
    CASE WHEN UNIFORM(0,1000,RANDOM()) < 20 THEN 'E'
         WHEN UNIFORM(0,1000,RANDOM()) < 10 THEN 'F'
         ELSE 'A' END AS QUALITY_FLAG,
    CASE WHEN UNIFORM(0,1000,RANDOM()) < 20 THEN 'ESTIMATED'
         WHEN UNIFORM(0,1000,RANDOM()) < 10 THEN 'FAILED'
         ELSE 'VALID' END AS VEE_STATUS,
    CASE WHEN UNIFORM(0,1000,RANDOM()) < 20 THEN 'LOAD_PROFILE' ELSE NULL END AS ESTIMATION_METHOD,
    NULL AS EVENT_ID,
    mb.UTILITY_TERRITORY,
    'backfill-' || TO_CHAR(:start_dt,'YYYYMM') AS SOURCE_FILE,
    t.TS_UTC + INTERVAL '5 seconds' AS INGESTED_AT,
    -- Occasional late arrivals: 2% of reads get +30-240 min lag
    CASE WHEN UNIFORM(0,100,RANDOM()) < 2
         THEN UNIFORM(1800, 14400, RANDOM())
         ELSE 5 END AS INGESTION_LAG_SEC
  FROM meter_base mb
  CROSS JOIN t
  -- Inject ~0.5% missing intervals
  WHERE UNIFORM(0,1000,RANDOM()) >= 5;

  row_ct := SQLROWCOUNT;
  RETURN 'Generated ' || :row_ct || ' rows for month starting ' || :start_dt::STRING;
END;
$$;
