/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { buttonVariants } from '../../src/components/ui/button.js';
import type { RescueCutoff } from '../../src/features/rescue/model.js';
import { KioskScreen } from '../../src/features/kiosk/kiosk-screen.js';
import type { KioskContact, KioskDeadline, KioskMedicine } from '../../src/features/kiosk/model.js';

const cutoffs: readonly RescueCutoff[] = [
  { kind: 'water', places: [{ id: 'w', location: 'Cortile', instructions: 'Ruotare la leva' }] },
  { kind: 'gas', places: [] },
  { kind: 'electricity', places: [{ id: 'e', location: 'Quadro', instructions: '' }] },
];

const contacts: readonly KioskContact[] = [
  {
    id: 'marta',
    displayName: 'Marta',
    phone: '+393330000001',
    relationship: 'Madre',
    personName: 'Ada',
  },
];

const deadlines: readonly KioskDeadline[] = [
  { key: 'maintenance:1:2026-11-10', label: 'Controllo caldaia', dueDate: '2026-11-10', group: 'week' },
];

const medicines: readonly KioskMedicine[] = [
  { id: 'med', name: 'Insulina', location: 'Frigorifero', personName: 'Ada' },
];

afterEach(() => {
  cleanup();
});

describe('kiosk screen', () => {
  it('shows large widgets for contacts, cutoffs, deadlines and medicines', () => {
    const closed = { called: false };
    render(
      <KioskScreen
        familyId="famiglia"
        houseId="casa"
        houseName="Casa al mare"
        contacts={{ status: 'ready', value: contacts }}
        cutoffs={{ status: 'ready', value: cutoffs }}
        deadlines={{ status: 'ready', value: deadlines }}
        medicines={{ status: 'ready', value: medicines }}
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
    expect(screen.getByText('Controllo caldaia')).toBeTruthy();
    expect(screen.getByText('Insulina')).toBeTruthy();
    const marta = screen.getByRole('link', { name: 'Chiama Marta' });
    expect(marta.getAttribute('href')).toBe('tel:+393330000001');
    expect(marta.className).toContain('min-h-16');
    expect(screen.getByRole('button', { name: 'Esci dalla vista tablet' }).className).toContain('min-h-14');
    expect(document.body.textContent).not.toContain('IT60');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closed.called).toBe(true);
  });

  it('keeps the medical call when sections are hidden', () => {
    render(
      <KioskScreen
        familyId="famiglia"
        houseId="casa"
        houseName="Casa al mare"
        contacts={{ status: 'hidden' }}
        cutoffs={{ status: 'hidden' }}
        deadlines={{ status: 'hidden' }}
        medicines={{ status: 'hidden' }}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByRole('link', { name: 'Chiama il soccorso sanitario, 118' })).toBeTruthy();
    expect(screen.getByText('Le chiusure non sono visibili con il tuo ruolo.')).toBeTruthy();
    expect(screen.getByText('Le scadenze non sono visibili con il tuo ruolo.')).toBeTruthy();
  });
});
