import { supabase } from "./supabase";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle(res: Response) {
  if (!res.ok) {
    let msg = `Erreur ${res.status}`;
    try {
      const j = await res.json();
      msg = j.detail || msg;
    } catch {}
    throw new Error(typeof msg === "string" ? msg : "Erreur serveur");
  }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

export const api = {
  base: BASE,
  async get(path: string) {
    const res = await fetch(`${BASE}${path}`, { headers: await authHeader() });
    return handle(res);
  },
  async post(path: string, body?: any) {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return handle(res);
  },
  async put(path: string, body?: any) {
    const res = await fetch(`${BASE}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return handle(res);
  },
  async del(path: string) {
    const res = await fetch(`${BASE}${path}`, { method: "DELETE", headers: await authHeader() });
    return handle(res);
  },
  async upload(path: string, form: FormData) {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { ...(await authHeader()) },
      body: form,
    });
    return handle(res);
  },
  // absolute url for a signed file path returned by the backend
  fileUrl(url: string) {
    if (!url) return url;
    return url.startsWith("http") ? url : `${process.env.EXPO_PUBLIC_BACKEND_URL}${url}`;
  },
};
