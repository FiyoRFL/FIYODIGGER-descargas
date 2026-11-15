// Arma la versión web (iPhone) a partir de los assets de la app Android
const fs = require('fs'), path = require('path');
const [src, web, out] = process.argv.slice(2);
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
fs.rmSync(path.join(out, 'scraper.js'), { force: true });
for (const f of ['manifest.webmanifest', 'sw.js', 'icon-180.png', 'icon-192.png', 'icon-512.png']) fs.copyFileSync(path.join(web, f), path.join(out, f));
let h = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const head = [
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="icon-180.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="ZONAS CBA">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
].join('\n');
h = h.replace('</title>', '</title>\n' + head);
h = h.replace('https://appassets.androidplatform.net/*', 'https://fiyorfl.github.io/*');
h = h.replace('</body>', '<script>if("serviceWorker" in navigator){navigator.serviceWorker.register("sw.js",{scope:"./"}).catch(function(){});}</script>\n</body>');
fs.writeFileSync(path.join(out, 'index.html'), h);
console.log('web lista en', out);
