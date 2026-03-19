require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

async function main() {
  const rpc = process.env.HUB_RPC_URL;
  const pk = process.env.HUB_PRIVATE_KEY;
  const vaultAddress = process.env.VAULT_ADDRESS;
  const wpasAddress = process.env.WPAS_ADDRESS;
  const provider = new ethers.providers.StaticJsonRpcProvider(rpc, { chainId: 420420417, name: 'Polkadot Hub TestNet' });
  const wallet = new ethers.Wallet(pk, provider);

  const vaultAbi = [
    'function collateralToken() view returns (address)',
    'function paused() view returns (bool)',
    'function balanceOf(address) view returns (uint256)',
    'function depositCollateral(uint256 amount)',
    'function totalCollateral() view returns (uint256)'
  ];
  const erc20Abi = [
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address,address) view returns (uint256)'
  ];

  const vault = new ethers.Contract(vaultAddress, vaultAbi, wallet);
  const wpas = new ethers.Contract(wpasAddress, erc20Abi, wallet);

  const depositAmount = ethers.utils.parseEther('0.25');
  const [collateralToken, paused, nativeBalance, wpasBalance, allowance, vaultShares, totalCollateral] = await Promise.all([
    vault.collateralToken(),
    vault.paused(),
    wallet.getBalance(),
    wpas.balanceOf(wallet.address),
    wpas.allowance(wallet.address, vaultAddress),
    vault.balanceOf(wallet.address),
    vault.totalCollateral()
  ]);

  console.log(JSON.stringify({
    wallet: wallet.address,
    rpc,
    vaultAddress,
    wpasAddress,
    collateralToken,
    collateralMatches: collateralToken.toLowerCase() === wpasAddress.toLowerCase(),
    paused,
    nativeBalance: ethers.utils.formatEther(nativeBalance),
    wpasBalance: ethers.utils.formatEther(wpasBalance),
    allowance: ethers.utils.formatEther(allowance),
    vaultShares: ethers.utils.formatEther(vaultShares),
    totalCollateral: ethers.utils.formatEther(totalCollateral),
    testDepositAmount: ethers.utils.formatEther(depositAmount)
  }, null, 2));

  try {
    await vault.callStatic.depositCollateral(depositAmount);
    console.log('CALL_STATIC=ok');
  } catch (err) {
    console.log('CALL_STATIC_ERROR=', err.reason || err.errorName || err.message);
    if (err.error && err.error.message) console.log('INNER_ERROR=', err.error.message);
    if (err.data) console.log('ERROR_DATA=', err.data);
  }

  try {
    const gas = await vault.estimateGas.depositCollateral(depositAmount);
    console.log('ESTIMATE_GAS=', gas.toString());
  } catch (err) {
    console.log('ESTIMATE_GAS_ERROR=', err.reason || err.errorName || err.message);
    if (err.error && err.error.message) console.log('INNER_ERROR=', err.error.message);
    if (err.data) console.log('ERROR_DATA=', err.data);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
