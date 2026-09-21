'use client';

import { useSyncExternalStore, useMemo } from 'react';
import { PING_CLIENT_ID, PING_WELLKNOWN } from './config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export type FlowStatus = 'idle' | 'loading' | 'continue' | 'success' | 'failed';

export interface DavinciFlowState {
  status: FlowStatus;
  collectors: Any[];
  errorText: string | null;
  start: () => Promise<void>;
  submit: (values: Record<string, string>) => Promise<void>;
  chooseFlow: (collector: Any) => Promise<void>;
}

const GENERIC_FAILURE = 'Ping sign-in hit a snag. Try again or use the email code.';
const PASSKEY_WRONG_HOST =
  'Passkeys only work on connectyall.timnan.xyz — use your password here, or sign in on the live site.';

// Collectors that carry no user-facing UI — never rendered.
const HIDDEN_COLLECTORS = new Set(['ProtectCollector', 'MetadataCollector']);

function redirectUri(): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost:3000';
  return origin + '/api/auth/oauth2/callback/pingone';
}

/**
 * Plain async state machine wrapping @forgerock/davinci-client's orchestration
 * loop. Framework-free so it can be unit tested without a DOM. The React hook
 * below is a thin subscription wrapper.
 */
export class DavinciFlow {
  state: DavinciFlowState;
  private client: Any = null;
  private starting = false;
  private fidoInFlight = false;
  private listeners = new Set<() => void>();

  constructor() {
    this.state = {
      status: 'idle',
      collectors: [],
      errorText: null,
      start: this.start,
      submit: this.submit,
      chooseFlow: this.chooseFlow,
    };
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit() {
    // fresh object so useSyncExternalStore sees a new reference
    this.state = { ...this.state };
    this.listeners.forEach((l) => l());
  }

  private patch(partial: Partial<DavinciFlowState>) {
    Object.assign(this.state, partial);
    this.emit();
  }

  private visibleCollectors(): Any[] {
    const all = (this.client?.getCollectors?.() ?? []) as Any[];
    return all.filter((c) => !HIDDEN_COLLECTORS.has(c?.type));
  }

  private applyNode(node: Any) {
    if (node?.status === 'success') {
      this.patch({ status: 'success', collectors: [], errorText: null });
    } else if (node?.status === 'continue') {
      this.fidoInFlight = false; // fresh node: allow one auto-run
      this.patch({ status: 'continue', collectors: this.visibleCollectors(), errorText: null });
      this.maybeAutoFido();
    } else {
      this.patch({ status: 'failed', collectors: [], errorText: GENERIC_FAILURE });
    }
  }

  // A FidoAuthenticationCollector is an auto-collector: the node carries no
  // submit button, so nothing would ever trigger the WebAuthn ceremony. Kick
  // it off automatically, exactly once per node.
  private maybeAutoFido() {
    if (this.fidoInFlight) return;
    const fidoCol = this.state.collectors.find(
      (c) => c?.type === 'FidoAuthenticationCollector',
    );
    if (!fidoCol) return;
    this.fidoInFlight = true;
    void this.autoSubmitFido(fidoCol);
  }

  private async autoSubmitFido(col: Any): Promise<void> {
    if (!this.client) return;
    this.patch({ errorText: null });
    const ok = await this.runFido(col);
    if (!ok) return; // SecurityError: stay on 'continue' with friendly message
    // Fire-and-forget: a throw from next() here would otherwise be swallowed
    // and freeze the flow on 'continue'. Surface it as a recoverable failure.
    try {
      const node = await this.client.next();
      if (node?.status === 'error' && node?.internalHttpStatus === 401) {
        await this.restart();
        return;
      }
      this.applyNode(node);
    } catch {
      this.patch({ status: 'failed', errorText: GENERIC_FAILURE });
    }
  }

  // Runs the WebAuthn ceremony for a FidoAuthenticationCollector and hands the
  // result back to the client. Returns false (leaving status 'continue' with a
  // friendly message) when the ceremony fails with a SecurityError — usually a
  // wrong-host passkey attempt. Returns true when the client was updated and
  // the caller should advance via next().
  private async runFido(col: Any): Promise<boolean> {
    const { fido } = await import('@forgerock/davinci-client');
    let result: Any;
    try {
      result = await fido().authenticate(
        col.output?.config?.publicKeyCredentialRequestOptions ?? col.output?.config,
      );
    } catch (err) {
      result = err; // a thrown DOMException is handled like a returned error below
    }
    if (
      result &&
      typeof result === 'object' &&
      ((result as Any).code === 'SecurityError' || (result as Any).name === 'SecurityError')
    ) {
      this.patch({ errorText: PASSKEY_WRONG_HOST });
      return false; // do NOT call next
    }
    this.client.update(col)(result);
    return true;
  }

  start = async (): Promise<void> => {
    // A failed node leaves a dead client set; clear it so TRY AGAIN restarts.
    if (this.state.status === 'failed') this.client = null;
    // Guard: no-op while a flow is live or currently spinning up.
    if (this.starting || this.client) return;
    this.starting = true;
    this.patch({ status: 'loading', errorText: null, collectors: [] });
    try {
      const { davinci } = await import('@forgerock/davinci-client');
      this.client = await davinci({
        config: {
          clientId: PING_CLIENT_ID,
          responseType: 'code',
          scope: 'openid profile email',
          redirectUri: redirectUri(),
          serverConfig: { wellknown: PING_WELLKNOWN },
        },
      } as Any);
      const node = await this.client.start();
      this.applyNode(node);
    } catch {
      this.patch({ status: 'failed', errorText: GENERIC_FAILURE });
    } finally {
      this.starting = false;
    }
  };

  // Force a fresh client (used for the single 401 retry).
  private async restart(): Promise<void> {
    this.client = null;
    await this.start();
  }

  submit = async (values: Record<string, string>): Promise<void> => {
    if (!this.client) return;
    this.patch({ errorText: null });
    const collectors = (this.client.getCollectors?.() ?? []) as Any[];

    for (const col of collectors) {
      if (col.type === 'FidoAuthenticationCollector') {
        const ok = await this.runFido(col);
        if (!ok) return; // SecurityError: friendly message, do NOT call next
        continue;
      }
      const key = col.output?.key;
      if (key && values[key] !== undefined) {
        this.client.update(col)(values[key]);
      }
    }

    const node = await this.client.next();
    if (node?.status === 'error' && node?.internalHttpStatus === 401) {
      await this.restart(); // exactly one automatic retry
      return;
    }
    this.applyNode(node);
  };

  chooseFlow = async (collector: Any): Promise<void> => {
    if (!this.client) return;
    this.patch({ errorText: null });
    this.client.update(collector)(collector);
    const node = await this.client.next();
    this.applyNode(node);
  };
}

const SERVER_STATE: DavinciFlowState = {
  status: 'idle',
  collectors: [],
  errorText: null,
  start: async () => {},
  submit: async () => {},
  chooseFlow: async () => {},
};

export function useDavinciFlow(): DavinciFlowState {
  const flow = useMemo(() => new DavinciFlow(), []);
  return useSyncExternalStore(
    flow.subscribe,
    () => flow.state,
    () => SERVER_STATE,
  );
}
