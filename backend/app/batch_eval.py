"""Advanced batch evaluation and charting module."""

import csv
import json
from pathlib import Path
from difflib import SequenceMatcher
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from pydantic import BaseModel

from .evaluation import FIELDS, STR_FIELDS, NUM_FIELDS, load_rows, _norm_str, _num, _norm_items
from .schemas import DocumentType

_ROOT = Path(__file__).resolve().parents[2]

def string_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()

def advanced_compare(pred: dict, gt: dict, doc_type: str) -> dict:
    """Returns {field: {"extracted": val, "exact": bool/None, "sim": float/None}}"""
    result = {}
    for f in STR_FIELDS:
        if f == "buyer" and doc_type == "receipt":
            result[f] = {"extracted": None, "exact": None, "sim": None}
            continue
        p_val = _norm_str(pred.get(f))
        g_val = _norm_str(gt.get(f))
        result[f] = {
            "extracted": pred.get(f), # keep original case for display
            "exact": p_val == g_val,
            "sim": string_similarity(p_val, g_val)
        }
    for f in NUM_FIELDS:
        p_val = _num(pred.get(f))
        g_val = _num(gt.get(f))
        result[f] = {
            "extracted": pred.get(f),
            "exact": p_val == g_val,
            "sim": 1.0 if p_val == g_val else 0.0
        }
    
    # line items
    p_items = _norm_items(pred.get("line_items"))
    g_items = _norm_items(json.loads(gt.get("line_items") or "[]"))
    
    p_str = json.dumps(p_items)
    g_str = json.dumps(g_items)
    result["line_items"] = {
        "extracted": json.dumps(pred.get("line_items")),
        "exact": p_items == g_items,
        "sim": string_similarity(p_str, g_str)
    }
    
    return result


def generate_batch_charts(batch_id: str) -> None:
    batch_dir = _ROOT / "data" / "batches" / batch_id
    times_file = batch_dir / "times.csv"
    extracted_jsonl = batch_dir / "extracted.jsonl"
    
    if not extracted_jsonl.exists():
        return
        
    # Read ground truth
    all_gt_rows = load_rows()
    gt_map = {row["doc_id"]: row for row in all_gt_rows}
    
    extracted_data = []
    exact_match_data = []
    similarity_data = []
    
    with open(extracted_jsonl, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            rec = json.loads(line)
            filename = rec.get("filename", "")
            # Assume filename is something like DOC-001.pdf or DOC-001.png
            doc_id = filename.split(".")[0]
            doc_type = rec.get("doc_type", "invoice")
            
            gt = gt_map.get(doc_id)
            if not gt:
                continue # Skip evaluation for files without ground truth
                
            pred_data = rec.get("data", {})
            pred_data["line_item_count"] = rec.get("data", {}).get("line_item_count", 0)
            
            cmp = advanced_compare(pred_data, gt, doc_type)
            
            ex_row = {"doc_id": doc_id, "doc_type": doc_type}
            em_row = {"doc_id": doc_id, "doc_type": doc_type}
            sm_row = {"doc_id": doc_id, "doc_type": doc_type}
            
            for f_name in FIELDS:
                ex_row[f_name] = cmp[f_name]["extracted"]
                em_row[f_name] = 1 if cmp[f_name]["exact"] is True else (0 if cmp[f_name]["exact"] is False else "n/a")
                sm_row[f_name] = cmp[f_name]["sim"] if cmp[f_name]["sim"] is not None else "n/a"
                
            extracted_data.append(ex_row)
            exact_match_data.append(em_row)
            similarity_data.append(sm_row)
            
    if extracted_data:
        def save_csv(filename: str, data: list):
            filepath = batch_dir / filename
            with open(filepath, "w", newline="", encoding="utf-8") as fh:
                w = csv.DictWriter(fh, fieldnames=["doc_id", "doc_type"] + FIELDS)
                w.writeheader()
                w.writerows(data)
                
        save_csv("extracted_data.csv", extracted_data)
        save_csv("eval_exact_match.csv", exact_match_data)
        save_csv("eval_similarity.csv", similarity_data)
        
        charts_dir = batch_dir / "charts"
        charts_dir.mkdir(exist_ok=True)
        
        df_em = pd.DataFrame(exact_match_data).replace("n/a", pd.NA)
        df_sm = pd.DataFrame(similarity_data).replace("n/a", pd.NA)
        
        for f_name in FIELDS:
            if f_name in df_em.columns: df_em[f_name] = pd.to_numeric(df_em[f_name])
            if f_name in df_sm.columns: df_sm[f_name] = pd.to_numeric(df_sm[f_name])
            
        sns.set_theme(style="whitegrid")
        
        # 1. Accuracy
        plt.figure(figsize=(10, 6))
        field_acc = df_em[FIELDS].mean(skipna=True) * 100
        sns.barplot(x=field_acc.index, y=field_acc.values, color="royalblue")
        plt.title("Exact Match Accuracy by Field (%)")
        plt.xticks(rotation=45, ha='right')
        plt.ylabel("Accuracy (%)")
        plt.ylim(0, 105)
        plt.tight_layout()
        plt.savefig(charts_dir / "accuracy_by_field.png")
        plt.close()
        
        # 2. Similarity
        plt.figure(figsize=(10, 6))
        field_sim = df_sm[FIELDS].mean(skipna=True) * 100
        sns.barplot(x=field_sim.index, y=field_sim.values, color="seagreen")
        plt.title("Format Similarity by Field (%)")
        plt.xticks(rotation=45, ha='right')
        plt.ylabel("Similarity (%)")
        plt.ylim(0, 105)
        plt.tight_layout()
        plt.savefig(charts_dir / "similarity_by_field.png")
        plt.close()
        
        # 3. Document Score Distribution
        doc_sims = df_sm[FIELDS].mean(axis=1, skipna=True) * 100
        plt.figure(figsize=(8, 5))
        sns.histplot(doc_sims, bins=10, kde=True, color="indigo")
        plt.title("Distribution of Document Overall Similarity Scores")
        plt.xlabel("Average Similarity Score per Document (%)")
        plt.ylabel("Number of Documents")
        plt.tight_layout()
        plt.savefig(charts_dir / "document_score_distribution.png")
        plt.close()

    # Generate processing_times.png regardless of evaluation
    if times_file.exists():
        df = pd.read_csv(times_file)
        if not df.empty:
            plt.figure(figsize=(10, 6))
            sns.set_theme(style="whitegrid")
            sns.lineplot(data=df, x=df.index, y="processing_time", marker="o", color="coral")
            plt.title("Extraction Time per Document in Batch")
            plt.xlabel("Document Index")
            plt.ylabel("Processing Time (seconds)")
            plt.xticks(df.index)
            plt.ylim(bottom=0)
            plt.tight_layout()
            plt.savefig(batch_dir / "processing_times.png")
            plt.close()
