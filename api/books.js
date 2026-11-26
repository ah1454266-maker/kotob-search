'use strict';
const { getPool, send, authed, handleOptions, readBody } = require('./_lib');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!authed(req)) return send(res, 401, { error: 'unauthorized' });

  try {
    if (req.method === 'GET') {
      const r = await getPool().query(
        'SELECT b.id, b.title, b.pages, b.created_at, COUNT(p.page) AS stored FROM books b LEFT JOIN pages p ON p.book_id = b.id GROUP BY b.id ORDER BY b.created_at DESC'
      );
      return send(res, 200, { books: r.rows });
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const title = String(body.title || '').trim().slice(0, 300) || 'كتاب بدون اسم';
      const r = await getPool().query('INSERT INTO books (title) VALUES ($1) RETURNING id, title, created_at', [title]);
      return send(res, 200, { book: r.rows[0] });
    }
    return send(res, 405, { error: 'method' });
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }
};
