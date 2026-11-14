import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hasFeature, type PlanTier } from '@domusafe/plans';
import { lazy, Suspense, useState, type SubmitEvent } from 'react';
import type { HaConnection, HaDevice, HaLockCode, HaZone, Room } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { problemText } from '@/lib/copy.js';
import {
  automationConnectionsQuery,
  automationDevicesQuery,
  automationLockCodesQuery,
  automationZonesQuery,
  roomsQuery,
} from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';

const RoomPhotosStrip = lazy(async () => {
  const module = await import('./room-photos-gallery.js');
  return { default: module.RoomPhotosStrip };
});

/**
 * Domotica of the open house: bridge settings, entity status, zone alarms and temporary lock codes.
 *
 * Preconditions: the caller can read automation. Premium (or the trial) unlocks the API.
 * Postconditions: secrets are never echoed back; a fresh temporary code is shown once after issue.
 * Data contract: connections store URL and sealed credentials server-side; status comes from the adapter.
 *
 * @param props - House, role capabilities and effective plan.
 * @returns The Domotica section.
 */
export function AutomationPanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly canManage: boolean;
  readonly plan: PlanTier;
}) {
  const allowed = hasFeature(props.plan, 'home_automation');
  if (!allowed) {
    return (
      <section className="grid max-w-xl gap-2">
        <h2 className="text-[13px] font-medium">{m.casaAutomation()}</h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{m.casaAutomationPlan()}</p>
      </section>
    );
  }

  return (
    <div className="grid max-w-xl gap-10">
      <p className="text-[13px] leading-relaxed text-muted-foreground">{m.casaAutomationLead()}</p>
      {!props.canManage ? (
        <p className="text-[13px] text-muted-foreground">{m.casaAutomationReadOnly()}</p>
      ) : null}
      <RoomsThenDevicesBlock familyId={props.familyId} houseId={props.houseId} />
      <ConnectionsBlock familyId={props.familyId} houseId={props.houseId} canManage={props.canManage} />
      <ZonesBlock familyId={props.familyId} houseId={props.houseId} canManage={props.canManage} />
      <LockCodesBlock familyId={props.familyId} houseId={props.houseId} canManage={props.canManage} />
    </div>
  );
}

function RoomsThenDevicesBlock(props: { readonly familyId: string; readonly houseId: string }) {
  const api = useApi();
  const rooms = useQuery(roomsQuery(api, props.familyId, props.houseId));
  const devices = useQuery(automationDevicesQuery(api, props.familyId, props.houseId));
  const roomList = rooms.data ?? [];
  const deviceList = devices.data ?? [];
  const unassigned = deviceList.filter((device) => device.roomId === null);

  return (
    <section className="grid gap-6">
      <div className="grid gap-1">
        <h2 className="text-[13px] font-medium">{m.casaAutomationRoomsFirst()}</h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {m.casaAutomationRoomsFirstLead()}
        </p>
      </div>
      {rooms.isPending || devices.isPending ? (
        <p className="text-[13px] text-muted-foreground">{m.loading()}</p>
      ) : null}
      {rooms.isError ? (
        <p role="alert" className="text-[13px] text-destructive">
          {problemText(rooms.error)}
        </p>
      ) : null}
      {devices.isError ? (
        <p role="alert" className="text-[13px] text-destructive">
          {problemText(devices.error)}
        </p>
      ) : null}
      <Suspense fallback={<p className="text-[13px] text-muted-foreground">{m.loading()}</p>}>
        <RoomPhotosStrip rooms={roomList} />
      </Suspense>
      {roomList.map((room) => (
        <RoomDevicesGroup
          key={room.id}
          room={room}
          devices={deviceList.filter((device) => device.roomId === room.id)}
        />
      ))}
      <div className="grid gap-3">
        <h3 className="text-[13px] font-medium">{m.casaAutomationDevicesUnassigned()}</h3>
        {deviceList.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{m.casaAutomationDevicesEmpty()}</p>
        ) : null}
        {unassigned.map((device) => (
          <DeviceRow key={device.id} device={device} />
        ))}
      </div>
    </section>
  );
}

function RoomDevicesGroup(props: { readonly room: Room; readonly devices: readonly HaDevice[] }) {
  if (props.devices.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-2">
      <h3 className="text-[13px] font-medium">
        {m.casaAutomationDevices()} · {props.room.name}
      </h3>
      {props.devices.map((device) => (
        <DeviceRow key={device.id} device={device} />
      ))}
    </div>
  );
}

function ConnectionsBlock(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly canManage: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const query = useQuery(automationConnectionsQuery(api, props.familyId, props.houseId));
  const [error, setError] = useState<string | null>(null);
  const [inboundSecret, setInboundSecret] = useState<string | null>(null);
  const [name, setName] = useState('Assistente casa');
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [mqttUrl, setMqttUrl] = useState('');
  const [mqttUser, setMqttUser] = useState('');
  const [mqttPassword, setMqttPassword] = useState('');
  const [pending, setPending] = useState(false);

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: automationConnectionsQuery(api, props.familyId, props.houseId).queryKey,
    });
    await queryClient.invalidateQueries({
      queryKey: automationDevicesQuery(api, props.familyId, props.houseId).queryKey,
    });
  }

  async function onCreateHa(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const created = await api.createAutomationConnection(
        props.familyId,
        props.houseId,
        crypto.randomUUID(),
        {
          kind: 'home_assistant_api',
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          token: token.trim(),
        },
      );
      setInboundSecret(created.inboundSecret);
      setToken('');
      await refresh();
    } catch (cause) {
      setError(problemText(cause));
    } finally {
      setPending(false);
    }
  }

  async function onCreateMqtt(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.createAutomationConnection(props.familyId, props.houseId, crypto.randomUUID(), {
        kind: 'mqtt',
        name: m.casaAutomationMqttName(),
        mqttUrl: mqttUrl.trim(),
        mqttUsername: mqttUser.trim() === '' ? null : mqttUser.trim(),
        mqttPassword: mqttPassword,
      });
      setMqttPassword('');
      await refresh();
    } catch (cause) {
      setError(problemText(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="grid gap-4">
      <h2 className="text-[13px] font-medium">{m.casaAutomationConnections()}</h2>
      {query.isPending ? <p className="text-[13px] text-muted-foreground">{m.loading()}</p> : null}
      {query.isError ? (
        <p role="alert" className="text-[13px] text-destructive">
          {problemText(query.error)}
        </p>
      ) : null}
      {query.data?.map((row) => (
        <ConnectionRow
          key={row.id}
          row={row}
          canManage={props.canManage}
          onTest={async () => {
            setError(null);
            try {
              await api.testAutomationConnection(props.familyId, props.houseId, row.id, crypto.randomUUID());
              await refresh();
            } catch (cause) {
              setError(problemText(cause));
            }
          }}
          onRefresh={async () => {
            setError(null);
            try {
              await api.refreshAutomationDevices(props.familyId, props.houseId, row.id, crypto.randomUUID());
              await refresh();
            } catch (cause) {
              setError(problemText(cause));
            }
          }}
        />
      ))}
      {inboundSecret !== null ? (
        <p className="rounded-md border border-border p-3 text-[13px] leading-relaxed">
          {m.casaAutomationInboundSecret({ secret: inboundSecret })}
        </p>
      ) : null}
      {props.canManage ? (
        <>
          <form className="grid gap-3" onSubmit={(event) => void onCreateHa(event)}>
            <h3 className="text-[13px] font-medium">{m.casaAutomationHaTitle()}</h3>
            <Field htmlFor="ha-conn-name" label={m.casaAutomationConnectionName()}>
              <Input
                id="ha-conn-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>
            <Field htmlFor="ha-conn-url" label={m.casaAutomationHaUrl()}>
              <Input
                id="ha-conn-url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                inputMode="url"
                required
              />
            </Field>
            <Field htmlFor="ha-conn-token" label={m.casaAutomationHaToken()}>
              <Input
                id="ha-conn-token"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                required
                autoComplete="off"
              />
            </Field>
            <Button type="submit" disabled={pending} size="emergency">
              {m.casaAutomationSaveHa()}
            </Button>
          </form>
          <form className="grid gap-3" onSubmit={(event) => void onCreateMqtt(event)}>
            <h3 className="text-[13px] font-medium">{m.casaAutomationMqttTitle()}</h3>
            <Field htmlFor="ha-mqtt-url" label={m.casaAutomationMqttUrl()}>
              <Input
                id="ha-mqtt-url"
                value={mqttUrl}
                onChange={(event) => setMqttUrl(event.target.value)}
                required
                autoComplete="off"
              />
            </Field>
            <Field htmlFor="ha-mqtt-user" label={m.casaAutomationMqttUser()}>
              <Input
                id="ha-mqtt-user"
                value={mqttUser}
                onChange={(event) => setMqttUser(event.target.value)}
              />
            </Field>
            <Field htmlFor="ha-mqtt-password" label={m.casaAutomationMqttPassword()}>
              <Input
                id="ha-mqtt-password"
                type="password"
                value={mqttPassword}
                onChange={(event) => setMqttPassword(event.target.value)}
                required
                autoComplete="off"
              />
            </Field>
            <Button type="submit" disabled={pending} size="emergency">
              {m.casaAutomationSaveMqtt()}
            </Button>
          </form>
        </>
      ) : null}
      {error !== null ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function ConnectionRow(props: {
  readonly row: HaConnection;
  readonly canManage: boolean;
  readonly onTest: () => Promise<void>;
  readonly onRefresh: () => Promise<void>;
}) {
  const status =
    props.row.status === 'active'
      ? m.casaAutomationStatusActive()
      : props.row.status === 'error'
        ? m.casaAutomationStatusError()
        : m.casaAutomationStatusDisabled();
  return (
    <article className="grid gap-2 border-b border-border pb-4">
      <p className="text-[13px] font-medium">{props.row.name}</p>
      <p className="text-[13px] text-muted-foreground">
        {props.row.kind === 'mqtt'
          ? m.casaAutomationKindMqtt()
          : props.row.kind === 'home_assistant_api'
            ? m.casaAutomationKindHaApi()
            : m.casaAutomationKindHaWebhook()}
      </p>
      <p className="text-[13px] text-muted-foreground">{status}</p>
      {props.row.baseUrl !== null ? (
        <p className="break-all text-[12px] text-muted-foreground">{props.row.baseUrl}</p>
      ) : null}
      {props.row.mqttUrl !== null ? (
        <p className="break-all text-[12px] text-muted-foreground">{props.row.mqttUrl}</p>
      ) : null}
      {props.canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="emergency" variant="secondary" onClick={() => void props.onTest()}>
            {m.casaAutomationTest()}
          </Button>
          <Button type="button" size="emergency" variant="outline" onClick={() => void props.onRefresh()}>
            {m.casaAutomationRefresh()}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function DeviceRow(props: { readonly device: HaDevice }) {
  return (
    <article className="grid gap-1 border-b border-border pb-3">
      <p className="text-[13px] font-medium">{props.device.name}</p>
      <p className="text-[12px] text-muted-foreground">{props.device.externalId}</p>
      <p className="text-[13px]">
        {props.device.lastState ?? m.casaAutomationStateUnknown()}
        {props.device.unit !== null && props.device.lastValue !== null
          ? ` · ${String(props.device.lastValue)} ${props.device.unit}`
          : props.device.lastValue !== null
            ? ` · ${String(props.device.lastValue)}`
            : ''}
      </p>
    </article>
  );
}

function ZonesBlock(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly canManage: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const query = useQuery(automationZonesQuery(api, props.familyId, props.houseId));
  const [name, setName] = useState('');
  const [externalId, setExternalId] = useState('alarm_control_panel.casa');
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: automationZonesQuery(api, props.familyId, props.houseId).queryKey,
    });
  }

  async function onCreate(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      await api.createAutomationZone(props.familyId, props.houseId, crypto.randomUUID(), {
        name: name.trim(),
        externalId: externalId.trim() === '' ? null : externalId.trim(),
      });
      setName('');
      await refresh();
    } catch (cause) {
      setError(problemText(cause));
    }
  }

  async function setState(zone: HaZone, alarmState: 'disarmed' | 'armed_home' | 'armed_away'): Promise<void> {
    setError(null);
    try {
      await api.updateAutomationZone(props.familyId, props.houseId, zone.id, zone.version, { alarmState });
      await refresh();
    } catch (cause) {
      setError(problemText(cause));
    }
  }

  return (
    <section className="grid gap-3">
      <h2 className="text-[13px] font-medium">{m.casaAutomationZones()}</h2>
      {query.data?.map((zone) => (
        <article key={zone.id} className="grid gap-2 border-b border-border pb-4">
          <p className="text-[13px] font-medium">{zone.name}</p>
          <p className="text-[13px] text-muted-foreground">{zoneAlarmLabel(zone.alarmState)}</p>
          {props.canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="emergency" onClick={() => void setState(zone, 'armed_away')}>
                {m.casaAutomationArmAway()}
              </Button>
              <Button
                type="button"
                size="emergency"
                variant="secondary"
                onClick={() => void setState(zone, 'armed_home')}
              >
                {m.casaAutomationArmHome()}
              </Button>
              <Button
                type="button"
                size="emergency"
                variant="outline"
                onClick={() => void setState(zone, 'disarmed')}
              >
                {m.casaAutomationDisarm()}
              </Button>
            </div>
          ) : null}
        </article>
      ))}
      {props.canManage ? (
        <form className="grid gap-3" onSubmit={(event) => void onCreate(event)}>
          <Field htmlFor="ha-zone-name" label={m.casaAutomationZoneName()}>
            <Input
              id="ha-zone-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field>
          <Field htmlFor="ha-zone-external" label={m.casaAutomationZoneExternal()}>
            <Input
              id="ha-zone-external"
              value={externalId}
              onChange={(event) => setExternalId(event.target.value)}
            />
          </Field>
          <Button type="submit" size="emergency">
            {m.casaAutomationSaveZone()}
          </Button>
        </form>
      ) : null}
      {error !== null ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function zoneAlarmLabel(state: HaZone['alarmState']): string {
  switch (state) {
    case 'disarmed':
      return m.casaAutomationZoneDisarmed();
    case 'armed_home':
      return m.casaAutomationZoneArmedHome();
    case 'armed_away':
      return m.casaAutomationZoneArmedAway();
    case 'triggered':
      return m.casaAutomationZoneTriggered();
  }
}

function LockCodesBlock(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly canManage: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const devices = useQuery(automationDevicesQuery(api, props.familyId, props.houseId));
  const codes = useQuery(automationLockCodesQuery(api, props.familyId, props.houseId));
  const locks = (devices.data ?? []).filter((device) => device.kind === 'lock');
  const [deviceId, setDeviceId] = useState('');
  const [label, setLabel] = useState('');
  const [hours, setHours] = useState('8');
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onIssue(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setIssuedCode(null);
    const lockId = deviceId === '' ? locks[0]?.id : deviceId;
    if (lockId === undefined) {
      setError(m.casaAutomationNoLocks());
      return;
    }
    const duration = Number(hours);
    if (!Number.isFinite(duration) || duration < 1 || duration > 168) {
      setError(m.casaAutomationHoursInvalid());
      return;
    }
    const validFrom = new Date();
    const validUntil = new Date(validFrom.getTime() + duration * 3_600_000);
    try {
      const issued = await api.issueAutomationLockCode(
        props.familyId,
        props.houseId,
        lockId,
        crypto.randomUUID(),
        {
          label: label.trim(),
          validFrom: validFrom.toISOString(),
          validUntil: validUntil.toISOString(),
        },
      );
      setIssuedCode(issued.code);
      setLabel('');
      await queryClient.invalidateQueries({
        queryKey: automationLockCodesQuery(api, props.familyId, props.houseId).queryKey,
      });
    } catch (cause) {
      setError(problemText(cause));
    }
  }

  return (
    <section className="grid gap-3">
      <h2 className="text-[13px] font-medium">{m.casaAutomationLockCodes()}</h2>
      {codes.data?.map((code) => (
        <LockCodeRow key={code.id} code={code} />
      ))}
      {props.canManage ? (
        <form className="grid gap-3" onSubmit={(event) => void onIssue(event)}>
          <div className="grid gap-1">
            <Label htmlFor="lock-device">{m.casaAutomationLockDevice()}</Label>
            <select
              id="lock-device"
              className="h-8 rounded-md border border-border bg-background px-2 text-[13px]"
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
            >
              <option value="">{m.casaAutomationLockDeviceFirst()}</option>
              {locks.map((lock) => (
                <option key={lock.id} value={lock.id}>
                  {lock.name}
                </option>
              ))}
            </select>
          </div>
          <Field htmlFor="ha-lock-label" label={m.casaAutomationLockLabel()}>
            <Input
              id="ha-lock-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              required
            />
          </Field>
          <Field htmlFor="ha-lock-hours" label={m.casaAutomationLockHours()}>
            <Input
              id="ha-lock-hours"
              inputMode="numeric"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              required
            />
          </Field>
          <Button type="submit" size="emergency">
            {m.casaAutomationIssueCode()}
          </Button>
        </form>
      ) : null}
      {issuedCode !== null ? (
        <p className="rounded-md border border-border p-3 text-[13px] leading-relaxed">
          {m.casaAutomationIssuedCode({ code: issuedCode })}
        </p>
      ) : null}
      {error !== null ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function LockCodeRow(props: { readonly code: HaLockCode }) {
  return (
    <article className="grid gap-1 border-b border-border pb-3">
      <p className="text-[13px] font-medium">{props.code.label}</p>
      <p className="text-[13px] text-muted-foreground">
        {m.casaAutomationCodeSuffix({ suffix: props.code.codeSuffix })}
      </p>
      <p className="text-[12px] text-muted-foreground">
        {new Date(props.code.validFrom).toLocaleString()} → {new Date(props.code.validUntil).toLocaleString()}
      </p>
    </article>
  );
}
