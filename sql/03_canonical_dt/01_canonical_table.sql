-- =====================================================================
-- Phase 2: Canonical interval fact table
-- Physical table for the full history backfill.
-- New streaming arrivals go to RAW then MERGE into this table via task.
-- =====================================================================

USE DATABASE AMI_DEMO;
USE SCHEMA AMI_CURATED;

CREATE OR REPLACE TABLE INTERVAL_READ_15MIN (
  METER_ID           VARCHAR       NOT NULL,
  READ_TS            TIMESTAMP_NTZ NOT NULL,   -- UTC, 15-min aligned
  READ_LOCAL_TS      TIMESTAMP_NTZ,
  KWH_DELIVERED      NUMBER(14,4),
  KWH_RECEIVED       NUMBER(14,4),
  DEMAND_KW          NUMBER(10,4),
  VOLTAGE_V          NUMBER(6,2),
  QUALITY_FLAG       VARCHAR,                  -- 'A' actual, 'E' estimated, 'F' failed
  VEE_STATUS         VARCHAR,                  -- VALID | ESTIMATED | EDITED | FAILED
  ESTIMATION_METHOD  VARCHAR,
  EVENT_ID           VARCHAR,
  UTILITY_TERRITORY  VARCHAR,                  -- denormalized for RAP pushdown
  SOURCE_FILE        VARCHAR,
  INGESTED_AT        TIMESTAMP_NTZ,
  INGESTION_LAG_SEC  NUMBER,
  PRIMARY KEY (METER_ID, READ_TS)
)
CLUSTER BY (READ_TS, METER_ID);
