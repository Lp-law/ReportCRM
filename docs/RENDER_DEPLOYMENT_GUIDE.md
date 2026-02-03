# מדריך פריסה ל־Render — Report CRM (STAGING)

הוראות מדויקות לפריסה ל־Render כ־STAGING — **ללא שינוי קוד**. רק תיעוד, הוראות, צ'קליסטים וקונפיגורציית Render.

---

# 1) Render Service Setup (Step-by-Step)

## סוג Service

- **בחר: Web Service** (לא Static Site, לא Background Worker).
- סיבה: האפליקציה כוללת שרת Node (Express) שמגיש את ה־SPA ומספק API.

## חיבור Git

1. ב־[Render Dashboard](https://dashboard.render.com) → **New** → **Web Service**.
2. **Connect a repository:** חבר את ה־Git שבו נמצא הפרויקט Report CRM (GitHub / GitLab / Bitbucket).
3. אם הפרויקט עדיין לא ב־Git — דחוף אותו ל־repo ואז חבר את ה־repo ל־Render.

## Branch מומלץ

- **Branch:** `main` (או `master` — לפי ברירת המחדל ב־repo).
- ל־STAGING מומלץ לפרוס מ־branch ייעודי (למשל `staging`) אם רוצים להפריד מ־production; אחרת `main` מספיק.
- **הגדרה ב־Render:** בשדה **Branch** להזין את ה־branch שממנו לפרוס (למשל `main` או `staging`).

## Root Directory

- **השאר ריק** — הפרויקט נמצא בשורש ה־repo (אין תת־תיקייה כמו `app/` או `frontend/`).
- אם הפרויקט בתוך תיקייה (למשל `report-crm/`) — בשדה **Root Directory** להזין את התיקייה הזו.

## Build Command (כולל Puppeteer / Chrome)

- **השתמש בפקודה המלאה להלן.**  
- **Build Command מומלץ:**
  ```bash
  npm ci && npx puppeteer browsers install chrome && npm run build
  ```
- **הסבר:**  
  - `npm ci` — התקנה מדויקת לפי `package-lock.json` (יציב ל־build).  
  - `npx puppeteer browsers install chrome` — התקנת Chrome ל־Puppeteer (ב־Render אין Chromium מובנה).  
  - `npm run build` — בניית ה־frontend (Vite) ל־`dist/`.
- **אם משמיטים את `npx puppeteer browsers install chrome`:** ייצור PDF ייכשל עם שגיאה בסגנון "Could not find Chrome" / "Failed to launch browser". שאר האפליקציה (login, תרגום, שיפור) תעבוד.

## Start Command

- **Start Command:**
  ```bash
  npm start
  ```
- שווה ערך ל־`node server.js` (לפי `package.json`). השרת מאזין ל־`process.env.PORT` ש־Render מגדיר אוטומטית.

## Node Version

- **אופציונלי:** אם רוצים לקבע גרסה — ב־Render: **Environment** → **Add Environment Variable** → **Key:** `NODE_VERSION`, **Value:** `20` (או `18`).
- או בקובץ **.nvmrc** בשורש הפרויקט עם שורה אחת: `20` — Render יקרא מזה אם מוגדר.
- אם לא מגדירים — Render ישתמש בברירת המחדל (למשל Node 18/20).

---

# 2) Build Command (קריטי)

## Build Command מלא ומומלץ

```bash
npm ci && npx puppeteer browsers install chrome && npm run build
```

## למה כל חלק

| חלק | תפקיד |
|-----|--------|
| `npm ci` | מתקין תלויות בדיוק לפי `package-lock.json`. מתאים לסביבת build (reproducible). |
| `npx puppeteer browsers install chrome` | מוריד ומתקין את Chrome שהחבילה `puppeteer` משתמשת בו. ב־Render אין Chrome מובנה — בלי זה `puppeteer.launch()` נכשל. |
| `npm run build` | מריץ `vite build` ויוצר תיקיית `dist/` עם ה־SPA. השרת מגיש מכאן את הקבצים הסטטיים. |

## מה קורה אם משמיטים את Chrome install

- **בלי** `npx puppeteer browsers install chrome`:  
  - Build יעבור (Vite בונה בהצלחה).  
  - בעת ריצה — כל קריאה ל־**ייצור PDF** (הורדת PDF / תצוגה מקדימה) תגרום לשרת להחזיר **500** עם "Failed to generate PDF" או "Could not find Chrome".  
- Login, תרגום, שיפור עברית/אנגלית, תבניות — **ימשיכו לעבוד**.

## זמן build צפוי

- **בערך 3–7 דקות** (תלוי ב־Render):  
  - `npm ci` — כ־1–2 דקות.  
  - `puppeteer browsers install chrome` — כ־1–3 דקות (הורדת Chrome).  
  - `npm run build` — כ־1–2 דקות.

---

# 3) Environment Variables

| ENV name | ערך ל־STAGING | חובה/רשות | הערות בטיחות |
|----------|----------------|-----------|---------------|
| **PORT** | (Render מגדיר אוטומטית) | אוטומטי | אל תגדיר — Render מזריק. |
| **NODE_ENV** | `production` | רשות | מומלץ ל־cookies secure. |
| **OPENAI_API_KEY** | `sk-...` (מפתח אמיתי) | **חובה** | חובה ל־תרגום, שיפור עברית, שיפור אנגלית, tone-risk, review-hebrew-style. **Secret.** |
| **EMAIL_USER** | **לא להגדיר** | רשות | **בטיחות STAGING:** אל תגדיר — מונע שליחת מייל אמיתי. |
| **EMAIL_PASS** | **לא להגדיר** | רשות | **בטיחות STAGING:** אל תגדיר. |
| **EMAIL_SERVICE** | לא להגדיר | רשות | אם לא מגדירים EMAIL_USER/PASS — לא רלוונטי. |
| **DATA_DIR** | לא להגדיר | רשות | ברירת מחדל: `data/` יחסית ל־root. אֶפֶמֶרִי ב־Render. |
| **OPENAI_MODEL** | `gpt-4o-mini` | רשות | ברירת מחדל בשרת. |
| **DOC_CHAR_LIMIT** | לא להגדיר | רשות | ברירת מחדל 18000. |
| **NODE_VERSION** | `20` או `18` | רשות | רק אם רוצים לקבע גרסת Node. |

**סיכום בטיחות STAGING:**  
- **חובה:** רק `OPENAI_API_KEY`.  
- **אסור ב־STAGING:** `EMAIL_USER`, `EMAIL_PASS` — כדי שלא יישלח מייל אמיתי בטעות.

---

# 4) Staging Safety Configuration

## איך לוודא שלא נשלח מייל אמיתי

1. **ב־Render:** ב־Environment Variables **אל תוסיף** `EMAIL_USER` ו־`EMAIL_PASS`.
2. **אימות:** אחרי פריסה — התחבר כ־ADMIN, פתח דיווח ב־READY_TO_SEND, לחץ "שלח מייל".  
   - **תוצאה צפויה:** שגיאה (500) והודעה בסגנון "Server email configuration missing" או "Failed to send email".  
   - **אין** מייל שיוצא מהמערכת.

## איך לבדוק PDF בלי לפגוע בפרודקשן

- STAGING ו־Production (אם קיים) הם **Services נפרדים** ב־Render — כל אחד עם URL משלו.
- בדיקת PDF ב־STAGING: נכנסים ל־URL של ה־STAGING Service, מתחברים, יוצרים דיווח עם תוכן, לוחצים "הורד PDF" / "תצוגה מקדימה".  
- **אין שיתוף נתונים** עם פרודקשן — אין פגיעה בפרודקשן.

## איך לבדוק OpenAI בלי עומס

- להשתמש ב־**מפתח OpenAI נפרד** ל־STAGING (למשל מפתח עם limit נמוך או חשבון בדיקה).  
- או להשתמש באותו מפתח — אז העומס נספר באותו חשבון; מומלץ לא להריץ בדיקות כבדות במקביל ל־production.

## איך לוודא שלא עובדים עם נתונים אמיתיים

- **דיווחים וגיליונות:** נשמרים ב־**localStorage** בדפדפן — כל משתמש רואה רק מה שנשמר אצלו באותו דפדפן.  
- **STAGING URL שונה** מ־production — משתמשים שנכנסים ל־STAGING משתמשים ב־localStorage של הדומיין של STAGING (למשל `xxx.onrender.com`), לא של production.  
- **תבניות ו־Best Practices:** נשמרים ב־`data/` על השרת — ב־STAGING זה אֶפֶמֶרִי ומתאפס ב־redeploy; אין גישה ל־data/ של פרודקשן.

---

# 5) Post-Deploy Smoke Tests

צ'קליסט לבדיקה אחרי עלייה ל־Render:

| # | בדיקה | צעדים | תוצאה צפויה |
|---|--------|--------|--------------|
| 1 | **Login** | גלוש ל־URL של ה־Service → הזן username + password (מ־constants) | כניסה ללוח / מסך דשבורד |
| 2 | **יצירת דיווח** | ADMIN/LAWYER — "דיווח חדש" / New Report, מלא שדות בסיסיים, שמור | דיווח מופיע ברשימה, נשמר אחרי רענון (localStorage) |
| 3 | **שליחה לליאור** | LAWYER — פתח דיווח, מלא עברית, "שלח לליאור לבדיקה" | סטטוס SUBMITTED / HEBREW_SUBMITTED; ADMIN רואה בדשבורד |
| 4 | **תרגום** | ADMIN — פתח דיווח שאושר עברית, "תרגם לאנגלית" | טקסט אנגלית מופיע בסעיפים |
| 5 | **שיפור** | ADMIN — "שפר אנגלית" על סעיף | טקסט מעודכן |
| 6 | **PDF** | ADMIN — דיווח עם תוכן → "הורד PDF" או "תצוגה מקדימה" | קובץ PDF נטען / נפתח (אם Chrome הותקן ב־Build) |
| 7 | **ניסיון שליחת מייל** | ADMIN — דיווח READY_TO_SEND → "שלח מייל" | **כשל מבוקר:** 500, הודעה "Server email configuration missing" או "Failed to send email" — **אין מייל יוצא** |

**אם אחת הבדיקות נכשלת:**  
- Login/דיווח/תרגום/שיפור — לבדוק לוגים ב־Render (Logs) ו־Environment (OPENAI_API_KEY).  
- PDF — לוודא ש־Build Command כלל `npx puppeteer browsers install chrome`.  
- מייל — אם **כן** נשלח מייל — להסיר מיד את EMAIL_USER ו־EMAIL_PASS מ־Environment ב־Render.

---

# 6) Known Limitations (STAGING)

רשימה ברורה:

1. **localStorage**  
   - דיווחים וגיליונות כספיים נשמרים רק ב־localStorage בדפדפן.  
   - מחיקת cache / דפדפן אחר / מכשיר אחר = אובדן הנתונים האלה. אין גיבוי אוטומטי.

2. **data/ אֶפֶמֶרִי**  
   - תבניות (Section Templates) ו־Best Practices נשמרים בקבצים ב־`data/` על השרת.  
   - ב־Render הדיסק אֶפֶמֶרִי — **אחרי כל redeploy** התיקייה מתאפסת והתבניות/ Best Practices שהוספו יאבדו (אלא אם חיברת Persistent Disk ל־data/).

3. **אין multi-user אמיתי**  
   - אין DB משותף — כל דפדפן רואה רק את ה־localStorage שלו.  
   - משתמשים שונים במכשירים שונים לא רואים את אותם דיווחים אלא אם "חולקים" אותו דפדפן/מכשיר.

4. **אין backup**  
   - אין גיבוי אוטומטי של דיווחים או גיליונות.  
   - גיבוי/ייצוא — באחריות המשתמש (אם יוטמע בעתיד).

5. **סיסמאות ב־constants**  
   - משתמשים וסיסמאות מוגדרים בקוד (`src/constants.ts`). שינוי סיסמאות דורש שינוי קוד ו־deploy.

---

# 7) Rollback / Redeploy

## מתי Redeploy מוחק נתונים

- **בכל Deploy חדש** (למשל דחיפת commit חדש או "Manual Deploy"):  
  - **השרת:** הדיסק אֶפֶמֶרִי — כל מה שנכתב ל־`data/` (תבניות, Best Practices) **נמחק**.  
  - **הלקוח:** דיווחים וגיליונות ב־localStorage **לא** נמחקים על ידי Render — הם בדפדפן. אבל אם המשתמש נכנס מ־URL חדש או מנקה storage — הוא עלול לאבד אותם.

## מה צריך לגבות ידנית (אם בכלל)

- **תבניות ו־Best Practices:** אם הוספת תבניות חשובות ב־STAGING ורוצים לשמר — להעתיק את תוכן `data/sectionTemplates.json` ו־`data/bestPractices.json` (למשל מתוך לוגים או מבדיקה מקומית שמייבאת אותם) לפני redeploy.  
- **דיווחים/גיליונות:** אין גיבוי בצד שרת — רק ב־localStorage. אם רוצים גיבוי — יש לייצא ידנית (כרגע אין פיצ'ר ייצוא במערכת).

## איך לשחזר Service

- **כשלון build / crash אחרי deploy:**  
  1. ב־Render Dashboard → ה־Web Service → **Events** / **Logs** — לבדוק את השגיאה.  
  2. **Rollback:** ב־**Events** אפשר לבחור Deploy קודם שהצליח ולבחור **Rollback to this version** (אם זמין).  
  3. או: לתקן הגדרות (Environment, Build Command) ולבצע **Manual Deploy** מחדש.

- **שחזור "למצב עובד":**  
  - לוודא Build Command כולל את התקנת Chrome;  
  - לוודא OPENAI_API_KEY מוגדר;  
  - להסיר EMAIL_* אם לא רוצים מייל;  
  - להריץ Deploy מחדש.

---

# 8) Deployment Diff Summary

## אילו הגדרות Render נוספו/שונו

- **סוג Service:** Web Service.  
- **Build Command:** `npm ci && npx puppeteer browsers install chrome && npm run build`.  
- **Start Command:** `npm start`.  
- **Environment Variables:**  
  - **חובה:** `OPENAI_API_KEY`.  
  - **אסור ב־STAGING:** `EMAIL_USER`, `EMAIL_PASS` (לא מוגדרים).  
  - **אופציונלי:** `NODE_ENV=production`, `NODE_VERSION=20`.  
- **Branch:** לפי בחירה (למשל `main` או `staging`).  
- **Root Directory:** ריק (או תיקיית הפרויקט אם לא בשורש).  

**אין שינוי בקבצי הקוד או ב־repo** — רק הגדרות ב־Render Dashboard (ו־תיעוד במסמך זה).

## האם נגעת בקוד?

**NO.**  
לא בוצע שום שינוי בקוד (לא frontend ולא server). נוצר רק מסמך תיעוד: `docs/RENDER_DEPLOYMENT_GUIDE.md`.

## אישור

**STAGING READY** — בהתאם להנחיות במדריך זה (Build Command עם Chrome, OPENAI_API_KEY מוגדר, EMAIL_* לא מוגדרים ב־STAGING, וקבלת המגבלות: localStorage, data/ אֶפֶמֶרִי, אין backup).

---

*מסמך זה הוא תיעוד והוראות פריסה בלבד. לא בוצעו שינויים בקוד.*
