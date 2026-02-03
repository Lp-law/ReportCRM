import { SectionTemplate } from '../types';

const API_BASE = '/api/templates';

const handleResponse = async (res: Response): Promise<SectionTemplate[]> => {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed with status ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
};

export const loadTemplates = async (): Promise<SectionTemplate[]> => {
  const res = await fetch(API_BASE);
  return handleResponse(res);
};

// Not used anymore in the client, kept for API compatibility if needed.
export const saveTemplates = async (_list: SectionTemplate[]): Promise<void> => {
  return;
};

export const getTemplatesBySection = async (sectionKey: string): Promise<SectionTemplate[]> => {
  const url = `${API_BASE}?sectionKey=${encodeURIComponent(sectionKey)}`;
  const res = await fetch(url);
  return handleResponse(res);
};

export const upsertTemplate = async (
  template: SectionTemplate,
  userRole: string,
): Promise<SectionTemplate[]> => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'x-user-role': userRole,
  };

  if (!template.id) {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify(template),
    });
    return handleResponse(res);
  }

  const res = await fetch(`${API_BASE}/${encodeURIComponent(template.id)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(template),
  });
  return handleResponse(res);
};

export const deleteTemplate = async (
  id: string,
  userRole: string,
): Promise<SectionTemplate[]> => {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      'x-user-role': userRole,
    },
  });
  return handleResponse(res);
};

export const reorderTemplate = async (
  id: string,
  direction: 'UP' | 'DOWN',
  userRole: string,
): Promise<SectionTemplate[]> => {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}/reorder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-role': userRole,
    },
    body: JSON.stringify({ direction }),
  });
  return handleResponse(res);
};

