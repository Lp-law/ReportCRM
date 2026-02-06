# DRY RUN Phase 1 – Cursor Diagnosis

**תאריך:** פברואר 2025  
**הקשר:** DRY RUN אמיתי – פתיחת דיווח ראשון ע"י עורכת דין  
**מטרה:** אבחון בלבד – ללא קוד, ללא פתרונות, ללא הצעות UX

---

## 1. Executive Summary

המערכת מבוססת על theme כהה גלובלי (body: `bg-bgDark` + `text-textLight`). אין הבחנה בין תיק עם Policy לתיק בלי – הכול קשיח. Subject נבנה אוטומטית רק כשיש **גם** Plaintiff **וגם** Insured; INSURED מגיע רק מהעלאת Policy. בעיות הניגודיות נגרמות מירושת צבע טקסט ל-inputs; בעיית CLAIMANT/PLAINTIFF – מצב unselected עם `text-textMuted` על רקע כהה. טקסט Procedural Timeline קבוע בקוד עם `&quot;` וערבוב עברית/אנגלית.

---

## 2. טבלה: בעיה → מקור בקוד → סוג כשל

| בעיה | מקור בקוד | סוג כשל |
|------|-----------|---------|
| מילוי אוטומטי INSURED נשבר | `server.js` extract-policy + fallbackPolicyExtraction; `App.tsx` handlePolicyUpload | Data flow – חילוץ תלוי פורמט מסמך ו-AI |
| Subject לא נבנה Party v. Insured | `App.tsx` maybeAutoFillSubject – דורש hasBoth | Data flow – תנאי קשיח |
| שדות חובה גם בלי Policy | `App.tsx` handleNextWithValidation – בודק רק odakanitNo | חוסר החלטה עסקית מקודדת |
| ניגודיות טקסט בשדות לבנים | `index.css` body text-textLight; `renderInputWithClear` בלי text-* על input | UX בלבד – ירושת צבע |
| CLAIMANT/PLAINTIFF לא קריא | `App.tsx` כפתור unselected: text-textMuted על bg-navySecondary | UX בלבד – עיצוב |
| טקסט עברי משובש ב-Procedural Timeline | `App.tsx` מחרוזת קבועה עם &quot; ו-Month/Year | UX בלבד – hard-coded |

---

## 3. פירוט לפי סעיפים

### 3.1 לכל בעיה: איפה נקבע, flow מקורי, trigger, סיווג

#### מילוי אוטומטי INSURED נשבר

- **איפה נקבע:** `server.js` – `POST /api/extract-policy`; `fallbackPolicyExtraction`; `App.tsx` – `handlePolicyUpload` שקורא ל־`extractPolicyData` ומעדכן רק אם `extracted.insuredName` קיים.
- **Flow מקורי:** העלאת קובץ → OCR/טקסט → AI או heuristic → JSON עם insuredName → עדכון state.
- **Trigger:** מסמך לא תואם (עברית, TEREM, פורמט שונה); אין OpenAI; AI מחזיר ריק; OCR גרוע.
- **סוג:** Data flow – הנתון לא מגיע כי החילוץ נכשל או לא מתבצע.

---

#### Subject לא נבנה

- **איפה נקבע:** `App.tsx` – `maybeAutoFillSubject` – `hasBoth = !!nextPlaintiff && !!nextInsured`; אם לא – מחזיר updates ללא reportSubject.
- **Flow מקורי:** עדכון plaintiffName או insuredName → maybeAutoFillSubject → אם יש שניהם → `"Party v. Insured"`.
- **Trigger:** עורכת דין ממלאת Insured לפני Party (או להיפך); או ממלאת ידנית – Subject לא מתעדכן עד שיש שניהם.
- **סוג:** Data flow – תנאי hasBoth מונע בנייה חלקית.

---

#### שדות חובה כשאין Policy

- **איפה נקבע:** `App.tsx` – `handleNextWithValidation` – בודק רק `odakanitNo`.
- **Flow מקורי:** אין flow מותנה – אין בדיקה של policyFile או insuredName.
- **Trigger:** מעבר לשלב 2 – תמיד עובר אם יש Odakanit No, גם בלי Policy.
- **סוג:** חוסר החלטה עסקית – אין כלל מקודד שמבדיל Policy/No-Policy.

---

#### ניגודיות טקסט בשדות

- **איפה נקבע:** `index.css` – body מקבל `text-textLight`; `App.tsx` – `renderInputWithClear` – input ללא `text-*` מפורש.
- **Flow מקורי:** body מכתיב צבע גלובלי; input יורש; רקע input הוא default של הדפדפן (לבן).
- **Trigger:** כל שימוש ב-input – צבע יורש מ־body, טקסט אפור על רקע לבן.
- **סוג:** UX בלבד – עיצוב, אין לוגיקה שבורה.

---

#### CLAIMANT/PLAINTIFF לא קריא

- **איפה נקבע:** `App.tsx` – כפתורים עם `data.plaintiffTitle === 'Plaintiff' ? 'bg-panel...' : 'text-textMuted'` – unselected מקבל רק text-textMuted.
- **Flow מקורי:** בחירת Plaintiff או Claimant – state משתנה; כפתור נבחר מקבל bg-panel; לא נבחר – text-textMuted בלבד.
- **Trigger:** מצב unselected – טקסט אפור על רקע navySecondary.
- **סוג:** UX בלבד – עיצוב; state logic תקין.

---

#### טקסט עברי משובש ב-Procedural Timeline

- **איפה נקבע:** `App.tsx` – מחרוזת קבועה ב־JSX.
- **Flow מקורי:** אין – hard-coded.
- **Trigger:** תצוגת הרכיב – הטקסט תמיד זהה.
- **סוג:** UX בלבד – בחירת תווים ושפה בקוד.

---

### 3.2 Policy / No-Policy

**איך המערכת כרגע מבינה שיש Policy**

- דרך `data.policyFile` – מוגדר רק כשמעלים קובץ ב־handlePolicyUpload.
- אין שדה "אין Policy" או "לקוח חריג" – אין state ייעודי.

**מה קורה כשאין Policy**

- `policyFile` נשאר `undefined`.
- אין קריאה ל-extract-policy – אין מילוי אוטומטי ל-insuredName, marketRef וכו'.
- השדות נשארים ריקים; המשתמש יכול להקליד ידנית.
- handleNextWithValidation לא בודק policyFile – המעבר לשלב הבא מותר.

**אילו שדות תלויים בפועל**

- מילוי אוטומטי: insuredName, marketRef, lineSlipNo, certificateRef, policyPeriodStart/End, retroStart/End – כולם תלויים בהעלאת Policy.
- אין שדה שמשנה התנהגות לפי "יש/אין Policy" – אין הצגה/הסתרה מותנית, אין validation מותנה.

**האם קיימת לוגיקה מותנית**

- לא. הכול קשיח: אותן שדות, אותם placeholders, אותו validation (רק Odakanit No).

---

### 3.3 Subject ו-Auto-fill

**מאיפה אמור להגיע INSURED NAME**

- מהעלאת Policy – `handlePolicyUpload` → `extractPolicyData` → `extracted.insuredName`.
- אין מקור אחר – לא מ-Finance, לא מ-Odakanit.

**מאיפה אמור להגיע PARTY NAME (plaintiffName)**

- הקלדה ידנית בלבד – `renderInputWithClear` עם `updateData(maybeAutoFillSubject({ plaintiffName: val }))`.
- אין מילוי אוטומטי מ-Policy או ממקור אחר.

**איך בעבר נבנה RE (Subject) = Party v. Insured**

- `maybeAutoFillSubject` בונה `"${normalizedParty} v. ${normalizedInsured}"` **רק** כש־`hasBoth` – כלומר `!!nextPlaintiff && !!nextInsured`.
- אם חסר אחד – הפונקציה מחזירה updates ללא שינוי ב-reportSubject.

**מה התנאי שמונע את זה עכשיו**

- `hasBoth === false` – חסר plaintiffName או insuredName.
- סדר המילוי לא משנה – שני השדות חייבים להיות לא ריקים.

**האם זה תלוי Policy / OCR / State / Effect**

- Policy: כן – INSURED מגיע רק מ-Policy; בלי Policy אין מילוי.
- OCR: כן – חילוץ Policy תלוי באיכות הטקסט.
- State: כן – Subject מתעדכן רק אם `isSubjectAuto !== false` ו־(reportSubject ריק או isAuto).
- Effect: כן – maybeAutoFillSubject נקרא בעת עדכון plaintiffName או insuredName; אם רק אחד מתעדכן – Subject לא נבנה.

---

### 3.4 CLAIMANT / PLAINTIFF Selector

**איך הרכיב בנוי**

- שני `<button>` בתוך `<div className="flex bg-navySecondary rounded p-0.5 text-xs">`.
- לכל כפתור: תנאי לפי `data.plaintiffTitle === 'Plaintiff'` / `'Claimant'`.

**מה קובע selected / unselected**

- `data.plaintiffTitle` – ערך 'Plaintiff' או 'Claimant'.
- נבחר: `bg-panel shadow text-lpBlue font-bold`.
- לא נבחר: `text-textMuted` בלבד – אין bg, יורש רקע navySecondary מהמעטפת.

**למה טקסט לא נראה במצב אחד**

- במצב unselected – `text-textMuted` (#94A3B8) על `bg-navySecondary` (#1E293B) – ניגודיות נמוכה.

**האם זה עיצוב בלבד או state logic**

- עיצוב בלבד. ה-state logic תקין – plaintiffTitle מתעדכן נכון; הבעיה היא בצבע הלא־נבחר.

---

### 3.5 Procedural Timeline

**מאיפה מגיע הטקסט שמתחת לכותרת**

- מחרוזת קבועה ב־App.tsx בתוך `<p className="text-sm text-textMuted">`.
- אין import, אין i18n, אין API – hard-coded.

**למה יש ערבוב עברית / אנגלית**

- המחרוזת נכתבה כך בקוד: "תאריכי Month/Year" – המילה "Month/Year" באנגלית בתוך משפט עברי.

**למה מופיעים גרשיים משובשים (&quot;)**

- `&quot;` הוא HTML entity לתו `"` (גרשיים ASCII).
- נכתב כך כדי להימנע מקונפליקט עם מרכאות ב-JSX; אך "דו"חי" דורש גרש עברי `״` ולא `"`.

**האם זה קבוע, מתורגם או hard-coded**

- hard-coded – מחרוזת אחת קבועה בקובץ.

---

## 4. סיכום

### מה ברור לחלוטין

- מקור כל בעיה בקוד – קבצים ופונקציות ספציפיים.
- Policy/No-Policy – אין לוגיקה מותנית; רק `policyFile` קיים או לא.
- Subject – דורש hasBoth; INSURED מ-Policy בלבד, Party – הקלדה ידנית.
- CLAIMANT/PLAINTIFF – state תקין; הבעיה בעיצוב (text-textMuted).
- Contrast – body text-textLight; inputs יורשים; אין bg מפורש על input.
- Procedural Timeline – מחרוזת אחת hard-coded עם &quot; ו-Month/Year.

### מה עדיין דורש החלטה עסקית לפני תיקון

- האם להגדיר flow נפרד ל-No-Policy (שדות חובה שונים, הצגה מותנית).
- האם Subject צריך להיבנות גם כשיש רק Insured או רק Party.
- האם לתקן contrast ב-inputs (צבע מפורש) או ב-theme גלובלי.
- האם להחליף "Month/Year" בעברית ו־`&quot;` בגרש עברי `״`.

---

*מסמך אבחון בלבד – ללא קוד, ללא פתרונות, ללא המלצות.*
