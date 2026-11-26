'use strict';

const { Pool } = require('pg');

const PASSCODE = process.env.APP_PASSCODE || '';

let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || '',
      ssl: { rejectUnauthorized: false },
      max: 2
    });
  }
  return pool;
}

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
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-passcode');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.status(code).json(obj);
}

function authed(req) {
  return PASSCODE.length > 0 && req.headers['x-passcode'] === PASSCODE;
}

function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    send(res, 200, {});
    return true;
  }
  return false;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 25 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (e) { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}

module.exports = { getPool, normalizeArabic, send, authed, handleOptions, readBody };
