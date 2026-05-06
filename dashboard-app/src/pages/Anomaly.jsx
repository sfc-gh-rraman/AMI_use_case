import { useEffect, useState } from 'react'
import {
  ComposedChart, Line, Area, Scatter, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'
import { AlertTriangle, Activity, Zap, BookOpen, Sparkles, Brain, X, ChevronRight, Layers } from 'lucide-react'
import { api, fmt } from '../components/api'
import { KpiCard, Panel, Empty, Loading } from '../components/UI'

const tooltipStyle = { background: '#0d1117', border: '1px solid #30363d', borderRadius: 6, fontSize: 12 }

// Synthetic dollar-rate stub until tariffs land (§15)
const RATE_PER_KWH = 0.15

function ModelCardPanel({ model, label, accent }) {
  if (!model) return <Loading/>
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain size={16} className={accent}/>
          <span className="text-sm font-medium text-white">{label}</span>
        </div>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Cortex ML</span>
      </div>
      <div className="text-[11px] text-slate-500 mb-3 font-mono">{model.name}</div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-slate-500 text-[10px] uppercase tracking-wider">Series</div>
          <div className="text-white font-mono">{fmt(model.n_series)}</div>
        </div>
        <div>
          <div className="text-slate-500 text-[10px] uppercase tracking-wider">Training rows</div>
          <div className="text-white font-mono">{fmt(model.training_rows)}</div>
        </div>
        <div>
          <div className="text-slate-500 text-[10px] uppercase tracking-wider">Window</div>
          <div className="text-white font-mono">{model.training_window_days}d</div>
        </div>
        <div>
          <div className="text-slate-500 text-[10px] uppercase tracking-wider">Last trained</div>
          <div className="text-white font-mono">{model.last_trained}</div>
        </div>
        <div>
          <div className="text-slate-500 text-[10px] uppercase tracking-wider">Scored</div>
          <div className="text-white font-mono">{fmt(model.scored)}</div>
        </div>
        <div>
          <div className="text-slate-500 text-[10px] uppercase tracking-wider">Anomalies</div>
          <div className={`font-mono ${accent}`}>{fmt(model.anomalies_found)} ({model.pct_flagged}%)</div>
        </div>
        <div className="col-span-2 pt-1 border-t border-navy-700/50">
          <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Distance distribution</div>
          <div className="flex items-baseline gap-2 text-[11px] text-slate-400">
            <span>avg <span className="text-white font-mono">{model.avg_distance}</span></span>
            <span>·</span>
            <span>max <span className="text-white font-mono">{model.max_distance}</span></span>
            <span className="ml-auto text-slate-500">σ-units from forecast</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function ForecastBandChart({ feederId }) {
  const [series, setSeries] = useState(null)
  useEffect(() => {
    if (!feederId) return
    setSeries(null)
    api(`anomaly/forecast/${feederId}`).then(d => setSeries(Array.isArray(d) ? d : []))
  }, [feederId])
  if (!feederId) return <Empty message="Select a feeder anomaly to see its forecast band"/>
  if (series === null) return <Loading/>
  if (series.length === 0) return <Empty message="No forecast data for this feeder"/>
  const anomalyPoints = series.filter(s => s.is_anomaly)
  return (
    <div>
      <div className="text-[11px] text-slate-400 mb-2">
        <span className="font-mono text-atlas-blue">{feederId}</span>
        <span className="ml-3 text-slate-500">Hourly kWh · forecast (dashed) · 95% band (shaded) · anomalies (red)</span>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={series}>
          <CartesianGrid stroke="#21262d" strokeDasharray="3 3"/>
          <XAxis dataKey="ts" stroke="#64748b" fontSize={10} interval={Math.floor(series.length / 12)}/>
          <YAxis stroke="#64748b" fontSize={10}/>
          <Tooltip contentStyle={tooltipStyle}/>
          <Legend wrapperStyle={{ fontSize: 11 }}/>
          {/* Upper band (transparent at start) */}
          <Area type="monotone" dataKey="upper" stroke="none" fill="#58a6ff" fillOpacity={0.10} name="95% upper" stackId={null}/>
          <Area type="monotone" dataKey="lower" stroke="none" fill="#0d1117" fillOpacity={1} name="lower mask" legendType="none"/>
          <Line type="monotone" dataKey="forecast" stroke="#a371f7" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Forecast"/>
          <Line type="monotone" dataKey="kwh" stroke="#58a6ff" strokeWidth={2} dot={false} name="Actual kWh"/>
          <Scatter dataKey="anomaly_kwh" fill="#f85149" stroke="#f85149" name="Anomaly"/>
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-3 text-[11px] text-slate-500">
        {anomalyPoints.length} anomaly point{anomalyPoints.length === 1 ? '' : 's'} in window.
        Cortex ML flags hours where actual kWh fell outside the model's expected band.
      </div>
    </div>
  )
}

function DrillPanel({ row, onClose }) {
  if (!row) return null
  const exposureKwh = row.kwh - row.forecast
  const exposureDollars = exposureKwh * RATE_PER_KWH
  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-navy-900 border-l border-navy-700 shadow-2xl z-50 overflow-y-auto animate-slide-in">
      <div className="sticky top-0 bg-navy-900 border-b border-navy-700 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-atlas-red"/>
          <span className="text-sm font-medium text-white">Anomaly drill-down</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white">
          <X size={16}/>
        </button>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Feeder</div>
          <div className="text-lg font-mono text-atlas-blue">{row.feeder_id}</div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5">at {row.ts}</div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="card p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Actual kWh</div>
            <div className="text-xl text-atlas-red font-mono">{row.kwh}</div>
          </div>
          <div className="card p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Forecast</div>
            <div className="text-xl text-atlas-purple font-mono">{row.forecast}</div>
          </div>
          <div className="card p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Upper bound</div>
            <div className="text-xl text-slate-300 font-mono">{row.upper_bound}</div>
          </div>
          <div className="card p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Distance</div>
            <div className="text-xl text-atlas-yellow font-mono">{row.distance}σ</div>
          </div>
        </div>

        <div className="card p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Estimated $ exposure (1h)</div>
          <div className="text-2xl font-mono text-atlas-green">
            ${exposureDollars.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            ({exposureKwh > 0 ? '+' : ''}{exposureKwh.toFixed(1)} kWh × ${RATE_PER_KWH}/kWh placeholder rate)
          </div>
          <div className="text-[10px] text-slate-600 mt-2 italic">
            Replaces with tariff-resolved rate once §15 lands.
          </div>
        </div>

        <Panel title="Forecast band (last 7 days)">
          <ForecastBandChart feederId={row.feeder_id}/>
        </Panel>

        <div className="text-[11px] text-slate-500 leading-relaxed">
          <Sparkles size={11} className="inline mr-1 text-atlas-purple"/>
          The model forecasts hourly kWh from 166 days of training data. A point is flagged
          when actual exceeds the upper bound (or falls below the lower bound) by ≥ 3 σ.
        </div>
      </div>
    </div>
  )
}

export default function Anomaly() {
  const [kpi, setKpi] = useState({})
  const [top, setTop] = useState([])
  const [meters, setMeters] = useState([])
  const [card, setCard] = useState(null)
  const [xfm, setXfm] = useState([])
  const [drill, setDrill] = useState(null)
  useEffect(() => {
    api('anomaly/kpi').then(d => setKpi(d || {}))
    api('anomaly/top-feeders').then(d => setTop(Array.isArray(d) ? d : []))
    api('anomaly/top-meters').then(d => setMeters(Array.isArray(d) ? d : []))
    api('anomaly/model-card').then(d => setCard(d))
    api('anomaly/by-transformer').then(d => setXfm(Array.isArray(d) ? d : []))
  }, [])
  return (
    <div className="p-6 space-y-4">
      <div className="flex gap-3 flex-wrap">
        <KpiCard icon={Activity} label="Feeder rows scored" value={fmt(kpi.scored)} accent="text-atlas-cyan"/>
        <KpiCard icon={AlertTriangle} label="Feeder anomalies" value={fmt(kpi.feeder_anomalies)} accent="text-atlas-yellow"/>
        <KpiCard icon={Zap} label="Meter anomalies (CNI)" value={fmt(kpi.meter_anomalies)} accent="text-atlas-red"/>
        <KpiCard icon={BookOpen} label="$ exposure (top 15, est.)"
          value={'$' + (top.slice(0,15).reduce((s,r) => s + Math.max(0, r.kwh - r.forecast), 0) * RATE_PER_KWH).toFixed(0)}
          accent="text-atlas-green"/>
      </div>

      {/* Model cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ModelCardPanel model={card?.feeder_model} label="Feeder anomaly model" accent="text-atlas-blue"/>
        <ModelCardPanel model={card?.meter_model} label="Per-meter anomaly model (CNI)" accent="text-atlas-purple"/>
      </div>

      {/* Top anomaly with built-in forecast band */}
      <Panel title={`Forecast band — ${top[0]?.feeder_id || 'top anomaly feeder'}`}
        right={top[0] && <span className="text-[11px] text-slate-500">click any row below to inspect</span>}>
        <ForecastBandChart feederId={top[0]?.feeder_id}/>
      </Panel>

      <Panel title="Top 15 feeder anomalies"
        right={<span className="text-[10px] text-slate-500 uppercase tracking-wider">click to drill</span>}>
        {top.length === 0 ? <Empty/> : (
          <table className="w-full text-xs">
            <thead className="text-slate-400 border-b border-navy-700">
              <tr>
                <th className="text-left p-2 font-medium">Feeder</th>
                <th className="text-left p-2 font-medium">Time</th>
                <th className="text-right p-2 font-medium">kWh</th>
                <th className="text-right p-2 font-medium">Forecast</th>
                <th className="text-right p-2 font-medium">Upper</th>
                <th className="text-right p-2 font-medium">σ Distance</th>
                <th className="text-right p-2 font-medium">$ Exposure (1h)</th>
                <th className="w-6"></th>
              </tr>
            </thead>
            <tbody>
              {top.map((r,i) => {
                const exp = Math.max(0, r.kwh - r.forecast) * RATE_PER_KWH
                return (
                  <tr key={i} onClick={() => setDrill(r)}
                    className="border-b border-navy-800/60 hover:bg-navy-700/30 cursor-pointer transition-colors">
                    <td className="p-2 font-mono text-slate-300">{r.feeder_id}</td>
                    <td className="p-2 font-mono text-slate-400">{r.ts}</td>
                    <td className="p-2 text-right text-slate-300 font-mono">{r.kwh}</td>
                    <td className="p-2 text-right text-slate-400 font-mono">{r.forecast}</td>
                    <td className="p-2 text-right text-slate-400 font-mono">{r.upper_bound}</td>
                    <td className="p-2 text-right font-mono text-atlas-red">{r.distance}</td>
                    <td className="p-2 text-right font-mono text-atlas-green">${exp.toFixed(2)}</td>
                    <td className="p-2 text-slate-500"><ChevronRight size={14}/></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Per-transformer rollup of feeder anomalies"
        right={<div className="flex items-center gap-2">
          <Layers size={11} className="text-atlas-cyan"/>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">
            Excess kWh allocated by 30d load share · click to drill the parent feeder
          </span>
        </div>}>
        {xfm.length === 0 ? <Empty/> : (
          <table className="w-full text-xs">
            <thead className="text-slate-400 border-b border-navy-700">
              <tr>
                <th className="text-left p-2 font-medium">Transformer</th>
                <th className="text-left p-2 font-medium">Feeder</th>
                <th className="text-right p-2 font-medium">kVA</th>
                <th className="text-right p-2 font-medium">Meters</th>
                <th className="text-right p-2 font-medium">Anomaly hours</th>
                <th className="text-right p-2 font-medium">Load share</th>
                <th className="text-right p-2 font-medium">Est. excess kWh</th>
                <th className="text-right p-2 font-medium">$ Exposure</th>
                <th className="text-right p-2 font-medium">Max σ</th>
                <th className="w-6"></th>
              </tr>
            </thead>
            <tbody>
              {xfm.map((r,i) => {
                // build a synthetic drill row for the side panel using feeder context
                const onClick = () => {
                  const feederRow = top.find(f => f.feeder_id === r.feeder_id) ||
                    { feeder_id: r.feeder_id, ts: '—', kwh: 0, forecast: 0, upper_bound: 0, distance: r.max_distance }
                  setDrill({ ...feederRow, _via_xfm: r.transformer_id })
                }
                return (
                  <tr key={i} onClick={onClick}
                    className="border-b border-navy-800/60 hover:bg-navy-700/30 cursor-pointer transition-colors">
                    <td className="p-2 font-mono text-slate-300">{r.transformer_id}</td>
                    <td className="p-2 font-mono text-atlas-blue">{r.feeder_id}</td>
                    <td className="p-2 text-right text-slate-400 font-mono">{r.kva}</td>
                    <td className="p-2 text-right text-slate-400 font-mono">{r.meters}</td>
                    <td className="p-2 text-right text-slate-300 font-mono">{r.feeder_anomaly_hours}</td>
                    <td className="p-2 text-right text-slate-300 font-mono">{r.share_pct}%</td>
                    <td className="p-2 text-right text-atlas-yellow font-mono">{r.est_excess_kwh}</td>
                    <td className="p-2 text-right font-mono text-atlas-green">${r.est_dollar_exposure}</td>
                    <td className="p-2 text-right font-mono text-atlas-red">{r.max_distance}</td>
                    <td className="p-2 text-slate-500"><ChevronRight size={14}/></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <div className="mt-3 text-[11px] text-slate-500 leading-relaxed">
          <Sparkles size={11} className="inline mr-1 text-atlas-purple"/>
          For each anomaly hour at the feeder, the excess kWh (actual − forecast) is allocated
          to its transformers in proportion to their 30-day share of the feeder's load. Top 25
          transformers shown; ranked by estimated $ exposure at the placeholder rate.
        </div>
      </Panel>

      <Panel title="Top 15 per-meter anomalies (CNI sample)">
        {meters.length === 0 ? <Empty/> : (
          <table className="w-full text-xs">
            <thead className="text-slate-400 border-b border-navy-700">
              <tr>
                <th className="text-left p-2 font-medium">Meter</th>
                <th className="text-left p-2 font-medium">Time</th>
                <th className="text-right p-2 font-medium">kWh</th>
                <th className="text-right p-2 font-medium">Forecast</th>
                <th className="text-right p-2 font-medium">Upper</th>
                <th className="text-right p-2 font-medium">σ Distance</th>
                <th className="text-right p-2 font-medium">$ Exposure</th>
              </tr>
            </thead>
            <tbody>
              {meters.map((r,i) => {
                const exp = Math.max(0, r.kwh - r.forecast) * RATE_PER_KWH
                return (
                  <tr key={i} className="border-b border-navy-800/60 hover:bg-navy-700/30">
                    <td className="p-2 font-mono text-slate-300">{r.meter_id}</td>
                    <td className="p-2 font-mono text-slate-400">{r.ts}</td>
                    <td className="p-2 text-right text-slate-300 font-mono">{r.kwh}</td>
                    <td className="p-2 text-right text-slate-400 font-mono">{r.forecast}</td>
                    <td className="p-2 text-right text-slate-400 font-mono">{r.upper_bound}</td>
                    <td className="p-2 text-right font-mono text-atlas-red">{r.distance}</td>
                    <td className="p-2 text-right font-mono text-atlas-green">${exp.toFixed(2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Panel>

      {/* Injected anomaly ground-truth panel */}
      {card?.injected && (
        <Panel title="Injected anomalies (ground truth)"
          right={<span className="text-[10px] text-slate-500 uppercase tracking-wider">For model validation</span>}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="card p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Theft pattern (3× spike)</div>
              <div className="text-atlas-red font-mono text-lg">{card.injected.theft_meters} meters</div>
              <div className="text-slate-500 text-[10px] mt-1">{card.injected.theft_window}</div>
            </div>
            <div className="card p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Dead meters (48h)</div>
              <div className="text-atlas-yellow font-mono text-lg">{card.injected.dead_meters} meters</div>
              <div className="text-slate-500 text-[10px] mt-1">{card.injected.dead_window}</div>
            </div>
            <div className="card p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Voltage sag (&lt;200V)</div>
              <div className="text-atlas-purple font-mono text-lg">{card.injected.voltage_sag_meters} meters</div>
              <div className="text-slate-500 text-[10px] mt-1">{card.injected.voltage_sag_window}</div>
            </div>
          </div>
        </Panel>
      )}

      {drill && <DrillPanel row={drill} onClose={() => setDrill(null)}/>}
    </div>
  )
}
