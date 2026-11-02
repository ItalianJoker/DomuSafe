'use client';

/**
 * Livello 3 — Cassaforte patrimoniale E2EE (Advanced / Premium).
 * Advanced: documenti Famiglia (utenze + eredità digitale).
 * Premium: + patrimonio personale + campi personalizzati.
 * PIN errato → messaggio italiano; nessun crash applicativo.
 */

import { useState } from 'react';
import { Lock, LockOpen, Plus, Shield, Trash2 } from 'lucide-react';
import type {
  DomusRunbookDocument,
  EncryptedVaultPayload,
  LicenseTier,
} from '@/types/domus';
import {
  VAULT_PIN_ERROR_MESSAGE,
  decryptVault,
  encryptVault,
  isVaultPinError,
} from '@/lib/crypto-vault';
import { canAccessFeature } from '@/lib/licensing';
import { createEmptyVaultPayload } from '@/lib/defaults';
import { FieldLabel, TouchInput, TouchSelect, TouchTextarea } from '@/components/TouchField';
import { CustomFieldsEditor } from '@/components/CustomFieldsEditor';
import { FeatureGate } from '@/components/FeatureGate';

interface Level3VaultPanelProps {
  tier: LicenseTier;
  vault: DomusRunbookDocument['level3_vault'];
  onVaultChange: (vault: DomusRunbookDocument['level3_vault']) => void;
}

type VaultView = 'locked' | 'unlocked' | 'create';

/**
 * Stato UI locale: il parent rimonta il pannello con `key` quando cambia
 * ciphertext o abitazione, così non serve un effect di reset.
 */
export function Level3VaultPanel({
  tier,
  vault,
  onVaultChange,
}: Level3VaultPanelProps) {
  const allowPersonal = canAccessFeature(tier, 'allowPersonalPatrimonio');
  const [view, setView] = useState<VaultView>(vault ? 'locked' : 'create');
  const [payload, setPayload] = useState<EncryptedVaultPayload>(
    createEmptyVaultPayload
  );
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const unlock = async () => {
    if (!vault) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const decrypted = await decryptVault(vault, pin);
      setPayload(decrypted);
      setView('unlocked');
      setPin('');
      setStatus('Cassaforte sbloccata su questo dispositivo.');
    } catch (err) {
      setError(
        isVaultPinError(err) ? VAULT_PIN_ERROR_MESSAGE : VAULT_PIN_ERROR_MESSAGE
      );
      setView('locked');
    } finally {
      setBusy(false);
    }
  };

  const lockInMemory = () => {
    setPayload(createEmptyVaultPayload());
    setPin('');
    setPinConfirm('');
    setError(null);
    setStatus('Cassaforte bloccata. I dati in chiaro sono stati rimossi dalla memoria.');
    setView(vault ? 'locked' : 'create');
  };

  /**
   * Cifra il payload corrente e lo persiste nel documento.
   * Richiede PIN (e conferma in creazione) — salt/IV nuovi a ogni salvataggio.
   */
  const saveEncrypted = async (mode: 'create' | 'update') => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      if (pin.length < 4) {
        setError('Il PIN deve avere almeno 4 caratteri.');
        return;
      }
      if (mode === 'create' && pin !== pinConfirm) {
        setError('I PIN non coincidono.');
        return;
      }
      const encrypted = await encryptVault(payload, pin);
      onVaultChange(encrypted);
      setView('locked');
      setPayload(createEmptyVaultPayload());
      setPin('');
      setPinConfirm('');
      setStatus(
        mode === 'create'
          ? 'Cassaforte creata e cifrata (AES-256-GCM).'
          : 'Cassaforte aggiornata e ricifrata.'
      );
    } catch {
      setError('Impossibile cifrare la cassaforte. Riprova.');
    } finally {
      setBusy(false);
    }
  };

  const clearVault = () => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Eliminare definitivamente la cassaforte cifrata da questo dispositivo?'
      )
    ) {
      return;
    }
    onVaultChange(undefined);
    setPayload(createEmptyVaultPayload());
    setPin('');
    setPinConfirm('');
    setError(null);
    setStatus('Cassaforte eliminata.');
    setView('create');
  };

  return (
    <section
      aria-labelledby="level3-title"
      className="space-y-6 rounded-lg border-2 border-amber-900 bg-amber-50 p-4"
    >
      <header>
        <p className="text-sm font-bold uppercase tracking-widest text-amber-950">
          Livello 3 · Cassaforte E2EE
        </p>
        <h2
          id="level3-title"
          className="mt-1 flex items-center gap-2 text-2xl font-black text-zinc-950"
        >
          <Shield className="size-7" aria-hidden />
          Patrimonio &amp; eredità digitale
        </h2>
        <p className="mt-2 max-w-2xl text-base text-zinc-700">
          Dati cifrati sul dispositivo con PIN (PBKDF2 + AES-256-GCM). Il PIN
          non lascia mai il browser.
        </p>
      </header>

      {error ? (
        <p
          className="rounded-md border-2 border-red-800 bg-red-100 px-4 py-3 font-semibold text-red-950"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {status ? (
        <p
          className="rounded-md border-2 border-emerald-800 bg-emerald-50 px-4 py-3 font-semibold text-emerald-950"
          role="status"
        >
          {status}
        </p>
      ) : null}

      {view === 'locked' && vault ? (
        <div className="space-y-4">
          <p className="font-semibold text-zinc-800">
            Cassaforte presente e bloccata. Inserisci il PIN per sbloccare.
          </p>
          <div>
            <FieldLabel htmlFor="vault-pin-unlock">PIN</FieldLabel>
            <TouchInput
              id="vault-pin-unlock"
              type="password"
              autoComplete="off"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void unlock();
              }}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy || pin.length === 0}
              className="inline-flex min-h-12 min-w-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-amber-700 px-5 font-bold text-white enabled:hover:bg-amber-600 disabled:opacity-50"
              onClick={() => void unlock()}
            >
              <LockOpen className="size-5" aria-hidden />
              Sblocca
            </button>
            <button
              type="button"
              className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-red-800 bg-white px-5 font-bold text-red-900 hover:bg-red-50"
              onClick={clearVault}
            >
              <Trash2 className="size-5" aria-hidden />
              Elimina cassaforte
            </button>
          </div>
        </div>
      ) : null}

      {view === 'create' || view === 'unlocked' ? (
        <div className="space-y-6">
          {!allowPersonal ? (
            <p className="rounded-md border-2 border-amber-800 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
              Piano Advanced: documenti Famiglia (utenze e eredità digitale).
              Patrimonio personale (conti, polizze, lavoro) e campi liberi
              richiedono Premium o prova.
            </p>
          ) : null}
          <VaultEditor
            tier={tier}
            allowPersonal={allowPersonal}
            payload={payload}
            onChange={setPayload}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="vault-pin-save">
                {view === 'create' ? 'Scegli PIN (min. 4)' : 'PIN per ricifrare'}
              </FieldLabel>
              <TouchInput
                id="vault-pin-save"
                type="password"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
            </div>
            {view === 'create' ? (
              <div>
                <FieldLabel htmlFor="vault-pin-confirm">Conferma PIN</FieldLabel>
                <TouchInput
                  id="vault-pin-confirm"
                  type="password"
                  autoComplete="off"
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value)}
                />
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-zinc-950 px-5 font-bold text-white enabled:hover:bg-zinc-800 disabled:opacity-50"
              onClick={() =>
                void saveEncrypted(view === 'create' ? 'create' : 'update')
              }
            >
              <Lock className="size-5" aria-hidden />
              {view === 'create' ? 'Crea e cifra' : 'Salva e blocca'}
            </button>
            {view === 'unlocked' ? (
              <>
                <button
                  type="button"
                  className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-5 font-bold hover:bg-zinc-100"
                  onClick={lockInMemory}
                >
                  <Lock className="size-5" aria-hidden />
                  Blocca senza salvare
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-red-800 bg-white px-5 font-bold text-red-900 hover:bg-red-50"
                  onClick={clearVault}
                >
                  <Trash2 className="size-5" aria-hidden />
                  Elimina
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function VaultEditor({
  tier,
  allowPersonal,
  payload,
  onChange,
}: {
  tier: LicenseTier;
  allowPersonal: boolean;
  payload: EncryptedVaultPayload;
  onChange: (next: EncryptedVaultPayload) => void;
}) {
  return (
    <div className="space-y-8">
      {allowPersonal ? (
      <>
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Conti bancari</h3>
          <button
            type="button"
            className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold hover:bg-zinc-100"
            onClick={() =>
              onChange({
                ...payload,
                bankAccounts: [
                  ...payload.bankAccounts,
                  {
                    institution: '',
                    accountType: '',
                    ownershipDetails: '',
                    notes: '',
                  },
                ],
              })
            }
          >
            <Plus className="size-5" aria-hidden />
            Aggiungi conto
          </button>
        </div>
        {payload.bankAccounts.length === 0 ? (
          <p className="text-sm text-zinc-700">Nessun conto inserito.</p>
        ) : (
          <ul className="space-y-4">
            {payload.bankAccounts.map((account, index) => (
              <li
                key={`bank-${index}`}
                className="space-y-3 rounded-md border-2 border-amber-900/40 bg-white p-3"
              >
                <div className="flex justify-end">
                  <button
                    type="button"
                    aria-label={`Rimuovi conto ${index + 1}`}
                    className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border-2 border-red-800 bg-white text-red-900"
                    onClick={() =>
                      onChange({
                        ...payload,
                        bankAccounts: payload.bankAccounts.filter(
                          (_, i) => i !== index
                        ),
                      })
                    }
                  >
                    <Trash2 className="size-5" aria-hidden />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel>Istituto</FieldLabel>
                    <TouchInput
                      value={account.institution}
                      onChange={(e) => {
                        const bankAccounts = [...payload.bankAccounts];
                        bankAccounts[index] = {
                          ...account,
                          institution: e.target.value,
                        };
                        onChange({ ...payload, bankAccounts });
                      }}
                    />
                  </div>
                  <div>
                    <FieldLabel>Tipo conto</FieldLabel>
                    <TouchInput
                      value={account.accountType}
                      onChange={(e) => {
                        const bankAccounts = [...payload.bankAccounts];
                        bankAccounts[index] = {
                          ...account,
                          accountType: e.target.value,
                        };
                        onChange({ ...payload, bankAccounts });
                      }}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <FieldLabel>Intestazione / dettagli</FieldLabel>
                    <TouchInput
                      value={account.ownershipDetails}
                      onChange={(e) => {
                        const bankAccounts = [...payload.bankAccounts];
                        bankAccounts[index] = {
                          ...account,
                          ownershipDetails: e.target.value,
                        };
                        onChange({ ...payload, bankAccounts });
                      }}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <FieldLabel>Note</FieldLabel>
                    <TouchTextarea
                      value={account.notes ?? ''}
                      onChange={(e) => {
                        const bankAccounts = [...payload.bankAccounts];
                        bankAccounts[index] = {
                          ...account,
                          notes: e.target.value,
                        };
                        onChange({ ...payload, bankAccounts });
                      }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Assicurazioni vita</h3>
          <button
            type="button"
            className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold hover:bg-zinc-100"
            onClick={() =>
              onChange({
                ...payload,
                lifeInsurances: [
                  ...payload.lifeInsurances,
                  {
                    company: '',
                    policyNumber: '',
                    type: 'TCM',
                    beneficiariesSummary: '',
                  },
                ],
              })
            }
          >
            <Plus className="size-5" aria-hidden />
            Aggiungi polizza
          </button>
        </div>
        {payload.lifeInsurances.length === 0 ? (
          <p className="text-sm text-zinc-700">Nessuna polizza inserita.</p>
        ) : (
          <ul className="space-y-4">
            {payload.lifeInsurances.map((policy, index) => (
              <li
                key={`life-${index}`}
                className="space-y-3 rounded-md border-2 border-amber-900/40 bg-white p-3"
              >
                <div className="flex justify-end">
                  <button
                    type="button"
                    aria-label={`Rimuovi polizza ${index + 1}`}
                    className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border-2 border-red-800 bg-white text-red-900"
                    onClick={() =>
                      onChange({
                        ...payload,
                        lifeInsurances: payload.lifeInsurances.filter(
                          (_, i) => i !== index
                        ),
                      })
                    }
                  >
                    <Trash2 className="size-5" aria-hidden />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel>Compagnia</FieldLabel>
                    <TouchInput
                      value={policy.company}
                      onChange={(e) => {
                        const lifeInsurances = [...payload.lifeInsurances];
                        lifeInsurances[index] = {
                          ...policy,
                          company: e.target.value,
                        };
                        onChange({ ...payload, lifeInsurances });
                      }}
                    />
                  </div>
                  <div>
                    <FieldLabel>Numero polizza</FieldLabel>
                    <TouchInput
                      value={policy.policyNumber}
                      onChange={(e) => {
                        const lifeInsurances = [...payload.lifeInsurances];
                        lifeInsurances[index] = {
                          ...policy,
                          policyNumber: e.target.value,
                        };
                        onChange({ ...payload, lifeInsurances });
                      }}
                    />
                  </div>
                  <div>
                    <FieldLabel>Tipo</FieldLabel>
                    <TouchSelect
                      value={policy.type}
                      onChange={(e) => {
                        const lifeInsurances = [...payload.lifeInsurances];
                        lifeInsurances[index] = {
                          ...policy,
                          type: e.target.value as EncryptedVaultPayload['lifeInsurances'][number]['type'],
                        };
                        onChange({ ...payload, lifeInsurances });
                      }}
                    >
                      <option value="TCM">TCM</option>
                      <option value="VITA_RISPARMIO">Vita risparmio</option>
                      <option value="INFORTUNI">Infortuni</option>
                    </TouchSelect>
                  </div>
                  <div>
                    <FieldLabel>Beneficiari (sintesi)</FieldLabel>
                    <TouchInput
                      value={policy.beneficiariesSummary}
                      onChange={(e) => {
                        const lifeInsurances = [...payload.lifeInsurances];
                        lifeInsurances[index] = {
                          ...policy,
                          beneficiariesSummary: e.target.value,
                        };
                        onChange({ ...payload, lifeInsurances });
                      }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 rounded-md border-2 border-amber-900/40 bg-white p-3">
        <h3 className="text-lg font-bold">Lavoro &amp; pensione</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel>Ente previdenza</FieldLabel>
            <TouchInput
              value={payload.laborAndPension.socialSecurityInstitution}
              onChange={(e) =>
                onChange({
                  ...payload,
                  laborAndPension: {
                    ...payload.laborAndPension,
                    socialSecurityInstitution: e.target.value,
                  },
                })
              }
            />
          </div>
          <div>
            <FieldLabel>Fondo pensione complementare</FieldLabel>
            <TouchInput
              value={payload.laborAndPension.supplementaryPensionFund ?? ''}
              onChange={(e) =>
                onChange({
                  ...payload,
                  laborAndPension: {
                    ...payload.laborAndPension,
                    supplementaryPensionFund: e.target.value,
                  },
                })
              }
            />
          </div>
          <div>
            <FieldLabel>Collocazione TFR</FieldLabel>
            <TouchSelect
              value={payload.laborAndPension.tfrStorageLocation}
              onChange={(e) =>
                onChange({
                  ...payload,
                  laborAndPension: {
                    ...payload.laborAndPension,
                    tfrStorageLocation: e.target
                      .value as EncryptedVaultPayload['laborAndPension']['tfrStorageLocation'],
                  },
                })
              }
            >
              <option value="IN_AZIENDA">In azienda</option>
              <option value="FONDO_CATEGORIA">Fondo di categoria</option>
            </TouchSelect>
          </div>
          <div>
            <FieldLabel>Contatto HR</FieldLabel>
            <TouchInput
              value={payload.laborAndPension.hrContact}
              onChange={(e) =>
                onChange({
                  ...payload,
                  laborAndPension: {
                    ...payload.laborAndPension,
                    hrContact: e.target.value,
                  },
                })
              }
            />
          </div>
        </div>
      </div>
      </>
      ) : null}

      <div className="space-y-3 rounded-md border-2 border-amber-900/40 bg-white p-3">
        <h3 className="text-lg font-bold">Utenze &amp; abbonamenti</h3>
        <div>
          <FieldLabel>Cartella ultime bollette</FieldLabel>
          <TouchInput
            value={payload.utilitiesLocations.lastBillsFolderLocation}
            onChange={(e) =>
              onChange({
                ...payload,
                utilitiesLocations: {
                  ...payload.utilitiesLocations,
                  lastBillsFolderLocation: e.target.value,
                },
              })
            }
          />
        </div>
        <div>
          <FieldLabel>Abbonamenti da revocare (uno per riga)</FieldLabel>
          <TouchTextarea
            value={payload.utilitiesLocations.activeSubscriptionsToRevoke.join(
              '\n'
            )}
            onChange={(e) =>
              onChange({
                ...payload,
                utilitiesLocations: {
                  ...payload.utilitiesLocations,
                  activeSubscriptionsToRevoke: e.target.value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                },
              })
            }
          />
        </div>
      </div>

      <div className="space-y-3 rounded-md border-2 border-amber-900/40 bg-white p-3">
        <h3 className="text-lg font-bold">Eredità digitale</h3>
        <label className="flex min-h-12 items-center gap-3 font-semibold">
          <input
            type="checkbox"
            className="size-6 border-2 border-zinc-900"
            checked={payload.digitalLegacy.appleLegacyContactActive}
            onChange={(e) =>
              onChange({
                ...payload,
                digitalLegacy: {
                  ...payload.digitalLegacy,
                  appleLegacyContactActive: e.target.checked,
                },
              })
            }
          />
          Contatto eredità Apple attivo
        </label>
        <label className="flex min-h-12 items-center gap-3 font-semibold">
          <input
            type="checkbox"
            className="size-6 border-2 border-zinc-900"
            checked={payload.digitalLegacy.googleInactiveManagerActive}
            onChange={(e) =>
              onChange({
                ...payload,
                digitalLegacy: {
                  ...payload.digitalLegacy,
                  googleInactiveManagerActive: e.target.checked,
                },
              })
            }
          />
          Gestore account inattivo Google attivo
        </label>
        <div>
          <FieldLabel>Posizione kit password manager</FieldLabel>
          <TouchInput
            value={payload.digitalLegacy.passwordManagerKitLocation}
            onChange={(e) =>
              onChange({
                ...payload,
                digitalLegacy: {
                  ...payload.digitalLegacy,
                  passwordManagerKitLocation: e.target.value,
                },
              })
            }
          />
        </div>
      </div>

      <FeatureGate tier={tier} feature="allowCustomFields">
        <CustomFieldsEditor
          title="Campi personalizzati (cassaforte)"
          fields={payload.customFields}
          onChange={(customFields) => onChange({ ...payload, customFields })}
        />
      </FeatureGate>
    </div>
  );
}
