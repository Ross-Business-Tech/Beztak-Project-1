// Builds the zip a person downloads, and a copy of the page that the website serves.
//   node board-briefing/tools/package.cjs
// Writes  public/monthly-board-briefing.zip  and  public/board-briefing/ .
// Needs the `zip` command (or Python 3) on this computer.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const src = path.join(__dirname, '..');
const pub = path.join(src, '..', 'public');
const stage = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'briefing-'));
const folder = path.join(stage, 'Monthly-Board-Briefing');

const include = ['index.html', 'START-HERE.txt', 'css', 'js', 'sample'];
fs.mkdirSync(folder);
include.forEach((n) => fs.cpSync(path.join(src, n), path.join(folder, n), { recursive: true }));

// 1. The copy the website serves (a live demo of the same page).
const site = path.join(pub, 'board-briefing');
fs.rmSync(site, { recursive: true, force: true });
fs.cpSync(folder, site, { recursive: true });

// 2. The zip.
const zip = path.join(pub, 'monthly-board-briefing.zip');
fs.rmSync(zip, { force: true });
try {
  execFileSync('zip', ['-r', '-X', '-q', zip, 'Monthly-Board-Briefing'], { cwd: stage });
} catch (e) {
  execFileSync('python3', ['-I', '-c',
    'import sys,zipfile,os\nz=zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED)\n' +
    'for r,_,fs in os.walk("Monthly-Board-Briefing"):\n [z.write(os.path.join(r,f)) for f in sorted(fs)]\nz.close()', zip], { cwd: stage });
}
fs.rmSync(stage, { recursive: true, force: true });
console.log('Wrote', path.relative(process.cwd(), zip), (fs.statSync(zip).size / 1024).toFixed(0) + ' KB');
console.log('Wrote', path.relative(process.cwd(), site) + '/');
