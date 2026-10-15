"""AI QUEST practice kit. Synthetic data; Python standard library only.
Replay is not model inference. Live calls are opt-in and use local env vars.
"""
import argparse
import csv
import datetime as dt
import json
import math
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def read_json(name):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def read_csv(name):
    with (ROOT / name).open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def ratio(a, b):
    return round(a / b, 4) if b else None


def grams(text):
    text = re.sub(r"\s", "", text.lower())
    return [text[i:i + 2] for i in range(max(0, len(text) - 1))]


def cosine(a, b):
    if len(a) != len(b):
        raise ValueError("Vector dimensions differ")
    norm = math.sqrt(sum(x*x for x in a) * sum(y*y for y in b))
    return sum(x*y for x, y in zip(a, b)) / norm if norm else 0


def call_api(endpoint, body):
    base = os.environ.get("AI_BASE_URL", "").rstrip("/")
    key = os.environ.get("AI_API_KEY", "")
    parsed = urllib.parse.urlsplit(base)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment or not key:
        raise ValueError("Set AI_BASE_URL to a trusted HTTPS compatible API base and AI_API_KEY in your local environment. Never put keys in files or URLs.")
    request = urllib.request.Request(base + "/" + endpoint, data=json.dumps(body).encode("utf-8"),
                                     headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            raise RuntimeError("Unexpected API redirect; verify the trusted base URL locally.")
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=45) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"API returned HTTP {error.code}; check provider parameters and permissions locally. Response body omitted.") from None
    except urllib.error.URLError:
        raise RuntimeError("API connection failed; check endpoint, network and timeout. No fallback to invented output.") from None


def threshold(args):
    counts = dict(TP=0, FP=0, FN=0, TN=0)
    for row in read_csv("risk.csv"):
        actual = int(row["needs_review"]) == 1
        predicted = float(row["risk"]) >= args.threshold
        counts[("T" if actual == predicted else "F") + ("P" if predicted else "N")] += 1
    workload = counts["TP"] + counts["FP"]
    return {"mode": "calculation_on_synthetic_samples", "threshold": args.threshold, "n": sum(counts.values()), **counts,
            "precision": ratio(counts["TP"], workload), "recall": ratio(counts["TP"], counts["TP"] + counts["FN"]),
            "review_count": workload, "review_minutes_at_2_min_each": workload * 2, "undefined_metric": "null means zero denominator"}


def inspect(_):
    rows = read_csv("leakage.csv")
    stations = {}
    for row in rows:
        stations.setdefault(row["station_id"], []).append(row["sample_id"])
    return {"mode": "data_inspection", "n": len(rows),
            "observations_after_cutoff": [r["sample_id"] for r in rows if r["observed_at"] > r["prediction_cutoff"]],
            "post_outcome_field_present": [r["sample_id"] for r in rows if r["repair_result_after_cutoff"]],
            "repeated_entities": {k: v for k, v in stations.items() if len(v) > 1},
            "task": "Decide the split yourself. Delete unavailable features and check derived features. Entity repeats are a risk to inspect, not automatic proof of leakage."}


def retrieval(args):
    docs = read_json("documents.json")
    questions = read_json("questions-" + args.split + ".json")
    reference = read_json("reference.json")
    texts = [d["title"] + d["text"] for d in docs]
    vectors = None
    qvectors = None
    if args.method == "tfidf":
        bag = [grams(t) for t in texts]
        vocabulary = sorted(set(g for tokens in bag for g in tokens))
        idf = {g: math.log((1 + len(docs)) / (1 + sum(g in tokens for tokens in bag))) + 1 for g in vocabulary}
        def encode(t):
            tokens = grams(t)
            return [tokens.count(g) / max(1, len(tokens)) * idf[g] for g in vocabulary]
        vectors = [encode(t) for t in texts]
        qvectors = [encode(q["question"]) for q in questions]
    elif args.method == "embedding":
        model_name = os.environ.get("AI_EMBED_MODEL")
        if not model_name:
            raise ValueError("Set AI_EMBED_MODEL for optional live semantic embeddings.")
        result = call_api("embeddings", {"model": model_name, "input": texts + [q["question"] for q in questions]})
        values = sorted(result["data"], key=lambda x: x["index"])
        if [v["index"] for v in values] != list(range(len(texts) + len(questions))):
            raise ValueError("Embedding response indices do not match inputs")
        vectors = [v["embedding"] for v in values[:len(texts)]]
        qvectors = [v["embedding"] for v in values[len(texts):]]
    rows = []
    for index, question in enumerate(questions):
        at = args.at or question["as_of"]
        query_tokens = set(grams(question["question"]))
        ranked = []
        for i, doc in enumerate(docs):
            if args.valid_only and not (doc["valid_from"] <= at and (not doc["valid_to"] or at < doc["valid_to"])):
                continue
            score = cosine(qvectors[index], vectors[i]) if vectors is not None else len(query_tokens & set(grams(texts[i])))
            if score > 0:
                ranked.append({"doc_id": doc["id"], "score": round(score, 6), "text": doc["text"], "valid_from": doc["valid_from"], "valid_to": doc["valid_to"]})
        ranked.sort(key=lambda x: (-x["score"], x["doc_id"]))
        top = ranked[:args.topk]
        expected = reference[question["id"]]["expected_docs"]
        # Changing the question's business date also changes its truth conditions.
        hit = None if args.at or not expected else any(d["doc_id"] in expected for d in top)
        rows.append({"id": question["id"], "query": question["question"], "as_of": at, "candidates": top,
                     "expected_docs": None if args.at else expected, "hit": hit,
                     "note": "No-answer cases require human rejection evaluation; an empty expected_docs list is not a retrieval hit." if not expected else "Changing --at requires relabeling; hit is then disabled." if args.at else "Check scope and completeness, not just the ID."})
    graded = [r for r in rows if r["hit"] is not None]
    return {"mode": "live_semantic_embedding" if args.method == "embedding" else "real_local_algorithm",
            "method": args.method, "split": args.split, "date_filter": args.valid_only, "topk": args.topk,
            "hit_at_k": ratio(sum(r["hit"] for r in graded), len(graded)), "graded_answerable_questions": len(graded),
            "total_questions": len(rows), "answers_generated": False, "rows": rows}


def model(args):
    tickets = read_json("tickets.json")
    templates = read_json("prompts.json")
    replay = read_json("replay.json")
    rows = []
    if args.mode == "live" and not os.environ.get("AI_MODEL"):
        raise ValueError("Set AI_MODEL to a model available in your compatible API account.")
    for repeat in range(args.repeat):
        for ticket in tickets:
            start = time.perf_counter()
            if args.mode == "replay":
                value = replay[ticket["ticket_id"]]
                usage = None
            else:
                response = call_api("chat/completions", {"model": os.environ["AI_MODEL"], "temperature": 0,
                    "max_tokens": 512, "messages": [{"role": "system", "content": templates[args.prompt]},
                    {"role": "user", "content": json.dumps(ticket, ensure_ascii=False)}]})
                content = response["choices"][0]["message"]["content"]
                usage = response.get("usage")
                try:
                    value = json.loads(content)
                except (json.JSONDecodeError, TypeError):
                    value = {"unparsed_text": content}
            structure_ok = isinstance(value, dict) and isinstance(value.get("findings"), list) and isinstance(value.get("evidence"), list) and isinstance(value.get("needs_more"), bool)
            rows.append({"ticket_id": ticket["ticket_id"], "repeat": repeat+1, "output": value,
                         "structure_ok": structure_ok, "seconds": round(time.perf_counter()-start, 4), "usage": usage})
    return {"mode": "fixed_replay_NOT_inference" if args.mode == "replay" else "live_model",
            "model": os.environ.get("AI_MODEL") if args.mode == "live" else None, "prompt": args.prompt,
            "prompt_text": templates[args.prompt], "structure_pass": ratio(sum(r["structure_ok"] for r in rows), len(rows)),
            "warning": "Replay outputs are identical across prompts by design. Structure correctness is not factual correctness. Label facts manually against the input.", "rows": rows}


def tools(args):
    logs = [{"step": "input", "request_id": "demo-001", "ticket": "T01"}]
    created = {}
    def query(allowed=True, fail=False):
        if not allowed:
            return {"state": "denied", "next": "human_review"}
        if fail:
            return {"state": "timeout", "next": "human_review", "automatic_pass": False}
        return {"state": "ok", "power_kw": None, "next": "request_missing_evidence", "automatic_pass": False}
    def draft(request_id):
        if request_id in created:
            return {"state": "duplicate", "draft_id": created[request_id]}
        created[request_id] = "draft-001"
        return {"state": "draft_only", "draft_id": created[request_id], "needs_human_confirmation": True}
    if args.scenario == "duplicate":
        logs.extend([draft("demo-001"), draft("demo-001")])
    else:
        logs.append(query(allowed=args.scenario != "denied", fail=args.scenario == "timeout"))
    return {"mode": "executed_local_mock_tools", "scenario": args.scenario, "real_business_action": False,
            "created_drafts": len(created), "logs": logs, "limitation": "In-memory deduplication only. Not a production durability guarantee."}


def value(_):
    rows = []
    for r in read_csv("times.csv"):
        baseline = float(r["baseline_minutes"])
        assisted = sum(float(r[k]) for k in ["prepare_minutes", "review_minutes", "rework_minutes"])
        rows.append({"task_id": r["task_id"], "baseline_human_minutes": baseline, "assisted_human_minutes": assisted,
                     "net_saved_minutes": baseline-assisted, "call_cost_example": float(r["call_cost_example"])})
    return {"mode": "calculation_on_synthetic_timings", "n": len(rows), "mean_net_saved_minutes": sum(r["net_saved_minutes"] for r in rows)/len(rows),
            "slower_tasks": sum(r["net_saved_minutes"] < 0 for r in rows), "rows": rows,
            "limitation": "Teaching data only, not your measured business benefit. Maintenance and waiting time should be logged separately in an actual pilot."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("threshold"); p.add_argument("--threshold", type=float, default=.5)
    sub.add_parser("inspect")
    p = sub.add_parser("retrieval"); p.add_argument("--method", choices=["keyword", "tfidf", "embedding"], default="keyword")
    p.add_argument("--valid-only", action="store_true"); p.add_argument("--topk", type=int, choices=range(1, 6), default=2)
    p.add_argument("--split", choices=["dev", "holdout"], default="dev"); p.add_argument("--at", help="YYYY-MM-DD override; requires new labels")
    p = sub.add_parser("model"); p.add_argument("--mode", choices=["replay", "live"], default="replay")
    p.add_argument("--prompt", choices=["basic", "evidence"], default="basic"); p.add_argument("--repeat", type=int, choices=range(1, 6), default=1)
    p = sub.add_parser("tools"); p.add_argument("--scenario", choices=["normal", "timeout", "duplicate", "denied"], default="normal")
    sub.add_parser("value")
    args = parser.parse_args()
    if args.command == "threshold" and not 0 <= args.threshold <= 1:
        parser.error("threshold must be between 0 and 1")
    if getattr(args, "at", None):
        try: dt.date.fromisoformat(args.at)
        except ValueError: parser.error("--at requires YYYY-MM-DD")
    handlers = {"threshold": threshold, "inspect": inspect, "retrieval": retrieval, "model": model, "tools": tools, "value": value}
    result = handlers[args.command](args)
    result["run_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
    result["dataset_version"] = "2026-10-15"
    output = json.dumps(result, ensure_ascii=False, indent=2)
    folder = ROOT / "runs"
    folder.mkdir(exist_ok=True)
    target = folder / (args.command + "-" + dt.datetime.now().strftime("%Y%m%d-%H%M%S-%f") + ".json")
    target.write_text(output, encoding="utf-8")
    print(output)
    print("Saved:", target.name)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, TypeError, RuntimeError, OSError) as error:
        # Suppress request details and remote bodies; never print auth headers.
        print("Practice stopped:", type(error).__name__, ". Check inputs and README; no result was invented.")
        raise SystemExit(1)
