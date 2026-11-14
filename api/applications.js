// api/applications.js  →  POST /api/applications
// بيستقبل طلب التوظيف: يفحصه، يحفظه في Supabase، ويبعته على الإيميل.

import { esc, clean, oneLine, cairoNow, dbInsert, sendMail, emailShell, emailRow, refFromRow, fallbackRef } from './_lib/utils.js';

// كل حقول الفورم بالترتيب، بعناوين مطابقة للأسئلة اللي في صفحة /audit
const SECTIONS = [
  {
    title: 'البيانات الشخصية وبيانات الاتصال',
    fields: [
      ['fullName', 'الاسم الكامل'],
      ['phone', 'رقم الهاتف الأساسي'],
      ['whatsapp', 'رقم الواتساب'],
      ['email', 'البريد الإلكتروني'],
      ['birthDate', 'تاريخ الميلاد'],
      ['gender', 'النوع'],
      ['address', 'العنوان بالتفصيل'],
      ['governorate', 'المحافظة'],
      ['landmark', 'أقرب علامة مميزة'],
      ['job', 'الوظيفة المتقدم إليها'],
      ['source', 'كيف سمع عن الوظيفة'],
    ],
  },
  {
    title: 'المؤهل الدراسي والخبرة',
    fields: [
      ['qualification', 'أعلى مؤهل دراسي'],
      ['university', 'الجامعة / المعهد'],
      ['major', 'التخصص'],
      ['graduationYear', 'سنة التخرج'],
      ['experienceYears', 'إجمالي سنوات الخبرة'],
      ['lastEmployer', 'آخر جهة عمل'],
      ['lastTitle', 'المسمى الوظيفي الأخير'],
      ['lastSalary', 'آخر راتب (جنيه)'],
      ['expectedSalary', 'الراتب المتوقع (جنيه)'],
      ['availability', 'مدة الإخطار / موعد الانضمام'],
      ['currentlyWorking', 'هل يعمل حاليًا؟'],
      ['pharmacyYears', 'سنوات الخبرة في الصيدليات'],
      ['experienceDetails', 'ملخص الخبرة والمسؤوليات والإنجازات'],
      ['leavingReason', 'سبب ترك العمل السابق / البحث عن فرصة جديدة'],
      ['referencePermission', 'هل يمكن التواصل مع المدير السابق للسؤال عنه؟'],
    ],
  },
  {
    title: 'المهارات والشهادات',
    fields: [
      ['skills', 'المهارات المهنية'],
      ['english', 'مستوى اللغة الإنجليزية'],
      ['computer', 'إجادة الحاسب الآلي'],
      ['systems', 'البرامج والأنظمة التي يجيدها'],
      ['certificates', 'الدورات والشهادات'],
      ['otherLanguages', 'لغات أخرى'],
      ['portfolio', 'رابط LinkedIn / أعمال'],
      ['files', 'أسماء الملفات المرفقة (الملفات نفسها لا تُرفع)'],
    ],
  },
  {
    title: 'ملاءمة الوظيفة وظروف العمل',
    fields: [
      ['shiftAbility', 'هل يستطيع الالتزام بساعات العمل المحددة للوظيفة؟'],
      ['shiftWork', 'هل يناسبه العمل بنظام الورديات؟'],
      ['commute', 'هل يستطيع الانتقال لمقر العمل بانتظام؟'],
      ['fieldWork', 'العمل الميداني / الزيارات: هل يناسبه؟'],
      ['essentialDuties', 'هل يستطيع أداء المهام الأساسية للوظيفة؟'],
      ['accommodation', 'هل يحتاج ترتيبات أو تسهيلات في بيئة العمل لأداء مهامه؟'],
      ['accommodationDetails', 'تفاصيل الترتيبات المطلوبة (متعلقة بالعمل فقط)'],
      ['safetyDiscussion', 'هل يرغب في مناقشة أمر يتعلق بسلامة أداء مهام معينة مع الموارد البشرية بسرية؟'],
      ['workConditions', 'ملاحظات إضافية على ظروف العمل المناسبة'],
    ],
  },
  {
    title: 'أسئلة شخصية وإقرار',
    fields: [
      ['whyUs', 'لماذا يرغب في الانضمام إلى Aljumeiy Pharma؟'],
      ['strengths', 'أهم ثلاث نقاط قوة'],
      ['development', 'المهارة التي يعمل على تطويرها حاليًا'],
      ['problemExample', 'مشكلة واجهها في العمل وكيف تعامل معها'],
      ['contactTime', 'الوقت المفضل للتواصل'],
      ['assessment', 'هل يوافق على إجراء اختبار أو مقابلة عملية؟'],
      ['accuracyConsent', 'إقرار بصحة البيانات'],
      ['privacyConsent', 'الموافقة على استخدام البيانات لأغراض التوظيف فقط'],
    ],
  },
];

const ARRAY_FIELDS = new Set(['skills', 'files']);
const FLAG_FIELDS = new Set(['accuracyConsent', 'privacyConsent']);
const REQUIRED = [
  'fullName', 'phone', 'address', 'job', 'qualification', 'experienceYears', 'expectedSalary',
  'experienceDetails', 'shiftAbility', 'essentialDuties', 'whyUs',
];

// ───────────── فحص وتنظيف: أي حقل مش في القايمة بيتتجاهل، وكل حقل له حد أقصى ─────────────
function sanitize(body) {
  const data = {};
  for (const section of SECTIONS) {
    for (const [key] of section.fields) {
      const value = body[key];
      if (ARRAY_FIELDS.has(key)) {
        data[key] = Array.isArray(value)
          ? value.filter((v) => typeof v === 'string').slice(0, 40).map((v) => v.trim().slice(0, 200)).filter(Boolean)
          : [];
      } else if (FLAG_FIELDS.has(key)) {
        data[key] = value === true;
      } else {
        data[key] = clean(value, 4000);
      }
    }
  }
  if (REQUIRED.some((k) => !data[k])) return { error: 'Please complete all required fields.' };
  if (!data.accuracyConsent || !data.privacyConsent) return { error: 'Please accept the declaration and privacy terms.' };
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return { error: 'Please enter a valid email address.' };
  return { data };
}

function display(key, value) {
  if (FLAG_FIELDS.has(key)) return value ? 'نعم' : 'لا';
  if (Array.isArray(value)) return value.join(', ');
  return value;
}

function buildBody(data) {
  return SECTIONS.map((section) => {
    const rows = section.fields
      .map(([key, label]) => [key, label, display(key, data[key])])
      .filter(([, , v]) => v)
      .map(([key, label, v]) => emailRow(label, v, key === 'phone' || key === 'whatsapp' || key === 'email' ? 'ltr' : 'auto'))
      .join('');
    if (!rows) return '';
    return `<h3 style="margin:22px 0 8px;font-size:15px;color:#171717;border-bottom:2px solid #C8202F;padding-bottom:6px;display:inline-block;">${esc(section.title)}</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #eee;">${rows}</table>`;
  }).join('');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // فخ البوتات: لو الحقل المخفي اتملى نرد بنجاح وهمي من غير ما نعمل حاجة
  if (typeof body.website === 'string' && body.website.trim()) return res.status(200).json({ ok: true, id: fallbackRef('AJ') });

  const { data, error } = sanitize(body);
  if (error) return res.status(400).json({ error });

  // 1) الحفظ في قاعدة البيانات
  let row = null;
  let saved = false;
  try {
    row = await dbInsert('applications', {
      full_name: data.fullName,
      phone: data.phone,
      whatsapp: data.whatsapp || null,
      email: data.email || null,
      job: data.job,
      governorate: data.governorate || null,
      details: data, // كل الإجابات كاملة
    });
    saved = true;
  } catch (err) {
    console.error('[applications] database error:', err.message);
  }

  const id = refFromRow('AJ', row) || fallbackRef('AJ');

  // 2) الإيميل
  let emailed = false;
  try {
    await sendMail({
      subject: `[طلب توظيف جديد] ${oneLine(data.fullName)} - ${oneLine(data.job)} [${id}]`,
      text: [
        'طلب توظيف جديد من صفحة الموقع.',
        `الاسم: ${oneLine(data.fullName)}`,
        `الوظيفة: ${oneLine(data.job)}`,
        `الهاتف: ${oneLine(data.phone)}`,
        `رقم المرجع: ${id}`,
        '',
        'التفاصيل الكاملة في النسخة المنسّقة من الإيميل.',
      ].join('\n'),
      html: emailShell({
        title: 'استمارة تقديم توظيف جديدة',
        subtitle: `الوظيفة: <strong>${esc(data.job)}</strong> | الاسم: <strong>${esc(data.fullName)}</strong>`,
        id,
        submittedAt: cairoNow(),
        bodyHtml: buildBody(data),
        saved,
      }),
    });
    emailed = true;
  } catch (err) {
    console.error('[applications] email error:', err.message);
  }

  // لو الحفظ والإيميل الاتنين فشلوا: لازم الزائر يعرف (مش نقوله "تم" والطلب ضايع)
  if (!saved && !emailed) {
    return res.status(500).json({ error: 'We could not send your application right now. Please try again in a few minutes.' });
  }
  return res.status(200).json({ ok: true, id });
}