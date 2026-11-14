import { describe, expect, it } from 'vitest';
import {
  canDraftTo,
  rescueDraftBody,
  smsDraftHref,
  whatsAppDigits,
  whatsAppDraftHref,
} from '../../src/features/rescue/message-drafts.js';

const HEALTH = ['Penicillina', 'Insulina', 'a_positive', 'gruppo sanguigno', 'allerg'];

describe('rescue message drafts', () => {
  it('builds sms and WhatsApp links without health facts in the body', () => {
    expect(canDraftTo('+393330000001')).toBe(true);
    expect(canDraftTo('3330000001')).toBe(false);
    expect(canDraftTo(null)).toBe(false);
    expect(whatsAppDigits('+393330000001')).toBe('393330000001');

    const real = rescueDraftBody(
      { kind: 'real', houseName: 'Casa al mare', personName: 'Ada' },
      {
        real: ({ houseName, personName }) =>
          `${personName} ha bisogno di aiuto a ${houseName}. Ti prego di contattarmi.`,
        practice: ({ houseName, personName }) =>
          `Questa è una prova da DomuSafe per ${personName} a ${houseName}. Non è un'emergenza.`,
      },
    );
    const practice = rescueDraftBody(
      { kind: 'practice', houseName: 'Casa al mare', personName: 'Ada' },
      {
        real: ({ houseName, personName }) =>
          `${personName} ha bisogno di aiuto a ${houseName}. Ti prego di contattarmi.`,
        practice: ({ houseName, personName }) =>
          `Questa è una prova da DomuSafe per ${personName} a ${houseName}. Non è un'emergenza.`,
      },
    );
    expect(real).toContain('Ada');
    expect(real).toContain('Casa al mare');
    expect(practice).toContain('prova');
    expect(practice).toContain("Non è un'emergenza");
    for (const word of HEALTH) {
      expect(real.toLowerCase()).not.toContain(word.toLowerCase());
      expect(practice.toLowerCase()).not.toContain(word.toLowerCase());
    }

    expect(smsDraftHref('+393330000001', real)).toBe(`sms:+393330000001?body=${encodeURIComponent(real)}`);
    expect(whatsAppDraftHref('+393330000001', practice)).toBe(
      `https://wa.me/393330000001?text=${encodeURIComponent(practice)}`,
    );
    expect(smsDraftHref('+393330000001', real).startsWith('sms:')).toBe(true);
    expect(whatsAppDraftHref('+393330000001', practice).startsWith('https://wa.me/')).toBe(true);
  });
});
