// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/// @title CredentialRegistry
/// @notice Anchors Merkle roots of verifiable credentials. No personal data is stored on-chain,
///         only a 32-byte commitment, the issuing address and a timestamp.
contract CredentialRegistry {
    address public owner;
    mapping(address => bool) public authorizedIssuers;

    struct Record {
        address issuer;
        uint64 issuedAt;
        bool revoked;
        bool exists;
    }

    mapping(bytes32 => Record) private records;
    uint256 public totalCredentials;

    event IssuerAuthorized(address indexed issuer);
    event IssuerRemoved(address indexed issuer);
    event CredentialRegistered(bytes32 indexed root, address indexed issuer, uint64 issuedAt);
    event CredentialRevoked(bytes32 indexed root, address indexed issuer);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyIssuer() {
        require(authorizedIssuers[msg.sender], "Not an authorized issuer");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function authorizeIssuer(address issuer) external onlyOwner {
        authorizedIssuers[issuer] = true;
        emit IssuerAuthorized(issuer);
    }

    function removeIssuer(address issuer) external onlyOwner {
        authorizedIssuers[issuer] = false;
        emit IssuerRemoved(issuer);
    }

    function registerCredential(bytes32 root) external onlyIssuer {
        require(root != bytes32(0), "Empty root");
        require(!records[root].exists, "Already registered");
        records[root] = Record(msg.sender, uint64(block.timestamp), false, true);
        totalCredentials += 1;
        emit CredentialRegistered(root, msg.sender, uint64(block.timestamp));
    }

    function revokeCredential(bytes32 root) external {
        Record storage r = records[root];
        require(r.exists, "Unknown credential");
        require(r.issuer == msg.sender, "Only the issuing address can revoke");
        require(!r.revoked, "Already revoked");
        r.revoked = true;
        emit CredentialRevoked(root, msg.sender);
    }

    function getRecord(bytes32 root)
        external
        view
        returns (bool exists, address issuer, uint64 issuedAt, bool revoked)
    {
        Record storage r = records[root];
        return (r.exists, r.issuer, r.issuedAt, r.revoked);
    }
}
