const fs = require('node:fs');
const path = require('node:path');
const { Jimp, ResizeStrategy } = require('jimp');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'icons/splash_foreground.png');
const targets = {
  mdpi: 288,
  hdpi: 432,
  xhdpi: 576,
  xxhdpi: 864,
  xxxhdpi: 1152,
};

function alphaAt(image, x, y) {
  return image.bitmap.data[(y * image.bitmap.width + x) * 4 + 3];
}

async function main() {
  const source = await Jimp.read(sourcePath);
  const { width, height, data } = source.bitmap;
  if (width !== height) {
    throw new Error(`Splash foreground must use a square canvas; received ${width}x${height}.`);
  }
  let hasTransparency = false;
  for (let offset = 3; offset < data.length; offset += 4) {
    if (data[offset] < 255) {
      hasTransparency = true;
      break;
    }
  }
  if (!hasTransparency) {
    throw new Error('Splash foreground must contain a real transparent alpha channel.');
  }
  const corners = [
    alphaAt(source, 0, 0),
    alphaAt(source, width - 1, 0),
    alphaAt(source, 0, height - 1),
    alphaAt(source, width - 1, height - 1),
  ];
  if (corners.some((alpha) => alpha !== 0)) {
    throw new Error('Splash foreground corners must be fully transparent.');
  }

  for (const [density, size] of Object.entries(targets)) {
    const outputDirectory = path.join(root, `android/app/src/main/res/drawable-${density}`);
    const outputPath = path.join(outputDirectory, 'splashscreen_logo.png');
    fs.mkdirSync(outputDirectory, { recursive: true });
    const resized = source.clone().resize({
      h: size,
      mode: ResizeStrategy.BICUBIC,
      w: size,
    });
    await resized.write(outputPath);
    process.stdout.write(`${density}: ${size}x${size} -> ${outputPath}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
