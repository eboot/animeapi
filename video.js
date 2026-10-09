// Ambil direct video URL (HLS) dari halaman episode KuramaAnime.
// BUTUH: npm i playwright && npx playwright install chromium
// Jalan di mesin yang ada browser (Oracle/PC), bukan di sandbox ini.
// Cara: node video.js "<episode_url>" [server]
//
// Alur situs (hasil reverse engineering):
// 1. Halaman episode load -> JS minta token via /misc/token/refresh-token
// 2. Token + nama server dikirim sebagai query param, halaman dimuat ulang parsial
// 3. Elemen #player dapat atribut data-hlsSrc = URL video HLS (.m3u8)
// Script ini biarkan browser yang kerja, kita tinggal ambil hasilnya.
import { chromium } from 'playwright'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

export async function getVideoUrl(episodeUrl, server = null, timeoutMs = 60000) {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ userAgent: UA })
    await page.goto(episodeUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs })

    // Kalau mau server tertentu, pilih dari dropdown
    if (server) {
      await page.selectOption('#changeServer', server).catch(() => {})
      await page.waitForTimeout(3000)
    }

    // Tunggu player siap (situs kadang countdown dulu sebelum streamReady)
    await page.waitForFunction(
      () => {
        const p = document.querySelector('#player')
        return p && (p.dataset.hlsSrc || p.src)
      },
      { timeout: timeoutMs }
    ).catch(() => {})

    const info = await page.evaluate(() => {
      const p = document.querySelector('#player')
      const v = document.querySelector('#animeVideoPlayer video, video')
      return {
        hlsSrc: p?.dataset?.hlsSrc || null,
        playerSrc: p?.src || null,
        videoSrc: v?.src || v?.currentSrc || null,
        servers: [...document.querySelectorAll('#changeServer option')].map((o) => ({
          value: o.value,
          label: o.textContent.trim(),
        })),
      }
    })
    return info
  } finally {
    await browser.close()
  }
}

const [url, server] = process.argv.slice(2)
if (url) {
  getVideoUrl(url, server || null)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error('GAGAL:', e.message)
      process.exit(1)
    })
} else {
  console.log('pakai: node video.js "<episode_url>" [server]')
}
