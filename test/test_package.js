// Exercise the real CLI against disposable folders; never read a real plan.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sightline-package-'));
const pkg = require('../package.json');
let passed = 0, total = 0;
function ok(name, result) {total++; if (result) passed++; console.log((result ? 'PASS ' : 'FAIL ') + name);}
function run(...args) {return spawnSync(process.execPath, [path.join(root, 'bin/sightline.js'), ...args], {encoding:'utf8',cwd:temp});}
try {
  ok('package and application version agree', pkg.version === require('../src/releases.json')[0].version);
  ok('runtime requires no npm dependencies', !Object.keys(pkg.dependencies || {}).length);
  ok('CLI reports its version', run('--version').stdout.trim() === pkg.version);
  ok('unknown arguments fail', run('install','--force').status !== 0);
  ok('help describes file preservation', /never overwritten/.test(run('--help').stdout));
  const dest = path.join(temp, 'team');
  ok('install succeeds in a new destination', run('install',dest).status === 0);
  ok('installed app is the exact built HTML', fs.readFileSync(path.join(dest,'sightline.html')).equals(fs.readFileSync(path.join(root,'dist/sightline.html'))));
  const skills = fs.readdirSync(path.join(dest,'.sightline/skills'));
  ok('all six skills are installed', skills.length === 6 && skills.every(s=>fs.existsSync(path.join(dest,'.sightline/skills',s,'SKILL.md'))));
  ok('invented example and Jira snapshot are installed', fs.existsSync(path.join(dest,'example/plan.json')) && fs.existsSync(path.join(dest,'example/jira/status.json')));
  ok('example proposals match its plan ID', JSON.parse(fs.readFileSync(path.join(dest,'example/plan.json'))).meta.planId === JSON.parse(fs.readFileSync(path.join(dest,'example/sightline-amendments.json'))).planId);
  ok('identical install is idempotent', run('install',dest).status === 0);
  fs.writeFileSync(path.join(dest,'sightline.html'),'MY EXISTING APP');
  ok('different existing file refuses install',run('install',dest).status !== 0);
  ok('refused install preserves existing app',fs.readFileSync(path.join(dest,'sightline.html'),'utf8') === 'MY EXISTING APP');
  const edited = path.join(dest,'.sightline/skills',skills[0],'SKILL.md');
  fs.writeFileSync(edited,'MY TEAM SKILL');
  fs.unlinkSync(path.join(dest,'sightline.html'));
  ok('conflicting skill refuses before writing the app',run('install',dest).status !== 0 && !fs.existsSync(path.join(dest,'sightline.html')));
  ok('edited skill remains intact',fs.readFileSync(edited,'utf8') === 'MY TEAM SKILL');
  const only = path.join(temp, 'assistant-skills');
  ok('standalone skill installation succeeds',run('skills','--to',only).status === 0 && !fs.existsSync(path.join(only,'sightline.html')));
  const external = path.join(temp,'outside');fs.mkdirSync(external);
  const link = path.join(temp,'linked'); fs.symlinkSync(external,link, 'dir');
  ok('symlink destination is refused without writes',run('install',link).status !== 0 && fs.readdirSync(external).length === 0);
  fs.symlinkSync(path.join(temp,'missing'),path.join(temp,'dangling'),'dir');
  ok('dangling symlink destination is refused',run('install',path.join(temp,'dangling')).status !== 0);
  ok('trusted helpers can be located',run('helpers').stdout.trim() === path.join(root,'tools'));
} catch (e) {ok('package test completes',false); console.error(e.stack);}
finally {fs.rmSync(temp,{recursive:true,force:true});}
console.log(`${passed}/${total} passed`);process.exit(passed === total ? 0 : 1);
