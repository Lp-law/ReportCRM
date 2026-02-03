import { describe, it, expect } from 'vitest';
import { protectHebrewFacts, restoreHebrewFacts } from '../src/utils/hebrewFactProtection.ts';

describe('Hebrew fact protection placeholders', () => {
  it('round-trips numbers, amounts and dates without changes', () => {
    const original =
      'הנתבע שילם 12,500 ₪ ביום 01/02/2020 בגין 30% מנזקיו בתיק 1234/56.';
    const { protectedText, map } = protectHebrewFacts(original);
    expect(protectedText).not.toEqual(original);
    const { restoredText, missingPlaceholders } = restoreHebrewFacts(protectedText, map);
    expect(restoredText).toEqual(original);
    expect(missingPlaceholders.length).toBe(0);
  });

  it('detects missing placeholders during restore', () => {
    const original = 'הסכום הנתבע עומד על 250,000 ₪ נכון ל-01.01.2024.';
    const { protectedText, map } = protectHebrewFacts(original);
    // Simulate LLM output that dropped one placeholder
    const tampered = protectedText.replace(/__NUM_\d+__/, '');
    const { missingPlaceholders } = restoreHebrewFacts(tampered, map);
    expect(missingPlaceholders.length).toBeGreaterThan(0);
  });

  it('handles English proper names as NAME placeholders', () => {
    const original = 'הפוליסה הונפקה לטובת John Doe על ידי המבטחת.';
    const { protectedText, map } = protectHebrewFacts(original);
    expect(Object.values(map).some((v) => v.includes('John Doe'))).toBe(true);
    const { restoredText, missingPlaceholders } = restoreHebrewFacts(protectedText, map);
    expect(restoredText).toEqual(original);
    expect(missingPlaceholders.length).toBe(0);
  });

  it('protects Hebrew names with context words', () => {
    const original = 'התובעת שרה לוי הגישה את התביעה נגד המבטחת.';
    const { protectedText, map } = protectHebrewFacts(original);
    expect(protectedText).not.toEqual(original);
    expect(Object.values(map).some((v) => v.includes('שרה לוי'))).toBe(true);
    const { restoredText, missingPlaceholders } = restoreHebrewFacts(protectedText, map);
    expect(restoredText).toEqual(original);
    expect(missingPlaceholders.length).toBe(0);
  });

  it('protects Hebrew names with titles and initials', () => {
    const original = 'מר משה כהן העיד בפני ד"ר א. ב. בבית המשפט.';
    const { protectedText, map } = protectHebrewFacts(original);
    expect(Object.values(map).some((v) => v.includes('מר משה כהן'))).toBe(true);
    expect(Object.values(map).some((v) => v.includes('א. ב.'))).toBe(true);
    const { restoredText, missingPlaceholders } = restoreHebrewFacts(protectedText, map);
    expect(restoredText).toEqual(original);
  });

  it('does not over-protect generic Hebrew phrases', () => {
    const original = 'בית משפט שלום בחן את האירוע שהתרחש בחדר מיון של חברת ביטוח גדולה.';
    const { map } = protectHebrewFacts(original);
    const values = Object.values(map);
    expect(values.some((v) => v.includes('בית משפט שלום'))).toBe(false);
    expect(values.some((v) => v.includes('חדר מיון'))).toBe(false);
    expect(values.some((v) => v.includes('חברת ביטוח'))).toBe(false);
  });

  it('round-trips Hebrew number words such as percentages and amounts', () => {
    const original =
      'התובעת טוענת לנכות רפואית בשיעור של שלושים אחוז ולנזק ממוני בסך של מאתיים חמישים אלף שקלים.';
    const { protectedText, map } = protectHebrewFacts(original);
    expect(protectedText).not.toEqual(original);
    const { restoredText, missingPlaceholders } = restoreHebrewFacts(protectedText, map);
    expect(restoredText).toEqual(original);
    expect(missingPlaceholders.length).toBe(0);
  });
});


