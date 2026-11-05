"""Deploy CredentialRegistry to Ganache and authorize the issuer account.

Usage (Ganache running):  python scripts/deploy.py [--url http://127.0.0.1:7545]
Account 0 = contract owner, account 1 = the university issuer address.
"""
import argparse
import json
import sys
from pathlib import Path

from web3 import Web3

ROOT = Path(__file__).resolve().parents[1] / "backend" / "contract"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:7545", help="Ganache GUI=7545, ganache CLI=8545")
    args = ap.parse_args()

    w3 = Web3(Web3.HTTPProvider(args.url))
    if not w3.is_connected():
        sys.exit(f"Cannot reach a blockchain node at {args.url}. Start Ganache first.")
    art = json.loads((ROOT / "CredentialRegistry.json").read_text())
    owner, issuer = w3.eth.accounts[0], w3.eth.accounts[1]

    contract = w3.eth.contract(abi=art["abi"], bytecode=art["bytecode"])
    receipt = w3.eth.wait_for_transaction_receipt(contract.constructor().transact({"from": owner}))
    address = receipt["contractAddress"]
    deployed = w3.eth.contract(address=address, abi=art["abi"])
    w3.eth.wait_for_transaction_receipt(deployed.functions.authorizeIssuer(issuer).transact({"from": owner}))

    (ROOT / "deployment.json").write_text(json.dumps(
        {"address": address, "owner": owner, "issuer": issuer, "url": args.url}, indent=2))
    print(f"Deployed CredentialRegistry at {address}")
    print(f"Owner  : {owner}\nIssuer : {issuer} (authorized)")
    print("Restart the backend; it will now anchor credentials on Ganache.")


if __name__ == "__main__":
    main()
