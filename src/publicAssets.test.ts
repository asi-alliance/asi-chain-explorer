import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const publicDir = join(__dirname, '..', 'public');
const indexHtml = readFileSync(join(publicDir, 'index.html'), 'utf8');

test('index.html references existing public assets from the site root', () => {
  const refs = Array.from(indexHtml.matchAll(/(?:href|src)="([^"]+)"/g), (match) => match[1])
    .filter((ref) => !/^(https?:|#|data:)/.test(ref))
    .map((ref) => ref.replace('%PUBLIC_URL%', ''));

  expect(refs).toEqual(expect.arrayContaining(['/favicon.ico', '/manifest.json']));
  refs.forEach((ref) => {
    expect(existsSync(join(publicDir, ref))).toBe(true);
  });
});

test('the icon link is root-absolute on nested routes and has no missing SVG fallback', () => {
  expect(indexHtml).toContain('href="%PUBLIC_URL%/favicon.ico"');
  expect(indexHtml).not.toContain('favicon.svg');
});
