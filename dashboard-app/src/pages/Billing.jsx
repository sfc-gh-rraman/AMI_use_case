import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { Receipt, CheckCircle2, Percent } from 'lucide-react'
import { api, fmt } from '../components/api'
import { KpiCard, Panel, Empty } from '../components/UI'

export default function Billing() {
  const [stats, setStats] = useState({})
  const [periods, setPeriods] = useState([])
  useEffect(() => {
    api('billing/stats').then(d => setStats(d || {}))
    api('billing/by-period').then(d => setPeriods(Array.isArray(d) ? d : []))
  }, [])
  const tooltipStyle = { background: '#0d1117', border: '1px solid #30363d', borderRadius: 6 }
  return (
    <div className="p-6 space-y-4">
      <div className="flex gap-3 flex-wrap">
        <KpiCard icon={Receipt} label="Billing periods" value={fmt(stats.total)} accent="text-atlas-blue"/>
        <KpiCard icon={CheckCircle2} label="Ready to bill" value={fmt(stats.ready)} accent="text-atlas-green"/>
        <KpiCard icon={Percent} label="Ready %" value={stats.pct_ready !== undefined ? stats.pct_ready + '%' : '—'} accent="text-atlas-cyan"/>
      </div>
      <Panel title="Billing readiness by period start">
        {periods.length === 0 ? <Empty/> : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={periods}>
              <CartesianGrid stroke="#21262d" strokeDasharray="3 3"/>
              <XAxis dataKey="start_date" stroke="#64748b" fontSize={10}/>
              <YAxis stroke="#64748b" fontSize={10}/>
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
