const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const { logger } = require('../utils/logger');

const SIMULATION_NOTICE = {
    ar: 'هذه الأداة تعرض نتائج محاكاة/عرض تجريبي وليست خدمة فحص أمني حقيقية.',
    en: 'This tool returns simulation/demo results and is not a real security scanning service.'
};

const getSimulationNotice = (lang) => lang === 'ar' ? SIMULATION_NOTICE.ar : SIMULATION_NOTICE.en;

const sendSimulationResponse = (res, lang, data) => {
    res.setHeader('X-Tool-Simulation', 'true');
    return res.json({
        success: true,
        simulation: true,
        notice: getSimulationNotice(lang),
        data
    });
};

const sendDeprecatedSimulationEndpoint = (res, lang, replacementPath) => {
    res.setHeader('X-Tool-Simulation', 'true');
    return res.status(410).json({
        success: false,
        simulation: true,
        error: lang === 'ar'
            ? 'تم نقل endpoint المحاكاة إلى مسار منفصل لتوضيح أنه ليس فحصاً أمنياً حقيقياً.'
            : 'This simulation endpoint has moved to a separate path to clarify that it is not a real security scan.',
        replacementPath
    });
};

const toolMeta = {
    index: {
        title: { ar: 'أدوات MasarWeb', en: 'MasarWeb Tools' },
        description: {
            ar: 'مجموعة أدوات أمنية وحاسبات قوية لحماية كلمات المرور والتحقق من الروابط والملفات.',
            en: 'A set of security tools and calculators to protect passwords and check files or links.'
        }
    },
    'password-analyzer': {
        title: { ar: 'تحليل قوة كلمة المرور', en: 'Password Strength Analyzer' },
        description: {
            ar: 'حلّل قوة كلمة المرور عبر حساب الإنتروبي ووقت الكسر المتوقع.',
            en: 'Analyze password strength with entropy scoring and estimated crack time.'
        }
    },
    'key-strength': {
        title: { ar: 'حاسبة قوة مفتاح التشفير', en: 'Encryption Key Strength Calculator' },
        description: {
            ar: 'احسب متانة مفاتيح التشفير ومعايير الأمان المطلوبة.',
            en: 'Estimate encryption key strength and security requirements.'
        }
    },
    'absence-deduction': {
        title: { ar: 'حاسبة خصم الغياب', en: 'Absence Deduction Calculator' },
        description: {
            ar: 'احسب خصم الغياب بدقة وفق سياسات الموارد البشرية.',
            en: 'Calculate absence deductions accurately based on HR policies.'
        }
    },
    'virus-scanner': {
        title: { ar: 'فاحص الفيروسات', en: 'Virus Scanner' },
        description: {
            ar: 'افحص الملفات والروابط بحثاً عن مؤشرات خبيثة بسرعة.',
            en: 'Scan files and URLs for suspicious indicators quickly.'
        }
    },
    'team-password-vault': {
        title: { ar: 'خزنة كلمات المرور للفريق', en: 'Team Password Vault' },
        description: {
            ar: 'نظّم أسرار الفريق ومشاركتها بأمان.',
            en: 'Organize and share team secrets securely.'
        }
    },
    'bcrypt-calculator': {
        title: { ar: 'حاسبة Bcrypt', en: 'Bcrypt Hash Calculator' },
        description: {
            ar: 'أنشئ تجزئات Bcrypt واختبر عامل التكلفة بسرعة.',
            en: 'Generate Bcrypt hashes and test cost factors quickly.'
        }
    },
    'entropy-calculator': {
        title: { ar: 'حاسبة إنتروبي كلمة المرور', en: 'Password Entropy Calculator' },
        description: {
            ar: 'احسب إنتروبي كلمة المرور لفهم مستوى القوة الحقيقي.',
            en: 'Calculate password entropy to understand real strength.'
        }
    },
    'password-expiration': {
        title: { ar: 'حاسبة انتهاء صلاحية كلمة المرور', en: 'Password Expiration Calculator' },
        description: {
            ar: 'حدّد أفضل سياسات انتهاء كلمات المرور بناءً على المخاطر.',
            en: 'Determine password expiration policies based on risk.'
        }
    },
    '2fa-generator': {
        title: { ar: 'مولد رموز المصادقة الثنائية', en: '2FA TOTP Generator' },
        description: {
            ar: 'أنشئ رموز TOTP للمصادقة الثنائية بسرعة.',
            en: 'Generate TOTP codes for two-factor authentication.'
        }
    },
    'hash-identifier': {
        title: { ar: 'محدد نوع التشفير', en: 'Hash Algorithm Identifier' },
        description: {
            ar: 'تعرّف على نوع التجزئة وتحليل خصائصها.',
            en: 'Identify hash types and analyze their characteristics.'
        }
    },
    'breach-checker': {
        title: { ar: 'فاحص اختراق البيانات', en: 'Data Breach Checker' },
        description: {
            ar: 'تحقق من تسرب البيانات باستخدام مدخلات آمنة.',
            en: 'Check for data breaches using safe inputs.'
        }
    },
    'diceware-passphrase': {
        title: { ar: 'مولد عبارات المرور Diceware', en: 'Diceware Passphrase Generator' },
        description: {
            ar: 'أنشئ عبارات مرور قوية وسهلة التذكر.',
            en: 'Generate strong and memorable passphrases.'
        }
    },
    'password-generator': {
        title: { ar: 'مولد كلمات المرور المتقدم', en: 'Advanced Password Generator' },
        description: {
            ar: 'ولّد كلمات مرور عشوائية قوية مع إعدادات متقدمة.',
            en: 'Generate strong random passwords with advanced settings.'
        }
    }
};

const getMeta = (key, lang) => {
    const meta = toolMeta[key] || toolMeta.index;
    return {
        title: lang === 'ar' ? meta.title.ar : meta.title.en,
        description: lang === 'ar' ? meta.description.ar : meta.description.en
    };
};

// Configure Multer (Memory Storage)
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware to set local variables for the tools section
router.use((req, res, next) => {
    res.locals.activeSection = 'tools';
    next();
});

// Tools Index
router.get('/', (req, res) => {
    const meta = getMeta('index', req.lang);
    res.render('tools/index', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description
    });
});

// Password Strength Analyzer
router.get('/password-analyzer', (req, res) => {
    const meta = getMeta('password-analyzer', req.lang);
    res.render('tools/password-analyzer', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description
    });
});

// Encryption Key Strength Calculator
router.get('/key-strength', (req, res) => {
    const meta = getMeta('key-strength', req.lang);
    res.render('tools/key-strength', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description
    });
});

// Absence Deduction Calculator
router.get('/absence-deduction', (req, res) => {
    const meta = getMeta('absence-deduction', req.lang);
    res.render('tools/absence-deduction', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description
    });
});

// Virus Scanner Interface
router.get('/virus-scanner', (req, res) => {
    const meta = getMeta('virus-scanner', req.lang);
    res.render('tools/virus-scanner', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description,
        simulationNotice: getSimulationNotice(req.lang)
    });
});

// Deprecated simulation endpoints kept only to prevent ambiguity with real security APIs
router.post('/virus-scanner/scan', upload.single('file'), (req, res) => {
    return sendDeprecatedSimulationEndpoint(res, req.lang, '/tools/simulations/virus-scanner/scan');
});

router.post('/virus-scanner/scan-url', express.json(), (req, res) => {
    return sendDeprecatedSimulationEndpoint(res, req.lang, '/tools/simulations/virus-scanner/scan-url');
});

// Virus Scanner Simulation API - File Scan Endpoint
router.post('/simulations/virus-scanner/scan', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            simulation: true,
            error: req.lang === 'ar' ? 'لم يتم رفع أي ملف' : 'No file uploaded'
        });
    }

    try {
        // Calculate SHA-256 hash of the file
        const hashSum = crypto.createHash('sha256');
        hashSum.update(req.file.buffer);
        const fileHash = hashSum.digest('hex');

        // Deterministic simulation based on hash
        // If the hash ends with a digit 0-2, we mark it as "suspicious" for demo purposes
        // Otherwise, it's clean. This makes the result consistent for the same file.
        const lastChar = fileHash.slice(-1);
        const isSuspicious = ['0', '1', '2'].includes(lastChar);
        
        // Simulate processing delay to feel like a real scan
        setTimeout(() => {
            sendSimulationResponse(res, req.lang, {
                scan_id: fileHash,
                permalink: `https://www.virustotal.com/gui/file/${fileHash}`,
                resource: fileHash,
                response_code: 1,
                scan_date: new Date().toISOString(),
                verbose_msg: req.lang === 'ar'
                    ? 'تم إنشاء نتيجة محاكاة ودمجها في هذا الكائن'
                    : 'Simulation finished, scan information embedded in this object',
                positives: isSuspicious ? Math.floor(Math.random() * 5) + 1 : 0,
                total: 60,
                scans: {
                    "Bkav": { "detected": isSuspicious, "version": "1.3.0.9899", "result": isSuspicious ? "W32.AIDetect.malware" : null, "update": "20240101" },
                    "Kaspersky": { "detected": isSuspicious, "version": "21.0.1.45", "result": isSuspicious ? "Trojan.Win32.Generic" : null, "update": "20240101" },
                    "Symantec": { "detected": false, "version": "1.8.0.0", "result": null, "update": "20240101" }
                    // ... more mock data could be added
                }
            });
        }, 1500);

    } catch (error) {
        logger.error('Virus scan error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Virus Scanner Simulation API - URL Scan Endpoint
router.post('/simulations/virus-scanner/scan-url', express.json(), (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({
            success: false,
            simulation: true,
            error: req.lang === 'ar' ? 'لم يتم توفير رابط' : 'No URL provided'
        });
    }

    try {
        // Calculate SHA-256 hash of the URL for deterministic simulation
        const hashSum = crypto.createHash('sha256');
        hashSum.update(url);
        const urlHash = hashSum.digest('hex');

        // Deterministic simulation based on hash
        const lastChar = urlHash.slice(-1);
        const isSuspicious = ['0', '1', '2'].includes(lastChar);
        
        // Simulate processing delay
        setTimeout(() => {
            sendSimulationResponse(res, req.lang, {
                scan_id: urlHash,
                permalink: `https://www.virustotal.com/gui/url/${urlHash}`,
                resource: url,
                response_code: 1,
                scan_date: new Date().toISOString(),
                verbose_msg: req.lang === 'ar'
                    ? 'تم إنشاء نتيجة محاكاة ودمجها في هذا الكائن'
                    : 'Simulation finished, scan information embedded in this object',
                positives: isSuspicious ? Math.floor(Math.random() * 3) + 1 : 0,
                total: 80,
                scans: {
                    "Google Safebrowsing": { "detected": isSuspicious, "result": isSuspicious ? "Malware Site" : "Clean site" },
                    "PhishTank": { "detected": isSuspicious, "result": isSuspicious ? "Phishing Site" : "Clean site" },
                    "Opera": { "detected": false, "result": "Clean site" }
                }
            });
        }, 1500);

    } catch (error) {
        logger.error('URL scan error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Team Password Vault
router.get('/team-password-vault', (req, res) => {
    const meta = getMeta('team-password-vault', req.lang);
    res.render('tools/team-password-vault', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description
    });
});

// Bcrypt Hash Calculator
router.get('/bcrypt-calculator', (req, res) => {
    const meta = getMeta('bcrypt-calculator', req.lang);
    res.render('tools/bcrypt-calculator', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description
    });
});

// Password Entropy Calculator
router.get('/entropy-calculator', (req, res) => {
    const meta = getMeta('entropy-calculator', req.lang);
    res.render('tools/entropy-calculator', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description
    });
});

// Password Expiration Calculator
router.get('/password-expiration', (req, res) => {
    const meta = getMeta('password-expiration', req.lang);
    res.render('tools/password-expiration', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description
    });
});

// 2FA TOTP Generator
router.get('/2fa-generator', (req, res) => {
    const meta = getMeta('2fa-generator', req.lang);
    res.render('tools/2fa-generator', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description
    });
});

// Hash Identifier
router.get('/hash-identifier', (req, res) => {
    const meta = getMeta('hash-identifier', req.lang);
    res.render('tools/hash-identifier', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description
    });
});

// Data Breach Checker
router.get('/breach-checker', (req, res) => {
    const meta = getMeta('breach-checker', req.lang);
    res.render('tools/breach-checker', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description
    });
});

// Diceware Passphrase Generator
router.get('/diceware-passphrase', (req, res) => {
    const meta = getMeta('diceware-passphrase', req.lang);
    res.render('tools/diceware-passphrase', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description
    });
});

// Advanced Password Generator
router.get('/password-generator', (req, res) => {
    const meta = getMeta('password-generator', req.lang);
    res.render('tools/password-generator', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description
    });
});

module.exports = router;
