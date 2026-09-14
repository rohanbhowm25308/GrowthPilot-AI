# Paytm GrowthPilot AI

**Your AI Business Partner for Merchant Growth.**
Built for the Paytm AI Hackathon — Track 1: Merchant Growth AI.

GrowthPilot AI is a merchant-growth copilot for Paytm merchants. It follows one loop for
every insight it surfaces: **SEE → UNDERSTAND → PREDICT → DECIDE → ACT → MEASURE → LEARN.**
A central orchestrator coordinates 8 specialized agents (Business Analyst, Customer
Intelligence, Forecast, Growth Strategy, Marketing, ROI, Action, and the Orchestrator
itself) to diagnose problems, predict outcomes, generate campaigns, and hand the merchant
a decision — never an action taken without approval.

**The app opens empty, not pre-filled.** A merchant either uploads a CSV/Excel of their
own transactions — GrowthPilot auto-detects the columns, lets them confirm the mapping,
and generates the entire dashboard from that real data — or clicks **"Try Demo Data"** to
load a prepared, clearly-labelled simulated dataset instantly. Every feature (KPIs, Growth
Score, Customer DNA, Opportunity Radar, Forecast, Anomaly Detector, Business Doctor, Ask
GrowthPilot, Daily Brief) reads from whichever dataset is active, so the pitch is:
*"GrowthPilot doesn't come with a predefined dashboard — a merchant uploads their data,
and the AI agent system builds their intelligence layer automatically."*

## Stack

- **Frontend:** plain HTML / CSS / JavaScript (no build step), Chart.js for charts
- **Backend:** Python + Flask, pandas for the upload/analysis pipeline
- **AI:** Groq (`openai/gpt-oss-120b`) for diagnosis text, campaign copy, forecast
  explanations, and the "Ask GrowthPilot" natural-language interface
- **Graceful fallback:** every AI-backed endpoint has a templated fallback response
  (built from whichever dataset — real or demo — is active), so the app runs and demos
  cleanly even with no Groq key configured or if a call fails — `used_ai` in each response
  tells the frontend (shown as the "Groq AI: Live / Demo mode" pill in the sidebar) which
  one happened.

## Run it

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env      # then open .env and add your real GROQ_API_KEY
python app.py
```

Open **http://localhost:5050** — Flask serves the frontend directly (loads `.env`
automatically via python-dotenv), so there's no CORS setup and no separate frontend
server. Without a real `GROQ_API_KEY`, every feature still works using the templated
fallback content — the sidebar's status pill ("● AI Engine Online" / "● AI Fallback Mode")
tells you which one is active, and every AI-narrative block on screen carries its own
"🤖 Powered by GrowthPilot AI" or "📋 offline reasoning" tag so it's never ambiguous which
parts of the page are live LLM output versus the deterministic calculations underneath.

`.env` is gitignored on purpose — `backend/.env.example` is the template that ships in
version control. Debug mode is off by default; set `FLASK_DEBUG=true` in `.env` only for
local development. For a real deployment, run behind Gunicorn instead of the Flask dev
server: `gunicorn -w 2 -b 0.0.0.0:5050 app:app` (from `backend/`).

## Deploy it (Render only — no Netlify needed)

Flask serves the frontend itself (`send_from_directory`), so the whole app — API and UI —
is **one deployable service**. You do not need a separate static-site host: deploying only
to Render is correct and complete.

The repo includes a `render.yaml` Blueprint, so the nested `backend/` folder (where
`requirements.txt` actually lives) is handled automatically — no manual "Root Directory"
setup needed:

1. Push this repo to GitHub.
2. On [Render](https://dashboard.render.com) → **New** → **Blueprint** → connect the repo.
   Render reads `render.yaml` and configures everything (root directory, build command
   `pip install -r requirements.txt`, start command `gunicorn app:app --bind 0.0.0.0:$PORT`).
3. Render will prompt for the one secret marked `sync: false` in `render.yaml` —
   paste in your real `GROQ_API_KEY`. Everything else is preset.
4. Deploy. Your live URL serves both the site and the API — nothing else to host.

**If you'd rather configure it by hand** (New → Web Service, not Blueprint) instead of
using the Blueprint, set: **Root Directory** = `backend`, **Build Command** =
`pip install -r requirements.txt`, **Start Command** = `gunicorn app:app --bind 0.0.0.0:$PORT`,
and add `GROQ_API_KEY` under Environment.

## Feature map

| Area | What it does |
|---|---|
| Onboarding | Upload CSV/Excel → auto column detection & mapping → **Data Quality Check** (missing values, duplicates, a 0–100 quality score) → AI analysis animation → dashboard generated from real data. Or "Try Demo Data" for an instant, clearly-labelled simulated dataset. |
| Data Source (sidebar) | Always shows which dataset is active — merchant filename, row count, and when it was last analyzed, or "Demo Dataset — Simulated merchant data." "⇄ Switch Data Source" and the topbar's "＋ New Analysis" both return to onboarding to load something else. |
| Overview | KPI dashboard, animated Growth Score with explainable factors, AI Business Doctor, Revenue Anomaly Detector, AI Daily Business Brief |
| Customers | Customer DNA (6 segments), segment detail (LTV, AOV, strategy), AI Cross-Sell Engine |
| Growth Radar | Growth Opportunity Radar (activate → sends to Action Center), AI Growth Goal Planner, Growth Memory |
| Campaigns | AI Campaign Studio — reach/conversion/ROI are always computed from the active dataset's real segment sizes; the LLM only writes the creative name/message, never the numbers |
| Simulator | What-If Growth Simulator (live current vs. AI-recommended comparison, using real segment counts), AI Experiment Lab |
| AI Agents | Animated agent network visualization; each agent's task line reflects the real numbers just computed (e.g. "Identified 94 at-risk customers"), revealed sequentially like a live pipeline |
| Insights | Ask GrowthPilot (structured, grounded NL Q&A), Sales Forecast (7/30-day, confidence band), Business Risk Monitor |
| Action Center | Every AI recommendation lands here — Approve & Execute (clearly labeled SIMULATED — no real Paytm systems are touched), Reject |
| Voice | Simulated voice interaction — English / Hindi / Hinglish sample questions |
| Growth Tools | Merchant Growth Heatmap (simulated zones), AI Soundbox Intelligence Simulation, AI Financial Opportunity Finder (simulated eligibility only), AI Growth Missions (gamified, toggle to complete) |
| Customers (add-on) | Hyper-Personalized Offers — per-customer minimum-incentive recommendation, not a blanket discount |
| Insights (add-on) | Smart Business Timing — peak/slow hours, best campaign window, per-segment timing |
| Campaigns (add-on) | AI "Why Not?" Engine — rule-based + AI critique of the configured campaign before you launch it |
| Overview (add-on) | "Explain My Numbers" — a `?` button on every KPI card gives an AI-grounded explanation of that specific number |

## Uploading your own data

Required columns (any names — GrowthPilot auto-detects and lets you re-map): a
**transaction date**, an **amount/revenue** value, and a **customer ID**. Optional:
**product** (unlocks the Cross-Sell Engine) and **location**. Rows with missing/invalid
date, amount, or customer ID are dropped automatically before analysis; you'll see how
many rows were used vs. dropped after confirming.

Features that read from whichever dataset is active (real or demo): KPIs, Growth Score,
Business Doctor, Opportunity Radar, Customer DNA, Cross-Sell, Forecast, Anomaly Detector,
Ask GrowthPilot, Daily Brief, Simulator, and Experiment Lab. A few features stay
illustrative regardless of upload — Personalized Offers, Smart Business Timing,
Heatmap, Soundbox, Financial Opportunities, and Missions — because they need signals
(geography, long history, campaign outcomes) a single transactions file doesn't carry;
the UI says so directly rather than pretending otherwise.

## Project structure

```
backend/
  app.py              # all API routes
  data.py             # static demo dataset + calculation helpers (Demo Mode)
  data_processor.py   # real-data pipeline: column detection, mapping, dashboard generation
  groq_client.py      # Groq wrapper with graceful fallback
  requirements.txt
frontend/
  index.html
  style.css           # design system (dark navy / Paytm blue / cyan / gold)
  app.js              # all frontend logic, wired to the API
  config.js           # API_BASE — leave empty for same-origin
```
