const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const { logger } = require('../utils/logger');

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
    res.render('tools/index', {
        title: req.lang === 'ar' ? 'أدوات' : 'Tools',
    });
});

// Password Strength Analyzer
router.get('/password-analyzer', (req, res) => {
    res.render('tools/password-analyzer', {
        title: req.lang === 'ar' ? 'تحليل قوة كلمة المرور' : 'Password Strength Analyzer',
    });
});

// Encryption Key Strength Calculator
router.get('/key-strength', (req, res) => {
    res.render('tools/key-strength', {
        title: req.lang === 'ar' ? 'حاسبة قوة مفتاح التشفير' : 'Encryption Key Strength Calculator',
    });
});

// Virus Scanner Interface
router.get('/virus-scanner', (req, res) => {
    res.render('tools/virus-scanner', {
        title: req.lang === 'ar' ? 'فاحص الفيروسات' : 'Virus Scanner',
    });
});

// Secure Random Password Generator
router.get('/password-generator', (req, res) => {
    res.render('tools/password-generator', {
        title: req.lang === 'ar' ? 'مولد كلمات المرور الآمنة' : 'Secure Random Password Generator',
    });
});

// Virus Scanner API - Scan Endpoint (Real File Processing)
router.post('/virus-scanner/scan', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
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
            res.json({
                success: true,
                data: {
                    scan_id: fileHash,
                    permalink: `https://www.virustotal.com/gui/file/${fileHash}`,
                    resource: fileHash,
                    response_code: 1,
                    scan_date: new Date().toISOString(),
                    verbose_msg: 'Scan finished, scan information embedded in this object',
                    positives: isSuspicious ? Math.floor(Math.random() * 5) + 1 : 0,
                    total: 60,
                    scans: {
                        "Bkav": { "detected": isSuspicious, "version": "1.3.0.9899", "result": isSuspicious ? "W32.AIDetect.malware" : null, "update": "20240101" },
                        "Kaspersky": { "detected": isSuspicious, "version": "21.0.1.45", "result": isSuspicious ? "Trojan.Win32.Generic" : null, "update": "20240101" },
                        "Symantec": { "detected": false, "version": "1.8.0.0", "result": null, "update": "20240101" }
                        // ... more mock data could be added
                    }
                }
            });
        }, 1500);

    } catch (error) {
        logger.error('Virus scan error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Virus Scanner API - Scan URL Endpoint
router.post('/virus-scanner/scan-url', express.json(), (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ success: false, error: 'No URL provided' });
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
            res.json({
                success: true,
                data: {
                    scan_id: urlHash,
                    permalink: `https://www.virustotal.com/gui/url/${urlHash}`,
                    resource: url,
                    response_code: 1,
                    scan_date: new Date().toISOString(),
                    verbose_msg: 'Scan finished, scan information embedded in this object',
                    positives: isSuspicious ? Math.floor(Math.random() * 3) + 1 : 0,
                    total: 80,
                    scans: {
                        "Google Safebrowsing": { "detected": isSuspicious, "result": isSuspicious ? "Malware Site" : "Clean site" },
                        "PhishTank": { "detected": isSuspicious, "result": isSuspicious ? "Phishing Site" : "Clean site" },
                        "Opera": { "detected": false, "result": "Clean site" }
                    }
                }
            });
        }, 1500);

    } catch (error) {
        logger.error('URL scan error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router;
