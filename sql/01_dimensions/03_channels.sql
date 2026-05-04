-- =====================================================================
-- Phase 2b: Channel-keyed AMI model (LONG FORM)
-- ---------------------------------------------------------------------
-- A real AMI meter emits multiple measurement streams ("channels") in
-- parallel. Each channel is keyed by (METER_ID, CHANNEL_ID, READ_TS)
-- and has its own unit of measure and aggregation rule.
--
-- This build faithfully models the FOUR channels our meters actually
-- emit today: delivered energy, received energy (DER only), demand,
-- and voltage. Additional industry channels (KVARH, AMPS, PF, ...) are
-- included in the catalog for future extension.
-- =====================================================================

USE DATABASE AMI_DEMO;
USE SCHEMA AMI_CURATED;

-- ---- Channel catalog (reference / extensible) ------------------------
CREATE OR REPLACE TABLE CHANNEL_CATALOG (
  CHANNEL_CODE   VARCHAR      NOT NULL,  -- canonical code
  CHANNEL_NUMBER NUMBER,                  -- ANSI C12.19-style number
  UOM            VARCHAR,                 -- KWH, KW, V, KVARH, KVAR, A, RATIO
  DIRECTION      VARCHAR,                 -- DELIVERED, RECEIVED, NET, NONE
  FLOW_TYPE      VARCHAR,                 -- REAL, REACTIVE, APPARENT, VOLTAGE, CURRENT
  AGGREGATION    VARCHAR,                 -- SUM, MAX, MIN, AVG
  DESCRIPTION    VARCHAR,
  IS_ACTIVE      BOOLEAN,                 -- TRUE if currently emitted
  CONSTRAINT PK_CHANNEL_CATALOG PRIMARY KEY (CHANNEL_CODE)
);

INSERT INTO CHANNEL_CATALOG VALUES
  -- Channels we actually emit today
  ('KWH_DEL',  1,  'KWH',   'DELIVERED', 'REAL',      'SUM', 'Real energy delivered to premise',         TRUE),
  ('KWH_REC',  2,  'KWH',   'RECEIVED',  'REAL',      'SUM', 'Real energy exported by premise (DER)',    TRUE),
  ('KW_DEM',   5,  'KW',    'DELIVERED', 'REAL',      'MAX', 'Peak real power demand in interval',       TRUE),
  ('VOLT_AVG', 21, 'V',     'NONE',      'VOLTAGE',   'AVG', 'Average voltage in interval',              TRUE),
  -- Catalog-only (future extensions; no measurement yet)
  ('KVARH_D',  7,  'KVARH', 'DELIVERED', 'REACTIVE',  'SUM', 'Reactive energy delivered',                FALSE),
  ('KVARH_R',  8,  'KVARH', 'RECEIVED',  'REACTIVE',  'SUM', 'Reactive energy received',                 FALSE),
  ('KVAR_DEM', 9,  'KVAR',  'DELIVERED', 'REACTIVE',  'MAX', 'Peak reactive demand in interval',         FALSE),
  ('VOLT_MIN', 22, 'V',     'NONE',      'VOLTAGE',   'MIN', 'Min voltage in interval',                  FALSE),
  ('VOLT_MAX', 23, 'V',     'NONE',      'VOLTAGE',   'MAX', 'Max voltage in interval',                  FALSE),
  ('AMPS',     31, 'A',     'NONE',      'CURRENT',   'AVG', 'Average current in interval',              FALSE),
  ('PF',       40, 'RATIO', 'NONE',      'APPARENT',  'AVG', 'Power factor',                             FALSE);


-- ---- Meter-channel (per-meter instantiation) -------------------------
CREATE OR REPLACE TABLE METER_CHANNEL (
  CHANNEL_ID      VARCHAR      NOT NULL,   -- METER_ID || '-' || CHANNEL_CODE
  METER_ID        VARCHAR      NOT NULL,
  CHANNEL_CODE    VARCHAR      NOT NULL,
  CHANNEL_NUMBER  NUMBER,
  UOM             VARCHAR,
  DIRECTION       VARCHAR,
  AGGREGATION     VARCHAR,
  INTERVAL_MIN    NUMBER       DEFAULT 15,
  SCALE_FACTOR    NUMBER(10,4) DEFAULT 1.0,
  STATUS          VARCHAR      DEFAULT 'ACTIVE',
  EFFECTIVE_FROM  DATE,
  CONSTRAINT PK_METER_CHANNEL PRIMARY KEY (CHANNEL_ID)
);

-- Population rule (reflects what our meter firmware actually emits):
--   All meters: KWH_DEL, KW_DEM, VOLT_AVG
--   DER meters (HAS_DER = TRUE): + KWH_REC
INSERT INTO METER_CHANNEL
SELECT
  m.METER_ID || '-' || cc.CHANNEL_CODE                 AS CHANNEL_ID,
  m.METER_ID,
  cc.CHANNEL_CODE,
  cc.CHANNEL_NUMBER,
  cc.UOM,
  cc.DIRECTION,
  cc.AGGREGATION,
  15,
  1.0,
  'ACTIVE',
  m.INSTALL_DATE
FROM AMI_CURATED.METER m
CROSS JOIN AMI_CURATED.CHANNEL_CATALOG cc
WHERE cc.IS_ACTIVE
  AND (
       cc.CHANNEL_CODE IN ('KWH_DEL','KW_DEM','VOLT_AVG')
    OR (cc.CHANNEL_CODE = 'KWH_REC' AND m.HAS_DER)
  );


-- ---- Physical long-form fact -----------------------------------------
CREATE OR REPLACE TABLE AMI_CURATED.INTERVAL_READ_CHANNEL (
  METER_ID          VARCHAR       NOT NULL,
  CHANNEL_ID        VARCHAR       NOT NULL,
  CHANNEL_CODE      VARCHAR       NOT NULL,
  READ_TS           TIMESTAMP_NTZ NOT NULL,
  VALUE             NUMBER(14,4),        -- numeric value in channel UOM
  UOM               VARCHAR,
  QUALITY_FLAG      VARCHAR,
  VEE_STATUS        VARCHAR,
  ESTIMATION_METHOD VARCHAR,
  EVENT_ID          VARCHAR,
  UTILITY_TERRITORY VARCHAR,
  SOURCE_FILE       VARCHAR,
  INGESTED_AT       TIMESTAMP_NTZ,
  INGESTION_LAG_SEC NUMBER,
  PRIMARY KEY (METER_ID, CHANNEL_ID, READ_TS)
)
CLUSTER BY (READ_TS, METER_ID, CHANNEL_CODE);


-- ---- Backfill procedure: unpivot wide fact month-by-month ------------
CREATE OR REPLACE PROCEDURE SP_BACKFILL_CHANNEL_MONTH(MONTH_OFFSET NUMBER)
RETURNS STRING
LANGUAGE SQL
AS
$$
DECLARE
  start_dt DATE;
  end_dt   DATE;
  row_ct   NUMBER;
BEGIN
  start_dt := DATEADD(month, :MONTH_OFFSET, DATE_TRUNC('month', DATEADD(year,-1,CURRENT_DATE())));
  end_dt   := DATEADD(month, 1, :start_dt);

  INSERT INTO AMI_CURATED.INTERVAL_READ_CHANNEL
  SELECT
    i.METER_ID,
    i.METER_ID || '-' || u.CHANNEL_CODE AS CHANNEL_ID,
    u.CHANNEL_CODE,
    i.READ_TS,
    u.VALUE,
    u.UOM,
    i.QUALITY_FLAG,
    i.VEE_STATUS,
    i.ESTIMATION_METHOD,
    i.EVENT_ID,
    i.UTILITY_TERRITORY,
    i.SOURCE_FILE,
    i.INGESTED_AT,
    i.INGESTION_LAG_SEC
  FROM AMI_CURATED.INTERVAL_READ_15MIN i
  CROSS JOIN LATERAL (
    SELECT * FROM (VALUES
      ('KWH_DEL',  i.KWH_DELIVERED::NUMBER(14,4), 'KWH'),
      ('KW_DEM',   i.DEMAND_KW::NUMBER(14,4),     'KW'),
      ('VOLT_AVG', i.VOLTAGE_V::NUMBER(14,4),     'V'),
      ('KWH_REC',  i.KWH_RECEIVED::NUMBER(14,4),  'KWH')
    ) AS v(CHANNEL_CODE, VALUE, UOM)
  ) u
  -- suppress zero KWH_REC for non-DER meters (they don't have that channel)
  WHERE i.READ_TS >= :start_dt AND i.READ_TS < :end_dt
    AND NOT (u.CHANNEL_CODE = 'KWH_REC' AND
             COALESCE(i.KWH_RECEIVED,0) = 0 AND
             NOT EXISTS (
               SELECT 1 FROM AMI_CURATED.METER m
               WHERE m.METER_ID = i.METER_ID AND m.HAS_DER
             ));

  row_ct := SQLROWCOUNT;
  RETURN 'Unpivoted ' || :row_ct || ' channel rows for month starting ' || :start_dt::STRING;
END;
$$;


CREATE OR REPLACE PROCEDURE SP_BACKFILL_CHANNEL_ALL(FROM_OFFSET NUMBER, TO_OFFSET NUMBER)
RETURNS STRING
LANGUAGE SQL
AS
$$
DECLARE
  i NUMBER;
  total NUMBER;
BEGIN
  FOR i IN :FROM_OFFSET TO :TO_OFFSET DO
    CALL SP_BACKFILL_CHANNEL_MONTH(:i);
  END FOR;
  SELECT COUNT(*) INTO :total FROM AMI_CURATED.INTERVAL_READ_CHANNEL;
  RETURN 'Total channel fact rows: ' || :total;
END;
$$;


-- ---- Backward-compat wide view ---------------------------------------
-- Dashboard and existing DTs keep working by reading this view.
CREATE OR REPLACE VIEW AMI_CURATED.V_INTERVAL_READ_15MIN_WIDE AS
SELECT
  METER_ID,
  READ_TS,
  MAX(IFF(CHANNEL_CODE='KWH_DEL',  VALUE, NULL))::NUMBER(14,4) AS KWH_DELIVERED,
  MAX(IFF(CHANNEL_CODE='KWH_REC',  VALUE, NULL))::NUMBER(14,4) AS KWH_RECEIVED,
  MAX(IFF(CHANNEL_CODE='KW_DEM',   VALUE, NULL))::NUMBER(10,4) AS DEMAND_KW,
  MAX(IFF(CHANNEL_CODE='VOLT_AVG', VALUE, NULL))::NUMBER(6,2)  AS VOLTAGE_V,
  ANY_VALUE(QUALITY_FLAG)      AS QUALITY_FLAG,
  ANY_VALUE(VEE_STATUS)        AS VEE_STATUS,
  ANY_VALUE(ESTIMATION_METHOD) AS ESTIMATION_METHOD,
  ANY_VALUE(EVENT_ID)          AS EVENT_ID,
  ANY_VALUE(UTILITY_TERRITORY) AS UTILITY_TERRITORY,
  ANY_VALUE(SOURCE_FILE)       AS SOURCE_FILE,
  ANY_VALUE(INGESTED_AT)       AS INGESTED_AT,
  ANY_VALUE(INGESTION_LAG_SEC) AS INGESTION_LAG_SEC
FROM AMI_CURATED.INTERVAL_READ_CHANNEL
GROUP BY METER_ID, READ_TS;
