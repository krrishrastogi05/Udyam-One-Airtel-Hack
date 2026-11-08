# Data privacy & security note — Udyam One

**Law & principles.** Designed around the Digital Personal Data Protection Act, 2023: notice and consent,
purpose limitation, data minimisation, storage limitation, and the user's rights.

**Consent first.** No document can be uploaded (web or WhatsApp) until the customer accepts a plain-language
notice covering purpose, the exact documents, retention and rights. The API rejects uploads without consent (HTTP 403).
The time and channel of consent are recorded on the journey.

**Purpose limitation.** Documents are used only to verify that the business is registered and active, and to
activate services. They are not used for marketing or model training. The LLM sees conversation text only, never
document images or identifiers beyond what the customer typed.

**Minimisation.** Four documents, Udyam optional. Only the fields needed for the checks are extracted.
The profile stores business facts, not personal IDs.

**Voice notes.** Voice typing uses the browser's built-in speech service (Google in Chrome, Microsoft in Edge),
which receives the audio to transcribe it. This is disclosed on `/privacy`; typing works for every step.
Production plan: send audio to our own contracted speech/LLM provider under a DPA, or transcribe on-device.

**AI redaction.** Before any text reaches Gemini, phone numbers, emails, GSTINs, Udyam numbers, PAN and
Aadhaar-like numbers are replaced with placeholders. GSTIN lookups happen on our own server.

**Right to erasure.** "Delete my documents & ID numbers" in the Verify step, or `DELETE` on WhatsApp, wipes images,
extracted fields and identifiers immediately; the plan is kept so the customer doesn't start over.

**Masking.** GSTIN, Udyam number, ID number and consumer number are masked on every screen and message
(e.g. `07CP••••••••1ZT`).

**Retention.** Production design: documents deleted 30 days after activation, extracted fields after the
regulatory retention period. In this prototype, images live only in server memory and vanish on restart.

**Partner sharing.** A partner sees a journey only when the customer asks for help or KYC is blocked. They see a
short summary, the quote and a score, not the documents. Attribution is kept so partners are paid.

**AI safety.** The model only proposes facts. Prices, eligibility and verification results come from deterministic
code. Model output is validated (types, ranges, allowed values) before use. Customer text is treated as data.
If the model fails, the offline engine takes over.

**Security (production next steps).** OTP login per journey, signed short-lived journey links, encryption at rest
(KMS), audit log of every document access, rate limits, and WhatsApp Business API webhooks with signature verification.
