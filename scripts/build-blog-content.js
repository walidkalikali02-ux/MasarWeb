const fs = require('fs');
const path = require('path');

const sourceArticles = require('../src/data/articles');

const outputDir = path.join(__dirname, '../src/data/blog');
const outputArticlesDir = path.join(outputDir, 'articles');

const compareEntries = (left, right) => {
  const leftDate = new Date(left.date).getTime();
  const rightDate = new Date(right.date).getTime();

  if (rightDate !== leftDate) {
    return rightDate - leftDate;
  }

  return right.position - left.position;
};

const buildCanonicalArticles = () => {
  const bySlug = new Map();

  sourceArticles.forEach((article, position) => {
    const candidate = { ...article, position };
    const current = bySlug.get(article.slug);

    if (!current || compareEntries(current, candidate) > 0) {
      bySlug.set(article.slug, candidate);
    }
  });

  return Array.from(bySlug.values()).sort(compareEntries);
};

const writeBlogContent = () => {
  const canonicalArticles = buildCanonicalArticles();

  fs.mkdirSync(outputArticlesDir, { recursive: true });

  for (const entry of fs.readdirSync(outputArticlesDir)) {
    fs.unlinkSync(path.join(outputArticlesDir, entry));
  }

  const metadata = canonicalArticles.map((article) => {
    const storageKey = article.slug;
    const record = {
      id: article.id,
      slug: article.slug,
      title: article.title,
      excerpt: article.excerpt,
      date: article.date,
      storageKey
    };

    fs.writeFileSync(
      path.join(outputArticlesDir, `${storageKey}.json`),
      JSON.stringify({
        id: article.id,
        slug: article.slug,
        title: article.title,
        excerpt: article.excerpt,
        date: article.date,
        content: article.content
      })
    );

    return record;
  });

  fs.writeFileSync(path.join(outputDir, 'index.json'), JSON.stringify(metadata));

  const duplicateCount = sourceArticles.length - metadata.length;
  console.log(JSON.stringify({
    sourceArticles: sourceArticles.length,
    canonicalArticles: metadata.length,
    duplicateSlugsRemoved: duplicateCount
  }, null, 2));
};

writeBlogContent();
