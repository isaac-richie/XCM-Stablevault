export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "XCM StableVault",
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || "420420417"),
  chainName: process.env.NEXT_PUBLIC_CHAIN_NAME || "Polkadot Hub TestNet",
  chainSymbol: process.env.NEXT_PUBLIC_CHAIN_SYMBOL || "PAS",
  rpcUrl:
    process.env.NEXT_PUBLIC_HUB_RPC_URL ||
    "https://services.polkadothub-rpc.com/testnet/",
  explorerUrl:
    process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL ||
    "https://blockscout-testnet.polkadot.io/",
  wpasAddress: process.env.NEXT_PUBLIC_WPAS_ADDRESS || "",
  vaultAddress: process.env.NEXT_PUBLIC_VAULT_ADDRESS || "",
  mockUsdAddress: process.env.NEXT_PUBLIC_MOCKUSD_ADDRESS || "",
  peopleBeneficiary:
    process.env.NEXT_PUBLIC_PEOPLE_BENEFICIARY || ""
};

export const chainParams = {
  chainIdHex: `0x${appConfig.chainId.toString(16)}`,
  chainName: appConfig.chainName,
  nativeCurrency: {
    name: appConfig.chainSymbol,
    symbol: appConfig.chainSymbol,
    decimals: 18
  },
  rpcUrls: [appConfig.rpcUrl],
  blockExplorerUrls: [appConfig.explorerUrl]
};
