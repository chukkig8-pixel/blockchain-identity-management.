import { useEffect, useState } from "react";
import { api } from "./api.js";
import { loadWallet, PENDING_KEY, SHARED_KEY } from "./wallet.js";
import University from "./pages/University.jsx";
import Wallet from "./pages/Wallet.jsx";
import Employer from "./pages/Employer.jsx";
import Ledger from "./pages/Ledger.jsx";

const TABS = [
  {
    id: "university",
    num: "1",
    label: "University",
    role: "Issuer (Records Office)",
    hint: "Issue & sign degrees + photo",
    desc: "Fill in a student’s details (name, photo, degree, year, CGPA) and click issue. Digitally signs the degree and writes its fingerprint on the blockchain.",
    C: University,
  },
  {
    id: "wallet",
    num: "2",
    label: "Student wallet",
    role: "Holder (You)",
    hint: "Hold keys, share selective proofs",
    desc: "Your browser makes a secret key that only you hold. Receive your degree, tick only the items you want to share, and build a proof containing just those.",
    C: Wallet,
  },
  {
    id: "employer",
    num: "3",
    label: "Employer",
    role: "Verifier (Company)",
    hint: "Verify a proof (6 checks)",
    desc: "Ask for a proof, receive it, and click Verify. Runs six checks and gives a clear VERIFIED or REJECTED answer, or simulate tampering to see it catch a fake.",
    C: Employer,
  },
  {
    id: "ledger",
    num: "4",
    label: "Ledger",
    role: "Blockchain Notebook",
    hint: "Inspect the tamper-proof chain",
    desc: "Lists every fingerprint the university has recorded in order. No names, grades, or photos go in the notebook—only the cryptographic fingerprint.",
    C: Ledger,
  },
];

const TRUST_PILLARS = [
  {
    title: "University’s digital signature",
    detail: "Proves who issued the degree so no one can forge an official credential.",
  },
  {
    title: "Blockchain fingerprint",
    detail: "Proves nothing has been altered since issuance—without putting private data on-chain.",
  },
  {
    title: "Your secret wallet key",
    detail: "Proves the credential is really yours and stops anyone else from presenting it.",
  },
  {
    title: "One-time request code",
    detail: "Stops someone from copying and reusing an old proof (replay protection).",
  },
];

export default function App() {
  const [tab, setTab] = useState(() => location.hash.slice(1) || "university");
  const [info, setInfo] = useState(null);
  const [offline, setOffline] = useState(false);
  const [showGuide, setShowGuide] = useState(() => localStorage.getItem("bcid.hideGuide") !== "1");
  const [flowTick, setFlowTick] = useState(0);

  const refreshFlow = () => setFlowTick((n) => n + 1);

  useEffect(() => {
    api.info().then(setInfo).catch(() => setOffline(true));
  }, [flowTick]);

  useEffect(() => {
    location.hash = tab;
    refreshFlow();
  }, [tab]);

  function toggleGuide() {
    setShowGuide((prev) => {
      const next = !prev;
      localStorage.setItem("bcid.hideGuide", next ? "0" : "1");
      return next;
    });
  }

  const wallet = loadWallet();
  const hasWallet = Boolean(wallet?.holderId);
  const hasCredInWallet = Boolean(wallet?.credentials?.length);
  const hasNonce = Boolean(localStorage.getItem(PENDING_KEY));
  const hasSharedProof = Boolean(localStorage.getItem(SHARED_KEY));

  const Active = (TABS.find((t) => t.id === tab) || TABS[0]).C;

  return (
    <>
      <header className="top">
        <div className="brand">
          <span className="chain" aria-hidden="true"><i /><i /><i /></span>
          <div>
            <h1>ChainID</h1>
            <p>Prove one fact about yourself without handing over your whole record.</p>
          </div>
        </div>
        <div className="top-actions">
          <button type="button" className="ghost guide-toggle" onClick={toggleGuide}>
            {showGuide ? "Hide project guide" : "What this project is & How it works"}
          </button>
          {info && (
            <div className="pill" title={info.issuer_id}>
              <b>{info.ledger === "web3" ? "Ganache" : "Local chain"}</b>
              <span>{info.issuer_name}</span>
            </div>
          )}
        </div>
      </header>

      {showGuide && (
        <section className="guide-wrap" aria-label="What this project is">
          <div className="guide-card">
            <div className="guide-head">
              <div>
                <span className="eyebrow">Interactive Overview</span>
                <h2>What this project is</h2>
                <p className="muted">
                  It’s a way to prove one fact about yourself—such as your degree or student photo—without handing over your whole academic record.
                </p>
              </div>
              <button type="button" className="ghost small-btn" onClick={toggleGuide}>Got it, minimize</button>
            </div>

            <div className="compare-grid">
              <div className="compare-box usual">
                <div className="compare-tag bad-tag">The usual way</div>
                <p>
                  A company wants to confirm you finished your <b>BCA degree</b>, so you send your whole certificate or transcript—with your name, grades, date of birth, photo, and more. They see <em>everything</em>, and they still have to trust that the PDF isn’t fake.
                </p>
              </div>
              <div className="compare-box better">
                <div className="compare-tag good-tag">How this project does it differently</div>
                <ol className="compact-steps">
                  <li><b>Your university</b> gives you a digital, signed version of your degree (including your student photo).</li>
                  <li><b>You keep it</b> in your own browser wallet.</li>
                  <li><b>When an employer asks</b>, you share <em>only</em> the facts they need, such as <code>“BCA Cyber Security”</code> (and optionally your photo).</li>
                  <li><b>The employer checks it’s genuine.</b> If anyone changes even one word or pixel, the system catches it.</li>
                </ol>
              </div>
            </div>

            <div className="picture-flow">
              <div className="picture-title">
                <strong>The idea in one picture</strong>
                <span className="small muted">A blockchain is used as a tamper-proof notebook. No name, grades, or photos go in the notebook—only the fingerprint. Click any actor below to jump to its tab.</span>
              </div>
              <div className="flow-diagram">
                <button type="button" className={`flow-node ${tab === "university" ? "active" : ""}`} onClick={() => setTab("university")}>
                  <span className="node-badge">1. Issuer</span>
                  <strong>University</strong>
                  <small>Signs the degree & photo</small>
                </button>

                <div className="flow-arrows">
                  <div className="arrow-line">
                    <span>signs & sends degree ➔</span>
                  </div>
                  <div className="arrow-line alt">
                    <span>writes fingerprint ↘</span>
                  </div>
                </div>

                <button type="button" className={`flow-node ${tab === "wallet" ? "active" : ""}`} onClick={() => setTab("wallet")}>
                  <span className="node-badge">2. Holder</span>
                  <strong>Student wallet</strong>
                  <small>Keeps secret key & full record</small>
                </button>

                <div className="flow-arrows">
                  <div className="arrow-line">
                    <span>shares only chosen facts ➔</span>
                  </div>
                </div>

                <button type="button" className={`flow-node ${tab === "employer" ? "active" : ""}`} onClick={() => setTab("employer")}>
                  <span className="node-badge">3. Verifier</span>
                  <strong>Employer</strong>
                  <small>Runs 6 cryptographic checks</small>
                </button>

                <div className="flow-arrows">
                  <div className="arrow-line">
                    <span>⬅ checks fingerprint</span>
                  </div>
                </div>

                <button type="button" className={`flow-node ledger-node ${tab === "ledger" ? "active" : ""}`} onClick={() => setTab("ledger")}>
                  <span className="node-badge">4. Blockchain</span>
                  <strong>Ledger</strong>
                  <small>Tamper-proof fingerprint notebook</small>
                </button>
              </div>
            </div>

            <div className="trust-row">
              {TRUST_PILLARS.map((p, idx) => (
                <div className="trust-item" key={idx}>
                  <span className="trust-num">{idx + 1}</span>
                  <div>
                    <strong>{p.title}</strong>
                    <p className="small muted">{p.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="stepper-bar" aria-label="Recommended demo flow">
        <div className="stepper-inner">
          <span className="stepper-label">Guided Demo Flow:</span>
          <button type="button" className={`step-chip ${hasWallet ? "done" : "current"}`} onClick={() => setTab("wallet")}>
            <span className="step-dot">{hasWallet ? "✓" : "1"}</span>
            <span>Step 1: Create Student Wallet</span>
          </button>
          <span className="step-sep">→</span>
          <button type="button" className={`step-chip ${hasCredInWallet ? "done" : hasWallet ? "current" : ""}`} onClick={() => setTab("university")}>
            <span className="step-dot">{hasCredInWallet ? "✓" : "2"}</span>
            <span>Step 2: Issue Degree + Photo (University)</span>
          </button>
          <span className="step-sep">→</span>
          <button type="button" className={`step-chip ${hasSharedProof ? "done" : hasCredInWallet ? "current" : ""}`} onClick={() => setTab("wallet")}>
            <span className="step-dot">{hasSharedProof ? "✓" : "3"}</span>
            <span>Step 3: Pick Attributes & Create Proof (Wallet)</span>
          </button>
          <span className="step-sep">→</span>
          <button type="button" className={`step-chip ${hasSharedProof ? "current" : ""}`} onClick={() => setTab("employer")}>
            <span className="step-dot">{hasNonce ? "4" : "4"}</span>
            <span>Step 4: Verify or Tamper (Employer & Ledger)</span>
          </button>
        </div>
      </section>

      <nav className="tabs" aria-label="Roles">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? "tab on" : "tab"} onClick={() => setTab(t.id)}>
            <div className="tab-top">
              <span className="tab-num">{t.num}</span>
              <strong>{t.label}</strong>
            </div>
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
          <Active goto={(nextTab) => { setTab(nextTab); refreshFlow(); }} onFlowChange={refreshFlow} />
        )}
      </main>
    </>
  );
}
