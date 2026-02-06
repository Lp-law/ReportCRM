# הסבר מלא – מנגנון יצירת PDF (עיצוב, CSS, Layout)

מסמך הבנה בלבד. אין קוד. אין הצעות. אין שינוי לוגיקה.

---

## 1. מבנה כללי

### Flow מלחיצה על "Download PDF" עד יצירת הקובץ

1. **UI:** כפתור Download PDF → `handleDownloadPdf` → `performDownloadPdf` → `fetchReportPdf(report)`
2. **API:** POST `/api/render-report-pdf` עם גוף `{ report }`
3. **Server:** `buildFinalReportPdfWithPolicy(report)` מנהל את כל הרכבת ה-PDF
4. **HTML:** `buildReportHtml(safeReportForHtml, { forPdf: true })` – הדו"ח מועבר עם `invoiceFiles: []` (חשבוניות נחתכות)
5. **רינדור:** Playwright – `chromium.launch` → `page.setContent(html)` → `page.pdf(...)`
6. **נספחים:** אם קיימת פוליסה – `buildPolicyAppendixIntroPdf` + policy PDF. אם קיימות חשבוניות – `buildInvoicesAppendixPdf`
7. **מיזוג:** `mergePdfBuffers` מחבר: base report + policy appendix + invoices appendix

### פונקציות אחראיות

| תפקיד | פונקציה | קובץ |
|-------|---------|------|
| HTML | `buildReportHtml`, `getReportTemplate`, `buildSectionsData`, `buildProceduralTimelineView`, `buildPreviousReportsData`, `buildTimelineData` | server.js |
| עיצוב | כל ה-CSS בתוך `templates/report-modern.html` בבלוק `<style>` | report-modern.html |
| רינדור | `renderReportPdf` – Playwright `page.pdf` | server.js |
| חיבור נספחים | `mergePdfBuffers`, `buildPolicyAppendixIntroPdf`, `buildInvoicesAppendixPdf` | server.js |

---

## 2. תבנית ה-HTML (report-modern.html)

### מיפוי המבנה

| בלוק | מחלקות ראשיות | תוכן |
|------|----------------|------|
| **Cover Page 1** | `.page.cover-page.cover-page-1` | לוגו, כותרת, CONFIDENTIAL, מטא-דאטה (Report No., Date), badge תמונה |
| **Cover Page 2** | `.page.cover-page.cover-page-2` | Re: line, Claim Details (cover-card), previous reports, procedural timeline graphic |
| **Timeline Page** | `.page.timeline-page` | עמוד ייעודי לציר הליך אנכי (stages) – רק אם `proceduralTimeline` קיים |
| **Body** | `.page.body-root` | Executive Summary, סעיפים (sections), נספח חשבוניות (אם קיים ב-HTML), חתימה |
| **Appendices** | לא ב-HTML ל-PDF | פוליסה וחשבוניות נבנים ב-pdf-lib ומוצמדים ל-PDF |

### חלקי Cover

- **Cover 1:** `.cover-header`, `.cover-logo-center`, `.cover-logo-wrapper`, `.cover-logo` (max-height 32mm, max-width 70mm)
- **Cover 1:** `.cover-title-block`, `.cover-confidential-label`, `.cover-title`, `.cover-subtitle-secondary`
- **Cover 1:** `.cover-meta`, `.cover-meta-row`, `.cover-meta-label`, `.cover-meta-value`
- **Cover 1:** `.cover-badge` – תמונת badge (base64) – `margin-top: auto` לדחיפה לתחתית
- **Cover 2:** `.cover-card` – רקע, border, padding. כולל `.cover-re-line`, `.cover-section-title`, `.cover-grid`, previous reports, timeline graphic

### Sections

- כל סעיף: `.section-block` עם `.section-title` (`.section-title-inner` עם קו תחתון)
- תוכן: `.section-content` – גוף טקסט, RTL, justification
- סעיף הוצאות: `.expenses-table`, `.amount-col`, `.recommendation`
- Executive Summary: `.exec-summary`, `.exec-summary-title`, `.exec-summary-content`

### Tables

- `.expenses-table` – `border-collapse`, thead עם רקע, `font-size: 9.5pt`
- `.amount-col` – יישור ימין, `white-space: nowrap`

### Signature

- `.signature-block` – `break-inside: avoid`
- `.signature-image` – max-height 28mm
- `.signature-fallback`, `.signature-name` – גופן כתיבה

### Appendices (ב-HTML – לא בשימוש ל-PDF)

- `.appendix-block`, `.appendix-item`, `.appendix-pdf` – חשבוניות ב-PDF מוזרמות דרך pdf-lib, לא דרך HTML

### בלוקים הנשלטים ע"י forPdf

- `forPdf` מועבר ל-`templateData` ב-`buildReportHtml` כאשר `options.forPdf === true`
- התבנית מקבלת את המשתנה אך אין בה (כרגע) תנאי Handlebars המסתירים אלמנטים לפי `forPdf`
- לפי הערה ב-server: "When true, omit signature block and cover badge from PDF output only" – הכוונה עתידית או לוגיקה שלא מיושמת בתבנית

---

## 3. CSS ועיצוב

### מיקום ה-CSS

- **סוג:** בלוק `<style>` אחד בתוך `<head>` של `report-modern.html`
- **אין:** CSS חיצוני, אין inline styles על אלמנטים (מלבד `footerTemplate` של Playwright)

### משתני צבע (:root)

| משתנה | ערך |
|-------|------|
| `--lp-navy` | #0b1f3b |
| `--lp-gold` | #b08d57 |
| `--lp-orange` | #d97706 |
| `--lp-text` | #0f172a |
| `--lp-muted` | #475569 |
| `--lp-border` | #e2e8f0 |
| `--lp-bg` | #f6f8fb |

### מחלקות קריטיות שאסור לשבור

- `.cover-page`, `.cover-page-1`, `.cover-page-2` – מבנה כיסוי דו-עמודי
- `.section-title`, `.section-content`, `.section-block` – מבנה הסעיפים
- `.expenses-table`, `thead`, `.amount-col` – מבנה טבלת הוצאות
- `.signature-block` – כולל `break-inside: avoid`
- `.page-break-after` – שבירת עמודים
- `@page { size: A4 }` – גודל עמוד

### מחלקות "בטוחות" לשינוי ויזואלי

- צבעים דרך משתני `:root`
- `.cover-logo` – max-height, max-width (לשינוי גודל לוגו)
- `.cover-title`, `.cover-subtitle-secondary` – טיפוגרפיה
- `.section-content` – font-size, line-height
- `.expenses-table` – צבעי גבול, רקע thead
- `.cover-grid`, `.cover-meta-row` – ריווחים (gap, padding)

---

## 4. טיפוגרפיה

### font-family

- **גוף:** `"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, "Inter", Arial, sans-serif`
- **חתימה (fallback):** `"Segoe Script", "Lucida Handwriting", cursive`

### font-size

| אלמנט | גודל |
|-------|------|
| body | 11.5pt |
| .section-content | 10.5pt |
| .cover-title | 28pt |
| .cover-subtitle-secondary | 16pt |
| .cover-meta-row, .cover-procedural-stage | 10pt |
| .cover-grid | 12pt |
| .section-title | 11pt |
| .exec-summary-content | 10.5pt |
| .expenses-table | 9.5pt |
| .timeline-* | 9.5pt–10pt |

### line-height

- **גוף:** `1.5`

### היררכיה

- **כותרות ראשיות:** `.cover-title` 28pt, `.timeline-page-title` 18pt
- **כותרות משניות:** `.cover-section-title`, `.section-title` – 14pt / 11pt, uppercase, letter-spacing
- **גוף טקסט:** 10.5pt–11.5pt
- **טקסט משני:** labels ב-9pt–10pt, `--lp-muted`

---

## 5. ריווחים ו-Layout

### margins

- **@page:** אין margins ב-CSS – נשלטים ב-`page.pdf`:
  - top: 30mm
  - bottom: 20mm
  - left: 15mm
  - right: 15mm
- **Cover:** `.cover-page` padding 20mm 18mm; `.cover-page-1` 24mm 18mm 20mm; `.cover-page-2` 16mm 18mm 18mm
- **Body:** `.body-root` padding-top 4mm, left/right 18mm, bottom 18mm

### padding

- `.cover-card` – 9mm
- `.section-block` – padding-top 3mm, margin-bottom 10mm
- `.exec-summary` – 6mm

### page-breaks

- `.page-break-after` – `page-break-after: always` (בין Cover 1↔2, Cover 2↔Timeline, Timeline↔Body)
- `.appendix-block`, `.appendix-item` – `page-break-before: always`
- `.section-title` – `break-after: avoid`, `page-break-after: avoid`
- `.signature-block` – `break-inside: avoid`
- `.section-content p, .section-content li` – `orphans: 3`, `widows: 3`
- `.timeline-section`, `.timeline-graphic` – `page-break-inside: avoid`

### נקודות רגישות לשבירת עמודים

- שינוי `margin-bottom` ב-`.section-block` – משפיע על איפה מתחיל סעיף חדש
- שינוי padding ב-`.cover-page-1` – עלול לדחוף תוכן לעמוד נוסף או לקצר
- הסרת `break-inside: avoid` מ-`.signature-block` – חתימה עלולה להיחצות
- שינוי margins ב-`page.pdf` – משנה את שטח התוכן בכל עמוד

---

## 6. Playwright ו-PDF

### הגדרות המשפיעות על מראה

| הגדרה | ערך | השפעה |
|-------|------|-------|
| format | A4 | גודל עמוד |
| printBackground | true | רקעים וצבעים מודפסים |
| preferCSSPageSize | true | כיבוד @page size: A4 מה-CSS |
| displayHeaderFooter | true | header ו-footer בעמוד |
| margin | top 30mm, bottom 20mm, left/right 15mm | שטח התוכן |
| headerTemplate | `<div></div>` | header ריק |
| footerTemplate | Page X of Y, יישור ימין, font-size 8px | מספור עמודים |

### מה לא לגעת כדי לא לשבור PDF

- `printBackground: true` – בלי זה רקעים נעלמים
- `preferCSSPageSize: true` – חיוני ל-A4
- margins – שינוי משפיע על כל הדוח
- `displayHeaderFooter` – כיבוי מסיר מספור עמודים

---

## 7. אזורי סיכון

### בטוח לשינוי עיצובי

- עדכון משתני `:root` (צבעים)
- שינוי `font-size`, `font-family` בגוף ובכותרות
- שינוי `max-height`, `max-width` של `.cover-logo`
- התאמת `letter-spacing`, `font-weight` בכותרות
- שינוי צבעי borders וצבעי רקע בטבלאות

### רגיש

- שינוי padding/margin בכיסוי – עלול לשנות התאמה לעמוד A4
- שינוי `.section-block` margin – משפיע על שבירת עמודים
- שינוי `.cover-badge` – תמונת badge קבועה; שינוי גודל דורש התאמת תמונה
- `.timeline-graphic-image` – max-height 80mm מכוון להתאמה בעמוד 2

### מסוכן

- שינוי `break-inside`, `page-break-*` – עלול לגרום לשבירת אלמנטים או orphan/widow
- שינוי margins ב-`page.pdf` – משפיע על כל הדוח
- הסרת `invoiceFiles: []` לפני `buildReportHtml` – guard יזרוק שגיאה אם חשבוניות ב-HTML
- שינוי מבנה Handlebars של sections – `buildSectionsData` מניח מבנה מסוים

---

## 8. סיכום – נקודות כניסה לשינויים עתידיים

### להסרת אלמנט עיצובי

- **קובץ:** `templates/report-modern.html`
- **אזור:** בלוק ה-HTML הרלוונטי (למשל `.cover-badge`, `.signature-block`)
- **הערה:** אם צריך הסרה רק ב-PDF – יש להוסיף תנאי `{{#unless forPdf}}` בתבנית (forPdf כבר מועבר)

### להגדלת לוגו

- **קובץ:** `templates/report-modern.html`
- **אזור:** `.cover-logo` – `max-height: 32mm`, `max-width: 70mm`
- **שינוי:** העלאת הערכים; יש לוודא שהתמונה לא תעקף את שטח הכיסוי

### לשיפור היררכיה טיפוגרפית

- **קובץ:** `templates/report-modern.html`
- **אזור:** `:root`, `body`, `.section-title`, `.section-content`, `.cover-title`, `.cover-section-title`
- **שינוי:** font-size, font-weight, letter-spacing, line-height

### לליטוש טבלאות

- **קובץ:** `templates/report-modern.html`
- **אזור:** `.expenses-table`, `thead`, `td`, `th`, `.amount-col`, `.recommendation`
- **שינוי:** borders, padding, רקע, גופנים

### למיזוג כל השינויים

- **קבצים עיקריים:** `templates/report-modern.html` (עיצוב ותוכן), `server.js` (לוגיקה, buildReportHtml, renderReportPdf)
- **נקודת התחלה מומלצת:** `report-modern.html` – רוב השינויים הוויזואליים מתבצעים שם
