
export const LEGACY_CLAIM_SECTION_LABELS = [
  'The facts outlined in the statement of claim',
  'Statement of Claim – Factual Summary',
];

export const CLAIM_SECTION_LABEL = 'Factual background – Statement of Claim';

export const LEGACY_DEMAND_SECTION_LABELS = [
  'Factual Summary from the Letter of Demand',
];

export const DEMAND_LETTER_SECTION_LABEL = 'Factual background – Letter of Demand';

export const PLAINTIFF_EXPERT_SECTION_KEY = "The plaintiff's expert opinion";
export const CLAIMANT_EXPERT_SECTION_KEY = "The claimant's expert opinion";

// --- USERS & AUTHENTICATION ---
export const USERS = [
  { id: 'u1', username: 'lior', password: 'lior123', name: 'Lior Perry', email: 'lior@lp-law.co.il', role: 'ADMIN' },
  { id: 'u2', username: 'lidor', password: 'lidor123', name: 'Lidor Kabilo', email: 'Lidor@lp-law.co.il', role: 'SUB_ADMIN' },
  { id: 'u3', username: 'iris', password: 'iris123', name: 'Iris Alfman', email: 'Iris@lp-law.co.il', role: 'FINANCE' },
  { id: 'u4', username: 'hava', password: 'hava123', name: 'Hava Kabilo', email: 'Hava@lp-law.co.il', role: 'LAWYER' },
  { id: 'u5', username: 'may', password: 'may123', name: 'May Harari', email: 'May@lp-law.co.il', role: 'LAWYER' },
  { id: 'u6', username: 'vlada', password: 'vlada123', name: 'Vlada Boltach', email: 'Vlada@lp-law.co.il', role: 'LAWYER' },
  { id: 'u7', username: 'orly', password: 'orly123', name: 'Orly Day', email: 'Orly@lp-law.co.il', role: 'LAWYER' },
];

export const RECIPIENTS = [
  {
    id: '1',
    companyName: 'Howden (UK)',
    contactPerson: 'Lidor Kabilo',
    email: 'lidor@lp-law.co.il',
    role: 'Administrative contact (testing phase)',
    address: 'Via Sure International Underwriters Insurance Agency (2013) Ltd'
  },
  {
    id: '2',
    companyName: 'Aviva Insurance',
    contactPerson: 'Sarah Jenkins',
    email: 'claims@aviva.com',
    role: 'Senior Claims Adjuster'
  },
  {
    id: '3',
    companyName: "Lloyd's Syndicates",
    contactPerson: 'Michael Ross',
    email: 'm.ross@lloyds.com',
    role: 'Lead Underwriter'
  }
];

export const INSURER_OPTIONS = [
  "W/R/B Underwriting",
  "QBE Insurance Group",
  "Market Form Underwriting",
  "Dale Underwriting Partners",
  "MedPro & CNA Syndicate",
  "Hardy (Underwriting Agencies) Limited"
];

export const PROCEDURAL_STAGES = [
  "Receipt of Lawsuit",
  "Statement of Defence",
  "Preliminary Proceedings",
  "Evidence Submission",
  "Evidentiary Hearing",
  "Summaries",
  "Judgment",
  "Appeal",
  "Update",
  "Risk Assessment",
  "Settlement Negotiations"
];

export const TIMELINE_TEMPLATES = [
  {
    id: 'standard',
    name: 'Standard Civil Procedure',
    steps: [
      { label: 'Statement of claim', sub: 'Statement of defence' },
      { label: 'Preliminary proceedings', sub: '' },
      { label: 'Evidence submission', sub: '' },
      { label: 'Evidentiary hearing', sub: '' },
      { label: 'Summaries', sub: '' },
      { label: 'Judgment', sub: '' },
    ]
  },
  {
    id: 'settlement',
    name: 'Settlement Track',
    steps: [
      { label: 'Claim Received', sub: 'Initial Review' },
      { label: 'Negotiation', sub: 'Risk Analysis' },
      { label: 'Mediation', sub: 'Offer Made' },
      { label: 'Settlement Agreement', sub: 'Drafting' },
      { label: 'Closing', sub: 'Payment' },
    ]
  },
  {
    id: 'fast_track',
    name: 'Fast Track Litigation',
    steps: [
      { label: 'Claim Filed', sub: 'Fast Track' },
      { label: 'First Hearing', sub: 'Pleadings' },
      { label: 'Evidentiary Hearing', sub: 'One Day' },
      { label: 'Oral Summaries', sub: '' },
      { label: 'Judgment', sub: '' },
    ]
  }
];

// The specific list of allowed headers provided by the user
export const AVAILABLE_SECTIONS = [
  CLAIM_SECTION_LABEL,
  DEMAND_LETTER_SECTION_LABEL,
  PLAINTIFF_EXPERT_SECTION_KEY,
  CLAIMANT_EXPERT_SECTION_KEY,
  "The insured's expert opinion",
  "Insurance Coverage",
  "Risk Assessment",
  "MPL",
  "Strategy",
  "Expenses breakdown",
  "Expenses & Compensation breakdown",
  "Recommendations",
  "Strategy & Recommendations",
  "Request for Approval of a Settlement Agreement"
];

// Options for filename generation (First report scenarios)
export const FILENAME_TAGS = [
  "New lawsuit",
  "Letter of demand",
  "New third-party notice",
  "Caution Notice"
];

export const FOOTER_NAMES = [
  { en: 'Adv. May Harari', he: "עו''ד מאי הררי" },
  { en: 'Adv. Vlada Boltach', he: "עו''ד ולדה בולטץ'" },
  { en: 'Adv. Orly Day', he: "עו''ד אורלי דאי" },
  { en: 'Adv. Hava Kabilo', he: "עו''ד חוה קבילו" },
  { en: 'Adv. Ori Marom', he: "עו''ד אורי מרום" },
  { en: 'Adv. Lior Perry', he: "עו''ד ליאור פרי" },
];

// Snippets Library for auto-completion
export const LEGAL_SNIPPETS = {
  "Update": [
    "הוגש כתב הגנה מטעם המבוטח.",
    "התקיים קדם משפט ביום [DATE] ובו נקבע כי הצדדים יגישו תצהירים.",
    "לא חלה התקדמות משמעותית בתיק מאז הדיווח האחרון.",
    "התקבלו מסמכים רפואיים נוספים מהתובע המעידים על החמרה במצב."
  ],
  "Insurance Coverage": [
    `The policy period is from [policyStartDate] to [policyEndDate].

The retroactive date is [retroactiveDate].

התביעה נמסרה לברוקר ביום _______________, כלומר, בתוך תקופת הפוליסה.

על פי הרשומה הרפואית שצורפה לכתב התביעה, הטיפולים היו בתקופה שבין ____________ לבין ____________.

לכן, נראה שיש כיסוי ביטוחי לטיפולים שביצע המבוטח בהקשר זה.`
  ],
  "Risk Assessment": [
    "להערכתנו, בשלב זה סיכויי ההגנה נראים טובים (מעל 50%).",
    "אנו סבורים כי קיימת חשיפה ביטוחית משמעותית בתיק זה.",
    "לאור חוות הדעת של המומחה מטעמנו, נראה כי אין רשלנות מצד המבוטח.",
    "התיק מעלה שאלות מורכבות בנושא האחריות, ולכן הסיכון מוערך כבינוני."
  ],
  "Recommendations": [
    "אנו ממליצים לנסות ולסיים את התיק בפשרה בשלב מוקדם זה.",
    "אנו ממליצים להמתין להגשת ראיות התובע בטרם גיבוש אסטרטגיה סופית.",
    "מומלץ למנות מומחה רפואי מטעם בית המשפט.",
    "יש להגיש הודעת צד ג' כנגד המוסד הרפואי הנוסף המעורב."
  ],
  [CLAIM_SECTION_LABEL]: [
    "התובע, {plaintiff}, טוען כי בתאריך [DATE] עבר טיפול רפואי רשלני.",
    "בכתב התביעה נטען כי המבוטח, {insured}, לא פעל בהתאם לפרקטיקה המקובלת.",
    "האירוע המדובר התרחש במרפאת המבוטח."
  ],
  [DEMAND_LETTER_SECTION_LABEL]: [
    "הדורשת, {plaintiff}, פנתה במכתב דרישה עקב טיפול שניתן לה בתאריך [DATE].",
    "במכתב הדרישה נטען כי המבוטח פעל ברשלנות וגרם לנזקים מתמשכים.",
    "הדורשת מבקשת פיצוי עבור טיפולים רפואיים נוספים וכאב וסבל."
  ],
  "Strategy": [
    "אסטרטגיית ההגנה תתבסס על היעדר קשר סיבתי בין הטיפול לנזק.",
    "בכוונתנו להוכיח כי המבוטח פעל ללא דופי ובהתאם לסטנדרט הרפואי הסביר.",
    "נפעל לעיכוב ההליכים עד לבירור מצבו הרפואי הסופי של התובע."
  ]
};

export const EMAIL_TEMPLATES = [
  {
    name: "Attached Report - Standard",
    subject: "Update Report - {Insured} ({Ref})",
    body: `Dear {Recipient},

Please find attached our update report regarding the above-captioned matter.

Should you have any questions, we remain at your disposal.

Kind regards,

Lior Perry, Adv.`
  },
  {
    name: "Attached Report - Urgent",
    subject: "URGENT: Update Report - {Insured} ({Ref})",
    body: `Dear {Recipient},

Please find attached an urgent update report regarding the above-captioned matter.
Your immediate attention to the recommendations section is appreciated.

Kind regards,

Lior Perry, Adv.`
  },
  {
    name: "Attached Report - Final/Closing",
    subject: "Final Report - {Insured} ({Ref})",
    body: `Dear {Recipient},

Please find attached our final report and closing summary for this file.

We remain at your disposal for any further clarifications.

Kind regards,

Lior Perry, Adv.`
  }
];

// Feature flags
export const SEED_TOOL_ENABLED = true;
