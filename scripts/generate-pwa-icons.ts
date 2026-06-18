import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const svg = readFileSync(join(process.cwd(), 'public', 'icon.svg'), 'utf-8');

const sizes: Array<{ filename: string; size: number }> = [
  { filename: 'icon-192.png', size: 192 },
  { filename: 'icon-512.png', size: 512 },
  { filename: 'apple-touch-icon.png', size: 180 },
];

for (const { filename, size } of sizes) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  const png = resvg.render().asPng();
  writeFileSync(join(process.cwd(), 'public', filename), png);
  console.log(`wrote public/${filename} (${size}×${size})`);
}
