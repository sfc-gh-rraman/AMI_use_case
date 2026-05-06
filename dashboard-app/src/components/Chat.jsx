import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, User, Loader2, Code, ChevronDown, ChevronUp, CheckCircle, Database, BookOpen } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

const SUGGESTIONS = [
  'What is the total kWh by territory in the last month?',
  'Which feeders have the worst data quality?',
  'How many billing periods are not ready to bill?',
  'Show me total energy charges by TOU bucket.',
  'Explain the outage response runbook.',
  'Describe the SCE tariff hierarchy.',
]

export default function Chat() {
  const [messages, setMessages] = useState([{
    id: '0', role: 'assistant',
    content: "👋 I'm **AMI Intelligence**, your operational analytics assistant.\n\nI can answer:\n- **Quantitative** questions over the AMI semantic view (kWh, charges, anomalies, billing readiness, SLA)\n- **Operational** questions from the runbook & tariff knowledge base\n\nTry one of the suggestions, or ask anything."
  }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [showSteps, setShowSteps] = useState({})
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function send(text) {
    if (!text.trim() || busy) return
    const id = Date.now().toString()
    const aId = (Date.now()+1).toString()
    setMessages(m => [...m, { id, role: 'user', content: text.trim() }])
    setMessages(m => [...m, { id: aId, role: 'assistant', content: '', steps: [], streaming: true }])
    setShowSteps(s => ({ ...s, [aId]: true }))
    setInput('')
    setBusy(true)

    let answer = '', sql = '', rows = [], citations = [], steps = []
    try {
      const r = await fetch('/api/intelligence/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text.trim() })
      })
      if (!r.ok || !r.body) throw new Error('stream unavailable')
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const events = buf.split('\n\n')
        buf = events.pop() || ''
        for (const ev of events) {
          if (!ev.startsWith('data:')) continue
          const json = ev.slice(5).trim()
          if (!json || json === '[DONE]') continue
          try {
            const e = JSON.parse(json)
            if (e.type === 'status') {
              steps = [...steps, { id: 's'+steps.length, title: e.title, content: e.content || '', status: 'in_progress', icon: e.icon }]
              steps.slice(0,-1).forEach(s => s.status = 'completed')
            } else if (e.type === 'sql') {
              sql = e.sql
              steps = [...steps, { id: 's'+steps.length, title: 'Generated SQL', content: 'Cortex Analyst produced a query', status: 'completed', sql: e.sql, icon: 'code' }]
            } else if (e.type === 'rows') {
              rows = e.rows || []
              steps = [...steps, { id: 's'+steps.length, title: 'Executed SQL', content: `${rows.length} rows returned`, status: 'completed', icon: 'db' }]
            } else if (e.type === 'citations') {
              citations = e.citations || []
              if (citations.length) steps = [...steps, { id: 's'+steps.length, title: 'Knowledge search', content: `${citations.length} sources retrieved`, status: 'completed', icon: 'book' }]
            } else if (e.type === 'text') {
              answer += e.content || ''
            } else if (e.type === 'error') {
              answer += '\n\n⚠️ ' + (e.content || 'Error')
            }
            setMessages(m => m.map(msg => msg.id === aId
              ? { ...msg, content: answer, steps: [...steps], sql, rows, citations }
              : msg))
          } catch {}
        }
      }
      steps.forEach(s => s.status = 'completed')
      setMessages(m => m.map(msg => msg.id === aId ? { ...msg, content: answer || 'Done.', steps, sql, rows, citations, streaming: false } : msg))
      setTimeout(() => setShowSteps(s => ({ ...s, [aId]: false })), 1500)
    } catch (err) {
      setMessages(m => m.map(msg => msg.id === aId
        ? { ...msg, content: 'Streaming unavailable. Please try again.', streaming: false } : msg))
    } finally {
      setBusy(false)
    }
  }

  function StepIcon({ icon, status }) {
    if (status === 'completed') return <CheckCircle size={14} className="text-atlas-green flex-shrink-0 mt-0.5" />
    if (status === 'in_progress') return <Loader2 size={14} className="text-atlas-blue flex-shrink-0 mt-0.5 animate-spin" />
    if (icon === 'code') return <Code size={14} className="text-atlas-purple flex-shrink-0 mt-0.5" />
    if (icon === 'db')   return <Database size={14} className="text-atlas-cyan flex-shrink-0 mt-0.5" />
    if (icon === 'book') return <BookOpen size={14} className="text-atlas-yellow flex-shrink-0 mt-0.5" />
    return <Sparkles size={14} className="text-slate-500 flex-shrink-0 mt-0.5" />
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2 space-y-4">
        {messages.map(m => (
          <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'assistant' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-atlas-blue to-atlas-purple flex items-center justify-center">
                <Sparkles size={16} className="text-white" />
              </div>
            )}
            <div className={`max-w-[85%] ${m.role === 'user' ? 'order-first' : ''}`}>
              {m.role === 'assistant' && m.steps && m.steps.length > 0 && (
                <div className="mb-2">
                  <button onClick={() => setShowSteps(s => ({ ...s, [m.id]: !s[m.id] }))}
                    className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300">
                    {m.streaming
                      ? <Loader2 size={11} className="animate-spin text-atlas-blue"/>
                      : <CheckCircle size={11} className="text-atlas-green"/>}
                    Thinking ({m.steps.length})
                    {showSteps[m.id] ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
                  </button>
                  {showSteps[m.id] && (
                    <div className="mt-1 bg-navy-900/60 border border-navy-700/50 rounded-md p-2 space-y-1.5">
                      {m.steps.map(s => (
                        <div key={s.id} className="flex items-start gap-2 text-[11px]">
                          <StepIcon icon={s.icon} status={s.status} />
                          <div className="flex-1 min-w-0">
                            <div className="text-slate-300 font-medium">{s.title}</div>
                            {s.content && <div className="text-slate-500">{s.content}</div>}
                            {s.sql && (
                              <pre className="mt-1 p-2 bg-navy-950 rounded text-[10px] font-mono text-atlas-green overflow-x-auto whitespace-pre-wrap break-all">{s.sql.slice(0, 400)}{s.sql.length > 400 ? '...' : ''}</pre>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className={`rounded-lg px-3.5 py-2.5 ${m.role === 'user'
                ? 'bg-atlas-blue/15 border border-atlas-blue/30 text-slate-100'
                : 'bg-navy-800/60 border border-navy-700/50 text-slate-200'} text-sm`}>
                {m.role === 'assistant'
                  ? <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>{m.content || (m.streaming ? '_Thinking…_' : '')}</ReactMarkdown>
                    </div>
                  : m.content}
              </div>

              {m.role === 'assistant' && m.rows && m.rows.length > 0 && (
                <div className="mt-2 card p-2 overflow-auto max-h-72">
                  <table className="w-full text-[11px]">
                    <thead><tr className="text-slate-400 border-b border-navy-700/50">
                      {Object.keys(m.rows[0]).map(k =>
                        <th key={k} className="text-left p-1.5 font-medium">{k}</th>)}
                    </tr></thead>
                    <tbody>
                      {m.rows.map((r,i) => (
                        <tr key={i} className="border-b border-navy-800/50">
                          {Object.values(r).map((v,j) =>
                            <td key={j} className="p-1.5 text-slate-300 font-mono">{String(v)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {m.role === 'assistant' && m.citations && m.citations.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Sources</div>
                  {m.citations.map((c,i) => (
                    <div key={i} className="card p-2 text-[11px]">
                      <div className="text-atlas-blue font-medium mb-0.5">{c.title}</div>
                      <div className="text-slate-400">{c.snippet}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {m.role === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-navy-700 flex items-center justify-center">
                <User size={16} className="text-slate-400"/>
              </div>
            )}
          </div>
        ))}
        <div ref={endRef}/>
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s,i) => (
            <button key={i} onClick={() => send(s)} disabled={busy}
              className="card px-2.5 py-1 text-[11px] text-slate-300 hover:border-atlas-blue/40 hover:text-atlas-blue transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-navy-700/50 p-3">
        <form onSubmit={e => { e.preventDefault(); send(input) }} className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} disabled={busy}
            placeholder="Ask AMI Intelligence..."
            className="flex-1 bg-navy-900 border border-navy-700 rounded-md px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-atlas-blue/60"/>
          <button type="submit" disabled={busy || !input.trim()}
            className="bg-atlas-blue hover:bg-atlas-blue/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md px-4 flex items-center gap-1.5 text-sm font-medium transition-colors">
            {busy ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>}
            {busy ? 'Asking…' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  )
}
