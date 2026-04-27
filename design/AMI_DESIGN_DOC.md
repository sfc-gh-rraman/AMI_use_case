# AMI 2.0 on Snowflake — Detailed Design Document

**Author:** Solution Engineering
**Status:** Reference architecture

---

## 0. Executive Summary

This document is the detailed design for a Snowflake-native Advanced Metering Infrastructure (AMI 2.0) platform that covers **four tightly-integrated accelerators** plus a real-time anomaly detection extension:

1. **15-Minute Streaming Ingestion Blueprint**
2. **Interval Rollups & Billing Period Aggregation Accelerator**
3. **TOU Interval Charge Calculator**
4. **AMI 2.0 Observability & SLA Dashboard**
5. **(Extension) Real-time Anomaly Detection on AMI Intervals**

The platform is **data-engineering-first and infrastructure-heavy**. A realistic 100K-meter / 1-year dataset (~3.5B interval rows) is synthesized directly inside Snowflake and runs through a full production-style pattern: Snowpipe Streaming, VARIANT landing, Dynamic Table chains with MERGE semantics, Data Metric Functions with anomaly detection, row-access policies, secure views, and Cortex ML for anomaly scoring. A React single-page application served from Snowpark Container Services provides the operator-facing dashboard.

---

## 1. Business Context & Goals

### 1.1 What AMI is
Advanced Metering Infrastructure is the collection of smart meters, communications network, and back-office systems that a utility uses to meter electricity (and sometimes gas/water) consumption. Meters emit **interval reads** — typically every 15 minutes — that flow through the **head-end system** into the **Meter Data Management System (MDMS)**, which performs **Validation / Estimation / Editing (VEE)**. Downstream consumers include billing (CIS), customer care (CRM), distribution planning, load forecasting, and regulators.

### 1.2 Why this matters on Snowflake
Most utilities today run MDMS → SQL Server / Oracle / Teradata → nightly ETL to a data warehouse. The lag is 12–48 hours and the per-meter granularity is lost or rolled up too early. Snowflake provides:
- **Separation of storage and compute** for the very large interval fact (~3.5B rows/year at 100K meters)
- **Snowpipe Streaming** for sub-minute landing
- **Dynamic Tables** for declarative, incremental ELT with provable freshness
- **Data Metric Functions + ML.ANOMALY_DETECTION** for data-quality and load anomalies without hand-rolled thresholds
- **Secure Views, RAP, and Shares** for multi-tenant/regulatory access
- **Cortex AI** (Analyst / Agent) as a natural consumption layer

### 1.3 Four use cases, one platform
Although we treat them as four accelerators, they are **one unified data product** — the same canonical `INTERVAL_READ_15MIN` table feeds all of them. This is the most important architectural commitment of this design: **one conformed grain, many marts.**

### 1.4 Success criteria
- End-to-end pipeline visibly processes new reads within **< 2 minutes** of arrival
- Billing-period rollup reconciles with raw interval sum within **±0.1 %**
- TOU charge calculation produces correct energy + demand charges for a known rate plan
- Observability dashboard surfaces ingestion lag, completeness, VEE pass-rate at meter & feeder level
- Anomaly detection flags known-injected anomalies (voltage sag, consumption spike, dead meter) with > 90 % recall
- All SQL is idempotent and replayable
- Full build reproducible from versioned SQL in this repo

---

## 2. Domain Model (Logical)

### 2.1 Foundational entities

| Entity | Grain | Key attributes | Notes |
|---|---|---|---|
| `METER` | 1 row / meter | `METER_ID` (PK), `SERVICE_POINT_ID` (FK), `METER_TYPE`, `INSTALL_DATE`, `STATUS`, `UTILITY_TERRITORY`, `TIMEZONE`, `FIRMWARE_VERSION` | ~100K rows |
| `SERVICE_POINT` | 1 row / premise | `SERVICE_POINT_ID` (PK), `ADDRESS_ID`, `PREMISE_TYPE` (RES/SMB/C&I), `FEEDER_ID`, `TRANSFORMER_ID`, `LAT`, `LON` | ~100K (1:1 with meter for demo) |
| `CUSTOMER` | 1 row / customer | `CUSTOMER_ID` (PK), `CIS_ACCOUNT_ID`, `SEGMENT`, `RATE_PLAN_ID` (FK), `START_DATE`, `END_DATE` | ~95K (some vacant) |
| `METER_SERVICE_POINT_LINK` | SCD2 | `METER_ID`, `SERVICE_POINT_ID`, `CUSTOMER_ID`, `EFFECTIVE_FROM`, `EFFECTIVE_TO`, `IS_CURRENT` | tracks move-ins / swaps |
| `FEEDER` | 1 row / feeder | `FEEDER_ID`, `SUBSTATION_ID`, `UTILITY_TERRITORY`, `VOLTAGE_KV` | ~2,000 |
| `TRANSFORMER` | 1 row / xfmr | `TRANSFORMER_ID`, `FEEDER_ID`, `KVA_RATING`, `PHASE` | ~20,000 |
| `SUBSTATION` | 1 row / sub | `SUBSTATION_ID`, `UTILITY_TERRITORY`, `LAT`, `LON` | ~50 |

### 2.2 Interval fact & events (the heart of the system)

| Entity | Grain | Volume (1 yr, 100K mtrs) |
|---|---|---|
| `INTERVAL_READ_15MIN_RAW` | 1 VARIANT row / read as landed | ~3.5B (retained 30d hot, then purged) |
| `INTERVAL_READ_15MIN` | 1 row / meter / 15-min UTC | ~3.5B |
| `METER_EVENT` | 1 row / event | ~5–10M (outages, tampers, comms) |

**Canonical columns for `INTERVAL_READ_15MIN`:**
```
METER_ID              VARCHAR         NOT NULL
READ_TS               TIMESTAMP_TZ    NOT NULL   -- UTC, 15-min aligned
READ_LOCAL_TS         TIMESTAMP_NTZ              -- in meter's local tz
KWH_DELIVERED         NUMBER(14,4)               -- energy to customer
KWH_RECEIVED          NUMBER(14,4)               -- energy back (DER / solar)
DEMAND_KW             NUMBER(10,4)               -- max demand in interval
VOLTAGE_V             NUMBER(6,2)
QUALITY_FLAG          VARCHAR                    -- 'A' (actual), 'E' (estimated), etc
VEE_STATUS            VARCHAR                    -- 'VALID' | 'ESTIMATED' | 'EDITED' | 'FAILED'
ESTIMATION_METHOD     VARCHAR                    -- nullable
EVENT_ID              VARCHAR                    -- nullable FK to METER_EVENT
SOURCE_FILE           VARCHAR                    -- provenance
INGESTED_AT           TIMESTAMP_NTZ              -- system arrival
INGESTION_LAG_SEC     NUMBER                     -- INGESTED_AT - READ_TS
```
Primary key: `(METER_ID, READ_TS)`. Clustered on `(READ_TS, METER_ID)` to favor time-range scans first (most queries are "last N days across meters").

### 2.3 Rollups & billing

`INTERVAL_ROLLUP_HOURLY / DAILY / MONTHLY` — same measures at different grain:
- `KWH_TOTAL`, `KWH_DELIVERED`, `KWH_RECEIVED`, `KWH_PEAK`, `KWH_OFFPEAK`, `KWH_SHOULDER`
- `MAX_DEMAND_KW`, `MIN_VOLTAGE`, `MAX_VOLTAGE`, `AVG_VOLTAGE`
- Data quality: `SOURCE_INTERVAL_COUNT`, `EXPECTED_INTERVAL_COUNT`, `COMPLETENESS_PCT`, `VEE_PASS_PCT`

`BILLING_PERIOD` + `BILLING_PERIOD_CONSUMPTION` — the CIS-facing mart. `IS_BILLING_READY` boolean enforces minimum completeness (e.g. ≥ 99% intervals present, ≥ 99% VEE pass).

### 2.4 TOU

- `TOU_RATE_PLAN` (rate plan header, seasonal effective dates)
- `TOU_RATE_WINDOW` (per day-type hour bands with `TOU_BUCKET` and rates)
- `TIME_DIM` (15-min grain, `LOCAL_TIME`, `DAY_TYPE`, `SEASON`, `IS_HOLIDAY`)
- `INTERVAL_TOU_TAGGED` (1 row per interval, labeled with rate window)
- `INTERVAL_CHARGE_LINE` (charges computed per interval)

### 2.5 Observability

- `PIPELINE_RUN_AUDIT` — one row per task / DT refresh / procedure invocation
- `INGESTION_SLA_METRICS` — daily by meter (or feeder) — max lag, % within SLA, late arrivals
- `DATA_QUALITY_METRICS` — daily by meter/feeder — VEE pass rate, missing intervals, estimated intervals
- DMF outputs (`SNOWFLAKE.LOCAL.DATA_QUALITY_MONITORING_RESULTS`) for ROW_COUNT / FRESHNESS anomalies

### 2.6 Anomaly

- `V_AMI_TRAINING_DATA` — training view (history window, with exogenous vars: hour-of-day, day-of-week, temperature stub)
- Trained model: `SNOWFLAKE.ML.ANOMALY_DETECTION` (multi-series keyed on `METER_ID` or `FEEDER_ID`)
- `AMI_ANOMALY_EVENTS` — scored output

### 2.7 ER sketch (conceptual)

```
            SUBSTATION  1---*  FEEDER  1---*  TRANSFORMER  1---*  SERVICE_POINT  1---1  METER
                                                                          |
                                                                          |  link (SCD2)
                                                                          v
                                                                     CUSTOMER
                                                                          |
                                                                          |  *---1 RATE_PLAN
METER  1---*  METER_EVENT                                                 |
METER  1---*  INTERVAL_READ_15MIN  *---1  TIME_DIM
                                   *---1  TOU_RATE_WINDOW (via join)
                                   *---1  BILLING_PERIOD (via CIS link)
```

---

## 3. Snowflake Physical Architecture

### 3.1 Account layout

| Object | Purpose |
|---|---|
| Database `AMI_DEMO` | Single DB for the whole platform |
| Schema `AMI_RAW` | Landing VARIANT data (Snowpipe / streaming targets) |
| Schema `AMI_CURATED` | Conformed dimensions + canonical facts |
| Schema `AMI_MART` | Business-ready marts: billing, TOU, anomaly events |
| Schema `AMI_OBSERVABILITY` | Pipeline audit, SLA, DQ metrics |
| Schema `AMI_ML` | Training views, anomaly models |
| Schema `AMI_SHARED` | Secure views exposed to CIS/CRM/partners |
| Stage `@AMI_RAW.LANDING_STAGE` | File-based fallback ingest |

### 3.2 Warehouses

| Name | Size | Auto-suspend | Purpose |
|---|---|---|---|
| `AMI_LOAD_WH` | LARGE | 60 s | Bulk synthetic generation, historical backfill |
| `AMI_DT_WH` | MEDIUM | 60 s | Dynamic table refreshes (rollups, TOU, billing) |
| `AMI_STREAM_WH` | XSMALL | 60 s | Snowpipe Streaming target, low-latency canonical DT |
| `AMI_ML_WH` | MEDIUM | 60 s | Anomaly model train + score |
| `AMI_QUERY_WH` | SMALL | 60 s | Ad-hoc analyst / dashboard queries |

Rationale: isolating the streaming DT refresh on its own XS warehouse keeps its target-lag tight independent of heavy rollup work.

### 3.3 Roles & RBAC

```
ACCOUNTADMIN
  └── AMI_OWNER        — owns schemas, DDL
        ├── AMI_ENG    — read/write curated, mart
        │     └── AMI_ANALYST — read mart only
        ├── AMI_OPS    — read observability, execute pipeline tasks
        └── AMI_SHARE  — consume AMI_SHARED secure views only
```

- Row-access policy `RAP_TERRITORY` attached to canonical + mart facts: `UTILITY_TERRITORY IN (current_role's allowed set)`.
- Masking policy `MP_CUSTOMER_PII` on `CIS_ACCOUNT_ID`, address for non-billing roles.

### 3.4 End-to-end flow

```
  [ Python producer / Snowpipe Streaming ]
                |
                v
  AMI_RAW.INTERVAL_READ_15MIN_RAW  (VARIANT)  <-- raw events, 30d retention
                |
          DT_INTERVAL_READ_15MIN  (target_lag = '1 minute', AMI_STREAM_WH)
                v
  AMI_CURATED.INTERVAL_READ_15MIN  (canonical, PK merge on METER_ID,READ_TS)
                |
      +---------+----------+------------------+
      |                    |                  |
      v                    v                  v
  DT_HOURLY_ROLLUP   DT_INTERVAL_TOU_TAGGED   DT_INGESTION_SLA_METRICS
      |                    |                  |
      v                    v                  v
  DT_DAILY_ROLLUP    DT_INTERVAL_CHARGE_LINE  DT_DATA_QUALITY_METRICS
      |                    |
      v                    v
  DT_MONTHLY_ROLLUP   AMI_MART.TOU_* views
      |
      v
  DT_BILLING_PERIOD_CONSUMPTION  --> AMI_SHARED.V_CIS_BILLING (secure)

  Parallel: ANOMALY scoring task (every 5 min) reads canonical --> AMI_ANOMALY_EVENTS
  Parallel: PIPELINE_RUN_AUDIT written by every task; DMFs attached to key tables
```

---

## 4. Synthetic Data Strategy (The Rigor Question)

At 100K meters × 365 days × 96 intervals/day, we produce **3.504 billion** interval rows. Generating this realistically is itself a data-engineering exercise worth demonstrating.

### 4.1 Guiding principles
1. **Generate inside Snowflake** using `GENERATOR(ROWCOUNT=>...)` + lateral joins to meter dim — never import CSV.
2. **Realistic, not random**: consumption must have hour-of-day, day-of-week, seasonality, segment profile, and noise — otherwise anomaly detection will be trivial or useless.
3. **Inject controlled artifacts**: missing intervals, estimated intervals, outages, meter swaps, known anomalies — so observability and anomaly detection have signal.
4. **Two-speed ingestion**: bulk-generate the historical year directly into `INTERVAL_READ_15MIN_RAW` in one shot; then run a live Python Snowpipe Streaming producer for the *last hour* so we can watch the pipeline work in real time during the demo.

### 4.2 Meter & dimension generation
- 100,000 meters distributed across:
  - 4 utility territories (NE, SE, MW, W) with distinct timezones
  - 50 substations, 2,000 feeders, 20,000 transformers (5 meters / xfmr avg)
  - Premise mix: 80% residential, 15% SMB, 5% C&I
  - Rate plan mix: 40% flat, 50% TOU-3-tier, 10% TOU-critical-peak
  - 3% of meters have DER (solar) → non-zero `KWH_RECEIVED`

### 4.3 Interval read generation
Load-shape formula per meter:

```
kwh(t) = base_load(segment)
       * season_factor(month)
       * weekday_factor(dow)
       * hour_factor(hour_local)
       * weather_noise(lat, t)      -- simple sin + AR(1)
       * (1 + N(0, 0.05))
       + der_generation(solar, hour_local)   -- negative for received
```
- `base_load` by segment: RES ≈ 0.5 kWh/15min, SMB ≈ 3 kWh, C&I ≈ 20 kWh
- Peak hours 17:00–21:00 local, summer factor 1.3, winter 1.1
- Weekend factor 0.9 for residential, 0.6 for C&I

### 4.4 Injected imperfections
- **Missing intervals**: ~0.5% of reads never land (comms loss). Gap durations: 1 interval (70%), 2–4 intervals (25%), >1 hour (5%).
- **Estimated intervals**: fill gaps with `VEE_STATUS='ESTIMATED'` and `ESTIMATION_METHOD='LOAD_PROFILE'` for a random ~60% of gaps.
- **Outages**: 0.1% of meter-days → paired `METER_EVENT` rows (OUTAGE/RESTORE) plus zero reads for duration.
- **Late arrivals**: ~2% of reads arrive 15–240 minutes late (demonstrates MERGE + SLA dashboard).
- **Known anomaly injection** (ground-truth labels for anomaly-detection validation):
  - ~50 meters: sustained 3× consumption spike for a 4-hour window (energy theft pattern)
  - ~30 meters: dead for 48 hours (stuck dial)
  - ~20 meters: voltage sag to <200 V for 1 hour

### 4.5 Bulk generation (executed on `AMI_LOAD_WH` @ LARGE)

1. Dimensions (all tables < 1M rows): ~1 min
2. 3.5B interval rows via monthly `INSERT ... SELECT FROM GENERATOR` batches: ~30 min
3. Gap / event injection: ~5 min

Steady-state storage: ~180 GB active data + ~30 GB metadata.

### 4.6 Streaming slice
Concurrently, a Python producer using the `snowflake-ingest` SDK streams a rolling 60-minute window of synthetic reads at real-time cadence (one read per meter per 15 min, scaled down to ~200 meters to keep the channel count manageable). This proves the blueprint end-to-end without 100K concurrent channels.

---

## 5. Pipeline Design — Dynamic Tables Chain

All staged below in refresh order, with target-lag commitments.

| DT | Source | Target lag | WH | Purpose |
|---|---|---|---|---|
| `DT_INTERVAL_READ_15MIN` | `INTERVAL_READ_15MIN_RAW` (VARIANT) | **1 minute** | `AMI_STREAM_WH` | Flatten VARIANT → typed canonical; MERGE semantics via `QUALIFY ROW_NUMBER()` on `(METER_ID, READ_TS)`; compute `INGESTION_LAG_SEC` |
| `DT_HOURLY_ROLLUP` | canonical | 5 min | `AMI_DT_WH` | Hourly KWh, max demand, completeness |
| `DT_DAILY_ROLLUP` | hourly | 10 min | `AMI_DT_WH` | Daily aggregates |
| `DT_MONTHLY_ROLLUP` | daily | 1 hour | `AMI_DT_WH` | Monthly aggregates |
| `DT_INTERVAL_TOU_TAGGED` | canonical + TIME_DIM + TOU_RATE_WINDOW | 5 min | `AMI_DT_WH` | Tag every interval with bucket + rates |
| `DT_INTERVAL_CHARGE_LINE` | `DT_INTERVAL_TOU_TAGGED` | 5 min | `AMI_DT_WH` | Charge calculation |
| `DT_BILLING_PERIOD_CONSUMPTION` | daily rollup + `BILLING_PERIOD` | 15 min | `AMI_DT_WH` | Billing-ready summary |
| `DT_INGESTION_SLA_METRICS` | canonical | 5 min | `AMI_DT_WH` | Lag & late-arrival KPIs |
| `DT_DATA_QUALITY_METRICS` | canonical + rollup | 15 min | `AMI_DT_WH` | VEE pass, completeness |

### 5.1 Canonical DT — key SQL skeleton

```sql
CREATE OR REPLACE DYNAMIC TABLE AMI_CURATED.DT_INTERVAL_READ_15MIN
  TARGET_LAG = '1 minute'
  WAREHOUSE = AMI_STREAM_WH
AS
SELECT
  raw_payload:meter_id::VARCHAR                AS METER_ID,
  TO_TIMESTAMP_TZ(raw_payload:read_ts::VARCHAR) AS READ_TS,
  CONVERT_TIMEZONE(m.TIMEZONE, READ_TS)::TIMESTAMP_NTZ AS READ_LOCAL_TS,
  raw_payload:kwh_delivered::NUMBER(14,4)      AS KWH_DELIVERED,
  raw_payload:kwh_received::NUMBER(14,4)       AS KWH_RECEIVED,
  raw_payload:demand_kw::NUMBER(10,4)          AS DEMAND_KW,
  raw_payload:voltage_v::NUMBER(6,2)           AS VOLTAGE_V,
  raw_payload:quality_flag::VARCHAR            AS QUALITY_FLAG,
  raw_payload:vee_status::VARCHAR              AS VEE_STATUS,
  raw_payload:estimation_method::VARCHAR       AS ESTIMATION_METHOD,
  raw_payload:event_id::VARCHAR                AS EVENT_ID,
  r.SOURCE_FILE,
  r.INGESTED_AT,
  DATEDIFF(second, READ_TS, r.INGESTED_AT)     AS INGESTION_LAG_SEC
FROM AMI_RAW.INTERVAL_READ_15MIN_RAW r
JOIN AMI_CURATED.METER m USING (METER_ID)
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY raw_payload:meter_id, raw_payload:read_ts
  ORDER BY r.INGESTED_AT DESC
) = 1;   -- last-write-wins for late/duplicate arrivals
```

### 5.2 Rollup DT example

```sql
CREATE OR REPLACE DYNAMIC TABLE AMI_CURATED.DT_HOURLY_ROLLUP
  TARGET_LAG = '5 minutes'
  WAREHOUSE = AMI_DT_WH
AS
SELECT
  METER_ID,
  DATE_TRUNC('hour', READ_TS)                   AS ROLLUP_TS,
  'HOUR'                                        AS ROLLUP_GRAIN,
  SUM(KWH_DELIVERED)                            AS KWH_DELIVERED,
  SUM(KWH_RECEIVED)                             AS KWH_RECEIVED,
  MAX(DEMAND_KW)                                AS MAX_DEMAND_KW,
  MIN(VOLTAGE_V)                                AS MIN_VOLTAGE,
  MAX(VOLTAGE_V)                                AS MAX_VOLTAGE,
  AVG(VOLTAGE_V)                                AS AVG_VOLTAGE,
  COUNT(*)                                      AS SOURCE_INTERVAL_COUNT,
  4                                             AS EXPECTED_INTERVAL_COUNT,
  COUNT(*)/4.0 * 100                            AS COMPLETENESS_PCT,
  SUM(CASE WHEN VEE_STATUS='VALID' THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0)*100 AS VEE_PASS_PCT
FROM AMI_CURATED.INTERVAL_READ_15MIN
GROUP BY METER_ID, ROLLUP_TS;
```

### 5.3 TOU tagging SQL

```sql
CREATE OR REPLACE DYNAMIC TABLE AMI_MART.DT_INTERVAL_TOU_TAGGED
  TARGET_LAG = '5 minutes'
  WAREHOUSE = AMI_DT_WH
AS
SELECT
  i.METER_ID, i.READ_TS, i.KWH_DELIVERED AS KWH, i.DEMAND_KW,
  td.DAY_TYPE, td.SEASON,
  rp.RATE_PLAN_ID, rw.RATE_WINDOW_ID, rw.TOU_BUCKET,
  rw.ENERGY_RATE_PER_KWH, rw.DEMAND_RATE_PER_KW
FROM AMI_CURATED.INTERVAL_READ_15MIN i
JOIN AMI_CURATED.METER_SERVICE_POINT_LINK link
  ON link.METER_ID = i.METER_ID
 AND i.READ_TS BETWEEN link.EFFECTIVE_FROM AND COALESCE(link.EFFECTIVE_TO, '9999-12-31')
JOIN AMI_CURATED.CUSTOMER c ON c.CUSTOMER_ID = link.CUSTOMER_ID
JOIN AMI_CURATED.TOU_RATE_PLAN rp ON rp.RATE_PLAN_ID = c.RATE_PLAN_ID
 AND i.READ_TS BETWEEN rp.EFFECTIVE_FROM AND rp.EFFECTIVE_TO
JOIN AMI_CURATED.TIME_DIM td ON td.TS_UTC = i.READ_TS
JOIN AMI_CURATED.TOU_RATE_WINDOW rw
  ON rw.RATE_PLAN_ID = rp.RATE_PLAN_ID
 AND rw.DAY_TYPE    = td.DAY_TYPE
 AND td.LOCAL_TIME BETWEEN rw.START_TIME AND rw.END_TIME;
```

### 5.4 Billing reconciliation view

```sql
CREATE OR REPLACE VIEW AMI_MART.V_BILLING_RECONCILIATION AS
SELECT
  bp.BILLING_PERIOD_ID, bp.CIS_ACCOUNT_ID,
  bpc.KWH_TOTAL          AS INTERVAL_SUM_KWH,
  bp.CIS_BILLED_KWH,
  (bpc.KWH_TOTAL - bp.CIS_BILLED_KWH) AS VARIANCE_KWH,
  ABS(bpc.KWH_TOTAL - bp.CIS_BILLED_KWH) / NULLIF(bp.CIS_BILLED_KWH,0) AS VARIANCE_PCT,
  bpc.IS_BILLING_READY
FROM AMI_MART.BILLING_PERIOD_CONSUMPTION bpc
JOIN AMI_CURATED.BILLING_PERIOD bp USING (BILLING_PERIOD_ID);
```

---

## 6. Ingestion — Snowpipe Streaming Blueprint

### 6.1 Producer (Python)
`/ingest/snowpipe_streaming_producer.py`:
- Uses `snowflake-ingest` SDK (`streaming.SnowflakeStreamingIngestClient`)
- One **channel per meter group** (e.g., 200 meters → 200 channels → 1 channel/meter, OR batch 10 meters / channel if we prefer fewer channels)
- Reads a rolling synthetic profile, generates a JSON payload per read, calls `insert_row()` with `continuationToken`
- Flushes every 1 second
- On startup: bootstraps `offset_token` from last seen `READ_TS` per channel to support resume

### 6.2 Target
- Table: `AMI_RAW.INTERVAL_READ_15MIN_RAW` with columns: `RAW_PAYLOAD VARIANT, SOURCE_FILE VARCHAR, INGESTED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(), SCHEMA_VERSION VARCHAR`
- 30-day retention (TIME_TRAVEL + task to purge older RAW)

### 6.3 Late-arrival handling
- No dedup in RAW (keep everything for audit)
- Dedup lives in the canonical DT (`QUALIFY ROW_NUMBER()`) — inherently idempotent
- Late arrivals re-trigger canonical DT's refresh; downstream rollups reconcile automatically

### 6.4 Fallback path
File-based Snowpipe on `@AMI_RAW.LANDING_STAGE` using a `COPY INTO` pipe — for partners who can only push hourly files. Same target table.

---

## 7. Observability & SLA

### 7.1 `PIPELINE_RUN_AUDIT` write pattern
Every stored procedure / task wraps its work:
```sql
INSERT INTO AMI_OBSERVABILITY.PIPELINE_RUN_AUDIT
  VALUES (<pipeline_name>, <run_id>, CURRENT_TIMESTAMP(), NULL, 'RUNNING', 0, 0);
-- work happens
UPDATE PIPELINE_RUN_AUDIT SET END_TIME=CURRENT_TIMESTAMP(), STATUS=:status,
                              ROWS_PROCESSED=:n, ERROR_COUNT=:e WHERE RUN_ID=:run_id;
```
Dynamic Tables emit refresh metadata via `INFORMATION_SCHEMA.DYNAMIC_TABLE_REFRESH_HISTORY` — we wrap that in a view for unified observability.

### 7.2 Data Metric Functions
```sql
ALTER TABLE AMI_CURATED.INTERVAL_READ_15MIN
  ADD DATA METRIC FUNCTION SNOWFLAKE.CORE.ROW_COUNT ON ()
      SCHEDULE = '5 MINUTE'
      ANOMALY_DETECTION = TRUE;

ALTER TABLE AMI_CURATED.INTERVAL_READ_15MIN
  ADD DATA METRIC FUNCTION SNOWFLAKE.CORE.FRESHNESS
    ON (INGESTED_AT)
    SCHEDULE = '5 MINUTE'
    ANOMALY_DETECTION = TRUE;
```
Results land in `SNOWFLAKE.LOCAL.DATA_QUALITY_MONITORING_RESULTS` — exposed via a view in `AMI_OBSERVABILITY`.

### 7.3 Derived SLA metrics
`DT_INGESTION_SLA_METRICS` (daily grain):
- `MAX_INGESTION_LAG_MIN = MAX(INGESTION_LAG_SEC)/60`
- `PCT_ARRIVED_WITHIN_15MIN = AVG(IFF(INGESTION_LAG_SEC <= 900, 1, 0)) * 100`
- `LATE_ARRIVAL_COUNT = COUNT_IF(INGESTION_LAG_SEC > 900)`

### 7.4 Dashboards
A Snowsight dashboard (and optionally a tiny Streamlit in Snowflake app) with 4 tabs:
1. Ingestion live feed — rows/min, lag heatmap
2. Data quality — VEE pass %, completeness by feeder
3. Billing readiness — % meters ready by billing period
4. Anomalies — latest flagged anomalies + clickthrough

### 7.5 Alerts
```sql
CREATE OR REPLACE ALERT AMI_SLA_BREACH
  WAREHOUSE = AMI_QUERY_WH
  SCHEDULE = '5 MINUTE'
  IF (EXISTS (
    SELECT 1 FROM AMI_OBSERVABILITY.DT_INGESTION_SLA_METRICS
    WHERE DATE_KEY = CURRENT_DATE()
      AND PCT_ARRIVED_WITHIN_15MIN < 95
  ))
  THEN CALL SYSTEM$SEND_EMAIL(...);
```

---

## 8. Anomaly Detection

### 8.1 Model design choice
`SNOWFLAKE.ML.ANOMALY_DETECTION` supports multi-series forecasting-based anomaly detection. We have two granularity choices:

| Option | Pros | Cons |
|---|---|---|
| Per-meter (100K series) | Most accurate per customer; detects behavioral shifts | Compute-heavy; 100K models; may over-fit outages |
| Per-feeder (~2K series) | Manageable; catches grid-level anomalies | Misses single-meter theft/tamper unless paired with per-meter detector |

**Decision:** do **both**, layered. Per-feeder for fast load anomaly detection, per-meter on a sampled 5K high-value commercial meters. This reflects a realistic operational deployment.

### 8.2 Training view
```sql
CREATE OR REPLACE VIEW AMI_ML.V_AMI_TRAINING_DATA AS
SELECT
  i.METER_ID, i.READ_TS AS TS, i.KWH_DELIVERED AS KWH,
  EXTRACT(hour FROM i.READ_LOCAL_TS)      AS HOUR_LOCAL,
  EXTRACT(dayofweek FROM i.READ_LOCAL_TS) AS DOW,
  m.METER_TYPE, sp.PREMISE_TYPE
FROM AMI_CURATED.INTERVAL_READ_15MIN i
JOIN AMI_CURATED.METER m USING (METER_ID)
JOIN AMI_CURATED.SERVICE_POINT sp USING (SERVICE_POINT_ID)
WHERE i.READ_TS BETWEEN DATEADD(day, -180, CURRENT_DATE()) AND DATEADD(day, -7, CURRENT_DATE())
  AND i.VEE_STATUS = 'VALID';
```

### 8.3 Scoring task
```sql
CREATE OR REPLACE TASK AMI_ML.T_SCORE_ANOMALIES
  WAREHOUSE = AMI_ML_WH
  SCHEDULE = '5 MINUTE'
AS
INSERT INTO AMI_MART.AMI_ANOMALY_EVENTS
SELECT * FROM TABLE(ami_load_anom_model_feeder!DETECT_ANOMALIES(
  INPUT_DATA => TABLE(
    SELECT FEEDER_ID, READ_TS, SUM(KWH_DELIVERED) AS KWH
    FROM AMI_CURATED.INTERVAL_READ_15MIN i
    JOIN AMI_CURATED.SERVICE_POINT sp USING (SERVICE_POINT_ID)
    WHERE READ_TS >= DATEADD(minute, -30, CURRENT_TIMESTAMP())
    GROUP BY 1,2
  ),
  SERIES_COLNAME => 'FEEDER_ID',
  TIMESTAMP_COLNAME => 'READ_TS',
  TARGET_COLNAME => 'KWH'
));
```

### 8.4 Validation strategy
Because we injected known anomalies (Section 4.4), we can measure:
- Recall on injected events (target ≥ 90%)
- Precision on a labeled sample
- Time-to-detect vs injection time

---

## 9. Security, Governance, Sharing

### 9.1 Row-access policy
```sql
CREATE OR REPLACE ROW ACCESS POLICY AMI_CURATED.RAP_TERRITORY AS
  (territory VARCHAR) RETURNS BOOLEAN ->
  CURRENT_ROLE() IN ('AMI_OWNER','AMI_ENG')
  OR territory IN (SELECT TERRITORY FROM AMI_CURATED.ROLE_TERRITORY_MAP WHERE ROLE = CURRENT_ROLE());

ALTER TABLE AMI_CURATED.INTERVAL_READ_15MIN
  ADD ROW ACCESS POLICY RAP_TERRITORY ON (UTILITY_TERRITORY);
```
(Requires joining territory into the fact — we'll carry `UTILITY_TERRITORY` as a denormalized column for filter pushdown.)

### 9.2 Masking
```sql
CREATE MASKING POLICY MP_ACCOUNT_ID AS (val VARCHAR) RETURNS VARCHAR ->
  CASE WHEN CURRENT_ROLE() IN ('AMI_OWNER','AMI_BILLING') THEN val
       ELSE SHA2(val) END;
```

### 9.3 Sharing
`AMI_SHARED` schema contains secure views over the billing & TOU marts. A native-app-style outbound share scaffolds regulator access. A Cortex Analyst semantic view over `AMI_MART` exposes the same data to business users for natural-language querying.

---

## 10. Orchestration

| Mechanism | When we use it |
|---|---|
| Dynamic Tables | All continuous transforms (preferred) |
| Tasks | One-shot cron jobs (anomaly scoring, purge, dashboard refresh) |
| Streams | Only if a downstream needs CDC beyond what DTs offer |
| Alerts | SLA breach, anomaly volume spike |

Task tree:
```
ROOT: T_AMI_HOUSEKEEPING (every hour)
  ├── T_PURGE_RAW_30D
  ├── T_COMPUTE_DAILY_SLA_SNAPSHOT
  └── T_REFRESH_DASHBOARD_TABLES

STANDALONE: T_SCORE_ANOMALIES (5 min)
STANDALONE: T_TRAIN_ANOMALY_MODEL_WEEKLY (Sunday 02:00)
```

---

## 11. Testing & Validation Plan

Before declaring the build complete, each of these must pass:

1. **DDL syntax check**: `only_compile = TRUE` on every DDL file.
2. **Row counts at each layer**:
   - `INTERVAL_READ_15MIN_RAW` ≈ 3.5B
   - `INTERVAL_READ_15MIN` ≈ 3.5B (≥ 99.5% of raw, accounting for duplicates)
   - `DT_DAILY_ROLLUP` ≈ 36.5M (100K meters × 365 days)
3. **Billing reconciliation**: `V_BILLING_RECONCILIATION` shows `|VARIANCE_PCT| < 0.1%` for ≥ 99% of billing periods with `IS_BILLING_READY=TRUE`.
4. **TOU charge sanity check**: For a synthetic customer on a known TOU plan, manually compute 1 day of charges in a notebook and compare to `INTERVAL_CHARGE_LINE` — must match to the penny.
5. **Streaming producer**: watch `DT_INTERVAL_READ_15MIN` ingest lag < 2 minutes while producer runs.
6. **Anomaly recall**: ≥ 90% of the 100 injected anomaly events are flagged within 30 minutes of their timestamp.
7. **DMF anomaly detection**: pause the producer and verify FRESHNESS DMF fires an anomaly within 30 minutes.
8. **RBAC**: a session assuming `AMI_ANALYST` on territory `NE` cannot see any row with `UTILITY_TERRITORY='SE'`.

Each test is its own SQL file under `/test/`.

---

## 12. Repo Layout

```
.
├── README.md
├── design/
│   └── AMI_DESIGN_DOC.md              (this file)
├── use_case_description/              Original solution brief
├── sql/
│   ├── 00_foundation/                 Database, schemas, warehouses, roles
│   ├── 01_dimensions/                 Dimension DDL + population
│   ├── 02_raw/                        INTERVAL_READ_15MIN_RAW + METER_EVENT + stage
│   ├── 03_canonical_dt/               Canonical INTERVAL_READ_15MIN
│   ├── 04_rollups/                    Rollup dynamic-table chain + streaming blueprint DT
│   ├── 05_tou/                        TOU tagging + charge line + billing consumption
│   ├── 07_observability/              Audit, DMFs, SLA + DQ metrics, alert
│   ├── 08_anomaly/                    Training view, model, scoring task
│   ├── 09_security/                   Row-access policy, masking, secure views
│   ├── 10_synthetic_data/             Bulk-generation procedure
│   └── 11_semantic/                   Cortex Analyst semantic view
├── ingest/
│   └── snowpipe_streaming_producer.py Live streaming producer
├── dashboard-app/                     React + Express dashboard for SPCS
│   ├── Dockerfile
│   ├── service-spec.yaml
│   ├── server/index.js
│   └── src/
├── dashboards/
│   └── snowsight_dashboard.sql        Reference queries for Snowsight tiles
└── test/
    └── 01_validation_suite.sql        End-to-end validation (T1–T9)
```

---

## 13. Consumption Layers

Two consumption surfaces are exposed on top of `AMI_MART` and `AMI_OBSERVABILITY`:

### 13.1 React dashboard on Snowpark Container Services

A Vite + React single-page app with an Express backend is packaged as a Docker image and deployed as an SPCS service (`AMI_DASHBOARD_SVC`). Inside the container the backend authenticates to Snowflake via the OAuth token mounted at `/snowflake/session/token`, queries run through `AMI_QUERY_WH`, and results are cached in-process with 60–600 s TTLs.

The UI renders five tabs — Ingestion, Data Quality, Billing, TOU Charges, Anomalies — each composed of KPIs, line / bar / area charts, and ranked tables backed by dedicated `/api/*` endpoints.

### 13.2 Cortex Analyst semantic view

`AMI_MART.AMI_SEMANTIC_VIEW` is the business-facing semantic layer. It publishes seven tables (`daily_rollup`, `billing`, `charge_line`, `anomalies`, `meter`, `service_point`, `sla`), their relationships, curated facts and dimensions (territory, feeder, meter type, premise type, TOU bucket, rate plan, season), and a set of metrics (total kWh, billed kWh, billing-ready %, total energy / demand charge, anomaly count, average on-time %). Downstream Cortex Analyst and Agent endpoints can query it directly with natural language.

---

## 14. Design Choices

- **One canonical grain, many marts.** Every rollup, TOU output, observability metric, and anomaly mart reads from `INTERVAL_READ_15MIN`. No parallel copies.
- **VARIANT at the edge, typed downstream.** The streaming blueprint retains raw payloads for audit; `DT_NEW_READS_NORMALIZED` applies schema and last-write-wins dedup on `(METER_ID, READ_TS)`.
- **Declarative freshness.** Dynamic Tables with target lags from 1 minute (canonical) to 1 hour (monthly) prove SLA without hand-rolled orchestration.
- **Layered anomaly detection.** A per-feeder model for grid-level anomalies (2 000 series) plus a per-meter model on a sampled C&I cohort (500 series) captures both macro and behavioural shifts.
- **Observability built in.** DMFs with anomaly detection watch row-count and freshness on RAW and canonical; derived SLA / DQ dynamic tables power the dashboard and SLA-breach alert.
- **Security by default.** Row-access by territory, masking on CIS account IDs, secure views in a dedicated share-ready schema.
