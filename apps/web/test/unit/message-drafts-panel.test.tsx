/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MessageDraftsPanel } from '../../src/features/rescue/message-drafts-panel.js';
import type { RescuePerson } from '../../src/features/rescue/model.js';

const people: readonly RescuePerson[] = [
  {
    id: 'ada',
    displayName: 'Ada',
    bloodGroup: 'a_positive',
    allergies: ['Penicillina'],
    medicines: [{ id: 'med', name: 'Insulina', location: 'Frigorifero' }],
    mobility: 'assisted',
    usualBedroom: 'Camera nord',
    contacts: [
      { id: 'marta', displayName: 'Marta', phone: '+393330000001', relationship: 'Madre' },
      { id: 'luca', displayName: 'Luca', phone: null, relationship: null },
    ],
  },
];

afterEach(() => {
  cleanup();
});

describe('message drafts panel', () => {
  it('opens phone drafts and switches to practice without putting health data in the link', () => {
    render(<MessageDraftsPanel houseName="Casa al mare" people={{ status: 'ready', value: people }} />);
    const text = screen.getByRole('link', { name: 'Messaggio breve a Marta' });
    const chat = screen.getByRole('link', { name: 'WhatsApp a Marta' });
    expect(text.className).toContain('min-h-12');
    expect(chat.className).toContain('min-h-12');
    expect(text.getAttribute('href')).toMatch(/^sms:\+393330000001\?body=/);
    expect(chat.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/393330000001\?text=/);
    expect(decodeURIComponent(text.getAttribute('href') ?? '')).toContain('Ada ha bisogno di aiuto');
    expect(decodeURIComponent(text.getAttribute('href') ?? '')).not.toContain('Penicillina');
    expect(decodeURIComponent(text.getAttribute('href') ?? '')).not.toContain('Insulina');
    expect(screen.queryByRole('link', { name: /Luca/ })).toBeNull();

    fireEvent.click(
      screen.getByRole('button', {
        name: "Modalità di prova: tocca per attivarla. Il testo dirà che non è un'emergenza.",
      }),
    );
    const practiceText = screen.getByRole('link', { name: 'Messaggio breve a Marta' });
    expect(decodeURIComponent(practiceText.getAttribute('href') ?? '')).toContain('prova');
    expect(decodeURIComponent(practiceText.getAttribute('href') ?? '')).toContain("Non è un'emergenza");
    expect(decodeURIComponent(practiceText.getAttribute('href') ?? '')).not.toContain('Penicillina');
  });

  it('explains when the role cannot read the cards', () => {
    render(<MessageDraftsPanel houseName="Casa al mare" people={{ status: 'hidden' }} />);
    expect(screen.getByText('I messaggi di soccorso non sono disponibili con il tuo ruolo.')).toBeTruthy();
  });
});
