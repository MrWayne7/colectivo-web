/* =====================================================================
   API del colectivo — Cloudflare Pages Function
   Rutas (todas bajo /api):
     GET  /public                 datos públicos (integrantes, fechas, drops, música)
     GET  /member/:slug           página pública de un integrante
     GET  /file/<key>             sirve fotos y audio desde R2 (soporta Range)
     POST /join                   solicitud para unirse
     GET  /setup                  ¿hace falta crear el primer admin?
     POST /setup                  crea el primer admin (requiere SETUP_KEY)
     POST /login  · POST /logout
     GET  /me · PUT /me · PUT /me/password · POST /me/photo · DELETE /me/photo
     GET/POST /me/dates · DELETE /me/dates/:id
     GET/POST /me/drops · DELETE /me/drops/:id
     GET/POST /me/tracks · DELETE /me/tracks/:id
     GET/POST /admin/members · PUT/DELETE /admin/members/:id
     GET /admin/joins · DELETE /admin/joins/:id
     DELETE /admin/dates/:id · /admin/drops/:id · /admin/tracks/:id
   ===================================================================== */

const ITER = 20000;               // iteraciones PBKDF2 (ajustado al límite de CPU del plan gratis)
const COOKIE = "colectivo_sesion";
const SESSION_DAYS = 30;
const MAX_AUDIO = 30 * 1024 * 1024;
const MAX_IMG = 6 * 1024 * 1024;

const te = new TextEncoder();
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const fail = (msg, status = 400) => json({ error: msg }, status);
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const unhex = h => new Uint8Array((h.match(/../g) || []).map(x => parseInt(x, 16)));
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const str = (v, max = 500) => String(v ?? "").trim().slice(0, max);
const today = () => new Date().toISOString().slice(0, 10);
const slugify = s => str(s, 40).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
const parseJSON = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s);
const cleanUrl = u => { u = str(u, 300); return /^https?:\/\//i.test(u) ? u : (u ? "https://" + u.replace(/^\/+/, "") : ""); };
const fileUrl = key => key ? "/api/file/" + key : "";

/* ---------- contraseñas y sesiones ---------- */
async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function derive(pass, secret, salt, iterations) {
  const peppered = await crypto.subtle.sign("HMAC", await hmacKey(secret), te.encode(pass));
  const key = await crypto.subtle.importKey("raw", peppered, "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}
async function hashPassword(pass, secret) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(pass, secret, salt, ITER);
  return `v1$${ITER}$${hex(salt)}$${hex(bits)}`;
}
async function verifyPassword(pass, stored, secret) {
  const [, iter, salt, h] = String(stored).split("$");
  if (!iter || !salt || !h) return false;
  const bits = await derive(pass, secret, unhex(salt), +iter);
  const a = new Uint8Array(bits), b = unhex(h);
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function makeToken(id, secret) {
  const payload = b64u(te.encode(JSON.stringify({ id, exp: Date.now() + SESSION_DAYS * 864e5 })));
  const sig = b64u(await crypto.subtle.sign("HMAC", await hmacKey(secret), te.encode(payload)));
  return `${payload}.${sig}`;
}
async function readToken(token, secret) {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), unb64u(sig), te.encode(payload));
  if (!ok) return null;
  const data = parseJSON(new TextDecoder().decode(unb64u(payload)), null);
  return data && data.exp > Date.now() ? data : null;
}
const cookieHeader = (value, maxAge) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
function getCookie(request) {
  const m = (request.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
  return m ? m[1] : "";
}
async function currentMember(env, request) {
  const data = await readToken(getCookie(request), env.SESSION_SECRET);
  if (!data) return null;
  return env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(data.id).first();
}

/* ---------- formato público ---------- */
const pubMember = m => ({
  id: m.id, slug: m.slug, alias: m.alias, role: m.role, specialty: m.specialty, city: m.city, bio: m.bio,
  tags: parseJSON(m.tags, []), links: parseJSON(m.links, []), photo: fileUrl(m.photo_key),
  available: !!m.available, status_note: m.status_note, is_admin: !!m.is_admin, sort: m.sort
});
const pubTrack = t => ({ id: t.id, title: t.title, artists: t.artists, url: fileUrl(t.audio_key), duration: t.duration, member: t.alias, slug: t.slug, member_id: t.member_id });

/* ---------- handlers ---------- */
async function publicData(env) {
  const members = (await env.DB.prepare("SELECT * FROM members ORDER BY sort, id").all()).results.map(pubMember);
  const dates = (await env.DB.prepare(
    "SELECT d.*, m.alias, m.slug FROM dates d JOIN members m ON m.id = d.member_id WHERE d.day >= ? ORDER BY d.day LIMIT 60"
  ).bind(today()).all()).results;
  const drops = (await env.DB.prepare(
    "SELECT r.*, m.alias, m.slug FROM drops r JOIN members m ON m.id = r.member_id ORDER BY r.day DESC, r.id DESC LIMIT 60"
  ).all()).results;
  const tracks = (await env.DB.prepare(
    "SELECT t.*, m.alias, m.slug FROM tracks t JOIN members m ON m.id = t.member_id ORDER BY t.created_at DESC, t.id DESC LIMIT 200"
  ).all()).results.map(pubTrack);
  return json({ members, dates, drops, tracks, today: today() });
}

async function memberPage(env, slug) {
  const m = await env.DB.prepare("SELECT * FROM members WHERE slug = ?").bind(slug).first();
  if (!m) return fail("No existe ese integrante", 404);
  const dates = (await env.DB.prepare("SELECT * FROM dates WHERE member_id = ? AND day >= ? ORDER BY day").bind(m.id, today()).all()).results;
  const drops = (await env.DB.prepare("SELECT * FROM drops WHERE member_id = ? ORDER BY day DESC, id DESC LIMIT 30").bind(m.id).all()).results;
  const tracks = (await env.DB.prepare("SELECT t.*, m.alias, m.slug FROM tracks t JOIN members m ON m.id = t.member_id WHERE t.member_id = ? ORDER BY t.created_at DESC").bind(m.id).all()).results.map(pubTrack);
  const order = (await env.DB.prepare("SELECT id FROM members ORDER BY sort, id").all()).results.map(r => r.id);
  return json({ member: pubMember(m), channel: order.indexOf(m.id) + 1, total: order.length, dates, drops, tracks, today: today() });
}

async function serveFile(env, request, key) {
  if (!key || key.includes("..")) return fail("Archivo inválido", 400);
  const hasRange = request.headers.has("range");
  const obj = await env.MEDIA.get(key, hasRange ? { range: request.headers } : {});
  if (!obj) return new Response("No encontrado", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=31536000, immutable");
  if (hasRange && obj.range) {
    let { offset = 0, length, suffix } = obj.range;
    if (suffix !== undefined) { offset = obj.size - suffix; length = suffix; }
    if (length === undefined) length = obj.size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set("content-length", String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set("content-length", String(obj.size));
  return new Response(obj.body, { headers });
}

async function join(env, request) {
  const b = await request.json().catch(() => ({}));
  if (b.web) return json({ ok: true });                      // honeypot: los bots lo llenan
  const name = str(b.name, 80), contact = str(b.contact, 160);
  if (!name || !contact) return fail("Necesitamos tu nombre y una forma de contactarte");
  await env.DB.prepare("INSERT INTO join_requests (name, role, city, links, contact, message) VALUES (?,?,?,?,?,?)")
    .bind(name, str(b.role, 120), str(b.city, 80), str(b.links, 400), contact, str(b.message, 1500)).run();
  return json({ ok: true });
}

async function setupStatus(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM members").first();
  return json({ needsSetup: !r || r.n === 0 });
}
async function setup(env, request) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM members").first();
  if (r && r.n > 0) return fail("Ya existe un administrador", 409);
  const b = await request.json().catch(() => ({}));
  if (!env.SETUP_KEY || str(b.key, 200) !== env.SETUP_KEY) return fail("La clave de instalación no coincide", 403);
  const alias = str(b.alias, 60), slug = slugify(b.slug || b.alias), pass = String(b.password || "");
  if (!alias || slug.length < 2) return fail("Alias o usuario inválido");
  if (pass.length < 8) return fail("La contraseña debe tener al menos 8 caracteres");
  const hash = await hashPassword(pass, env.SESSION_SECRET);
  const res = await env.DB.prepare("INSERT INTO members (slug, alias, role, pass_hash, is_admin) VALUES (?,?,?,?,1)").bind(slug, alias, str(b.role, 120), hash).run();
  const token = await makeToken(res.meta.last_row_id, env.SESSION_SECRET);
  return json({ ok: true, slug }, 200, { "set-cookie": cookieHeader(token, SESSION_DAYS * 86400) });
}

async function login(env, request) {
  const b = await request.json().catch(() => ({}));
  const slug = slugify(b.user), pass = String(b.password || "");
  const m = slug ? await env.DB.prepare("SELECT * FROM members WHERE slug = ?").bind(slug).first() : null;
  const ok = m ? await verifyPassword(pass, m.pass_hash, env.SESSION_SECRET) : false;
  if (!ok) return fail("Usuario o contraseña incorrectos", 401);
  const token = await makeToken(m.id, env.SESSION_SECRET);
  return json({ ok: true, me: pubMember(m) }, 200, { "set-cookie": cookieHeader(token, SESSION_DAYS * 86400) });
}
const logout = () => json({ ok: true }, 200, { "set-cookie": cookieHeader("", 0) });

/* ---------- integrante autenticado ---------- */
async function updateMe(env, me, request) {
  const b = await request.json().catch(() => ({}));
  const tags = Array.isArray(b.tags) ? b.tags.map(t => str(t, 30)).filter(Boolean).slice(0, 12) : parseJSON(me.tags, []);
  const links = Array.isArray(b.links)
    ? b.links.map(l => ({ nombre: str(l.nombre, 40), url: cleanUrl(l.url) })).filter(l => l.nombre && l.url).slice(0, 12)
    : parseJSON(me.links, []);
  await env.DB.prepare(
    "UPDATE members SET alias=?, role=?, specialty=?, city=?, bio=?, tags=?, links=?, available=?, status_note=? WHERE id=?"
  ).bind(
    str(b.alias, 60) || me.alias, str(b.role, 120), str(b.specialty, 160), str(b.city, 80), str(b.bio, 2000),
    JSON.stringify(tags), JSON.stringify(links), b.available === false ? 0 : 1, str(b.status_note, 160), me.id
  ).run();
  const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(me.id).first();
  return json({ ok: true, me: pubMember(m) });
}
async function changePassword(env, me, request) {
  const b = await request.json().catch(() => ({}));
  if (!(await verifyPassword(String(b.current || ""), me.pass_hash, env.SESSION_SECRET))) return fail("La contraseña actual no es correcta", 403);
  const pass = String(b.password || "");
  if (pass.length < 8) return fail("La nueva contraseña debe tener al menos 8 caracteres");
  await env.DB.prepare("UPDATE members SET pass_hash = ? WHERE id = ?").bind(await hashPassword(pass, env.SESSION_SECRET), me.id).run();
  return json({ ok: true });
}
async function uploadPhoto(env, me, request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail("Falta la imagen");
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return fail("Usa JPG, PNG, WEBP o GIF");
  if (file.size > MAX_IMG) return fail("La imagen pesa más de 6 MB");
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[file.type];
  const key = `fotos/${me.id}-${Date.now()}.${ext}`;
  await env.MEDIA.put(key, file, { httpMetadata: { contentType: file.type } });
  if (me.photo_key) await env.MEDIA.delete(me.photo_key).catch(() => {});
  await env.DB.prepare("UPDATE members SET photo_key = ? WHERE id = ?").bind(key, me.id).run();
  return json({ ok: true, photo: fileUrl(key) });
}
async function deletePhoto(env, me) {
  if (me.photo_key) await env.MEDIA.delete(me.photo_key).catch(() => {});
  await env.DB.prepare("UPDATE members SET photo_key = '' WHERE id = ?").bind(me.id).run();
  return json({ ok: true });
}

async function listOwn(env, table, me) {
  return json({ items: (await env.DB.prepare(`SELECT * FROM ${table} WHERE member_id = ? ORDER BY day DESC, id DESC`).bind(me.id).all()).results });
}
async function addDate(env, me, request) {
  const b = await request.json().catch(() => ({}));
  const day = str(b.day, 10);
  if (!isDay(day)) return fail("Fecha inválida (usa el selector de fecha)");
  const place = str(b.place, 120);
  if (!place && !str(b.title, 120)) return fail("Pon al menos el lugar o el título");
  await env.DB.prepare("INSERT INTO dates (member_id, day, title, place, city, url, note) VALUES (?,?,?,?,?,?,?)")
    .bind(me.id, day, str(b.title, 120), place, str(b.city, 80), cleanUrl(b.url), str(b.note, 200)).run();
  return listOwn(env, "dates", me);
}
async function addDrop(env, me, request) {
  const b = await request.json().catch(() => ({}));
  const title = str(b.title, 120);
  if (!title) return fail("El drop necesita un título");
  const day = str(b.day, 10);
  if (day && !isDay(day)) return fail("Fecha inválida");
  await env.DB.prepare("INSERT INTO drops (member_id, title, artists, day, url, note) VALUES (?,?,?,?,?,?)")
    .bind(me.id, title, str(b.artists, 160) || me.alias, day, cleanUrl(b.url), str(b.note, 200)).run();
  return listOwn(env, "drops", me);
}
async function listTracks(env, me) {
  const rows = (await env.DB.prepare("SELECT t.*, m.alias, m.slug FROM tracks t JOIN members m ON m.id = t.member_id WHERE t.member_id = ? ORDER BY t.created_at DESC, t.id DESC").bind(me.id).all()).results;
  return json({ items: rows.map(pubTrack) });
}
async function addTrack(env, me, request) {
  const form = await request.formData();
  const file = form.get("file");
  const title = str(form.get("title"), 120);
  if (!title) return fail("El track necesita un título");
  if (!(file instanceof File)) return fail("Falta el archivo de audio");
  if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(file.name)) return fail("Sube un archivo de audio (MP3, M4A, WAV, OGG)");
  if (file.size > MAX_AUDIO) return fail("El audio pesa más de 30 MB. Exporta en MP3 a 320 kbps o menos.");
  const ext = (file.name.split(".").pop() || "mp3").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp3";
  const key = `tracks/${me.id}-${Date.now()}.${ext}`;
  await env.MEDIA.put(key, file, { httpMetadata: { contentType: file.type || "audio/mpeg" } });
  await env.DB.prepare("INSERT INTO tracks (member_id, title, artists, audio_key, duration) VALUES (?,?,?,?,?)")
    .bind(me.id, title, str(form.get("artists"), 160) || me.alias, key, Math.max(0, parseInt(form.get("duration")) || 0)).run();
  return listTracks(env, me);
}
async function deleteOwn(env, me, table, id) {
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND member_id = ?`).bind(id, me.id).first();
  if (!row) return fail("No encontrado", 404);
  if (table === "tracks") await env.MEDIA.delete(row.audio_key).catch(() => {});
  await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
  return table === "tracks" ? listTracks(env, me) : listOwn(env, table, me);
}

/* ---------- admin ---------- */
async function adminMembers(env) {
  return json({ items: (await env.DB.prepare("SELECT * FROM members ORDER BY sort, id").all()).results.map(pubMember) });
}
async function adminCreate(env, request) {
  const b = await request.json().catch(() => ({}));
  const alias = str(b.alias, 60), slug = slugify(b.slug || b.alias), pass = String(b.password || "");
  if (!alias || slug.length < 2) return fail("Alias o usuario inválido");
  if (pass.length < 8) return fail("La contraseña temporal debe tener al menos 8 caracteres");
  if (await env.DB.prepare("SELECT id FROM members WHERE slug = ?").bind(slug).first()) return fail("Ese usuario ya existe", 409);
  const sortRow = await env.DB.prepare("SELECT COALESCE(MAX(sort),0)+1 AS s FROM members").first();
  await env.DB.prepare("INSERT INTO members (slug, alias, role, city, pass_hash, is_admin, sort) VALUES (?,?,?,?,?,?,?)")
    .bind(slug, alias, str(b.role, 120), str(b.city, 80), await hashPassword(pass, env.SESSION_SECRET), b.is_admin ? 1 : 0, sortRow.s).run();
  return adminMembers(env);
}
async function adminUpdate(env, me, request, id) {
  const b = await request.json().catch(() => ({}));
  const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
  if (!m) return fail("No encontrado", 404);
  if (b.password !== undefined) {
    if (String(b.password).length < 8) return fail("Mínimo 8 caracteres");
    await env.DB.prepare("UPDATE members SET pass_hash = ? WHERE id = ?").bind(await hashPassword(String(b.password), env.SESSION_SECRET), id).run();
  }
  if (b.is_admin !== undefined) {
    if (id === me.id && !b.is_admin) return fail("No puedes quitarte el admin a ti mismo");
    await env.DB.prepare("UPDATE members SET is_admin = ? WHERE id = ?").bind(b.is_admin ? 1 : 0, id).run();
  }
  if (b.sort !== undefined) await env.DB.prepare("UPDATE members SET sort = ? WHERE id = ?").bind(parseInt(b.sort) || 0, id).run();
  return adminMembers(env);
}
async function adminDelete(env, me, id) {
  if (id === me.id) return fail("No puedes eliminarte a ti mismo");
  const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
  if (!m) return fail("No encontrado", 404);
  const tracks = (await env.DB.prepare("SELECT audio_key FROM tracks WHERE member_id = ?").bind(id).all()).results;
  for (const t of tracks) await env.MEDIA.delete(t.audio_key).catch(() => {});
  if (m.photo_key) await env.MEDIA.delete(m.photo_key).catch(() => {});
  await env.DB.batch([
    env.DB.prepare("DELETE FROM tracks WHERE member_id = ?").bind(id),
    env.DB.prepare("DELETE FROM dates WHERE member_id = ?").bind(id),
    env.DB.prepare("DELETE FROM drops WHERE member_id = ?").bind(id),
    env.DB.prepare("DELETE FROM members WHERE id = ?").bind(id)
  ]);
  return adminMembers(env);
}
async function adminJoins(env) {
  return json({ items: (await env.DB.prepare("SELECT * FROM join_requests ORDER BY id DESC").all()).results });
}
async function adminDeleteAny(env, table, id) {
  if (table === "tracks") {
    const t = await env.DB.prepare("SELECT audio_key FROM tracks WHERE id = ?").bind(id).first();
    if (t) await env.MEDIA.delete(t.audio_key).catch(() => {});
  }
  await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}

/* ---------- router ---------- */
export async function onRequest({ request, env, params }) {
  const parts = params.path ? [].concat(params.path) : [];
  const path = "/" + parts.join("/");
  const method = request.method;
  const id = parts.length ? parseInt(parts[parts.length - 1]) : NaN;

  try {
    if (!env.DB || !env.MEDIA) return fail("Faltan los bindings DB o MEDIA (revisa wrangler.toml y corre setup.sh)", 500);
    if (!env.SESSION_SECRET) return fail("Falta el secreto SESSION_SECRET (corre setup.sh)", 500);

    // público
    if (method === "GET" && path === "/public") return publicData(env);
    if (method === "GET" && parts[0] === "member" && parts[1]) return memberPage(env, parts[1]);
    if (method === "GET" && parts[0] === "file") return serveFile(env, request, parts.slice(1).join("/"));
    if (method === "POST" && path === "/join") return join(env, request);
    if (method === "GET" && path === "/setup") return setupStatus(env);
    if (method === "POST" && path === "/setup") return setup(env, request);
    if (method === "POST" && path === "/login") return login(env, request);
    if (method === "POST" && path === "/logout") return logout();

    // con sesión
    const me = await currentMember(env, request);
    if (!me) return fail("Inicia sesión para continuar", 401);

    if (path === "/me" && method === "GET") return json({ me: pubMember(me) });
    if (path === "/me" && method === "PUT") return updateMe(env, me, request);
    if (path === "/me/password" && method === "PUT") return changePassword(env, me, request);
    if (path === "/me/photo" && method === "POST") return uploadPhoto(env, me, request);
    if (path === "/me/photo" && method === "DELETE") return deletePhoto(env, me);
    if (path === "/me/dates" && method === "GET") return listOwn(env, "dates", me);
    if (path === "/me/dates" && method === "POST") return addDate(env, me, request);
    if (path === "/me/drops" && method === "GET") return listOwn(env, "drops", me);
    if (path === "/me/drops" && method === "POST") return addDrop(env, me, request);
    if (path === "/me/tracks" && method === "GET") return listTracks(env, me);
    if (path === "/me/tracks" && method === "POST") return addTrack(env, me, request);
    if (method === "DELETE" && parts[0] === "me" && ["dates", "drops", "tracks"].includes(parts[1]) && id) return deleteOwn(env, me, parts[1], id);

    // admin
    if (parts[0] === "admin") {
      if (!me.is_admin) return fail("Solo para administradores", 403);
      if (path === "/admin/members" && method === "GET") return adminMembers(env);
      if (path === "/admin/members" && method === "POST") return adminCreate(env, request);
      if (parts[1] === "members" && id && method === "PUT") return adminUpdate(env, me, request, id);
      if (parts[1] === "members" && id && method === "DELETE") return adminDelete(env, me, id);
      if (path === "/admin/joins" && method === "GET") return adminJoins(env);
      if (parts[1] === "joins" && id && method === "DELETE") return adminDeleteAny(env, "join_requests", id);
      if (["dates", "drops", "tracks"].includes(parts[1]) && id && method === "DELETE") return adminDeleteAny(env, parts[1], id);
    }
    return fail("Ruta no encontrada", 404);
  } catch (e) {
    return fail("Error del servidor: " + (e && e.message ? e.message : String(e)), 500);
  }
}
