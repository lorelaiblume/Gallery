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
const auth = firebase.auth();
const OWNER_EMAIL = 'lorelaiblume@gmail.com';

// ── Auth ──────────────────────────────────────────────────────────────────────
const editLink = document.getElementById('editLink');
const uploadArea = document.getElementById('uploadArea');

function enterEditMode() {
  document.body.classList.remove('view-mode');
  document.body.classList.add('edit-mode');
  if (currentCategory !== 'film' && currentCategory !== 'apps') uploadArea.classList.remove('hidden');
  editLink.textContent = '✕';
  editLink.title = 'Exit edit mode';
  if (currentCategory === 'film') listenToFilms();
}

function exitEditMode() {
  document.body.classList.remove('edit-mode');
  document.body.classList.add('view-mode');
  uploadArea.classList.add('hidden');
  editLink.textContent = '✎';
  editLink.title = 'Edit gallery';
  if (currentCategory === 'film') listenToFilms();
}

document.body.classList.add('view-mode');

editLink.addEventListener('click', async e => {
  e.preventDefault();
  if (document.body.classList.contains('edit-mode')) {
    await auth.signOut();
    exitEditMode();
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const result = await auth.signInWithPopup(provider);
    if (result.user.email === OWNER_EMAIL) {
      enterEditMode();
    } else {
      await auth.signOut();
      alert('Sorry, only Lorelai can edit this gallery!');
    }
  } catch (e) {
    console.error(e);
  }
});

// ── Nav ───────────────────────────────────────────────────────────────────────
const navBtns = document.querySelectorAll('.nav-btn');
const gallery = document.getElementById('gallery');
let currentCategory = 'digital';
let unsubscribe = null;

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    navBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = btn.dataset.category;

    if (currentCategory === 'film') {
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      uploadArea.classList.add('hidden');
      gallery.classList.add('film-mode');
      gallery.classList.remove('apps-mode');
      listenToFilms();
    } else if (currentCategory === 'apps') {
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      if (filmUnsubscribe) { filmUnsubscribe(); filmUnsubscribe = null; }
      uploadArea.classList.add('hidden');
      gallery.classList.remove('film-mode');
      renderApps();
    } else {
      if (filmUnsubscribe) { filmUnsubscribe(); filmUnsubscribe = null; }
      gallery.classList.remove('film-mode');
      gallery.classList.remove('apps-mode');
      if (document.body.classList.contains('edit-mode')) uploadArea.classList.remove('hidden');
      listenToGallery(currentCategory);
    }
  });
});

// ── Real-time art gallery listener ────────────────────────────────────────────
function listenToGallery(category) {
  if (unsubscribe) unsubscribe();
  gallery.innerHTML = '<div class="loading">Loading...</div>';

  unsubscribe = db.collection('pieces')
    .where('category', '==', category)
    .orderBy('createdAt', 'asc')
    .onSnapshot(async snapshot => {
      gallery.innerHTML = '';
      for (const doc of snapshot.docs) {
        const item = { id: doc.id, ...doc.data() };
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

// ── Art render ────────────────────────────────────────────────────────────────
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

// ── FILM SECTION ──────────────────────────────────────────────────────────────

let filmUnsubscribe = null;
let commentaryUnsubscribe = null;
let allCommentary = [];
let activeCommentId = null;
let videoInterval = null;
let currentFilmId = null;

// ── Film grid ─────────────────────────────────────────────────────────────────
function listenToFilms() {
  if (filmUnsubscribe) filmUnsubscribe();
  gallery.innerHTML = '<div class="loading">Loading…</div>';
  gallery.classList.add('film-mode');

  filmUnsubscribe = db.collection('films')
    .orderBy('createdAt', 'asc')
    .onSnapshot(snapshot => {
      gallery.innerHTML = '';
      if (document.body.classList.contains('edit-mode')) {
        gallery.appendChild(createAddFilmCard());
      }
      snapshot.docs.forEach(doc => {
        gallery.appendChild(createFilmCard({ id: doc.id, ...doc.data() }));
      });
      if (snapshot.empty && !document.body.classList.contains('edit-mode')) {
        gallery.innerHTML = '<p class="loading">No films yet.</p>';
      }
    }, err => {
      console.error(err);
      gallery.innerHTML = '<p class="loading">Error loading films.</p>';
    });
}

function createFilmCard(film) {
  const card = document.createElement('div');
  card.className = 'film-card';

  const thumb = document.createElement('div');
  thumb.className = 'film-card-thumb';

  // Video thumbnail — seek to 1s after metadata loads
  const thumbVid = document.createElement('video');
  thumbVid.className = 'film-card-thumb-video';
  thumbVid.src = film.url;
  thumbVid.preload = 'metadata';
  thumbVid.muted = true;
  thumbVid.playsInline = true;
  thumbVid.addEventListener('loadedmetadata', () => { thumbVid.currentTime = 1; });
  thumb.appendChild(thumbVid);

  // Play icon
  const playIcon = document.createElement('div');
  playIcon.className = 'film-card-play-icon';
  playIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="36" height="36"><path d="M8 5v14l11-7z"/></svg>`;
  thumb.appendChild(playIcon);

  // Delete button (only visible in edit mode via CSS)
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'film-card-delete';
  deleteBtn.textContent = '×';
  deleteBtn.addEventListener('click', async e => {
    e.stopPropagation();
    if (!confirm(`Delete "${film.title || 'this film'}"?`)) return;
    await db.collection('films').doc(film.id).delete();
    if (film.storagePath) {
      try { await storage.ref(film.storagePath).delete(); } catch {}
    }
  });
  thumb.appendChild(deleteBtn);
  card.appendChild(thumb);

  const info = document.createElement('div');
  info.className = 'film-card-info';
  const title = document.createElement('h3');
  title.className = 'film-card-title';
  title.textContent = film.title || 'Untitled';
  info.appendChild(title);
  card.appendChild(info);

  card.addEventListener('click', () => openFilmPlayer(film));
  return card;
}

function createAddFilmCard() {
  const card = document.createElement('div');
  card.className = 'film-card film-card-add';
  card.innerHTML = `
    <div class="film-card-thumb">
      <div class="film-card-plus">+</div>
    </div>
    <div class="film-card-info">
      <h3 class="film-card-title film-add-label">Add Film</h3>
    </div>
  `;
  card.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,.mov';
    input.onchange = e => { if (e.target.files[0]) handleFilmUpload(e.target.files[0]); };
    input.click();
  });
  return card;
}

async function handleFilmUpload(file) {
  const defaultTitle = file.name.replace(/\.[^.]+$/, '');
  const title = prompt('Film title:', defaultTitle) || defaultTitle;

  // Temporary loading card
  const loadingCard = document.createElement('div');
  loadingCard.className = 'film-card film-card-loading';
  loadingCard.innerHTML = `
    <div class="film-card-thumb">
      <div class="film-upload-progress"><div class="film-upload-bar" id="filmUploadBar"></div></div>
      <div class="film-upload-pct" id="filmUploadPct">0%</div>
    </div>
    <div class="film-card-info"><h3 class="film-card-title">${title}</h3></div>
  `;
  gallery.appendChild(loadingCard);

  const ext = file.name.split('.').pop();
  const storagePath = `films/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const ref = storage.ref(storagePath);
  const uploadTask = ref.put(file);

  uploadTask.on('state_changed', snap => {
    const pct = Math.round(snap.bytesTransferred / snap.totalBytes * 100);
    const bar = document.getElementById('filmUploadBar');
    const pctEl = document.getElementById('filmUploadPct');
    if (bar) bar.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
  });

  try {
    await uploadTask;
    const url = await ref.getDownloadURL();
    await db.collection('films').add({
      title, url, storagePath,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    alert('Upload failed: ' + e.message);
  } finally {
    loadingCard.remove();
  }
}

// ── Film player ───────────────────────────────────────────────────────────────
function openFilmPlayer(film) {
  currentFilmId = film.id;
  const modal = document.getElementById('filmModal');
  const video = document.getElementById('filmVideo');
  const titleEl = document.getElementById('filmPlayerTitle');
  const editorPanel = document.getElementById('filmEditorPanel');
  const commentaryDisplay = document.getElementById('commentaryDisplay');

  video.src = film.url;
  titleEl.textContent = film.title || 'Untitled';
  commentaryDisplay.classList.remove('active');
  activeCommentId = null;

  // Reset commentary toggle — hidden until we confirm commentary exists
  const toggleLabel = document.getElementById('commentaryToggleLabel');
  const toggleCheckbox = document.getElementById('commentaryToggle');
  toggleLabel.classList.add('hidden');
  toggleCheckbox.checked = true;

  modal.classList.remove('hidden');
  document.body.classList.add('film-playing');

  // Commentary live listener
  if (commentaryUnsubscribe) commentaryUnsubscribe();
  allCommentary = [];
  commentaryUnsubscribe = db.collection('films').doc(film.id)
    .collection('commentary')
    .orderBy('timestamp', 'asc')
    .onSnapshot(snapshot => {
      allCommentary = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Show toggle only if there's at least one commentary line
      const toggleLabel = document.getElementById('commentaryToggleLabel');
      if (allCommentary.length > 0) {
        toggleLabel.classList.remove('hidden');
      } else {
        toggleLabel.classList.add('hidden');
      }
      if (document.body.classList.contains('edit-mode')) renderEditorComments();
    });

  // Commentary polling loop
  if (videoInterval) clearInterval(videoInterval);
  videoInterval = setInterval(() => checkCommentary(video), 200);

  // Editor panel
  if (document.body.classList.contains('edit-mode')) {
    editorPanel.classList.remove('hidden');
    setupEditor(film, video);
  } else {
    editorPanel.classList.add('hidden');
  }
}

function closeFilmPlayer() {
  const modal = document.getElementById('filmModal');
  const video = document.getElementById('filmVideo');
  modal.classList.add('hidden');
  document.body.classList.remove('film-playing');
  video.pause();
  video.src = '';
  if (commentaryUnsubscribe) { commentaryUnsubscribe(); commentaryUnsubscribe = null; }
  if (videoInterval) { clearInterval(videoInterval); videoInterval = null; }
  currentFilmId = null;
  allCommentary = [];
  activeCommentId = null;
}

document.getElementById('filmClose').addEventListener('click', closeFilmPlayer);
document.getElementById('filmModal').addEventListener('click', e => {
  if (e.target === document.getElementById('filmModal')) closeFilmPlayer();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('filmModal').classList.contains('hidden')) {
    closeFilmPlayer();
  }
});

// ── Commentary display ────────────────────────────────────────────────────────
function checkCommentary(video) {
  if (!allCommentary.length) return;
  const t = video.currentTime;
  let activeComment = null;

  const toggleCheckbox = document.getElementById('commentaryToggle');
  const commentaryEnabled = !toggleCheckbox || toggleCheckbox.checked;

  if (commentaryEnabled) for (let i = 0; i < allCommentary.length; i++) {
    const c = allCommentary[i];
    const nextT = i < allCommentary.length - 1 ? allCommentary[i + 1].timestamp : Infinity;
    // Show for 3 seconds, or until the next comment — whichever comes first
    const endT = Math.min(c.timestamp + 3, nextT);
    if (t >= c.timestamp && t < endT) { activeComment = c; break; }
  }

  const display = document.getElementById('commentaryDisplay');
  const textEl = document.getElementById('commentaryText');

  if (activeComment) {
    if (activeCommentId !== activeComment.id) {
      const wasActive = activeCommentId !== null;
      activeCommentId = activeComment.id;
      if (wasActive) {
        display.classList.remove('active');
        setTimeout(() => {
          textEl.textContent = activeComment.text;
          display.classList.add('active');
        }, 380);
      } else {
        textEl.textContent = activeComment.text;
        display.classList.add('active');
      }
    }
  } else {
    if (activeCommentId !== null) {
      activeCommentId = null;
      display.classList.remove('active');
    }
  }
}

// ── Commentary editor ─────────────────────────────────────────────────────────
function setupEditor(film, video) {
  // Title editing
  const titleInput = document.getElementById('filmTitleEdit');
  titleInput.value = film.title || '';
  let titleTimer;
  titleInput.addEventListener('input', () => {
    clearTimeout(titleTimer);
    titleTimer = setTimeout(async () => {
      await db.collection('films').doc(film.id).update({ title: titleInput.value });
      document.getElementById('filmPlayerTitle').textContent = titleInput.value;
    }, 500);
  });

  // Comment add button — clone to remove any old listeners
  const oldBtn = document.getElementById('addCommentAtBtn');
  const addBtn = oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(addBtn, oldBtn);

  const updateLabel = () => {
    addBtn.textContent = `Add note at ${formatTime(video.currentTime)}`;
  };
  video.addEventListener('timeupdate', updateLabel);
  updateLabel();

  const textarea = document.getElementById('newCommentText');
  addBtn.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text) { textarea.focus(); return; }
    await db.collection('films').doc(film.id).collection('commentary').add({
      timestamp: video.currentTime,
      text,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    textarea.value = '';
  });

  // Enter to submit (Shift+Enter for newline)
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addBtn.click(); }
  });
}

function renderEditorComments() {
  const list = document.getElementById('editorCommentList');
  list.innerHTML = '';

  if (!allCommentary.length) {
    list.innerHTML = '<p class="editor-empty">No notes yet — play the film and add your first note.</p>';
    return;
  }

  allCommentary.forEach(c => {
    const row = document.createElement('div');
    row.className = 'editor-comment-row';

    const timeBtn = document.createElement('button');
    timeBtn.className = 'editor-comment-time';
    timeBtn.textContent = formatTime(c.timestamp);
    timeBtn.title = 'Jump to this moment';
    timeBtn.addEventListener('click', () => {
      document.getElementById('filmVideo').currentTime = c.timestamp;
    });

    const input = document.createElement('input');
    input.className = 'editor-comment-input';
    input.value = c.text;
    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        db.collection('films').doc(currentFilmId).collection('commentary')
          .doc(c.id).update({ text: input.value });
      }, 500);
    });

    const del = document.createElement('button');
    del.className = 'editor-comment-delete';
    del.textContent = '×';
    del.addEventListener('click', () => {
      db.collection('films').doc(currentFilmId).collection('commentary').doc(c.id).delete();
    });

    row.append(timeBtn, input, del);
    list.appendChild(row);
  });
}

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Art upload ────────────────────────────────────────────────────────────────
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

async function uploadFile(file, category) {
  const ext = file.name.split('.').pop();
  const storagePath = `pieces/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const ref = storage.ref(storagePath);
  await ref.put(file);
  const url = await ref.getDownloadURL();
  const doc = await db.collection('pieces').add({
    url, storagePath, filename: file.name, category,
    title: '', createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return { id: doc.id, url, storagePath, filename: file.name, category, title: '' };
}

async function handleFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') continue;
    await uploadFile(file, currentCategory);
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
  return new Promise((resolve) => {
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

// ── APPS SECTION ─────────────────────────────────────────────────────────────

function renderApps() {
  gallery.innerHTML = '';
  gallery.classList.add('apps-mode');
  gallery.appendChild(createShapeStudyCard());
}

function createShapeStudyCard() {
  const card = document.createElement('div');
  card.className = 'app-card';

  const thumb = document.createElement('div');
  thumb.className = 'app-card-thumb';

  const preview = document.createElement('div');
  preview.className = 'app-card-preview';
  preview.innerHTML = `<svg viewBox="0 0 90 60" width="90" height="60" xmlns="http://www.w3.org/2000/svg">
    <polygon points="0,0 45,0 0,30" fill="rgba(120,210,255,0.7)"/>
    <polygon points="45,0 90,0 90,30 45,60 0,30" fill="rgba(255,160,80,0.6)"/>
    <polygon points="0,30 45,60 0,60" fill="rgba(255,80,140,0.7)"/>
    <polygon points="45,60 90,30 90,60" fill="rgba(170,120,255,0.6)"/>
    <polygon points="0,0 45,0 22,30" fill="rgba(80,220,160,0.5)"/>
    <polygon points="45,0 68,30 22,30" fill="rgba(255,220,60,0.5)"/>
    <polygon points="68,30 90,0 90,30" fill="rgba(255,100,100,0.5)"/>
  </svg>`;
  thumb.appendChild(preview);

  const info = document.createElement('div');
  info.className = 'app-card-info';
  const title = document.createElement('h3');
  title.className = 'app-card-title';
  title.textContent = 'Shape Study No. 1';
  info.appendChild(title);

  card.appendChild(thumb);
  card.appendChild(info);
  card.addEventListener('click', openShapeStudy);
  return card;
}

let shapeAnimStop = null;

async function openShapeStudy() {
  const modal = document.getElementById('appModal');
  const stage = document.getElementById('appStage');
  const titleEl = document.getElementById('appModalTitle');

  titleEl.textContent = 'Shape Study No. 1';
  modal.classList.remove('hidden');
  document.body.classList.add('app-playing');

  if (shapeAnimStop) { shapeAnimStop(); shapeAnimStop = null; }
  stage.innerHTML = '<p style="color:rgba(255,255,255,0.18);font-family:Georgia,serif;font-size:0.75rem;letter-spacing:0.2em;text-transform:uppercase;text-align:center;padding:60px 0">Loading…</p>';
  stage.style.width = '';
  stage.style.height = '';

  if (!window.THREE) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
  }

  if (!modal.classList.contains('hidden')) {
    stage.innerHTML = '';
    shapeAnimStop = startShapeAnimation(stage);
  }
}

function startShapeAnimation(stage) {
  const wrap = document.getElementById('appStageWrap');
  const W = Math.min(wrap.clientWidth || 800, 1100);
  const H = Math.round(W * 2 / 3);
  stage.style.width = W + 'px';
  stage.style.height = H + 'px';

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x080808);
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);
  camera.position.z = 6.5;

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const dl = new THREE.DirectionalLight(0xffffff, 1.0);
  dl.position.set(4, 6, 5);
  scene.add(dl);
  const dl2 = new THREE.DirectionalLight(0x8899ff, 0.35);
  dl2.position.set(-3, -2, 3);
  scene.add(dl2);

  // Build a closed THREE.Shape from an array of [x,y] points
  function makeShape(pts) {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    s.closePath();
    return s;
  }

  // Build an organic blob shape
  function blobShape(cx, cy, rx, ry, perturbs) {
    const n = perturbs.length;
    const pts = perturbs.map((p, i) => {
      const a = (i / n) * Math.PI * 2;
      return [cx + rx * (1 + p) * Math.cos(a), cy + ry * (1 + p) * Math.sin(a)];
    });
    return makeShape(pts);
  }

  // Coordinate space: image mapped to x∈[-2,2], y∈[-1.33,1.33]
  // Colors and shapes traced from the artwork
  const regions = [
    {
      color: 0x1A4FCC,
      shape: blobShape(-1.52, 0.82, 0.40, 0.34,
        [0.2, 0.05, 0.28, -0.12, 0.18, -0.22, 0.08, -0.18, 0.24, -0.08]),
      z: 0.35
    },
    {
      color: 0x55CCEE,
      shape: makeShape([[-2,1.33],[-1.05,1.33],[-0.52,0.62],[-0.92,0.0],[-1.65,-0.32],[-2,-0.08]]),
      z: -0.4
    },
    {
      color: 0x88EE28,
      shape: makeShape([[-2,0.82],[-1.18,1.33],[-0.28,1.33],[0.12,0.78],[-0.08,0.22],[-0.82,-0.02],[-1.78,0.28]]),
      z: 0.05
    },
    {
      color: 0xFF7D18,
      shape: makeShape([[-1.75,0.42],[-0.48,0.98],[0.22,1.33],[0.88,1.08],[0.62,0.38],[0.02,-0.18],[-0.78,0.02],[-1.38,0.18]]),
      z: -0.1
    },
    {
      color: 0xE82E1E,
      shape: makeShape([[-0.58,0.42],[0.18,0.85],[0.72,0.60],[0.52,-0.22],[0.08,-0.72],[-0.38,-0.88],[-0.78,-0.28],[-0.68,0.08]]),
      z: 0.2
    },
    {
      color: 0xFF0E88,
      shape: makeShape([[0.22,1.33],[0.88,1.33],[0.82,-1.33],[0.08,-1.33]]),
      z: 0.0
    },
    {
      color: 0xFFB8C5,
      shape: blobShape(-0.72, -0.52, 0.72, 0.60,
        [0.12,-0.18,0.16,-0.08,0.22,-0.14,0.06,-0.22,0.14,-0.06,0.20,-0.16]),
      z: 0.45
    },
    {
      color: 0xFF6644,
      shape: makeShape([[-2,-0.32],[-0.08,-0.22],[0.08,-1.33],[-2,-1.33]]),
      z: -0.3
    },
    {
      color: 0xC8B2FF,
      shape: makeShape([[0.88,1.33],[2,1.33],[2,0.12],[1.52,-0.12],[0.92,0.12],[0.82,0.62]]),
      z: 0.0
    },
    {
      color: 0x9968EE,
      shape: makeShape([[1.12,-0.12],[2,0.12],[2,-0.52],[1.52,-0.78],[0.88,-0.52]]),
      z: 0.18
    },
    {
      color: 0x8898EE,
      shape: makeShape([[0.88,-0.52],[1.52,-0.78],[2,-0.52],[2,-1.18],[1.12,-1.08],[0.62,-0.88]]),
      z: -0.12
    },
    {
      color: 0xAAFF88,
      shape: makeShape([[1.12,-1.08],[2,-1.18],[2,-1.33],[0.92,-1.33]]),
      z: 0.28
    },
    {
      color: 0xDDFF88,
      shape: makeShape([[0.62,-1.15],[1.12,-1.08],[0.92,-1.33],[0.52,-1.33]]),
      z: 0.08
    },
  ];

  const extrudeOpts = { depth: 0.13, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3 };
  const meshes = [];

  regions.forEach((r, i) => {
    const geo = new THREE.ExtrudeGeometry(r.shape, extrudeOpts);
    const mat = new THREE.MeshPhongMaterial({
      color: r.color, side: THREE.DoubleSide, shininess: 70,
      specular: new THREE.Color(0x333333)
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = r.z;
    mesh.userData = {
      origZ: r.z,
      phase: i * 0.71,
      ry: 0.18 + (i % 5) * 0.055,
    };
    scene.add(mesh);
    meshes.push(mesh);
  });

  let t = 0;
  let animId;

  function animate() {
    t += 0.007;
    meshes.forEach((mesh, i) => {
      const { origZ, phase, ry } = mesh.userData;
      // Each shape tumbles independently — like the Three.js instancing example
      mesh.rotation.x = Math.sin(t * 0.38 + phase) * 1.1;
      mesh.rotation.y = t * ry + Math.sin(t * 0.22 + phase * 1.1) * 0.55;
      mesh.rotation.z = Math.cos(t * 0.17 + phase * 0.8) * 0.35;
      // Breathe in z so shapes weave past each other
      mesh.position.z = origZ + Math.sin(t * 0.42 + phase) * 0.55;
      mesh.position.x = Math.sin(t * 0.19 + phase * 1.2) * 0.07;
      mesh.position.y = Math.cos(t * 0.15 + phase * 0.9) * 0.07;
    });
    // Camera drifts slowly — adds parallax depth
    camera.position.x = Math.sin(t * 0.11) * 1.0;
    camera.position.y = Math.cos(t * 0.09) * 0.6;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    animId = requestAnimationFrame(animate);
  }

  animate();

  return () => {
    cancelAnimationFrame(animId);
    meshes.forEach(m => { m.geometry.dispose(); m.material.dispose(); });
    renderer.dispose();
    if (stage.contains(renderer.domElement)) stage.removeChild(renderer.domElement);
  };
}

function closeAppModal() {
  const modal = document.getElementById('appModal');
  modal.classList.add('hidden');
  document.body.classList.remove('app-playing');
  if (shapeAnimStop) { shapeAnimStop(); shapeAnimStop = null; }
  document.getElementById('appStage').innerHTML = '';
}

document.getElementById('appClose').addEventListener('click', closeAppModal);
document.getElementById('appModal').addEventListener('click', e => {
  if (e.target === document.getElementById('appModal')) closeAppModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('appModal').classList.contains('hidden')) {
    closeAppModal();
  }
});

// ── QR Code ───────────────────────────────────────────────────────────────────
const qrBtn = document.getElementById('qrBtn');
const qrModal = document.getElementById('qrModal');
const qrCodeEl = document.getElementById('qrCode');

let qrGenerated = false;
qrBtn.addEventListener('click', () => {
  if (!qrGenerated) {
    const url = window.location.origin;
    qrCodeEl.innerHTML = '';
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
