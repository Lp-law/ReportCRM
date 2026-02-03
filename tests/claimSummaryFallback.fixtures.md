Manual fixtures / QA scenarios for `buildClaimSummaryFromAnalysis`
==================================================================

1. CLAIM – rich chronology (8–12 events)
----------------------------------------

- **Input**: `analysisType="CLAIM"`, `section=CLAIM_SECTION_KEY`, `analysis` with:
  - `entities.plaintiff = "פלונית"` and `defendants = ["בית החולים X", "ד\"ר Y"]`.
  - `timeline` containing 8–12 entries with `date` and `event` strings (אשפוז, ניתוח, ביקורת, מכתב תשובה וכו').
  - Optional `facts` array (will not be used if `timeline` is populated).
- **Expected**:
  - Opening sentence in third person, e.g. "התובעת, פלונית הגישה תביעה נגד בית החולים X, ד\"ר Y."
  - Numbered block starting with "להלן תיאור האירועים לטענת התובעת:" and at least 8 numbered lines.
  - Each line in the general format `[תאריך] — actor — event — location? — result?`.
  - No separate numbered blocks with titles like "להלן פירוט של טענות..." או "להלן פירוט של הנזקים...".

2. DEMAND – concise chronology (4–7 events)
-------------------------------------------

- **Input**: `analysisType="DEMAND"`, `section=DEMAND_SECTION_KEY`, `analysis` with:
  - `entities.plaintiff = "אלמונית"` and `defendants = ["המבטחת Z"]`.
  - `timeline` containing 4–7 entries representing משלוח מכתב דרישה, תזכורות, תשובת המבטחת וכו'.
  - Minimal `facts`, `allegations`, `injuries`, `requestedRelief` populated.
- **Expected**:
  - Opening sentence using "הדורשת" וביטוי "פנתה במכתב דרישה אל".
  - Numbered block "להלן תיאור האירועים לטענת הדורשת:" עם 4–7 שורות כרונולוגיות.
  - Optional single-sentence wrap‑up about allegations/damages at the very end only (no lists).
  - No additional numbered sections for טענות או נזקים; הכל מרוכז ב-timeline + משפט מסכם יחיד.

3. Fallback when `claimSummary` is empty
----------------------------------------

- **Setup**: להריץ את זרימת ה-Paperclip עבור סעיפי:
  - "Factual background – Statement of Claim" (CLAIM), ו-
  - "Factual background – Letter of Demand" (DEMAND),
  כאשר השרת מחזיר `claimSummary: ""` אבל מחזיר אובייקט `analysis` תקין.
- **Expected**:
  - הטקסט שמוזן לסעיף נוצר כולו מ-`buildClaimSummaryFromAnalysis`.
  - הפלט כולל:
    - משפט פתיחה קצר.
    - בלוק אירועים כרונולוגי ממוספר בלבד.
    - פסקת גורמים מרכזיים (אם יש שחקנים מרובים).
    - פסקת מומחים או המשפט "במסמך זה לא אותרה הפניה מפורשת לחוות דעת מומחה."
    - בלוק "פערים וחוסרים עובדתיים" ממוספר.
    - לכל היותר משפט מסכם אחד על טענות/נזקים – ללא bullets.
  - בשום מצב לא מופיעות כותרות בסגנון "להלן פירוט של טענות..." או "להלן פירוט של הנזקים..." בתוך שדה ה‑Factual background.
  - **אסור שיופיעו המחרוזות המדויקות**:
    - `"להלן פירוט של טענות"`
    - `"להלן פירוט של הנזקים"`


