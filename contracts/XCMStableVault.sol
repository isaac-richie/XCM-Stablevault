// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
}

interface IMockUSD {
    function mintFromVault(address to, uint256 value) external;
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function burnFrom(address from, uint256 value) external;
}

interface IXcmPrecompile {
    struct Weight {
        uint64 refTime;
        uint64 proofSize;
    }

    function weighMessage(bytes calldata message) external view returns (Weight memory weight);
    function execute(bytes calldata message, Weight calldata weight) external;
    function send(bytes calldata destination, bytes calldata message) external;
}

/// @title XCMStableVault
/// @notice Collateralized stablecoin vault with APY rewards and guarded XCM controls.
/// @dev Users deposit WPAS-like collateral, borrow MockUSD against it, accrue
/// reward emissions over time, and can optionally route XCM messages through
/// owner/AI-controlled guardrails.
contract XCMStableVault {
    uint256 private constant YEAR = 365 days;
    uint256 private constant BPS = 10_000;
    uint256 private constant REWARD_PRECISION = 1e18;

    string public name = "XCM AI Stable";
    string public symbol = "XAIS";
    uint8 public decimals = 18;

    address public immutable collateralToken;
    address public immutable stableToken;
    address public owner;
    address public aiOperator;
    bool public paused;
    bool public allowAllMessages;
    uint256 public minNativeBalance;
    uint256 public rewardRateBps;
    uint256 public collateralFactorBps;

    uint256 public totalSupply;
    uint256 public totalCollateral;
    uint256 public totalDebt;
    uint256 public accRewardPerShare;
    uint256 public rewardLastUpdated;
    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public debtOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public pendingRewards;
    mapping(address => uint256) public rewardDebt;
    mapping(bytes32 => bool) public allowedMessageHashes;
    mapping(bytes32 => bool) public allowedDestinationHashes;
    mapping(bytes32 => bool) public allowedTemplateHashes;
    mapping(bytes32 => uint256) public templateLengths;
    bytes32[] public templateList;

    uint256 private locked = 1;

    error NotOwner();
    error NotAi();
    error PausedError();
    error ZeroAddress();
    error AmountZero();
    error TransferFailed();
    error XcmNotAllowed();
    error Reentrancy();
    error RewardRateTooHigh();
    error UnsafePosition();
    error DebtPositionLocked();

    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event CollateralDeposited(address indexed user, uint256 amount);
    event StableMinted(address indexed user, uint256 amount);
    event StableRepaid(address indexed user, uint256 amount);
    event XcmExecuted(address indexed caller, bytes32 indexed messageHash, IXcmPrecompile.Weight weight);
    event XcmSent(address indexed caller, bytes32 indexed destinationHash, bytes32 indexed messageHash);
    event AiOperatorUpdated(address indexed newOperator);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address indexed caller);
    event Unpaused(address indexed caller);
    event MessageAllowlistUpdated(bytes32 indexed messageHash, bool allowed);
    event DestinationAllowlistUpdated(bytes32 indexed destinationHash, bool allowed);
    event TemplateAllowlistUpdated(bytes32 indexed templateHash, uint256 length, bool allowed);
    event AllowAllMessagesUpdated(bool allowed);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event NativeReceived(address indexed from, uint256 amount);
    event MinNativeBalanceUpdated(uint256 amount);
    event RewardRateUpdated(uint256 rewardRateBps);
    event CollateralFactorUpdated(uint256 collateralFactorBps);
    event RewardsClaimed(address indexed user, uint256 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAi() {
        if (msg.sender != aiOperator) revert NotAi();
        _;
    }

    modifier nonReentrant() {
        if (locked != 1) revert Reentrancy();
        locked = 2;
        _;
        locked = 1;
    }

    modifier whenNotPaused() {
        if (paused) revert PausedError();
        _;
    }

    modifier hasMinNativeBalance() {
        require(address(this).balance >= minNativeBalance, "Vault: insufficient native balance");
        _;
    }

    constructor(address collateralTokenAddress, address stableTokenAddress, address aiAddress) {
        if (collateralTokenAddress == address(0)) revert ZeroAddress();
        if (stableTokenAddress == address(0)) revert ZeroAddress();
        owner = msg.sender;
        collateralToken = collateralTokenAddress;
        stableToken = stableTokenAddress;
        aiOperator = aiAddress == address(0) ? msg.sender : aiAddress;
        rewardRateBps = 650;
        collateralFactorBps = 6_000;
        rewardLastUpdated = block.timestamp;
        emit OwnershipTransferred(address(0), msg.sender);
        emit AiOperatorUpdated(aiOperator);
        emit RewardRateUpdated(rewardRateBps);
        emit CollateralFactorUpdated(collateralFactorBps);
    }

    receive() external payable {
        emit NativeReceived(msg.sender, msg.value);
    }

    function approve(address spender, uint256 value) public returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) public whenNotPaused returns (bool) {
        return transferFrom(msg.sender, to, value);
    }

    function transferFrom(address from, address to, uint256 value) public whenNotPaused returns (bool) {
        // Share transfers are disabled for positions carrying debt. This keeps the
        // collateral/debt relationship simple for the hackathon build and avoids
        // transferring an undercollateralized position to another wallet.
        if (debtOf[from] > 0 || debtOf[to] > 0) revert DebtPositionLocked();
        _accrueRewards(from);
        if (to != address(0) && to != from) _accrueRewards(to);
        require(balanceOf[from] >= value, "Vault: insufficient balance");
        if (from != msg.sender && allowance[from][msg.sender] != type(uint256).max) {
            require(allowance[from][msg.sender] >= value, "Vault: insufficient allowance");
            allowance[from][msg.sender] -= value;
        }

        balanceOf[from] -= value;
        balanceOf[to] += value;
        rewardDebt[from] = balanceOf[from] * accRewardPerShare / REWARD_PRECISION;
        rewardDebt[to] = balanceOf[to] * accRewardPerShare / REWARD_PRECISION;
        emit Transfer(from, to, value);
        return true;
    }

    function depositCollateral(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert AmountZero();
        // Shares are minted 1:1 with supplied collateral in this version of the vault.
        // That keeps accounting legible while we focus on borrow, repay, rewards, and XCM.
        _accrueRewards(msg.sender);
        bool ok = IERC20(collateralToken).transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();

        totalSupply += amount;
        totalCollateral += amount;
        balanceOf[msg.sender] += amount;
        rewardDebt[msg.sender] = balanceOf[msg.sender] * accRewardPerShare / REWARD_PRECISION;
        emit Transfer(address(0), msg.sender, amount);
        emit CollateralDeposited(msg.sender, amount);
    }

    function withdrawCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert AmountZero();
        _accrueRewards(msg.sender);
        require(balanceOf[msg.sender] >= amount, "Vault: insufficient balance");
        // A withdrawal is only allowed if the remaining collateral still backs the
        // user's outstanding mUSD debt under the configured collateral factor.
        if (!_isSolvent(balanceOf[msg.sender] - amount, debtOf[msg.sender])) revert UnsafePosition();

        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        totalCollateral -= amount;
        rewardDebt[msg.sender] = balanceOf[msg.sender] * accRewardPerShare / REWARD_PRECISION;

        emit Transfer(msg.sender, address(0), amount);
        emit CollateralWithdrawn(msg.sender, amount);

        bool ok = IERC20(collateralToken).transfer(msg.sender, amount);
        if (!ok) revert TransferFailed();
    }

    function mintStable(uint256 amount) external whenNotPaused nonReentrant returns (bool) {
        if (amount == 0) revert AmountZero();
        _accrueRewards(msg.sender);

        uint256 nextDebt = debtOf[msg.sender] + amount;
        // Borrowing power is purely collateral-factor based in this build:
        // no price oracle yet, so 1 unit of collateral is treated as 1 unit of value.
        if (!_isSolvent(balanceOf[msg.sender], nextDebt)) revert UnsafePosition();

        debtOf[msg.sender] = nextDebt;
        totalDebt += amount;
        IMockUSD(stableToken).mintFromVault(msg.sender, amount);
        emit StableMinted(msg.sender, amount);
        return true;
    }

    function repayStable(uint256 amount) external whenNotPaused nonReentrant returns (bool) {
        if (amount == 0) revert AmountZero();
        _accrueRewards(msg.sender);
        require(debtOf[msg.sender] >= amount, "Vault: repay exceeds debt");

        bool ok = IMockUSD(stableToken).transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();

        IMockUSD(stableToken).burnFrom(address(this), amount);
        debtOf[msg.sender] -= amount;
        totalDebt -= amount;
        emit StableRepaid(msg.sender, amount);
        return true;
    }

    function claimRewards() external whenNotPaused nonReentrant returns (uint256 claimed) {
        _accrueRewards(msg.sender);
        claimed = pendingRewards[msg.sender];
        require(claimed > 0, "Vault: no rewards");

        pendingRewards[msg.sender] = 0;
        IMockUSD(stableToken).mintFromVault(msg.sender, claimed);
        emit RewardsClaimed(msg.sender, claimed);
    }

    function previewRewards(address user) external view returns (uint256) {
        uint256 nextAccRewardPerShare = accRewardPerShare;
        if (block.timestamp > rewardLastUpdated && totalSupply > 0 && rewardRateBps > 0) {
            uint256 elapsed = block.timestamp - rewardLastUpdated;
            uint256 accrued = totalSupply * rewardRateBps * elapsed / YEAR / BPS;
            nextAccRewardPerShare += accrued * REWARD_PRECISION / totalSupply;
        }

        uint256 accumulated = balanceOf[user] * nextAccRewardPerShare / REWARD_PRECISION;
        return pendingRewards[user] + accumulated - rewardDebt[user];
    }

    function projectedYearlyRewards(address user) external view returns (uint256) {
        return balanceOf[user] * rewardRateBps / BPS;
    }

    function maxMintable(address user) external view returns (uint256) {
        uint256 capacity = balanceOf[user] * collateralFactorBps / BPS;
        if (capacity <= debtOf[user]) return 0;
        return capacity - debtOf[user];
    }

    function setAiOperator(address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert ZeroAddress();
        aiOperator = newOperator;
        emit AiOperatorUpdated(newOperator);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setAllowAllMessages(bool allowed) external onlyOwner {
        allowAllMessages = allowed;
        emit AllowAllMessagesUpdated(allowed);
    }

    function setAllowedMessageHash(bytes32 messageHash, bool allowed) external onlyOwner {
        allowedMessageHashes[messageHash] = allowed;
        emit MessageAllowlistUpdated(messageHash, allowed);
    }

    function setAllowedDestinationHash(bytes32 destinationHash, bool allowed) external onlyOwner {
        allowedDestinationHashes[destinationHash] = allowed;
        emit DestinationAllowlistUpdated(destinationHash, allowed);
    }

    function setAllowedTemplate(bytes32 templateHash, uint256 length, bool allowed) external onlyOwner {
        if (allowed) {
            require(length > 0, "Vault: length=0");
            if (!allowedTemplateHashes[templateHash]) {
                templateList.push(templateHash);
            }
            templateLengths[templateHash] = length;
        } else {
            templateLengths[templateHash] = 0;
        }
        allowedTemplateHashes[templateHash] = allowed;
        emit TemplateAllowlistUpdated(templateHash, length, allowed);
    }

    function setMinNativeBalance(uint256 amount) external onlyOwner {
        minNativeBalance = amount;
        emit MinNativeBalanceUpdated(amount);
    }

    function setRewardRateBps(uint256 nextRewardRateBps) external onlyOwner {
        if (nextRewardRateBps > 2_500) revert RewardRateTooHigh();
        _updateGlobalRewards();
        rewardRateBps = nextRewardRateBps;
        emit RewardRateUpdated(nextRewardRateBps);
    }

    function setCollateralFactorBps(uint256 nextCollateralFactorBps) external onlyOwner {
        require(nextCollateralFactorBps > 0 && nextCollateralFactorBps <= 8_500, "Vault: invalid collateral factor");
        collateralFactorBps = nextCollateralFactorBps;
        emit CollateralFactorUpdated(nextCollateralFactorBps);
    }

    function executeXcm(bytes calldata message) public whenNotPaused nonReentrant returns (bool) {
        bytes32 messageHash = keccak256(message);
        // The AI/operator can only execute messages that were explicitly allowlisted,
        // unless the owner has intentionally enabled unrestricted message flow.
        if (!allowAllMessages && !_isMessageAllowed(message, messageHash)) revert XcmNotAllowed();

        IXcmPrecompile precompile = IXcmPrecompile(0x00000000000000000000000000000000000a0000);
        IXcmPrecompile.Weight memory weight = precompile.weighMessage(message);
        precompile.execute(message, weight);
        emit XcmExecuted(msg.sender, messageHash, weight);
        return true;
    }

    function sendXcm(bytes calldata destination, bytes calldata message)
        public
        whenNotPaused
        nonReentrant
        hasMinNativeBalance
        returns (bool)
    {
        bytes32 messageHash = keccak256(message);
        if (!allowAllMessages && !_isMessageAllowed(message, messageHash)) revert XcmNotAllowed();
        bytes32 destinationHash = keccak256(destination);
        // Destinations are allowlisted separately from message payloads so we can
        // restrict both "where funds go" and "what kind of message is sent".
        if (!allowedDestinationHashes[destinationHash]) revert XcmNotAllowed();

        IXcmPrecompile precompile = IXcmPrecompile(0x00000000000000000000000000000000000a0000);
        precompile.send(destination, message);
        emit XcmSent(msg.sender, destinationHash, messageHash);
        return true;
    }

    function aiRebalance(bytes calldata message) external onlyAi returns (bool) {
        return executeXcm(message);
    }

    function aiSend(bytes calldata destination, bytes calldata message) external onlyAi returns (bool) {
        return sendXcm(destination, message);
    }

    function templateCount() external view returns (uint256) {
        return templateList.length;
    }

    function _isMessageAllowed(bytes calldata message, bytes32 messageHash) internal view returns (bool) {
        if (allowedMessageHashes[messageHash]) return true;
        uint256 len = templateList.length;
        for (uint256 i = 0; i < len; i++) {
            bytes32 templateHash = templateList[i];
            if (!allowedTemplateHashes[templateHash]) continue;
            uint256 tLen = templateLengths[templateHash];
            if (tLen == 0 || message.length < tLen) continue;
            bytes32 prefixHash;
            assembly {
                let ptr := mload(0x40)
                calldatacopy(ptr, message.offset, tLen)
                prefixHash := keccak256(ptr, tLen)
            }
            if (prefixHash == templateHash) return true;
        }
        return false;
    }

    function _accrueRewards(address user) internal {
        _updateGlobalRewards();
        if (user == address(0)) return;
        // Classic reward-index accounting: users earn their pro-rata share of emissions
        // without looping over all vault depositors.
        uint256 accumulated = balanceOf[user] * accRewardPerShare / REWARD_PRECISION;
        uint256 debt = rewardDebt[user];
        if (accumulated > debt) pendingRewards[user] += accumulated - debt;
        rewardDebt[user] = accumulated;
    }

    function _updateGlobalRewards() internal {
        if (block.timestamp <= rewardLastUpdated) return;
        if (totalSupply == 0 || rewardRateBps == 0) {
            rewardLastUpdated = block.timestamp;
            return;
        }

        uint256 elapsed = block.timestamp - rewardLastUpdated;
        uint256 accrued = totalSupply * rewardRateBps * elapsed / YEAR / BPS;
        accRewardPerShare += accrued * REWARD_PRECISION / totalSupply;
        rewardLastUpdated = block.timestamp;
    }

    function _isSolvent(uint256 collateralAmount, uint256 debtAmount) internal view returns (bool) {
        return debtAmount <= collateralAmount * collateralFactorBps / BPS;
    }
}
