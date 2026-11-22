// 0.94: runs every Node check of the project, one after another, and fails if any of them fails.
// Run: node scripts/verify-all.mjs
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const checks = [
  'verify.mjs', 'verify-v06.mjs', 'verify-v07.mjs', 'verify-v08.mjs', 'verify-v085.mjs', 'verify-v087.mjs',
  'verify-v088.mjs', 'verify-v089.mjs', 'verify-v090.mjs', 'verify-v091.mjs', 'verify-v092.mjs', 'verify-v093.mjs',
  'verify-v094.mjs', 'verify-v095.mjs', 'verify-ui.mjs', 'verify-standalone.mjs'
];
const failed = [];
for (const name of checks) {
  const started = Date.now();
  const run = spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', path.join('scripts', name)], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (run.status === 0) console.log(`passed  ${name} (${seconds} s)`);
  else {
    failed.push(name);
    console.log(`FAILED  ${name} (${seconds} s)\n${(run.stderr || run.stdout).split('\n').slice(0, 20).join('\n')}`);
  }
}
console.log(failed.length ? `${failed.length} of ${checks.length} checks failed.` : `All ${checks.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
