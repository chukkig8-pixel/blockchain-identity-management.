"""Ledger back-ends.

LocalLedger : a hash-chained block list persisted to JSON. Works with zero setup and lets the
              demo show tamper detection on the chain itself.
Web3Ledger  : talks to the Solidity CredentialRegistry on Ganache (or any EVM node).

Both expose the same interface so the rest of the app does not care which one is active.
"""
import hashlib
import json
import os
import time
from pathlib import Path

CONTRACT_JSON = Path(__file__).parent / "contract" / "CredentialRegistry.json"
DEPLOYMENT_JSON = Path(__file__).parent / "contract" / "deployment.json"


class LedgerError(Exception):
    pass


class LocalLedger:
    kind = "local"
    label = "Local hash-chain ledger"
    issuer_identity = "university-issuer"

    def __init__(self, path):
        self.path = Path(path)
        self.blocks = []
        if self.path.exists():
            self.blocks = json.loads(self.path.read_text())
        else:
            self._append("GENESIS", {})

    @staticmethod
    def _hash(block):
        body = {k: block[k] for k in ("index", "timestamp", "prev_hash", "type", "payload")}
        return hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()

    def _append(self, kind, payload):
        block = {
            "index": len(self.blocks),
            "timestamp": int(time.time()),
            "prev_hash": self.blocks[-1]["hash"] if self.blocks else "0" * 64,
            "type": kind,
            "payload": payload,
        }
        block["hash"] = self._hash(block)
        self.blocks.append(block)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.blocks, indent=2))
        return block

    def register(self, root):
        if self.lookup(root)["exists"]:
            raise LedgerError("Credential root already registered")
        b = self._append("REGISTER", {"root": root, "issuer": self.issuer_identity})
        return {"tx": b["hash"], "block": b["index"]}

    def revoke(self, root):
        rec = self.lookup(root)
        if not rec["exists"]:
            raise LedgerError("Unknown credential")
        if rec["revoked"]:
            raise LedgerError("Already revoked")
        b = self._append("REVOKE", {"root": root, "issuer": self.issuer_identity})
        return {"tx": b["hash"], "block": b["index"]}

    def lookup(self, root):
        rec = {"exists": False, "issuer": None, "issued_at": None, "revoked": False}
        for b in self.blocks:
            if b["payload"].get("root") != root:
                continue
            if b["type"] == "REGISTER" and not rec["exists"]:
                rec.update(exists=True, issuer=b["payload"]["issuer"], issued_at=b["timestamp"])
            elif b["type"] == "REVOKE":
                rec["revoked"] = True
        return rec

    def validate(self):
        """Re-compute every hash and link. Returns (ok, first_bad_index)."""
        prev = "0" * 64
        for i, b in enumerate(self.blocks):
            if b["index"] != i or b["prev_hash"] != prev or b["hash"] != self._hash(b):
                return {"valid": False, "broken_at": i}
            prev = b["hash"]
        return {"valid": True, "broken_at": None}

    def describe(self):
        chain = self.validate()
        return {
            "kind": self.kind, "label": self.label, "height": len(self.blocks),
            "valid": chain["valid"], "broken_at": chain["broken_at"],
            "blocks": list(reversed(self.blocks[-25:])),
        }

    # Demo only: silently edit a block to show that the chain detects it.
    def tamper_demo(self):
        for b in reversed(self.blocks):
            if b["type"] == "REGISTER":
                b["payload"]["root"] = "f" * 64
                self.path.write_text(json.dumps(self.blocks, indent=2))
                return b["index"]
        raise LedgerError("No credential block to tamper with yet")

    def repair_demo(self):
        """Demo only: rebuild hashes so the demo can be reset (not possible on a real chain)."""
        raise LedgerError("Use the Reset demo data button to restore a clean chain")


class Web3Ledger:
    kind = "web3"

    def __init__(self, provider=None, url=None, address=None, issuer_account=None):
        from web3 import Web3

        self.w3 = Web3(provider or Web3.HTTPProvider(url or "http://127.0.0.1:7545"))
        if not self.w3.is_connected():
            raise LedgerError(f"Cannot connect to blockchain node at {url}")
        artifact = json.loads(CONTRACT_JSON.read_text())
        if address is None:
            if not DEPLOYMENT_JSON.exists():
                raise LedgerError("Contract not deployed. Run: python scripts/deploy.py")
            address = json.loads(DEPLOYMENT_JSON.read_text())["address"]
        self.contract = self.w3.eth.contract(address=Web3.to_checksum_address(address), abi=artifact["abi"])
        accounts = self.w3.eth.accounts
        self.issuer_account = issuer_account or (accounts[1] if len(accounts) > 1 else accounts[0])
        self.issuer_identity = self.issuer_account
        self.label = f"Ethereum (Ganache) - contract {address[:10]}..."

    @staticmethod
    def _b32(root):
        return bytes.fromhex(root)

    def _send(self, fn):
        try:
            tx = fn.transact({"from": self.issuer_account})
            receipt = self.w3.eth.wait_for_transaction_receipt(tx)
        except Exception as e:  # revert reasons surface here
            raise LedgerError(str(e))
        return {"tx": receipt["transactionHash"].hex(), "block": receipt["blockNumber"]}

    def register(self, root):
        return self._send(self.contract.functions.registerCredential(self._b32(root)))

    def revoke(self, root):
        return self._send(self.contract.functions.revokeCredential(self._b32(root)))

    def lookup(self, root):
        exists, issuer, issued_at, revoked = self.contract.functions.getRecord(self._b32(root)).call()
        return {"exists": exists, "issuer": issuer if exists else None,
                "issued_at": issued_at if exists else None, "revoked": revoked}

    def validate(self):
        return {"valid": True, "broken_at": None}  # integrity is guaranteed by the node itself

    def describe(self):
        events = []
        for name, kind in (("CredentialRegistered", "REGISTER"), ("CredentialRevoked", "REVOKE")):
            for ev in getattr(self.contract.events, name).get_logs(fromBlock=0):
                blk = self.w3.eth.get_block(ev["blockNumber"])
                events.append({
                    "index": ev["blockNumber"], "timestamp": blk["timestamp"], "type": kind,
                    "payload": {"root": ev["args"]["root"].hex(), "issuer": ev["args"]["issuer"]},
                    "hash": ev["transactionHash"].hex(), "prev_hash": blk["parentHash"].hex(),
                })
        events.sort(key=lambda e: e["index"], reverse=True)
        return {"kind": self.kind, "label": self.label, "height": self.w3.eth.block_number,
                "valid": True, "broken_at": None, "blocks": events[:25]}

    def tamper_demo(self):
        raise LedgerError("A real blockchain cannot be edited - that is the point. "
                          "Use the local ledger to see chain tampering.")


def make_ledger(data_dir):
    """LEDGER=local | web3 | auto (default: use Ganache if deployed, else local)."""
    mode = os.environ.get("LEDGER", "auto").lower()
    if mode in ("web3", "auto") and DEPLOYMENT_JSON.exists():
        try:
            return Web3Ledger(url=os.environ.get("GANACHE_URL", "http://127.0.0.1:7545"))
        except Exception as e:
            if mode == "web3":
                raise
            print(f"[ledger] Ganache not available ({e}); falling back to local ledger")
    elif mode == "web3":
        raise LedgerError("LEDGER=web3 but contract not deployed. Run: python scripts/deploy.py")
    return LocalLedger(Path(data_dir) / "ledger.json")
