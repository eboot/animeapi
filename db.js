// Database terpisah untuk data KuramaAnime (SQLite lokal, bukan Supabase animedong).
import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const dataDir = join(dir, 'data')
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })

export const db = new Database(join(dataDir, 'kurama.sqlite'))
db.pragma('journal_mode = WAL')

db.exec(`
CREATE TABLE IF NOT EXISTS anime (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  alt_titles TEXT DEFAULT '',
  poster TEXT DEFAULT '',
  synopsis TEXT DEFAULT '',
  type TEXT DEFAULT '',
  status TEXT DEFAULT '',
  aired TEXT DEFAULT '',
  season TEXT DEFAULT '',
  duration TEXT DEFAULT '',
  genres TEXT DEFAULT '',
  studio TEXT DEFAULT '',
  episodes_count TEXT DEFAULT '',
  url TEXT DEFAULT '',
  scraped_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_anime_id ON anime(id);

CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anime_id INTEGER NOT NULL,
  episode_num TEXT NOT NULL,
  title TEXT DEFAULT '',
  url TEXT DEFAULT '',
  scraped_at TEXT DEFAULT (datetime('now')),
  UNIQUE(anime_id, episode_num)
);

CREATE TABLE IF NOT EXISTS servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anime_id INTEGER NOT NULL,
  episode_num TEXT NOT NULL,
  server_name TEXT DEFAULT '',
  video_url TEXT DEFAULT '',
  scraped_at TEXT DEFAULT (datetime('now')),
  UNIQUE(anime_id, episode_num, server_name)
);
`)

const now = () => new Date().toISOString()

export function saveAnime(a) {
  db.prepare(
    `INSERT INTO anime (id, slug, title, alt_titles, poster, synopsis, type, status, aired, season, duration, genres, studio, episodes_count, url, scraped_at)
     VALUES (@id, @slug, @title, @alt_titles, @poster, @synopsis, @type, @status, @aired, @season, @duration, @genres, @studio, @episodes_count, @url, @scraped_at)
     ON CONFLICT(id) DO UPDATE SET
       slug=excluded.slug, title=excluded.title, alt_titles=excluded.alt_titles, poster=excluded.poster,
       synopsis=excluded.synopsis, type=excluded.type, status=excluded.status, aired=excluded.aired,
       season=excluded.season, duration=excluded.duration, genres=excluded.genres, studio=excluded.studio,
       episodes_count=excluded.episodes_count, url=excluded.url, scraped_at=excluded.scraped_at`
  ).run({ ...a, scraped_at: now() })
}

export function updatePoster(id, url) {
  db.prepare('UPDATE anime SET poster = ? WHERE id = ?').run(url, id)
}

export function saveEpisode(animeId, ep) {  db.prepare(
    `INSERT INTO episodes (anime_id, episode_num, title, url, scraped_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(anime_id, episode_num) DO UPDATE SET title=excluded.title, url=excluded.url, scraped_at=excluded.scraped_at`
  ).run(animeId, ep.num, ep.title || '', ep.url || '', now())
}

export function listAnime({ q, page = 1, limit = 50 } = {}) {
  page = Math.max(1, parseInt(page) || 1)
  limit = Math.min(200, Math.max(1, parseInt(limit) || 50))
  const where = q ? `WHERE title LIKE '%' || ? || '%' OR alt_titles LIKE '%' || ? || '%'` : ''
  const args = q ? [q, q] : []
  const total = db.prepare(`SELECT COUNT(*) AS c FROM anime ${where}`).get(...args).c
  const rows = db
    .prepare(`SELECT * FROM anime ${where} ORDER BY scraped_at DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, (page - 1) * limit)
  return { total, page, limit, rows }
}

export function getAnime(id) {
  const anime = db.prepare('SELECT * FROM anime WHERE id = ?').get(id)
  if (!anime) return null
  anime.episodes = db
    .prepare('SELECT episode_num, title, url FROM episodes WHERE anime_id = ? ORDER BY CAST(episode_num AS INTEGER)')
    .all(id)
  return anime
}

export function stats() {
  return {
    anime: db.prepare('SELECT COUNT(*) AS c FROM anime').get().c,
    episodes: db.prepare('SELECT COUNT(*) AS c FROM episodes').get().c,
    last_scrape: db.prepare('SELECT MAX(scraped_at) AS t FROM anime').get().t,
  }
}
