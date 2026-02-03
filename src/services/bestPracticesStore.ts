import { BestPracticeSnippet } from '../types';

const API_BASE = '/api/best-practices';

const handleResponse = async (res: Response): Promise<BestPracticeSnippet[]> => {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed with status ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
};

export const loadBestPractices = async (): Promise<BestPracticeSnippet[]> => {
  const res = await fetch(API_BASE);
  return handleResponse(res);
};

export const getBestPracticesBySection = async (
  sectionKey: string,
): Promise<BestPracticeSnippet[]> => {
  const res = await fetch(`${API_BASE}?sectionKey=${encodeURIComponent(sectionKey)}`);
  return handleResponse(res);
};

export const upsertBestPractice = async (
  snippet: BestPracticeSnippet,
  userRole: string,
): Promise<BestPracticeSnippet[]> => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'x-user-role': userRole,
  };

  if (!snippet.id) {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify(snippet),
    });
    return handleResponse(res);
  }

  const res = await fetch(`${API_BASE}/${encodeURIComponent(snippet.id)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(snippet),
  });
  return handleResponse(res);
};

export const deleteBestPractice = async (
  id: string,
  userRole: string,
): Promise<BestPracticeSnippet[]> => {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      'x-user-role': userRole,
    },
  });
  return handleResponse(res);
};

export const setBestPracticeEnabled = async (
  id: string,
  enabled: boolean,
  userRole: string,
): Promise<BestPracticeSnippet[]> => {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-user-role': userRole,
    },
    body: JSON.stringify({ isEnabled: enabled }),
  });
  return handleResponse(res);
};

export const recordBestPracticeUsage = async (
  id: string,
  mode: 'INSERT' | 'COPY',
  userRole: string,
): Promise<BestPracticeSnippet[]> => {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}/usage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-role': userRole,
    },
    body: JSON.stringify({ mode }),
  });
  return handleResponse(res);
};

