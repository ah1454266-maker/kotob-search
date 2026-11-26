'use strict';
const { getPool, normalizeArabic, send, authed, handleOptions, readBody } = require('./_lib');

// POST /api/pages?book=123  {pages:[{page, text}]}
module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!authed(req)) return send(res, 401, { error: 'unauthorized' });
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  const bookId = parseInt(req.query.book, 10);
  if (!bookId) return send(res, 400, { error: 'bad book id' });

  try {
    const body = await readBody(req);
    const pages = Array.isArray(body.pages) ? body.pages.slice(0, 200) : [];
    const client = await getPool().connect();
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
    return send(res, 200, { ok: true, stored: pages.length });
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }
};
