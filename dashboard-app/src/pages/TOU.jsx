import { useEffect, useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { api } from '../components/api'
import { Panel, Empty, yPadDomain, yAbbr } from '../components/UI'

export default function TOU() {
  const [buckets, setBuckets] = useState([])
  const [daily, setDaily] = useState([])
  useEffect(() => {
    api('tou/bucket-totals').then(d => setBuckets(Array.isArray(d) ? d : []))
    api('tou/daily-revenue').then(d => setDaily(Array.isArray(d) ? d : []))
  }, [])
  const tooltipStyle = { background: '#0d1117', border: '1px solid #30363d', borderRadius: 6 }
  return (
    <div className="p-6 space-y-4">
      <Panel title="Energy charge by TOU bucket (last 30d)">
        {buckets.length === 0 ? <Empty/> : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={buckets}>
              <CartesianGrid stroke="#21262d" strokeDasharray="3 3"/>
              <XAxis dataKey="tou_bucket" stroke="#64748b" fontSize={11}/>
              <YAxis stroke="#64748b" fontSize={10} tickFormatter={yAbbr} width={48}/>
              <Tooltip contentStyle={tooltipStyle}/>
              <Bar dataKey="energy_charge" fill="#58a6ff" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
      <Panel title="Daily TOU revenue (14d)">
        {daily.length === 0 ? <Empty/> : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={daily}>
              <CartesianGrid stroke="#21262d" strokeDasharray="3 3"/>
              <XAxis dataKey="day" stroke="#64748b" fontSize={10}/>
              <YAxis stroke="#64748b" fontSize={10} domain={yPadDomain(0.08)} tickFormatter={yAbbr} width={48}/>
              <Tooltip contentStyle={tooltipStyle}/>
              <Legend wrapperStyle={{ fontSize: 11 }}/>
              <Line type="monotone" dataKey="energy" stroke="#58a6ff" name="Energy $" dot={false} strokeWidth={1.5}/>
              <Line type="monotone" dataKey="demand" stroke="#d29922" name="Demand $" dot={false} strokeWidth={1.5}/>
            </LineChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  )
}
