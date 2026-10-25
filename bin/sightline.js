#!/usr/bin/env node
'use strict';
// Install trusted package assets only. Existing, different files are never replaced.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');

function filesUnder(dir, prefix = '') {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error('Package assets cannot contain symbolic links.');
    const rel = path.join(prefix, entry.name);
    return entry.isDirectory() ? filesUnder(path.join(dir, entry.name), rel) : [rel];
  });
}
function checkPath(target) {
  const full = path.resolve(target), parts = full.slice(path.parse(full).root.length).split(path.sep);
  let at = path.parse(full).root;
  for (const part of parts) {
    at = path.join(at, part);
    if (fs.existsSync(at) || (()=>{try { return fs.lstatSync(at).isSymbolicLink(); } catch { return false; }})()) {
      if (fs.lstatSync(at).isSymbolicLink()) throw new Error('Choose a destination without symbolic links.');
      if (at !== full && !fs.statSync(at).isDirectory()) throw new Error('A destination parent is a file. Your files were kept.');
    }
  }
}
function install(target, skillsOnly) {
  const dest = path.resolve(target);
  const assets = filesUnder(path.join(root, 'skills')).map(rel => ({
    from:path.join(root, 'skills', rel), to:path.join(dest, skillsOnly ? '' : '.sightline/skills', rel)
  }));
  if (!skillsOnly) {
    assets.unshift({from:path.join(root, 'dist/sightline.html'), to:path.join(dest, 'sightline.html')});
    assets.push(...filesUnder(path.join(root, 'examples/northstar')).map(rel => ({
      from:path.join(root, 'examples/northstar', rel), to:path.join(dest, 'example', rel)
    })));
  }
  // Check the whole batch before writing, including existing links and edited skills.
  for (const asset of assets) {
    checkPath(asset.to);
    if (fs.existsSync(asset.to) && (!fs.statSync(asset.to).isFile() || !fs.readFileSync(asset.to).equals(fs.readFileSync(asset.from)))) {
      throw new Error('A destination file already differs. Your files were kept. Install into a new folder to update.');
    }
  }
  let written = 0;
  for (const asset of assets) {
    if (fs.existsSync(asset.to)) continue;
    fs.mkdirSync(path.dirname(asset.to), {recursive:true});
    // Exclusive creation also refuses a file that appeared after the checks above.
    fs.writeFileSync(asset.to, fs.readFileSync(asset.from), {flag:'wx'}); written++;
  }
  console.log(skillsOnly ? `Skills ready in ${dest}` : `Open ${path.join(dest, 'sightline.html')} in Chrome or Edge.`);
  console.log(`${written} files installed. Existing identical files were kept.`);
  if (!skillsOnly) console.log('Planning skills: .sightline/skills. Try the invented plan in example/plan.json. Your own plans are kept separate.');
}
function main(args) {
  if (!args.length || ['--help','-h','help'].includes(args[0])) {
    console.log(`Sightline ${pkg.version} — your team's work, in plain sight.

  sightline install [folder]     Install the HTML app and planning skills
  sightline skills --to <folder> Install only the planning skills
  sightline helpers              Print the trusted Python helper directory
  sightline --version            Show the package version

Install defaults to ./sightline. Existing different files are never overwritten.
Use a new folder for an update, then open your existing plan from the new app.
Docs: https://github.com/troylar/sightline-planner#readme`);
    return;
  }
  if (args[0] === '--version' && args.length === 1) return console.log(pkg.version);
  if (args[0] === 'helpers' && args.length === 1) return console.log(path.join(root, 'dist'));   // the helpers stamped with this app's version
  if (args[0] === 'install' && args.length <= 2 && (!args[1] || !args[1].startsWith('-'))) return install(args[1] || 'sightline', false);
  if (args[0] === 'skills' && args.length === 3 && args[1] === '--to' && !args[2].startsWith('-')) return install(args[2], true);
  throw new Error('Unknown command or argument. Run sightline --help.');
}
try { main(process.argv.slice(2)); } catch (error) {
  console.error('Sightline: ' + error.message); process.exitCode = 1;
}
