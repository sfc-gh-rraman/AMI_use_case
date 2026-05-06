import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid, Legend, ReferenceArea } from 'recharts'
import { Database, Users, CheckCircle2, AlertCircle, DollarSign, ZoomIn } from 'lucide-react'
import { api, fmt, TERR_COLOR } from '../components/api'
import { KpiCard, Panel, Empty, yPadDomain, yAbbr, useDragZoom } from '../components/UI'

// Synthetic placeholder rate until tariffs land (§15)
const RATE_PER_KWH = 0.15
const AVG_KWH_PER_INTERVAL = 2.0  // population-weighted from synthetic data

export default function Ingestion() {
  const [kpi, setKpi] = useState({})
  const [series, setSeries] = useState([])
  const [sla, setSla] = useState([])
  const z = useDragZoom()
  useEffect(() => {
    api('ingestion/kpi').then(d => setKpi(d || {}))
    api('ingestion/hourly').then(d => setSeries(Array.isArray(d) ? d : []))
    api('ingestion/sla').then(d => setSla(Array.isArray(d) ? d : []))
  }, [])
  const tooltipStyle = { background: '#0d1117', border: '1px solid #30363d', borderRadius: 6 }
  const TERR = ['NE','SE','MW','W']
  const zoomed = z.slice(series, 'hr')

  // $ exposure from late arrivals = late_count * avg_kwh_per_interval * rate (delayed billing risk)
  const dollarExposure = kpi.late_1d ? (kpi.late_1d * AVG_KWH_PER_INTERVAL * RATE_PER_KWH) : 0

  return (
    <div className="p-6 space-y-4">
      <div className="flex gap-3 flex-wrap">
        <KpiCard icon={Database} label="Interval rows" value={kpi.interval_rows ? (kpi.interval_rows/1e9).toFixed(2) + 'B' : '—'} accent="text-atlas-cyan"/>
        <KpiCard icon={Users} label="Distinct meters" value={fmt(kpi.meters)} accent="text-atlas-blue"/>
        <KpiCard icon={CheckCircle2} label="On-time %" value={kpi.on_time !== undefined ? kpi.on_time + '%' : '—'} accent="text-atlas-green"/>
        <KpiCard icon={AlertCircle} label="Late arrivals (1d)" value={fmt(kpi.late_1d)} accent="text-atlas-yellow"/>
        <KpiCard icon={DollarSign} label="$ exposure (1d, est.)"
          value={'$' + dollarExposure.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          sub={`@ $${RATE_PER_KWH}/kWh placeholder`}
          accent="text-atlas-green"/>
      </div>

      <Panel title="Reads per hour by territory (last 48h)"
        right={<span className="inline-flex items-center gap-1 text-[10px] text-slate-500 uppercase tracking-wider">
          <ZoomIn size={11} className="text-atlas-cyan"/> drag to zoom
        </span>}>
        {series.length === 0 ? <Empty/> : (
          <div className="select-none cursor-crosshair">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={series} {...z.handlers}>
                <CartesianGrid stroke="#21262d" strokeDasharray="3 3"/>
                <XAxis dataKey="hr" stroke="#64748b" fontSize={10}/>
                <YAxis stroke="#64748b" fontSize={10} domain={yPadDomain(0.08)} tickFormatter={yAbbr} width={42}/>
                <Tooltip contentStyle={tooltipStyle}/>
                <Legend wrapperStyle={{ fontSize: 11 }}/>
                {TERR.map(t => <Line key={t} type="monotone" dataKey={t} stroke={TERR_COLOR[t]} dot={false} strokeWidth={1.5}/>)}
                {z.drag && z.drag.x1 !== z.drag.x2 && (
                  <ReferenceArea x1={z.drag.x1} x2={z.drag.x2} fill="#39c5cf" fillOpacity={0.18} stroke="#39c5cf" strokeOpacity={0.6}/>
                )}
                {z.zoom && !z.drag && (
                  <ReferenceArea x1={z.zoom.x1} x2={z.zoom.x2} fill="#39c5cf" fillOpacity={0.08} stroke="#39c5cf" strokeOpacity={0.4} strokeDasharray="3 3"/>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {z.zoom && (
          <div className="flex justify-end mt-2">
            <button onClick={z.reset}
              className="text-[10px] uppercase tracking-wider text-atlas-cyan
                border border-atlas-cyan/40 hover:bg-atlas-cyan/10 px-2 py-1 rounded">
              Reset zoom
            </button>
          </div>
        )}
        {zoomed && zoomed.length > 1 && (
          <div className="mt-3 rounded-lg border border-atlas-cyan/30 bg-navy-900/40 p-3 animate-slide-in">
            <div className="flex items-center gap-2 mb-2">
              <ZoomIn size={12} className="text-atlas-cyan"/>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Zoomed view</span>
              <span className="text-[11px] text-slate-500 font-mono ml-2">
                {zoomed[0].hr} → {zoomed[zoomed.length-1].hr} · {zoomed.length} hours
              </span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={zoomed} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#21262d" strokeDasharray="3 3"/>
                <XAxis dataKey="hr" stroke="#64748b" fontSize={10}/>
                <YAxis stroke="#64748b" fontSize={10} domain={yPadDomain(0.05)} tickFormatter={yAbbr} width={42}/>
                <Tooltip contentStyle={tooltipStyle}/>
                <Legend wrapperStyle={{ fontSize: 11 }}/>
                {TERR.map(t => <Line key={t} type="monotone" dataKey={t} stroke={TERR_COLOR[t]} dot={{ r: 2 }} strokeWidth={1.5}/>)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel title="SLA: % arrived within 15 min (14d)">
        {sla.length === 0 ? <Empty/> : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={sla}>
              <CartesianGrid stroke="#21262d" strokeDasharray="3 3"/>
              <XAxis dataKey="date_key" stroke="#64748b" fontSize={10}/>
              <YAxis domain={[80,100]} stroke="#64748b" fontSize={10}/>
              <Tooltip contentStyle={tooltipStyle}/>
              <Area type="monotone" dataKey="pct_on_time" stroke="#3fb950" fill="#3fb95033" strokeWidth={1.5}/>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  )
}
