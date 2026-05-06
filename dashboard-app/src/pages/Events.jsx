import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api } from '../components/api'
import { Panel, Empty } from '../components/UI'

const RANGES = ['1d', '7d', '30d', '90d']

export default function Events() {
  const [summary, setSummary] = useState([])
  const [recent, setRecent] = useState([])
  const [range, setRange] = useState('7d')
  useEffect(() => { api('events/summary').then(d => setSummary(Array.isArray(d) ? d : [])) }, [])
  useEffect(() => { api('events/recent?range=' + range).then(d => setRecent(Array.isArray(d) ? d : [])) }, [range])
  const tooltipStyle = { background: '#0d1117', border: '1px solid #30363d', borderRadius: 6 }
  return (
    <div className="p-6 space-y-4">
      <Panel title="Event volume by type (all time)">
        {summary.length === 0 ? <Empty/> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={summary}>
              <CartesianGrid stroke="#21262d" strokeDasharray="3 3"/>
              <XAxis dataKey="event_type" stroke="#64748b" fontSize={11}/>
              <YAxis stroke="#64748b" fontSize={10}/>
              <Tooltip contentStyle={tooltipStyle}/>
              <Bar dataKey="count" fill="#d29922" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel title="Recent events"
        right={<div className="flex gap-1">
          {RANGES.map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors
                ${range === r
                  ? 'bg-atlas-blue/15 border-atlas-blue/40 text-atlas-blue'
                  : 'border-navy-700 text-slate-400 hover:text-white hover:border-navy-500'}`}>
              {r}
            </button>
          ))}
        </div>}>
        {recent.length === 0 ? <Empty/> : (
          <div className="overflow-auto max-h-[480px]">
            <table className="w-full text-xs">
              <thead className="text-slate-400 border-b border-navy-700 sticky top-0 bg-navy-800/95">
                <tr>
                  <th className="text-left p-2 font-medium">Time</th>
                  <th className="text-left p-2 font-medium">Meter</th>
                  <th className="text-left p-2 font-medium">Type</th>
                  <th className="text-left p-2 font-medium">Payload</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e,i) => (
                  <tr key={i} className="border-b border-navy-800/60 hover:bg-navy-700/30">
                    <td className="p-2 font-mono text-slate-400">{e.event_ts}</td>
                    <td className="p-2 font-mono text-slate-300">{e.meter_id}</td>
                    <td className={`p-2 font-medium ${e.event_type==='OUTAGE' ? 'text-atlas-red' : 'text-atlas-yellow'}`}>{e.event_type}</td>
                    <td className="p-2 text-slate-500 text-[11px]">{e.payload}</td>
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
