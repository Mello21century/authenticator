// Packs the web build + bridge into an unpacked MV3 extension at dist/ (load it from chrome://extensions).
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const out = new URL('./dist/', import.meta.url);
rmSync(out, { recursive: true, force: true });
cpSync(new URL('../web/dist/', import.meta.url), out, { recursive: true });
for (const f of ['manifest.webmanifest', 'index.html', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) rmSync(new URL(f, out), { force: true });
cpSync(new URL('./icons/', import.meta.url), out, { recursive: true });
cpSync(new URL('./src/bridge.js', import.meta.url), new URL('bridge.js', out));
cpSync(new URL('./src/background.js', import.meta.url), new URL('background.js', out));
cpSync(new URL('./manifest.json', import.meta.url), new URL('manifest.json', out));

const html = readFileSync(new URL('../web/dist/index.html', import.meta.url), 'utf8')
  .replace(/\s*<link rel="(manifest|apple-touch-icon)"[^>]*>/g, '')
  .replace('<script type="module"', '<script src="./bridge.js"></script>\n    <script type="module"');
if (!html.includes('bridge.js')) throw new Error('could not inject bridge.js into panel.html');
writeFileSync(new URL('panel.html', out), html);
console.log('extension built -> apps/extension/dist');
