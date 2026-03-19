import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";
import * as dotenv from "dotenv";

dotenv.config();

const HUB_RPC_URL = process.env.HUB_RPC_URL || "";
const HUB_PRIVATE_KEY = process.env.HUB_PRIVATE_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 }
    }
  },
  networks: {
    hardhat: {},
    hub: {
      url: HUB_RPC_URL,
      accounts: HUB_PRIVATE_KEY ? [HUB_PRIVATE_KEY] : []
    }
  }
};

export default config;
