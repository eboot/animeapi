// Scraper KuramaAnime -> SQLite terpisah (data/kurama.sqlite).
// Header browser lengkap wajib (tanpa Sec-Fetch-* kena 403 Cloudflare).
import * as cheerio from 'cheerio'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { saveAnime, saveEpisode, updatePoster } from './db.js'
import { uploadImage, r2Enabled } from './r2.js'

const execFileAsync = promisify(execFile)
const BASE = 'https://v20.kuramanime.ing'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

// Pakai curl binary (bukan fetch Node): fingerprint TLS curl lolos Cloudflare,
// fetch Node kena 403 meski header sama.
async function fetchPage(url, referer = null) {
  // Sec-Fetch-Site harus jujur: 'none' untuk navigasi langsung, 'same-origin' bila dari halaman sendiri.
  // Salah isi (mis. same-origin di homepage) -> 403 Cloudflare.
  const site = referer ? 'same-origin' : 'none'
  const args = [
    '-s', '-m', '40', '--compressed',
    '-A', UA,
    '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    '-H', 'Accept-Language: id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    '-H', 'Upgrade-Insecure-Requests: 1',
    '-H', 'Sec-Fetch-Dest: document',
    '-H', 'Sec-Fetch-Mode: navigate',
    '-H', `Sec-Fetch-Site: ${site}`,
    '-w', '\n%{http_code}',
    url,
  ]
  if (referer) args.splice(args.length - 1, 0, '-H', `Referer: ${referer}`)
  const { stdout } = await execFileAsync('curl', args, { maxBuffer: 32 * 1024 * 1024 })
  const code = stdout.slice(-4).trim()
  const body = stdout.slice(0, -4)
  if (code !== '200') throw new Error(`HTTP ${code} dari ${url}`)
  return body
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parseAnimeList(html) {
  const $ = cheerio.load(html)
  const out = []
  const seen = new Set()
  $('a[href^="/anime/"]').each((_, el) => {
    const href = $(el).attr('href')
    const m = href.match(/^\/anime\/(\d+)\/([a-z0-9-]+?)(?:\/episode\/\d+)?$/)
    if (!m || seen.has(m[1])) return
    seen.add(m[1])
    out.push({ id: parseInt(m[1]), slug: m[2], url: BASE + `/anime/${m[1]}/${m[2]}` })
  })
  return out
}

function parseDetail(html, meta) {
  const $ = cheerio.load(html)
  const block = $('.anime__details__text')
  const title = block.find('h1, h2').first().text().trim() || $('title').text().split(' - ')[0].trim()
  const ps = block.find('p')
  const altTitles = ps.eq(0).text().trim()
  const synopsis = ps.eq(1).text().replace(/Catatan:.*/s, '').trim()

  const info = {}
  block.find('li, .anime__details__widget ul li').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    const m = t.match(/^([^:]+):\s*(.+)$/)
    if (m) info[m[1].trim()] = m[2].trim()
  })
  // fallback: cari pola "Label: value" di teks blok (daftar label eksplisit)
  if (!info['Tipe']) {
    const raw = block.text().replace(/\s+/g, ' ')
    const labels = ['Tipe', 'Episode', 'Status', 'Tayang', 'Musim', 'Durasi', 'Kualitas',
      'Negara', 'Adaptasi', 'Genre', 'Tema', 'Studio', 'Skor', 'Peminat', 'Judul', 'Sinopsis']
    const look = labels.join('|')
    for (const label of labels) {
      const m = raw.match(new RegExp(label + ':\\s*([^:]+?)(?=\\s*(?:' + look + '):|$)'))
      if (m && !info[label]) info[label] = m[1].trim().slice(0, 300)
    }
  }

  const poster = $('meta[property="og:image"]').attr('content') || ''
  // Link episode ada di dalam JS string (bukan DOM) -> regex dari HTML mentah.
  const episodes = []
  const seenEp = new Set()
  const epRe = new RegExp(`${BASE}/anime/${meta.id}/${meta.slug}/episode/(\\d+)`, 'g')
  let m
  while ((m = epRe.exec(html)) !== null) {
    if (seenEp.has(m[1])) continue
    seenEp.add(m[1])
    episodes.push({ num: m[1], title: `Episode ${m[1]}`, url: m[0] })
  }
  episodes.sort((a, b) => parseInt(a.num) - parseInt(b.num))

  return {
    id: meta.id,
    slug: meta.slug,
    title,
    alt_titles: altTitles,
    poster,
    synopsis,
    type: info['Tipe'] || '',
    status: info['Status'] || '',
    aired: info['Tayang'] || '',
    season: info['Musim'] || '',
    duration: info['Durasi'] || '',
    genres: info['Genre'] || '',
    studio: info['Studio'] || '',
    episodes_count: info['Episode'] || String(episodes.length),
    url: meta.url,
    episodes,
  }
}

/** Scrape daftar anime terbaru dari homepage. */
export async function scrapeHome() {
  const html = await fetchPage(BASE + '/')
  return parseAnimeList(html)
}

/** Scrape detail + episode satu anime, langsung simpan ke DB. */
export async function scrapeAnime(meta) {
  const html = await fetchPage(meta.url, BASE + '/')
  const d = parseDetail(html, meta)
  saveAnime(d)
  // Mirror poster ke R2 (kalau dikonfigurasi) — URL R2 yang disimpan.
  if (d.poster && r2Enabled()) {
    const r2url = await uploadImage(d.poster, `posters/kurama/${d.id}`, BASE + '/')
    if (r2url && r2url !== d.poster) {
      updatePoster(d.id, r2url)
      d.poster = r2url
    }
  }
  for (const ep of d.episodes) saveEpisode(d.id, ep)
  return { id: d.id, title: d.title, episodes: d.episodes.length }
}

/** Scrape N anime terbaru dari homepage (detail + episode). */
export async function scrapeLatest(limit = 10, delayMs = 1500) {
  const list = await scrapeHome()
  const target = list.slice(0, limit)
  const results = []
  for (const meta of target) {
    try {
      results.push({ ...(await scrapeAnime(meta)), ok: true })
    } catch (e) {
      results.push({ id: meta.id, ok: false, error: e.message })
    }
    await sleep(delayMs)
  }
  return results
}

// CLI
const [cmd, arg] = process.argv.slice(2)
if (cmd === 'home') {
  const list = await scrapeHome()
  console.log(JSON.stringify(list.slice(0, 20), null, 1))
  console.log(`total di homepage: ${list.length}`)
} else if (cmd === 'anime') {
  if (!arg) throw new Error('pakai: node scrape.js anime <id> [slug]')
  const [id, slug] = arg.split('/')
  const meta = slug
    ? { id: parseInt(id), slug, url: `${BASE}/anime/${id}/${slug}` }
    : { id: parseInt(id), slug: '', url: `${BASE}/anime/${id}` }
  console.log(await scrapeAnime(meta))
} else if (cmd === 'latest') {
  const n = parseInt(arg) || 10
  const res = await scrapeLatest(n)
  const ok = res.filter((r) => r.ok).length
  console.log(`selesai: ${ok}/${res.length} anime tersimpan`)
  for (const r of res.filter((r) => !r.ok)) console.log('GAGAL:', r.id, r.error)
} else {
  console.log('pakai: node scrape.js home | anime <id/slug> | latest [n]')
}
