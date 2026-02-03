export const logError = (context: string, error: unknown) => {
  // מרכז לוגים לשגיאות – כרגע לקונסול, בעתיד ניתן לחבר לשרת
  // eslint-disable-next-line no-console
  console.error(`[LP-CRM] ${context}`, error);
};

export const logInfo = (context: string, details?: unknown) => {
  // eslint-disable-next-line no-console
  console.log(`[LP-CRM] ${context}`, details ?? '');
};


