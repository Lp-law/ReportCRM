# Post-Stabilization Audit — Report CRM

**תאריך:** 2025-02-06  
**סוג:** אבחון בלבד — ללא שינוי קוד, ללא הצעות פתרון, ללא TODO

---

## 1. Executive Summary

המערכת יציבה ופועלת לאחר רצף התיקונים שבוצעו. הזרימות העיקריות — Setup → Draft → Preview → Send, Finance → Report → Snapshot, OCR/AI → fallback — רצות. יחד עם זאת קיימות נקודות סיכון UX, חוסר עקביות בין מסכים, ואזורי Legacy שממשיכים לפעול אך דורשים תשומת לב אם יוגדרו שינויים עתידיים. אין חורים קריטיים שמונעים עבודה יומיומית.

---

## 2. נקודות סיכון UX

1. **כפתור "Edit file name titles" חסום ללא הסבר** — ב־Preview, כשהכפתור חסום (למשל כשאין סקשנים זמינים לעריכת כותרות), אין tooltip או הודעה המסבירים למה הוא לא לחיץ. המשתמש עלול לחשוב שמדובר בתקלה.

2. **שורות עם רקע צבעוני (READY_TO_SEND, SENT, EXPENSE חדש)** — הטקסט על רקעים בהירים (red-50, green-50, emerald-50) יורש ניגודיות חלשה מתבנית הכהה. קריאות נמוכה במיוחד בטבלאות "תיקים לפי מספר עודכנית" ובממשק Finance.

3. **טקסט "Export options let you back up… (JSON/CSV)"** — מופיע ב־Preview מעל ה־Toolbar, אך הכפתורים JSON/CSV מוסתרים מ־ADMIN ו־LAWYER. נוצר רושם שיש אפשרות שהמשתמש לא רואה.

4. **העוזר החכם בשלושה מקומות** — Stepper header, ליד "2. Draft Content", ב־Toolbar Preview. אותה פעולה חוזרת; עלול ליצור רעש ויזואלי ואי־בהירות אם יש הבדל בין ההקשר.

5. **כפתורים מושבתים ללא tooltip** — חלק מהכפתורים (למשל "Improve this section" כשאין תוכן אנגלי, "Edit file name titles" כשאין אפשרויות) מושבתים ללא הסבר למשתמש.

6. **אין היררכיה ויזואלית ב־Preview** — Finalize, הכן שליחה מחדש, Download PDF, Edit file names מוצגים באותו משקל. קשה להבחין בין פעולה ראשית לפעולות משניות.

7. **מודל גיבוי לפני Logout** — "התנתק (לאחר גיבוי)" דורש הורדת גיבוי. אם המשתמש לא רוצה להוריד, עליו ללחוץ "התנתק בכל זאת". שני כפתורים במודל — עלול לבלבל במהירות.

8. **Dashboard איריס — חסרת עמודת PLAINTIFF/CLAIMANT** — הנתון זמין ב־`linkedReport.plaintiffName` אך לא מוצג בטבלת "טבלאות הוצאות". לא קריטי אך פוגע בשימושיות.

---

## 3. נקודות חוסר עקביות

1. **כפתור "פתיחת דיווח חדש"** — מוסתר מ־ADMIN בדשבורד (header). אם קיימת טבלת ReportsTable עם `showNewReportButton`, ברירת המחדל היא true — ייתכן שהיא מוצגת במקום אחד ומוסתרת במקום אחר לפי role.

2. **העוזר החכם — תנאי זמינות** — ב־AssistantPanel הכפתורים מושבתים כשאין דיווח; כשקיים דיווח הפעולות רצות. במקומות שבהם העוזר נפתח ללא דיווח (למשל מ־AdminDashboard) — הפאנל מציג הודעת "אין דו״ח פעיל". עקביות סבירה אך הזרימה שונה בין מסכים.

3. **הודעות שגיאה** — הודעות PDF בעברית, הודעות העוזר החכם בעברית, הודעות AI/OCR באנגלית. אין תקן אחיד לשפה ולסגנון.

4. **פעולות דומות במסכים שונים** — "חזרה לדשבורד" מופיע ב־STEP2 וב־Preview בתבניות שונות. "Back to Editing" ו־"Back to Step 2" — שמות דומים, מקומות שונים.

5. **JSON Export / CSV Export** — זמינים ל־FINANCE ו־SUB_ADMIN, מוסתרים מ־ADMIN ו־LAWYER. הטקסט המזכיר אותם מוצג לכולם.

---

## 4. אזורי Legacy שדורשים תשומת לב בעתיד

1. **Migration ל־expensesHtml** — דיווחים עם `expensesSheetId` אך בלי `expensesHtml` מקבלים snapshot "חי" מ־`buildCumulativeExpensesSnapshot` בניגוד לכוונה של snapshot בזמן החיבור. אין מנגנון מפורש להבחנה בין "דיווח שננעל" ל"דיווח פתוח לעדכון".

2. **Policy חסרה ב־PDF** — כשמדובר ב־attachPolicyAsAppendix=true אך policyFile חסר או ללא data, השרת מחזיר 400 עם הודעה בעברית. כשהפוליסה חסרה בדיווח — PDF יוצא ללא policy בשקט, בלי feedback למשתמש.

3. **קוד שתומך ב־hebrewFactProtection** — קיימים קבצי `.js` ו־`.ts` באותו שם (hebrewFactProtection). ייתכן שייבוא מפנה לגרסה אחת; אין ודאות שכל המסלולים מעודכנים.

4. **SEED_TOOL_ENABLED** — כפתור SEED בדשבורד ליאור מותנה ב־flag. אם ה־flag כבוי — הכפתור לא מופיע. קוד ה־Seed ממשיך להתקיים.

5. **ReportsTable — showNewReportButton** — prop אופציונלי נוסף; לא תמיד מועבר מהקריאות. אם יש מסך שמשתמש ב־ReportsTable ללא העברת הערך — ברירת המחדל היא true.

6. **Grammarly Editor SDK** — השימוש ב־`@grammarly/editor-sdk-react` נמשך. ה־SDK הוצא משימוש רשמית; המערכת עובדת אך תלויה בהמשך תמיכה או בהרחבת הדפדפן.

---

## 5. מה יציב ובטוח להמשך

1. **זרימת Draft → Review → PDF → Send** — רצה כראוי. תנאי role, סטטוסים ומעברים ברורים.

2. **Logout** — קורא ל־`/api/logout` ומנקה state. מודל גיבוי מאפשר יציאה גם בלי הורדה.

3. **Smart Assistant** — מחזיר תוכן מועיל גם כשהשרת מחזיר 500 (למשל חוסר API key). הודעות ברורות יותר מבעבר.

4. **PDF generation** — Puppeteer עם args מותאמים ל־Render; timeouts וטיפול בשגיאות משופרים.

5. **Finance → Report → Snapshot** — חיבור הגיליון לדיווח ו־expensesHtml שמורים. "נשלח לעו״ד" ו־"הוסף טבלת הוצאות" בונים snapshot בזמן הפעולה.

6. **OCR / AI fallback** — כשל מחזיר הודעות; המשתמש יכול להמשיך לעבוד. אין חסימה מלאה של המסך.

7. **נעילות דיווח ותיקים סגורים** — באנרים ברורים; ADMIN יכול לפתוח חריגה עם תיעוד סיבה.

---

## 6. מה לא כדאי לגעת בו כרגע

1. **מבנה ה־PDF** — תבנית, חתימה, ברקוד, cover badge. כל שינוי עלול לשבור תאימות עם מסמכים קיימים.

2. **חישובי הוצאות וסטטוסים פיננסיים** — לוגיקת `buildCumulativeExpensesSnapshot`, `financialExpensesCalculator`, סטטוסי EXPENSE/ADJUSTMENT. שינויים דורשים בדיקה עסקית מלאה.

3. **הרשאות ו־roles** — ADMIN, LAWYER, FINANCE, SUB_ADMIN. תנאי `ensureAdminRole`, `ensureAuthenticated`. לא לשנות ללא החלטת מוצר.

4. **workflow סטטוסים** — DRAFT, SUBMITTED, HEBREW_SUBMITTED, HEBREW_APPROVED, READY_TO_SEND, SENT. מעברים בין סטטוסים מקודדים במספר מקומות.

5. **מבנה localStorage ו־ReportData** — שדות כמו `expensesHtml`, `expensesSnapshotAt`, `translatedContent`, `reportReview`. שינוי מבנה ישפיע על דיווחים קיימים.

6. **Block 3 ו־Block 4** — נושאים שטרם טופלו; לא להיכנס אליהם במסגרת ייצוב נוכחי.
