import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { Receipt, CheckCircle2, Percent, DollarSign } from 'lucide-react'
import { api, fmt } from '../components/api'
import { KpiCard, Panel, Empty, yAbbr } from '../components/UI'

const RATE_PER_KWH = 0.15
const AVG_KWH_PER_BILL = 750  // population avg

export default function Billing() {
  const [stats, setStats] = useState({})
  const [periods, setPeriods] = useState([])
  useEffect(() => {
    api('billing/stats').then(d => setStats(d || {}))
    api('billing/by-period').then(d => setPeriods(Array.isArray(d) ? d : []))
  }, [])
  const tooltipStyle = { background: '#0d1117', border: '1px solid #30363d', borderRadius: 6 }
  const notReady = (stats.total || 0) - (stats.ready || 0)
  const dollarsHeld = notReady * AVG_KWH_PER_BILL * RATE_PER_KWH
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
