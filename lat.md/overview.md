# Overview

MasarWeb is an Arabic RTL web proxy with Express.js backend and EJS templates. It proxies web traffic while rewriting URLs and content for Arabic display.

Stack: Backend is Express.js (src/app.js). Templates are EJS (server-rendered). Sessions use Redis via connect-redis. Proxy is http-proxy-middleware. Logging uses Winston.

Project structure: arabic-web-proxy/ contains src/ (Express app modules), views/ (EJS templates), public/ (static assets), impeccable/ (separate Bun project - unrelated), and lat.md/ (this knowledge base).

This repo contains TWO unrelated projects: Root is MasarWeb proxy (Node.js). impeccable/ is AI agent design skills (Bun) - completely separate.

Commands: npm start runs production. npm run dev uses nodemon for development. npm run dev:frontend runs Vite dev server.

Modules: proxy/proxyRouter.js handles HTTP/HTTPS proxy. security/security.js handles SSRF and rate limiting. session/sessionManager.js handles Redis sessions. rewriter/urlRewriter.js handles content rewriting. admin/adminRouter.js handles admin API. tools/toolsRouter.js handles security tools.

Blog rendering: `views/blog.ejs` and `views/article.ejs` always use `dir="rtl"` so blog index and article detail pages are consistently right-to-left for all languages.

Homepage rendering: `/` always renders using Arabic locale (`currentLang: 'ar'`, `dir: 'rtl'`) so the homepage UI is Arabic.
