import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid, Legend } from 'recharts'
import { Database, Users, CheckCircle2, AlertCircle, DollarSign } from 'lucide-react'
import { api, fmt, TERR_COLOR } from '../components/api'
import { KpiCard, Panel, Empty, yPadDomain, yAbbr } from '../components/UI'

// Synthetic placeholder rate until tariffs land (§15)
const RATE_PER_KWH = 0.15
const AVG_KWH_PER_INTERVAL = 2.0  // population-weighted from synthetic data

export default function Ingestion() {
  const [kpi, setKpi] = useState({})
  const [series, setSeries] = useState([])
  const [sla, setSla] = useState([])
  useEffect(() => {
    api('ingestion/kpi').then(d => setKpi(d || {}))
    api('ingestion/hourly').then(d => setSeries(Array.isArray(d) ? d : []))
    api('ingestion/sla').then(d => setSla(Array.isArray(d) ? d : []))
  }, [])
  const tooltipStyle = { background: '#0d1117', border: '1px solid #30363d', borderRadius: 6 }

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

      <Panel title="Reads per hour by territory (last 48h)">
        {series.length === 0 ? <Empty/> : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={series}>
              <CartesianGrid stroke="#21262d" strokeDasharray="3 3"/>
              <XAxis dataKey="hr" stroke="#64748b" fontSize={10}/>
              <YAxis stroke="#64748b" fontSize={10} domain={yPadDomain(0.08)} tickFormatter={yAbbr} width={42}/>
              <Tooltip contentStyle={tooltipStyle}/>
              <Legend wrapperStyle={{ fontSize: 11 }}/>
              {['NE','SE','MW','W'].map(t => <Line key={t} type="monotone" dataKey={t} stroke={TERR_COLOR[t]} dot={false} strokeWidth={1.5}/>)}
            </LineChart>
          </ResponsiveContainer>
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
