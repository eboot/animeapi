// API mini untuk database KuramaAnime (terpisah dari animedong).
// Jalan: node server.js  ->  http://localhost:3002
import express from 'express'
import { listAnime, getAnime, stats } from './db.js'
import { scrapeLatest, scrapeAnime } from './scrape.js'

const app = express()
const PORT = process.env.PORT || 3002
app.use(express.json())

app.get('/api/stats', (req, res) => res.json({ ok: true, data: stats() }))
app.get('/api/anime', (req, res) => res.json({ ok: true, ...listAnime(req.query) }))
app.get('/api/anime/:id', (req, res) => {
  const a = getAnime(req.params.id)
  if (!a) return res.status(404).json({ ok: false, error: 'tidak ketemu' })
  res.json({ ok: true, data: a })
})

// Trigger scrape: POST /api/scrape/latest {n}  atau  POST /api/scrape/anime {id, slug}
app.post('/api/scrape/latest', async (req, res) => {
  try {
    const results = await scrapeLatest(req.body?.n || 10)
    res.json({ ok: true, results })
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message })
  }
})
app.post('/api/scrape/anime', async (req, res) => {
  try {
    const { id, slug } = req.body
    if (!id) return res.status(400).json({ ok: false, error: 'id wajib' })
    const r = await scrapeAnime({ id: parseInt(id), slug: slug || '', url: `https://v20.kuramanime.ing/anime/${id}/${slug || ''}` })
    res.json({ ok: true, data: r })
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message })
  }
})

app.listen(PORT, () => console.log(`Kurama scraper API: http://localhost:${PORT}`))
