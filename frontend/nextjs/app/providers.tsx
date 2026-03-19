"use client";

import { PrivyProvider, useActiveWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { ReactNode, useEffect, useMemo } from "react";
import { WalletUiProvider } from "../lib/wallet-ui";
import { privyAppId, privyClientId, privyConfig, privyEnabled } from "../lib/wallet";

function parsePrivyChainId(value?: string) {
  if (!value) return null;

  if (value.startsWith("eip155:")) {
    const parsed = Number(value.slice("eip155:".length));
    return Number.isFinite(parsed) ? parsed : null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function PrivyWalletBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, connectWallet, logout } = usePrivy();
  const { wallets } = useWallets();
  const { wallet, setActiveWallet } = useActiveWallet();
  const ethereumWallet = wallet?.type === "ethereum" ? wallet : null;

  useEffect(() => {
    if (!authenticated || wallet || !wallets.length) return;

    const nextWallet = wallets[wallets.length - 1];
    if (nextWallet) {
      setActiveWallet(nextWallet);
    }
  }, [authenticated, setActiveWallet, wallet, wallets]);

  const value = useMemo(
    () => ({
      enabled: true,
      ready,
      authenticated,
      connected: Boolean(ethereumWallet && authenticated),
      account: ethereumWallet?.address ?? null,
      chainId: parsePrivyChainId(ethereumWallet?.chainId),
      wallet: ethereumWallet ?? null,
      connect: async () => {
        if (authenticated) {
          await connectWallet();
          return;
        }

        await login();
      },
      disconnect: async () => {
        if (ethereumWallet) {
          try {
            ethereumWallet.disconnect();
          } catch {}
        }
        await logout();
      },
      switchChain: async (chainId: number) => {
        if (!ethereumWallet) {
          throw new Error("No active wallet.");
        }
        await ethereumWallet.switchChain(chainId);
      },
      getEthereumProvider: async () => {
        if (!ethereumWallet) {
          throw new Error("No active wallet.");
        }
        return ethereumWallet.getEthereumProvider();
      }
    }),
    [authenticated, connectWallet, ethereumWallet, login, logout, ready]
  );

  return <WalletUiProvider value={value}>{children}</WalletUiProvider>;
}

export function Providers({ children }: { children: ReactNode }) {
  if (!privyEnabled) {
    return (
      <WalletUiProvider
        value={{
          enabled: false,
          ready: true,
          authenticated: false,
          connected: false,
          account: null,
          chainId: null,
          wallet: null,
          connect: async () => {
            throw new Error("Privy is not configured.");
          },
          disconnect: async () => undefined,
          switchChain: async () => {
            throw new Error("Privy is not configured.");
          },
          getEthereumProvider: async () => {
            throw new Error("Privy is not configured.");
          }
        }}
      >
        {children}
      </WalletUiProvider>
    );
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      {...(privyClientId ? { clientId: privyClientId } : {})}
      config={privyConfig}
    >
      <PrivyWalletBridge>{children}</PrivyWalletBridge>
    </PrivyProvider>
  );
}
