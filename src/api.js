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

export async function getCaptionSuggestion(date) {
  try {
    const r = await fetch(`${BASE}/ai/caption/${date}`, await req('POST'));
    return r.json();
  } catch { return null; }
}

export async function deletePhoto(date) {
  try {
    const r = await fetch(`${BASE}/photo/${date}`, await req('DELETE'));
    return r.ok;
  } catch { return false; }
}

export async function deleteAccount() {
  try {
    const r = await fetch(`${BASE}/account`, await req('DELETE'));
    return r.ok;
  } catch { return false; }
}

export async function getFeedback(date) {
  try {
    const r = await fetch(`${BASE}/ai/feedback/${date}`, await req('POST'));
    return r.json();
  } catch { return null; }
}

// v2 brand: read-only context for the Compose header — autoLight from
// weather + autoPlace from reverse-geocoding. Called on mount.
// Returns { autoLight, autoPlace } or null on network failure.
export async function getContext({ lat, lon }) {
  try {
    const qs = (typeof lat === 'number' && typeof lon === 'number') ? `?lat=${lat}&lon=${lon}` : '';
    const r = await fetch(`${BASE}/ai/context${qs}`, await req('GET'));
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

// Compose a brief. The editor decides — no user inputs (mood/time/constraint
// were retired). Light is server-detected from lat/lon and passed silently
// to the model as context. Place is fetched for UI dateline display only.
// localDate is the client's local YYYY-MM-DD; the backend uses it to key
// the challenge-day cadence so a UTC boundary mid-day doesn't cause the
// same bucket to fire across two perceived calendar days.
// Returns { brief, autoLight, autoPlace, voice, challenge, durationMinutes }.
export async function composeBrief({ lat, lon, voice, localDate }) {
  try {
    const r = await fetch(`${BASE}/ai/brief`, await req('POST', { lat, lon, voice, localDate }));
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

// v2 brand: editor's note for a filed photo. Returns { editorNote, editorNoteAt }.
// Persists the note into the photo's meta.json.
export async function getEditorNote(date, voice) {
  try {
    const r = await fetch(`${BASE}/ai/editor-note/${date}`, await req('POST', { voice }));
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

// Images are served directly by the Worker (token sent via Authorization header)
export const thumbUrl = (date) => `${BASE}/image/${date}/thumb`;
export const fullUrl  = (date) => `${BASE}/image/${date}/full`;
