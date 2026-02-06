# אבחון תקלות UX ו-Flow

מסמך אבחון בלבד — ללא הצעות תיקון, ללא TODO, ללא קוד.

---

## Executive Summary

כפתורי Logout מחוברים ל־`handleLogoutClick` שמפעיל `performLogout` — אך **הלקוח אינו קורא ל־`/api/logout`**. ה־session cookie נשאר בדפדפן. יצירת PDF נשענת על `report.policyFile` ב־payload; אם policy חסרה או לא נקלטת — ה־PDF יוצא ללא Policy. שורות עם `bg-red-50` / `bg-emerald-50` משתמשות ב־`text-textLight` (אפור בהיר) על רקע בהיר — ניגודיות חלשה וטקסט לא קריא. בטבלת "תיקים לפי מספר עודכנית" (מצגת מקובצת) נתוני plaintiffName/insuredName מוצגים — אך ייתכן שהניגודיות פוגעת בתצוגה. בדשבורד של איריס חסרה עמודת PLAINTIFF/CLAIMANT — הנתון זמין ב־`linkedReport.plaintiffName` אך לא מוצג.

---

## 1. Logout – מיפוי זרימה וכשל

**קבצים רלוונטיים**: `src/App.tsx` (handleLogoutClick, performLogout); `server.js` (app.post('/api/logout'))

### מה אמור לקרות

- לחיצה על "יציאה" / "Logout" → ניקוי session בשרת, ניקוי cookie בדפדפן, חזרה למסך התחברות.
- השרת מנקה session; הלקוח מאפס cookie ומנקה state מקומי.

### מה קורה בפועל

1. לחיצה על Logout → `onLogout` (handleLogoutClick). אם `reports.length > 0 || currentReport` → מודל גיבוי; אחרת → `performLogout()` ישירות.
2. `performLogout` מנקה `currentUser`, `localStorage.USER`, `localStorage.CURRENT_REPORT`, state נוסף — **אין קריאת `fetch` ל־`/api/logout`**.
3. Server (`server.js` שורה 3332): `app.post('/api/logout')` מחכה לקריאה — מוחק session מ־`sessions`, שולח `res.cookie(SESSION_COOKIE_NAME, '', { expires: new Date(0) })` — אך **לא נקרא**.
4. ה־cookie `lp_session` נשאר בדפדפן. ה־session נשאר ב־`sessions` בשרת.
5. המסך חוזר ל־Login כי `currentUser` מתאפס, אך ה־session הישן עדיין קיים.

### איפה הזרימה נשברת

- נקודת השבירה: בין `performLogout` ל־server — אין קישור. `performLogout` לא קורא ל־`fetch('/api/logout', ...)`.

### סוג כשל

- **Data flow / לוגי**: חוסר קישור בין פעולת ה־client ל־server; המודל "logout" מוגדר בצד client בלבד.

---

## 2. PDF Generation – מיפוי זרימה וכשל (כולל Policy)

**קבצים רלוונטיים**: `server.js` (POST /api/render-report-pdf), `buildReportHtml`, `getPolicyPdfBufferFromReport`, `buildInvoicesAppendixPdf`

### מה אמור לקרות

- לחיצה על יצירת PDF → שליחת `{ report }` מלא (כולל `policyFile`, `invoiceFiles`) ל־API → HTML → Puppeteer → PDF מוחזר להורדה.
- Policy מתווספת כ־PDF אם `report.policyFile` קיים עם `data` (base64) ו־`type` כולל "pdf".

### מה קורה בפועל

**Client**: `fetchReportPdf(report)` (`geminiService.ts`) שולח `JSON.stringify({ report })` ל־`POST /api/render-report-pdf`. ה־report הוא `currentReport` (הורדת PDF) או `reportForSend` (שליחת מייל) — **נשלח כפי שהוא**, ללא טרנספורמציה.

**Server**:
1. `POST /api/render-report-pdf` מקבל `{ report }`, קורא ל־`buildFinalReportPdfWithPolicy(report)`.
2. `getPolicyPdfBufferFromReport(report)` מצפה ל־`report.policyFile` עם `policyFile.data` (base64) ו־`policyFile.type` כולל "pdf"; אם חסר — מחזיר null, **ממשיך בשקט** בלי Policy.
3. `buildInvoicesAppendixPdf(report)` — שגיאה לא מפילה; ממשיך בלי נספח.
4. שגיאה ב־`renderReportPdf` (Puppeteer) → `throw` → 500 "Failed to generate PDF".

### תנאים ל־PDF תקין

- `report` אובייקט תקף; Puppeteer/Chrome זמין; `report.policyFile` (אם רצוי) קיים עם `data` ו־`type` כולל "pdf".

### תנאים לכשל

- report חסר/לא אובייקט → 400. Puppeteer נכשל (Chrome חסר, ENV) → 500. Policy חסרה → **silent** — PDF יוצא בלי Policy, בלי שגיאה למשתמש.

### איפה הזרימה נשברת

- אם Policy קיימת ב־UI אבל לא ב־PDF: ה־report ב־state (currentReport/reportForSend) חסר `policyFile` או `policyFile.data` — למשל policy לא נשמרת ב־ReportData, או לא נטענת מ־reports/API/storage.
- כשל Policy: **silent** — לא מפיל, לא feedback.

### סוג כשל

- **Data flow**: חוסר סנכרון בין UI/state ל־report object הנשלח ל־API; `policyFile` לא מגיע ל־payload.
- **לוגי**: Policy חסרה — המשך בשקט (לא throw), ללא feedback למשתמש.

---

## 3. UX צבעים (שורות ורודות/ירוקות) – אבחון

**קבצים רלוונטיים**: `App.tsx`, `FinanceExpenseSheetEditor.tsx`, `tailwind.config.js`

### מה אמור לקרות

- שורות עם סטטוס/סוג מיוחד (READY_TO_SEND, SENT, EXPENSE חדש) מודגשות ברקע צבעוני כדי להבחין אותן.
- הטקסט אמור להיות קריא על הרקע.

### מה קורה בפועל

**Conditions שמפעילות צבע**:
- **App.tsx** (שורות 6668, 6772): `isReady = status === 'READY_TO_SEND'` → `bg-red-50`; `isSent = status === 'SENT'` → `bg-green-50/50` או `bg-green-50/60`.
- **FinanceExpenseSheetEditor** (שורות 1401–1402): `hasIssue` → `bg-red-50`; `isNewExpense` (סוג EXPENSE) → `border-l-4 border-emerald-300 bg-emerald-50/60`.

**Classes של טקסט**: אין `text-*` מפורש על התאים. הטקסט יורש מ־parent — theme כהה משתמש ב־`text-textLight` (#CBD5E1), `text-textMuted` (#94A3B8) (`tailwind.config.js`).

**רקעים**: `bg-red-50` (#fef2f2), `bg-emerald-50` (#ecfdf5), `bg-green-50` — בהירים.

### איפה הזרימה נשברת

- ויזואלית: אפור בהיר (`text-textLight` / `text-textMuted`) על רקע בהיר (ורוד/ירוק) — ניגודיות נמוכה, טקסט לא קריא.
- לא overflow, לא opacity, לא truncate — הבעיה ניגודיות בלבד.

### סוג כשל

- **UX**: side-effect של theme כהה — `text-textLight` גלובלי ללא override לשורות עם רקע בהיר.

---

## 4. "תיקים לפי מספר עודכנית" – אבחון תצוגה

**קבצים רלוונטיים**: `App.tsx` (בלוק `groupedCaseReports`)

### מה אמור לקרות

- מצגת מקובצת לפי `odakanitNo` מציגה כותרת קבוצה (מספר בעודכנית, שם התובע, שם המבוטח) וטבלה מורחבת עם תאריך דיווח, שם התובע, שם המבוטח, סטטוס, פעולות.
- הנתונים `plaintiffName` ו־`insuredName` נלקחים מ־`group.plaintiffName`, `report.plaintiffName` — מוצגים בקוד.

### מה קורה בפועל

1. `groupedCaseReports` — קבוצות לפי `odakanitNo`; כל group כולל `plaintiffName`, `insuredName` מהדיווחים.
2. **כותרת קבוצה** (שורות 6738–6739): `text-textLight` למספר; `text-textMuted` לשורה "שם התובע: {group.plaintiffName} · שם המבוטח: {group.insuredName}".
3. **טבלה מורחבת** (שורות 6772–6775): `status === 'READY_TO_SEND'` → `bg-red-50`; `status === 'SENT'` → `bg-green-50/60`. תאים: `report.plaintiffName`, `report.insuredName` — ללא `text-*` מפורש (יורשים).
4. באותן שורות עם רקע בהיר — הטקסט יורש ניגודיות חלשה (כמו סעיף 3).

### איפה הזרימה נשברת

- הנתון קיים בקוד ומוצג — לא חסר מבחינת data flow.
- **ויזואלית**: אותה בעיית ניגודיות — `text-textLight` על רקע בהיר (red-50, green-50) — הטקסט לא נראה.
- אם יש overflow — הערך יכול להיחתך; אין הסתרה מפורשת (opacity/truncate).

### סוג כשל

- **UX**: ניגודיות — אותו root cause כמו סעיף 3. לא כשל data או לוגיקה.

---

## 5. Dashboard איריס – אבחון חוסר עמודת PLAINTIFF/CLAIMANT

**קבצים רלוונטיים**: `FinanceExpensesDashboard.tsx`, `financialExpensesClient.ts`

### מה אמור לקרות

- טבלת "טבלאות הוצאות" עבור FINANCE (איריס) מציגה גיליונות הוצאה עם מידע על התיק — כולל שם התובע/תובעת (plaintiff/claimant) כשזמין.

### מה קורה בפועל

1. `listSheets()` מחזיר `FinancialExpenseSheet[]` — אין `plaintiffName` / `claimantName` ב־sheet.
2. `latestReportBySheetId.get(sheet.id)` מחזיר `linkedReport` (ReportData) — `plaintiffName`, `insuredName` קיימים ב־Report.
3. הטבלה מציגה: תיק, מבטחת, גרסה, סטטוס, עודכן לאחרונה, סכום להזמנה, פעולות — **אין עמודת plaintiff/claimant**.

### איפה הזרימה נשברת

- הנתון קיים: `linkedReport.plaintiffName` זמין כשהגיליון מקושר לדיווח.
- הקומפוננטה לא משתמשת ב־`linkedReport.plaintiffName` להצגה — העמודה פשוט לא מוגדרת.
- גיליונות בלי דיווח מקושר — אין plaintiffName להצגה.

### סוג כשל

- **UX / data flow**: החלטת עיצוב — העמודה לא נוספה. הנתון זמין אך לא בשימוש.

---

## 6. סיכום

### מה ברור

- Logout: הלקוח לא קורא ל־`/api/logout`; cookie ו־session נשארים.
- PDF: Policy תלויה ב־`report.policyFile` ב־payload; היעדרה לא זורקת שגיאה.
- שורות ורודות/ירוקות: שימוש ב־`bg-red-50` / `bg-emerald-50` ללא override ל־text color — `text-textLight` על רקע בהיר יוצר ניגודיות חלשה.
- תיקים לפי מספר עודכנית: הנתון קיים; אי־הקריאות היא בגלל ניגודיות (כמו סעיף 3).
- Dashboard איריס: `plaintiffName` זמין ב־`linkedReport` אך לא מוצג בטבלה.

### מה עדיין לא ברור

- האם "logout לא עובד" מתייחס ל־session שלא מתנקה, או לתקלה אחרת (למשל מודל גיבוי שחוסם).
- מה בדיוק "טקסט לא נראה" — רק בניגודיות או גם overflow/הסתרה.
- האם יש טבלה נוספת בשם "תיקים לפי מספר עודכנית" מלבד המצגת המקובצת ב־App.tsx.

### אילו החלטות נדרשות לפני תיקון

- האם לבצע קריאה ל־`/api/logout` מתוך `performLogout`?
- האם לאכוף policy ב־PDF (להחזיר שגיאה כשאין policy כשצפויה) או להמשיך לייצר PDF ללא policy?
- איזה צבע טקסט להחיל על שורות עם רקע בהיר (red-50, emerald-50, green-50) כדי לשמור על ניגודיות?
- האם להוסיף עמודת plaintiff/claimant בדשבורד איריס, ואיך להציג מקרים בלי דיווח מקושר?
