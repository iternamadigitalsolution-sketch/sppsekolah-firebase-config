// =========================================================
// FIREBASE CONFIG
// Ganti seluruh nilai di bawah ini dengan punya project Firebase-mu sendiri.
// Cara ambil nilainya ada di README.md bagian "Setup Firebase".
// File ini AMAN ditaruh di repository PUBLIC (API Key Firebase bukan rahasia),
// sesuai konsep: hanya firebase-config.js dan db.js yang boleh public.
// =========================================================

export const firebaseConfig = {
  apiKey: "AIzaSyCVN-8yAE6SODNX2BsQsDGvJrssVVD8bOE",
  authDomain: "keuangan-sekolah-90219.firebaseapp.com",
  databaseURL: "https://keuangan-sekolah-90219-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "keuangan-sekolah-90219",
  storageBucket: "keuangan-sekolah-90219.firebasestorage.app",
  messagingSenderId: "124792871111",
  appId: "1:124792871111:web:03ea242fb48a367aa7c6e2"
};

// Cloudinary — untuk upload bukti pembayaran & foto.
// unsignedUploadPreset dibuat di Cloudinary Dashboard > Settings > Upload > Add upload preset (Unsigned).
export const cloudinaryConfig = {
  cloudName: "udsougfj",
  uploadPreset: "foto_ktp_preset"
};

// Nama project, dipakai untuk judul di halaman & notifikasi
export const APP_NAME = "Sistem Keuangan Sekolah";
