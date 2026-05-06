import { useEffect, useState } from 'react'
import { AlertTriangle, Activity, Zap } from 'lucide-react'
import { api, fmt } from '../components/api'
import { KpiCard, Panel, Empty } from '../components/UI'

export default function Anomaly() {
  const [kpi, setKpi] = useState({})
  const [top, setTop] = useState([])
  const [meters, setMeters] = useState([])
  useEffect(() => {
    api('anomaly/kpi').then(d => setKpi(d || {}))
    api('anomaly/top-feeders').then(d => setTop(Array.isArray(d) ? d : []))
    api('anomaly/top-meters').then(d => setMeters(Array.isArray(d) ? d : []))
  }, [])
  return (
    <div className="p-6 space-y-4">
      <div className="flex gap-3 flex-wrap">
        <KpiCard icon={Activity} label="Feeder rows scored" value={fmt(kpi.scored)} accent="text-atlas-cyan"/>
        <KpiCard icon={AlertTriangle} label="Feeder anomalies" value={fmt(kpi.feeder_anomalies)} accent="text-atlas-yellow"/>
        <KpiCard icon={Zap} label="Meter anomalies (CNI)" value={fmt(kpi.meter_anomalies)} accent="text-atlas-red"/>
      </div>

      <Panel title="Top 15 feeder anomalies">
        {top.length === 0 ? <Empty/> : (
          <table className="w-full text-xs">
            <thead className="text-slate-400 border-b border-navy-700">
              <tr>
                <th className="text-left p-2 font-medium">Feeder</th>
                <th className="text-left p-2 font-medium">Time</th>
                <th className="text-right p-2 font-medium">kWh</th>
                <th className="text-right p-2 font-medium">Forecast</th>
                <th className="text-right p-2 font-medium">Upper</th>
                <th className="text-right p-2 font-medium">Distance</th>
              </tr>
            </thead>
            <tbody>
              {top.map((r,i) => (
                <tr key={i} className="border-b border-navy-800/60 hover:bg-navy-700/30">
                  <td className="p-2 font-mono text-slate-300">{r.feeder_id}</td>
                  <td className="p-2 font-mono text-slate-400">{r.ts}</td>
                  <td className="p-2 text-right text-slate-300">{r.kwh}</td>
                  <td className="p-2 text-right text-slate-400">{r.forecast}</td>
                  <td className="p-2 text-right text-slate-400">{r.upper_bound}</td>
                  <td className="p-2 text-right font-mono text-atlas-red">{r.distance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
                <th className="text-right p-2 font-medium">Distance</th>
              </tr>
            </thead>
            <tbody>
              {meters.map((r,i) => (
                <tr key={i} className="border-b border-navy-800/60 hover:bg-navy-700/30">
                  <td className="p-2 font-mono text-slate-300">{r.meter_id}</td>
                  <td className="p-2 font-mono text-slate-400">{r.ts}</td>
                  <td className="p-2 text-right text-slate-300">{r.kwh}</td>
                  <td className="p-2 text-right text-slate-400">{r.forecast}</td>
                  <td className="p-2 text-right text-slate-400">{r.upper_bound}</td>
                  <td className="p-2 text-right font-mono text-atlas-red">{r.distance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
