"use client";

import type { ConnectedWallet } from "@privy-io/react-auth";
import { createContext, useContext } from "react";

export type WalletUiContextValue = {
  enabled: boolean;
  ready: boolean;
  authenticated: boolean;
  connected: boolean;
  account: string | null;
  chainId: number | null;
  wallet: ConnectedWallet | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchChain: (chainId: number) => Promise<void>;
  getEthereumProvider: () => Promise<any>;
};

const WalletUiContext = createContext<WalletUiContextValue>({
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
});

export function WalletUiProvider({
  value,
  children
}: {
  value: WalletUiContextValue;
  children: React.ReactNode;
}) {
  return <WalletUiContext.Provider value={value}>{children}</WalletUiContext.Provider>;
}

export function useWalletUi() {
  return useContext(WalletUiContext);
}
