"use client";

import { BrowserProvider } from "ethers";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { appConfig } from "../../../../lib/config";
import { UserAction } from "../../../../lib/frontend-types";
import { signAdminPayload } from "../../../../lib/frontend-utils";
import { shortAddress } from "../../../../lib/format";
import { useWalletUi } from "../../../../lib/wallet-ui";

type ActionDetail = UserAction & {
  requester?: string;
  originBlockHash?: string;
  originEvents?: string[];
  beforeBalance?: string;
  afterBalance?: string;
  updatedAt?: string;
};

export default function AdminActionDetail({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const [id, setId] = useState<string>("");
  const [action, setAction] = useState<ActionDetail | null>(null);
  const [message, setMessage] = useState("Connect an admin wallet to inspect this action.");
  const walletUi = useWalletUi();
  const account = walletUi.account;
  const chainId = walletUi.chainId;

  useEffect(() => {
    params.then((value) => setId(value.id));
  }, [params]);

  const correctNetwork = chainId === appConfig.chainId;

  const getWalletProvider = useCallback(async () => {
    return new BrowserProvider(await walletUi.getEthereumProvider());
  }, [walletUi]);

  const switchNetwork = useCallback(async () => {
    await walletUi.switchChain(appConfig.chainId);
  }, [walletUi]);

  const loadDetail = useCallback(async () => {
    if (!account || !id) return;
    const auth = await signAdminPayload(await getWalletProvider(), account, "action-detail");
    const response = await fetch(`/api/admin/actions/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(auth)
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Unable to load action detail");
    }
    setAction(payload.action);
    setMessage("Action detail loaded.");
  }, [account, getWalletProvider, id]);

  useEffect(() => {
    if (!account || !correctNetwork || !id) return;
    void loadDetail().catch((error) => {
      setMessage(error?.message || "Unable to load action detail.");
    });
  }, [account, correctNetwork, id, loadDetail]);

  const statusTone = useMemo(() => action?.status || "queued", [action?.status]);

  return (
    <main className="app-shell admin-shell">
      <header className="topbar">
        <div>
          <p className="kicker">StableVault Admin</p>
          <h1>Action Detail</h1>
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
            <button className="primary" onClick={() => void loadDetail()}>
              Refresh Detail
            </button>
          )}
          <Link className="secondaryLink" href="/admin">
            Back To Admin
          </Link>
        </div>
      </header>

      <section className="status-strip">
        <div className="status-chip">
          <span>Action ID</span>
          <strong>{shortAddress(id)}</strong>
        </div>
        <div className="status-chip">
          <span>Status</span>
          <strong className={`badge-inline ${statusTone}`}>{action?.status || "--"}</strong>
        </div>
        <div className="status-chip">
          <span>Requester</span>
          <strong>{shortAddress(action?.requester)}</strong>
        </div>
        <div className="status-chip">
          <span>Beneficiary</span>
          <strong>{shortAddress(action?.beneficiary)}</strong>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel span-2">
          <div className="panel-head">
            <div>
              <h2>Lifecycle</h2>
              <p>Origin transaction, destination balance check, and failure context.</p>
            </div>
          </div>
          <div className="data-grid">
            <DataLine label="Created" value={action?.createdAt || "--"} />
            <DataLine label="Updated" value={action?.updatedAt || "--"} />
            <DataLine label="Source" value={action?.source || "--"} />
            <DataLine label="Amount" value={action ? `${action.amountDisplay} PAS` : "--"} />
            <DataLine label="Before balance" value={action?.beforeBalance || "--"} />
            <DataLine label="After balance" value={action?.afterBalance || "--"} />
            <DataLine label="Origin block" value={action?.originBlockHash || "--"} />
          </div>
          <div className="log-box top-gap">
            <strong>Origin events</strong>
            <pre>{action?.originEvents?.join("\n") || "No events captured yet."}</pre>
          </div>
          <div className="log-box top-gap">
            <strong>Failure / diagnostic</strong>
            <pre>{action?.error || "No failure recorded."}</pre>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>References</h2>
              <p>Explorer links and record metadata for this teleport.</p>
            </div>
          </div>
          <div className="strategy-box">
            <div className="strategy-line">
              <span>Origin tx</span>
              <strong>
                {action?.originTxHash ? (
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
              </strong>
            </div>
          </div>
          <div className="log-box top-gap">
            <strong>Admin status</strong>
            <pre>{message}</pre>
          </div>
        </article>
      </section>
    </main>
  );
}

function DataLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="data-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
