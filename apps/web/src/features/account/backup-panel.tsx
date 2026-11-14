import { useQuery } from '@tanstack/react-query';
import { generateBackupPassphrase, isValidBackupPassphrase, sealBackup } from '@domusafe/crypto';
import type { ExportModule, ExportRecord, Me } from '@domusafe/contracts';
import { useState } from 'react';
import { useApi } from '@/components/api-context.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { problemText } from '@/lib/copy.js';
import { roleAllows } from '@/lib/permissions.js';
import { m } from '@/paraglide/messages.js';
import { downloadBlob, recordsToCsv } from './export-csv.js';

const MODULE_ORDER: readonly ExportModule[] = [
  'residents',
  'pets',
  'contacts',
  'utilities',
  'inventory',
  'house',
  'deadlines',
  'vault',
  'personale',
  'calendar',
];

function moduleLabel(module: ExportModule): string {
  switch (module) {
    case 'residents':
      return m.backupModuleResidents();
    case 'pets':
      return m.backupModulePets();
    case 'contacts':
      return m.backupModuleContacts();
    case 'utilities':
      return m.backupModuleUtilities();
    case 'inventory':
      return m.backupModuleInventory();
    case 'house':
      return m.backupModuleHouse();
    case 'deadlines':
      return m.backupModuleDeadlines();
    case 'vault':
      return m.backupModuleVault();
    case 'personale':
      return m.backupModulePersonale();
    case 'calendar':
      return m.backupModuleCalendar();
  }
}

async function collectAllRecords(
  list: (
    familyId: string,
    query?: { module?: ExportModule; cursor?: string; limit?: number },
  ) => Promise<{ items: readonly ExportRecord[]; nextCursor: string | null }>,
  familyId: string,
  module?: ExportModule,
): Promise<ExportRecord[]> {
  const items: ExportRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 200; page += 1) {
    const result = await list(familyId, {
      ...(module === undefined ? {} : { module }),
      ...(cursor === undefined ? {} : { cursor }),
      limit: 100,
    });
    items.push(...result.items);
    if (result.nextCursor === null) {
      break;
    }
    cursor = result.nextCursor;
  }
  return items;
}

/**
 * Family backup download and CSV table export under Account.
 * Lazy-loaded so the shell gzip budget stays intact.
 *
 * Preconditions: the caller holds `export.full` for `familyId`.
 * Postconditions: the encrypted backup and CSV files are assembled only in the browser.
 * Data contract: vault ciphertext stays sealed as stored; CSV warns that it is not encrypted.
 *
 * @param props - Signed-in account and open family.
 * @returns The panel.
 */
export function BackupPanel(props: { readonly me: Me; readonly familyId: string }) {
  const api = useApi();
  const family = props.me.families.find((item) => item.id === props.familyId);
  const canExport = family !== undefined && roleAllows(family.role, 'export.full');
  const catalog = useQuery({
    queryKey: ['export-catalog', props.familyId],
    queryFn: () => api.getExportCatalog(props.familyId),
    enabled: canExport,
  });
  const [passphrase, setPassphrase] = useState(() => generateBackupPassphrase());
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pendingBackup, setPendingBackup] = useState(false);
  const [pendingCsv, setPendingCsv] = useState<ExportModule | null>(null);

  if (!canExport) {
    return null;
  }

  async function downloadBackup(): Promise<void> {
    if (!isValidBackupPassphrase(passphrase)) {
      setError(m.backupPassphraseShort());
      return;
    }
    setPendingBackup(true);
    setError(null);
    setStatus(null);
    try {
      const records = await collectAllRecords(api.listExportRecords.bind(api), props.familyId);
      const file = await sealBackup({
        passphrase,
        accountId: props.me.accountId,
        familyIds: [props.familyId],
        appVersion: '0.1.0',
        records,
      });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(`domusafe-${stamp}.domusafe-backup`, file, 'application/octet-stream');
      setStatus(m.backupReady());
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPendingBackup(false);
    }
  }

  async function downloadCsv(module: ExportModule): Promise<void> {
    setPendingCsv(module);
    setError(null);
    setStatus(null);
    try {
      const records = await collectAllRecords(api.listExportRecords.bind(api), props.familyId, module);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(
        `domusafe-${module}-${stamp}.csv`,
        recordsToCsv(module, records),
        'text/csv;charset=utf-8',
      );
      setStatus(m.backupCsvReady());
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPendingCsv(null);
    }
  }

  const readable = new Set(
    (catalog.data?.modules ?? []).filter((item) => item.readable).map((item) => item.module),
  );

  return (
    <section className="grid gap-6 border-t border-border pt-6">
      <div className="grid gap-2">
        <h2 className="text-[15px] font-medium tracking-tight">{m.backupTitle()}</h2>
        <p className="text-[13px] text-muted-foreground">{m.backupLead()}</p>
      </div>

      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="backup-passphrase">{m.backupPassphraseLabel()}</Label>
          <Input
            id="backup-passphrase"
            value={passphrase}
            autoComplete="off"
            onChange={(event) => setPassphrase(event.target.value)}
          />
          <p className="text-[12px] text-muted-foreground">{m.backupPassphraseHint()}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setPassphrase(generateBackupPassphrase())}>
            {m.backupSuggestPhrase()}
          </Button>
          <Button
            type="button"
            size="emergency"
            disabled={pendingBackup}
            onClick={() => void downloadBackup()}
          >
            {pendingBackup ? m.backupWorking() : m.backupDownload()}
          </Button>
        </div>
      </div>

      <div className="grid gap-3">
        <h3 className="text-[14px] font-medium tracking-tight">{m.backupCsvTitle()}</h3>
        <p className="text-[13px] text-muted-foreground">{m.backupCsvWarning()}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODULE_ORDER.filter((module) => readable.has(module)).map((module) => (
            <Button
              key={module}
              type="button"
              variant="outline"
              size="emergency"
              disabled={pendingCsv !== null}
              onClick={() => void downloadCsv(module)}
            >
              {pendingCsv === module ? m.backupWorking() : moduleLabel(module)}
            </Button>
          ))}
        </div>
      </div>

      {error === null ? null : (
        <p role="alert" className="text-[12px] text-destructive">
          {error}
        </p>
      )}
      {status === null ? null : <p className="text-[12px] text-muted-foreground">{status}</p>}
    </section>
  );
}
