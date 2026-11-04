/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { buttonVariants } from '../../src/components/ui/button.js';
import type { RescueCutoff, RescuePerson } from '../../src/features/rescue/model.js';
import { RescueScreen } from '../../src/features/rescue/rescue-screen.js';

const cutoffs: readonly RescueCutoff[] = [
  { kind: 'water', places: [{ id: 'w', location: 'Cortile', instructions: 'Ruotare la leva' }] },
  { kind: 'gas', places: [] },
  { kind: 'electricity', places: [{ id: 'e', location: 'Quadro', instructions: '' }] },
];

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
      { id: 'luca', displayName: 'Luca', phone: '+393330000002', relationship: null },
    ],
  },
];

afterEach(() => {
  cleanup();
});

describe('rescue screen', () => {
  it('shows cutoffs, the essential card, ordered contacts and the medical call', () => {
    const closed = { called: false };
    render(
      <RescueScreen
        houseName="Casa al mare"
        cutoffs={{ status: 'ready', value: cutoffs }}
        people={{ status: 'ready', value: people }}
        onClose={() => {
          closed.called = true;
        }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Casa al mare' })).toBeTruthy();
    const emergency = screen.getByRole('link', { name: 'Chiama il soccorso sanitario, 118' });
    expect(emergency.getAttribute('href')).toBe('tel:118');
    expect(emergency.className).toContain('min-h-16');
    expect(buttonVariants({ size: 'emergency' })).toContain('min-h-12');
    expect(screen.getByText('Cortile — Ruotare la leva')).toBeTruthy();
    expect(screen.getByText('Posizione non indicata')).toBeTruthy();
    expect(screen.getByText('Quadro')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ada' })).toBeTruthy();
    expect(screen.getByText('A positivo')).toBeTruthy();
    expect(screen.getByText('Penicillina')).toBeTruthy();
    expect(screen.getByText('Insulina — Frigorifero')).toBeTruthy();
    expect(screen.getByText('Ha bisogno di aiuto')).toBeTruthy();
    expect(screen.getByText('Camera nord')).toBeTruthy();
    const body = document.body.textContent;
    const martaAt = body.indexOf('Marta');
    const lucaAt = body.indexOf('Luca');
    expect(martaAt).toBeGreaterThanOrEqual(0);
    expect(martaAt).toBeLessThan(lucaAt);
    const marta = screen.getByRole('link', { name: 'Chiama Marta' });
    expect(marta.getAttribute('href')).toBe('tel:+393330000001');
    expect(marta.className).toContain('min-h-12');
    expect(screen.getByRole('button', { name: 'Chiudi la schermata di soccorso' }).className).toContain(
      'min-h-12',
    );
    expect(body).not.toContain('IT60');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closed.called).toBe(true);
  });

  it('keeps the medical call when the role cannot read the facts', () => {
    render(
      <RescueScreen
        houseName="Casa al mare"
        cutoffs={{ status: 'hidden' }}
        people={{ status: 'hidden' }}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByRole('link', { name: 'Chiama il soccorso sanitario, 118' })).toBeTruthy();
    expect(screen.getByText('Le chiusure non sono visibili con il tuo ruolo.')).toBeTruthy();
    expect(screen.getByText('Le schede non sono visibili con il tuo ruolo.')).toBeTruthy();
  });
});
