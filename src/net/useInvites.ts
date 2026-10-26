// Extra Terram — src/net/useInvites.ts v0.1.0 — pending invites for the signed-in player, kept fresh
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';
import { fetchInvites, invitesAvailable, listenForInvites, respondInvite, type Invite } from './invites';

export interface InvitesState {
  invites: Invite[];
  /** The latest nudge, for a toast; cleared by `clearNudge`. */
  nudge: { code: string; fromName: string } | null;
  clearNudge(): void;
  refresh(): Promise<void>;
  decline(inviteId: number): Promise<void>;
  accept(inviteId: number): Promise<void>;
}

export function useInvites(): InvitesState {
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? (auth.user?.id ?? null) : null;
  const [invites, setInvites] = useState<Invite[]>([]);
  const [nudge, setNudge] = useState<{ code: string; fromName: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!userId || !invitesAvailable) {
      setInvites([]);
      return;
    }
    try {
      setInvites(await fetchInvites());
    } catch {
      // offline or not migrated yet: the list just stays empty
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
    if (!userId) return;
    const off = listenForInvites(userId, (p) => {
      setNudge({ code: p.code, fromName: p.fromName });
      void refresh();
    });
    const poll = window.setInterval(() => void refresh(), 30_000);
    return () => {
      off();
      window.clearInterval(poll);
    };
  }, [userId, refresh]);

  const decline = useCallback(
    async (inviteId: number) => {
      await respondInvite(inviteId, false).catch(() => undefined);
      setInvites((list) => list.filter((i) => i.invite_id !== inviteId));
    },
    [],
  );

  const accept = useCallback(
    async (inviteId: number) => {
      await respondInvite(inviteId, true).catch(() => undefined);
      setInvites((list) => list.filter((i) => i.invite_id !== inviteId));
    },
    [],
  );

  return { invites, nudge, clearNudge: () => setNudge(null), refresh, decline, accept };
}
