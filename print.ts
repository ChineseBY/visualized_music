import fs from 'fs';
const code = fs.readFileSync('liquid.js', 'utf8');
console.log(code.substring(code.length - 1000));
