// Build a standalone single-file dist/index.html (no server / npm needed).
// Concatenates all ES modules into one classic <script> by stripping
// import/export statements (every export in this project is inline).
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Dependency-safe order (base classes before usage; main last)
const ORDER = [
  'constants', 'utils', 'Input', 'Audio', 'Camera', 'Particles',
  'Background', 'Projectile', 'Collectible', 'Enemy', 'Boss',
  'Player', 'Level', 'LevelData', 'UI', 'Game', 'main',
];

function strip(code) {
  // Remove import statements (single- or multi-line: `import ... from '...';`)
  code = code.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '');
  // Drop the leading `export ` keyword from inline exports
  code = code.replace(/^(\s*)export\s+/gm, '$1');
  return code;
}

let bundle = '';
for (const name of ORDER) {
  const code = readFileSync(join(root, 'src', `${name}.js`), 'utf8');
  bundle += `\n// ===================== ${name}.js =====================\n`;
  bundle += strip(code) + '\n';
}

const wrapped = `(function () {\n'use strict';\n${bundle}\n})();`;

// Inline into the HTML shell, replacing the module script tag
let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html.replace(
  /<script type="module"[^>]*><\/script>/,
  `<script>\n${wrapped}\n</script>`
);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'index.html'), html);
writeFileSync(join(root, 'dist', 'bundle.js'), wrapped);

console.log('✓ Built dist/index.html  (' + (html.length / 1024).toFixed(1) + ' KB)');
console.log('✓ Built dist/bundle.js   (' + (wrapped.length / 1024).toFixed(1) + ' KB)');
