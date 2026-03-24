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
    'jwt-generator': {
        title: { ar: 'مولد رموز JWT للاختبار', en: 'JWT Token Generator for Testing' },
        description: {
            ar: 'إنشاء وتوقيع رموز JWT المخصصة لاختبار واجهات برمجة التطبيقات workflows للمصادقة.',
            en: 'Create and sign custom JSON Web Tokens for API authentication testing and debugging workflows.'
        }
    },
    'session-token-analyzer': {
        title: { ar: 'محلل رموز الجلسة وكلمات المرور', en: 'Session Token Analyzer' },
        description: {
            ar: 'فك تشفير بيانات الجلسة والتحقق من التوقيع وفحص سمات أمان ملفات تعريف الارتباط.',
            en: 'Decode session data, verify signatures, and audit cookie security attributes for unauthorized access prevention.'
        }
    },
    'api-key-generator': {
        title: { ar: 'مولد مفاتيح API مع النطاقات', en: 'API Key Scoping & Security Generator' },
        description: {
            ar: 'إنشاء رموز API آمنة مع أذونات مخصصة وعمر افتراضي ومتطلبات وصول دقيقة للموارد.',
            en: 'Generate secure API tokens with custom permissions, TTL, and granular resource-level access control.'
        }
    },
    'scoped-api-key-generator': {
        title: { ar: 'مولد مفاتيح API المحدودة النطاق', en: 'Scoped API Key Generator' },
        description: {
            ar: 'إنشاء مفاتيح API آمنة مع تحكم دقيق في الأذونات وعناوين البادئة المخصصة.',
            en: 'Generate secure, permission-restricted API keys for application integration with custom prefixes and scopes.'
        }
    },
    'sso-tester': {
        title: { ar: 'اختبار تكوين SSO و SAML/OIDC', en: 'SSO Configuration & SAML/OIDC Tester' },
        description: {
            ar: 'فك تشفير والتحقق من تأكيدات SAML ورموز OIDC لتحديد أخطاء المصادقة وثغرات الأمان.',
            en: 'Decode and validate SAML assertions, OIDC tokens, and metadata to eliminate authentication errors and security risks.'
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
    },
    'ldap-tester': {
        title: { ar: 'اختبار مصادقة LDAP ومختبر الاتصال', en: 'LDAP Authentication Tester & Connection Debugger' },
        description: {
            ar: 'تحقق من صحة إعدادات اتصال LDAP ونسب ربط Active Directory مع رسائل تحليل الأخطاء.',
            en: 'Validate LDAP server connection settings and Active Directory bind credentials with detailed error analysis.'
        }
    },
    'voice-recorder': {
        title: { ar: 'مسجل الصوت المجاني عبر الإنترنت', en: 'Free Online Voice Recorder' },
        description: {
            ar: 'سجل صوتك مباشرة في المتصفح واحفظ الملفات الصوتية عالية الجودة بتنسيق MP3 أو WAV أو WebM.',
            en: 'Record your voice directly in your browser and save professional-grade audio files in MP3, WAV, or WebM format.'
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

// JWT Token Generator for Testing
router.get('/jwt-generator', (req, res) => {
    const meta = getMeta('jwt-generator', req.lang);
    const baseStructuredData = res.locals.structuredData || [];

    res.render('tools/jwt-generator', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description,
        structuredData: [
            ...baseStructuredData,
            {
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                "name": "JWT Token Generator for Testing",
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
                        "name": "What is a JWT and how does it work?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "A JWT (JSON Web Token) is a compact, URL-safe format for transmitting claims between parties. It consists of a header, payload, and signature. The signature allows the recipient to verify the token was created by a trusted party."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "How can I generate a JWT for testing purposes?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Enter the header JSON, payload JSON with your claims, and a secret key. The tool will generate a signed JWT that you can use to test your API authentication endpoints."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "What is the difference between HS256 and RS256?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "HS256 uses a symmetric key (shared secret) for signing and verification. RS256 uses an asymmetric key pair. RS256 is preferred for open APIs where multiple parties need to verify tokens without sharing a secret."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "Is it safe to use online JWT generators with production secrets?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "No. Never use actual production secrets in online tools. This tool generates tokens entirely in your browser, but for security best practices, use test secrets only."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "How do I add custom claims to a JWT payload?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Add any key-value pairs to the payload JSON. For example, adding 'role': 'admin' creates a custom claim."
                        }
                    }
                ]
            }
        ]
    });
});

// Session Token Analyzer
router.get('/session-token-analyzer', (req, res) => {
    const meta = getMeta('session-token-analyzer', req.lang);
    const baseStructuredData = res.locals.structuredData || [];

    res.render('tools/session-token-analyzer', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description,
        structuredData: [
            ...baseStructuredData,
            {
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                "name": "Session Token Analyzer",
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
                        "name": "How do I use a session token analyzer safely?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Use this tool only for debugging and testing with non-production tokens. Never paste actual production session tokens into online tools."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "What is the difference between an opaque token and a JWT?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "An opaque token is a random identifier that maps to server-side session data. A JWT is self-contained with claims encoded in the token itself."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "How can I tell if my session token is vulnerable to hijacking?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Indicators include: predictable token generation, missing Secure and HttpOnly flags, tokens in URLs, and missing SameSite attribute."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "What does invalid signature mean in a JWT analysis?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Invalid signature means the signature does not match what was computed using the provided secret, indicating tampering or wrong key."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "Why are HttpOnly and Secure flags critical for session cookies?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "HttpOnly prevents JavaScript access to the cookie, blocking XSS theft. Secure ensures cookies are only transmitted over HTTPS, preventing interception."
                        }
                    }
                ]
            }
        ]
    });
});

// API Key Scoping & Security Generator
router.get('/api-key-generator', (req, res) => {
    const meta = getMeta('api-key-generator', req.lang);
    const baseStructuredData = res.locals.structuredData || [];

    res.render('tools/api-key-generator', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description,
        structuredData: [
            ...baseStructuredData,
            {
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                "name": "API Key Scoping & Security Generator",
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
                        "name": "What is API key scoping and why is it important?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "API key scoping limits what actions a key can authorize, reducing the impact of key compromise by ensuring each key has only the permissions it needs."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "How do I securely store API keys in my database?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Never store the plaintext key. Compute a SHA-256 hash of the key and store only the hash. When a request arrives, hash the provided key and compare against the stored hash."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "Should I use UUID or a random string for my API tokens?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "UUID v4 provides 122 bits of entropy with a standardized format. Random strings with Base64URL encoding can provide higher entropy density. Both are suitable; choose based on your requirements."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "What is the difference between an API key and an OAuth token?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "API keys identify an application or project. OAuth tokens represent a user's authorization grant and include user-specific permissions. API keys are typically static; OAuth tokens expire and can be refreshed."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "How do I implement rate limiting based on these generated keys?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Extract the API key from incoming requests, look up its usage record, increment the counter, and check against limits. Return 429 with Retry-After if exceeded."
                        }
                    }
                ]
            }
        ]
    });
});

// Scoped API Key Generator
router.get('/scoped-api-key-generator', (req, res) => {
    const meta = getMeta('scoped-api-key-generator', req.lang);
    const baseStructuredData = res.locals.structuredData || [];

    res.render('tools/scoped-api-key-generator', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description,
        structuredData: [
            ...baseStructuredData,
            {
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                "name": "Scoped API Key Generator",
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
                        "name": "What is an API key scope?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "An API key scope defines what actions a key can authorize. For example, a key scoped to read can only perform read operations, not write or delete."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "Are these API keys safe to use in production?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "The keys generated use cryptographically secure random number generation and meet entropy requirements for production use. Always use proper secrets management for enterprise deployments."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "Why should I use a prefix like sk_live for my keys?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Prefixes help identify key type and environment at a glance, aid in key rotation management, and prevent accidental use of test keys in production systems."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "How do I implement scope validation on my server?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Extract the API key from requests, look up its stored hash and scope policy, verify expiration and revocation status, then check if the requested action matches the granted scopes."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "What is the recommended length for a secure API token?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "256 bits (32 bytes) of entropy provides sufficient security for most production API keys. Higher entropy is recommended for high-security or long-lived tokens."
                        }
                    }
                ]
            }
        ]
    });
});

// SSO Configuration & SAML/OIDC Tester
router.get('/sso-tester', (req, res) => {
    const meta = getMeta('sso-tester', req.lang);
    const baseStructuredData = res.locals.structuredData || [];

    res.render('tools/sso-tester', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description,
        structuredData: [
            ...baseStructuredData,
            {
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                "name": "SSO Configuration & SAML/OIDC Tester",
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
                        "name": "How do I troubleshoot a SAML 'Invalid Signature' error?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Verify you have the correct IdP certificate configured in your SP. Check that the certificate hasn't expired or been rotated. Ensure the XML was not modified after signing."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "What information is extracted from a SAML assertion?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Common extractions include: NameID, attributes (email, name, groups), Issuer, Conditions (timestamps, audience), and signature status."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "Why is my OIDC ID token failing validation?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Common causes: expired token, issuer mismatch, audience mismatch, or malformed JWT structure. Check that issuer and audience values match your OIDC provider configuration."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "Is my SSO data stored or logged during testing?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "No. All processing happens entirely in your browser. No SAML responses, OIDC tokens, certificates, or validation results are transmitted or stored externally."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "How do I check if my SAML response contains the correct attributes?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Paste the SAML response in the tool and examine the Decoded Attributes section. Verify that required attributes are present and contain expected values."
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

// LDAP Authentication Tester & Connection Debugger
router.get('/ldap-tester', (req, res) => {
    const meta = getMeta('ldap-tester', req.lang);
    const baseStructuredData = res.locals.structuredData || [];

    res.render('tools/ldap-tester', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description,
        structuredData: [
            ...baseStructuredData,
            {
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                "name": "LDAP Authentication Tester & Connection Debugger",
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
                        "name": "What is an LDAP authentication tester?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "An LDAP authentication tester is a tool that validates LDAP or Active Directory connection settings and credentials. This tool simulates the connection process to help you understand the workflow and identify configuration issues."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "How do I test an LDAP connection from a web browser?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Direct LDAP connections from browsers are blocked for security reasons. This tool provides educational simulation and configuration validation. For actual testing, use server-side scripts, ldapsearch command, or specialized LDAP testing tools."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "What is the difference between LDAP and LDAPS ports?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "LDAP (port 389) sends data in clear text. LDAPS (port 636) establishes an SSL/TLS connection immediately. STARTTLS (port 389) starts as plain LDAP and upgrades to TLS. Always prefer LDAPS or STARTTLS for security."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "Why is my LDAP bind failing with invalid credentials?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Error code 49 (Invalid Credentials) means the username or password is incorrect. Verify the Bind DN format is correct, the user account exists, and the password is accurate. For AD, try the UPN format instead of the full DN."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "How do I find my Base DN for LDAP testing?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "For Active Directory, the Base DN corresponds to your domain name: DC=example,DC=com for example.com. You can find this by checking the domain distinguishedName in AD Users and Computers, or by running dsquery commands on a domain controller."
                        }
                    }
                ]
            }
        ]
    });
});

// Free Online Voice Recorder
router.get('/voice-recorder', (req, res) => {
    const meta = getMeta('voice-recorder', req.lang);
    const baseStructuredData = res.locals.structuredData || [];

    res.render('tools/voice-recorder', {
        title: meta.title,
        pageTitle: meta.title,
        description: meta.description,
        structuredData: [
            ...baseStructuredData,
            {
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                "name": "Free Online Voice Recorder",
                "applicationCategory": "MultimediaApplication",
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
                        "name": "Is this online voice recorder safe and private?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Yes. This recorder operates 100% in your browser using client-side JavaScript APIs. Your audio data never leaves your device. No recordings are uploaded to any server."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "How long can I record audio for free?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "There is no time limit on recordings. You can record for as long as your device's memory and storage allow. However, very long recordings may consume significant browser memory."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "What file format does the voice recorder export?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "You can choose between MP3 (most compatible), WAV (lossless quality), or WebM (web-optimized). MP3 is recommended for general use as it plays on virtually any device."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "Do I need a special microphone to use this tool?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "No special microphone is required. Any microphone accessible to your browser will work, including built-in laptop microphones, USB headsets, or dedicated recording microphones."
                        }
                    },
                    {
                        "@type": "Question",
                        "name": "Can I use this recorder on my mobile phone browser?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Yes, the recorder works on mobile browsers including Safari on iOS and Chrome on Android. Some mobile browsers have format restrictions or require user gestures to initiate recording."
                        }
                    }
                ]
            }
        ]
    });
});

module.exports = router;
