import type { PrivyClientConfig } from "@privy-io/react-auth";
import { appConfig } from "./config";

export const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
export const privyClientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID ?? "";
// Keep Privy opt-in and conservative. A malformed or placeholder app ID should
// not take down the whole Next.js build or prerender path.
export const privyEnabled = /^[a-z0-9]{20,}$/i.test(privyAppId);

export const privyConfig: PrivyClientConfig = {
  loginMethods: ["wallet"],
  appearance: {
    theme: "dark",
    accentColor: "#7ce0c3"
  },
  defaultChain: {
    id: appConfig.chainId,
    name: appConfig.chainName,
    nativeCurrency: {
      name: appConfig.chainSymbol,
      symbol: appConfig.chainSymbol,
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: [appConfig.rpcUrl]
      }
    },
    blockExplorers: {
      default: {
        name: "Blockscout",
        url: appConfig.explorerUrl
      }
    }
  },
  supportedChains: [
    {
      id: appConfig.chainId,
      name: appConfig.chainName,
      nativeCurrency: {
        name: appConfig.chainSymbol,
        symbol: appConfig.chainSymbol,
        decimals: 18
      },
      rpcUrls: {
        default: {
          http: [appConfig.rpcUrl]
        }
      },
      blockExplorers: {
        default: {
          name: "Blockscout",
          url: appConfig.explorerUrl
        }
      }
    }
  ]
};
