const sharp = require('sharp');
const [input, output] = process.argv.slice(2);
sharp(input, { density: 180 })
  .flatten({ background: '#F8FBFC' })
  .png({ compressionLevel: 9, palette: false })
  .toFile(output)
  .catch((error) => { console.error(error); process.exit(1); });
