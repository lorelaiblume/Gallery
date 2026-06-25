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

  // Stop any previous animation
  if (shapeAnimStop) { shapeAnimStop(); shapeAnimStop = null; }
  stage.innerHTML = '<p style="color:rgba(255,255,255,0.2);font-family:Georgia,serif;font-size:0.8rem;letter-spacing:0.2em;text-transform:uppercase;text-align:center;padding:40px">Loading…</p>';
  stage.style.width = '';
  stage.style.height = '';

  try {
    const snapshot = await db.collection('pieces')
      .where('category', '==', 'digital')
      .orderBy('createdAt', 'asc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      stage.innerHTML = '<p style="color:rgba(255,255,255,0.3);text-align:center;padding:40px;font-family:Georgia,serif">No digital art found.</p>';
      return;
    }

    const piece = snapshot.docs[0].data();

    // Load image to get natural dimensions (no CORS needed just to get size)
    const img = new Image();
    img.onload = () => {
      if (!modal.classList.contains('hidden')) {
        shapeAnimStop = startShapeAnimation(stage, piece.url, img.naturalWidth, img.naturalHeight);
      }
    };
    img.onerror = () => {
      stage.innerHTML = '<p style="color:rgba(255,255,255,0.3);text-align:center;padding:40px;font-family:Georgia,serif">Could not load image.</p>';
    };
    img.src = piece.url;
  } catch (e) {
    console.error('Shape Study error:', e);
  }
}

function startShapeAnimation(stage, imgUrl, imgW, imgH) {
  // Fit the stage to the available space
  const wrap = document.getElementById('appStageWrap');
  const maxW = wrap.clientWidth || window.innerWidth * 0.9;
  const maxH = Math.max(300, window.innerHeight * 0.75 - 80);
  const scale = Math.min(maxW / imgW, maxH / imgH, 1);
  const W = Math.round(imgW * scale);
  const H = Math.round(imgH * scale);

  stage.style.width = W + 'px';
  stage.style.height = H + 'px';
  stage.innerHTML = '';

  // Build triangle grid
  const COLS = 22;
  const ROWS = Math.ceil(COLS * H / W);
  const cw = W / COLS;
  const ch = H / ROWS;
  const icx = W / 2, icy = H / 2;
  const maxD = Math.sqrt(icx * icx + icy * icy);

  const frags = [];
  const bgSize = `${W}px ${H}px`;
  const bgImg = `url("${imgUrl}")`;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * cw, y = r * ch;
      const pairs = [
        { v: [[x, y], [x + cw, y], [x, y + ch]],          cx: x + cw / 3,     cy: y + ch / 3 },
        { v: [[x + cw, y], [x + cw, y + ch], [x, y + ch]], cx: x + 2 * cw / 3, cy: y + 2 * ch / 3 }
      ];

      for (const p of pairs) {
        const el = document.createElement('div');
        el.className = 'frag';
        const clipPts = p.v.map(([vx, vy]) => `${vx.toFixed(1)}px ${vy.toFixed(1)}px`).join(',');
        el.style.cssText = `background:${bgImg} no-repeat 0 0/${bgSize};clip-path:polygon(${clipPts});`;
        stage.appendChild(el);

        const dx = p.cx - icx, dy = p.cy - icy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const normDist = dist / maxD;
        const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.9;
        const mag = (0.8 + Math.random() * 0.5) * Math.max(W, H) * 1.5;

        frags.push({
          el,
          cx: p.cx, cy: p.cy,
          sx: Math.cos(angle) * mag,
          sy: Math.sin(angle) * mag,
          rot: (Math.random() - 0.5) * 300,
          normDist
        });
      }
    }
  }

  // Animation loop
  const T_IN = 1900, T_HOLD1 = 3000, T_OUT = 1300, T_HOLD2 = 700;
  const TOTAL = T_IN + T_HOLD1 + T_OUT + T_HOLD2;
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const lerp = (a, b, t) => a + (b - a) * t;

  let startTs = null;
  let animId;

  function frame(ts) {
    if (!startTs) startTs = ts;
    const el = (ts - startTs) % TOTAL;

    for (const f of frags) {
      let prog;
      if (el < T_IN) {
        // Assemble — center arrives first
        const delay = f.normDist * 0.44;
        const t = Math.max(0, Math.min(1, (el / T_IN - delay) / (1 - delay)));
        prog = ease(t);
      } else if (el < T_IN + T_HOLD1) {
        prog = 1;
      } else if (el < T_IN + T_HOLD1 + T_OUT) {
        // Scatter — outer leaves first
        const delay = (1 - f.normDist) * 0.32;
        const t = (el - T_IN - T_HOLD1) / T_OUT;
        const tt = Math.max(0, Math.min(1, (t - delay) / (1 - delay)));
        prog = 1 - ease(tt);
      } else {
        prog = 0;
      }

      const tx = lerp(f.sx, 0, prog);
      const ty = lerp(f.sy, 0, prog);
      const rot = lerp(f.rot, 0, prog);
      const opacity = Math.min(1, prog < 0.05 ? prog * 20 : 1); // snap in fast, hold at 1

      f.el.style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;
      f.el.style.transformOrigin = `${f.cx.toFixed(1)}px ${f.cy.toFixed(1)}px`;
      f.el.style.opacity = opacity.toFixed(3);
    }

    animId = requestAnimationFrame(frame);
  }

  animId = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(animId);
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
