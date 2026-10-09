# KuramaAnime Scraper

Scraper untuk https://v20.kuramanime.ing/ dengan **database terpisah** (SQLite lokal `data/kurama.sqlite` — bukan Supabase animedong).

## Cara jalan

```bash
npm install
node scrape.js home              # lihat daftar anime di homepage
node scrape.js anime 5022/slug   # scrape 1 anime (detail + episode) -> DB
node scrape.js latest 10         # scrape 10 anime terbaru -> DB
node server.js                   # API di :3002
```

API:
- `GET /api/stats` — jumlah anime/episode
- `GET /api/anime?q=&page=` — cari/list anime
- `GET /api/anime/:id` — detail + daftar episode
- `POST /api/scrape/latest` `{n}` — scrape N terbaru
- `POST /api/scrape/anime` `{id, slug}` — scrape 1 anime

## Catatan Cloudflare

Situs ini pakai Cloudflare dengan dua lapis proteksi:

1. **Header check** — tanpa header browser lengkap (`Sec-Fetch-*` dll) kena 403.
   `Sec-Fetch-Site` harus jujur: `none` untuk buka langsung, `same-origin` kalau dari link situsnya.
2. **TLS fingerprint** — `fetch` bawaan Node kena 403, harus pakai binary `curl`
   (fingerprint-nya lolos).
3. **Rate limit** — kebanyakan request cepat = 403 sementara. Scraper kasih jeda
   1.5 detik antar anime. Jangan digas.

Stream URL asli dienkripsi (`data-kk` + token auth) — scraper ini ambil metadata
dan daftar episode saja, bukan link video langsung.
