# Test report

Run date: 2026-11-01. Environment: Python 3.12, Node 18+, web3 6.20.3, solc 0.8.19 (evm paris).

## Automated results

| Suite | Result |
|---|---|
| `pytest` (22 tests) | 22 passed |
| `scripts/e2e_check.mjs` against a live server (9 checks) | 9 passed |
| Frontend `npm run build` | succeeds |
| WebCrypto (browser-style) signature verified by the Python backend | passed |

### Functional
Merkle proofs for 1, 2, 3, 5 and 8 leaves; credential issue, wallet inbox, selective disclosure of one attribute,
revocation, malformed input rejection, unknown holder.

### Security
- Edited attribute ("BCA Cyber Security" changed to "BCA + PhD"): rejected with *Hash mismatch, tampering detected*.
- Forged issuer signature rejected. Root not anchored by the trusted issuer rejected.
- Replay of a used proof rejected. Unknown or expired challenge rejected.
- Credential presented with a different private key (stolen credential) rejected.
- Revoked credential rejected.
- Hidden attributes (CGPA, name) do not appear in the shared proof; the server state holds no attribute values.
- Local ledger: editing a stored block breaks the chain and is reported with the block index.
- Issuer key file mode 0600 and passphrase encryption verified.
- Smart contract (on an in-memory EVM): unauthorized address cannot register, only the issuing address can revoke, duplicate roots rejected.

## Not covered by these runs
- A live Ganache instance. The contract and `Web3Ledger` were exercised on eth-tester, and `scripts/deploy.py` uses the same web3 calls, but it has not been run against Ganache itself.
- Visual or browser-driven testing of the React interface. The bundle builds and the wallet code was exercised from Node, but the pages were not clicked through in a browser.
- Load or performance testing beyond functional timing; the full test suite runs in under 2 seconds.
