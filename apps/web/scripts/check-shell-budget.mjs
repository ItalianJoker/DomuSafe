import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
const refs = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="(\/assets\/[^"]+)"[^>]*>/g)]
  .filter((match) => !match[0].includes('modulepreload'))
  .map((match) => match[1]);
let total = 0;
for (const ref of refs) {
  if (ref === undefined) {
    continue;
  }
  const bytes = gzipSync(readFileSync(resolve(dist, ref.slice(1)))).length;
  total += bytes;
  process.stdout.write(`${ref} ${String(bytes)}\n`);
}
const limit = 150 * 1024;
process.stdout.write(`shell ${String(total)} / ${String(limit)}\n`);
if (total > limit) {
  process.stderr.write(`App shell exceeds ${String(limit)} bytes gzip.\n`);
  process.exit(1);
}
