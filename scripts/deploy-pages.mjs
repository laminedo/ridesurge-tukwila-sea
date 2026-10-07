// Builds the static site and publishes it to the `gh-pages` branch, which GitHub Pages serves.
// Run with `npm run deploy:pages`. Pass --build-only to build `out/` without pushing.
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';

const run = (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options });
const read = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim();

rmSync('out', { recursive: true, force: true });
run(process.execPath, ['node_modules/next/dist/bin/next', 'build'], { env: { ...process.env, GITHUB_PAGES: '1' } });
if (!existsSync('out/index.html')) throw new Error('The static export did not produce out/index.html.');
// Without this, Pages' Jekyll step drops the `_next` folder.
writeFileSync('out/.nojekyll', '');

if (process.argv.includes('--build-only')) {
  console.log('Static site built in out/.');
  process.exit(0);
}

const remote = read('git', ['remote', 'get-url', 'origin']);
const source = read('git', ['rev-parse', '--short', 'HEAD']);
const identity = ['-c', `user.name=${read('git', ['config', 'user.name'])}`, '-c', `user.email=${read('git', ['config', 'user.email'])}`];

// The branch only ever holds the latest build, so it is rebuilt from scratch and force-pushed.
const inOut = { cwd: 'out' };
rmSync('out/.git', { recursive: true, force: true });
run('git', ['init', '--quiet', '--initial-branch=gh-pages'], inOut);
run('git', ['add', '--all'], inOut);
run('git', [...identity, 'commit', '--quiet', '-m', `Deploy ${source}`], inOut);
run('git', ['push', '--force', remote, 'gh-pages'], inOut);
rmSync('out/.git', { recursive: true, force: true });

console.log(`Published ${source} to the gh-pages branch.`);
