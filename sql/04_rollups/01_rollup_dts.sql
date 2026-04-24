-- =====================================================================
-- Phase 3: Dynamic Table chain for rollups (hourly -> daily -> monthly)
-- Also: DT_NEW_READS_NORMALIZED shows the VARIANT->typed streaming blueprint
-- on fresh reads landing in INTERVAL_READ_15MIN_RAW
-- =====================================================================

USE DATABASE AMI_DEMO;
USE SCHEMA AMI_CURATED;

-- Blueprint DT: VARIANT -> typed canonical shape for newly-landed reads
CREATE OR REPLACE DYNAMIC TABLE DT_NEW_READS_NORMALIZED
  TARGET_LAG = '1 minute'
  WAREHOUSE = AMI_STREAM_WH
AS
SELECT
  raw.RAW_PAYLOAD:meter_id::VARCHAR                       AS METER_ID,
  TO_TIMESTAMP_NTZ(raw.RAW_PAYLOAD:read_ts::VARCHAR)      AS READ_TS,
  CONVERT_TIMEZONE('UTC', m.TIMEZONE, TO_TIMESTAMP_NTZ(raw.RAW_PAYLOAD:read_ts::VARCHAR))::TIMESTAMP_NTZ AS READ_LOCAL_TS,
  raw.RAW_PAYLOAD:kwh_delivered::NUMBER(14,4)             AS KWH_DELIVERED,
  raw.RAW_PAYLOAD:kwh_received::NUMBER(14,4)              AS KWH_RECEIVED,
  raw.RAW_PAYLOAD:demand_kw::NUMBER(10,4)                 AS DEMAND_KW,
  raw.RAW_PAYLOAD:voltage_v::NUMBER(6,2)                  AS VOLTAGE_V,
  raw.RAW_PAYLOAD:quality_flag::VARCHAR                   AS QUALITY_FLAG,
  raw.RAW_PAYLOAD:vee_status::VARCHAR                     AS VEE_STATUS,
  raw.RAW_PAYLOAD:estimation_method::VARCHAR              AS ESTIMATION_METHOD,
  m.UTILITY_TERRITORY,
  raw.SOURCE_FILE,
  raw.INGESTED_AT,
  DATEDIFF(second, TO_TIMESTAMP_NTZ(raw.RAW_PAYLOAD:read_ts::VARCHAR), raw.INGESTED_AT) AS INGESTION_LAG_SEC
FROM AMI_RAW.INTERVAL_READ_15MIN_RAW raw
JOIN AMI_CURATED.METER m
  ON m.METER_ID = raw.RAW_PAYLOAD:meter_id::VARCHAR
-- Last-write-wins dedup for late arrivals / replays
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY raw.RAW_PAYLOAD:meter_id, raw.RAW_PAYLOAD:read_ts
  ORDER BY raw.INGESTED_AT DESC
) = 1;

-- Hourly rollup
CREATE OR REPLACE DYNAMIC TABLE DT_HOURLY_ROLLUP
  TARGET_LAG = '5 minutes'
  WAREHOUSE = AMI_DT_WH
AS
SELECT
  METER_ID,
  DATE_TRUNC('hour', READ_TS)          AS ROLLUP_TS,
  'HOUR'                               AS ROLLUP_GRAIN,
  UTILITY_TERRITORY,
  SUM(KWH_DELIVERED)                   AS KWH_DELIVERED,
  SUM(KWH_RECEIVED)                    AS KWH_RECEIVED,
  SUM(KWH_DELIVERED - KWH_RECEIVED)    AS KWH_NET,
  MAX(DEMAND_KW)                       AS MAX_DEMAND_KW,
  MIN(VOLTAGE_V)                       AS MIN_VOLTAGE,
  MAX(VOLTAGE_V)                       AS MAX_VOLTAGE,
  AVG(VOLTAGE_V)                       AS AVG_VOLTAGE,
  COUNT(*)                             AS SOURCE_INTERVAL_COUNT,
  4                                    AS EXPECTED_INTERVAL_COUNT,
  (COUNT(*)/4.0 * 100)::NUMBER(5,2)    AS COMPLETENESS_PCT,
  (SUM(CASE WHEN VEE_STATUS='VALID' THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0)*100)::NUMBER(5,2) AS VEE_PASS_PCT
FROM AMI_CURATED.INTERVAL_READ_15MIN
GROUP BY METER_ID, DATE_TRUNC('hour', READ_TS), UTILITY_TERRITORY;

-- Daily rollup (built on hourly for efficiency)
CREATE OR REPLACE DYNAMIC TABLE DT_DAILY_ROLLUP
  TARGET_LAG = '10 minutes'
  WAREHOUSE = AMI_DT_WH
AS
SELECT
  METER_ID,
  DATE_TRUNC('day', ROLLUP_TS)         AS ROLLUP_TS,
  'DAY'                                AS ROLLUP_GRAIN,
  UTILITY_TERRITORY,
  SUM(KWH_DELIVERED)                   AS KWH_DELIVERED,
  SUM(KWH_RECEIVED)                    AS KWH_RECEIVED,
  SUM(KWH_NET)                         AS KWH_NET,
  MAX(MAX_DEMAND_KW)                   AS MAX_DEMAND_KW,
  MIN(MIN_VOLTAGE)                     AS MIN_VOLTAGE,
  MAX(MAX_VOLTAGE)                     AS MAX_VOLTAGE,
  AVG(AVG_VOLTAGE)                     AS AVG_VOLTAGE,
  SUM(SOURCE_INTERVAL_COUNT)           AS SOURCE_INTERVAL_COUNT,
  96                                   AS EXPECTED_INTERVAL_COUNT,
  (SUM(SOURCE_INTERVAL_COUNT)/96.0*100)::NUMBER(5,2) AS COMPLETENESS_PCT,
  AVG(VEE_PASS_PCT)::NUMBER(5,2)       AS VEE_PASS_PCT
FROM AMI_CURATED.DT_HOURLY_ROLLUP
GROUP BY METER_ID, DATE_TRUNC('day', ROLLUP_TS), UTILITY_TERRITORY;

-- Monthly rollup (built on daily)
CREATE OR REPLACE DYNAMIC TABLE DT_MONTHLY_ROLLUP
  TARGET_LAG = '1 hour'
  WAREHOUSE = AMI_DT_WH
AS
SELECT
  METER_ID,
  DATE_TRUNC('month', ROLLUP_TS)       AS ROLLUP_TS,
  'MONTH'                              AS ROLLUP_GRAIN,
  UTILITY_TERRITORY,
  SUM(KWH_DELIVERED)                   AS KWH_DELIVERED,
  SUM(KWH_RECEIVED)                    AS KWH_RECEIVED,
  SUM(KWH_NET)                         AS KWH_NET,
  MAX(MAX_DEMAND_KW)                   AS MAX_DEMAND_KW,
  MIN(MIN_VOLTAGE)                     AS MIN_VOLTAGE,
  MAX(MAX_VOLTAGE)                     AS MAX_VOLTAGE,
  SUM(SOURCE_INTERVAL_COUNT)           AS SOURCE_INTERVAL_COUNT,
  AVG(COMPLETENESS_PCT)::NUMBER(5,2)   AS COMPLETENESS_PCT,
  AVG(VEE_PASS_PCT)::NUMBER(5,2)       AS VEE_PASS_PCT
FROM AMI_CURATED.DT_DAILY_ROLLUP
GROUP BY METER_ID, DATE_TRUNC('month', ROLLUP_TS), UTILITY_TERRITORY;
