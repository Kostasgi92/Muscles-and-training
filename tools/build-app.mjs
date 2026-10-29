// Χτίζει το dist/: index.html (για δημοσίευση ως artifact), app.js (bundle), anatomy.txt
// και τα addons (i18n.js, programs.js, motion.js) που φορτώνονται δίπλα στο app.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  outfile: path.join(dist, 'app.js'),
  legalComments: 'none',
  banner: { js: '/* Μυϊκός Χάρτης — three.js (MIT), three-mesh-bvh (MIT), fflate (MIT). Ανατομικά δεδομένα: Z-Anatomy (CC BY-SA 4.0) βάσει BodyParts3D © DBCLS. */' },
  logLevel: 'warning',
});

const bin = path.join(root, 'public/anatomy.bin');
fs.rmSync(path.join(dist, 'anatomy.bin'), { force: true });
// base64 σε .txt: το claude.ai artifact σερβίρει μόνο γνωστούς τύπους αρχείων
fs.writeFileSync(path.join(dist, 'anatomy.txt'), fs.readFileSync(bin).toString('base64'));
// σκελετός κίνησης (tools/build-rig.mjs), φορτώνεται όταν χρειαστεί
fs.writeFileSync(path.join(dist, 'rig.txt'), fs.readFileSync(path.join(root, 'public/rig.bin')).toString('base64'));
// addons: απλά scripts χωρίς bundling (γλώσσα, προγράμματα, κίνηση)
for (const f of ['i18n.js', 'programs.js', 'motion.js']) fs.copyFileSync(path.join(root, 'src/addons', f), path.join(dist, f));
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8')
  .replace('/*__CSS__*/', css)
  .replaceAll('__ANATOMY_BYTES__', String(Math.ceil(fs.statSync(bin).size / 3) * 4))
  .replaceAll('__BUILD__', new Date().toISOString().slice(0, 10));
fs.writeFileSync(path.join(dist, 'index.html'), html);

const kb = (f) => (fs.statSync(path.join(dist, f)).size / 1024).toFixed(0) + ' KB';
console.log(`dist/index.html ${kb('index.html')}, dist/app.js ${kb('app.js')}, dist/anatomy.txt ${kb('anatomy.txt')}, dist/rig.txt ${kb('rig.txt')}`);
