import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { api, TERR_COLOR } from '../components/api'
import { Panel, Empty } from '../components/UI'

export default function DataQuality() {
  const [dq, setDq] = useState([])
  const [feeders, setFeeders] = useState([])
  useEffect(() => {
    api('dq/daily').then(d => setDq(Array.isArray(d) ? d : []))
    api('dq/worst-feeders').then(d => setFeeders(Array.isArray(d) ? d : []))
  }, [])
  const tooltipStyle = { background: '#0d1117', border: '1px solid #30363d', borderRadius: 6 }
  return (
    <div className="p-6 space-y-4">
      <Panel title="VEE pass rate by territory (14d)">
        {dq.length === 0 ? <Empty/> : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={dq}>
              <CartesianGrid stroke="#21262d" strokeDasharray="3 3"/>
              <XAxis dataKey="date_key" stroke="#64748b" fontSize={10}/>
              <YAxis domain={[90,100]} stroke="#64748b" fontSize={10}/>
              <Tooltip contentStyle={tooltipStyle}/>
              <Legend wrapperStyle={{ fontSize: 11 }}/>
              {['NE','SE','MW','W'].map(t => <Line key={t} type="monotone" dataKey={t} stroke={TERR_COLOR[t]} dot={false} strokeWidth={1.5}/>)}
            </LineChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel title="Worst 20 feeders by completeness (last 7d)">
        {feeders.length === 0 ? <Empty/> : (
          <div className="overflow-auto max-h-[420px]">
            <table className="w-full text-xs">
              <thead className="text-slate-400 border-b border-navy-700 sticky top-0 bg-navy-800/95 backdrop-blur">
                <tr>
                  <th className="text-left p-2 font-medium">Feeder</th>
                  <th className="text-right p-2 font-medium">Meters</th>
                  <th className="text-right p-2 font-medium">Completeness %</th>
                </tr>
              </thead>
              <tbody>
                {feeders.map(f => (
                  <tr key={f.feeder_id} className="border-b border-navy-800/60 hover:bg-navy-700/30">
                    <td className="p-2 font-mono text-slate-300">{f.feeder_id}</td>
                    <td className="p-2 text-right text-slate-300">{f.meters}</td>
                    <td className={`p-2 text-right font-mono ${f.completeness_pct < 99 ? 'text-atlas-yellow' : 'text-atlas-green'}`}>{f.completeness_pct}%</td>
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
