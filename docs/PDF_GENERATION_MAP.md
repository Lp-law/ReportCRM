# מיפוי מלא – יצירת PDF ב-Report CRM

מסמך חקר בלבד. אין שינוי קוד. אין refactor. אין ניסויים.

---

## 1. מיפוי כללי של זרימת ה-PDF

### מאיפה מתחיל ה-flow

**UI (צד לקוח):**
- כפתור "הורדת PDF" ב-Step 3 (Preview & Send)
- מטפל ב-`handleDownloadPdf` – בודק `computePreSendIssues`; אם אין תקלות, קורא ל-`performDownloadPdf`
- `performDownloadPdf` קורא ל-`fetchReportPdf(currentReport)` מתוך `geminiService.ts`
- `fetchReportPdf` שולח `POST /api/render-report-pdf` עם `{ report }` (JSON.stringify)

**API:**
- Endpoint: `POST /api/render-report-pdf`
- לא דורש authentication (כדי לא לשבור אחרי restart)
- מקבל `{ report }` מהגוף
- קורא ל-`buildFinalReportPdfWithPolicy(report)` ומחזיר Buffer כ-`application/pdf`

**סדר הקריאות בשרת:**
1. `buildFinalReportPdfWithPolicy(report)` – מנהל את כל הרכבת ה-PDF
2. `renderReportPdf(report)` – יוצר את ה-PDF הבסיסי
3. `buildReportHtml(safeReportForHtml, { forPdf: true })` – בונה HTML
4. `chromium.launch` + `page.setContent` + `page.pdf` – Playwright
5. אופציונלי: `getPolicyPdfBufferFromReport` → `buildPolicyAppendixIntroPdf` + policy PDF
6. אופציונלי: `buildInvoicesAppendixPdf`
7. `mergePdfBuffers` – מחבר את כל ה-buffers ל-PDF אחד

### פונקציות משתתפות ב-server.js

| פונקציה | תפקיד |
|---------|--------|
| `buildReportHtml` | בונה HTML מלא מהדו"ח; משתמש ב-Handlebars + templateData |
| `getReportTemplate` | טוען ומקמפל את report-modern.html |
| `buildPreviousReportsData` | מכין נתוני דוחות קודמים |
| `buildTimelineData` | מכין אירועי ציר זמן |
| `buildProceduralTimelineView` | מכין תצוגת ציר הליך |
| `buildSectionsData` | מכין מערך סעיפים (כותרת, תוכן, expenses) |
| `buildPolicyAppendixIntroPdf` | יוצר דף "APPENDIX A – POLICY" ב-pdf-lib |
| `buildInvoicesAppendixPdf` | יוצר נספח חשבוניות (תמונות → דפים, PDFs → העתקת דפים) |
| `mergePdfBuffers` | מחבר buffers ל-PDF אחד |
| `renderReportPdf` | HTML → Playwright → Buffer |
| `buildFinalReportPdfWithPolicy` | מתאם: base + policy + invoices, ומחזיר PDF סופי |
| `getPolicyPdfBufferFromReport` | מחלץ Buffer מפוליסה בדו"ח |

---

## 2. תבניות ו-HTML

### תבנית

- **קובץ:** `templates/report-modern.html`
- **מיקום:** שורש הפרויקט
- **טעינה:** `getReportTemplate()` – קריאה ל-`Handlebars.compile` על הקובץ
- **קאש:** `compiledReportTemplate` מוחזק במשתנה גלובלי (קומפילציה פעם אחת)

### מבנה ה-HTML

- **Sections:** Cover (עמוד 1 + עמוד 2), Body (סעיפים), Signature
- **Headers:** אין header מותאם ל-PDF; `headerTemplate: '<div></div>'`
- **Footers:** מוגדרים ב-`page.pdf` – "Page X of Y" מימין
- **Appendices:** חשבוניות לא נכללות ב-HTML של ה-PDF; הן נחתכות (`invoiceFiles: []`) ונוספות כ-PDF נפרד

### Handlebars

- שימוש ב-`{{#if}}`, `{{#each}}` וכו'
- משתנים: `logoBase64`, `caseLabel`, `reportNumber`, `reportDate`, `odakanitNo`, `insurerName`, `insuredName`, `plaintiffName`, `reportReLine`, `coverSubtitle`, `sections`, `proceduralTimeline`, `executiveSummaryHtml`, `invoicesAppendixHtml`, `forPdf`, ועוד
- `forPdf: true` – מסתיר בלוק חתימה ו-badge בכיסוי (רק ב-PDF)

### הזרקת נתונים

- `templateData` נבנה ב-`buildReportHtml` מהדו"ח
- Claim, policy, timeline – דרך `buildTimelineData`, `buildProceduralTimelineView`, `buildPreviousReportsData`
- סעיפים – דרך `buildSectionsData` (מסדר לפי `selectedSections`, תוכן מ-`translatedContent` / `content`, expenses מ-`expensesHtml`)

---

## 3. עיצוב (CSS / Inline Styles)

### מקור ה-CSS

- **מיקום:** בתוך `report-modern.html` – בלוק `<style>` אחד גדול
- **סוג:** CSS רגיל (לא inline על אלמנטים)
- **משתנים:** `:root` מגדיר `--lp-navy`, `--lp-gold`, `--lp-orange`, `--lp-text`, `--lp-muted`, `--lp-border`, `--lp-bg`
- **גופנים:** `Segoe UI`, system-ui, Arial; `font-size: 11.5pt` לגוף

### מחלקות מרכזיות

| מחלקה | תפקיד |
|-------|--------|
| `cover-page`, `cover-page-1`, `cover-page-2` | עמודי כיסוי |
| `cover-logo`, `cover-title`, `cover-meta`, `cover-grid` | לוגו, כותרת, מטא-דאטה |
| `section-title`, `section-content`, `section-block` | כותרות ותוכן סעיפים |
| `expenses-table` | טבלת הוצאות |
| `timeline-page`, `timeline-vertical-item` | ציר הליך |
| `signature-block`, `signature-image` | חתימה |
| `appendix-block`, `appendix-item`, `appendix-pdf` | נספחים (לא בשימוש ל-PDF – החשבוניות ב-pdf-lib) |
| `page-break-after`, `break-inside: avoid` | שבירת עמודים |
| `@page { size: A4 }` | גודל עמוד |

### Page size, margins, fonts

- **@page:** `size: A4`
- **Margins:** מוגדרים ב-`page.pdf`: top 30mm, bottom 20mm, left 15mm, right 15mm
- **Fonts:** Segoe UI / Arial; גודל בסיס 11.5pt, כותרות עד 28pt

---

## 4. Playwright – רינדור PDF

### הגדרה

- **חבילה:** `playwright` (לא puppeteer)
- **Import:** `import { chromium } from 'playwright'`
- **Launch:** `chromium.launch({ headless: true, args: [...] })`
- **Args:** `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`
- **Browser path:** משתמש ב-`PLAYWRIGHT_BROWSERS_PATH` (מוגדר ב-Render)

### page.pdf options

| אופציה | ערך |
|--------|------|
| format | A4 |
| printBackground | true |
| preferCSSPageSize | true |
| displayHeaderFooter | true |
| timeout | 60000 |
| headerTemplate | `<div></div>` |
| footerTemplate | Page X of Y, יישור ימין |
| margin | top 30mm, bottom 20mm, left 15mm, right 15mm |

### לוגיקה מותנית

- אין תנאי לפי role או env בתוך `page.pdf`
- `executablePath` לא מוגדר – Playwright משתמש ב-PLAYWRIGHT_BROWSERS_PATH
- Timeouts: `page.setDefaultTimeout(90000)`, `page.setContent` 90000ms, `page.pdf` 60000ms

---

## 5. נקודות שינוי עתידיות

| שינוי | קובץ | אזור | רמת סיכון |
|-------|------|------|-----------|
| שינוי layout כיסוי | templates/report-modern.html | .cover-page-1, .cover-page-2, cover-card | בינוני – יש לבחון page-break ו-A4 |
| הסתרה/הצגה של סעיפים | server.js buildSectionsData, buildReportHtml | sections, templateData | נמוך – שליטה ב-selectedSections ובסדר |
| שינוי טיפוגרפיה | templates/report-modern.html | :root, font-size, .section-content | נמוך |
| הוספת watermark | templates/report-modern.html | style, body | בינוני – צריך להתאים ל-print |
| הסרת signature / barcode | server.js buildReportHtml, report-modern.html | templateData.forPdf, .signature-block | נמוך – כבר קיים forPdf |
| שינוי סדר פרקים | server.js buildSectionsData, normalizeSectionOrder | uniqueOrder | נמוך-בינוני – תלוי ב-selectedSections |
| גרסה מקוצרת | server.js buildReportHtml, buildSectionsData | אפשרות חדשה (למשל omitSections) | בינוני – יש להעביר פרמטר ולסנן סעיפים |

---

## 6. אזורים רגישים

### אסור לשבור

1. **מבנה HTML ל-PDF:** אין להכניס `<object data="data:application/pdf">` או חשבוניות כ-HTML לגוף הדו"ח – קיים guard שזורק שגיאה אם `hasAppendixInvoices || hasObjectTag || hasDataPdf`
2. **invoiceFiles: []:** ב-`renderReportPdf` חייבים להעביר `invoiceFiles: []` ל-buildReportHtml – חשבוניות רק ב-pdf-lib
3. **page.pdf margins:** שינוי margins משפיע על כמות תוכן בעמוד ועל שבירת עמודים
4. **preferCSSPageSize:** אם יוסר, גודל העמוד עלול להשתנות
5. **printBackground: true:** חיוני לרקעים וצבעים
6. **סדר ה-merge:** base → policy appendix → invoices appendix – יש debug שמשווה מספר דפים

### תלות ב-HTML structure

- כיתות כמו `section-title`, `section-content` – אם תשתפקנה, העיצוב יישבר
- `break-inside: avoid` על חתימה וסעיפים – חשוב לשמירה על קריאות
- `@page size: A4` – חייב להתאים ל-margins ב-`page.pdf`

### מה עלול לשבור PDF generation

- Timeout (90s content, 60s pdf) – דוחות ארוכים
- חסימת Playwright (Chrome לא מותקן, הנתיב שגוי)
- שגיאה ב-buildReportHtml – יזרוק HTML_GENERATION
- שגיאה ב-merge – fallback ל-base בלבד
- Policy/Invoices appendices – נכשלים בשקט (try/catch), לא מפילים את כל ה-flow

---

## 7. סיכום מנהלים

### פשוט לשינוי

- טיפוגרפיה (גודל גופן, משפחת גופן)
- טקסטים סטטיים (כותרות, labels)
- צבעים (CSS variables)
- הוספת/הסרת שדות בכיסוי (אם התבנית תומכת)
- הסתרת בלוקים קיימים (למשל signature דרך forPdf)

### מורכב

- שינוי layout כיסוי – דורש בדיקת page-breaks ו-A4
- הוספת watermark – יש להתאים ל-print media
- שינוי סדר פרקים – תלוי ב-selectedSections ובנרמול
- גרסה מקוצרת – דורשת פרמטר חדש וסינון סעיפים

### מסוכן

- שינוי מבנה HTML כך שיכלול חשבוניות/אובייקטים – Guard יזרוק שגיאה; יש לשמור על הפרדה
- הסרת `invoiceFiles: []` ב-renderReportPdf
- שינוי margins או format ב-page.pdf – משפיע על כל הדוח
- שינוי לוגיקת merge (סדר buffers)

### עדיף להשאיר כמו שהוא

- לוגיקת ה-merge וה-fallbacks
- Guard על היעדר invoice HTML ב-PDF
- מבנה appendices (policy + invoices)
- Playwright options (format, margins, printBackground, displayHeaderFooter)
