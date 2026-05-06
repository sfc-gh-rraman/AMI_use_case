import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { Cpu, Zap, Building2 } from 'lucide-react'
import { api, fmt } from '../components/api'
import { KpiCard, Panel, Empty } from '../components/UI'

export default function Transformers() {
  const [summary, setSummary] = useState({})
  const [topLoaded, setTopLoaded] = useState([])
  const [byTerr, setByTerr] = useState([])
  useEffect(() => {
    api('transformer/summary').then(d => setSummary(d || {}))
    api('transformer/top-loaded').then(d => setTopLoaded(Array.isArray(d) ? d : []))
    api('transformer/by-territory').then(d => setByTerr(Array.isArray(d) ? d : []))
  }, [])
  const tooltipStyle = { background: '#0d1117', border: '1px solid #30363d', borderRadius: 6 }
  return (
    <div className="p-6 space-y-4">
      <div className="flex gap-3 flex-wrap">
        <KpiCard icon={Cpu} label="Transformers" value={fmt(summary.xfm_count)} accent="text-atlas-blue"/>
        <KpiCard icon={Building2} label="Feeders covered" value={fmt(summary.feeder_count)} accent="text-atlas-cyan"/>
        <KpiCard icon={Zap} label="Total kVA" value={fmt(summary.total_kva)} accent="text-atlas-green"/>
      </div>
      <Panel title="Transformer count by territory">
        {byTerr.length === 0 ? <Empty/> : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byTerr}>
              <CartesianGrid stroke="#21262d" strokeDasharray="3 3"/>
              <XAxis dataKey="territory" stroke="#64748b" fontSize={11}/>
              <YAxis stroke="#64748b" fontSize={10}/>
              <Tooltip contentStyle={tooltipStyle}/>
              <Legend wrapperStyle={{ fontSize: 11 }}/>
              <Bar dataKey="xfm_count" fill="#58a6ff" name="Transformers" radius={[4,4,0,0]}/>
              <Bar dataKey="three_phase" fill="#d29922" name="3-phase" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
      <Panel title="Top 25 most-stressed transformers (peak kW / kVA, 30d)">
        {topLoaded.length === 0 ? <Empty/> : (
          <div className="overflow-auto max-h-[420px]">
            <table className="w-full text-xs">
              <thead className="text-slate-400 border-b border-navy-700 sticky top-0 bg-navy-800/95">
                <tr>
                  <th className="text-left p-2 font-medium">Transformer</th>
                  <th className="text-left p-2 font-medium">Feeder</th>
                  <th className="text-right p-2 font-medium">kVA</th>
                  <th className="text-right p-2 font-medium">Meters</th>
                  <th className="text-right p-2 font-medium">kWh (30d)</th>
                  <th className="text-right p-2 font-medium">Peak kW</th>
                  <th className="text-right p-2 font-medium">Load %</th>
                </tr>
              </thead>
              <tbody>
                {topLoaded.map(t => (
                  <tr key={t.transformer_id} className="border-b border-navy-800/60 hover:bg-navy-700/30">
                    <td className="p-2 font-mono text-slate-300">{t.transformer_id}</td>
                    <td className="p-2 font-mono text-slate-400">{t.feeder_id}</td>
                    <td className="p-2 text-right">{fmt(t.kva)}</td>
                    <td className="p-2 text-right">{fmt(t.meters)}</td>
                    <td className="p-2 text-right text-slate-300">{fmt(t.kwh_30d)}</td>
                    <td className="p-2 text-right text-slate-300">{fmt(t.peak_kw)}</td>
                    <td className={`p-2 text-right font-mono ${t.load_factor_pct > 80 ? 'text-atlas-yellow' : 'text-atlas-green'}`}>{t.load_factor_pct}%</td>
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
