const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const png2icons = require('png2icons');

const ROOT = path.join(__dirname, '..');
const SVG_PATH = path.join(ROOT, 'assets', 'icon.svg');
const BUILD_DIR = path.join(ROOT, 'build');           // Installer assets (ICO/ICNS/1024 PNG)
const RUNTIME_DIR = path.join(ROOT, 'electron', 'icons'); // Runtime assets (window/tray PNGs)

async function renderPng(svg, size) {
  return sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function build() {
  if (!fs.existsSync(SVG_PATH)) {
    throw new Error(`SVG not found at ${SVG_PATH}`);
  }
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });

  const svg = fs.readFileSync(SVG_PATH);

  // Master 1024 PNG — feeds ICO/ICNS and electron-builder.
  const png1024 = await renderPng(svg, 1024);
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.png'), png1024);

  // Runtime PNGs (bundled with the main process, referenced by absolute path).
  const png256 = await renderPng(svg, 256);
  const png32 = await renderPng(svg, 32);
  const png16 = await renderPng(svg, 16);
  fs.writeFileSync(path.join(RUNTIME_DIR, 'icon.png'), png256);
  fs.writeFileSync(path.join(RUNTIME_DIR, 'tray.png'), png32);
  fs.writeFileSync(path.join(RUNTIME_DIR, 'tray@1x.png'), png16);

  // ICO (Windows) — png2icons embeds 16/32/48/64/128/256.
  const ico = png2icons.createICO(png1024, png2icons.HERMITE, 0, false);
  if (!ico) throw new Error('createICO returned null');
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), ico);

  // ICNS (macOS) — works cross-platform via png2icons.
  const icns = png2icons.createICNS(png1024, png2icons.HERMITE, 0);
  if (!icns) throw new Error('createICNS returned null');
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.icns'), icns);

  console.log('Wrote:');
  console.log('  build/icon.png   (1024)');
  console.log('  build/icon.ico');
  console.log('  build/icon.icns');
  console.log('  electron/icons/icon.png   (256)');
  console.log('  electron/icons/tray.png   (32)');
  console.log('  electron/icons/tray@1x.png (16)');
}

build().catch((err) => {
  console.error('Icon build failed:', err);
  process.exit(1);
});
