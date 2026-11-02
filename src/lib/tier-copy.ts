/**
 * Testi piani Free → Premium (binding license-tiers.md).
 * Italiano chiaro, non tecnico; termini prodotto EN lasciati dove naturali.
 */
import type { LicenseTier } from '@/types/domus';

export type TierCopy = {
  /** Nome piano (invariato). */
  name: string;
  /** Una riga: a chi è pensato. */
  audience: string;
  /** Cosa puoi fare, in linguaggio quotidiano. */
  includes: string[];
  /** Limiti o cose non incluse (vuoto se Premium). */
  limits: string[];
};

/**
 * Descrizioni canoniche per UI (Piano) e allineamento README / Manuale.
 */
export const TIER_COPY: Record<LicenseTier, TierCopy> = {
  FREE: {
    name: 'Free',
    audience: 'Per iniziare da soli, con una sola persona in casa.',
    includes: [
      'Casa (utenze, Wi‑Fi, rifiuti, artigiani) e schede Emergenza ICE',
      'Una scheda residente',
      'Stampa A4 e QR (con Watermark DomuSafe)',
      'Solo i campi previsti dall’app (campi standard)',
    ],
    limits: [
      'Niente Cassaforte protetta da PIN',
      'Niente tasse italiane, successione, sync tra dispositivi né campi personalizzati',
    ],
  },
  BASIC: {
    name: 'Basic',
    audience: 'Per la famiglia che vuole più schede Emergenza, senza Cassaforte.',
    includes: [
      'Tutto di Free',
      'Schede residenti illimitate (e animali)',
      'Stampa A4 e QR (con Watermark DomuSafe)',
      'Solo campi standard',
    ],
    limits: [
      'Niente Cassaforte protetta da PIN',
      'Niente tasse italiane, successione, sync tra dispositivi né campi personalizzati',
    ],
  },
  ADVANCED: {
    name: 'Advanced',
    audience: 'Per chi vuole anche i documenti riservati di Famiglia, dietro PIN.',
    includes: [
      'Tutto di Basic',
      'Cassaforte (Livello 3): documenti di Famiglia (utenze, eredità digitale) protetti da PIN',
      'Stampa A4 senza Watermark DomuSafe (resta la linguetta Privacy per l’ICE)',
      'Fino a 3 abitazioni',
      'Solo campi standard',
    ],
    limits: [
      'Niente documenti patrimoniali personali (conti, polizze, lavoro)',
      'Niente checklist tasse / ISEE sulle schede residenti',
      'Niente checklist successione Famiglia, sync tra dispositivi né campi personalizzati',
    ],
  },
  PREMIUM: {
    name: 'Premium',
    audience: 'Tutto DomuSafe: casa, emergenza, patrimonio, tasse, successione e sync.',
    includes: [
      'Tutto di Advanced, senza Watermark in stampa',
      'Patrimonio personale in Cassaforte (conti, polizze, lavoro)',
      'Checklist tasse italiane su ogni scheda residente',
      'Checklist successione per tutta la Famiglia e kit eredità da stampare',
      'Sync cifrato tra i tuoi dispositivi (QR)',
      'Campi personalizzati oltre a quelli standard',
      'Registro accessi (scan), avvisi SOS, marchio host personalizzato',
      'Abitazioni senza limite pratico',
    ],
    limits: [],
  },
};

/** Riepilogo breve per tabelle / badge. */
export const TIER_SUMMARY: Record<LicenseTier, string> = {
  FREE: 'Casa + Emergenza · 1 residente · Watermark · campi standard',
  BASIC: 'Come Free, con residenti illimitati · Watermark · campi standard',
  ADVANCED:
    'Come Basic + Cassaforte Famiglia · senza Watermark · senza tasse / patrimonio personale / sync',
  PREMIUM:
    'Tutto: tasse, patrimonio personale, successione, sync, campi personalizzati, registro, SOS, marchio host',
};

/** Prova Premium — testo fisso per UI. */
export const PREMIUM_TRIAL_COPY = {
  button: 'Avvia prova Premium 30 giorni',
  active: (days: number) =>
    `Prova Premium attiva · ${days} giorn${days === 1 ? 'o' : 'i'} rimanenti`,
  used: 'Prova Premium già utilizzata su questo account.',
  footnote:
    'La prova Premium vale una sola volta per account e sblocca tutte le funzioni Premium (compresi campi personalizzati e sync). Alla scadenza torni al piano base.',
} as const;
