import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PROJECT_ROOT = path.resolve(import.meta.dirname);
const SOURCE_ROOT = '/Users/weichangjiang/AI-Projects/资源整理/热门资源/✅已整理';
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'data.js');
const THUMB_DIR = path.join(PROJECT_ROOT, 'thumbnails');
const THUMB_SIZE = 160;
const FORCE_REFRESH = process.argv.includes('--refresh');
const CATEGORY_MAP = {
  '[01] MyFans CandFans Fantia': {
    key: 'myfans', order: 1, fallback: 'thumbnails/d86781b4c260630311aeb61aa98359e0.jpg', icon: '◆'
  },
  '[02] OnlyFans Fansly オンリーファンズ 온리팬스': {
    key: 'onlyfans', order: 2, fallback: 'thumbnails/93f4692558a136fc580845eb4b9a3109.jpg', icon: '◆'
  },
  '[03] FC2 PPV 個人作品 개인작품': {
    key: 'fc2', order: 3, fallback: 'thumbnails/9b31efea74e54fdaf3d4e090c770a352.jpg', icon: '◆'
  },
  '[04] Twitter 福利姬 网黄 私拍流出 유출': {
    key: 'twitter', order: 4, fallback: 'thumbnails/5f0384db84ba71cbd8797b44c12907c9.jpg', icon: '◆'
  },
  '[05] Cosplay同人写真 コスプレ 코스プレ': {
    key: 'cosplay', order: 5, fallback: 'thumbnails/af3f10883bb52a5cc9570ffa7d1faa38.jpg', icon: '◇'
  },
  '[06] 华语独立名优 華人クリエイター 중화권스타': {
    key: 'cn', order: 6, fallback: 'thumbnails/e9ed601520cc3d2f9a0691a0d4569d35.jpg', icon: '◆'
  },
  '[07] 日本AV JAV 일본AV': {
    key: 'jav', order: 7, fallback: 'thumbnails/309371d1e5629e6ae5df6b2c1dfa32e9.jpg', icon: '◆'
  }
};

const TITLE_OVERRIDES = {
  'HongKong Doll 玩偶姐姐': {
    en: 'HongKong Doll · 玩偶姐姐',
    zh: '玩偶姐姐 · HongKong Doll',
    'zh-hant': '玩偶姐姐 · HongKong Doll',
    ja: '香港ドール · HongKong Doll',
    ko: '홍콩돌 · HongKong Doll'
  }
};

const legacyResources = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'data.json'), 'utf8')).resources;
const LEGACY_COLLECTIONS = {
  myfans: legacyResources[0],
  twitter: legacyResources[1],
  cosplay: legacyResources[2],
  fc2: legacyResources[3],
  onlyfans: legacyResources[4],
  cn: legacyResources[5],
  jav: legacyResources[6]
};
const COLLECTION_TITLES = {
  myfans: LEGACY_COLLECTIONS.myfans.titles,
  twitter: LEGACY_COLLECTIONS.twitter.titles,
  cosplay: LEGACY_COLLECTIONS.cosplay.titles,
  fc2: LEGACY_COLLECTIONS.fc2.titles,
  onlyfans: LEGACY_COLLECTIONS.onlyfans.titles,
  cn: LEGACY_COLLECTIONS.cn.titles,
  jav: LEGACY_COLLECTIONS.jav.titles
};

const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function listShareFiles() {
  const result = spawnSync('find', [SOURCE_ROOT, '-name', '分享信息.json', '-type', 'f', '-print0'], {
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error('无法读取分享信息文件。');
  return result.stdout.toString('utf8').split('\0').filter(Boolean);
}

function normalizeTitle(name) {
  return name.replace(/^【No\.[^】]+】\s*/, '').replace(/\s+/g, ' ').trim();
}

function obfuscateUrl(url) {
  return Buffer.from(url, 'utf8').toString('base64');
}

function findImages(dir, depth = 0, images = []) {
  if (depth > 4 || images.length > 120) return images;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return images;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === '分享信息.json' || entry.name === '缩略图索引.json') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findImages(fullPath, depth + 1, images);
    } else if (entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase())) {
      try {
        if (fs.statSync(fullPath).size > 12 * 1024) images.push(fullPath);
      } catch {}
    }
  }
  return images;
}

function candidateScore(filePath) {
  const name = path.basename(filePath).toLowerCase();
  let score = 0;
  if (/cover|preview|thumb|缩略图/.test(name)) score += 100;
  if (/grid|contact|sample/.test(name)) score -= 20;
  if (/\.mp4\.jpg$/.test(name)) score -= 8;
  return score;
}

function makeSquareThumbnail(sourcePath, outputPath) {
  const result = spawnSync('sips', [
    '--cropToHeightWidth', String(THUMB_SIZE), String(THUMB_SIZE),
    '-s', 'format', 'jpeg', '-s', 'formatOptions', '75',
    sourcePath, '--out', outputPath
  ], { encoding: 'utf8' });
  return result.status === 0 && fs.existsSync(outputPath);
}

function isAsciiNameToken(value) {
  return /^[A-Za-z.'-]+$/.test(value);
}

function buildJavTitleSet(original) {
  const parts = original.split(/\s+/).filter(Boolean);
  const romanStart = parts.length >= 2 && isAsciiNameToken(parts.at(-1)) && isAsciiNameToken(parts.at(-2))
    ? parts.length - 2
    : parts.length - 1;
  const japaneseName = parts[0];
  const romanName = parts.slice(romanStart).join(' ');
  const chineseNames = parts.slice(1, romanStart).filter(part => /[\u3400-\u9fff]/.test(part));
  const simplified = chineseNames[0];
  const traditional = chineseNames[1] || simplified;

  if (!japaneseName || !romanName || !simplified) {
    return { en: original, zh: original, 'zh-hant': original, ja: original, ko: original };
  }

  return {
    en: `${romanName} · ${japaneseName}`,
    zh: `${simplified} · ${japaneseName} / ${romanName}`,
    'zh-hant': `${traditional} · ${japaneseName} / ${romanName}`,
    ja: `${japaneseName} · ${romanName}`,
    ko: `${japaneseName} · ${romanName}`
  };
}

function buildTitleSet(original, category) {
  if (TITLE_OVERRIDES[original]) return TITLE_OVERRIDES[original];
  if (category === 'jav') return buildJavTitleSet(original);
  return { en: original, zh: original, 'zh-hant': original, ja: original, ko: original };
}

function main() {
  if (FORCE_REFRESH) fs.rmSync(THUMB_DIR, { recursive: true, force: true });
  fs.mkdirSync(THUMB_DIR, { recursive: true });
  const resources = [];
  let thumbnailCount = 0;

  for (const infoPath of listShareFiles()) {
    const relativePath = path.relative(SOURCE_ROOT, infoPath);
    const [categoryName] = relativePath.split(path.sep);
    const category = CATEGORY_MAP[categoryName];
    if (!category) continue;

    let info;
    try {
      info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
    } catch {
      continue;
    }
    if (typeof info.share_url !== 'string' || !info.share_url.startsWith('https://')) continue;

    const folder = path.dirname(infoPath);
    const original = normalizeTitle(info.folder_name || path.basename(folder));
    const titles = buildTitleSet(original, category.key);
    const id = crypto.createHash('sha1').update(info.share_url).digest('hex').slice(0, 16);
    const thumbFile = `${id}.jpg`;
    const thumbPath = path.join(THUMB_DIR, thumbFile);

    if (!fs.existsSync(thumbPath)) {
      const images = findImages(folder).sort((a, b) => candidateScore(b) - candidateScore(a) || a.localeCompare(b));
      if (images[0] && makeSquareThumbnail(images[0], thumbPath)) thumbnailCount++;
    }

    resources.push({
      id,
      original,
      titles,
      searchTitles: [...new Set([original, ...Object.values(titles)])],
      category: category.key,
      categoryOrder: category.order,
      encodedUrl: obfuscateUrl(info.share_url),
      thumb: fs.existsSync(thumbPath) ? `demo_v5_thumbnails/${thumbFile}` : '',
      icon: category.icon,
      placeholder: id.slice(-2).toUpperCase(),
      hue: Number.parseInt(id.slice(0, 6), 16) % 360
    });
  }

  for (const [categoryName, category] of Object.entries(CATEGORY_MAP)) {
    const infoPath = path.join(SOURCE_ROOT, categoryName, '分享信息.json');
    const legacyCollection = LEGACY_COLLECTIONS[category.key];
    const info = fs.existsSync(infoPath) ? JSON.parse(fs.readFileSync(infoPath, 'utf8')) : null;
    const preferredShare = info?.shares?.find((share) => share.status === 'OK' && typeof share.share_url === 'string')
      ?? (legacyCollection?.url ? { share_url: legacyCollection.url } : null);
    if (!preferredShare) continue;
    const id = crypto.createHash('sha1').update(preferredShare.share_url).digest('hex').slice(0, 16);
    const titles = COLLECTION_TITLES[category.key];
    resources.push({
      id,
      original: titles.en,
      titles,
      searchTitles: Object.values(titles),
      category: category.key,
      categoryOrder: category.order,
      encodedUrl: obfuscateUrl(preferredShare.share_url),
      thumb: legacyCollection?.thumbnail || category.fallback,
      icon: legacyCollection?.status_icon || category.icon,
      hue: Number.parseInt(id.slice(0, 6), 16) % 360,
      isCollection: true
    });
  }

  resources.sort((a, b) => a.categoryOrder - b.categoryOrder || Number(Boolean(b.isCollection)) - Number(Boolean(a.isCollection)) || a.original.localeCompare(b.original, 'zh-Hans-CN'));
  const output = `window.DEMO_RESOURCES = ${JSON.stringify(resources)};\n`;
  fs.writeFileSync(OUTPUT_FILE, output);
  console.log(`已生成 ${resources.length} 条分享数据；本次新增 ${thumbnailCount} 张方形缩略图。`);
}

main();
