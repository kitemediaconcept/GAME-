import type {
  AdminOverviewPayload,
  AttemptRecord,
  CampaignSettings,
  ParticipantSessionState,
  PublicCampaignPayload,
  TeamId,
} from '../types.ts';

async function handleJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`) as Error & {
      code?: string;
      entryNumber?: string;
      status?: number;
    };
    err.code = data.code;
    err.entryNumber = data.entryNumber;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export async function fetchPublicCampaign(): Promise<PublicCampaignPayload> {
  const res = await fetch('/api/campaign');
  return handleJson<PublicCampaignPayload>(res);
}

export async function registerParticipant(payload: {
  name: string;
  email: string;
  phone: string;
  acceptedRules: boolean;
  marketingOptIn: boolean;
}): Promise<{ session: ParticipantSessionState; resumed: boolean }> {
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}

export async function selectSessionTeam(
  entryId: string,
  sessionToken: string,
  team: TeamId
): Promise<{ session: ParticipantSessionState }> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(entryId)}/team`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team, sessionToken }),
  });
  return handleJson(res);
}

export async function submitPenaltyShot(
  entryId: string,
  sessionToken: string,
  payload: {
    aimValue: number;
    power: number;
    idempotencyKey: string;
  }
): Promise<{
  attempt: AttemptRecord;
  rawAimX: number;
  session: ParticipantSessionState;
  duplicate: boolean;
}> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(entryId)}/shoot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, sessionToken }),
  });
  return handleJson(res);
}

export async function adminLogin(passcode: string): Promise<{ token: string }> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });
  return handleJson(res);
}

export async function adminLogout(token: string): Promise<void> {
  await fetch('/api/admin/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined);
}

export async function fetchAdminOverview(token: string): Promise<AdminOverviewPayload> {
  const res = await fetch('/api/admin/overview', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleJson(res);
}

export async function adminProposeWinners(token: string): Promise<AdminOverviewPayload> {
  const res = await fetch('/api/admin/winners/propose', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleJson(res);
}

export async function adminConfirmWinners(token: string): Promise<AdminOverviewPayload> {
  const res = await fetch('/api/admin/winners/confirm', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleJson(res);
}

export async function adminOverrideWinner(
  token: string,
  payload: { participantId: string; action: 'add' | 'confirm' | 'remove'; reason: string }
): Promise<AdminOverviewPayload> {
  const res = await fetch('/api/admin/winners/override', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}

export async function adminUpdateSettings(
  token: string,
  patch: Partial<CampaignSettings>
): Promise<AdminOverviewPayload> {
  const res = await fetch('/api/admin/settings', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(patch),
  });
  return handleJson(res);
}

export async function downloadAdminCsv(
  token: string,
  type: 'participants' | 'winners'
): Promise<void> {
  const res = await fetch(`/api/admin/export?type=${type}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to export CSV');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `iphone-vs-android-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
