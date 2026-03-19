export const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)"
] as const;

export const wpasAbi = [
  ...erc20Abi,
  "function deposit() payable",
  "function withdraw(uint256 wad)"
] as const;

export const vaultAbi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function debtOf(address owner) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function totalCollateral() view returns (uint256)",
  "function totalDebt() view returns (uint256)",
  "function collateralToken() view returns (address)",
  "function stableToken() view returns (address)",
  "function owner() view returns (address)",
  "function aiOperator() view returns (address)",
  "function paused() view returns (bool)",
  "function rewardRateBps() view returns (uint256)",
  "function collateralFactorBps() view returns (uint256)",
  "function previewRewards(address user) view returns (uint256)",
  "function projectedYearlyRewards(address user) view returns (uint256)",
  "function maxMintable(address user) view returns (uint256)",
  "function depositCollateral(uint256 amount)",
  "function withdrawCollateral(uint256 amount)",
  "function mintStable(uint256 amount)",
  "function repayStable(uint256 amount)",
  "function claimRewards() returns (uint256)",
  "function minNativeBalance() view returns (uint256)"
] as const;

export const mockUsdAbi = [
  ...erc20Abi,
  "function totalSupply() view returns (uint256)",
  "function mint(address to, uint256 value)"
] as const;
