/**
 * Tipi Premium: audit scan, branding host, SOS.
 * Gate: auditLog / customBranding / allowSmsAlerts (PREMIUM + trial).
 */

/** Evento di accesso/scansione (chi e quando). */
export type AuditEventKind = 'SCAN' | 'MANUAL' | 'SOS' | 'BREAK_GLASS';

export interface AuditLogEntry {
  id: string;
  kind: AuditEventKind;
  at: string;
  /** Etichetta leggibile: «Ospite», UA breve, o nome membro. */
  actorLabel: string;
  note?: string;
  houseName?: string;
  /** Hash privacy-safe dell’IP (mai IP in chiaro). */
  ipHash?: string;
}

/** Registro append-only, capped lato server. */
export interface AuditLogDocument {
  version: '1.0.0';
  familyId: string;
  entries: AuditLogEntry[];
  updatedAt: string;
}

/** White-label host (Airbnb / caregiver) — solo Premium. */
export interface FamilyBranding {
  /** Nome mostrato al posto di «DomuSafe» su stampa/ospiti. */
  hostDisplayName: string;
  /** Colore accento CSS hex (#RRGGBB). */
  accentColor: string;
  /** Logo opzionale (data URL SVG/PNG piccolo). */
  logoDataUrl?: string;
  /** Riga sotto il nome (es. «Casa vacanze · Firenze»). */
  tagline?: string;
}

/** Canali SOS pluggable. */
export type SosChannel = 'sms' | 'whatsapp';

export interface SosRecipient {
  name: string;
  phoneNumber: string;
  relationship?: string;
}

export interface SosDispatchRequest {
  familyId: string;
  message: string;
  channels: SosChannel[];
  recipients: SosRecipient[];
  houseName?: string;
  /** Se true: non invia davvero — solo prova provider. */
  dryRun?: boolean;
}

export interface SosDispatchResult {
  ok: boolean;
  provider: string;
  dryRun: boolean;
  delivered: number;
  failed: number;
  details: Array<{
    phoneNumber: string;
    channel: SosChannel;
    status: 'sent' | 'skipped' | 'error';
    detail?: string;
  }>;
}
