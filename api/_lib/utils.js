// api/_lib/utils.js
// أدوات مشتركة لكل دوال الـ API. الفولدر ده اسمه بيبدأ بـ _ فـ Vercel مش بيعتبره دالة.

import nodemailer from 'nodemailer';
import { randomBytes } from 'node:crypto';

// ───────────── نصوص ─────────────
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const clean = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
export const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();
export const cairoNow = () => new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) + ' (توقيت القاهرة)';

// رقم مرجعي: من أول 8 حروف من id الصف في قاعدة البيانات (عشان تقدري تدوّري عليه)، أو رقم احتياطي لو القاعدة فشلت
export const fallbackRef = (prefix) => `${prefix}-${Date.now().toString().slice(-8)}${randomBytes(1).toString('hex').toUpperCase()}`;
export const refFromRow = (prefix, row) =>
  row && row.id ? `${prefix}-${String(row.id).replace(/-/g, '').slice(0, 8).toUpperCase()}` : null;

// ───────────── قاعدة البيانات (Supabase عن طريق REST، من غير مكتبات) ─────────────
export async function dbInsert(table, row, { returning = true } = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');

  const headers = {
    apikey: key,
    'Content-Type': 'application/json',
    Prefer: returning ? 'return=representation' : 'return=minimal',
  };
  // المفاتيح القديمة (JWT) محتاجة Authorization، والمفاتيح الجديدة (sb_secret_...) لأ
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;

  const res = await fetch(`${base.replace(/\/+$/, '')}/rest/v1/${table}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase insert into "${table}" failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  if (!returning) return null;
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

// ───────────── الإيميل ─────────────
export async function sendMail({ subject, text, html }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) throw new Error('SMTP_USER / SMTP_PASS are not set');
  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: process.env.MAIL_TO || 'hossamrana293@gmail.com',
    subject,
    text,
    html,
  });
}

// قالب الإيميل المشترك (ستايل inline عشان Gmail وOutlook يعرضوه صح)
export function emailShell({ title, subtitle, id, submittedAt, bodyHtml, saved }) {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f4f5f8;font-family:'Segoe UI',Tahoma,'Noto Sans Arabic',Arial,sans-serif;color:#222;">
  <div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #e7e9ed;border-radius:12px;overflow:hidden;">
    <div style="background:#171717;padding:22px 24px;border-bottom:4px solid #C8202F;">
      <h1 style="margin:0 0 6px;font-size:20px;color:#fff;">${esc(title)}</h1>
      <p style="margin:0;font-size:13px;color:#b3b3b3;">${subtitle}</p>
    </div>
    <div style="padding:22px 24px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><tr>
        <td style="padding:10px 14px;background:#fafafa;border:1px solid #ebebeb;font-size:13px;">رقم المرجع: <strong style="color:#C8202F;">${esc(id)}</strong></td>
        <td style="padding:10px 14px;background:#fafafa;border:1px solid #ebebeb;font-size:12px;color:#777;text-align:left;">${esc(submittedAt)}</td>
      </tr></table>
      ${bodyHtml}
    </div>
    <div style="text-align:center;padding:16px;font-size:12px;color:#777;background:#fbfbfb;border-top:1px solid #ebebeb;">
      ${saved ? 'تم تسجيل هذا الطلب في قاعدة البيانات.' : '⚠ لم يتم حفظ هذا الطلب في قاعدة البيانات (راجعي إعدادات Supabase). النسخة الوحيدة منه هي هذا الإيميل.'}
    </div>
  </div>
</body></html>`;
}

// صف في جدول الإيميل (القيمة بتتعرض باتجاهها الصح عربي/إنجليزي)
export const emailRow = (label, value, dir = 'auto') =>
  `<tr><th style="width:38%;padding:9px 12px;background:#fafafa;border-bottom:1px solid #eee;text-align:right;color:#555;font-size:13px;vertical-align:top;">${esc(label)}</th>` +
  `<td dir="${dir}" style="padding:9px 12px;border-bottom:1px solid #eee;color:#111;font-size:13px;word-break:break-word;white-space:pre-wrap;">${esc(value)}</td></tr>`;