const fs = require('fs/promises');
const path = require('path');

const blogIndexPath = path.join(__dirname, '../data/blog/index.json');
const blogArticlesDir = path.join(__dirname, '../data/blog/articles');

let blogIndexPromise = null;
let blogArticleCache = new Map();

const loadBlogIndex = async (lang = 'en') => {
  const cacheKey = `index:${lang}`;
  if (blogIndexPromise && blogIndexPromise.lang === lang) {
    return blogIndexPromise.data;
  }

  const pathsToTry = [
    path.join(__dirname, `../data/blog/index-${lang}.json`),
    blogIndexPath
  ];

  for (const p of pathsToTry) {
    try {
      const items = await fs.readFile(p, 'utf8').then((contents) => JSON.parse(contents));
      const bySlug = new Map(items.map((item) => [item.slug, item]));
      blogIndexPromise = { lang, data: { items, bySlug } };
      return blogIndexPromise.data;
    } catch (err) {
      // Continue to next path
    }
  }

  throw new Error('Could not load blog index');
};

const getArticleIndex = async (lang = 'en') => {
  const { items } = await loadBlogIndex(lang);
  return items;
};

const getArticleBySlug = async (slug, lang = 'en') => {
  if (!slug) {
    return null;
  }

  const cacheKey = `${slug}:${lang}`;
  if (blogArticleCache.has(cacheKey)) {
    return blogArticleCache.get(cacheKey);
  }

  const { bySlug } = await loadBlogIndex(lang);
  const articleMeta = bySlug.get(slug);
  if (!articleMeta) {
    return null;
  }

  // Try language-specific file first, then fall back to default
  const pathsToTry = [
    path.join(blogArticlesDir, `${articleMeta.storageKey}-${lang}.json`),
    path.join(blogArticlesDir, `${articleMeta.storageKey}.json`)
  ];

  for (const articlePath of pathsToTry) {
    try {
      const article = await fs.readFile(articlePath, 'utf8').then((contents) => JSON.parse(contents));
      blogArticleCache.set(cacheKey, article);
      return article;
    } catch (err) {
      // Continue to next path
    }
  }

  return null;
};

const getContentStats = async () => {
  const { items } = await loadBlogIndex();
  return {
    articleCount: items.length,
    cachedArticles: blogArticleCache.size
  };
};

module.exports = {
  getArticleIndex,
  getArticleBySlug,
  getContentStats
};
