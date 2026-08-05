---
name: legalform
description: Create, deploy, manage, pre-sign, and export court-enforceable legal agreements (NDAs, Waivers, SAFEs, Contracts) via LegalForm CLI and Cloudflare API.
---

# LegalForm AI Assistant Skill Guide

This skill arms AI assistants (Claude Code, Antigravity CLI `agy`, OpenCode, Cursor, and IDE agents) with capabilities to generate, validate, deploy, re-up, pre-sign, and export legal document agreements using **LegalForm**.

---

## 🎯 Primary Capabilities & Use Cases

1. **Declarative Document Authoring:** Generate court-grade YAML document specifications for NDAs, SAFEs, Waivers, Offer Letters, and IP Agreements compliant with **EU eIDAS (Art. 25 AdES)** & **US ESIGN Act**.
2. **Instant Cloud & Local Deployment:** Deploy YAML specs to production Cloudflare Worker / D1 or local dev servers via CLI.
3. **Document Lifecycle Management:** List active document slugs, inspect signature counts, force close/revoke slugs, and re-up/extend document expiration periods.
4. **Owner Pre-Signing:** Affix pre-executed signatures to agreements before broadcasting signing links.
5. **PDF Certificate Generation:** Convert JSON submission audit logs into official PDF legal execution certificates with embedded signature images and full contract clauses.

---

## 🛠️ CLI Tool Commands (`cli/legalform.py`)

Run all CLI commands using your project's virtual environment python executable (`.\venv\Scripts\python.exe` on Windows or `python3` on Unix/Mac):

### 1. Deploy Document Spec
```bash
python3 cli/legalform.py deploy my-nda.yaml --admin-email "admin@yourcompany.com" -f receiving_party="Acme Corp" -f signer_email="ceo@acme.com"
```

### 2. List Deployed Slugs & Execution Counts
```bash
python3 cli/legalform.py list
```

### 3. Re-up / Reopen Document Slug
```bash
python3 cli/legalform.py reopen <slug> --days 30
```

### 4. Force Close / Revoke Document Slug
```bash
python3 cli/legalform.py close <slug>
```

### 5. Permanently Delete Document & Purge R2 Vault
```bash
python3 cli/legalform.py delete <doc_id>
```

### 6. Export Submission Audit Records
```bash
python3 cli/legalform.py export <doc_id> -o submission.json
```

### 7. Convert Submission JSON to Court-Grade PDF Certificate
```bash
python3 cli/legalform.py pdf submission.json -s my-nda.yaml -o executed_agreement.pdf
```

---

## 📑 YAML Specification Format Standard

LegalForm specs follow this schema:

```yaml
document:
  id: "nda-2026-001"
  title: "MUTUAL NON-DISCLOSURE AGREEMENT"
  jurisdiction: "International, EU eIDAS & State of Delaware, USA"
  expires_in_days: 30
  max_submissions_per_email: 99
  max_submissions_per_ip: 99
  admin_notification_email: "admin@company.com"
  legal_footer: "IN WITNESS WHEREOF, the Parties have executed this Agreement electronically."

sections:
  - type: "static"
    content: |
      ## PREAMBLE
      This Agreement is entered into between Disclosing Party and Receiving Party.

  - type: "form"
    fields:
      - name: "disclosing_party"
        label: "Disclosing Party Legal Entity"
        type: "text"
        required: true
        value: "Acme Corporation"

      - name: "receiving_party"
        label: "Receiving Party Entity Name"
        type: "text"
        required: true

      - name: "signer_email"
        label: "Signer Official Email Address"
        type: "email"
        required: true

  - type: "signature"
    signer_label: "EXECUTION & SIGNATURE OF RECORD"
    pre_signed: false
    fields:
      - name: "signature_timestamp"
        label: "Date & Timestamp of Execution"
        type: "datetime-auto"
        required: true
```
