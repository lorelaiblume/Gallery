// ── Firebase init ─────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBqcTGjJDyGk71hrbqo9fQk5Iz82LMuEz0",
  authDomain: "lorelai-blume-gallery.firebaseapp.com",
  projectId: "lorelai-blume-gallery",
  storageBucket: "lorelai-blume-gallery.firebasestorage.app",
  messagingSenderId: "921923872934",
  appId: "1:921923872934:web:2177895d7817a267132c67",
  measurementId: "G-53XC5MSN88"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

// ── URL param: ?edit ──────────────────────────────────────────────────────────
const isEditMode = new URLSearchParams(window.location.search).has('edit');

if (isEditMode) {
  document.body.classList.add('edit-mode');
  document.getElementById('uploadArea').classList.remove('hidden');
  document.getElementById('editLink').href = window.location.pathname;
  document.getElementById('editLink').title = 'Back to gallery';
  document.getElementById('editLink').textContent = '✕';
} else {
  document.body.classList.add('view-mode');
  document.getElementById('editLink').href = '?edit';
}

// ── Nav ───────────────────────────────────────────────────────────────────────
const navBtns = document.querySelectorAll('.nav-btn');
const gallery = document.getElementById('gallery');
const loadingMsg = document.getElementById('loadingMsg');
let currentCategory = 'digital';
let unsubscribe = null;

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    navBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = btn.dataset.category;
    listenToGallery(currentCategory);
  });
});

// ── Real-time gallery listener ────────────────────────────────────────────────
function listenToGallery(category) {
  if (unsubscribe) unsubscribe();
  gallery.innerHTML = '<div class="loading" id="loadingMsg">Loading...</div>';

  unsubscribe = db.collection('pieces')
    .where('category', '==', category)
    .orderBy('createdAt', 'asc')
    .onSnapshot(async snapshot => {
      gallery.innerHTML = '';
      for (const doc of snapshot.docs) {
        const item = doc.data();
        item.id = doc.id;
        if (item.filename && item.filename.endsWith('.pdf')) {
          await renderPDF(item);
        } else {
          renderImage(item);
        }
      }
    }, err => {
      console.error(err);
      gallery.innerHTML = '<p style="color:#999;text-align:center;padding:40px">Error loading gallery.</p>';
    });
}

listenToGallery(currentCategory);

// ── Render ────────────────────────────────────────────────────────────────────
function renderImage(item) {
  const el = createItem(item);
  const img = document.createElement('img');
  img.src = item.url;
  el.insertBefore(img, el.querySelector('.art-title'));
  gallery.appendChild(el);
}

async function renderPDF(item) {
  if (!window.pdfjsLib) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const pdf = await pdfjsLib.getDocument(item.url).promise;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const el = createItem(i === 1 ? item : null, i === 1 ? item.title : '');
    el.insertBefore(canvas, el.querySelector('.art-title'));
    if (pdf.numPages > 1) {
      const label = document.createElement('p');
      label.className = 'pdf-label';
      label.textContent = `page ${i}`;
      el.querySelector('.art-title').insertAdjacentElement('beforebegin', label);
    }
    gallery.appendChild(el);
  }
}

function createItem(item, titleOverride) {
  const el = document.createElement('div');
  el.className = 'gallery-item';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-btn';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', async () => {
    if (item) {
      await db.collection('pieces').doc(item.id).delete();
      if (item.storagePath) {
        try { await storage.ref(item.storagePath).delete(); } catch {}
      }
    }
    el.remove();
  });
  el.appendChild(removeBtn);

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'art-title';
  titleInput.placeholder = 'Title';
  titleInput.value = (titleOverride !== undefined ? titleOverride : item?.title) || '';
  if (item) {
    let timer;
    titleInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        db.collection('pieces').doc(item.id).update({ title: titleInput.value });
      }, 500);
    });
  }
  el.appendChild(titleInput);
  return el;
}

// ── Upload ────────────────────────────────────────────────────────────────────
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');

browseBtn?.addEventListener('click', () => fileInput.click());
fileInput?.addEventListener('change', e => handleFiles(e.target.files));
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', e => { e.preventDefault(); uploadArea.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); });

async function uploadFile(file, category) {
  const ext = file.name.split('.').pop();
  const storagePath = `pieces/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const ref = storage.ref(storagePath);
  await ref.put(file);
  const url = await ref.getDownloadURL();
  const doc = await db.collection('pieces').add({
    url,
    storagePath,
    filename: file.name,
    category,
    title: '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return { id: doc.id, url, storagePath, filename: file.name, category, title: '' };
}

async function handleFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') continue;
    await uploadFile(file, currentCategory);
    // onSnapshot will update the gallery automatically
  }
}

// ── Bulk import from IndexedDB ────────────────────────────────────────────────
const bulkImportBtn = document.getElementById('bulkImportBtn');
bulkImportBtn?.addEventListener('click', async () => {
  bulkImportBtn.textContent = 'Importing...';
  bulkImportBtn.disabled = true;
  try {
    const items = await getIndexedDBItems();
    if (items.length === 0) {
      alert('No art found in local browser storage!');
      bulkImportBtn.textContent = 'Bulk Import from This Browser';
      bulkImportBtn.disabled = false;
      return;
    }
    let count = 0;
    for (const item of items) {
      const blob = item.fileType === 'pdf'
        ? new Blob([item.data], { type: 'application/pdf' })
        : await fetch(item.data).then(r => r.blob());
      const ext = item.fileType === 'pdf' ? 'pdf' : 'jpg';
      const file = new File([blob], `art_${Date.now()}.${ext}`, { type: blob.type });
      await uploadFile(file, item.category || 'digital');
      if (item.title) {
        // title will be updated after upload via onSnapshot — we handle it separately
      }
      count++;
      bulkImportBtn.textContent = `Importing... (${count}/${items.length})`;
    }
    alert(`Done! Imported ${count} pieces.`);
  } catch (e) {
    alert('Import failed: ' + e.message);
  }
  bulkImportBtn.textContent = 'Bulk Import from This Browser';
  bulkImportBtn.disabled = false;
});

function getIndexedDBItems() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('lorelai-gallery-v2');
    req.onerror = () => resolve([]);
    req.onsuccess = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('pieces')) { resolve([]); return; }
      const tx = db.transaction('pieces', 'readonly');
      tx.objectStore('pieces').getAll().onsuccess = ev => resolve(ev.target.result || []);
    };
    req.onupgradeneeded = () => resolve([]);
  });
}

// ── QR Code ───────────────────────────────────────────────────────────────────
const qrBtn = document.getElementById('qrBtn');
const qrModal = document.getElementById('qrModal');
const qrClose = document.getElementById('qrClose');
const qrCodeEl = document.getElementById('qrCode');
const qrUrlEl = document.getElementById('qrUrl');
const generateQrBtn = document.getElementById('generateQr');
const ipInput = document.getElementById('ipInput');
const qrSetup = document.getElementById('qrSetup');

let qrGenerated = false;
qrBtn.addEventListener('click', () => {
  if (!qrGenerated) {
    const url = window.location.origin;
    qrCodeEl.innerHTML = '';
    qrUrlEl.textContent = url;
    new QRCode(qrCodeEl, { text: url, width: 200, height: 200, colorDark: '#111', colorLight: '#fff' });
    qrGenerated = true;
  }
  qrModal.classList.remove('hidden');
});

qrModal.addEventListener('click', () => qrModal.classList.add('hidden'));

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}
