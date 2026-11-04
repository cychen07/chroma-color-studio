import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import sharp from 'sharp';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from './analyze.mjs';
import { rgbToLab, colorFamily } from '../shared/color.mjs';
import { getPreset, gradePixels, presets } from '../shared/presets.mjs';
import { normalizeAdjustments } from '../shared/adjustments.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
const dataDir = process.env.DATA_DIR || path.join(root, 'data');
const uploadDir = path.join(dataDir, 'uploads');
mkdirSync(uploadDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'chroma.sqlite'));
db.exec(`PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS colors (name TEXT PRIMARY KEY, collection TEXT, hex TEXT, family TEXT, record TEXT);
  CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, expires INTEGER);
  CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, session TEXT, created INTEGER, payload TEXT);`);
const dataset = JSON.parse(readFileSync(path.join(root, 'data/colors.json'), 'utf8'));
const catalog = dataset.records.map(r => ({ ...r, labD65: rgbToLab([r.r, r.g, r.b]), family: colorFamily([r.r, r.g, r.b]) }));
db.exec('BEGIN');
const insert = db.prepare('INSERT OR REPLACE INTO colors VALUES (?, ?, ?, ?, ?)');
for (const color of catalog) insert.run(color.name, color.collection, color.hex, color.family, JSON.stringify(color));
db.exec('COMMIT');
const app = express();
app.disable('x-powered-by');
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.get('host')) return res.status(403).json({ error: '请求来源不匹配，请重新打开页面。' });
    } catch { return res.status(403).json({ error: '无效请求。' }); }
  }
  next();
});
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: '操作有点频繁，请稍后再试。' } }));
app.use(express.json({ limit: '16kb' }));
app.use('/api', (req, res, next) => {
  const cookie = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('chroma_session='))?.split('=')[1];
  let session = cookie && db.prepare('SELECT * FROM sessions WHERE id = ? AND expires > ?').get(cookie, Date.now());
  if (!session) {
    const id = randomBytes(32).toString('hex');
    session = { id, expires: Date.now() + 86400_000 };
    db.prepare('INSERT INTO sessions VALUES (?, ?)').run(id, session.expires);
    res.cookie('chroma_session', id, { httpOnly: true, sameSite: 'strict', secure: production && process.env.SECURE_COOKIES !== 'false', maxAge: 86400_000 });
  }
  req.sessionId = session.id;
  next();
});
const requirePhoto = (req, id) => {
  const row = db.prepare('SELECT payload FROM photos WHERE id = ? AND session = ? AND created > ?').get(id, req.sessionId, Date.now() - 86400_000);
  if (!row) throw Object.assign(new Error('图片已过期，请重新上传。'), { status: 404 });
  return JSON.parse(row.payload);
};
const filePath = (id, type) => path.join(uploadDir, `${id}.${type}`);
const cleanup = () => {
  const expired = db.prepare('SELECT id FROM photos WHERE created < ?').all(Date.now() - 86400_000);
  for (const { id } of expired) for (const ext of ['png', 'webp']) if (existsSync(filePath(id, ext))) unlinkSync(filePath(id, ext));
  db.prepare('DELETE FROM photos WHERE created < ?').run(Date.now() - 86400_000);
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
};
cleanup();
setInterval(cleanup, 600_000).unref();
app.get('/api/config', (req, res) => res.json({
  colorCount: catalog.length, counts: dataset.counts, sourceUrl: dataset.sourceUrl,
  exportMode: 'free', maxFileMB: 20,
  presets, version: '0.1.0',
}));
app.get('/api/colors', (req, res) => {
  const q = String(req.query.q || '').slice(0, 80), collection = ['C', 'U'].includes(req.query.collection) ? req.query.collection : '';
  const family = String(req.query.family || '');
  const limit = Math.max(1, Math.min(100, Math.floor(Number(req.query.limit)) || 60)), offset = Math.max(0, Math.min(100_000, Math.floor(Number(req.query.offset)) || 0));
  const filters = ['(name LIKE ? OR hex LIKE ?)'], args = [`%${q}%`, `%${q}%`];
  if (collection) { filters.push('collection = ?'); args.push(collection); }
  if (family) { filters.push('family = ?'); args.push(family); }
  const where = filters.join(' AND ');
  const total = db.prepare(`SELECT count(*) AS total FROM colors WHERE ${where}`).get(...args).total;
  const rows = db.prepare(`SELECT record FROM colors WHERE ${where} ORDER BY rowid LIMIT ? OFFSET ?`).all(...args, limit, offset);
  res.json({ total, offset, colors: rows.map(r => JSON.parse(r.record)) });
});
async function savePhoto(buffer, filename, sessionId) {
  let meta;
  try { meta = await sharp(buffer, { limitInputPixels: 24_000_000, animated: false }).metadata(); }
  catch { throw Object.assign(new Error('图片无法读取，或超过 2400 万像素。请换一张 JPG、PNG 或 WebP 图片。'), { status: 422 }); }
  if (!['jpeg', 'png', 'webp'].includes(meta.format) || (meta.pages || 1) > 1) throw Object.assign(new Error('请选择静态 JPG、PNG 或 WebP 图片。'), { status: 415 });
  const original = await sharp(buffer, { limitInputPixels: 24_000_000 }).rotate().toColourspace('srgb').ensureAlpha().png().toBuffer();
  const analysis = await analyze(original, catalog);
  const { width, height } = await sharp(original).metadata();
  const id = randomUUID();
  await writeFile(filePath(id, 'png'), original);
  await sharp(original).resize(1400, 1400, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 91 }).toFile(filePath(id, 'webp'));
  const payload = { id, name: filename.replace(/[<>]/g, '').slice(0, 120), width, height, bytes: buffer.length, previewUrl: `/api/photos/${id}/preview`, analysis, expiresAt: Date.now() + 86400_000 };
  db.prepare('INSERT INTO photos VALUES (?, ?, ?, ?)').run(id, sessionId, Date.now(), JSON.stringify(payload));
  return payload;
}
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
const expensiveLimit = rateLimit({ windowMs: 60_000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: '图片处理次数较多，请一分钟后再试。' } });
app.post('/api/photos', expensiveLimit, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请先选择图片。' });
  res.json(await savePhoto(req.file.buffer, req.file.originalname, req.sessionId));
});
app.post('/api/demo', expensiveLimit, async (req, res) => {
  const existing = db.prepare('SELECT payload FROM photos WHERE session = ? AND created > ? ORDER BY created DESC LIMIT 1').get(req.sessionId, Date.now() - 86400_000);
  if (existing && JSON.parse(existing.payload).name === '午后的小院.jpg') return res.json(JSON.parse(existing.payload));
  res.json(await savePhoto(await readFile(path.join(root, 'public/sample.jpg')), '午后的小院.jpg', req.sessionId));
});
app.get('/api/photos/:id/preview', (req, res) => {
  requirePhoto(req, req.params.id);
  res.type('webp').sendFile(filePath(req.params.id, 'webp'));
});
app.post('/api/photos/:id/export', expensiveLimit, async (req, res) => {
  const photo = requirePhoto(req, req.params.id);
  const preset = getPreset(req.body.preset);
  const strength = Number(req.body.strength);
  const format = req.body.format;
  if (!preset || !Number.isFinite(strength) || strength < 0 || strength > 1 || !['jpeg', 'png'].includes(format)) return res.status(400).json({ error: '调色参数不正确。' });
  let adjustments;
  try { adjustments = normalizeAdjustments(req.body.adjustments); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  const { data, info } = await sharp(filePath(photo.id, 'png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  gradePixels(data, preset, strength, adjustments, info.width, info.height);
  let output = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  output = format === 'png' ? output.png() : output.flatten({ background: '#ffffff' }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' });
  res.setHeader('Content-Disposition', `attachment; filename="chroma-${preset.id}.${format === 'png' ? 'png' : 'jpg'}"`);
  res.type(format).send(await output.toBuffer());
});
app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在。' }));
app.use((error, req, res, next) => {
  console.error(error.message);
  const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : error.status || 500;
  res.status(status).json({ error: error.code === 'LIMIT_FILE_SIZE' ? '图片不能超过 20 MB。' : status < 500 ? error.message : '处理暂时失败，请稍后重试。' });
});
if (production) {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*path}', (req, res) => res.sendFile(path.join(root, 'dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.listen(port, '0.0.0.0', () => console.log(`色序 CHROMA → http://localhost:${port} · ${catalog.length} colors · ${production ? 'production' : 'development'} · free exports`));
