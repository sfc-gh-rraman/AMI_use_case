/**
 * AMI Dashboard - Express backend
 *
 * When running inside SPCS, authenticates to Snowflake using the
 * OAuth token mounted at /snowflake/session/token and SNOWFLAKE_*
 * environment variables injected by the container runtime.
 *
 * When running locally, uses SNOWFLAKE_ACCOUNT/USER/PRIVATE_KEY env vars.
 */

const express = require('express');
const snowflake = require('snowflake-sdk');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOSTNAME || '0.0.0.0';

let pool;

function getConnection() {
  const inSpcs = fs.existsSync('/snowflake/session/token');
  const cfg = inSpcs
    ? {
        account: process.env.SNOWFLAKE_ACCOUNT,
        host: process.env.SNOWFLAKE_HOST,
        token: fs.readFileSync('/snowflake/session/token', 'utf8'),
        authenticator: 'OAUTH',
        warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'AMI_QUERY_WH',
        database: 'AMI_DEMO',
        schema: 'AMI_MART',
      }
    : {
        account: process.env.SNOWFLAKE_ACCOUNT,
        username: process.env.SNOWFLAKE_USER,
        password: process.env.SNOWFLAKE_PASSWORD,
        warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'AMI_QUERY_WH',
        database: 'AMI_DEMO',
        schema: 'AMI_MART',
      };
  return new Promise((resolve, reject) => {
    const conn = snowflake.createConnection(cfg);
    conn.connect((err) => (err ? reject(err) : resolve(conn)));
  });
}

async function runQuery(sql) {
  if (!pool) pool = await getConnection();
  return new Promise((resolve, reject) => {
    pool.execute({
      sqlText: sql,
      complete: (err, stmt, rows) => (err ? reject(err) : resolve(rows)),
    });
  });
}

// --- simple in-memory TTL cache -------------------------------------------
const cache = new Map();
function cached(key, ttlSec, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.exp > now) return Promise.resolve(hit.val);
  return fn().then((val) => {
    cache.set(key, { val, exp: now + ttlSec * 1000 });
    return val;
  });
}

// --- Ingestion ------------------------------------------------------------
app.get('/api/ingestion/kpi', async (_req, res) => {
  try {
    const data = await cached('ingestion_kpi', 60, async () => {
      const [r] = await runQuery(`
        WITH sla AS (
          SELECT PCT_ARRIVED_WITHIN_15MIN, LATE_ARRIVAL_COUNT
          FROM AMI_DEMO.AMI_OBSERVABILITY.DT_INGESTION_SLA_METRICS
          WHERE DATE_KEY = DATEADD(day,-1,CURRENT_DATE())
        )
        SELECT 3496053979 AS INTERVAL_ROWS,
               100000 AS METERS,
               ROUND(AVG(PCT_ARRIVED_WITHIN_15MIN),2) AS ON_TIME,
               SUM(LATE_ARRIVAL_COUNT) AS LATE_1D
        FROM sla
      `);
      return { interval_rows: 3496053979, meters: 100000,
               on_time: r.ON_TIME, late_1d: r.LATE_1D };
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ingestion/hourly', async (_req, res) => {
  try {
    const data = await cached('ingestion_hourly', 300, async () => {
      const rows = await runQuery(`
        SELECT TO_VARCHAR(HR,'MM-DD HH24') AS HR, NE, SE, MW, W FROM (
          SELECT DATE_TRUNC('hour', READ_TS) AS HR, UTILITY_TERRITORY, COUNT(*) AS C
          FROM AMI_DEMO.AMI_CURATED.INTERVAL_READ_15MIN
          WHERE READ_TS >= DATEADD(day,-2,CURRENT_TIMESTAMP())
          GROUP BY HR, UTILITY_TERRITORY
        ) PIVOT (SUM(C) FOR UTILITY_TERRITORY IN ('NE','SE','MW','W'))
        AS p(HR, NE, SE, MW, W)
        ORDER BY HR
      `);
      return rows.map(r => ({ hr: r.HR, NE: r.NE, SE: r.SE, MW: r.MW, W: r.W }));
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ingestion/sla', async (_req, res) => {
  try {
    const data = await cached('ingestion_sla', 300, async () => {
      const rows = await runQuery(`
        SELECT TO_VARCHAR(DATE_KEY,'MM-DD') AS DATE_KEY,
               ROUND(AVG(PCT_ARRIVED_WITHIN_15MIN),2) AS PCT
        FROM AMI_DEMO.AMI_OBSERVABILITY.DT_INGESTION_SLA_METRICS
        WHERE DATE_KEY >= DATEADD(day,-14,CURRENT_DATE())
        GROUP BY DATE_KEY
        ORDER BY DATE_KEY
      `);
      return rows.map(r => ({ date_key: r.DATE_KEY, pct_on_time: r.PCT }));
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Data Quality ---------------------------------------------------------
app.get('/api/dq/daily', async (_req, res) => {
  try {
    const data = await cached('dq_daily', 300, async () => {
      const rows = await runQuery(`
        SELECT TO_VARCHAR(DATE_KEY,'MM-DD') AS DATE_KEY, NE, SE, MW, W FROM (
          SELECT DATE_KEY, UTILITY_TERRITORY, VEE_PASS_RATE
          FROM AMI_DEMO.AMI_OBSERVABILITY.DT_DATA_QUALITY_METRICS
          WHERE DATE_KEY >= DATEADD(day,-14,CURRENT_DATE())
        ) PIVOT (AVG(VEE_PASS_RATE) FOR UTILITY_TERRITORY IN ('NE','SE','MW','W'))
        AS p(DATE_KEY, NE, SE, MW, W) ORDER BY DATE_KEY
      `);
      return rows.map(r => ({ date_key: r.DATE_KEY, NE: r.NE, SE: r.SE, MW: r.MW, W: r.W }));
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dq/worst-feeders', async (_req, res) => {
  try {
    const data = await cached('dq_worst', 600, async () => {
      const rows = await runQuery(`
        SELECT sp.FEEDER_ID AS FEEDER_ID, COUNT(DISTINCT i.METER_ID) AS METERS,
               (COUNT(*) / (96.0 * 7 * COUNT(DISTINCT i.METER_ID)) * 100)::NUMBER(5,2) AS COMPLETENESS_PCT
        FROM AMI_DEMO.AMI_CURATED.INTERVAL_READ_15MIN i
        JOIN AMI_DEMO.AMI_CURATED.METER m USING (METER_ID)
        JOIN AMI_DEMO.AMI_CURATED.SERVICE_POINT sp USING (SERVICE_POINT_ID)
        WHERE i.READ_TS >= DATEADD(day,-7,CURRENT_DATE())
        GROUP BY sp.FEEDER_ID ORDER BY COMPLETENESS_PCT ASC LIMIT 20
      `);
      return rows.map(r => ({ feeder_id: r.FEEDER_ID, meters: r.METERS, completeness_pct: r.COMPLETENESS_PCT }));
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Billing --------------------------------------------------------------
app.get('/api/billing/stats', async (_req, res) => {
  try {
    const data = await cached('billing_stats', 600, async () => {
      const [r] = await runQuery(`
        SELECT COUNT(*) AS TOTAL,
               COUNT_IF(IS_BILLING_READY) AS READY,
               (COUNT_IF(IS_BILLING_READY)/COUNT(*)*100)::NUMBER(5,2) AS PCT_READY
        FROM AMI_DEMO.AMI_MART.DT_BILLING_PERIOD_CONSUMPTION
      `);
      return { total: r.TOTAL, ready: r.READY, pct_ready: r.PCT_READY };
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/billing/by-period', async (_req, res) => {
  try {
    const data = await cached('billing_by_period', 600, async () => {
      const rows = await runQuery(`
        SELECT TO_VARCHAR(START_DATE,'YYYY-MM') AS START_DATE,
               COUNT_IF(IS_BILLING_READY) AS READY,
               COUNT_IF(NOT IS_BILLING_READY) AS NOT_READY
        FROM AMI_DEMO.AMI_MART.DT_BILLING_PERIOD_CONSUMPTION
        GROUP BY TO_VARCHAR(START_DATE,'YYYY-MM') ORDER BY START_DATE
      `);
      return rows.map(r => ({ start_date: r.START_DATE, ready: r.READY, not_ready: r.NOT_READY }));
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- TOU ------------------------------------------------------------------
app.get('/api/tou/bucket-totals', async (_req, res) => {
  try {
    const data = await cached('tou_bucket', 600, async () => {
      const rows = await runQuery(`
        SELECT TOU_BUCKET, SUM(ENERGY_CHARGE)::NUMBER(14,2) AS ENERGY_CHARGE
        FROM AMI_DEMO.AMI_MART.DT_INTERVAL_CHARGE_LINE
        WHERE READ_TS >= DATEADD(day,-30,CURRENT_TIMESTAMP())
        GROUP BY TOU_BUCKET ORDER BY ENERGY_CHARGE DESC
      `);
      return rows.map(r => ({ tou_bucket: r.TOU_BUCKET, energy_charge: Number(r.ENERGY_CHARGE) }));
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tou/daily-revenue', async (_req, res) => {
  try {
    const data = await cached('tou_daily', 600, async () => {
      const rows = await runQuery(`
        SELECT TO_VARCHAR(DATE_TRUNC('day',READ_TS),'MM-DD') AS DAY,
               SUM(ENERGY_CHARGE)::NUMBER(14,2) AS ENERGY,
               SUM(DEMAND_CHARGE)::NUMBER(14,2) AS DEMAND
        FROM AMI_DEMO.AMI_MART.DT_INTERVAL_CHARGE_LINE
        WHERE READ_TS >= DATEADD(day,-14,CURRENT_TIMESTAMP())
        GROUP BY DATE_TRUNC('day',READ_TS) ORDER BY DATE_TRUNC('day',READ_TS)
      `);
      return rows.map(r => ({ day: r.DAY, energy: Number(r.ENERGY), demand: Number(r.DEMAND) }));
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Anomaly --------------------------------------------------------------
app.get('/api/anomaly/kpi', async (_req, res) => {
  try {
    const data = await cached('anomaly_kpi', 60, async () => {
      const [f] = await runQuery(`
        SELECT COUNT(*) AS SCORED, COUNT_IF(IS_ANOMALY) AS ANOMS
        FROM AMI_DEMO.AMI_MART.AMI_ANOMALY_EVENTS
      `);
      const [m] = await runQuery(`
        SELECT COUNT_IF(IS_ANOMALY) AS M FROM AMI_DEMO.AMI_MART.AMI_METER_ANOMALY_EVENTS
      `);
      return { scored: f.SCORED, feeder_anomalies: f.ANOMS, meter_anomalies: m.M };
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/anomaly/top-feeders', async (_req, res) => {
  try {
    const data = await cached('anomaly_top_feeders', 120, async () => {
      const rows = await runQuery(`
        SELECT FEEDER_ID, TO_VARCHAR(TS,'MM-DD HH24:MI') AS TS,
               KWH::NUMBER(10,1) AS KWH, FORECAST::NUMBER(10,1) AS FORECAST,
               UPPER_BOUND::NUMBER(10,1) AS UPPER_BOUND, DISTANCE::NUMBER(6,3) AS DISTANCE
        FROM AMI_DEMO.AMI_MART.AMI_ANOMALY_EVENTS
        WHERE IS_ANOMALY ORDER BY DISTANCE DESC LIMIT 15
      `);
      return rows.map(r => ({ ...r, feeder_id: r.FEEDER_ID, ts: r.TS,
        kwh: Number(r.KWH), forecast: Number(r.FORECAST),
        upper_bound: Number(r.UPPER_BOUND), distance: Number(r.DISTANCE) }));
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/anomaly/top-meters', async (_req, res) => {
  try {
    const data = await cached('anomaly_top_meters', 120, async () => {
      const rows = await runQuery(`
        SELECT METER_ID, TO_VARCHAR(TS,'MM-DD HH24:MI') AS TS,
               KWH::NUMBER(10,1) AS KWH, FORECAST::NUMBER(10,1) AS FORECAST,
               UPPER_BOUND::NUMBER(10,1) AS UPPER_BOUND, DISTANCE::NUMBER(6,3) AS DISTANCE
        FROM AMI_DEMO.AMI_MART.AMI_METER_ANOMALY_EVENTS
        WHERE IS_ANOMALY ORDER BY DISTANCE DESC LIMIT 15
      `);
      return rows.map(r => ({ meter_id: r.METER_ID, ts: r.TS,
        kwh: Number(r.KWH), forecast: Number(r.FORECAST),
        upper_bound: Number(r.UPPER_BOUND), distance: Number(r.DISTANCE) }));
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Static React bundle ---------------------------------------------------
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`AMI dashboard listening on ${HOST}:${PORT}`);
});
