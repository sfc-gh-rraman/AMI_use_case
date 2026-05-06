export function KpiCard({ label, value, sub, accent, icon: Icon }) {
  return (
    <div className="card p-4 flex-1 min-w-[180px] flex items-start gap-3">
      {Icon && (
        <div className="w-9 h-9 rounded-lg bg-navy-700/60 flex items-center justify-center flex-shrink-0">
          <Icon size={18} className={accent || 'text-atlas-blue'} />
        </div>
      )}
      <div className="flex-1">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{label}</div>
        <div className={`text-2xl font-bold mt-0.5 ${accent || 'text-white'}`}>{value}</div>
        {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

export function Panel({ title, right, children, className = '' }) {
  return (
    <div className={`card p-4 mb-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">{title}</div>
        {right}
      </div>
      {children}
    </div>
  )
}

export function Empty({ message = 'No data' }) {
  return <div className="text-slate-500 text-sm py-8 text-center">{message}</div>
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-2 border-atlas-blue border-t-transparent rounded-full animate-spin"/>
    </div>
  )
}

// Recharts helpers — tighten y-axis around the data so fluctuations are visible
// instead of squashed against a 0-baseline. `pad` is fractional padding on each
// side of the actual data range. Use with: <YAxis domain={yPadDomain()} ... />
export const yPadDomain = (pad = 0.05) => [
  (dataMin) => Math.max(0, dataMin - (Math.abs(dataMin) * pad || 1)),
  (dataMax) => dataMax + (Math.abs(dataMax) * pad || 1),
]

// Compact tick label: 1500 → 1.5k, 2_300_000 → 2.3M, 1.2e9 → 1.2B
export const yAbbr = (v) => {
  if (v === null || v === undefined || isNaN(v)) return ''
  const a = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (a >= 1e9) return sign + (a/1e9).toFixed(1).replace(/\.0$/, '') + 'B'
  if (a >= 1e6) return sign + (a/1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (a >= 1e3) return sign + (a/1e3).toFixed(1).replace(/\.0$/, '') + 'k'
  if (a >= 100) return sign + a.toFixed(0)
  if (a >= 1)   return sign + a.toFixed(1).replace(/\.0$/, '')
  return sign + a.toFixed(2)
}

// Drag-to-zoom hook for Recharts line/area charts.
// Returns chart event handlers, current drag/zoom state, a slicer for the
// committed selection, and a reset(). Pattern:
//   const z = useDragZoom()
//   <LineChart {...z.handlers}>
//     {z.drag && <ReferenceArea x1={z.drag.x1} x2={z.drag.x2} ... />}
//     {z.zoom && <ReferenceArea x1={z.zoom.x1} x2={z.zoom.x2} ... />}
//   </LineChart>
//   {z.slice(data, 'ts')?.length > 1 && <ZoomedChart data={z.slice(data,'ts')}/>}
//   {z.zoom && <button onClick={z.reset}>Reset</button>}
import { useState as _us } from 'react'
export function useDragZoom() {
  const [drag, setDrag] = _us(null)
  const [zoom, setZoom] = _us(null)
  const handlers = {
    onMouseDown: (e) => { if (e?.activeLabel != null) setDrag({ x1: e.activeLabel, x2: e.activeLabel }) },
    onMouseMove: (e) => { if (drag && e?.activeLabel != null) setDrag(d => ({ ...d, x2: e.activeLabel })) },
    onMouseUp:   ()  => { if (drag && drag.x1 !== drag.x2) setZoom(drag); setDrag(null) },
    onMouseLeave:()  => { setDrag(null) },
  }
  const slice = (data, key = 'ts') => {
    if (!zoom || !Array.isArray(data)) return null
    const i1 = data.findIndex(r => r[key] === zoom.x1)
    const i2 = data.findIndex(r => r[key] === zoom.x2)
    if (i1 < 0 || i2 < 0) return null
    const [a, b] = i1 <= i2 ? [i1, i2] : [i2, i1]
    return data.slice(a, b + 1)
  }
  return { drag, zoom, handlers, slice, reset: () => setZoom(null) }
}
