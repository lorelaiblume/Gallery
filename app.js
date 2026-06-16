// ── URL param: ?edit shows upload UI ─────────────────────────────────────────
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
let currentCategory = 'digital';

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    navBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = btn.dataset.category;
    renderGallery(currentCategory);
  });
});

// ── IndexedDB ─────────────────────────────────────────────────────────────────
let db;
const DB_NAME = 'lorelai-gallery-v2';
const STORE = 'pieces';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      const store = e.target.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      store.createIndex('category', 'category', { unique: false });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = reject;
  });
}

function saveItem(data) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).add(data);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = reject;
  });
}

function updateTitle(id, title) {
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const req = store.get(id);
  req.onsuccess = e => {
    const record = e.target.result;
    if (record) { record.title = title; store.put(record); }
  };
}

function deleteItem(id) {
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(id);
}

function loadByCategory(category) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.objectStore(STORE).index('category');
    const req = index.getAll(category);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = reject;
  });
}

// ── Render ────────────────────────────────────────────────────────────────────
async function renderGallery(category) {
  gallery.innerHTML = '';
  const items = await loadByCategory(category);
  for (const item of items) {
    if (item.fileType === 'pdf') {
      await renderPDFData(item.data, item.id, item.title);
    } else {
      renderImageData(item.data, item.id, item.title);
    }
  }
}

(async () => {
  db = await openDB();
  renderGallery(currentCategory);
})();

// ── Upload ────────────────────────────────────────────────────────────────────
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');

browseBtn?.addEventListener('click', () => fileInput.click());
fileInput?.addEventListener('change', e => handleFiles(e.target.files));

uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
});

function handleFiles(files) {
  [...files].forEach(async file => {
    if (file.type === 'application/pdf') {
      const buf = await file.arrayBuffer();
      const id = await saveItem({ fileType: 'pdf', data: buf, title: '', category: currentCategory });
      await renderPDFData(buf, id, '');
    } else if (file.type.startsWith('image/')) {
      const dataURL = await toDataURL(file);
      const id = await saveItem({ fileType: 'image', data: dataURL, title: '', category: currentCategory });
      renderImageData(dataURL, id, '');
    }
  });
}

function toDataURL(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

function renderImageData(dataURL, id, title) {
  const item = createItem(id, title);
  const img = document.createElement('img');
  img.src = dataURL;
  item.insertBefore(img, item.querySelector('.art-title'));
  gallery.appendChild(item);
}

async function renderPDFData(buf, id, title) {
  if (!window.pdfjsLib) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const pdf = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const el = createItem(i === 1 ? id : null, i === 1 ? title : '');
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

function createItem(id, title) {
  const el = document.createElement('div');
  el.className = 'gallery-item';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-btn';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => {
    if (id != null) deleteItem(id);
    el.remove();
  });
  el.appendChild(removeBtn);

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'art-title';
  titleInput.placeholder = 'Title';
  titleInput.value = title || '';
  if (id != null) {
    titleInput.addEventListener('input', () => updateTitle(id, titleInput.value));
  }
  el.appendChild(titleInput);
  return el;
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

qrBtn.addEventListener('click', () => {
  // If on a real domain, just QR the current URL
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    const url = window.location.origin;
    qrCodeEl.innerHTML = '';
    qrCodeEl.classList.remove('hidden');
    if (qrSetup) qrSetup.classList.add('hidden');
    qrUrlEl.textContent = url;
    new QRCode(qrCodeEl, { text: url, width: 200, height: 200, colorDark: '#111', colorLight: '#fff' });
  }
  qrModal.classList.remove('hidden');
});

qrClose.addEventListener('click', () => qrModal.classList.add('hidden'));
qrModal.addEventListener('click', e => { if (e.target === qrModal) qrModal.classList.add('hidden'); });

generateQrBtn?.addEventListener('click', () => {
  const ip = ipInput.value.trim();
  if (!ip) { ipInput.focus(); return; }
  const url = `http://${ip}:8765`;
  qrCodeEl.innerHTML = '';
  qrCodeEl.classList.remove('hidden');
  qrSetup.classList.add('hidden');
  qrUrlEl.textContent = url;
  new QRCode(qrCodeEl, { text: url, width: 200, height: 200, colorDark: '#111', colorLight: '#fff' });
});

ipInput?.addEventListener('keydown', e => { if (e.key === 'Enter') generateQrBtn.click(); });

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}
