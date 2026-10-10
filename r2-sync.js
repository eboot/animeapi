// BRANCH supabase — Backfill: upload semua poster yang belum di R2.
// Pakai: node r2-sync.js
import { supabase } from './supabase.js'
import { uploadImage, r2Enabled, r2PublicBase } from './r2.js'

export async function syncPostersToR2() {
  if (!r2Enabled()) throw new Error('R2 belum dikonfigurasi (cek env R2_*)')
  const base = r2PublicBase()
  let total = 0
  let uploaded = 0
  const perPage = 100
  let page = 0
  for (;;) {
    const { data, error } = await supabase()
      .from('kurama_anime')
      .select('id, poster')
      .neq('poster', '')
      .not('poster', 'like', `${base}%`)
      .range(page * perPage, (page + 1) * perPage - 1)
    if (error) throw error
    if (!data.length) break
    for (const r of data) {
      total++
      const url = await uploadImage(r.poster, `posters/kurama/${r.id}`, 'https://v20.kuramanime.ing/')
      if (url && url !== r.poster) {
        const { error: e2 } = await supabase()
          .from('kurama_anime')
          .update({ poster: url })
          .eq('id', r.id)
        if (e2) throw e2
        uploaded++
      }
    }
    page++
    console.log(`  ${uploaded}/${total} ...`)
  }
  return { total, uploaded }
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
