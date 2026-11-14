import { describe, expect, it } from 'vitest';
import { extractRecipeFromHtml, isBlockedAddress } from '../src/modules/kitchen/import-url.js';

describe('recipe URL import helpers', () => {
  it('blocks private and loopback addresses', () => {
    expect(isBlockedAddress('127.0.0.1')).toBe(true);
    expect(isBlockedAddress('10.0.0.8')).toBe(true);
    expect(isBlockedAddress('192.168.1.20')).toBe(true);
    expect(isBlockedAddress('172.16.4.1')).toBe(true);
    expect(isBlockedAddress('::1')).toBe(true);
    expect(isBlockedAddress('8.8.8.8')).toBe(false);
  });

  it('extracts a schema.org Recipe from JSON-LD without extra parsers', () => {
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      ${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Recipe',
        name: 'Torta di mele',
        description: 'Dolce di casa',
        recipeYield: '8',
        prepTime: 'PT20M',
        cookTime: 'PT40M',
        recipeIngredient: ['Mele 4', 'Farina 300 g', 'Zucchero 150 g'],
        recipeInstructions: [
          { '@type': 'HowToStep', text: 'Preparare l impasto' },
          { '@type': 'HowToStep', text: 'Cuocere in forno' },
        ],
      })}
      </script>
    </head><body></body></html>`;
    const draft = extractRecipeFromHtml(html, 'https://example.test/torta');
    expect(draft).not.toBeNull();
    expect(draft?.title).toBe('Torta di mele');
    expect(draft?.servings).toBe(8);
    expect(draft?.prepMinutes).toBe(20);
    expect(draft?.cookMinutes).toBe(40);
    expect(draft?.ingredients).toHaveLength(3);
    expect(draft?.steps).toEqual(['Preparare l impasto', 'Cuocere in forno']);
  });
});
