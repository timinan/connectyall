import fs from 'node:fs';
import { renderCard } from '../src/services/CardService';

async function main() {
  const png = await renderCard({
    profile: {
      displayName: 'Tim Nan', tagline: 'PM building crypto products',
      telegramUsername: 'timnan', photoR2Url: null,
      socials: { x: 'timnan', linkedin: 'in/timnan', email: 'tim@example.com' },
    },
  });
  fs.writeFileSync('preview-card.png', png);
  console.log('Wrote preview-card.png');
}
main();
