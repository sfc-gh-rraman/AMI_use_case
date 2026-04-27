-- =====================================================================
-- AMI 2.0 - Cortex Analyst Semantic View
-- Exposes billing, TOU, rollups, and anomalies as a business-friendly
-- semantic layer for natural-language questions.
-- =====================================================================

USE DATABASE AMI_DEMO;
USE SCHEMA AMI_MART;
USE WAREHOUSE AMI_QUERY_WH;

CREATE OR REPLACE SEMANTIC VIEW AMI_SEMANTIC_VIEW

  TABLES (
    daily_rollup AS AMI_DEMO.AMI_CURATED.DT_DAILY_ROLLUP
      PRIMARY KEY (METER_ID, ROLLUP_TS)
      WITH SYNONYMS = ('meter daily usage','daily consumption')
      COMMENT = 'Daily interval read rollup per meter',

    billing AS AMI_DEMO.AMI_MART.DT_BILLING_PERIOD_CONSUMPTION
      PRIMARY KEY (BILLING_PERIOD_ID)
      WITH SYNONYMS = ('billing period','monthly bill')
      COMMENT = 'Meter-level billing period consumption and readiness',

    charge_line AS AMI_DEMO.AMI_MART.DT_INTERVAL_CHARGE_LINE
      WITH SYNONYMS = ('TOU charges','interval charges')
      COMMENT = 'TOU-tagged interval energy and demand charges',

    anomalies AS AMI_DEMO.AMI_MART.AMI_ANOMALY_EVENTS
      WITH SYNONYMS = ('anomaly events','flagged anomalies')
      COMMENT = 'Feeder-level anomaly events from Cortex ML',

    meter AS AMI_DEMO.AMI_CURATED.METER
      PRIMARY KEY (METER_ID)
      WITH SYNONYMS = ('meters','smart meter')
      COMMENT = 'Meter dimension',

    service_point AS AMI_DEMO.AMI_CURATED.SERVICE_POINT
      PRIMARY KEY (SERVICE_POINT_ID)
      WITH SYNONYMS = ('premise','service location')
      COMMENT = 'Service point / premise',

    sla AS AMI_DEMO.AMI_OBSERVABILITY.DT_INGESTION_SLA_METRICS
      WITH SYNONYMS = ('ingestion SLA','pipeline SLA')
      COMMENT = 'Daily ingestion SLA metrics by territory'
  )

  RELATIONSHIPS (
    daily_to_meter AS daily_rollup(METER_ID) REFERENCES meter(METER_ID),
    billing_to_meter AS billing(METER_ID) REFERENCES meter(METER_ID),
    charge_to_meter AS charge_line(METER_ID) REFERENCES meter(METER_ID),
    meter_to_sp AS meter(SERVICE_POINT_ID) REFERENCES service_point(SERVICE_POINT_ID)
  )

  FACTS (
    daily_rollup.kwh_delivered AS KWH_DELIVERED COMMENT = 'kWh delivered that day',
    daily_rollup.kwh_received  AS KWH_RECEIVED  COMMENT = 'kWh pushed back (DER/solar)',
    daily_rollup.max_demand    AS MAX_DEMAND_KW COMMENT = 'Peak demand in kW',
    daily_rollup.completeness  AS COMPLETENESS_PCT,
    billing.kwh_total          AS KWH_TOTAL,
    billing.kwh_net            AS KWH_NET,
    billing.completeness       AS COMPLETENESS_PCT,
    charge_line.energy_charge  AS ENERGY_CHARGE,
    charge_line.demand_charge  AS DEMAND_CHARGE,
    charge_line.kwh            AS KWH,
    anomalies.distance         AS DISTANCE,
    anomalies.kwh              AS KWH,
    sla.pct_on_time            AS PCT_ARRIVED_WITHIN_15MIN,
    sla.late_arrivals          AS LATE_ARRIVAL_COUNT
  )

  DIMENSIONS (
    daily_rollup.rollup_date AS ROLLUP_TS COMMENT = 'Day of the rollup',
    daily_rollup.territory   AS UTILITY_TERRITORY WITH SYNONYMS = ('region','territory'),
    billing.start_date       AS START_DATE,
    billing.is_billing_ready AS IS_BILLING_READY WITH SYNONYMS = ('billing ready'),
    billing.cis_account      AS CIS_ACCOUNT_ID,
    charge_line.tou_bucket   AS TOU_BUCKET WITH SYNONYMS = ('time of use bucket','peak period'),
    charge_line.rate_plan    AS RATE_PLAN_ID,
    anomalies.feeder         AS FEEDER_ID,
    anomalies.ts             AS TS,
    anomalies.is_anomaly     AS IS_ANOMALY,
    meter.meter_type         AS METER_TYPE WITH SYNONYMS = ('customer type','segment'),
    meter.has_der            AS HAS_DER WITH SYNONYMS = ('has solar','solar'),
    meter.territory          AS UTILITY_TERRITORY,
    service_point.premise    AS PREMISE_TYPE WITH SYNONYMS = ('residential','commercial'),
    service_point.feeder     AS FEEDER_ID,
    sla.date_key             AS DATE_KEY,
    sla.territory            AS UTILITY_TERRITORY
  )

  METRICS (
    daily_rollup.total_kwh       AS SUM(daily_rollup.kwh_delivered) COMMENT = 'Total kWh',
    daily_rollup.total_kwh_net   AS SUM(daily_rollup.kwh_delivered) - SUM(daily_rollup.kwh_received),
    daily_rollup.avg_completeness AS AVG(daily_rollup.completeness),
    daily_rollup.meter_count     AS COUNT(DISTINCT daily_rollup.METER_ID),
    billing.billing_ready_pct    AS AVG(CASE WHEN billing.is_billing_ready THEN 1.0 ELSE 0.0 END) * 100,
    billing.total_billed_kwh     AS SUM(billing.kwh_total),
    charge_line.total_energy_charge AS SUM(charge_line.energy_charge),
    charge_line.total_demand_charge AS SUM(charge_line.demand_charge),
    charge_line.avg_energy_rate  AS SUM(charge_line.energy_charge) / NULLIF(SUM(charge_line.kwh), 0),
    anomalies.anomaly_count      AS SUM(CASE WHEN anomalies.is_anomaly THEN 1 ELSE 0 END),
    sla.avg_pct_on_time          AS AVG(sla.pct_on_time)
  )

  COMMENT = 'AMI 2.0 semantic view - ask about kWh, charges, anomalies, billing readiness, SLA by territory/feeder/meter/TOU bucket';
