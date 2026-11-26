'use strict';
const { getPool, normalizeArabic, send, authed, handleOptions } = require('./_lib');

// GET /api/search?q=...
module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!authed(req)) return send(res, 401, { error: 'unauthorized' });
  const raw = String(req.query.q || '').slice(0, 200);
  const q = normalizeArabic(raw);
  if (!q) return send(res, 200, { results: [] });
  try {
    const r = await getPool().query(
      `SELECT p.book_id, b.title, p.page, p.text,
              CASE WHEN p.norm LIKE '%' || $1 || '%' THEN 1 ELSE 0 END AS exact,
              word_similarity($1, p.norm) AS sim
       FROM pages p JOIN books b ON b.id = p.book_id
       WHERE p.norm %> $1 OR p.norm LIKE '%' || $1 || '%'
       ORDER BY exact DESC, sim DESC, p.book_id, p.page
       LIMIT 40`,
      [q]
    );
    return send(res, 200, { results: r.rows });
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }
};
