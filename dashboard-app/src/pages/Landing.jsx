import { useEffect, useState } from 'react'
import {
  Activity, Database, AlertTriangle, BarChart3, Cpu, MapPin,
  Sparkles, ArrowRight, ChevronRight, Zap, Layers, Brain,
  Receipt, Calculator
} from 'lucide-react'
import { api, fmt } from '../components/api'

const APP_NAME = 'AMI 2.0'
const TAGLINE = 'Snowflake-native Advanced Metering Infrastructure platform'

const features = [
  {
    icon: Database,
    title: 'Streaming Ingestion',
    desc: '15-minute interval reads landing through Snowpipe Streaming into a channel-keyed canonical fact (10.6B rows). Dynamic Tables refresh every minute with last-write-wins MERGE semantics.',
    color: 'blue',
  },
  {
    icon: Layers,
    title: 'Dynamic Table Chains',
    desc: 'A single canonical grain feeds all downstream marts: rollups, TOU charges, billing, observability, anomaly. Declarative target_lag from 1 min to 1 hour proves SLA without orchestration.',
    color: 'cyan',
  },
  {
    icon: Brain,
    title: 'Cortex ML Anomaly Detection',
    desc: 'Two trained models — feeder-level (2 000 series, 7.97M rows) and per-meter CNI (500 series). Forecast bands, model cards, drift visibility, and per-transformer attribution all live in the dashboard.',
    color: 'purple',
  },
  {
    icon: Sparkles,
    title: 'Cortex Agent + Search',
    desc: 'Natural-language Q&A over the semantic view, runbook search over the knowledge base, and inline Vega-Lite charts via data_to_chart — all surfaced through a streaming chat with thinking-step trace.',
    color: 'green',
  },
]

const featureColors = {
  blue:   'from-atlas-blue/20    to-atlas-blue/5    border-atlas-blue/30   text-atlas-blue',
  cyan:   'from-atlas-cyan/20    to-atlas-cyan/5    border-atlas-cyan/30   text-atlas-cyan',
  purple: 'from-atlas-purple/20  to-atlas-purple/5  border-atlas-purple/30 text-atlas-purple',
  green:  'from-atlas-green/20   to-atlas-green/5   border-atlas-green/30  text-atlas-green',
}

const quickLinks = [
  { id: 'anomaly',     icon: AlertTriangle, label: 'Anomalies',         desc: 'Forecast band, model cards, transformer rollup, drill-down' },
  { id: 'intelligence',icon: Sparkles,      label: 'Intelligence',      desc: 'Agent chat with text, SQL, citations, and inline charts' },
  { id: 'map',         icon: MapPin,        label: 'Feeder Map',        desc: '~2 000 feeder markers coloured by health' },
  { id: 'billing',     icon: Receipt,       label: 'Billing Readiness', desc: '% ready trend and held-bill $ exposure over 12 months' },
  { id: 'transformers',icon: Cpu,           label: 'Transformers',      desc: 'Load-factor leaderboard, kVA-vs-load distribution' },
  { id: 'tou',         icon: Calculator,    label: 'TOU Charges',       desc: 'Energy and demand charges by bucket and over time' },
  { id: 'ingestion',   icon: Database,      label: 'Ingestion',         desc: '48h hourly reads by territory, SLA timeline' },
  { id: 'observability',icon: Activity,     label: 'Observability',     desc: 'DMF results, anomaly DTs, pipeline health' },
]

export default function Landing({ onNavigate }) {
  const [mounted, setMounted] = useState(false)
  const [typed, setTyped] = useState('')
  const [stats, setStats] = useState(null)

  const fullText = `Hello. I'm AMI 2.0 — your Snowflake-native metering platform. Pick a starting point below.`

  useEffect(() => {
    setMounted(true)
    let i = 0
    const t = setInterval(() => {
      if (i <= fullText.length) { setTyped(fullText.slice(0, i)); i++ } else clearInterval(t)
    }, 24)
    return () => clearInterval(t)
  }, [])

  // Pull a few live numbers for the hero stats bar
  useEffect(() => {
    Promise.all([
      api('ingestion/kpi'),
      api('billing/stats'),
      api('anomaly/kpi'),
    ]).then(([ing, bill, anom]) => {
      setStats({
        rows:    ing?.interval_rows,
        meters:  ing?.meters,
        ready:   bill?.pct_ready,
        feederA: anom?.feeder_anomalies,
      })
    }).catch(() => setStats({}))
  }, [])

  const formatRows = (v) => v ? (v / 1e9).toFixed(1) + 'B' : '—'

  return (
    <div className="min-h-screen bg-navy-900 overflow-y-auto">
      {/* Hero */}
      <div className="relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-atlas-blue/20 rounded-full blur-3xl animate-pulse"/>
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-atlas-purple/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}/>
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-navy-900/50 via-transparent to-navy-900"/>

        <div className="relative max-w-7xl mx-auto px-6 pt-16 pb-20">
          <div className={`text-center transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <div className="relative inline-block mb-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-atlas-blue to-atlas-purple flex items-center justify-center shadow-2xl shadow-atlas-blue/30">
                <Zap size={40} className="text-white"/>
              </div>
              <div className="absolute inset-0 w-20 h-20 rounded-2xl bg-gradient-to-br from-atlas-blue to-atlas-purple blur-xl opacity-50"/>
            </div>

            <h1 className="text-5xl font-bold mb-3">
              <span className="bg-gradient-to-r from-atlas-blue via-atlas-cyan to-atlas-purple bg-clip-text text-transparent">
                {APP_NAME}
              </span>
            </h1>
            <p className="text-lg text-slate-400 mb-1">{TAGLINE}</p>
            <p className="text-sm text-slate-500 mb-6">Snowpipe Streaming · Dynamic Tables · Cortex ML · Cortex Agents · SPCS</p>

            <div className="max-w-2xl mx-auto mb-10">
              <div className="bg-navy-800/80 backdrop-blur-sm border border-navy-700 rounded-xl p-5 text-left">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-atlas-blue to-atlas-purple flex items-center justify-center flex-shrink-0">
                    <Sparkles size={20} className="text-white"/>
                  </div>
                  <div className="flex-1">
                    <p className="text-base text-slate-200 leading-relaxed">
                      {typed}<span className="inline-block w-0.5 h-4 bg-atlas-blue ml-1 animate-pulse"/>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button onClick={() => onNavigate('anomaly')}
                className="group flex items-center gap-3 px-7 py-3.5 bg-gradient-to-r from-atlas-blue to-atlas-purple rounded-xl text-white font-semibold text-base shadow-xl shadow-atlas-blue/25 hover:shadow-atlas-blue/40 hover:scale-105 transition-all">
                Open Operations Console
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform"/>
              </button>
              <button onClick={() => onNavigate('intelligence')}
                className="flex items-center gap-2 px-5 py-3.5 bg-navy-700/50 border border-navy-600 rounded-xl text-slate-300 font-medium hover:bg-navy-600/50 hover:border-navy-500 transition-all">
                <Sparkles size={16} className="text-atlas-purple"/>
                Talk to AMI Intelligence
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Live stats bar */}
      <div className={`bg-navy-800/50 border-y border-navy-700/50 py-6 transition-all duration-1000 delay-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-4 gap-8">
            <div className="text-center">
              <p className="text-3xl font-bold text-atlas-cyan">{stats ? formatRows(stats.rows) : '—'}</p>
              <p className="text-sm text-slate-400 mt-1">Interval rows</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-atlas-blue">{stats ? fmt(stats.meters) : '—'}</p>
              <p className="text-sm text-slate-400 mt-1">Meters</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-atlas-green">{stats?.ready !== undefined ? stats.ready + '%' : '—'}</p>
              <p className="text-sm text-slate-400 mt-1">Billing readiness</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-atlas-yellow">{stats ? fmt(stats.feederA) : '—'}</p>
              <p className="text-sm text-slate-400 mt-1">Feeder anomalies</p>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className={`text-center mb-10 transition-all duration-1000 delay-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          <h2 className="text-2xl font-bold text-slate-200 mb-3">A complete utility data platform — on Snowflake</h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            From raw 15-minute interval reads to anomaly forecasting and natural-language Q&amp;A —
            built on a single canonical grain, declarative refresh, and Cortex AI.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-5">
          {features.map((f, i) => {
            const Icon = f.icon
            return (
              <div key={i}
                className={`bg-gradient-to-br ${featureColors[f.color]} border rounded-xl p-6 transition-all duration-500 hover:scale-[1.02] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
                style={{ transitionDelay: `${600 + i * 100}ms` }}>
                <div className="w-11 h-11 rounded-xl bg-navy-800/80 flex items-center justify-center mb-4">
                  <Icon size={22}/>
                </div>
                <h3 className="text-lg font-semibold text-slate-200 mb-2">{f.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Hidden Insight callout */}
      <div className="max-w-7xl mx-auto px-6 pb-16">
        <div className={`bg-gradient-to-r from-atlas-yellow/10 to-atlas-red/10 border border-atlas-yellow/30 rounded-xl p-6 transition-all duration-1000 delay-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-atlas-yellow/20 flex items-center justify-center flex-shrink-0">
              <BarChart3 size={24} className="text-atlas-yellow"/>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-atlas-yellow mb-2">
                Per-transformer rollup of feeder anomalies
              </h3>
              <p className="text-slate-300 text-sm mb-3 leading-relaxed">
                Without retraining a per-transformer model, the platform allocates feeder anomalous
                excess kWh down to the transformer grain in proportion to 30-day load share.
                Top 25 transformers ranked by estimated <strong className="text-white">$ exposure</strong> during anomaly windows
                — every row drills into the parent feeder's forecast band.
              </p>
              <p className="text-slate-400 text-sm">
                The same pattern lights up the Anomaly tab's <strong className="text-white">model cards</strong>,
                drag-to-zoom <strong className="text-white">forecast band</strong>, and the
                Intelligence chat's inline <strong className="text-white">Vega-Lite charts</strong>
                generated by Cortex's <code className="bg-navy-800 px-1.5 py-0.5 rounded text-xs text-atlas-cyan">data_to_chart</code> tool.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="max-w-7xl mx-auto px-6 pb-16">
        <h3 className="text-sm uppercase tracking-wider text-slate-500 font-medium mb-4">Jump to</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickLinks.map(({ id, icon: Icon, label, desc }, i) => (
            <button key={id} onClick={() => onNavigate(id)}
              className="bg-navy-800/50 border border-navy-700/50 rounded-xl p-4 text-left group hover:border-atlas-blue/30 hover:bg-navy-800/80 transition-all">
              <div className="flex items-center gap-3 mb-2">
                <Icon size={18} className="text-atlas-blue"/>
                <span className="font-medium text-slate-200 group-hover:text-atlas-blue transition-colors text-sm">
                  {label}
                </span>
                <ChevronRight size={14} className="text-slate-500 ml-auto group-hover:translate-x-1 transition-transform"/>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-navy-700/50 py-6">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-sm text-slate-500">
            Built on <span className="text-atlas-blue">Snowflake</span> · Cortex AI · Cortex Agents · Snowpark Container Services
          </p>
        </div>
      </div>
    </div>
  )
}
