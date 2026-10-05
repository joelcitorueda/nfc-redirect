// ============================================================
//  NFC Redirect Server — Google Reviews Tarija
//  Auth con JWT en cookie (funciona en Vercel serverless)
// ============================================================
const express = require('express');
const jwt     = require('jsonwebtoken');
const QRCode  = require('qrcode');
const path    = require('path');
const db      = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

const ADMIN_PASS   = process.env.ADMIN_PASSWORD || 'tarija2024';
const JWT_SECRET   = process.env.SESSION_SECRET || 'nfc-tarija-2024-secret';
const COOKIE_NAME  = 'nfc_auth';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Leer cookie manual ───────────────────────────────────────
function parseCookies(req) {
  const list = {};
  const header = req.headers.cookie;
  if (!header) return list;
  header.split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    list[k.trim()] = decodeURIComponent(v.join('='));
  });
  return list;
}

function requireAuth(req, res, next) {
  try {
    const cookies = parseCookies(req);
    const token   = cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'No autorizado' });
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'No autorizado' });
  }
}

// ============================================================
//  REDIRECCIÓN PÚBLICA  /r/:id
// ============================================================
app.get('/r/:id', async (req, res) => {
  try {
    const card = await db.getCard(req.params.id);
    if (!card) return res.status(404).send(page404(req.params.id));
    if (!card.google_url) return res.status(200).send(pageSinConfigurar());
    await db.registerScan(req.params.id);
    res.redirect(302, card.google_url);
  } catch (e) { res.status(500).send('Error del servidor'); }
});

function page404(id) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Tarjeta no encontrada</title>
  <style>body{font-family:sans-serif;text-align:center;padding:60px 20px;color:#333}</style>
  </head><body><div style="font-size:64px">📶</div>
  <h2>Tarjeta no registrada</h2>
  <p>El código <strong>${id}</strong> aún no está configurado.</p></body></html>`;
}
function pageSinConfigurar() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sin configurar</title>
  <style>body{font-family:sans-serif;text-align:center;padding:60px 20px}</style>
  </head><body><div style="font-size:64px">⚙️</div>
  <h2>Tarjeta sin local asignado</h2>
  <p>Esta tarjeta aún no tiene un negocio configurado.</p></body></html>`;
}

// ============================================================
//  AUTH — JWT en cookie HttpOnly
// ============================================================
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASS) {
    const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '8h' });
    res.setHeader('Set-Cookie',
      `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${8*3600}`
    );
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Contraseña incorrecta' });
  }
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0`);
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  try {
    const cookies = parseCookies(req);
    const token = cookies[COOKIE_NAME];
    if (!token) return res.json({ loggedIn: false });
    jwt.verify(token, JWT_SECRET);
    res.json({ loggedIn: true });
  } catch {
    res.json({ loggedIn: false });
  }
});

// ============================================================
//  API DE TARJETAS
// ============================================================
app.get('/api/cards', requireAuth, async (req, res) => {
  try { res.json(await db.getAllCards()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cards', requireAuth, async (req, res) => {
  const { id, business_name, google_url, notes } = req.body;
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id))
    return res.status(400).json({ error: 'ID inválido. Solo letras, números, guiones.' });
  if (await db.getCard(id))
    return res.status(400).json({ error: `Ya existe la tarjeta "${id}"` });
  await db.createCard(id, business_name || '', google_url || '', notes || '');
  res.json({ success: true, card: await db.getCard(id) });
});

app.put('/api/cards/:id', requireAuth, async (req, res) => {
  const { business_name, google_url, notes } = req.body;
  if (!await db.getCard(req.params.id))
    return res.status(404).json({ error: 'No encontrada' });
  await db.updateCard(req.params.id, business_name, google_url, notes);
  res.json({ success: true, card: await db.getCard(req.params.id) });
});

app.delete('/api/cards/:id', requireAuth, async (req, res) => {
  await db.deleteCard(req.params.id);
  res.json({ success: true });
});

// ── Crear lote ────────────────────────────────────────────────
app.post('/api/cards/batch', requireAuth, async (req, res) => {
  try {
    const { prefix, start, count, notes } = req.body;
    const startNum = parseInt(start) || 1;
    const countNum = parseInt(count) || 10;
    const pad = String(startNum + countNum - 1).length;
    const created = [];
    for (let i = startNum; i < startNum + countNum; i++) {
      const id = `${prefix}${String(i).padStart(pad, '0')}`;
      if (!await db.getCard(id)) {
        await db.createCard(id, '', '', notes || '');
        created.push(id);
      }
    }
    res.json({ success: true, created, count: created.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── QR base64 ────────────────────────────────────────────────
app.get('/api/cards/:id/qr', requireAuth, async (req, res) => {
  const host = (req.query.host || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const url  = `${host}/r/${req.params.id}`;
  const qr   = await QRCode.toDataURL(url, { width: 300, margin: 2 });
  res.json({ qr, url });
});

// ── QR PNG descargable ────────────────────────────────────────
app.get('/api/cards/:id/qr.png', requireAuth, async (req, res) => {
  const host = (req.query.host || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const url  = `${host}/r/${req.params.id}`;
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="qr-${req.params.id}.png"`);
  await QRCode.toFileStream(res, url, { width: 600, margin: 2 });
});

// ── QR múltiples ─────────────────────────────────────────────
app.post('/api/qr/bulk', requireAuth, async (req, res) => {
  const { ids, host } = req.body;
  const base = (host || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const result = [];
  for (const id of ids) {
    const url = `${base}/r/${id}`;
    const qr  = await QRCode.toDataURL(url, { width: 260, margin: 1 });
    result.push({ id, url, qr });
  }
  res.json(result);
});

app.get('/api/cards/:id/stats', requireAuth, async (req, res) => {
  res.json(await db.getStats(req.params.id));
});

// ── Panel ─────────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});
app.get('/', (req, res) => res.redirect('/admin'));

// ── Iniciar ───────────────────────────────────────────────────
db.init().then(() => {
  app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(` NFC Redirect — Panel listo`);
    console.log(` http://localhost:${PORT}/admin`);
    console.log(` Contrasena: ${ADMIN_PASS}`);
    console.log(`========================================\n`);
  });
}).catch(err => { console.error('Error DB:', err); process.exit(1); });

module.exports = app;
