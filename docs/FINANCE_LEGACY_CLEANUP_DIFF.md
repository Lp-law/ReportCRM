# Diff Summary – ניקוי Legacy עדין במודול הפיננסי

ניקוי מבוקר של רכיבי Legacy — הסתרה וסימון, ללא מחיקה.

---

## מיפוי שימוש (Phase 1)

### FinancialTracker

| רכיב | סיווג | שימוש |
|------|-------|-------|
| FinancialTracker (קומפוננטה) | READ_ONLY | מציג דיווחים עם expensesSum שלא סומנו שולם. מבוסס על expensesSum (מודל ישן). |
| unpaidReports (filter) | USED | סינון לפי r.expensesSum && !r.isPaid |
| grandTotal | USED | חישוב מסכום expensesSum |
| טבלה (Report Date, Insured, Amount, Action) | READ_ONLY | תצוגה בלבד |

**החלטה:** נשאר — נוסף סימון "מידע היסטורי – לידיעה בלבד" בכותרת.

---

### expensesSum / expensesItems / expenseWorksheet

| רכיב | סיווג | שימוש |
|------|-------|-------|
| expensesSum בדיווח | USED (Legacy) | PDF (server), getExpensesNumericTotal, FinancialTracker, תבניות HTML |
| expensesItems בדיווח | USED (Legacy) | UI ידני – Add/Extract, טבלה, payment recommendation |
| expenseWorksheet | USED (Legacy) | insertWorksheet fallback, handleFinanceTaskCreate, report history |
| Total Extracted / Clear All | READ_ONLY (Legacy) | מציג ועורך expensesItems |
| Add Expense Item | DEAD (בהקשר חדש) | כש-hasFinanceExpenses — מוסתר |

**החלטה:** כאשר `hasFinanceExpenses` (expensesSheetId או expensesHtml) — הוסתר הבלוק Legacy (Manual Add, Extract, Total Extracted, expensesItems table, Clear All, payment recommendation). הוצגה הודעה שהטבלה מגיעה מטבלת הנהלת חשבונות.

---

### showExpensesSummary (Expenses Overview)

| רכיב | סיווג | שימוש |
|------|-------|-------|
| expenseReports | USED (מעורב) | hasExpenseData כולל expensesSheetId ו-expensesItems/expenseWorksheet |
| expensesAssigned / Ready / Sent | USED | ספירה לפי סטטוס |
| totalSentBalance | USED | getExpensesNumericTotal (expenseWorksheet / expensesSum / expensesItems) |

**החלטה:** נשאר — נוסף סימון "כולל מידע היסטורי – לידיעה בלבד".

---

## קבצים ששונו

| קובץ | שינוי |
|------|-------|
| `src/App.tsx` | FinancialTracker: סימון "מידע היסטורי". Expenses section: הסתרת Legacy UI כש-hasFinanceExpenses. showExpensesSummary: סימון "כולל מידע היסטורי". |

---

## מה הוסתר

- **בלוק Legacy בסעיף Expenses:** כש-`hasFinanceExpenses` (expensesSheetId או expensesHtml), הוסתרו:
  - Manual Expense Entry (Add Expense Item)
  - Table Extraction UI (Auto-extract)
  - Total Extracted + Clear All
  - טבלת expensesItems
  - payment recommendation (Option A/B)

- **מה נשאר גלוי:** הודעת החלפה: "טבלת ההוצאות מגיעה מטבלת הנהלת החשבונות (Expense Sheet). לעדכון – השתמשי בכפתור 'הוסף טבלת הוצאות עדכנית'."

---

## מה נשאר ולמה

- **FinancialTracker:** נשאר — עשוי להציג דיווחים Legacy עם expensesSum. נוסף סימון "מידע היסטורי".
- **showExpensesSummary:** נשאר — מציג גם דיווחים חדשים וגם היסטוריים. נוסף סימון.
- **Invoice Attachments Zone:** נשאר גלוי בשני המצבים — משותף ל-Legacy ולמודל החדש.
- **insertWorksheet / כפתור "הוסף טבלת הוצאות עדכנית":** נשאר — פעולה מפורשת לרענון Snapshot.

---

## מה לא שונה

- **לא נמחק קוד** — הלוגיקה נשארה
- **לא נמחקו נתונים** — expensesSum, expensesItems, expenseWorksheet נשמרים
- **לא שונו חישובים** — financialExpensesCalculator, getExpensesNumericTotal ללא שינוי
- **לא שונתה זרימת דיווח** — PDF, שליחה, סטטוסים ללא שינוי
- **לא שונה API** — אין שינוי ב-endpoints או ב-payload
- **Legacy נתונים** — נשמרים ומוצגים בדיווחים ישנים
