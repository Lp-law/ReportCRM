# DRY RUN 4 – Technical Context & Mapping

**תיעוד מיפוי טכני בלבד — ללא תיקונים, פתרונות או המלצות.**

---

## Executive Summary

| אזור | מה בשל | מה שבור / לא ברור |
|------|--------|---------------------|
| **PDF** | Flow מלא (Preview + Download), endpoints מוגדרים, Puppeteer + buildReportHtml | "Failed to generate PDF" — סיבות רבות: Chrome חסר, timeout, buildReportHtml error, policy appendix, invoices appendix |
| **Toolbar** | כל הכפתורים ממופים, handlers ברורים | "Edit file name titles" — disabled כשדו"ח מס׳ 1 או אין כותרות; Smart Assistant — תלוי API |
| **Smart Assistant** | Panel, intents, API endpoint, context flow | שגיאה "העוזר החכם אינו זמין כרגע" — כש־API נכשל או מחזיר תשובה לא תקינה |
| **Grammarly** | textarea רגיל בתוך GrammarlyEditorPlugin; Email Body, Note, Reminder | "Review Suggestions" לא מוחלות — ייתכן readonly/controlled component או התנהגות של Grammarly עם value/onChange |
| **Dashboard (Admin/Lior)** | מבנה מוגדר, כרטיסיות עורכות דין, Seed, Logout | Logout — חסום עד הורדת גיבוי כשיש reports |

---

## 1. PDF – Preview / Download

### 1.1 Flow מלא

| שלב | רכיב | פעולה |
|-----|------|--------|
| **Preview** | `DocumentPreview` | `useEffect` → `POST /api/render-report-html` עם `{ report }` |
| | Server | `buildReportHtml(report)` → מחזיר HTML |
| | Client | `setHtml(text)` → `iframe srcDoc={html}` |
| **Download** | Client | `handleDownloadPdf` → `performDownloadPdf` → `fetchReportPdf(currentReport)` |
| | `geminiService.ts` | `fetchReportPdf(report)` → `POST /api/render-report-pdf` עם `{ report }` |
| | Server | `buildFinalReportPdfWithPolicy(report)` → `renderReportPdf(report)` + appendices |
| | Client | `response.blob()` → `URL.createObjectURL` → `link.click()` |

### 1.2 תנאים להצלחה

- **HTML:** `buildReportHtml` משתמש ב־`getReportTemplate()`, `COVER_LOGO_BASE64`, `SIGNATURE_BASE64`, `TIMELINE_IMAGE_BASE64`, `report.content`, `report.translatedContent`, `report.invoiceFiles`, `report.policyFile`, וכו'.
- **Snapshot:** אין snapshot נפרד — ה־report נשלח כפי שהוא מהלקוח (state נוכחי).
- **Assets:** לוגו, חתימה, תמונות טיימליין — מוטמעות כ־base64 ב־server. אין טעינת assets חיצונית ל־PDF.
- **Env vars (server):** אין env מיוחד ל־PDF. Puppeteer דורש Chrome מותקן (ב־Render: `npx puppeteer browsers install chrome` ב־Build Command).
- **Render (reportcrm.onrender.com):** אותו flow — ה־API רץ על השרת; אם Chrome לא מותקן → "Failed to generate PDF".

### 1.3 "Failed to generate PDF" — מתי מוחזר

- **Endpoint:** `POST /api/render-report-pdf`
- **Handler:** `try { ... buildFinalReportPdfWithPolicy(report) ... } catch (error) { res.status(500).json({ error: 'Failed to generate PDF' }); }`
- **כל exception** בתוך `buildFinalReportPdfWithPolicy` או `renderReportPdf` מחזיר את ההודעה הזו.

### 1.4 סיבות כישלון אפשריות

| סוג | מיקום | הערה |
|-----|-------|------|
| **Payload חסר** | `if (!report \|\| typeof report !== 'object')` | 400 — "Missing report payload" |
| **Policy** | `attachPolicyAsAppendix === true` אבל `!policy.data` | 400 — "צירפת פוליסה אך הקובץ לא נקלט" |
| **Puppeteer** | `puppeteer.launch({ headless: 'new' })` | Chrome לא מותקן / timeout / crash |
| **HTML** | `buildReportHtml(safeReportForHtml)` | Exception בתוך ה־template |
| **Invoice appendix** | Hard guard: `hasAppendixInvoices \|\| hasObjectTag \|\| hasDataPdf` | throw — invoices חייבות להיות כ־PDF appendix, לא HTML |
| **Policy appendix** | `getPolicyPdfBufferFromReport`, `buildPolicyAppendixIntroPdf` | try/catch — ממשיך בלי policy |
| **Invoices appendix** | `buildInvoicesAppendixPdf` | try/catch — ממשיך בלי invoices |

### 1.5 הבדל לפי תפקיד (Lawyer / Admin / Finance)

- **אין הבדל בשרת.** ה־endpoints `/api/render-report-html` ו־`/api/render-report-pdf` **לא דורשים authentication** (לפי ההערות בקוד — כדי שלא יישבר אחרי restart).
- **ב־client:** כל תפקיד שעובד עם דו"ח ו־view === 'PREVIEW' רואה את אותם כפתורי Download / Preview.
- **Labels:** `getPreviewLabelsForRole(role)` — LAWYER מקבל טקסטים בעברית, אחרת באנגלית.

---

## 2. Toolbar / Action Buttons

### 2.1 מיקום

- **View:** `view === 'PREVIEW'` (שלב 3)
- **קובץ:** `App.tsx` בערך שורות 10660–10840

### 2.2 מיפוי כפתורים

| כפתור | מי רואה | לחיץ? | Handler | Feature |
|-------|---------|--------|---------|---------|
| **העוזר החכם** | כולם | כן | `onClick={() => setIsAssistantOpen(true)}` | גמור |
| **Hide Preview / הצג תצוגה** | כולם | כן | `onClick={() => setIsPreviewVisible(prev => !prev)}` | גמור |
| **Download PDF** | כולם | כן (אלא אם `isPdfGenerating`) | `onClick={handleDownloadPdf}` → `performDownloadPdf` | גמור |
| **Edit file name titles** | כולם | רק כש־`canEditFileNameTitles` | `onClick={() => setIsFileNameModalOpen(true)}` + `disabled={!canEditFileNameTitles}` | גמור — תנאי |
| **JSON Export** | כולם | כן | `onClick` — יוצר blob מ־`currentReport` ו־download | גמור |
| **CSV Export** | כולם | כן | `onClick` — בונה CSV מ־`currentReport` ו־download | גמור |
| **Finalize & Close** | כולם | כן | `onClick={handleFinalizeClick}` — Admin → Email modal, אחרת → `finalizeReport()` | גמור |

### 2.3 "Edit file name titles" — למה לא לחיץ

- **תנאי:** `canEditFileNameTitles = currentReportNumber !== 1 && availableFileNameTitleOptions.length > 0`
- **`currentReportNumber`:** `report.reportNumber` אם קיים וחיובי, אחרת `(reportHistory?.length || 0) + 1`
- **`availableFileNameTitleOptions`:** נגזר מ־`mapSectionsToFileNameTitles(currentReport.selectedSections || [])` — מסנן options ריקים.
- **כתוצאה:** הכפתור disabled כש:
  1. זה דו"ח מס׳ 1 (לא ניתן לערוך כותרות)
  2. אין `selectedSections` או שאין labels מתאימים

### 2.4 הבדל לפי תפקיד

- ** visibility:** כל הכפתורים נראים לכל התפקידים ב־Preview.
- **התנהגות:** Admin ב־`handleFinalizeClick` → Email modal; Lawyer/אחרים → `finalizeReport()` ישירות.

---

## 3. Smart Assistant

### 3.1 מה אמור לקרות בלחיצה

1. **פתיחת Panel:** `setIsAssistantOpen(true)` → `AssistantPanel` נפתח.
2. **פעולות מהירות:** לחיצה על quick action → `onRunIntent(intent)` → `handleRunAssistantIntent(intent)`.

### 3.2 Handler

- **קובץ:** `App.tsx`, `handleRunAssistantIntent` (בערך שורה 7224).
- **תנאי מוקדם:** `currentUser` ו־`currentReport` — אם חסר דו"ח, מחזיר הודעת placeholder ("אין דו״ח פעיל כרגע") בלי קריאת API.
- **Context:** `step`, `role`, `screen`, `section` — נגזר מ־`view`, `currentUser.role`, `activeSectionKey`.
- **API:** `requestAssistantHelp({ intent, context, reportMeta })` → `POST /api/assistant/help`.

### 3.3 Server

- **קובץ:** `server.js` שורה 3779.
- **Auth:** `ensureAuthenticated(req, res)` — חייב משתמש מחובר.
- **Validation:** `intent` חייב להיות ב־`allowedIntents`.
- **AI:** `createTextCompletion` → OpenAI (לא Gemini) — דורש `OPENAI_API_KEY` / `API_KEY`.

### 3.4 שגיאה "העוזר החכם אינו זמין כרגע"

- **Client:** `AssistantPanel` מציג את ההודעה כש־`error` מוגדר (שורה 169–175).
- **מתי `error` מוגדר:** `handleRunAssistantIntent` → `catch` → `setAssistantError('REQUEST_FAILED')`.
- **גם:** `requestAssistantHelp` מחזיר `{ title, bullets }` — אם `response.ok === false` או parsing נכשל, `title` עשוי להיות "העוזר החכם אינו זמין כרגע" (fallback ב־geminiService).
- **סיבות אפשריות:**
  - אין `OPENAI_API_KEY` → `ensureOpenAI()` זורק → 500.
  - Rate limit / timeout של OpenAI.
  - JSON parsing נכשל ב־server → תשובה לא תקינה.

### 3.5 הבדל לפי תפקיד

- **Context.role:** `mapUserRoleToAssistantRole(role)` — ADMIN, LAWYER, FINANCE, SUB_ADMIN→OPS.
- **אין הבדל ב־visibility** — העוזר זמין לכל מי שיש לו דו"ח פעיל.
- **Quick actions:** זהות לפי step (1/2/3), לא לפי role.

---

## 4. Grammarly Integration

### 4.1 איפה מוצג הטקסט האנגלי

| רכיב | סוג | מיקום |
|------|-----|-------|
| **Step 2 – English Output** | `<textarea>` בתוך `GrammarlyEditorPlugin` | `AutoResizeTextarea` — `value={data.translatedContent?.[sec]}`, `onChange` |
| **Email Body** | `<textarea>` בתוך `GrammarlyEditorPlugin` | `EmailTemplateModal.tsx` — `value={emailBody}`, `onChange` |
| **Note modal** | `<textarea>` בתוך `GrammarlyEditorPlugin` | `App.tsx` — `value={noteMessage}`, `onChange` |
| **Reminder modal** | `<textarea>` בתוך `GrammarlyEditorPlugin` | `App.tsx` — `value={reminderMessage}`, `onChange` |
| **Finance Instructions** | `<textarea>` בתוך `GrammarlyEditorPlugin` | `App.tsx` — `value={instructions}`, `onChange` |

### 4.2 מנגנונים רלוונטיים

| מנגנון | מיקום | השפעה |
|--------|-------|--------|
| **readonly** | `AutoResizeTextarea`: `readOnly={readOnly}` → `onChange={readOnly ? undefined : onChange}`, `disabled={disabled \|\| readOnly}` | כש־readOnly — Grammarly לא יכול להחיל שינויים |
| **readOnly** | נגזר מ־`lockState.isLocked`, `isCaseClosed`, `isLawyerSent` | דו"ח נעול → readonly |
| **controlled** | `value` + `onChange` — React שולט בתוכן | Grammarly מעדכן את ה־DOM; אם React overwrite מהיר — ייתכן אובדן |
| **debounce** | לא נמצא debounce ייעודי על ה־textarea | אין |
| **sanitize** | לא נמצא | אין |
| **intercept** | אין intercept של input events | אין |

### 4.3 "Review Suggestions" לא מוחלות

- **עובדה:** Grammarly מצליח בחלק מההצעות אך לא ב־"Review Suggestions".
- **אפשרויות טכניות:**
  1. **readonly:** כש־`readOnly=true` (דו"ח נעול) — Grammarly לא יכול לכתוב.
  2. **controlled component:** עדכון DOM על ידי Grammarly מתנגש עם React — `value` נשאר מה־state הישן.
  3. **סוגי הצעות:** "Review Suggestions" עשויות לדרוש החלפת טקסט מורכב יותר (למשל פסקאות) — אולי מגבלה של ה־SDK עם controlled input.
  4. **iframe / contentEditable:** האפליקציה משתמשת ב־`<textarea>` רגיל, לא contentEditable. Grammarly Editor SDK תומך ב־textarea — אין סיבה ברורה מאליה לכישלון.

---

## 5. Dashboard – Lior (Admin/Lawyer)

### 5.1 מבנה

| רכיב | מקור | תפקיד | Admin-only? |
|------|------|--------|-------------|
| **תיקים לפי מספר עודכנית** | `LawyerDashboard` — `caseListTitle` (i18n); `AdminDashboard` — כותרת ברורה | רשימת תיקים לפי מספר עודכנית | Lawyer: כן (ב־LawyerDashboard); Admin: כן (ב־AdminDashboard, per lawyer) |
| **Seed Existing Cases** | `SeedExistingCasesPanel` — נטען ב־AdminDashboard | ייבוא תיקים קיימים מ־CSV/OCR | כן — רק כש־`SEED_TOOL_ENABLED` ובתוך Admin |
| **כרטיסיות עורכות הדין** | `AdminDashboard` — `lawyerCardsStats` מ־`LAWYER_CARDS` | סיכום לפי עורכת דין (open, ready, feedback, resend) | כן |
| **פתיחת דיווח חדש** | `AdminDashboard` — `onNewReport`; `LawyerDashboard` — `showNewCaseModal` | Admin: `onNewReport`; Lawyer: מודאל "תיק לפי מספר עודכנית" | שניהם — שונים לפי תפקיד |
| **Logout** | `handleLogoutClick` ב־App; כפתור ב־AdminDashboard ו־LawyerDashboard | התנתקות | כולם |

### 5.2 State / Selectors

- **תיקים לפי מספר עודכנית:** `caseFolders`, `reports` — ממוינים/מסוננים לפי `odakanitNo`, `selectedLawyer` (Admin).
- **Seed:** `SeedExistingCasesPanel` — state מקומי + `caseFolders`, `onUpdateCaseFolders`.
- **כרטיסיות:** `reportsByLawyer`, `insurerFeedbackQueue`, `resendQueue` — נגזרים מ־`reports`, `canTranslate`.

### 5.3 חפיפה לוגית

- **Admin vs Lawyer dashboard:** Admin רואה `AdminDashboard` (כולל כרטיסיות עורכות דין, Seed, Financial Control). Lawyer רואה `LawyerDashboard` (תיקים לפי עודכנית, דוחות כספיים מאיריס).
- **פתיחת דיווח חדש:** Admin → `onNewReport` (דו"ח חדש "ריק"); Lawyer → מודאל הזנת מספר תיק — אם קיים → תיקייה, אחרת → תיק חדש.

### 5.4 Logout — flow מלא

| שלב | מיקום | פעולה |
|-----|-------|--------|
| 1 | כפתור Logout | `onClick={onLogout}` → `handleLogoutClick` |
| 2 | `handleLogoutClick` | `hasData = reports.length > 0 \|\| currentReport` |
| 3 | אם `hasData` | `setShowLogoutBackupModal(true)`, `setLogoutBackupDone(false)` |
| 4 | מודאל גיבוי | משתמש חייב ללחוץ "הורד גיבוי" → `downloadFullBackup(...)` + `setLogoutBackupDone(true)` |
| 5 | כפתור "התנתק" | `disabled={!logoutBackupDone}` — לחיץ רק אחרי הורדת גיבוי |
| 6 | `handleLogoutConfirm` | `setShowLogoutBackupModal(false)` → `performLogout()` |
| 7 | `performLogout` | `fetch('/api/logout', { method: 'POST', credentials: 'include' })` |
| 8 | Server | `sessions.delete(sessionId)`, `res.cookie(..., expires: 0)` → `res.json({ success: true })` |
| 9 | Client | ניקוי state: `setCurrentUser(null)`, `setView('DASHBOARD')`, וכו' |

### 5.5 למה Logout "לא עובד"

- **הסיבה העיקרית:** כש־`reports.length > 0` או `currentReport` — מודאל גיבוי נפתח. כפתור "התנתק" **disabled** עד שלוחצים "הורד גיבוי".
- **אם לא לוחצים "הורד גיבוי":** אי אפשר להתנתק — זה by design.
- **אם לוחצים ומתנתקים:** ה־API `/api/logout` מבצע התנתקות. אם עדיין "לא עובד" — ייתכן:
  - cookie לא נמחק (domain, path, secure)
  - client לא מקבל 200 / לא מנקה state
  - redirect או טעינה מחדש שמחזירה את המשתמש

---

## סיכום: מוכן לתיקון מיידי vs החלטת מוצר

| נושא | מוכן לתיקון מיידי? | הערה |
|------|---------------------|------|
| **PDF — "Failed to generate PDF"** | חלקי | יש לזהות סיבת כישלון (לוגים, Chrome, policy). התיקון תלוי בסיבה. |
| **Edit file name titles disabled** | כן | תנאי ברור — אם רוצים לאפשר גם בדו"ח 1 — החלטת מוצר. |
| **Smart Assistant — "אינו זמין"** | חלקי | בדיקת OPENAI_API_KEY, לוגים. אם חסר API key — החלטת תשתית. |
| **Grammarly Review Suggestions** | לא | דורש בדיקה ממוקדת (readonly, controlled, סוג הצעות) — והחלטה אם לשנות ארכיטקטורה. |
| **Logout חסום עד גיבוי** | כן | אם רוצים לאפשר התנתקות בלי גיבוי — החלטת מוצר. |
| **Dashboard חפיפה** | לא | מבנה ברור — אין bug ברור, רק הבהרת UX. |

---

*מסמך זה נוצר במסגרת DRY RUN 4 — מיפוי טכני בלבד.*
