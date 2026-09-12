import { createHash } from 'node:crypto';

/**
 * TypeScript port of WPInstant\DomEngine::compute_structure_hash()
 * (packages/wp-plugin/includes/transformer/class-dom-engine.php).
 *
 * The two implementations MUST stay byte-identical in behavior: the plugin
 * computes the hash over raw origin HTML and sends it as `structure_hash`;
 * the edge computes it over fetched raw HTML when no hash was supplied and
 * over crawl-discovered pages. Both read the same KV key space
 * (`template:{site}:{hash}:{viewport}`), so any divergence only costs a
 * missed dedup (safe), never a wrong artifact.
 *
 * One deliberate improvement over the PHP original, applied on BOTH sides:
 * stylesheet/script URLs are stripped of query strings and fragments before
 * hashing. `?ver=` bumps and cache-busters otherwise make identical
 * templates hash differently and defeat dedup entirely. Paths are kept
 * verbatim, so per-page bundles (e.g. Elementor `post-{id}.css`) still
 * produce distinct hashes and are never wrongly shared.
 */

function decodeEntities(html: string): string {
  return html
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const cp = parseInt(dec, 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : _m;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : _m;
    })
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');
}

/** Strip query string and fragment from an asset URL (path kept verbatim). */
export function normalizeAssetUrl(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

function md5hex(text: string): string {
  return createHash('md5').update(text, 'utf8').digest('hex');
}

export function computeStructureHash(html: string): string {
  const decoded = decodeEntities(html);

  const tags: string[] = [];
  const tagRe = /<\s*([a-zA-Z][\w:-]*)\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(decoded)) !== null) tags.push(m[1]);

  const ids: string[] = [];
  const idRe = /\bid\s*=\s*["']([^"']+)["']/gi;
  while ((m = idRe.exec(decoded)) !== null) ids.push(m[1]);

  const classes: string[] = [];
  const classRe = /\bclass\s*=\s*["']([^"']+)["']/gi;
  while ((m = classRe.exec(decoded)) !== null) classes.push(m[1]);

  const stylesheets: string[] = [];
  const cssRe = /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi;
  while ((m = cssRe.exec(decoded)) !== null) stylesheets.push(normalizeAssetUrl(m[1]));

  const scripts: string[] = [];
  const jsRe = /<script[^>]*src=["']([^"']+)["']/gi;
  while ((m = jsRe.exec(decoded)) !== null) scripts.push(normalizeAssetUrl(m[1]));

  const cleanClasses: string[] = [];
  for (const clsStr of classes) {
    for (const cls of clsStr.trim().split(/\s+/)) {
      const c = cls.replace(/\d.*$/, '').trim();
      if (c !== '') cleanClasses.push(c);
    }
  }

  const cleanIds = ids.map((id) => id.replace(/\d.*$/, ''));
  const cleanTags = tags.map((t) => `<${t.toLowerCase()}>`);

  // Match PHP array_filter() (drops all falsy values) exactly.
  const all = [...cleanIds, ...cleanClasses, ...stylesheets, ...scripts, ...cleanTags].filter(
    (v) => v !== '' && v !== '0'
  );
  const unique = [...new Set(all)].sort();

  return md5hex(unique.join(' '));
}
