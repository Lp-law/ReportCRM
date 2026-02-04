# Pre-Fix Analysis — Report CRM

**מטרה:** איסוף מידע, מיפוי ואבחון בלבד עבור 5 נושאים שזוהו, כדי ש-AI אחר (ChatGPT) יוכל לכתוב פרומפטי שינוי מדויקים ובטוחים.

**אין במסמך:** שינויי קוד, הצעות פתרון, או פרומפטים לשינוי — רק מיפוי ומצב קיים.

---

## 📌 נושא 1 — תרגום אוטומטי של שמות (עברית → אנגלית)

### 1) שדות שהעורכת מזינה

| מושג | שדה במודל | תיאור |
|------|-----------|--------|
| **INSURED / SUBJECT** | `insuredName` | שם המבוטח — מוזן בשדה "Insured Name". |
| **PLAINTIFF / CLAIMANT** | `plaintiffName` | שם הצד (תובע/דורש) — מוזן בשדה "Party Name". |
| **Party type** | `plaintiffTitle` | ערך `'Plaintiff'` או `'Claimant'` — בחירה בשני כפתורים. |
| **PARTY NAME** | תווית UI בלבד | מתייחסת ל-`plaintiffName` (בטופס: "Party Name" + שדה טקסט). |

**הערה:** אין שדה נפרד בשם "CLAIMANT" או "PARTY NAME" כנתון — "Party Name" הוא התווית של השדה `plaintiffName`.

### 2) קבצים ורכיבים

- **הגדרת טיפוסים:** `src/types.ts`  
  - `ReportData`: `insuredName: string`, `plaintiffName: string`, `plaintiffTitle: 'Plaintiff' | 'Claimant'`.
- **טופס הזנה (Setup / Step 1):** `src/App.tsx`  
  - תוויות: "Insured Name", "Party Name", כפתורי Plaintiff/Claimant.  
  - בערך שורות 1914–1935:  
    - `Insured Name` → `data.insuredName`, `updateData(maybeAutoFillSubject({ insuredName: val }))`.  
    - `Party Name` → `data.plaintiffName`, `updateData(maybeAutoFillSubject({ plaintiffName: val }))`.  
    - כפתורים: `plaintiffTitle: 'Plaintiff'` / `'Claimant'`.
- **שימוש בשדות:**  
  - `src/App.tsx` (החלפות בתבניות, סינון, תצוגה), `src/components/dashboard/LawyerDashboard.tsx`, `src/components/cases/CaseFolderView.tsx`, `src/pages/AdminDashboard/AdminDashboard.tsx`, `src/services/caseFolders.ts`, `src/pdf/buildReportHtml.ts`, ועוד — כולם קוראים/כותבים `insuredName`, `plaintiffName`, `plaintiffTitle` ישירות.

### 3) פונקציית תרגום ושירותים חיצוניים

- **תרגום טקסט (לא שמות):**  
  - `src/services/geminiService.ts`: `translateLegalText(text)` — קוראת ל-`POST /api/translate`.  
  - `server.js` (שורה ~2131): `app.post('/api/translate', ...)` — משתמש ב-OpenAI עם system prompt של "Hebrew-to-English legal translator".  
  - **אין** פונקציה ייעודית לתרגום **שמות** (עברית → אנגלית) עבור `insuredName` / `plaintiffName`.
- **שימוש ב-OpenAI:** כן — דרך `createTextCompletion` ב-`server.js` (מפתח: `OPENAI_API_KEY` / `API_KEY`).  
- **Azure Translate:** לא נמצא שימוש ב-Azure Translation ב-codebase.

### 4) ולידציה לשפה

- **אין** ולידציה מפורשת לשפה (עברית/אנגלית) על השדות `insuredName` או `plaintiffName`.  
- השדות הם מחרוזות חופשיות; אין בדיקת תווים, שפה או פורמט.

### 5) מתי לבצע תרגום (תכנוני)

- **onBlur:** לא מיושם כרגע; אפשר להוסיף קריאה ל-API בעת יציאה מהשדה.  
- **onSubmit:** לא מיושם; אפשר לתרגם לפני שמירת דוח או לפני מעבר לשלב הבא.  
- **כפתור ייעודי:** לא קיים כפתור "תרגם שמות" או דומה.  
- **הערה:** קיים `maybeAutoFillSubject` שמחשב `reportSubject` מ-`plaintiffName` ו-`insuredName` (פורמט `"Party v. Insured"`) — לוגיקה פנימית בלבד, ללא תרגום.

---

## 📌 נושא 2 — כשל בלחיצה על "שיפור ניסוח בעברית"

(הכפתור UI: "בדיקת ניסוח (הערות בלבד)" — בודק סגנון עברית ומציג הערות, לא משנה טקסט.)

### 1) כפתור מפעיל

- **קומפוננטה:** `src/App.tsx`.  
- **כפתור:** טקסט "בדיקת ניסוח (הערות בלבד)", עם `onClick={handleRunHebrewStyleReview}`.  
- **מיקום:** בערך שורות 3761–3779; בתוך אזור הכפתורים של Draft (ליד "בדיקת Tone & Risk").  
- **מאפיינים:** `className` עם `text-xs px-3 py-1.5 rounded-full border`, מצב loading עם `Loader2` ו"בדיקת ניסוח בעברית...".

### 2) Endpoint

- **URL:** `POST /api/review-hebrew-style`  
- **Method:** POST  
- **קריאה:** `src/services/geminiService.ts` — פונקציה `reviewHebrewStyle(content, _userRole)`:  
  - `fetch('/api/review-hebrew-style', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ content }) })`.

### 3) קוד שרת שמטפל

- **קובץ:** `server.js`.  
- **מיקום:** שורות 3341–3503 — `app.post('/api/review-hebrew-style', async (req, res) => { ... })`.  
- **ת flow:**  
  1. בדיקת role (ADMIN או LAWYER בלבד; אחרת 403).  
  2. ולידציה: `content` אובייקט (מפת סעיפים); אחרת 400.  
  3. המרה ל-`sections` עם `sectionKey` ו-`text` (כל טקסט נחתך ל-6000 תווים ב-`truncateText`).  
  4. אם אין סעיפים עם טקסט — החזרה מיידית `{ runAt, issues: [] }`.  
  5. בניית `systemPrompt` ו-`userPrompt` וקריאה ל-`createTextCompletion({ systemPrompt, userPrompt, temperature: 0.0 })`.  
  6. פרסור התשובה כ-JSON עם `parseJsonSafely(responseText, fallback)` (fallback: `{ runAt, issues: [] }`).  
  7. נרמול `issues` (severity, category, id וכו') והחזרה `res.json({ runAt, issues: normalizedIssues })`.  
- **במקרה שגיאה:** `catch` — `console.error('Hebrew style review error:', error)` ו-`res.status(500).json({ runAt: new Date().toISOString(), issues: [] })`.  
  - **השרת לא מחזיר** `error message` או `stack` ב-body ב-500; רק `runAt` ו-`issues: []`.

### 4) מה מוחזר בשגיאה

- **Status code:** 500 (בכשל כללי), או 403 (role), 400 (content חסר).  
- **Body ב-500:** `{ runAt: "<ISO timestamp>", issues: [] }` — **אין** שדה `error` או `message` או stack.  
- **קליינט:** `geminiService.ts` — אם `!response.ok` זורק `new Error('Hebrew style review failed')`; ב-catch זורק `new Error('Hebrew style review error')`.  
  - אין ציטוט של הודעת שגיאה מהשרת (כי השרת לא שולח אחת).

### 5) סוגי כשל אפשריים

- **OpenAI:** אם `createTextCompletion` זורק (מפתח חסר, rate limit, timeout, תשובה לא צפויה) — השרת נופל ל-catch ומחזיר 500 עם `issues: []`.  
- **Validation:** 400 אם `content` חסר או לא אובייקט; 403 אם ה-role לא ADMIN/LAWYER.  
- **Timeout:** לא מטופל explicitly ב-route; אם OpenAI timeout — יופיע כ-500.  
- **JSON parse:** השרת משתמש ב-`parseJsonSafely` — אם הפרסור נכשל מחזירים `fallback` (`issues: []`) ולא זורקים; כלומר אין 500 בגלל JSON בלבד, אבל עלולים לקבל רשימת issues ריקה אם התשובה לא בפורמט הצפוי.

**ציטוטים רלוונטיים:**

- קליינט (`src/services/geminiService.ts`):  
  `if (!response.ok) throw new Error('Hebrew style review failed');`  
  `throw (error instanceof Error ? error : new Error('Hebrew style review error'));`
- שרת (`server.js`):  
  `return res.status(500).json({ runAt: new Date().toISOString(), issues: [] });`

---

## 📌 נושא 3 — ניתוח מסמכים (אטב / אייקון שן)

### 1) הבדל לוגי בין העלאה רגילה להעלאה רפואית/שיניים

- **העלאה "רגילה" (אטב — ניתוח קובץ לסעיף):**  
  - מופעלת מכפתור/אייקון ליד **סעיף** (למשל Factual background, Expert opinion).  
  - קובץ נבחר → `handleMedicalFileSelected` ב-`App.tsx`; אם `medicalTarget.mode === 'SECTION'` ו-`medicalTarget.domain !== 'dental'`:  
    - קריאה ל-`analyzeMedicalComplaint(fileBase64, mimeType, analysisType, options)` → `POST /api/analyze-medical-complaint`.  
  - תוצאה: טקסט מנותח (עובדות, strategy וכו') מוזרק לסעיפים (למשל Factual background, Strategy) — לא רק "חוות דעת שיניים".
- **העלאה רפואית/שיניים (אייקון שן):**  
  - אותה כפתור העלאה אבל עם **domain: 'dental'** (למשל בסעיף חוות דעת מומחה).  
  - ב-`handleMedicalFileSelected`: אם `medicalTarget.domain === 'dental' && medicalTarget.mode === 'SECTION'`:  
    - קריאה ל-`analyzeDentalOpinion(fileBase64, file.type)` → `POST /api/analyze-dental-opinion`.  
    - התשובה היא **טקסט סיכום אחד** (מבנה 1–9) שמוצמד/מצורף לסעיף הנוכחי (`sectionKey`).  
  - **לא** קוראים ל-`analyzeMedicalComplaint` ב-flow הזה; אין שינוי ל-`medicalComplaint` הכללי.

### 2) Endpoints

- **ניתוח רפואי כללי:**  
  - `POST /api/analyze-medical-complaint`  
  - Body: `fileBase64`, `mimeType`, `analysisType` ('CLAIM'|'DEMAND'|'EXPERT'), ואופציונלי `expertCountMode`, `partyRole`, `sectionKey`, `plaintiffName`, `insuredName`, וכו'.  
- **ניתוח דנטלי:**  
  - `POST /api/analyze-dental-opinion`  
  - Body: `fileBase64`, `mimeType` בלבד.

### 3) שירותים: OCR וניתוח

- **חילוץ טקסט מהמסמך:**  
  - שני ה-endpoints משתמשים ב-`getDocumentText(fileBase64, mimeType)` ב-`server.js` (שורה 822 ואילך).  
  - PDF: `pdf-parse`, אחר כך PDF.js; אם פחות מ-200 תווים — Document Intelligence (אם מופעל), Azure OCR, או Tesseract (`extractTextWithOcr`).  
  - DOCX: `mammoth.extractRawText`.  
  - תמונה: Document Intelligence / Azure OCR / Tesseract (`eng+heb` ואז fallback ל-`eng`).
- **ניתוח רפואי:**  
  - `analyzeMedicalDocument(documentText)` — פונקציה פנימית ב-`server.js` (chunking + OpenAI) להפקת `MedicalComplaintAnalysis`.  
  - בנוסף, ל-EXPERT/CLAIM/DEMAND יש יצירת `claimSummary` דרך `createTextCompletion` עם `MASTER_PROMPT`.
- **ניתוח דנטלי:**  
  - אחרי `getDocumentText` — קריאה ל-`createTextCompletion` עם פרומפט דנטלי ארוך; קבצי RAG: `knowledge/DentalLexicon.he.md`, `DentalPlaybook.he.md`, `DentalStyleExemplar.he.md` (אם חסרים — ממשיכים בלי).

### 4) שלב כשל אפשרי

- **Upload:** הקובץ נקרא בדפדפן (FileReader) ונשלח כ-base64 — כשל יכול להיות גודל/זיכרון או בחירה בוטלה.  
- **חילוץ טקסט:** `getDocumentText` עלול להחזיר `null` אם:  
  - MIME לא נתמך (לא pdf/docx/text/image);  
  - פרסור PDF/DOCX נכשל;  
  - OCR נכשל (Tesseract/Azure/Doc Intelligence).  
  - אז השרת מחזיר 400 עם `error: 'Unable to extract text from document'` (דנטלי) או `'Unable to extract text from document'` (רפואי).  
- **ניתוח (OpenAI):** אם `createTextCompletion` זורק (מפתח, timeout, וכו') — 500 עם `error: 'Failed to analyze dental opinion'` או `'Failed to analyze complaint'`.

### 5) סיבות כשל סבירות

- **ENV חסר:** `OPENAI_API_KEY` (או `API_KEY`) חסר → `ensureOpenAI()` זורק; Azure OCR: `AZURE_OCR_ENDPOINT` / `AZURE_OCR_KEY` — אם חסרים, לא ירוצו שלבי Azure OCR (רק fallback ל-Tesseract וכו').  
- **קובץ גדול:** אין מגבלת גודל מפורשת ב-route; גודל base64 גדול עלול לגרום לזמן עיבוד ארוך או timeout.  
- **MIME type:** רק pdf, docx, text, image נתמכים ב-`getDocumentText`; סוג אחר יגרום להחזרת `null` ו-400.  
- **Timeout:** לא מוגדר timeout ייעודי ל-`createTextCompletion` או ל-OCR; timeout ברמת שרת/תשתית יגרום ל-500.

---

## 📌 נושא 4 — בעיית נראות כותרות (UPDATE וכו')

### 1) איפה מופיעות כותרות הפרקים

- **מסך Draft (סעיפי הדוח):**  
  - `src/App.tsx` — רינדור רשימת `data.selectedSections`; לכל סעיף `sec` מחושב `displayTitle = getSectionDisplayTitle(sec, data.expertSummaryMode?.[sec])`.  
  - כותרת כל סעיף מוצגת ב-`<h3>` בתוך כרטיס הסעיף (בערך שורות 4133–4139).  
- **מקור שמות הסעיפים:**  
  - `src/constants.ts`: `AVAILABLE_SECTIONS` — רשימת מפתחות סעיפים (למשל "Factual background – Statement of Claim", "Strategy & Recommendations", "Expenses breakdown").  
  - `src/utils/sectionDisplay.ts`: `getSectionDisplayTitle(section, expertMode)` — מחזיר את אותו מפתח או גרסה מותאמת למומחה (Plaintiff/Claimant, SINGLE/MULTIPLE).  
- **"Update":**  
  - ב-`constants.ts`, "Update" מופיע ב-`PROCEDURAL_STAGES` (שלב בציר הזמנים) וב-`LEGAL_SNIPPETS` (מפתח לתבניות טקסט).  
  - **לא** מופיע ב-`AVAILABLE_SECTIONS` — כלומר אין סעיף דוח בשם "Update" ברשימת הסעיפים; כותרות הסעיפים בדשבורד הן רק מאלה שב-`AVAILABLE_SECTIONS` + `getSectionDisplayTitle`.

### 2) עיצוב כותרות הסעיפים במסך Draft

- **אלמנט:** `<h3 className="font-bold text-lg text-lpBlue uppercase tracking-wide">` + `{displayTitle}`.  
- **צבע:** `text-lpBlue` (נגזר מ-Tailwind/תמה — כחול).  
- **גודל/משקל:** `text-lg`, `font-bold`.  
- **אפקטים:** `uppercase`, `tracking-wide`.  
- **אין** `opacity` או `font-weight` נוסף על הכותרת עצמה.  
- **קונטיינר:** הכותרת בתוך `<div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-100">` — רקע הכרטיס הוא `bg-panel` עם `border-borderDark` (במצב לא restricted).

### 3) Theme / dark mode

- בפרויקט מוגדרים צבעי תמה (navy, gold, panel, bgDark, textLight, textMuted, borderDark וכו') ב-`tailwind.config.js` ו-`src/index.css`.  
- `text-lpBlue` — כחול; על רקע כהה (panel/bgDark) הניגודיות תלויה בהגדרת `lpBlue`.  
- אין toggle מפורש ל-dark/light; הרקע הכללי כהה (bg-bgDark / bg-navySecondary).  
- אם `lpBlue` מוגדר כהה או דומה לרקע — הכותרות עלולות להיראות חלשות.

### 4) היקף הבעיה

- הכותרות המתוארות כאן הן **כותרות סעיפי הדוח במסך Draft** (ה-`<h3>` עם `displayTitle`).  
- לא נבדק במסמך זה אם יש כותרות נוספות (למשל ב-Preview או ב-PDF) עם אותה בעיית נראות; ההנחה היא שהבעיה המדווחת מתייחסת בעיקר ל-Draft.

---

## 📌 נושא 5 — כפתורים קטנים / לא בולטים

### 1) כפתורים במסך Draft שעלולים להיות בעייתיים

- **כפתורי בדיקות סגנון:**  
  - "בדיקת ניסוח (הערות בלבד)" — `text-xs px-3 py-1.5 rounded-full border`, רקע `bg-panel`, טקסט `text-blue-800`, border `border-blue-200`.  
  - "בדיקת Tone & Risk (למבטחת)" — דומה, `text-amber-800`, `border-amber-200`.  
- **כפתור משנה "הערת ניסוח":** `text-[11px] px-2 py-0.5 rounded-full` — קטן מאוד.  
- **כפתורים ליד סעיפים:**  
  - הסרת סעיף: `className="text-gray-400 hover:text-red-500"` + אייקון X בלבד.  
  - הוספת טבלת הוצאות לסעיף: `className="p-1.5 hover:bg-green-50 rounded text-textMuted hover:text-green-600"`.  
  - אוטו-מילוי כיסוי: `className="p-1.5 hover:bg-blue-50 rounded text-textMuted hover:text-blue-600"`.  
- **העלאה/ניתוח:**  
  - "📄 ניתוח OCR" / "העלאה רגילה" וכו' — כפתורים עם `px-3 py-2` או `px-3 py-1.5`, `text-xs`.  
  - כפתור "העלאה" עם אייקון: `className="px-3 py-1.5 text-xs bg-navySecondary ..."`.  
- **פעולות נוספות:**  
  - "שיפור ניסוח" / "החלה" להערות וכו' — חלקם עם `text-xs` או `text-[10px]`/`text-[11px]`.

### 2) איפה מוגדרים

- **רוב הכפתורים במסך Draft:** `src/App.tsx` — אין קומפוננטת דף נפרדת ל-Draft; הטופס והכפתורים בתוך אותו קובץ.  
- כפתורים ספציפיים נוספים ב-`LawyerDashboard`, `AdminDashboard`, `CaseFolderView`, `ReportReviewPanel` וכו' — לא ממוקדים כאן.

### 3) קומפוננט Button מרכזי

- **אין** קומפוננטת `Button` מרכזית ב-`src`.  
- חיפוש ב-`src` אחר קובץ בשם `Button` (או דומה) — לא נמצא.  
- כפתורים בנויים כ-`<button>` עם `className` ישיר (Tailwind).

### 4) ההבדל מכפתורים בולטים במערכת

- **בולטים יותר:** למשל "Next Step", "סיום ושליחה", "Open", כפתור יצירת דוח חדש — משתמשים ב-`bg-navy text-gold` או `bg-indigo-600 text-white`, `px-6 py-2`, `font-bold`, גודל `text-sm` ומעלה.  
- **פחות בולטים:** הכפתורים הקטנים במסך Draft משתמשים ב-`text-xs` / `text-[11px]`, `py-1.5` / `p-1.5`, צבעי טקסט רגילים (blue-800, amber-800, textMuted) עם border עדין, בלי רקע מלא חזק — ולכן נראים קטנים ופחות מודגשים.

---

**סיום המסמך.**  
לא בוצעו שינויי קוד; המסמך משמש רק למיפוי ואבחון לצורך כתיבת פרומפטי שינוי על ידי AI אחר.
