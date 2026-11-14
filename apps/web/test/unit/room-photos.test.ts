import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('room photo gallery lazy loading', () => {
  it('keeps the gallery out of the Casa shell and inventory static imports', () => {
    const root = resolve(import.meta.dirname, '../..');
    const casa = readFileSync(resolve(root, 'src/features/casa/casa-page.tsx'), 'utf8');
    const inventory = readFileSync(resolve(root, 'src/features/casa/inventory-panel.tsx'), 'utf8');
    const automation = readFileSync(resolve(root, 'src/features/casa/automation-panel.tsx'), 'utf8');
    expect(casa).not.toMatch(/room-photos-gallery/);
    expect(inventory).toMatch(
      /lazy\(async \(\) => \{\s*const module = await import\('\.\/room-photos-gallery\.js'\)/,
    );
    expect(inventory).not.toMatch(/from '\.\/room-photos-gallery/);
    expect(automation).toMatch(
      /lazy\(async \(\) => \{\s*const module = await import\('\.\/room-photos-gallery\.js'\)/,
    );
    expect(automation).not.toMatch(/from '\.\/room-photos-gallery/);
  });
});
