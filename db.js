// =========================================================
// db.js — Modul generik Firebase + Cloudinary
// Dipakai bersama oleh index.html (login), dashboard.html (admin/bendahara)
// dan user.html (wali murid/siswa).
//
// Menggunakan Firebase v10 modular SDK langsung dari CDN (ES Module),
// TANPA build step, TANPA framework — sesuai konsep.
//
// PENTING: Realtime Database mengecek Security Rules berdasarkan status
// login App instance yang SAMA dengan koneksi database yang dipakai.
// Karena itu setiap App (defaultApp/secondaryApp/userApp) punya koneksi
// database sendiri-sendiri (db / userDb), supaya rule "auth != null"
// terbaca benar sesuai siapa yang sedang login di app tsb.
// =========================================================

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, get, set, push, update, remove, query, orderByChild, equalTo
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import { firebaseConfig, cloudinaryConfig } from "./firebase-config.js";

// ---------------------------------------------------------
// Tiga instance Firebase App sesuai konsep:
// 1. defaultApp   -> sesi Admin / Bendahara yang sedang login
// 2. secondaryApp -> dipakai KHUSUS untuk membuat akun user baru
//                    tanpa membuat admin ikut ter-logout
// 3. userApp      -> sesi terpisah untuk Wali Murid / Siswa (user.html)
// ---------------------------------------------------------
export const defaultApp   = getApps().find(a => a.name === "[DEFAULT]") || initializeApp(firebaseConfig);
export const secondaryApp = getApps().find(a => a.name === "Secondary") || initializeApp(firebaseConfig, "Secondary");
export const userApp      = getApps().find(a => a.name === "UserApp")   || initializeApp(firebaseConfig, "UserApp");

export const auth          = getAuth(defaultApp);
export const secondaryAuth = getAuth(secondaryApp);
export const userAuth      = getAuth(userApp);

// Koneksi database TERPISAH per App — ini kunci perbaikan bug "Permission denied"
export const db     = getDatabase(defaultApp); // dipakai oleh dashboard.html (Admin/Bendahara)
export const userDb = getDatabase(userApp);    // dipakai oleh user.html (Wali Murid/Siswa)
export const secondaryDb = getDatabase(secondaryApp); // dipakai untuk cek role sesaat di index.html, TANPA mengganggu koneksi "db" milik Admin

// =========================================================
// AUTH HELPERS
// =========================================================

export function doLogin(email, password, authInstance = auth) {
  return signInWithEmailAndPassword(authInstance, email, password);
}

export function doLogout(authInstance = auth, redirect = "index.html") {
  return signOut(authInstance).then(() => {
    localStorage.removeItem("sk_role");
    localStorage.removeItem("sk_uid");
    window.location.href = redirect;
  });
}

/** Ambil seluruh profil user dari Users/{uid} (pakai koneksi db Admin) */
export async function getUserProfile(uid) {
  const snap = await get(ref(db, `Users/${uid}`));
  return snap.exists() ? { id: uid, ...snap.val() } : null;
}

/** Sama seperti getUserProfile tapi lewat koneksi userDb (dipakai di user.html) */
export async function getUserProfileAsUser(uid) {
  const snap = await get(ref(userDb, `Users/${uid}`));
  return snap.exists() ? { id: uid, ...snap.val() } : null;
}

/**
 * Jaga halaman admin/bendahara. Panggil di dashboard.html.
 * roles: array, contoh ["Admin","Bendahara"]
 */
export function requireRole(roles, onReady, onDenied) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      if (onDenied) return onDenied("not-logged-in");
      window.location.href = "index.html";
      return;
    }
    const profile = await getUserProfile(user.uid);
    if (!profile || !roles.includes(profile.role)) {
      if (onDenied) return onDenied("wrong-role");
      window.location.href = "index.html";
      return;
    }
    if (profile.status === "nonaktif") {
      if (onDenied) return onDenied("inactive");
      window.location.href = "index.html";
      return;
    }
    onReady(user, profile);
  });
}
export function requireAdmin(onReady, onDenied) {
  return requireRole(["Admin"], onReady, onDenied);
}

/** Sama seperti requireRole tapi untuk sesi user.html (Wali Murid / Siswa) — pakai userAuth + userDb */
export function requireUserRole(roles, onReady, onDenied) {
  return onAuthStateChanged(userAuth, async (user) => {
    if (!user) {
      if (onDenied) return onDenied("not-logged-in");
      window.location.href = "index.html";
      return;
    }
    const profile = await getUserProfileAsUser(user.uid);
    if (!profile || !roles.includes(profile.role)) {
      if (onDenied) return onDenied("wrong-role");
      window.location.href = "index.html";
      return;
    }
    if (profile.status === "nonaktif") {
      if (onDenied) return onDenied("inactive");
      window.location.href = "index.html";
      return;
    }
    onReady(user, profile);
  });
}

/**
 * Buat akun user baru (dipakai Admin untuk membuat akun Wali Murid / Siswa / Bendahara)
 * TANPA membuat Admin ikut ter-logout, karena pakai secondaryAuth.
 */
export async function createUserAccount({ email, password, name, role, phone = "", extra = {} }) {
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  const uid = cred.user.uid;
  await set(ref(db, `Users/${uid}`), {
    uid, name, email, phone, role,
    status: "aktif",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...extra
  });
  await signOut(secondaryAuth); // bersihkan sesi secondary, admin tetap login
  return uid;
}

// =========================================================
// GENERIC CRUD — "pabrik fungsi" supaya bisa dipakai lewat koneksi
// db Admin maupun userDb Wali/Siswa, tanpa duplikasi kode.
// =========================================================
function makeCrud(databaseInstance) {
  async function getAll(path) {
    const snap = await get(ref(databaseInstance, path));
    if (!snap.exists()) return [];
    const val = snap.val();
    return Object.keys(val).map(id => ({ id, ...val[id] }));
  }
  async function getOne(path, id) {
    const snap = await get(ref(databaseInstance, `${path}/${id}`));
    return snap.exists() ? { id, ...snap.val() } : null;
  }
  async function addRecord(path, data) {
    const newRef = push(ref(databaseInstance, path));
    const payload = { ...data, createdAt: Date.now(), updatedAt: Date.now() };
    await set(newRef, payload);
    return { id: newRef.key, ...payload };
  }
  async function updateRecord(path, id, data) {
    await update(ref(databaseInstance, `${path}/${id}`), { ...data, updatedAt: Date.now() });
    return getOne(path, id);
  }
  function deleteRecord(path, id) {
    return remove(ref(databaseInstance, `${path}/${id}`));
  }
  async function getByField(path, field, value) {
    const q = query(ref(databaseInstance, path), orderByChild(field), equalTo(value));
    const snap = await get(q);
    if (!snap.exists()) return [];
    const val = snap.val();
    return Object.keys(val).map(id => ({ id, ...val[id] }));
  }
  return { getAll, getOne, addRecord, updateRecord, deleteRecord, getByField };
}

// Dipakai oleh dashboard.html / admin.js (koneksi Admin)
const adminCrud = makeCrud(db);
export const getAll        = adminCrud.getAll;
export const getOne        = adminCrud.getOne;
export const addRecord     = adminCrud.addRecord;
export const updateRecord  = adminCrud.updateRecord;
export const deleteRecord  = adminCrud.deleteRecord;
export const getByField    = adminCrud.getByField;

// Dipakai oleh user.html / user.js (koneksi Wali Murid/Siswa) — WAJIB pakai versi ini di user.js
const userCrud = makeCrud(userDb);
export const getAllAsUser       = userCrud.getAll;
export const getOneAsUser       = userCrud.getOne;
export const addRecordAsUser    = userCrud.addRecord;
export const updateRecordAsUser = userCrud.updateRecord;
export const deleteRecordAsUser = userCrud.deleteRecord;
export const getByFieldAsUser   = userCrud.getByField;

// =========================================================
// CLOUDINARY UPLOAD
// =========================================================
export async function uploadToCloudinary(file, folder = "umum") {
  const url = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/auto/upload`;
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", cloudinaryConfig.uploadPreset);
  form.append("folder", folder);

  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) throw new Error("Upload ke Cloudinary gagal. Cek cloudName / uploadPreset.");
  const data = await res.json();
  return data.secure_url;
}

// =========================================================
// ACTIVITY LOG
// =========================================================
export async function logActivity(uid, action, detail = "") {
  return addRecord("ActivityLogs", { uid, action, detail, time: Date.now() });
}

// =========================================================
// LOGIN PAKAI NO. HP — Firebase Auth (Email/Password) butuh format email,
// jadi No. HP diubah dulu jadi "email sintetis" secara konsisten di sini.
// Dipakai bersama oleh index.html (saat login) dan admin.js (saat membuat akun Wali Murid).
// =========================================================

/** Apakah teks ini kelihatan seperti No. HP (bukan email)? */
export function looksLikePhoneNumber(input) {
  const trimmed = input.trim();
  if (trimmed.includes("@")) return false; // sudah berbentuk email
  const digits = trimmed.replace(/[^0-9]/g, "");
  return /^[0-9+()\s-]+$/.test(trimmed) && digits.length >= 8 && digits.length <= 15;
}

/** Ubah No. HP jadi email sintetis yang konsisten, contoh: 081234567890 -> 6281234567890@wali.sekolah.local */
export function phoneToSyntheticEmail(phone) {
  let digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  else if (!digits.startsWith("62")) digits = "62" + digits;
  return `${digits}@wali.sekolah.local`;
}

// =========================================================
// FORMAT HELPERS
// =========================================================
export function formatRupiah(num) {
  const n = Number(num) || 0;
  return "Rp " + n.toLocaleString("id-ID");
}

export function formatDate(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export function statusBadgeClass(status) {
  const map = {
    "Lunas": "lunas",
    "Belum Dibayar": "belum",
    "Menunggu Verifikasi": "menunggu",
    "Sebagian Dibayar": "sebagian",
    "Ditolak": "belum",
    "Dibatalkan": "belum",
    "Terlambat": "belum"
  };
  return map[status] || "belum";
}
