// api/track.js  →  POST /api/track
// بيسجّل زيارات الموقع في جدول analytics. من غير IP ولا بيانات شخصية.
// ملاحظة: الموقع بيبعت الجسم كـ text/plain (عشان يتفادى preflight)، فبنعمله JSON.parse بنفسنا.

import { clean, dbInsert } from './_lib/utils.js';

const TYPES = new Set(['pageview', 'engaged', 'conversion', 'click']);
const DEVICES = new Set(['mobile', 'tablet', 'desktop']);
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const HOST_RE = /^[a-z0-9.-]{1,100}$/;
const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pingdom|uptime|monitor|preview|facebookexternalhit|curl|wget|python|java\//i;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  let b = req.body;
  if (typeof b === 'string') {
    try {
      b = JSON.parse(b);
    } catch {
      return res.status(400).end();
    }
  }
  if (!b || typeof b !== 'object') return res.status(400).end();

  // بوتات: نرد بنجاح من غير ما نسجّل
  if (BOT_RE.test(String(req.headers['user-agent'] || ''))) return res.status(204).end();

  const type = clean(b.type, 20);
  const vid = clean(b.vid, 64);
  const sid = clean(b.sid, 64);
  if (!TYPES.has(type) || !ID_RE.test(vid) || !ID_RE.test(sid)) return res.status(400).end();

  let path = clean(b.path, 200);
  if (!path.startsWith('/')) path = `/${path}`;

  const extra = {};
  if (type === 'pageview') {
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
      const value = clean(b[key], 80);
      if (value) extra[key] = value;
    }
  }
  if (type === 'click' || type === 'conversion') {
    const label = clean(b.label, 40);
    if (label) extra.label = label;
  }

  const ref = clean(b.ref, 100).toLowerCase();
  const dev = clean(b.dev, 10);

  try {
    await dbInsert(
      'analytics',
      {
        type,
        vid,
        session_id: sid,
        path,
        referrer: type === 'pageview' && HOST_RE.test(ref) ? ref : null,
        device: DEVICES.has(dev) ? dev : null,
        extra: Object.keys(extra).length ? extra : null,
      },
      { returning: false }
    );
  } catch (err) {
    // التتبّع مش لازم يكسر الموقع: نسجّل الخطأ في اللوج بس
    console.error('[track] database error:', err.message);
  }
  return res.status(204).end();
}