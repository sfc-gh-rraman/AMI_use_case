-- =====================================================================
-- AMI 2.0 on Snowflake -- Phase 0: Foundation
-- Creates database, schemas, warehouses.
-- Idempotent: safe to re-run.
-- =====================================================================

USE ROLE ACCOUNTADMIN;

CREATE DATABASE IF NOT EXISTS AMI_DEMO
  COMMENT = 'AMI 2.0 reference build: streaming ingest, rollups, TOU, observability, anomaly detection';

USE DATABASE AMI_DEMO;

CREATE SCHEMA IF NOT EXISTS AMI_RAW           COMMENT = 'Landing VARIANT from MDMS / head-end';
CREATE SCHEMA IF NOT EXISTS AMI_CURATED       COMMENT = 'Conformed dimensions + canonical INTERVAL_READ_15MIN';
CREATE SCHEMA IF NOT EXISTS AMI_MART          COMMENT = 'Billing, TOU charges, anomaly events';
CREATE SCHEMA IF NOT EXISTS AMI_OBSERVABILITY COMMENT = 'Pipeline audit, SLA, DQ metrics';
CREATE SCHEMA IF NOT EXISTS AMI_ML            COMMENT = 'Training views, anomaly models';
CREATE SCHEMA IF NOT EXISTS AMI_SHARED        COMMENT = 'Secure views exposed to CIS/CRM/partners';
