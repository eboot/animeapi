// Cloudflare R2 sebagai CDN image.
// Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL
//   (mis. R2_PUBLIC_URL=https://img.domainmu.com)
// Kalau env tidak lengkap -> nonaktif total, semua fungsi aman no-op (return null).
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const cfg = {
  accountId: process.env.R2_ACCOUNT_ID || '',
  accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  bucket: process.env.R2_BUCKET || '',
  publicUrl: (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, ''),
}

export const r2Enabled = () =>
  Boolean(cfg.accountId && cfg.accessKeyId && cfg.secretAccessKey && cfg.bucket && cfg.publicUrl)

export const r2PublicBase = () => cfg.publicUrl

let client = null
function getClient() {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    })
  }
  return client
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

// Download gambar pakai curl (tahan hotlink protection via Referer).
async function downloadImage(url, referer) {
  const tmp = join(tmpdir(), `r2img-${randomUUID()}`)
  try {
    const args = [
      '-s', '-m', '30', '-L', '--compressed',
      '-A', UA,
      '-H', 'Accept: image/avif,image/webp,image/*,*/*;q=0.8',
      '-o', tmp, '-w', '%{http_code} %{content_type}',
      url,
    ]
    if (referer) args.push('-H', `Referer: ${referer}`)
    const { stdout } = await execFileAsync('curl', args, { encoding: 'utf8' })
    const [code, ctype] = stdout.trim().split(' ')
    if (code !== '200') return null
    const buf = await readFile(tmp)
    if (buf.length < 512) return null // terlalu kecil, bukan gambar beneran
    return { buf, contentType: (ctype || '').split(';')[0].trim() || 'image/jpeg' }
  } catch {
    return null
  } finally {
    unlink(tmp).catch(() => {})
  }
}

function extFor(contentType, url) {
  const m = contentType.match(/image\/(jpeg|png|webp|gif|avif|bmp)/)
  if (m) return m[1] === 'jpeg' ? 'jpg' : m[1]
  const um = url.match(/\.(jpe?g|png|webp|gif|avif|bmp)(\?|#|$)/i)
  return um ? um[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg'
}

/**
 * Download gambar dari imageUrl lalu upload ke R2 dengan key stabil.
 * @returns URL publik R2, atau null kalau gagal / R2 tidak dikonfigurasi /
 *          URL sudah dari R2 (idempoten).
 */
export async function uploadImage(imageUrl, key, referer = null) {
  if (!r2Enabled() || !imageUrl) return null
  if (imageUrl.startsWith(cfg.publicUrl)) return imageUrl // sudah di R2
  try {
    const dl = await downloadImage(imageUrl, referer)
    if (!dl) return null
    const fullKey = `${key}.${extFor(dl.contentType, imageUrl)}`
    await getClient().send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: fullKey,
        Body: dl.buf,
        ContentType: dl.contentType,
      })
    )
    return `${cfg.publicUrl}/${fullKey}`
  } catch (e) {
    console.error('[r2] upload gagal:', String(imageUrl).slice(0, 80), '-', e.message)
    return null
  }
}
