// A compact but realistic COBOL core-banking module (CBSA-style).
// Deliberately structured so a change to VATCALC produces a real, computed
// blast radius across the programs that (transitively) CALL it.
// Each file is parsed live in the browser — nothing is hard-coded downstream.

export interface SourceFile {
  path: string;
  content: string;
}

export const SAMPLE_NAME = "ACME Bank — Core Ledger (COBOL / CICS)";

export const SAMPLE_FILES: SourceFile[] = [
  {
    path: "src/VATCALC.cbl",
    content: `      IDENTIFICATION DIVISION.
       PROGRAM-ID. VATCALC.
      *================================================================
      * VAT CALCULATION ENGINE
      * Computes value-added tax for a transaction line. The standard
      * rate is held as a literal below and has NOT changed since 2011.
      * Multi-currency amounts are normalised via FXRATE first.
      *================================================================
       ENVIRONMENT DIVISION.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       COPY VATFLDS.
       01  WS-VAT-RATE        PIC 9V999 VALUE 0.200.
       01  WS-NORM-AMT        PIC 9(11)V99.
       LINKAGE SECTION.
       01  LK-LINE-AMOUNT     PIC 9(11)V99.
       01  LK-CURRENCY        PIC X(3).
       01  LK-VAT-AMOUNT      PIC 9(11)V99.
       PROCEDURE DIVISION USING LK-LINE-AMOUNT LK-CURRENCY LK-VAT-AMOUNT.
       MAIN-LINE.
           PERFORM NORMALISE-CURRENCY
           PERFORM APPLY-RATE
           GOBACK.
       NORMALISE-CURRENCY.
           CALL 'FXRATE' USING LK-CURRENCY LK-LINE-AMOUNT WS-NORM-AMT.
       APPLY-RATE.
           EXEC SQL
               SELECT RATE INTO :WS-VAT-RATE FROM TAX-CONFIG
               WHERE JURISDICTION = 'UK'
           END-EXEC
           COMPUTE LK-VAT-AMOUNT = WS-NORM-AMT * WS-VAT-RATE.
`,
  },
  {
    path: "src/FXRATE.cbl",
    content: `      IDENTIFICATION DIVISION.
       PROGRAM-ID. FXRATE.
      *----------------------------------------------------------------
      * FOREIGN-EXCHANGE RATE LOOKUP. Reads the daily FX-RATES file and
      * converts an amount into GBP. Pure read; no downstream calls.
      *----------------------------------------------------------------
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT FX-RATES ASSIGN TO FXRATES.
       DATA DIVISION.
       PROCEDURE DIVISION.
       MAIN-LINE.
           GOBACK.
`,
  },
  {
    path: "src/PRICENG.cbl",
    content: `      IDENTIFICATION DIVISION.
       PROGRAM-ID. PRICENG.
      *----------------------------------------------------------------
      * PRICING ENGINE. Builds a net + tax price for a product line,
      * applying VAT via VATCALC and writing an audit trail.
      *----------------------------------------------------------------
       ENVIRONMENT DIVISION.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       COPY PRICEFLD.
       PROCEDURE DIVISION.
       MAIN-LINE.
           EXEC SQL
               SELECT LIST_PRICE INTO :WS-NET FROM PRODUCT-MASTER
           END-EXEC
           CALL 'FXRATE'  USING WS-CCY WS-NET WS-GBP
           CALL 'VATCALC' USING WS-GBP WS-CCY WS-VAT
           CALL 'AUDITLG' USING 'PRICE' WS-VAT
           GOBACK.
`,
  },
  {
    path: "src/INVGEN.cbl",
    content: `      IDENTIFICATION DIVISION.
       PROGRAM-ID. INVGEN.
      *----------------------------------------------------------------
      * INVOICE GENERATION. Produces a customer invoice: prices each
      * line, adds VAT, and writes the INVOICE print file.
      *----------------------------------------------------------------
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT INVOICE-FILE ASSIGN TO INVOICE.
       DATA DIVISION.
       PROCEDURE DIVISION.
       MAIN-LINE.
           CALL 'PRICENG' USING WS-LINE
           CALL 'VATCALC' USING WS-AMT WS-CCY WS-VAT
           GOBACK.
`,
  },
  {
    path: "src/ACCTMST.cbl",
    content: `      IDENTIFICATION DIVISION.
       PROGRAM-ID. ACCTMST.
      *----------------------------------------------------------------
      * ACCOUNT MASTER MAINTENANCE. Accrues interest and the VAT due on
      * account fees, then updates the ACCOUNT table. Financial store.
      *----------------------------------------------------------------
       ENVIRONMENT DIVISION.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       COPY ACCTREC.
       PROCEDURE DIVISION.
       MAIN-LINE.
           CALL 'VATCALC' USING WS-FEE WS-CCY WS-FEE-VAT
           EXEC SQL
               UPDATE ACCOUNT SET BALANCE = BALANCE - :WS-FEE-VAT
           END-EXEC
           GOBACK.
`,
  },
  {
    path: "src/TAXRPT.cbl",
    content: `      IDENTIFICATION DIVISION.
       PROGRAM-ID. TAXRPT.
      *----------------------------------------------------------------
      * TAX REPORTING. Aggregates priced lines for the HMRC return and
      * logs the run. Reads the LEDGER.
      *----------------------------------------------------------------
       ENVIRONMENT DIVISION.
       DATA DIVISION.
       PROCEDURE DIVISION.
       MAIN-LINE.
           EXEC SQL SELECT SUM(AMT) FROM LEDGER END-EXEC
           CALL 'PRICENG' USING WS-LINE
           CALL 'AUDITLG' USING 'TAXRPT' WS-TOTAL
           GOBACK.
`,
  },
  {
    path: "src/LEDGPST.cbl",
    content: `      IDENTIFICATION DIVISION.
       PROGRAM-ID. LEDGPST.
      *----------------------------------------------------------------
      * LEDGER POSTING. Posts invoice and account movements to the
      * general LEDGER. Core financial store — changes here are risky.
      *----------------------------------------------------------------
       ENVIRONMENT DIVISION.
       DATA DIVISION.
       PROCEDURE DIVISION.
       MAIN-LINE.
           CALL 'INVGEN'  USING WS-INV
           CALL 'ACCTMST' USING WS-ACC
           EXEC SQL
               INSERT INTO LEDGER (AMT, VAT) VALUES (:WS-AMT, :WS-VAT)
           END-EXEC
           GOBACK.
`,
  },
  {
    path: "src/STMTGEN.cbl",
    content: `      IDENTIFICATION DIVISION.
       PROGRAM-ID. STMTGEN.
      *----------------------------------------------------------------
      * STATEMENT GENERATION. Builds the customer statement from posted
      * ledger movements and the tax report; writes the STATEMENT file.
      *----------------------------------------------------------------
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT STMT-FILE ASSIGN TO STATEMENT.
       DATA DIVISION.
       PROCEDURE DIVISION.
       MAIN-LINE.
           CALL 'LEDGPST' USING WS-POST
           CALL 'TAXRPT'  USING WS-TAX
           GOBACK.
`,
  },
  {
    path: "src/AUDITLG.cbl",
    content: `      IDENTIFICATION DIVISION.
       PROGRAM-ID. AUDITLG.
      *----------------------------------------------------------------
      * AUDIT LOGGING. Append-only writer to the AUDIT-LOG file. Called
      * by many programs; itself calls nothing. A leaf dependency.
      *----------------------------------------------------------------
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT AUDIT-FILE ASSIGN TO AUDITLOG.
       DATA DIVISION.
       PROCEDURE DIVISION.
       MAIN-LINE.
           GOBACK.
`,
  },
  {
    path: "src/CUSTMST.cbl",
    content: `      IDENTIFICATION DIVISION.
       PROGRAM-ID. CUSTMST.
      *----------------------------------------------------------------
      * CUSTOMER MASTER. Onboards/updates customers and opens accounts
      * via ACCTMST. Reads the CUSTOMER table.
      *----------------------------------------------------------------
       ENVIRONMENT DIVISION.
       DATA DIVISION.
       PROCEDURE DIVISION.
       MAIN-LINE.
           EXEC SQL SELECT * FROM CUSTOMER END-EXEC
           CALL 'ACCTMST' USING WS-ACC
           GOBACK.
`,
  },
  {
    path: "src/BILLRUN.cbl",
    content: `      IDENTIFICATION DIVISION.
       PROGRAM-ID. BILLRUN.
      *----------------------------------------------------------------
      * MONTHLY BILLING BATCH. Top-level driver: generates statements
      * and invoices for the whole book. Runs unattended overnight.
      *----------------------------------------------------------------
       ENVIRONMENT DIVISION.
       DATA DIVISION.
       PROCEDURE DIVISION.
       MAIN-LINE.
           CALL 'STMTGEN' USING WS-CUST
           CALL 'INVGEN'  USING WS-CUST
           GOBACK.
`,
  },
  {
    path: "src/EODBATCH.cbl",
    content: `      IDENTIFICATION DIVISION.
       PROGRAM-ID. EODBATCH.
      *----------------------------------------------------------------
      * END-OF-DAY BATCH. Posts the day's ledger and produces the tax
      * report. Second top-level driver.
      *----------------------------------------------------------------
       ENVIRONMENT DIVISION.
       DATA DIVISION.
       PROCEDURE DIVISION.
       MAIN-LINE.
           CALL 'LEDGPST' USING WS-DAY
           CALL 'TAXRPT'  USING WS-DAY
           GOBACK.
`,
  },
  {
    path: "cpy/VATFLDS.cpy",
    content: `      *> VAT working fields shared by the tax programs.
       01  VAT-WORK-AREA.
           05  VW-RATE        PIC 9V999.
           05  VW-BASE        PIC 9(11)V99.
           05  VW-RESULT      PIC 9(11)V99.
`,
  },
  {
    path: "cpy/PRICEFLD.cpy",
    content: `      *> Pricing working fields.
       01  WS-NET   PIC 9(11)V99.
       01  WS-GBP   PIC 9(11)V99.
       01  WS-VAT   PIC 9(11)V99.
       01  WS-CCY   PIC X(3).
`,
  },
  {
    path: "cpy/ACCTREC.cpy",
    content: `      *> Account record layout (subset).
       01  ACCOUNT-REC.
           05  AC-NUMBER   PIC 9(10).
           05  AC-BALANCE  PIC S9(11)V99.
           05  AC-FEE      PIC 9(7)V99.
`,
  },
];
