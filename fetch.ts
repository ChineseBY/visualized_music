import fs from 'fs';
fetch('https://cdn.jsdelivr.net/npm/threejs-components@0.0.30/build/backgrounds/liquid1.min.js')
  .then(r => r.text())
  .then(t => fs.writeFileSync('liquid.js', t));
