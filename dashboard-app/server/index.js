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

// --- Transformers ---------------------------------------------------------
app.get('/api/transformer/summary', async (_req, res) => {
  try {
    const data = await cached('xfm_summary', 600, async () => {
      const [r] = await runQuery(`
        SELECT COUNT(*) AS XFM_COUNT,
               COUNT(DISTINCT FEEDER_ID) AS FEEDER_COUNT,
               SUM(KVA_RATING) AS TOTAL_KVA
        FROM AMI_DEMO.AMI_CURATED.TRANSFORMER`);
      return { xfm_count: Number(r?.XFM_COUNT ?? 0),
               feeder_count: Number(r?.FEEDER_COUNT ?? 0),
               total_kva: Number(r?.TOTAL_KVA ?? 0) };
    });
    res.json(data);
  } catch (e) { console.error('xfm_summary', e); res.status(500).json({ error: e.message }); }
});

app.get('/api/transformer/top-loaded', async (_req, res) => {
  try {
    const data = await cached('xfm_top_loaded', 600, async () => {
      const anchor = await dataAnchor();
      const rows = await runQuery(`
        SELECT t.TRANSFORMER_ID, t.FEEDER_ID, t.KVA_RATING,
               COUNT(DISTINCT sp.SERVICE_POINT_ID) AS METERS,
               SUM(d.KWH_DELIVERED)::NUMBER(14,2) AS KWH_30D,
               MAX(d.MAX_DEMAND_KW)::NUMBER(10,2) AS PEAK_KW,
               (MAX(d.MAX_DEMAND_KW) / NULLIF(t.KVA_RATING, 0) * 100)::NUMBER(5,1) AS LOAD_FACTOR_PCT
        FROM AMI_DEMO.AMI_CURATED.TRANSFORMER t
        JOIN AMI_DEMO.AMI_CURATED.SERVICE_POINT sp USING (TRANSFORMER_ID)
        JOIN AMI_DEMO.AMI_CURATED.METER m USING (SERVICE_POINT_ID)
        JOIN AMI_DEMO.AMI_CURATED.DT_DAILY_ROLLUP d USING (METER_ID)
        WHERE d.ROLLUP_TS >= DATEADD(day,-30,'${anchor}')
          AND d.ROLLUP_TS <= '${anchor}'
        GROUP BY t.TRANSFORMER_ID, t.FEEDER_ID, t.KVA_RATING
        ORDER BY LOAD_FACTOR_PCT DESC NULLS LAST LIMIT 25`);
      return rows.map(r => ({ transformer_id: r.TRANSFORMER_ID, feeder_id: r.FEEDER_ID,
        kva: Number(r.KVA_RATING), meters: Number(r.METERS),
        kwh_30d: Number(r.KWH_30D), peak_kw: Number(r.PEAK_KW),
        load_factor_pct: Number(r.LOAD_FACTOR_PCT) }));
    });
    res.json(data);
  } catch (e) { console.error('xfm_top_loaded', e); res.status(500).json({ error: e.message }); }
});

app.get('/api/transformer/by-territory', async (_req, res) => {
  try {
    const data = await cached('xfm_territory', 600, async () => {
      const rows = await runQuery(`
        SELECT f.UTILITY_TERRITORY AS TERRITORY,
               COUNT(*) AS XFM_COUNT,
               SUM(t.KVA_RATING) AS TOTAL_KVA,
               SUM(CASE WHEN t.PHASE='THREE' THEN 1 ELSE 0 END) AS THREE_PHASE
        FROM AMI_DEMO.AMI_CURATED.TRANSFORMER t
        JOIN AMI_DEMO.AMI_CURATED.FEEDER f USING (FEEDER_ID)
        GROUP BY f.UTILITY_TERRITORY ORDER BY f.UTILITY_TERRITORY`);
      return rows.map(r => ({ territory: r.TERRITORY,
        xfm_count: Number(r.XFM_COUNT),
        total_kva: Number(r.TOTAL_KVA),
        three_phase: Number(r.THREE_PHASE) }));
    });
    res.json(data);
  } catch (e) { console.error('xfm_territory', e); res.status(500).json({ error: e.message }); }
});

// --- Geographic / Equipment Map ------------------------------------------
app.get('/api/geo/substations', async (_req, res) => {
  try {
    const data = await cached('geo_subs', 3600, async () => {
      const rows = await runQuery(`
        SELECT SUBSTATION_ID, UTILITY_TERRITORY, LAT, LON,
               (SELECT COUNT(*) FROM AMI_DEMO.AMI_CURATED.FEEDER f
                WHERE f.SUBSTATION_ID = s.SUBSTATION_ID) AS FEEDER_COUNT
        FROM AMI_DEMO.AMI_CURATED.SUBSTATION s`);
      return rows.map(r => ({ substation_id: r.SUBSTATION_ID, territory: r.UTILITY_TERRITORY,
        lat: Number(r.LAT), lon: Number(r.LON), feeders: Number(r.FEEDER_COUNT) }));
    });
    res.json(data);
  } catch (e) { console.error('geo_subs', e); res.status(500).json({ error: e.message }); }
});

app.get('/api/geo/feeder-health', async (_req, res) => {
  try {
    const data = await cached('geo_feeder_health', 600, async () => {
      const anchor = await dataAnchor();
      const rows = await runQuery(`
        SELECT sp.FEEDER_ID, f.UTILITY_TERRITORY,
               AVG(sp.LAT)::NUMBER(9,6) AS LAT, AVG(sp.LON)::NUMBER(9,6) AS LON,
               COUNT(DISTINCT sp.SERVICE_POINT_ID) AS METERS,
               (COUNT(*) / (96.0 * 7 * COUNT(DISTINCT i.METER_ID)) * 100)::NUMBER(5,2) AS COMPLETENESS_PCT
        FROM AMI_DEMO.AMI_CURATED.SERVICE_POINT sp
        JOIN AMI_DEMO.AMI_CURATED.FEEDER f USING (FEEDER_ID)
        JOIN AMI_DEMO.AMI_CURATED.METER m USING (SERVICE_POINT_ID)
        JOIN AMI_DEMO.AMI_CURATED.INTERVAL_READ_15MIN i USING (METER_ID)
        WHERE i.READ_TS >= DATEADD(day,-7,'${anchor}')
          AND i.READ_TS <= TO_TIMESTAMP('${anchor}' || ' 23:59:59')
        GROUP BY sp.FEEDER_ID, f.UTILITY_TERRITORY LIMIT 500`);
      return rows.map(r => ({ feeder_id: r.FEEDER_ID, territory: r.UTILITY_TERRITORY,
        lat: Number(r.LAT), lon: Number(r.LON),
        meters: Number(r.METERS), completeness_pct: Number(r.COMPLETENESS_PCT) }));
    });
    res.json(data);
  } catch (e) { console.error('geo_feeder', e); res.status(500).json({ error: e.message }); }
});

// --- Events ---------------------------------------------------------------
app.get('/api/events/summary', async (_req, res) => {
  try {
    const data = await cached('events_summary', 300, async () => {
      const rows = await runQuery(`
        SELECT EVENT_TYPE, COUNT(*) AS C
        FROM AMI_DEMO.AMI_RAW.METER_EVENT
        GROUP BY EVENT_TYPE ORDER BY C DESC`);
      return rows.map(r => ({ event_type: r.EVENT_TYPE, count: Number(r.C) }));
    });
    res.json(data);
  } catch (e) { console.error('events_summary', e); res.status(500).json({ error: e.message }); }
});

app.get('/api/events/recent', async (req, res) => {
  try {
    const range = req.query.range === '1d' ? 1 :
                  req.query.range === '30d' ? 30 :
                  req.query.range === '90d' ? 90 : 7;
    const key = 'events_recent_' + range;
    const data = await cached(key, 120, async () => {
      const anchor = await dataAnchor();
      const rows = await runQuery(`
        SELECT EVENT_ID, METER_ID, EVENT_TYPE,
               TO_VARCHAR(EVENT_TS,'YYYY-MM-DD HH24:MI') AS EVENT_TS,
               EVENT_PAYLOAD::STRING AS PAYLOAD
        FROM AMI_DEMO.AMI_RAW.METER_EVENT
        WHERE EVENT_TS >= DATEADD(day,-${range},'${anchor}')
        ORDER BY EVENT_TS DESC LIMIT 100`);
      return rows.map(r => ({ event_id: r.EVENT_ID, meter_id: r.METER_ID,
        event_type: r.EVENT_TYPE, event_ts: r.EVENT_TS, payload: r.PAYLOAD }));
    });
    res.json(data);
  } catch (e) { console.error('events_recent', e); res.status(500).json({ error: e.message }); }
});

// --- Observability extras ------------------------------------------------
app.get('/api/observability/dt-refresh', async (_req, res) => {
  try {
    const data = await cached('obs_dt', 120, async () => {
      const rows = await runQuery(`
        SELECT NAME, SCHEMA_NAME, STATE,
               TO_VARCHAR(REFRESH_END_TIME,'MM-DD HH24:MI') AS LAST_REFRESH,
               DATEDIFF(second, REFRESH_START_TIME, REFRESH_END_TIME) AS DURATION_SEC,
               REFRESH_ACTION
        FROM TABLE(AMI_DEMO.INFORMATION_SCHEMA.DYNAMIC_TABLE_REFRESH_HISTORY(
          DATA_TIMESTAMP_START => DATEADD(day, -3, CURRENT_TIMESTAMP())))
        QUALIFY ROW_NUMBER() OVER (PARTITION BY NAME ORDER BY REFRESH_END_TIME DESC) = 1
        ORDER BY NAME LIMIT 50`);
      return rows.map(r => ({ name: r.NAME, schema: r.SCHEMA_NAME, state: r.STATE,
        last_refresh: r.LAST_REFRESH, duration_sec: Number(r.DURATION_SEC),
        refresh_action: r.REFRESH_ACTION }));
    });
    res.json(data);
  } catch (e) { console.error('obs_dt', e); res.status(500).json({ error: e.message }); }
});

app.get('/api/observability/audit', async (_req, res) => {
  try {
    const data = await cached('obs_audit', 120, async () => {
      const rows = await runQuery(`
        SELECT PIPELINE_NAME,
               TO_VARCHAR(START_TIME,'MM-DD HH24:MI') AS START_TIME,
               STATUS, ROWS_PROCESSED, ERROR_COUNT, MESSAGE
        FROM AMI_DEMO.AMI_OBSERVABILITY.PIPELINE_RUN_AUDIT
        ORDER BY START_TIME DESC LIMIT 30`);
      return rows.map(r => ({ pipeline_name: r.PIPELINE_NAME, start_time: r.START_TIME,
        status: r.STATUS, rows_processed: Number(r.ROWS_PROCESSED ?? 0),
        error_count: Number(r.ERROR_COUNT ?? 0), message: r.MESSAGE }));
    });
    res.json(data);
  } catch (e) { console.error('obs_audit', e); res.status(500).json({ error: e.message }); }
});

// --- Snowflake Intelligence (Agent + Search) ------------------------------
app.post('/api/intelligence/ask', express.json(), async (req, res) => {
  try {
    const question = (req.body && req.body.question) || '';
    if (!question) return res.json({ answer: '', sql: '', rows: [], citations: [] });

    const inSpcs = fs.existsSync('/snowflake/session/token');
    if (!inSpcs) {
      return res.json({ answer: 'Cortex Agent requires SPCS OAuth token (not available locally).', sql: '', rows: [], citations: [] });
    }
    const account = process.env.SNOWFLAKE_ACCOUNT;
    const host    = process.env.SNOWFLAKE_HOST || (account + '.snowflakecomputing.com');
    const token   = fs.readFileSync('/snowflake/session/token', 'utf8');

    const url = `https://${host}/api/v2/databases/AMI_DEMO/schemas/AMI_MART/agents/AMI_INTELLIGENCE_AGENT:run`;
    const body = { messages: [{ role: 'user', content: [{ type: 'text', text: question }] }] };

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Snowflake-Authorization-Token-Type': 'OAUTH'
      },
      body: JSON.stringify(body)
    });
    const txt = await r.text();
    if (!r.ok) {
      return res.json({ answer: 'Agent error: ' + txt.slice(0, 500), sql: '', rows: [], citations: [] });
    }

    // The agent returns SSE-style streaming or JSON object; handle both.
    let answer = '', sql = '', citations = [];
    try {
      // Try to parse SSE event lines
      for (const line of txt.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const json = line.slice(5).trim();
        if (!json || json === '[DONE]') continue;
        try {
          const ev = JSON.parse(json);
          const delta = ev?.delta?.content || ev?.content || [];
          for (const c of (Array.isArray(delta) ? delta : [delta])) {
            if (c?.type === 'text' && c.text) answer += c.text;
            if (c?.type === 'tool_results' && c?.tool_results?.content) {
              for (const tr of c.tool_results.content) {
                if (tr?.type === 'json') {
                  if (tr.json?.sql) sql = tr.json.sql;
                  if (Array.isArray(tr.json?.searchResults)) {
                    for (const sr of tr.json.searchResults) {
                      citations.push({ title: sr.title || sr.doc_id, snippet: (sr.text || '').slice(0,200) });
                    }
                  }
                }
              }
            }
          }
        } catch (_e) { /* skip malformed line */ }
      }
    } catch (_e) {/* fall through */}

    let rows = [];
    if (sql) {
      try { rows = await runQuery(sql); } catch (_e) { rows = []; }
    }
    res.json({ answer: answer.trim(), sql, rows: rows.slice(0, 25), citations });
  } catch (e) {
    console.error('intelligence', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/intelligence/suggestions', (_req, res) => {
  res.json([
    'What is the total kWh by territory in the last month?',
    'Which feeders have the worst data quality?',
    'How many billing periods are not ready to bill?',
    'Show me total energy charges by TOU bucket.',
    'Which territories have the most anomalies?',
    'Explain the outage response runbook.',
    'What is the billing readiness criteria?',
    'Describe the SCE tariff hierarchy.',
  ]);
});

// --- Static bundle --------------------------------------------------------
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`AMI dashboard listening on ${HOST}:${PORT}`);
});
