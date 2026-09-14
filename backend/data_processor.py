"""
Turns an uploaded merchant transactions file (CSV/XLSX) into the same
dashboard shape the rest of GrowthPilot AI already knows how to render —
so every feature built against the static demo dataset also works against
real uploaded data, with no frontend changes needed downstream.
"""
import io
import uuid
from datetime import datetime

import numpy as np
import pandas as pd

REQUIRED_FIELDS = ["date", "amount", "customer_id"]
OPTIONAL_FIELDS = ["product", "location"]

# Keyword hints used to auto-suggest a column mapping
FIELD_HINTS = {
    "date": ["date", "transaction_date", "order_date", "purchase_date", "txn_date", "timestamp"],
    "amount": ["amount", "revenue", "sales", "total", "price", "value", "order_value", "txn_amount"],
    "customer_id": ["customer_id", "customer", "buyer_id", "user_id", "client_id", "cust_id", "customerid"],
    "product": ["product", "item", "sku", "product_name", "category"],
    "location": ["location", "city", "region", "area", "zone", "store"],
}

MAX_ROWS = 200_000  # sanity guard against pathological uploads


def read_file(file_storage):
    """Parses an uploaded Werkzeug FileStorage into a DataFrame. Raises ValueError with a
    user-facing message on anything that goes wrong — never lets a raw exception escape."""
    filename = (file_storage.filename or "").lower()
    raw = file_storage.read()
    if not raw:
        raise ValueError("The uploaded file is empty.")
    if len(raw) > 15 * 1024 * 1024:
        raise ValueError("File is too large (max 15MB for this demo).")

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(raw))
        elif filename.endswith(".xlsx") or filename.endswith(".xls"):
            df = pd.read_excel(io.BytesIO(raw))
        else:
            raise ValueError("Unsupported file type — please upload a .csv or .xlsx file.")
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Could not read this file — it may be corrupted or not a valid CSV/Excel file. ({e})")

    if df.empty or len(df.columns) == 0:
        raise ValueError("The file was read but contains no columns/rows.")
    if len(df) > MAX_ROWS:
        df = df.head(MAX_ROWS)

    df.columns = [str(c).strip() for c in df.columns]
    return df


def suggest_mapping(columns):
    """Best-effort auto-mapping from raw column names to GrowthPilot fields."""
    mapping = {}
    lower_cols = {c: c.lower().replace(" ", "_").replace("-", "_") for c in columns}
    for field, hints in FIELD_HINTS.items():
        best = None
        for col, lc in lower_cols.items():
            if any(h == lc for h in hints):
                best = col
                break
        if not best:
            for col, lc in lower_cols.items():
                if any(h in lc for h in hints):
                    best = col
                    break
        if best:
            mapping[field] = best
    return mapping


def validate_mapping(mapping):
    missing = [f for f in REQUIRED_FIELDS if not mapping.get(f)]
    if missing:
        raise ValueError(f"Missing required field mapping: {', '.join(missing)}")


def compute_quality_report(df: pd.DataFrame, mapping: dict):
    """Pre-analysis data quality check — runs after mapping is confirmed but before the
    full dashboard is built, so the merchant sees exactly what will and won't be usable."""
    validate_mapping(mapping)
    total_rows = len(df)

    checks = []
    field_labels = {"date": "Transaction Date", "amount": "Revenue", "customer_id": "Customer ID",
                     "product": "Product", "location": "Location"}

    missing_counts = {}
    for field in REQUIRED_FIELDS + OPTIONAL_FIELDS:
        col = mapping.get(field)
        if not col:
            continue
        if field == "date":
            parsed = pd.to_datetime(df[col], errors="coerce")
            missing = int(parsed.isna().sum())
        elif field == "amount":
            parsed = pd.to_numeric(df[col], errors="coerce")
            missing = int(parsed.isna().sum()) + int((parsed <= 0).sum())
        else:
            missing = int(df[col].isna().sum()) + int((df[col].astype(str).str.strip() == "").sum())
        missing_counts[field] = missing
        ok = missing == 0
        checks.append({
            "label": f"{field_labels[field]} field detected",
            "ok": True,  # the column itself was successfully mapped
            "detail": f"{missing} missing/invalid values" if missing else "No issues found",
        })

    # Duplicate detection: same date + amount + customer_id combination
    dup_cols = [c for c in [mapping.get("date"), mapping.get("amount"), mapping.get("customer_id")] if c]
    duplicate_count = int(df.duplicated(subset=dup_cols).sum()) if len(dup_cols) == 3 else 0

    total_required_cells = total_rows * len(REQUIRED_FIELDS)
    total_missing_required = sum(missing_counts.get(f, 0) for f in REQUIRED_FIELDS)
    completeness_pct = 100 * (1 - total_missing_required / total_required_cells) if total_required_cells else 100
    duplicate_pct = 100 * duplicate_count / total_rows if total_rows else 0

    score = round(max(0, min(100, completeness_pct - duplicate_pct * 0.5)))

    warnings = []
    for field, cnt in missing_counts.items():
        if cnt > 0:
            warnings.append(f"{cnt} missing/invalid {field_labels[field].lower()} value{'s' if cnt != 1 else ''}")
    if duplicate_count > 0:
        warnings.append(f"{duplicate_count} duplicate transaction{'s' if duplicate_count != 1 else ''}")

    usable_rows = total_rows - total_missing_required  # rough estimate; exact count computed at build time

    return {
        "rows_detected": total_rows,
        "checks": checks,
        "warnings": warnings,
        "duplicate_count": duplicate_count,
        "quality_score": score,
        "estimated_usable_rows": max(0, usable_rows),
    }


def build_dataset_bundle(df: pd.DataFrame, mapping: dict, merchant_name="Your Business"):
    """The core pipeline: cleans the mapped columns and derives everything the dashboard needs."""
    validate_mapping(mapping)

    work = pd.DataFrame()
    work["date"] = pd.to_datetime(df[mapping["date"]], errors="coerce")
    work["amount"] = pd.to_numeric(df[mapping["amount"]], errors="coerce")
    work["customer_id"] = df[mapping["customer_id"]].astype(str)
    has_product = bool(mapping.get("product"))
    has_location = bool(mapping.get("location"))
    if has_product:
        work["product"] = df[mapping["product"]].astype(str)
    if has_location:
        work["location"] = df[mapping["location"]].astype(str)

    before = len(work)
    work = work.dropna(subset=["date", "amount", "customer_id"])
    work = work[work["amount"] > 0]
    dropped = before - len(work)

    if len(work) < 5:
        raise ValueError("After cleaning, fewer than 5 valid transaction rows remained — please check your "
                          "date/amount columns are mapped correctly.")

    work = work.sort_values("date")
    max_date = work["date"].max()
    min_date = work["date"].min()

    # ---------------- KPIs ----------------
    total_revenue = float(work["amount"].sum())
    total_transactions = int(len(work))
    unique_customers = int(work["customer_id"].nunique())
    aov = total_revenue / total_transactions if total_transactions else 0

    last_30 = work[work["date"] > max_date - pd.Timedelta(days=30)]
    prev_30 = work[(work["date"] <= max_date - pd.Timedelta(days=30)) & (work["date"] > max_date - pd.Timedelta(days=60))]
    rev_last_30 = float(last_30["amount"].sum())
    rev_prev_30 = float(prev_30["amount"].sum())
    revenue_growth_pct = round(((rev_last_30 - rev_prev_30) / rev_prev_30) * 100, 1) if rev_prev_30 > 0 else 0.0

    daily_rate = rev_last_30 / max(1, min(30, (max_date - min_date).days + 1))
    expected_monthly_revenue = round(daily_rate * 30)

    # ---------------- Revenue history (daily) ----------------
    daily = work.groupby(work["date"].dt.date)["amount"].sum().reset_index()
    daily.columns = ["date", "revenue"]
    daily["date"] = daily["date"].astype(str)
    revenue_history = daily.to_dict("records")

    # ---------------- Customer RFM ----------------
    cust = work.groupby("customer_id").agg(
        frequency=("amount", "count"),
        monetary=("amount", "sum"),
        last_purchase=("date", "max"),
    ).reset_index()
    cust["recency_days"] = (max_date - cust["last_purchase"]).dt.days
    cust["aov"] = cust["monetary"] / cust["frequency"]

    freq_median = cust["frequency"].median()
    freq_q75 = cust["frequency"].quantile(0.75)
    aov_median = cust["aov"].median()

    def classify(row):
        if row["recency_days"] > 60:
            return "lost"
        if row["recency_days"] > 21 and row["frequency"] >= 2:
            return "at_risk"
        if row["frequency"] == 1 and row["recency_days"] <= 14:
            return "new"
        if row["frequency"] >= freq_q75 and row["recency_days"] <= 14:
            return "loyal"
        if row["frequency"] >= freq_median and row["recency_days"] <= 30:
            return "rising"
        if row["aov"] < aov_median:
            return "deal_seekers"
        return "rising"

    cust["segment"] = cust.apply(classify, axis=1)

    SEGMENT_META = {
        "loyal": ("Loyal Champions", "#00E5FF",
                  "Reward with early access to new stock and a loyalty tier — protect this segment, don't discount it away."),
        "rising": ("Rising Customers", "#1E6FEA",
                   "Nudge with a cross-sell bundle — spend is trending up, a well-timed offer converts them into Loyal Champions."),
        "deal_seekers": ("Deal Seekers", "#F0A93C",
                          "Likely price-sensitive based on order value — use low-margin, high-frequency offers instead of blanket cashback."),
        "at_risk": ("At Risk", "#FF6B6B",
                    "Launch a personalized win-back offer within 7 days — this segment still has high historical value."),
        "new": ("New Customers", "#9C7CF4",
                "Send a second-purchase incentive within 14 days — the highest-leverage moment for retention."),
        "lost": ("Lost Customers", "#5B6B82",
                 "Low-cost reactivation only — don't over-invest; test with a single high-value offer before writing them off."),
    }
    segments = []
    for key, (name, color, strategy) in SEGMENT_META.items():
        sub = cust[cust["segment"] == key]
        if len(sub) == 0:
            continue
        segments.append({
            "key": key, "name": name, "color": color,
            "pct": round(len(sub) / len(cust) * 100),
            "count": int(len(sub)),
            "avg_order_value": round(float(sub["aov"].mean())),
            "purchase_frequency": f"{sub['frequency'].mean():.1f}x over the period",
            "ltv": round(float(sub["monetary"].mean())),
            "strategy": strategy,
        })
    segments.sort(key=lambda s: -s["pct"])

    # ---------------- Score factors (explainable, bounded like the demo dataset) ----------------
    repeat_rate = float((cust["frequency"] >= 2).mean())
    retention_score = round(min(25, repeat_rate * 25))
    momentum_score = round(min(20, max(0, 10 + revenue_growth_pct / 4)))
    txn_growth_score = round(min(20, max(0, 10 + revenue_growth_pct / 5)))
    campaign_perf_score = round(min(20, 10 + (aov / max(1, aov_median) - 1) * 15)) if aov_median else 10
    campaign_perf_score = max(0, min(20, campaign_perf_score))
    engagement_score = round(min(15, (cust["frequency"].mean() / max(1, freq_q75)) * 15))
    growth_score = int(max(0, min(100, retention_score + momentum_score + txn_growth_score + campaign_perf_score + engagement_score)))

    score_factors = [
        {"label": "Customer Retention", "value": retention_score, "max": 25},
        {"label": "Sales Momentum", "value": momentum_score, "max": 20},
        {"label": "Transaction Growth", "value": txn_growth_score, "max": 20},
        {"label": "Campaign Performance", "value": campaign_perf_score, "max": 20},
        {"label": "Customer Engagement", "value": engagement_score, "max": 15},
    ]

    # ---------------- Opportunities (rule-based, derived from real numbers) ----------------
    opportunities = []
    at_risk_seg = next((s for s in segments if s["key"] == "at_risk"), None)
    if at_risk_seg and at_risk_seg["count"] > 0:
        impact = round(at_risk_seg["count"] * at_risk_seg["avg_order_value"] * 0.3)
        opportunities.append({
            "id": "opp_at_risk", "title": "Recover At-Risk Customers",
            "why": f"{at_risk_seg['count']} previously active customers have gone quiet, with an average order "
                   f"value of ₹{at_risk_seg['avg_order_value']:,} — above several of your other segments.",
            "impact": impact, "priority": "HIGH" if at_risk_seg["count"] >= 10 else "MEDIUM",
            "confidence": 78,
            "action": f"Launch a win-back campaign targeted at {at_risk_seg['count']} at-risk customers.",
        })

    work["weekday"] = work["date"].dt.weekday
    weekend_avg = work[work["weekday"] >= 5]["amount"].sum() / max(1, work[work["weekday"] >= 5]["date"].dt.date.nunique())
    weekday_avg = work[work["weekday"] < 5]["amount"].sum() / max(1, work[work["weekday"] < 5]["date"].dt.date.nunique())
    if weekday_avg > 0 and weekend_avg > weekday_avg * 1.1:
        uplift_pct = round((weekend_avg / weekday_avg - 1) * 100)
        opportunities.append({
            "id": "opp_weekend", "title": "Weekend Sales Opportunity",
            "why": f"Weekend daily revenue runs {uplift_pct}% above weekday average in your uploaded data.",
            "impact": round(weekend_avg * 2 * 0.15), "priority": "MEDIUM", "confidence": 74,
            "action": "Shift campaign budget toward a Saturday–Sunday push.",
        })

    if len(prev_30) > 0:
        repeat_last = float((last_30.groupby("customer_id").size() >= 2).mean()) if len(last_30) else 0
        repeat_prev = float((prev_30.groupby("customer_id").size() >= 2).mean()) if len(prev_30) else 0
        if repeat_prev > 0 and repeat_last < repeat_prev * 0.9:
            decline_pct = round((1 - repeat_last / repeat_prev) * 100)
            opportunities.append({
                "id": "opp_repeat", "title": "Increase Repeat Purchases",
                "why": f"Repeat purchase rate declined roughly {decline_pct}% versus the prior 30-day period.",
                "impact": round(rev_last_30 * 0.05), "priority": "MEDIUM", "confidence": 70,
                "action": "Send a second-purchase reminder to recent first-time buyers.",
            })

    cross_sell = None
    if has_product:
        try:
            baskets = work.groupby("customer_id")["product"].apply(lambda s: set(s.dropna()))
            from itertools import combinations
            from collections import Counter
            pair_counts = Counter()
            for products in baskets:
                if len(products) >= 2:
                    for a, b in combinations(sorted(products), 2):
                        pair_counts[(a, b)] += 1
            if pair_counts:
                (p1, p2), cnt = pair_counts.most_common(1)[0]
                attach_rate = round(cnt / max(1, len(baskets)), 2)
                cross_sell = {
                    "pair": [p1, p2], "recommended": p2,
                    "attach_rate": attach_rate,
                    "monthly_impact": round(cnt * aov * 0.4),
                }
                opportunities.append({
                    "id": "opp_cross_sell", "title": "Cross-Sell Opportunity",
                    "why": f"Customers buying {p1} also buy {p2} in your uploaded data ({cnt} customers overlap).",
                    "impact": cross_sell["monthly_impact"], "priority": "MEDIUM", "confidence": 68,
                    "action": f"Prompt a {p2} add-on for {p1} buyers at checkout.",
                })
        except Exception:
            cross_sell = None

    # ---------------- Anomaly detection ----------------
    anomaly = {"detected": False}
    if len(daily) >= 8:
        last_day_rev = daily.iloc[-1]["revenue"]
        baseline = daily.iloc[-8:-1]["revenue"].mean()
        drop_pct = round((1 - last_day_rev / baseline) * 100, 1) if baseline else 0
        if drop_pct > 15:
            anomaly = {
                "detected": True, "drop_pct": drop_pct,
                "yesterday_revenue": round(last_day_rev), "baseline_revenue": round(baseline),
                "likely_cause": "Lower transaction volume than the recent 7-day baseline.",
                "recommended_action": "Investigate recent campaigns or seasonal effects and consider a targeted push.",
            }

    return {
        "merchant": {"name": merchant_name, "category": "Uploaded Merchant Data", "since": str(min_date.date())},
        "kpis": {
            "revenue": round(total_revenue),
            "revenue_growth_pct": revenue_growth_pct,
            "transactions": total_transactions,
            "active_customers": unique_customers,
            "avg_order_value": round(aov),
            "expected_monthly_revenue": expected_monthly_revenue,
            "growth_score": growth_score,
        },
        "score_factors": score_factors,
        "revenue_history": revenue_history,
        "segments": segments,
        "opportunities": opportunities,
        "cross_sell": cross_sell,
        "anomaly": anomaly,
        "meta": {
            "rows_used": total_transactions, "rows_dropped": int(dropped),
            "date_range": [str(min_date.date()), str(max_date.date())],
            "has_product": has_product, "has_location": has_location,
        },
    }


# ---------------------------------------------------------------------------
# In-memory upload staging (single-process demo store — fine for a hackathon)
# ---------------------------------------------------------------------------
_PENDING_UPLOADS = {}


def stage_upload(df: pd.DataFrame, filename: str = "") -> str:
    upload_id = uuid.uuid4().hex[:12]
    _PENDING_UPLOADS[upload_id] = {"df": df, "filename": filename}
    return upload_id


def get_staged(upload_id: str):
    entry = _PENDING_UPLOADS.get(upload_id)
    return entry["df"] if entry else None


def get_staged_filename(upload_id: str):
    entry = _PENDING_UPLOADS.get(upload_id)
    return entry["filename"] if entry else ""


def drop_staged(upload_id: str):
    _PENDING_UPLOADS.pop(upload_id, None)
