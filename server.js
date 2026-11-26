'use strict';

const http = require('http');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;
const PASSCODE = process.env.APP_PASSCODE || '';
const DATABASE_URL = process.env.DATABASE_URL || '';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4
});

// Same normalization as the client (docs/index.html). Keep in sync.
function normalizeArabic(s) {
  return (s || '')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^ء-غف-ي٠-٩a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, x-passcode',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 25 * 1024 * 1024) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (e) {
        reject(new Error('bad json'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;

  if (req.method === 'OPTIONS') {
    send(res, 204, {});
    return;
  }

  if (path === '/api/health') {
    const ok = req.headers['x-passcode'] === PASSCODE && PASSCODE.length > 0;
    send(res, ok ? 200 : 401, { ok });
    return;
  }

  // Auth for everything else under /api
  if (!PASSCODE || req.headers['x-passcode'] !== PASSCODE) {
    send(res, 401, { error: 'unauthorized' });
    return;
  }

  try {
    if (path === '/api/books' && req.method === 'GET') {
      const r = await pool.query(
        'SELECT b.id, b.title, b.pages, b.created_at, COUNT(p.page) AS stored FROM books b LEFT JOIN pages p ON p.book_id = b.id GROUP BY b.id ORDER BY b.created_at DESC'
      );
      send(res, 200, { books: r.rows });
      return;
    }

    if (path === '/api/books' && req.method === 'POST') {
      const body = await readBody(req);
      const title = String(body.title || '').trim().slice(0, 300) || 'كتاب بدون اسم';
      const r = await pool.query('INSERT INTO books (title) VALUES ($1) RETURNING id, title, created_at', [title]);
      send(res, 200, { book: r.rows[0] });
      return;
    }

    const bookMatch = path.match(/^\/api\/books\/(\d+)$/);
    if (bookMatch && req.method === 'DELETE') {
      await pool.query('DELETE FROM books WHERE id = $1', [bookMatch[1]]);
      send(res, 200, { ok: true });
      return;
    }

    const pagesMatch = path.match(/^\/api\/books\/(\d+)\/pages$/);
    if (pagesMatch && req.method === 'POST') {
      const body = await readBody(req);
      const pages = Array.isArray(body.pages) ? body.pages.slice(0, 200) : [];
      const bookId = pagesMatch[1];
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const p of pages) {
          const pageNo = Math.max(1, Math.min(100000, parseInt(p.page, 10) || 0));
          const text = String(p.text || '').slice(0, 20000);
          if (!pageNo || !text.trim()) continue;
          await client.query(
            'INSERT INTO pages (book_id, page, text, norm) VALUES ($1, $2, $3, $4) ON CONFLICT (book_id, page) DO UPDATE SET text = EXCLUDED.text, norm = EXCLUDED.norm',
            [bookId, pageNo, text, normalizeArabic(text)]
          );
        }
        await client.query('UPDATE books SET pages = (SELECT COUNT(*) FROM pages WHERE book_id = $1) WHERE id = $2', [bookId, bookId]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
      send(res, 200, { ok: true, stored: pages.length });
      return;
    }

    if (path === '/api/search' && req.method === 'GET') {
      const raw = (url.searchParams.get('q') || '').slice(0, 200);
      const q = normalizeArabic(raw);
      if (!q) {
        send(res, 200, { results: [] });
        return;
      }
      const r = await pool.query(
        `SELECT p.book_id, b.title, p.page, p.text,
                CASE WHEN p.norm LIKE '%' || $1 || '%' THEN 1 ELSE 0 END AS exact,
                word_similarity($1, p.norm) AS sim
         FROM pages p JOIN books b ON b.id = p.book_id
         WHERE p.norm %> $1 OR p.norm LIKE '%' || $1 || '%'
         ORDER BY exact DESC, sim DESC, p.book_id, p.page
         LIMIT 40`,
        [q]
      );
      send(res, 200, { results: r.rows });
      return;
    }

    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, () => {
  console.log('kotob-search listening on ' + PORT);
});
