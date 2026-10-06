import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = root;
const importPattern = /^import\s*\{([\s\S]*?)\}\s*from\s*['"](.+?)['"];\s*/gm;
function bundle(entry, offline = false) {
  const modules = new Map(), pending = new Set(), chunks = [];
  function visit(name) {
    if (modules.has(name)) return modules.get(name);
    if (pending.has(name)) throw new Error(`Circular dependency: ${name}`);
    pending.add(name);
    let source = fs.readFileSync(path.join(root, 'dist', name), 'utf8');
    source = source.replace(importPattern, (_, names, specifier) => {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(name), specifier));
      const key = visit(target);
      return `const { ${names.trim()} } = ${key};\n`;
    });
    if (offline) source = source.replace(/new Worker\(new URL\("\.\/(cfd-worker|mesh-worker)\.js", import\.meta\.url\), \{ type: "module" \}\)/g, (_, worker) => `createOfflineWorker("${worker}.js")`);
    const exports = [];
    source = source.replace(/^export\s+(?=(?:const|function\*?|class)\s+)(const|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm, (_, kind, symbol) => {
      exports.push(symbol); return `${kind} ${symbol}`;
    });
    if (/^import\s|^export\s|import\.meta/m.test(source)) throw new Error(`Unsupported module syntax: ${name}`);
    const key = `m${modules.size}`;
    modules.set(name, key); pending.delete(name);
    chunks.push(`const ${key} = (() => {\n${source}\nreturn { ${exports.join(', ')} };\n})();`);
    return key;
  }
  visit(entry);
  const code = `'use strict';\n${chunks.join('\n')}`;
  new vm.Script(code, {filename: entry});
  return code;
}
const workers = Object.fromEntries(['cfd-worker.js', 'mesh-worker.js'].map(name => [name, bundle(name)]));
const boot = `const offlineWorkerSources = ${JSON.stringify(workers)};
const offlineWorkerURLs = new Map();
function createOfflineWorker(name) {
  if (!offlineWorkerURLs.has(name)) offlineWorkerURLs.set(name, URL.createObjectURL(new Blob([offlineWorkerSources[name]], {type:'text/javascript'})));
  return new Worker(offlineWorkerURLs.get(name));
}
window.addEventListener('unload', () => { for (const url of offlineWorkerURLs.values()) URL.revokeObjectURL(url); });
`;
const app = `${boot}\n${bundle('app.js', true)}`;
new vm.Script(app);
let html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="styles.css">', () => `<style>${fs.readFileSync(path.join(root, 'dist/styles.css'), 'utf8')}</style>`);
html = html.replace('<script type="module" src="app.js"></script>', () => `<script>${app.replace(/<\/script/gi, '<\\/script')}</script>`);
if (/<script[^>]+src=|<link[^>]+stylesheet|import\.meta/.test(html)) throw new Error('External runtime dependency remains');
fs.writeFileSync(path.join(out, 'Drone-Weather-Lab-0.85-Beta.html'), html);
fs.writeFileSync(path.join(out, 'dist', 'Drone-Weather-Lab-0.85-Beta.html'), html);
console.log(`Standalone HTML built: ${Buffer.byteLength(html)} bytes; two embedded calculation workers.`);
