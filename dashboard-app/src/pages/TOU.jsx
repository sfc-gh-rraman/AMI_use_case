import { useEffect, useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceArea } from 'recharts'
import { ZoomIn } from 'lucide-react'
import { api } from '../components/api'
import { Panel, Empty, yPadDomain, yAbbr, useDragZoom } from '../components/UI'

export default function TOU() {
  const [buckets, setBuckets] = useState([])
  const [daily, setDaily] = useState([])
  const z = useDragZoom()
  useEffect(() => {
    api('tou/bucket-totals').then(d => setBuckets(Array.isArray(d) ? d : []))
    api('tou/daily-revenue').then(d => setDaily(Array.isArray(d) ? d : []))
  }, [])
  const tooltipStyle = { background: '#0d1117', border: '1px solid #30363d', borderRadius: 6 }
  const zoomed = z.slice(daily, 'day')
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
      <Panel title="Daily TOU revenue (14d)"
        right={<span className="inline-flex items-center gap-1 text-[10px] text-slate-500 uppercase tracking-wider">
          <ZoomIn size={11} className="text-atlas-cyan"/> drag to zoom
        </span>}>
        {daily.length === 0 ? <Empty/> : (
          <div className="select-none cursor-crosshair">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={daily} {...z.handlers}>
                <CartesianGrid stroke="#21262d" strokeDasharray="3 3"/>
                <XAxis dataKey="day" stroke="#64748b" fontSize={10}/>
                <YAxis stroke="#64748b" fontSize={10} domain={yPadDomain(0.08)} tickFormatter={yAbbr} width={48}/>
                <Tooltip contentStyle={tooltipStyle}/>
                <Legend wrapperStyle={{ fontSize: 11 }}/>
                <Line type="monotone" dataKey="energy" stroke="#58a6ff" name="Energy $" dot={false} strokeWidth={1.5}/>
                <Line type="monotone" dataKey="demand" stroke="#d29922" name="Demand $" dot={false} strokeWidth={1.5}/>
                {z.drag && z.drag.x1 !== z.drag.x2 && (
                  <ReferenceArea x1={z.drag.x1} x2={z.drag.x2} fill="#39c5cf" fillOpacity={0.18} stroke="#39c5cf" strokeOpacity={0.6}/>
                )}
                {z.zoom && !z.drag && (
                  <ReferenceArea x1={z.zoom.x1} x2={z.zoom.x2} fill="#39c5cf" fillOpacity={0.08} stroke="#39c5cf" strokeOpacity={0.4} strokeDasharray="3 3"/>
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
                {zoomed[0].day} → {zoomed[zoomed.length-1].day} · {zoomed.length} days
              </span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={zoomed} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#21262d" strokeDasharray="3 3"/>
                <XAxis dataKey="day" stroke="#64748b" fontSize={10}/>
                <YAxis stroke="#64748b" fontSize={10} domain={yPadDomain(0.05)} tickFormatter={yAbbr} width={48}/>
                <Tooltip contentStyle={tooltipStyle}/>
                <Legend wrapperStyle={{ fontSize: 11 }}/>
                <Line type="monotone" dataKey="energy" stroke="#58a6ff" name="Energy $" dot={{ r: 2 }} strokeWidth={1.5}/>
                <Line type="monotone" dataKey="demand" stroke="#d29922" name="Demand $" dot={{ r: 2 }} strokeWidth={1.5}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
    </div>
  )
}
