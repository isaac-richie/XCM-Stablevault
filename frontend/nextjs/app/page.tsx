"use client";

import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";
import Link from "next/link";
import { decodeAddress } from "@polkadot/util-crypto";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mockUsdAbi, vaultAbi, wpasAbi } from "../lib/abis";
import { appConfig } from "../lib/config";
import type {
  AiDecisionHistoryItem,
  AiExplanationState,
  AiRecommendationView,
  DashboardState,
  LogBox,
  ToastState,
  UserAction
} from "../lib/frontend-types";
import { formatCompact, formatToken, parseAmount, safeFormatUnits, shortAddress } from "../lib/format";
import { useWalletUi } from "../lib/wallet-ui";

// Shared read-only provider for public dashboard reads. Transactions always use the
// Privy-selected wallet signer instead, so this provider can stay static.
const readProvider = new JsonRpcProvider(appConfig.rpcUrl, { chainId: appConfig.chainId, name: appConfig.chainName }, { staticNetwork: true });
const SUPPRESS_WALLET_KEY = "stablevault:suppress-wallet";
const XCM_PRECOMPILE_ADDRESS = "0x00000000000000000000000000000000000a0000";
const xcmPrecompileAbi = [
  "function send(bytes destination, bytes message)"
];


const initialState: DashboardState = {
  nativeBalance: null,
  wpasBalance: null,
  vaultShares: null,
  vaultSupply: null,
  vaultCollateral: null,
  mockUsdSupply: null,
  mockUsdBalance: null,
  stableDebt: null,
  maxMintable: null,
  pendingRewards: null,
  projectedYearlyRewards: null,
  rewardRateBps: null,
  collateralFactorBps: null,
  allowance: null,
  stableAllowance: null,
  collateralToken: null,
  owner: null,
  aiOperator: null,
  paused: null
};

const primaryNav = [
  { label: "Portfolio", href: "#portfolio", accent: true },
  { label: "Earn", href: "#earn", comingSoon: true },
  { label: "Points", href: "#points", comingSoon: true }
];

const moreNav = [
  { label: "Analytics", href: "#analytics" },
  { label: "Bridge", href: "#bridge" }
];


function getWalletErrorMessage(error: any) {
  const nested =
    error?.info?.error?.message ||
    error?.error?.message ||
    error?.cause?.message ||
    error?.data?.message ||
    error?.details;
  const message = nested || error?.shortMessage || error?.message || "Request failed.";
  const normalized = String(message).toLowerCase();

  if (
    error?.name === "UserRejectedRequestError" ||
    normalized.includes("user rejected") ||
    normalized.includes("rejected the request") ||
    normalized.includes("user denied")
  ) {
    return "Request cancelled in wallet. No changes were made.";
  }

  if (normalized.includes("could not coalesce error")) {
    return "RPC rejected the teleport payload. Check destination format and retry with a small amount (for example 1 PAS).";
  }

  return message;
}

async function getEthersSigner(walletUi: ReturnType<typeof useWalletUi>, account: string) {
  const provider = new BrowserProvider(await walletUi.getEthereumProvider());
  return provider.getSigner(account);
}

function formatApyBps(value: bigint | null | undefined) {
  if (value == null) return "--";
  return `${(Number(value) / 100).toFixed(2)}%`;
}

async function readJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();

  // Several background routes can fail with a rendered HTML error page in dev.
  // We guard that here so successful user transactions do not look "failed"
  // just because a secondary panel refresh returned non-JSON.
  if (!contentType.includes("application/json")) {
    throw new Error(raw || `Request failed with status ${response.status}`);
  }

  return JSON.parse(raw);
}

function formatMaxAmount(value: bigint | null | undefined) {
  if (value == null) return "";
  const formatted = safeFormatUnits(value);
  return formatted.replace(/\.?0+$/, "").replace(/\.$/, "");
}

function isLikelySs58(value: string) {
  const trimmed = value.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{20,}$/.test(trimmed)) return false;
  try {
    return decodeAddress(trimmed).length === 32;
  } catch {
    return false;
  }
}

export default function Page() {
  const [state, setState] = useState<DashboardState>(initialState);
  const [wrapAmount, setWrapAmount] = useState("0.25");
  const [unwrapAmount, setUnwrapAmount] = useState("0.10");
  const [depositAmount, setDepositAmount] = useState("0.25");
  const [withdrawAmount, setWithdrawAmount] = useState("0.10");
  const [mintAmount, setMintAmount] = useState("0.10");
  const [repayAmount, setRepayAmount] = useState("0.10");
  const [teleportAmount, setTeleportAmount] = useState("10");
  const [beneficiary, setBeneficiary] = useState(appConfig.peopleBeneficiary || "");
  const [actions, setActions] = useState<UserAction[]>([]);
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedAction, setSelectedAction] = useState<UserAction | null>(null);
  const [aiRecommendation, setAiRecommendation] = useState<AiRecommendationView | null>(null);
  const [aiHistory, setAiHistory] = useState<AiDecisionHistoryItem[]>([]);
  const [aiExplanation, setAiExplanation] = useState<AiExplanationState>(null);
  const [appliedAiDecisionId, setAppliedAiDecisionId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [autoSwitching, setAutoSwitching] = useState(false);
  const [autoSwitchAttempted, setAutoSwitchAttempted] = useState<string | null>(null);
  const [log, setLog] = useState<LogBox>({
    title: "Vault ready",
    body: "Connect a wallet, then wrap and deposit WPAS.",
    kind: "idle"
  });
  const [logDismissed, setLogDismissed] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [activeVaultAction, setActiveVaultAction] = useState<"supply" | "borrow" | "repay" | "withdraw">("supply");

  const [walletSuppressed, setWalletSuppressed] = useState(false);

  const moreRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const walletUi = useWalletUi();
  const account = walletUi.account;
  const chainId = walletUi.chainId;

  const walletReady = walletUi.connected && Boolean(account);
  const walletBooting = walletUi.enabled && !walletUi.ready;
  const authenticated = walletUi.authenticated;
  // We treat "wallet restored by provider" and "wallet approved for this app session"
  // as separate states. This prevents silent reuse of the wrong wallet after reconnects.
  const walletSessionReady = walletReady && !walletSuppressed;
  const activeSessionAccount = walletSessionReady ? account : null;
  const correctNetwork = chainId === appConfig.chainId;
  const autoSwitchKey = account ? `${account.toLowerCase()}:${chainId ?? "none"}` : null;
  const isAdmin =
    !!account &&
    ((state.owner && account.toLowerCase() === state.owner.toLowerCase()) ||
      (state.aiOperator && account.toLowerCase() === state.aiOperator.toLowerCase()));

  const pushToast = useCallback((title: string, body: string, kind: ToastState["kind"]) => {
    const nextToast: ToastState = {
      id: `${Date.now()}`,
      title,
      body,
      kind
    };

    setToast(nextToast);
    window.setTimeout(() => {
      setToast((current) => (current?.id === nextToast.id ? null : current));
    }, 4200);
  }, []);

  const showComingSoon = useCallback(
    (label: string) => {
      pushToast(label, `${label} is coming soon. We left the navigation in place so this surface is ready for the next release.`, "success");
    },
    [pushToast]
  );

  const loadActions = useCallback(async (requester?: string | null) => {
    const activeRequester = requester || activeSessionAccount;
    if (!activeRequester) {
      setActions([]);
      return;
    }

    try {
      const statusQuery = selectedStatus === "all" ? "" : `&status=${selectedStatus}`;
      const response = await fetch(`/api/actions?requester=${activeRequester}${statusQuery}`);
      const payload = await readJsonResponse(response);
      setActions(payload.actions || []);
    } catch {
      setActions([]);
    }
  }, [activeSessionAccount, selectedStatus]);

  const loadAiRecommendation = useCallback(async (requester?: string | null) => {
    const activeRequester = requester || activeSessionAccount;
    if (!activeRequester) {
      setAiRecommendation(null);
      return;
    }

    try {
      const response = await fetch(`/api/ai/recommendation?requester=${activeRequester}`);
      const payload = await readJsonResponse(response);
      if (response.ok && payload.ok) {
        setAiRecommendation(payload.recommendation || null);
      }
    } catch {
      setAiRecommendation(null);
    }
  }, [activeSessionAccount]);

  const loadAiHistory = useCallback(async (requester?: string | null) => {
    const activeRequester = requester || activeSessionAccount;
    if (!activeRequester) {
      setAiHistory([]);
      return;
    }

    try {
      const response = await fetch(`/api/ai/history?requester=${activeRequester}&limit=6`);
      const payload = await readJsonResponse(response);
      if (response.ok && payload.ok) {
        setAiHistory(payload.decisions || []);
      }
    } catch {
      setAiHistory([]);
    }
  }, [activeSessionAccount]);

  const loadAiExplanation = useCallback(async (requester?: string | null) => {
    const activeRequester = requester || activeSessionAccount;
    if (!activeRequester) {
      setAiExplanation(null);
      return;
    }

    try {
      const response = await fetch(`/api/ai/explanation?requester=${activeRequester}`);
      const payload = await readJsonResponse(response);
      if (response.ok && payload.ok) {
        setAiExplanation({
          source: payload.source,
          body: payload.explanation
        });
      }
    } catch {
      setAiExplanation(null);
    }
  }, [activeSessionAccount]);

  const hasPendingActions = actions.some((item) =>
    ["queued", "processing", "dispatched"].includes(item.status)
  );
  const normalizedBeneficiary = beneficiary.trim();
  const beneficiaryValid = isLikelySs58(normalizedBeneficiary);

  // Withdrawals are debt-aware: once a user borrows mUSD, part of their collateral
  // becomes locked until the position is repaid back into a safe state.
  const maxWithdrawable = useMemo(() => {
    if (state.vaultShares == null) return null;
    if (state.stableDebt == null || state.collateralFactorBps == null) return state.vaultShares;
    if (state.stableDebt === 0n) return state.vaultShares;
    if (state.collateralFactorBps === 0n) return 0n;

    const requiredCollateral = (state.stableDebt * 10_000n + state.collateralFactorBps - 1n) / state.collateralFactorBps;
    if (requiredCollateral >= state.vaultShares) return 0n;
    return state.vaultShares - requiredCollateral;
  }, [state.collateralFactorBps, state.stableDebt, state.vaultShares]);
  const linkedAiAction = useMemo(() => {
    if (appliedAiDecisionId) {
      return actions.find((action) => action.aiDecisionId === appliedAiDecisionId) || null;
    }
    return actions.find((action) => action.aiDecisionId && aiHistory.some((decision) => decision.id === action.aiDecisionId)) || null;
  }, [actions, aiHistory, appliedAiDecisionId]);
  const latestAiDecision = aiHistory[0] || null;
  const aiRecipientDisplay = useMemo(
    () =>
      aiRecommendation?.beneficiary ||
      latestAiDecision?.beneficiary ||
      normalizedBeneficiary ||
      appConfig.peopleBeneficiary ||
      "",
    [aiRecommendation?.beneficiary, latestAiDecision?.beneficiary, normalizedBeneficiary]
  );

  const loadState = useCallback(
    async (activeAccount?: string | null) => {
      const accountToLoad = activeAccount || activeSessionAccount;
      const vault = new Contract(appConfig.vaultAddress, vaultAbi, readProvider);
      const wpas = new Contract(appConfig.wpasAddress, wpasAbi, readProvider);
      const mockUsd = new Contract(appConfig.mockUsdAddress, mockUsdAbi, readProvider);

      const [vaultSupply, vaultCollateral, collateralToken, owner, aiOperator, paused, mockUsdSupply, rewardRateBps, collateralFactorBps] =
        await Promise.all([
          vault.totalSupply(),
          vault.totalCollateral(),
          vault.collateralToken(),
          vault.owner(),
          vault.aiOperator(),
          vault.paused(),
          mockUsd.totalSupply(),
          vault.rewardRateBps(),
          vault.collateralFactorBps()
        ]);

      if (!accountToLoad) {
        setState((current) => ({
          ...current,
          vaultSupply,
          vaultCollateral,
          collateralToken,
          rewardRateBps,
          collateralFactorBps,
          mockUsdBalance: null,
          stableDebt: null,
          maxMintable: null,
          stableAllowance: null,
          owner,
          aiOperator,
          paused,
          mockUsdSupply
        }));
        return;
      }

      const [nativeBalance, wpasBalance, vaultShares, allowance, pendingRewards, projectedYearlyRewards, mockUsdBalance, stableDebt, maxMintable, stableAllowance] = await Promise.all([
        readProvider.getBalance(accountToLoad),
        wpas.balanceOf(accountToLoad),
        vault.balanceOf(accountToLoad),
        wpas.allowance(accountToLoad, appConfig.vaultAddress),
        vault.previewRewards(accountToLoad),
        vault.projectedYearlyRewards(accountToLoad),
        mockUsd.balanceOf(accountToLoad),
        vault.debtOf(accountToLoad),
        vault.maxMintable(accountToLoad),
        mockUsd.allowance(accountToLoad, appConfig.vaultAddress)
      ]);

      setState({
        nativeBalance,
        wpasBalance,
        vaultShares,
        vaultSupply,
        vaultCollateral,
        mockUsdSupply,
        mockUsdBalance,
        stableDebt,
        maxMintable,
        pendingRewards,
        projectedYearlyRewards,
        rewardRateBps,
        collateralFactorBps,
        allowance,
        stableAllowance,
        collateralToken,
        owner,
        aiOperator,
        paused
      });
    },
    [activeSessionAccount]
  );

  const connectWallet = useCallback(async () => {
    try {
      if (!walletUi.enabled) {
        setLog({
          title: "Privy not configured",
          body: "Set NEXT_PUBLIC_PRIVY_APP_ID to enable the production wallet flow.",
          kind: "error"
        });
        return;
      }

      if (!walletUi.ready) {
        setLog({
          title: "Wallet layer starting",
          body: "Privy is still initializing. Give it a second, then try again.",
          kind: "idle"
        });
        return;
      }

      setBusy("Connect wallet");

      await walletUi.connect();
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(SUPPRESS_WALLET_KEY);
      }
      setWalletSuppressed(false);
      setMobileNavOpen(false);

      setLog({
        title: "Wallet ready",
        body: `Wallet connected. You can continue on ${appConfig.chainName}.`,
        kind: "success"
      });
    } catch (error: any) {
      setLog({
        title: "Wallet connection failed",
        body: getWalletErrorMessage(error),
        kind: "error"
      });
    } finally {
      setBusy(null);
    }
  }, [walletUi]);

  const switchNetwork = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) {
        setAutoSwitching(true);
      }
      await walletUi.switchChain(appConfig.chainId);
      setAutoSwitchAttempted(null);
      setLog({
        title: "Network switched",
        body: `Wallet is now on ${appConfig.chainName}.`,
        kind: "success"
      });
    } catch (error: any) {
      setLog({
        title: options?.silent ? "Network switch needed" : "Network switch cancelled",
        body: options?.silent
          ? `Approve the wallet prompt to continue on ${appConfig.chainName}.`
          : getWalletErrorMessage(error),
        kind: "error"
      });
    } finally {
      if (!options?.silent) {
        setAutoSwitching(false);
      }
    }
  }, [walletUi]);

  const disconnectWallet = useCallback(async () => {
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(SUPPRESS_WALLET_KEY, "1");
      }
      setWalletSuppressed(true);
      setAutoSwitchAttempted(null);

      if (walletUi.enabled && authenticated) {
        await walletUi.disconnect();
      }

      setLog({
        title: "Wallet disconnected",
        body: "This app session was cleared. Click Connect Wallet when you want to use a wallet again.",
        kind: "success"
      });
    } catch (error: any) {
      setLog({
        title: "Disconnect failed",
        body: getWalletErrorMessage(error),
        kind: "error"
      });
    }
  }, [authenticated, walletUi]);

  const copyWalletAddress = useCallback(async () => {
    if (!account) return;

    try {
      await navigator.clipboard.writeText(account);
      setAccountMenuOpen(false);
      pushToast("Wallet copied", `Copied ${shortAddress(account)} to clipboard.`, "success");
    } catch (error: any) {
      setLog({
        title: "Copy failed",
        body: getWalletErrorMessage(error),
        kind: "error"
      });
    }
  }, [account]);

  const runTx = useCallback(
    async (label: string, fn: () => Promise<{ hash: string; wait: () => Promise<any> }>) => {
      try {
        setBusy(label);
        setLog({ title: `${label} pending`, body: "Awaiting wallet confirmation.", kind: "idle" });
        const tx = await fn();
        pushToast(`${label} submitted`, `Transaction hash: ${tx.hash}`, "success");
        await tx.wait();
        await loadState();
        // Secondary data should never be able to invalidate a confirmed transaction.
        // We refresh everything, but degrade gracefully if a side panel request fails.
        const refreshResults = await Promise.allSettled([
          loadActions(),
          loadAiRecommendation(),
          loadAiHistory(),
          loadAiExplanation()
        ]);
        const refreshFailed = refreshResults.some((result) => result.status === "rejected");
        pushToast(
          `${label} confirmed`,
          refreshFailed
            ? `Included on ${appConfig.chainName}. Some secondary data is still refreshing.`
            : `Included on ${appConfig.chainName}.`,
          "success"
        );
      } catch (error: any) {
        pushToast(`${label} failed`, getWalletErrorMessage(error), "error");
      } finally {
        setBusy(null);
      }
    },
    [loadActions, loadAiExplanation, loadAiHistory, loadAiRecommendation, loadState, pushToast]
  );

  const wrapPas = useCallback(async () => {
    if (!account) return;
    const signer = await getEthersSigner(walletUi, account);
    const contract = new Contract(appConfig.wpasAddress, wpasAbi, signer);
    await runTx("Wrap PAS", () => contract.deposit({ value: parseAmount(wrapAmount) }));
  }, [account, runTx, walletUi, wrapAmount]);

  const unwrapPas = useCallback(async () => {
    if (!account) return;
    const signer = await getEthersSigner(walletUi, account);
    const contract = new Contract(appConfig.wpasAddress, wpasAbi, signer);
    await runTx("Unwrap PAS", () => contract.withdraw(parseAmount(unwrapAmount)));
  }, [account, runTx, unwrapAmount, walletUi]);

  const approveVault = useCallback(async () => {
    if (!account) return;
    if (
      state.collateralToken &&
      state.collateralToken.toLowerCase() !== appConfig.wpasAddress.toLowerCase()
    ) {
      setLog({
        title: "Vault collateral mismatch",
        body: "This vault was deployed against a different collateral token, so WPAS approval/deposit will fail until the vault is redeployed with WPAS as collateral.",
        kind: "error"
      });
      return;
    }
    const signer = await getEthersSigner(walletUi, account);
    const contract = new Contract(appConfig.wpasAddress, wpasAbi, signer);
    await runTx("Approve WPAS", () =>
      contract.approve(appConfig.vaultAddress, parseAmount(depositAmount))
    );
  }, [account, depositAmount, runTx, state.collateralToken, walletUi]);

  const depositVault = useCallback(async () => {
    if (!account) return;
    if (
      state.collateralToken &&
      state.collateralToken.toLowerCase() !== appConfig.wpasAddress.toLowerCase()
    ) {
      setLog({
        title: "Vault collateral mismatch",
        body: "Deposit is blocked because this vault expects a different collateral token than WPAS. Redeploy the vault with WPAS as the constructor collateral token.",
        kind: "error"
      });
      return;
    }
    const signer = await getEthersSigner(walletUi, account);
    const contract = new Contract(appConfig.vaultAddress, vaultAbi, signer);
    await runTx("Deposit collateral", () =>
      contract.depositCollateral(parseAmount(depositAmount))
    );
  }, [account, depositAmount, runTx, state.collateralToken, walletUi]);

  const withdrawVault = useCallback(async () => {
    if (!account) return;
    const amount = parseAmount(withdrawAmount);
    if (state.vaultShares == null || state.vaultShares === 0n) {
      setLog({
        title: "No collateral to withdraw",
        body: "Deposit collateral first before withdrawing from the vault.",
        kind: "error"
      });
      return;
    }
    if (maxWithdrawable == null || amount > maxWithdrawable) {
      setLog({
        title: "Withdraw amount too high",
        body: `This wallet can safely withdraw up to ${formatToken(maxWithdrawable)} WPAS without breaking its collateral requirements.`,
        kind: "error"
      });
      return;
    }
    const signer = await getEthersSigner(walletUi, account);
    const contract = new Contract(appConfig.vaultAddress, vaultAbi, signer);
    await runTx("Withdraw collateral", () => contract.withdrawCollateral(amount));
  }, [account, maxWithdrawable, runTx, state.vaultShares, walletUi, withdrawAmount]);

  const claimRewards = useCallback(async () => {
    if (!account) return;
    const signer = await getEthersSigner(walletUi, account);
    const contract = new Contract(appConfig.vaultAddress, vaultAbi, signer);
    await runTx("Claim rewards", () => contract.claimRewards());
  }, [account, runTx, walletUi]);

  const mintStable = useCallback(async () => {
    if (!account) return;
    const amount = parseAmount(mintAmount);
    if (state.maxMintable == null || state.maxMintable === 0n) {
      setLog({
        title: "No mint capacity",
        body: "Deposit collateral first, then refresh balances before minting.",
        kind: "error"
      });
      return;
    }
    if (amount > state.maxMintable) {
      setLog({
        title: "Mint amount too high",
        body: `This wallet can mint up to ${formatToken(state.maxMintable)} mUSD right now.`,
        kind: "error"
      });
      return;
    }
    const signer = await getEthersSigner(walletUi, account);
    const contract = new Contract(appConfig.vaultAddress, vaultAbi, signer);
    await runTx("Mint stable", () => contract.mintStable(amount));
  }, [account, mintAmount, runTx, state.maxMintable, walletUi]);

  const approveStableForRepay = useCallback(async () => {
    if (!account) return;
    const signer = await getEthersSigner(walletUi, account);
    const contract = new Contract(appConfig.mockUsdAddress, mockUsdAbi, signer);
    await runTx("Approve mUSD", () => contract.approve(appConfig.vaultAddress, parseAmount(repayAmount)));
  }, [account, repayAmount, runTx, walletUi]);

  const repayStable = useCallback(async () => {
    if (!account) return;
    const amount = parseAmount(repayAmount);
    if (state.stableDebt == null || state.stableDebt === 0n) {
      setLog({
        title: "No debt to repay",
        body: "This wallet does not currently have an active mUSD debt position.",
        kind: "error"
      });
      return;
    }
    if (amount > state.stableDebt) {
      setLog({
        title: "Repay amount exceeds debt",
        body: `Current outstanding debt is ${formatToken(state.stableDebt)} mUSD.`,
        kind: "error"
      });
      return;
    }
    if (state.mockUsdBalance == null || amount > state.mockUsdBalance) {
      setLog({
        title: "Insufficient mUSD balance",
        body: `Wallet balance is ${formatToken(state.mockUsdBalance)} mUSD. Mint or acquire more before repaying.`,
        kind: "error"
      });
      return;
    }
    if (state.stableAllowance == null || amount > state.stableAllowance) {
      setLog({
        title: "Approve mUSD first",
        body: `Vault allowance is ${formatToken(state.stableAllowance)} mUSD. Approve at least ${repayAmount} mUSD before repaying.`,
        kind: "error"
      });
      return;
    }
    const signer = await getEthersSigner(walletUi, account);
    const contract = new Contract(appConfig.vaultAddress, vaultAbi, signer);
    await runTx("Repay stable", () => contract.repayStable(amount));
  }, [account, repayAmount, runTx, state.mockUsdBalance, state.stableAllowance, state.stableDebt, walletUi]);

  const requestTeleport = useCallback(async (options?: {
    amount?: string;
    beneficiary?: string;
  }) => {
    if (!account) return;

    try {
      const requestedAmount = options?.amount || teleportAmount;
      const requestedBeneficiary = (options?.beneficiary || beneficiary).trim();

      if (!requestedBeneficiary) {
        setLog({
          title: "Recipient required",
          body: "Add a People recipient address before requesting a teleport.",
          kind: "error"
        });
        return;
      }

      if (!isLikelySs58(requestedBeneficiary)) {
        setLog({
          title: "Invalid recipient",
          body: "Recipient must be a valid SS58-like People address.",
          kind: "error"
        });
        return;
      }

      const signer = await getEthersSigner(walletUi, account);
      setBusy("Request teleport");
      setLog({
        title: "Prepare teleport",
        body: "Building the XCM payload for your wallet-funded transfer.",
        kind: "idle"
      });

      const prepareResponse = await fetch("/api/actions/teleport/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requester: account,
          beneficiary: requestedBeneficiary,
          amount: requestedAmount
        })
      });
      const preparePayload = await prepareResponse.json();
      if (!prepareResponse.ok || !preparePayload.ok) {
        throw new Error(preparePayload.error || "Unable to prepare teleport");
      }

      const xcmPrecompile = new Contract(XCM_PRECOMPILE_ADDRESS, xcmPrecompileAbi, signer);

      setLog({
        title: "Confirm teleport",
        body: "Approve the XCM transfer in your wallet. PAS will be sent from your connected wallet.",
        kind: "idle"
      });

      const tx = await xcmPrecompile.send(
        preparePayload.payload.destinationHex,
        preparePayload.payload.messageHex,
        {
          gasLimit: 800000
        }
      );

      pushToast("Teleport submitted", `Transaction hash: ${tx.hash}`, "success");
      await tx.wait();

      const recordResponse = await fetch("/api/actions/teleport/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requester: account,
          beneficiary: requestedBeneficiary,
          amount: requestedAmount,
          txHash: tx.hash,
          beforeBalance: preparePayload.payload.beforeBalance,
          aiDecisionId: appliedAiDecisionId || undefined
        })
      });
      const recordPayload = await recordResponse.json();

      await loadState(account);
      await Promise.allSettled([
        loadActions(account),
        loadAiRecommendation(account),
        loadAiHistory(account),
        loadAiExplanation(account)
      ]);

      if (recordResponse.ok && recordPayload.ok) {
        setSelectedAction(recordPayload.action || null);
        if (recordPayload.action?.aiDecisionId) {
          setAppliedAiDecisionId(recordPayload.action.aiDecisionId);
        }
      }

      const settled = recordResponse.ok && recordPayload.ok && recordPayload.action?.status === "settled";

      setLog({
        title: settled ? "Teleport settled" : "Teleport not settled",
        body: settled
          ? `Sent ${requestedAmount} PAS from your wallet. Destination settlement was detected and history has been updated.`
          : `The Hub transaction confirmed, but destination settlement was not detected. Do not treat this as a completed teleport yet.`,
        kind: settled ? "success" : "error"
      });
      pushToast(
        settled ? "Teleport settled" : "Teleport unverified",
        settled ? `Included and verified for ${requestedBeneficiary}.` : `Hub transaction confirmed, but destination settlement was not detected.`,
        settled ? "success" : "error"
      );
    } catch (error: any) {
      setLog({
        title: "Teleport request failed",
        body: getWalletErrorMessage(error),
        kind: "error"
      });
    } finally {
      setBusy(null);
    }
  }, [account, beneficiary, loadActions, loadAiExplanation, loadAiHistory, loadAiRecommendation, loadState, pushToast, teleportAmount, walletUi]);

  const applyAiSuggestion = useCallback(() => {
    if (!aiRecommendation) return;

    setBeneficiary(aiRecommendation.beneficiary);
    setAppliedAiDecisionId(latestAiDecision?.id || null);
    if (aiRecommendation.action === "teleport") {
      setTeleportAmount(aiRecommendation.suggestedAmountPas);
      pushToast(
        "AI suggestion applied",
        `Prepared ${aiRecommendation.suggestedAmountPas} PAS for the approved recipient.`,
        "success"
      );
      return;
    }

    setLog({
      title: "AI review",
      body: aiRecommendation.explanation,
      kind: aiRecommendation.action === "review-risk" ? "error" : "idle"
    });
  }, [aiRecommendation, latestAiDecision, pushToast]);

  const triggerServerAction = useCallback(
    async (path: string, title: string) => {
      try {
        setBusy(title);
        setLog({
          title,
          body: "Running a local verification helper on the Next server.",
          kind: "idle"
        });
        const response = await fetch(path, { method: "POST" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || payload.stderr || "Command failed");
        }
        setLog({
          title: `${title} complete`,
          body: payload.stdout || payload.stderr || "Done.",
          kind: "success"
        });
        await loadState();
        await Promise.all([loadActions(), loadAiRecommendation(), loadAiHistory(), loadAiExplanation()]);
      } catch (error: any) {
        setLog({
          title: `${title} failed`,
          body: getWalletErrorMessage(error),
          kind: "error"
        });
      } finally {
        setBusy(null);
      }
    },
    [loadActions, loadAiExplanation, loadAiHistory, loadAiRecommendation, loadState]
  );

  useEffect(() => {
    loadState();
    loadActions();
    loadAiRecommendation();
    loadAiHistory();
    loadAiExplanation();
  }, [loadActions, loadAiExplanation, loadAiHistory, loadAiRecommendation, loadState]);

  useEffect(() => {
    if (!activeSessionAccount || !hasPendingActions) return;
    const timer = window.setInterval(() => {
      void Promise.all([
        loadActions(activeSessionAccount),
        loadAiRecommendation(activeSessionAccount),
        loadAiHistory(activeSessionAccount)
      ]);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeSessionAccount, hasPendingActions, loadActions, loadAiHistory, loadAiRecommendation]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const suppressed = window.sessionStorage.getItem(SUPPRESS_WALLET_KEY) === "1";
    setWalletSuppressed(suppressed);
  }, [account]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (moreRef.current && !moreRef.current.contains(target)) {
        setMoreOpen(false);
      }

      if (accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeSessionAccount, chainId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const body = document.body;
    if (mobileNavOpen) {
      body.classList.add("mobile-nav-open");
    } else {
      body.classList.remove("mobile-nav-open");
    }

    return () => body.classList.remove("mobile-nav-open");
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!walletSessionReady || correctNetwork || autoSwitching || !autoSwitchKey) return;
    if (autoSwitchAttempted === autoSwitchKey) return;

    setAutoSwitchAttempted(autoSwitchKey);
    setAutoSwitching(true);
    void switchNetwork({ silent: true }).finally(() => setAutoSwitching(false));
  }, [autoSwitchAttempted, autoSwitchKey, autoSwitching, correctNetwork, switchNetwork, walletSessionReady]);

  useEffect(() => {
    if (!activeSessionAccount) return;

    void loadState(activeSessionAccount);
    void Promise.all([
      loadActions(activeSessionAccount),
      loadAiRecommendation(activeSessionAccount),
      loadAiHistory(activeSessionAccount),
      loadAiExplanation(activeSessionAccount)
    ]);
  }, [activeSessionAccount, chainId, loadActions, loadAiExplanation, loadAiHistory, loadAiRecommendation, loadState]);

  useEffect(() => {
    if (busy !== null) return;
    if (log.kind !== "idle" && log.kind !== "success") return;

    if (!walletSessionReady) {
      setLog({
        title: "Vault ready",
        body: "Connect a wallet to start using the vault.",
        kind: "idle"
      });
      return;
    }

    if (!correctNetwork) {
      setLog({
        title: "Network switch required",
        body: `Switch to ${appConfig.chainName} to use vault actions.`,
        kind: "idle"
      });
      return;
    }

    setLog({
      title: "Wallet connected",
      body: "You can now supply collateral, borrow mUSD, claim yield, or bridge PAS.",
      kind: "success"
    });
  }, [busy, correctNetwork, log.kind, walletSessionReady]);

  useEffect(() => {
    setLogDismissed(false);
  }, [log.title, log.body, log.kind]);

  const statusTone = useMemo(() => {
    if (log.kind === "error") return "danger";
    if (log.kind === "success") return "good";
    return "neutral";
  }, [log.kind]);

  const showLogNotice = useMemo(() => {
    if (logDismissed) return false;
    return log.kind === "idle" || log.kind === "error";
  }, [log.kind, logDismissed]);

  const aiHeadline = aiRecommendation?.action || (walletSessionReady ? "unavailable" : "hold");
  const aiHeroCopy = aiRecommendation
    ? `${aiRecommendation.suggestedAmountPas} PAS · ${aiRecommendation.posture} posture`
    : walletSessionReady
      ? "Live recommendation unavailable right now. Refresh the AI panel to retry."
      : "Connect a wallet to load your live recommendation.";
  const aiInsightFallback = walletSessionReady
    ? "The AI recommendation could not be loaded for this wallet right now."
    : "The AI watches your vault position and system conditions.";
  const aiReasonsFallback = walletSessionReady
    ? "Use Refresh to retry after your latest vault action settles."
    : "Recommendations will appear after wallet state loads.";

  return (
    <main className="app-shell">
      {toast ? (
        <div className={`toast-stack toast-${toast.kind}`}>
          <div className="toast-card">
            <div className="toast-header">
              <strong>{toast.title}</strong>
              <button
                type="button"
                className="toast-close"
                onClick={() => setToast(null)}
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
            <p>{toast.body}</p>
          </div>
        </div>
      ) : null}
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <div className="vault-nav-shell">
        <nav className="vault-nav reveal reveal-1">
          <div className="vault-nav-brand">
            <img className="vault-nav-mark" src="/Gemin.png" alt="XCM StableVault logo" />
          </div>
          <button
            type="button"
            className={mobileNavOpen ? "mobile-nav-toggle mobile-nav-toggle-open" : "mobile-nav-toggle"}
            onClick={() => setMobileNavOpen((value) => !value)}
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-nav-drawer"
            aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="vault-nav-links">
            {primaryNav.map((item) => (
              item.comingSoon ? (
                <button
                  key={item.label}
                  type="button"
                  className={item.accent ? "nav-link nav-link-active nav-pill-button" : "nav-link nav-pill-button"}
                  onClick={() => {
                    setMobileNavOpen(false);
                    showComingSoon(item.label);
                  }}
                >
                  {item.label}
                </button>
              ) : (
                <a
                  key={item.label}
                  className={item.accent ? "nav-link nav-link-active" : "nav-link"}
                  href={item.href}
                  onClick={() => setMobileNavOpen(false)}
                >
                  {item.label}
                </a>
              )
            ))}
            <div className="more-menu" ref={moreRef}>
              <button
                type="button"
                className={moreOpen ? "nav-link nav-link-active nav-pill-button" : "nav-link nav-pill-button"}
                onClick={() => setMoreOpen((value) => !value)}
                aria-expanded={moreOpen}
                aria-haspopup="menu"
              >
                More
                <span className={moreOpen ? "more-caret more-caret-open" : "more-caret"} aria-hidden="true">
                  ▾
                </span>
              </button>
              <div className={moreOpen ? "more-dropdown more-dropdown-open" : "more-dropdown"} role="menu">
                {moreNav.map((item) => (
                  <a
                    key={item.label}
                    className="more-dropdown-item"
                    href={item.href}
                    onClick={() => {
                      setMoreOpen(false);
                      setMobileNavOpen(false);
                    }}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
          <div className="vault-nav-actions">
            {!walletSessionReady ? (
              <button className="primary" onClick={connectWallet} disabled={walletBooting || busy === "Connect wallet"}>
                {walletBooting
                  ? "Loading wallets..."
                  : busy === "Connect wallet"
                    ? "Opening wallet..."
                    : walletSuppressed && walletReady
                      ? "Reconnect Wallet"
                      : "Connect Wallet"}
              </button>
            ) : (
              <div className="account-menu" ref={accountMenuRef}>
                <button
                  type="button"
                  className={accountMenuOpen ? "primary account-trigger account-trigger-open" : "primary account-trigger"}
                  onClick={() => setAccountMenuOpen((value) => !value)}
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="menu"
                >
                  {shortAddress(account)}
                  <span className={accountMenuOpen ? "more-caret more-caret-open" : "more-caret"} aria-hidden="true">
                    ▾
                  </span>
                </button>
                <div className={accountMenuOpen ? "account-dropdown more-dropdown more-dropdown-open" : "account-dropdown more-dropdown"} role="menu">
                  {!correctNetwork ? (
                    <button
                      type="button"
                      className="account-dropdown-item"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        void switchNetwork();
                      }}
                      disabled={autoSwitching}
                    >
                      {autoSwitching ? "Switching network..." : `Switch to ${appConfig.chainName}`}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="account-dropdown-item"
                    onClick={() => {
                      void copyWalletAddress();
                    }}
                  >
                    Copy wallet address
                  </button>
                  <button
                    type="button"
                    className="account-dropdown-item"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      void loadState(account);
                    }}
                  >
                    Refresh balances
                  </button>
                  <button
                    type="button"
                    className="account-dropdown-item account-dropdown-danger"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      void disconnectWallet();
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            )}
            {isAdmin ? (
              <Link className="secondaryLink" href="/admin">
                Admin
              </Link>
            ) : null}
          </div>
        </nav>
        <div id="mobile-nav-drawer" className={mobileNavOpen ? "mobile-nav-drawer mobile-nav-drawer-open" : "mobile-nav-drawer"}>
          <div className="mobile-nav-section">
            {primaryNav.map((item) => (
              item.comingSoon ? (
                <button
                  key={`mobile-${item.label}`}
                  type="button"
                  className={item.accent ? "mobile-nav-link mobile-nav-link-active" : "mobile-nav-link"}
                  onClick={() => {
                    setMobileNavOpen(false);
                    showComingSoon(item.label);
                  }}
                >
                  {item.label}
                </button>
              ) : (
                <a
                  key={`mobile-${item.label}`}
                  className={item.accent ? "mobile-nav-link mobile-nav-link-active" : "mobile-nav-link"}
                  href={item.href}
                  onClick={() => setMobileNavOpen(false)}
                >
                  {item.label}
                </a>
              )
            ))}
            {moreNav.map((item) => (
              <a
                key={`mobile-${item.label}`}
                className="mobile-nav-link"
                href={item.href}
                onClick={() => setMobileNavOpen(false)}
              >
                {item.label}
              </a>
            ))}
          </div>
          <div className="mobile-nav-section mobile-nav-section-secondary">
            {!walletSessionReady ? (
              <button
                type="button"
                className="primary wide"
                onClick={() => {
                  void connectWallet();
                }}
                disabled={walletBooting || busy === "Connect wallet"}
              >
                {walletBooting
                  ? "Loading wallets..."
                  : busy === "Connect wallet"
                    ? "Opening wallet..."
                    : walletSuppressed && walletReady
                      ? "Reconnect Wallet"
                      : "Connect Wallet"}
              </button>
            ) : (
              <>
                <div className="mobile-nav-wallet">Wallet: {shortAddress(account)}</div>
                {!correctNetwork ? (
                  <button
                    type="button"
                    className="mobile-nav-link"
                    onClick={() => {
                      setMobileNavOpen(false);
                      void switchNetwork();
                    }}
                    disabled={autoSwitching}
                  >
                    {autoSwitching ? "Switching network..." : `Switch to ${appConfig.chainName}`}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="mobile-nav-link"
                  onClick={() => {
                    setMobileNavOpen(false);
                    void copyWalletAddress();
                  }}
                >
                  Copy wallet address
                </button>
                <button
                  type="button"
                  className="mobile-nav-link"
                  onClick={() => {
                    setMobileNavOpen(false);
                    void loadState(account);
                  }}
                >
                  Refresh balances
                </button>
                <button
                  type="button"
                  className="mobile-nav-link mobile-nav-link-danger"
                  onClick={() => {
                    setMobileNavOpen(false);
                    void disconnectWallet();
                  }}
                >
                  Disconnect
                </button>
              </>
            )}
            {isAdmin ? (
              <Link className="mobile-nav-link" href="/admin" onClick={() => setMobileNavOpen(false)}>
                Admin
              </Link>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className={mobileNavOpen ? "mobile-nav-backdrop mobile-nav-backdrop-open" : "mobile-nav-backdrop"}
          aria-label="Close navigation menu"
          onClick={() => setMobileNavOpen(false)}
        />
      </div>

      <header className="topbar">
        <div>
          <h1>{appConfig.name}</h1>
          <p className="page-subtitle">Stablecoin vault on Polkadot Hub.</p>
        </div>
      </header>

      <section className="vault-hero reveal reveal-2">
        <div className="vault-hero-main">
          <div className="vault-kicker-row">
            <span className={`vault-mini-badge ${state.paused ? "vault-mini-badge-warn" : ""}`}>{state.paused ? "Paused" : "Active"}</span>
            <span className={`vault-mini-badge ${correctNetwork ? "" : "vault-mini-badge-warn"}`}>{correctNetwork ? appConfig.chainName : "Wrong network"}</span>
          </div>
          <h2 className="vault-hero-title">Stablecoin vault with AI and XCM.</h2>
          <p className="vault-hero-copy">
            Supply WPAS. Borrow mUSD. Claim yield. Bridge PAS.
          </p>
          <div className="vault-chip-row">
            <span className="vault-chip">Collateral: WPAS</span>
            <span className="vault-chip">Stablecoin: mUSD</span>
            <span className="vault-chip">Bridge: PAS</span>
          </div>
          <div id="portfolio" className="summary-grid">
            <MetricCard label="Total Value Locked" value={`${formatCompact(state.vaultCollateral)} WPAS`} />
            <MetricCard label="Current APY" value={formatApyBps(state.rewardRateBps)} />
            <MetricCard label="Borrowing Power" value={`${formatToken(state.maxMintable)} mUSD`} />
            <MetricCard label="Supplied Collateral" value={`${formatToken(state.vaultShares)} WPAS`} />
            <MetricCard label="Borrowed mUSD" value={`${formatToken(state.stableDebt)} mUSD`} />
            <MetricCard label="Claimable Yield" value={`${formatToken(state.pendingRewards)} mUSD`} />
          </div>
        </div>
        <aside className="vault-action-card">
          <div className="vault-action-head">
            <div>
              <span className="vault-kicker">Vault Actions</span>
              <h3>{activeVaultAction === "supply" ? "Supply Collateral" : activeVaultAction === "borrow" ? "Borrow mUSD" : activeVaultAction === "repay" ? "Repay mUSD" : "Withdraw Collateral"}</h3>
            </div>
            <strong>{walletSessionReady ? shortAddress(account) : "Wallet required"}</strong>
          </div>
          <div className="vault-action-tabs">
            <button className={activeVaultAction === "supply" ? "nav-pill nav-pill-active" : "nav-pill"} onClick={() => setActiveVaultAction("supply")}>Supply</button>
            <button className={activeVaultAction === "borrow" ? "nav-pill nav-pill-active" : "nav-pill"} onClick={() => setActiveVaultAction("borrow")}>Borrow</button>
            <button className={activeVaultAction === "repay" ? "nav-pill nav-pill-active" : "nav-pill"} onClick={() => setActiveVaultAction("repay")}>Repay</button>
            <button className={activeVaultAction === "withdraw" ? "nav-pill nav-pill-active" : "nav-pill"} onClick={() => setActiveVaultAction("withdraw")}>Withdraw</button>
          </div>

          {showLogNotice ? (
            <div className={`vault-notice ${statusTone}`}>
              <div className="vault-notice-head">
                <strong>{log.title}</strong>
                <button
                  type="button"
                  className="vault-notice-dismiss"
                  onClick={() => setLogDismissed(true)}
                  aria-label="Dismiss notification"
                >
                  ×
                </button>
              </div>
              <p>{log.body}</p>
            </div>
          ) : null}

          {activeVaultAction === "supply" ? (
            <div className="stack">
              <div className="strategy-box">
                <div className="strategy-line">
                  <span>Available PAS</span>
                  <strong>{formatToken(state.nativeBalance)} PAS</strong>
                </div>
                <div className="strategy-line">
                  <span>Available WPAS</span>
                  <strong>{formatToken(state.wpasBalance)} WPAS</strong>
                </div>
                <div className="strategy-line">
                  <span>Supply allowance</span>
                  <strong>{formatToken(state.allowance)} WPAS</strong>
                </div>
              </div>
              <label className="field">
                <span className="field-head">
                  <span>Wrap PAS amount</span>
                  <button type="button" className="field-max" onClick={() => setWrapAmount(formatMaxAmount(state.nativeBalance))}>Max</button>
                </span>
                <input value={wrapAmount} onChange={(e) => setWrapAmount(e.target.value)} />
              </label>
              <button className="secondary wide" disabled={!walletSessionReady || !correctNetwork || busy !== null} onClick={wrapPas}>
                {busy === "Wrap PAS" ? "Wrapping..." : "Wrap PAS"}
              </button>
              <label className="field">
                <span className="field-head">
                  <span>Supply amount</span>
                  <button type="button" className="field-max" onClick={() => setDepositAmount(formatMaxAmount(state.wpasBalance))}>Max</button>
                </span>
                <input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
              </label>
              <div className="button-row">
                <button className="secondary" disabled={!walletSessionReady || !correctNetwork || busy !== null} onClick={approveVault}>
                  {busy === "Approve WPAS" ? "Approving..." : "Approve WPAS"}
                </button>
                <button className="primary" disabled={!walletSessionReady || !correctNetwork || busy !== null} onClick={depositVault}>
                  {busy === "Deposit collateral" ? "Supplying..." : "Supply"}
                </button>
              </div>
            </div>
          ) : null}

          {activeVaultAction === "borrow" ? (
            <div className="stack">
              <div className="strategy-box">
                <div className="strategy-line">
                  <span>Collateral factor</span>
                  <strong>{formatApyBps(state.collateralFactorBps)}</strong>
                </div>
                <div className="strategy-line">
                  <span>Borrowing power</span>
                  <strong>{formatToken(state.maxMintable)} mUSD</strong>
                </div>
                <div className="strategy-line">
                  <span>Wallet mUSD balance</span>
                  <strong>{formatToken(state.mockUsdBalance)} mUSD</strong>
                </div>
              </div>
              <label className="field">
                <span className="field-head">
                  <span>Borrow amount</span>
                  <button type="button" className="field-max" onClick={() => setMintAmount(formatMaxAmount(state.maxMintable))}>Max</button>
                </span>
                <input value={mintAmount} onChange={(e) => setMintAmount(e.target.value)} />
              </label>
              <button className="primary wide" disabled={!walletSessionReady || !correctNetwork || busy !== null || state.maxMintable == null || state.maxMintable === 0n} onClick={mintStable}>
                {busy === "Mint stable" ? "Borrowing..." : "Borrow mUSD"}
              </button>
            </div>
          ) : null}

          {activeVaultAction === "repay" ? (
            <div className="stack">
              <div className="strategy-box">
                <div className="strategy-line">
                  <span>Borrowed mUSD</span>
                  <strong>{formatToken(state.stableDebt)} mUSD</strong>
                </div>
                <div className="strategy-line">
                  <span>Wallet mUSD balance</span>
                  <strong>{formatToken(state.mockUsdBalance)} mUSD</strong>
                </div>
                <div className="strategy-line">
                  <span>mUSD allowance</span>
                  <strong>{formatToken(state.stableAllowance)} mUSD</strong>
                </div>
              </div>
              <label className="field">
                <span className="field-head">
                  <span>Repay amount</span>
                  <button
                    type="button"
                    className="field-max"
                    onClick={() =>
                      setRepayAmount(
                        formatMaxAmount(
                          state.stableDebt != null && state.mockUsdBalance != null
                            ? state.stableDebt < state.mockUsdBalance
                              ? state.stableDebt
                              : state.mockUsdBalance
                            : state.stableDebt ?? state.mockUsdBalance
                        )
                      )
                    }
                  >
                    Max
                  </button>
                </span>
                <input value={repayAmount} onChange={(e) => setRepayAmount(e.target.value)} />
              </label>
              <div className="button-row">
                <button className="secondary" disabled={!walletSessionReady || !correctNetwork || busy !== null} onClick={approveStableForRepay}>
                  {busy === "Approve mUSD" ? "Approving..." : "Approve mUSD"}
                </button>
                <button className="primary" disabled={!walletSessionReady || !correctNetwork || busy !== null || state.stableDebt == null || state.stableDebt === 0n} onClick={repayStable}>
                  {busy === "Repay stable" ? "Repaying..." : "Repay"}
                </button>
              </div>
            </div>
          ) : null}

          {activeVaultAction === "withdraw" ? (
            <div className="stack">
              <div className="strategy-box">
                <div className="strategy-line">
                  <span>Withdrawable now</span>
                  <strong>{formatToken(maxWithdrawable)} WPAS</strong>
                </div>
                <div className="strategy-line">
                  <span>Locked as collateral</span>
                  <strong>
                    {state.vaultShares != null && maxWithdrawable != null
                      ? `${formatToken(state.vaultShares - maxWithdrawable)} WPAS`
                      : "-- WPAS"}
                  </strong>
                </div>
              </div>
              <label className="field">
                <span className="field-head">
                  <span>Withdraw amount</span>
                  <button type="button" className="field-max" onClick={() => setWithdrawAmount(formatMaxAmount(maxWithdrawable))}>Max</button>
                </span>
                <input value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} />
              </label>
              <button className="secondary wide" disabled={!walletSessionReady || !correctNetwork || busy !== null || maxWithdrawable == null || maxWithdrawable === 0n} onClick={withdrawVault}>
                {busy === "Withdraw collateral" ? "Withdrawing..." : "Withdraw"}
              </button>
              <label className="field">
                <span className="field-head">
                  <span>Unwrap PAS amount</span>
                  <button type="button" className="field-max" onClick={() => setUnwrapAmount(formatMaxAmount(state.wpasBalance))}>Max</button>
                </span>
                <input value={unwrapAmount} onChange={(e) => setUnwrapAmount(e.target.value)} />
              </label>
              <button className="secondary wide" disabled={!walletSessionReady || !correctNetwork || busy !== null} onClick={unwrapPas}>
                {busy === "Unwrap PAS" ? "Unwrapping..." : "Unwrap PAS"}
              </button>
            </div>
          ) : null}

          <div className="vault-action-foot">
            <div className="strategy-line">
              <span>Claimable yield</span>
              <strong>{formatToken(state.pendingRewards)} mUSD</strong>
            </div>
            <button
              className="secondary wide"
              disabled={!walletSessionReady || !correctNetwork || busy !== null || state.pendingRewards == null || state.pendingRewards === 0n}
              onClick={claimRewards}
            >
              {busy === "Claim rewards" ? "Claiming..." : "Claim Yield"}
            </button>
          </div>
        </aside>
      </section>

      <section className="dashboard-grid reveal reveal-3">
        <article id="bridge" className="panel">
          <div className="panel-head">
            <div>
              <h2>Bridge</h2>
              <p>Send native PAS from your wallet to People and track the resulting cross-chain transfer.</p>
            </div>
          </div>

          <div className="bridge-facts-grid">
            <div className="bridge-fact-card">
              <span>Asset</span>
              <strong>PAS (native)</strong>
            </div>
            <div className="bridge-fact-card">
              <span>Route</span>
              <strong>Asset Hub to People</strong>
            </div>
            <div className="bridge-fact-card">
              <span>Stablecoin</span>
              <strong>Coming next</strong>
            </div>
          </div>

          <div className="strategy-box top-gap">
            <div className="strategy-line">
              <span>Recipient</span>
              <strong>{beneficiary || "Add a People recipient address"}</strong>
            </div>
          </div>

          <div className="stack top-gap">
            <label className="field">
              <span>Recipient address</span>
              <input value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} />
              {normalizedBeneficiary && !beneficiaryValid ? (
                <small className="field-note error">Enter a valid People SS58 address.</small>
              ) : null}
            </label>
            <label className="field">
              <span className="field-head">
                <span>Teleport amount (PAS)</span>
                <button type="button" className="field-max" onClick={() => setTeleportAmount(formatMaxAmount(state.nativeBalance))}>Max</button>
              </span>
              <input value={teleportAmount} onChange={(e) => setTeleportAmount(e.target.value)} />
            </label>
          </div>

          <div className="button-row top-gap">
            <button
              className="primary"
              disabled={!walletSessionReady || !correctNetwork || busy !== null || !beneficiaryValid}
              onClick={() => void requestTeleport()}
            >
              {busy === "Request teleport" ? "Sending..." : "Teleport PAS"}
            </button>
            <button
              className="secondary"
              disabled={busy !== null}
              onClick={() => triggerServerAction("/api/demo/verify", "Verify People balance")}
            >
              {busy === "Verify People balance" ? "Verifying..." : "Verify Settlement"}
            </button>
          </div>
        </article>

        <article id="analytics" className="panel span-2">
          <div className="panel-head">
            <div>
              <h2>AI Strategy</h2>
              <p>Risk-aware guidance for when to hold, supply more, or bridge.</p>
            </div>
            <div className="button-row ai-actions">
              <button
                className="secondary compact"
                disabled={!walletSessionReady || busy !== null}
                onClick={() => Promise.all([loadAiRecommendation(), loadAiHistory(), loadAiExplanation()])}
              >
                Refresh
              </button>
              <button
                className="primary compact"
                disabled={!aiRecommendation || busy !== null}
                onClick={applyAiSuggestion}
              >
                Apply
              </button>
            </div>
          </div>
          <div className="ai-hero">
            <div className="ai-hero-main">
              <span className="ai-hero-label">Vault Copilot</span>
              <strong>{aiHeadline}</strong>
              <p>{aiHeroCopy}</p>
            </div>
            <div className="ai-hero-stats">
              <div className="ai-stat">
                <span>Risk Score</span>
                <strong>{aiRecommendation ? `${aiRecommendation.score}/100` : "--"}</strong>
              </div>
              <div className="ai-stat">
                <span>Readiness</span>
                <strong>{aiRecommendation?.executionReadiness || "--"}</strong>
              </div>
              <div className="ai-stat">
                <span>Transfer path</span>
                <strong>wallet</strong>
              </div>
            </div>
          </div>
          <div className="ai-micro-grid top-gap">
            <div className="ai-micro-card">
              <span>Suggested transfer</span>
              <strong>{aiRecommendation ? `${aiRecommendation.suggestedAmountPas} PAS` : "--"}</strong>
            </div>
            <div className="ai-micro-card">
              <span>Recent activity</span>
              <strong>{aiRecommendation?.queuePressure || "--"}</strong>
            </div>
            <div className="ai-micro-card">
              <span>Vault utilization</span>
              <strong>{aiRecommendation?.vaultUtilization || "--"}</strong>
            </div>
            <div className="ai-micro-card">
              <span>Recipient</span>
              <strong>{shortAddress(aiRecipientDisplay)}</strong>
            </div>
          </div>
          <div className="ai-link-strip top-gap">
            <div className="ai-link-card">
              <span>Latest AI note</span>
              <strong>
                {latestAiDecision ? (
                  <button
                    type="button"
                    className="inline-link-button"
                    onClick={() => {
                      const linked = actions.find((action) => action.aiDecisionId === latestAiDecision.id);
                      if (linked) {
                        setSelectedAction(linked);
                      }
                    }}
                  >
                    {shortAddress(latestAiDecision.id)}
                  </button>
                ) : (
                  "--"
                )}
              </strong>
            </div>
            <div className="ai-link-card">
              <span>Recent bridge</span>
              <strong>
                {linkedAiAction ? (
                  <button
                    type="button"
                    className="inline-link-button"
                    onClick={() => setSelectedAction(linkedAiAction)}
                  >
                    {shortAddress(linkedAiAction.id)}
                  </button>
                ) : (
                  "No linked action yet"
                )}
              </strong>
            </div>
          </div>
          <div className="ai-story-grid top-gap">
            <div className="log-box ai-insight-box">
              <strong>{aiRecommendation?.explanation || aiInsightFallback}</strong>
              <pre>{aiRecommendation ? aiRecommendation.reasons.join("\n") : aiReasonsFallback}</pre>
            </div>
            <div className="log-box ai-policy-box">
              <strong>Why It Helps</strong>
              <pre>
                {aiRecommendation?.autoQueueReason ||
                  "The AI checks wallet posture, vault state, and recent bridge activity before suggesting the next move."}
              </pre>
            </div>
          </div>
          <div className="log-box top-gap">
            <strong>
              {aiExplanation
                ? `AI Explanation ${aiExplanation.source === "openai" ? "(OpenAI)" : "(Fallback)"}`
                : "AI Explanation"}
            </strong>
            <pre>
              {aiExplanation?.body ||
                "Load a wallet state to generate a plain-English explanation for the current recommendation."}
            </pre>
          </div>
          <div className="activity-table top-gap">
            <div className="activity-row activity-head ai-history-grid">
              <span>Time</span>
              <span>Score</span>
              <span>Action</span>
              <span>Posture</span>
              <span>Linked Action</span>
            </div>
            {aiHistory.length === 0 ? (
              <div className="activity-empty">No AI decisions stored for this wallet yet.</div>
            ) : (
              aiHistory.map((decision) => (
                <div className="activity-row ai-history-grid" key={decision.id}>
                  <span className="activity-cell" data-label="Time">{new Date(decision.createdAt).toLocaleString()}</span>
                  <span className="activity-cell" data-label="Score">{decision.score}/100</span>
                  <span className="activity-cell" data-label="Action">
                    <span className={`badge-inline ${decision.action}`}>{decision.action}</span>
                  </span>
                  <span className="activity-cell" data-label="Posture">
                    <span className={`badge-inline ${decision.posture}`}>{decision.posture}</span>
                  </span>
                  <span className="activity-cell" data-label="Linked Action">
                    {decision.linkedActionId ? (
                      <button
                        type="button"
                        className="inline-link-button"
                        onClick={() => {
                          const linked = actions.find((action) => action.id === decision.linkedActionId);
                          if (linked) {
                            setSelectedAction(linked);
                          }
                        }}
                      >
                        {shortAddress(decision.linkedActionId)}
                      </button>
                    ) : (
                      "--"
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        </article>


        <article id="points" className="panel span-2">
          <div className="panel-head">
            <div>
              <h2>Bridge History</h2>
              <p>Recent bridge requests and their current status.</p>
            </div>
            <div className="button-row">
              <button
                className={selectedStatus === "all" ? "primary compact" : "secondary compact"}
                onClick={() => setSelectedStatus("all")}
              >
                All
              </button>
              <button
                className={selectedStatus === "queued" ? "primary compact" : "secondary compact"}
                onClick={() => setSelectedStatus("queued")}
              >
                Queued
              </button>
              <button
                className={selectedStatus === "settled" ? "primary compact" : "secondary compact"}
                onClick={() => setSelectedStatus("settled")}
              >
                Settled
              </button>
              <button
                className={selectedStatus === "failed" ? "primary compact" : "secondary compact"}
                onClick={() => setSelectedStatus("failed")}
              >
                Failed
              </button>
            </div>
          </div>
          <div className="activity-table">
            <div className="activity-row activity-head user-activity-grid">
              <span>Wallet</span>
              <span>Status</span>
              <span>Amount</span>
              <span>Recipient</span>
              <span>Details</span>
            </div>
            {actions.length === 0 ? (
              <div className="activity-empty">No bridge requests for this wallet yet.</div>
            ) : (
              actions.map((action) => (
                <div
                  className={`activity-row user-activity-grid ${selectedAction?.id === action.id ? "activity-row-selected" : ""}`}
                  key={action.id}
                >
                  <span className="activity-cell" data-label="Wallet">
                    <span className="activity-address-stack">
                      <strong>{shortAddress(action.requester || activeSessionAccount)}</strong>
                      {action.source === "ai" ? <span className="badge-inline ai">AI</span> : null}
                    </span>
                  </span>
                  <span className="activity-cell" data-label="Status">
                    <ActionBadge status={action.status} />
                  </span>
                  <span className="activity-cell" data-label="Amount">{action.amountDisplay} PAS</span>
                  <span className="activity-cell" data-label="Recipient">{shortAddress(action.beneficiary)}</span>
                  <span className="activity-cell" data-label="Details">
                    <button
                      className="secondary compact"
                      onClick={() => setSelectedAction(action)}
                    >
                      View
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>Request Detail</h2>
              <p>Inspect a selected bridge request and review its latest user-safe status.</p>
            </div>
          </div>
          <div className="request-detail-hero">
            <div>
              <span className="request-detail-label">Selected request</span>
              <strong>{selectedAction ? shortAddress(selectedAction.id) : "No request selected"}</strong>
            </div>
            <div className="request-detail-status">
              {selectedAction ? <ActionBadge status={selectedAction.status} /> : <span className="badge-inline">--</span>}
            </div>
          </div>
          <div className="strategy-box">
            <div className="strategy-line">
              <span>Wallet</span>
              <strong>{shortAddress(selectedAction?.requester || activeSessionAccount)}</strong>
            </div>
            <div className="strategy-line">
              <span>Status</span>
              <strong>{selectedAction?.status || "--"}</strong>
            </div>
            <div className="strategy-line">
              <span>Beneficiary</span>
              <strong>{shortAddress(selectedAction?.beneficiary)}</strong>
            </div>
            <div className="strategy-line">
              <span>Amount</span>
              <strong>{selectedAction ? `${selectedAction.amountDisplay} PAS` : "--"}</strong>
            </div>
            <div className="strategy-line">
              <span>Linked AI note</span>
              <strong>
                {selectedAction?.aiDecisionId ? (
                  <button
                    type="button"
                    className="inline-link-button"
                    onClick={() => {
                      const linkedDecision = aiHistory.find((item) => item.id === selectedAction.aiDecisionId);
                      if (linkedDecision) {
                        pushToast(
                          "Linked AI snapshot",
                          `${linkedDecision.action} · ${linkedDecision.score}/100 · ${new Date(linkedDecision.createdAt).toLocaleString()}`,
                          "success"
                        );
                      } else {
                        pushToast("Linked AI snapshot", selectedAction.aiDecisionId || "--", "success");
                      }
                    }}
                  >
                    {shortAddress(selectedAction.aiDecisionId)}
                  </button>
                ) : (
                  "--"
                )}
              </strong>
            </div>
            <div className="strategy-line">
              <span>Original tx</span>
              <strong>
                {selectedAction?.originTxHash ? (
                  <a
                    className="inline-link"
                    href={`${appConfig.explorerUrl}/tx/${selectedAction.originTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {shortAddress(selectedAction.originTxHash)}
                  </a>
                ) : (
                  "--"
                )}
              </strong>
            </div>
          </div>
          <div className="log-box top-gap">
            <strong>Status note</strong>
            <pre>
              {selectedAction?.status === "failed"
                ? "This request failed. Review beneficiary format, request quotas, or destination settlement status."
                : selectedAction
                  ? "Request recorded. Refresh after finality if you want to confirm destination settlement again."
                  : "Select a bridge action to inspect its current state."}
            </pre>
          </div>
        </article>

      </section>

      <footer className="vault-footer">
        <div className="vault-footer-brand">
          <img className="vault-nav-mark" src="/Gemin.png" alt="XCM StableVault logo" />
          <div>
            <strong>{appConfig.name}</strong>
            <p>Stablecoin vault on Polkadot Hub with borrowing, yield, AI guidance, and XCM operations.</p>
          </div>
        </div>

        <div className="vault-footer-grid">
          <div className="vault-footer-column">
            <span>Protocol</span>
            <a href="#portfolio">Overview</a>
            <a href="#earn">Supply</a>
            <a href="#bridge">Bridge</a>
            <a href="#analytics">AI Strategy</a>
          </div>

          <div className="vault-footer-column">
            <span>Live Now</span>
            <p>Supply WPAS</p>
            <p>Borrow and repay mUSD</p>
            <p>Claim yield</p>
            <p>Bridge native PAS</p>
          </div>

          <div className="vault-footer-column">
            <span>Network</span>
            <p>{appConfig.chainName}</p>
            <p>Collateral: WPAS</p>
            <p>Stablecoin: mUSD</p>
            <p>Bridge asset: PAS</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function StatusChip({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn";
}) {
  return (
    <div className={`status-chip ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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

function ActionBadge({ status }: { status: string }) {
  return <span className={`action-badge ${status}`}>{status}</span>;
}
