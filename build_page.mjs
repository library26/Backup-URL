// build_page.mjs — compile template.html into index.html with SEO prerender.
// Reads the obfuscated catalog payload from data.js (produced by build_catalog.mjs),
// renders the first PAGE_SIZE cards of the "All" view as static HTML, and injects
// them into the <!--SEO_PRERENDER--> slot so crawlers see real titles/thumbnails
// while share URLs stay obfuscated (data-enc-url, decoded only by JS at runtime).
//
// Usage: node build_page.mjs
// Pipeline: node build_catalog.mjs  (when shares change)  →  node build_page.mjs

import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname);
const TEMPLATE_FILE = path.join(PROJECT_ROOT, 'template.html');
const DATA_FILE = path.join(PROJECT_ROOT, 'data.js');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'index.html');
const PAGE_SIZE = 48;
const SLOT = '<!--SEO_PRERENDER-->';

// zh labels for prerendered group headers (kept in sync with template CATEGORIES)
const GROUP_LABELS_ZH = {
  collections: '热门资源',
  myfans: 'MyFans/CandFans',
  onlyfans: 'OnlyFans',
  fc2: 'FC2 PPV',
  twitter: 'Twitter 福利姬',
  cosplay: 'Cosplay 同人',
  cn: '华语名优',
  jav: '日本 AV',
  aidrama: 'AI 短剧'
};
const LATEST_SUFFIX_ZH = '最新整理';

function loadCatalog() {
  const source = fs.readFileSync(DATA_FILE, 'utf8');
  const match = source.match(/decodePayload\('([^']+)'\)/);
  if (!match) throw new Error('无法在 data.js 中定位混淆 payload。');
  const b64 = match[1].split('').reverse().join('');
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function resourceTime(resource) {
  return Number(resource.createdAt || resource.updatedAt || 0);
}

// Mirror the page's "All" view: collections first (by categoryOrder),
// then per-category groups sorted by latest.
function buildAllGroups(resources) {
  const collections = resources
    .filter((r) => r.isCollection)
    .sort((a, b) => (a.categoryOrder || 999) - (b.categoryOrder || 999));

  const categoryKeys = [...new Set(resources.filter((r) => !r.isCollection).map((r) => r.category))]
    .sort((a, b) => {
      const orderA = resources.find((r) => r.category === a)?.categoryOrder || 999;
      const orderB = resources.find((r) => r.category === b)?.categoryOrder || 999;
      return orderA - orderB;
    });

  const groups = [];
  if (collections.length) groups.push({ key: 'collections', items: collections });
  for (const key of categoryKeys) {
    const items = resources
      .filter((r) => !r.isCollection && r.category === key)
      .sort((a, b) => resourceTime(b) - resourceTime(a));
    if (items.length) groups.push({ key, items });
  }
  return groups;
}

function renderCard(resource) {
  const title = resource.titles?.zh || resource.titles?.en || resource.original || '';
  const preview = resource.thumb
    ? `<img src="${escapeHtml(resource.thumb)}" class="preview-img" alt="${escapeHtml(title)}" loading="lazy" width="42" height="42">`
    : `<span class="preview-fallback" style="--tile-hue:${Number(resource.hue) || 280}">${escapeHtml(resource.placeholder || resource.category || '•')}</span>`;
  return `<a href="#" data-enc-url="${escapeHtml(resource.encodedUrl || '')}" class="resource-card" rel="noopener">
      <div class="preview-box">${preview}</div>
      <div class="card-body"><div class="card-title">${escapeHtml(title)}</div></div>
    </a>`;
}

function renderPrerender(resources) {
  const html = [];
  let remaining = PAGE_SIZE;
  let count = 0;
  for (const group of buildAllGroups(resources)) {
    if (remaining <= 0) break;
    const visible = group.items.slice(0, remaining);
    if (!visible.length) continue;
    const label = GROUP_LABELS_ZH[group.key] || group.key;
    const suffix = group.key === 'collections' ? '' : `<span>${LATEST_SUFFIX_ZH}</span>`;
    html.push(`<div class="section-group-title"><strong>${escapeHtml(label)}</strong>${suffix}</div>`);
    html.push(...visible.map(renderCard));
    remaining -= visible.length;
    count += visible.length;
  }
  return { html: html.join('\n      '), count };
}

function main() {
  const template = fs.readFileSync(TEMPLATE_FILE, 'utf8');
  if (!template.includes(SLOT)) {
    throw new Error(`template.html 中缺少预渲染槽位 ${SLOT}`);
  }
  const resources = loadCatalog();
  const { html, count } = renderPrerender(resources);
  fs.writeFileSync(OUTPUT_FILE, template.replace(SLOT, html));
  console.log(`✓ 已编译 index.html：目录共 ${resources.length} 条，静态预渲染 ${count} 张卡片。`);
}

main();
