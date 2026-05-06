import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import { api, TERR_COLOR } from '../components/api'
import { Panel } from '../components/UI'

function FitBounds({ points }) {
  const map = useMap()
  useEffect(() => {
    if (points.length > 0) {
      const bounds = points.map(p => [p.lat, p.lon])
      map.fitBounds(bounds, { padding: [40, 40] })
    }
  }, [points, map])
  return null
}

export default function MapPage() {
  const [subs, setSubs] = useState([])
  const [feeders, setFeeders] = useState([])
  useEffect(() => {
    api('geo/substations').then(d => setSubs(Array.isArray(d) ? d : []))
    api('geo/feeder-health').then(d => setFeeders(Array.isArray(d) ? d : []))
  }, [])
  const allPoints = [...subs, ...feeders]
  return (
    <div className="p-6">
      <Panel title="Substations & feeder health (last 7 days)">
        <div className="h-[640px] rounded-lg overflow-hidden border border-navy-700/60">
          <MapContainer center={[37.5, -98]} zoom={4} style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={true}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            <FitBounds points={allPoints}/>
            {feeders.map(f => (
              <CircleMarker key={f.feeder_id} center={[f.lat, f.lon]} radius={3}
                pathOptions={{
                  color: f.completeness_pct < 99 ? '#d29922' : '#3fb950',
                  fillColor: f.completeness_pct < 99 ? '#d29922' : '#3fb950',
                  fillOpacity: 0.6, weight: 1
                }}>
                <Popup>
                  <div className="text-xs">
                    <div className="font-bold mb-1">{f.feeder_id}</div>
                    <div>Territory: {f.territory}</div>
                    <div>Meters: {f.meters}</div>
                    <div>Completeness: <span className={f.completeness_pct < 99 ? 'text-yellow-500' : 'text-green-500'}>{f.completeness_pct}%</span></div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
            {subs.map(s => (
              <CircleMarker key={s.substation_id} center={[s.lat, s.lon]} radius={9}
                pathOptions={{
                  color: TERR_COLOR[s.territory] || '#aaa',
                  fillColor: TERR_COLOR[s.territory] || '#aaa',
                  fillOpacity: 0.85, weight: 2
                }}>
                <Popup>
                  <div className="text-xs">
                    <div className="font-bold mb-1">{s.substation_id}</div>
                    <div>Territory: {s.territory}</div>
                    <div>Feeders: {s.feeders}</div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
          <span>Substations:</span>
          {Object.entries(TERR_COLOR).map(([t, c]) => (
            <span key={t} className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: c }}/> {t}
            </span>
          ))}
          <span className="ml-4">Feeders:</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-atlas-green"/> ≥99% complete</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-atlas-yellow"/> below</span>
        </div>
      </Panel>
    </div>
  )
}
