import os
import copy
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()  # reads backend/.env automatically so GROQ_API_KEY doesn't need manual export

import data
import groq_client as ai
import data_processor as dp

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 15 * 1024 * 1024
CORS(app)

# Mutable in-memory copies so Action Center / Missions can change state during a demo
ACTIONS = copy.deepcopy(data.ACTIONS)
MISSIONS = copy.deepcopy(data.MISSIONS)

# ---------------------------------------------------------------------------
# Active dataset state — "empty" (nothing loaded yet), "demo" (static demo
# dataset from data.py), or "real" (a merchant uploaded and confirmed a file).
# Single-process in-memory store — fine for a hackathon demo, one merchant at a time.
# ---------------------------------------------------------------------------
STATE = {"mode": "empty", "dataset": None, "source": None}


def current_kpis():
    if STATE["mode"] == "real" and STATE["dataset"]:
        return STATE["dataset"]["kpis"]
    return data.KPIS


def current_score_factors():
    if STATE["mode"] == "real" and STATE["dataset"]:
        return STATE["dataset"]["score_factors"]
    return data.SCORE_FACTORS


def current_revenue_history(limit=None):
    if STATE["mode"] == "real" and STATE["dataset"]:
        hist = STATE["dataset"]["revenue_history"]
    else:
        hist = data.REVENUE_HISTORY
    return hist[-limit:] if limit else hist


def current_segments():
    if STATE["mode"] == "real" and STATE["dataset"]:
        return STATE["dataset"]["segments"]
    return data.SEGMENTS


def current_opportunities():
    if STATE["mode"] == "real" and STATE["dataset"]:
        return STATE["dataset"]["opportunities"]
    return data.OPPORTUNITIES


def current_cross_sell():
    if STATE["mode"] == "real" and STATE["dataset"]:
        return STATE["dataset"]["cross_sell"]
    return data.CROSS_SELL


def current_anomaly_base():
    if STATE["mode"] == "real" and STATE["dataset"]:
        return STATE["dataset"]["anomaly"]
    return None  # signals "use the static data.py anomaly() computation"


def current_merchant():
    if STATE["mode"] == "real" and STATE["dataset"]:
        return STATE["dataset"]["merchant"]
    return data.MERCHANT


# ---------------------------------------------------------------------------
# Static frontend
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(FRONTEND_DIR, path)


# ---------------------------------------------------------------------------
# Meta
# ---------------------------------------------------------------------------
@app.route("/api/status")
def status():
    return jsonify({
        "app": "Paytm GrowthPilot AI",
        "merchant": current_merchant(),
        "ai_configured": ai.is_configured(),
        "mode": STATE["mode"],
    })


# ---------------------------------------------------------------------------
# Dataset onboarding: upload -> column mapping -> confirm, or Demo Mode
# ---------------------------------------------------------------------------
@app.route("/api/dataset/status")
def dataset_status():
    resp = {"mode": STATE["mode"], "source": STATE["source"]}
    if STATE["mode"] == "real" and STATE["dataset"]:
        resp["kpis"] = STATE["dataset"]["kpis"]
        resp["merchant"] = STATE["dataset"]["merchant"]
        resp["meta"] = STATE["dataset"]["meta"]
    return jsonify(resp)


@app.route("/api/dataset/upload", methods=["POST"])
def dataset_upload():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded — attach a CSV or Excel file under the 'file' field."}), 400
    file = request.files["file"]
    if not file or not file.filename:
        return jsonify({"error": "No file selected."}), 400
    filename = file.filename
    try:
        df = dp.read_file(file)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Unexpected error reading file: {e}"}), 400

    upload_id = dp.stage_upload(df, filename=filename)
    columns = list(df.columns)
    suggested = dp.suggest_mapping(columns)
    preview = df.head(5).astype(str).to_dict("records")
    return jsonify({
        "upload_id": upload_id,
        "filename": filename,
        "row_count": int(len(df)),
        "columns": columns,
        "suggested_mapping": suggested,
        "required_fields": dp.REQUIRED_FIELDS,
        "optional_fields": dp.OPTIONAL_FIELDS,
        "preview": preview,
    })


@app.route("/api/dataset/quality", methods=["POST"])
def dataset_quality():
    body = request.get_json(force=True, silent=True) or {}
    upload_id = body.get("upload_id")
    mapping = body.get("mapping") or {}
    df = dp.get_staged(upload_id) if upload_id else None
    if df is None:
        return jsonify({"error": "This upload has expired or was not found — please upload the file again."}), 400
    try:
        report = dp.compute_quality_report(df, mapping)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Could not run the data quality check: {e}"}), 400
    return jsonify(report)


@app.route("/api/dataset/confirm", methods=["POST"])
def dataset_confirm():
    body = request.get_json(force=True, silent=True) or {}
    upload_id = body.get("upload_id")
    mapping = body.get("mapping") or {}
    merchant_name = (body.get("merchant_name") or "").strip() or "Your Business"

    df = dp.get_staged(upload_id) if upload_id else None
    if df is None:
        return jsonify({"error": "This upload has expired or was not found — please upload the file again."}), 400
    filename = dp.get_staged_filename(upload_id)

    try:
        bundle = dp.build_dataset_bundle(df, mapping, merchant_name=merchant_name)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Could not analyze this dataset: {e}"}), 400

    STATE["mode"] = "real"
    STATE["dataset"] = bundle
    STATE["source"] = {
        "type": "real",
        "filename": filename or "uploaded_dataset.csv",
        "row_count": bundle["meta"]["rows_used"],
        "analyzed_at": datetime.utcnow().isoformat() + "Z",
    }
    dp.drop_staged(upload_id)

    # Reset the agent / mission / action state to feel like a fresh analysis run
    global ACTIONS
    ACTIONS = []
    for opp in bundle["opportunities"][:3]:
        ACTIONS.append({
            "id": f"act_{opp['id']}",
            "title": opp["title"],
            "recommendation": opp["action"],
            "target": "See opportunity detail",
            "expected_revenue": opp["impact"],
            "expected_roi": 3.0,
            "confidence": opp["confidence"],
            "status": "PENDING",
        })

    return jsonify({
        "activated": True,
        "kpis": bundle["kpis"],
        "merchant": bundle["merchant"],
        "meta": bundle["meta"],
        "segments_found": len(bundle["segments"]),
        "opportunities_found": len(bundle["opportunities"]),
    })


@app.route("/api/dataset/demo", methods=["POST"])
def dataset_demo():
    STATE["mode"] = "demo"
    STATE["dataset"] = None
    STATE["source"] = {
        "type": "demo",
        "filename": "Simulated merchant data",
        "row_count": data.KPIS["transactions"],
        "analyzed_at": datetime.utcnow().isoformat() + "Z",
    }
    global ACTIONS
    ACTIONS = copy.deepcopy(data.ACTIONS)
    return jsonify({"activated": True, "kpis": data.KPIS, "merchant": data.MERCHANT})


# ---------------------------------------------------------------------------
# Dashboard / Growth Score
# ---------------------------------------------------------------------------
@app.route("/api/dashboard")
def dashboard():
    return jsonify({
        "merchant": current_merchant(),
        "kpis": current_kpis(),
        "score_factors": current_score_factors(),
        "revenue_history": current_revenue_history(limit=30),
    })


@app.route("/api/growth-score/explain")
def explain_score():
    kpis = current_kpis()
    factors = current_score_factors()
    system = ("You are GrowthPilot AI, an explainable business-intelligence engine for a Paytm merchant. "
               "Explain a growth score in 2-3 short sentences, plain language, no markdown headers.")
    factor_strs = [f"{f['label']} {f['value']}/{f['max']}" for f in factors]
    user = (f"Growth score is {kpis['growth_score']}/100. Contributing factors: "
            f"{', '.join(factor_strs)}. "
            "Explain why the score is strong and name the single factor holding it back most.")
    text, used_ai = ai.chat(system, user, max_tokens=180)
    if not text:
        weakest = min(factors, key=lambda f: f["value"] / f["max"])
        text = (f"Your score of {kpis['growth_score']}/100 reflects solid overall performance. "
                 f"{weakest['label']} ({weakest['value']}/{weakest['max']}) is your biggest lever — "
                 "sharper targeting on at-risk customers could push this score higher.")
    return jsonify({"explanation": text, "used_ai": used_ai})


# ---------------------------------------------------------------------------
# AI Business Doctor
# ---------------------------------------------------------------------------
@app.route("/api/business-doctor")
def business_doctor():
    kpis = current_kpis()
    segs = current_segments()
    at_risk = next((s for s in segs if s["key"] == "at_risk"), None)
    at_risk_count = at_risk["count"] if at_risk else 126
    at_risk_aov = at_risk["avg_order_value"] if at_risk else 705
    impact = round(at_risk_count * at_risk_aov * 0.3) if at_risk else 38400

    system = ("You are the AI Business Doctor inside GrowthPilot AI, a merchant-growth copilot for Paytm merchants. "
               "Respond ONLY as JSON with keys: diagnosis (1 sentence), why (1-2 sentences), impact (1 sentence), "
               "recommended_action (1 sentence), expected_outcome (1 sentence). Keep it concrete and numeric where given.")
    user = (f"Merchant facts: revenue change {kpis['revenue_growth_pct']}% over the last period. "
            f"{at_risk_count} previously active customers are now at-risk (21+ days inactive), "
            f"historical AOV ₹{at_risk_aov:,}. Diagnose the core business problem and recommend one action.")
    result, used_ai = ai.chat(system, user, json_mode=True, max_tokens=350)
    if not result:
        result = {
            "diagnosis": f"Revenue is at ₹{kpis['revenue']:,}, but {at_risk_count} previously active customers have gone quiet.",
            "why": f"These {at_risk_count} customers have an average order value of ₹{at_risk_aov:,}, above several of your other segments, "
                   "meaning their inactivity is disproportionately costly.",
            "impact": "If unaddressed, this erodes your most valuable repeat-customer base.",
            "recommended_action": f"Launch a targeted retention campaign for the {at_risk_count} at-risk customers.",
            "expected_outcome": "A win-back offer to this group is projected to recover a meaningful share of lost revenue within 7 days.",
        }
    result.update({
        "estimated_revenue_impact": impact,
        "expected_conversion_pct": 11.8,
        "confidence": 87 if STATE["mode"] != "real" else 78,
        "used_ai": used_ai,
    })
    return jsonify(result)


# ---------------------------------------------------------------------------
# Growth Opportunity Radar
# ---------------------------------------------------------------------------
@app.route("/api/opportunities")
def opportunities():
    return jsonify({"opportunities": current_opportunities()})


@app.route("/api/opportunities/<opp_id>/activate", methods=["POST"])
def activate_opportunity(opp_id):
    opp = next((o for o in current_opportunities() if o["id"] == opp_id), None)
    if not opp:
        return jsonify({"error": "not found"}), 404
    # Push it into the Action Center as a simulated approval-ready action
    new_action = {
        "id": f"act_{opp_id}",
        "title": opp["title"],
        "recommendation": opp["action"],
        "target": "See opportunity detail",
        "expected_revenue": opp["impact"],
        "expected_roi": round(opp["impact"] / max(1, opp["impact"] * 0.27), 2),
        "confidence": opp["confidence"],
        "status": "PENDING",
    }
    if not any(a["id"] == new_action["id"] for a in ACTIONS):
        ACTIONS.insert(0, new_action)
    return jsonify({"activated": True, "action": new_action})


# ---------------------------------------------------------------------------
# Customer DNA
# ---------------------------------------------------------------------------
@app.route("/api/customers/segments")
def segments():
    return jsonify({"segments": current_segments()})


@app.route("/api/customers/segments/<key>")
def segment_detail(key):
    seg = next((s for s in current_segments() if s["key"] == key), None)
    if not seg:
        return jsonify({"error": "not found"}), 404
    return jsonify(seg)


@app.route("/api/customers/cross-sell")
def cross_sell():
    cs = current_cross_sell()
    if cs is None:
        return jsonify({"available": False, "message": "No product column was mapped in your uploaded data, "
                        "so cross-sell pairs can't be computed. Upload data with a product/item column, or use Demo Mode."})
    return jsonify({"available": True, **cs})


# ---------------------------------------------------------------------------
# Sales Forecast
# ---------------------------------------------------------------------------
@app.route("/api/forecast")
def forecast():
    days = int(request.args.get("days", 7))
    hist = current_revenue_history()
    series, total = data.forecast_series(days, history=hist)
    system = ("You are GrowthPilot AI's Forecast Agent. In 1-2 sentences, explain why revenue is expected to move "
               "the way it does, referencing weekend patterns. Plain language, no markdown.")
    user = f"{days}-day forecast total is ₹{total:,}. Explain the main driver."
    explanation, used_ai = ai.chat(system, user, max_tokens=120)
    if not explanation:
        explanation = ("Revenue is expected to track recent daily trends, with weekend transaction volume "
                        "typically running above weekday levels.")
    return jsonify({
        "days": days,
        "series": series,
        "total_predicted": total,
        "confidence": 91 if STATE["mode"] != "real" else 79,
        "explanation": explanation,
        "used_ai": used_ai,
    })


# ---------------------------------------------------------------------------
# Revenue Anomaly Detector
# ---------------------------------------------------------------------------
@app.route("/api/anomaly")
def anomaly():
    real_anomaly = current_anomaly_base()
    if real_anomaly is not None:
        result = dict(real_anomaly)
        if not result.get("detected"):
            return jsonify(result)
    else:
        hist = data.REVENUE_HISTORY
        yesterday = hist[-1]["revenue"]
        baseline = sum(d["revenue"] for d in hist[-8:-1]) / 7
        drop_pct = round((1 - yesterday / baseline) * 100, 1)
        detected = drop_pct > 15
        result = {
            "detected": detected,
            "drop_pct": drop_pct,
            "yesterday_revenue": yesterday,
            "baseline_revenue": round(baseline),
            "likely_cause": "Lower repeat customer activity and a quieter evening window than usual.",
            "recommended_action": "Launch a retention campaign targeting recently-inactive customers.",
        }
    if result.get("detected"):
        system = "You are GrowthPilot AI's monitoring system. In 1 sentence, state the anomaly plainly, like an alert banner."
        user = f"Revenue dropped {result['drop_pct']}% yesterday vs the 7-day baseline of ₹{result['baseline_revenue']:,}."
        text, used_ai = ai.chat(system, user, max_tokens=60)
        result["headline"] = text or f"Revenue dropped {result['drop_pct']}% yesterday."
        result["used_ai"] = used_ai
    return jsonify(result)


# ---------------------------------------------------------------------------
# What-If Growth Simulator
# ---------------------------------------------------------------------------
@app.route("/api/simulate", methods=["POST"])
def simulate():
    body = request.get_json(force=True, silent=True) or {}
    discount_pct = float(body.get("discount_pct", 10))
    budget = float(body.get("budget", 5000))
    segment_key = body.get("segment", "at_risk")
    duration_days = int(body.get("duration_days", 7))
    segs = current_segments()

    current = data.simulate_campaign(5, 3000, segment_key, duration_days, segments_list=segs)
    recommended = data.simulate_campaign(discount_pct, budget, segment_key, duration_days, segments_list=segs)

    return jsonify({"current_strategy": current, "recommended_strategy": recommended})


@app.route("/api/experiment", methods=["POST"])
def experiment():
    body = request.get_json(force=True, silent=True) or {}
    strategies = body.get("strategies") or [
        {"name": "10% Discount", "discount_pct": 10, "budget": 2100, "segment": "at_risk"},
        {"name": "₹50 Cashback", "discount_pct": 8, "budget": 1400, "segment": "at_risk"},
        {"name": "Loyalty Points", "discount_pct": 4, "budget": 900, "segment": "at_risk"},
    ]
    segs = current_segments()
    valid_keys = {s["key"] for s in segs}
    results = []
    for s in strategies:
        seg_key = s.get("segment", "at_risk")
        if seg_key not in valid_keys and segs:
            seg_key = segs[0]["key"]
        sim = data.simulate_campaign(s.get("discount_pct", 8), s.get("budget", 1500), seg_key, 7, segments_list=segs)
        results.append({"name": s["name"], **sim})
    winner = max(results, key=lambda r: r["roi"])
    return jsonify({"results": results, "winner": winner["name"]})


# ---------------------------------------------------------------------------
# AI Campaign Studio
# ---------------------------------------------------------------------------
@app.route("/api/campaign", methods=["POST"])
def campaign():
    body = request.get_json(force=True, silent=True) or {}
    goal = body.get("goal", "Retain Customers")
    target = body.get("target", "At-Risk Customers")
    offer = body.get("offer", "₹50 Cashback")
    timing = body.get("timing", "7 PM – 9 PM")
    language = body.get("language", "English")

    # Numbers are ALWAYS computed deterministically from the active dataset (real or demo) —
    # the LLM is only used for the creative name/message/objective, never the figures.
    segs = current_segments()
    seg_key = body.get("segment") or (segs[0]["key"] if segs else "at_risk")
    sim = data.simulate_campaign(10, 5000, seg_key, 7, segments_list=segs)
    target_name = next((s["name"] for s in segs if s["key"] == seg_key), target)
    target_count = next((s["count"] for s in segs if s["key"] == seg_key), None)

    system = ("You are the Marketing Agent inside GrowthPilot AI, generating a merchant marketing campaign. "
               "Respond ONLY as JSON with keys: campaign_name, objective, message (the actual customer-facing "
               f"message, written in {language}). Keep the message under 220 characters, persuasive but not pushy. "
               "Do NOT invent numbers — reach/conversion/ROI are supplied separately.")
    user = (f"Goal: {goal}. Target: {target_name}" + (f" ({target_count} customers)" if target_count else "") +
            f". Offer: {offer}. Timing: {timing}. Language: {language}.")
    result, used_ai = ai.chat(system, user, json_mode=True, max_tokens=250)
    if not result:
        result = {
            "campaign_name": "Come Back & Save" if goal != "Increase Revenue" else "Grow With GrowthPilot",
            "objective": goal,
            "message": f"We miss you! Here's {offer} on your next order, valid {timing}. Tap to redeem before it expires.",
        }
    result["expected_reach"] = sim["reach"]
    result["expected_conversion_pct"] = sim["conversion_rate_pct"]
    result["expected_roi"] = sim["roi"]
    result["used_ai"] = used_ai
    return jsonify(result)


# ---------------------------------------------------------------------------
# AI Growth Goal Planner
# ---------------------------------------------------------------------------
@app.route("/api/goal-plan", methods=["POST"])
def goal_plan():
    body = request.get_json(force=True, silent=True) or {}
    goal_text = body.get("goal", "Increase revenue by 20%")

    system = ("You are GrowthPilot AI's Strategy Agent. A merchant stated a growth goal. Break it into a concrete "
               "plan. Respond ONLY as JSON with keys: steps (array of short strings, 3-5 items), "
               "estimated_revenue_impact (integer, rupees), timeline_days (integer), required_budget (integer, rupees), "
               "expected_roi (number), confidence (integer 0-100).")
    user = f"Merchant goal: \"{goal_text}\". Use the merchant's known data: 126 at-risk customers, weekend sales " \
           "underexploited, cross-sell attach rate 34%, repeat purchase rate declining 14%."
    result, used_ai = ai.chat(system, user, json_mode=True, max_tokens=350)
    if not result:
        result = {
            "steps": [
                "Recover 126 at-risk customers with a targeted win-back offer",
                "Launch a weekend-focused campaign to capture peak transaction windows",
                "Enable checkout cross-sell prompts for high-affinity product pairs",
                "Increase repeat purchase frequency with a second-purchase reminder flow",
            ],
            "estimated_revenue_impact": 92100,
            "timeline_days": 30,
            "required_budget": 12500,
            "expected_roi": 3.4,
            "confidence": 81,
        }
    result["goal"] = goal_text
    result["used_ai"] = used_ai
    return jsonify(result)


# ---------------------------------------------------------------------------
# Ask GrowthPilot (natural language, structured answer)
# ---------------------------------------------------------------------------
@app.route("/api/ask", methods=["POST"])
def ask():
    body = request.get_json(force=True, silent=True) or {}
    question = body.get("question", "").strip()
    if not question:
        return jsonify({"error": "question is required"}), 400

    kpis = current_kpis()
    segs = current_segments()
    at_risk = next((s for s in segs if s["key"] == "at_risk"), None)
    seg_summary = ", ".join(f"{s['name']} {s['pct']}%" for s in segs)
    anomaly_base = current_anomaly_base()

    system = ("You are 'Ask GrowthPilot', a specialized merchant business-intelligence assistant inside a Paytm "
               "merchant dashboard — not a general chatbot. Ground every answer in the merchant's known data below. "
               "Respond ONLY as JSON with keys: insight (1 sentence, the direct answer), reason (1-2 sentences, "
               "why, grounded in the data), recommendation (1 sentence, concrete next step), "
               "expected_impact (short string, e.g. '+₹18,400/mo'), confidence (integer 0-100), "
               "action (short string naming a button/action, e.g. 'Launch Win-Back Campaign').")
    user = (
        f"Merchant data: revenue ₹{kpis['revenue']:,} ({kpis['revenue_growth_pct']:+}% recent trend), "
        f"{kpis['transactions']:,} transactions, {kpis['active_customers']:,} active customers, "
        f"AOV ₹{kpis['avg_order_value']:,}, growth score {kpis['growth_score']}/100. "
        + (f"{at_risk['count']} at-risk customers (avg order value ₹{at_risk['avg_order_value']:,}). " if at_risk else "")
        + f"Segments: {seg_summary}. "
        + (f"Anomaly: revenue dropped {anomaly_base['drop_pct']}% recently. " if anomaly_base and anomaly_base.get("detected") else "")
        + f"\n\nMerchant question: \"{question}\""
    )
    result, used_ai = ai.chat(system, user, json_mode=True, max_tokens=350)
    if not result:
        if at_risk:
            result = {
                "insight": f"Your biggest lever right now is recovering the {at_risk['count']} customers who have gone quiet.",
                "reason": f"They have an average order value of ₹{at_risk['avg_order_value']:,}, making them disproportionately "
                           "valuable to win back versus acquiring new customers.",
                "recommendation": "Launch a win-back campaign targeted specifically at this group.",
                "expected_impact": f"+₹{round(at_risk['count'] * at_risk['avg_order_value'] * 0.3):,}",
                "confidence": 78,
                "action": "Launch Win-Back Campaign",
            }
        else:
            result = {
                "insight": f"Your growth score is {kpis['growth_score']}/100 — overall performance is on track.",
                "reason": f"Revenue is at ₹{kpis['revenue']:,} across {kpis['transactions']:,} transactions.",
                "recommendation": "Check the Growth Radar for the specific opportunities detected in your data.",
                "expected_impact": "—", "confidence": 65, "action": "View Growth Radar",
            }
    result["question"] = question
    result["used_ai"] = used_ai
    return jsonify(result)


# ---------------------------------------------------------------------------
# Daily Business Brief
# ---------------------------------------------------------------------------
@app.route("/api/daily-brief")
def daily_brief():
    kpis = current_kpis()
    segs = current_segments()
    at_risk = next((s for s in segs if s["key"] == "at_risk"), None)
    top_opportunity = f"Recover {at_risk['count']} at-risk customers" if at_risk else "Review Growth Radar for opportunities"

    system = ("You are GrowthPilot AI delivering a daily executive briefing to a merchant. Write 2 short sentences, "
               "warm but professional, like a trusted business partner, not a chatbot. No markdown, no bullet points.")
    user = (f"Revenue trend {kpis['revenue_growth_pct']:+}%, growth score {kpis['growth_score']}/100, "
            f"top opportunity: {top_opportunity.lower()}. Summarize and recommend tonight's action.")
    text, used_ai = ai.chat(system, user, max_tokens=120)
    if not text:
        text = (f"Revenue trend is {kpis['revenue_growth_pct']:+}% and your growth score sits at {kpis['growth_score']}/100. "
                 f"{top_opportunity} is your highest-leverage move this week.")
    return jsonify({
        "greeting": "Good morning, Merchant.",
        "revenue_change_pct": kpis["revenue_growth_pct"],
        "customer_change_pct": 8.2 if STATE["mode"] != "real" else None,
        "repeat_rate_change_pct": -3 if STATE["mode"] != "real" else None,
        "top_opportunity": top_opportunity,
        "risk": "Weekend conversion declining" if STATE["mode"] != "real" else "See Anomaly Detector for live signals",
        "recommendation": "Launch retention campaign tonight",
        "narrative": text,
        "used_ai": used_ai,
    })


# ---------------------------------------------------------------------------
# AI Agents / Autonomous Growth Loop
# ---------------------------------------------------------------------------
@app.route("/api/agents")
def agents():
    kpis = current_kpis()
    segs = current_segments()
    at_risk = next((s for s in segs if s["key"] == "at_risk"), None)
    opps = current_opportunities()
    top_opp = opps[0] if opps else None

    live_agents = [
        {"key": "analyst", "name": "Business Analyst Agent", "status": "DONE",
         "task": f"Analyzed revenue trend: {kpis['revenue_growth_pct']:+}% over the recent period", "confidence": 94},
        {"key": "customer", "name": "Customer Intelligence Agent", "status": "DONE",
         "task": f"Identified {at_risk['count']} at-risk customers" if at_risk else f"Segmented {kpis['active_customers']:,} active customers",
         "confidence": 92},
        {"key": "forecast", "name": "Forecast Agent", "status": "RUNNING", "task": "Predicting next 30-day revenue", "confidence": 91},
        {"key": "strategy", "name": "Growth Strategy Agent", "status": "RUNNING" if top_opp else "IDLE",
         "task": f"Building a plan around \"{top_opp['title']}\"" if top_opp else "Awaiting opportunity handoff", "confidence": 85 if top_opp else None},
        {"key": "marketing", "name": "Marketing Agent", "status": "READY", "task": "Standing by to draft campaign copy", "confidence": None},
        {"key": "roi", "name": "ROI Agent", "status": "READY", "task": "Standing by to score campaign ROI", "confidence": None},
        {"key": "action", "name": "Action Agent", "status": "IDLE",
         "task": f"{len(ACTIONS)} recommendation(s) awaiting approval" if ACTIONS else "No approved actions in queue", "confidence": None},
    ]
    return jsonify({"agents": live_agents, "orchestrator": "GrowthPilot Orchestrator", "mode": STATE["mode"]})


# ---------------------------------------------------------------------------
# Growth Memory & Risk
# ---------------------------------------------------------------------------
@app.route("/api/growth-memory")
def growth_memory():
    return jsonify({"memory": data.GROWTH_MEMORY})


@app.route("/api/risk")
def risk():
    return jsonify({"alerts": data.RISK_ALERTS})


# ---------------------------------------------------------------------------
# Action Center
# ---------------------------------------------------------------------------
@app.route("/api/actions")
def actions():
    return jsonify({"actions": ACTIONS})


@app.route("/api/actions/<action_id>/<decision>", methods=["POST"])
def decide_action(action_id, decision):
    if decision not in ("approve", "reject"):
        return jsonify({"error": "invalid decision"}), 400
    act = next((a for a in ACTIONS if a["id"] == action_id), None)
    if not act:
        return jsonify({"error": "not found"}), 404
    act["status"] = "EXECUTED (SIMULATED)" if decision == "approve" else "REJECTED"
    return jsonify({"action": act, "simulated": decision == "approve"})


# ---------------------------------------------------------------------------
# Hyper-Personalized Offers
# ---------------------------------------------------------------------------
@app.route("/api/personalized-offers")
def personalized_offers():
    return jsonify({"customers": data.CUSTOMER_OFFERS})


# ---------------------------------------------------------------------------
# Smart Business Timing
# ---------------------------------------------------------------------------
@app.route("/api/smart-timing")
def smart_timing():
    system = ("You are GrowthPilot AI's timing intelligence engine. In 1-2 sentences, tell a merchant the single "
               "best time to run their next campaign and why, in plain language, no markdown.")
    user = (f"Best window: {data.SMART_TIMING['best_window']}. Weekend index {data.SMART_TIMING['weekday_vs_weekend']['weekend_index']} "
            f"vs weekday index {data.SMART_TIMING['weekday_vs_weekend']['weekday_index']}.")
    text, used_ai = ai.chat(system, user, max_tokens=100)
    result = dict(data.SMART_TIMING)
    result["explanation"] = text or ("Saturday evenings consistently outperform every other window — customer "
                                       "traffic peaks there and response rates to campaigns are highest.")
    result["used_ai"] = used_ai
    return jsonify(result)


# ---------------------------------------------------------------------------
# Merchant Growth Heatmap
# ---------------------------------------------------------------------------
@app.route("/api/heatmap")
def heatmap():
    return jsonify({"zones": data.HEATMAP_ZONES})


# ---------------------------------------------------------------------------
# AI Soundbox Intelligence Simulation
# ---------------------------------------------------------------------------
@app.route("/api/soundbox")
def soundbox():
    s = data.SOUNDBOX_SNAPSHOT
    system = ("You are the AI voice inside a Paytm Soundbox device, speaking to a merchant in one short spoken "
               "sentence, then one follow-up question offering to help. Plain language, no markdown.")
    user = (f"Today's revenue is {s['vs_normal_day_pct']}% higher than a normal day. Best period today: "
            f"{s['best_period_today']}. Offer to {s['suggested_action'].lower()}.")
    text, used_ai = ai.chat(system, user, max_tokens=100)
    result = dict(s)
    result["ai_voice_line"] = text or (f"Today's revenue is {s['vs_normal_day_pct']}% higher than your normal day, "
                                        f"with your best period between {s['best_period_today']}. "
                                        f"Would you like me to {s['suggested_action'].lower()}?")
    result["used_ai"] = used_ai
    return jsonify(result)


# ---------------------------------------------------------------------------
# AI Merchant Financial Opportunity Finder
# ---------------------------------------------------------------------------
@app.route("/api/financial-opportunities")
def financial_opportunities():
    return jsonify({"opportunities": data.FINANCIAL_OPPORTUNITIES})


# ---------------------------------------------------------------------------
# Explain My Numbers — per-metric explanation
# ---------------------------------------------------------------------------
@app.route("/api/explain-metric/<metric_key>")
def explain_metric(metric_key):
    fallback = data.METRIC_EXPLANATIONS.get(metric_key)
    if fallback is None:
        return jsonify({"error": "unknown metric"}), 404
    kpis = current_kpis()
    value = kpis.get(metric_key)
    segs = current_segments()
    at_risk = next((s for s in segs if s["key"] == "at_risk"), None)
    system = ("You are GrowthPilot AI's explainable-BI engine. In 1-2 short sentences, explain WHY this specific "
               "merchant metric is at its current value, plain language, no markdown, be concrete.")
    user = (f"Metric: {metric_key} = {value}. Merchant context: revenue trend {kpis['revenue_growth_pct']:+}%, "
            f"growth score {kpis['growth_score']}/100" +
            (f", {at_risk['count']} at-risk customers" if at_risk else "") + ".")
    text, used_ai = ai.chat(system, user, max_tokens=100)
    return jsonify({"metric": metric_key, "value": value, "explanation": text or fallback, "used_ai": used_ai})


# ---------------------------------------------------------------------------
# Generic "Explain This" — Step 26: every individual number on every page can
# carry an ⓘ Explain button that calls this, instead of only the Overview KPIs.
# The frontend always supplies `context` (the facts it already computed/knows,
# e.g. an opportunity's `why` field) — the LLM's job is only to phrase that
# grounded context as a clear sentence, never to invent new figures.
# ---------------------------------------------------------------------------
@app.route("/api/explain", methods=["POST"])
def explain_generic():
    body = request.get_json(force=True, silent=True) or {}
    label = (body.get("label") or "this value").strip()
    value = str(body.get("value") or "").strip()
    context = (body.get("context") or "").strip()

    system = ("You are GrowthPilot AI's explainable-BI engine. In 1 short, plain-language sentence, explain why "
               "this specific number is what it is, using ONLY the context given — do not invent any fact, "
               "percentage, or figure not present in the context. No markdown.")
    user = f"Label: {label}. Value: {value}. Known context: {context or '(no additional context supplied)'}"
    text, used_ai = ai.chat(system, user, max_tokens=90)
    if not text:
        # Fallback: the context itself IS the explanation (it was computed deterministically
        # upstream) — we just present it plainly rather than leaving the button dead.
        if context:
            text = context
        elif value:
            text = f"{label} is currently {value}, based on your active dataset."
        else:
            text = f"No additional detail is available for {label} right now."
    return jsonify({"explanation": text, "used_ai": used_ai})


# ---------------------------------------------------------------------------
# AI Growth Missions (gamification)
# ---------------------------------------------------------------------------
@app.route("/api/missions")
def missions():
    return jsonify({"missions": MISSIONS, "completed": sum(1 for m in MISSIONS if m["done"]), "total": len(MISSIONS)})


@app.route("/api/missions/<mission_id>/toggle", methods=["POST"])
def toggle_mission(mission_id):
    m = next((m for m in MISSIONS if m["id"] == mission_id), None)
    if not m:
        return jsonify({"error": "not found"}), 404
    m["done"] = not m["done"]
    m["progress"] = m["target"] if m["done"] else m["progress"]
    return jsonify({"mission": m})


# ---------------------------------------------------------------------------
# AI "Why Not?" Engine
# ---------------------------------------------------------------------------
@app.route("/api/why-not", methods=["POST"])
def why_not():
    body = request.get_json(force=True, silent=True) or {}
    segment_map = {"At-Risk Customers": "at_risk", "Loyal Customers": "loyal", "New Customers": "new",
                   "Rising Customers": "rising", "Deal Seekers": "deal_seekers", "Lost Customers": "lost"}
    segment_key = segment_map.get(body.get("target"), body.get("segment", "at_risk"))
    discount_pct = float(body.get("discount_pct", 10))
    goal = body.get("goal", "Increase Revenue")

    verdict = data.evaluate_why_not(segment_key, discount_pct, goal)

    system = ("You are GrowthPilot AI's 'Why Not?' decision-intelligence engine. A merchant is about to run a "
               "campaign. You do NOT blindly agree. Respond ONLY as JSON with keys: verdict_text (1-2 sentences, "
               "your overall take) and reasoning (1-2 sentences expanding on the biggest concern, or on why it's " 
               "safe to proceed if there are no concerns). Be direct and specific, not generic.")
    user = (f"Segment: {verdict['segment']}. Discount/cashback: {discount_pct}%. Goal: {goal}. "
            f"Rule-based concerns found: {verdict['concerns'] if verdict['concerns'] else 'none'}.")
    result, used_ai = ai.chat(system, user, json_mode=True, max_tokens=250)
    if not result:
        result = {
            "verdict_text": verdict["verdict"],
            "reasoning": verdict["concerns"][0] if verdict["concerns"] else
                "No red flags against your growth memory or segment behavior patterns — this is a reasonable campaign to run.",
        }
    verdict.update(result)
    verdict["used_ai"] = used_ai
    return jsonify(verdict)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    # Debug mode is OFF by default — set FLASK_DEBUG=true in .env only for local development.
    # Never run with debug=True in a deployed/public environment (it exposes an interactive
    # debugger console on unhandled errors). For real deployment, run behind Gunicorn instead
    # of this dev server — see README.
    debug = os.environ.get("FLASK_DEBUG", "false").strip().lower() in ("1", "true", "yes")
    app.run(host="0.0.0.0", port=port, debug=debug)
