# 🌐 MasarWeb - مسار ويب

<div dir="rtl">

MasarWeb هو وكيل ويب متقدم وآمن بتصميم عربي أنيق. يتيح لك تصفح الإنترنت بخصوصية تامة وأمان مع دعم كامل للمواقع العربية والعالمية.

</div>

## ✨ المميزات الرئيسية

### 🔒 الأمان والخصوصية
- **إخفاء عنوان IP** - نخفي عنوان IP الحقيقي الخاص بك
- **تشفير HTTPS** - جميع الاتصالات مشفرة
- **حماية ضد البرمجيات الخبيثة** - حظر المواقع الضارة تلقائيًا
- **منع الوصول للشبكات الداخلية** - حماية من هجمات SSRF
- **إخفاء الهوية** - تدوير وكلاء المستخدم وإزالة الترويسات المكشفة

### 🚀 الأداء والكفاءة
- **بث مباشر للوسائط** - دعم الفيديو والصوت بدون تخزين مؤقت
- **ضغط المحتوى** - تقليل حجم البيانات المنقولة
- **تخزين مؤقت اختياري** - تسريع المواقع المتكررة الزيارة
- **معالجة غير متزامنة** - أداء عالي مع Node.js

### 🛠️ الميزات التقنية
- **إعادة كتابة الروابط** - جميع الروابط تُعاد كتابتها تلقائيًا
- **دعم JavaScript** - تشغيل المواقع الحديثة بدون مشاكل
- **دعم WebSockets** - للتطبيقات التفاعلية
- **إدارة الجلسات** - حفظ تسجيلات الدخول بأمان
- **واجهة عربية** - تصميم RTL كامل

## 📋 متطلبات التشغيل

- Node.js >= 16.0.0
- npm أو yarn

## 🚀 التثبيت والتشغيل

### 1.克隆 المشروع
```bash
git clone <repository-url>
cd arabic-web-proxy
```

### 2. تثبيت التبعيات
```bash
npm install
```

### 3. إعداد المتغيرات البيئية
```bash
cp .env.example .env
# قم بتحرير .env وإضافة إعداداتك
```

### 4. التشغيل
```bash
# وضع التطوير
npm run dev

# وضع الإنتاج
npm start
```

## 🔧 الإعدادات

### المتغيرات البيئية

| المتغير | الوصف | القيمة الافتراضية |
|---------|-------|-------------------|
| `PORT` | منفذ الخادم | 3000 |
| `NODE_ENV` | بيئة التشغيل | development |
| `SESSION_SECRET` | مفتاح تشفير الجلسات | - |
| `COOKIE_SECRET` | مفتاح تشفير ملفات التعريف | - |
| `ADMIN_USERNAME` | اسم مستخدم المشرف | admin |
| `ADMIN_PASSWORD` | كلمة مرور المشرف | admin123 |
| `RATE_LIMIT_MAX` | الحد الأقصى للطلبات | 100 |
| `ENABLE_WEBSOCKETS` | تفعيل WebSockets | true |
| `ENABLE_MEDIA_STREAMING` | تفعيل بث الوسائط | true |

### النطاقات المحظورة

يمكن إضافة نطاقات للحظر عبر متغير البيئة `BLOCKED_DOMAINS`:
```
BLOCKED_DOMAINS=malware.com,phishing.com,ads.com
```

## 📁 هيكل المشروع

```
arabic-web-proxy/
├── src/
│   ├── app.js                 # نقطة الدخول الرئيسية
│   ├── proxy/                 # وظائف البروكسي
│   │   └── proxyRouter.js
│   ├── rewriter/              # محرك إعادة الكتابة
│   │   └── urlRewriter.js
│   ├── security/              # ميزات الأمان
│   │   └── security.js
│   ├── session/               # إدارة الجلسات
│   │   └── sessionManager.js
│   ├── admin/                 # لوحة الإدارة
│   │   └── adminRouter.js
│   └── utils/                 # أدوات مساعدة
│       ├── config.js
│       └── logger.js
├── views/                     # قوالب EJS
│   ├── index.ejs
│   ├── error.ejs
│   └── admin/
│       └── dashboard.ejs
├── public/                    # الملفات الثابتة
│   └── css/
├── config/                    # ملفات الإعداد
├── logs/                      # سجلات التطبيق
├── .env.example
├── package.json
└── README.md
```

## 🌟 طريقة الاستخدام

### للمستخدمين

1. افتح الموقع في المتصفح
2. أدخل عنوان الموقع المراد زيارته في حقل الإدخال
3. اضغط "تصفح" أو Enter
4. تصفح الموقع بأمان وخصوصية

### للمشرفين

لوحة الإدارة متاحة على `/admin`

```
الرابط: http://localhost:3000/admin
اسم المستخدم: admin (أو ما تم تعيينه في .env)
كلمة المرور: admin123 (أو ما تم تعيينه في .env)
```

#### مميزات لوحة الإدارة:
- 📊 إحصائيات حية للاستخدام
- 🔒 إدارة قائمة الحظر (IP والنطاقات)
- 👥 إدارة الجلسات النشطة
- ⚙️ التحكم في الميزات
- 📜 عرض السجلات

## 🔐 الأمان

### الميزات الأمنية المُفعّلة

1. **حماية SSRF** - حظر الوصول للشبكات الداخلية:
   - 10.0.0.0/8
   - 172.16.0.0/12
   - 192.168.0.0/16
   - 127.0.0.0/8
   - ::1 (IPv6)

2. **حماية البيانات الوصفية** - حظر نقاط نهاية السحابة:
   - 169.254.169.254 (AWS, GCP, Azure)
   - metadata.google.internal

3. **حدود المعدل** - منع الإساءة:
   - 100 طلب/15 دقيقة للمستخدم العادي
   - 200 طلب/15 دقيقة لطلبات البروكسي

4. **التحقق من TLS** - التحقق من شهادات SSL

## 🌐 دعم اللغات

الواجهة بالكامل باللغة العربية (RTL) مع دعم:
- المواقع العربية
- المواقع الإنجليزية
- الترميز UTF-8 الكامل

## 📝 السجلات

يتم تخزين السجلات في مجلد `logs/`:
- `combined.log` - جميع السجلات
- `error.log` - أخطاء فقط
- `audit.log` - سجلات الأمان (بدون معلومات شخصية)

## 🔄 التحديثات المستقبلية

- [ ] دعم Redis للجلسات
- [ ] قاعدة بيانات للمستخدمين المميزين
- [ ] حظر قائمة الـ IP الديناميكية
- [ ] تكامل مع Prometheus/Grafana
- [ ] دعم HTTP/2
- [ ] وضع التصفح المتخفي

## 📄 الترخيص

MIT License - انظر ملف LICENSE للتفاصيل

## 🤝 المساهمة

نرحب بمساهماتكم! يرجى:
1. عمل Fork للمشروع
2. إنشاء فرع للميزة (`git checkout -b feature/amazing-feature`)
3. Commit التغييرات (`git commit -m 'Add amazing feature'`)
4. Push للفرع (`git push origin feature/amazing-feature`)
5. فتح Pull Request

## 📧 التواصل

للأسئلة والاقتراحات:
- البريد الإلكتروني: support@masarweb.com
- التليجرام: @MasarWeb

---

<div dir="rtl" align="center">

**صنع ب❤️ للعالم العربي**

</div>

---

## English Documentation

### Overview

MasarWeb is an advanced, secure web proxy with a beautiful Arabic design. Browse the internet with complete privacy and security, with full support for Arabic and international websites.

### Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start the server
npm start
```

Visit `http://localhost:3000` to use the tools and articles. Public proxy browsing is disabled by default.

### Deceptive-page containment

Keep `ENABLE_PROXY=false` on the public deployment. `/browse` and `/proxy` return `410 Gone`, and the homepage does not offer browsing. The simulated virus scanner and its APIs are retired with `410 Gone`.

For a reviewed, restricted deployment only, set `ENABLE_PROXY=true` and configure `ALLOWED_TARGET_DOMAINS` with exact trusted HTTPS hostnames. Empty lists deny access; subdomains require separate entries. Responses are sandboxed without script/form permissions and downloads are blocked. This intentionally limits compatibility.

After deployment, verify the flagged URLs return 410, clear previously cached proxy content, and request a Search Console security review. Source changes alone do not remove Google's warning.

### Admin Dashboard

Access the admin dashboard at `/admin` with the credentials specified in your `.env` file.

### Security Features

- IP anonymization
- HTTPS enforcement
- Private network protection (SSRF prevention)
- Cloud metadata endpoint blocking
- Rate limiting
- Domain/IP blocking

### License

MIT License
