// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockUSD
/// @notice Simple ERC20 testnet stablecoin with owner/minter-controlled minting
contract MockUSD {
    string public name = "Mock USD";
    string public symbol = "mUSD";
    uint8 public decimals = 18;

    uint256 public totalSupply;
    address public owner;
    mapping(address => bool) public minters;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event MinterUpdated(address indexed minter, bool allowed);

    error NotOwner();
    error NotMinter();
    error ZeroAddress();

    constructor() {
        owner = msg.sender;
        minters[msg.sender] = true;
        emit OwnershipTransferred(address(0), msg.sender);
        emit MinterUpdated(msg.sender, true);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyMinter() {
        if (!minters[msg.sender]) revert NotMinter();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setMinter(address minter, bool allowed) external onlyOwner {
        if (minter == address(0)) revert ZeroAddress();
        minters[minter] = allowed;
        emit MinterUpdated(minter, allowed);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        return transferFrom(msg.sender, to, value);
    }

    function transferFrom(address from, address to, uint256 value) public returns (bool) {
        require(balanceOf[from] >= value, "MockUSD: insufficient balance");
        if (from != msg.sender && allowance[from][msg.sender] != type(uint256).max) {
            require(allowance[from][msg.sender] >= value, "MockUSD: insufficient allowance");
            allowance[from][msg.sender] -= value;
        }

        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        return true;
    }

    function mint(address to, uint256 value) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function mintFromVault(address to, uint256 value) external onlyMinter {
        if (to == address(0)) revert ZeroAddress();
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function burnFrom(address from, uint256 value) external onlyMinter {
        require(balanceOf[from] >= value, "MockUSD: insufficient balance");
        balanceOf[from] -= value;
        totalSupply -= value;
        emit Transfer(from, address(0), value);
    }
}
