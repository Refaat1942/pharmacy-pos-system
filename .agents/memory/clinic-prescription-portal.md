---
name: Clinic prescription portal (planned feature, not yet built)
description: Agreed design for the clinic→POS prescription feature; build deferred until the user explicitly asks.
---

# Clinic prescription portal — agreed spec (build deferred)

Client signs contracts with clinics. Each clinic gets a private link to write a
prescription and send it to the pharmacy POS, which shows a notification
counter + sound; opening a prescription loads its lines into the POS cart.

**Status:** User approved the approach but said do NOT build yet — wait for an
explicit "build now" instruction.

## Decisions confirmed by the user
- **Medicine entry:** clinic types medicine names **freely as text**; the
  pharmacist **matches them to products at the counter** (NOT picking from the
  product catalog). So prescription lines are free-text, not product_id refs.
- **Each line includes dosage/instructions:** name + qty + **dose/directions**
  free-text (e.g. "1 tablet 3x daily after meals for 7 days"). Clinic "writes
  the doses and everything."
- **Prescription header:** patient details (name, optional age/phone) + doctor
  name + general notes. All shown to the cashier in the POS.
- **Branch:** the clinic **chooses which branch/location** to send to each time
  (prescription is not tied to a single fixed branch per clinic).

## Link issuance & validity (confirmed)
- Admin creates each clinic in a "Clinics" admin page; system generates a unique
  private link per clinic for the admin to share.
- Link is **valid indefinitely** until the admin acts: **deactivate clinic**
  (link stops working) or **regenerate link** (new token, old one dies).
- Optional auto-expiry by date: raised with user, awaiting decision.

## Architecture notes (from codebase exploration)
- Multi-tenant: tenant resolved from JWT via `tenant_middleware`; schema set via
  `SET search_path` (`backend/db.py`, `backend/tenant_ctx.py`). Public clinic
  routes have no JWT — put the **tenant slug in the URL** (e.g.
  `/rx/{slug}/{token}`) and set search_path manually; exclude from middleware.
- Schema changes must be `CREATE TABLE/ALTER ... IF NOT EXISTS`, applied via
  `platform_db.apply_schema_to_all_tenants()` (user pref: safe-batch).
- New tenant tables to add: `clinics` (name, unique `portal_token`, active) and
  `prescriptions` (clinic_id, branch_id, patient_name, notes, status
  pending/loaded/dismissed, created_at) + `prescription_items` (free-text
  name, quantity, note).
- POS (`frontend/src/pages/POS.tsx`) builds cart locally; add a polled
  (~15-20s) `GET pending prescriptions` → bell badge + sound on increase →
  panel → load lines (as free-text rows the cashier then matches to products).
- Admin needs a Clinics management page to create clinics + copy their link.
- i18n EN/AR for all new UI.
