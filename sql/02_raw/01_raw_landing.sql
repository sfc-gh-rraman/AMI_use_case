-- =====================================================================
-- Phase 2: Raw landing table + MeterEvent table
-- Matches the ingestion blueprint: Snowpipe Streaming lands into VARIANT
-- =====================================================================

USE DATABASE AMI_DEMO;
USE SCHEMA AMI_RAW;

CREATE OR REPLACE TABLE INTERVAL_READ_15MIN_RAW (
  RAW_PAYLOAD      VARIANT,
  SOURCE_FILE      VARCHAR,
  SCHEMA_VERSION   VARCHAR       DEFAULT 'v1',
  INGESTED_AT      TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY (DATE_TRUNC('day', INGESTED_AT));

CREATE OR REPLACE TABLE METER_EVENT (
  EVENT_ID         VARCHAR,
  METER_ID         VARCHAR,
  EVENT_TS         TIMESTAMP_NTZ,
  EVENT_TYPE       VARCHAR,          -- OUTAGE | RESTORE | TAMPER | COMMS_LOSS
  EVENT_PAYLOAD    VARIANT
);

-- Stage for file-based fallback ingest
CREATE STAGE IF NOT EXISTS LANDING_STAGE
  FILE_FORMAT = (TYPE = JSON);
