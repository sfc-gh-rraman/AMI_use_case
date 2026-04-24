-- =====================================================================
-- Phase 0: Warehouses
-- Sized per design doc section 3.2
-- =====================================================================

USE ROLE ACCOUNTADMIN;

CREATE WAREHOUSE IF NOT EXISTS AMI_LOAD_WH
  WAREHOUSE_SIZE = LARGE
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE
  COMMENT = 'Bulk synthetic generation and historical backfill';

CREATE WAREHOUSE IF NOT EXISTS AMI_DT_WH
  WAREHOUSE_SIZE = MEDIUM
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE
  COMMENT = 'Dynamic table refreshes (rollups, TOU, billing)';

CREATE WAREHOUSE IF NOT EXISTS AMI_STREAM_WH
  WAREHOUSE_SIZE = XSMALL
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE
  COMMENT = 'Snowpipe streaming target + low-latency canonical DT';

CREATE WAREHOUSE IF NOT EXISTS AMI_ML_WH
  WAREHOUSE_SIZE = MEDIUM
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE
  COMMENT = 'Anomaly model training and scoring';

CREATE WAREHOUSE IF NOT EXISTS AMI_QUERY_WH
  WAREHOUSE_SIZE = SMALL
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE
  COMMENT = 'Ad-hoc analyst and dashboard queries';
