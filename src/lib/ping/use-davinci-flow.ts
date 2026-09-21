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
const passkeyWrongHost = () =>
  `Passkeys only work on connectyall.timnan.xyz — this is ${
    typeof window !== 'undefined' ? window.location.host : 'another host'
  }. Use your password here, or sign in on the live site.`;
const PASSKEY_CANCELLED =
  'Passkey prompt was cancelled or timed out. Try again or use the email code.';

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
  private fidoCancelAttempted = false;
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
    } else if (node?.status === 'error') {
      // Recoverable per the SDK contract (ErrorNode keeps its collectors):
      // e.g. wrong password comes back as a 400 with a user-facing message.
      // Keep the form up and show the message inline. No auto-fido here — a
      // rejected ceremony re-running itself would loop.
      const collectors = this.visibleCollectors();
      const message = node?.error?.message || GENERIC_FAILURE;
      if (collectors.length > 0) {
        this.patch({ status: 'continue', collectors, errorText: message });
      } else {
        this.patch({ status: 'failed', collectors: [], errorText: message });
      }
    } else {
      // 'failure' (fatal) or anything unrecognized
      this.patch({
        status: 'failed',
        collectors: [],
        errorText: node?.error?.message || GENERIC_FAILURE,
      });
    }
  }

  // The session-expired 401 rides on different fields depending on the path;
  // check all the shapes the SDK emits.
  private isExpired401(node: Any): boolean {
    return (
      node?.status === 'error' &&
      (node?.internalHttpStatus === 401 ||
        node?.error?.internalHttpStatus === 401 ||
        node?.httpStatus === 401)
    );
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
    if (!ok) {
      // Passkeys are retired: a SecurityError here usually means a legacy
      // device enrolled under the old RP-ID (pingone.ca). If the node offers
      // a cancel link, take it so the flow falls back to another method
      // instead of stranding the user on an unusable ceremony.
      const cancel = this.state.collectors.find(
        (c: Any) =>
          c?.type === 'FlowCollector' &&
          /cancel/i.test(`${c?.output?.key ?? ''} ${c?.output?.label ?? ''}`),
      );
      if (
        cancel &&
        !this.fidoCancelAttempted &&
        this.state.errorText !== PASSKEY_CANCELLED
      ) {
        this.fidoCancelAttempted = true; // once per flow: no cancel->fido loop
        await this.chooseFlow(cancel);
      }
      return;
    }
    // Fire-and-forget: a throw from next() here would otherwise be swallowed
    // and freeze the flow on 'continue'. Surface it as a recoverable failure.
    try {
      const node = await this.client.next();
      if (this.isExpired401(node)) {
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
      this.patch({ errorText: passkeyWrongHost() });
      return false; // do NOT call next
    }
    if (
      result &&
      typeof result === 'object' &&
      ((result as Any).code === 'NotAllowedError' || (result as Any).name === 'NotAllowedError')
    ) {
      // User dismissed the prompt or it timed out. The fido node has no
      // re-trigger button, so land on the failed screen (TRY AGAIN restarts)
      // with a message that says what actually happened.
      this.patch({ status: 'failed', collectors: [], errorText: PASSKEY_CANCELLED });
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
    this.fidoCancelAttempted = false;
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
    if (this.isExpired401(node)) {
      await this.restart(); // exactly one automatic retry
      return;
    }
    this.applyNode(node);
  };

  // FlowCollectors (passkey / register / recovery links) go through the SDK's
  // dedicated flow() initiator — update()+next() posts them as form data and
  // DaVinci rejects it with "Validation Error".
  chooseFlow = async (collector: Any): Promise<void> => {
    if (!this.client) return;
    this.patch({ errorText: null });
    try {
      const node = await this.client.flow({ action: collector.output?.key })();
      if (node?.type === 'internal_error') {
        this.patch({ status: 'failed', collectors: [], errorText: GENERIC_FAILURE });
        return;
      }
      if (this.isExpired401(node)) {
        await this.restart();
        return;
      }
      this.applyNode(node);
    } catch {
      this.patch({ status: 'failed', collectors: [], errorText: GENERIC_FAILURE });
    }
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
