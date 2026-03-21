const fs = require('fs/promises');
const path = require('path');

const blogIndexPath = path.join(__dirname, '../data/blog/index.json');
const blogArticlesDir = path.join(__dirname, '../data/blog/articles');

let blogIndexPromise = null;
let blogArticleCache = new Map();

const loadBlogIndex = async () => {
  if (!blogIndexPromise) {
    blogIndexPromise = fs.readFile(blogIndexPath, 'utf8')
      .then((contents) => JSON.parse(contents))
      .then((items) => {
        const bySlug = new Map(items.map((item) => [item.slug, item]));
        return { items, bySlug };
      })
      .catch((error) => {
        blogIndexPromise = null;
        throw error;
      });
  }

  return blogIndexPromise;
};

const getArticleIndex = async () => {
  const { items } = await loadBlogIndex();
  return items;
};

const getArticleBySlug = async (slug) => {
  if (!slug) {
    return null;
  }

  if (blogArticleCache.has(slug)) {
    return blogArticleCache.get(slug);
  }

  const { bySlug } = await loadBlogIndex();
  const articleMeta = bySlug.get(slug);
  if (!articleMeta) {
    return null;
  }

  const articlePath = path.join(blogArticlesDir, `${articleMeta.storageKey}.json`);
  const article = await fs.readFile(articlePath, 'utf8').then((contents) => JSON.parse(contents));
  blogArticleCache.set(slug, article);
  return article;
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
