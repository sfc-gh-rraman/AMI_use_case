import { useState } from 'react'
import {
  Database, Brain, Sparkles, Zap, Server, Activity, Layers,
  AlertTriangle, Shield, Search, X, Cpu, BarChart3
} from 'lucide-react'

const components = {
  streaming: {
    id: 'streaming', name: 'Snowpipe Streaming', shortName: 'Ingest',
    description: 'Python SDK producer writes 15-minute interval reads into AMI_RAW.INTERVAL_READ_RAW (VARIANT). Authentic producer pattern with channel-per-meter grouping, offset tracking, and late-arrival handling.',
    tech: ['Snowpipe Streaming SDK', 'Python Producer', 'Channel-per-meter', 'VARIANT landing'],
    stats: '10.6B rows ingested',
    color: 'cyan',
  },
  canonical: {
    id: 'canonical', name: 'Canonical Fact (DT)', shortName: 'Fact',
    description: 'INTERVAL_READ_CHANNEL — the single canonical grain. A Dynamic Table with 1-min target_lag that applies last-write-wins MERGE from the raw VARIANT layer, flattens JSON, resolves channel collisions, and enriches with dimension keys.',
    tech: ['Dynamic Tables', '1-min target_lag', 'MERGE semantics', 'Channel-keyed'],
    stats: '10.6B rows, 100K meters',
    color: 'blue',
  },
  dtChain: {
    id: 'dtChain', name: 'DT Pipeline Chain', shortName: 'Pipeline',
    description: 'Declarative downstream marts: hourly/daily/monthly rollups, TOU-tagged charges, billing period consumption, transformer load factors, SLA metrics. All refresh from the single canonical grain — no orchestrator needed.',
    tech: ['DT Hourly (1-min)', 'DT Daily (5-min)', 'DT Monthly (1-hr)', 'DT Billing', 'DT TOU'],
    stats: '8 downstream DTs',
    color: 'green',
  },
  cortexML: {
    id: 'cortexML', name: 'Cortex ML Anomaly Detection', shortName: 'ML',
    description: 'Two trained models — feeder-level (2 000 series, 7.97M training rows) and per-meter CNI (500 series, 1.99M rows). DETECT_ANOMALIES scores the last 7 days, flags σ-outliers, and writes AMI_ANOMALY_EVENTS.',
    tech: ['ANOMALY_DETECTION', '2 models', 'Forecast bands', 'σ-distance scoring'],
    stats: '1,280 feeder anomalies',
    color: 'purple',
  },
  observability: {
    id: 'observability', name: 'Observability & DMFs', shortName: 'SLA',
    description: 'Data Metric Functions (ROW_COUNT + FRESHNESS) on RAW and canonical tables with 15-min schedule. PIPELINE_RUN_AUDIT tracks every producer run. SLA view computes on-time % per territory/feeder.',
    tech: ['DMFs', 'PIPELINE_RUN_AUDIT', '15-min schedule', 'SLA views'],
    stats: '99.2% on-time',
    color: 'yellow',
  },
  agent: {
    id: 'agent', name: 'Cortex Agent', shortName: 'Agent',
    description: 'AMI_INTELLIGENCE_AGENT orchestrates three tools: ami_analyst (semantic-view text-to-SQL), search_kb (Cortex Search over 10 runbook docs), and to_chart (Vega-Lite inline charts). Streaming SSE responses with thinking trace.',
    tech: ['Cortex Agents', 'ami_analyst', 'search_kb', 'data_to_chart', 'SSE streaming'],
    stats: '3 tools, streaming',
    color: 'purple',
  },
  semanticView: {
    id: 'semanticView', name: 'Semantic View + Analyst', shortName: 'Analyst',
    description: 'AMI_SEMANTIC_VIEW publishes 7 tables (daily_rollup, billing, charge_line, anomalies, meter, service_point, sla) with curated dimensions and metrics. Cortex Analyst generates SQL from natural language.',
    tech: ['Semantic View', 'Cortex Analyst', '7 tables', 'Territory/Feeder/Meter dims'],
    stats: '7 tables, 14 metrics',
    color: 'blue',
  },
  search: {
    id: 'search', name: 'Cortex Search (KB)', shortName: 'Search',
    description: 'AMI_KB_SEARCH over AMI_KNOWLEDGE_BASE (10 documents: outage runbook, tariff overview, billing rules, anomaly playbook, SLA definitions). Feeds the search_kb agent tool for qualitative queries.',
    tech: ['Cortex Search', '10 docs', 'Chunked embeddings', 'Semantic retrieval'],
    stats: '10 documents',
    color: 'green',
  },
  frontend: {
    id: 'frontend', name: 'React Dashboard (SPCS)', shortName: 'UI',
    description: 'Vite + React SPA with 11 tabs, Express backend, deployed as SPCS service. Navy/atlas dark theme, Recharts + Vega-Lite + Leaflet. Drag-to-zoom, auto-padded y-axes, inline agent chat with charts.',
    tech: ['React 18', 'Vite', 'Express', 'Recharts', 'Leaflet', 'SPCS'],
    stats: '11 tabs, live',
    color: 'cyan',
  },
}

const colorMap = {
  cyan:   { bg: 'bg-cyan-500/10',   bgA: 'bg-cyan-500/20',   border: 'border-cyan-500/30',   borderA: 'border-cyan-400',   text: 'text-cyan-400',   glow: 'shadow-cyan-500/50' },
  blue:   { bg: 'bg-blue-500/10',   bgA: 'bg-blue-500/20',   border: 'border-blue-500/30',   borderA: 'border-blue-400',   text: 'text-blue-400',   glow: 'shadow-blue-500/50' },
  green:  { bg: 'bg-emerald-500/10', bgA: 'bg-emerald-500/20', border: 'border-emerald-500/30', borderA: 'border-emerald-400', text: 'text-emerald-400', glow: 'shadow-emerald-500/50' },
  purple: { bg: 'bg-purple-500/10', bgA: 'bg-purple-500/20', border: 'border-purple-500/30', borderA: 'border-purple-400', text: 'text-purple-400', glow: 'shadow-purple-500/50' },
  yellow: { bg: 'bg-amber-500/10',  bgA: 'bg-amber-500/20',  border: 'border-amber-500/30',  borderA: 'border-amber-400',  text: 'text-amber-400',  glow: 'shadow-amber-500/50' },
}

const icons = {
  streaming: Zap, canonical: Database, dtChain: Layers, cortexML: Brain,
  observability: Activity, agent: Sparkles, semanticView: BarChart3,
  search: Search, frontend: Server,
}

function ComponentNode({ id, x, y, selected, onClick }) {
  const comp = components[id]
  const isActive = selected === id
  const c = colorMap[comp.color]
  const Icon = icons[id] || Cpu

  return (
    <g transform={`translate(${x}, ${y})`} onClick={() => onClick(isActive ? null : id)} className="cursor-pointer">
      {isActive && (
        <circle cx="40" cy="40" r="50" fill="currentColor" className={c.text} opacity={0.15} style={{ filter: 'blur(12px)' }}/>
      )}
      <rect x="0" y="0" width="80" height="80" rx="12"
        className={`${isActive ? c.bgA : c.bg} ${isActive ? c.borderA : c.border} stroke-current`}
        strokeWidth="1.5" fill="none"/>
      <rect x="0" y="0" width="80" height="80" rx="12"
        className={isActive ? c.bgA : c.bg} style={{ opacity: 0.6 }}/>
      <foreignObject x="20" y="12" width="40" height="40">
        <div className="flex items-center justify-center w-full h-full">
          <Icon size={26} className={c.text}/>
        </div>
      </foreignObject>
      <text x="40" y="68" textAnchor="middle" className="text-[10px] font-medium fill-slate-300">
        {comp.shortName}
      </text>
      <circle cx="70" cy="10" r="4" className="fill-emerald-400" style={{ filter: 'drop-shadow(0 0 4px #10b981)' }}>
        <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite"/>
      </circle>
    </g>
  )
}

function FlowLine({ from, to, label, curved }) {
  let path
  if (curved) {
    const midX = (from.x + to.x) / 2
    const midY = Math.min(from.y, to.y) - 30
    path = `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`
  } else {
    path = `M ${from.x} ${from.y} L ${to.x} ${to.y}`
  }
  return (
    <g>
      <path d={path} fill="none" stroke="#58a6ff" strokeWidth="2" strokeOpacity="0.15" style={{ filter: 'blur(3px)' }}/>
      <path d={path} fill="none" stroke="#58a6ff" strokeWidth="1.5" strokeDasharray="6 4" strokeOpacity="0.5">
        <animate attributeName="stroke-dashoffset" values="0;-10" dur="1.2s" repeatCount="indefinite"/>
      </path>
      <circle cx={to.x} cy={to.y} r="3" className="fill-atlas-blue" opacity="0.7">
        <animate attributeName="r" values="2;4;2" dur="1.5s" repeatCount="indefinite"/>
      </circle>
      {label && (
        <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 8} textAnchor="middle" className="text-[9px] fill-slate-500">
          {label}
        </text>
      )}
    </g>
  )
}

export default function Architecture() {
  const [selected, setSelected] = useState(null)
  const info = selected ? components[selected] : null

  return (
    <div className="p-6 min-h-screen overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-200 flex items-center gap-3">
            <div className="relative">
              <Zap className="text-atlas-blue"/>
              <div className="absolute inset-0 text-atlas-blue animate-ping opacity-30"><Zap/></div>
            </div>
            System Architecture
          </h1>
          <p className="text-slate-400 mt-2">
            Interactive blueprint of the AMI 2.0 platform. Click any component to inspect.
          </p>
        </div>

        <div className="grid grid-cols-5 gap-4 mb-8">
          {[
            { label: 'Interval Rows', value: '10.6B' },
            { label: 'Meters',        value: '100K' },
            { label: 'Dynamic Tables', value: '8' },
            { label: 'ML Models',     value: '2' },
            { label: 'Agent Tools',   value: '3' },
          ].map((s, i) => (
            <div key={i} className="bg-navy-800/60 border border-navy-700/50 rounded-xl text-center py-4">
              <p className="text-2xl font-mono font-bold text-atlas-blue">{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="bg-navy-800/40 border border-navy-700/50 rounded-xl p-8 relative overflow-hidden">
          <svg viewBox="0 0 1100 420" className="w-full h-auto" style={{ minHeight: '360px' }}>
            <defs>
              <pattern id="archGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(88,166,255,0.04)" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#archGrid)"/>

            <text x="60" y="25" className="text-[10px] fill-slate-500 uppercase tracking-wider">Ingestion</text>
            <text x="270" y="25" className="text-[10px] fill-slate-500 uppercase tracking-wider">Canonical</text>
            <text x="460" y="25" className="text-[10px] fill-slate-500 uppercase tracking-wider">Pipeline</text>
            <text x="660" y="25" className="text-[10px] fill-slate-500 uppercase tracking-wider">Intelligence</text>
            <text x="900" y="25" className="text-[10px] fill-slate-500 uppercase tracking-wider">Consumption</text>

            {/* Flows: Streaming → Canonical */}
            <FlowLine from={{ x: 140, y: 200 }} to={{ x: 250, y: 200 }} label="VARIANT"/>
            {/* Canonical → DT Chain */}
            <FlowLine from={{ x: 350, y: 200 }} to={{ x: 450, y: 200 }} label="MERGE"/>
            {/* Canonical → Observability */}
            <FlowLine from={{ x: 350, y: 200 }} to={{ x: 450, y: 330 }} label="DMFs"/>
            {/* DT Chain → ML */}
            <FlowLine from={{ x: 550, y: 200 }} to={{ x: 650, y: 120 }} label="Hourly"/>
            {/* DT Chain → Semantic View */}
            <FlowLine from={{ x: 550, y: 200 }} to={{ x: 650, y: 200 }} label="Marts"/>
            {/* DT Chain → Search */}
            <FlowLine from={{ x: 550, y: 200 }} to={{ x: 650, y: 310 }}/>
            {/* ML → Agent */}
            <FlowLine from={{ x: 750, y: 120 }} to={{ x: 870, y: 120 }} label="Events"/>
            {/* Semantic → Agent */}
            <FlowLine from={{ x: 750, y: 200 }} to={{ x: 870, y: 160 }}/>
            {/* Search → Agent */}
            <FlowLine from={{ x: 750, y: 310 }} to={{ x: 870, y: 200 }}/>
            {/* Agent → Frontend */}
            <FlowLine from={{ x: 970, y: 170 }} to={{ x: 970, y: 280 }} label="SSE"/>

            {/* Nodes */}
            <ComponentNode id="streaming"     x={40}  y={160} selected={selected} onClick={setSelected}/>
            <ComponentNode id="canonical"     x={250} y={160} selected={selected} onClick={setSelected}/>
            <ComponentNode id="dtChain"       x={450} y={160} selected={selected} onClick={setSelected}/>
            <ComponentNode id="observability" x={450} y={290} selected={selected} onClick={setSelected}/>
            <ComponentNode id="cortexML"      x={650} y={80}  selected={selected} onClick={setSelected}/>
            <ComponentNode id="semanticView"  x={650} y={170} selected={selected} onClick={setSelected}/>
            <ComponentNode id="search"        x={650} y={270} selected={selected} onClick={setSelected}/>
            <ComponentNode id="agent"         x={880} y={120} selected={selected} onClick={setSelected}/>
            <ComponentNode id="frontend"      x={930} y={280} selected={selected} onClick={setSelected}/>

            {/* Animated particles */}
            {[0,1,2,3].map(i => (
              <circle key={i} r="2" className="fill-atlas-blue">
                <animateMotion dur={`${3.5 + i * 0.6}s`} repeatCount="indefinite"
                  path="M 140 200 L 310 200 L 510 200 L 710 200 L 930 170"/>
                <animate attributeName="opacity" values="0;1;1;0" dur={`${3.5 + i * 0.6}s`} repeatCount="indefinite"/>
              </circle>
            ))}
          </svg>

          <div className="flex items-center justify-center gap-6 mt-4 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #58a6ff 0, #58a6ff 6px, transparent 6px, transparent 10px)' }}/>
              <span>Data flow</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-400 rounded-full" style={{ boxShadow: '0 0 6px #10b981' }}/>
              <span>Active</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 border border-atlas-blue/40 rounded"/>
              <span>Click for details</span>
            </div>
          </div>
        </div>

        {info && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setSelected(null)}>
            <div className="bg-navy-800 border border-navy-700 rounded-xl max-w-lg w-full relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => setSelected(null)} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-navy-700 transition-colors">
                <X size={20} className="text-slate-400"/>
              </button>
              <div className="flex items-start gap-4 p-6 pb-0">
                <div className="w-14 h-14 rounded-xl bg-navy-700 flex items-center justify-center">
                  {(() => { const Icon = icons[info.id] || Cpu; const c = colorMap[info.color]; return <Icon size={28} className={c.text}/> })()}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-200">{info.name}</h3>
                  {info.stats && <p className="text-sm text-atlas-blue font-mono">{info.stats}</p>}
                </div>
              </div>
              <div className="px-6 pt-4">
                <p className="text-slate-300 text-sm leading-relaxed mb-5">{info.description}</p>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Technologies</p>
                <div className="flex flex-wrap gap-2">
                  {info.tech.map((t, i) => (
                    <span key={i} className="text-xs px-3 py-1.5 bg-atlas-blue/10 text-atlas-blue rounded-full border border-atlas-blue/20">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-6 mx-6 mb-6 pt-4 border-t border-navy-700 flex items-center justify-between">
                <span className="text-xs text-slate-500">Component: {info.id}</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"/>
                  <span className="text-xs text-emerald-400">Online</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
