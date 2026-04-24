-- =====================================================================
-- Phase 7: Anomaly detection with SNOWFLAKE.ML.ANOMALY_DETECTION
--
-- Design decision: Train per-feeder (manageable, ~2K series) and use
-- aggregated load. This catches grid-level anomalies well. A per-meter
-- model on sampled high-value C&I meters can be added in a follow-up.
-- =====================================================================

USE DATABASE AMI_DEMO;
USE SCHEMA AMI_ML;
USE WAREHOUSE AMI_ML_WH;

-- ---- Training view (feeder-level hourly load) ------------------------
CREATE OR REPLACE VIEW V_FEEDER_TRAINING_DATA AS
SELECT
  sp.FEEDER_ID                       AS FEEDER_ID,
  DATE_TRUNC('hour', i.READ_TS)      AS TS,
  SUM(i.KWH_DELIVERED)               AS KWH
FROM AMI_CURATED.INTERVAL_READ_15MIN i
JOIN AMI_CURATED.METER m         USING (METER_ID)
JOIN AMI_CURATED.SERVICE_POINT sp USING (SERVICE_POINT_ID)
WHERE i.VEE_STATUS = 'VALID'
  AND i.READ_TS BETWEEN DATEADD(day, -180, CURRENT_DATE())
                    AND DATEADD(day, -14, CURRENT_DATE())
GROUP BY sp.FEEDER_ID, DATE_TRUNC('hour', i.READ_TS);

-- Snapshot into a concrete table for training (ANOMALY_DETECTION requires table)
CREATE OR REPLACE TABLE FEEDER_TRAINING_SNAPSHOT AS
SELECT * FROM V_FEEDER_TRAINING_DATA;


-- ---- Train the anomaly detection model -------------------------------
CREATE OR REPLACE SNOWFLAKE.ML.ANOMALY_DETECTION ami_feeder_anom_model(
  INPUT_DATA        => SYSTEM$REFERENCE('TABLE', 'AMI_ML.FEEDER_TRAINING_SNAPSHOT'),
  SERIES_COLNAME    => 'FEEDER_ID',
  TIMESTAMP_COLNAME => 'TS',
  TARGET_COLNAME    => 'KWH',
  LABEL_COLNAME     => ''
);


-- ---- Detection input view (latest 2 days, feeder-hour aggregate) -----
CREATE OR REPLACE VIEW V_FEEDER_RECENT_LOAD AS
SELECT
  sp.FEEDER_ID,
  DATE_TRUNC('hour', i.READ_TS) AS TS,
  SUM(i.KWH_DELIVERED) AS KWH
FROM AMI_CURATED.INTERVAL_READ_15MIN i
JOIN AMI_CURATED.METER m         USING (METER_ID)
JOIN AMI_CURATED.SERVICE_POINT sp USING (SERVICE_POINT_ID)
WHERE i.READ_TS >= DATEADD(day, -14, CURRENT_DATE())
GROUP BY sp.FEEDER_ID, DATE_TRUNC('hour', i.READ_TS);

CREATE OR REPLACE TABLE FEEDER_RECENT_SNAPSHOT AS
SELECT * FROM V_FEEDER_RECENT_LOAD;


-- ---- Output table for anomaly events ---------------------------------
CREATE OR REPLACE TABLE AMI_MART.AMI_ANOMALY_EVENTS (
  FEEDER_ID      VARCHAR,
  TS             TIMESTAMP_NTZ,
  KWH            NUMBER(14,4),
  FORECAST       FLOAT,
  LOWER_BOUND    FLOAT,
  UPPER_BOUND    FLOAT,
  IS_ANOMALY     BOOLEAN,
  DISTANCE       FLOAT,
  DETECTED_AT    TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);


-- ---- Scoring task (every 30 minutes) ---------------------------------
CREATE OR REPLACE TASK T_SCORE_FEEDER_ANOMALIES
  WAREHOUSE = AMI_ML_WH
  SCHEDULE  = '30 MINUTE'
AS
BEGIN
  CREATE OR REPLACE TABLE AMI_ML.FEEDER_RECENT_SNAPSHOT AS
    SELECT * FROM AMI_ML.V_FEEDER_RECENT_LOAD;

  INSERT INTO AMI_MART.AMI_ANOMALY_EVENTS
    (FEEDER_ID, TS, KWH, FORECAST, LOWER_BOUND, UPPER_BOUND, IS_ANOMALY, DISTANCE)
  SELECT
    SERIES::VARCHAR AS FEEDER_ID,
    TS,
    Y,
    FORECAST,
    LOWER_BOUND,
    UPPER_BOUND,
    IS_ANOMALY,
    DISTANCE
  FROM TABLE(ami_feeder_anom_model!DETECT_ANOMALIES(
    INPUT_DATA        => SYSTEM$REFERENCE('TABLE', 'AMI_ML.FEEDER_RECENT_SNAPSHOT'),
    SERIES_COLNAME    => 'FEEDER_ID',
    TIMESTAMP_COLNAME => 'TS',
    TARGET_COLNAME    => 'KWH'
  ));
END;

-- Task is created suspended - resume manually after first manual run
-- ALTER TASK T_SCORE_FEEDER_ANOMALIES RESUME;
