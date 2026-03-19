import { expect } from "chai";
import { ethers } from "hardhat";

describe("XCMStableVault", function () {
  it("mints XAIS on WPAS deposit", async function () {
    const [user] = await ethers.getSigners();

    const WPAS = await ethers.getContractFactory("WPAS");
    const wpas = await WPAS.deploy();
    await wpas.deployed();

    const MockUSD = await ethers.getContractFactory("MockUSD");
    const mockUsd = await MockUSD.deploy();
    await mockUsd.deployed();

    const Vault = await ethers.getContractFactory("XCMStableVault");
    const vault = await Vault.deploy(wpas.address, mockUsd.address, user.address);
    await vault.deployed();
    await mockUsd.setMinter(vault.address, true);

    const depositAmount = ethers.utils.parseEther("1");
    await wpas.deposit({ value: depositAmount });
    await wpas.approve(vault.address, depositAmount);

    await vault.depositCollateral(depositAmount);

    expect((await vault.balanceOf(user.address)).toString()).to.equal(
      depositAmount.toString()
    );
    expect((await vault.totalSupply()).toString()).to.equal(
      depositAmount.toString()
    );
  });

  it("burns XAIS and returns WPAS on withdraw", async function () {
    const [user] = await ethers.getSigners();

    const WPAS = await ethers.getContractFactory("WPAS");
    const wpas = await WPAS.deploy();
    await wpas.deployed();

    const MockUSD = await ethers.getContractFactory("MockUSD");
    const mockUsd = await MockUSD.deploy();
    await mockUsd.deployed();

    const Vault = await ethers.getContractFactory("XCMStableVault");
    const vault = await Vault.deploy(wpas.address, mockUsd.address, user.address);
    await vault.deployed();
    await mockUsd.setMinter(vault.address, true);

    const amount = ethers.utils.parseEther("2");
    await wpas.deposit({ value: amount });
    await wpas.approve(vault.address, amount);
    await vault.depositCollateral(amount);

    const withdrawAmount = ethers.utils.parseEther("1");
    await vault.withdrawCollateral(withdrawAmount);

    expect((await vault.balanceOf(user.address)).toString()).to.equal(
      ethers.utils.parseEther("1").toString()
    );
    expect((await vault.totalSupply()).toString()).to.equal(
      ethers.utils.parseEther("1").toString()
    );
  });

  it("accrues and claims MockUSD rewards over time", async function () {
    const [user] = await ethers.getSigners();

    const WPAS = await ethers.getContractFactory("WPAS");
    const wpas = await WPAS.deploy();
    await wpas.deployed();

    const MockUSD = await ethers.getContractFactory("MockUSD");
    const mockUsd = await MockUSD.deploy();
    await mockUsd.deployed();

    const Vault = await ethers.getContractFactory("XCMStableVault");
    const vault = await Vault.deploy(wpas.address, mockUsd.address, user.address);
    await vault.deployed();
    await mockUsd.setMinter(vault.address, true);

    const amount = ethers.utils.parseEther("10");
    await wpas.deposit({ value: amount });
    await wpas.approve(vault.address, amount);
    await vault.depositCollateral(amount);

    await ethers.provider.send("evm_increaseTime", [365 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);

    const preview = await vault.previewRewards(user.address);
    expect(preview.toString()).to.equal(ethers.utils.parseEther("0.65").toString());

    await vault.claimRewards();
    const claimedBalance = await mockUsd.balanceOf(user.address);
    expect(claimedBalance.gte(preview)).to.equal(true);
    expect((await vault.previewRewards(user.address)).toString()).to.equal("0");
  });

  it("checkpoints rewards correctly when the APY changes", async function () {
    const [user] = await ethers.getSigners();

    const WPAS = await ethers.getContractFactory("WPAS");
    const wpas = await WPAS.deploy();
    await wpas.deployed();

    const MockUSD = await ethers.getContractFactory("MockUSD");
    const mockUsd = await MockUSD.deploy();
    await mockUsd.deployed();

    const Vault = await ethers.getContractFactory("XCMStableVault");
    const vault = await Vault.deploy(wpas.address, mockUsd.address, user.address);
    await vault.deployed();
    await mockUsd.setMinter(vault.address, true);

    const amount = ethers.utils.parseEther("10");
    await wpas.deposit({ value: amount });
    await wpas.approve(vault.address, amount);
    await vault.depositCollateral(amount);

    await ethers.provider.send("evm_increaseTime", [182 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);
    await vault.setRewardRateBps(1000);

    await ethers.provider.send("evm_increaseTime", [183 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);

    const preview = await vault.previewRewards(user.address);
    const lowerBound = ethers.utils.parseEther("0.82");
    const upperBound = ethers.utils.parseEther("0.83");
    expect(preview.gte(lowerBound)).to.equal(true);
    expect(preview.lte(upperBound)).to.equal(true);
  });

  it("mints and repays stable debt against collateral", async function () {
    const [user] = await ethers.getSigners();

    const WPAS = await ethers.getContractFactory("WPAS");
    const wpas = await WPAS.deploy();
    await wpas.deployed();

    const MockUSD = await ethers.getContractFactory("MockUSD");
    const mockUsd = await MockUSD.deploy();
    await mockUsd.deployed();

    const Vault = await ethers.getContractFactory("XCMStableVault");
    const vault = await Vault.deploy(wpas.address, mockUsd.address, user.address);
    await vault.deployed();
    await mockUsd.setMinter(vault.address, true);

    const collateral = ethers.utils.parseEther("10");
    const borrow = ethers.utils.parseEther("5");
    await wpas.deposit({ value: collateral });
    await wpas.approve(vault.address, collateral);
    await vault.depositCollateral(collateral);

    await vault.mintStable(borrow);
    expect((await vault.debtOf(user.address)).toString()).to.equal(borrow.toString());
    expect((await mockUsd.balanceOf(user.address)).toString()).to.equal(borrow.toString());

    await mockUsd.approve(vault.address, borrow);
    await vault.repayStable(borrow);
    expect((await vault.debtOf(user.address)).toString()).to.equal("0");
    expect((await mockUsd.balanceOf(user.address)).toString()).to.equal("0");
  });

  it("blocks unsafe collateral withdrawal when debt would exceed collateral factor", async function () {
    const [user] = await ethers.getSigners();

    const WPAS = await ethers.getContractFactory("WPAS");
    const wpas = await WPAS.deploy();
    await wpas.deployed();

    const MockUSD = await ethers.getContractFactory("MockUSD");
    const mockUsd = await MockUSD.deploy();
    await mockUsd.deployed();

    const Vault = await ethers.getContractFactory("XCMStableVault");
    const vault = await Vault.deploy(wpas.address, mockUsd.address, user.address);
    await vault.deployed();
    await mockUsd.setMinter(vault.address, true);

    const collateral = ethers.utils.parseEther("10");
    await wpas.deposit({ value: collateral });
    await wpas.approve(vault.address, collateral);
    await vault.depositCollateral(collateral);
    await vault.mintStable(ethers.utils.parseEther("6"));

    let withdrawFailed = false;
    try {
      await vault.withdrawCollateral(ethers.utils.parseEther("1"));
    } catch {
      withdrawFailed = true;
    }
    expect(withdrawFailed).to.equal(true);
  });

  it("blocks deposits and reward claims while paused", async function () {
    const [user] = await ethers.getSigners();

    const WPAS = await ethers.getContractFactory("WPAS");
    const wpas = await WPAS.deploy();
    await wpas.deployed();

    const MockUSD = await ethers.getContractFactory("MockUSD");
    const mockUsd = await MockUSD.deploy();
    await mockUsd.deployed();

    const Vault = await ethers.getContractFactory("XCMStableVault");
    const vault = await Vault.deploy(wpas.address, mockUsd.address, user.address);
    await vault.deployed();
    await mockUsd.setMinter(vault.address, true);

    const amount = ethers.utils.parseEther("1");
    await wpas.deposit({ value: amount });
    await wpas.approve(vault.address, amount);
    await vault.depositCollateral(amount);
    await vault.pause();

    let depositFailed = false;
    try {
      await vault.depositCollateral(amount);
    } catch {
      depositFailed = true;
    }
    expect(depositFailed).to.equal(true);

    let claimFailed = false;
    try {
      await vault.claimRewards();
    } catch {
      claimFailed = true;
    }
    expect(claimFailed).to.equal(true);
  });
});
