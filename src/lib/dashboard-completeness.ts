/**
 * Completezza Panoramica a tre colonne: Casa | Residenti | Emergenza.
 * Percentuali indipendenti (non solo il nudge globale).
 */

import type { DomusRunbookDocument } from '@/types/domus';

export type DashboardColumnId = 'casa' | 'residenti' | 'emergenza';

export type DashboardColumnScore = {
  id: DashboardColumnId;
  title: string;
  percent: number;
  done: number;
  total: number;
  blurb: string;
};

/** Casa: nome, chiusure, Wi‑Fi, foto valvole/quadro. */
export function scoreCasa(doc: DomusRunbookDocument): DashboardColumnScore {
  const l1 = doc.level1_public;
  const checks = [
    Boolean(l1.houseName.trim()),
    Boolean(l1.utilities.waterCutoff.location.trim()),
    Boolean(l1.utilities.gasCutoff.location.trim()),
    Boolean(l1.utilities.electricPanel.breakerLocation.trim()),
    Boolean(l1.wifi.ssid.trim()),
    Boolean(
      l1.utilities.waterCutoff.photoDataUrl ||
        l1.utilities.gasCutoff.photoDataUrl ||
        l1.utilities.electricPanel.photoDataUrl
    ),
  ];
  const done = checks.filter(Boolean).length;
  const total = checks.length;
  return {
    id: 'casa',
    title: 'Casa',
    done,
    total,
    percent: Math.round((done / total) * 100),
    blurb: `${done}/${total} punti casa`,
  };
}

/** Residenti: almeno un nome; bonus per foto e camera. */
export function scoreResidenti(doc: DomusRunbookDocument): DashboardColumnScore {
  const residents = doc.level2_ice.residents;
  if (residents.length === 0) {
    return {
      id: 'residenti',
      title: 'Residenti',
      done: 0,
      total: 3,
      percent: 0,
      blurb: 'Nessun residente',
    };
  }
  const named = residents.filter((r) => r.fullName.trim()).length;
  const withRoom = residents.filter((r) => r.sleepingRoom.trim()).length;
  const withPhoto = residents.filter((r) => r.photoDataUrl).length;
  const checks = [
    named > 0,
    named === residents.length,
    withRoom > 0 || withPhoto > 0,
  ];
  const done = checks.filter(Boolean).length;
  const total = checks.length;
  return {
    id: 'residenti',
    title: 'Residenti',
    done,
    total,
    percent: Math.round((done / total) * 100),
    blurb: `${named} resident${named === 1 ? 'e' : 'i'}`,
  };
}

/** Emergenza: allergie/farmaci/ICE + sangue noto. */
export function scoreEmergenza(doc: DomusRunbookDocument): DashboardColumnScore {
  const residents = doc.level2_ice.residents.filter((r) =>
    r.fullName.trim()
  );
  if (residents.length === 0) {
    return {
      id: 'emergenza',
      title: 'Emergenza',
      done: 0,
      total: 4,
      percent: 0,
      blurb: 'Serve almeno un residente',
    };
  }
  const withAllergyOrMed = residents.some(
    (r) =>
      r.allergies.length > 0 ||
      r.lifesavingMedicines.some((m) => m.name.trim())
  );
  const withIce = residents.some((r) =>
    r.iceContacts.some((c) => c.phoneNumber.trim())
  );
  const withBlood = residents.some((r) => r.bloodGroup !== 'UNKNOWN');
  const withCutoff = Boolean(
    doc.level1_public.utilities.waterCutoff.location.trim() ||
      doc.level1_public.utilities.gasCutoff.location.trim()
  );
  const checks = [withAllergyOrMed, withIce, withBlood, withCutoff];
  const done = checks.filter(Boolean).length;
  const total = checks.length;
  return {
    id: 'emergenza',
    title: 'Emergenza',
    done,
    total,
    percent: Math.round((done / total) * 100),
    blurb: `${done}/${total} dati soccorso`,
  };
}

export function dashboardColumns(
  doc: DomusRunbookDocument
): DashboardColumnScore[] {
  return [scoreCasa(doc), scoreResidenti(doc), scoreEmergenza(doc)];
}

/** Casa + ICE pronti per pubblicare QR emergenza in 1 tap. */
export function isReadyToPublishEmergency(doc: DomusRunbookDocument): boolean {
  return scoreCasa(doc).percent >= 50 && scoreEmergenza(doc).percent >= 50;
}

export function hasCasaBasics(doc: DomusRunbookDocument): boolean {
  const l1 = doc.level1_public;
  return Boolean(
    l1.houseName.trim() &&
      (l1.utilities.waterCutoff.location.trim() ||
        l1.utilities.gasCutoff.location.trim() ||
        l1.utilities.electricPanel.breakerLocation.trim())
  );
}

export function hasEmergenzaBasics(doc: DomusRunbookDocument): boolean {
  return doc.level2_ice.residents.some(
    (r) =>
      r.allergies.length > 0 ||
      r.lifesavingMedicines.some((m) => m.name.trim()) ||
      r.iceContacts.some((c) => c.phoneNumber.trim())
  );
}
