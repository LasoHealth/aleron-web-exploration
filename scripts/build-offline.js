// Builds self-contained copies of every screen into dist/.
//
// Why this exists: the screens link the canonical tokens.css and
// components.css by URL, which is the whole point (they cannot silently
// drift from the design system, and the URL also serves the real Hanken
// Grotesk). That is correct for authoring and wrong for a demo on hotel
// wifi, or for publishing to a surface that blocks external stylesheets.
//
// So: author against the URL, demo from dist/. Every <link> becomes an
// inline <style>, in the same order, with nothing else changed.
//
//   node scripts/build-offline.js            build
//   node scripts/build-offline.js --refresh  re-fetch the canonical CSS first
//
// The fetched CSS is cached in scripts/.cache/ and is NOT committed, so it
// can never go stale in git. Refresh it whenever the design system moves.

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const CACHE = path.join(__dirname, '.cache');

const BASE = 'https://kito-laso.github.io/aleron-canonical-documents/product-design-system/';
const REMOTE = { 'tokens.css': BASE + 'tokens.css', 'components.css': BASE + 'components.css' };
const VERSIONS = ['v0', 'v1', 'v2', 'v3'];

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(url + ' -> HTTP ' + res.statusCode));
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

async function canonicalCss(refresh) {
  fs.mkdirSync(CACHE, { recursive: true });
  const out = {};
  for (const [name, url] of Object.entries(REMOTE)) {
    const cached = path.join(CACHE, name);
    if (refresh || !fs.existsSync(cached)) {
      process.stdout.write('fetching ' + name + ' ... ');
      fs.writeFileSync(cached, await get(url), 'utf8');
      console.log('ok');
    }
    let css = fs.readFileSync(cached, 'utf8');
    // The @font-face points at a path relative to the remote stylesheet. Once
    // inlined, that path resolves against the local file and 404s, and some
    // publish targets block external font hosts outright. Drop the rule and
    // fall back to the stack tokens.css already declares after it.
    css = css.replace(/@font-face\s*\{[^}]*\}\s*/g, '');
    out[name] = css;
  }
  return out;
}

// Replace each <link rel=stylesheet> with the stylesheet it points at, in
// place, so load order is preserved exactly.
function inline(html, file, canon) {
  return html.replace(
    /[ \t]*<link rel="stylesheet" href="([^"]+)">\n?/g,
    (whole, href) => {
      let css;
      if (href.startsWith('http')) {
        const name = href.split('/').pop();
        css = canon[name];
      } else {
        const local = path.resolve(path.dirname(file), href);
        css = fs.existsSync(local) ? fs.readFileSync(local, 'utf8') : null;
      }
      if (css == null) {
        console.warn('  ! unresolved stylesheet, left as a link: ' + href);
        return whole;
      }
      return '<style>/* inlined from ' + href + ' */\n' + css + '\n</style>\n';
    }
  );
}

function screens() {
  const found = [path.join(ROOT, 'index.html')].filter(fs.existsSync);
  for (const v of VERSIONS) {
    const dir = path.join(ROOT, v);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.html')) found.push(path.join(dir, f));
    }
  }
  return found;
}

(async () => {
  const refresh = process.argv.includes('--refresh');
  const canon = await canonicalCss(refresh);

  fs.rmSync(DIST, { recursive: true, force: true });
  let n = 0;
  for (const file of screens()) {
    const rel = path.relative(ROOT, file);
    const html = inline(fs.readFileSync(file, 'utf8'), file, canon);
    const target = path.join(DIST, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, html, 'utf8');
    n++;
  }
  console.log('built ' + n + ' self-contained screens into dist/');
  console.log('relative links between screens still work, so dist/index.html opens the whole set.');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
