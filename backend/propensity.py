"""Lead propensity: which leads are worth a human's time. Trained on smb_leads.csv at start-up."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

DATA = Path(__file__).parent / "data"
CAT = ["lead_source", "segment", "has_gstin", "has_udyam", "current_internet", "annual_turnover_band", "city_tier"]
NUM = ["log_emp", "log_sites", "log_spend"]
RECOVERABLE = {
    "Unreachable after 3 attempts": "Reach on WhatsApp instead of calling",
    "Owner had no time for a visit": "Send the 3-minute WhatsApp advisor link",
    "Missing GST or Udyam document": "Offer GST/Udyam registration help",
    "Installation delayed beyond 21 days": "Offer 5G AirFiber (2-day install) now",
    "Price too high": "Show the Essential plan + 24-month price",
    "Quote too complex to understand": "Send a one-page plain-language quote",
    "Competitor offered cheaper plan": "Compare total cost on one bill",
}

PRETTY = {
    "lead_source": "Source", "segment": "Segment", "has_gstin": "Has GSTIN", "has_udyam": "Has Udyam",
    "current_internet": "Current internet", "annual_turnover_band": "Turnover", "city_tier": "City tier",
    "log_emp": "More employees", "log_sites": "More sites", "log_spend": "Higher telecom spend",
}


def _features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["log_emp"] = np.log1p(out["employee_count"].astype(float))
    out["log_sites"] = np.log1p(out["num_sites"].astype(float))
    out["log_spend"] = np.log1p(out["monthly_telecom_spend_inr"].fillna(0).astype(float))
    out["city_tier"] = out["city_tier"].astype(str)
    return out


class Model:
    def __init__(self):
        leads = pd.read_csv(DATA / "smb_leads.csv")
        self.leads = leads
        df = _features(leads)
        y = (leads["outcome"] == "Activated").astype(int)
        pre = ColumnTransformer([
            ("cat", OneHotEncoder(handle_unknown="ignore"), CAT),
            ("num", StandardScaler(), NUM),
        ])
        self.pipe = Pipeline([("pre", pre), ("lr", LogisticRegression(max_iter=2000, C=0.5, class_weight="balanced"))])
        Xtr, Xte, ytr, yte = train_test_split(df[CAT + NUM], y, test_size=0.25, random_state=7, stratify=y)
        self.pipe.fit(Xtr, ytr)
        self.auc = float(roc_auc_score(yte, self.pipe.predict_proba(Xte)[:, 1]))
        self.pipe.fit(df[CAT + NUM], y)
        raw = self.pipe.predict_proba(df[CAT + NUM])[:, 1]
        # calibrate to observed base rate so numbers read as real probabilities
        self.base = float(y.mean())
        self.scale = self.base / float(raw.mean())
        leads["score"] = np.clip(raw * self.scale, 0, 0.95)
        top = leads.sort_values("score", ascending=False)
        decile = int(len(top) * 0.2)
        self.lift = float(top.head(decile)["outcome"].eq("Activated").mean() / self.base)
        self.capture = float(top.head(decile)["outcome"].eq("Activated").sum() / y.sum())

    def drivers(self, n=8) -> list[dict]:
        pre = self.pipe.named_steps["pre"]
        names = pre.get_feature_names_out()
        coefs = self.pipe.named_steps["lr"].coef_[0]
        rows = []
        for nm, c in zip(names, coefs):
            kind, feat = nm.split("__", 1)
            if kind == "cat":
                col = next(cc for cc in CAT if feat.startswith(cc + "_"))
                val = feat[len(col) + 1:]
                if col in ("has_gstin", "has_udyam"):
                    label = f"{PRETTY[col]}: {'yes' if val == 'Y' else 'no'}"
                elif col == "city_tier":
                    label = f"Tier {val} city"
                else:
                    label = f"{PRETTY[col]}: {val}"
            else:
                label = PRETTY[feat]
            rows.append({"label": label, "weight": round(float(c), 3)})
        rows.sort(key=lambda r: -abs(r["weight"]))
        return rows[:n]

    def score_row(self, row: dict) -> float:
        df = _features(pd.DataFrame([row]))
        return float(np.clip(self.pipe.predict_proba(df[CAT + NUM])[:, 1][0] * self.scale, 0, 0.95))

    def score_profile(self, p: dict, source: str) -> float:
        seg_map = {"micro": "Micro retail & services", "prof": "Professional offices",
                   "multi": "Small multi-site businesses", "mfg": "Small manufacturers"}
        row = {
            "lead_source": source, "segment": seg_map.get(p.get("segment") or "micro"),
            "has_gstin": "Y" if p.get("gstin") or p.get("has_gst") else "N",
            "has_udyam": "Y" if p.get("udyam") else "N",
            "current_internet": p.get("current_internet") or "Mobile hotspot",
            "annual_turnover_band": p.get("turnover") or "40 lakh - 1.5 cr",
            "city_tier": int(p.get("city_tier") or 2), "employee_count": int(p.get("employees") or 1),
            "num_sites": int(p.get("sites") or 1), "monthly_telecom_spend_inr": int(p.get("current_spend") or 0),
        }
        return self.score_row(row)

    def winback(self, limit=40) -> list[dict]:
        L = self.leads
        d = L[(L["outcome"] == "Dropped") & (L["drop_reason"].isin(RECOVERABLE.keys()))]
        d = d.sort_values("score", ascending=False).head(limit)
        out = []
        for _, r in d.iterrows():
            out.append({
                "lead_id": r["lead_id"], "business": r["business_name"], "type": r["business_type"],
                "segment": r["segment"], "city": r["city"], "tier": int(r["city_tier"]),
                "language": r["preferred_language"], "employees": int(r["employee_count"]), "sites": int(r["num_sites"]),
                "has_gstin": r["has_gstin"] == "Y", "source": r["lead_source"], "stage": r["stage_reached"],
                "drop_reason": r["drop_reason"], "action": RECOVERABLE[r["drop_reason"]],
                "score": round(float(r["score"]), 3), "spend": int(r["monthly_telecom_spend_inr"]),
                "contact": r["contact_name"], "role": r["contact_role"],
            })
        return out

    def funnel(self) -> list[dict]:
        order = ["Lead", "Contacted", "Needs assessed", "Quote accepted", "KYC complete", "Activated"]
        L = self.leads
        idx = {s: i for i, s in enumerate(order)}
        reached = L["stage_reached"].map(idx)
        return [{"stage": s, "count": int((reached >= i).sum())} for i, s in enumerate(order)]

    def by(self, col: str) -> list[dict]:
        g = self.leads.groupby(col)["outcome"].apply(lambda s: (s == "Activated").mean())
        c = self.leads.groupby(col).size()
        return sorted([{"key": str(k), "rate": round(float(v), 4), "n": int(c[k])} for k, v in g.items()],
                      key=lambda r: -r["rate"])


_model: Model | None = None


def model() -> Model:
    global _model
    if _model is None:
        _model = Model()
    return _model


def band(p: float) -> str:
    return "hot" if p >= 0.15 else "warm" if p >= 0.07 else "cold"


if __name__ == "__main__":
    m = model()
    print("AUC", round(m.auc, 3), "lift@20%", round(m.lift, 2), "capture", round(m.capture, 2))
    for d in m.drivers(10):
        print(d)
    print(m.winback(5)[:2])
    print(round(m.score_profile({"segment": "prof", "gstin": "x", "employees": 6, "city_tier": 1}, "WhatsApp campaign"), 3))
    _ = math
