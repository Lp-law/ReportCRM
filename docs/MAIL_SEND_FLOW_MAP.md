# מיפוי: Close & Finalize → שליחת מייל לברוקר

מסמך חקירה והבנה בלבד. אין בו קוד, TODO, הצעות תיקון או refactor.

---

## 1. Flow מלא מקצה לקצה

### רגע הלחיצה על "Close & Finalize"

- הכפתור מופיע **רק במצב PREVIEW** (שלב 3 – Preview & Send), בסרגל העליון של מסך הדוח.
- הלחיצה מפעילה `handleFinalizeClick`.

### התנהגות לפי Role

- **ADMIN:** לא מתבצעת סגירה מיידית. נפתח **מסך Compose Mail** (מודל `EmailTemplateModal`). `isResendMode` מוגדר ל־`false`. המשתמש רואה To/CC, Subject, Template, Topics, Attachment, Email body ולוחץ "Send Email".
- **לא ADMIN (LAWYER / FINANCE / SUB_ADMIN):** אין פתיחת מודל. מתבצעת ישירות `finalizeReport()`: סטטוס הדוח משתנה (למשל ל־TASK_ASSIGNED עבור FINANCE/SUB_ADMIN), והמשתמש מועבר ל־DASHBOARD. **אין שליחת מייל** במסלול הזה.

### States ו־flags רלוונטיים

- `isEmailModalOpen` – פתיחת/סגירת מודל Compose Mail.
- `isResendMode` – `true` כשנכנסים ל־Compose מ־"הכן שליחה מחדש" (resend), `false` כש־"Close & Finalize".
- `isSendingEmail` – נעול בזמן שליחת המייל (מניעת סגירת מודל וכפתור Send).
- אין STEP או MODE נפרד ל־"Finalized" או "Read-only" במסך המייל עצמו; ה־view נשאר PREVIEW עד סגירת המודל או עד לאחר שליחה מוצלחת (אז מעבר ל־DASHBOARD).

### לאחר לחיצה על "Send Email" (ADMIN)

1. `handleEmailSend` (או `handleResendEmailSend` ב־resend) מקבל payload: body, templateId, subjectBase, topics.
2. Guards: סדר דוחות בתיק, חובת סעיף הוצאות אם קיימת טבלת הוצאות, ובדיקת `translationStale`.
3. אם יש `computePreSendIssues` – מוצג Guard עם "המשך"; בלחיצת המשך מתבצעת `performEmailSend`.
4. `performEmailSend`: עדכון דוח (template, body, subject, fileNameTitles), MRU של topic combos, שליפה של PDF (`fetchReportPdf`), המרה ל־base64, `getEmailRecipients`, קריאה ל־`sendEmailViaOutlook` עם to, cc, subject, body, attachmentBase64, attachmentName.
5. אם השליחה מצליחה: Toast הצלחה, `finalizeReport(attachmentName)` (סטטוס SENT, היסטוריה, case folder), סגירת המודל.
6. אם נכשלת: Toast שגיאה, הורדת PDF ל־מחשב, פתיחת mailto (מייל ידני) עם To/CC/Subject/Body, ואז גם `finalizeReport` וסגירת המודל.

---

## 2. UI / קומפוננטות

### קובץ אחראי למסך Compose Mail

- **`src/components/EmailTemplateModal.tsx`** – מודל מלא: כותרת "Compose Email", תווית SANDBOX (כאשר מתקיים התנאי), To/CC, Subject, Template, Topics, Attachment (תצוגת שם), Email body, כפתור Send Email.

### פירוק השדות

- **To / CC:** מוצגים כ־read-only מתוך `recipientsPreview` (מגיע מ־`getEmailRecipients(currentReport)` ב־App). אין שדות עריכה לנמענים במודל.
- **Subject:** שדה **controlled** – `subject` state מקומי מסונכרן עם `subjectDraft` ו־`onSubjectDraftChange`. כפתור Reset מאפס ל־defaultSubject.
- **Template:** רשימת תבניות קבועות + תבניות משתמש (localStorage). בחירה ב־select מעדכנת את גוף המייל. **controlled** (selectedTemplate + emailBody).
- **Topics:** רשימת topics לבחירה (כולל סינון וחיפוש) + אפשרות להוסיף topic ידני. **controlled** דרך `selectedTopics` ו־`onSelectedTopicsChange` (מעודכן ב־report.fileNameTitles).
- **Attachment:** רק **תצוגת שם קובץ** – `attachmentNamePreview` מחושב מ־`buildReportFileName({ ...report, fileNameTitles: selectedTopics })`. אין עריכת קובץ או העלאה; הקובץ עצמו נוצר בזמן השליחה.
- **Email body:** textarea עם Grammarly. **controlled** (emailBody state), מתעדכן בבחירת template ובעריכה ידנית.
- **Send Email:** כפתור שקורא ל־`onSend` עם body, templateId, subjectBase, topics. מושבת כאשר `isSending` true.

### SANDBOX – ויזואלי

- תווית "SANDBOX" וטקסט הסבר כחול מופיעים כאשר:
  - `recipientsPreview.to.length === 1` ו־
  - `recipientsPreview.to[0]` ( lowercase) הוא `lidor@lp-law.co.il`.
- כלומר: כאשר הנמען היחיד ב־To הוא לידור – המסך מסומן כ־SANDBOX (מצב בדיקות). **זה רק label ויזואלי והסבר למשתמש;** אין flag לוגי שמונע שליחה או מחליף סביבה.

---

## 3. לוגיקת שליחת המייל

### מקום השליחה

- **שרת:** השליחה מתבצעת בשרת.
- **Frontend:** קורא ל־`sendEmailViaOutlook` ב־`src/services/geminiService.ts`, שמבצע `POST /api/send-email` עם JSON body (to, cc, subject, body, attachmentBase64, attachmentName).

### Endpoint

- **`POST /api/send-email`** ב־`server.js`.
- דורש authentication; רק **ADMIN** (בדיקת role) רשאי לשלוח.
- משתמש ב־**Nodemailer** עם transporter שהוגדר בתחילת הקובץ:
  - `service`: `process.env.EMAIL_SERVICE || 'hotmail'`
  - `auth.user`: `process.env.EMAIL_USER`
  - `auth.pass`: `process.env.EMAIL_PASS`
- אין SendGrid או שירות ענן אחר; רק SMTP (Outlook/Hotmail).

### זרימה בשרת

- אם חסרים `EMAIL_USER` או `EMAIL_PASS` – מחזיר 500.
- בונה `attachments` מ־attachmentBase64 (Buffer מ־base64, contentType application/pdf).
- `mailOptions`: from = EMAIL_USER, to, cc (אם יש), subject, text = body, attachments.
- `transporter.sendMail(mailOptions)`; בהצלחה מחזיר `{ success: true }`.

---

## 4. נמענים (To / CC / BCC)

### מקור הנמענים

- **פונקציה:** `getEmailRecipients(report)` ב־`App.tsx`.
- **To:** קבוע – תמיד `['lidor@lp-law.co.il']` (Set יחיד, מומר למערך).
- **CC:** קבוע `reports@lp-law.co.il` + כתובת בעלים:
  - אם ל־report יש `ownerEmail` – נוסף ל־CC;
  - אחרת מחפשים ב־`USERS` את המשתמש עם `id === report.createdBy` ומוסיפים את `user.email` ל־CC.
- **BCC:** לא קיים בקוד; אין שימוש ב־BCC.

### ברירת מחדל ו־Role

- אין לוגיקה לפי role בשינוי נמענים: To/CC נקבעים רק above. רק ADMIN יכול להגיע לשליחה (נחסם ב־API).
- **RECIPIENTS** ב־constants (חברות ביטוח וכתובות כמו claims@aviva.com) **לא משמש** ב־getEmailRecipients; הנמענים לשליחה הם קשיחים (לידור + משרד + בעלים).

### שינוי ידני

- במסך Compose Mail אין אפשרות לשנות To/CC; הם read-only. שינוי נמענים דורש שינוי קוד (או הוספת UI עתידי).

---

## 5. Attachment – PDF

### האם ה־PDF מצורף באמת

- **כן.** בזרימת השליחה:
  1. Frontend קורא ל־`fetchReportPdf(reportForSend)` → `POST /api/render-report-pdf` → השרת מייצר PDF (Playwright) ומחזיר Blob.
  2. Frontend ממיר את ה־Blob ל־base64 (`blobToBase64`) ושולח ב־payload כ־`attachmentBase64` ו־`attachmentName`.
  3. השרת ב־`/api/send-email` בונה `attachments` מ־Buffer(base64) ושולח עם Nodemailer. ה־PDF **מצורף למייל** שנשלח.

### שם הקובץ

- **מקור:** `buildReportFileName(report)` ב־`src/utils/reportFileName.ts`.
- השם נבנה מ: insurer, insured, plaintiff, **topics** (מ־report.fileNameTitles או מ־sections/report number), ו־"Report N". הנושאים (Topics) שהמשתמש בחר במסך Compose משפיעים ישירות על שם הקובץ.

### יצירה מחדש vs קובץ קיים

- ה־PDF **נוצר מחדש** בכל שליחה: קריאה ל־`/api/render-report-pdf` עם ה־report המעודכן. אין שימוש בקובץ שמור על דיסק.

### Fallback לשליחה ידנית

- כשהשליחה האוטומטית נכשלת, נפתח mailto וה־PDF **לא** מצורף אוטומטית; המשתמש מוריד את הקובץ (לחיצה על download) ומצרף ידנית. זה מצוין גם בהערה במודל.

---

## 6. Templates ותוכן המייל

### שדה Template

- **רשימה קבועה:** ב־`EmailTemplateModal.tsx` מוגדר מערך `EMAIL_TEMPLATES`: General Update, Risk Assessment, Expert Opinion, Full Report Delivery, וארבע תבניות "Zeev" (New demand, Claim update, New lawsuit, Lawsuit update). לכל תבנית id, label, body.
- **תבניות משתמש:** נשמרות ב־localStorage תחת `emailTemplates:${userId}`; נטענות ומוצגות ברשימה עם התבניות הקבועות.
- אין mapping לפי topic או לפי סוג דוח; המשתמש בוחר template ידנית והגוף מתעדכן בהתאם.

### בניית Email body

- **התחלה:** בעת פתיחת המודל – אם ל־report יש `selectedEmailTemplate` ו־`emailBodyDraft`, משתמשים בהם; אחרת תבנית ברירת מחדל (General Update) וגוף התבנית.
- **עריכה:** המשתמש יכול לערוך את הגוף בחופשיות (textarea). אין החלפה אוטומטית של placeholders בנתוני case; התבניות הן טקסט סטטי (עם כותרת כמו "Dear Sir/Madam" ו־"Best regards, Lior Perry, Adv.").
- **שליחה:** נשלח ה־body כפי שהוא (עם `forceLtrEmailBody` ל־LTR) – טקסט דינמי רק במובן שהמשתמש ערך אותו, לא החלפות אוטומטיות מקוד.

---

## 7. Topics / PDF Filename Topics

### משמעות לוגית

- **Topics** הם מקטעי שם הקובץ (וגם מקטע ב־subject, כי subject נגזר משם הקובץ). הם משפיעים על:
  - **שם קובץ ה־PDF** – `buildReportFileName` משתמש ב־report.fileNameTitles (ה־topics שנבחרו);
  - **Subject** – `buildReportSubject(report)` מחזיר את שם הקובץ ללא .pdf, ולכן ה־subject מקביל ל־filename.
- אין השפעה על תוכן גוף המייל (אין החלפת טקסט לפי topic); ההשפעה היא על **filename ו־subject**.

### מקור הרשימה

- **ברירת מחדל:** `DEFAULT_FILE_NAME_TOPICS` ב־`fileNameTopics.ts`: Update, Expenses, New Lawsuit, New Letter of Demand, Risk Assessment, Strategy, וכו'.
- **משתמש:** topics שנוספו ידנית נשמרים ב־localStorage (`fileNameTopics:${userId}`) ומופיעים ברשימה.
- **Insurer defaults:** ב־topicPreferences יש `getInsurerDefaultTopics(userId, insurerName)` – יכול להציע topics לפי מבטח; זה משמש להצגת הצעות במודל, לא לכפייה.

### קשר לסוג דיווח

- בדוח הראשון כשאין topics נבחרים, `buildReportFileName` משתמש ב־"New Letter of Demand" או "New Lawsuit" לפי `filenameTag`/`plaintiffTitle`. בשאר הדוחות – מ־sections או "Update". ה־Topics במסך Compose הם הבחירה המפורשת של המשתמש ומדרסים את ברירות המחדל האלו.

---

## 8. SANDBOX – משמעות אמיתית

- **ויזואלי בלבד:** תווית "SANDBOX" וטקסט ההסבר (שליחה ללידור בלבד עד סיום בדיקות) מופיעים כאשר To הוא רק `lidor@lp-law.co.il`.
- **לוגית:** אין flag SANDBOX שמשנה התנהגות: לא מונע שליחה, לא מעביר ל־DEV, לא מחליף נמען. נמען ה־To **כיום תמיד** לידור (קבוע ב־getEmailRecipients), ולכן במצב הקיים המסך תמיד יסומן SANDBOX.
- **שליחה:** המיילים **נשלחים באמת** (אם השרת מוגדר עם EMAIL_USER/EMAIL_PASS); הנמען פשוט לידור ולא נציג ברוקר. אין "מצב מדומה" שמונע שליחה.

---

## 9. משתני סביבה (ENV)

### משתנים בשימוש

- **EMAIL_SERVICE** – אופציונלי; ברירת מחדל `'hotmail'` (תואם Outlook).
- **EMAIL_USER** – חובה לשליחת מייל; משמש כ־from וכאימות ל־transporter.
- **EMAIL_PASS** – חובה לשליחת מייל.

### לא קיימים בקוד

- אין SMTP_HOST, SMTP_PORT (Nodemailer עם service: 'hotmail' מנהל זאת).
- אין SENDGRID_API_KEY או שירות אחר.
- אין משתנה ייעודי ל־SANDBOX או להפרדת DEV/PROD למייל; השליחה תלויה רק ב־קיום EMAIL_USER ו־EMAIL_PASS.

### חסר להפעלה אמיתית

- הגדרת EMAIL_USER ו־EMAIL_PASS ב־סביבת הריצה (Render / .env). בלעדיהם ה־API מחזיר 500 ו־השליחה נכשלת; ה־frontend נופל ל־fallback (הורדת PDF + mailto).

---

## 10. סיכום מנהלים

### טבלה: מה קיים / מה לא קיים

| נושא | קיים | לא קיים / הערה |
|------|------|------------------|
| כפתור "Close & Finalize" | כן – ב־view PREVIEW, רק ל־ADMIN פותח Compose | |
| מסך Compose Mail | כן – EmailTemplateModal | |
| תווית SANDBOX | כן – ויזואלי כש־To = לידור בלבד | אין flag לוגי SANDBOX |
| To/CC | כן – קבועים: לידור, reports@, בעלים | אין BCC; אין שימוש ב־RECIPIENTS (ברוקרים) |
| Subject | כן – עריכה + Reset, ברירת מחדל מ־buildReportSubject | |
| Template | כן – תבניות קבועות + תבניות משתמש (localStorage) | אין mapping אוטומטי ל־topic/דוח |
| Topics | כן – בחירה + השפעה על filename ו־subject | לא משפיע על גוף המייל |
| Attachment (תצוגה) | כן – שם קובץ מחושב | |
| PDF מצורף למייל באמת | **כן** – נוצר ב־server, base64, נשלח ב־Nodemailer | |
| שליחת מייל אמיתית | **כן** – כשמוגדרים EMAIL_USER, EMAIL_PASS | נכשל → fallback: הורדת PDF + mailto |
| שליחה מהשרת | כן – Nodemailer, POST /api/send-email | |
| Role לשליחה | רק ADMIN | |
| Finalize ללא ADMIN | כן – סטטוס משתנה, מעבר ל־DASHBOARD, בלי מייל | |

### תשובות ישירות

- **האם ה־PDF מצורף באמת?** כן. ה־PDF נוצר ב־/api/render-report-pdf, מומר ל־base64, ונשלח כ־attachment ב־/api/send-email.
- **האם שליחת המייל אמיתית או מדומה?** אמיתית (Nodemailer). אין מצב "sandbox" שמונע שליחה; SANDBOX הוא רק סימון שמנמען ה־To הוא לידור.
- **חלקים מוכנים לשינוי מיידי:** הוספת נמענים/תבניות, שינוי טקסטים, הוספת ENV – ללא שינוי ארכיטקטורה. שינוי לוגיקת נמענים (למשל שימוש ב־recipientId/RECIPIENTS) או החלפת שירות מייל דורש שינוי ב־getEmailRecipients וב־server.
- **חלקים רגישים:** getEmailRecipients (קבוע לידור); finalizeReport ו־היסטוריה אחרי שליחה; תלות ב־EMAIL_USER/EMAIL_PASS; fallback mailto + הורדת PDF כשהשליחה נכשלת.
