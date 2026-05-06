import { useEffect, useState } from 'react'
import { api, fmt } from '../components/api'
import { Panel, Empty } from '../components/UI'

export default function Observability() {
  const [dt, setDt] = useState([])
  const [audit, setAudit] = useState([])
  useEffect(() => {
    api('observability/dt-refresh').then(d => setDt(Array.isArray(d) ? d : []))
    api('observability/audit').then(d => setAudit(Array.isArray(d) ? d : []))
  }, [])
  return (
    <div className="p-6 space-y-4">
      <Panel title="Dynamic Table refresh history (latest per DT, last 3d)">
        {dt.length === 0 ? <Empty/> : (
          <div className="overflow-auto max-h-[420px]">
            <table className="w-full text-xs">
              <thead className="text-slate-400 border-b border-navy-700 sticky top-0 bg-navy-800/95">
                <tr>
                  <th className="text-left p-2 font-medium">Schema</th>
                  <th className="text-left p-2 font-medium">Name</th>
                  <th className="text-left p-2 font-medium">State</th>
                  <th className="text-left p-2 font-medium">Last refresh</th>
                  <th className="text-right p-2 font-medium">Duration (s)</th>
                  <th className="text-left p-2 font-medium">Mode</th>
                </tr>
              </thead>
              <tbody>
                {dt.map((r,i) => (
                  <tr key={i} className="border-b border-navy-800/60 hover:bg-navy-700/30">
                    <td className="p-2 text-slate-500">{r.schema}</td>
                    <td className="p-2 font-mono text-slate-300">{r.name}</td>
                    <td className={`p-2 font-medium ${r.state==='SUCCEEDED' ? 'text-atlas-green' : 'text-atlas-yellow'}`}>{r.state}</td>
                    <td className="p-2 font-mono text-slate-400">{r.last_refresh}</td>
                    <td className="p-2 text-right text-slate-300">{r.duration_sec}</td>
                    <td className="p-2 text-slate-500 text-[11px]">{r.refresh_action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel title="Pipeline run audit (last 30)">
        {audit.length === 0 ? <Empty/> : (
          <table className="w-full text-xs">
            <thead className="text-slate-400 border-b border-navy-700">
              <tr>
                <th className="text-left p-2 font-medium">Pipeline</th>
                <th className="text-left p-2 font-medium">Time</th>
                <th className="text-left p-2 font-medium">Status</th>
                <th className="text-right p-2 font-medium">Rows</th>
                <th className="text-right p-2 font-medium">Errors</th>
                <th className="text-left p-2 font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((r,i) => (
                <tr key={i} className="border-b border-navy-800/60 hover:bg-navy-700/30">
                  <td className="p-2 font-mono text-slate-300">{r.pipeline_name}</td>
                  <td className="p-2 font-mono text-slate-400">{r.start_time}</td>
                  <td className={`p-2 font-medium ${r.status==='SUCCESS' ? 'text-atlas-green' : 'text-atlas-yellow'}`}>{r.status}</td>
                  <td className="p-2 text-right">{fmt(r.rows_processed)}</td>
                  <td className="p-2 text-right">{r.error_count}</td>
                  <td className="p-2 text-slate-500">{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
