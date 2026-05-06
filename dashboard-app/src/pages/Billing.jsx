import { useEffect, useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceArea } from 'recharts'
import { Receipt, CheckCircle2, Percent, DollarSign, ZoomIn, TrendingUp } from 'lucide-react'
import { api, fmt } from '../components/api'
import { KpiCard, Panel, Empty, yPadDomain, yAbbr, useDragZoom } from '../components/UI'

const RATE_PER_KWH = 0.15
const AVG_KWH_PER_BILL = 750  // population avg

export default function Billing() {
  const [stats, setStats] = useState({})
  const [periods, setPeriods] = useState([])
  const [trend, setTrend] = useState([])
  const z = useDragZoom()
  useEffect(() => {
    api('billing/stats').then(d => setStats(d || {}))
    api('billing/by-period').then(d => setPeriods(Array.isArray(d) ? d : []))
    api('billing/readiness-trend').then(d => setTrend(Array.isArray(d) ? d : []))
  }, [])
  const tooltipStyle = { background: '#0d1117', border: '1px solid #30363d', borderRadius: 6 }
  const notReady = (stats.total || 0) - (stats.ready || 0)
  const dollarsHeld = notReady * AVG_KWH_PER_BILL * RATE_PER_KWH
  const zoomed = z.slice(trend, 'period')
  return (
    <div className="p-6 space-y-4">
      <div className="flex gap-3 flex-wrap">
        <KpiCard icon={Receipt} label="Billing periods" value={fmt(stats.total)} accent="text-atlas-blue"/>
        <KpiCard icon={CheckCircle2} label="Ready to bill" value={fmt(stats.ready)} accent="text-atlas-green"/>
        <KpiCard icon={Percent} label="Ready %" value={stats.pct_ready !== undefined ? stats.pct_ready + '%' : '—'} accent="text-atlas-cyan"/>
        <KpiCard icon={DollarSign} label="$ in held bills (est.)"
          value={'$' + (dollarsHeld/1e6).toFixed(1) + 'M'}
          sub={`${fmt(notReady)} periods × ~$${(AVG_KWH_PER_BILL*RATE_PER_KWH).toFixed(0)} ea.`}
          accent="text-atlas-yellow"/>
      </div>

      <Panel title="Billing readiness trend (12 months)"
        right={<div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 uppercase tracking-wider">
            <TrendingUp size={11} className="text-atlas-green"/> % ready (left) · $ held (right)
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 uppercase tracking-wider">
            <ZoomIn size={11} className="text-atlas-cyan"/> drag to zoom
          </span>
        </div>}>
        {trend.length === 0 ? <Empty/> : (
          <div className="select-none cursor-crosshair">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend} {...z.handlers} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#21262d" strokeDasharray="3 3"/>
                <XAxis dataKey="period" stroke="#64748b" fontSize={10}/>
                <YAxis yAxisId="pct"  stroke="#3fb950" fontSize={10}
                  domain={yPadDomain(0.05)} tickFormatter={v => `${v.toFixed(0)}%`} width={48}/>
                <YAxis yAxisId="dol"  orientation="right" stroke="#d29922" fontSize={10}
                  domain={yPadDomain(0.10)} tickFormatter={v => `$${v.toFixed(1)}M`} width={56}/>
                <Tooltip contentStyle={tooltipStyle}
                  formatter={(value, name) => name === '% Ready' ? `${value}%`
                    : name === '$ Held (M)' ? `$${value}M` : value}/>
                <Legend wrapperStyle={{ fontSize: 11 }}/>
                <Line yAxisId="pct" type="monotone" dataKey="pct_ready"     stroke="#3fb950" name="% Ready"     dot={false} strokeWidth={2}/>
                <Line yAxisId="dol" type="monotone" dataKey="dollars_held_m" stroke="#d29922" name="$ Held (M)" dot={false} strokeWidth={2}/>
                {z.drag && z.drag.x1 !== z.drag.x2 && (
                  <ReferenceArea yAxisId="pct" x1={z.drag.x1} x2={z.drag.x2} fill="#39c5cf" fillOpacity={0.18} stroke="#39c5cf" strokeOpacity={0.6}/>
                )}
                {z.zoom && !z.drag && (
                  <ReferenceArea yAxisId="pct" x1={z.zoom.x1} x2={z.zoom.x2} fill="#39c5cf" fillOpacity={0.08} stroke="#39c5cf" strokeOpacity={0.4} strokeDasharray="3 3"/>
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
                {zoomed[0].period} → {zoomed[zoomed.length-1].period} · {zoomed.length} months
              </span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={zoomed} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#21262d" strokeDasharray="3 3"/>
                <XAxis dataKey="period" stroke="#64748b" fontSize={10}/>
                <YAxis yAxisId="pct"  stroke="#3fb950" fontSize={10}
                  domain={yPadDomain(0.05)} tickFormatter={v => `${v.toFixed(0)}%`} width={48}/>
                <YAxis yAxisId="dol"  orientation="right" stroke="#d29922" fontSize={10}
                  domain={yPadDomain(0.10)} tickFormatter={v => `$${v.toFixed(1)}M`} width={56}/>
                <Tooltip contentStyle={tooltipStyle}/>
                <Legend wrapperStyle={{ fontSize: 11 }}/>
                <Line yAxisId="pct" type="monotone" dataKey="pct_ready"     stroke="#3fb950" name="% Ready"     dot={{ r: 3 }} strokeWidth={2}/>
                <Line yAxisId="dol" type="monotone" dataKey="dollars_held_m" stroke="#d29922" name="$ Held (M)" dot={{ r: 3 }} strokeWidth={2}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel title="Billing readiness by period start">
        {periods.length === 0 ? <Empty/> : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={periods}>
              <CartesianGrid stroke="#21262d" strokeDasharray="3 3"/>
              <XAxis dataKey="start_date" stroke="#64748b" fontSize={10}/>
              <YAxis stroke="#64748b" fontSize={10} tickFormatter={yAbbr} width={48}/>
              <Tooltip contentStyle={tooltipStyle}/>
              <Legend wrapperStyle={{ fontSize: 11 }}/>
              <Bar dataKey="ready" stackId="a" fill="#3fb950" name="Ready"/>
              <Bar dataKey="not_ready" stackId="a" fill="#d29922" name="Not ready"/>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  )
}
