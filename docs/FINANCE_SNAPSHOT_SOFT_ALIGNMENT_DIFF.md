# Diff Summary – יישור Snapshot רך

יישור מנגנון ה־Snapshot של טבלאות ההוצאות לתהליך העבודה במשרד — Snapshot רך, ללא נעילה.

---

## קבצים ששונו

| קובץ | שינוי |
|------|-------|
| `src/App.tsx` | Migration: הוספת סינון `r.status !== 'SENT'` |
| `src/components/finance/FinanceExpenseSheetEditor.tsx` | הרשאות עריכה: FINANCE/SUB_ADMIN יכולים לערוך גם כשהדיווח סומן שולם; עדכון הודעות |

---

## מה השתנה לוגית

### 1. Migration (`src/App.tsx`)

**לפני:** Migration השלים `expensesHtml` לכל דיווח עם `expensesSheetId` וללא `expensesHtml`, כולל דיווחים שנשלחו (SENT).

**אחרי:** Migration **לא** מטפל בדיווחים עם `status === 'SENT'`. רק דיווחים שאינם SENT (טיוטה, ממתין, וכו') מקבלים השלמה.

**סיבה:** Snapshot רך — לא לדרוס snapshot קיים, ולא "לתקן" דיווחים שכבר נשלחו.

### 2. הרשאות עריכה בגיליון (`FinanceExpenseSheetEditor.tsx`)

**לפני:** כאשר הדיווח המקושר סומן כ"שולם" (`isPaid`), רק ADMIN יכל לערוך את הגיליון. FINANCE (איריס) הייתה חסומה.

**אחרי:** FINANCE, ADMIN ו־SUB_ADMIN יכולים לערוך את הגיליון גם כשהדיווח סומן שולם. רק LAWYER נשאר חסום (כפי שהוגדר).

**משתנים:**
- `canEditWhenPaid` — רשימת תפקידים שמורשים לערוך כששולם
- `isReadOnly` — נגזר מ־`isLockedByPaid && !canEditWhenPaid`
- `isAdminEditingPaid` — רק ADMIN/SUB_ADMIN (דרישת סיבת עריכה נשארת)

### 3. הודעות במסך

- **חסימה (LAWYER):** "FINANCE, ADMIN או SUB_ADMIN יכולים לתקן במקרים חריגים."
- **FINANCE בעריכה:** "עריכת הוצאה שסומנה כשולמה (Snapshot רך). ניתן לתקן בדיעבד..."
- **ADMIN/SUB_ADMIN:** ללא שינוי — נדרשת סיבת שינוי לפני שמירה.

---

## מה לא שונה בכוונה

- **חישובים פיננסיים** — `financialExpensesCalculator`, `calculateSheetTotals` — ללא שינוי
- **זרימת דיווח** — שליחה, תרגום, PDF — ללא שינוי
- **הרשאות מוצר** — אותם תפקידים, ללא הרחבה (רק מימוש מלא של FINANCE/ADMIN)
- **Legacy** — FinancialTracker, expensesSum — ללא שינוי
- **סטטוסים** — DRAFT, READY_FOR_REPORT, SENT, וכו' — ללא שינוי
- **insertWorksheetIntoSection** — LAWYER/ADMIN ממשיכים לרענן snapshot במכוון; ללא שינוי
- **Migration** — continues to **not** overwrite existing `expensesHtml` (התנאי `!r.expensesHtml` נשמר)

---

## אישורים

- אין שינוי בחישובים פיננסיים
- אין שינוי בזרימת הדיווח המשפטית
- אין שינוי בהרשאות — רק מימוש שלהן (FINANCE כעת יכולה לערוך כששולם)
- אין refactor רחב
- אין UX חדש — רק עדכון הודעות קיימות
