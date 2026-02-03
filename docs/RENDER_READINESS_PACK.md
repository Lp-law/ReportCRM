# Render Readiness Pack — Report CRM (STAGING)

מסמך מרכזי להעלאה ל־Render כ־STAGING — **ללא שינוי קוד**. תיעוד, צ'קליסטים, נהלים והחלטות בלבד.

---

# 1. Executive Summary (עמוד אחד)

## האם המערכת יכולה לעלות ל־Render כ־STAGING בלי שינוי קוד?

**כן עם הסתייגויות.**

- האפליקציה (React + Express) תרוץ על Render: Build (`vite build`) + Start (`node server.js`) + משתני סביבה.
- **Puppeteer:** ב־Render אין Chromium מובנה. ייצור PDF ייכשל אלא אם מוסיפים להתקנה את Chrome (למשל בשלב ה־Build). **זה דורש שינוי ב־Build Command בלבד** (לא בקוד האפליקציה) — ראו סעיף 7.
- **דאטה:** דיווחים וגיליונות כספיים ב־localStorage (צד לקוח). תבניות ו־Best Practices נשמרים ב־`data/` על השרת — **ב־Render הדיסק אֶפֶמֶרִי**; אחרי redeploy הקבצים ב־data/ יאבדו אלא אם מחברים Persistent Disk (הגדרה ב־Render, לא קוד).
- **מייל:** אם לא מגדירים EMAIL_USER/EMAIL_PASS — שליחת מייל תחזיר 500; האפליקציה לא "תקרוס". ל־STAGING מומלץ **לא** להגדיר מייל אמיתי (או להשתמש בחשבון בדיקה) כדי למנוע שליחה בטעות.

## 5 הסיכונים העיקריים לפני העלאה

| # | סיכון | Impact | Likelihood | הערה |
|---|--------|--------|------------|------|
| 1 | **Puppeteer לא מוצא Chrome** — ייצור PDF נכשל | גבוה | גבוה | ב־Render Chrome לא מותקן כברירת מחדל. פתרון: הרחבת Build Command (ראו סעיף 7). |
| 2 | **אובדן data/ אחרי redeploy** — תבניות ו־Best Practices | בינוני | גבוה | filesystem אֶפֶמֶרִי. פתרון: Persistent Disk ב־Render או קבלה ש־STAGING מתאפס. |
| 3 | **שליחת מייל אמיתי בטעות** מ־STAGING | גבוה | בינוני | אם מגדירים SMTP אמיתי. פתרון: לא להגדיר EMAIL_* ב־STAGING או להשתמש ב־inbox בדיקה. |
| 4 | **localStorage מנוקה** — אובדן דיווחים/גיליונות אצל משתמש | גבוה | בינוני | לא ספציפי ל־Render; כל מחיקת cache/דפדפן אחר. תיעוד והנחיה למשתמש. |
| 5 | **OpenAI timeout/429** — תרגום/שיפור נכשלים | בינוני | נמוך–בינוני | המשתמש רואה שגיאה; אין retry אוטומטי. תיעוד ב־Runbook. |

## תנאים מינימליים להעלאה בטוחה

1. **OPENAI_API_KEY** מוגדר — אחרת כל ה־AI endpoints יכשלו.
2. **Build Command** כולל התקנת Chrome ל־Puppeteer (או קבלה ש־PDF לא יעבוד ב־STAGING).
3. **לא** להגדיר EMAIL_USER/EMAIL_PASS ב־STAGING (או להשתמש בחשבון בדיקה בלבד).
4. **NODE_ENV=production** (או לא מוגדר) — Render מגדיר PORT; האפליקציה מאזינה ל־process.env.PORT.
5. קבלה מפורשת: דיווחים וגיליונות נשמרים רק ב־localStorage; data/ (תבניות) עלול להתאפס ב־redeploy אלא אם יש Persistent Disk.

## קביעה מפורשת

**Go with Constraints.**

- **Go:** אפשר להעלות ל־Render כ־STAGING.
- **Constraints:**
  - הרחבת Build Command להתקנת Chrome (או להכיר ש־PDF לא יעבוד).
  - לא לשלוח מייל אמיתי מ־STAGING (או inbox בדיקה בלבד).
  - לתעד למשתמשים: דיווחים/גיליונות רק בדפדפן הנוכחי; גיבוי/ייצוא באחריותם.
  - אם רוצים לשמר תבניות בין deploy — לחבר Persistent Disk ל־data/.

---

# 2. Pre-Render Checklist (Pass / Fail)

## A. Server & Build

| בדיקה | איך בודקים ידנית | תוצאה תקינה | אם נכשל | Blocker? | נדרש שינוי קוד? |
|--------|-------------------|-------------|----------|----------|------------------|
| `npm install` | בטרמינל: `npm install` | יוצא 0, אין שגיאות קריטיות | תלות חסרה / גרסה לא תואמת | כן | לא |
| `npm run build` | `npm run build` | תיקיית `dist/` נוצרת, קובץ `index.html` + assets | שגיאת Vite/TS — אין dist | כן | לא |
| `node server.js` | `node server.js` (אחרי build) | לוג "Server running on port..." | crash — חסר מודול / env | כן | לא |
| PORT | להגדיר `PORT=5000` ולהריץ שרת | שרת מאזין על 5000 | אם לא מוגדר — 3000; ב־Render Render מגדיר PORT | לא | לא |

---

## B. OpenAI Endpoints

| בדיקה | איך בודקים ידנית | תוצאה תקינה | אם נכשל | Blocker? | נדרש שינוי קוד? |
|--------|-------------------|-------------|----------|----------|------------------|
| OPENAI_API_KEY קיים | להגדיר ב־.env ולהריץ שרת | אין לוג "OPENAI_API_KEY not defined" | AI endpoints מחזירים 500 / "OpenAI not configured" | כן (ל־STAGING משמעותי) | לא |
| תרגום | Login → דיווח → "תרגם לאנגלית" | טקסט אנגלית מוחזר | 500 / "Translation failed" | כן | לא |
| שיפור עברית (refine) | כפתור "שפר עברית" לסעיף | טקסט מעודכן | 500 / FACT_PROTECTION_FAILED | לא (חלקי) | לא |
| שיפור אנגלית | "שפר אנגלית" לסעיף אנגלית | טקסט משופר | 500 | לא | לא |
| review-hebrew-style | "בדיקת ניסוח עברית" | רשימת issues או ריק | 500 | לא | לא |
| analyze-tone-risk | "טון וסיכון" | issues או ריק | 500 | לא | לא |

---

## C. PDF Generation (Puppeteer)

| בדיקה | איך בודקים ידנית | תוצאה תקינה | אם נכשל | Blocker? | נדרש שינוי קוד? |
|--------|-------------------|-------------|----------|----------|------------------|
| ייצור PDF מקומי | Login → דיווח עם תוכן → הורדת PDF / תצוגה מקדימה | קובץ PDF נטען | 500 "Failed to generate PDF" / "Could not find Chrome" | כן (אם רוצים PDF ב־STAGING) | לא — Build Command |
| Puppeteer launch | שרת עם Chromium מותקן | `puppeteer.launch({ headless: 'new' })` מצליח | timeout / browser not found | כן | לא |

**הערה:** ב־Render אין Chromium. יש להוסיף ל־Build Command: `npx puppeteer browsers install chrome` (או שווה־ערך). ראו סעיף 6–7.

---

## D. Email Sending (Nodemailer)

| בדיקה | איך בודקים ידנית | תוצאה תקינה | אם נכשל | Blocker? | נדרש שינוי קוד? |
|--------|-------------------|-------------|----------|----------|------------------|
| EMAIL_USER + EMAIL_PASS | הגדרה ב־.env, שליחת מייל מהאפליקציה (ADMIN) | מייל נשלח | 500 "Server email configuration missing" או שגיאת SMTP | לא ל־STAGING (מומלץ לא להגדיר) | לא |
| ללא EMAIL_* | לא להגדיר, לנסות לשלוח מייל | 500 עם הודעה ברורה | — | — | לא |

---

## E. Security & Access (internal tool)

| בדיקה | איך בודקים ידנית | תוצאה תקינה | אם נכשל | Blocker? | נדרש שינוי קוד? |
|--------|-------------------|-------------|----------|----------|------------------|
| Login | POST /api/login עם username/password מ־USERS | 200 + cookie | 401 Invalid credentials | — | לא |
| /api/me ללא cookie | קריאה ללא cookie | 401 Not authenticated | — | — | לא |
| Endpoints מוגנים | קריאה ל־/api/translate, /api/templates וכו' ללא auth | 401 (או 403) לפי endpoint | חשיפת נתונים | כן | לא |
| סיסמאות ב־constants | בדיקה ב־src/constants.ts | USERS עם סיסמאות בטקסט — ידוע | סיכון אם הדומיין ציבורי | לא ל־STAGING פנימי | לא |

---

## F. Data Persistence (localStorage limitations)

| בדיקה | איך בודקים ידנית | תוצאה תקינה | אם נכשל | Blocker? | נדרש שינוי קוד? |
|--------|-------------------|-------------|----------|----------|------------------|
| שמירת דיווח | עריכת דיווח → רענון דף | הדיווח נשמר (localStorage) | אובדן אם localStorage מנוקה | לא — מגבלה מתועדת | לא |
| תבניות (server) | ADMIN — הוספת תבנית → רענון | תבנית נטענת מ־GET /api/templates | ב־Render: אובדן אחרי redeploy (אֶפֶמֶרִי) | לא — מגבלה | לא (Persistent Disk בהגדרה) |
| Best Practices | דומה | נשמר ב־data/bestPractices.json | אובדן אחרי redeploy | לא | לא |

---

## G. Status Workflow Invariants

| בדיקה | איך בודקים ידנית | תוצאה תקינה | אם נכשל | Blocker? | נדרש שינוי קוד? |
|--------|-------------------|-------------|----------|----------|------------------|
| "שלח לליאור" | LAWYER — כפתור "שלח לליאור לבדיקה" | reportReview.status SUBMITTED, hebrewWorkflowStatus HEBREW_SUBMITTED | סטטוס לא מתעדכן | כן | לא |
| "אישור עברית" | ADMIN — "אישור עברית לתרגום" | HEBREW_APPROVED, כפתור תרגום פעיל | תרגום חסום | כן | לא |
| תרגום רק אחרי אישור | ADMIN — דיווח ללא אישור עברית | כפתור "תרגם" disabled / לא זמין | תרגום לפני אישור | כן | לא |

---

## H. Observability & Logs

| בדיקה | איך בודקים ידנית | תוצאה תקינה | אם נכשל | Blocker? | נדרש שינוי קוד? |
|--------|-------------------|-------------|----------|----------|------------------|
| console.log שרת | הרצת שרת, קריאות ל־API | לוגים בטרמינל (פורט, שגיאות) | אין לוגים — קשה לדבג | לא | לא |
| שגיאות API | קריאה ל־API שנכשל | res.status(500).json({ error: "..." }) | stack / חסר message | לא | לא |

**הערה:** אין אינטגרציה ל־Logtail/DataDog וכו'. ב־Render יש לוגים מובנים של ה־service.

---

## I. Deployment Safety (staging protections)

| בדיקה | איך בודקים ידנית | תוצאה תקינה | אם נכשל | Blocker? | נדרש שינוי קוד? |
|--------|-------------------|-------------|----------|----------|------------------|
| URL STAGING | העלאה ל־Render עם subdomain / שם שונה | גישה רק למי שיש לינק | גישה פתוחה — סיכון אם סיסמאות חלשות | לא (הנחה: כלי פנימי) | לא |
| אי־שליחת מייל אמיתי | לא להגדיר EMAIL_* ב־STAGING | לחיצה על "שלח" → 500 | מייל יוצא למבטחת בטעות | כן (תנאי להעלאה) | לא |

---

# 3. ENV Variables Map

| ENV name | משתמש | חובה/רשות | ערך לדוגמה (לא סודי) | איפה ב־Render | סימני תקלה אם חסר/שגוי |
|----------|--------|-----------|------------------------|----------------|--------------------------|
| PORT | server | רשות (Render מגדיר) | 3000 | אוטומטי ב־Web Service | שרת לא מאזין על הפורט הנכון |
| NODE_ENV | server | רשות | production | Environment | cookie secure=false אם לא production; typo ב־logout: NodE_ENV |
| OPENAI_API_KEY | server | חובה (ל־AI) | sk-... | Environment → Secret | "OpenAI client is not configured"; 500 על translate/refine/improve-english וכו' |
| API_KEY | server | רשות (חלופה ל־OPENAI_API_KEY) | כמו למעלה | Environment | כמו OPENAI_API_KEY |
| OPENAI_MODEL | server | רשות | gpt-4o-mini | Environment | ברירת מחדל gpt-4o-mini |
| DOC_CHAR_LIMIT | server | רשות | 18000 | Environment | חיתוך ארוך יותר/קצר יותר |
| EMAIL_SERVICE | server | רשות (למייל) | hotmail | Environment | ברירת מחדל hotmail |
| EMAIL_USER | server | רשות | your@outlook.com | Environment | 500 "Server email configuration missing" בעת שליחת מייל |
| EMAIL_PASS | server | רשות | *** | Environment → Secret | שליחת מייל נכשלת |
| DATA_DIR | server | רשות | /opt/render/project/src/data | Environment | ברירת מחדל path.join(__dirname, 'data') |
| TEMPLATES_FILE_PATH | server | רשות | — | נגזר מ־DATA_DIR | — |
| BEST_PRACTICES_FILE_PATH | server | רשות | — | נגזר מ־DATA_DIR | — |
| POLICY_OCR_ENABLED | server | רשות | false | Environment | OCR למדיניות מופעל/כבוי |
| POLICY_OCR_MAX_PAGES | server | רשות | 2 | Environment | — |
| AZURE_OCR_ENDPOINT | server | רשות | — | Environment | לא בשימוש אם ריק |
| AZURE_OCR_KEY | server | רשות | — | Environment | — |
| AZURE_DOCINT_ENDPOINT | server | רשות | — | Environment | — |
| AZURE_DOCINT_KEY | server | רשות | — | Environment | — |
| PDF_DEBUG | server | רשות | 0 או 1 | Environment | אם 1 — כותב HTML לדיסק לדיבוג |
| VITE_RESET_ALL | frontend (build time) | רשות | 1 | Environment ב־Render (Build) | איפוס נתונים ב־load — רק לפיתוח |

**הערה:** Frontend לא מקבל משתני server; כל ה־API דרך relative `/api`. אין BASE_URL נפרד.

---

# 4. Staging Safety Plan (No Code)

## מניעת שליחת מיילים אמיתיים בטעות

- **תנאי:** ב־STAGING **לא** להגדיר `EMAIL_USER` ו־`EMAIL_PASS` (או להגדיר חשבון בדיקה בלבד).
- **תוצאה:** לחיצה על "שלח מייל" תחזיר 500 עם "Server email configuration missing" (או שגיאת SMTP) — **אין מייל יוצא**.
- **Workaround תפעולי:** אם חייבים לבדוק שליחה — להשתמש בחשבון Outlook/גמיל נפרד לבדיקות, לא בחשבון הפרודקשן.

## טיפול בכשלי PDF

- **זיהוי:** המשתמש לוחץ "הורד PDF" או "תצוגה מקדימה" ומקבל שגיאה / דף ריק.
- **סיבה אפשרית ב־Render:** Puppeteer לא מוצא Chrome.
- **נוהל (ללא קוד):** להרחיב את Build Command ב־Render: `npm install && npx puppeteer browsers install chrome && npm run build`. אם עדיין נכשל — לבדוק לוגים של ה־service (timeout, חסר חבילות).
- **Requires Code Change:** אם Render לא תומך בהתקנת Chrome בדיסק אֶפֶמֶרִי — ייתכן שימוש ב־Docker image עם Chromium (שינוי Dockerfile / start); ראו סעיף 7.

## טיפול ב־truncate / AI failures / FACT_PROTECTION_FAILED

- **truncate:** טקסט ארוך נחתך (MAX_DOC_CHARS). המשתמש עלול לא לראות הודעה — **תיעוד בלבד**: להסביר שמסמכים ארוכים מאוד עלולים להיחתך.
- **AI timeout/429:** המשתמש רואה "Translation failed" / "Refinement failed" וכו'. **נוהל:** לנסות שוב; לבדוק ב־OpenAI usage/limits.
- **FACT_PROTECTION_FAILED:** מוחזר 422 מ־/api/refine-text (מצב REWRITE). הלקוח שומר את הטקסט המקורי ומציג אזהרה. **נוהל:** לעבור ל־SAFE_POLISH או לערוך ידנית.
- **אין שינוי קוד** — רק תיעוד ונהלים.

## מה המשתמש רואה ומה הנוהל

- **500 על תרגום/שיפור:** "Translation failed" / "Failed to refine text" — לנסות שוב; לוודא OPENAI_API_KEY תקין.
- **500 על PDF:** "Failed to generate PDF" — לוודא Puppeteer + Chrome ב־Render (Build Command).
- **500 על מייל:** "Server email configuration missing" או שגיאת SMTP — ב־STAGING מכוון; לא להגדיר מייל אמיתי.
- **localStorage מנוקה:** רשימת דיווחים/גיליונות ריקה — **אין שחזור** ללא גיבוי; לתעד שהמערכת אינה גובה נתונים.

---

# 5. Failure Modes & Runbook

| תרחיש | איך מזהים | מה המשתמש רואה היום | נוהל פעולה (ללא קוד) |
|--------|-----------|------------------------|------------------------|
| OpenAI timeout | לוג שרת: timeout / ECONNRESET | "Translation failed" / "Refinement failed" | נסיון חוזר; בדיקת רשת/Render; בדיקת OpenAI status |
| OpenAI 429 (rate limit) | לוג: 429 | כמו למעלה | להפחית תדירות; לבדוק מכסות OpenAI |
| Invalid JSON מ־OpenAI | לוג: parse error / parseJsonSafely fallback | תגובה חלקית או ריקה / issues ריק | נסיון חוזר; לעדכן prompt בעתיד (שינוי קוד) |
| PDF generation failure | לוג: "PDF generation failed" / "Could not find Chrome" | 500, כפתור הורדה לא עובד | וידוא Build Command עם `puppeteer browsers install chrome`; בדיקת זכרון Render |
| Email failure | לוג: "Email send error" | 500 / "Failed to send email" | ב־STAGING צפוי אם לא הוגדר SMTP; בפרודקשן — לבדוק EMAIL_* ו־SMTP |
| localStorage wiped | משתמש מדווח: "הדיווחים נעלמו" | רשימה ריקה אחרי רענון/דפדפן אחר | אין שחזור; לתעד גיבוי ידני/ייצוא אם יידרש בעתיד |
| Race / overwrite | שני משתמשים עורכים אותו דיווח | שינויים מתנגשים (state אחרון נשמר) | תפעול: להימנע מעריכה מקבילה; נעילה — קיים reportLock ל־SENT בלבד |
| Status mismatch | דיווח מוצג בסטטוס לא נכון | כפתורים לא תואמים למצב | רענון; אם חוזר — לבדוק לוגיקת סטטוס ב־App (לא לשנות במסמך זה) |

---

# 6. Render Constraints Research

## Puppeteer ב־Render

- **דרישות ידועות:** Render **לא** מספק Chromium מובנה. כדי ש־`puppeteer.launch()` יעבוד יש להתקין Chrome במהלך ה־Build.
- **מקורות:** [Deploy Puppeteer with Node (Render)](https://render.com/docs/deploy-puppeteer-node); דיוני קהילה על "Could not find Chrome", "Puppeteer failed to launch browser".
- **המלצה (תיעוד):** להוסיף ל־Build Command:  
  `npm install && npx puppeteer browsers install chrome && npm run build`  
  כך ש־Chrome יותקן ב־cache של ה־build. ייתכן ש־cache path יידרש (למשל `PUPPETEER_CACHE_DIR`) אם Render מנקה בין builds.
- **מגבלות:** דיסק אֶפֶמֶרִי — אחרי redeploy ייתכן ש־cache יימחק; אז Build צריך להריץ שוב `puppeteer browsers install chrome`. זמן Build מתארך.
- **Flags נפוצים (תיעוד בלבד, אין שינוי קוד):** `headless: 'new'` כבר בשימוש; בסביבות headless מוגבלות לפעמים מוסיפים `--no-sandbox`, `--disable-setuid-sandbox` — **לא מופיעים בקוד הנוכחי**; אם יידרשו בעתיד, יש להוסיף ב־`puppeteer.launch({ args: [...] })`.

## Node version compatibility

- הפרויקט לא מגדיר `engines` ב־package.json. Render מריץ גרסת Node ברירת מחדל (למשל 18/20).
- מומלץ לתעד גרסת Node שנבדקה מקומית (למשל 18.x או 20.x) ו־ב־Render להגדיר אותה ב־"Node Version" אם רלוונטי.

## Filesystem / ephemeral storage

- **data/:** קבצי `sectionTemplates.json`, `bestPractices.json` נכתבים על הדיסק. ב־Render הדיסק **אֶפֶמֶרִי** — כל redeploy מאפס את התיקייה.
- **תוצאה:** תבניות ו־Best Practices ש־ADMIN הוסיף יאבדו אחרי deploy חדש אלא אם מחברים **Persistent Disk** וממפים אותו ל־`data/` (הגדרה ב־Render Dashboard, לא בקוד).
- **assets:** `Report CRMassetsbranding`, `Visual Timeline Selection` — חלק מה־repo; יישארו אחרי build כי הם נכללים ב־build.

## מגבלות רשת / outbound mail

- Render מאפשר outbound HTTPS (OpenAI, וכו'). SMTP (פורטים 587/465 וכו') — בדרך כלל מותר; אם יש הגבלה ארגונית, יש לבדוק.
- אין תיעוד רשמי על חסימת SMTP; אם שליחת מייל נכשלת — לבדוק credentials ו־firewall.

---

# 7. Requires Code Change Appendix

| מה אי אפשר לפתור בלי קוד | למה | שינוי מינימלי בעתיד | Blocker ל־STAGING? |
|---------------------------|------|----------------------|---------------------|
| **התקנת Chrome ל־Puppeteer** | Render לא מתקין Chrome. | **אין קוד** — רק Build Command: `npx puppeteer browsers install chrome`. אם Render לא שומר cache — שיקול: Docker image עם Chromium. | לא — Build Command מספיק. |
| **שגיאת כתיב NodE_ENV** | ב־logout נכתב `process.env.NodE_ENV` (E גדול). cookie של logout לא מסומן secure ב־production. | תיקון ל־`NODE_ENV`. | לא. |
| **הודעת truncate למשתמש** | אין הודעה כשטקסט נחתך. | הוספת הודעה ב־UI כשחוזר תוכן מחותך. | לא. |
| **גיבוי / שחזור דיווחים** | הכל ב־localStorage. | API לשמירה/טעינה דיווחים + DB או קבצים. | לא. |
| **Persistent data/** | תבניות נמחקות ב־redeploy. | Persistent Disk ב־Render (הגדרה) או שמירה ב־DB (קוד). | לא — ניתן לקבל אובדן ב־STAGING. |

**סיכום:** אין Blocker ל־STAGING שדורש שינוי קוד באפליקציה עצמה. הרחבת Build Command (Puppeteer) היא הגדרת Render, לא PR.

---

# 8. Diff Summary (חובה)

## אילו קבצים נוספו (paths מלאים)

- `c:\Office-Apps\Report CRM\docs\RENDER_READINESS_PACK.md` — מסמך Render Readiness Pack (מסמך מרכזי זה).

## אילו קבצים שונו

- **אף קובץ קוד לא שונה.** רק תיעוד: נוסף קובץ Markdown אחד ב־docs/.

## האם נגעת בקוד?

**NO.** לא בוצע שינוי בקוד (לא frontend ולא server). רק נוצר מסמך תיעוד חדש.

---

## רשימת מסקנות אופרטיביות (10–15 בולטים)

1. **העלאה ל־Render STAGING אפשרית בלי שינוי קוד** — בתנאי הרחבת Build Command להתקנת Chrome (Puppeteer).
2. **Blocker מעשי ל־PDF:** ב־Render יש להריץ במהלך Build: `npx puppeteer browsers install chrome` (או שווה־ערך); אחרת ייצור PDF ייכשל.
3. **חובה להגדיר OPENAI_API_KEY** — אחרת כל ה־AI endpoints יכשלו.
4. **ב־STAGING לא להגדיר EMAIL_USER/EMAIL_PASS** (או רק חשבון בדיקה) — כדי למנוע שליחת מייל אמיתי בטעות.
5. **דיווחים וגיליונות כספיים** נשמרים רק ב־localStorage — אובדן במחיקת cache/דפדפן אחר; אין Blocker אבל יש לתעד.
6. **תבניות ו־Best Practices** (data/) — נמחקים ב־redeploy אלא אם מחברים Persistent Disk; לא Blocker ל־STAGING.
7. **NODE_ENV:** Render מגדיר PORT; מומלץ NODE_ENV=production ל־cookie secure (בקוד יש typo ב־logout — NodE_ENV — לא תוקן).
8. **אין Persistent Disk** — לא Blocker; אפשר להעלות STAGING ולהתאפס תבניות אחרי כל deploy.
9. **כללי אבטחה:** כלי פנימי; סיסמאות ב־constants — לקבל סיכון או לחזק בעתיד (שינוי קוד).
10. **כשלי AI (timeout, 429, JSON):** מטופלים בתגובת 500 + הודעה; נוהל: נסיון חוזר ובדיקת OpenAI.
11. **FACT_PROTECTION_FAILED:** 422 מ־refine-text; הלקוח שומר מקור ומציג אזהרה — אין שינוי קוד נדרש.
12. **החלטת פריסה:** **Go with Constraints** — העלאה ל־Render STAGING מותרת.
13. **תנאים מחייבים ל־Go:** (א) OPENAI_API_KEY מוגדר; (ב) Build Command כולל התקנת Chrome ל־Puppeteer אם רוצים PDF; (ג) לא להגדיר מייל אמיתי ב־STAGING; (ד) קבלה שדיווחים ב־localStorage ו־data/ אֶפֶמֶרִי.
14. **Non-blockers:** אובדן data/ אחרי deploy, localStorage לא מגובה, typo ב־NodE_ENV, היעדר הודעת truncate.
15. **AI אחר (למשל ChatGPT)** יכול לקבל החלטת פריסה על סמך מסמך זה בלבד — ללא צורך לפתוח קבצי קוד.

---

*מסמך זה הוא תיעוד בלבד. לא בוצעו שינויים בקוד.*
