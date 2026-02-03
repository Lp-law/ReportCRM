# הסבר אולטרה־מפורט: Report CRM (Lior Perry Report Builder)

מסמך זה מיועד ל־ChatGPT (או לכל AI) כדי להבין את התוכנה במובן הרחב — משתמשים, מטרה, ארכיטקטורה, פיצ'רים, זרימה, מבנה קבצים, AI, באגים אפשריים והצעות לשיפור. **אין לבצע שינויים בקוד על סמך מסמך זה — רק הסברים.**

---

## 1. מטרת התוכנה

**Report CRM** (בשם החבילה: `lior-perry-report-builder`) היא אפליקציית ווב לניהול **דיווחים משפטיים** בתחום הביטוח (שוק Lloyd's / לונדון). המטרה: לאפשר לעורכות הדין לכתוב דיווחים בעברית, לליאור (Admin) לבדוק עברית, לתרגם לאנגלית, לשפר אנגלית ולשלוח למבטחת — ולאיריס (Finance) לנהל את החלק הכספי (גיליונות הוצאות, חשבוניות, סטטוס תשלום).

התוכנה **לא** מחליפה את Microsoft Word — היא ממשק לכתיבה, עריכה, תרגום, שיפור ולבסוף ייצוא PDF ושליחת מייל. הנתונים (דיווחים, משתמשים, תבניות) נשמרים כרגע **בצד הלקוח** (localStorage) — אין מסד נתונים מרכזי בשרת.

---

## 2. משתמשים (Users) ותפקידים

המשתמשים מוגדרים ב־`src/constants.ts` ב־`USERS`. יש **ארבעה תפקידים** (`UserRole`):

| תפקיד | משמעות | דוגמאות במערכת |
|--------|--------|-----------------|
| **LAWYER** | עורכת הדין — כותבת את הדיווח, מקבלת משימות מלידור/איריס | Hava, May, Vlada, Orly |
| **ADMIN** | ליאור — בודק עברית, מאשר לתרגום, מתרגם, משפר אנגלית, שולח למבטחת, מנהל תבניות ו־Best Practices | Lior Perry |
| **SUB_ADMIN** | לידור — גישה ללוח משימות ולפיננסים; לא לעריכת גוף הדיווח (Feature flag: `SUB_ADMIN_CAN_EDIT_REPORT_BODY = false`) | Lidor Kabilo |
| **FINANCE** | איריס — מנהלת גיליונות הוצאות (Financial Expense Sheets), מסמנת "נשלח לעו״ד", "שולם" וכו' | Iris Alfman |

האימות: **cookie-based session** אחרי `POST /api/login` (התאמת username/password ל־USERS). אין הרשאות דינמיות — התפקיד קבוע לכל משתמש.

---

## 3. תפקיד עורכות הדין והמסכים שלהן

- **דשבורד:** `LawyerDashboard` — מוצג כאשר `user.role === 'LAWYER'`. מציג:
  - **דיווחים שטרם יצאו** — דיווחים ב־`READY_TO_SEND` (הועברו לליאור, ממתינים לשליחה).
  - **דיווחים כספיים שצריך להכין** — משימות ב־`TASK_ASSIGNED` או `WAITING_FOR_INVOICES` (איריס/לידור ביקשו הכנת דוח כספי).
  - **דו״חות המשך נדרשים** — דיווחים שכבר `SENT`, עם אפשרות לפתוח דו״ח המשך.
  - **דיווחים שנשלחו** — היסטוריה.
- **מסך עריכה (STEP1 / STEP2):** עורכת הדין כותבת את גוף הדיווח **בעברית** — סעיפים (Update, Risk Assessment, Expert opinions, Expenses וכו'). יש:
  - בחירת סעיפים, תבניות סעיף (Section Templates), Best Practices, Snippets.
  - Grammarly (אופציונלי) לעריכה.
  - **פאנל סקירה (ReportReviewPanel):** הודעות מליאור ("הדיווח נשלח לליאור לבדיקה", "ליאור ביקש תיקונים בעברית") וכפתור **"שלח לליאור לבדיקה"** — שינוי סטטוס ל־SUBMITTED ו־HEBREW_SUBMITTED.
- **מסך תצוגה מקדימה (PREVIEW):** צפייה ב־PDF לפני שליחה (כשהליאור כבר סימן READY_TO_SEND). תוויות בעברית (תצוגה מקדימה, הורדת PDF, סיום ושליחה).
- **הודעות:** עורכת הדין רואה רק דיווחים ש־`createdBy === user.id`; היא מקבלת התראות על משימות כספיות וכו'.

**זרימה מצד עורכת הדין:** יצירת/פתיחת דיווח → מילוי עברית → (אופציונלי) בדיקות עברית (Tone & Risk, Hebrew Style) → "שלח לליאור לבדיקה" → ממתינה לליאור. אחרי שליאור מאשר ועובר לשלב שליחה — הדיווח עובר ל־READY_TO_SEND; עורכת הדין יכולה לראות תצוגה מקדימה ו־PDF, אבל השליחה בפועל נעשתה על ידי ליאור.

---

## 4. תפקיד ליאור (ADMIN) והמסכים שלו

- **דשבורד:** `AdminDashboard` — מוצג כאשר `user.role === 'ADMIN'`. כולל:
  - **סיכום:** מספר דיווחים פעילים, Ready to Send, משוב ממבטחת, זמינים לשליחה מחדש.
  - **כרטיסי עורכות דין** — לכל עורכת דין: דיווחים פתוחים, Ready to Send, משוב ממבטחת, זמינים ל־resend.
  - **תורים (Queues):** Hebrew Review, Insurer Feedback, Resend Eligible, Missing Policy Appendix (מתוך `src/features/admin/adminQueues.ts`).
  - **טבלת דיווחים** — סינון לפי תיק, סטטוס, עורכת דין; ארכיון / סל מחזור (recycle) אחרי שליחה.
- **מסך עריכה של דיווח:** ליאור רואה את אותו דיווח כמו עורכת הדין, אבל עם פיצ'רים נוספים:
  - **פאנל סקירה (ReportReviewPanel):** כפתורים "אישור עברית לתרגום", "בקש תיקונים", "הוסף משוב מחברת הביטוח", "פתח מחדש עברית (משוב מבטחת)". הערות פנימיות (ליאור) וחיצוניות (מבטחת) עם סטטוס טופל/לא טופל.
  - **תרגום:** כפתור "תרגם לאנגלית" (פעיל רק אחרי "אישור עברית") — קורא ל־`/api/translate` לכל סעיף (או לטקסט מאוחד).
  - **שיפור אנגלית:** כפתור "שפר אנגלית" לסעיף — קורא ל־`/api/improve-english` עם `protectFacts` / `restoreFacts` / `applyEnglishGlossary` בצד הלקוח.
  - **ניהול תבניות:** Section Templates, Best Practices, סדר, מחיקה — נשמר ב־`data/sectionTemplates.json` ו־`data/bestPractices.json` דרך השרת.
- **שליחה:** ליאור מסמן דיווח כ־READY_TO_SEND ולבסוף שולח (PDF במייל) — אז הסטטוס עובר ל־SENT.

**זרימה מצד ליאור:** דיווחים ב־SUBMITTED → בדיקת עברית, הערות אם צריך → "אישור עברית לתרגום" → תרגום → שיפור אנגלית → תצוגה מקדימה → שליחה. אם יש משוב ממבטחת — טיפול בהערות, אופציונלי "פתח מחדש עברית" אם נדרש שינוי בעברית.

---

## 5. תפקיד איריס (FINANCE) והמסכים שלה

- **דשבורד:** `FinanceExpensesDashboard` — מוצג **רק** כאשר `user.role === 'FINANCE'`. מתמקד ב־**גיליונות הוצאות (Financial Expense Sheets)**:
  - רשימת גיליונות עם סטטוס: DRAFT, READY_FOR_REPORT (נשלח לעו״ד), ATTACHED_TO_REPORT (שובץ בדיווח), ARCHIVED.
  - סינון לפי סטטוס ומבטחת.
  - פתיחת גיליון → `FinanceExpenseSheetEditor` — עריכת שורות הוצאות, חשבוניות, הערות.
  - כפתורים: "שלח לעו״ד" (מעבר ל־READY_FOR_REPORT ומשימת דיווח לעורכת הדין), "סמן כשולם" וכו'.
- **אין** לאיריס גישה לעריכת גוף הדיווח (טקסט עברית/אנגלית) — רק לגיליונות כספיים ולדיווחים שמשויכים אליהם (expensesSheetId).
- **זרימה:** איריס יוצרת/מעדכנת גיליון הוצאות → שולחת לעו״ד → עורכת הדין מקבלת משימה (TASK_ASSIGNED / WAITING_FOR_INVOICES) ומכינה דיווח עם סעיף Expenses → אחרי שהדיווח מוכן ועובר לליאור ואיריס מסמנת Finalize — העורכת דין רואה את המשימה כ־"מוכנה".

---

## 6. זרימת הדיווח (Report Status ו־Hebrew Workflow)

**סטטוסי דיווח (`ReportStatus`):**

- `TASK_ASSIGNED` — משימה הוקצתה (למשל דוח כספי).
- `DRAFT` — עורכת הדין עובדת על הדיווח.
- `WAITING_FOR_INVOICES` — ממתין לחשבוניות (איריס/לידור).
- `PENDING_REVIEW` — נשלח לליאור, לפני אישור.
- `APPROVED` — ליאור אישר (לא תמיד בשימוש מפורש; לעתים עוברים ישר ל־READY_TO_SEND).
- `READY_TO_SEND` — ליאור סיים תרגום/שיפור, מוכן לשליחה.
- `SENT` — נשלח למבטחת.

**זרימת עברית (Hebrew Workflow):**

- `HEBREW_DRAFT` — עורכת הדין כותבת.
- `HEBREW_SUBMITTED` — "שלח לליאור לבדיקה".
- `HEBREW_CHANGES_REQUESTED` — ליאור ביקש תיקונים.
- `HEBREW_APPROVED` — ליאור לחץ "אישור עברית לתרגום".
- `HEBREW_REOPENED_EXTERNAL` — נפתח מחדש בגלל משוב ממבטחת שדורש שינוי בעברית.

**סדר טיפוסי:**  
עורכת דין: DRAFT → שלח לליאור → SUBMITTED / HEBREW_SUBMITTED. ליאור: בדיקה → "אישור עברית" → תרגום → שיפור אנגלית → READY_TO_SEND → שליחה → SENT. אם איריס מעורבת: TASK_ASSIGNED / WAITING_FOR_INVOICES לפני או במקביל, עד ש־Finance מסמנת Finalize והמשימה מופיעה אצל עורכת הדין.

---

## 7. ארכיטקטורה ומבנה תיקיות/קבצים

**טכנולוגיות:**  
- **Frontend:** React 18, TypeScript, Vite, TailwindCSS, Lucide React, Grammarly Editor SDK.  
- **Backend:** Node.js, Express, ES Modules.  
- **AI:** OpenAI (גם אם השם בחבילה "Gemini") — `openai` package, `createTextCompletion` ב־server.js.

**שורש הפרויקט:**

- `server.js` — שרת Express: אימות, API ל־AI, תבניות, Best Practices, PDF, מייל, הגשת `dist/`.
- `index.html`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `package.json`.
- `data/` — `sectionTemplates.json`, `bestPractices.json` (נטענים ונשמרים על ידי השרת).
- `templates/` — תבניות Handlebars ל־PDF (report-modern.html).
- `knowledge/` — קבצי RAG ל־Dental (למשל DentalLexicon, DentalPlaybook).
- `Visual Timeline Selection/` — תמונות לשלבי Timeline.
- `Report CRMassetsbranding/` — לוגו, חתימה (assets ל־PDF).
- `docs/` — תיעוד (report-locking.md, OVERVIEW_FOR_CHATGPT.md).
- `tests/` — Vitest.
- `dist/` — אפליקציית React מקומפלת (אחרי `vite build`).

**תיקיית `src/`:**

- `App.tsx` — רכיב ראשי: ניהול משתמש, view (DASHBOARD / STEP1 / STEP2 / PREVIEW / CASE_FOLDER), רשימת דיווחים (state), לוגיקת שמירה ל־localStorage, כל הזרימה של עריכה/תרגום/שיפור/פאנל סקירה.
- `index.tsx`, `index.css` — כניסה וסגנונות גלובליים.
- `types.ts` — כל הטיפוסים: User, ReportData, ReportStatus, ReportReview, HebrewWorkflowStatus, ExpenseItem, וכו'.
- `constants.ts` — USERS, RECIPIENTS, AVAILABLE_SECTIONS, INSURER_OPTIONS, PROCEDURAL_STAGES, TIMELINE_TEMPLATES, FILENAME_TAGS.
- **`components/`**  
  - `dashboard/` — LawyerDashboard, AdminDashboard (הרכיב הגדול שמכיל את לוח הליאור/לידור), ActionList, CaseCard, SearchAndFilters, StatusPill, EmptyState, DashboardStats, FinanceReportBadge, workRules, i18n.  
  - `finance/` — FinanceExpensesDashboard, FinanceExpenseSheetEditor.  
  - `cases/` — CaseFolderView.  
  - ReportReviewPanel, DocumentPreview, EmailTemplateModal, FileNameTitleSelectorModal, Timeline, AssistantPanel.  
  - `ui/` — ConfirmDialog, Toast.
- **`pages/AdminDashboard/`** — AdminDashboard.tsx (ליאור/לידור) + רכיבים: AttentionPanel, FinancialControl, InsightsSection, KpiRow, ReportsTable, SeedExistingCasesPanel, SeedShortcutsSticker, i18n.
- **`services/`** — geminiService (translate, refine, improveEnglish, analyzeToneAndRisk, reviewHebrewStyle, וכו'), bestPracticesStore, sectionTemplatesStore, caseFolders, financialExpensesClient, financialExpensesData, financialExpensesValidation, ocrReportsFromImage.
- **`utils/`** — hebrewFactProtection, hebrewStyleReview, wordDiff, toneRisk, reportLock, reportFileName, sectionDisplay, expensesTableText, financialExpensesCalculator, personalSnippets, topicPreferences, וכו'.
- **`features/admin/`** — adminQueues (תורי עברית, משוב מבטחת, resend), adminKpis, adminPriority, adminPriorityAnalytics, adminPriorityReasons.
- **`ai/`** — masterPrompt, assistantPrompt (לעוזר חכם).
- **`config/`** — grammarly.ts (client id).
- **`constants/scrollTargets.ts`** — מזהה פאנלים לסקרול (REPORT_REVIEW_PANEL_ID, EXTERNAL_FEEDBACK_PANEL_ID).
- **`pdf/`** — buildReportHtml, generatePdfFromHtml.

**אחסון נתונים:**  
- **דיווחים ו־view נוכחי:** `localStorage` — מפתחות ב־App (למשל `lp_reports`, `lp_user`, `lp_view`). אין API לשמירת דיווחים בשרת.  
- **תבניות ו־Best Practices:** נשמרים בקבצי JSON ב־`data/` דרך `GET/POST /api/templates`, `/api/best-practices`.  
- **גיליונות כספיים:** `financialExpensesClient` — כנראה API נפרד או אחסון מקומי (יש לבדוק לפי המימוש).

---

## 8. AI בתוכנה (OpenAI)

כל קריאות ה־AI עוברות דרך **server.js**: פונקציה `createTextCompletion` שמשתמשת ב־`openai.chat.completions.create` (מודל ברירת מחדל: `gpt-4o-mini`).

**Endpoints שמשתמשים ב־AI:**

- **`POST /api/translate`** — תרגום עברית→אנגלית משפטית.
- **`POST /api/refine-text`** — שיפור עברית (SAFE_POLISH או REWRITE עם protectHebrewFacts/restoreHebrewFacts).
- **`POST /api/improve-english`** — שיפור אנגלית (British legal, ללא שינוי עובדות).
- **`POST /api/review-hebrew-style`** — בדיקת סגנון עברית (החזרת issues ב־JSON).
- **`POST /api/analyze-tone-risk`** — ניתוח טון וסיכון (החזרת issues).
- **`POST /api/hebrew-report-summary`** — תקציר עברית לדו״ח המשך.
- **`POST /api/analyze-medical-complaint`** — ניתוח תלונה רפואית (מסמך).
- **`POST /api/analyze-dental-opinion`** — ניתוח חוות דעת שיניים.
- **`POST /api/extract-policy`** — חילוץ מטא־דאטה מפוליסה (תמונה/PDF).
- **`POST /api/extract-expenses`** — חילוץ טבלת הוצאות ממסמך.
- **`POST /api/analyze-file`** — ניתוח כללי של קובץ עם userPrompt.
- **`POST /api/help-chat`** — שאלות כלליות.
- **`POST /api/assistant/help`** — עוזר חכם (Assistant) לפי intent ו־context.
- **`POST /api/generate-summary`** — סיכום לדיווח.

**מגבלות אורך:** `truncateText` עם `MAX_DOC_CHARS` (למשל 18k תווים) ו־חיתוך לפי סעיף (6k) ב־review-hebrew-style ו־tone-risk. אין chunking אוטומטי למסמכים ארוכים מאוד.

---

## 9. ויזואליות ו־UI

- **RTL:** עורכת הדין רואה ממשק בעברית (dir="rtl", lang="he") בחלק מהפאנלים והכפתורים.
- **דשבורדים:** כרטיסים לפי עורכת דין / תור / תיק; טבלאות עם סינון וחיפוש; סטטוסים צבעוניים (אדום/צהוב/ירוק).
- **עורך:** textarea per section; Grammarly (אופציונלי); כפתורי "שפר עברית", "תרגם", "שפר אנגלית" לפי תפקיד.
- **פאנל סקירה:** הערות עם חומרה (קריטי/מהותי/סגנון), כפתור "סומן כטופל".
- **תצוגה מקדימה:** HTML/PDF (Puppeteer) עם לוגו וחתימה.
- **אין** ערכת עיצוב אחת מנוהלת — שימוש ב־Tailwind ו־classNames ישירות ב־App ורכיבים.

---

## 10. באגים קיימים או אפשריים

- **אחסון דיווחים:** כל הנתונים ב־localStorage — מחיקת cache / דפדפן אחר = אובדן דיווחים. אין גיבוי מרכזי.
- **סנכרון:** אין סנכרון בין מכשירים או בין משתמשים — כל אחד רואה את מה שנשמר אצלו ב־localStorage (למשתמש ADMIN/SUB_ADMIN/FINANCE ייתכן שכל הדיווחים נטענים כי אין סינון לפי "ש server" — הלוגיקה היא `visibleReports = isStaff ? reports : reports.filter(createdBy)`; ה־reports עצמם מגיעים מ־localStorage של אותו דפדפן).
- **Report Lock:** יש מנגנון נעילה לדיווח שנשלח (reportLock) — עריכה נחסמת אחרי SENT; יש override ל־Admin. ייתכן race אם שניים פותחים אותו דיווח.
- **Fact protection:** ב־refine-text (REWRITE) ו־improve-english — אם ה־LLM משנה או מוחק placeholder, השחזור נכשל (422 / FACT_PROTECTION_FAILED). המשתמש צריך להיות מודע.
- **אורך מסמך:** חיתוך ב־truncateText — מסמכים ארוכים מאוד עלולים להיחתך ללא הודעה ברורה.
- **אימות:** סיסמאות ב־constants — לא מוצפנות; אין rate limiting על login.
- **PDF/Email:** תלויים ב־Puppeteer, nodemailer ו־env (EMAIL_*). כשל בסביבה או ב־credentials יגרום לשגיאות ללא fallback ברור למשתמש.

---

## 11. הצעות לשיפור (ללא ביצוע)

- **אחסון מרכזי:** העברת דיווחים ל־DB (למשל SQLite/Postgres) או API לשמירה/טעינה — כדי לגבות ולאפשר גישה מכמה מכשירים.
- **Chunking:** למסמכים ארוכים — חלוקה לקטעים בתרגום/שיפור והרכבה מחדש.
- **הודעות למשתמש:** כאשר טקסט נחתך (truncate) או כאשר fact protection נכשל — הצגת הודעה מפורשת.
- **אימות:** הצפנת סיסמאות, rate limiting, אופציונלי 2FA.
- **בדיקות:** הרחבת Vitest ל־flow קריטי (למשל שמירה, שינוי סטטוס, תרגום).
- **עיצוב:** ערכת עיצוב אחידה (צבעים, טיפוגרפיה) ומסמך עיצוב ל־UI.
- **i18n:** מיפוי כל המחרוזות הקשיחות ל־מפתחות תרגום (כרגע יש תערובת עברית/אנגלית לפי תפקיד).
- **נגישות:** בדיקת תמיכה ב־screen reader ו־keyboard navigation.

---

## 12. האם יש הצדקה להעלות ל־Render

**יתרונות:**  
- שרת רץ בסביבה יציבה (Render), זמין תמיד.  
- משתני סביבה (OPENAI_API_KEY, EMAIL_*, וכו') מנוהלים במרכז.  
- אפשר להציג לינק למבטחת/ללקוחות אם רוצים גישה ל־PDF או לדשבורד.

**חסרונות/סיכונים:**  
- **דיווחים נשארים ב־localStorage** — אם כל המשתמשים נכנסים דרך אותו דומיין ב־Render, עדיין כל אחד רואה רק את ה־localStorage של הדפדפן שלו; אין DB משותף. כדי ש־Render יהיה "מקור האמת" צריך להוסיף שכבת שמירה/טעינה דיווחים בשרת (ולהחליט אם להשאיר localStorage כ־cache).  
- **אימות:** סיסמאות ב־constants מסוכן בפרודקשן — יש להעביר לסיסמאות מוצפנות או ל־OAuth.  
- **עלות:** Render + OpenAI — תלוי בנפח שימוש.

**סיכום:**  
העלאה ל־Render **הגיונית** כ־"שרת חי" ל־API ו־להגשת האפליקציה, **אבל** ללא שכבת אחסון דיווחים בשרת — כל משתמש ימשיך לעבוד מול הנתונים המקומיים שלו. אם המטרה היא רק שליאור/עורכות דין יכנסו מאותו מחשב — זה יכול להספיק. אם המטרה היא גישה מכמה מחשבים/משתמשים עם נתונים משותפים — יש להשלים קודם אחסון דיווחים בשרת (ו־אימות מתאים) ואז להעלות.

---

*מסמך זה נועד להסבר בלבד. אין לבצע שינויים בקוד התוכנה על סמך מסמך זה.*
