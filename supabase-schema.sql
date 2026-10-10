-- Skema Supabase (PostgreSQL) untuk animeapi (KuramaAnime scraper).
-- Cara pakai: buka SQL Editor di project Supabase-mu, paste seluruh file ini, Run.
-- Tabel di-prefix kurama_ agar tidak tabrakan dengan tabel animedong-admin
-- bila memakai project Supabase yang sama.

CREATE TABLE IF NOT EXISTS kurama_anime (
  id BIGINT PRIMARY KEY,
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
  scraped_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kurama_anime_scraped ON kurama_anime (scraped_at DESC);

CREATE TABLE IF NOT EXISTS kurama_episodes (
  id BIGSERIAL PRIMARY KEY,
  anime_id BIGINT NOT NULL REFERENCES kurama_anime(id) ON DELETE CASCADE,
  episode_num TEXT NOT NULL,
  title TEXT DEFAULT '',
  url TEXT DEFAULT '',
  scraped_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (anime_id, episode_num)
);
CREATE INDEX IF NOT EXISTS idx_kurama_episodes_anime ON kurama_episodes (anime_id);

CREATE TABLE IF NOT EXISTS kurama_servers (
  id BIGSERIAL PRIMARY KEY,
  anime_id BIGINT NOT NULL REFERENCES kurama_anime(id) ON DELETE CASCADE,
  episode_num TEXT NOT NULL,
  server_name TEXT DEFAULT '',
  video_url TEXT DEFAULT '',
  scraped_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (anime_id, episode_num, server_name)
);
