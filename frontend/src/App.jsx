import { useEffect, useState } from "react";
import { api } from "./api.js";
import University from "./pages/University.jsx";
import Wallet from "./pages/Wallet.jsx";
import Employer from "./pages/Employer.jsx";
import Ledger from "./pages/Ledger.jsx";

const TABS = [
  { id: "university", label: "University", hint: "Issue credentials", C: University },
  { id: "wallet", label: "Student wallet", hint: "Hold keys, share proofs", C: Wallet },
  { id: "employer", label: "Employer", hint: "Verify a proof", C: Employer },
  { id: "ledger", label: "Ledger", hint: "Inspect the chain", C: Ledger },
];

export default function App() {
  const [tab, setTab] = useState(() => location.hash.slice(1) || "university");
  const [info, setInfo] = useState(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    api.info().then(setInfo).catch(() => setOffline(true));
  }, []);
  useEffect(() => { location.hash = tab; }, [tab]);

  const Active = (TABS.find((t) => t.id === tab) || TABS[0]).C;

  return (
    <>
      <header className="top">
        <div className="brand">
          <span className="chain" aria-hidden="true"><i /><i /><i /></span>
          <div>
            <h1>ChainID</h1>
            <p>Prove one fact about yourself without handing over everything.</p>
          </div>
        </div>
        {info && (
          <div className="pill" title={info.issuer_id}>
            <b>{info.ledger === "web3" ? "Ganache" : "Local chain"}</b>
            <span>{info.issuer_name}</span>
          </div>
        )}
      </header>

      <nav className="tabs" aria-label="Roles">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? "tab on" : "tab"} onClick={() => setTab(t.id)}>
            <strong>{t.label}</strong>
            <small>{t.hint}</small>
          </button>
        ))}
      </nav>

      <main>
        {offline ? (
          <div className="card bad-card">
            <h2>Backend not reachable</h2>
            <p>Start the API with <code>python backend/app.py</code>, then reload this page.</p>
          </div>
        ) : (
          <Active goto={setTab} />
        )}
      </main>
    </>
  );
}
