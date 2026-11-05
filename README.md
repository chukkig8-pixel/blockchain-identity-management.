# ChainID: Blockchain-Based Identity Management

A working prototype of a decentralized identity system for **degree verification**
(BCA Cyber Security, Topic 22). A university issues a signed digital credential, the
student keeps it in a browser wallet, and an employer can verify a single fact
("BCA Cyber Security") without seeing the rest of the record.

| Slide topic | Where it is implemented |
|---|---|
| Digital credential issuing | `backend/service.py` `issue()`, University tab |
| Blockchain-backed records | `contracts/CredentialRegistry.sol`, `backend/ledger.py` |
| Selective disclosure | salted Merkle tree in `backend/merkle.py`, Student wallet tab |
| Tamper detection ("BCA + PhD" gives a hash mismatch) | `service.verify()`, Employer tab, "Simulate tampering" |
| Secure key management | `backend/crypto_utils.py`, `frontend/src/wallet.js` |
| Technology stack | React, Flask, Ganache + Solidity, SHA-256 + ECDSA (P-256) |
| Testing | `backend/tests`, `scripts/e2e_check.mjs` |

## Quick start (no blockchain install needed)

Requires Python 3.10+ and Node 18+ (Node only if you want the dev server or to rebuild the UI).

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py                                           # http://127.0.0.1:5000
```

Open <http://127.0.0.1:5000>. The built React app is included in `frontend/dist`.
With no Ganache deployment present, the backend uses a **local hash-chained ledger**
(`backend/data/ledger.json`) so everything works out of the box.

Frontend development (hot reload): `cd frontend && npm install && npm run dev` then open <http://localhost:5173>.
Rebuild the bundle with `npm run build`.

## Using Ganache + Solidity (the real blockchain)

```bash
npx ganache --port 7545 --deterministic          # or Ganache GUI (default port 7545)
python scripts/deploy.py --url http://127.0.0.1:7545
cd backend && python app.py                      # now anchors credentials on Ganache
```

`deploy.py` deploys `CredentialRegistry`, makes account 0 the owner and authorizes account 1 as the university issuer,
and writes `backend/contract/deployment.json`. The UI badge in the top right switches from "Local chain" to "Ganache".
Set `LEDGER=local` to force the local ledger, or `GANACHE_URL` for a different node (CLI default is port 8545).
To recompile the contract: `cd contracts && npm install && node compile.js`.

## Demo script (about 3 minutes)

1. **Student wallet**: Create wallet. The holder ID appears at the top.
2. **University**: Press "Use this browser's wallet", then "Sign and issue credential".
3. **Student wallet**: Press "Check for new credentials". The degree appears.
4. **Employer**: Press "New verification request".
5. **Student wallet**: Press "Use request from this browser", tick only *Degree*, press Create proof, then Send to employer.
6. **Employer**: Verify proof. Result: **VERIFIED**, showing only the degree, with six passing checks.
7. Create a new request and proof (steps 4-5), then press **Simulate tampering** (changes the value to "BCA + PhD") and verify:
   **Hash mismatch, tampering detected**. Each request code works once, which is why a new one is needed.
8. **University**: Revoke the credential. Verify a fresh proof and it is rejected.
9. **Ledger**: browse blocks. With the local ledger, "Simulate ledger tampering" shows the chain breaking.

## How it works

```
University --signs--> credential root --anchored--> blockchain (root only, no personal data)
     |
     v  (attributes + salts + Merkle proofs, delivered once to the wallet)
Student wallet (private key stays in the browser)
     |  chooses attributes, signs the employer's one-time challenge
     v
Employer --> /api/verifier/verify --> six checks
```

Each attribute is hashed as `SHA256("leaf|salt|name|value")` and the leaves form a Merkle tree.
The **root** is signed by the university (ECDSA P-256) and registered on the blockchain.
The student reveals only the chosen attributes plus their salts and Merkle proofs. The verifier checks:

1. **Fresh challenge**: one-time nonce, blocks replay of a captured proof.
2. **Attribute integrity**: recomputed hashes must fold up to the signed root (fails with *Hash mismatch, tampering detected*).
3. **Issuer signature**: valid ECDSA signature from the trusted university key.
4. **Blockchain anchor**: the root is registered by the authorized issuer.
5. **Not revoked**: checked on the ledger.
6. **Holder binding**: the presenter signed the challenge with the private key matching the credential's holder ID, so a stolen credential file is useless.

## Security design and key management

- No keys are hard-coded. The issuer key is generated on first start, saved with mode `0600`, and can be encrypted at rest by setting `ISSUER_KEY_PASSPHRASE`.
- Student keys are generated in the browser with WebCrypto. The server only ever receives the public key.
- The server stores credential metadata and hashes, never attribute values.
- Per-attribute random salts prevent guessing hidden values (such as CGPA) from the root.
- Input validation and a 128 KB request cap on every endpoint. Security headers on all responses.
- Key loss or compromise: the student restores from the downloaded backup, or the university revokes the credential and reissues it to a new key.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/holders` | Register a wallet public key (JWK) |
| GET | `/api/holders/<id>/inbox` | Wallet collects newly issued credentials (one-time) |
| POST | `/api/issuer/issue` | Issue, sign and anchor a credential |
| GET | `/api/issuer/credentials` | List issued credentials and revocation status |
| POST | `/api/issuer/revoke` | Revoke a credential |
| POST | `/api/verifier/challenge` | Create a one-time verification request |
| POST | `/api/verifier/verify` | Verify a presentation |
| GET | `/api/ledger` | Ledger blocks and integrity status |

## Tests

```bash
cd backend && pytest -q                    # 22 tests: crypto, Merkle, API, tamper/replay/revoke, real Solidity contract
node scripts/e2e_check.mjs URL             # live end-to-end run (server must be running), uses the real wallet code
```

The contract tests deploy the compiled Solidity contract to an in-memory EVM (eth-tester). See `docs/TEST_REPORT.md`.

## Limitations (also on the Testing slide)

- **Scalability**: every credential is one transaction, and the local ledger has no consensus.
- **Cost**: on a public chain each registration costs gas. Ganache is free but not a public network.
- **Key recovery**: a lost key with no backup means revoke and reissue. There is no self-service recovery.
- Prototype scope: a single trusted issuer, no user authentication on the University and Employer tabs, no rate limiting, and the credential inbox is held in server memory until collected. Add authentication, TLS and rate limiting before any real use.
- The wallet keeps keys in browser `localStorage`, which is convenient for a demo but weaker than a hardware-backed store.
