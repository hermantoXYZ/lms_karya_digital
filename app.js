
/**
 * EDUSMART LMS — APPLICATION CLIENT LOGIC & BACKEND INTEGRATION
 * Integrasi Google Apps Script Web App & Mode Demo In-Memory
 */

// =========================================================================
    // 1. KODE GOOGLE APPS SCRIPT (Code.gs) YANG SIAP DI-COPY
    // =========================================================================
    const GAS_BACKEND_CODE = `/**
 * BACKEND LMS SEKOLAH - GOOGLE APPS SCRIPT & GOOGLE SHEETS
 * Tabel: users, master_kelas_jurusan, materi, soal, jawaban_siswa, sessions
 */

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const schemas = {
    users: ['id_user', 'username', 'password', 'nama_lengkap', 'role', 'kelas', 'jurusan', 'created_at'],
    master_kelas_jurusan: ['id_master', 'tipe', 'nama'],
    materi: ['id_materi', 'id_guru', 'nama_guru', 'mapel', 'kelas', 'jurusan', 'judul_materi', 'deskripsi', 'youtube_url', 'created_at'],
    soal: ['id_soal', 'id_materi', 'nomor_urut', 'tipe_soal', 'pertanyaan', 'opsi_a', 'opsi_b', 'opsi_c', 'opsi_d', 'opsi_e', 'kunci_pg', 'bobot_poin'],
    jawaban_siswa: ['id_submit', 'id_materi', 'id_siswa', 'nama_siswa', 'kelas', 'jurusan', 'detail_jawaban', 'skor_pg', 'skor_esai', 'total_nilai', 'status_koreksi', 'catatan_guru', 'waktu_submit'],
    sessions: ['token', 'id_user', 'role', 'expired_at']
  };

  Object.keys(schemas).forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(schemas[sheetName]);
      sheet.getRange(1, 1, 1, schemas[sheetName].length).setFontWeight('bold').setBackground('#e2e8f0');
      sheet.setFrozenRows(1);
    }
  });

  // Seed Data Awal jika tabel users masih kosong
  const userSheet = ss.getSheetByName('users');
  if (userSheet.getLastRow() === 1) {
    const now = new Date().toISOString();
    userSheet.appendRow(['USR-001', 'admin', 'admin123', 'Administrator Sekolah', 'admin', '-', '-', now]);
    userSheet.appendRow(['USR-002', '19850412', 'guru123', 'Budi Santoso, S.Kom.', 'guru', '-', '-', now]);
    userSheet.appendRow(['USR-003', '2026001', 'siswa123', 'Siti Aminah', 'siswa', 'XII', 'RPL', now]);
  }

  const masterSheet = ss.getSheetByName('master_kelas_jurusan');
  if (masterSheet.getLastRow() === 1) {
    masterSheet.appendRow(['MST-001', 'kelas', 'X']);
    masterSheet.appendRow(['MST-002', 'kelas', 'XI']);
    masterSheet.appendRow(['MST-003', 'kelas', 'XII']);
    masterSheet.appendRow(['MST-004', 'jurusan', 'RPL']);
    masterSheet.appendRow(['MST-005', 'jurusan', 'TKJ']);
    masterSheet.appendRow(['MST-006', 'jurusan', 'IPA']);
  }
}

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    let payload = {};
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      payload = e.parameter;
    }

    const action = payload.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. LOGIN & BUAT SESSION TOKEN
    if (action === 'login') {
      const users = getSheetData(ss, 'users');
      const user = users.find(u => String(u.username) === String(payload.username) && String(u.password) === String(payload.password));
      if (!user) return jsonResponse({ status: 'error', message: 'Username/NIS/NIP atau kata sandi salah!' });

      const token = Utilities.getUuid();
      const expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 jam
      ss.getSheetByName('sessions').appendRow([token, user.id_user, user.role, expiredAt]);

      const safeUser = Object.assign({}, user);
      delete safeUser.password;
      return jsonResponse({ status: 'success', token: token, user: safeUser });
    }

    // VALIDASI TOKEN SESSION UNTUK ENDPOINT TERPROTEKSI
    if (action !== 'login') {
      const sessions = getSheetData(ss, 'sessions');
      const validSession = sessions.find(s => s.token === payload.token && new Date(s.expired_at) > new Date());
      if (!validSession) return jsonResponse({ status: 'error', message: 'Sesi tidak valid atau telah berakhir. Silakan login ulang.' });
    }

    // 2. AMBIL SEMUA DATA (SYNC)
    if (action === 'getAllData') {
      const users = getSheetData(ss, 'users').map(u => { delete u.password; return u; });
      const master = getSheetData(ss, 'master_kelas_jurusan');
      const materi = getSheetData(ss, 'materi');
      const soal = getSheetData(ss, 'soal');
      const jawaban = getSheetData(ss, 'jawaban_siswa');
      return jsonResponse({ status: 'success', data: { users, master, materi, soal, jawaban } });
    }

    // 3. ADMIN: TAMBAH / HAPUS USER
    if (action === 'addUser') {
      const d = payload.data;
      const id = 'USR-' + Date.now();
      ss.getSheetByName('users').appendRow([id, d.username, d.password, d.nama_lengkap, d.role, d.kelas || '-', d.jurusan || '-', new Date().toISOString()]);
      return jsonResponse({ status: 'success', id: id });
    }
    if (action === 'deleteUser') {
      deleteRowById(ss, 'users', 'id_user', payload.id_user);
      return jsonResponse({ status: 'success' });
    }

    // 4. ADMIN: TAMBAH / HAPUS MASTER KELAS & JURUSAN
    if (action === 'addMaster') {
      const d = payload.data;
      const id = 'MST-' + Date.now();
      ss.getSheetByName('master_kelas_jurusan').appendRow([id, d.tipe, d.nama]);
      return jsonResponse({ status: 'success', id: id });
    }
    if (action === 'deleteMaster') {
      deleteRowById(ss, 'master_kelas_jurusan', 'id_master', payload.id_master);
      return jsonResponse({ status: 'success' });
    }

    // 5. GURU: TAMBAH / HAPUS MATERI
    if (action === 'addMateri') {
      const d = payload.data;
      const id = 'MTR-' + Date.now();
      ss.getSheetByName('materi').appendRow([id, d.id_guru, d.nama_guru, d.mapel, d.kelas, d.jurusan, d.judul_materi, d.deskripsi, d.youtube_url, new Date().toISOString()]);
      return jsonResponse({ status: 'success', id: id });
    }
    if (action === 'deleteMateri') {
      deleteRowById(ss, 'materi', 'id_materi', payload.id_materi);
      return jsonResponse({ status: 'success' });
    }

    // 6. GURU: TAMBAH / HAPUS SOAL
    if (action === 'addSoal') {
      const d = payload.data;
      const id = 'SOL-' + Date.now();
      ss.getSheetByName('soal').appendRow([id, d.id_materi, d.nomor_urut, d.tipe_soal, d.pertanyaan, d.opsi_a, d.opsi_b, d.opsi_c, d.opsi_d, d.opsi_e, d.kunci_pg, d.bobot_poin]);
      return jsonResponse({ status: 'success', id: id });
    }
    if (action === 'deleteSoal') {
      deleteRowById(ss, 'soal', 'id_soal', payload.id_soal);
      return jsonResponse({ status: 'success' });
    }

    // 7. SISWA: SUBMIT JAWABAN
    if (action === 'submitJawaban') {
      const d = payload.data;
      const id = 'SUB-' + Date.now();
      ss.getSheetByName('jawaban_siswa').appendRow([
        id, d.id_materi, d.id_siswa, d.nama_siswa, d.kelas, d.jurusan,
        JSON.stringify(d.detail_jawaban), d.skor_pg, d.skor_esai, d.total_nilai,
        d.status_koreksi, d.catatan_guru || '', new Date().toISOString()
      ]);
      return jsonResponse({ status: 'success', id: id });
    }

    // 8. GURU: KOREKSI ESAI & UPDATE NILAI
    if (action === 'koreksiJawaban') {
      const d = payload.data;
      const sheet = ss.getSheetByName('jawaban_siswa');
      const rows = sheet.getDataRange().getValues();
      const headers = rows[0];
      const idCol = headers.indexOf('id_submit');
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][idCol]) === String(d.id_submit)) {
          sheet.getRange(i + 1, headers.indexOf('skor_esai') + 1).setValue(d.skor_esai);
          sheet.getRange(i + 1, headers.indexOf('total_nilai') + 1).setValue(d.total_nilai);
          sheet.getRange(i + 1, headers.indexOf('status_koreksi') + 1).setValue('Sudah Dikoreksi');
          sheet.getRange(i + 1, headers.indexOf('catatan_guru') + 1).setValue(d.catatan_guru);
          break;
        }
      }
      return jsonResponse({ status: 'success' });
    }

    return jsonResponse({ status: 'error', message: 'Action tidak dikenali' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function getSheetData(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    let obj = {};
    headers.forEach((h, idx) => obj[h] = row[idx]);
    return obj;
  });
}

function deleteRowById(ss, sheetName, idColName, idValue) {
  const sheet = ss.getSheetByName(sheetName);
  const rows = sheet.getDataRange().getValues();
  const idCol = rows[0].indexOf(idColName);
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][idCol]) === String(idValue)) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}`;

    // =========================================================================
    // 2. KONFIGURASI URL BACKEND & IN-MEMORY STATE (TANPA LOCALSTORAGE)
    // =========================================================================
    // TEMPEL URL WEB APP GOOGLE APPS SCRIPT ANDA DI SINI SEBELUM PUSH KE GITHUB/VERCEL:
    // Contoh: const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbx.../exec';
    const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxEW1gTvSjB-Es4gKIO8iW5a6xrAHwzLvjK7PK9-yDADyiYFYy1koUx9hHeFPH6BB-N5Q/exec';

    let appState = {
      gasUrl: GAS_WEBAPP_URL,
      session: null,
      db: {
        users: [],
        master: [],
        materi: [],
        soal: [],
        jawaban: []
      }
    };

    function initDemoDatabase() {
      if (appState.db.users.length > 0) return;
      const now = new Date().toISOString();
      appState.db = {
        users: [
          { id_user: 'USR-001', username: 'admin', password: 'admin123', nama_lengkap: 'Administrator Sekolah', role: 'admin', kelas: '-', jurusan: '-', created_at: now },
          { id_user: 'USR-002', username: '19850412', password: 'guru123', nama_lengkap: 'Budi Santoso, S.Kom.', role: 'guru', kelas: '-', jurusan: '-', created_at: now },
          { id_user: 'USR-003', username: '2026001', password: 'siswa123', nama_lengkap: 'Siti Aminah', role: 'siswa', kelas: 'XII', jurusan: 'RPL', created_at: now },
          { id_user: 'USR-004', username: '2026002', password: 'siswa123', nama_lengkap: 'Rizky Pratama', role: 'siswa', kelas: 'XII', jurusan: 'RPL', created_at: now }
        ],
        master: [
          { id_master: 'MST-001', tipe: 'kelas', nama: 'X' },
          { id_master: 'MST-002', tipe: 'kelas', nama: 'XI' },
          { id_master: 'MST-003', tipe: 'kelas', nama: 'XII' },
          { id_master: 'MST-004', tipe: 'jurusan', nama: 'RPL' },
          { id_master: 'MST-005', tipe: 'jurusan', nama: 'TKJ' },
          { id_master: 'MST-006', tipe: 'jurusan', nama: 'IPA' }
        ],
        materi: [
          {
            id_materi: 'MTR-101',
            id_guru: 'USR-002',
            nama_guru: 'Budi Santoso, S.Kom.',
            mapel: 'Pemrograman Web & Perangkat Bergerak',
            kelas: 'XII',
            jurusan: 'RPL',
            judul_materi: 'Bab 1: Dasar HTML5, CSS Modern & Struktur Web',
            deskripsi: 'Pelajari struktur dasar dokumen HTML5, semantik elemen, dan bagaimana CSS mengatur tata letak responsif.\n\nInstruksi: Tonton video pembelajaran hingga selesai, kemudian kerjakan 3 soal latihan di bawah ini.',
            youtube_url: 'https://www.youtube.com/watch?v=UB1O30fR-EE',
            created_at: now
          }
        ],
        soal: [
          {
            id_soal: 'SOL-101',
            id_materi: 'MTR-101',
            nomor_urut: 1,
            tipe_soal: 'pg',
            pertanyaan: 'Tag HTML manakah yang digunakan untuk membuat tautan (hyperlink) ke halaman lain?',
            opsi_a: '<link>',
            opsi_b: '<a>',
            opsi_c: '<href>',
            opsi_d: '<url>',
            opsi_e: '<nav>',
            kunci_pg: 'B',
            bobot_poin: 30
          },
          {
            id_soal: 'SOL-102',
            id_materi: 'MTR-101',
            nomor_urut: 2,
            tipe_soal: 'pg',
            pertanyaan: 'Atribut apa yang wajib ada pada tag <img> untuk menampilkan teks alternatif jika gambar gagal dimuat?',
            opsi_a: 'title',
            opsi_b: 'src',
            opsi_c: 'alt',
            opsi_d: 'caption',
            opsi_e: 'desc',
            kunci_pg: 'C',
            bobot_poin: 30
          },
          {
            id_soal: 'SOL-103',
            id_materi: 'MTR-101',
            nomor_urut: 3,
            tipe_soal: 'esai',
            pertanyaan: 'Jelaskan perbedaan mendasar antara tag semantik <header> dan <head> dalam struktur dokumen HTML5!',
            opsi_a: '', opsi_b: '', opsi_c: '', opsi_d: '', opsi_e: '',
            kunci_pg: '',
            bobot_poin: 40
          }
        ],
        jawaban: []
      };
    }

    // =========================================================================
    // 3. HELPER API (MENDUKUNG GOOGLE APPS SCRIPT & MODE DEMO IN-MEMORY)
    // =========================================================================
    async function apiRequest(action, payload = {}) {
      if (appState.gasUrl) {
        const cleanUrl = appState.gasUrl.trim();
        if (!cleanUrl.endsWith('/exec')) {
          throw new Error('URL Web App Apps Script harus berakhiran /exec (bukan /dev atau link editor).');
        }

        const body = JSON.stringify({
          action,
          token: appState.session?.token || '',
          ...payload
        });

        try {
          const response = await fetch(cleanUrl, {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            headers: {
              'Content-Type': 'text/plain;charset=utf-8'
            },
            body
          });

          if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}: Pastikan akses Web App diatur ke "Siapa saja (Anyone)".`);
          }

          const text = await response.text();
          let result;
          try {
            result = JSON.parse(text);
          } catch (parseErr) {
            throw new Error('Respons dari Apps Script bukan JSON valid. Pastikan Deployment Web App diatur "Yang memiliki akses: Siapa saja (Anyone)".');
          }

          if (result.status === 'error') {
            if (result.message && result.message.toLowerCase().includes('sesi')) {
              localStorage.removeItem('edusmart_session');
              appState.session = null;
              showLandingView();
            }
            throw new Error(result.message);
          }
          return result;
        } catch (networkErr) {
          if (networkErr.message.includes('Failed to fetch') || networkErr.name === 'TypeError') {
            throw new Error('Gagal terhubung ke Google Apps Script (CORS/Network). Pastikan saat Deploy Web App: "Jalankan sebagai: Saya" dan "Yang memiliki akses: Siapa saja (Anyone)", lalu gunakan URL /exec terbaru.');
          }
          throw networkErr;
        }
      }

      // Simulasi Backend In-Memory (Mode Demo)
      await new Promise(r => setTimeout(r, 150));
      initDemoDatabase();

      if (action === 'login') {
        const user = appState.db.users.find(
          u => String(u.username) === String(payload.username) && String(u.password) === String(payload.password)
        );
        if (!user) throw new Error('Username/NIS/NIP atau kata sandi salah!');
        const safeUser = { ...user };
        delete safeUser.password;
        return { status: 'success', token: 'DEMO-TOKEN-' + Date.now(), user: safeUser };
      }

      if (action === 'getAllData') {
        return {
          status: 'success',
          data: {
            users: appState.db.users.map(u => { const c = { ...u }; delete c.password; return c; }),
            master: appState.db.master,
            materi: appState.db.materi,
            soal: appState.db.soal,
            jawaban: appState.db.jawaban
          }
        };
      }

      if (action === 'addUser') {
        const id = 'USR-' + Date.now();
        appState.db.users.push({ id_user: id, ...payload.data, created_at: new Date().toISOString() });
        return { status: 'success', id };
      }

      if (action === 'deleteUser') {
        appState.db.users = appState.db.users.filter(u => u.id_user !== payload.id_user);
        return { status: 'success' };
      }

      if (action === 'addMaster') {
        const id = 'MST-' + Date.now();
        appState.db.master.push({ id_master: id, ...payload.data });
        return { status: 'success', id };
      }

      if (action === 'deleteMaster') {
        appState.db.master = appState.db.master.filter(m => m.id_master !== payload.id_master);
        return { status: 'success' };
      }

      if (action === 'addMateri') {
        const id = 'MTR-' + Date.now();
        appState.db.materi.push({ id_materi: id, ...payload.data, created_at: new Date().toISOString() });
        return { status: 'success', id };
      }

      if (action === 'deleteMateri') {
        appState.db.materi = appState.db.materi.filter(m => m.id_materi !== payload.id_materi);
        appState.db.soal = appState.db.soal.filter(s => s.id_materi !== payload.id_materi);
        return { status: 'success' };
      }

      if (action === 'addSoal') {
        const id = 'SOL-' + Date.now();
        appState.db.soal.push({ id_soal: id, ...payload.data });
        return { status: 'success', id };
      }

      if (action === 'deleteSoal') {
        appState.db.soal = appState.db.soal.filter(s => s.id_soal !== payload.id_soal);
        return { status: 'success' };
      }

      if (action === 'submitJawaban') {
        const id = 'SUB-' + Date.now();
        appState.db.jawaban.push({
          id_submit: id,
          ...payload.data,
          detail_jawaban: JSON.stringify(payload.data.detail_jawaban),
          waktu_submit: new Date().toISOString()
        });
        return { status: 'success', id };
      }

      if (action === 'koreksiJawaban') {
        const idx = appState.db.jawaban.findIndex(j => j.id_submit === payload.data.id_submit);
        if (idx !== -1) {
          appState.db.jawaban[idx].skor_esai = payload.data.skor_esai;
          appState.db.jawaban[idx].total_nilai = payload.data.total_nilai;
          appState.db.jawaban[idx].status_koreksi = 'Sudah Dikoreksi';
          appState.db.jawaban[idx].catatan_guru = payload.data.catatan_guru;
        }
        return { status: 'success' };
      }
    }

    // =========================================================================
    // 4. INISIALISASI & AUTENTIKASI
    // =========================================================================
    window.addEventListener('DOMContentLoaded', async () => {
      lucide.createIcons();
      const codeBlock = document.getElementById('gas-code-block');
      if (codeBlock) codeBlock.textContent = GAS_BACKEND_CODE;

      // Pulihkan URL Backend kustom jika tersimpan
      const savedGasUrl = localStorage.getItem('edusmart_gas_url');
      if (savedGasUrl) {
        appState.gasUrl = savedGasUrl;
      }
      const urlInput = document.getElementById('gas-url-input');
      if (urlInput) urlInput.value = appState.gasUrl;

      updateConnectionBadge();
      initDemoDatabase();

      // Cek apakah ada sesi login tersimpan di localStorage agar tidak logout saat reload
      const savedSession = localStorage.getItem('edusmart_session');
      if (savedSession) {
        try {
          const session = JSON.parse(savedSession);
          if (session && session.user && session.token) {
            appState.session = session;
            await enterApp();
            return;
          }
        } catch (err) {
          console.warn('Gagal memuat sesi tersimpan:', err);
          localStorage.removeItem('edusmart_session');
          appState.session = null;
        }
      }
    });

    function showLandingView() {
      document.getElementById('landing-view').classList.remove('hidden');
      document.getElementById('login-view').classList.add('hidden');
      document.getElementById('app-view').classList.add('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      lucide.createIcons();
    }

    function showLoginView(prefillRole = null) {
      document.getElementById('landing-view').classList.add('hidden');
      document.getElementById('login-view').classList.remove('hidden');
      document.getElementById('app-view').classList.add('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (prefillRole === 'admin') fillDemoLogin('admin', 'admin123');
      else if (prefillRole === 'guru') fillDemoLogin('19850412', 'guru123');
      else if (prefillRole === 'siswa') fillDemoLogin('2026001', 'siswa123');
      lucide.createIcons();
    }

    function quickDemoLogin(role) {
      showLoginView(role);
    }

    function toggleMobileMenu() {
      const menu = document.getElementById('mobile-nav-menu');
      const icon = document.getElementById('hamburger-icon');
      if (menu) {
        const isClosed = menu.classList.contains('hidden');
        if (isClosed) {
          menu.classList.remove('hidden');
          if (icon) icon.setAttribute('data-lucide', 'x');
        } else {
          menu.classList.add('hidden');
          if (icon) icon.setAttribute('data-lucide', 'menu');
        }
        lucide.createIcons();
      }
    }

    function toggleFaq(index) {
      const answer = document.getElementById(`faq-answer-${index}`);
      const icon = document.getElementById(`faq-icon-${index}`);
      if (!answer) return;
      const isHidden = answer.classList.contains('hidden');

      // Tutup FAQ lain untuk efek accordion yang rapi
      for (let i = 1; i <= 6; i++) {
        const a = document.getElementById(`faq-answer-${i}`);
        const ic = document.getElementById(`faq-icon-${i}`);
        if (a && i !== index) a.classList.add('hidden');
        if (ic && i !== index) ic.style.transform = 'rotate(0deg)';
      }

      if (isHidden) {
        answer.classList.remove('hidden');
        if (icon) icon.style.transform = 'rotate(180deg)';
      } else {
        answer.classList.add('hidden');
        if (icon) icon.style.transform = 'rotate(0deg)';
      }
    }

    function switchLandingShowcase(tab) {
      const tabs = ['siswa', 'guru', 'admin'];
      tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        const content = document.getElementById(`showcase-content-${t}`);
        if (btn && content) {
          if (t === tab) {
            btn.className = 'px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white shadow-sm transition';
            content.classList.remove('hidden');
          } else {
            btn.className = 'px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition';
            content.classList.add('hidden');
          }
        }
      });
      lucide.createIcons();
    }

    function updateConnectionBadge() {
      const isConnected = !!appState.gasUrl;
      const bLogin = document.getElementById('connection-badge');
      const bLanding = document.getElementById('landing-connection-badge');

      if (bLogin) {
        if (isConnected) {
          bLogin.className = 'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200';
          bLogin.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500"></span><span>Google Sheets Terhubung</span>';
        } else {
          bLogin.className = 'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200';
          bLogin.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span><span>Mode Demo Lokal</span>';
        }
      }

      if (bLanding) {
        if (isConnected) {
          bLanding.className = 'hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200';
          bLanding.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500"></span><span>Google Sheets Terhubung</span>';
        } else {
          bLanding.className = 'hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200';
          bLanding.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span><span>Mode Demo Lokal</span>';
        }
      }
    }

    function fillDemoLogin(user, pass) {
      document.getElementById('login-username').value = user;
      document.getElementById('login-password').value = pass;
    }

    function togglePasswordVisibility() {
      const input = document.getElementById('login-password');
      const icon = document.getElementById('eye-icon');
      if (input.type === 'password') {
        input.type = 'text';
        icon.setAttribute('data-lucide', 'eye-off');
      } else {
        input.type = 'password';
        icon.setAttribute('data-lucide', 'eye');
      }
      lucide.createIcons();
    }

    async function handleLogin(e) {
      e.preventDefault();
      const btn = document.getElementById('login-btn');
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value.trim();

      btn.disabled = true;
      btn.innerHTML = '<span>Memverifikasi...</span>';

      try {
        const res = await apiRequest('login', { username, password });
        appState.session = { token: res.token, user: res.user };
        // Simpan sesi ke localStorage agar bertahan saat reload
        localStorage.setItem('edusmart_session', JSON.stringify(appState.session));
        showToast(`Selamat datang, ${res.user.nama_lengkap}!`, 'success');
        await enterApp();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Masuk ke Portal</span><i data-lucide="arrow-right" class="w-4 h-4"></i>';
        lucide.createIcons();
      }
    }

    function handleLogout() {
      localStorage.removeItem('edusmart_session');
      appState.session = null;
      document.getElementById('app-view').classList.add('hidden');
      showLandingView();
      showToast('Anda telah keluar dari sistem.', 'info');
    }

    async function enterApp() {
      const user = appState.session.user;
      document.getElementById('landing-view').classList.add('hidden');
      document.getElementById('login-view').classList.add('hidden');
      document.getElementById('app-view').classList.remove('hidden');

      document.getElementById('nav-user-name').textContent = user.nama_lengkap;
      document.getElementById('nav-user-meta').textContent = user.role === 'siswa'
        ? `NIS: ${user.username} • Kelas ${user.kelas} ${user.jurusan}`
        : `ID: ${user.username}`;

      const badge = document.getElementById('nav-role-badge');
      badge.textContent = user.role.toUpperCase();
      if (user.role === 'admin') badge.className = 'ml-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-purple-100 text-purple-800';
      if (user.role === 'guru') badge.className = 'ml-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-emerald-100 text-emerald-800';
      if (user.role === 'siswa') badge.className = 'ml-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-blue-100 text-blue-800';

      document.getElementById('role-admin-panel').classList.add('hidden');
      document.getElementById('role-guru-panel').classList.add('hidden');
      document.getElementById('role-siswa-panel').classList.add('hidden');

      await syncAllData(false);

      if (user.role === 'admin') {
        document.getElementById('role-admin-panel').classList.remove('hidden');
      } else if (user.role === 'guru') {
        document.getElementById('role-guru-panel').classList.remove('hidden');
      } else {
        document.getElementById('role-siswa-panel').classList.remove('hidden');
      }
      lucide.createIcons();
    }

    async function syncAllData(notify = false) {
      const icon = document.getElementById('sync-icon');
      if (icon) icon.classList.add('animate-spin');
      try {
        const res = await apiRequest('getAllData');
        appState.db = res.data;
        populateMasterDropdowns();
        renderCurrentRoleView();
        if (notify) showToast('Data berhasil disinkronkan!', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        if (icon) icon.classList.remove('animate-spin');
      }
    }

    function renderCurrentRoleView() {
      if (!appState.session) return;
      const role = appState.session.user.role;
      if (role === 'admin') renderAdminDashboard();
      if (role === 'guru') renderGuruDashboard();
      if (role === 'siswa') renderSiswaDashboard();
      lucide.createIcons();
    }

    function populateMasterDropdowns() {
      const kelasList = appState.db.master.filter(m => m.tipe === 'kelas');
      const jurusanList = appState.db.master.filter(m => m.tipe === 'jurusan');

      const kelasOptions = kelasList.map(k => `<option value="${k.nama}">${k.nama}</option>`).join('');
      const jurusanOptions = jurusanList.map(j => `<option value="${j.nama}">${j.nama}</option>`).join('');

      ['new-user-kelas', 'materi-kelas'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = kelasOptions || '<option value="XII">XII</option>';
      });
      ['new-user-jurusan', 'materi-jurusan'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = jurusanOptions || '<option value="RPL">RPL</option>';
      });
    }

    // =========================================================================
    // 5. LOGIKA ROLE: ADMIN
    // =========================================================================
    function switchAdminTab(tab) {
      ['users', 'master', 'schema'].forEach(t => {
        document.getElementById(`admin-content-${t}`).classList.add('hidden');
        document.getElementById(`admin-content-${t}`).classList.remove('grid');
        const btn = document.getElementById(`tab-admin-${t}`);
        btn.className = 'px-4 py-2 rounded-xl text-xs font-bold bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 transition';
      });
      const activeContent = document.getElementById(`admin-content-${tab}`);
      activeContent.classList.remove('hidden');
      if (tab !== 'schema') activeContent.classList.add('grid');
      document.getElementById(`tab-admin-${tab}`).className = 'px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white transition';
    }

    function toggleSiswaFields() {
      const role = document.getElementById('new-user-role').value;
      document.getElementById('siswa-only-fields').style.display = role === 'siswa' ? 'grid' : 'none';
    }

    function renderAdminDashboard() {
      const users = appState.db.users;
      const guruCount = users.filter(u => u.role === 'guru').length;
      const siswaCount = users.filter(u => u.role === 'siswa').length;

      document.getElementById('stat-admin-users').textContent = users.length;
      document.getElementById('stat-admin-roles').textContent = `${guruCount} Guru / ${siswaCount} Siswa`;
      document.getElementById('stat-admin-master').textContent = appState.db.master.length;
      document.getElementById('stat-admin-materi').textContent = appState.db.materi.length;

      renderAdminUsers();
      renderAdminMaster();
    }

    function renderAdminUsers() {
      const q = (document.getElementById('search-user-input')?.value || '').toLowerCase();
      const filtered = appState.db.users.filter(u =>
        String(u.nama_lengkap).toLowerCase().includes(q) ||
        String(u.username).toLowerCase().includes(q) ||
        String(u.role).toLowerCase().includes(q)
      );

      const tbody = document.getElementById('admin-users-tbody');
      tbody.innerHTML = filtered.map(u => {
        const badgeColor = u.role === 'admin' ? 'bg-purple-100 text-purple-800' : (u.role === 'guru' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800');
        return `
          <tr class="hover:bg-slate-50/80">
            <td class="py-3 px-4 font-mono font-semibold text-slate-800">${u.username}<span class="block text-[10px] text-slate-400">${u.id_user}</span></td>
            <td class="py-3 px-4 font-semibold text-slate-900">${u.nama_lengkap}</td>
            <td class="py-3 px-4"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${badgeColor}">${u.role}</span></td>
            <td class="py-3 px-4 text-slate-600">${u.role === 'siswa' ? `${u.kelas} - ${u.jurusan}` : '-'}</td>
            <td class="py-3 px-4 text-right">
              ${u.username !== 'admin' ? `<button onclick="adminDeleteUser('${u.id_user}')" class="text-rose-600 hover:text-rose-800 font-bold">Hapus</button>` : '<span class="text-slate-400 text-[11px]">Utama</span>'}
            </td>
          </tr>
        `;
      }).join('');
    }

    async function adminCreateUser(e) {
      e.preventDefault();
      const role = document.getElementById('new-user-role').value;
      const data = {
        username: document.getElementById('new-user-username').value.trim(),
        password: document.getElementById('new-user-password').value.trim(),
        nama_lengkap: document.getElementById('new-user-nama').value.trim(),
        role,
        kelas: role === 'siswa' ? document.getElementById('new-user-kelas').value : '-',
        jurusan: role === 'siswa' ? document.getElementById('new-user-jurusan').value : '-'
      };
      try {
        await apiRequest('addUser', { data });
        e.target.reset();
        toggleSiswaFields();
        showToast('Pengguna berhasil ditambahkan!', 'success');
        await syncAllData(false);
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function adminDeleteUser(id_user) {
      try {
        await apiRequest('deleteUser', { id_user });
        showToast('Pengguna dihapus.', 'info');
        await syncAllData(false);
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    function renderAdminMaster() {
      const tbody = document.getElementById('admin-master-tbody');
      tbody.innerHTML = appState.db.master.map(m => `
        <tr class="hover:bg-slate-50/80">
          <td class="py-3 px-4 font-mono text-slate-500">${m.id_master}</td>
          <td class="py-3 px-4"><span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${m.tipe === 'kelas' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}">${m.tipe}</span></td>
          <td class="py-3 px-4 font-bold text-slate-900">${m.nama}</td>
          <td class="py-3 px-4 text-right">
            <button onclick="adminDeleteMaster('${m.id_master}')" class="text-rose-600 hover:text-rose-800 font-bold">Hapus</button>
          </td>
        </tr>
      `).join('');
    }

    async function adminCreateMaster(e) {
      e.preventDefault();
      const data = {
        tipe: document.getElementById('new-master-tipe').value,
        nama: document.getElementById('new-master-nama').value.trim()
      };
      try {
        await apiRequest('addMaster', { data });
        e.target.reset();
        showToast('Master kelas/jurusan ditambahkan!', 'success');
        await syncAllData(false);
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function adminDeleteMaster(id_master) {
      try {
        await apiRequest('deleteMaster', { id_master });
        showToast('Master data dihapus.', 'info');
        await syncAllData(false);
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // =========================================================================
    // 6. LOGIKA ROLE: GURU (MATERI VIDEO + SOAL + KOREKSI)
    // =========================================================================
    function switchGuruTab(tab) {
      ['materi', 'koreksi'].forEach(t => {
        document.getElementById(`guru-content-${t}`).classList.add('hidden');
        document.getElementById(`tab-guru-${t}`).className = 'px-4 py-2 rounded-xl text-xs font-bold bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 transition';
      });
      document.getElementById(`guru-content-${tab}`).classList.remove('hidden');
      document.getElementById(`tab-guru-${tab}`).className = 'px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white transition';
    }

    function renderGuruDashboard() {
      const currentUser = appState.session.user;
      const myMateri = appState.db.materi.filter(m => m.id_guru === currentUser.id_user || currentUser.role === 'admin');
      const listContainer = document.getElementById('guru-materi-list');

      if (myMateri.length === 0) {
        listContainer.innerHTML = `<div class="bg-white p-8 rounded-2xl border border-dashed border-slate-300 text-center text-xs text-slate-500">Belum ada materi video. Silakan buat materi pertama Anda di formulir samping.</div>`;
      } else {
        listContainer.innerHTML = myMateri.map(m => {
          const soalCount = appState.db.soal.filter(s => s.id_materi === m.id_materi).length;
          return `
            <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div class="space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md text-[10px] font-bold">${m.mapel}</span>
                  <span class="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[10px] font-bold">Kelas ${m.kelas} ${m.jurusan}</span>
                  <span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-bold">${soalCount} Soal</span>
                </div>
                <h4 class="font-bold text-slate-900 text-sm">${m.judul_materi}</h4>
                <p class="text-xs text-slate-500 line-clamp-1">${m.deskripsi}</p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button onclick="openSoalModal('${m.id_materi}')" class="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5">
                  <i data-lucide="file-question" class="w-3.5 h-3.5"></i> Kelola Soal
                </button>
                <button onclick="guruDeleteMateri('${m.id_materi}')" class="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition" title="Hapus Materi">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              </div>
            </div>
          `;
        }).join('');
      }

      // Render Daftar Jawaban Siswa
      const myMateriIds = myMateri.map(m => m.id_materi);
      const submissions = appState.db.jawaban.filter(j => myMateriIds.includes(j.id_materi));
      const subTbody = document.getElementById('guru-submissions-tbody');

      if (submissions.length === 0) {
        subTbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">Belum ada siswa yang mengumpulkan latihan soal.</td></tr>`;
      } else {
        subTbody.innerHTML = submissions.map(sub => {
          const materiObj = appState.db.materi.find(m => m.id_materi === sub.id_materi);
          const isDone = sub.status_koreksi === 'Sudah Dikoreksi';
          return `
            <tr class="hover:bg-slate-50">
              <td class="py-3 px-4 font-bold text-slate-900">${sub.nama_siswa}<span class="block text-[11px] font-normal text-slate-500">${sub.kelas} ${sub.jurusan}</span></td>
              <td class="py-3 px-4 text-slate-700 font-medium">${materiObj ? materiObj.judul_materi : sub.id_materi}</td>
              <td class="py-3 px-4 font-mono font-bold text-blue-700">${sub.skor_pg}</td>
              <td class="py-3 px-4 font-mono font-bold text-purple-700">${sub.skor_esai}</td>
              <td class="py-3 px-4 font-mono font-extrabold text-slate-900 text-sm">${sub.total_nilai}</td>
              <td class="py-3 px-4">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isDone ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${sub.status_koreksi}</span>
              </td>
              <td class="py-3 px-4 text-right">
                <button onclick="openKoreksiModal('${sub.id_submit}')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition">
                  Periksa / Nilai
                </button>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    async function guruCreateMateri(e) {
      e.preventDefault();
      const user = appState.session.user;
      const data = {
        id_guru: user.id_user,
        nama_guru: user.nama_lengkap,
        mapel: document.getElementById('materi-mapel').value.trim(),
        kelas: document.getElementById('materi-kelas').value,
        jurusan: document.getElementById('materi-jurusan').value,
        judul_materi: document.getElementById('materi-judul').value.trim(),
        youtube_url: document.getElementById('materi-youtube').value.trim(),
        deskripsi: document.getElementById('materi-deskripsi').value.trim()
      };
      try {
        await apiRequest('addMateri', { data });
        e.target.reset();
        showToast('Materi video berhasil dipublikasikan!', 'success');
        await syncAllData(false);
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function guruDeleteMateri(id_materi) {
      try {
        await apiRequest('deleteMateri', { id_materi });
        showToast('Materi dan soal terkait berhasil dihapus.', 'info');
        await syncAllData(false);
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // Modal Soal Management
    function openSoalModal(id_materi) {
      const materi = appState.db.materi.find(m => m.id_materi === id_materi);
      if (!materi) return;
      document.getElementById('soal-id-materi').value = id_materi;
      document.getElementById('soal-modal-title').textContent = `Bank Soal: ${materi.judul_materi}`;
      document.getElementById('soal-modal').classList.remove('hidden');
      renderModalSoalList(id_materi);
    }

    function closeSoalModal() {
      document.getElementById('soal-modal').classList.add('hidden');
      renderGuruDashboard();
      lucide.createIcons();
    }

    function toggleSoalTypeFields() {
      const tipe = document.getElementById('soal-tipe').value;
      document.getElementById('pg-options-container').style.display = tipe === 'pg' ? 'block' : 'none';
    }

    function renderModalSoalList(id_materi) {
      const soalList = appState.db.soal
        .filter(s => s.id_materi === id_materi)
        .sort((a, b) => Number(a.nomor_urut) - Number(b.nomor_urut));

      document.getElementById('soal-nomor').value = soalList.length + 1;
      const totalBobot = soalList.reduce((sum, s) => sum + Number(s.bobot_poin || 0), 0);
      document.getElementById('soal-total-bobot').textContent = `Total Bobot: ${totalBobot} Poin`;

      const container = document.getElementById('modal-soal-list');
      if (soalList.length === 0) {
        container.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">Belum ada soal untuk materi ini.</div>`;
        return;
      }

      container.innerHTML = soalList.map(s => `
        <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-start justify-between gap-3">
          <div class="space-y-1 text-xs">
            <div class="flex items-center gap-2">
              <span class="font-bold text-slate-900">No. ${s.nomor_urut}</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${s.tipe_soal === 'pg' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}">${s.tipe_soal}</span>
              <span class="text-[11px] font-semibold text-slate-500">Bobot: ${s.bobot_poin}</span>
              ${s.tipe_soal === 'pg' ? `<span class="text-[11px] font-bold text-emerald-700">Kunci: ${s.kunci_pg}</span>` : ''}
            </div>
            <p class="text-slate-800 font-medium">${s.pertanyaan}</p>
            ${s.tipe_soal === 'pg' ? `<p class="text-[11px] text-slate-500">A: ${s.opsi_a} | B: ${s.opsi_b} | C: ${s.opsi_c} | D: ${s.opsi_d} ${s.opsi_e ? '| E: ' + s.opsi_e : ''}</p>` : ''}
          </div>
          <button onclick="guruDeleteSoal('${s.id_soal}', '${id_materi}')" class="text-rose-600 hover:text-rose-800 text-xs font-bold shrink-0">Hapus</button>
        </div>
      `).join('');
    }

    async function guruCreateSoal(e) {
      e.preventDefault();
      const id_materi = document.getElementById('soal-id-materi').value;
      const tipe = document.getElementById('soal-tipe').value;
      const data = {
        id_materi,
        nomor_urut: Number(document.getElementById('soal-nomor').value),
        tipe_soal: tipe,
        pertanyaan: document.getElementById('soal-pertanyaan').value.trim(),
        opsi_a: tipe === 'pg' ? document.getElementById('soal-opsi-a').value.trim() : '',
        opsi_b: tipe === 'pg' ? document.getElementById('soal-opsi-b').value.trim() : '',
        opsi_c: tipe === 'pg' ? document.getElementById('soal-opsi-c').value.trim() : '',
        opsi_d: tipe === 'pg' ? document.getElementById('soal-opsi-d').value.trim() : '',
        opsi_e: tipe === 'pg' ? document.getElementById('soal-opsi-e').value.trim() : '',
        kunci_pg: tipe === 'pg' ? document.getElementById('soal-kunci').value : '',
        bobot_poin: Number(document.getElementById('soal-bobot').value)
      };
      try {
        await apiRequest('addSoal', { data });
        document.getElementById('soal-pertanyaan').value = '';
        ['a', 'b', 'c', 'd', 'e'].forEach(opt => document.getElementById(`soal-opsi-${opt}`).value = '');
        showToast('Soal ditambahkan!', 'success');
        await syncAllData(false);
        renderModalSoalList(id_materi);
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function guruDeleteSoal(id_soal, id_materi) {
      try {
        await apiRequest('deleteSoal', { id_soal });
        showToast('Soal dihapus.', 'info');
        await syncAllData(false);
        renderModalSoalList(id_materi);
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // Modal Koreksi Jawaban Siswa
    function openKoreksiModal(id_submit) {
      const sub = appState.db.jawaban.find(j => j.id_submit === id_submit);
      if (!sub) return;
      const soalList = appState.db.soal.filter(s => s.id_materi === sub.id_materi).sort((a, b) => Number(a.nomor_urut) - Number(b.nomor_urut));
      let detailObj = {};
      try { detailObj = typeof sub.detail_jawaban === 'string' ? JSON.parse(sub.detail_jawaban) : sub.detail_jawaban; } catch (e) {}

      document.getElementById('koreksi-id-submit').value = id_submit;
      document.getElementById('koreksi-modal-sub').textContent = `Siswa: ${sub.nama_siswa} (${sub.kelas} ${sub.jurusan})`;
      document.getElementById('koreksi-skor-pg').value = sub.skor_pg;
      document.getElementById('koreksi-skor-esai').value = sub.skor_esai;
      document.getElementById('koreksi-catatan').value = sub.catatan_guru || '';

      document.getElementById('koreksi-detail-list').innerHTML = soalList.map(s => {
        const jwb = detailObj[s.id_soal] || '(Tidak dijawab)';
        const isCorrect = s.tipe_soal === 'pg' && String(jwb).toUpperCase() === String(s.kunci_pg).toUpperCase();
        return `
          <div class="p-3.5 rounded-xl border border-slate-200 bg-white text-xs space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="font-bold text-slate-900">Soal #${s.nomor_urut} (${s.tipe_soal.toUpperCase()} • Bobot ${s.bobot_poin})</span>
              ${s.tipe_soal === 'pg'
                ? `<span class="px-2 py-0.5 rounded font-bold ${isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${isCorrect ? 'Benar (+' + s.bobot_poin + ')' : 'Salah (Kunci: ' + s.kunci_pg + ')'}</span>`
                : `<span class="px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800">Perlu Penilaian Esai</span>`
              }
            </div>
            <p class="text-slate-700 font-medium">${s.pertanyaan}</p>
            <div class="p-2.5 bg-slate-50 rounded-lg border border-slate-200 font-medium text-slate-900">
              Jawaban Siswa: <span class="font-bold text-blue-700">${jwb}</span>
            </div>
          </div>
        `;
      }).join('');

      document.getElementById('koreksi-modal').classList.remove('hidden');
    }

    function closeKoreksiModal() {
      document.getElementById('koreksi-modal').classList.add('hidden');
    }

    async function submitKoreksiGuru(e) {
      e.preventDefault();
      const id_submit = document.getElementById('koreksi-id-submit').value;
      const skor_pg = Number(document.getElementById('koreksi-skor-pg').value);
      const skor_esai = Number(document.getElementById('koreksi-skor-esai').value);
      const catatan_guru = document.getElementById('koreksi-catatan').value.trim();

      try {
        await apiRequest('koreksiJawaban', {
          data: {
            id_submit,
            skor_esai,
            total_nilai: skor_pg + skor_esai,
            catatan_guru
          }
        });
        closeKoreksiModal();
        showToast('Nilai koreksi berhasil disimpan!', 'success');
        await syncAllData(false);
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // =========================================================================
    // 7. LOGIKA ROLE: SISWA (AKSES VIDEO + KERJAKAN SOAL)
    // =========================================================================
    function renderSiswaDashboard() {
      const siswa = appState.session.user;
      document.getElementById('siswa-welcome-title').textContent = `Halo, ${siswa.nama_lengkap}!`;
      document.getElementById('siswa-welcome-sub').textContent = `Kelas ${siswa.kelas} • Jurusan ${siswa.jurusan} — Pilih materi video untuk belajar dan mengerjakan latihan.`;

      const myMateri = appState.db.materi.filter(m =>
        String(m.kelas).toUpperCase() === String(siswa.kelas).toUpperCase() &&
        String(m.jurusan).toUpperCase() === String(siswa.jurusan).toUpperCase()
      );
      const mySubmissions = appState.db.jawaban.filter(j => j.id_siswa === siswa.id_user);

      document.getElementById('siswa-stat-materi').textContent = myMateri.length;
      document.getElementById('siswa-stat-selesai').textContent = mySubmissions.length;

      const grid = document.getElementById('siswa-materi-grid');
      if (myMateri.length === 0) {
        grid.innerHTML = `<div class="col-span-full bg-white p-10 rounded-2xl border border-dashed border-slate-300 text-center text-sm text-slate-500">Belum ada materi video yang dipublikasikan untuk kelas ${siswa.kelas} ${siswa.jurusan}.</div>`;
        return;
      }

      grid.innerHTML = myMateri.map(m => {
        const sub = mySubmissions.find(s => s.id_materi === m.id_materi);
        const soalCount = appState.db.soal.filter(s => s.id_materi === m.id_materi).length;
        const ytId = extractYouTubeId(m.youtube_url);
        const thumb = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : 'https://placehold.co/640x360/1e293b/ffffff?text=Video+Materi';

        return `
          <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition">
            <div class="relative aspect-video bg-slate-900 overflow-hidden">
              <img src="${thumb}" alt="${m.judul_materi}" class="w-full h-full object-cover opacity-90" />
              <span class="absolute top-3 left-3 px-2.5 py-1 bg-slate-950/80 backdrop-blur text-white text-[10px] font-bold rounded-lg">${m.mapel}</span>
              ${sub ? `<span class="absolute top-3 right-3 px-2.5 py-1 bg-emerald-600 text-white text-[10px] font-bold rounded-lg shadow">Nilai: ${sub.total_nilai}</span>` : ''}
            </div>
            <div class="p-4 flex-1 flex flex-col justify-between space-y-4">
              <div>
                <h3 class="font-bold text-slate-900 text-sm line-clamp-2">${m.judul_materi}</h3>
                <p class="text-[11px] text-slate-500 mt-1">Guru: ${m.nama_guru}</p>
                <p class="text-xs text-slate-600 mt-2 line-clamp-2">${m.deskripsi}</p>
              </div>
              <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span class="text-[11px] font-bold text-slate-500">${soalCount} Latihan Soal</span>
                <button onclick="openBelajarModal('${m.id_materi}')" class="px-4 py-2 ${sub ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'} text-white text-xs font-bold rounded-xl transition">
                  ${sub ? 'Lihat Hasil & Video' : 'Mulai Belajar'}
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function extractYouTubeId(url) {
      if (!url) return '';
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
      const match = url.match(regExp);
      return (match && match[2].length === 11) ? match[2] : '';
    }

    function openBelajarModal(id_materi) {
      const materi = appState.db.materi.find(m => m.id_materi === id_materi);
      if (!materi) return;
      const siswa = appState.session.user;
      const soalList = appState.db.soal.filter(s => s.id_materi === id_materi).sort((a, b) => Number(a.nomor_urut) - Number(b.nomor_urut));
      const existingSub = appState.db.jawaban.find(j => j.id_materi === id_materi && j.id_siswa === siswa.id_user);

      document.getElementById('belajar-mapel-badge').textContent = materi.mapel;
      document.getElementById('belajar-judul').textContent = materi.judul_materi;
      document.getElementById('belajar-deskripsi').textContent = materi.deskripsi;
      document.getElementById('belajar-soal-count').textContent = `${soalList.length} Soal`;

      const ytId = extractYouTubeId(materi.youtube_url);
      document.getElementById('belajar-youtube-iframe').src = ytId ? `https://www.youtube.com/embed/${ytId}` : '';

      const container = document.getElementById('belajar-soal-container');

      if (soalList.length === 0) {
        container.innerHTML = `<div class="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">Belum ada soal latihan pada materi ini.</div>`;
      } else if (existingSub) {
        // Tampilkan Hasil Penilaian jika sudah mengerjakan
        container.innerHTML = `
          <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span class="text-xs font-bold uppercase text-emerald-700">Status: ${existingSub.status_koreksi}</span>
                <h5 class="text-lg font-extrabold text-emerald-950">Total Nilai Anda: ${existingSub.total_nilai}</h5>
              </div>
              <div class="flex gap-3 text-xs font-bold">
                <span class="px-3 py-1.5 bg-white rounded-xl border border-emerald-200 text-blue-700">Skor PG: ${existingSub.skor_pg}</span>
                <span class="px-3 py-1.5 bg-white rounded-xl border border-emerald-200 text-purple-700">Skor Esai: ${existingSub.skor_esai}</span>
              </div>
            </div>
            ${existingSub.catatan_guru ? `<div class="p-3 bg-white rounded-xl border border-emerald-200 text-xs text-slate-700"><b>Catatan Guru:</b> ${existingSub.catatan_guru}</div>` : ''}
          </div>
        `;
      } else {
        // Form Pengerjaan Soal Siswa
        container.innerHTML = `
          <form onsubmit="siswaSubmitJawaban(event, '${id_materi}')" class="space-y-4">
            ${soalList.map(s => `
              <div class="p-4 bg-white rounded-2xl border border-slate-200 space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-extrabold text-blue-700">Pertanyaan #${s.nomor_urut}</span>
                  <span class="text-[11px] font-semibold text-slate-400">Bobot: ${s.bobot_poin} Poin</span>
                </div>
                <p class="text-sm font-semibold text-slate-900">${s.pertanyaan}</p>
                ${s.tipe_soal === 'pg' ? `
                  <div class="space-y-2 pt-1">
                    ${['A', 'B', 'C', 'D', 'E'].map(opt => {
                      const val = s['opsi_' + opt.toLowerCase()];
                      if (!val) return '';
                      return `
                        <label class="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 hover:bg-blue-50/50 cursor-pointer text-xs">
                          <input type="radio" name="ans_${s.id_soal}" value="${opt}" required class="w-4 h-4 text-blue-600" />
                          <span class="font-bold text-slate-700">${opt}.</span>
                          <span class="text-slate-800">${val}</span>
                        </label>
                      `;
                    }).join('')}
                  </div>
                ` : `
                  <textarea name="ans_${s.id_soal}" rows="3" required placeholder="Tuliskan jawaban esai Anda dengan jelas..." class="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs"></textarea>
                `}
              </div>
            `).join('')}
            <button type="submit" class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/20 transition">
              Kirim Semua Jawaban Latihan
            </button>
          </form>
        `;
      }

      document.getElementById('belajar-modal').classList.remove('hidden');
    }

    function closeBelajarModal() {
      document.getElementById('belajar-youtube-iframe').src = '';
      document.getElementById('belajar-modal').classList.add('hidden');
    }

    async function siswaSubmitJawaban(e, id_materi) {
      e.preventDefault();
      const siswa = appState.session.user;
      const soalList = appState.db.soal.filter(s => s.id_materi === id_materi);
      const formData = new FormData(e.target);

      let detail_jawaban = {};
      let skor_pg = 0;
      let hasEsai = false;

      soalList.forEach(s => {
        const ans = formData.get(`ans_${s.id_soal}`) || '';
        detail_jawaban[s.id_soal] = ans;
        if (s.tipe_soal === 'pg') {
          if (String(ans).toUpperCase() === String(s.kunci_pg).toUpperCase()) {
            skor_pg += Number(s.bobot_poin || 0);
          }
        } else {
          hasEsai = true;
        }
      });

      const data = {
        id_materi,
        id_siswa: siswa.id_user,
        nama_siswa: siswa.nama_lengkap,
        kelas: siswa.kelas,
        jurusan: siswa.jurusan,
        detail_jawaban,
        skor_pg,
        skor_esai: 0,
        total_nilai: skor_pg,
        status_koreksi: hasEsai ? 'Menunggu Koreksi Esai' : 'Sudah Dikoreksi',
        catatan_guru: ''
      };

      try {
        await apiRequest('submitJawaban', { data });
        showToast('Jawaban berhasil dikirim!', 'success');
        await syncAllData(false);
        openBelajarModal(id_materi);
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // =========================================================================
    // 8. MODAL GAS & TOAST NOTIFICATIONS
    // =========================================================================
    function toggleGasModal(show) {
      const modal = document.getElementById('gas-modal');
      if (show) modal.classList.remove('hidden');
      else modal.classList.add('hidden');
    }

    function saveGasUrl() {
      const url = document.getElementById('gas-url-input').value.trim();
      appState.gasUrl = url || GAS_WEBAPP_URL;
      localStorage.setItem('edusmart_gas_url', appState.gasUrl);
      updateConnectionBadge();
      toggleGasModal(false);
      showToast(appState.gasUrl ? 'URL Backend Apps Script berhasil disimpan!' : 'Beralih ke Mode Demo.', 'success');
      if (appState.session) syncAllData(false);
    }

    function copyGasCode() {
      const textarea = document.createElement('textarea');
      textarea.value = GAS_BACKEND_CODE;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast('Kode Code.gs berhasil disalin ke clipboard!', 'success');
    }

    function showToast(message, type = 'info') {
      const container = document.getElementById('toast-container');
      const colors = {
        success: 'bg-emerald-600 text-white',
        error: 'bg-rose-600 text-white',
        info: 'bg-slate-900 text-white'
      };
      const toast = document.createElement('div');
      toast.className = `${colors[type] || colors.info} px-4 py-3 rounded-xl shadow-lg text-xs font-semibold flex items-center justify-between gap-3 pointer-events-auto fade-in`;
      toast.innerHTML = `<span>${message}</span>`;
      container.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }
