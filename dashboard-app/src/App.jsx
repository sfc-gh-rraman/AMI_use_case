import React, { useEffect, useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
         BarChart, Bar, CartesianGrid, Legend, AreaChart, Area,
         ScatterChart, Scatter, ZAxis } from 'recharts'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const TABS = [
  { key: 'ingestion',    label: 'Ingestion' },
  { key: 'dq',           label: 'Data Quality' },
  { key: 'billing',      label: 'Billing' },
  { key: 'tou',          label: 'TOU Charges' },
  { key: 'transformers', label: 'Transformers' },
  { key: 'map',          label: 'Map' },
  { key: 'events',       label: 'Events' },
  { key: 'anomaly',      label: 'Anomalies' },
  { key: 'observability',label: 'Observability' },
  { key: 'intelligence', label: 'Intelligence' },
]

async function api(path) {
  try { const r = await fetch('/api/' + path); if (!r.ok) return null; return await r.json() } catch { return null }
}
async function postApi(path, body) {
  try {
    const r = await fetch('/api/' + path, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!r.ok) return null; return await r.json()
  } catch { return null }
}

const fmt = (n, d = '…') => (n === undefined || n === null || Number.isNaN(Number(n))) ? d : Number(n).toLocaleString()

class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err, info) { console.error(err, info) }
  render() {
    if (this.state.err) return (
      <div style={{ padding: 24, color: '#f2994a' }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Render error.</div>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#8fa0c4' }}>{String(this.state.err)}</pre>
      </div>
    )
    return this.props.children
  }
}

function KpiCard({ label, value, accent }) {
  return (
    <div style={{ background: '#151b30', border: '1px solid #1f2742', borderRadius: 10,
      padding: '18px 22px', minWidth: 180, flex: 1 }}>
      <div style={{ fontSize: 12, color: '#8fa0c4', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent || '#e6edf7', marginTop: 4 }}>{value}</div>
    </div>
  )
}

function Panel({ title, right, children }) {
  return (
    <div style={{ background: '#0f1428', border: '1px solid #1f2742', borderRadius: 10,
      padding: '16px 18px', marginBottom: 16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: '#8fa0c4', textTransform: 'uppercase', letterSpacing: 1 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  )
}

function Empty({ message = 'No data' }) {
  return <div style={{ color: '#667599', fontSize: 13, padding: 20, textAlign: 'center' }}>{message}</div>
}

const TERR_COLOR = { NE: '#4c9aff', SE: '#3dd68c', MW: '#f2994a', W: '#c084fc' }

// ============================ INGESTION ===================================
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
      <Panel title="Reads per hour (last 48h)">
        {series.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={series}>
              <CartesianGrid stroke="#1f2742" />
              <XAxis dataKey="hr" stroke="#8fa0c4" fontSize={11} />
              <YAxis stroke="#8fa0c4" fontSize={11} />
              <Tooltip contentStyle={{ background:'#0b1020', border:'1px solid #1f2742' }} />
              <Legend />
              {['NE','SE','MW','W'].map(t => <Line key={t} type="monotone" dataKey={t} stroke={TERR_COLOR[t]} dot={false} />)}
            </LineChart>
          </ResponsiveContainer>
        )}
      </Panel>
      <Panel title="SLA: % arrived within 15 min (14d)">
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

// ============================ DATA QUALITY ================================
function DqTab() {
  const [dq, setDq] = useState([])
  const [feeders, setFeeders] = useState([])
  useEffect(() => {
    api('dq/daily').then(d => setDq(Array.isArray(d) ? d : []))
    api('dq/worst-feeders').then(d => setFeeders(Array.isArray(d) ? d : []))
  }, [])
  return (
    <div>
      <Panel title="VEE pass rate by territory (14d)">
        {dq.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={dq}>
              <CartesianGrid stroke="#1f2742" />
              <XAxis dataKey="date_key" stroke="#8fa0c4" fontSize={11} />
              <YAxis domain={[90, 100]} stroke="#8fa0c4" fontSize={11} />
              <Tooltip contentStyle={{ background:'#0b1020', border:'1px solid #1f2742' }} />
              <Legend />
              {['NE','SE','MW','W'].map(t => <Line key={t} type="monotone" dataKey={t} stroke={TERR_COLOR[t]} dot={false} />)}
            </LineChart>
          </ResponsiveContainer>
        )}
      </Panel>
      <Panel title="Worst 20 feeders (7d)">
        {feeders.length === 0 ? <Empty /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign:'left', color:'#8fa0c4', borderBottom:'1px solid #1f2742' }}>
              <th style={{ padding:8 }}>Feeder</th><th>Meters</th><th>Completeness %</th>
            </tr></thead>
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
        )}
      </Panel>
    </div>
  )
}

// ============================ BILLING =====================================
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

// ============================ TOU =========================================
function TouTab() {
  const [buckets, setBuckets] = useState([])
  const [daily, setDaily] = useState([])
  useEffect(() => {
    api('tou/bucket-totals').then(d => setBuckets(Array.isArray(d) ? d : []))
    api('tou/daily-revenue').then(d => setDaily(Array.isArray(d) ? d : []))
  }, [])
  return (
    <div>
      <Panel title="Energy charge by TOU bucket (30d)">
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
      <Panel title="Daily TOU revenue (14d)">
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

// ============================ TRANSFORMERS ================================
function TransformersTab() {
  const [summary, setSummary] = useState(null)
  const [topLoaded, setTopLoaded] = useState([])
  const [byTerr, setByTerr] = useState([])
  useEffect(() => {
    api('transformer/summary').then(d => setSummary(d || {}))
    api('transformer/top-loaded').then(d => setTopLoaded(Array.isArray(d) ? d : []))
    api('transformer/by-territory').then(d => setByTerr(Array.isArray(d) ? d : []))
  }, [])
  return (
    <div>
      <div style={{ display:'flex', gap:12, marginBottom:16 }}>
        <KpiCard label="Transformers" value={summary?.xfm_count ? fmt(summary.xfm_count) : '…'} />
        <KpiCard label="Feeders covered" value={summary?.feeder_count ? fmt(summary.feeder_count) : '…'} />
        <KpiCard label="Total kVA" value={summary?.total_kva ? fmt(summary.total_kva) : '…'} accent="#4c9aff" />
      </div>
      <Panel title="Transformer count by territory">
        {byTerr.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byTerr}>
              <CartesianGrid stroke="#1f2742" />
              <XAxis dataKey="territory" stroke="#8fa0c4" />
              <YAxis stroke="#8fa0c4" fontSize={11} />
              <Tooltip contentStyle={{ background:'#0b1020', border:'1px solid #1f2742' }} />
              <Legend />
              <Bar dataKey="xfm_count" fill="#4c9aff" name="Transformers" />
              <Bar dataKey="three_phase" fill="#f2994a" name="3-phase" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
      <Panel title="Top 25 most-stressed transformers (peak kW / kVA, 30d)">
        {topLoaded.length === 0 ? <Empty /> : (
          <div style={{ maxHeight: 380, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ textAlign:'left', color:'#8fa0c4', borderBottom:'1px solid #1f2742' }}>
                <th style={{padding:6}}>Transformer</th><th>Feeder</th><th>kVA</th>
                <th>Meters</th><th>kWh (30d)</th><th>Peak kW</th><th>Load %</th>
              </tr></thead>
              <tbody>
                {topLoaded.map(t => (
                  <tr key={t.transformer_id} style={{ borderBottom:'1px solid #151b30' }}>
                    <td style={{padding:6}}>{t.transformer_id}</td>
                    <td>{t.feeder_id}</td>
                    <td>{fmt(t.kva)}</td>
                    <td>{fmt(t.meters)}</td>
                    <td>{fmt(t.kwh_30d)}</td>
                    <td>{fmt(t.peak_kw)}</td>
                    <td style={{ color: t.load_factor_pct > 80 ? '#f2994a' : '#3dd68c' }}>{t.load_factor_pct}%</td>
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

// ============================ MAP =========================================
function MapTab() {
  const [subs, setSubs] = useState([])
  const [feeders, setFeeders] = useState([])
  useEffect(() => {
    api('geo/substations').then(d => setSubs(Array.isArray(d) ? d : []))
    api('geo/feeder-health').then(d => setFeeders(Array.isArray(d) ? d : []))
  }, [])
  const center = [37.5, -98]
  return (
    <div>
      <Panel title="Substations & feeder health (last 7 days)">
        <div style={{ height: 540 }}>
          <MapContainer center={center} zoom={4} style={{ height: '100%', width: '100%', borderRadius: 8 }}>
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {subs.map(s => (
              <CircleMarker key={s.substation_id} center={[s.lat, s.lon]} radius={7}
                pathOptions={{ color: TERR_COLOR[s.territory] || '#aaa', fillOpacity: 0.7 }}>
                <Popup>
                  <b>{s.substation_id}</b><br/>
                  Territory: {s.territory}<br/>
                  Feeders: {s.feeders}
                </Popup>
              </CircleMarker>
            ))}
            {feeders.map(f => (
              <CircleMarker key={f.feeder_id} center={[f.lat, f.lon]} radius={3}
                pathOptions={{
                  color: f.completeness_pct < 99 ? '#f2994a' : '#3dd68c',
                  fillOpacity: 0.5
                }}>
                <Popup>
                  <b>{f.feeder_id}</b><br/>
                  Territory: {f.territory}<br/>
                  Meters: {f.meters}<br/>
                  Completeness: {f.completeness_pct}%
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
        <div style={{ fontSize: 12, color: '#8fa0c4', marginTop: 8 }}>
          Large markers = substations (colour by territory). Small markers = feeders (green ≥ 99 % complete, orange below).
        </div>
      </Panel>
    </div>
  )
}

// ============================ EVENTS ======================================
function EventsTab() {
  const [summary, setSummary] = useState([])
  const [recent, setRecent] = useState([])
  const [range, setRange] = useState('7d')
  useEffect(() => { api('events/summary').then(d => setSummary(Array.isArray(d) ? d : [])) }, [])
  useEffect(() => { api('events/recent?range=' + range).then(d => setRecent(Array.isArray(d) ? d : [])) }, [range])
  return (
    <div>
      <Panel title="Event volume by type (all time)">
        {summary.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={summary}>
              <CartesianGrid stroke="#1f2742" />
              <XAxis dataKey="event_type" stroke="#8fa0c4" />
              <YAxis stroke="#8fa0c4" fontSize={11} />
              <Tooltip contentStyle={{ background:'#0b1020', border:'1px solid #1f2742' }} />
              <Bar dataKey="count" fill="#f2994a" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
      <Panel title="Recent events" right={
        <div style={{ display:'flex', gap:6 }}>
          {['1d','7d','30d','90d'].map(r => (
            <button key={r} onClick={() => setRange(r)} style={{
              background: range===r?'#1f2742':'transparent', color: range===r?'#e6edf7':'#8fa0c4',
              border: '1px solid #1f2742', borderRadius: 4, padding: '4px 10px', cursor:'pointer', fontSize: 12
            }}>{r}</button>
          ))}
        </div>
      }>
        {recent.length === 0 ? <Empty /> : (
          <div style={{ maxHeight: 480, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ textAlign:'left', color:'#8fa0c4', borderBottom:'1px solid #1f2742' }}>
                <th style={{padding:6}}>Time</th><th>Meter</th><th>Type</th><th>Payload</th>
              </tr></thead>
              <tbody>
                {recent.map((e,i) => (
                  <tr key={i} style={{ borderBottom:'1px solid #151b30' }}>
                    <td style={{padding:6, fontFamily:'monospace'}}>{e.event_ts}</td>
                    <td>{e.meter_id}</td>
                    <td style={{ color: e.event_type==='OUTAGE' ? '#f2994a' : '#8fa0c4' }}>{e.event_type}</td>
                    <td style={{ color:'#667599', fontSize: 11 }}>{e.payload}</td>
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

// ============================ ANOMALY ====================================
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
              <th style={{padding:6}}>Feeder</th><th>Time</th><th>kWh</th><th>Forecast</th><th>Upper</th><th>Distance</th>
            </tr></thead>
            <tbody>
              {top.map((r,i) => (
                <tr key={i} style={{ borderBottom:'1px solid #151b30' }}>
                  <td style={{padding:6}}>{r.feeder_id}</td><td>{r.ts}</td>
                  <td>{r.kwh}</td><td>{r.forecast}</td><td>{r.upper_bound}</td>
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
              <th style={{padding:6}}>Meter</th><th>Time</th><th>kWh</th><th>Forecast</th><th>Upper</th><th>Distance</th>
            </tr></thead>
            <tbody>
              {meters.map((r,i) => (
                <tr key={i} style={{ borderBottom:'1px solid #151b30' }}>
                  <td style={{padding:6}}>{r.meter_id}</td><td>{r.ts}</td>
                  <td>{r.kwh}</td><td>{r.forecast}</td><td>{r.upper_bound}</td>
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

// ============================ OBSERVABILITY ===============================
function ObservabilityTab() {
  const [dt, setDt] = useState([])
  const [audit, setAudit] = useState([])
  useEffect(() => {
    api('observability/dt-refresh').then(d => setDt(Array.isArray(d) ? d : []))
    api('observability/audit').then(d => setAudit(Array.isArray(d) ? d : []))
  }, [])
  return (
    <div>
      <Panel title="Dynamic Table refresh history (latest per DT, last 3d)">
        {dt.length === 0 ? <Empty /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ color:'#8fa0c4', borderBottom:'1px solid #1f2742', textAlign:'left' }}>
              <th style={{padding:6}}>Schema</th><th>Name</th><th>State</th>
              <th>Last refresh</th><th>Duration (s)</th><th>Mode</th>
            </tr></thead>
            <tbody>
              {dt.map((r,i) => (
                <tr key={i} style={{ borderBottom:'1px solid #151b30' }}>
                  <td style={{padding:6, color:'#8fa0c4'}}>{r.schema}</td>
                  <td>{r.name}</td>
                  <td style={{ color: r.state==='SUCCEEDED' ? '#3dd68c' : '#f2994a' }}>{r.state}</td>
                  <td>{r.last_refresh}</td>
                  <td>{r.duration_sec}</td>
                  <td style={{color:'#667599', fontSize:11}}>{r.refresh_action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <Panel title="Pipeline run audit">
        {audit.length === 0 ? <Empty /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ color:'#8fa0c4', borderBottom:'1px solid #1f2742', textAlign:'left' }}>
              <th style={{padding:6}}>Pipeline</th><th>Time</th><th>Status</th>
              <th>Rows</th><th>Errors</th><th>Message</th>
            </tr></thead>
            <tbody>
              {audit.map((r,i) => (
                <tr key={i} style={{ borderBottom:'1px solid #151b30' }}>
                  <td style={{padding:6}}>{r.pipeline_name}</td>
                  <td>{r.start_time}</td>
                  <td style={{ color: r.status==='SUCCESS' ? '#3dd68c' : '#f2994a' }}>{r.status}</td>
                  <td>{fmt(r.rows_processed)}</td>
                  <td>{r.error_count}</td>
                  <td style={{color:'#667599'}}>{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}

// ============================ INTELLIGENCE ================================
function IntelligenceTab() {
  const [q, setQ] = useState('')
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  useEffect(() => { api('intelligence/suggestions').then(d => setSuggestions(Array.isArray(d) ? d : [])) }, [])
  async function ask(question) {
    if (!question.trim()) return
    setBusy(true)
    setHistory(h => [...h, { role: 'user', text: question }])
    setQ('')
    const res = await postApi('intelligence/ask', { question })
    setHistory(h => [...h, { role: 'agent', ...(res || { answer: 'No response.' }) }])
    setBusy(false)
  }
  return (
    <div>
      <Panel title="Snowflake Intelligence — Cortex Agent over AMI">
        <div style={{ fontSize: 12, color: '#8fa0c4', marginBottom: 12 }}>
          Combines text-to-SQL on the AMI semantic view + Cortex Search over the operations knowledge base.
        </div>
        <div style={{ display:'flex', gap: 8, marginBottom: 12 }}>
          <input value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ask(q)}
            placeholder="Ask anything about AMI: kWh, anomalies, billing, runbooks..."
            style={{ flex: 1, background:'#0b1020', color:'#e6edf7', border:'1px solid #1f2742',
              borderRadius: 6, padding: '10px 12px', fontSize: 14 }} />
          <button onClick={() => ask(q)} disabled={busy} style={{
            background: '#4c9aff', border: 0, borderRadius: 6, color: '#fff',
            padding: '10px 18px', cursor: busy?'wait':'pointer', fontSize: 14
          }}>{busy ? 'Asking…' : 'Ask'}</button>
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap: 6, marginBottom: 16 }}>
          {suggestions.map((s,i) => (
            <button key={i} onClick={() => ask(s)} disabled={busy} style={{
              background: '#151b30', border:'1px solid #1f2742', borderRadius: 16,
              color: '#8fa0c4', padding: '4px 12px', fontSize: 11, cursor:'pointer'
            }}>{s}</button>
          ))}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap: 12 }}>
          {history.map((m,i) => (
            <div key={i} style={{
              background: m.role==='user' ? '#1f2742' : '#0b1020',
              border: '1px solid #1f2742', borderRadius: 8, padding: 12,
              alignSelf: m.role==='user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%'
            }}>
              <div style={{ fontSize: 10, color:'#667599', textTransform:'uppercase', letterSpacing:1, marginBottom: 4 }}>
                {m.role === 'user' ? 'You' : 'AMI Intelligence'}
              </div>
              {m.role === 'user' ? (
                <div style={{ fontSize: 14 }}>{m.text}</div>
              ) : (
                <>
                  {m.answer && <div style={{ fontSize: 14, whiteSpace:'pre-wrap', marginBottom: 8 }}>{m.answer}</div>}
                  {m.sql && (
                    <details style={{ marginBottom: 8 }}>
                      <summary style={{ color:'#8fa0c4', fontSize: 11, cursor:'pointer' }}>SQL</summary>
                      <pre style={{ background:'#000', padding: 8, borderRadius: 4, fontSize: 11, overflow:'auto', color:'#3dd68c' }}>{m.sql}</pre>
                    </details>
                  )}
                  {m.rows && m.rows.length > 0 && (
                    <div style={{ overflow:'auto', maxHeight: 300 }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize: 12 }}>
                        <thead><tr style={{ color:'#8fa0c4', borderBottom:'1px solid #1f2742' }}>
                          {Object.keys(m.rows[0]).map(k => <th key={k} style={{padding:4, textAlign:'left'}}>{k}</th>)}
                        </tr></thead>
                        <tbody>
                          {m.rows.map((r,j) => (
                            <tr key={j} style={{ borderBottom:'1px solid #151b30' }}>
                              {Object.values(r).map((v,k) => <td key={k} style={{padding:4}}>{String(v)}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {m.citations && m.citations.length > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1f2742' }}>
                      <div style={{ fontSize: 10, color:'#667599', marginBottom: 4 }}>Sources</div>
                      {m.citations.map((c,j) => (
                        <div key={j} style={{ fontSize: 11, color:'#8fa0c4', marginBottom: 4 }}>
                          <b>{c.title}</b> — {c.snippet}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          {history.length === 0 && (
            <div style={{ color: '#667599', fontSize: 13, padding: 20, textAlign:'center' }}>
              Ask a question to get started, or click a suggestion above.
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}

// ============================ APP ROOT ====================================
export default function App() {
  const [tab, setTab] = useState('ingestion')
  const Active = useMemo(() => ({
    ingestion: IngestionTab, dq: DqTab, billing: BillingTab, tou: TouTab,
    transformers: TransformersTab, map: MapTab, events: EventsTab,
    anomaly: AnomalyTab, observability: ObservabilityTab, intelligence: IntelligenceTab
  }[tab]), [tab])
  return (
    <ErrorBoundary>
      <div style={{ minHeight: '100vh', padding: '24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 0.5 }}>AMI 2.0 Command Center</div>
            <div style={{ fontSize: 13, color: '#8fa0c4' }}>100K meters · 10.6B channel intervals · Snowflake-native</div>
          </div>
          <div style={{ fontSize: 12, color: '#667599' }}>Dynamic Tables · Cortex ML · DMFs · Cortex Agent</div>
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid #1f2742', flexWrap:'wrap' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              background: tab === t.key ? '#151b30' : 'transparent',
              color: tab === t.key ? '#e6edf7' : '#8fa0c4',
              border: 0, borderBottom: tab === t.key ? '2px solid #4c9aff' : '2px solid transparent',
              padding: '10px 14px', cursor: 'pointer', fontSize: 13,
            }}>{t.label}</button>
          ))}
        </div>
        <ErrorBoundary>{Active && <Active />}</ErrorBoundary>
      </div>
    </ErrorBoundary>
  )
}
