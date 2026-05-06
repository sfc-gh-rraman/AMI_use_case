import { useState } from 'react'
import Layout from './components/Layout'
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

const PAGES = {
  ingestion: Ingestion, dq: DataQuality, billing: Billing, tou: TOU,
  transformers: Transformers, map: MapPage, events: Events,
  anomaly: Anomaly, observability: Observability, intelligence: Intelligence,
}

export default function App() {
  const [page, setPage] = useState('ingestion')
  const Page = PAGES[page] || Ingestion
  return (
    <Layout currentPage={page} onNavigate={setPage}>
      <Page/>
    </Layout>
  )
}
