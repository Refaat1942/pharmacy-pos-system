# Fratelanza Pharmacy POS — ETA Integration Readiness Report

**To:** EtaMiddleware / Integration Developer  
**From:** Fratelanza POS Engineering  
**Date:** 2026-06-25  
**Product:** Fratelanza Pharmacy POS (FastAPI + React)  
**Middleware docs:** [EtaMiddleware Postman Documentation](https://documenter.getpostman.com/view/51011938/2sBXVZpF4t)  
**Branch:** `eta-integration` (not yet merged to production)

---

## 1. Executive summary

Fratelanza Pharmacy POS is **ready to begin sandbox certification** against the **EtaMiddleware EtaDocument API v2**. The POS can:

- Store encrypted HMAC credentials and branch/POS mappings in tenant settings
- Build compliant `Documents[]` JSON from real sales invoices
- Sign requests (`EtaAuthentication` + `EtaTimestamp` + `EtaSignature`, API version `2`)
- POST to `/EtaDocument/Documents` and GET `/EtaDocument/QrCode`
- Preview payload JSON per invoice (`GET /api/eta/preview/{invoice_id}`)
- Submit a single invoice for certification (`POST /api/eta/submit-preview/{invoice_id}`)

**Checkout is never blocked by ETA.** Submission will run asynchronously (Phase 2 worker) after sandbox sign-off.

**ETA remains disabled by default** for all tenants until credentials are configured and explicitly activated.

---

## 2. Integration architecture

```
┌─────────────┐     sale commit      ┌──────────────────┐     async worker     ┌─────────────────┐
│  POS / Web  │ ──────────────────► │ Fratelanza API   │ ───────────────────► │ EtaMiddleware   │
│  Checkout   │   (instant receipt)  │ backend/eta/*    │   HMAC POST JSON     │ testeta.misrapp │
└─────────────┘                      └──────────────────┘                      └────────┬────────┘
                                                                                        │
                                                                                        ▼
                                                                               Egyptian ETA (e-Receipt)
```

| Principle | Implementation |
|-----------|----------------|
| Non-blocking checkout | Sale/return commits first; ETA enqueue in `try/except` (Phase 2) |
| Idempotency | `eta_submissions.idempotency_key` UNIQUE per document |
| Retry audit | `eta_submission_attempts` stores each HTTP attempt |
| Secrets | Auth key + HMAC secret encrypted at rest (Fernet, app `SECRET_KEY`) |
| Feature gate | Control Platform feature `eta` — **off by default** |

---

## 3. API endpoints we will call

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `{BaseUrl}/EtaDocument/Documents` | Submit sales receipts (SR), return receipts (RR), partial refunds |
| `GET` | `{BaseUrl}/EtaDocument/QrCode?UniqueId={id}` | Fetch QR URL for receipt reprint |

**Test base URL (expected):** `https://testeta.misrapp.com/api`

**Authentication (v2):**

```
payload = AuthKey + UnixTimestamp + exact_JSON_body
EtaSignature = Base64(HMAC-SHA256(payload, SecretKey))
Headers: EtaAuthentication, EtaTimestamp, EtaSignature, EtaAPIVersion=2
```

Our implementation: `backend/eta/signing.py`, `backend/eta/client.py`

---

## 4. Document types we will use

| DocumentType | Code | POS event |
|--------------|------|-----------|
| Sales Receipt | `3` (SR) | Every completed POS sale |
| Return Receipt | `4` (RR) | Full return linked to original receipt |
| Partial refund | `3` + `IsPartialRefund: true` | Partial return — items kept sent as new SR, references original `ReferenceUUID` |

We do **not** plan to emit B2B invoices (type `0`) from retail POS in the first release. Credit/debit notes can be added later if required.

---

## 5. Field mapping (POS → EtaMiddleware)

### 5.1 Document header

| EtaMiddleware field | Fratelanza source | Notes |
|---------------------|-------------------|-------|
| `InternalId` | `invoices.invoice_number` | e.g. `INV-20260625-0042` |
| `UniqueId` | `{BranchCode}-R-{invoice_id}-{invoice_number}` | Stable, unique per branch |
| `ReferenceUUID` | Prior submission `eta_uuid` | Required for returns |
| `Date` / `Time` | `invoices.created_at` | Local pharmacy time |
| `CustomerName` … `CustomerBuilding` | `customers.*` or walk-in defaults | See §5.3 |
| `CustomerType` | `0` person / `1` business if `tax_number` set | |
| `TotalSales` / `NetAmount` | `invoices.net_total` | |
| `TotalDiscount` | `discount + offer_savings + loyalty_discount` | |
| `ExtraDiscount` | `offer_savings + loyalty_discount` | |
| `PaymentType` | `0` cash / `1` visa / `2` mixed | From `payment_method`, `cash_amount`, `visa_amount` |
| `DocOrderType` | `1` if delivery sale, else `0` | |
| `BranchCode` | Settings → ETA → branch mapping | Must match your registered branch |
| `PosSerial` | Settings → ETA → POS serial | Required for SR/RR |
| `DocumentType` | `3` sale / `4` full return | |
| `IsPartialRefund` | `true` for partial adjustment flow | Optional |

### 5.2 Line items (`DocumentDetails`)

| EtaMiddleware field | Fratelanza source | Notes |
|---------------------|-------------------|-------|
| `ProductDescription` | `invoice_items.product_name_en` (or Arabic) | |
| `Quantity` | `invoice_items.quantity` | Supports pack/sub-unit sales |
| `UnitPrice` | `invoice_items.unit_price` | |
| `UnitType` | `EA` or `KG` | From product unit |
| `DiscountAmount` | Line discount + offer discount | |
| `NetTotal` / `Total` | Line total + VAT | |
| `VAT` | Computed from `products.vat_rate` | Default `0` for pharmacy items |
| `InternalCode` | Product ID or barcode | |
| `ItemCode` | `products.eta_item_code` → `international_barcode` → `barcode` | **GS1/GPC preferred** |
| `EGSCode` | `products.eta_egs_code` | Optional |
| `DocumentDetailTaxs` | `[{TaxType: VAT, Rate: 0.14}]` or `[{TaxType: T1, Rate: 0}]` | Zero-rated medicines use `T1` / `0` |

Mapper: `backend/eta/mapper.py`

### 5.3 Walk-in customers

Retail pharmacy sales often have no registered customer. We send configurable defaults (Settings → ETA):

```json
{
  "CustomerName": "Walk-in Customer",
  "CustomerCode": "WALKIN",
  "CustomerCountryCode": "EG",
  "CustomerGovernate": "Cairo",
  "CustomerCity": "Cairo",
  "CustomerStreet": "N/A",
  "CustomerBuilding": "1",
  "CustomerType": 0
}
```

Delivery sales use `delivery_customer_name` / phone when present.

---

## 6. What we need from you (action items)

Please confirm or provide:

| # | Item | Status |
|---|------|--------|
| 1 | **EtaAuthentication** key for sandbox | ☐ Pending |
| 2 | **HMAC SecretKey** for sandbox | ☐ Pending |
| 3 | **Production BaseUrl** (when ready) | ☐ Pending |
| 4 | **BranchCode** per pharmacy branch | ☐ Pending |
| 5 | **PosSerial** per branch / terminal | ☐ Pending |
| 6 | **IP whitelist** — our VPS egress IP(s) | ☐ Pending |
| 7 | Confirm **required customer fields** for pharmacy retail (walk-in defaults acceptable?) | ☐ Pending |
| 8 | Confirm **ItemCode** rules for medicines (GS1, EGS, internal barcode fallback) | ☐ Pending |
| 9 | Confirm **VAT / TaxType** for zero-rated drugs (`T1` @ 0% vs `VAT` @ 14%) | ☐ Pending |
| 10 | **Partial return** — prefer `IsPartialRefund` or explicit RR per line? | ☐ Pending |
| 11 | **Late submission window** — cutoff time / backdating rules | ☐ Pending |
| 12 | Sample **AcceptedDocument** response with production-like `QrUrl` format | ☐ Pending |

---

## 7. POS-side implementation status

| Component | Status | Location |
|-----------|--------|----------|
| Database tables (`eta_credentials`, `eta_branch_devices`, `eta_submissions`, …) | ✅ Done (Phase 0) | `backend/init_db.py` |
| HMAC signing + HTTP client | ✅ Done (Phase 1) | `backend/eta/signing.py`, `client.py` |
| Invoice → Document mapper | ✅ Done (Phase 1) | `backend/eta/mapper.py` |
| Settings API + admin UI | ✅ Done (Phase 1) | `backend/eta/router.py`, `frontend/.../EtaSettings.tsx` |
| Readiness checker | ✅ Done (Phase 1) | `backend/eta/readiness.py` |
| Test connection endpoint | ✅ Done (Phase 1) | `POST /api/eta/test-connection` |
| Payload preview | ✅ Done (Phase 1) | `GET /api/eta/preview/{invoice_id}` |
| Manual sandbox submit | ✅ Done (Phase 1) | `POST /api/eta/submit-preview/{invoice_id}` |
| Product `eta_item_code`, `vat_rate`, `eta_egs_code` columns | ✅ Schema ready | `backend/init_db.py` |
| Async enqueue after sale/return | 🔜 Phase 2 | `backend/eta/hooks.py` (stub) |
| Submission worker / cron | 🔜 Phase 2 | |
| QR on printed receipt + Sales status UI | 🔜 Phase 3 | |
| Bulk product ItemCode import UI | 🔜 Phase 4 | |

---

## 8. Internal API (for your review during certification)

When the `eta` feature is enabled for a pilot tenant, admins can use:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/eta/status` | Feature + readiness summary |
| `GET` | `/api/eta/readiness` | Blockers / warnings checklist |
| `GET` | `/api/eta/settings` | Credentials (masked) + devices |
| `PUT` | `/api/eta/settings` | Save credentials / walk-in defaults |
| `PUT` | `/api/eta/devices/{branch_id}` | Map BranchCode + PosSerial |
| `POST` | `/api/eta/test-connection` | HMAC auth smoke test |
| `GET` | `/api/eta/preview/{invoice_id}` | JSON payload without submit |
| `POST` | `/api/eta/submit-preview/{invoice_id}` | Submit one invoice to sandbox |

---

## 9. Sample payload shape (single SR)

We generate payloads matching your Postman collection (`AcceptedDocument`):

```json
{
  "Documents": [
    {
      "InternalId": "INV-20260625-0001",
      "UniqueId": "1-R-42-INV-20260625-0001",
      "ReferenceUUID": null,
      "Date": "2026-06-25",
      "Time": "14:30:00",
      "CustomerName": "Walk-in Customer",
      "CustomerCode": "WALKIN",
      "CustomerTaxId": "",
      "CustomerPhone": "",
      "CustomerCountryCode": "EG",
      "CustomerGovernate": "Cairo",
      "CustomerCity": "Cairo",
      "CustomerStreet": "N/A",
      "CustomerBuilding": "1",
      "CustomerType": 0,
      "TotalSales": 114.00,
      "NetAmount": 100.00,
      "TotalDiscount": 0.00,
      "ExtraDiscount": 0.00,
      "DocumentType": 3,
      "PaymentType": 0,
      "DocOrderType": 0,
      "BranchCode": "1",
      "PosSerial": "POS-001",
      "IsPartialRefund": false,
      "DocumentDetails": [
        {
          "ProductDescription": "Paracetamol 500mg",
          "Quantity": 2,
          "UnitPrice": 50.00,
          "UnitType": "EA",
          "DiscountAmount": 0.00,
          "NetTotal": 100.00,
          "Total": 114.00,
          "Currency": "EGP",
          "CurrencyRate": 1.0,
          "VAT": 14.00,
          "ServiceCharge": 0.0,
          "WTH": 0.0,
          "InternalCode": "1234",
          "ItemCode": "10007595",
          "DocumentDetailTaxs": [{ "TaxType": "VAT", "Rate": 0.14 }]
        }
      ]
    }
  ]
}
```

---

## 10. Error handling

We parse structured errors per your catalog:

| Code prefix | Our action |
|-------------|------------|
| `VAL_*` | Show to pharmacy admin; fix data (product code, branch, date) |
| `ERR_AUTH_*`, `ERR_HMAC_*` | Alert admin; check credentials |
| `ERR_IP_DENY` | Request IP whitelist update |
| `VAL_DUP_DOC` | Treat as success if prior submission exists (idempotent) |
| `VAL_MISS_REF` | Block return until original SR UUID stored |

Stored in `eta_submissions.error_message` and `eta_submission_attempts.response_body`.

---

## 11. Suggested certification plan

1. You provide sandbox **AuthKey**, **SecretKey**, **BranchCode**, **PosSerial**, and whitelist our server IP.
2. We configure Settings → ETA E-Receipt on a pilot tenant.
3. We run `POST /api/eta/test-connection` — expect auth OK (not `ERR_IP_DENY`).
4. We run `GET /api/eta/preview/{invoice_id}` — you review JSON.
5. We execute your Postman scenarios via `submit-preview` and real mapped invoices:
   - `AcceptedDocument`
   - `AcceptedDocument-FullRefund`
   - `AcceptedDocument-PartialRefund`
   - Rejected cases (negative amounts, missing ref, duplicate)
6. We verify `Uuid` + `QrUrl` stored and printable on receipt (Phase 3).
7. Enable async worker (Phase 2) for 7-day pilot monitoring.
8. Production cutover with production credentials.

---

## 12. Contact & repository

- **Integration branch:** `eta-integration`
- **Process doc:** `docs/ETA_IMPLEMENTATION_PROCESS.md`
- **Phase reports:** `docs/eta-reports/`

Please reply with sandbox credentials, registered branch/POS codes, and whitelisted IP confirmation so we can complete Step 1 of the certification plan.

---

*Fratelanza POS — ETA integration prepared for EtaMiddleware API v2.*
