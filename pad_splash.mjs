import { Jimp, rgbaToInt } from 'jimp';

async function main() {
  console.log('Loading image...');
  const image = await Jimp.read('icons/551977a0-2e08-4e2e-95cf-7644f680767d.png');
  const targetSize = Math.ceil(image.bitmap.width / (2/3));
  console.log('Target size:', targetSize);

  // Background color #4a7bf7 -> R: 74, G: 123, B: 247, A: 255
  const bgColor = rgbaToInt(74, 123, 247, 255);

  const background = new Jimp({ width: targetSize, height: targetSize, color: bgColor });
  
  const x = Math.floor((targetSize - image.bitmap.width) / 2);
  const y = Math.floor((targetSize - image.bitmap.height) / 2);

  background.composite(image, x, y);
  
  await background.write('icons/splash_padded.png');
  console.log('Saved to icons/splash_padded.png');
}

main().catch(console.error);
