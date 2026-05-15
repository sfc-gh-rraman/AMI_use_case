import { useEffect, useState } from 'react'
import {
  AlertTriangle, Copy, RefreshCw, MapPin, Activity, Clock, CheckCircle2,
  XCircle, ArrowRight, Sparkles, Zap, Database
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell
} from 'recharts'
import { api, fmt, TERR_COLOR } from '../components/api'
import { KpiCard, Panel, Empty, Loading, yPadDomain, yAbbr } from '../components/UI'

const STATUS_COLOR = { VALID: '#3fb950', ESTIMATED: '#d29922', FAILED: '#f85149' }
const TYPE_COLOR   = { RES: '#58a6ff', SMB: '#a371f7', CNI: '#f78166' }

export default function EdgeCases() {
  const [kpi, setKpi]     = useState(null)
  const [miss, setMiss]   = useState(null)
  const [dupes, setDupes] = useState(null)
  const [est, setEst]     = useState(null)
  const [prem, setPrem]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api('edge/kpi'), api('edge/missing-intervals'),
      api('edge/duplicates'), api('edge/estimate-actual'),
      api('edge/meter-premise'),
    ]).then(([k, m, d, e, p]) => {
      setKpi(k); setMiss(m); setDupes(d); setEst(e); setPrem(p); setLoading(false)
    })
  }, [])

  if (loading) return <div className="p-6"><Loading/></div>

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
          <AlertTriangle size={26} className="text-atlas-yellow"/>
          AMI Edge Cases
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Real-world ingestion edge cases — missing intervals, duplicates, estimate substitution,
          and meter-to-premise mis-mapping — surfaced live from the canonical fact and observability layer.
        </p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Partial meters (24h)"       value={fmt(kpi?.partial_meters_24h)}  sub="< 96 intervals"
          accent="text-atlas-yellow" icon={Clock}/>
        <KpiCard label="Severe (24h)"                value={fmt(kpi?.severe_meters_24h)}    sub="< 48 intervals"
          accent="text-atlas-red" icon={AlertTriangle}/>
        <KpiCard label="Duplicates resolved"         value={fmt(kpi?.duplicates_resolved)}  sub="last-write-wins MERGE"
          accent="text-atlas-cyan" icon={Copy}/>
        <KpiCard label="Estimated reads (7d)"        value={fmt(kpi?.estimated_7d)}         sub="VEE_STATUS = ESTIMATED"
          accent="text-atlas-yellow" icon={RefreshCw}/>
        <KpiCard label="Failed reads (7d)"           value={fmt(kpi?.failed_7d)}            sub="VEE_STATUS = FAILED"
          accent="text-atlas-red" icon={XCircle}/>
        <KpiCard label="Mapping mismatches"          value={fmt(kpi?.mapping_issues)}       sub="meter ↔ premise"
          accent="text-atlas-purple" icon={MapPin}/>
      </div>

      {/* 1. Missing & late intervals */}
      <Panel title="1 · Missing & late intervals" right={
        <span className="text-[11px] text-slate-500">
          Latency = INGESTED_AT − READ_TS · daily target = 96 / meter
        </span>
      }>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-slate-500 mb-2">Ingestion-lag distribution (sampled)</div>
            <div className="h-48">
              <ResponsiveContainer>
                <BarChart data={miss?.histogram || []} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid stroke="#1e2937" strokeDasharray="3 3"/>
                  <XAxis dataKey="bucket" stroke="#9ca3af" fontSize={11}/>
                  <YAxis stroke="#9ca3af" fontSize={11} tickFormatter={yAbbr}/>
                  <Tooltip contentStyle={{ background:'#0d1117', border:'1px solid #30363d' }}
                    formatter={(v) => fmt(v)}/>
                  <Bar dataKey="n" fill="#58a6ff" radius={[4,4,0,0]}>
                    {(miss?.histogram || []).map((b, i) => (
                      <Cell key={i} fill={
                        b.bucket === '>28h' ? '#f85149'
                        : b.bucket === '24-28h' ? '#d29922'
                        : b.bucket === '4-24h' ? '#58a6ff' : '#3fb950'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Red bins ({'>'} 24h) trigger billing-readiness exposure. The platform's MERGE-on-conflict
              ingest pattern accepts late arrivals at any latency without re-running upstream.
            </p>
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-2">
              Top 25 meters with partial intervals (last 24h)
            </div>
            <div className="overflow-y-auto max-h-[240px] border border-navy-700/50 rounded">
              <table className="w-full text-xs">
                <thead className="bg-navy-800 sticky top-0">
                  <tr className="text-slate-400">
                    <th className="text-left p-2">Meter</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-left p-2">Terr</th>
                    <th className="text-right p-2">Got</th>
                    <th className="text-right p-2">Missing</th>
                  </tr>
                </thead>
                <tbody>
                  {(miss?.top || []).map((r, i) => (
                    <tr key={i} className="border-t border-navy-700/40 hover:bg-navy-800/40">
                      <td className="p-2 font-mono text-slate-300">{r.meter_id}</td>
                      <td className="p-2"><Pill text={r.meter_type} color={TYPE_COLOR[r.meter_type]}/></td>
                      <td className="p-2 text-slate-400">{r.territory}</td>
                      <td className="p-2 text-right font-mono text-slate-300">{r.intervals_24h}</td>
                      <td className="p-2 text-right font-mono text-atlas-red">{r.missing_24h}</td>
                    </tr>
                  ))}
                  {(!miss?.top || miss.top.length === 0) && (
                    <tr><td colSpan="5" className="p-4 text-center text-slate-500">No partial meters</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Panel>

      {/* 2. Duplicates */}
      <Panel title="2 · Duplicate readings (resolved)" right={
        <span className="text-[11px] text-slate-500">
          {dupes?.total} duplicates · avg gap {dupes?.avg_gap_min}m · avg Δ {dupes?.avg_delta} kWh
        </span>
      }>
        <div className="bg-navy-900/40 border border-atlas-cyan/20 rounded p-3 mb-3 text-xs text-slate-300">
          <span className="text-atlas-cyan font-semibold">Resolution mechanism:</span>{' '}
          The canonical DT primary key is <code className="bg-navy-800 px-1 rounded">(METER_ID, CHANNEL_ID, READ_TS)</code>.
          When a second payload arrives for the same key, the DT's <code className="bg-navy-800 px-1 rounded">MERGE</code> applies
          last-write-wins by <code className="bg-navy-800 px-1 rounded">INGESTED_AT</code> — no orchestration, no re-run.
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-navy-800/60">
              <tr className="text-slate-400">
                <th className="text-left p-2">Meter</th>
                <th className="text-left p-2">Read TS</th>
                <th className="text-right p-2">Value 1</th>
                <th className="text-right p-2">Value 2</th>
                <th className="text-left p-2">Recv 1</th>
                <th className="text-left p-2">Recv 2</th>
                <th className="text-right p-2">Gap</th>
                <th className="text-left p-2">Resolution</th>
              </tr>
            </thead>
            <tbody>
              {(dupes?.sample || []).map((r) => (
                <tr key={r.duplicate_id} className="border-t border-navy-700/40 hover:bg-navy-800/40">
                  <td className="p-2 font-mono text-slate-300">{r.meter_id}</td>
                  <td className="p-2 text-slate-400 font-mono">{(r.read_ts||'').toString().slice(5,16).replace('T',' ')}</td>
                  <td className="p-2 text-right font-mono text-slate-500 line-through">{r.value_first.toFixed(3)}</td>
                  <td className="p-2 text-right font-mono text-atlas-green">{r.value_second.toFixed(3)}</td>
                  <td className="p-2 text-slate-500 font-mono">{r.received_first}</td>
                  <td className="p-2 text-atlas-cyan font-mono">{r.received_second}</td>
                  <td className="p-2 text-right font-mono text-slate-400">{r.gap_min}m</td>
                  <td className="p-2 text-[11px] text-slate-400">
                    <CheckCircle2 size={12} className="inline text-atlas-green mr-1"/>
                    kept value 2
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* 3. Estimate vs Actual */}
      <Panel title="3 · Estimate ↔ Actual substitution" right={
        <span className="text-[11px] text-slate-500">
          Validation/Editing/Estimation (VEE) status from the canonical layer
        </span>
      }>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-slate-500 mb-2">VEE distribution (sampled)</div>
            <div className="space-y-2">
              {(est?.distribution || []).map((d) => {
                const total = (est?.distribution || []).reduce((s, x) => s + x.n, 0)
                const pct = total ? (d.n / total) * 100 : 0
                return (
                  <div key={d.status}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-300">{d.status}</span>
                      <span className="text-slate-400 font-mono">{fmt(d.n)} · {pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-navy-700/50 rounded overflow-hidden">
                      <div className="h-full" style={{ width: `${pct}%`, background: STATUS_COLOR[d.status] }}/>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 text-[11px] text-slate-500">
              <strong className="text-slate-300">Substitution flow:</strong> when a meter goes silent, gaps
              are filled with <span className="text-atlas-yellow">ESTIMATED</span> (load-profile method).
              When the actual reading arrives later, a MERGE upsert flips the row back to <span className="text-atlas-green">VALID</span>.
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="text-xs text-slate-500 mb-2">14-day VEE_STATUS trend (sampled)</div>
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={est?.trend || []} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid stroke="#1e2937" strokeDasharray="3 3"/>
                  <XAxis dataKey="d" stroke="#9ca3af" fontSize={11}/>
                  <YAxis stroke="#9ca3af" fontSize={11} domain={yPadDomain()} tickFormatter={yAbbr}/>
                  <Tooltip contentStyle={{ background:'#0d1117', border:'1px solid #30363d' }}
                    formatter={(v) => fmt(v)}/>
                  <Legend wrapperStyle={{ fontSize: 11 }}/>
                  <Line type="monotone" dataKey="valid"     stroke={STATUS_COLOR.VALID}     dot={false} strokeWidth={2}/>
                  <Line type="monotone" dataKey="estimated" stroke={STATUS_COLOR.ESTIMATED} dot={false} strokeWidth={2}/>
                  <Line type="monotone" dataKey="failed"    stroke={STATUS_COLOR.FAILED}    dot={false} strokeWidth={2}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
            {est?.methods && est.methods.length > 0 && (
              <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
                <span>Estimation method:</span>
                {est.methods.map((m) => (
                  <Pill key={m.method} text={`${m.method} · ${fmt(m.n)}`} color="#d29922"/>
                ))}
              </div>
            )}
          </div>
        </div>
      </Panel>

      {/* 4. Meter ↔ Premise mismatch */}
      <Panel title="4 · Meter ↔ premise mis-mapping (with auto-correction)" right={
        <span className="text-[11px] text-slate-500">
          Suggested type ranked by load-shape divergence
        </span>
      }>
        <div className="bg-navy-900/40 border border-atlas-purple/20 rounded p-3 mb-3 text-xs text-slate-300">
          <Sparkles size={14} className="inline text-atlas-purple mr-1"/>
          <span className="text-atlas-purple font-semibold">How it works:</span>{' '}
          Each meter's hourly load shape over the last 7 days is computed (evening / day / night averages).
          Residential premises peak in the evening; CNI/SMB peak during the day. Meters whose actual shape
          disagrees with their currently-assigned <code className="bg-navy-800 px-1 rounded">METER_TYPE</code> are flagged.
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-navy-800/60">
              <tr className="text-slate-400">
                <th className="text-left p-2">#</th>
                <th className="text-left p-2">Meter</th>
                <th className="text-left p-2">Feeder</th>
                <th className="text-left p-2">Terr</th>
                <th className="text-center p-2">Current</th>
                <th className="text-center p-2"></th>
                <th className="text-center p-2">Suggested</th>
                <th className="text-right p-2">Eve</th>
                <th className="text-right p-2">Day</th>
                <th className="text-right p-2">Night</th>
                <th className="text-right p-2">Confidence</th>
                <th className="text-right p-2"></th>
              </tr>
            </thead>
            <tbody>
              {(prem || []).map((r) => (
                <tr key={r.meter_id} className="border-t border-navy-700/40 hover:bg-navy-800/40">
                  <td className="p-2 text-slate-500 font-mono">{r.rank}</td>
                  <td className="p-2 font-mono text-slate-300">{r.meter_id}</td>
                  <td className="p-2 text-slate-400 font-mono">{r.feeder_id}</td>
                  <td className="p-2 text-slate-400">{r.territory}</td>
                  <td className="p-2 text-center"><Pill text={r.current_type} color={TYPE_COLOR[r.current_type]}/></td>
                  <td className="p-2 text-center text-slate-500"><ArrowRight size={12} className="inline"/></td>
                  <td className="p-2 text-center"><Pill text={r.suggested_type} color={TYPE_COLOR[r.suggested_type]}/></td>
                  <td className="p-2 text-right font-mono text-slate-400">{r.avg_eve.toFixed(2)}</td>
                  <td className="p-2 text-right font-mono text-slate-400">{r.avg_day.toFixed(2)}</td>
                  <td className="p-2 text-right font-mono text-slate-400">{r.avg_night.toFixed(2)}</td>
                  <td className="p-2 text-right">
                    <span className="font-mono text-atlas-purple">
                      {(r.confidence * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="p-2 text-right">
                    <button className="text-[10px] px-2 py-1 bg-atlas-purple/10 hover:bg-atlas-purple/20
                      text-atlas-purple rounded border border-atlas-purple/30 transition-colors"
                      title="Apply correction (writes to review queue)">
                      Apply
                    </button>
                  </td>
                </tr>
              ))}
              {(!prem || prem.length === 0) && (
                <tr><td colSpan="12" className="p-6 text-center text-slate-500">
                  No mismatches detected
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

function Pill({ text, color }) {
  return (
    <span className="text-[10px] font-mono px-2 py-0.5 rounded border"
      style={{
        color: color || '#9ca3af',
        background: (color || '#9ca3af') + '15',
        borderColor: (color || '#9ca3af') + '40',
      }}>
      {text}
    </span>
  )
}
