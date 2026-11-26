'use strict';
const { getPool, send, authed, handleOptions } = require('./_lib');

// DELETE /api/book?id=123
module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!authed(req)) return send(res, 401, { error: 'unauthorized' });
  if (req.method !== 'DELETE') return send(res, 405, { error: 'method' });
  const id = parseInt(req.query.id, 10);
  if (!id) return send(res, 400, { error: 'bad id' });
  try {
    await getPool().query('DELETE FROM books WHERE id = $1', [id]);
    return send(res, 200, { ok: true });
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }
};
