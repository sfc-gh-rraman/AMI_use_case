export async function api(path) {
  try { const r = await fetch('/api/' + path); if (!r.ok) return null; return await r.json() } catch { return null }
}

export async function postApi(path, body) {
  try {
    const r = await fetch('/api/' + path, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!r.ok) return null; return await r.json()
  } catch { return null }
}

export const fmt = (n, dflt = '—') => {
  if (n === undefined || n === null || Number.isNaN(Number(n))) return dflt
  return Number(n).toLocaleString()
}

export const TERR_COLOR = { NE: '#58a6ff', SE: '#3fb950', MW: '#d29922', W: '#a371f7' }
