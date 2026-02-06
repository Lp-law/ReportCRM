# DRY RUN Phase 1 – Diagnostic Report

**תאריך:** פברואר 2025  
**הקשר:** DRY RUN אמיתי של פתיחת דיווח ראשון ע"י עורכת דין  
**מטרה:** איסוף מידע, מיפוי והסבר – ללא פתרונות, ללא קוד, ללא TODO

---

## Executive Summary

בדיקת הקוד חושפת את הזרימה הנוכחית של שלב 1 (Case Details) ואת הנקודות שבהן היא עשויה להישבר.  
הממצאים מראים:

- **INSURED NAME** – מתמלא מ-Policy דרך חילוץ AI + heuristic בשרת; ייתכן כישלון כאשר המסמך לא תואם את התבניות או כשאין OpenAI.
- **RE (Subject)** – נבנה אוטומטית רק כשיש **גם** Plaintiff **וגם** Insured; אם חסר אחד מהם – Subject לא מתעדכן.
- **Placeholder "e.g.,"** – מקורו בקוד הקריאה ל־`renderInputWithClear`; הערכים קבועים ב־App.tsx.
- **CLAIMANT / PLAINTIFF** – המצב הלא־נבחר מוגדר כ־`text-textMuted` על רקע כהה, מה שעלול לגרום לקושי בראייה.
- **שדות חובה לפי Policy (TEREM)** – אין לוגיקה שמבדילה בין תיק עם Policy לתיק בלי; הדרישה היחידה לשלב 1 היא Odakanit No.
- **ניגודיות בטקסט** – שדות הקלט יורשים צבע טקסט מנושא כהה; על רקע לבן של input הדבר יוצר טקסט אפור חלש.
- **Procedural Timeline** – טקסט עברי קבוע עם שילוב אנגלית ("Month/Year") ושימוש ב־HTML entity לגרשיים.

---

## 1. Case Details / Subject

### 1.1 INSURED NAME מתוך Policy

**מה אמור לקרות**

כשמעלים Policy Document, השרת מנתח את המסמך ומחלץ את שמות הצדדים. הערך של `insuredName` אמור להזין אוטומטית את שדה INSURED NAME.

**איך ממומש היום**

- **שרת:** `server.js` – endpoint `POST /api/extract-policy`:
  - ממיר קובץ לטקסט (PDF/DOCX/OCR).
  - כשיש OpenAI: מבקש מהמודל לחלץ JSON עם `insuredName`, `marketRef`, `lineSlipNo`.
  - תמיד מריץ `fallbackPolicyExtraction` – חילוץ heuristic:
    - `insured` / `insured name` / `insured name:` בטקסט
    - `client` / `policyholder` כ־fallback
  - מחזיר `merged.insuredName` (AI או heuristic, לפי מה שמצא).

- **לקוח:** `App.tsx` – `handlePolicyUpload`:
  - קורא ל־`extractPolicyData` (geminiService).
  - אם `extracted.insuredName` קיים: מעדכן `insuredName` ו־`reportSubject` דרך `maybeAutoFillSubject`.

**איפה זה עלול להישבר**

1. מסמכים שלא תואמים לתבניות ה-heuristic (למשל פורמט TEREM/עברית).
2. אין API key ל־OpenAI – אז נעשה רק heuristic.
3. שגיאות AI – אז יש fallback ל-heuristic בלבד.
4. טקסט לא ברור (OCR גרוע) – חילוץ נכשל.

---

### 1.2 RE (Subject) – בנייה ועדכון

**מה אמור לקרות**

Subject אמור להיבנות אוטומטית כ־"Party v. Insured" (למשל: "Mr. Levi v. Dr. Cohen") ולהיתעדכן כשמשתנים Plaintiff או Insured.

**איך ממומש היום**

- **`maybeAutoFillSubject`** (`App.tsx`):
  - בונה `"Party v. Insured"` **רק** כאשר **גם** `plaintiffName` **וגם** `insuredName` לא ריקים.
  - אם חסר אחד מהם – פונקציה מחזירה `updates` ללא שינוי ב־Subject.
  - Subject מתעדכן אוטומטית **רק** אם:
    - `reportSubject` ריק **או**
    - `isSubjectAuto === true` (לא ערכו ידנית).

- **בהעלאת Policy:**
  - אם יש `insuredName` בלבד: Subject לא יהפוך ל־"Party v. Insured".
  - אם `reportSubject` ריק – מכניסים רק `extracted.insuredName` כ־Subject זמני (לא "Party v. Insured").

**איפה זה נשבר**

- Subject מתעדכן רק כשיש **שניהם** – Plaintiff ו־Insured.
- אם עורכת הדין ממלאת Insured לפני Plaintiff (או להיפך) – Subject לא יתעדכן אוטומטית עד שימולאו שניהם.
- אם המשתמש ערך Subject ידנית (`isSubjectAuto = false`) – אין עדכון אוטומטי נוסף.

---

### 1.3 Placeholder "e.g.,"

**מה אמור לקרות**

Placeholder בשדות צריך להבהיר למשתמש מה להזין (למשל "e.g., Dr. Cohen").

**איך ממומש היום**

- `renderInputWithClear` מקבל `placeholder` כפרמטר.
- הערכים מועברים מהקריאה ב־App.tsx:
  - RE (Subject): `"e.g. John Doe v. XYZ Medical Center – Claim Update"`
  - INSURED NAME: `"e.g., Dr. Cohen"`
  - Party Name: `"e.g., Mr. Levi"`
  - Certificate Ref: `"e.g., 1/123"`
  - Line Slip No: `"e.g., B0180PD2391439"`
  - Odakanit No: `"e.g., 516902624"`
- אין default של ה־component – כל ה-placeholders קבועים בקוד.

**המסקנה**

- המקור הוא `App.tsx` – לא component חיצוני.
- לא נמצא שינוי ספציפי "לאחרונה" – אלה ערכים שנקבעו בקוד.

---

## 2. CLAIMANT / PLAINTIFF Selector

**מה אמור לקרות**

שני כפתורים: Plaintiff ו־Claimant. המשתמש בוחר אחד; המצב הנבחר והלא־נבחר אמורים להיות ברורים.

**איך ממומש היום**

- מיקום: `App.tsx` – בתוך ה-grid של Case Details.
- מבנה:
  - `<div className="flex bg-navySecondary rounded p-0.5">` – רקע `navySecondary` (#1E293B).
  - לכל כפתור:
    - **נבחר:** `bg-panel shadow text-lpBlue font-bold`
    - **לא נבחר:** `text-textMuted` בלבד (אין `bg` משלו, יורש רקע `navySecondary`).

**איפה זה נשבר**

- המצב הלא־נבחר: טקסט `text-textMuted` (#94A3B8) על רקע `navySecondary` (#1E293B).
- היחס בין הצבעים עלול לגרום לראות את הכפתור הלא־נבחר חלש מדי.
- אין הגדרה מפורשת לניגודיות מינימלית (WCAG).

---

## 3. Conditional Fields (לקוחות חריגים – TEREM)

**מה אמור לקרות**

לקוחות בלי Policy (למשל TEREM) מזינים Insured ידנית. השדות החובה אמורים להיות שונים:
- תמיד חובה: Odakanit No.
- תלוי Policy: שדות כמו INSURED NAME, Certificate Ref וכו'.

**איך ממומש היום**

- **אין לוגיקה ל־TEREM** – לא נמצאו תנאים לפי "אין Policy" או "Insured מוקלד ידנית".
- **אין הפרדה בין שדות חובה:**
  - `handleNextWithValidation` בודק **רק** `odakanitNo`.
  - אין בדיקה של `insuredName`, `policyFile`, `reportSubject` וכו' לפני מעבר לשלב הבא.
- **אין validation מותנה** – אין כלל "אם יש Policy – חובה X; אם אין – חובה רק Y".

**המסקנה**

- אין כיום תמיכה מוגדרת ב-flow ללקוחות בלי Policy.
- כל השדות (פרט ל־Odakanit No) אינם נבדקים לפני מעבר לשלב הבא.

---

## 4. Visual / Contrast Issues

**מה אמור לקרות**

טקסט מוקלד בשדות לבנים אמור להיות קריא היטב (ניגודיות מספקת).

**איך ממומש היום**

- **`renderInputWithClear`** – שדות קלט:
  - `className`: `border border-borderDark p-2 rounded focus:ring-2 focus:ring-lpBlue outline-none pr-8`
  - **אין** `text-*` מפורש – הצבע יורש מה־parent.
- **רקע body ותבנית כללית:**
  - `index.html`: `body` עם `dark:bg-gray-900 dark:text-slate-100`.
  - רוב הפאנלים משתמשים ב־`text-textLight`, `text-textMuted` וכו'.
- **רקע ה-input:** ברירת המחדל של הדפדפן – רקע לבן/בהיר.

**איפה זה נשבר**

- אם ה־parent (או body ב־dark mode) מקבל `text-textLight` או `text-slate-100` – ה-input יורש צבע טקסט בהיר/אפור.
- טקסט אפור/בהיר על רקע לבן של input – ניגודיות נמוכה.
- אין class כמו `text-gray-900` / `text-slate-900` על ה-input כדי לאלץ טקסט כהה.

**לא נמצא**

- אין `disabled` לא מכוון על השדות.
- אין class משותף ל-inputs שמגדיר במפורש צבע טקסט כהה.

---

## 5. Procedural Timeline – עברית משובשת

**מה אמור לקרות**

הטקסט מתחת ל־PROCEDURAL TIMELINE אמור להיות ברור וקריא, בעברית תקינה.

**איך ממומש היום**

- מיקום: `App.tsx` – מתחת לכותרת "Procedural Timeline".
- מחרוזת קבועה:  
  `"בחרי את סוג ההליך, השלב הנוכחי ותאריכי Month/Year שיופיעו בציר הזמנים הדו&quot;חי."`
- רכיב: `<p className="text-sm text-textMuted">` – טקסט עזר.

**מקורות אפשריים לבעיות**

1. **שילוב אנגלית:** "Month/Year" בתוך משפט עברי – עלול לגרום לחוסר אחידות ו-RTL לא אופטימלי.
2. **גרשיים:** `&quot;` משמש כ־HTML entity לגרשיים ב"דו"חי" – בדפדפנים מסוימים זה עשוי להופיע כ־`"` במקום גרש עברי (`״`), ולהראות מוזר בעברית.
3. **RTL/Encoding:** אין שגיאת encoding ברורה; הבעיה העיקרית היא בחירת התווים (גרשיים) ושילוב שפות.

---

## סיכום

### מה ברור

- זרימת חילוץ INSURED: שרת → AI/heuristic → עדכון דרך `handlePolicyUpload` ו־`maybeAutoFillSubject`.
- Subject נבנה רק כשיש גם Plaintiff וגם Insured; אחרת – אין עדכון אוטומטי.
- Placeholders מוגדרים ידנית ב־App.tsx.
- Plaintiff/Claimant: unselected משתמש ב־`text-textMuted` על רקע כהה.
- אין לוגיקה מותנית ל־Policy / TEREM – validation לשלב 1 הוא רק Odakanit No.
- inputs יורשים צבע טקסט מה־parent, מה שעלול לגרום לניגודיות נמוכה על רקע לבן.
- הטקסט ב־Procedural Timeline קבוע, מעורב עברית+אנגלית, ועם גרשיים באמצעות `&quot;`.

### מה לא ברור

- האם בעבר הייתה לוגיקה נפרדת ל־TEREM או ללקוחות בלי Policy.
- האם ה־"e.g.," נחשב לבעיה או סתם סגנון – אין הקשר ברור.
- האם הבעיה ב־Procedural Timeline היא RTL, תרגום, או רק בחירת תווים (גרשיים).
- האם dark mode פעיל תמיד אצל המשתמשת – משפיע על ירושת הצבעים ב־inputs.

### נקודות שדורשות החלטה לפני תיקון

1. **Policy vs. No-Policy:** האם יש להגדיר flow נפרד ללקוחות בלי Policy (כמו TEREM), כולל שדות חובה שונים?
2. **Subject:** האם Subject צריך להתעדכן גם כשיש רק Insured (או רק Plaintiff), או להישאר דורש את שניהם?
3. **Placeholder:** האם ה־"e.g.," צריך להשתנות או להיעלם – או שזה לא באג אלא החלטת UX?
4. **ניגודיות:** האם לתקן ב־inputs (למשל `text-gray-900` מפורש), או לשנות תבנית צבעים גלובלית?
5. **Procedural Timeline:** האם להחליף "Month/Year" בעברית, ו־`&quot;` בגרש עברי `״`?

---

*מסמך אבחון בלבד – ללא פתרונות, ללא TODO, ללא קוד.*
