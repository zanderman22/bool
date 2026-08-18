// Builds dist/bool.html: the whole game inlined into one file with no imports,
// no server and no build tooling. Open it from anywhere, AirDrop it to a phone,
// host it on any static host.
//
// The modules exist for maintainability; this exists so testing never needs a
// toolchain. It is a small dependency-free bundler: each module is wrapped in
// its own function scope and its exports returned as an object, so two modules
// are free to use the same local name (both hud.js and main.js define `$`).
// Flat concatenation would collide.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ENTRY = resolve(ROOT, 'src/main.js');

const modules = new Map();  // absolute path -> { src, id }
const order = [];
const visiting = new Set();

// Matches a whole-line import statement. The source only uses named and
// side-effect imports, which the assertions below enforce.
const IMPORT_RE = /^[ \t]*import\s+(?:([\w*{}\n\r\t, ]+?)\s+from\s+)?['"]([^'"]+)['"];?[ \t]*$/gm;

async function walk(file) {
  if (modules.has(file)) return;
  if (visiting.has(file)) throw new Error(`circular import involving ${relative(ROOT, file)}`);
  visiting.add(file);

  const src = await readFile(file, 'utf8');
  for (const [, , spec] of src.matchAll(IMPORT_RE)) {
    if (!spec.startsWith('.')) throw new Error(`bare import "${spec}" in ${relative(ROOT, file)}`);
    await walk(resolve(dirname(file), spec));
  }

  visiting.delete(file);
  modules.set(file, { src, id: `__m${modules.size}` });
  order.push(file);
}

/** Every name a module exports. */
function exportedNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/^\s*export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    names.add(m[1]);
  }
  for (const m of src.matchAll(/^\s*export\s*\{([^}]*)\}\s*;?\s*$/gm)) {
    for (const part of m[1].split(',')) {
      const t = part.trim();
      if (!t) continue;
      // `a as b` exports under b.
      const as = t.split(/\s+as\s+/);
      names.add((as[1] || as[0]).trim());
    }
  }
  if (/^\s*export\s+default\b/m.test(src)) throw new Error('default exports are not supported');
  return [...names];
}

/** Rewrite a module body: imports become destructuring, exports become plain. */
function transform(src, file) {
  return src
    .replace(IMPORT_RE, (whole, clause, spec) => {
      if (!clause) return ''; // side-effect only
      const target = modules.get(resolve(dirname(file), spec));
      const c = clause.trim();
      if (c.startsWith('{')) return `const ${c.replace(/\s+as\s+/g, ': ')} = ${target.id};`;
      if (c.startsWith('*')) return `const ${c.replace(/^\*\s*as\s*/, '')} = ${target.id};`;
      throw new Error(`default import not supported: "${c}" in ${relative(ROOT, file)}`);
    })
    .replace(/^(\s*)export\s*\{[^}]*\}\s*;?\s*$/gm, '')
    .replace(/^(\s*)export\s+(const|let|var|function|class|async)\b/gm, '$1$2')
    .trim();
}

const build = async () => {
  await walk(ENTRY);

  const chunks = order.map((file) => {
    const { src, id } = modules.get(file);
    const names = exportedNames(src);
    const body = transform(src, file);
    const label = relative(ROOT, file);
    return `\n// ===== ${label} ${'='.repeat(Math.max(0, 56 - label.length))}\n` +
      `const ${id} = (() => {\n${body}\nreturn { ${names.join(', ')} };\n})();`;
  });

  const html = await readFile(resolve(ROOT, 'index.html'), 'utf8');
  const css = await readFile(resolve(ROOT, 'src/styles.css'), 'utf8');

  const out = html
    .replace(/<link rel="stylesheet"[^>]*>/, `<style>\n${css}\n</style>`)
    .replace(
      /<script type="module"[^>]*><\/script>/,
      `<script>\n(() => {\n'use strict';\n${chunks.join('\n')}\n})();\n</script>`,
    );

  await mkdir(resolve(ROOT, 'dist'), { recursive: true });
  await writeFile(resolve(ROOT, 'dist/bool.html'), out);

  const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
  console.log(`\n  dist/bool.html  ${kb} kB  (${order.length} modules inlined)\n`);
};

build();
