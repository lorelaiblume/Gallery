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
    renderGallery();
  });
});

// ── Gallery (loads from server) ───────────────────────────────────────────────
async function renderGallery() {
  gallery.innerHTML = '';
  const all = await fetch('/api/gallery').then(r => r.json());
  const items = all.filter(i => i.category === currentCategory);
  for (const item of items) {
    if (item.filename.endsWith('.pdf')) {
      await renderPDF(item);
    } else {
      renderImage(item);
    }
  }
}

function renderImage(item) {
  const el = createItem(item);
  const img = document.createElement('img');
  img.src = `/uploads/${item.filename}`;
  el.insertBefore(img, el.querySelector('.art-title'));
  gallery.appendChild(el);
}

async function renderPDF(item) {
  if (!window.pdfjsLib) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const pdf = await pdfjsLib.getDocument(`/uploads/${item.filename}`).promise;
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
    if (item) await fetch(`/api/delete/${item.id}`, { method: 'DELETE' });
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
        fetch('/api/title', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id, title: titleInput.value })
        });
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

async function handleFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') continue;
    const form = new FormData();
    form.append('file', file);
    form.append('category', currentCategory);
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    const item = await res.json();
    if (file.type === 'application/pdf') {
      await renderPDF(item);
    } else {
      renderImage(item);
    }
  }
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

// Try to pre-fill the IP automatically
fetch('/api/ip').then(r => r.json()).then(d => {
  if (d.ip && d.ip !== 'localhost') ipInput.value = d.ip;
}).catch(() => {});

qrBtn.addEventListener('click', () => qrModal.classList.remove('hidden'));
qrClose.addEventListener('click', () => qrModal.classList.add('hidden'));
qrModal.addEventListener('click', e => { if (e.target === qrModal) qrModal.classList.add('hidden'); });

generateQrBtn.addEventListener('click', () => {
  const ip = ipInput.value.trim();
  if (!ip) { ipInput.focus(); return; }
  const url = `http://${ip}:8765`;
  qrCodeEl.innerHTML = '';
  qrCodeEl.classList.remove('hidden');
  qrSetup.classList.add('hidden');
  qrUrlEl.textContent = url;
  new QRCode(qrCodeEl, { text: url, width: 200, height: 200, colorDark: '#111', colorLight: '#fff' });
});

ipInput.addEventListener('keydown', e => { if (e.key === 'Enter') generateQrBtn.click(); });

// ── Init ──────────────────────────────────────────────────────────────────────
renderGallery();

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}
