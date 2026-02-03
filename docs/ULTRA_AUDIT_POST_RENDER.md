# Ultra Audit — Report CRM (Post-Render STAGING)

מסמך אודיט תכנוני, תפעולי וטכני — **לפני שימוש אמיתי במשרד**.  
**אין שינוי קוד במסמך זה;** ניתוח, זיהוי כשלים והצעות בלבד.

---

# 1) Executive Verdict

## יציבות לשימוש

| סוג שימוש | Verdict | הערות |
|-----------|---------|--------|
| **A. משתמש יחיד** | **יציב עם מגבלות** | כל הנתונים ב-localStorage ובזיכרון שרת (sessions, data/). אובדן דפדפן/redeploy = אובדן דיווחים/תבניות. |
| **B. מספר עורכי דין** | **יציב עם מגבלות** | אותו מנגנון: אין DB, אין שיתוף בין מכשירים. כל עו"ד רואה רק את מה שנשמר בדפדפן שלו. עבודה מקבילית על דיווחים שונים – עובדת; על **אותו** דיווח – סיכון לדריסה/חוסר סנכרון. |

## 3 הסיכונים הקריטיים ביותר במצב הנוכחי

1. **ENV mismatch – Document Intelligence לא פעיל**  
   הקוד קורא ל־`AZURE_DOCINT_ENDPOINT` ו־`AZURE_DOCINT_KEY`, בעוד שב־Render הוגדרו `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` ו־`AZURE_DOCUMENT_INTELLIGENCE_KEY`.  
   **תוצאה:** Document Intelligence לא מופעל; רק Azure OCR (Vision) ו/או Tesseract משמשים.  
   **Requires Code Change:** כן – תאום שמות ENV או תמיכה בשני השמות.

2. **Cookie Secure ב־Production**  
   ב־`/api/logout` (שורה 3093) נכתב `process.env.NodE_ENV` (טעות כתיב).  
   **תוצאה:** ב־production ה־cookie של logout לא מוגדר כ־`secure`, ולכן בדפדפנים מסוימים/הגדרות עלול להישאר או לא להימחק כראוי.  
   **Requires Code Change:** כן – תיקון ל־`NODE_ENV`.

3. **אובדן נתונים – אין persistence**  
   דיווחים, תיקיות, גיליונות כספיים – רק ב-localStorage. תבניות ו־Best Practices – ב־`data/` על דיסק אפמרי.  
   **תוצאה:** מחיקת cache / דפדפן / redeploy = אובדן. אין גיבוי אוטומטי.  
   **Requires Code Change:** לא להערכה הנוכחית – החלטה ארכיטקטונית ותיעוד.

## שימוש ב־ENV שמצריך שינוי קוד או הגנה

- **Document Intelligence:** תאום ENV (ראו למעלה).  
- **NodE_ENV:** תיקון טעות כתיב.  
- **כל השאר:** הקוד משתמש ב־ENV עם fallback או בדיקה; חסר ENV מחזיר 500/הודעה ברורה (למשל שליחת מייל בלי EMAIL_USER/EMAIL_PASS).

---

# 2) Environment Variables Audit

## ENV שהוגדרו ב־Render – שימוש בפועל

| ENV | שימוש בקוד | איפה (קובץ/שורה) | אם חסר/שגוי | מנוצל חלקית? |
|-----|------------|-------------------|-------------|--------------|
| **OPENAI_API_KEY** | כן | `server.js` 213–218, `ensureOpenAI()` | `openai = null`; כל קריאת AI מחזירה 500 "OpenAI client is not configured" | לא – מנוצל מלא |
| **OPENAI_MODEL** | כן | `server.js` 218, `createTextCompletion` | ברירת מחדל `gpt-4o-mini` | לא |
| **DOC_CHAR_LIMIT** | כן | `server.js` 219, `truncateText()` | ברירת מחדל 18000 | לא – אין הצגה למשתמש שהטקסט נחתך |
| **PDF_DEBUG** | כן | `server.js` 2072 | רק אם `=== '1'` כותב HTML לדיסק; אחרת לא משפיע | לא |
| **NODE_ENV** | כן | `server.js` 3071, 4176 | login cookie `secure`; האזנה על PORT | **כן – שורה 3093:** `NodE_ENV` (typo) ב־logout |
| **NODE_VERSION** | לא בקוד | Render only | — | — |
| **POLICY_OCR_ENABLED** | כן | `server.js` 220 | `!== 'false'` → true; מפעיל Tesseract כ־fallback ל־PDF | לא |
| **POLICY_OCR_MAX_PAGES** | כן | `server.js` 221, 486, 822 | ברירת מחדל 2; מגביל דפים ב־Tesseract | לא |
| **AZURE_OCR_ENDPOINT** | כן | `server.js` 222, 541 | אם חסר – `USE_AZURE_OCR = false`, מדלגים על Azure Vision OCR | לא |
| **AZURE_OCR_KEY** | כן | `server.js` 223, 548, 567 | יחד עם ENDPOINT | לא |
| **AZURE_DOCUMENT_INTELLIGENCE_*** | **לא** | — | **הקוד מחפש `AZURE_DOCINT_ENDPOINT` ו־`AZURE_DOCINT_KEY`** (שורות 225–226) | **כן – שמות שונים** |
| **EMAIL_USER / EMAIL_PASS / EMAIL_SERVICE** | כן | `server.js` 2119–2123, 3689, 3713 | ללא – `/api/send-email` מחזיר 500 "Server email configuration missing" | לא – STAGING לא מגדיר במכוון |

## ENV שהקוד מניח שקיימים – Fallback

- **PORT:** `process.env.PORT || 3000` – יש fallback.  
- **DATA_DIR / TEMPLATES_FILE_PATH / BEST_PRACTICES_FILE_PATH:** יש fallback ל־`data/` וקבצים בתוכו.  
- **OPENAI:** אין fallback ל־API אחר; חסר key = כישלון AI.

## סיכום ENV

- **Requires Code Change:** תאום `AZURE_DOCUMENT_INTELLIGENCE_*` ל־`AZURE_DOCINT_*` או תמיכה בשני השמות; תיקון `NodE_ENV` ל־`NODE_ENV`.  
- **לא מנוצל ב־STAGING:** Document Intelligence (בגלל אי־התאמת שמות).

---

# 3) Server Runtime Audit (Render)

## Puppeteer (PDF)

| נושא | מצב נוכחי | סיכון |
|------|-----------|--------|
| **זמינות Chrome** | Render מריץ `npx puppeteer browsers install chrome` ב־Build; הקוד `puppeteer.launch({ headless: 'new' })` בלי `executablePath` | Puppeteer אמור לאתר את Chrome אוטומטית. אם Render משנה נתיב – ייתכן כשל. |
| **Flags / זכרון** | אין `args: ['--no-sandbox', '--disable-setuid-sandbox']` ולא הגבלת זיכרון | בסביבות Linux מוגבלות (כמו Render) לעיתים נדרש `--no-sandbox`. אם PDF כבד – יתכן חריגת זיכרון. |
| **נעילה** | אין timeout מפורש על `page.pdf()` | בקשה גדולה עלולה להיתלות עד timeout של ה־reverse proxy. |

**Requires Code Change (מומלץ):** הוספת `args: ['--no-sandbox']` אם יופיעו כשלי launch; אופציונלי – timeout על יצירת PDF.

## OpenAI

| נושא | מצב נוכחי | סיכון |
|------|-----------|--------|
| **Timeout** | אין timeout ב־`client.chat.completions.create()` | קריאה תלויה עד timeout של ה־client (ברירת מחדל של OpenAI SDK). |
| **Truncate** | `truncateText(..., MAX_DOC_CHARS)` לפני שליחה ל־AI ב־חלק מהמקומות | DOC_CHAR_LIMIT מנוצל; לא בכל ה־endpoints יש חיתוך עקבי (תלוי ב־caller). |
| **Retry** | אין retry על 429/5xx | משתמש רואה 500; אין ניסיון חוזר אוטומטי. |
| **Errors** | `ensureOpenAI()` זורק; try/catch מחזיר 500 עם "Translation failed" וכו' | כשל ברור למשתמש; לא נשמר ל־retry מאוחר. |

**Requires Code Change (Nice to Have):** timeout מפורש, retry עם backoff על 429.

## OCR Flow

| שלב | לוגיקה | הערות |
|-----|--------|--------|
| **PDF** | pdf-parse → PDF.js → **Document Intelligence** (אם USE_DOC_INTELLIGENCE) → **Azure Vision OCR** (אם USE_AZURE_OCR) → Tesseract (אם ENABLE_POLICY_OCR או forceOcr) | סדר נכון; Document Intelligence כרגע לא פעיל (ENV mismatch). |
| **תמונה** | Document Intelligence → Azure OCR → Tesseract (eng+heb, fallback eng) | מנוצל. |
| **Page limits** | `POLICY_OCR_MAX_PAGES` (ברירת מחדל 2) חל רק על `extractTextWithOcr` (Tesseract). Azure/DocInt – כל הדף. | הגיוני; Tesseract כבד ולכן מוגבל. |
| **Fallback** | אם DocInt לא מוגדר/נכשל – עוברים ל־Azure OCR ואז Tesseract. | טוב. |

## Email

| נושא | מצב | הערות |
|------|-----|--------|
| **STAGING** | EMAIL_USER / EMAIL_PASS לא מוגדרים | `/api/send-email` מחזיר 500 עם "Server email configuration missing" – כשל צפוי ובטוח. |
| **Transporter** | נוצר עם `process.env.EMAIL_SERVICE \|\| 'hotmail'` ו־auth מ־ENV | אם מגדירים ENV ריק – עלול להיזרק בשעת `sendMail`. |

**Requires Code Change (Should Fix):** בדיקה מפורשת לפני `sendMail` (כבר קיימת ב־3689) – מספיק. אין שליחה ב־STAGING ללא הגדרה.

## Filesystem (data/, temp)

| נתיב | שימוש | ב־Render |
|------|--------|----------|
| **DATA_DIR** | `sectionTemplates.json`, `bestPractices.json` – קריאה/כתיבה | אפמרי – אובדן ב־redeploy. |
| **PDF_DEBUG** | כותב `debug-report.html` ל־`__dirname` | אפמרי; רק אם PDF_DEBUG=1. |
| **ASSETS_DIR** | `Report CRMassetsbranding` (חסר רווח/סלאש?), חתימה ותמונות טיימליין | אם הנתיב שגוי – loadImageBase64OrThrow יזרוק; PDF ייכשל. |

**הערה:** `ASSETS_DIR = path.join(__dirname, "Report CRMassetsbranding")` – ייתכן שצריך רווח או סלאש בין "Report CRM" ל־"assets/branding". אם בתיקייה המקורית השם שונה – נכשל טעינת assets. **Requires Code Change (אם נכשל):** תיקון שם תיקייה.

---

# 4) Workflow Stress Test

## דיווח נכתב חלקית ונטש

| מה קורה היום | איפה עלול להישבר | ENV עוזר? |
|---------------|-------------------|-----------|
| הדיווח נשמר ב־localStorage בעדכונים. אם המשתמש עוזב בלי שמירה מפורשת – האחרון נשמר. | אין "שמירה אוטומטית" מרווחי זמן; רק על שינוי. אם הדפדפן קורס – אובדן. | לא רלוונטי. |

## OCR נכשל באמצע תהליך

| מה קורה היום | איפה עלול להישבר | ENV עוזר? |
|---------------|-------------------|-----------|
| `getDocumentText` מחזיר `null` או טקסט קצר; ה־API מחזיר 400/500 או אובייקט ריק. | הממשק צריך להציג שגיאה; אם לא – המשתמש לא יודע למה אין טקסט. | POLICY_OCR_MAX_PAGES מקטין סיכון timeout ב־Tesseract. Document Intelligence (אם יתוקן ENV) משפר סיכוי הצלחה. |

## תרגום ארוך שנחתך

| מה קורה היום | איפה עלול להישבר | ENV עוזר? |
|---------------|-------------------|-----------|
| `truncateText(text, MAX_DOC_CHARS)` – חיתוך ל־DOC_CHAR_LIMIT (ברירת מחדל 18000). | אין הודעה למשתמש ש"הטקסט ח truncated". סעיף ארוך עלול להישלח חלקי ל־AI. | DOC_CHAR_LIMIT קיים; חסר חיווי בממשק. |

## PDF כבד (הרבה סעיפים)

| מה קורה היום | איפה עלול להישבר | ENV עוזר? |
|---------------|-------------------|-----------|
| HTML נבנה מ־Handlebars; Puppeteer מרender ל־PDF. | זיכרון גבוה; Render עלול לחסום process או timeout. אין הגבלה על גודל דיווח. | אין ENV רלוונטי. |

## דיווח חוזר מהמבטחת

| מה קורה היום | איפה עלול להישבר | ENV עוזר? |
|---------------|-------------------|-----------|
| "דיווח חוזר" = תיק/דיווח קיים עם עדכון. נתונים ב־localStorage (תיקיות, דיווחים). | אם שני משתמשים "מעדכנים" את אותו דיווח ממכשירים שונים – אין סנכרון; דריסה. | לא. |

## עבודה מקבילית של ליאור על כמה דיווחים

| מה קורה היום | איפה עלול להישבר | ENV עוזר? |
|---------------|-------------------|-----------|
| כל דיווח מזוהה ב־localStorage לפי id. ליאור יכול לפתוח טאבים שונים – כל אחד עם state משלו. | רענון/סגירת טאב – state של אותו דיווח יכול להיות שונה בין טאבים; אין lock. | לא. |

---

# 5) Status & State Audit

## מצבים לא חוקיים

- **ReportStatus:** `TASK_ASSIGNED | DRAFT | WAITING_FOR_INVOICES | PENDING_REVIEW | APPROVED | READY_TO_SEND | SENT`.  
  המעבר בין סטטוסים נעשה בצד לקוח (App.tsx) ובחלקו תלוי ב־role (ADMIN/LAWYER/FINANCE). אין validation בצד שרת שמאפשר רק מעברים חוקיים – השרת לא שומר report status (אין DB).  
- **HebrewWorkflowStatus:** `HEBREW_DRAFT | HEBREW_SUBMITTED | HEBREW_CHANGES_REQUESTED | HEBREW_APPROVED | HEBREW_REOPENED_EXTERNAL`.  
  נשמר ב־report ב־localStorage; כפתור "תרגם" פעיל כאשר `reportReview?.status === 'APPROVED'` או `hebrewWorkflowStatus === 'HEBREW_APPROVED'`.  
- **התנגשויות:** אין חסימה מפורשת של "DRAFT עם READY_TO_SEND" וכו'; הלוגיקה מניחה מעבר סדרתי. אם hand-craft JSON ב־localStorage – אפשר למצב לא עקבי.

## READY_TO_SEND – האם באמת בטוח?

- **משמעות:** הדיווח מוכן לשליחת מייל (למבטחת).  
- **בטיחות:** בלחיצה על "שלח" נשלחת קריאה ל־`/api/send-email`. אם EMAIL_USER/EMAIL_PASS חסרים – 500. אין "אישור סופי" חובה בממשק (תלוי ב־UI – כפתור "שלח" עם אישור).  
- **סיכון:** אם ב־production יוגדרו פרטי SMTP אמיתיים – שליחה אמיתית. ב־STAGING ללא ENV – בטוח.

## סטטוסים מיותרים / חסרים

- לא זוהו סטטוסים מיותרים.  
- חסר: סטטוס מסוג "SEND_FAILED" (לאחר 500) – נשמר רק ב־UI/state; לא ב־ReportStatus.  
- חסר: סטטוס "ARCHIVED" או "DELETED" – יש `deletedAt` בשכבת התיקיות/דיווחים; אין enum נפרד.

---

# 6) Data Safety Audit

## localStorage

| סיכון | תיאור |
|--------|--------|
| **מחיקת cache / דפדפן** | כל הדיווחים, תיקיות, גיליונות כספיים, תבניות אישיות, העדפות – אובדים. |
| **מכשיר אחר** | אותו משתמש במכשיר אחר – לא רואה את אותם דיווחים (אין sync). |
| **Private / Incognito** | נתונים נמחקים בסיום הסשן. |
| **גודל** | מגבלת localStorage (~5–10MB) – דיווחים רבים עם תוכן מלא עלולים להתקרב למגבלה. |

**המלצה:** תיעוד למשתמשים; אופציונלי – ייצוא/גיבוי ל־JSON.

## אובדן data/ אחרי redeploy

- **תבניות (sectionTemplates), Best Practices** – נשמרים ב־`data/` על השרת. ב־Render הדיסק אפמרי – redeploy מאפס.  
- **Seed:** אם הקבצים ריקים – הקוד עושה seed מ־LEGAL_SNIPPETS פעם אחת. אחרי redeploy – שוב seed; לא מאבדים "לוגיקה" אבל מאבדים עריכות ידניות.

## OCR output

- **נשמר?** לא. התוצאה חוזרת בתשובת API ל־client; לא נשמרת על השרת.  
- **איפה?** רק בזיכרון ב־request/response.

## PDF generation artifacts

- **בזיכרון:** ה־HTML נבנה; Puppeteer מייצר Buffer; Buffer נשלח ב־response. אין קובץ PDF על דיסק (אלא אם PDF_DEBUG=1 כותב HTML).  
- **אפמרי:** מתאים ל־Render.

---

# 7) AI Usage Audit

## היכן AI עלול להזיק אם סומכים עליו

- **תרגום / שיפור עברית/אנגלית:** מודל עלול לשנות עובדות (שמות, תאריכים, סכומים) למרות ה־prompts.  
- **protect-facts:** הקוד משתמש ב־`protectHebrewFacts`/`restoreHebrewFacts` (שרת) ו־`protectFacts`/`restoreFacts` (לקוח – App.tsx) כדי להחליף עובדות ב־placeholders לפני שליחה ל־AI ולהחזיר אחרי. **מגן חלקי** – רק על דפוסים שמוגדרים (כסף, תאריכים, אחוזים, שמות וכו'); ביטויים לא צפויים עלולים להישאר ולעבור שינוי.  
- **חוות דעת / סיכומים:** AI מייצר תקצירים; יש להתייחס כ־advisory – עו"ד צריך לעבור ולוודא.

## DOC_CHAR_LIMIT

- **משתמש:** לא מודע אוטומטית לכך שטקסט נחתך. אין הודעה "הטקסט ח truncated ל־X תווים".  
- **Requires Code Change (Nice to Have):** חיווי ב־UI או ב־response כשנעשה truncate.

## מתי AI צריך להיות advisory בלבד

- כל פלט AI (תרגום, שיפור, סיכום עובדות, ניתוח טון/סיכון) – advisory.  
- אין במערכת סימון "אושר על ידי אדם" אוטומטי; הלוגיקה של "אישור עברית" ו־READY_TO_SEND משקפת workflow אנושי אבל לא אימות תוכן אוטומטי.

---

# 8) Must Fix / Should Fix / Nice to Have

| # | סעיף | סיווג | Requires Code Change? | סיכון אם לא מתוקן |
|---|------|--------|------------------------|---------------------|
| 1 | תאום ENV ל־Document Intelligence (AZURE_DOCINT_* vs AZURE_DOCUMENT_INTELLIGENCE_*) | **Must Fix** (אם רוצים DocInt) | Yes | Document Intelligence לא פעיל ב־STAGING. |
| 2 | תיקון טעות כתיב NodE_ENV → NODE_ENV ב־logout cookie | **Must Fix** | Yes | Cookie לא מוגדר כ־secure ב־production; סיכון session. |
| 3 | תיעוד + הנחיה: דיווחים רק ב־localStorage; גיבוי באחריות המשתמש | **Should Fix** | No | אובדן נתונים לא צפוי למשתמשים. |
| 4 | אימות נתיב ASSETS_DIR (Report CRMassetsbranding) – האם קיים ונתון טעינה | **Should Fix** | Yes (אם הנתיב שגוי) | PDF ייכשל בטעינת חתימה/תמונות. |
| 5 | Puppeteer: הוספת `--no-sandbox` אם יופיעו כשלי launch ב־Render | **Should Fix** | Yes | PDF עלול להיכשל בסביבה מוגבלת. |
| 6 | OpenAI: timeout מפורש ו/או retry על 429 | **Nice to Have** | Yes | חוויית משתמש טובה יותר בעומס. |
| 7 | חיווי ב־UI כשטקסט נחתך (DOC_CHAR_LIMIT) | **Nice to Have** | Yes | שקיפות למשתמש. |
| 8 | Persistent Disk ל־data/ ב־Render (אם רוצים לשמר תבניות) | **Nice to Have** | No (הגדרה ב־Render) | תבניות מתאפסות ב־redeploy. |

---

# 9) Ultra Audit Diff Summary

## 10–15 תובנות קריטיות

1. **Document Intelligence לא פעיל** – שמות ENV ב־Render שונים מהקוד (DOCUMENT_INTELLIGENCE vs DOCINT).  
2. **טעות כתיב NodE_ENV** ב־logout – cookie לא secure ב־production.  
3. **כל הנתונים המשמעותיים** – דיווחים, תיקיות, גיליונות – רק ב-localStorage; אין DB.  
4. **data/** – אפמרי ב־Render; תבניות ו־Best Practices אובדים ב־redeploy.  
5. **OpenAI** – ללא timeout/retry מפורשים; חיתוך לפי DOC_CHAR_LIMIT ללא חיווי למשתמש.  
6. **Puppeteer** – ללא `--no-sandbox`; עלול להידרש ב־Render.  
7. **סטטוסים** – נשמרים רק ב־client; אין validation בצד שרת על מעברי סטטוס.  
8. **READY_TO_SEND** – בטוח ב־STAGING (ללא מייל); ב־production עם SMTP – שליחה אמיתית.  
9. **protect-facts** – מגן על דפוסים מוגדרים; לא על כל הביטויים האפשריים.  
10. **עבודה מקבילית** – על דיווחים שונים OK; על אותו דיווח – סיכון דריסה בין טאבים/מכשירים.  
11. **OCR fallback** – DocInt → Azure OCR → Tesseract; כרגע DocInt לא בשימוש בגלל ENV.  
12. **אחרי redeploy** – sessions (Map בזיכרון) מתאפסות; משתמשים צריכים להתחבר מחדש.

## 5 פעולות ראשונות מומלצות

1. **תיקון קוד:** `NodE_ENV` → `NODE_ENV` ב־server.js שורה 3093.  
2. **תאום ENV:** להגדיר ב־Render `AZURE_DOCINT_ENDPOINT` ו־`AZURE_DOCINT_KEY` (או לשנות בקוד לתמיכה ב־AZURE_DOCUMENT_INTELLIGENCE_*).  
3. **תיעוד למשתמשים:** דיווחים ותבניות – איפה נשמרים, סיכון מחיקת cache/redeploy, גיבוי.  
4. **בדיקת PDF ב־STAGING:** וידוא ש־Chrome עולה ו־PDF נוצר; אם לא – לשקול הוספת `--no-sandbox` ל־Puppeteer.  
5. **וידוא נתיב assets:** שהתיקייה עם החתימה והלוגו קיימת ושמה תואם (כולל רווח/סלאש אם רלוונטי).

## האם אפשר להתקדם ל־"Internal Production"

**כן, בתנאי:**

- תיקון NodE_ENV ותאום ENV ל־Document Intelligence (או קבלה ש־DocInt לא בשימוש).  
- קבלה מפורשת: אין DB; דיווחים רק ב־localStorage; data/ אפמרי אלא אם מחברים Persistent Disk.  
- אם מפעילים שליחת מייל – הגדרת EMAIL_* וזהירות משליחה למבטחת בטעות.  
- תיעוד והנחיה למשתמשים על גיבוי ומגבלות.

## התנאי המינימלי ל־Internal Production

- **Must Fix:** תיקון NodE_ENV.  
- **תנאי ארכיטקטוני:** תיעוד והסכמה על אי־persistence (localStorage + data/ אפמרי) או חיבור Persistent Disk + אזהרות על localStorage.  
- **אופציונלי אבל מומלץ:** תאום ENV ל־Document Intelligence אם רוצים OCR מתקדם; וידוא PDF ו־Puppeteer ב־Render.

---

*סיום Ultra Audit. לא בוצעו שינויי קוד; רק ניתוח והמלצות.*
