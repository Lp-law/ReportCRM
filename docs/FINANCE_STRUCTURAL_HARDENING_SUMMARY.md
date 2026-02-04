# סיכום Finance Structural Hardening

## קבצים ששונו

| קובץ | שינויים |
|------|---------|
| `src/services/financialExpensesData.ts` | officialSheetIdByCaseId, migrateOfficialSheets, getOfficialSheetIdForCase, recordAdminEditAfterPaid, recordSheetDeletionByAdmin, עדכון createFinancialExpenseSheet, deleteFinancialExpenseSheet |
| `src/services/financialExpensesClient.ts` | getOfficialSheetIdForCase, recordAdminEditAfterPaid, recordSheetDeletionByAdmin, getLatestSheetForCase משתמש ב־official |
| `src/pdf/buildReportHtml.ts` | PDF נשען על report.expensesSheetId או official sheet; תיקון relations |
| `src/components/finance/FinanceExpenseSheetEditor.tsx` | נעילה אחרי שולם: isReadOnly, adminEditReason, חסימת עריכה למשתמש רגיל/FINANCE, דרישת הערה ל־ADMIN |
| `src/components/finance/FinanceExpensesDashboard.tsx` | מחיקה מבוקרת: חסימה כש־linked to paid (חוץ מ־ADMIN), דיאלוג סיבה ל־ADMIN, onSheetDeleted |
| `src/App.tsx` | onSheetDeleted: ניקוי expensesSheetId מ־reports בעת מחיקת גיליון |

## כללים עסקיים שנאכפים כעת

1. **גיליון רשמי אחד לתיק** – `officialSheetIdByCaseId` מגדיר גיליון אחד פעיל לתיק. יצירת גיליון חדש הופכת אותו לרשמי. PDF, getLatestSheetForCase וחישובים נשענים על הגיליון הרשמי (או על זה המקושר לדיווח).
2. **נעילה אחרי "שולם"** – גיליון מקושר לדיווח שסומן שולם: FINANCE ומשתמש רגיל – קריאה בלבד; ADMIN – עריכה מותרת אך חייב להזין סיבת שינוי (נשמר ב־audit כ־ADMIN_EDIT_AFTER_PAID).
3. **מחיקה מבוקרת** – גיליון לא משויך או משויך לדיווח שלא שולם: מחיקה מותרת עם אישור. גיליון משויך לדיווח ששולם: רק ADMIN, עם סיבת מחיקה חובה (נשמר כ־SHEET_DELETED_BY_ADMIN). מחיקת גיליון מנקה את expensesSheetId מהדיווחים הרלוונטיים.

## מה בכוונה לא טופל

- **FinancialTracker / expensesSum** – לא נגעו; ממשיכים לעבוד כתצוגה legacy.
- **חישובים** – financialExpensesCalculator לא שונה.
- **סטטוסי דיווח** – Report status flow לא שונה.
- **מניעת יצירת גיליונות מקבילים** – ניתן עדיין ליצור גיליונות מרובים לתיק; רק אחד מסומן כרשמי. אין חסימה על יצירת גיליון חדש.
