// Backfill: upload semua poster anime yang belum di R2.
// Pakai: node r2-sync.js
import { db, updatePoster } from './db.js'
import { uploadImage, r2Enabled, r2PublicBase } from './r2.js'

export async function syncPostersToR2() {
  if (!r2Enabled()) throw new Error('R2 belum dikonfigurasi (cek env R2_*)')
  const base = r2PublicBase()
  const rows = db
    .prepare(`SELECT id, poster FROM anime WHERE poster <> '' AND poster NOT LIKE ?`)
    .all(base + '%')
  let ok = 0
  for (const r of rows) {
    const url = await uploadImage(r.poster, `posters/kurama/${r.id}`, 'https://v20.kuramanime.ing/')
    if (url && url !== r.poster) {
      updatePoster(r.id, url)
      ok++
    }
    if ((ok + 1) % 10 === 0 || ok === rows.length) console.log(`  ${ok}/${rows.length}`)
  }
  return { total: rows.length, uploaded: ok }
}

const isCLI = process.argv[1]?.endsWith('r2-sync.js')
if (isCLI) {
  try {
    const res = await syncPostersToR2()
    console.log(`selesai: ${res.uploaded}/${res.total} poster pindah ke R2`)
  } catch (e) {
    console.error('gagal:', e.message)
    process.exit(1)
  }
}
