Snowflake-native **data model** and **architecture** that covers all four.

---

### **1\. Logical data model (core objects)**

**Foundational entities**

* **METER**

  * `METER_ID` (PK), `SERVICE_POINT_ID`, `METER_TYPE`, `INSTALL_DATE`, `STATUS`, `UTILITY_TERRITORY`, `TIMEZONE`  
* **SERVICE\_POINT / PREMISE**

  * `SERVICE_POINT_ID` (PK), `ADDRESS_ID`, `PREMISE_TYPE`, `FEEDER_ID`, `TRANSFORMER_ID`  
* **CUSTOMER**

  * `CUSTOMER_ID` (PK), `CIS_ACCOUNT_ID`, `SEGMENT`, `START_DATE`, `END_DATE`  
* **METER\_SERVICE\_POINT\_LINK** (slowly changing)

  * `METER_ID`, `SERVICE_POINT_ID`, `CUSTOMER_ID`, `EFFECTIVE_FROM`, `EFFECTIVE_TO`, `IS_CURRENT`

**15-min interval & events (MDMS → Snowflake)**

* **INTERVAL\_READ\_15MIN\_RAW** (landing; often VARIANT)

  * `METER_ID`, `READ_TS_RAW`, `RAW_PAYLOAD` (VARIANT), `INGESTED_AT`, `SOURCE_FILE`, `SCHEMA_VERSION`  
* **INTERVAL\_READ\_15MIN** (conformed canonical grain)

  * `METER_ID`, `READ_TS` (UTC), `READ_LOCAL_TS`, `KWH_DELIVERED`, `KWH_RECEIVED`, `DEMAND_KW`,  
    `QUALITY_FLAG`, `VEE_STATUS` (Valid/Estimated/Edited), `ESTIMATION_METHOD`, `EVENT_ID` (optional FK)  
* **METER\_EVENT**

  * `EVENT_ID` (PK), `METER_ID`, `EVENT_TS`, `EVENT_TYPE` (outage, restore, tamper, comms), `EVENT_PAYLOAD` (VARIANT)

**Rollups & billing summaries**

* **INTERVAL\_ROLLUP\_HOURLY / DAILY / MONTHLY**

  * Grain: `METER_ID`, `ROLLUP_TS`, `ROLLUP_GRAIN`  
  * Measures: `KWH_TOTAL`, `KWH_PEAK`, `KWH_OFFPEAK`, `MAX_DEMAND_KW`, `MIN_VOLTAGE`, `MAX_VOLTAGE`  
  * Data quality: `SOURCE_INTERVAL_COUNT`, `EXPECTED_INTERVAL_COUNT`, `COMPLETENESS_PCT`, `VEE_PASS_PCT`  
* **BILLING\_PERIOD**

  * `BILLING_PERIOD_ID` (PK), `CIS_ACCOUNT_ID`, `SERVICE_POINT_ID`, `START_DATE`, `END_DATE`, `BILL_CYCLE`  
* **BILLING\_PERIOD\_CONSUMPTION**

  * `BILLING_PERIOD_ID`, `METER_ID`, `KWH_TOTAL`, `KWH_PEAK`, `KWH_OFFPEAK`, `MAX_DEMAND_KW`,  
    `COMPLETENESS_PCT`, `VEE_PASS_PCT`, `IS_BILLING_READY`

**TOU pricing & charge calculation**

* **TOU\_RATE\_PLAN**

  * `RATE_PLAN_ID` (PK), `PLAN_NAME`, `SEASON`, `CURRENCY`, `EFFECTIVE_FROM`, `EFFECTIVE_TO`  
* **TOU\_RATE\_WINDOW**

  * `RATE_PLAN_ID`, `RATE_WINDOW_ID` (PK), `DAY_TYPE` (weekday/weekend/holiday),  
    `START_TIME`, `END_TIME`, `TOU_BUCKET` (on-peak, off-peak, shoulder), `ENERGY_RATE_PER_KWH`, `DEMAND_RATE_PER_KW`  
* **INTERVAL\_TOU\_TAGGED** (15-min × TOU window)

  * `METER_ID`, `READ_TS`, `KWH`, `DEMAND_KW`, `RATE_PLAN_ID`, `RATE_WINDOW_ID`, `TOU_BUCKET`  
* **INTERVAL\_CHARGE\_LINE** (TOU interval charge calculator)

  * `METER_ID`, `READ_TS`, `BILLING_PERIOD_ID`, `TOU_BUCKET`,  
    `KWH`, `DEMAND_KW`, `ENERGY_RATE_PER_KWH`, `DEMAND_RATE_PER_KW`, `ENERGY_CHARGE`, `DEMAND_CHARGE`

**Observability & SLA**

* **PIPELINE\_RUN\_AUDIT**

  * `PIPELINE_NAME`, `RUN_ID`, `START_TIME`, `END_TIME`, `STATUS`, `ROWS_PROCESSED`, `ERROR_COUNT`  
* **INGESTION\_SLA\_METRICS**

  * `DATE_KEY`, `METER_ID` (or aggregation level),  
    `MAX_INGESTION_LAG_MIN`, `PCT_ARRIVED_WITHIN_15MIN`, `LATE_ARRIVAL_COUNT`  
* **DATA\_QUALITY\_METRICS**

  * `DATE_KEY`, `METER_ID`/`FEEDER_ID`, `VEE_PASS_RATE`, `MISSING_INTERVALS`, `ESTIMATED_INTERVALS`

These support:

* **15-minute ingestion blueprint** via `INTERVAL_READ_15MIN_RAW` → `INTERVAL_READ_15MIN`.  
* **Interval rollups & billing period aggregation** via the rollup and billing tables.  
* **TOU charge calc** via TOU rate and charge tables.  
* **AMI observability/SLA** via audit & metrics tables.

---

### **2\. Snowflake architecture & processing pattern**

#### **2.1 Ingestion from MDMS / head-end (All AMI use cases)**

* **Landing (RAW database / schema)**  
  * Use **Snowpipe Streaming** or **Kafka Connector** to ingest MDMS events and interval reads as soon as they’re published (15-min cadence or faster).  
  * Store as **semi-structured VARIANT** in `INTERVAL_READ_15MIN_RAW` with minimal transformation for schema evolution safety.  
* **Standardization (Dynamic Tables or Streams \+ Tasks)**  
  * A **dynamic table** (or task-driven MERGE) flattens RAW into the canonical `INTERVAL_READ_15MIN` model, handling:  
    * unit standardization  
    * timezone normalization  
    * VEE flags, quality codes  
    * late-arriving events (merge on `METER_ID`, `READ_TS`).

This realizes the “**AMI 2.0 15-Minute Streaming Ingestion Blueprint**” with a reusable pattern for any MDMS schema.

#### **2.2 Interval rollups & billing aggregation**

* **Rollups**  
  * Use **dynamic tables** (or streams+tasks) to maintain incremental rollups:

    * DT\_HOURLY on base `INTERVAL_READ_15MIN`  
    * DT\_DAILY on hourly  
    * DT\_MONTHLY on daily  
  * Each DT uses **window functions** to compute max demand, completeness, and VEE metrics.  
* **Billing period aggregation**  
  * Join rollups to **BILLING\_PERIOD** (from CIS) in a dynamic table `BILLING_PERIOD_CONSUMPTION`.  
  * Reconciliation checks:  
    * sum of interval KWh vs CIS billed usage  
    * completeness thresholds to set `IS_BILLING_READY`.

This maps directly to the “**Interval Rollups & Billing Period Aggregation Accelerator**” for billing-ready and analytics-ready summaries.

#### **2.3 TOU interval charge calculator**

* **TOU tagging**  
  * Build a **TIME\_DIM** (15-min grain) with `LOCAL_TIME`, `DAY_TYPE`, `SEASON`.  
  * Join `INTERVAL_READ_15MIN` to `TIME_DIM` and `TOU_RATE_WINDOW` to assign **TOU bucket and rate window** into `INTERVAL_TOU_TAGGED`.  
* **Charge calculation**  
  * A downstream dynamic table `INTERVAL_CHARGE_LINE` multiplies KWh and KW by the appropriate TOU prices and aggregates to:  
    * interval, day, billing period, and customer level.  
  * These outputs feed:  
    * **pre-bill validation views** for CIS  
    * analytics marts for TOU adoption and peak management.

This implements the “**TOU Interval Charge Calculator (Interval × Rate Window)**” accelerator.

#### **2.4 AMI observability & SLA dashboard**

* **Operational telemetry capture**  
  * Every Snowflake task / pipeline writes a row to `PIPELINE_RUN_AUDIT`.  
  * Dynamic tables aggregate into `INGESTION_SLA_METRICS` and `DATA_QUALITY_METRICS`:  
    * ingestion lag (event vs ingest timestamp)  
    * completeness by meter/feeder/day  
    * VEE pass rate; late arrivals.  
* **Dashboards**  
  * Use **Snowsight dashboards** or BI tools (Tableau, Power BI, etc.) querying the metrics tables to surface:  
    * ingestion lag heatmaps  
    * SLA compliance over time  
    * meters/regions at risk for billing delays.

This underpins the “**AMI 2.0 Observability & SLA Dashboard**” accelerator.

---

### **3\. Layering, security, and sharing**

* **Databases / schemas**  
  * `AMI_RAW` – landing VARIANT tables from MDMS/head-end.  
  * `AMI_CURATED` – conformed entities (meter, premise, interval\_read, rollups).  
  * `AMI_MART` – billing, TOU charges, and observability marts consumable by CIS, CRM, planning, and data science.  
* **Security & data sharing**  
  * Use **row-access policies** to restrict by territory/line of business.  
  * Expose **Secure Views** or **Snowflake data shares** to CIS/CRM and external partners (e.g., regulators).

# 

# Anomaly Detection Extension:

There’s a very clear **real-time anomaly detection** story for this AMI architecture, and you can do it Snowflake-native.

### **1\. What “real-time” can look like for AMI**

Given 15-minute MDMS reads, “real-time” is typically:

* **Sub-minute to a few minutes** from meter read arrival → anomaly flag  
* Alerts / dashboards updating continuously rather than once per batch

Your existing pattern (Snowpipe Streaming → canonical `INTERVAL_READ_15MIN`) is already a good backbone.

---

### **2\. Snowflake-native anomaly detection options**

**A. Time-series anomaly detection on interval data (per meter/feeder)**

Use **`SNOWFLAKE.ML.ANOMALY_DETECTION`** on your aggregated interval views:

1. Train per-series or multi-series models on history:

```
CREATE OR REPLACE SNOWFLAKE.ML.ANOMALY_DETECTION ami_load_anom_model(
  INPUT_DATA      => TABLE(v_ami_training_data),             -- e.g. meter_id, ts, kwh, temp, weekday flag
  SERIES_COLNAME  => 'METER_ID',
  TIMESTAMP_COLNAME => 'TS',
  TARGET_COLNAME  => 'KWH',
  LABEL_COLNAME   => ''  -- or a known-anomaly label column if you have it
);
```

3.   
   sql  
4. Run **continuous detection** in a task over the latest window:

```
CALL ami_load_anom_model!DETECT_ANOMALIES(
  INPUT_DATA        => TABLE(v_ami_recent_reads),
  TIMESTAMP_COLNAME => 'TS',
  TARGET_COLNAME    => 'KWH'
);
```

6.   
   sql  
   This returns rows with an `IS_ANOMALY` flag and scores; you can write them into `AMI_ANOMALY_EVENTS`.  
7. Orchestrate with **tasks & alerts** so that every few minutes you:  
   * Score the newest intervals  
   * Trigger a **Snowflake Alert** to email / webhook / ITSM when anomalies appear

**B. Pipeline-health anomalies (volume / freshness)**

Beyond load spikes, use built-in **data metric functions (DMFs) \+ anomaly detection** on AMI tables for data-quality SLAs:

* Example: enable anomalies on `ROW_COUNT` \+ `FRESHNESS` for `INTERVAL_READ_15MIN`:

```
ALTER TABLE ami_curated.interval_read_15min
  ADD DATA METRIC FUNCTION SNOWFLAKE.CORE.ROW_COUNT ON ()
    ANOMALY_DETECTION = TRUE;
```

*   
  sql  
* Snowflake learns seasonality and flags unusual drops/spikes in volume or freshness automatically, no manual thresholds.

This complements the AMI SLA dashboard we discussed

# Architecture Blueprints

**1\) AMI 2.0 15-Minute Streaming Ingestion Blueprint**

                 \+---------------------+  
                 |   Meters / AMI HW   |  
                 \+----------+----------+  
                            |  
                            v  
                 \+---------------------+  
                 |  MDMS / Head-End    |  
                 \+----------+----------+  
                            |  
             15-min reads & events  
                            |  
            \+---------------+------------------------+  
            |                                        |  
            v                                        v  
\+---------------------+                 \+-------------------------+  
|  Kafka / Streams    |   OR            |   Cloud Storage Stage   |  
|  (Confluent, etc.)  |                 |   (S3 / ADLS / GCS)     |  
\+----------+----------+                 \+------------+-----------+  
           |                                             
           v                                             
\+---------------------------+                            
|  Snowpipe Streaming /     |  (continuous ingest)       
|  Snowpipe (file-based)    |                            
\+------------+--------------+                            
             |  RAW JSON/CSV/Avro/Parquet               
             v                                           
\+----------------------------------------------------+  
|     AMI\_RAW.INTERVAL\_READ\_15MIN\_RAW (VARIANT)      |  
|  \- meter\_id, read\_ts\_raw, raw\_payload, schema\_ver  |  
\+-------------------+--------------------------------+  
                    |  
        Standardize & normalize (dynamic table or task)  
                    v  
\+----------------------------------------------------+  
|   AMI\_CURATED.INTERVAL\_READ\_15MIN                  |  
|   \- meter\_id, read\_ts\_utc, read\_local\_ts           |  
|   \- kwh\_delivered, kwh\_received, demand\_kw         |  
|   \- vee\_status, quality\_flag, event\_id, ...        |  
\+-------------------+--------------------------------+  
                    |  
                    v  
   \+----------------+------------------------------+  
   |                |                              |  
   v                v                              v  
Rollups DTs   TOU Calculator                Observability / SLA  
(use case 2\)  (use case 3\)                  (use case 4\)

2\) Interval Rollups & Billing Period Aggregation Accelerator

                 \+----------------------------------+  
                 | AMI\_CURATED.INTERVAL\_READ\_15MIN |  
                 \+-----------------+----------------+  
                                   |  
                     Dynamic tables / tasks  
                                   v  
         \+-------------------------+-------------------------+  
         |                                                        
         v                                                        
\+-----------------------+     \+----------------------+     \+------------------------+  
| DT\_HOURLY\_ROLLUP      | \--\> | DT\_DAILY\_ROLLUP     | \--\> | DT\_MONTHLY\_ROLLUP      |  
| (15-min \-\> hour)      |     | (hour \-\> day)       |     | (day \-\> month)         |  
| \- kwh\_total           |     | \- same metrics      |     | \- same metrics         |  
| \- max\_demand\_kw       |     | \- completeness\_pct  |     | \- completeness\_pct     |  
\+-----------+-----------+     \+----------+----------+     \+-----------+------------+  
            |                               |                          |  
            \+-------------------------------+--------------------------+  
                                            |  
                                            v  
                         \+----------------------------------+  
                         |   ROLLUP\_VIEWS (Meter / Feeder) |  
                         \+----------------+----------------+  
                                          |  
                                          v  
      \+-------------------+        \+----------------------------+  
      | CIS / Billing     |        |   BILLING\_PERIOD          |  
      | master data       |        | \- account\_id, sp\_id, ... |  
      \+---------+---------+        \+---------------------------+  
                \\                       /  
                 \\                     /  
                  v                   v  
                 \+---------------------+----------------------+  
                 |  BILLING\_PERIOD\_CONSUMPTION (DT or task)  |  
                 |  \- billing\_period\_id                       |  
                 |  \- meter\_id / service\_point\_id            |  
                 |  \- kwh\_total, kwh\_peak, kwh\_offpeak       |  
                 |  \- max\_demand\_kw, completeness\_pct        |  
                 |  \- vee\_pass\_pct, is\_billing\_ready         |  
                 \+---------------------+----------------------+  
                                       |  
                                       v  
                 \+---------------------+----------------------+  
                 | CIS Billing / CRM Consumption Views       |  
                 \+-------------------------------------------+

3\) TOU Interval Charge Calculator (Interval × Rate Window)

                  \+----------------------------------+  
                  | AMI\_CURATED.INTERVAL\_READ\_15MIN |  
                  \+-----------------+----------------+  
                                    |  
                                    v  
          \+-------------------------+----------------------------+  
          |  TIME\_DIM (15-min)                                 |  
          |  \- ts\_utc, local\_time, day\_type, season, ...       |  
          \+-------------------------+---------------------------+  
                                    |  
                                    v  
          \+-------------------------+---------------------------+  
          |  TOU\_RATE\_PLAN                                  |  
          |  \- rate\_plan\_id, season, effective\_from/to      |  
          \+-------------------------+-----------------------+  
                                    |  
          \+-------------------------+---------------------------+  
          |  TOU\_RATE\_WINDOW                                 |  
          |  \- rate\_plan\_id, day\_type                        |  
          |  \- start\_time, end\_time                          |  
          |  \- tou\_bucket (on/off/shoulder)                  |  
          |  \- energy\_rate\_per\_kwh, demand\_rate\_per\_kw       |  
          \+-------------------------+-------------------------+

                         Join (DT or view)  
AMI intervals \+ TIME\_DIM \+ TOU\_RATE\_WINDOW → tag each interval with bucket & rate  
                                    |  
                                    v  
              \+-----------------------------------------------+  
              |  INTERVAL\_TOU\_TAGGED (Dynamic Table)         |  
              |  \- meter\_id, read\_ts                         |  
              |  \- kwh, demand\_kw                            |  
              |  \- rate\_plan\_id, rate\_window\_id, tou\_bucket  |  
              \+--------------------------+--------------------+  
                                         |  
                         Compute charges per interval  
                                         v  
              \+-----------------------------------------------+  
              |  INTERVAL\_CHARGE\_LINE (Dynamic Table)        |  
              |  \- meter\_id, read\_ts, billing\_period\_id      |  
              |  \- tou\_bucket                                |  
              |  \- kwh, demand\_kw                            |  
              |  \- energy\_rate\_per\_kwh, demand\_rate\_per\_kw   |  
              |  \- energy\_charge, demand\_charge              |  
              \+--------------------------+--------------------+  
                                         |  
                                         v  
          \+------------------------------+------------------------+  
          |  Aggregation Views (per day / bill / customer)       |  
          |  \- TOU line items for CIS                            |  
          |  \- TOU analytics (peak shifting, adoption, etc.)     |  
          \+-----------------------------------------------------+

4\) AMI 2.0 Observability & SLA Dashboard

       \+----------------------------------------------------------+  
       | AMI Pipelines in Snowflake                              |  
       |  \- Snowpipe / Snowpipe Streaming                        |  
       |  \- Dynamic tables (rollups, TOU, billing)               |  
       |  \- Tasks, procedures, alerts                            |  
       \+------------------------------+---------------------------+  
                                      |  
                 Emit run metadata, row counts, lags, errors  
                                      v  
        \+-----------------------------+---------------------------+  
        |   PIPELINE\_RUN\_AUDIT (table)                           |  
        |   \- pipeline\_name, run\_id, start\_time, end\_time        |  
        |   \- status, rows\_processed, error\_count                |  
        \+-----------------------------+---------------------------+

        \+--------------------------------------------------------+  
        | Data Metric Functions (DMFs) on key tables             |  
        |  \- ROW\_COUNT, FRESHNESS on RAW / CURATED / ROLLUPS    |  
        |  \- With ANOMALY\_DETECTION \= TRUE                      |  
        \+-----------------------------+---------------------------+  
                                      |  
                                      v  
        \+-----------------------------+---------------------------+  
        | SNOWFLAKE.LOCAL.DATA\_QUALITY\_MONITORING\_\* (event tbls) |  
        |  \+ DATA\_QUALITY\_MONITORING\_ANOMALY\_DETECTION\_STATUS    |  
        \+-----------------------------+---------------------------+

                                      |  
                        Curate KPIs via views / dynamic tables  
                                      v  
        \+----------------+-----------------+----------------------+  
        | INGESTION\_SLA\_METRICS          | DATA\_QUALITY\_METRICS |  
        | \- max\_ingestion\_lag\_min        | \- vee\_pass\_rate      |  
        | \- pct\_arrived\_within\_15min     | \- missing\_intervals  |  
        | \- late\_arrival\_count           | \- estimated\_intervals|  
        \+----------------+----------------+----------------------+  
                         |  
                         v  
            \+------------+----------------------------------+  
            | Snowsight Dashboards & BI Tools              |  
            | \- AMI pipeline run-state, SLAs               |  
            | \- Ingestion lag heatmaps                     |  
            | \- Data-quality / VEE scorecards              |  
            \+----------------------------------------------+

                         |  
                         v  
             \+-----------+-----------+  
             | Alerts / Notifications|  
             |  (email, webhook, ITSM)|  
             \+------------------------+

5\) Optional: Real-Time Anomaly Detection on AMI Intervals

                 \+----------------------------------+  
                 | AMI\_CURATED.INTERVAL\_READ\_15MIN |  
                 \+----------------+-----------------+  
                                  |  
                Historical window for training  
                                  v  
                 \+----------------+--------------------+  
                 | V\_AMI\_TRAINING\_DATA (view)         |  
                 | \- meter\_id, ts, kwh, exogenous vars|  
                 \+----------------+--------------------+  
                                  |  
                                  v  
      \+---------------------------------------------------+  
      | SNOWFLAKE.ML.ANOMALY\_DETECTION ami\_load\_anom\_model|  
      | \- trained per meter or multi-series               |  
      \+--------------------------+------------------------+  
                                 |  
            Periodic scoring task (e.g., every 5 minutes)  
                                 v  
      \+---------------------------------------------------+  
      | CALL ami\_load\_anom\_model\!DETECT\_ANOMALIES(...)    |  
      | → results labeled is\_anomaly, anomaly\_score       |  
      \+--------------------------+------------------------+  
                                 |  
                                 v  
      \+---------------------------------------------------+  
      |   AMI\_ANOMALY\_EVENTS                              |  
      |   \- meter\_id, ts, kwh, anomaly\_score, type        |  
      \+--------------------------+------------------------+  
                                 |  
             \+-------------------+---------------------+  
             |                                         |  
             v                                         v  
\+-----------------------------+          \+--------------------------+  
| AMI Ops / Engineering UI   |          | CIS / CRM investigations |  
| \- dashboards w/ anomalies  |          | \- link to customer, bill |  
\+-----------------------------+          \+--------------------------+  
             |  
             v  
\+-----------------------------+  
| Alerts (email / webhook)   |  
\+-----------------------------+  
