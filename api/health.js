'use strict';
const { send, authed, handleOptions } = require('./_lib');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  send(res, authed(req) ? 200 : 401, { ok: authed(req) });
};
