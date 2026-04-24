-- =====================================================================
-- Phase 1: Dimension DDL
-- =====================================================================

USE DATABASE AMI_DEMO;
USE SCHEMA AMI_CURATED;
USE WAREHOUSE AMI_LOAD_WH;

-- ---- Substation / Feeder / Transformer hierarchy ---------------------
CREATE OR REPLACE TABLE SUBSTATION (
  SUBSTATION_ID        VARCHAR      NOT NULL,
  SUBSTATION_NAME      VARCHAR,
  UTILITY_TERRITORY    VARCHAR      NOT NULL,
  LAT                  NUMBER(9,6),
  LON                  NUMBER(9,6),
  CONSTRAINT PK_SUBSTATION PRIMARY KEY (SUBSTATION_ID)
);

CREATE OR REPLACE TABLE FEEDER (
  FEEDER_ID            VARCHAR      NOT NULL,
  SUBSTATION_ID        VARCHAR      NOT NULL,
  UTILITY_TERRITORY    VARCHAR      NOT NULL,
  VOLTAGE_KV           NUMBER(6,2),
  CONSTRAINT PK_FEEDER PRIMARY KEY (FEEDER_ID)
);

CREATE OR REPLACE TABLE TRANSFORMER (
  TRANSFORMER_ID       VARCHAR      NOT NULL,
  FEEDER_ID            VARCHAR      NOT NULL,
  KVA_RATING           NUMBER(8,2),
  PHASE                VARCHAR,
  CONSTRAINT PK_TRANSFORMER PRIMARY KEY (TRANSFORMER_ID)
);

-- ---- Service point / premise -----------------------------------------
CREATE OR REPLACE TABLE SERVICE_POINT (
  SERVICE_POINT_ID     VARCHAR      NOT NULL,
  ADDRESS_ID           VARCHAR,
  PREMISE_TYPE         VARCHAR,           -- RES | SMB | CNI
  FEEDER_ID            VARCHAR      NOT NULL,
  TRANSFORMER_ID       VARCHAR      NOT NULL,
  UTILITY_TERRITORY    VARCHAR      NOT NULL,
  LAT                  NUMBER(9,6),
  LON                  NUMBER(9,6),
  CONSTRAINT PK_SERVICE_POINT PRIMARY KEY (SERVICE_POINT_ID)
);

-- ---- Meter -----------------------------------------------------------
CREATE OR REPLACE TABLE METER (
  METER_ID             VARCHAR      NOT NULL,
  SERVICE_POINT_ID     VARCHAR      NOT NULL,
  METER_TYPE           VARCHAR,           -- RES | SMB | CNI | DER
  HAS_DER              BOOLEAN      DEFAULT FALSE,
  INSTALL_DATE         DATE,
  STATUS               VARCHAR,           -- ACTIVE | RETIRED
  UTILITY_TERRITORY    VARCHAR      NOT NULL,
  TIMEZONE             VARCHAR      NOT NULL,
  FIRMWARE_VERSION     VARCHAR,
  CONSTRAINT PK_METER PRIMARY KEY (METER_ID)
);

-- ---- Customer --------------------------------------------------------
CREATE OR REPLACE TABLE CUSTOMER (
  CUSTOMER_ID          VARCHAR      NOT NULL,
  CIS_ACCOUNT_ID       VARCHAR,
  SEGMENT              VARCHAR,
  RATE_PLAN_ID         VARCHAR,
  START_DATE           DATE,
  END_DATE             DATE,
  CONSTRAINT PK_CUSTOMER PRIMARY KEY (CUSTOMER_ID)
);

-- ---- Meter-Service Point link (SCD2) ---------------------------------
CREATE OR REPLACE TABLE METER_SERVICE_POINT_LINK (
  METER_ID             VARCHAR      NOT NULL,
  SERVICE_POINT_ID     VARCHAR      NOT NULL,
  CUSTOMER_ID          VARCHAR,
  EFFECTIVE_FROM       TIMESTAMP_NTZ NOT NULL,
  EFFECTIVE_TO         TIMESTAMP_NTZ,
  IS_CURRENT           BOOLEAN
);

-- ---- TIME_DIM @ 15-min grain -----------------------------------------
CREATE OR REPLACE TABLE TIME_DIM (
  TS_UTC               TIMESTAMP_NTZ NOT NULL,
  LOCAL_DATE           DATE,
  LOCAL_TIME           TIME,
  HOUR_LOCAL           NUMBER(2),
  DAY_OF_WEEK          NUMBER(1),
  DAY_TYPE             VARCHAR,     -- WEEKDAY | WEEKEND | HOLIDAY
  MONTH                NUMBER(2),
  SEASON               VARCHAR,     -- SUMMER | WINTER | SHOULDER
  IS_HOLIDAY           BOOLEAN
);

-- ---- TOU Rate Plan / Window ------------------------------------------
CREATE OR REPLACE TABLE TOU_RATE_PLAN (
  RATE_PLAN_ID         VARCHAR      NOT NULL,
  PLAN_NAME            VARCHAR,
  SEASON               VARCHAR,
  CURRENCY             VARCHAR      DEFAULT 'USD',
  EFFECTIVE_FROM       DATE,
  EFFECTIVE_TO         DATE,
  CONSTRAINT PK_TOU_RATE_PLAN PRIMARY KEY (RATE_PLAN_ID)
);

CREATE OR REPLACE TABLE TOU_RATE_WINDOW (
  RATE_WINDOW_ID       VARCHAR      NOT NULL,
  RATE_PLAN_ID         VARCHAR      NOT NULL,
  DAY_TYPE             VARCHAR,
  SEASON               VARCHAR,
  START_TIME           TIME,
  END_TIME             TIME,
  TOU_BUCKET           VARCHAR,     -- ON_PEAK | OFF_PEAK | SHOULDER | CRITICAL
  ENERGY_RATE_PER_KWH  NUMBER(8,5),
  DEMAND_RATE_PER_KW   NUMBER(8,4),
  CONSTRAINT PK_TOU_RATE_WINDOW PRIMARY KEY (RATE_WINDOW_ID)
);

-- ---- Billing period --------------------------------------------------
CREATE OR REPLACE TABLE BILLING_PERIOD (
  BILLING_PERIOD_ID    VARCHAR      NOT NULL,
  CIS_ACCOUNT_ID       VARCHAR,
  SERVICE_POINT_ID     VARCHAR,
  BILL_CYCLE           VARCHAR,
  START_DATE           DATE,
  END_DATE             DATE,
  CIS_BILLED_KWH       NUMBER(14,4),
  CONSTRAINT PK_BILLING_PERIOD PRIMARY KEY (BILLING_PERIOD_ID)
);
