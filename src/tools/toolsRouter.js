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
    'password-pattern-analyzer': {
        title: { ar: 'محلل أنماط كلمات المرور', en: 'Password Pattern Analyzer' },
        description: {
            ar: 'اكتشف التسلسلات المتوقعة وأنماط لوحة المفاتيح والكلمات الشائعة التي تضعف كلمات المرور.',
            en: 'Identify predictable keyboard walks, sequence reuse, and common structure patterns that reduce password security.'
        }
    },
    'biometric-readiness-checker': {
        title: { ar: 'مدقق جاهزية القياسات الحيوية ومفاتيح المرور', en: 'Browser Biometric Capability & Passkey Readiness Checker' },
        description: {
            ar: 'تحقق فوراً مما إذا كان متصفحك وجهازك يدعمان Face ID وTouch ID وWindows Hello ومفاتيح الأمان FIDO2.',
            en: 'Instantly verify if your browser and device support Face ID, Touch ID, Windows Hello, and FIDO2 security keys.'
        }
    },
    'webauthn-debugger': {
        title: { ar: 'مختبر تصحيح WebAuthn وFIDO2', en: 'WebAuthn & FIDO2 Debugging Playground' },
        description: {
            ar: 'محاكاة وتصحيح سير عمل تسجيل واستيثاق WebAuthn في الوقت الفعلي مع فك تشفير CBOR وكائنات بيانات العميل.',
            en: 'Simulate and debug WebAuthn registration and authentication flows with live CBOR decoding and client data inspection.'
        }
    },
    'oauth-flow-visualizer': {
        title: { ar: 'عارض تدفق OAuth 2.0', en: 'OAuth 2.0 Flow Visualizer' },
        description: {
            ar: 'تصور وتتبع تسلسل طلبات واستجابات OAuth 2.0 مع رسوم تخطيطية للسلاسل وقائمة بتوصيات الأمان.',
            en: 'Visualize and trace OAuth 2.0 request-response sequences with flow diagrams and security recommendations.'
        }
    },
    'jwt-decoder': {
        title: { ar: 'محلل وفك تشفير JWT', en: 'JWT Decoder & Inspector' },
        description: {
            ar: 'فك تشفير وتحليل رموز JWT للتحقق من المحتوى والتوقيع والمطالبات دون الحاجة إلى مفتاح سري.',
            en: 'Decode and inspect JWT tokens to verify payloads, headers, and signature status without a secret key.'
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
    },
    'temporary-password-secret-generator': {
        title: { ar: 'مولد كلمات المرور المؤقتة والأسرار', en: 'Temporary Password & Secret Generator' },
        description: {
            ar: 'أنشئ أسراراً مؤقتة وروابط مشاركة تنتهي صلاحيتها تلقائياً وفق سياسات زمنية وحدود وصول واضحة.',
            en: 'Generate temporary secrets, expiring share links, and deterministic audit metadata for short-lived credential handoffs.'
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

// Password Pattern Analyzer
router.get('/password-pattern-analyzer', (req, res) => {
    const meta = getMeta('password-pattern-analyzer', req.lang);
    const baseStructuredData = res.locals.structuredData || [];

    res.render('tools/password-pattern-analyzer', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description,
        structuredData: [
            ...baseStructuredData,
            {
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                "name": "Password Pattern Analyzer",
                "applicationCategory": "SecurityApplication",
                "operatingSystem": "Web",
                "description": meta.description,
                "offers": {
                    "@type": "Offer",
                    "price": "0",
                    "priceCurrency": "USD"
                }
            }
        ]
    });
});

// Browser Biometric & WebAuthn Compatibility Checker
router.get('/biometric-readiness-checker', (req, res) => {
    const meta = getMeta('biometric-readiness-checker', req.lang);
    const baseStructuredData = res.locals.structuredData || [];

    res.render('tools/biometric-readiness-checker', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description,
        structuredData: [
            ...baseStructuredData,
            {
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                "name": "Browser Biometric Capability & Passkey Readiness Checker",
                "applicationCategory": "SecurityApplication",
                "operatingSystem": "Web",
                "description": meta.description,
                "offers": {
                    "@type": "Offer",
                    "price": "0",
                    "priceCurrency": "USD"
                }
            },
            {
                "@context": "https://schema.org",
                "@type": "FAQPage",
                "mainEntity": [
                    {
                        "@type": "Question",
                        "name": "How do I enable biometric login in my browser?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Biometric login usually requires a device with fingerprint or face recognition already enrolled at the operating-system level, a browser with WebAuthn support, and a website that offers passkeys or security key sign-in."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "What is the difference between platform and cross-platform authenticators?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Platform authenticators are built into the current device, such as Touch ID, Windows Hello, or Face ID. Cross-platform authenticators are separate devices such as USB, NFC, or Bluetooth security keys."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "Why is my browser reporting that biometrics are unavailable?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "A browser can report biometrics as unavailable when WebAuthn is missing, the device has no enrolled fingerprint or face profile, the page is not in a secure context, or enterprise policy and browser privacy settings block the authenticator probe."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "Is WebAuthn more secure than traditional passwords?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "In most deployments, yes. WebAuthn reduces phishing exposure, avoids password reuse, and keeps private keys on the authenticator instead of sending shared secrets to the server."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "Does this tool work on mobile browsers like Safari or Chrome?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Yes. The checker runs in mobile browsers that allow JavaScript access to WebAuthn-related interfaces, but the final result still depends on the device, operating system, and browser implementation."
                        }
                    }
                ]
            }
        ]
    });
});

// WebAuthn & FIDO2 Debugging Playground
router.get('/webauthn-debugger', (req, res) => {
    const meta = getMeta('webauthn-debugger', req.lang);
    const baseStructuredData = res.locals.structuredData || [];

    res.render('tools/webauthn-debugger', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description,
        structuredData: [
            ...baseStructuredData,
            {
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                "name": "WebAuthn & FIDO2 Debugging Playground",
                "applicationCategory": "DeveloperApplication",
                "operatingSystem": "Web",
                "description": meta.description,
                "offers": {
                    "@type": "Offer",
                    "price": "0",
                    "priceCurrency": "USD"
                }
            },
            {
                "@context": "https://schema.org",
                "@type": "FAQPage",
                "mainEntity": [
                    {
                        "@type": "Question",
                        "name": "What is the difference between WebAuthn Attestation and Assertion?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Attestation occurs during registration and proves the authenticator's identity via its attestation certificate. Assertion occurs during authentication and proves possession of the private key for a registered credential."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "How do I debug NotAllowedError in WebAuthn?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "NotAllowedError typically means the ceremony was rejected. Check that the origin matches your expected domain, the RP ID is valid for the current origin, and the user did not cancel the authentication dialog."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "Can I test FIDO2 security keys on localhost?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Yes, localhost is exempt from the HTTPS requirement for WebAuthn. However, the origin must be exactly http://localhost or http://127.0.0.1 with the correct port."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "What is a Resident Key in FIDO2?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "A Resident Key (Discoverable Credential) is stored on the authenticator and can be selected without the relying party providing a credential ID, enabling passwordless flows."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "How do I decode the clientDataJSON from a WebAuthn response?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "The clientDataJSON is a UTF-8 encoded JSON string. Decode it using TextDecoder and parse the JSON. It contains type, challenge, origin, and optionally crossOrigin fields."
                        }
                    }
                ]
            }
        ]
    });
});

// OAuth 2.0 Flow Visualizer
router.get('/oauth-flow-visualizer', (req, res) => {
    const meta = getMeta('oauth-flow-visualizer', req.lang);
    const baseStructuredData = res.locals.structuredData || [];

    res.render('tools/oauth-flow-visualizer', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description,
        structuredData: [
            ...baseStructuredData,
            {
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                "name": "OAuth 2.0 Flow Visualizer",
                "applicationCategory": "DeveloperApplication",
                "operatingSystem": "Web",
                "description": meta.description,
                "offers": {
                    "@type": "Offer",
                    "price": "0",
                    "priceCurrency": "USD"
                }
            },
            {
                "@context": "https://schema.org",
                "@type": "FAQPage",
                "mainEntity": [
                    {
                        "@type": "Question",
                        "name": "What is the most secure OAuth 2.0 flow for modern web apps?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Authorization Code with PKCE is the most secure flow for modern web applications. It provides the security benefits of the Authorization Code flow while protecting against authorization code interception attacks."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "How does the Authorization Code flow differ from the Implicit flow?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Authorization Code returns an authorization code that is exchanged for tokens on a backend server, keeping tokens out of the browser. Implicit returns tokens directly in the redirect, exposing them to browser-based attacks."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "Why is PKCE recommended for all OAuth 2.0 implementations?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "PKCE protects against authorization code interception attacks where an attacker intercepts the code and exchanges it for tokens. By binding the token request to the original authorization request via a code verifier, PKCE ensures only the legitimate client can complete the exchange."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "What is the role of the Redirect URI in the OAuth handshake?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "The redirect URI is where the authorization server sends the user after authentication, with either an authorization code or tokens. It must be pre-registered and validated exactly to prevent interception attacks."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "How are Refresh Tokens handled in a visual sequence diagram?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Refresh tokens appear in a subsequent flow after the initial authorization. The client presents the refresh token to the token endpoint and receives a new access token (and optionally a new refresh token)."
                        }
                    }
                ]
            }
        ]
    });
});

// JWT Decoder & Inspector
router.get('/jwt-decoder', (req, res) => {
    const meta = getMeta('jwt-decoder', req.lang);
    const baseStructuredData = res.locals.structuredData || [];

    res.render('tools/jwt-decoder', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description,
        structuredData: [
            ...baseStructuredData,
            {
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                "name": "JWT Decoder & Inspector",
                "applicationCategory": "DeveloperApplication",
                "operatingSystem": "Web",
                "description": meta.description,
                "offers": {
                    "@type": "Offer",
                    "price": "0",
                    "priceCurrency": "USD"
                }
            },
            {
                "@context": "https://schema.org",
                "@type": "FAQPage",
                "mainEntity": [
                    {
                        "@type": "Question",
                        "name": "What is a JWT and how do I decode it?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "A JWT (JSON Web Token) is a Base64URL-encoded string containing a header, payload, and signature. To decode it, split by the dot separator and Base64URL-decode the first two segments."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "Is it safe to paste my JWT into an online decoder?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "This tool decodes entirely in your browser; no token data is transmitted to any server. However, for production credentials, avoid pasting them into any online tool out of caution."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "Can I decode a JWT without having the secret key?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Yes. The header and payload can always be decoded without the key. Signature verification requires the correct secret or public key."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "How do I check if my JWT has expired?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Look at the exp claim in the payload. It is a Unix timestamp. If the current time exceeds exp, the token is expired."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "What is the difference between the header and the payload in a JWT?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "The header contains metadata about the token: the signing algorithm and token type. The payload contains the claims: statements about the user plus metadata like expiration and issuer."
                        }
                    }
                ]
            }
        ]
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

// Temporary Password & Secret Generator
router.get('/temporary-password-secret-generator', (req, res) => {
    const meta = getMeta('temporary-password-secret-generator', req.lang);
    const baseStructuredData = res.locals.structuredData || [];

    res.render('tools/temporary-password-secret-generator', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description,
        structuredData: [
            ...baseStructuredData,
            {
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                "name": "Temporary Password & Secret Generator",
                "applicationCategory": "SecurityApplication",
                "operatingSystem": "Web",
                "description": meta.description,
                "offers": {
                    "@type": "Offer",
                    "price": "0",
                    "priceCurrency": "USD"
                }
            }
        ]
    });
});

module.exports = router;
