"""Runs the same flow against the real Solidity contract on an in-memory EVM (eth-tester)."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
pytest.importorskip("eth_tester")

from web3 import Web3, EthereumTesterProvider

from app import create_app
from ledger import CONTRACT_JSON, Web3Ledger
from test_core import ATTRS, Wallet, issue, present, verify


@pytest.fixture()
def chain(tmp_path):
    w3 = Web3(EthereumTesterProvider())
    art = json.loads(CONTRACT_JSON.read_text())
    owner, issuer = w3.eth.accounts[0], w3.eth.accounts[1]
    Contract = w3.eth.contract(abi=art["abi"], bytecode=art["bytecode"])
    addr = w3.eth.wait_for_transaction_receipt(Contract.constructor().transact({"from": owner}))["contractAddress"]
    c = w3.eth.contract(address=addr, abi=art["abi"])
    c.functions.authorizeIssuer(issuer).transact({"from": owner})
    led = Web3Ledger(provider=EthereumTesterProvider(w3.provider.ethereum_tester), address=addr, issuer_account=issuer)
    app = create_app(ledger=led, data_dir=tmp_path)
    return app.test_client(), Wallet(), led, w3, c, owner


def test_end_to_end_on_contract(chain):
    c, w, led, *_ = chain
    _, pkg = issue(c, w)
    assert led.lookup(pkg["root"])["exists"]
    assert verify(c, present(c, w, pkg, {"Degree"}))["valid"]
    tampered = present(c, w, pkg, {"Degree"})
    tampered["disclosed"][0]["value"] = "BCA + PhD"
    assert not verify(c, tampered)["valid"]


def test_revocation_on_contract(chain):
    c, w, led, *_ = chain
    _, pkg = issue(c, w)
    assert c.post("/api/issuer/revoke", json={"credential_id": pkg["credential_id"]}).status_code == 200
    assert not verify(c, present(c, w, pkg, {"Degree"}))["valid"]
    view = c.get("/api/ledger").get_json()
    assert {b["type"] for b in view["blocks"]} == {"REGISTER", "REVOKE"}


def test_unauthorized_address_cannot_register(chain):
    _, _, led, w3, contract, _ = chain
    rogue = w3.eth.accounts[5]
    with pytest.raises(Exception, match="Not an authorized issuer"):
        contract.functions.registerCredential(bytes.fromhex("ab" * 32)).transact({"from": rogue})


def test_only_issuing_address_can_revoke(chain):
    _, _, led, w3, contract, owner = chain
    contract.functions.registerCredential(bytes.fromhex("cd" * 32)).transact({"from": w3.eth.accounts[1]})
    with pytest.raises(Exception, match="Only the issuing address"):
        contract.functions.revokeCredential(bytes.fromhex("cd" * 32)).transact({"from": owner})


def test_duplicate_root_rejected(chain):
    _, _, led, *_ = chain
    led.register("11" * 32)
    with pytest.raises(Exception):
        led.register("11" * 32)
