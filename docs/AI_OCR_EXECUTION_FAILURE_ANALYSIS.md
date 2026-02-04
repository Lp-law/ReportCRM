# AI & OCR Execution Failure Analysis — Where Does It Stop?

**מטרה:** לאבחן בצורה חד-משמעית היכן הביצוע נתקע — הקריאה לא יוצאת, יוצאת ונכשלת, או חוזרת ריק.  
**אין במסמך:** פתרונות, תיקונים, או שינוי workflow — רק אבחון עם ראיות.

---

## 1. Executive Summary — למה זה עדיין לא עובד

**בשפה פשוטה:**

- **שיפור ניסוח בעברית:** לא ברור עדיין אם הקריאה ל-OpenAI יוצאת בכלל. אם `openai_client_exists=false` — הקריאה נחסמת לפני שליחה. אם `OPENAI_REQUEST_SENT` מופיע אבל לא `OPENAI_RESPONSE_RECEIVED` — הבקשה יוצאת אך נתקעת (timeout/רשת). אם מופיע `OPENAI_RESPONSE_FAILED` — הבקשה חזרה עם שגיאה.

- **ניתוח מסמכים:** אם `getDocumentText` לא נקראת — הבעיה לפני OCR. אם `USE_DOC_INTELLIGENCE=false` — DocInt לא רץ. אם מופיע `DOCINT_REQUEST_SENT` אבל לא `DOCINT_POLLING_STARTED` — הבקשה הראשונית ל-Azure נכשלה או לא החזירה 202. אם `DOCINT_POLLING_STARTED` מופיע אבל לא `DOCINT_POLLING_COMPLETED` — ה-polling נתקע או timeout.

- **העדר לוגים ברורים ב-Render:** בלי לוגים מהשרת לא ניתן לדעת בוודאות היכן הביצוע נעצר. נוספו לוגים ייעודיים (`OPENAI_REQUEST_SENT`, `OPENAI_RESPONSE_RECEIVED`, `DOCINT_REQUEST_SENT`, וכו') — ההשוואה בין Local ל-Render תאפשר לזהות את הנקודה המדויקת.

---

## 2. Hebrew Refinement — Is the AI Call Actually Executed?

### 2.1 זרימת הביצוע

```
משתמש לוחץ "שפר ניסוח"
  → POST /api/refine-text (או review-hebrew-style)
  → ensureAuthenticated(req, res)  ← אם נכשל: return 401, הקריאה לא מגיעה ל-AI
  → createTextCompletionWithDiagnostics(opts, { endpoint: 'refine-text' })
      → openai_client_exists = Boolean(openai)  ← אם false: throw, לא יוצא HTTP
      → OPENAI_REQUEST_SENT
      → createTextCompletion(opts)
          → ensureOpenAI()  ← זורק אם openai === null
          → client.chat.completions.create(...)  ← כאן נשלחת הבקשה ל-OpenAI
      → OPENAI_RESPONSE_RECEIVED (הצלחה)
      או OPENAI_RESPONSE_FAILED (כשל)
```

### 2.2 נקודות חסימה אפשריות

| שלב | תנאי חסימה | לוג שמצביע |
|-----|-------------|------------|
| **לפני כניסה ל-endpoint** | 401 Not authenticated | אין לוגים מ-refine-text |
| **openai === null** | OPENAI_API_KEY / API_KEY חסר או ריק | `openai_client_exists=false` |
| **בקשה לא חוזרת** | timeout, DNS, חסימת רשת, TLS | `OPENAI_REQUEST_SENT` ללא `OPENAI_RESPONSE_*` |
| **בקשה חזרה עם שגיאה** | 401, 429, 5xx | `OPENAI_RESPONSE_FAILED reason=...` |

### 2.3 OpenAI SDK ו-HTTP

- **ספרייה:** `openai` (גרסה 4.x) — `client.chat.completions.create()`
- **HTTP client:** OpenAI SDK משתמש ב-fetch (טבעי ב-Node 18+) או ב-undici
- **Node 20 ב-Render:** יש fetch מובנה — אין צורך ב-polyfill
- **apiKey:** נטען מ-`process.env.OPENAI_API_KEY || process.env.API_KEY` בעת טעינת המודול; אם חסר — `openai = null`

### 2.4 מה לבדוק ב-Render Logs

1. **אם מופיע `[refine-text] openai_client_exists=false`**  
   → **הקריאה לא יוצאת** — חסר API key או שלא נטען כראוי.

2. **אם מופיע `OPENAI_REQUEST_SENT` אבל לא `OPENAI_RESPONSE_RECEIVED` ולא `OPENAI_RESPONSE_FAILED`**  
   → **הקריאה יוצאת ונחסמת** — timeout, רשת, או חסימה.

3. **אם מופיע `OPENAI_RESPONSE_FAILED reason=UNAUTHORIZED`**  
   → **הקריאה יוצאת ונכשלת** — מפתח שגוי או לא תקף.

4. **אם מופיע `OPENAI_RESPONSE_RECEIVED`**  
   → **הקריאה מצליחה** — הבעיה לא בשלב ה-API.

---

## 3. Document Analysis — Is OCR Actually Executed?

### 3.1 זרימת הביצוע (PDF)

```
משתמש מעלה קובץ
  → POST /api/analyze-medical-complaint (או analyze-dental-opinion)
  → ensureAuthenticated
  → upload_received
  → getDocumentText(base64, mimeType)
      → PDF: pdf-parse → pdfjs
      → אם parsedText.length < 200 && USE_DOC_INTELLIGENCE:
          → submitDocumentIntelligenceJob(buffer, mimeType)
              → DOCINT_REQUEST_SENT
              → fetch(POST, body: buffer)  ← binary, לא data URL
              → אם 202: DOCINT_POLLING_STARTED
              → לולאת polling
              → DOCINT_POLLING_COMPLETED (succeeded או failed)
```

### 3.2 תנאים לריצת Document Intelligence

| תנאי | אם לא מתקיים |
|------|----------------|
| `AZURE_DOCINT_ENDPOINT` ו-`AZURE_DOCINT_KEY` (או DOCUMENT_INTELLIGENCE_*) | `USE_DOC_INTELLIGENCE = false` → DocInt לא נקרא |
| `parsedText.length < 200` (PDF עם מעט/בלי טקסט) | PDF טקסטואלי מספיק → DocInt לא נדרש |
| Buffer לא ריק | שגיאה לפני שליחה |

### 3.3 Azure Document Intelligence — פרטים טכניים

- **שירות:** Document Intelligence (Read model) — לא Computer Vision
- **Endpoint:** `.../formrecognizer/documentModels/prebuilt-read:analyze?api-version=2023-07-31`
- **שליחה:** `body: buffer` (binary), `Content-Type` לפי MIME (application/pdf, image/jpeg, וכו')
- **פרוטוקול:** POST → 202 + operation-location → polling עד succeeded/failed

### 3.4 מה לבדוק ב-Render Logs

1. **אין `[analyze-medical-complaint] upload_received`**  
   → **getDocumentText לא נקראת** — כשל לפני (auth, validation, וכו').

2. **מופיע `[getDocumentText] mime=pdf path=pdf-parse` (או pdfjs) עם textLength > 200**  
   → **DocInt לא רץ** — אין צורך ב-OCR, הבעיה לא ב-OCR.

3. **אין `DOCINT_REQUEST_SENT`**  
   → **DocInt לא נקרא** — `USE_DOC_INTELLIGENCE=false` או שלא הגענו לשלב OCR (path אחר).

4. **מופיע `DOCINT_REQUEST_SENT` אבל לא `DOCINT_POLLING_STARTED`**  
   → **הבקשה הראשונית נכשלה** — 4xx/5xx, או חסימת רשת לפני 202.

5. **מופיע `DOCINT_POLLING_STARTED` אבל לא `DOCINT_POLLING_COMPLETED`**  
   → **הקריאה יוצאת, ה-polling נתקע** — timeout או Azure לא מחזיר succeeded/failed.

6. **מופיע `DOCINT_POLLING_COMPLETED status=failed`**  
   → **הקריאה חוזרת עם כשל** — Azure מחזיר failed (למשל מסמך לא נתמך).

---

## 4. Where Exactly Execution Stops — Evidence

### 4.1 מפתח הלוגים שנוספו

| לוג | משמעות |
|-----|--------|
| `[refine-text] openai_client_exists=true/false` | האם יש OpenAI client (מפתח) |
| `[refine-text] OPENAI_REQUEST_SENT` | הבקשה נשלחת עכשיו |
| `[refine-text] OPENAI_RESPONSE_RECEIVED` | הבקשה חזרה בהצלחה |
| `[refine-text] OPENAI_RESPONSE_FAILED` | הבקשה חזרה בשגיאה |
| `[analyze-*-complaint/opinion] upload_received` | הקובץ התקבל |
| `[getDocumentText] DOCINT_REQUEST_SENT` | נשלחת בקשה ל-Azure DocInt |
| `[getDocumentText] DOCINT_POLLING_STARTED` | התחיל polling |
| `[getDocumentText] DOCINT_POLLING_COMPLETED` | Polling הסתיים (succeeded/failed) |

### 4.2 תרחישים אפשריים לפי רצף לוגים

| רצף לוגים | מסקנה |
|-----------|--------|
| `openai_client_exists=false` | **הקריאה לא יוצאת** — חסר מפתח |
| `OPENAI_REQUEST_SENT` → (אין המשך) | **הקריאה יוצאת ונחסמת** — timeout/רשת |
| `OPENAI_REQUEST_SENT` → `OPENAI_RESPONSE_FAILED` | **הקריאה יוצאת ונכשלת** — שגיאת API |
| `OPENAI_REQUEST_SENT` → `OPENAI_RESPONSE_RECEIVED` | **הקריאה מצליחה** |
| אין `DOCINT_REQUEST_SENT` | **OCR לא רץ** — DocInt כבוי או path אחר |
| `DOCINT_REQUEST_SENT` → (אין DOCINT_POLLING_*) | **בקשה ל-Azure נכשלת** לפני 202 |
| `DOCINT_POLLING_STARTED` → (אין DOCINT_POLLING_COMPLETED) | **Polling נתקע** |
| `DOCINT_POLLING_COMPLETED status=succeeded` | **OCR הצליח** |

---

## 5. Local vs Render — Concrete Differences

| היבט | Local | Render |
|------|-------|--------|
| **ENV** | `.env` מקומי | Environment Variables ב-Dashboard |
| **RENDER** | לא מוגדר (או false) | `RENDER=true` |
| **רשת** | בדרך כלל ללא הגבלות | ייתכן firewall / proxy / timeout |
| **Node** | גרסה מקומית | Node 20 (או לפי NODE_VERSION) |
| **fetch** | node-fetch (import) + native | אותו קוד |
| **Timeout** | לרוב ללא הגבלה | Render עלול לחתוך בקשות ארוכות (למשל 30–60s) |
| **Tesseract** | פעיל | כבוי (`tesseract_on_render=false`) |
| **DocInt** | אופציונלי | הפתרון היחיד ל-OCR |

### 5.1 חסימות אפשריות ייחודיות ל-Render

- **חסימת outbound HTTP** — Render בדרך כלל לא חוסם, אבל יש לוודא.
- **Timeout ברמת reverse proxy** — בקשות ארוכות עלולות להיקטע לפני שמוחזרת תשובה.
- **DNS** — כשל ב-resolve של api.openai.com או Azure.
- **TLS/SSL** — בעיות אימות (נדיר בדרך כלל).

---

## 6. מסקנה אחת ברורה לכל פיצ'ר

### שיפור ניסוח בעברית

- **אם `openai_client_exists=false`** → **"הקריאה לא יוצאת"** — נחסמת לפני שליחה (חסר מפתח).
- **אם `OPENAI_REQUEST_SENT` ללא `OPENAI_RESPONSE_*`** → **"הקריאה יוצאת ונחסמת"** — timeout או חסימת רשת.
- **אם `OPENAI_RESPONSE_FAILED`** → **"הקריאה יוצאת ונכשלת"** — שגיאה מ-OpenAI (401, 429, וכו').
- **אם `OPENAI_RESPONSE_RECEIVED`** → **"הקריאה חוזרת בהצלחה"** — הבעיה לא בשלב ה-API.

### ניתוח מסמכים

- **אם אין `upload_received`** → **"הקריאה לא יוצאת"** — כשל לפני OCR.
- **אם אין `DOCINT_REQUEST_SENT`** (עבור PDF סרוק) → **"OCR לא רץ"** — DocInt כבוי או path אחר.
- **אם `DOCINT_REQUEST_SENT` ללא `DOCINT_POLLING_STARTED`** → **"הקריאה יוצאת ונכשלת"** — כשל בבקשה הראשונה ל-Azure.
- **אם `DOCINT_POLLING_STARTED` ללא `DOCINT_POLLING_COMPLETED`** → **"הקריאה יוצאת ונחסמת"** — polling נתקע.
- **אם `DOCINT_POLLING_COMPLETED status=failed`** → **"הקריאה חוזרת בשגיאה"** — Azure דוחה את המסמך.
- **אם `DOCINT_POLLING_COMPLETED status=succeeded`** → **"OCR הצליח"** — הבעיה בשלב ה-AI או ב-UI.

---

**סיום המסמך.**  
לאבחון סופי: להשוות לוגים מ-Render עם המפתחות בסעיף 4 ו-6.
