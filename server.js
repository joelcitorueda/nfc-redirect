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
    // Acepta token desde cookie O desde header Authorization: Bearer <token>
    const cookies = parseCookies(req);
    const fromCookie = cookies[COOKIE_NAME];
    const fromHeader = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
    const token = fromCookie || fromHeader;
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
    // Guardar en cookie Y devolver en body (para que el frontend lo guarde en localStorage)
    res.setHeader('Set-Cookie',
      `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${8*3600}`
    );
    res.json({ success: true, token });
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
    const cookies   = parseCookies(req);
    const fromCookie = cookies[COOKIE_NAME];
    const fromHeader = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
    const token = fromCookie || fromHeader;
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

// ── Generar Word con QRs 4×4cm ────────────────────────────────
app.post('/api/qr/word', requireAuth, async (req, res) => {
  try {
    const { ids, host } = req.body;
    const base = (host || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const { Document, Packer, Paragraph, ImageRun, Table, TableRow, TableCell,
            WidthType, AlignmentType, BorderStyle, TextRun } = require('docx');

    // Generar QRs como buffer PNG
    const items = [];
    for (const id of ids) {
      const url = `${base}/r/${id}`;
      const buf = await QRCode.toBuffer(url, { width: 600, margin: 1, type: 'png' });
      items.push({ id, buf });
    }

    // 4cm × 4cm en EMU (914400 EMU = 1 pulgada = 2.54cm → 1cm = 360000 EMU)
    const SIZE_EMU = Math.round(4 * 360000); // 1440000 EMU = 4cm

    const COLS = 4; // 4 QRs por fila
    const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const cellBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

    const tableRows = [];
    for (let i = 0; i < items.length; i += COLS) {
      const group = items.slice(i, i + COLS);
      const cells = group.map(({ id, buf }) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [new ImageRun({ data: buf, transformation: { width: SIZE_EMU / 9144, height: SIZE_EMU / 9144 }, type: 'png' })],
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              children: [new TextRun({ text: id, bold: true, size: 18, font: 'Courier New' })],
              alignment: AlignmentType.CENTER,
            }),
          ],
          margins: { top: 200, bottom: 200, left: 200, right: 200 },
          borders: {
            top:    { style: BorderStyle.DASHED, size: 4, color: 'CCCCCC' },
            bottom: { style: BorderStyle.DASHED, size: 4, color: 'CCCCCC' },
            left:   { style: BorderStyle.DASHED, size: 4, color: 'CCCCCC' },
            right:  { style: BorderStyle.DASHED, size: 4, color: 'CCCCCC' },
          },
          width: { size: Math.floor(100 / COLS), type: WidthType.PERCENTAGE },
        })
      );
      // Rellenar si fila incompleta
      while (cells.length < COLS) {
        cells.push(new TableCell({
          children: [new Paragraph({ children: [] })],
          borders: cellBorders,
          width: { size: Math.floor(100 / COLS), type: WidthType.PERCENTAGE },
        }));
      }
      tableRows.push(new TableRow({ children: cells }));
    }

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 }, // A4 portrait en twips
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          }
        },
        children: [
          new Paragraph({
            children: [new TextRun({ text: 'QR Tarjetas NFC — Elian', bold: true, size: 28 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Total: ${items.length} tarjetas | Tamaño QR: 4×4cm | Imprimir al 100%`, size: 18, color: '666666', italics: true })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
          }),
          new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="QR_Elian_${items.length}tarjetas.docx"`);
    res.send(buffer);
  } catch (e) {
    console.error('Error generando Word:', e);
    res.status(500).json({ error: e.message });
  }
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
