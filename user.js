// =========================================================
// user.js — Logika Aplikasi Wali Murid / Siswa
// =========================================================
import {
  requireUserRole,
  getByFieldAsUser as getByField,
  getAllAsUser as getAll,
  addRecordAsUser as addRecord,
  uploadToCloudinary,
  userAuth, doLogout, formatRupiah, formatDate, statusBadgeClass
} from "./db.js?v=3";

let CURRENT_USER = null;
let CURRENT_PROFILE = null;   // profil dari node Users
let CURRENT_PARENT = null;    // profil dari node Parents (kalau role WaliMurid)
let MY_STUDENTS = [];         // anak-anak yang terhubung (atau diri sendiri kalau Siswa)

requireUserRole(["WaliMurid", "Siswa"], async (user, profile) => {
  CURRENT_USER = user;
  CURRENT_PROFILE = profile;

  document.getElementById("loader").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");

  await loadStudentsForCurrentUser();
  initNavigation();
  initProfil();
  initPembayaranForm();
  await renderBeranda();
}, () => {
  window.location.href = "index.html";
});

// ---------------------------------------------------------
// Ambil anak-anak yang terhubung dengan wali ini (atau data diri sendiri kalau Siswa)
// ---------------------------------------------------------
async function loadStudentsForCurrentUser() {
  if (CURRENT_PROFILE.role === "Siswa") {
    const students = await getByField("Students", "uid", CURRENT_USER.uid);
    MY_STUDENTS = students;
  } else {
    const parents = await getByField("Parents", "uid", CURRENT_USER.uid);
    CURRENT_PARENT = parents[0] || null;
    if (CURRENT_PARENT) {
      MY_STUDENTS = await getByField("Students", "parentId", CURRENT_PARENT.id);
    } else {
      MY_STUDENTS = [];
    }
  }
}

// ---------------------------------------------------------
// NAVIGASI
// ---------------------------------------------------------
function initNavigation() {
  const goto = (page) => {
    document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
    document.getElementById(`page-${page}`).classList.remove("hidden");
    document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.page === page));
    window.scrollTo(0, 0);
    if (page === "tagihan") renderTagihan();
    if (page === "riwayat") renderRiwayat();
    if (page === "pengumuman") renderPengumumanFull();
    if (page === "pembayaran") populatePaymentSelects();
  };
  document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => goto(btn.dataset.page)));
  document.querySelectorAll("[data-goto]").forEach(el => el.addEventListener("click", () => goto(el.dataset.goto)));
  window._goto = goto;
}

// ---------------------------------------------------------
// BERANDA
// ---------------------------------------------------------
async function renderBeranda() {
  const displayName = CURRENT_PROFILE.role === "Siswa"
    ? (MY_STUDENTS[0]?.nama || CURRENT_PROFILE.name)
    : (CURRENT_PARENT?.nama || CURRENT_PROFILE.name);
  document.getElementById("greetName").textContent = displayName || "Pengguna";
  document.getElementById("greetClass").textContent = MY_STUDENTS.map(s => s.kelas).filter(Boolean).join(", ") || "-";

  const studentIds = MY_STUDENTS.map(s => s.id);
  const allInvoices = await getAll("Invoices");
  const myInvoices = allInvoices.filter(i => studentIds.includes(i.studentId));

  const belumLunas = myInvoices.filter(i => i.status !== "Lunas");
  const lunas = myInvoices.filter(i => i.status === "Lunas");

  document.getElementById("statTagihanAktif").textContent = myInvoices.length;
  document.getElementById("statTerbayar").textContent = lunas.length;

  const complaints = (await getByField("Complaints", "uid", CURRENT_USER.uid).catch(() => [])) || [];
  document.getElementById("statPengaduan").textContent = complaints.length || 0;

  const banner = document.getElementById("tunggakanBanner");
  if (belumLunas.length) {
    const totalTunggakan = belumLunas.reduce((s, i) => s + (Number(i.sisaTagihan ?? i.nominal) || 0), 0);
    banner.innerHTML = `
      <div class="alert-banner">
        <div class="a-icon">⚠️</div>
        <div class="a-text"><strong>${belumLunas.length} tagihan belum lunas</strong><span>Total ${formatRupiah(totalTunggakan)}</span></div>
        <button class="a-btn" onclick="window._goto('tagihan')">Lihat</button>
      </div>`;
  } else {
    banner.innerHTML = `
      <div class="alert-banner success">
        <div class="a-icon">✅</div>
        <div class="a-text"><strong>Semua tagihan lunas</strong><span>Terima kasih atas pembayarannya</span></div>
      </div>`;
  }

  const announcements = (await getAll("Announcements")).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0, 2);
  document.getElementById("pengumumanPreview").innerHTML = announcements.length ? announcements.map(a => `
    <div class="card">
      <div class="card-title">📣 ${a.judul}</div>
      <div class="card-sub">${formatDate(a.tanggalMulai)} – ${formatDate(a.tanggalSelesai)}</div>
    </div>`).join("") : `<div class="empty-state"><div class="e-icon">📭</div>Belum ada pengumuman</div>`;
}

// ---------------------------------------------------------
// TAGIHAN
// ---------------------------------------------------------
let currentFilter = "semua";
async function renderTagihan() {
  const studentIds = MY_STUDENTS.map(s => s.id);
  const allInvoices = await getAll("Invoices");
  let myInvoices = allInvoices.filter(i => studentIds.includes(i.studentId));
  if (currentFilter !== "semua") myInvoices = myInvoices.filter(i => (currentFilter === "Belum Dibayar" ? i.status !== "Lunas" : i.status === "Lunas"));

  const list = document.getElementById("tagihanList");
  list.innerHTML = myInvoices.length ? myInvoices.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).map(i => `
    <div class="card">
      <div class="card-row">
        <div>
          <div class="card-title">${i.jenisTagihan}</div>
          <div class="card-sub">${i.namaSiswa} • Jatuh tempo ${formatDate(i.jatuhTempo)}</div>
        </div>
        <span class="badge ${statusBadgeClass(i.status)}">${i.status}</span>
      </div>
      <div class="card-row" style="margin-top:10px;">
        <div class="card-sub">Nominal</div>
        <strong>${formatRupiah(i.nominal)}</strong>
      </div>
    </div>`).join("") : `<div class="empty-state"><div class="e-icon">🧾</div>Tidak ada tagihan pada kategori ini</div>`;

  document.querySelectorAll("#tagihanTabs .tab-chip").forEach(chip => {
    chip.onclick = () => {
      currentFilter = chip.dataset.filter;
      document.querySelectorAll("#tagihanTabs .tab-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      renderTagihan();
    };
  });
}

// ---------------------------------------------------------
// PEMBAYARAN — form konfirmasi
// ---------------------------------------------------------
async function populatePaymentSelects() {
  const anakSelect = document.getElementById("pay_anak");
  anakSelect.innerHTML = MY_STUDENTS.map(s => `<option value="${s.id}">${s.nama}</option>`).join("") || `<option value="">Tidak ada data anak</option>`;

  const studentIds = MY_STUDENTS.map(s => s.id);
  const allInvoices = await getAll("Invoices");
  const unpaid = allInvoices.filter(i => studentIds.includes(i.studentId) && i.status !== "Lunas");

  const tagihanSelect = document.getElementById("pay_tagihan");
  tagihanSelect.innerHTML = unpaid.length
    ? unpaid.map(i => `<option value="${i.id}" data-nominal="${i.nominal}" data-nama="${i.jenisTagihan}">${i.namaSiswa} — ${i.jenisTagihan} (${formatRupiah(i.nominal)})</option>`).join("")
    : `<option value="">Tidak ada tagihan tertunggak</option>`;

  tagihanSelect.onchange = () => {
    const opt = tagihanSelect.selectedOptions[0];
    document.getElementById("pay_nominal").value = opt?.dataset.nominal || "";
  };
  tagihanSelect.onchange();
}

function initPembayaranForm() {
  document.getElementById("btnSubmitPay").addEventListener("click", async () => {
    const btn = document.getElementById("btnSubmitPay");
    const invoiceId = document.getElementById("pay_tagihan").value;
    const studentId = document.getElementById("pay_anak").value;
    const nominal = Number(document.getElementById("pay_nominal").value);
    const metode = document.getElementById("pay_metode").value;
    const tanggal = document.getElementById("pay_tanggal").value;
    const file = document.getElementById("pay_bukti").files[0];
    const catatan = document.getElementById("pay_catatan").value.trim();

    if (!invoiceId) return alert("Pilih tagihan yang ingin dibayar.");
    if (!nominal) return alert("Nominal wajib diisi.");
    if (!file) return alert("Bukti transfer wajib diupload.");

    const student = MY_STUDENTS.find(s => s.id === studentId);
    const invoice = document.getElementById("pay_tagihan").selectedOptions[0];

    btn.disabled = true;
    btn.textContent = "Mengunggah bukti...";
    try {
      const buktiUrl = await uploadToCloudinary(file, "bukti-pembayaran");
      btn.textContent = "Menyimpan...";
      await addRecord("Payments", {
        uid: CURRENT_USER.uid,
        studentId, namaSiswa: student?.nama || "-",
        invoiceId, jenisTagihan: invoice?.dataset.nama || "-",
        nominal, metode,
        tanggalTransfer: tanggal ? new Date(tanggal).getTime() : Date.now(),
        buktiUrl, catatan,
        status: "Menunggu Verifikasi"
      });
      alert("Konfirmasi pembayaran terkirim. Menunggu verifikasi Admin/Bendahara.");
      document.getElementById("pay_bukti").value = "";
      document.getElementById("pay_catatan").value = "";
      window._goto("riwayat");
    } catch (err) {
      alert("Gagal mengirim: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Kirim Konfirmasi";
    }
  });
}

// ---------------------------------------------------------
// RIWAYAT PEMBAYARAN
// ---------------------------------------------------------
async function renderRiwayat() {
  const payments = await getByField("Payments", "uid", CURRENT_USER.uid);
  const list = document.getElementById("riwayatList");
  list.innerHTML = payments.length ? payments.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).map(p => `
    <div class="card">
      <div class="card-row">
        <div>
          <div class="card-title">${p.jenisTagihan}</div>
          <div class="card-sub">${p.namaSiswa} • ${formatDate(p.createdAt)} • ${p.metode}</div>
        </div>
        <span class="badge ${statusBadgeClass(p.status)}">${p.status}</span>
      </div>
      <div class="card-row" style="margin-top:10px;">
        <strong>${formatRupiah(p.nominal)}</strong>
        ${p.buktiUrl ? `<a href="${p.buktiUrl}" target="_blank" class="muted">Lihat bukti</a>` : ""}
      </div>
      ${p.status === "Ditolak" && p.alasanTolak ? `<div class="card-sub" style="color:var(--danger); margin-top:6px;">Alasan ditolak: ${p.alasanTolak}</div>` : ""}
    </div>`).join("") : `<div class="empty-state"><div class="e-icon">⏱️</div>Belum ada riwayat pembayaran</div>`;
}

// ---------------------------------------------------------
// PENGUMUMAN (halaman penuh)
// ---------------------------------------------------------
async function renderPengumumanFull() {
  const announcements = (await getAll("Announcements")).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  document.getElementById("pengumumanList").innerHTML = announcements.length ? announcements.map(a => `
    <div class="card">
      <div class="card-title">📣 ${a.judul}</div>
      <div class="card-sub">${formatDate(a.tanggalMulai)} – ${formatDate(a.tanggalSelesai)}</div>
      <p style="font-size:13px; margin-top:8px;">${a.isi || ""}</p>
    </div>`).join("") : `<div class="empty-state"><div class="e-icon">📭</div>Belum ada pengumuman</div>`;
}

// ---------------------------------------------------------
// PROFIL
// ---------------------------------------------------------
function initProfil() {
  document.getElementById("profilNama").textContent = CURRENT_PARENT?.nama || CURRENT_PROFILE.name || "-";
  document.getElementById("profilEmail").textContent = CURRENT_PROFILE.email || "-";
  document.getElementById("profilHp").textContent = CURRENT_PARENT?.noHp || CURRENT_PROFILE.phone || "-";

  document.getElementById("profilAnakList").innerHTML = MY_STUDENTS.length ? MY_STUDENTS.map(s => `
    <div class="card">
      <div class="card-title">${s.nama}</div>
      <div class="card-sub">Kelas ${s.kelas || "-"} • NIS ${s.nis || "-"}</div>
    </div>`).join("") : `<div class="empty-state"><div class="e-icon">🎓</div>Belum ada data anak terhubung</div>`;

  document.getElementById("btnLogout").addEventListener("click", () => {
    if (confirm("Keluar dari aplikasi?")) doLogout(userAuth);
  });
}
