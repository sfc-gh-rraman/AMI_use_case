import { useState } from 'react'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import Ingestion from './pages/Ingestion'
import DataQuality from './pages/DataQuality'
import Billing from './pages/Billing'
import TOU from './pages/TOU'
import Transformers from './pages/Transformers'
import MapPage from './pages/MapPage'
import Events from './pages/Events'
import Anomaly from './pages/Anomaly'
import Observability from './pages/Observability'
import Intelligence from './pages/Intelligence'
import Architecture from './pages/Architecture'

const PAGES = {
  home: Landing,
  ingestion: Ingestion, dq: DataQuality, billing: Billing, tou: TOU,
  transformers: Transformers, map: MapPage, events: Events,
  anomaly: Anomaly, observability: Observability, intelligence: Intelligence,
  architecture: Architecture,
}

export default function App() {
  const [page, setPage] = useState('home')
  const Page = PAGES[page] || Landing
  // Landing receives a navigation prop; other pages don't need it
  const PageEl = page === 'home' ? <Page onNavigate={setPage}/> : <Page/>
  return (
    <Layout currentPage={page} onNavigate={setPage}>
      {PageEl}
    </Layout>
  )
}
