/**
 * AMI Dashboard - Express backend
 *
 * In SPCS: uses the OAuth token at /snowflake/session/token + SNOWFLAKE_* env.
 * Local dev: uses SNOWFLAKE_ACCOUNT/USER/PASSWORD env.
 *
 * Queries are anchored to the data's MAX(READ_TS) rather than CURRENT_DATE()
 * so the dashboard renders correctly regardless of when it is opened.
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
      complete: (err, stmt, rows) => (err ? reject(err) : resolve(rows || [])),
    });
  });
}

// --- TTL cache ------------------------------------------------------------
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

// Data anchor - cached for 5 min. Returns YYYY-MM-DD string.
async function dataAnchor() {
  return cached('data_anchor', 300, async () => {
    const [r] = await runQuery(`
      SELECT TO_VARCHAR(MAX(READ_TS)::DATE, 'YYYY-MM-DD') AS MAX_DATE
      FROM AMI_DEMO.AMI_CURATED.INTERVAL_READ_15MIN
    `);
    // Fallback to a known-good date if the query fails for any reason.
    return (r && r.MAX_DATE) ? String(r.MAX_DATE) : '2026-04-24';
  });
}

// --- Ingestion ------------------------------------------------------------
app.get('/api/ingestion/kpi', async (_req, res) => {
  try {
    const data = await cached('ingestion_kpi', 60, async () => {
      const anchor = await dataAnchor();
      const [r] = await runQuery(`
        SELECT ROUND(AVG(PCT_ARRIVED_WITHIN_15MIN),2) AS ON_TIME,
               SUM(LATE_ARRIVAL_COUNT) AS LATE_1D
        FROM AMI_DEMO.AMI_OBSERVABILITY.DT_INGESTION_SLA_METRICS
        WHERE DATE_KEY = '${anchor}'
      `);
      return {
        interval_rows: 3496053979,
        meters: 100000,
        on_time: r?.ON_TIME ?? 0,
        late_1d: r?.LATE_1D ?? 0,
      };
    });
    res.json(data);
  } catch (e) { console.error('kpi', e); res.status(500).json({ error: e.message }); }
});

app.get('/api/ingestion/hourly', async (_req, res) => {
  try {
    const data = await cached('ingestion_hourly', 300, async () => {
      const anchor = await dataAnchor();
      const rows = await runQuery(`
        SELECT TO_VARCHAR(HR,'MM-DD HH24') AS HR, NE, SE, MW, W FROM (
          SELECT DATE_TRUNC('hour', READ_TS) AS HR, UTILITY_TERRITORY, COUNT(*) AS C
          FROM AMI_DEMO.AMI_CURATED.INTERVAL_READ_15MIN
          WHERE READ_TS >= DATEADD(day,-2,TO_TIMESTAMP('${anchor}' || ' 23:59:59'))
            AND READ_TS <= TO_TIMESTAMP('${anchor}' || ' 23:59:59')
          GROUP BY HR, UTILITY_TERRITORY
        ) PIVOT (SUM(C) FOR UTILITY_TERRITORY IN ('NE','SE','MW','W'))
        AS p(HR, NE, SE, MW, W)
        ORDER BY HR
      `);
      return rows.map(r => ({ hr: r.HR, NE: r.NE, SE: r.SE, MW: r.MW, W: r.W }));
    });
    res.json(data);
  } catch (e) { console.error('hourly', e); res.status(500).json({ error: e.message }); }
});

app.get('/api/ingestion/sla', async (_req, res) => {
  try {
    const data = await cached('ingestion_sla', 300, async () => {
      const anchor = await dataAnchor();
      const rows = await runQuery(`
        SELECT TO_VARCHAR(DATE_KEY,'MM-DD') AS DATE_KEY,
               ROUND(AVG(PCT_ARRIVED_WITHIN_15MIN),2) AS PCT
        FROM AMI_DEMO.AMI_OBSERVABILITY.DT_INGESTION_SLA_METRICS
        WHERE DATE_KEY >= DATEADD(day,-14,'${anchor}')
          AND DATE_KEY <= '${anchor}'
        GROUP BY DATE_KEY ORDER BY DATE_KEY
      `);
      return rows.map(r => ({ date_key: r.DATE_KEY, pct_on_time: Number(r.PCT) }));
    });
    res.json(data);
  } catch (e) { console.error('sla', e); res.status(500).json({ error: e.message }); }
});

// --- Data Quality ---------------------------------------------------------
app.get('/api/dq/daily', async (_req, res) => {
  try {
    const data = await cached('dq_daily', 300, async () => {
      const anchor = await dataAnchor();
      const rows = await runQuery(`
        SELECT TO_VARCHAR(DATE_KEY,'MM-DD') AS DATE_KEY, NE, SE, MW, W FROM (
          SELECT DATE_KEY, UTILITY_TERRITORY, VEE_PASS_RATE
          FROM AMI_DEMO.AMI_OBSERVABILITY.DT_DATA_QUALITY_METRICS
          WHERE DATE_KEY >= DATEADD(day,-14,'${anchor}') AND DATE_KEY <= '${anchor}'
        ) PIVOT (AVG(VEE_PASS_RATE) FOR UTILITY_TERRITORY IN ('NE','SE','MW','W'))
        AS p(DATE_KEY, NE, SE, MW, W) ORDER BY DATE_KEY
      `);
      return rows.map(r => ({ date_key: r.DATE_KEY,
        NE: Number(r.NE), SE: Number(r.SE), MW: Number(r.MW), W: Number(r.W) }));
    });
    res.json(data);
  } catch (e) { console.error('dq_daily', e); res.status(500).json({ error: e.message }); }
});

app.get('/api/dq/worst-feeders', async (_req, res) => {
  try {
    const data = await cached('dq_worst', 600, async () => {
      const anchor = await dataAnchor();
      const rows = await runQuery(`
        SELECT sp.FEEDER_ID AS FEEDER_ID, COUNT(DISTINCT i.METER_ID) AS METERS,
               (COUNT(*) / (96.0 * 7 * COUNT(DISTINCT i.METER_ID)) * 100)::NUMBER(5,2) AS COMPLETENESS_PCT
        FROM AMI_DEMO.AMI_CURATED.INTERVAL_READ_15MIN i
        JOIN AMI_DEMO.AMI_CURATED.METER m USING (METER_ID)
        JOIN AMI_DEMO.AMI_CURATED.SERVICE_POINT sp USING (SERVICE_POINT_ID)
        WHERE i.READ_TS >= DATEADD(day,-7,'${anchor}')
          AND i.READ_TS <= TO_TIMESTAMP('${anchor}' || ' 23:59:59')
        GROUP BY sp.FEEDER_ID ORDER BY COMPLETENESS_PCT ASC LIMIT 20
      `);
      return rows.map(r => ({ feeder_id: r.FEEDER_ID, meters: r.METERS,
        completeness_pct: Number(r.COMPLETENESS_PCT) }));
    });
    res.json(data);
  } catch (e) { console.error('dq_worst', e); res.status(500).json({ error: e.message }); }
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
      return { total: r?.TOTAL ?? 0, ready: r?.READY ?? 0, pct_ready: Number(r?.PCT_READY ?? 0) };
    });
    res.json(data);
  } catch (e) { console.error('billing_stats', e); res.status(500).json({ error: e.message }); }
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
      return rows.map(r => ({ start_date: r.START_DATE,
        ready: Number(r.READY), not_ready: Number(r.NOT_READY) }));
    });
    res.json(data);
  } catch (e) { console.error('billing_by_period', e); res.status(500).json({ error: e.message }); }
});

// --- TOU ------------------------------------------------------------------
app.get('/api/tou/bucket-totals', async (_req, res) => {
  try {
    const data = await cached('tou_bucket', 600, async () => {
      const anchor = await dataAnchor();
      const rows = await runQuery(`
        SELECT TOU_BUCKET, SUM(ENERGY_CHARGE)::NUMBER(14,2) AS ENERGY_CHARGE
        FROM AMI_DEMO.AMI_MART.DT_INTERVAL_CHARGE_LINE
        WHERE READ_TS >= DATEADD(day,-30,'${anchor}')
          AND READ_TS <= TO_TIMESTAMP('${anchor}' || ' 23:59:59')
        GROUP BY TOU_BUCKET ORDER BY ENERGY_CHARGE DESC
      `);
      return rows.map(r => ({ tou_bucket: r.TOU_BUCKET, energy_charge: Number(r.ENERGY_CHARGE) }));
    });
    res.json(data);
  } catch (e) { console.error('tou_bucket', e); res.status(500).json({ error: e.message }); }
});

app.get('/api/tou/daily-revenue', async (_req, res) => {
  try {
    const data = await cached('tou_daily', 600, async () => {
      const anchor = await dataAnchor();
      const rows = await runQuery(`
        SELECT TO_VARCHAR(DATE_TRUNC('day',READ_TS),'MM-DD') AS DAY,
               SUM(ENERGY_CHARGE)::NUMBER(14,2) AS ENERGY,
               SUM(DEMAND_CHARGE)::NUMBER(14,2) AS DEMAND
        FROM AMI_DEMO.AMI_MART.DT_INTERVAL_CHARGE_LINE
        WHERE READ_TS >= DATEADD(day,-14,'${anchor}')
          AND READ_TS <= TO_TIMESTAMP('${anchor}' || ' 23:59:59')
        GROUP BY DATE_TRUNC('day',READ_TS) ORDER BY DATE_TRUNC('day',READ_TS)
      `);
      return rows.map(r => ({ day: r.DAY, energy: Number(r.ENERGY), demand: Number(r.DEMAND) }));
    });
    res.json(data);
  } catch (e) { console.error('tou_daily', e); res.status(500).json({ error: e.message }); }
});

// --- Anomaly --------------------------------------------------------------
app.get('/api/anomaly/kpi', async (_req, res) => {
  try {
    const data = await cached('anomaly_kpi', 60, async () => {
      const [f] = await runQuery(`
        SELECT COUNT(*) AS SCORED, COUNT_IF(IS_ANOMALY) AS ANOMS
        FROM AMI_DEMO.AMI_MART.AMI_ANOMALY_EVENTS
      `);
      let m = { M: 0 };
      try {
        const [mm] = await runQuery(`
          SELECT COUNT_IF(IS_ANOMALY) AS M FROM AMI_DEMO.AMI_MART.AMI_METER_ANOMALY_EVENTS
        `);
        m = mm || m;
      } catch (_e) { /* table may not exist */ }
      return { scored: Number(f?.SCORED ?? 0),
               feeder_anomalies: Number(f?.ANOMS ?? 0),
               meter_anomalies: Number(m?.M ?? 0) };
    });
    res.json(data);
  } catch (e) { console.error('anomaly_kpi', e); res.status(500).json({ error: e.message }); }
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
      return rows.map(r => ({ feeder_id: r.FEEDER_ID, ts: r.TS,
        kwh: Number(r.KWH), forecast: Number(r.FORECAST),
        upper_bound: Number(r.UPPER_BOUND), distance: Number(r.DISTANCE) }));
    });
    res.json(data);
  } catch (e) { console.error('anom_feeders', e); res.status(500).json({ error: e.message }); }
});

app.get('/api/anomaly/top-meters', async (_req, res) => {
  try {
    const data = await cached('anomaly_top_meters', 120, async () => {
      let rows = [];
      try {
        rows = await runQuery(`
          SELECT METER_ID, TO_VARCHAR(TS,'MM-DD HH24:MI') AS TS,
                 KWH::NUMBER(10,1) AS KWH, FORECAST::NUMBER(10,1) AS FORECAST,
                 UPPER_BOUND::NUMBER(10,1) AS UPPER_BOUND, DISTANCE::NUMBER(6,3) AS DISTANCE
          FROM AMI_DEMO.AMI_MART.AMI_METER_ANOMALY_EVENTS
          WHERE IS_ANOMALY ORDER BY DISTANCE DESC LIMIT 15
        `);
      } catch (_e) { /* table may not exist */ }
      return rows.map(r => ({ meter_id: r.METER_ID, ts: r.TS,
        kwh: Number(r.KWH), forecast: Number(r.FORECAST),
        upper_bound: Number(r.UPPER_BOUND), distance: Number(r.DISTANCE) }));
    });
    res.json(data);
  } catch (e) { console.error('anom_meters', e); res.status(500).json({ error: e.message }); }
});

// --- Healthcheck ---------------------------------------------------------
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// --- Static bundle --------------------------------------------------------
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`AMI dashboard listening on ${HOST}:${PORT}`);
});
