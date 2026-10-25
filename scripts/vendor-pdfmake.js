// Kopiuje pdfmake z node_modules do assets/vendor (hostowanie lokalne zamiast CDN).
// Użycie: npm install && npm run vendor:pdfmake
const fs = require('fs');
const path = require('path');

const version = require('pdfmake/package.json').version;
const src = path.dirname(require.resolve('pdfmake/package.json'));
const dest = path.join(__dirname, '..', 'public', 'assets', 'vendor', `pdfmake-${version}`);
fs.mkdirSync(dest, { recursive: true });
for (const f of ['build/pdfmake.min.js', 'build/vfs_fonts.js', 'LICENSE']) {
  fs.copyFileSync(path.join(src, f), path.join(dest, path.basename(f)));
}
console.log(`pdfmake ${version} -> ${path.relative(process.cwd(), dest)}`);
