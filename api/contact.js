// api/contact.js  →  POST /api/contact
// بيستقبل فورم صفحة Contact: يفحصه، يحفظه في Supabase، ويبعته على الإيميل.

import { esc, clean, oneLine, cairoNow, dbInsert, sendMail, emailShell, emailRow, refFromRow, fallbackRef } from './_lib/utils.js';

// أرقام عربية وإنجليزية + - ( ) ومسافات
const PHONE_RE = /^[0-9\u0660-\u0669+()\s-]{6,25}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // فخ البوتات
  if (typeof body.website === 'string' && body.website.trim()) return res.status(200).json({ ok: true, id: fallbackRef('CT') });

  const name = clean(body.name, 120);
  const phone = clean(body.phone, 25);
  const notes = clean(body.notes, 3000);
  const lang = body.lang === 'ar' ? 'ar' : 'en';

  if (!name) return res.status(400).json({ error: 'Please enter your name.' });
  if (!PHONE_RE.test(phone)) return res.status(400).json({ error: 'Please enter a valid phone number.' });

  // 1) الحفظ في قاعدة البيانات
  let row = null;
  let saved = false;
  try {
    row = await dbInsert('contacts', { name, phone, notes: notes || null, lang });
    saved = true;
  } catch (err) {
    console.error('[contact] database error:', err.message);
  }

  const id = refFromRow('CT', row) || fallbackRef('CT');

  // 2) الإيميل
  let emailed = false;
  try {
    const rows = [
      emailRow('اسم العميل / الصيدلي', name),
      emailRow('رقم الهاتف / واتساب', phone, 'ltr'),
      emailRow('لغة التصفح', lang === 'ar' ? 'العربية' : 'English'),
      notes ? emailRow('اسم الصيدلية / تفاصيل الرسالة', notes) : '',
    ].join('');
    await sendMail({
      subject: `[رسالة تواصل جديدة] ${oneLine(name)} [${id}]`,
      text: [
        'رسالة جديدة من فورم التواصل بالموقع.',
        `الاسم: ${oneLine(name)}`,
        `الهاتف: ${oneLine(phone)}`,
        `رقم المرجع: ${id}`,
        '',
        'اسم الصيدلية / التفاصيل:',
        notes || 'لا توجد ملاحظات',
      ].join('\n'),
      html: emailShell({
        title: 'رسالة تواصل جديدة | Onboarding 4U',
        subtitle: 'تم استلام استفسار جديد عبر نموذج التواصل بالموقع',
        id,
        submittedAt: cairoNow(),
        bodyHtml: `<table style="width:100%;border-collapse:collapse;border:1px solid #eee;margin-top:14px;">${rows}</table>`,
        saved,
      }),
    });
    emailed = true;
  } catch (err) {
    console.error('[contact] email error:', err.message);
  }

  if (!saved && !emailed) {
    return res.status(500).json({ error: 'We could not send your message right now. Please try again in a few minutes.' });
  }
  return res.status(200).json({ ok: true, id });
}