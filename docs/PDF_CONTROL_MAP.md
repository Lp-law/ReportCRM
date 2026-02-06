# מפת שליטה עיצובית – יצירת PDF

מסמך הבנה בלבד. אין קוד. אין שינויים. אין הצעות עיצוב.

**מטרה:** לאפשר כתיבת פרומפטי ביצוע מדויקים לכל שינוי ויזואלי, ללא ניחושים וללא סיכון לשבירת PDF.

---

## 1. מפת שליטה עיצובית

### קובץ אחד מרכזי

**`templates/report-modern.html`** – אחראי על כל האלמנטים הוויזואליים בתוכן ה-PDF:
- HTML (מבנה, אלמנטים)
- CSS (בלוק `<style>` בתוך `<head>`)

### פיצול אחריות

| רכיב | קובץ | אחראי על |
|------|------|----------|
| מבנה ותוכן | report-modern.html | Cover 1+2, Timeline, Body, Sections, Tables, Signature |
| עיצוב (צבעים, טיפוגרפיה, ריווח) | report-modern.html (בלוק style) | כל המראה הפנימי |
| גודל עמוד, margins, header/footer | server.js – `page.pdf` | שטח הדף, מספור עמודים |
| לוגו, חתימה (תמונות) | server.js – `buildReportHtml` | הזרקת base64 לתבנית |

### HTML, CSS, Playwright – מי שולט על מה

- **HTML:** קובע *מה* מוצג (אלמנטים, סדר, תנאים Handlebars)
- **CSS:** קובע *איך* זה נראה (גודל, צבע, ריווח, שבירת עמוד)
- **Playwright:** קובע את *המסגרת* (גודל A4, margins כללים, header/footer קבוע)

---

## 2. היררכיית אחריות

### נשלט ע"י HTML בלבד

- נוכחות/היעדרות אלמנטים (למשל `{{#if coverSubtitle}}`)
- סדר האלמנטים בעמוד
- מבנה הטבלאות (thead, tbody, tfoot)
- מבנה הסעיפים (`.section-block` עם title + content)

### נשלט ע"י CSS בלבד

- צבעים (משתני `:root`)
- font-family, font-size, line-height
- margins, padding, gaps
- page-break-*, break-inside
- גודל לוגו (max-height, max-width)
- עיצוב טבלאות (borders, רקע)

### מושפע מהגדרות Playwright

- **margins:** top 30mm, bottom 20mm, left/right 15mm – קובעים שטח התוכן בכל עמוד
- **page size:** A4 – יחד עם `preferCSSPageSize`
- **header:** ריק (`<div></div>`)
- **footer:** "Page X of Y" – טקסט, גופן, יישור

---

## 3. Cover Pages

### מבנה עמוד 1

- `.cover-page-1` – כל העמוד
- לוגו: `.cover-logo` (max-height 32mm, max-width 70mm)
- כותרות: `.cover-confidential-label`, `.cover-title`, `.cover-subtitle-secondary`
- מטא: `.cover-meta` – Report No., Date
- badge: `.cover-badge` – תמונת base64, נדחפת לתחתית (`margin-top: auto`)

### מבנה עמוד 2

- `.cover-page-2`
- `.cover-card` – רקע אפור, border, padding
- Re: line, Claim Details (cover-grid), previous reports, procedural timeline graphic

### מה אפשר לעשות

| פעולה | איפה | רמת סיכון |
|-------|------|-----------|
| **להסתיר** | להוסיף `{{#unless forPdf}}` סביב בלוק (forPdf כבר מועבר) | נמוך |
| **להזיז** | שינוי סדר HTML או CSS (flex/grid, margin) | בינוני – יש לבדוק התאמה ל-A4 |
| **להגדיל** | `.cover-logo` max-height/max-width, `.cover-badge img` | נמוך – לוודא שהתמונה לא תעקף |
| **להסיר** | מחיקת בלוק HTML או עטיפה ב-`{{#if}}` | נמוך |

### מסוכן לשינוי

- הסרת `.page-break-after` בין Cover 1 ל-2 – משבש את חלוקת העמודים
- שינוי padding ב-`.cover-page-1` באופן קיצוני – עלול לדחוף תוכן לעמוד נוסף
- שינוי מבנה `.cover-card` – עלול לשבור את ה-grid ואת ה-timeline graphic

---

## 4. טיפוגרפיה

### איפה מגדירים

| הגדרה | מיקום |
|-------|-------|
| font-family | `body` – report-modern.html בלוק style |
| font-size | `body` (11.5pt), `.section-content`, `.cover-title`, `.section-title`, `.expenses-table` וכו' |
| line-height | `body` (1.5) |
| hierarchy | font-size + font-weight + letter-spacing בכותרות (`.cover-title` 28pt, `.section-title` 11pt וכו') |

### מה בטוח לשינוי

- font-family ב-body
- font-size בגוף טקסט ובכותרות
- line-height
- letter-spacing, font-weight בכותרות

### מה עלול לשבור זרימה

- הורדה משמעותית של font-size – עלולה להרחיב תוכן ולגרום לשבירת עמודים לא צפויה
- שינוי line-height קיצוני – משפיע על כמות טקסט בעמוד
- שינוי hierarchy כך שכותרות קטנות מגוף – שובר קריאות

---

## 5. ריווחים ושבירות עמוד

### איך נשלטים page-breaks

- **`.page-break-after`** – `page-break-after: always` – יוצר שבירת עמוד אחרי האלמנט (בין Cover 1↔2, 2↔Timeline, Timeline↔Body)
- **`page-break-before`** – ב-`.appendix-block`, `.appendix-item`
- **`break-inside: avoid`** – מונע פיצול אלמנט: `.signature-block`, `.timeline-section`, `.timeline-graphic`, `.section-title` (break-after: avoid)

### class-ים קריטיים

- `.page-break-after` – לא להסיר
- `.signature-block` – חייב `break-inside: avoid`
- `.section-title` – `break-after: avoid` – מונע כותרת יתומה בתחתית עמוד
- `orphans: 3`, `widows: 3` על `.section-content p, li` – מניעת שורות בודדות

### מה יגרום לשבירת עמוד לא רצויה

- הסרת `break-inside: avoid` מ-`.signature-block` – חתימה יכולה להיחצות
- הסרת `break-after: avoid` מ-`.section-title` – כותרת תישאר לבד בתחתית עמוד
- הגדלה משמעותית של margin/padding – דוחקת תוכן ויוצרת שבירות נוספות
- שינוי margins ב-Playwright – משנה שטח כל עמוד ומשפיע על כל השבירות

---

## 6. אלמנטים מיוחדים

### Cover badge

- בלוק: `div.cover-badge` עם תמונת base64
- ממוקם בתחתית Cover 1 (`margin-top: auto`)
- תמונה מוטמעת בקובץ HTML – אין קובץ נפרד

### Signature

- `.signature-block` – `break-inside: avoid`
- `.signature-image` – max-height 28mm
- תמונת חתימה מוזרקת מ-server (SIGNATURE_BASE64)

### איך להסתירם רק ב-PDF

- **תשתית קיימת:** `forPdf` מועבר ל-`templateData` ב-`buildReportHtml` כאשר `options.forPdf === true`
- **מיקום:** server.js – `buildReportHtml(..., { forPdf: true })` נקרא מ-`renderReportPdf`
- **חסר:** בתבנית אין תנאי `{{#unless forPdf}}` – המשתנה עובר אך לא מנוצל
- **לביצוע בעתיד:** עטיפת `.cover-badge` ו-`.signature-block` ב-`{{#unless forPdf}}...{{/unless}}` בתבנית

---

## 7. טבלאות

### מבנה

- `.expenses-table` – טבלת הוצאות
- thead עם שלוש עמודות: Date, Description, Amount
- tbody – שורות מהנתונים
- tfoot – Total Balance (אם קיים)
- `.amount-col` – עמודת סכום – `text-align: right`, `white-space: nowrap`
- `.recommendation` – שורת המלצה מתחת לטבלה

### מה בטוח לשינוי ויזואלי

- צבעי borders (משתנה `--lp-border`)
- רקע thead
- font-size בטבלה (9.5pt)
- padding בתאים
- עיצוב `.recommendation`

### מה עלול לפגוע ביישור או חישובים

- **לא משפיע על חישובים** – הסכומים מגיעים מהשרת, אין חישוב ב-CSS
- **יישור:** `.amount-col` עם `text-align: right` – שינוי עלול לשבור יישור סכומים
- הסרת `white-space: nowrap` מעמודת Amount – עלול לשבור מספרים ארוכים

---

## 8. אזורי סיכון

### בטוח

- שינוי משתני `:root` (צבעים)
- font-family, font-size, letter-spacing, font-weight
- max-height, max-width של `.cover-logo`
- צבעי borders ורקעים בטבלאות
- padding פנימי בתוך בלוקים (במסגרת סיבונית)

### רגיש

- padding/margin בכיסוי – יכול להשפיע על התאמה ל-A4
- margin-bottom ב-`.section-block` – משפיע על שבירת עמודים בין סעיפים
- גודל `.cover-badge` – תמונה קבועה, שינוי דורש התאמה
- max-height של `.timeline-graphic-image` (80mm) – מכוון להתאמה בעמוד 2

### מסוכן

- שינוי או הסרת `break-inside`, `page-break-*` – עלול לשבור אלמנטים או ליצור יתומים
- שינוי margins ב-`page.pdf` ב-server.js – משפיע על כל הדוח
- הסרת `invoiceFiles: []` לפני `buildReportHtml` – guard יזרוק שגיאה
- שינוי מבנה Handlebars של sections – `buildSectionsData` מניח מבנה קבוע
- הוספת `<object>` או `data:application/pdf` ל-HTML – guard יזרוק שגיאה

---

## 9. סיכום מנהלים

### "אם רוצים לעשות שינוי X – נוגעים פה"

| שינוי | קובץ | אזור |
|-------|------|------|
| צבעים | report-modern.html | משתני `:root` |
| גודל לוגו | report-modern.html | `.cover-logo` |
| גופנים, גודלי כותרת | report-modern.html | `body`, `.section-title`, `.cover-title` וכו' |
| עיצוב טבלאות | report-modern.html | `.expenses-table`, thead, `.amount-col` |
| הסתרת badge/חתימה ב-PDF | report-modern.html | עטיפה ב-`{{#unless forPdf}}` |
| ריווח פנימי (במסגרת) | report-modern.html | padding, margin של בלוקים |

### "אם רוצים לעשות שינוי Y – אסור לגעת פה"

| שינוי | אסור | סיבה |
|-------|------|------|
| margins כללים של הדף | server.js – `page.pdf` margin | משפיע על כל העמודים |
| format A4 | server.js – `page.pdf` format | יסוד הרינדור |
| printBackground | server.js – `page.pdf` | בלי זה רקעים נעלמים |
| preferCSSPageSize | server.js – `page.pdf` | כיבוד @page |
| break-inside, page-break | report-modern.html | שובר שבירת עמודים |
| מבנה sections (Handlebars) | report-modern.html | תלוי ב-buildSectionsData |
| invoiceFiles ב-HTML | server.js – renderReportPdf | guard מונע, חשבוניות ב-pdf-lib |

### קובץ מרכזי לרוב השינויים הוויזואליים

**`templates/report-modern.html`** – כאן מתבצעים כמעט כל השינויים העיצוביים. server.js נוגע רק כשנדרש שינוי ב-margins, format, או לוגיקת הזרקת נתונים.
