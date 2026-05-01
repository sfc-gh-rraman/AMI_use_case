import React, { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
         BarChart, Bar, CartesianGrid, Legend, AreaChart, Area } from 'recharts'

const TABS = [
  { key: 'ingestion', label: 'Ingestion' },
  { key: 'dq',        label: 'Data Quality' },
  { key: 'billing',   label: 'Billing' },
  { key: 'tou',       label: 'TOU Charges' },
  { key: 'anomaly',   label: 'Anomalies' },
]

async function api(path) {
  try {
    const r = await fetch('/api/' + path)
    if (!r.ok) return null
    return await r.json()
  } catch (_e) { return null }
}

const fmt = (n, dflt = '…') => (n === undefined || n === null || Number.isNaN(Number(n))) ? dflt : Number(n).toLocaleString()

class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err, info) { console.error(err, info) }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 24, color: '#f2994a' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Something broke while rendering.</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#8fa0c4' }}>{String(this.state.err)}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

function KpiCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: '#151b30', border: '1px solid #1f2742', borderRadius: 10,
      padding: '18px 22px', minWidth: 180, flex: 1
    }}>
      <div style={{ fontSize: 12, color: '#8fa0c4', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent || '#e6edf7', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#667599', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <div style={{
      background: '#0f1428', border: '1px solid #1f2742', borderRadius: 10,
      padding: '16px 18px', marginBottom: 16
    }}>
      <div style={{ fontSize: 13, color: '#8fa0c4', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}

function Empty({ message = 'No data' }) {
  return <div style={{ color: '#667599', fontSize: 13, padding: 20, textAlign: 'center' }}>{message}</div>
}

function IngestionTab() {
  const [kpi, setKpi] = useState(null)
  const [series, setSeries] = useState([])
  const [sla, setSla] = useState([])
  useEffect(() => {
    api('ingestion/kpi').then(d => setKpi(d || {}))
    api('ingestion/hourly').then(d => setSeries(Array.isArray(d) ? d : []))
    api('ingestion/sla').then(d => setSla(Array.isArray(d) ? d : []))
  }, [])
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <KpiCard label="Total interval rows" value={kpi?.interval_rows ? (kpi.interval_rows/1e9).toFixed(2) + 'B' : '…'} />
        <KpiCard label="Distinct meters" value={kpi?.meters ? fmt(kpi.meters) : '…'} />
        <KpiCard label="Avg on-time %" value={kpi?.on_time !== undefined ? kpi.on_time + '%' : '…'} accent="#3dd68c" />
        <KpiCard label="Late arrivals (1d)" value={kpi?.late_1d !== undefined ? fmt(kpi.late_1d) : '…'} accent="#f2994a" />
      </div>
      <Panel title="Reads per hour (last 48h) by territory">
        {series.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={series}>
              <CartesianGrid stroke="#1f2742" />
              <XAxis dataKey="hr" stroke="#8fa0c4" fontSize={11} />
              <YAxis stroke="#8fa0c4" fontSize={11} />
              <Tooltip contentStyle={{ background:'#0b1020', border:'1px solid #1f2742' }} />
              <Legend />
              <Line type="monotone" dataKey="NE" stroke="#4c9aff" dot={false} />
              <Line type="monotone" dataKey="SE" stroke="#3dd68c" dot={false} />
              <Line type="monotone" dataKey="MW" stroke="#f2994a" dot={false} />
              <Line type="monotone" dataKey="W"  stroke="#c084fc" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Panel>
      <Panel title="SLA: % arrived within 15 min (last 14d)">
        {sla.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={sla}>
              <CartesianGrid stroke="#1f2742" />
              <XAxis dataKey="date_key" stroke="#8fa0c4" fontSize={11} />
              <YAxis domain={[80, 100]} stroke="#8fa0c4" fontSize={11} />
              <Tooltip contentStyle={{ background:'#0b1020', border:'1px solid #1f2742' }} />
              <Area type="monotone" dataKey="pct_on_time" stroke="#3dd68c" fill="#3dd68c33" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  )
}

function DqTab() {
  const [dq, setDq] = useState([])
  const [feeders, setFeeders] = useState([])
  useEffect(() => {
    api('dq/daily').then(d => setDq(Array.isArray(d) ? d : []))
    api('dq/worst-feeders').then(d => setFeeders(Array.isArray(d) ? d : []))
  }, [])
  return (
    <div>
      <Panel title="VEE pass rate by territory (last 14d)">
        {dq.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={dq}>
              <CartesianGrid stroke="#1f2742" />
              <XAxis dataKey="date_key" stroke="#8fa0c4" fontSize={11} />
              <YAxis domain={[90, 100]} stroke="#8fa0c4" fontSize={11} />
              <Tooltip contentStyle={{ background:'#0b1020', border:'1px solid #1f2742' }} />
              <Legend />
              <Line type="monotone" dataKey="NE" stroke="#4c9aff" dot={false} />
              <Line type="monotone" dataKey="SE" stroke="#3dd68c" dot={false} />
              <Line type="monotone" dataKey="MW" stroke="#f2994a" dot={false} />
              <Line type="monotone" dataKey="W"  stroke="#c084fc" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Panel>
      <Panel title="Worst 20 feeders by completeness (last 7d)">
        {feeders.length === 0 ? <Empty /> : (
          <div style={{ maxHeight: 340, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign:'left', color:'#8fa0c4', borderBottom:'1px solid #1f2742' }}>
                  <th style={{ padding:8 }}>Feeder</th><th>Meters</th><th>Completeness %</th>
                </tr>
              </thead>
              <tbody>
                {feeders.map(f => (
                  <tr key={f.feeder_id} style={{ borderBottom:'1px solid #151b30' }}>
                    <td style={{ padding:8 }}>{f.feeder_id}</td>
                    <td>{f.meters}</td>
                    <td style={{ color: f.completeness_pct < 99 ? '#f2994a' : '#3dd68c' }}>{f.completeness_pct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

function BillingTab() {
  const [stats, setStats] = useState(null)
  const [periods, setPeriods] = useState([])
  useEffect(() => {
    api('billing/stats').then(d => setStats(d || {}))
    api('billing/by-period').then(d => setPeriods(Array.isArray(d) ? d : []))
  }, [])
  return (
    <div>
      <div style={{ display:'flex', gap:12, marginBottom:16 }}>
        <KpiCard label="Billing periods" value={stats?.total !== undefined ? fmt(stats.total) : '…'} />
        <KpiCard label="Ready to bill" value={stats?.ready !== undefined ? fmt(stats.ready) : '…'} accent="#3dd68c" />
        <KpiCard label="Ready %" value={stats?.pct_ready !== undefined ? stats.pct_ready + '%' : '…'} />
      </div>
      <Panel title="Billing readiness by period start">
        {periods.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={periods}>
              <CartesianGrid stroke="#1f2742" />
              <XAxis dataKey="start_date" stroke="#8fa0c4" fontSize={10} />
              <YAxis stroke="#8fa0c4" fontSize={11} />
              <Tooltip contentStyle={{ background:'#0b1020', border:'1px solid #1f2742' }} />
              <Legend />
              <Bar dataKey="ready" stackId="a" fill="#3dd68c" name="Ready" />
              <Bar dataKey="not_ready" stackId="a" fill="#f2994a" name="Not ready" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  )
}

function TouTab() {
  const [buckets, setBuckets] = useState([])
  const [daily, setDaily] = useState([])
  useEffect(() => {
    api('tou/bucket-totals').then(d => setBuckets(Array.isArray(d) ? d : []))
    api('tou/daily-revenue').then(d => setDaily(Array.isArray(d) ? d : []))
  }, [])
  return (
    <div>
      <Panel title="Energy charge by TOU bucket (last 30d)">
        {buckets.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={buckets}>
              <CartesianGrid stroke="#1f2742" />
              <XAxis dataKey="tou_bucket" stroke="#8fa0c4" />
              <YAxis stroke="#8fa0c4" fontSize={11} />
              <Tooltip contentStyle={{ background:'#0b1020', border:'1px solid #1f2742' }} />
              <Bar dataKey="energy_charge" fill="#4c9aff" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
      <Panel title="Daily TOU revenue (last 14d)">
        {daily.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={daily}>
              <CartesianGrid stroke="#1f2742" />
              <XAxis dataKey="day" stroke="#8fa0c4" fontSize={11} />
              <YAxis stroke="#8fa0c4" fontSize={11} />
              <Tooltip contentStyle={{ background:'#0b1020', border:'1px solid #1f2742' }} />
              <Legend />
              <Line type="monotone" dataKey="energy" stroke="#4c9aff" name="Energy $" dot={false} />
              <Line type="monotone" dataKey="demand" stroke="#f2994a" name="Demand $" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  )
}

function AnomalyTab() {
  const [kpi, setKpi] = useState(null)
  const [top, setTop] = useState([])
  const [meters, setMeters] = useState([])
  useEffect(() => {
    api('anomaly/kpi').then(d => setKpi(d || {}))
    api('anomaly/top-feeders').then(d => setTop(Array.isArray(d) ? d : []))
    api('anomaly/top-meters').then(d => setMeters(Array.isArray(d) ? d : []))
  }, [])
  return (
    <div>
      <div style={{ display:'flex', gap:12, marginBottom:16 }}>
        <KpiCard label="Feeder rows scored" value={kpi?.scored !== undefined ? fmt(kpi.scored) : '…'} />
        <KpiCard label="Feeder anomalies" value={kpi?.feeder_anomalies !== undefined ? fmt(kpi.feeder_anomalies) : '…'} accent="#f2994a" />
        <KpiCard label="Meter anomalies (CNI)" value={kpi?.meter_anomalies !== undefined ? fmt(kpi.meter_anomalies) : '…'} accent="#f2994a" />
      </div>
      <Panel title="Top 15 feeder anomalies">
        {top.length === 0 ? <Empty /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ color:'#8fa0c4', borderBottom:'1px solid #1f2742', textAlign:'left' }}>
              <th style={{padding:6}}>Feeder</th><th>Timestamp</th><th>KWh</th><th>Forecast</th><th>Upper</th><th>Distance</th>
            </tr></thead>
            <tbody>
              {top.map((r,i) => (
                <tr key={i} style={{ borderBottom:'1px solid #151b30' }}>
                  <td style={{padding:6}}>{r.feeder_id}</td>
                  <td>{r.ts}</td><td>{r.kwh}</td><td>{r.forecast}</td><td>{r.upper_bound}</td>
                  <td style={{ color:'#f2994a' }}>{r.distance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <Panel title="Top 15 per-meter anomalies (CNI sample)">
        {meters.length === 0 ? <Empty /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ color:'#8fa0c4', borderBottom:'1px solid #1f2742', textAlign:'left' }}>
              <th style={{padding:6}}>Meter</th><th>Timestamp</th><th>KWh</th><th>Forecast</th><th>Upper</th><th>Distance</th>
            </tr></thead>
            <tbody>
              {meters.map((r,i) => (
                <tr key={i} style={{ borderBottom:'1px solid #151b30' }}>
                  <td style={{padding:6}}>{r.meter_id}</td>
                  <td>{r.ts}</td><td>{r.kwh}</td><td>{r.forecast}</td><td>{r.upper_bound}</td>
                  <td style={{ color:'#f2994a' }}>{r.distance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('ingestion')
  return (
    <ErrorBoundary>
      <div style={{ minHeight: '100vh', padding: '24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 0.5 }}>AMI 2.0 Command Center</div>
            <div style={{ fontSize: 13, color: '#8fa0c4' }}>100K meters · 3.5B intervals · Snowflake-native</div>
          </div>
          <div style={{ fontSize: 12, color: '#667599' }}>Powered by Dynamic Tables, Cortex ML, DMFs</div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, borderBottom: '1px solid #1f2742' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                background: tab === t.key ? '#151b30' : 'transparent',
                color: tab === t.key ? '#e6edf7' : '#8fa0c4',
                border: 0, borderBottom: tab === t.key ? '2px solid #4c9aff' : '2px solid transparent',
                padding: '10px 16px', cursor: 'pointer', fontSize: 14,
              }}>{t.label}</button>
          ))}
        </div>
        <ErrorBoundary>
          {tab === 'ingestion' && <IngestionTab />}
          {tab === 'dq'        && <DqTab />}
          {tab === 'billing'   && <BillingTab />}
          {tab === 'tou'       && <TouTab />}
          {tab === 'anomaly'   && <AnomalyTab />}
        </ErrorBoundary>
      </div>
    </ErrorBoundary>
  )
}
