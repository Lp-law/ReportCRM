# AI & OCR Failure Analysis — Report CRM (Local vs Render)

**מטרה:** אבחון לעומק מדוע שני פיצ'רים שעבדו מקומית נכשלים ב-Render.  
**אין במסמך:** שינוי קוד, הצעות פתרון, או תיקונים — רק הבנה ואבחון.

---

## 1. Executive Summary

| פיצ'ר | שירות AI/OCR | כשל צפוי ב-Render |
|-------|--------------|-------------------|
| **שיפור ניסוח בעברית** | OpenAI (gpt-4o-mini) | ENV חסר, timeout, או rate limit |
| **ניתוח מסמכים** (אטב/שן) | OCR → OpenAI | OCR: Tesseract/Azure; AI: OpenAI — שניהם יכולים להיכשל |

**סיכום במשפטים פשוטים:**
- **שיפור עברית:** תלוי ב־`OPENAI_API_KEY`. אם המפתח חסר או לא תקין ב-Render — כל הקריאות נכשלות. בנוסף, אין timeout מפורש או retry על 429.
- **ניתוח מסמכים:** קודם OCR (pdf-parse → PDF.js → DocInt → Azure → Tesseract), אחר כך AI. כשל יכול להיות: OCR מחזיר טקסט ריק (מסמך סרוק, תמונה) → `INVALID_DOCUMENT`; או AI נכשל (כמו שיפור עברית). ב-Render: Tesseract כבד; Azure OCR משתמש ב־data URL שלא נתמך רשמית; Document Intelligence כבוי (ENV mismatch).

---

## 2. Hebrew Refinement — Root Cause Analysis

### 2.1 איזה שירות AI משמש בפועל
- **OpenAI** (ChatGPT) — לא Gemini.
- `server.js` שורה 5: `import OpenAI from 'openai'`
- `createTextCompletion()` משתמש ב־`client.chat.completions.create()`
- מודל: `OPENAI_MODEL` או ברירת מחדל `gpt-4o-mini`

### 2.2 ENV Variables
| ENV | שימוש | ברירת מחדל |
|-----|--------|------------|
| `OPENAI_API_KEY` | מפתח API (חובה) | — |
| `API_KEY` | fallback אם OPENAI_API_KEY חסר | — |
| `OPENAI_MODEL` | מודל (למשל gpt-4o-mini) | `gpt-4o-mini` |

**מיקום בקוד:** `server.js` שורות 214–218:
```javascript
const apiKey = process.env.OPENAI_API_KEY || process.env.API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;
```

### 2.3 האם ה-ENV קיימים ב-Render בפועל
- אין אפשרות לוודא ללא גישה ל־Render Dashboard.
- אם `OPENAI_API_KEY` ו־`API_KEY` חסרים → `openai === null` → `ensureOpenAI()` זורק → 500 "OpenAI client is not configured".

### 2.4 Timeouts, Rate Limits, מודל
- **Timeout:** אין timeout מפורש ל־`client.chat.completions.create()`. תלוי ב־SDK / network.
- **Rate limits:** אין retry על 429 (Too Many Requests) — הקריאה נכשלת מיד.
- **מודל:** `gpt-4o-mini` נתמך ב-OpenAI; אין סיבה ש־Render יחסום אותו.

### 2.5 האם הקריאה יוצאת מהשרת / תשובה ריקה
- הקריאה מתבצעת מהשרת (Node) ל־OpenAI API.
- אם מפתח תקין — התשובה מגיעה; אם חסר/שגוי — 401/500.
- **JSON נחתך:** `parseJsonSafely()` מטפל בחלקי JSON; ב־refine-text אין JSON (טקסט פשוט) — לא רלוונטי.

### 2.6 השוואה Local vs Render
| היבט | Local | Render |
|------|-------|--------|
| ENV | `.env` עם OPENAI_API_KEY | מוגדר ב־Environment Variables (אם הוגדר) |
| רשת | גישה ישירה ל־OpenAI | אותו דבר — Render פותח outbound |
| timeout | אין הגבלה מפורשת | ייתכן timeout ברמת reverse proxy (כ־30–60 שניות) |
| זיכרון | בד"כ גבוה | מוגבל — עלול להשפיע על עיבוד ארוך |

**כשלים סבירים ב-Render:**
1. `OPENAI_API_KEY` לא הוגדר או שגוי
2. Timeout ברמת Render לפני שהתשובה חוזרת
3. 429 מ־OpenAI (rate limit) — אין retry

---

## 3. Document Analysis — Root Cause Analysis

### 3.1 שלב העלאת הקובץ

| שאלה | תשובה |
|------|--------|
| **האם הקובץ מגיע לשרת?** | כן — הנפש נשלחת כ־base64 ב-body של POST. `express.json({ limit: '50mb' })` — מגבלת 50MB. |
| **MIME type?** | נשלח מהקליינט (`file.type`). אם חסר — `application/octet-stream`. |
| **מגבלת גודל ב-Render?** | אין מגבלה בקוד מעבר ל־50MB. Render עלול להגביל request size ברמת infrastructure. |

**קבצים נתמכים ב־getDocumentText:**
- PDF (`application/pdf`)
- DOCX (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`)
- Text (`text/*`)
- JSON (`application/json`)
- Image (`image/*`)

### 3.2 שלב OCR

| שאלה | תשובה |
|------|--------|
| **איזה OCR משמש?** | לפי סדר: pdf-parse → PDF.js → **Document Intelligence** → **Azure Vision OCR** → **Tesseract** |
| **ENV תלויים** | `AZURE_DOCINT_ENDPOINT`, `AZURE_DOCINT_KEY` (DocInt — כבוי: `USE_DOC_INTELLIGENCE = false`); `AZURE_OCR_ENDPOINT`, `AZURE_OCR_KEY` (Azure Vision); `POLICY_OCR_ENABLED`, `POLICY_OCR_MAX_PAGES` (Tesseract) |
| **האם השירות זמין ב-Render?** | DocInt: לא (כבוי + ENV mismatch). Azure: תלוי בהגדרה. Tesseract: כן — JavaScript, אבל כבד ועלול להיתקע בזיכרון/זמן. |
| **טקסט ריק?** | אם כל שלבי ה־OCR נכשלים — `getDocumentText` מחזיר `null` → API מחזיר `success: false`, `reason: 'INVALID_DOCUMENT'`. |

**פירוט OCR:**

1. **pdf-parse** — חילוץ טקסט מ-PDF (לא סרוק). עובד טוב ב-Local ו-Render.
2. **PDF.js** — fallback לחילוץ טקסט.
3. **Document Intelligence** — `USE_DOC_INTELLIGENCE = false` בקוד; גם אם יופעל — `AZURE_DOCINT_*` לעומת `AZURE_DOCUMENT_INTELLIGENCE_*` ב-Render (אי-התאמה ידועה).
4. **Azure Vision OCR** — `extractTextWithAzureOcr` שולח:
   ```javascript
   body: JSON.stringify({ url: `data:application/octet-stream;base64,${buffer.toString('base64')}`, ... })
   ```
   תיעוד Azure: ה-API מקבל **URL ציבורי (http/https)** או **binary ב-body**. `data:` URL **לא** מוזכר כתמיכה רשמית; סביר שהשרתים של Azure לא יוכלו ל"לבצע fetch" ל־data URL. **סיכון:** Azure OCR עלול להיכשל תמיד עם הקונפיגורציה הנוכחית.
5. **Tesseract.js** — `extractTextWithOcr` (PDF→render לדף→Tesseract) ו־`Tesseract.recognize(buffer, 'eng+heb')` לתמונות. דורש:
   - `@napi-rs/canvas` לרינדור PDF לדף
   - קבצי שפה (eng, heb) — בד"כ מורידים אוטומטית או מהפרויקט
   - זיכרון ו-CPU — ב-Render מוגבל, עלול לגרום ל-timeout או crash

**הבדל Local vs Render:**
- **Local:** זיכרון ו-CPU בד"כ מספיקים; Tesseract עובד; אולי Azure לא מוגדר וזה OK.
- **Render:** דיסק אפמרי; זיכרון מוגבל; Tesseract כבד; Azure עם data URL — כנראה לא יעבוד.

### 3.3 שלב ניתוח AI

| שאלה | תשובה |
|------|--------|
| **האם מוזן טקסט ריק ל-AI?** | לא. אם `!documentText` — החזרה מיידית `INVALID_DOCUMENT` ללא קריאה ל-AI. |
| **האם הקריאה מתבצעת למרות OCR ריק?** | לא. `getDocumentText` מחזיר `null` → `if (!documentText) return ...` לפני `analyzeMedicalDocument` או `createTextCompletion`. |
| **Timeout / Reject?** | אותה לוגיקה כמו שיפור עברית — אין timeout מפורש; 429 לא מטופל. |

**Endpoints:**
- `POST /api/analyze-medical-complaint` — claim/demand/expert
- `POST /api/analyze-dental-opinion` — חוות דעת שיניים

שניהם: `getDocumentText` → אם יש טקסט → `createTextCompletion` (OpenAI).

---

## 4. Local vs Render — Differences

| היבט | Local | Render |
|------|-------|--------|
| **מערכת קבצים** | דיסק קבוע | אפמרי — `data/` נמחק ב-redeploy |
| **זמני ריצה** | ללא הגבלת זמן (בד"כ) | timeout ברמת reverse proxy (כ־30–60 שניות) |
| **זיכרון** | בד"כ גבוה | מוגבל (למשל 512MB–1GB בתוכנית חינמית) |
| **Puppeteer** | Chrome מקומי או מותקן | צריך `npx puppeteer browsers install chrome` ב-Build (מתועד) |
| **Tesseract** | רץ בד"כ ללא בעיה | כבד; עלול timeout או חריגת זיכרון |
| **ENV** | `.env` מקומי | Environment Variables ב-Dashboard |
| **Azure OCR** | אם data URL לא נתמך — כשל גם ב-Local | אותו דבר — כנראה לא עובד |
| **Document Intelligence** | `USE_DOC_INTELLIGENCE = false` | כבוי + ENV mismatch |

**תלויות בינאריות:**
- **Puppeteer:** Chrome — מותקן ב-Build Command.
- **Tesseract.js:** JavaScript + WASM — אין בינארי נוסף; ייתכן צורך בקבצי tessdata (eng, heb).
- **@napi-rs/canvas:** בינארי native — מותקן ב־`npm ci`; עלול להיות בעיה על ארכיטקטורות שונות (למשל ARM vs x64).

---

## 5. האם OCR כושל מזוהה בוודאות?

**כן — ניתן לזהות.**

כש־`getDocumentText` מחזיר `null` או מחרוזת ריקה:
- `analyze-medical-complaint` מחזיר: `{ success: false, reason: 'INVALID_DOCUMENT', analysis: null, claimSummary: '' }`
- `analyze-dental-opinion` מחזיר: `{ success: false, reason: 'INVALID_DOCUMENT', result: '' }`

**הממשק:** `geminiService.ts` — `analyzeMedicalComplaint` ו־`analyzeDentalOpinion` מחזירים `success: false` ו־`reason`. הקריאה ל־`reason === 'INVALID_DOCUMENT'` מאפשרת להבחין בין כשל OCR (אין טקסט) לבין כשל AI (למשל `AI_UNAVAILABLE`, `TIMEOUT`).

**הערה:** `INVALID_DOCUMENT` מכסה גם:
- סוג קובץ לא נתמך
- פרסור שנכשל (למשל PDF פגום)
- OCR שנכשל (טקסט ריק)

כלומר, "לא ניתן היה לקרוא טקסט מהקובץ" הוא תיאור הולם — בין אם בגלל OCR, סוג קובץ, או פרסור.

**סיכום:** כן — ניתן לזהות מצב שבו OCR/חילוץ נכשל והטקסט ריק, דרך `success: false` ו־`reason: 'INVALID_DOCUMENT'`. בעתיד אפשר להציג הודעה מדויקת למשתמש.

---

## 6. רשימת סיבות אפשריות (מדורגות מהסביר ביותר)

### שיפור ניסוח בעברית
1. **OPENAI_API_KEY חסר או שגוי ב-Render** — הסיבה הסבירה ביותר; `ensureOpenAI()` זורק מייד.
2. **Timeout ברמת Render** — בקשות ארוכות (טקסט ארוך) נחתכות לפני OpenAI מחזירה תשובה.
3. **Rate limit (429) מ-OpenAI** — אין retry; המשתמש מקבל 500.
4. **בעיית רשת** — Render לא מצליח לפנות ל־api.openai.com (נדיר).

### ניתוח מסמכים (אטב / שן)
1. **OCR נכשל (טקסט ריק)** — PDF סרוק או תמונה: pdf-parse/PDF.js לא מוציאים טקסט; Azure עם data URL לא עובד; Tesseract timeout או כשל ב-Render → `INVALID_DOCUMENT`.
2. **OPENAI_API_KEY חסר או שגוי** — גם לאחר OCR מוצלח, השלב AI נכשל.
3. **Tesseract timeout / חריגת זיכרון** — מסמך כבד או תמונה גדולה; ב-Render מוגבל.
4. **Azure OCR לא עובד** — data URL לא נתמך; אם Azure היחיד שמוגדר — OCR נכשל.
5. **קבצי tessdata חסרים** — Tesseract לא מצליח לטעון eng/heb (פחות סביר אם הם בפרויקט).
6. **סוג קובץ לא נתמך** — MIME שלא ב־pdf/docx/text/image → `INVALID_DOCUMENT`.
7. **גודל בקשה** — Render חוסם בקשות גדולות מ־50MB (אם יש הגבלה כזו).

---

---

## 7. Diagnostic Logging (Post-Implementation)

לאחר היישום, נוספו לוגים מדויקים לצורך אבחון:

### Hebrew Refinement (refine-text, review-hebrew-style)
- `[refine-text]` / `[review-hebrew-style]` openai_client_exists, duration_ms, reason, status
- Reason codes: AI_UNAVAILABLE, UNAUTHORIZED, RATE_LIMIT, TIMEOUT, INVALID_RESPONSE

### Document Analysis (analyze-medical-complaint, analyze-dental-opinion)
- `upload_received size_bytes=… mime=…`
- `[getDocumentText]` path (pdf-parse, pdfjs, docint, azure_ocr, tesseract), textLength
- `azure_ocr_called=true status=… error=…` (when Azure OCR is used)
- `tesseract_ocr_failed error=… timeout=… memory=…`
- `reason=INVALID_DOCUMENT` when textLength === 0

### UX
- כשל OCR: "לא ניתן לנתח את המסמך כי לא הצלחנו לקרוא ממנו טקסט (OCR). נסה/י קובץ ברור יותר או הוסף/י סיכום ידנית."
- כשל אחר: "לא ניתן לנתח את המסמך כרגע. ניתן להמשיך לעבוד ולהוסיף את הסיכום ידנית."

---

**סיום המסמך.**
