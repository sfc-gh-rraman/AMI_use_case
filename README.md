# AMI 2.0 on Snowflake — Reference Build

Snowflake-native platform covering four Advanced Metering Infrastructure (AMI) accelerators in one connected pipeline, plus real-time anomaly detection:

1. **15-Minute Streaming Ingestion Blueprint**
2. **Interval Rollups & Billing Period Aggregation**
3. **TOU Interval Charge Calculator**
4. **AMI 2.0 Observability & SLA Dashboard**
5. *(Extension)* **Real-time Anomaly Detection on AMI Intervals**

See [`design/AMI_DESIGN_DOC.md`](design/AMI_DESIGN_DOC.md) for the full design.

---

## What is actually deployed

**Account:** `SFPSCOGS-RRAMAN_AWS_SI` · **Database:** `AMI_DEMO`

### Scale

| Layer | Rows | Notes |
|---|---|---|
| Substations / Feeders / Transformers | 50 / 2 000 / 20 000 | Realistic utility topology |
| Service points / Meters | 100 000 / 100 000 | 1:1 |
| Customers | 94 022 | ~5% vacancy |
| TIME_DIM (15-min grain) | 35 136 | 1 year |
| Billing periods | 1 128 264 | 12 months |
| **INTERVAL_READ_15MIN (canonical)** | **3 496 053 979** | ~3.5B, realistic load shapes, VEE, late arrivals, injected anomalies |
| Hourly rollup DT | 878 M | |
| Daily rollup DT | 36.6 M | |
| Monthly rollup DT | 1.3 M | |
| Interval charge line DT | 3 224 M | TOU-tagged and priced |
| Anomaly events scored | 672 000 | 1 280 flagged |

### Object inventory

**Schemas under `AMI_DEMO`:** `AMI_RAW`, `AMI_CURATED`, `AMI_MART`, `AMI_OBSERVABILITY`, `AMI_ML`, `AMI_SHARED`

**Warehouses:** `AMI_LOAD_WH` (L) · `AMI_DT_WH` (M) · `AMI_STREAM_WH` (XS) · `AMI_ML_WH` (M) · `AMI_QUERY_WH` (S) — all auto-suspend 60 s

**Dynamic tables:**
- `AMI_CURATED.DT_NEW_READS_NORMALIZED` — 1-min lag, VARIANT → typed
- `AMI_CURATED.DT_HOURLY_ROLLUP` / `DT_DAILY_ROLLUP` / `DT_MONTHLY_ROLLUP`
- `AMI_MART.DT_INTERVAL_TOU_TAGGED` / `DT_INTERVAL_CHARGE_LINE` / `DT_BILLING_PERIOD_CONSUMPTION`
- `AMI_OBSERVABILITY.DT_INGESTION_SLA_METRICS` / `DT_DATA_QUALITY_METRICS`

**DMFs with anomaly detection:** ROW_COUNT + FRESHNESS on `INTERVAL_READ_15MIN_RAW` and `INTERVAL_READ_15MIN` @ 15-min schedule

**Cortex ML:** `AMI_ML.ami_feeder_anom_model` trained on 7.97 M feeder-hours across 2 000 feeders

**Security:** Row-access policy `RAP_TERRITORY` (scaffolded, applied to `METER`), masking policy `MP_CIS_ACCOUNT` on CIS account IDs, 3 secure views in `AMI_SHARED`

**Alerts:** `AMI_SLA_BREACH` every 15 min (ingestion < 95 % on-time)

**Streaming producer:** `ingest/snowpipe_streaming_producer.py` — Python, 200-meter live slice

---

## Repo layout

```
.
├── design/AMI_DESIGN_DOC.md          Detailed design (sections 0-16)
├── use_case_description/             Original use case brief
├── sql/
│   ├── 00_foundation/                DB, schemas, warehouses, roles
│   ├── 01_dimensions/                Dimension DDL + population
│   ├── 02_raw/                       RAW VARIANT landing + METER_EVENT
│   ├── 03_canonical_dt/              Canonical interval_read_15min
│   ├── 04_rollups/                   Rollup DT chain + streaming blueprint DT
│   ├── 05_tou/                       TOU tagged + charge line + billing
│   ├── 07_observability/             Audit, DMFs, SLA metrics, alert
│   ├── 08_anomaly/                   Training, model, scoring task
│   ├── 09_security/                  RAP + masking + secure views
│   └── 10_synthetic_data/            Bulk-generation procedure
├── ingest/
│   └── snowpipe_streaming_producer.py
├── dashboards/
│   └── snowsight_dashboard.sql       4-tab dashboard queries
└── test/
    └── 01_validation_suite.sql       T1-T9 end-to-end tests
```

---

## Rebuild from scratch

```sql
-- Order matters: run these as ACCOUNTADMIN (or AMI_OWNER)
@sql/00_foundation/01_database_schemas.sql
@sql/00_foundation/02_warehouses.sql
@sql/00_foundation/03_roles.sql           -- optional during build
@sql/01_dimensions/01_dimension_ddl.sql
@sql/01_dimensions/02_populate_dimensions.sql
@sql/02_raw/01_raw_landing.sql
@sql/03_canonical_dt/01_canonical_table.sql
@sql/10_synthetic_data/01_generator_procedure.sql
CALL AMI_DEMO.AMI_CURATED.SP_GENERATE_ALL_MONTHS(0, 12);   -- ~30-45 min on LARGE
@sql/04_rollups/01_rollup_dts.sql
@sql/05_tou/01_tou_and_billing_dts.sql
@sql/07_observability/01_observability.sql
@sql/08_anomaly/01_anomaly_model.sql
@sql/09_security/01_security_and_sharing.sql
```

**Streaming demo:**
```bash
SNOWFLAKE_CONNECTION_NAME=default \
  python3 ingest/snowpipe_streaming_producer.py \
    --meter-count 200 --interval-seconds 5 --duration-minutes 30
```

**Validation:**
```sql
@test/01_validation_suite.sql
```

---

## Phase commit log

| Phase | Commit message |
|---|---|
| 0-1 | Foundation + dimension data |
| 2 | Raw tables + 3.496 B synthetic interval rows |
| 3 | Streaming blueprint + rollup DT chain |
| 4 | TOU tagged/charge + billing period DTs + reconciliation |
| 5 | Snowpipe streaming producer |
| 6 | Observability: audit, SLA/DQ metrics, DMFs, alert |
| 7 | Cortex ML anomaly detection on feeder loads |
| 8 | RAP, masking, secure views |
| 9 | Dashboard + validation tests + README |

---

## Credit / storage actuals

| Item | Actual |
|---|---|
| Bulk generation (3.5 B rows) | LARGE WH, ~30 min |
| DT initial refresh | MEDIUM WH, ~15 min cumulative |
| Anomaly model training | MEDIUM ML WH, ~30 s |
| Total one-time spend | ~18-22 credits |
| Steady state | Auto-suspended warehouses, DMFs @ 15 min |
| Storage | ~180 GB |
