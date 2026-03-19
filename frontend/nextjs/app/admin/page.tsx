"use client";

import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { vaultAbi } from "../../lib/abis";
import { appConfig } from "../../lib/config";
import { AiDecisionHistoryItem, UserAction } from "../../lib/frontend-types";
import { signAdminPayload } from "../../lib/frontend-utils";
import { shortAddress } from "../../lib/format";
import { useWalletUi } from "../../lib/wallet-ui";

const readProvider = new JsonRpcProvider(appConfig.rpcUrl, { chainId: appConfig.chainId, name: appConfig.chainName }, { staticNetwork: true });

type AiDecisionDelta = {
  requester: string;
  latestId: string;
  latestAction: string;
  latestScore: number;
  previousScore: number | null;
  scoreDelta: number | null;
  postureChanged: boolean;
  actionChanged: boolean;
  autoQueueChanged: boolean;
  summary: string;
};

export default function AdminPage() {
  const [owner, setOwner] = useState<string | null>(null);
  const [aiOperator, setAiOperator] = useState<string | null>(null);
  const [actions, setActions] = useState<UserAction[]>([]);
  const [aiDecisions, setAiDecisions] = useState<AiDecisionHistoryItem[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [health, setHealth] = useState<{
    worker: {
      workerName: string;
      lastHeartbeatAt: number;
      lastActionId?: string | null;
      lastActionStatus?: string | null;
      lastError?: string | null;
    } | null;
    queue: {
      queued: number;
      processing: number;
      dispatched: number;
      settled: number;
      failed: number;
      total: number;
    } | null;
    sources: {
      userTotal: number;
      aiTotal: number;
      userPending: number;
      aiPending: number;
      userFailed: number;
      aiFailed: number;
      aiSettled: number;
    } | null;
  }>({ worker: null, queue: null, sources: null });
  const [relayer, setRelayer] = useState<{
    address?: string;
    free?: string;
    reserved?: string;
    nonce?: string;
    existentialDeposit?: string;
    warningThreshold?: string;
    connected: boolean;
    status: string;
    error?: string;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("Connect an admin wallet to access the queue monitor.");
  const walletUi = useWalletUi();
  const account = walletUi.account;
  const chainId = walletUi.chainId;

  const correctNetwork = chainId === appConfig.chainId;
  const isAdmin =
    !!account &&
    ((owner && account.toLowerCase() === owner.toLowerCase()) ||
      (aiOperator && account.toLowerCase() === aiOperator.toLowerCase()));
  const pendingExists = actions.some((item) =>
    ["queued", "processing", "dispatched"].includes(item.status)
  );
  const limit = 10;

  const getWalletProvider = useCallback(async () => {
    return new BrowserProvider(await walletUi.getEthereumProvider());
  }, [walletUi]);

  const switchNetwork = useCallback(async () => {
    await walletUi.switchChain(appConfig.chainId);
  }, [walletUi]);

  const loadAdminState = useCallback(async () => {
    const vault = new Contract(appConfig.vaultAddress, vaultAbi, readProvider);
    const [nextOwner, nextAi] = await Promise.all([vault.owner(), vault.aiOperator()]);
    setOwner(nextOwner);
    setAiOperator(nextAi);
  }, []);

  const loadActions = useCallback(async () => {
    if (!account || !isAdmin) {
      setActions([]);
      return;
    }

    const auth = await signAdminPayload(await getWalletProvider(), account, "actions-query");
    const response = await fetch("/api/admin/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...auth,
        status: statusFilter === "all" ? undefined : statusFilter,
        source: sourceFilter === "all" ? undefined : sourceFilter,
        limit,
        offset: page * limit
      })
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Unable to load admin actions");
    }
    setActions(payload.actions || []);
    setTotal(payload.total || 0);
  }, [account, getWalletProvider, isAdmin, page, sourceFilter, statusFilter]);

  const loadHealth = useCallback(async () => {
    if (!account || !isAdmin) {
      setHealth({ worker: null, queue: null, sources: null });
      return;
    }

    const auth = await signAdminPayload(await getWalletProvider(), account, "health-query");
    const response = await fetch("/api/admin/health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(auth)
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Unable to load admin health");
    }
    setHealth({
      worker: payload.worker || null,
      queue: payload.queue || null,
      sources: payload.sources || null
    });
  }, [account, getWalletProvider, isAdmin]);

  const loadRelayer = useCallback(async () => {
    if (!account || !isAdmin) {
      setRelayer(null);
      return;
    }

    const auth = await signAdminPayload(await getWalletProvider(), account, "relayer-status");
    const response = await fetch("/api/admin/relayer-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(auth)
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Unable to load relayer status");
    }
    setRelayer(payload.relayer || null);
  }, [account, getWalletProvider, isAdmin]);

  const loadAiDecisions = useCallback(async () => {
    if (!account || !isAdmin) {
      setAiDecisions([]);
      return;
    }

    const auth = await signAdminPayload(await getWalletProvider(), account, "ai-decisions-query");
    const response = await fetch("/api/admin/ai-decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...auth, limit: 8 })
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Unable to load AI snapshots");
    }
    setAiDecisions(payload.decisions || []);
  }, [account, getWalletProvider, isAdmin]);

  const retryAction = useCallback(
    async (id: string) => {
      if (!account) return;
      try {
        setBusy(id);
        const auth = await signAdminPayload(await getWalletProvider(), account, "retry-action");
        const response = await fetch(`/api/admin/actions/${id}/retry`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(auth)
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "Retry failed");
        }
        setMessage(`Action ${id} moved back to the queue.`);
        await loadActions();
      } catch (error: any) {
        setMessage(error?.message || "Retry failed.");
      } finally {
        setBusy(null);
      }
    },
    [account, getWalletProvider, loadActions]
  );

  useEffect(() => {
    void loadAdminState();
  }, [loadAdminState]);

  useEffect(() => {
    if (!isAdmin) {
      if (account) {
        setMessage("Connected wallet is not the vault owner or AI operator.");
      }
      return;
    }
    setMessage("Admin access granted.");
    void loadActions();
    void loadHealth();
    void loadRelayer();
    void loadAiDecisions();
  }, [account, isAdmin, loadActions, loadHealth, loadRelayer, loadAiDecisions]);

  useEffect(() => {
    if (!isAdmin || !pendingExists) return;
    const timer = window.setInterval(() => {
      void loadActions();
      void loadHealth();
      void loadRelayer();
      void loadAiDecisions();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [isAdmin, loadActions, loadHealth, loadRelayer, loadAiDecisions, pendingExists]);

  const heading = useMemo(() => {
    if (!account) return "Admin access";
    if (!correctNetwork) return "Switch to Polkadot Hub TestNet";
    if (!isAdmin) return "Unauthorized wallet";
    return "Queue monitor";
  }, [account, correctNetwork, isAdmin]);

  const aiDecisionDeltas = useMemo<AiDecisionDelta[]>(() => {
    const grouped = new Map<string, AiDecisionHistoryItem[]>();

    for (const decision of aiDecisions) {
      const key = decision.requester.toLowerCase();
      const current = grouped.get(key) || [];
      current.push(decision);
      grouped.set(key, current);
    }

    return Array.from(grouped.entries())
      .map(([requester, decisions]) => {
        const ordered = [...decisions].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        const latest = ordered[0];
        const previous = ordered[1];

        const scoreDelta = previous ? latest.score - previous.score : null;
        const postureChanged = previous ? latest.posture !== previous.posture : false;
        const actionChanged = previous ? latest.action !== previous.action : false;
        const autoQueueChanged = previous
          ? latest.autoQueueEligible !== previous.autoQueueEligible
          : false;

        const notes: string[] = [];
        if (scoreDelta !== null && scoreDelta !== 0) {
          notes.push(`score ${scoreDelta > 0 ? "+" : ""}${scoreDelta}`);
        }
        if (actionChanged && previous) {
          notes.push(`action ${previous.action} -> ${latest.action}`);
        }
        if (postureChanged && previous) {
          notes.push(`posture ${previous.posture} -> ${latest.posture}`);
        }
        if (autoQueueChanged) {
          notes.push(
            latest.autoQueueEligible ? "auto-queue became eligible" : "auto-queue now requires review"
          );
        }

        return {
          requester,
          latestId: latest.id,
          latestAction: latest.action,
          latestScore: latest.score,
          previousScore: previous?.score ?? null,
          scoreDelta,
          postureChanged,
          actionChanged,
          autoQueueChanged,
          summary: notes.join(" | ") || "No material change from the previous snapshot."
        };
      })
      .sort((a, b) => {
        const aMagnitude = Math.abs(a.scoreDelta ?? 0) + (a.actionChanged ? 5 : 0) + (a.autoQueueChanged ? 3 : 0);
        const bMagnitude = Math.abs(b.scoreDelta ?? 0) + (b.actionChanged ? 5 : 0) + (b.autoQueueChanged ? 3 : 0);
        return bMagnitude - aMagnitude;
      })
      .slice(0, 6);
  }, [aiDecisions]);

  return (
    <main className="app-shell admin-shell">
      <header className="topbar">
        <div>
          <p className="kicker">StableVault Admin</p>
          <h1>{heading}</h1>
        </div>
        <div className="topbar-actions">
          {!account ? (
            <button className="primary" onClick={walletUi.connect}>
              Connect Admin Wallet
            </button>
          ) : !correctNetwork ? (
            <button className="primary" onClick={switchNetwork}>
              Switch Network
            </button>
          ) : (
            <button className="primary" onClick={() => loadActions()}>
              Refresh Queue
            </button>
          )}
          <Link className="secondaryLink" href="/">
            Back To Vault
          </Link>
        </div>
      </header>

      <section className="status-strip">
        <div className="status-chip">
          <span>Wallet</span>
          <strong>{shortAddress(account)}</strong>
        </div>
        <div className={`status-chip ${isAdmin ? "good" : "warn"}`}>
          <span>Role</span>
          <strong>{isAdmin ? "Admin" : "User"}</strong>
        </div>
        <div className={`status-chip ${correctNetwork ? "good" : "warn"}`}>
          <span>Network</span>
          <strong>{correctNetwork ? appConfig.chainName : "Wrong network"}</strong>
        </div>
        <div className="status-chip">
          <span>Vault</span>
          <strong>{shortAddress(appConfig.vaultAddress)}</strong>
        </div>
      </section>

      {isAdmin ? (
        <section className="summary-grid admin-summary">
          <Metric
            label="Queued"
            value={String(health.queue?.queued ?? 0)}
          />
          <Metric
            label="Processing"
            value={String(health.queue?.processing ?? 0)}
          />
          <Metric
            label="Dispatched"
            value={String(health.queue?.dispatched ?? 0)}
          />
          <Metric
            label="Failed"
            value={String(health.queue?.failed ?? 0)}
          />
          <Metric
            label="Settled"
            value={String(health.queue?.settled ?? 0)}
          />
          <Metric
            label="Worker"
            value={health.worker?.lastActionStatus || "unknown"}
          />
          <Metric
            label="AI Actions"
            value={String(health.sources?.aiTotal ?? 0)}
          />
          <Metric
            label="AI Pending"
            value={String(health.sources?.aiPending ?? 0)}
          />
          <Metric
            label="AI Failed"
            value={String(health.sources?.aiFailed ?? 0)}
          />
          <Metric
            label="AI Settled"
            value={String(health.sources?.aiSettled ?? 0)}
          />
        </section>
      ) : null}

      <section className="dashboard-grid">
        <article className="panel span-2">
          <div className="panel-head">
            <div>
              <h2>Queue Monitor</h2>
              <p>All cross-chain actions across the system.</p>
            </div>
            <div className="button-row">
              <button
                className={statusFilter === "all" ? "primary compact" : "secondary compact"}
                onClick={() => {
                  setStatusFilter("all");
                  setPage(0);
                }}
              >
                All
              </button>
              <button
                className={statusFilter === "queued" ? "primary compact" : "secondary compact"}
                onClick={() => {
                  setStatusFilter("queued");
                  setPage(0);
                }}
              >
                Queued
              </button>
              <button
                className={statusFilter === "failed" ? "primary compact" : "secondary compact"}
                onClick={() => {
                  setStatusFilter("failed");
                  setPage(0);
                }}
              >
                Failed
              </button>
              <button
                className={statusFilter === "settled" ? "primary compact" : "secondary compact"}
                onClick={() => {
                  setStatusFilter("settled");
                  setPage(0);
                }}
              >
                Settled
              </button>
              <button
                className={sourceFilter === "all" ? "primary compact" : "secondary compact"}
                onClick={() => {
                  setSourceFilter("all");
                  setPage(0);
                }}
              >
                All Sources
              </button>
              <button
                className={sourceFilter === "user" ? "primary compact" : "secondary compact"}
                onClick={() => {
                  setSourceFilter("user");
                  setPage(0);
                }}
              >
                User
              </button>
              <button
                className={sourceFilter === "ai" ? "primary compact" : "secondary compact"}
                onClick={() => {
                  setSourceFilter("ai");
                  setPage(0);
                }}
              >
                AI
              </button>
            </div>
          </div>
          <div className="activity-table">
            <div className="activity-row activity-head admin-grid">
              <span>Source</span>
              <span>Status</span>
              <span>Requester</span>
              <span>Amount</span>
              <span>Origin Tx</span>
              <span>Admin</span>
            </div>
            {!isAdmin ? (
              <div className="activity-empty">{message}</div>
            ) : actions.length === 0 ? (
              <div className="activity-empty">No actions in the queue yet.</div>
            ) : (
              actions.map((action) => (
                <div className="activity-row admin-grid" key={action.id}>
                  <span>
                    <span className={`badge-inline ${action.source || "user"}`}>{action.source || "user"}</span>
                  </span>
                  <span>
                    <span className={`action-badge ${action.status}`}>{action.status}</span>
                  </span>
                  <span>
                    <Link className="inline-link" href={`/admin/actions/${action.id}`}>
                      {shortAddress(action.requester)}
                    </Link>
                  </span>
                  <span>{action.amountDisplay} PAS</span>
                  <span>
                    {action.originTxHash ? (
                      <a
                        className="inline-link"
                        href={`${appConfig.explorerUrl}/tx/${action.originTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortAddress(action.originTxHash)}
                      </a>
                    ) : (
                      "--"
                    )}
                  </span>
                  <span>
                    {action.status === "failed" ? (
                      <button
                        className="secondary compact"
                        disabled={busy === action.id}
                        onClick={() => retryAction(action.id)}
                      >
                        {busy === action.id ? "Retrying..." : "Retry"}
                      </button>
                    ) : (
                      "--"
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
          {isAdmin ? (
            <div className="button-row top-gap">
              <button
                className="secondary compact"
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                Previous
              </button>
              <button
                className="secondary compact"
                disabled={(page + 1) * limit >= total}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </article>

        <article className="panel span-2">
          <div className="panel-head">
            <div>
              <h2>AI Recommendation Snapshots</h2>
              <p>Latest AI decisions, posture, and auto-queue eligibility.</p>
            </div>
          </div>
          <div className="activity-table">
            <div className="activity-row activity-head admin-ai-grid">
              <span>Requester</span>
              <span>Action</span>
              <span>Score</span>
              <span>Posture</span>
              <span>Auto-Queue</span>
              <span>Linked Action</span>
            </div>
            {!isAdmin ? (
              <div className="activity-empty">{message}</div>
            ) : aiDecisions.length === 0 ? (
              <div className="activity-empty">No AI snapshots recorded yet.</div>
            ) : (
              aiDecisions.map((decision) => (
                <div className="activity-row admin-ai-grid" key={decision.id}>
                  <span>{shortAddress(decision.requester)}</span>
                  <span className={`badge-inline ${decision.action}`}>{decision.action}</span>
                  <span>{decision.score}/100</span>
                  <span className={`badge-inline ${decision.posture}`}>{decision.posture}</span>
                  <span className={`badge-inline ${decision.autoQueueEligible ? "healthy" : "guarded"}`}>
                    {decision.autoQueueEligible ? "eligible" : "review"}
                  </span>
                  <span>
                    {decision.linkedActionId ? (
                      <Link className="inline-link" href={`/admin/actions/${decision.linkedActionId}`}>
                        {shortAddress(decision.linkedActionId)}
                      </Link>
                    ) : (
                      "--"
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="panel span-2">
          <div className="panel-head">
            <div>
              <h2>AI Decision Delta</h2>
              <p>What changed between the latest and previous AI snapshots for each requester.</p>
            </div>
          </div>
          <div className="activity-table">
            <div className="activity-row activity-head admin-grid">
              <span>Requester</span>
              <span>Latest Action</span>
              <span>Score</span>
              <span>Delta</span>
              <span>Summary</span>
            </div>
            {!isAdmin ? (
              <div className="activity-empty">{message}</div>
            ) : aiDecisionDeltas.length === 0 ? (
              <div className="activity-empty">Not enough AI history yet to compute decision deltas.</div>
            ) : (
              aiDecisionDeltas.map((delta) => (
                <div className="activity-row admin-grid" key={delta.latestId}>
                  <span>{shortAddress(delta.requester)}</span>
                  <span className={`badge-inline ${delta.latestAction}`}>{delta.latestAction}</span>
                  <span>{delta.latestScore}/100</span>
                  <span>{delta.scoreDelta === null ? "--" : `${delta.scoreDelta > 0 ? "+" : ""}${delta.scoreDelta}`}</span>
                  <span>{delta.summary}</span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>Relayer Health</h2>
              <p>Worker heartbeat and latest processing state.</p>
            </div>
          </div>
          <div className="strategy-box">
            <div className="strategy-line">
              <span>Owner</span>
              <strong>{shortAddress(owner)}</strong>
            </div>
            <div className="strategy-line">
              <span>AI Operator</span>
              <strong>{shortAddress(aiOperator)}</strong>
            </div>
            <div className="strategy-line">
              <span>Last heartbeat</span>
              <strong>
                {health.worker?.lastHeartbeatAt
                  ? new Date(health.worker.lastHeartbeatAt).toLocaleString()
                  : "--"}
              </strong>
            </div>
            <div className="strategy-line">
              <span>Last action</span>
              <strong>{shortAddress(health.worker?.lastActionId)}</strong>
            </div>
            <div className="strategy-line">
              <span>Worker status</span>
              <strong>{health.worker?.lastActionStatus || "--"}</strong>
            </div>
            <div className="strategy-line">
              <span>Relayer connection</span>
              <strong>{relayer?.connected ? "online" : "offline"}</strong>
            </div>
            <div className="strategy-line">
              <span>Relayer funds</span>
              <strong>{relayer?.status || "--"}</strong>
            </div>
            <div className="strategy-line">
              <span>Relayer balance</span>
              <strong>{relayer?.free || "--"}</strong>
            </div>
          </div>
          <div className="log-box top-gap">
            <strong>Worker diagnostics</strong>
            <pre>{relayer?.error || health.worker?.lastError || message}</pre>
          </div>
        </article>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
