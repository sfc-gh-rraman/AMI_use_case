import { useEffect, useRef } from 'react'
import vegaEmbed from 'vega-embed'

// Dark theme defaults applied on top of any incoming Vega-Lite spec
const DARK_CONFIG = {
  background: 'transparent',
  axis: {
    domainColor: '#30363d', gridColor: '#21262d',
    labelColor: '#8fa0c4', tickColor: '#30363d', titleColor: '#94a3b8',
    labelFontSize: 11, titleFontSize: 11
  },
  legend: { labelColor: '#94a3b8', titleColor: '#94a3b8', labelFontSize: 11 },
  title: { color: '#e6edf7' },
  view: { stroke: 'transparent' },
  range: { category: ['#58a6ff','#3fb950','#d29922','#a371f7','#39c5cf','#f85149'] },
  mark: { color: '#58a6ff' }
}

export default function VegaChart({ spec }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current || !spec) return
    let view
    const merged = { ...spec, config: { ...(spec.config || {}), ...DARK_CONFIG } }
    if (!merged.width)  merged.width  = 'container'
    if (!merged.height) merged.height = 260
    vegaEmbed(ref.current, merged, {
      actions: false, theme: undefined, renderer: 'svg'
    }).then(r => { view = r.view }).catch(e => {
      console.error('vega-embed error', e)
      if (ref.current) ref.current.innerHTML =
        '<div style="color:#f85149;font-size:11px;padding:8px">Chart render error: ' + (e.message || e) + '</div>'
    })
    return () => { try { view?.finalize() } catch {} }
  }, [spec])
  return <div ref={ref} className="w-full" style={{ minHeight: 260 }}/>
}
