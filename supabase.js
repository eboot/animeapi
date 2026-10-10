// Integrasi Supabase (PostgreSQL) untuk animeapi.
// Meniru signature & bentuk return db.js (SQLite), bedanya semua fungsi ASYNC.
//
// Cara pakai:
//   1. Jalankan supabase-schema.sql di SQL Editor project Supabase-mu.
//   2. Set env: SUPABASE_URL dan SUPABASE_SECRET_KEY
//      (Dashboard -> Project Settings -> API; pakai SECRET/SERVICE key karena ini backend).
//   3. npm install (sudah termasuk @supabase/supabase-js).
import { createClient } from '@supabase/supabase-js'

let _client = null
export function supabase() {
  if (_client) return _client
  const url = process.env.SUPABASE_URL
  // Terima nama baru (SECRET_KEY) maupun lama (SERVICE_KEY)
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL / SUPABASE_SECRET_KEY belum di-set. ' +
        'Isi dari Supabase Dashboard -> Project Settings -> API.'
    )
  }
  _client = createClient(url, key)
  return _client
}

export async function saveAnime(a) {
  const { error } = await supabase()
    .from('kurama_anime')
    .upsert(
      {
        id: a.id,
        slug: a.slug,
        title: a.title,
        alt_titles: a.alt_titles ?? '',
        poster: a.poster ?? '',
        synopsis: a.synopsis ?? '',
        type: a.type ?? '',
        status: a.status ?? '',
        aired: a.aired ?? '',
        season: a.season ?? '',
        duration: a.duration ?? '',
        genres: a.genres ?? '',
        studio: a.studio ?? '',
        episodes_count: a.episodes_count ?? '',
        url: a.url ?? '',
        scraped_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
  if (error) throw error
}

export async function updatePoster(id, url) {
  const { error } = await supabase().from('kurama_anime').update({ poster: url }).eq('id', id)
  if (error) throw error
}

export async function saveEpisode(animeId, ep) {
  const { error } = await supabase()
    .from('kurama_episodes')
    .upsert(
      {
        anime_id: animeId,
        episode_num: ep.num,
        title: ep.title || '',
        url: ep.url || '',
        scraped_at: new Date().toISOString(),
      },
      { onConflict: 'anime_id,episode_num' }
    )
  if (error) throw error
}

export async function saveServer(animeId, episodeNum, serverName, videoUrl) {
  const { error } = await supabase()
    .from('kurama_servers')
    .upsert(
      {
        anime_id: animeId,
        episode_num: episodeNum,
        server_name: serverName,
        video_url: videoUrl,
        scraped_at: new Date().toISOString(),
      },
      { onConflict: 'anime_id,episode_num,server_name' }
    )
  if (error) throw error
}

export async function listAnime({ q, page = 1, limit = 50 } = {}) {
  page = Math.max(1, parseInt(page) || 1)
  limit = Math.min(200, Math.max(1, parseInt(limit) || 50))
  let query = supabase()
    .from('kurama_anime')
    .select('*', { count: 'exact' })
    .order('scraped_at', { ascending: false })
  if (q) {
    const esc = q.replace(/[%_]/g, '')
    query = query.or(`title.ilike.%${esc}%,alt_titles.ilike.%${esc}%`)
  }
  const from = (page - 1) * limit
  const { data, count, error } = await query.range(from, from + limit - 1)
  if (error) throw error
  return { total: count ?? 0, page, limit, rows: data ?? [] }
}

export async function getAnime(id) {
  const { data: anime, error } = await supabase()
    .from('kurama_anime')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!anime) return null
  // Episode di-insert urut numerik, jadi urut id = urut episode.
  const { data: episodes, error: e2 } = await supabase()
    .from('kurama_episodes')
    .select('episode_num, title, url')
    .eq('anime_id', id)
    .order('id')
  if (e2) throw e2
  anime.episodes = episodes ?? []
  return anime
}

export async function stats() {
  const a = await supabase().from('kurama_anime').select('*', { count: 'exact', head: true })
  const e = await supabase().from('kurama_episodes').select('*', { count: 'exact', head: true })
  if (a.error) throw a.error
  if (e.error) throw e.error
  const last = await supabase()
    .from('kurama_anime')
    .select('scraped_at')
    .order('scraped_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return {
    anime: a.count ?? 0,
    episodes: e.count ?? 0,
    last_scrape: last.data?.scraped_at ?? null,
  }
}
