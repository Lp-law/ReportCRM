# מודל נעילת דו"חות ודיווחים חוזרים

מסמך זה מתאר בקצרה את מודל הנעילה במערכת הדיווחים, כדי למנוע רגרסיות והוספת "קיצורי דרך" שמאפשרים שכתוב היסטוריה.

## הגדרות בסיס

- **SENT** – סטטוס דו"ח שנשלח לברוקר (לא ישירות למבטחת).
- **lockState** – אובייקט מחושב (`ReportLockState`) שמחזיר:
  - `isLocked` – האם הדו"ח נעול בפועל לעריכה.
  - `lockType` – `'NONE' | 'AUTO' | 'MANUAL'`.
  - `lockAt` / `autoLockAt` / `remainingDays` / `reasonSummary`.
- **Admin Override** – חריג זמני שבו אדמין (ליאור) פותח דו"ח נעול לעריכה, עם תיעוד.

> חשוב: **SENT ≠ נעילה**. הנעילה האמיתית נגזרת מ־`getReportLockState` + Override, לא ישירות מהסטטוס.

## מי יכול לערוך מה

- **LAWYER**
  - לא עורכת דו"ח עם `status === 'SENT'` בכלל, גם אם `lockState.isLocked === false`.
  - עבור LAWYER, דו"ח SENT הוא תמיד לקריאה בלבד.

- **ADMIN**
  - יכול לערוך דו"ח SENT כל עוד `lockState.isLocked === false` (בתוך חלון ה־35 ימים, ללא נעילה ידנית וללא סגירת תיק).
  - אחרי שנעול (`lockState.isLocked === true`) – יכול לערוך **רק** עם Admin Override מפורש.

## ציר זמן הנעילה

הנעילה מחושבת דרך `getReportLockState(report, caseFolder?)`:

1. **firstSentAt** – זמן השליחה הראשונה לברוקר נשמר ב־`report.firstSentAt` ואינו משתנה ב־Resend.
2. **Auto-lock** – נעילה אוטומטית לאחר:
   - `firstSentAt + 35 ימים + Σ(extensions.days)`  
   - התוצאה נשמרת לוגית כ־`autoLockAt` ומוצגת כטקסט ב־`reasonSummary`.
3. **Extensions (הארכות חלון)**
   - לכל הארכה אדמיניסטרטיבית נוספת נשמרת רשומה ב־`report.lockExtensions[]` עם:
     - `extendedAt`, `extendedById`, `extendedByName`, `days` (בשלב זה תמיד 35), `reason`.
   - הארכה אפשרית **רק לפני נעילה בפועל**.
4. **Manual lock**
   - אדמין יכול לנעול דו"ח ידנית בכל רגע על ידי מילוי:
     - `manualLockedAt`, `manualLockedById`, `manualLockedByName`, `manualLockReason`.
   - ברגע זה `lockState.lockType === 'MANUAL'` ו־`isLocked === true` באופן מיידי.
5. **Case closure**
   - אם יש `CaseFolder.closedAt`, הנעילה היא מוחלטת:
     - כל הדו"חות בתיק נחשבים נעולים, בלי קשר ל־`firstSentAt` / `manualLockedAt`.
     - `reasonSummary` מסביר שהדוח נעול כי התיק סגור.

היישום המלא של הלוגיקה נמצא ב־`src/utils/reportLock.ts`.

## התנהגות Resend

Resend הוא שליחה מחדש לברוקר של **אותו דו"ח** (אותו `reportNumber`), ולא יצירת דו"ח חדש.

- **בתוך חלון (לא נעול):**
  - ניתן לערוך תוכן (עבור ADMIN בלבד) ולבצע Resend כ־"Corrected resend".
  - המערכת מסמנת באובייקט ההיסטוריה:
    - `isCorrection === true`
    - `revisionIndex` גדל (1, 2, 3...) עבור אותו דו"ח.
  - `firstSentAt` **אינו מתעדכן** – השעון של 35 הימים ממשיך מאותה נקודה.

- **אחרי נעילה (Auto / Manual / CaseClosed):**
  - התוכן אינו ניתן לעריכה (ללא Override).
  - Resend אפשרי רק כ־"Resent" טכני:
    - `isCorrection === false`
    - אין שינוי תוכן לפני השליחה.

> כלל ברזל: תיקון אחרי נעילה חייב להיות דו"ח חדש (`reportNumber` גבוה יותר) או Override חריג ומתועד.

## מצבים מיוחדים

- **Case Closed (סגירת תיק)**
  - `CaseFolder.closedAt` חוסם:
    - יצירת דו"ח חדש בתיק.
    - יצירת `financeUpdateReport` חדש במסלול הפיננסים.
    - עריכה של דו"חות קיימים (ללא Override).
  - Reopen (אדמין בלבד) מאפס את `closedAt` ומחזיר את התיק לעבודה רגילה.

- **Admin Override**
  - חריג נקודתי, פר דו"ח, שמופעל רק ע"י אדמין.
  - מאפשר לערוך דו"ח נעול (כולל SENT + נעול).
  - כל Override מתועד (מי, מתי, ולמה) ומוצג גם ב־UI.

## קבצים ו"נקודות חיבור" בקוד

- **חישוב נעילה**
  - `src/utils/reportLock.ts` – `getReportLockState(report, caseFolder?)` הוא מקור האמת היחיד ללוגיקת נעילה.

- **נרמול מספר תיק (Odakanit)**
  - `src/utils/normalizeOdakanitNo.ts` – פונקציית נרמול יחידה למפתחי תיק:
    - ממירה NBSP לרווח.
    - מסירה כל רווח/whitespace.
    - עושה `trim`.
  - חובה להשתמש בה בכל lookup בין:
    - דו"ח ↔ `CaseFolder`
    - Finance ↔ Case
    - Seed / Dashboards ↔ Case

- **Guards על עדכון דו"ח**
  - `handleUpdateReport` ו־`updateReportById` ב־`src/App.tsx`:
    - בודקים:
      - האם LAWYER מנסה לעדכן דו"ח SENT.
      - האם `lockState.isLocked === true` ללא Override.
    - במקרים אלה העדכון נחסם, והתנהגות זו נחשבת **חלק מהמודל**, לא פרט מימוש.
  - טלמטריה לניסיונות עריכה חסומים:
    - `src/utils/telemetry.ts` – `logBlockedEdit`.

- **היסטוריית Resend**
  - לוגיקת שליחה/Resend ושדות כמו `isCorrection` / `revisionIndex` מיושמים במסלולי השליחה ב־`src/App.tsx` וה־server (ללא שינוי במודל זה).

## עקרונות שלא שוברים

1. אי אפשר "לעקוף" נעילה על ידי שינוי סטטוס בלבד – צריך לעבוד דרך `getReportLockState` + Override.
2. LAWYER לעולם לא עורכת דו"ח SENT.
3. ADMIN לא עורך דו"ח נעול ללא Override מתועד.
4. Resend אחרי נעילה **לא** כולל שינוי תוכן.
5. כל מפתח חדש שמתעסק בעריכה, שליחה, נעילה או Resend – חייב להכיר את המסמך הזה ואת `reportLock.ts` לפני שינוי קוד.


