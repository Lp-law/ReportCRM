# Email send: PDF attachment and lawyer CC – verification

**Date:** Verification against required behavior (PDF as attachment, lawyer in CC, SANDBOX/PROD identical).

---

## 1. PDF attachment: **YES**

The report PDF is attached to every email (initial send and resend).

### Where the PDF is generated

- **Client:** Before calling the send API, the client requests the PDF from the server and converts it to base64.
- **Initial send:** `src/App.tsx` – `performEmailSend`:
  - `pdfBlob = await fetchReportPdf(reportForSend)` → calls `POST /api/render-report-pdf` and returns a Blob.
  - `attachmentBase64 = await blobToBase64(pdfBlob)`.
  - `attachmentName = buildReportFileName(reportForSend)` (from `src/utils/reportFileName.ts`).
- **Resend:** Same in `performResendEmailSend`: `fetchReportPdf(reportForSend)`, `blobToBase64`, `buildReportFileName`, then passed to `sendEmailViaOutlook`.

### Where it is attached (server)

- **File:** `server.js`
- **Handler:** `POST /api/send-email` (around lines 4127–4147).
- **Code:** Reads `attachmentBase64` and `attachmentName` from `req.body`. Pushes one entry into `attachments[]` with `filename: attachmentName || 'Report.pdf'`, `content: Buffer.from(safeBase64, 'base64')`, `contentType: 'application/pdf'`. Passes `attachments` into `mailOptions` and then `transporter.sendMail(mailOptions)`.

So the PDF is generated at send time (or resend time), sent as base64 in the request body, and attached by Nodemailer in the same handler. No link; it is a real attachment.

---

## 2. Lawyer in CC: **YES**

The lawyer who authored the Hebrew report is always included in CC for both send and resend.

### Where the lawyer email is read from

- **Client (source of the value):** `src/App.tsx`
  - `getLawyerEmail(report)` returns:
    - `report.ownerEmail` if set, else
    - `USERS.find(u => u.id === report.createdBy)?.email`.
  - So the lawyer is the report owner (Hebrew author).
- **Sent in request:** Both `performEmailSend` and `performResendEmailSend` call `sendEmailViaOutlook` with `lawyerEmail: getLawyerEmail(reportForSend)`.
- **Server (use of the value):** `server.js` – `POST /api/send-email`:
  - Reads `lawyerEmail` from `req.body`.
  - Builds `cc = [...base.cc]` (ENV reports), then appends `lawyerEmail` if present and not already in `cc` (case-insensitive).
  - Ignores any client-provided `to`/`cc`. TO = broker from ENV; CC = reports (ENV) + lawyer.

So the lawyer email is derived from report data on the client (owner/author) and sent as `lawyerEmail`; the server uses only that plus ENV to build final TO/CC.

---

## 3. Guaranteed for both send and resend

- **Initial send:** `performEmailSend` – uses `fetchReportPdf(reportForSend)`, `buildReportFileName(reportForSend)`, `getLawyerEmail(reportForSend)` and sends them to the server.
- **Resend:** `performResendEmailSend` – same: `fetchReportPdf(reportForSend)`, `buildReportFileName(reportForSend)`, `getLawyerEmail(reportForSend)`.

Same handler `POST /api/send-email` serves both; it always attaches the PDF when `attachmentBase64` is present and always adds `lawyerEmail` to CC when provided.

---

## 4. SANDBOX vs PROD

- Recipient resolution is identical: `getEmailRecipients()` uses `MAIL_MODE` to choose `MAIL_TO_SANDBOX`/`MAIL_CC_SANDBOX` or `MAIL_TO_PROD`/`MAIL_CC_PROD`. Lawyer is appended to CC in both modes.
- PDF attachment logic is the same; no branch by mode.

---

## 5. Summary

| Requirement                         | Status | Where enforced |
|------------------------------------|--------|----------------|
| PDF as real email attachment       | YES    | `server.js` POST /api/send-email, `attachments[]` |
| Correct filename (buildReportFileName) | YES | Client sets `attachmentName`; server uses it as `filename` |
| TO = broker (ENV)                  | YES    | `getEmailRecipients()`, server only |
| CC = reports (ENV) + lawyer        | YES    | Server: `base.cc` + `lawyerEmail` from body |
| Lawyer = Hebrew report author      | YES    | Client: `getLawyerEmail(report)` (ownerEmail / createdBy) |
| Same for send and resend           | YES    | Same client flow and same server handler |
| Same for SANDBOX and PROD          | YES    | Same code path; only ENV differs |

No code changes were required for correctness; this document only records the verification.
