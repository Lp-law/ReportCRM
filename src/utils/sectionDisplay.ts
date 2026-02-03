import {
  CLAIM_SECTION_LABEL,
  CLAIMANT_EXPERT_SECTION_KEY,
  DEMAND_LETTER_SECTION_LABEL,
  PLAINTIFF_EXPERT_SECTION_KEY,
} from '../constants';

export type ExpertCountMode = 'SINGLE' | 'MULTIPLE';
export type SectionPartyRole = 'PLAINTIFF' | 'CLAIMANT';

export const isPlaintiffExpertSection = (section: string) => section === PLAINTIFF_EXPERT_SECTION_KEY;
export const isClaimantExpertSection = (section: string) => section === CLAIMANT_EXPERT_SECTION_KEY;
export const isExpertSection = (section: string) => isPlaintiffExpertSection(section) || isClaimantExpertSection(section);

export const getSectionPartyRole = (section: string): SectionPartyRole | null => {
  if (isPlaintiffExpertSection(section) || section === CLAIM_SECTION_LABEL) return 'PLAINTIFF';
  if (isClaimantExpertSection(section) || section === DEMAND_LETTER_SECTION_LABEL) return 'CLAIMANT';
  return null;
};

const getExpertBaseTitle = (role: SectionPartyRole, mode: ExpertCountMode = 'SINGLE') => {
  const isMultiple = mode === 'MULTIPLE';
  const noun = role === 'PLAINTIFF' ? 'Statement of Claim' : 'Letter of Demand';
  const prefix = isMultiple ? 'Expert opinions' : 'Expert opinion';
  return `${prefix} – ${noun}`;
};

export const getSectionDisplayTitle = (section: string, expertMode?: ExpertCountMode) => {
  if (isPlaintiffExpertSection(section)) {
    return getExpertBaseTitle('PLAINTIFF', expertMode);
  }
  if (isClaimantExpertSection(section)) {
    return getExpertBaseTitle('CLAIMANT', expertMode);
  }
  return section;
};

