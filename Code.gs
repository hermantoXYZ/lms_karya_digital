/**
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
}
