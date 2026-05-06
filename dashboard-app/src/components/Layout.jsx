import { useState } from 'react'
import {
  Activity, Database, ShieldCheck, Receipt, Calculator, Cpu,
  AlertTriangle, MapPin, Bell, Wrench, Sparkles, Home, Zap,
  ChevronLeft, ChevronRight
} from 'lucide-react'

const NAV = [
  { id: 'home',          label: 'Home',          icon: Home },
  { id: 'ingestion',     label: 'Ingestion',     icon: Database },
  { id: 'dq',            label: 'Data Quality',  icon: ShieldCheck },
  { id: 'billing',       label: 'Billing',       icon: Receipt },
  { id: 'tou',           label: 'TOU Charges',   icon: Calculator },
  { id: 'transformers',  label: 'Transformers',  icon: Cpu },
  { id: 'map',           label: 'Map',           icon: MapPin },
  { id: 'events',        label: 'Events',        icon: Bell },
  { id: 'anomaly',       label: 'Anomalies',     icon: AlertTriangle },
  { id: 'observability', label: 'Observability', icon: Wrench },
  { id: 'intelligence',  label: 'Intelligence',  icon: Sparkles },
  { id: 'architecture',  label: 'Architecture',  icon: Zap },
]

export default function Layout({ currentPage, onNavigate, children }) {
  const [collapsed, setCollapsed] = useState(false)
  const active = NAV.find(n => n.id === currentPage)
  return (
    <div className="h-screen flex overflow-hidden bg-navy-950">
      <aside className={`${collapsed ? 'w-16' : 'w-60'} flex-shrink-0 bg-navy-900 border-r border-navy-700/50 flex flex-col transition-all duration-200`}>
        <div className="h-16 flex items-center justify-between px-4 border-b border-navy-700/50">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-atlas-blue to-atlas-purple flex items-center justify-center">
                <Activity size={18} className="text-white" />
              </div>
              <div>
                <span className="font-display font-bold text-base text-white tracking-wide">AMI 2.0</span>
                <span className="text-[10px] text-slate-500 block -mt-0.5">Command Center</span>
              </div>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 hover:bg-navy-700 rounded text-slate-400 hover:text-white transition-colors">
            {collapsed ? <ChevronRight size={16}/> : <ChevronLeft size={16}/>}
          </button>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {NAV.map(item => {
            const isActive = currentPage === item.id
            const Icon = item.icon
            return (
              <button key={item.id} onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 group
                  ${isActive ? 'bg-atlas-blue/10 text-atlas-blue' : 'text-slate-400 hover:text-white hover:bg-navy-700/40'}`}>
                <Icon size={18} className={isActive ? 'text-atlas-blue' : 'text-slate-500 group-hover:text-atlas-blue/70'} />
                {!collapsed && <span>{item.label}</span>}
                {isActive && !collapsed && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-atlas-blue"/>}
              </button>
            )
          })}
        </nav>

        <div className="p-3 border-t border-navy-700/50">
          {!collapsed ? (
            <div className="text-[11px] text-slate-500">
              <div className="flex items-center justify-between mb-1.5">
                <span>System Status</span>
                <span className="flex items-center gap-1 text-atlas-green">
                  <Activity size={10}/> Online
                </span>
              </div>
              <div className="text-slate-600">100K meters · 10.6B intervals</div>
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="w-2 h-2 rounded-full bg-atlas-green animate-pulse"/>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-hidden flex flex-col">
        <header className="h-14 flex-shrink-0 border-b border-navy-700/50 flex items-center justify-between px-6 bg-navy-900/40">
          <div className="flex items-center gap-3">
            {active && <active.icon size={18} className="text-atlas-blue" />}
            <h1 className="font-display font-semibold text-base text-white">{active?.label || 'AMI'}</h1>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2 text-slate-400">
              <span className="w-2 h-2 rounded-full bg-atlas-green animate-pulse"/>
              Snowflake Cortex Connected
            </div>
            <div className="text-slate-500">Dynamic Tables · Cortex ML · DMFs · Cortex Agent</div>
          </div>
        </header>
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  )
}
