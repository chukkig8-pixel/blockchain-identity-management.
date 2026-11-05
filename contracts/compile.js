// Compiles CredentialRegistry.sol with solc-js and writes ABI + bytecode for the backend.
// Usage: cd contracts && npm install solc@0.8.19 && node compile.js
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const source = fs.readFileSync(path.join(__dirname, "CredentialRegistry.sol"), "utf8");
const input = {
  language: "Solidity",
  sources: { "CredentialRegistry.sol": { content: source } },
  settings: {
    evmVersion: "paris", // widest compatibility with Ganache
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (out.errors || []).filter((e) => e.severity === "error");
if (errors.length) { errors.forEach((e) => console.error(e.formattedMessage)); process.exit(1); }
const c = out.contracts["CredentialRegistry.sol"].CredentialRegistry;
const target = path.join(__dirname, "..", "backend", "contract", "CredentialRegistry.json");
fs.writeFileSync(target, JSON.stringify({ abi: c.abi, bytecode: "0x" + c.evm.bytecode.object }, null, 2));
console.log("Compiled ->", target);
