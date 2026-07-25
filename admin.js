// =========================================================
// admin.js — Logika Dashboard Admin / Bendahara
// =========================================================
import {
  requireAdmin, requireRole, doLogout, getAll, getOne, addRecord, updateRecord,
  deleteRecord, uploadToCloudinary, createUserAccount, logActivity,
  formatRupiah, formatDate, statusBadgeClass
} from "./db.js?v=3";

let CURRENT_USER = null;
let CURRENT_PROFILE = null;

// ---------------------------------------------------------
// GUARD: hanya Admin & Bendahara boleh masuk halaman ini
// ---------------------------------------------------------
requireRole(["Admin", "Bendahara"], async (user, profile) => {
  CURRENT_USER = user;
  CURRENT_PROFILE = profile;
  document.getElementById("loader").classList.add("hidden");
  document.getElementById("adminShell").classList.remove("hidden");
  document.getElementById("avatarInitial").textContent = (profile.name || "A").charAt(0).toUpperCase();

  // Bendahara tidak melihat menu Pengaturan / Manajemen Bendahara sesuai hak akses
  if (profile.role === "Bendahara") {
    document.querySelector('[data-section="pengaturan"]').style.display = "none";
  }

  initSidebar();
  initLogout();
  initModal();
  await loadRingkasan();
}, (reason) => {
  document.getElementById("loader").querySelector(".muted").textContent =
    reason === "wrong-role" ? "Akun ini tidak punya akses ke dashboard admin." : "Silakan login kembali...";
  setTimeout(() => window.location.href = "index.html", 1200);
});

// ---------------------------------------------------------
// SIDEBAR NAVIGATION
// ---------------------------------------------------------
const SECTION_TITLES = {
  ringkasan: "Ringkasan", kelas: "Data Kelas", siswa: "Data Siswa", wali: "Data Wali Murid",
  kategoritagihan: "Kategori Tagihan", jenistagihan: "Master Jenis Tagihan",
  aturantagihan: "Aturan Tagihan per Kelas", tagihan: "Tagihan / Invoice",
  pembayaran: "Verifikasi Pembayaran", kasmasuk: "Kas Masuk", kaskeluar: "Kas Keluar",
  laporan: "Laporan", pengumuman: "Pengumuman", pengaturan: "Pengaturan"
};
const SECTION_LOADERS = {
  kelas: loadKelas, siswa: loadSiswa, wali: loadWali,
  kategoritagihan: loadKategoriTagihan, jenistagihan: loadJenisTagihan,
  aturantagihan: loadAturanTagihan, tagihan: loadTagihan, pembayaran: loadPembayaran,
  kasmasuk: loadKasMasuk, kaskeluar: loadKasKeluar, pengumuman: loadPengumuman, pengaturan: loadPengaturan
};

function initSidebar() {
  document.querySelectorAll(".sidebar-link").forEach(link => {
    link.addEventListener("click", () => {
      const sec = link.dataset.section;
      document.querySelectorAll(".sidebar-link").forEach(l => l.classList.remove("active"));
      link.classList.add("active");
      document.querySelectorAll(".sec").forEach(s => s.classList.add("hidden"));
      document.getElementById(`sec-${sec}`).classList.remove("hidden");
      document.getElementById("sectionTitle").textContent = SECTION_TITLES[sec];
      document.getElementById("sidebar").classList.remove("open");
      if (SECTION_LOADERS[sec]) SECTION_LOADERS[sec]();
    });
  });
  document.getElementById("menuToggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });
}

function initLogout() {
  document.getElementById("logoutBtn").addEventListener("click", () => {
    if (confirm("Keluar dari dashboard?")) doLogout();
  });
}

// ---------------------------------------------------------
// TOAST
// ---------------------------------------------------------
function toast(msg, type = "ok") {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

// ---------------------------------------------------------
// MODAL GENERIK
// ---------------------------------------------------------
function initModal() {
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") closeModal();
  });
}
function openModal(html) {
  document.getElementById("modalSheet").innerHTML = html;
  document.getElementById("modalOverlay").classList.remove("hidden");
}
function closeModal() {
  document.getElementById("modalOverlay").classList.add("hidden");
}
window.closeModal = closeModal; // dipakai tombol batal di form inline

// =========================================================
// RINGKASAN
// =========================================================
async function loadRingkasan() {
  const [students, parents, invoices, payments, income, expense] = await Promise.all([
    getAll("Students"), getAll("Parents"), getAll("Invoices"),
    getAll("Payments"), getAll("Income"), getAll("Expenses")
  ]);

  document.getElementById("statSiswa").textContent = students.length;
  document.getElementById("statWali").textContent = parents.length;

  const totalTagihan = invoices.reduce((s, i) => s + (Number(i.nominal) || 0), 0);
  const totalTunggakan = invoices
    .filter(i => i.status !== "Lunas")
    .reduce((s, i) => s + (Number(i.sisaTagihan ?? i.nominal) || 0), 0);
  document.getElementById("statTagihan").textContent = formatRupiah(totalTagihan);
  document.getElementById("statTunggakan").textContent = formatRupiah(totalTunggakan);

  const now = new Date();
  const isThisMonth = (ts) => { const d = new Date(ts); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); };
  const kasMasukBulanIni = income.filter(i => isThisMonth(i.tanggal || i.createdAt)).reduce((s, i) => s + (Number(i.nominal) || 0), 0);
  const kasKeluarBulanIni = expense.filter(i => isThisMonth(i.tanggal || i.createdAt)).reduce((s, i) => s + (Number(i.nominal) || 0), 0);
  const totalMasuk = income.reduce((s, i) => s + (Number(i.nominal) || 0), 0);
  const totalKeluar = expense.reduce((s, i) => s + (Number(i.nominal) || 0), 0);

  document.getElementById("statKasMasuk").textContent = formatRupiah(kasMasukBulanIni);
  document.getElementById("statKasKeluar").textContent = formatRupiah(kasKeluarBulanIni);
  document.getElementById("statSaldo").textContent = formatRupiah(totalMasuk - totalKeluar);
  document.getElementById("statMenunggu").textContent = payments.filter(p => p.status === "Menunggu Verifikasi").length;

  const body = document.getElementById("recentPaymentsBody");
  const recent = payments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 8);
  body.innerHTML = recent.length ? recent.map(p => `
    <tr>
      <td>${p.namaSiswa || "-"}</td>
      <td>${p.jenisTagihan || "-"}</td>
      <td>${formatRupiah(p.nominal)}</td>
      <td>${formatDate(p.createdAt)}</td>
      <td><span class="badge ${statusBadgeClass(p.status)}">${p.status || "-"}</span></td>
    </tr>`).join("") : `<tr><td colspan="5" class="muted">Belum ada data.</td></tr>`;
}

// =========================================================
// DATA KELAS
// =========================================================
async function loadKelas() {
  const [classes, students] = await Promise.all([getAll("Classes"), getAll("Students")]);
  const body = document.getElementById("kelasBody");
  body.innerHTML = classes.length ? classes.sort((a,b)=>(a.nama||"").localeCompare(b.nama||"")).map(k => {
    const jumlah = students.filter(s => s.kelas === k.nama).length;
    return `
    <tr>
      <td>${k.nama}</td>
      <td>${k.tingkat || "-"}</td>
      <td>${k.tahunAjaran || "-"}</td>
      <td>${jumlah}</td>
      <td class="row-actions">
        <button onclick="window.editKelas('${k.id}')" title="Edit">✏️</button>
        <button class="danger" onclick="window.deleteKelas('${k.id}')" title="Hapus">🗑️</button>
      </td>
    </tr>`;
  }).join("") : `<tr><td colspan="5" class="muted">Belum ada data kelas. Tambahkan dulu supaya bisa dipilih saat input Data Siswa.</td></tr>`;

  document.getElementById("btnAddKelas").onclick = () => kelasForm();
  window.editKelas = async (id) => kelasForm(await getOne("Classes", id));
  window.deleteKelas = async (id) => {
    if (confirm("Hapus kelas ini? (Data siswa yang sudah memakai nama kelas ini tidak akan otomatis berubah)")) {
      await deleteRecord("Classes", id); toast("Kelas dihapus"); loadKelas();
    }
  };
}

function kelasForm(data = {}) {
  openModal(`
    <h3>${data.id ? "Edit" : "Tambah"} Kelas</h3>
    <div class="field"><label>Nama Kelas</label><input class="select" id="f_nama" value="${data.nama || ""}" placeholder="Contoh: 1A, 2A, VII-1"></div>
    <div class="field"><label>Tingkat</label><input class="select" id="f_tingkat" value="${data.tingkat || ""}" placeholder="Contoh: 1, 2, VII"></div>
    <div class="field"><label>Tahun Ajaran</label><input class="select" id="f_tahun" value="${data.tahunAjaran || ""}" placeholder="Contoh: 2026/2027"></div>
    <div style="display:flex; gap:10px; margin-top:16px;">
      <button class="btn-outline" onclick="closeModal()" style="flex:1;">Batal</button>
      <button class="btn-primary" id="saveKelasBtn" style="flex:1;">Simpan</button>
    </div>
  `);
  document.getElementById("saveKelasBtn").onclick = async () => {
    const payload = {
      nama: document.getElementById("f_nama").value.trim(),
      tingkat: document.getElementById("f_tingkat").value.trim(),
      tahunAjaran: document.getElementById("f_tahun").value.trim()
    };
    if (!payload.nama) return toast("Nama kelas wajib diisi", "err");
    if (data.id) await updateRecord("Classes", data.id, payload); else await addRecord("Classes", payload);
    toast("Data kelas disimpan"); closeModal(); loadKelas();
  };
}

// =========================================================
// DATA SISWA
// =========================================================
async function loadSiswa() {
  const [students, parents] = await Promise.all([getAll("Students"), getAll("Parents")]);
  const parentMap = Object.fromEntries(parents.map(p => [p.id, p.nama || p.name]));
  const body = document.getElementById("siswaBody");
  body.innerHTML = students.length ? students.map(s => `
    <tr>
      <td>${s.nama}</td>
      <td>${s.nis || "-"}</td>
      <td>${s.kelas || "-"}</td>
      <td>${parentMap[s.parentId] || "-"}</td>
      <td><span class="badge ${s.status === "aktif" ? "lunas" : "belum"}">${s.status || "aktif"}</span></td>
      <td class="row-actions">
        <button onclick="window.editSiswa('${s.id}')" title="Edit">✏️</button>
        <button onclick="window.buatAkunSiswa('${s.id}')" title="Buat Akun Login">🔑</button>
        <button class="danger" onclick="window.deleteSiswa('${s.id}')" title="Hapus">🗑️</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="6" class="muted">Belum ada data siswa.</td></tr>`;

  document.getElementById("btnAddSiswa").onclick = () => siswaForm();
  window.editSiswa = async (id) => siswaForm(await getOne("Students", id));
  window.deleteSiswa = async (id) => {
    if (confirm("Hapus data siswa ini?")) { await deleteRecord("Students", id); toast("Siswa dihapus"); loadSiswa(); }
  };
  window.buatAkunSiswa = async (id) => {
    const s = await getOne("Students", id);
    if (s.uid) return toast("Siswa ini sudah punya akun login", "err");
    akunSiswaForm(s);
  };
}

async function siswaForm(data = {}) {
  const [classes, parents] = await Promise.all([getAll("Classes"), getAll("Parents")]);
  openModal(`
    <h3>${data.id ? "Edit" : "Tambah"} Siswa</h3>
    <div class="field"><label>Nama Lengkap</label><input class="select" id="f_nama" value="${data.nama || ""}"></div>
    <div class="field"><label>NIS</label><input class="select" id="f_nis" value="${data.nis || ""}"></div>
    <div class="field"><label>NISN</label><input class="select" id="f_nisn" value="${data.nisn || ""}"></div>
    <div class="field"><label>Kelas</label>
      <select class="select" id="f_kelas">
        <option value="">— Pilih Kelas —</option>
        ${classes.map(k => `<option value="${k.nama}" ${data.kelas === k.nama ? "selected" : ""}>${k.nama}</option>`).join("")}
      </select>
      ${!classes.length ? `<div class="card-sub" style="margin-top:6px; color:var(--warning);">Belum ada Data Kelas. Tambahkan dulu di menu "Data Kelas".</div>` : ""}
    </div>
    <div class="field"><label>Wali Murid</label>
      <select class="select" id="f_wali">
        <option value="">— Belum ada wali terhubung —</option>
        ${parents.map(p => `<option value="${p.id}" ${data.parentId === p.id ? "selected" : ""}>${p.nama}</option>`).join("")}
      </select>
    </div>
    <div class="field"><label>Jenis Kelamin</label>
      <select class="select" id="f_jk">
        <option ${data.jenisKelamin === "L" ? "selected" : ""} value="L">Laki-laki</option>
        <option ${data.jenisKelamin === "P" ? "selected" : ""} value="P">Perempuan</option>
      </select>
    </div>
    <div class="field"><label>Status</label>
      <select class="select" id="f_status">
        <option value="aktif" ${data.status === "aktif" ? "selected" : ""}>Aktif</option>
        <option value="nonaktif" ${data.status === "nonaktif" ? "selected" : ""}>Nonaktif</option>
      </select>
    </div>
    <div style="display:flex; gap:10px; margin-top:16px;">
      <button class="btn-outline" onclick="closeModal()" style="flex:1;">Batal</button>
      <button class="btn-primary" id="saveSiswaBtn" style="flex:1;">Simpan</button>
    </div>
  `);
  document.getElementById("saveSiswaBtn").onclick = async () => {
    const payload = {
      nama: document.getElementById("f_nama").value.trim(),
      nis: document.getElementById("f_nis").value.trim(),
      nisn: document.getElementById("f_nisn").value.trim(),
      kelas: document.getElementById("f_kelas").value,
      parentId: document.getElementById("f_wali").value || null,
      jenisKelamin: document.getElementById("f_jk").value,
      status: document.getElementById("f_status").value
    };
    if (!payload.nama) return toast("Nama wajib diisi", "err");
    if (data.id) await updateRecord("Students", data.id, payload);
    else await addRecord("Students", payload);
    await logActivity(CURRENT_USER.uid, data.id ? "update_siswa" : "tambah_siswa", payload.nama);
    toast("Data siswa disimpan");
    closeModal();
    loadSiswa();
  };
}

// Buat akun login untuk Siswa (username = email bebas yang dibuatkan admin, bukan NIS)
function akunSiswaForm(student) {
  openModal(`
    <h3>Buat Akun Login — ${student.nama}</h3>
    <p class="muted" style="margin-top:-6px;">Akun ini nanti dipakai siswa untuk login di halaman yang sama (index.html), lalu otomatis masuk ke aplikasi (user.html) dengan akses khusus data dirinya sendiri.</p>
    <div class="field"><label>Email Login</label><input class="select" id="s_email" placeholder="contoh: nis012345678@sekolahku.sch.id"></div>
    <div class="field"><label>Password Awal</label><input class="select" id="s_pass" placeholder="Minimal 6 karakter"></div>
    <div style="display:flex; gap:10px; margin-top:16px;">
      <button class="btn-outline" onclick="closeModal()" style="flex:1;">Batal</button>
      <button class="btn-primary" id="saveAkunSiswaBtn" style="flex:1;">Buat Akun</button>
    </div>
  `);
  document.getElementById("saveAkunSiswaBtn").onclick = async () => {
    const email = document.getElementById("s_email").value.trim();
    const pass = document.getElementById("s_pass").value;
    if (!email || pass.length < 6) return toast("Lengkapi email & password (min. 6 karakter)", "err");
    try {
      const uid = await createUserAccount({ email, password: pass, name: student.nama, role: "Siswa", extra: { studentId: student.id } });
      await updateRecord("Students", student.id, { uid });
      toast(`Akun dibuat. Beri tahu siswa: email "${email}"`);
      closeModal();
      loadSiswa();
    } catch (err) {
      toast(err.message.includes("email-already") ? "Email sudah dipakai" : "Gagal: " + err.message, "err");
    }
  };
}

// =========================================================
// DATA WALI MURID
// =========================================================
async function loadWali() {
  const [parents, students] = await Promise.all([getAll("Parents"), getAll("Students")]);
  const body = document.getElementById("waliBody");
  body.innerHTML = parents.length ? parents.map(p => {
    const jumlahAnak = students.filter(s => s.parentId === p.id).length;
    return `
    <tr>
      <td>${p.nama}</td>
      <td>${p.noHp || "-"}</td>
      <td>${p.email || "-"}</td>
      <td>${jumlahAnak}</td>
      <td class="row-actions">
        <button onclick="window.editWali('${p.id}')">✏️</button>
        <button class="danger" onclick="window.deleteWali('${p.id}')">🗑️</button>
      </td>
    </tr>`;
  }).join("") : `<tr><td colspan="5" class="muted">Belum ada data wali murid.</td></tr>`;

  document.getElementById("btnAddWali").onclick = () => waliForm();
  window.editWali = async (id) => waliForm(await getOne("Parents", id));
  window.deleteWali = async (id) => {
    if (confirm("Hapus data wali murid ini?")) { await deleteRecord("Parents", id); toast("Wali murid dihapus"); loadWali(); }
  };
}

async function waliForm(data = {}) {
  const allStudents = await getAll("Students");
  // Siswa yang belum punya wali, ATAU siswa yang sudah terhubung ke wali INI (waktu edit)
  const selectableStudents = allStudents.filter(s => !s.parentId || s.parentId === data.id);

  openModal(`
    <h3>${data.id ? "Edit" : "Tambah"} Wali Murid</h3>
    <div class="field"><label>Nama</label><input class="select" id="f_nama" value="${data.nama || ""}"></div>
    <div class="field"><label>No. HP</label><input class="select" id="f_hp" value="${data.noHp || ""}"></div>
    <div class="field"><label>Email (dipakai untuk akun login)</label><input class="select" id="f_email" value="${data.email || ""}" ${data.id ? "readonly" : ""}></div>
    ${!data.id ? `<div class="field"><label>Password Awal</label><input class="select" id="f_pass" type="text" placeholder="Minimal 6 karakter"></div>` : ""}
    <div class="field"><label>Alamat</label><textarea id="f_alamat" rows="2">${data.alamat || ""}</textarea></div>
    <div class="field">
      <label>Anak yang Terhubung</label>
      <div style="max-height:160px; overflow-y:auto; border:1.5px solid var(--border); border-radius:10px; padding:10px;">
        ${selectableStudents.length ? selectableStudents.map(s => `
          <label style="display:flex; align-items:center; gap:8px; padding:6px 2px; font-size:13.5px;">
            <input type="checkbox" class="f_anak_chk" value="${s.id}" ${s.parentId === data.id ? "checked" : ""}>
            ${s.nama} ${s.kelas ? `(${s.kelas})` : ""}
          </label>`).join("") : `<div class="muted">Belum ada siswa yang bisa dihubungkan. Tambahkan Data Siswa dulu.</div>`}
      </div>
      <div class="card-sub" style="margin-top:6px;">Centang anak yang menjadi tanggungan wali ini. Siswa yang sudah punya wali lain tidak muncul di sini.</div>
    </div>
    <div style="display:flex; gap:10px; margin-top:16px;">
      <button class="btn-outline" onclick="closeModal()" style="flex:1;">Batal</button>
      <button class="btn-primary" id="saveWaliBtn" style="flex:1;">Simpan</button>
    </div>
  `);
  document.getElementById("saveWaliBtn").onclick = async () => {
    const nama = document.getElementById("f_nama").value.trim();
    const noHp = document.getElementById("f_hp").value.trim();
    const email = document.getElementById("f_email").value.trim();
    const alamat = document.getElementById("f_alamat").value.trim();
    const checkedIds = Array.from(document.querySelectorAll(".f_anak_chk:checked")).map(c => c.value);
    if (!nama || !email) return toast("Nama & email wajib diisi", "err");

    let parentId = data.id;
    if (data.id) {
      await updateRecord("Parents", data.id, { nama, noHp, alamat });
    } else {
      const pass = document.getElementById("f_pass").value;
      if (!pass || pass.length < 6) return toast("Password minimal 6 karakter", "err");
      try {
        const uid = await createUserAccount({ email, password: pass, name: nama, role: "WaliMurid", phone: noHp });
        const created = await addRecord("Parents", { nama, noHp, email, alamat, uid });
        parentId = created.id;
      } catch (err) {
        return toast(err.message.includes("email-already") ? "Email sudah terdaftar" : "Gagal membuat akun: " + err.message, "err");
      }
    }

    // Update relasi Siswa -> Wali: siswa yang dicentang di-set parentId ini,
    // siswa yang tadinya terhubung tapi sekarang di-uncheck dilepas (parentId = null)
    for (const s of selectableStudents) {
      const shouldLink = checkedIds.includes(s.id);
      const isLinked = s.parentId === parentId;
      if (shouldLink && !isLinked) await updateRecord("Students", s.id, { parentId });
      if (!shouldLink && isLinked) await updateRecord("Students", s.id, { parentId: null });
    }

    toast("Data wali murid disimpan");
    closeModal();
    loadWali();
  };
}

// =========================================================
// KATEGORI TAGIHAN (master, dipilih saat membuat Jenis Tagihan)
// =========================================================
async function loadKategoriTagihan() {
  const items = await getAll("FeeCategories");
  const body = document.getElementById("kategoriBody");
  body.innerHTML = items.length ? items.map(k => `
    <tr>
      <td>${k.nama}</td>
      <td>${k.keterangan || "-"}</td>
      <td class="row-actions">
        <button onclick="window.editKategori('${k.id}')">✏️</button>
        <button class="danger" onclick="window.deleteKategori('${k.id}')">🗑️</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="3" class="muted">Belum ada kategori. Contoh: Bulanan, Sekali Bayar, Tahunan.</td></tr>`;

  document.getElementById("btnAddKategori").onclick = () => kategoriForm();
  window.editKategori = async (id) => kategoriForm(await getOne("FeeCategories", id));
  window.deleteKategori = async (id) => { if (confirm("Hapus kategori ini?")) { await deleteRecord("FeeCategories", id); toast("Dihapus"); loadKategoriTagihan(); } };
}
function kategoriForm(data = {}) {
  openModal(`
    <h3>${data.id ? "Edit" : "Tambah"} Kategori Tagihan</h3>
    <div class="field"><label>Nama Kategori</label><input class="select" id="f_nama" value="${data.nama || ""}" placeholder="Bulanan / Sekali Bayar / Tahunan"></div>
    <div class="field"><label>Keterangan (opsional)</label><textarea id="f_ket" rows="2">${data.keterangan || ""}</textarea></div>
    <div style="display:flex; gap:10px; margin-top:16px;">
      <button class="btn-outline" onclick="closeModal()" style="flex:1;">Batal</button>
      <button class="btn-primary" id="saveKategoriBtn" style="flex:1;">Simpan</button>
    </div>
  `);
  document.getElementById("saveKategoriBtn").onclick = async () => {
    const payload = {
      nama: document.getElementById("f_nama").value.trim(),
      keterangan: document.getElementById("f_ket").value.trim()
    };
    if (!payload.nama) return toast("Nama kategori wajib diisi", "err");
    if (data.id) await updateRecord("FeeCategories", data.id, payload); else await addRecord("FeeCategories", payload);
    toast("Kategori disimpan"); closeModal(); loadKategoriTagihan();
  };
}

// =========================================================
// JENIS TAGIHAN
// =========================================================
async function loadJenisTagihan() {
  const items = await getAll("FeeTypes");
  const body = document.getElementById("jenisBody");
  body.innerHTML = items.length ? items.map(f => `
    <tr>
      <td>${f.nama}</td>
      <td>${f.kategori || "-"}</td>
      <td>${formatRupiah(f.nominalDefault)}</td>
      <td class="row-actions">
        <button onclick="window.editJenis('${f.id}')">✏️</button>
        <button class="danger" onclick="window.deleteJenis('${f.id}')">🗑️</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="4" class="muted">Belum ada jenis tagihan. Tambahkan SPP, Uang Gedung, dll.</td></tr>`;

  document.getElementById("btnAddJenis").onclick = () => jenisForm();
  window.editJenis = async (id) => jenisForm(await getOne("FeeTypes", id));
  window.deleteJenis = async (id) => { if (confirm("Hapus jenis tagihan ini?")) { await deleteRecord("FeeTypes", id); toast("Dihapus"); loadJenisTagihan(); } };
}
async function jenisForm(data = {}) {
  const categories = await getAll("FeeCategories");
  if (!categories.length) return toast('Tambahkan dulu minimal 1 "Kategori Tagihan" sebelum membuat Jenis Tagihan', "err");
  openModal(`
    <h3>${data.id ? "Edit" : "Tambah"} Jenis Tagihan</h3>
    <div class="field"><label>Nama (SPP, Uang Gedung, Seragam, dll)</label><input class="select" id="f_nama" value="${data.nama || ""}"></div>
    <div class="field"><label>Kategori</label>
      <select class="select" id="f_kategori">
        ${categories.map(k => `<option value="${k.nama}" ${data.kategori === k.nama ? "selected" : ""}>${k.nama}</option>`).join("")}
      </select>
    </div>
    <div class="field"><label>Nominal Default</label><input class="select" id="f_nominal" type="number" value="${data.nominalDefault || ""}"></div>
    <div class="card-sub" style="margin:-8px 0 8px;">Nominal ini dipakai kalau kelas tertentu tidak punya "Aturan Tagihan" khusus.</div>
    <div style="display:flex; gap:10px; margin-top:16px;">
      <button class="btn-outline" onclick="closeModal()" style="flex:1;">Batal</button>
      <button class="btn-primary" id="saveJenisBtn" style="flex:1;">Simpan</button>
    </div>
  `);
  document.getElementById("saveJenisBtn").onclick = async () => {
    const payload = {
      nama: document.getElementById("f_nama").value.trim(),
      kategori: document.getElementById("f_kategori").value,
      nominalDefault: Number(document.getElementById("f_nominal").value) || 0
    };
    if (!payload.nama) return toast("Nama wajib diisi", "err");
    if (data.id) await updateRecord("FeeTypes", data.id, payload); else await addRecord("FeeTypes", payload);
    toast("Jenis tagihan disimpan"); closeModal(); loadJenisTagihan();
  };
}

// =========================================================
// ATURAN TAGIHAN PER KELAS (FeeRules) — nominal khusus per kelas,
// dipakai saat Generate Tagihan supaya SPP tiap kelas bisa berbeda.
// =========================================================
async function loadAturanTagihan() {
  const [rules, feeTypes] = await Promise.all([getAll("FeeRules"), getAll("FeeTypes")]);
  const body = document.getElementById("aturanBody");
  body.innerHTML = rules.length ? rules.map(r => `
    <tr>
      <td>${r.jenisTagihan}</td>
      <td>${r.kelas}</td>
      <td>${formatRupiah(r.nominal)}</td>
      <td>${r.tahunAjaran || "-"}</td>
      <td class="row-actions">
        <button onclick="window.editAturan('${r.id}')">✏️</button>
        <button class="danger" onclick="window.deleteAturan('${r.id}')">🗑️</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="5" class="muted">Belum ada aturan khusus. Semua kelas memakai Nominal Default dari Jenis Tagihan.</td></tr>`;

  document.getElementById("btnAddAturan").onclick = async () => {
    if (!feeTypes.length) return toast("Tambahkan Jenis Tagihan dulu", "err");
    aturanForm();
  };
  window.editAturan = async (id) => aturanForm(await getOne("FeeRules", id));
  window.deleteAturan = async (id) => { if (confirm("Hapus aturan ini?")) { await deleteRecord("FeeRules", id); toast("Dihapus"); loadAturanTagihan(); } };
}

async function aturanForm(data = {}) {
  const [feeTypes, classes] = await Promise.all([getAll("FeeTypes"), getAll("Classes")]);
  if (!classes.length) return toast("Tambahkan Data Kelas dulu di menu Data Kelas", "err");
  openModal(`
    <h3>${data.id ? "Edit" : "Tambah"} Aturan Tagihan</h3>
    <div class="field"><label>Jenis Tagihan</label>
      <select class="select" id="f_jenis">
        ${feeTypes.map(f => `<option value="${f.id}" data-nama="${f.nama}" ${data.feeTypeId === f.id ? "selected" : ""}>${f.nama}</option>`).join("")}
      </select>
    </div>
    <div class="field"><label>Kelas</label>
      <select class="select" id="f_kelas">
        ${classes.map(k => `<option value="${k.nama}" ${data.kelas === k.nama ? "selected" : ""}>${k.nama}</option>`).join("")}
      </select>
    </div>
    <div class="field"><label>Nominal Khusus untuk Kelas ini</label><input class="select" id="f_nominal" type="number" value="${data.nominal || ""}"></div>
    <div class="field"><label>Tahun Ajaran (opsional)</label><input class="select" id="f_tahun" value="${data.tahunAjaran || ""}" placeholder="2026/2027"></div>
    <div style="display:flex; gap:10px; margin-top:16px;">
      <button class="btn-outline" onclick="closeModal()" style="flex:1;">Batal</button>
      <button class="btn-primary" id="saveAturanBtn" style="flex:1;">Simpan</button>
    </div>
  `);
  document.getElementById("saveAturanBtn").onclick = async () => {
    const feeTypeSelect = document.getElementById("f_jenis");
    const payload = {
      feeTypeId: feeTypeSelect.value,
      jenisTagihan: feeTypeSelect.selectedOptions[0].dataset.nama,
      kelas: document.getElementById("f_kelas").value,
      nominal: Number(document.getElementById("f_nominal").value) || 0,
      tahunAjaran: document.getElementById("f_tahun").value.trim()
    };
    if (data.id) await updateRecord("FeeRules", data.id, payload); else await addRecord("FeeRules", payload);
    toast("Aturan tagihan disimpan"); closeModal(); loadAturanTagihan();
  };
}

// =========================================================
// TAGIHAN / INVOICE
// =========================================================
async function loadTagihan() {
  const invoices = await getAll("Invoices");
  const body = document.getElementById("tagihanBody");
  body.innerHTML = invoices.length ? invoices.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).map(i => `
    <tr>
      <td>${i.namaSiswa || "-"}</td>
      <td>${i.kelas || "-"}</td>
      <td>${i.jenisTagihan || "-"}</td>
      <td>${formatRupiah(i.nominal)}</td>
      <td>${formatDate(i.jatuhTempo)}</td>
      <td><span class="badge ${statusBadgeClass(i.status)}">${i.status || "Belum Dibayar"}</span></td>
      <td class="row-actions"><button class="danger" onclick="window.deleteTagihan('${i.id}')">🗑️</button></td>
    </tr>`).join("") : `<tr><td colspan="7" class="muted">Belum ada tagihan. Klik "Generate Tagihan".</td></tr>`;

  document.getElementById("btnGenerateTagihan").onclick = generateTagihanForm;
  window.deleteTagihan = async (id) => { if (confirm("Hapus tagihan ini?")) { await deleteRecord("Invoices", id); toast("Dihapus"); loadTagihan(); } };
}

async function generateTagihanForm() {
  const [students, feeTypes] = await Promise.all([getAll("Students"), getAll("FeeTypes")]);
  if (!feeTypes.length) return toast("Tambahkan Jenis Tagihan dulu di menu Master Jenis Tagihan", "err");
  const classOptions = [...new Set(students.map(s => s.kelas).filter(Boolean))];

  openModal(`
    <h3>Generate Tagihan</h3>
    <div class="field"><label>Jenis Tagihan</label>
      <select class="select" id="g_jenis">${feeTypes.map(f => `<option value="${f.id}">${f.nama} — ${formatRupiah(f.nominalDefault)}</option>`).join("")}</select>
    </div>
    <div class="field"><label>Target</label>
      <select class="select" id="g_target">
        <option value="semua">Semua Siswa Aktif</option>
        <option value="kelas">Berdasarkan Kelas</option>
      </select>
    </div>
    <div class="field hidden" id="g_kelas_wrap"><label>Pilih Kelas</label>
      <select class="select" id="g_kelas">${classOptions.map(k => `<option value="${k}">${k}</option>`).join("")}</select>
    </div>
    <div class="field"><label>Jatuh Tempo</label><input class="select" id="g_tempo" type="date"></div>
    <div style="display:flex; gap:10px; margin-top:16px;">
      <button class="btn-outline" onclick="closeModal()" style="flex:1;">Batal</button>
      <button class="btn-primary" id="genBtn" style="flex:1;">Generate</button>
    </div>
  `);
  document.getElementById("g_target").onchange = (e) => {
    document.getElementById("g_kelas_wrap").classList.toggle("hidden", e.target.value !== "kelas");
  };
  document.getElementById("genBtn").onclick = async () => {
    const feeType = feeTypes.find(f => f.id === document.getElementById("g_jenis").value);
    const target = document.getElementById("g_target").value;
    const kelas = document.getElementById("g_kelas")?.value;
    const jatuhTempo = document.getElementById("g_tempo").value ? new Date(document.getElementById("g_tempo").value).getTime() : null;

    let targetStudents = students.filter(s => s.status !== "nonaktif");
    if (target === "kelas") targetStudents = targetStudents.filter(s => s.kelas === kelas);
    if (!targetStudents.length) return toast("Tidak ada siswa yang cocok", "err");

    // Ambil semua Aturan Tagihan (FeeRules) sekali saja, lalu cocokkan per kelas siswa.
    // Kalau kelas siswa punya aturan khusus untuk jenis tagihan ini, pakai nominal itu.
    // Kalau tidak ada, pakai Nominal Default dari Jenis Tagihan.
    const rules = await getAll("FeeRules");
    const ruleFor = (kelasSiswa) => rules.find(r => r.feeTypeId === feeType.id && r.kelas === kelasSiswa);

    let jumlahDibuat = 0;
    for (const s of targetStudents) {
      const rule = ruleFor(s.kelas);
      const nominal = rule ? Number(rule.nominal) || 0 : (feeType.nominalDefault || 0);
      await addRecord("Invoices", {
        studentId: s.id, namaSiswa: s.nama, kelas: s.kelas || "", jenisTagihan: feeType.nama, feeTypeId: feeType.id,
        nominal, sisaTagihan: nominal,
        jatuhTempo, status: "Belum Dibayar"
      });
      jumlahDibuat++;
    }
    await logActivity(CURRENT_USER.uid, "generate_tagihan", `${feeType.nama} untuk ${jumlahDibuat} siswa`);
    toast(`${jumlahDibuat} tagihan berhasil dibuat (nominal otomatis menyesuaikan aturan per kelas)`);
    closeModal();
    loadTagihan();
  };
}

// =========================================================
// PEMBAYARAN (verifikasi)
// =========================================================
async function loadPembayaran() {
  const payments = await getAll("Payments");
  const body = document.getElementById("pembayaranBody");
  body.innerHTML = payments.length ? payments.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).map(p => `
    <tr>
      <td>${p.namaSiswa || "-"}</td>
      <td>${p.jenisTagihan || "-"}</td>
      <td>${formatRupiah(p.nominal)}</td>
      <td>${p.buktiUrl ? `<a href="${p.buktiUrl}" target="_blank">Lihat</a>` : "-"}</td>
      <td><span class="badge ${statusBadgeClass(p.status)}">${p.status}</span></td>
      <td class="row-actions">
        ${p.status === "Menunggu Verifikasi" ? `
          <button onclick="window.verifPay('${p.id}','approve')" title="Terima">✅</button>
          <button class="danger" onclick="window.verifPay('${p.id}','reject')" title="Tolak">❌</button>
        ` : "-"}
      </td>
    </tr>`).join("") : `<tr><td colspan="6" class="muted">Belum ada pembayaran masuk.</td></tr>`;

  window.verifPay = async (id, action) => {
    const payment = await getOne("Payments", id);
    if (action === "approve") {
      await updateRecord("Payments", id, { status: "Lunas", verifiedBy: CURRENT_USER.uid, verifiedAt: Date.now() });
      if (payment.invoiceId) await updateRecord("Invoices", payment.invoiceId, { status: "Lunas", sisaTagihan: 0 });
      await addRecord("Income", {
        tanggal: Date.now(), kategori: "Pembayaran Siswa",
        keterangan: `${payment.jenisTagihan} - ${payment.namaSiswa}`,
        nominal: payment.nominal, sourcePaymentId: id
      });
      toast("Pembayaran diverifikasi & masuk ke Kas");
    } else {
      const alasan = prompt("Alasan penolakan (wajib):");
      if (!alasan) return toast("Penolakan dibatalkan, alasan wajib diisi", "err");
      await updateRecord("Payments", id, { status: "Ditolak", alasanTolak: alasan, verifiedBy: CURRENT_USER.uid, verifiedAt: Date.now() });
      toast("Pembayaran ditolak");
    }
    await logActivity(CURRENT_USER.uid, "verifikasi_pembayaran", `${action} - ${id}`);
    loadPembayaran();
  };
}

// =========================================================
// KAS MASUK / KAS KELUAR
// =========================================================
async function loadKasMasuk() { await renderKas("Income", "kasMasukBody", "btnAddKasMasuk", "Kas Masuk"); }
async function loadKasKeluar() { await renderKas("Expenses", "kasKeluarBody", "btnAddKasKeluar", "Kas Keluar"); }

async function renderKas(path, bodyId, btnId, label) {
  const items = await getAll(path);
  const body = document.getElementById(bodyId);
  body.innerHTML = items.length ? items.sort((a,b)=>(b.tanggal||b.createdAt||0)-(a.tanggal||a.createdAt||0)).map(i => `
    <tr>
      <td>${formatDate(i.tanggal || i.createdAt)}</td>
      <td>${i.kategori || "-"}</td>
      <td>${i.keterangan || "-"}</td>
      <td>${formatRupiah(i.nominal)}</td>
      <td class="row-actions"><button class="danger" onclick="window.deleteKas('${path}','${i.id}')">🗑️</button></td>
    </tr>`).join("") : `<tr><td colspan="5" class="muted">Belum ada data.</td></tr>`;

  document.getElementById(btnId).onclick = () => kasForm(path, label);
  window.deleteKas = async (p, id) => {
    if (confirm("Hapus transaksi ini?")) {
      await deleteRecord(p, id); toast("Dihapus");
      p === "Income" ? loadKasMasuk() : loadKasKeluar();
    }
  };
}

function kasForm(path, label) {
  openModal(`
    <h3>Tambah ${label}</h3>
    <div class="field"><label>Tanggal</label><input class="select" id="k_tanggal" type="date"></div>
    <div class="field"><label>Kategori</label><input class="select" id="k_kategori" placeholder="${path === "Income" ? "Sumbangan, Pendapatan lain" : "Gaji, ATK, Listrik, Internet"}"></div>
    <div class="field"><label>Keterangan</label><textarea id="k_ket" rows="2"></textarea></div>
    <div class="field"><label>Nominal</label><input class="select" id="k_nominal" type="number"></div>
    <div style="display:flex; gap:10px; margin-top:16px;">
      <button class="btn-outline" onclick="closeModal()" style="flex:1;">Batal</button>
      <button class="btn-primary" id="saveKasBtn" style="flex:1;">Simpan</button>
    </div>
  `);
  document.getElementById("saveKasBtn").onclick = async () => {
    const payload = {
      tanggal: document.getElementById("k_tanggal").value ? new Date(document.getElementById("k_tanggal").value).getTime() : Date.now(),
      kategori: document.getElementById("k_kategori").value.trim(),
      keterangan: document.getElementById("k_ket").value.trim(),
      nominal: Number(document.getElementById("k_nominal").value) || 0,
      inputBy: CURRENT_USER.uid
    };
    await addRecord(path, payload);
    toast(`${label} disimpan`);
    closeModal();
    path === "Income" ? loadKasMasuk() : loadKasKeluar();
  };
}

// =========================================================
// LAPORAN (tampilkan tabel + tombol print)
// =========================================================
document.querySelectorAll("[data-report]").forEach(btn => {
  btn.addEventListener("click", async () => {
    const type = btn.dataset.report;
    const map = {
      siswa: ["Students", ["nama","nis","kelas","status"]],
      tagihan: ["Invoices", ["namaSiswa","jenisTagihan","nominal","status"]],
      pembayaran: ["Payments", ["namaSiswa","jenisTagihan","nominal","status"]],
      kasmasuk: ["Income", ["kategori","keterangan","nominal"]],
      kaskeluar: ["Expenses", ["kategori","keterangan","nominal"]]
    };
    let rows, cols;
    if (type === "tunggakan") {
      rows = (await getAll("Invoices")).filter(i => i.status !== "Lunas");
      cols = ["namaSiswa","jenisTagihan","sisaTagihan","status"];
    } else if (type === "aruskas") {
      const income = await getAll("Income"); const expense = await getAll("Expenses");
      const totalIn = income.reduce((s,i)=>s+(Number(i.nominal)||0),0);
      const totalOut = expense.reduce((s,i)=>s+(Number(i.nominal)||0),0);
      document.getElementById("reportOutput").innerHTML = `
        <table><thead><tr><th>Total Kas Masuk</th><th>Total Kas Keluar</th><th>Saldo Akhir</th></tr></thead>
        <tbody><tr><td>${formatRupiah(totalIn)}</td><td>${formatRupiah(totalOut)}</td><td>${formatRupiah(totalIn-totalOut)}</td></tr></tbody></table>
        <button class="btn-outline" style="margin-top:12px;" onclick="window.print()">🖨️ Print PDF</button>`;
      return;
    } else {
      [rows, cols] = [await getAll(map[type][0]), map[type][1]];
    }
    document.getElementById("reportOutput").innerHTML = `
      <table>
        <thead><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead>
        <tbody>${rows.length ? rows.map(r => `<tr>${cols.map(c => `<td>${typeof r[c] === "number" ? formatRupiah(r[c]) : (r[c] ?? "-")}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${cols.length}" class="muted">Tidak ada data.</td></tr>`}</tbody>
      </table>
      <button class="btn-outline" style="margin-top:12px;" onclick="window.print()">🖨️ Print PDF</button>
    `;
  });
});

// =========================================================
// PENGUMUMAN
// =========================================================
async function loadPengumuman() {
  const items = await getAll("Announcements");
  const body = document.getElementById("pengumumanBody");
  body.innerHTML = items.length ? items.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).map(a => `
    <tr>
      <td>${a.judul}</td>
      <td>${formatDate(a.tanggalMulai)} – ${formatDate(a.tanggalSelesai)}</td>
      <td class="row-actions"><button class="danger" onclick="window.deletePengumuman('${a.id}')">🗑️</button></td>
    </tr>`).join("") : `<tr><td colspan="3" class="muted">Belum ada pengumuman.</td></tr>`;

  document.getElementById("btnAddPengumuman").onclick = () => pengumumanForm();
  window.deletePengumuman = async (id) => { if (confirm("Hapus pengumuman ini?")) { await deleteRecord("Announcements", id); toast("Dihapus"); loadPengumuman(); } };
}
function pengumumanForm() {
  openModal(`
    <h3>Buat Pengumuman</h3>
    <div class="field"><label>Judul</label><input class="select" id="p_judul"></div>
    <div class="field"><label>Isi</label><textarea id="p_isi" rows="3"></textarea></div>
    <div class="field"><label>Tanggal Mulai</label><input class="select" id="p_mulai" type="date"></div>
    <div class="field"><label>Tanggal Selesai</label><input class="select" id="p_selesai" type="date"></div>
    <div style="display:flex; gap:10px; margin-top:16px;">
      <button class="btn-outline" onclick="closeModal()" style="flex:1;">Batal</button>
      <button class="btn-primary" id="savePengumumanBtn" style="flex:1;">Simpan</button>
    </div>
  `);
  document.getElementById("savePengumumanBtn").onclick = async () => {
    const judul = document.getElementById("p_judul").value.trim();
    if (!judul) return toast("Judul wajib diisi", "err");
    await addRecord("Announcements", {
      judul, isi: document.getElementById("p_isi").value.trim(),
      tanggalMulai: document.getElementById("p_mulai").value ? new Date(document.getElementById("p_mulai").value).getTime() : Date.now(),
      tanggalSelesai: document.getElementById("p_selesai").value ? new Date(document.getElementById("p_selesai").value).getTime() : Date.now()
    });
    toast("Pengumuman dibuat"); closeModal(); loadPengumuman();
  };
}

// =========================================================
// PENGATURAN & MANAJEMEN BENDAHARA (Admin only)
// =========================================================
async function loadPengaturan() {
  const settings = await getOne("Settings", "main") || {};
  document.getElementById("setNamaSekolah").value = settings.namaSekolah || "";
  document.getElementById("setTahunAjaran").value = settings.tahunAjaran || "";
  document.getElementById("btnSaveSettings").onclick = async () => {
    await updateRecord("Settings", "main", {
      namaSekolah: document.getElementById("setNamaSekolah").value.trim(),
      tahunAjaran: document.getElementById("setTahunAjaran").value.trim()
    }).catch(async () => addRecord("Settings", { namaSekolah: "", tahunAjaran: "" }));
    toast("Pengaturan disimpan");
  };

  const users = await getAll("Users");
  const bendahara = users.filter(u => u.role === "Bendahara");
  const body = document.getElementById("bendaharaBody");
  body.innerHTML = bendahara.length ? bendahara.map(u => `
    <tr>
      <td>${u.name}</td><td>${u.email}</td>
      <td><span class="badge ${u.status === "aktif" ? "lunas" : "belum"}">${u.status}</span></td>
      <td class="row-actions">
        <button onclick="window.toggleBendahara('${u.id}','${u.status}')">${u.status === "aktif" ? "🚫" : "✅"}</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="4" class="muted">Belum ada akun bendahara.</td></tr>`;

  window.toggleBendahara = async (id, status) => {
    await updateRecord("Users", id, { status: status === "aktif" ? "nonaktif" : "aktif" });
    toast("Status diperbarui"); loadPengaturan();
  };

  document.getElementById("btnAddBendahara").onclick = () => {
    openModal(`
      <h3>Tambah Akun Bendahara</h3>
      <div class="field"><label>Nama</label><input class="select" id="b_nama"></div>
      <div class="field"><label>Email</label><input class="select" id="b_email"></div>
      <div class="field"><label>Password Awal</label><input class="select" id="b_pass" placeholder="Minimal 6 karakter"></div>
      <div style="display:flex; gap:10px; margin-top:16px;">
        <button class="btn-outline" onclick="closeModal()" style="flex:1;">Batal</button>
        <button class="btn-primary" id="saveBendaharaBtn" style="flex:1;">Simpan</button>
      </div>
    `);
    document.getElementById("saveBendaharaBtn").onclick = async () => {
      const name = document.getElementById("b_nama").value.trim();
      const email = document.getElementById("b_email").value.trim();
      const password = document.getElementById("b_pass").value;
      if (!name || !email || password.length < 6) return toast("Lengkapi semua data (password min. 6 karakter)", "err");
      try {
        await createUserAccount({ email, password, name, role: "Bendahara" });
        toast("Akun bendahara dibuat"); closeModal(); loadPengaturan();
      } catch (err) {
        toast("Gagal: " + err.message, "err");
      }
    };
  };
}
