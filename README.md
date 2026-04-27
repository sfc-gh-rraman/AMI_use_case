# AMI 2.0 on Snowflake

A Snowflake-native Advanced Metering Infrastructure platform covering four production-grade accelerators plus a real-time anomaly detection extension, consumed through a React dashboard deployed to Snowpark Container Services.

1. **15-Minute Streaming Ingestion Blueprint**
2. **Interval Rollups & Billing Period Aggregation**
3. **Time-of-Use Interval Charge Calculator**
4. **Observability & SLA Dashboard**
5. **Real-time Anomaly Detection on AMI Intervals** *(extension)*

See [`design/AMI_DESIGN_DOC.md`](design/AMI_DESIGN_DOC.md) for the architecture and data-model specification.

---

## Platform at a glance

| Layer | Objects |
|---|---|
| Database | `AMI_DEMO` |
| Schemas | `AMI_RAW`, `AMI_CURATED`, `AMI_MART`, `AMI_OBSERVABILITY`, `AMI_ML`, `AMI_SHARED` |
| Warehouses | `AMI_LOAD_WH` (L) · `AMI_DT_WH` (M) · `AMI_STREAM_WH` (XS) · `AMI_ML_WH` (M) · `AMI_QUERY_WH` (S) — auto-suspend 60 s |
| Dynamic tables | `DT_NEW_READS_NORMALIZED`, `DT_HOURLY_ROLLUP`, `DT_DAILY_ROLLUP`, `DT_MONTHLY_ROLLUP`, `DT_INTERVAL_TOU_TAGGED`, `DT_INTERVAL_CHARGE_LINE`, `DT_BILLING_PERIOD_CONSUMPTION`, `DT_INGESTION_SLA_METRICS`, `DT_DATA_QUALITY_METRICS` |
| Cortex ML models | `ami_feeder_anom_model`, `ami_cni_meter_anom_model` |
| Semantic view | `AMI_MART.AMI_SEMANTIC_VIEW` (Cortex Analyst) |
| Data metric functions | `ROW_COUNT`, `FRESHNESS` with anomaly detection on RAW and canonical |
| Security | Row-access policy `RAP_TERRITORY`, masking policy `MP_CIS_ACCOUNT`, 3 secure views in `AMI_SHARED` |
| Alerts | `AMI_SLA_BREACH` (15-min schedule) |
| Streaming producer | `ingest/snowpipe_streaming_producer.py` |
| Dashboard | React + Express deployed to SPCS service `AMI_DASHBOARD_SVC` |

## Data scale

| Table | Rows |
|---|---|
| Substations / Feeders / Transformers | 50 / 2 000 / 20 000 |
| Service points / Meters | 100 000 / 100 000 |
| Customers | 94 022 |
| `TIME_DIM` (15-min grain) | 35 136 |
| `BILLING_PERIOD` | 1 128 264 |
| **`INTERVAL_READ_15MIN`** (canonical) | **3 496 053 979** |
| `DT_HOURLY_ROLLUP` | 878 M |
| `DT_DAILY_ROLLUP` | 36.6 M |
| `DT_MONTHLY_ROLLUP` | 1.3 M |
| `DT_INTERVAL_CHARGE_LINE` | 3.22 B |

---

## Architecture

```
  [ Meters / MDMS / Head-End ]
               │
               ▼
   Snowpipe Streaming producer (Python)
               │
               ▼
  AMI_RAW.INTERVAL_READ_15MIN_RAW  (VARIANT, 30-day retention)
               │
               │   DT_NEW_READS_NORMALIZED  (target-lag 1 min, AMI_STREAM_WH)
               ▼
  AMI_CURATED.INTERVAL_READ_15MIN  (canonical, clustered on READ_TS, METER_ID)
               │
    ┌──────────┼────────────────────────────────┐
    ▼          ▼                                ▼
 Rollup      TOU tag + charge line           SLA + DQ metrics
 DT chain    (DT_INTERVAL_TOU_TAGGED,        (DT_INGESTION_SLA_METRICS,
 (hour→day   DT_INTERVAL_CHARGE_LINE)        DT_DATA_QUALITY_METRICS)
  →month)    │                                ▼
    │        ▼                              Dashboard, DMF anomalies,
    ▼     DT_BILLING_PERIOD_CONSUMPTION     SLA breach alert
  AMI_MART  → AMI_SHARED secure views
    │
    ▼
 Cortex ML anomaly detection
 (per-feeder + per-CNI-meter)  →  AMI_ANOMALY_EVENTS
                                  AMI_METER_ANOMALY_EVENTS
```

---

## Repo layout

```
.
├── README.md
├── design/
│   └── AMI_DESIGN_DOC.md              Architecture and data-model reference
├── use_case_description/              Original solution brief
├── sql/
│   ├── 00_foundation/                 Database, schemas, warehouses, roles
│   ├── 01_dimensions/                 Dimension DDL + population
│   ├── 02_raw/                        RAW VARIANT landing + METER_EVENT
│   ├── 03_canonical_dt/               Canonical INTERVAL_READ_15MIN
│   ├── 04_rollups/                    Rollup dynamic-table chain + streaming blueprint DT
│   ├── 05_tou/                        TOU tagging + charge line + billing consumption
│   ├── 07_observability/              Audit, DMFs, SLA metrics, alert
│   ├── 08_anomaly/                    Training view, model, scoring task
│   ├── 09_security/                   Row-access policy, masking, secure views
│   ├── 10_synthetic_data/             Bulk-generation procedure
│   └── 11_semantic/                   Cortex Analyst semantic view
├── ingest/
│   └── snowpipe_streaming_producer.py Live streaming producer
├── dashboard-app/                     React + Express dashboard for SPCS
│   ├── Dockerfile
│   ├── service-spec.yaml
│   ├── package.json
│   ├── server/index.js                Express backend, snowflake-sdk, OAuth
│   └── src/                           Vite + React + Recharts UI
├── dashboards/
│   └── snowsight_dashboard.sql        Reference queries for Snowsight tiles
└── test/
    └── 01_validation_suite.sql        End-to-end validation (T1–T9)
```

---

## Running the platform

### Provisioning the data platform

Run the SQL files in order as `ACCOUNTADMIN` (or the owning role):

```sql
-- Foundation
@sql/00_foundation/01_database_schemas.sql
@sql/00_foundation/02_warehouses.sql
@sql/00_foundation/03_roles.sql

-- Dimensions
@sql/01_dimensions/01_dimension_ddl.sql
@sql/01_dimensions/02_populate_dimensions.sql

-- RAW landing + canonical fact
@sql/02_raw/01_raw_landing.sql
@sql/03_canonical_dt/01_canonical_table.sql

-- Synthetic history (≈30–45 min on a LARGE warehouse)
@sql/10_synthetic_data/01_generator_procedure.sql
CALL AMI_DEMO.AMI_CURATED.SP_GENERATE_ALL_MONTHS(0, 12);

-- Pipeline
@sql/04_rollups/01_rollup_dts.sql
@sql/05_tou/01_tou_and_billing_dts.sql
@sql/07_observability/01_observability.sql
@sql/08_anomaly/01_anomaly_model.sql
@sql/09_security/01_security_and_sharing.sql
@sql/11_semantic/01_semantic_view.sql
```

### Running the streaming producer

```bash
SNOWFLAKE_CONNECTION_NAME=<connection> \
  python3 ingest/snowpipe_streaming_producer.py \
      --meter-count 200 \
      --interval-seconds 5 \
      --duration-minutes 30
```

New reads land in `AMI_RAW.INTERVAL_READ_15MIN_RAW` and flow through `DT_NEW_READS_NORMALIZED` within the 1-minute target lag.

### Deploying the dashboard to SPCS

```bash
cd dashboard-app
docker build --platform linux/amd64 -t ami-dashboard:latest .
snow spcs image-registry login
docker tag ami-dashboard:latest \
  <account>.registry.snowflakecomputing.com/ami_demo/ami_mart/ami_repo/ami-dashboard:latest
docker push \
  <account>.registry.snowflakecomputing.com/ami_demo/ami_mart/ami_repo/ami-dashboard:latest
```

```sql
CREATE SERVICE AMI_DEMO.AMI_MART.AMI_DASHBOARD_SVC
  IN COMPUTE POOL AMI_COMPUTE_POOL
  FROM SPECIFICATION $$ <contents of dashboard-app/service-spec.yaml> $$
  MIN_INSTANCES = 1 MAX_INSTANCES = 1
  QUERY_WAREHOUSE = AMI_QUERY_WH;

SHOW ENDPOINTS IN SERVICE AMI_DEMO.AMI_MART.AMI_DASHBOARD_SVC;
```

The dashboard authenticates to Snowflake via the SPCS-mounted OAuth token at `/snowflake/session/token` and queries the mart schemas through `AMI_QUERY_WH`.

### Validation

```sql
@test/01_validation_suite.sql
```

T1–T9 cover dimension counts, interval volume, VEE distribution, rollup shapes, TOU implied rates, billing readiness, observability KPIs, anomaly output, and the streaming blueprint.

---

## Dashboard

A React single-page app served by an Express backend inside an SPCS container. Five tabs:

- **Ingestion** — rolling hourly read volume by territory, 14-day SLA trend, top-line KPIs
- **Data Quality** — VEE pass-rate trend, worst-feeder completeness table
- **Billing** — billing-ready headline KPIs, monthly readiness bar chart
- **TOU Charges** — energy charge by bucket, daily energy + demand revenue
- **Anomalies** — feeder- and meter-level top anomalies with forecast, upper bound, and anomaly distance

All queries are cached server-side with 60–600-second TTLs to keep dashboard queries light on the warehouse.

---

## Natural-language access via Cortex Analyst

`AMI_DEMO.AMI_MART.AMI_SEMANTIC_VIEW` exposes the mart as a business-facing semantic layer:

- **Tables**: `daily_rollup`, `billing`, `charge_line`, `anomalies`, `meter`, `service_point`, `sla`
- **Metrics**: total kWh, billed kWh, billing-ready %, total energy / demand charge, anomaly count, average on-time %
- **Dimensions**: territory, feeder, meter type, premise type, TOU bucket, rate plan, billing-ready flag, season/day-type

Example:
```sql
SELECT * FROM SEMANTIC_VIEW(
  AMI_DEMO.AMI_MART.AMI_SEMANTIC_VIEW
  DIMENSIONS daily_rollup.territory
  METRICS    daily_rollup.total_kwh, daily_rollup.meter_count
);
```

---

## Key design choices

- **One canonical grain, many marts**: every rollup, TOU output, observability metric, and anomaly mart reads from `INTERVAL_READ_15MIN`. No alternate copies.
- **VARIANT at the edge, typed downstream**: the streaming blueprint retains raw payloads for audit; `DT_NEW_READS_NORMALIZED` applies schema with last-write-wins dedup on `(METER_ID, READ_TS)`.
- **Declarative freshness**: Dynamic Tables with target lags from 1 minute (canonical) to 1 hour (monthly) let the platform prove SLA without hand-rolled orchestration.
- **Layered anomaly detection**: a per-feeder model for grid-level anomalies (2 000 series) plus a per-meter model on a sampled C&I cohort (500 series) captures both macro and behavioural shifts.
- **Data-quality observability built-in**: DMFs with anomaly detection watch row-count and freshness on RAW and canonical; derived SLA / DQ dynamic tables power the dashboard.
- **Security by default**: row-access by territory, masking on CIS account IDs, secure views in a dedicated share-ready schema.
