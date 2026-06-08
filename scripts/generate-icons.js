const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '../public/icons/logo.svg');
const outDir  = path.join(__dirname, '../public/icons');

const svgBuffer = fs.readFileSync(svgPath);

async function generate() {
  for (const size of [192, 512]) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(outDir, `icon-${size}.png`));
    console.log(`✓ icon-${size}.png`);
  }
  // favicon 32x32
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(outDir, 'favicon-32.png'));
  console.log('✓ favicon-32.png');
}

generate().catch(console.error);
