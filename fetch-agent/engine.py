"""Legacy Safety Net — analysis engine (Python port of the web engine).

Parses a compact COBOL banking module into a dependency graph and computes the
blast radius of a change. Kept in sync with the TypeScript engine so the ASI:One
agent returns the same answer as the web app.
"""
from __future__ import annotations
import re
from collections import defaultdict, deque
from dataclasses import dataclass, field

# --- the sample codebase (same programs/relationships as the web demo) -------
# Only the tokens the parser needs (PROGRAM-ID, CALL, COPY, EXEC SQL, SELECT).
SAMPLE: dict[str, str] = {
    "VATCALC": """PROGRAM-ID. VATCALC.
* VAT CALCULATION ENGINE. Standard rate held as a literal; unchanged since 2011.
COPY VATFLDS.
01 WS-VAT-RATE PIC 9V999 VALUE 0.200.
CALL 'FXRATE' USING LK-CURRENCY LK-LINE-AMOUNT WS-NORM-AMT.
EXEC SQL SELECT RATE INTO :WS-VAT-RATE FROM TAX-CONFIG END-EXEC""",
    "FXRATE": """PROGRAM-ID. FXRATE.
* FOREIGN-EXCHANGE RATE LOOKUP. Pure read; no downstream calls.
SELECT FX-RATES ASSIGN TO FXRATES.""",
    "PRICENG": """PROGRAM-ID. PRICENG.
* PRICING ENGINE. Applies VAT via VATCALC and writes an audit trail.
COPY PRICEFLD.
EXEC SQL SELECT LIST_PRICE INTO :WS-NET FROM PRODUCT-MASTER END-EXEC
CALL 'FXRATE' USING WS-CCY WS-NET WS-GBP
CALL 'VATCALC' USING WS-GBP WS-CCY WS-VAT
CALL 'AUDITLG' USING 'PRICE' WS-VAT""",
    "INVGEN": """PROGRAM-ID. INVGEN.
* INVOICE GENERATION. Prices each line, adds VAT, writes the INVOICE file.
SELECT INVOICE-FILE ASSIGN TO INVOICE.
CALL 'PRICENG' USING WS-LINE
CALL 'VATCALC' USING WS-AMT WS-CCY WS-VAT""",
    "ACCTMST": """PROGRAM-ID. ACCTMST.
* ACCOUNT MASTER MAINTENANCE. Accrues interest and VAT on fees; updates ACCOUNT.
COPY ACCTREC.
CALL 'VATCALC' USING WS-FEE WS-CCY WS-FEE-VAT
EXEC SQL UPDATE ACCOUNT SET BALANCE = BALANCE - :WS-FEE-VAT END-EXEC""",
    "TAXRPT": """PROGRAM-ID. TAXRPT.
* TAX REPORTING. Aggregates priced lines for the HMRC return; reads the LEDGER.
EXEC SQL SELECT SUM(AMT) FROM LEDGER END-EXEC
CALL 'PRICENG' USING WS-LINE
CALL 'AUDITLG' USING 'TAXRPT' WS-TOTAL""",
    "LEDGPST": """PROGRAM-ID. LEDGPST.
* LEDGER POSTING. Posts movements to the general LEDGER. Core financial store.
CALL 'INVGEN' USING WS-INV
CALL 'ACCTMST' USING WS-ACC
EXEC SQL INSERT INTO LEDGER (AMT, VAT) VALUES (:WS-AMT, :WS-VAT) END-EXEC""",
    "STMTGEN": """PROGRAM-ID. STMTGEN.
* STATEMENT GENERATION. Builds the customer statement; writes the STATEMENT file.
SELECT STMT-FILE ASSIGN TO STATEMENT.
CALL 'LEDGPST' USING WS-POST
CALL 'TAXRPT' USING WS-TAX""",
    "AUDITLG": """PROGRAM-ID. AUDITLG.
* AUDIT LOGGING. Append-only writer. Called by many; calls nothing.
SELECT AUDIT-FILE ASSIGN TO AUDITLOG.""",
    "CUSTMST": """PROGRAM-ID. CUSTMST.
* CUSTOMER MASTER. Onboards customers and opens accounts via ACCTMST.
EXEC SQL SELECT * FROM CUSTOMER END-EXEC
CALL 'ACCTMST' USING WS-ACC""",
    "BILLRUN": """PROGRAM-ID. BILLRUN.
* MONTHLY BILLING BATCH. Top-level driver; runs unattended overnight.
CALL 'STMTGEN' USING WS-CUST
CALL 'INVGEN' USING WS-CUST""",
    "EODBATCH": """PROGRAM-ID. EODBATCH.
* END-OF-DAY BATCH. Posts the day's ledger and produces the tax report.
CALL 'LEDGPST' USING WS-DAY
CALL 'TAXRPT' USING WS-DAY""",
}
COPYBOOKS = {"VATFLDS": "vat working fields", "PRICEFLD": "pricing fields", "ACCTREC": "account record"}
FINANCIAL_STORES = {"LEDGER", "ACCOUNT"}


@dataclass
class Repo:
    calls: dict[str, list[str]] = field(default_factory=lambda: defaultdict(list))
    copies: dict[str, list[str]] = field(default_factory=lambda: defaultdict(list))
    reads: dict[str, list[str]] = field(default_factory=lambda: defaultdict(list))
    writes: dict[str, list[str]] = field(default_factory=lambda: defaultdict(list))
    comment: dict[str, str] = field(default_factory=dict)
    programs: list[str] = field(default_factory=list)


def parse() -> Repo:
    r = Repo()
    for pid, src in SAMPLE.items():
        r.programs.append(pid)
        for line in src.splitlines():
            if line.strip().startswith("*"):
                m = re.match(r"\*\s*(.+)", line.strip())
                if m and pid not in r.comment:
                    r.comment[pid] = m.group(1).strip()
                continue
            for c in re.findall(r"CALL\s+'([A-Z0-9-]+)'", line):
                r.calls[pid].append(c)
            for c in re.findall(r"\bCOPY\s+([A-Z0-9-]+)", line):
                r.copies[pid].append(c)
            for s in re.findall(r"SELECT\s+[A-Z0-9-]+\s+ASSIGN\s+TO\s+([A-Z0-9-]+)", line):
                r.reads[pid].append(s)
            if "EXEC SQL" in line:
                write = bool(re.search(r"\b(INSERT|UPDATE|DELETE)\b", line))
                for t in re.findall(r"\b(?:FROM|INTO|UPDATE)\s+([A-Z][A-Z0-9_-]*)", line):
                    (r.writes if write else r.reads)[pid].append(t)
    return r


def blast(r: Repo, target: str) -> dict:
    # parents[x] = who depends on x (callers/includers)
    parents: dict[str, set[str]] = defaultdict(set)
    fan_in: dict[str, int] = defaultdict(int)
    for p in r.programs:
        for c in r.calls[p]:
            parents[c].add(p)
            fan_in[c] += 1
        for c in r.copies[p]:
            parents[c].add(p)
    affected, pred, seen, q = [], {}, {target}, deque([target])
    while q:
        cur = q.popleft()
        for p in parents.get(cur, ()):  # ancestors
            if p in seen:
                continue
            seen.add(p)
            pred[p] = cur
            affected.append(p)
            q.append(p)

    def path(n):
        out = [n]
        while n in pred:
            n = pred[n]
            out.append(n)
        return out

    interfaces = set()
    for pid in [target, *affected]:
        interfaces.update(r.reads[pid])
        interfaces.update(r.writes[pid])
    high, reasons = [], {}
    for pid in affected:
        wf = next((t for t in r.writes[pid] if t in FINANCIAL_STORES), None)
        if wf:
            high.append(pid); reasons[pid] = f"writes to shared financial store {wf}"
        elif fan_in[pid] >= 2:
            high.append(pid); reasons[pid] = f"called from {fan_in[pid]} places — wide fan-out"
        else:
            reasons[pid] = f"depends on {path(pid)[1] if len(path(pid)) > 1 else target}"
    return {
        "target": target,
        "affected": affected,
        "interfaces": sorted(interfaces),
        "high_risk": high,
        "reasons": reasons,
        "paths": {a: path(a) for a in affected},
    }


_STOP = {"add", "the", "new", "and", "for", "with", "make", "change", "into", "from",
         "that", "this", "our", "per", "all", "tier", "rate", "logic", "update", "modify"}


def resolve_target(r: Repo, request: str) -> str:
    tokens = [t for t in re.sub(r"[^a-z0-9%\s-]", " ", request.lower()).split() if len(t) >= 3 and t not in _STOP]
    best, best_score = "VATCALC", 0
    for pid in r.programs:
        hay = f"{pid} {r.comment.get(pid, '')}".lower()
        score = 0
        for t in tokens:
            bare = t.rstrip("%")
            if bare and bare in pid.lower():
                score += 3
            elif bare and bare in hay:
                score += 1
        if score > best_score:
            best, best_score = pid, score
    return best
