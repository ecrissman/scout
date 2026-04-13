import { supabase } from './supabase.js';

const BASE = '/api';

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

const req = async (method, body) => ({
  method,
  headers: {
    ...(await authHeaders()),
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
  },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

export async function getPhoto(date) {
  try {
    const r = await fetch(`${BASE}/photo/${date}`, await req('GET'));
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

export async function uploadPhoto(date, payload) {
  try {
    const r = await fetch(`${BASE}/photo/${date}`, await req('POST', payload));
    return r.ok;
  } catch { return false; }
}

export async function updateCaption(date, caption) {
  try {
    const r = await fetch(`${BASE}/photo/${date}/caption`, await req('PUT', { caption }));
    return r.ok;
  } catch { return false; }
}

export async function listYear(year) {
  try {
    const r = await fetch(`${BASE}/list/${year}`, await req('GET'));
    if (!r.ok) return [];
    return r.json();
  } catch { return []; }
}

export async function getTheme() {
  try {
    const r = await fetch(`${BASE}/theme/current`, await req('GET'));
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

export async function getNextWeekTheme(nextSundayStr) {
  try {
    const r = await fetch(`${BASE}/theme/current?date=${nextSundayStr}`, await req('GET'));
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

export async function getTodayPrompt(date, coords) {
  try {
    const qs = coords ? `?lat=${coords.lat}&lon=${coords.lon}` : '';
    const r = await fetch(`${BASE}/ai/prompt/${date}${qs}`, await req('GET'));
    return r.json();
  } catch { return null; }
}

export async function getCaptionSuggestion(date) {
  try {
    const r = await fetch(`${BASE}/ai/caption/${date}`, await req('POST'));
    return r.json();
  } catch { return null; }
}

export async function requestAccess({ name, email, note }) {
  try {
    const r = await fetch(`${BASE}/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, note }),
    });
    const data = await r.json();
    if (r.status === 409) return { error: 'already_submitted' };
    if (!r.ok) return { error: data.error || 'Something went wrong' };
    return { ok: true };
  } catch { return { error: 'Something went wrong' }; }
}

export async function deletePhoto(date) {
  try {
    const r = await fetch(`${BASE}/photo/${date}`, await req('DELETE'));
    return r.ok;
  } catch { return false; }
}

export async function getFeedback(date) {
  try {
    const r = await fetch(`${BASE}/ai/feedback/${date}`, await req('POST'));
    return r.json();
  } catch { return null; }
}

// Images are served directly by the Worker (token sent via Authorization header)
export const thumbUrl = (date) => `${BASE}/image/${date}/thumb`;
export const fullUrl  = (date) => `${BASE}/image/${date}/full`;
