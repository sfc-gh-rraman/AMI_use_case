// Capture screenshots of each tab for design doc
import puppeteer from 'puppeteer'
import fs from 'fs'
import path from 'path'

const OUT = '/Users/rraman/Documents/AMI_use_case/design/screenshots'
fs.mkdirSync(OUT, { recursive: true })

const NAV_LABELS = {
  '01_landing':    null,            // initial home
  '02_ingestion':  'Ingestion',
  '03_data_quality': 'Data Quality',
  '04_billing':    'Billing',
  '05_tou':        'TOU Charges',
  '06_transformers': 'Transformers',
  '07_map':        'Map',
  '08_events':     'Events',
  '09_anomalies':  'Anomalies',
  '10_observability': 'Observability',
  '11_intelligence': 'Intelligence',
}

const browser = await puppeteer.launch({ headless: 'new', defaultViewport: { width: 1440, height: 900 } })
const page = await browser.newPage()
page.setDefaultTimeout(20000)

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))

for (const [name, label] of Object.entries(NAV_LABELS)) {
  if (label) {
    // Click the sidebar nav with this label
    const clicked = await page.evaluate((lbl) => {
      const btns = [...document.querySelectorAll('button')]
      const match = btns.find(b => b.textContent.trim() === lbl)
      if (match) { match.click(); return true }
      return false
    }, label)
    if (!clicked) console.warn('  could not click', label)
    await new Promise(r => setTimeout(r, 2200))
  }
  const out = path.join(OUT, name + '.png')
  await page.screenshot({ path: out, fullPage: true })
  console.log('  saved', name)
}

await browser.close()
console.log('done')
