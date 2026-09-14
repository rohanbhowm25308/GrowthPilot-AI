"""
Deterministic demo/simulated data for Paytm GrowthPilot AI.
Nothing here is real Paytm production data — it is internally-consistent
demo data generated once so every endpoint agrees with every other endpoint.
"""
import random
from datetime import datetime, timedelta

random.seed(42)

# ----------------------------------------------------------------------
# Core merchant snapshot
# ----------------------------------------------------------------------
MERCHANT = {
    "name": "Sharma General Store",
    "category": "Grocery & Daily Essentials",
    "since": "2022",
}

KPIS = {
    "revenue": 842650,
    "revenue_growth_pct": 18.7,
    "transactions": 12486,
    "active_customers": 3842,
    "avg_order_value": 675,
    "expected_monthly_revenue": 1010000,
    "growth_score": 87,
}

SCORE_FACTORS = [
    {"label": "Customer Retention", "value": 22, "max": 25},
    {"label": "Sales Momentum", "value": 19, "max": 20},
    {"label": "Transaction Growth", "value": 18, "max": 20},
    {"label": "Campaign Performance", "value": 15, "max": 20},
    {"label": "Customer Engagement", "value": 13, "max": 15},
]

# ----------------------------------------------------------------------
# Revenue history (60 days) — used for charts, forecast, anomaly detection
# ----------------------------------------------------------------------
def _build_revenue_history(days=60, base=24500):
    history = []
    today = datetime.now()
    val = base
    for i in range(days, 0, -1):
        d = today - timedelta(days=i)
        weekday = d.weekday()  # 5,6 = weekend
        weekend_boost = 1.22 if weekday >= 5 else 1.0
        trend = 1 + (days - i) * 0.0035  # slow upward drift
        noise = random.uniform(0.9, 1.1)
        day_val = round(base * weekend_boost * trend * noise)
        history.append({"date": d.strftime("%Y-%m-%d"), "revenue": day_val})
        val = day_val
    # Inject one clear anomaly on "yesterday"
    history[-1]["revenue"] = round(history[-2]["revenue"] * 0.634)
    return history

REVENUE_HISTORY = _build_revenue_history()

# ----------------------------------------------------------------------
# Customer segments (Customer DNA)
# ----------------------------------------------------------------------
SEGMENTS = [
    {
        "key": "loyal",
        "name": "Loyal Champions",
        "pct": 28,
        "count": 1076,
        "color": "#00E5FF",
        "avg_order_value": 890,
        "purchase_frequency": "4.2x / month",
        "ltv": 14200,
        "strategy": "Reward with early access to new stock and a loyalty tier — protect this segment, don't discount it away.",
    },
    {
        "key": "rising",
        "name": "Rising Customers",
        "pct": 19,
        "count": 730,
        "color": "#1E6FEA",
        "avg_order_value": 610,
        "purchase_frequency": "2.6x / month",
        "ltv": 8100,
        "strategy": "Nudge with a cross-sell bundle — spend is trending up, a well-timed offer converts them into Loyal Champions.",
    },
    {
        "key": "deal_seekers",
        "name": "Deal Seekers",
        "pct": 17,
        "count": 653,
        "color": "#F0A93C",
        "avg_order_value": 410,
        "purchase_frequency": "3.1x / month",
        "ltv": 5200,
        "strategy": "Only respond to promotions — use low-margin, high-frequency offers instead of blanket cashback.",
    },
    {
        "key": "at_risk",
        "name": "At Risk",
        "pct": 14,
        "count": 538,
        "color": "#FF6B6B",
        "avg_order_value": 705,
        "purchase_frequency": "0.4x / month (declining)",
        "ltv": 6800,
        "strategy": "Launch a personalized win-back offer within 7 days — this segment still has high historical value.",
    },
    {
        "key": "new",
        "name": "New Customers",
        "pct": 13,
        "count": 500,
        "color": "#9C7CF4",
        "avg_order_value": 390,
        "purchase_frequency": "1.0x (first purchase)",
        "ltv": 2100,
        "strategy": "Send a second-purchase incentive within 14 days — the highest-leverage moment for retention.",
    },
    {
        "key": "lost",
        "name": "Lost Customers",
        "pct": 9,
        "count": 346,
        "color": "#5B6B82",
        "avg_order_value": 520,
        "purchase_frequency": "0x (90+ days inactive)",
        "ltv": 1400,
        "strategy": "Low-cost reactivation only — don't over-invest; test with a single high-value offer before writing them off.",
    },
]

# ----------------------------------------------------------------------
# Growth opportunities (Growth Opportunity Radar)
# ----------------------------------------------------------------------
OPPORTUNITIES = [
    {
        "id": "opp_1",
        "title": "Recover At-Risk Customers",
        "why": "126 previously active customers have not purchased in 21+ days, but their historical average order value (₹705) is above your store average.",
        "impact": 38400,
        "priority": "HIGH",
        "confidence": 87,
        "action": "Launch a ₹50 cashback win-back campaign targeted at 126 at-risk customers.",
    },
    {
        "id": "opp_2",
        "title": "Weekend Sales Opportunity",
        "why": "Saturday–Sunday transaction volume is 22% above weekday average, but only 6% of your campaign spend targets weekend windows.",
        "impact": 21700,
        "priority": "HIGH",
        "confidence": 82,
        "action": "Shift campaign budget to a Saturday 6–8 PM push notification burst.",
    },
    {
        "id": "opp_3",
        "title": "Cross-Sell Opportunity",
        "why": "Customers buying Staples + Snacks convert to a third add-on category 34% of the time when prompted at checkout.",
        "impact": 17200,
        "priority": "MEDIUM",
        "confidence": 76,
        "action": "Enable an AI-suggested add-on prompt at checkout for the Staples + Snacks combination.",
    },
    {
        "id": "opp_4",
        "title": "Increase Repeat Purchases",
        "why": "Repeat purchase rate has declined 14% over the last 30 days, concentrated in the 'Rising Customers' segment.",
        "impact": 14800,
        "priority": "MEDIUM",
        "confidence": 79,
        "action": "Send a second-purchase reminder 10 days after first order to Rising Customers.",
    },
]

# ----------------------------------------------------------------------
# Product cross-sell graph (light-weight)
# ----------------------------------------------------------------------
CROSS_SELL = {
    "pair": ["Coffee", "Sandwich"],
    "recommended": "Chocolate Brownie",
    "attach_rate": 0.34,
    "monthly_impact": 4800,
}

# ----------------------------------------------------------------------
# AI Agents (for Agent Network page)
# ----------------------------------------------------------------------
AGENTS = [
    {"key": "analyst", "name": "Business Analyst Agent", "status": "IDLE", "task": "Awaiting next analysis cycle", "confidence": None},
    {"key": "customer", "name": "Customer Intelligence Agent", "status": "ANALYZING", "task": "Segmenting 3,842 active customers", "confidence": 92},
    {"key": "forecast", "name": "Forecast Agent", "status": "ANALYZING", "task": "Predicting next 30-day revenue", "confidence": 91},
    {"key": "strategy", "name": "Growth Strategy Agent", "status": "IDLE", "task": "Awaiting opportunity handoff", "confidence": None},
    {"key": "marketing", "name": "Marketing Agent", "status": "READY", "task": "Standing by to draft campaign copy", "confidence": None},
    {"key": "roi", "name": "ROI Agent", "status": "READY", "task": "Standing by to score campaign ROI", "confidence": None},
    {"key": "action", "name": "Action Agent", "status": "IDLE", "task": "No approved actions in queue", "confidence": None},
]

# ----------------------------------------------------------------------
# Action Center (starts pre-populated with AI-recommended actions)
# ----------------------------------------------------------------------
ACTIONS = [
    {
        "id": "act_1",
        "title": "Recover At-Risk Customers",
        "recommendation": "Launch ₹50 cashback win-back campaign",
        "target": "126 customers",
        "expected_revenue": 38400,
        "expected_roi": 3.7,
        "confidence": 87,
        "status": "PENDING",
    },
    {
        "id": "act_2",
        "title": "Weekend Push Campaign",
        "recommendation": "Shift 30% of campaign budget to Saturday 6–8 PM",
        "target": "All active customers",
        "expected_revenue": 21700,
        "expected_roi": 4.1,
        "confidence": 82,
        "status": "PENDING",
    },
    {
        "id": "act_3",
        "title": "Checkout Cross-Sell Prompt",
        "recommendation": "Enable AI add-on suggestion for Coffee + Sandwich buyers",
        "target": "Coffee + Sandwich customers",
        "expected_revenue": 4800,
        "expected_roi": 6.2,
        "confidence": 76,
        "status": "PENDING",
    },
]

# ----------------------------------------------------------------------
# Growth memory — patterns GrowthPilot has "learned" over time
# ----------------------------------------------------------------------
GROWTH_MEMORY = [
    "Sunday campaigns have historically performed 23% better than weekday campaigns.",
    "Customers respond better to flat cashback than percentage discounts (3.1x vs 2.2x avg ROI).",
    "Evening customers (6–9 PM) show 1.7x higher repeat-purchase probability.",
    "Discount-only offers to Loyal Champions produced negative incremental revenue in the last 2 campaigns.",
]

RISK_ALERTS = [
    {
        "type": "Refund Spike",
        "detail": "Refund activity is 3.2x higher than your 30-day baseline.",
        "severity": "MEDIUM",
    }
]

# ----------------------------------------------------------------------
# Hyper-Personalized Offers — per-customer offer tiers
# ----------------------------------------------------------------------
CUSTOMER_OFFERS = [
    {
        "id": "cust_4821", "name": "Customer #4821", "segment": "Loyal Champions",
        "current_ltv": 8420, "predicted_90d_ltv": 11700,
        "offer_type": "No discount needed", "offer_detail": "Early access to new stock",
        "reasoning": "Already purchases 4x/month at full price — a discount would only subsidize spend that would happen anyway.",
    },
    {
        "id": "cust_3390", "name": "Customer #3390", "segment": "Rising Customers",
        "current_ltv": 4100, "predicted_90d_ltv": 7300,
        "offer_type": "Buy 2 Get 1 bundle", "offer_detail": "Cross-sell bundle on staples + snacks",
        "reasoning": "Spend is trending up month-over-month — a bundle nudges basket size without training them to wait for cashback.",
    },
    {
        "id": "cust_5127", "name": "Customer #5127", "segment": "Deal Seekers",
        "current_ltv": 2200, "predicted_90d_ltv": 2500,
        "offer_type": "10% flash discount", "offer_detail": "Time-boxed 24-hour discount",
        "reasoning": "Only responds to promotions historically — a flat cashback would overpay relative to their price sensitivity.",
    },
    {
        "id": "cust_1904", "name": "Customer #1904", "segment": "At Risk",
        "current_ltv": 6800, "predicted_90d_ltv": 3100,
        "offer_type": "₹30 cashback", "offer_detail": "Personalized win-back message",
        "reasoning": "High historical value but 21+ days inactive — the minimum incentive needed to bring them back before value decays further.",
    },
    {
        "id": "cust_6650", "name": "Customer #6650", "segment": "New Customers",
        "current_ltv": 390, "predicted_90d_ltv": 2100,
        "offer_type": "Second-purchase reminder", "offer_detail": "No discount, timed nudge at day 10",
        "reasoning": "First 14 days after signup is the highest-leverage retention window — a nudge converts better than a discount here.",
    },
]

# ----------------------------------------------------------------------
# Smart Business Timing
# ----------------------------------------------------------------------
SMART_TIMING = {
    "peak_hours": [{"label": "6 PM – 9 PM", "index": 100}, {"label": "12 PM – 2 PM", "index": 68}, {"label": "9 AM – 11 AM", "index": 41}],
    "slow_hours": [{"label": "2 PM – 5 PM", "index": 22}, {"label": "10 PM – 12 AM", "index": 15}],
    "best_day": "Saturday",
    "best_window": "Saturday, 6:30 PM",
    "weekday_vs_weekend": {"weekday_index": 78, "weekend_index": 100},
    "segment_timing": [
        {"segment": "At Risk", "best_window": "Weekday evenings — matches their historical active hours"},
        {"segment": "Loyal Champions", "best_window": "Weekend mornings — when they typically restock"},
    ],
}

# ----------------------------------------------------------------------
# Merchant Growth Heatmap (simulated zones, not a literal geo map)
# ----------------------------------------------------------------------
HEATMAP_ZONES = [
    {"zone": "Sector 12 Market", "customer_density": 92, "transaction_volume": 88, "potential": 34, "status": "hot",
     "note": "Your strongest zone — high density and high volume. Defend it, don't discount here."},
    {"zone": "Sector 15 Residential", "customer_density": 74, "transaction_volume": 51, "potential": 61,
     "status": "warm", "note": "High customer density but under-converted — a local campaign could close the gap."},
    {"zone": "Sector 21 Extension", "customer_density": 38, "transaction_volume": 22, "potential": 45,
     "status": "warm", "note": "Growing residential footfall nearby — early signal, worth monitoring."},
    {"zone": "Old Town Road", "customer_density": 19, "transaction_volume": 12, "potential": 15,
     "status": "cold", "note": "Low density and low volume — not a priority expansion target right now."},
    {"zone": "Sector 9 Office Belt", "customer_density": 55, "transaction_volume": 29, "potential": 72,
     "status": "warm", "note": "Area X has 32% more potential customers than your current primary market."},
]

# ----------------------------------------------------------------------
# AI Soundbox Intelligence Simulation
# ----------------------------------------------------------------------
SOUNDBOX_SNAPSHOT = {
    "latest_announcement": "You received ₹850 from 7 transactions in the last hour.",
    "today_total": 28450,
    "today_transaction_count": 61,
    "vs_normal_day_pct": 18,
    "best_period_today": "6 PM – 8 PM",
    "suggested_action": "Create a campaign for tomorrow's evening rush",
}

# ----------------------------------------------------------------------
# AI Merchant Financial Opportunity Finder (simulated eligibility only)
# ----------------------------------------------------------------------
FINANCIAL_OPPORTUNITIES = [
    {
        "title": "Working Capital Advance",
        "basis": "Consistent transaction growth over the last 3 months",
        "note": "Simulated eligibility signal for demo purposes only — not a real underwriting decision.",
        "indicative_range": "₹50,000 – ₹1,50,000",
    },
    {
        "title": "Merchant Growth Financing",
        "basis": "Growth Score above 80 and stable repeat-customer base",
        "note": "Simulated eligibility signal for demo purposes only — not a real underwriting decision.",
        "indicative_range": "₹1,00,000 – ₹3,00,000",
    },
]

# ----------------------------------------------------------------------
# Explain My Numbers — per-metric fallback templates
# ----------------------------------------------------------------------
METRIC_EXPLANATIONS = {
    "revenue": "Revenue increased primarily because weekend transaction volume rose and repeat customers "
               "contributed more than last month, even with the recent dip in repeat purchase frequency.",
    "revenue_growth_pct": "Growth is being driven by new customer acquisition outpacing the decline in repeat "
                          "purchases — a trend that reverses if the at-risk segment isn't addressed.",
    "transactions": "Transaction count is up mainly on weekends, where volume runs about 22% above weekday average.",
    "active_customers": "Active customer count reflects strong new-customer inflow, partially offset by 126 "
                        "customers sliding into the at-risk segment.",
    "avg_order_value": "Average order value is being held up by your Loyal Champions segment, who spend well "
                       "above your store average per visit.",
    "expected_monthly_revenue": "This projection extends current daily trends forward, assuming the weekend "
                                "seasonality pattern of the last four weeks continues.",
    "growth_score": "Your score is strong overall, held back mainly by Campaign Performance — sharper targeting "
                    "of at-risk customers is the fastest way to raise it further.",
}

# ----------------------------------------------------------------------
# AI Growth Missions (gamification) — mutable via API
# ----------------------------------------------------------------------
MISSIONS = [
    {"id": "m1", "title": "Reactivate 20 customers", "description": "Recover customers from the At-Risk segment.", "target": 20, "progress": 14, "done": False},
    {"id": "m2", "title": "Increase average order value by 5%", "description": "Use cross-sell prompts at checkout.", "target": 5, "progress": 5, "done": True},
    {"id": "m3", "title": "Launch a weekend campaign", "description": "Capture your highest-traffic window.", "target": 1, "progress": 0, "done": False},
    {"id": "m4", "title": "Convert 10 first-time buyers into repeat customers", "description": "Send second-purchase nudges to New Customers.", "target": 10, "progress": 6, "done": False},
]


def evaluate_why_not(segment_key, discount_pct, target_goal="Increase Revenue"):
    """Heuristic 'Why Not?' decision-intelligence check on a proposed campaign."""
    seg = next((s for s in SEGMENTS if s["key"] == segment_key), SEGMENTS[3])
    concerns = []
    if segment_key == "loyal" and discount_pct >= 8:
        concerns.append("This segment already purchases frequently at full price — a discount likely subsidizes "
                        "purchases that would have happened anyway (cannibalization risk).")
    if segment_key in ("deal_seekers",) and discount_pct < 8:
        concerns.append("Deal Seekers historically only convert on stronger promotions — this discount may be too "
                        "weak to move this segment.")
    if discount_pct >= 20:
        concerns.append("A discount this large increases discount-dependency risk — customers may delay purchases "
                        "waiting for the next offer.")
    if segment_key == "lost" and discount_pct < 15:
        concerns.append("Lost customers (90+ days inactive) typically need a stronger incentive to re-engage; a "
                        "modest offer may see very low response.")
    recommend = len(concerns) == 0
    return {
        "segment": seg["name"],
        "discount_pct": discount_pct,
        "recommend": recommend,
        "concerns": concerns,
        "verdict": "GrowthPilot supports this campaign." if recommend else "GrowthPilot does not fully recommend this campaign as configured.",
    }


def forecast_series(days=7, history=None):
    """Simple, explainable forecast: recent weighted average + weekend seasonality."""
    history = history if history is not None else REVENUE_HISTORY
    recent = history[-14:] if len(history) >= 14 else history
    avg = sum(d["revenue"] for d in recent) / len(recent)
    out = []
    today = datetime.strptime(history[-1]["date"], "%Y-%m-%d") if history else datetime.now()
    total = 0
    for i in range(1, days + 1):
        d = today + timedelta(days=i)
        weekend_boost = 1.2 if d.weekday() >= 5 else 1.0
        growth = 1 + 0.004 * i
        predicted = round(avg * weekend_boost * growth)
        low = round(predicted * 0.91)
        high = round(predicted * 1.09)
        total += predicted
        out.append({
            "date": d.strftime("%Y-%m-%d"),
            "predicted": predicted,
            "low": low,
            "high": high,
        })
    return out, total


def simulate_campaign(discount_pct, budget, target_segment, duration_days, segments_list=None):
    segments_list = segments_list if segments_list is not None else SEGMENTS
    seg = next((s for s in segments_list if s["key"] == target_segment), segments_list[0] if segments_list else SEGMENTS[3])
    base_customers = seg["count"]
    reach = min(base_customers, round(base_customers * (0.35 + discount_pct / 100)))
    conversion_rate = min(0.42, 0.06 + (discount_pct / 100) * 0.9)
    conversions = round(reach * conversion_rate)
    incremental_revenue = round(conversions * seg["avg_order_value"] * (0.55 + discount_pct / 150))
    cost = round(budget + conversions * (seg["avg_order_value"] * discount_pct / 100))
    roi = round(incremental_revenue / cost, 2) if cost > 0 else 0
    confidence = max(55, min(94, 90 - abs(discount_pct - 12)))
    return {
        "segment": seg["name"],
        "reach": reach,
        "conversions": conversions,
        "conversion_rate_pct": round(conversion_rate * 100, 1),
        "incremental_revenue": incremental_revenue,
        "cost": cost,
        "roi": roi,
        "confidence": confidence,
        "duration_days": duration_days,
    }
