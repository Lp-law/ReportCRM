# Finance Module – Deep Dive Documentation

תיעוד מלא ומפותח של מודול הפיננסים (איריס – FINANCE) במערכת Report CRM.

---

## חלק 1 — תפקיד פיננסי במערכת

### 1.1 מי היא איריס במונחי המערכת

- **Role**: `FINANCE` (מוגדר ב־`constants.ts` – `iris`, id: `u3`)
- **הרשאות**: גישה מלאה למסך טבלאות ההוצאות בלבד. אינה רואה את LawyerDashboard או את מסכי הדיווח הרגילים.
- **מה מותר**:
  - יצירת גיליונות הוצאות חדשים (FinancialExpenseSheet)
  - עריכת גיליון: מטא־דאטה, שורות הוצאה, נספחים
  - העברת גיליון ל־READY_FOR_REPORT ("נשלח לעו״ד") לאחר ולידציה
  - הוספת אירועי תשלום (FinancialPaymentEvent) לתיק
  - מחיקת גיליון
  - סימון דיווח כ"שולם" (כאשר הדיווח נשלח)
- **מה אסור**:
  - עריכת דיווחים (מסך Step1/Step2/Preview)
  - גישה ל־Admin Dashboard (מלבד כניסה למערכת)
  - גישה ל־Financial Control של לידור (זה שמור ל־ADMIN/SUB_ADMIN)

### 1.2 האחריות העסקית

- **מה היא אמורה להזין**: שורות הוצאה (ספק, תיאור, תאריך, כמות, מחיר, מע״מ, סוג), נספחים (חשבוניות), מטא־דאטה (מבטחת, תקופה, Franchise, כבר שולם)
- **מתי**: לאחר קבלת חשבוניות מהלקוח, לפני או במקביל לכתיבת הדיווח על ידי עורכת הדין
- **עבור מי**: עבור עורכת הדין שמטפלת בתיק (הבעלות על הדיווח)
- **באיזה שלב**: הגיליון נוצר ב־DRAFT, עובר ל־READY_FOR_REPORT כשמוכן, ואז נשלח לעורכת הדין (דרך handleNotifyLawyerFromFinance). עורכת הדין משלבים אותו בדיווח.

---

## חלק 2 — ישויות פיננסיות (Data Model)

### 2.1 FinancialExpenseLineItem (שורת הוצאה)

| שדה | חובה/רשות | מקור | יוצר/עורך |
|-----|-----------|------|-----------|
| id | חובה | generateId('fli') | מערכת |
| sheetId | חובה | sheet.id | מערכת |
| kind | חובה | EXPENSE / ADJUSTMENT / COMPENSATION | איריס |
| expenseType | רשות | מטקסט חופשי | איריס |
| providerName | חובה ל־EXPENSE | מטקסט | איריס |
| providerId | רשות | — | איריס |
| description | חובה | מטקסט | איריס |
| date | רשות | ISO string | איריס |
| quantity, unitPrice, vatRate | רשות | מספרים | איריס |
| isIncludedInRequestedAmount | חובה (ברירת מחדל true) | boolean | איריס |
| lineNetAmount, lineVatAmount, lineTotalAmount | רשות (מחושב) | מספרים | איריס/מערכת |
| attachmentId | רשות | קישור ל־Attachment | איריס |
| createdAt, updatedAt | חובה | ISO | מערכת |

### 2.2 FinancialExpenseSheet (גיליון הוצאות)

גיליון הוצאות = אוסף שורות + נספחים + מטא־דאטה, לכל תיק (caseId) ולגרסה נתונה (versionIndex).

| שדה | תיאור | ערכים |
|-----|--------|--------|
| status | מצב הגיליון | DRAFT → READY_FOR_REPORT → ATTACHED_TO_REPORT / ARCHIVED |
| archivedReason | סיבת ארכיון | USED_IN_REPORT / CANCELLED / SUPERSEDED / null |
| attachedToReportId | מזהה דיווח מקושר | null או report.id |
| attachedAt | מועד הצמדה | ISO או null |
| readyAt | מועד מעבר ל־READY | ISO או null |
| sheetVersionNumber, sheetVersionHash | גרסה ואימות תקינות | מעודכנים בכל שינוי |
| infoOnly | "לידיעה בלבד" | true = סכום לבקשה 0 |
| deductibleAmount, alreadyPaidAmount | הפחתות | מספרים (כולל תשלומים קודמים) |

**הבדל מ־Expense בודד**: Expense בודד = שורת FinancialExpenseLineItem. Sheet = מיכל הכולל את כל השורות, נספחים ומטא־דאטה.

### 2.3 הקשר ל־Report

- **מתי הוצאה משויכת לדיווח**: כאשר עורכת הדין לוחצת "הוסף טבלת הוצאות" (insertWorksheetIntoSection) או כאשר איריס לוחצת "נשלח לעו״ד" (handleNotifyLawyerFromFinance). בשני המקרים הדיווח מקבל `expensesSheetId` מצד ה־Report.
- **האם אפשר לשייך הוצאה ליותר מדיווח אחד**: לא. הקשר הוא 1:1: גיליון אחד ↔ דיווח אחד (לפי העיצוב). בפועל – דיווח יכול להצביע על גיליון דרך `expensesSheetId`, אך הפונקציה `linkFinancialExpenseSheetToReport` אינה נקראת בשום מקום, ולכן `attachedToReportId` בגיליון נשאר null.
- **מה קורה אם דיווח נמחק**: הגיליון נשאר ב־localStorage. אין מנגנון ניקוי אוטומטי של גיליונות יתומים.
- **מה קורה אם דיווח משתנה**: אם הדיווח כבר מקושר ל־expensesSheetId והעורכת משנה תוכן – אין עדכון אוטומטי ל־expensesHtml. יש migration ברקע שמנסה להשלים expensesHtml חסר.

---

## חלק 3 — זרימת עבודה (Workflow)

### 3.1 יצירת הוצאה

1. איריס לוחצת "צור טבלת הוצאות חדשה".
2. מופיע prompt למספר תיק (caseId).
3. המערכת מנסה להסיק מבטחת מדיווחים קיימים לאותו תיק.
4. גרסה (versionIndex) נקבעת: max(גליונות קודמים) + 1.
5. deductibleAmount ו־alreadyPaidAmount מועתקים מהגיליון האחרון באותו תיק.
6. `createFinancialExpenseSheet` יוצר גיליון ב־status: DRAFT.

### 3.2 מצב DRAFT

- איריס יכולה לערוך מטא, שורות, נספחים.
- אפשר לשמור (handleSave) – שומר למקומי בלבד, בלי שינוי סטטוס.
- `revertSheetToDraft` מחזיר גיליון מ־READY_FOR_REPORT ל־DRAFT (רק ממצב READY_FOR_REPORT).

### 3.3 מעבר ל־READY_FOR_REPORT

1. איריס לוחצת "נשלח לעו״ד" (handleMarkReadyAndNotify).
2. Validation: validateForDraft (לא validateForReadyForReport – אין בדיקת סטטוס).
3. MISSING_ATTACHMENT_REQUIRED מורד מ־ERROR ל־WARNING – לא חוסם.
4. קריאה ל־recordSheetReadyAttempt עם success: true.
5. סטטוס משתנה ל־READY_FOR_REPORT, readyAt מתעדכן.
6. קריאה ל־onNotifyLawyer → handleNotifyLawyerFromFinance.

### 3.4 ATTACHED_TO_REPORT

- **Intended flow**: הגיליון אמור לעבור ל־ATTACHED_TO_REPORT כאשר העורכת משלבת אותו בדיווח.
- **Actual flow**: הפונקציה `linkFinancialExpenseSheetToReport` לא נקראת בשום מקום. `insertWorksheetIntoSection` ו־`handleNotifyLawyerFromFinance` מעדכנים רק את ה־Report (`expensesSheetId`), לא את הגיליון (`attachedToReportId`, `status`). בפועל הגיליון נשאר READY_FOR_REPORT גם לאחר שילובו בדיווח.

### 3.5 MARK_AS_PAID

- כפתור "שולם" מוצג באיריס כש־linkedReport.status === 'SENT' && !linkedReport.isPaid.
- לחיצה קוראת ל־onMarkReportPaid(reportId) → עדכון `isPaid: true` בדיווח.
- אין שדה "שולם" על הגיליון עצמו; התשלום מתועד ב־FinancialPaymentEvent.

### 3.6 מה מחזיר אחורה

- `revertSheetToDraft`: רק מ־READY_FOR_REPORT ל־DRAFT. לא מוגדר מעבר מ־ATTACHED_TO_REPORT ל־DRAFT (בגלל שאין בפועל ATTACHED_TO_REPORT).

### 3.7 מי רשאי לשנות סטטוס ובאיזה שלב

| פעולה | מי | תנאי |
|-------|-----|------|
| DRAFT → READY_FOR_REPORT | איריס | ולידציה עוברת |
| READY_FOR_REPORT → DRAFT | איריס | revertSheetToDraft |
| READY_FOR_REPORT → ATTACHED_TO_REPORT | — | לא ממומש (linkFinancialExpenseSheetToReport לא נקראת) |

---

## חלק 4 — מסכים ו־UI

### 4.1 FinanceExpensesDashboard

- **מיקום**: מוצג כאשר `user.role === 'FINANCE'` במקום Dashboard רגיל.
- **תוכן**: טבלה של גיליונות (תיק, מבטחת, גרסה, סטטוס, עודכן לאחרונה, סכום להזמנה).
- **פעולות**: פתיחה, מחיקה, "שולם" (כשהדיווח נשלח ולא סומן שולם), סינון לפי סטטוס ומבטחת.
- **מאחורי הקלעים**: `loadSheets` טוען מ־financialExpensesClient.listSheets(); latestReportBySheetId מחושב מ־reports שמכילים expensesSheetId.
- **פעולות מסוכנות**: מחיקת גיליון – אין אישור נוסף מעבר ל־confirm, אין בדיקה אם הגיליון מקושר לדיווח.

### 4.2 FinanceExpenseSheetEditor

- **מיקום**: נפתח בלחיצה על "פתח" בשורת גיליון.
- **תוכן**: מטא (תיק, מבטחת, תקופה, מטבע, Franchise, כבר שולם, infoOnly), טבלת שורות, נספחים, תשלומים, תצוגה מקדימה של HTML.
- **פעולות**: שמירה, "נשלח לעו״ד", "החזר לטיוטה", הוספת/עריכת/מחיקת שורות, העלאת נספחים, הוספת תשלומים, ייצוא JSON/CSV.
- **מאחורי הקלעים**: state מקומי (sheet, lines, attachments); שמירה קוראת ל־updateSheetMeta, addLineItem, updateLineItem, deleteLineItem, addAttachment; recordReadyAttempt למעבר ל־READY.
- **פעולות מסוכנות**: "נשלח לעו״ד" – יוצר דיווח חדש ב־handleNotifyLawyerFromFinance; מחיקת שורה/נספח – בלי undo.

### 4.3 FinancialControl (לידור – ADMIN/SUB_ADMIN)

- **מיקום**: בתוך Admin Dashboard, כרטיסייה "Financial Control".
- **תוכן**: רשימת גיליונות מסוננת (READY / ATTACHED / SENT / EXCEPTIONS), ספירות, חריגות.
- **פעולות**: סינון, פתיחת דיווח מקושר.
- **מאחורי הקלעים**: queryFinancialSheetsForLidor; attachedReport נמצא דרך sheet.attachedToReportId – שמעולם לא מוגדר, ולכן sentAt ו־expensesOutOfSync בפועל תמיד ריקים/שגויים עבור רוב הגיליונות.

### 4.4 FinancialTracker (Staff)

- **מיקום**: ב־Dashboard כש־isStaff.
- **תוכן**: דיווחים עם expensesSum שלא סומנו שולם, וסכום כולל.
- **הערה**: מתבסס על expensesSum (מודל ישן), לא על FinancialExpenseSheet.

---

## חלק 5 — תלות במשתמשים אחרים

### 5.1 מה עורכת הדין רואה מהפיננסים

- דיווחים עם expensesSheetId מופיעים ב־LawyerDashboard (כרטיס "ממתין לחשבוניות" וכו').
- כשיש טבלת הוצאות מקושרת – סעיף "Expenses breakdown" קבוע ולא ניתן להסרה.
- "הוסף טבלת הוצאות" – מחפש גיליון READY_FOR_REPORT או DRAFT לאותו תיק (getLatestSheetForCase) ומשלב אותו בדיווח.
- התראות מאיריס (onNotifyLawyer) מגדילות financeNotificationCount – מוצגות בבדג' ליד הפעמון.

### 5.2 מה ליאור (ADMIN) רואה

- Financial Control: רשימת גיליונות, חריגות, ספירות (READY, ATTACHED, SENT, EXCEPTIONS).
- יש הרשאה ל־getLidorCounts, getLidorKpis, getExceptionStatusForSheet, setExceptionStatusForSheet.

### 5.3 האם איריס תלויה בפעולה של מישהו אחר

- כן: צריך שיהיה CaseFolder או דיווח קיים בתיק כדי ש־handleNotifyLawyerFromFinance יעבוד.
- תיק סגור (folder.closedAt) – חוסם יצירת דיווח פיננסי חדש.
- מספר תיק שלא קיים – חוסם עם הודעת שגיאה.

### 5.4 האם מישהו אחר יכול לשבור נתונים

- עורכת הדין יכולה לערוך דיווח שמקושר ל־expensesSheetId – אין נעילה על סעיף ההוצאות מלבד האיסור להסיר אותו.
- מחיקת דיווח – הגיליון נשאר; אין ניקוי אוטומטי של expensesSheetId או קישורים.
- איריס יכולה למחוק גיליון גם אם הוא מקושר לדיווח – אין בדיקה או חסימה.

---

## חלק 6 — Persistency & Data Safety

### 6.1 איפה הנתונים נשמרים

- **localStorage** בלבד: מפתח `financial_expenses_store_v1`.
- מבנה: sheets, lineItems, attachments, auditEvents, insurerRulesets, exceptionAnnotations, payments.
- אין data/ על השרת, אין גיבוי אוטומטי.

### 6.2 מה קורה ב־

| אירוע | התנהגות |
|-------|----------|
| Refresh | נתונים נטענים מ־localStorage. |
| Logout | הפיננסים לא נמחקים – רק USER, CURRENT_REPORT וכו'. |
| Redeploy | נתונים נשארים כי הם ב־localStorage בדפדפן. |
| עבודה מקבילית | אין lock. שני טאבים יכולים לערוך באותו זמן ולדרוס אחד את השני. |
| Incognito / מחיקת נתונים | כל הנתונים הפיננסיים אובדים. |

### 6.3 סיכונים ידועים

- אובדן נתונים ב־localStorage (מחיקה, גלישה פרטית).
- אין סנכרון בין מכשירים.
- עבודה מקבילית ללא lock.
- אין גיבוי אוטומטי; גיבוי ידני דרך "הורד גיבוי" בהתנתקות (כולל reports ו־caseFolders, לא רק financial store).

---

## חלק 7 — נקודות מורכבות ועדינות

### 7.1 linkFinancialExpenseSheetToReport

- הפונקציה קיימת ב־financialExpensesData ומוגדרת לעדכן את הגיליון ל־ATTACHED_TO_REPORT.
- אינה נקראת משום מקום בקוד.
- התוצאה: sheet.attachedToReportId תמיד null, sheet.status לא עובר ל־ATTACHED_TO_REPORT.

### 7.2 חשבון Lidor (Financial Control)

- queryFinancialSheetsForLidor משתמש ב־sheet.attachedToReportId כדי למצוא את הדיווח המקושר.
- כיוון ש־attachedToReportId תמיד null, attachedReport ו־sentAt ו־expensesOutOfSync בפועל לא רלוונטיים לרוב הגיליונות.

### 7.3 expensesOutOfSync

- מוגדר ב־LidorFinancialSheetListItem, נגזר מ־attachedReport.expensesOutOfSync.
- אין עדכון של expensesOutOfSync על Report בקוד – השדה לא מופיע ב־ReportData.
- בפועל expensesOutOfSync יהיה false כי attachedReport חסר.

### 7.4 הבדל בין insertWorksheetIntoSection ל־handleNotifyLawyerFromFinance

- **insertWorksheetIntoSection**: עורכת הדין משלבים גיליון קיים בדיווח קיים; מעדכן expensesSheetId, expensesHtml, invoiceFiles.
- **handleNotifyLawyerFromFinance**: איריס יוצרת דיווח חדש עם תוכן מוכן; גם שם יש expensesSheetId, expensesHtml, invoiceFiles.
- בשני המקרים הגיליון לא מתעדכן (לא נקרא linkFinancialExpenseSheetToReport).

### 7.5 Edge cases

- **הוצאה בלי דיווח**: גיליון ב־READY_FOR_REPORT שלא שולב בדיווח – תקין.
- **דיווח בלי הוצאה**: דיווח בלי expensesSheetId – תקין (דיווח לא פיננסי).
- **גיליון למספר תיק לא קיים**: handleNotifyLawyerFromFinance מציג alert ולא יוצר דיווח.
- **גיליון מחובר לדיווח שנמחק**: הגיליון נשאר; אין ניקוי.

### 7.6 Validation לעומת חסימה

- validateForReadyForReport בודקת sheet.status !== 'READY_FOR_REPORT' כחריגה.
- ב־handleMarkReadyAndNotify משתמשים ב־validateForDraft כדי לא לחסום לפי סטטוס.
- כלומר המעבר ל־READY לא תלוי בסטטוס קודם – רק בתוכן.

### 7.7 SNAPSHOT_CACHE_TTL_MS

- buildCumulativeExpensesSnapshot משתמש ב־cache של 5 שניות.
- שינוי בגיליון בתוך 5 שניות עלול להחזיר snapshot ישן.

---

## נספח — רגישות במיוחד לשינוי

1. **אי־קריאה ל־linkFinancialExpenseSheetToReport** – הקישור Report↔Sheet חד־ direction; שינוי עלול להשפיע על Lidor ו־expensesOutOfSync.
2. **סנכרון מצב Sheet מול Report** – status ו־attachedToReportId לא מתעדכנים כאשר הדיווח משתנה.
3. **מחיקת גיליון** – אין בדיקה אם הגיליון מקושר לדיווח; מחיקה יכולה ליצור דיווחים עם expensesSheetId לא תקין.
4. **localStorage בלבד** – כל שינוי ל־persistence (לדוגמה מעבר ל־API) ידרוש שינויים בכמה שכבת נתונים.
5. **הנחות על CaseFolder** – handleNotifyLawyerFromFinance תלוי ב־caseFolders ובסטטוס סגור של התיק.
6. **היעדר lock לעבודה מקבילית** – שינוי ל־multi-user יחייב מנגנון lock/merge.
7. **בידול legacy vs new** – קיימים expensesItems, expenseWorksheet, expensesSum (מודל ישן) מול expensesSheetId (מודל חדש); logIfMixedModel מזהיר אך לא מתקן.
8. **FinancialTracker** – משתמש ב־expensesSum הישן, לא ב־FinancialExpenseSheet.
9. **העברת MISSING_ATTACHMENT מ־ERROR ל־WARNING** – ב־handleMarkReadyAndNotify; שינוי עלול לחשוף גיליונות ללא נספחים.
10. **revertSheetToDraft** – עובד רק מ־READY_FOR_REPORT; אין טיפול בגיליון שכבר "מקושר" (אם יהיה בעתיד).
