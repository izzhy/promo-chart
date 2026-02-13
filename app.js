const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const jsonFile = document.getElementById("jsonFile");
const renderBtn = document.getElementById("renderBtn");
const savePng = document.getElementById("savePng");
const saveJpeg = document.getElementById("saveJpeg");
const presetSelect = document.getElementById("presetSelect");
const aspectSelect = document.getElementById("aspectSelect");
const fontSelect = document.getElementById("fontSelect");
const dropzone = document.getElementById("dropzone");
const logoDropzone = document.getElementById("logoDropzone");
const themeToggle = document.getElementById("themeToggle");
const commentAuthor = document.getElementById("commentAuthor");
const commentText = document.getElementById("commentText");
const commentReactions = document.getElementById("commentReactions");
const addCommentBtn = document.getElementById("addCommentBtn");
const editCancelBtn = document.getElementById("editCancelBtn");
const commentList = document.getElementById("commentList");
const commentCount = document.getElementById("commentCount");
const statusEl = document.getElementById("status");
const overflowEl = document.getElementById("overflow");

const DEFAULT_COLOR = "#2E6AA8";
const DEFAULT_FONT = "Trebuchet MS";
const CANVAS_W = 1920;
const BASE_CELL_H = 235;
const STORED_COMMENTS_KEY = "storedComments";
const LEGACY_COMMENTS_KEY = "localComments";

let currentData = null;
let presets = [];
let editingComment = null;
let commentEdits = {};

loadPresets();
initTheme();
loadLocalComments();
loadLocalEdits();
initFont();

presetSelect.addEventListener("change", () => {
  if (currentData) renderScene(currentData);
});

aspectSelect.addEventListener("change", () => {
  if (currentData) renderScene(currentData);
});

if (fontSelect) {
  fontSelect.addEventListener("change", async () => {
    localStorage.setItem("canvasFont", fontSelect.value);
    if (currentData) await renderScene(currentData);
  });
}

jsonFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await loadJsonFile(file);
});

renderBtn.addEventListener("click", async () => {
  if (!currentData) {
    statusEl.textContent = "Brak danych JSON do renderu.";
    return;
  }
  await renderScene(currentData);
});

addCommentBtn.addEventListener("click", async () => {
  const text = (commentText.value || "").trim();
  const author = (commentAuthor.value || "").trim();
  if (!text) {
    statusEl.textContent = "Dodaj treść komentarza.";
    return;
  }
  const reactionsRaw = (commentReactions.value || "").trim();
  const reactions = reactionsRaw === "" ? undefined : Number(reactionsRaw);

  if (!currentData) currentData = { comments: [] };
  if (!Array.isArray(currentData.comments)) currentData.comments = [];

  if (editingComment) {
    const idx = currentData.comments.indexOf(editingComment);
    if (idx === -1) {
      statusEl.textContent = "Nie można zapisać: komentarz nie istnieje.";
      exitEditMode();
      return;
    }
    const wasLocal = currentData.comments[idx]?._local === true;
    currentData.comments[idx].author = author;
    currentData.comments[idx].comment = text;
    if (Number.isFinite(reactions)) {
      currentData.comments[idx].numberOfReaction = reactions;
    } else {
      delete currentData.comments[idx].numberOfReaction;
    }
    if (wasLocal) currentData.comments[idx]._local = true;
    if (!wasLocal && currentData.comments[idx]._editKey) {
      commentEdits[currentData.comments[idx]._editKey] = {
        author,
        comment: text,
        numberOfReaction: Number.isFinite(reactions) ? reactions : null,
      };
      saveLocalEdits(commentEdits);
    }
    statusEl.textContent = "Zapisano zmiany.";
    exitEditMode();
  } else {
    const item = {
      author,
      comment: text,
    };
    if (Number.isFinite(reactions)) item.numberOfReaction = reactions;
    item._local = true;
    currentData.comments.push(item);
    statusEl.textContent = "Dodano komentarz.";
  }

  saveLocalComments(currentData.comments);
  commentText.value = "";
  commentReactions.value = "";
  renderCommentList(currentData.comments);
  await renderScene(currentData);
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  setDropzoneActive(dropzone, true);
});

dropzone.addEventListener("dragleave", () => {
  setDropzoneActive(dropzone, false);
});

dropzone.addEventListener("drop", async (e) => {
  e.preventDefault();
  setDropzoneActive(dropzone, false);
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  await loadJsonFile(file);
});

logoDropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  setDropzoneActive(logoDropzone, true);
});

logoDropzone.addEventListener("dragleave", () => {
  setDropzoneActive(logoDropzone, false);
});

logoDropzone.addEventListener("drop", async (e) => {
  e.preventDefault();
  setDropzoneActive(logoDropzone, false);
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  await loadLogoFile(file);
});

savePng.addEventListener("click", async () => {
  await exportCanvas("image/png", "ikonografika.png");
});

saveJpeg.addEventListener("click", async () => {
  await exportCanvas("image/jpeg", "ikonografika.jpg", 0.92);
});

if (editCancelBtn) {
  editCancelBtn.addEventListener("click", () => {
    exitEditMode();
    commentAuthor.value = "";
    commentText.value = "";
    commentReactions.value = "";
    statusEl.textContent = "Anulowano edycję.";
  });
}

async function exportCanvas(type, filename, quality) {
  try {
    triggerDownload(canvas.toDataURL(type, quality), filename);
  } catch (err) {
    const isSecurity = String(err?.name || "").includes("Security") || String(err?.message || "").includes("taint");
    if (isSecurity && currentData?.logo) {
      statusEl.textContent = "Eksport: pomijam logo (CORS) i próbuję ponownie.";
      const savedLogo = currentData.logo;
      const tmp = { ...currentData, logo: null };
      await renderScene(tmp);
      try {
        triggerDownload(canvas.toDataURL(type, quality), filename);
      } catch {
        statusEl.textContent = "Eksport nieudany: przeglądarka blokuje zapis.";
      }
      await renderScene(currentData);
      currentData.logo = savedLogo;
    } else {
      statusEl.textContent = "Eksport nieudany: przeglądarka blokuje zapis.";
    }
  }
}

function triggerDownload(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

function setDropzoneActive(el, isActive) {
  if (!el) return;
  if (isActive) {
    el.classList.add("ring-2", "ring-slate-900/10", "border-slate-400", "bg-slate-50");
  } else {
    el.classList.remove("ring-2", "ring-slate-900/10", "border-slate-400", "bg-slate-50");
  }
}

function initTheme() {
  const stored = localStorage.getItem("theme");
  if (stored === "dark") document.documentElement.classList.add("dark");
  updateThemeButton();
  themeToggle.addEventListener("click", () => {
    document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", document.documentElement.classList.contains("dark") ? "dark" : "light");
    updateThemeButton();
  });
}

function updateThemeButton() {
  const isDark = document.documentElement.classList.contains("dark");
  themeToggle.textContent = isDark ? "Light" : "Dark";
}

function initFont() {
  if (!fontSelect) return;
  const stored = localStorage.getItem("canvasFont");
  if (stored && Array.from(fontSelect.options).some((opt) => opt.value === stored)) {
    fontSelect.value = stored;
  }
}

function getCanvasFontFamily() {
  return fontSelect?.value || DEFAULT_FONT;
}

function normalizeFontFamily(family) {
  const trimmed = (family || DEFAULT_FONT).trim();
  if (/[,"']/.test(trimmed)) return trimmed;
  if (/\s/.test(trimmed)) return `"${trimmed}"`;
  return trimmed;
}

function buildCanvasFont(size, weight = "") {
  const primary = normalizeFontFamily(getCanvasFontFamily());
  const fallback = `"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  const prefix = weight ? `${weight} ` : "";
  return `${prefix}${size}px ${primary}, ${fallback}`;
}

async function ensureCanvasFontLoaded() {
  const family = normalizeFontFamily(getCanvasFontFamily());
  if (!document.fonts?.load) return;
  try {
    await document.fonts.load(`16px ${family}`);
  } catch {
    // Ignore font loading errors and continue with fallbacks.
  }
}

async function loadJsonFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    currentData = data;
    applyLocalEdits(currentData?.comments);
    exitEditMode();
    statusEl.textContent = `Wczytano: ${file.name}`;
    overflowEl.textContent = "";
    renderCommentList(Array.isArray(currentData?.comments) ? currentData.comments : []);
    saveLocalComments(Array.isArray(currentData?.comments) ? currentData.comments : []);
    await renderScene(currentData);
  } catch (err) {
    statusEl.textContent = "Błąd: niepoprawny JSON.";
    overflowEl.textContent = "";
    currentData = null;
    exitEditMode();
  }
}

async function loadLogoFile(file) {
  try {
    const dataUrl = await fileToDataUrl(file);
    currentData = currentData || { comments: [] };
    currentData.logo = dataUrl;
    statusEl.textContent = `Logo wczytane: ${file.name}`;
    await renderScene(currentData);
  } catch {
    statusEl.textContent = "Błąd: nie można wczytać logo.";
  }
}

function loadLocalComments() {
  const stored = localStorage.getItem(STORED_COMMENTS_KEY);
  if (!stored) {
    const legacy = localStorage.getItem(LEGACY_COMMENTS_KEY);
    if (!legacy) return;
    try {
      const parsedLegacy = JSON.parse(legacy);
      if (!Array.isArray(parsedLegacy)) return;
      currentData = { comments: parsedLegacy };
      saveLocalComments(parsedLegacy);
      renderCommentList(parsedLegacy);
    } catch {
      // ignore
    }
    return;
  }
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return;
    currentData = { comments: parsed };
    renderCommentList(parsed);
  } catch {
    // ignore
  }
}

function saveLocalComments(comments) {
  try {
    const safe = Array.isArray(comments) ? comments : [];
    localStorage.setItem(STORED_COMMENTS_KEY, JSON.stringify(safe));
  } catch {
    // ignore
  }
}

function mergeLocalComments() {}

function loadLocalEdits() {
  const stored = localStorage.getItem("commentEdits");
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed === "object") commentEdits = parsed;
  } catch {
    // ignore
  }
}

function saveLocalEdits(edits) {
  try {
    localStorage.setItem("commentEdits", JSON.stringify(edits || {}));
  } catch {
    // ignore
  }
}

function makeEditKey(comment, index) {
  const author = typeof comment?.author === "string" ? comment.author : "";
  const text = typeof comment?.comment === "string" ? comment.comment : "";
  const reactions = Number.isFinite(comment?.numberOfReaction) ? comment.numberOfReaction : "";
  return `${index}|${author}|${text}|${reactions}`;
}

function ensureEditKeys(comments) {
  comments.forEach((c, idx) => {
    if (!c || c._local === true) return;
    if (!c._editKey) c._editKey = makeEditKey(c, idx);
  });
}

function applyLocalEdits(comments) {
  if (!Array.isArray(comments)) return;
  ensureEditKeys(comments);
  comments.forEach((c) => {
    if (!c || c._local === true) return;
    const key = c._editKey;
    if (!key) return;
    const edit = commentEdits[key];
    if (!edit || typeof edit !== "object") return;
    if (typeof edit.author === "string") c.author = edit.author;
    if (typeof edit.comment === "string") c.comment = edit.comment;
    if ("numberOfReaction" in edit) {
      if (edit.numberOfReaction === null) {
        delete c.numberOfReaction;
      } else {
        c.numberOfReaction = edit.numberOfReaction;
      }
    }
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
}

function renderCommentList(comments) {
  if (!commentList || !commentCount) return;
  commentList.innerHTML = "";
  commentCount.textContent = `${comments.length}`;
  ensureEditKeys(comments);
  comments.forEach((c, idx) => {
    const row = document.createElement("div");
    row.className = "flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100";

    const left = document.createElement("div");
    const author = (c?.author || "Anonymous").trim() || "Anonymous";
    const text = typeof c?.comment === "string" ? c.comment : "";
    const reactions = Number.isFinite(c?.numberOfReaction) ? ` • ${c.numberOfReaction}` : "";
    left.textContent = `${author}: ${text}${reactions}`;

    const actions = document.createElement("div");
    actions.className = "flex items-center gap-2";

    const edit = document.createElement("button");
    edit.className = "text-xs rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200";
    edit.textContent = "Edytuj";
    edit.addEventListener("click", () => {
      enterEditMode(c);
    });
    actions.appendChild(edit);

    const del = document.createElement("button");
    del.className = "text-xs rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200";
    del.textContent = "Usuń";
    del.addEventListener("click", async () => {
      if (!currentData || !Array.isArray(currentData.comments)) return;
      if (editingComment === c) exitEditMode();
      currentData.comments.splice(idx, 1);
      saveLocalComments(currentData.comments);
      renderCommentList(currentData.comments);
      await renderScene(currentData);
    });

    row.appendChild(left);
    actions.appendChild(del);
    row.appendChild(actions);
    commentList.appendChild(row);
  });
}

function enterEditMode(comment) {
  if (!comment) return;
  editingComment = comment;
  commentAuthor.value = comment.author || "";
  commentText.value = comment.comment || "";
  commentReactions.value = Number.isFinite(comment.numberOfReaction) ? comment.numberOfReaction : "";
  addCommentBtn.textContent = "Zapisz zmiany";
  if (editCancelBtn) editCancelBtn.classList.remove("hidden");
  statusEl.textContent = "Edycja komentarza.";
}

function exitEditMode() {
  editingComment = null;
  addCommentBtn.textContent = "Dodaj komentarz";
  if (editCancelBtn) editCancelBtn.classList.add("hidden");
}

async function renderScene(data) {
  await ensureCanvasFontLoaded();
  const selected = getSelectedPreset();
  const dominant = normalizeColor(selected?.dominantColor || DEFAULT_COLOR);
  const cardColor = normalizeColor(selected?.cardColor || "");
  const comments = Array.isArray(data?.comments) ? data.comments : [];

  const logoSrc = data?.logo || null;
  const logoImg = logoSrc ? await loadImage(logoSrc).catch(() => null) : null;

  const size = getCanvasSize();
  const layout = buildLayout(comments.length, size.width, size.height);
  canvas.width = size.width;
  canvas.height = size.height;
  drawBackground(dominant, canvas.width, canvas.height);

  drawLogoPanel(layout.centerRect, dominant, logoImg);

  let overflow = 0;
  comments.forEach((raw, idx) => {
    if (idx >= layout.placements.length) {
      overflow++;
      return;
    }
    const slot = layout.placements[idx];
    const prepared = normalizeComment(raw, idx);
    drawCommentCard(slot.rect, prepared, dominant, cardColor, layout);
  });

  statusEl.textContent = `Wymiary: ${canvas.width}x${canvas.height} | Komentarze: ${comments.length}`;
  if (overflow > 0) {
    overflowEl.textContent = `Nie zmieszczono komentarzy: ${overflow}`;
  } else {
    overflowEl.textContent = "";
  }
  renderCommentList(comments);
}

async function loadPresets() {
  const fallback = [
    { name: "Dominus Blue", dominantColor: "#2E6AA8", cardColor: "#DCE8FF" },
    { name: "Biały", dominantColor: "#F2F2F2", cardColor: "#FFFFFF" },
    { name: "Czarny", dominantColor: "#0F1117", cardColor: "#20242E" },
    { name: "Apple Like", dominantColor: "#DCE1E7", cardColor: "#F5F6F7" },
    { name: "Promo (Złoty)", dominantColor: "#C8A14A", cardColor: "#F4E6C0" },
    { name: "Emerald Forest", dominantColor: "#2F8F6B", cardColor: "#D7F0E4" },
    { name: "Amber Glow", dominantColor: "#C9852B", cardColor: "#FFE3B0" },
    { name: "Rose Quartz", dominantColor: "#C86C8A", cardColor: "#F6D6DF" },
    { name: "Deep Violet", dominantColor: "#5A4BA6", cardColor: "#E1DDF6" },
    { name: "Slate Teal", dominantColor: "#3B6C7A", cardColor: "#D3E6EB" },
  ];
  try {
    const res = await fetch("presets.json");
    if (!res.ok) throw new Error("Preset load failed");
    const json = await res.json();
    presets = Array.isArray(json?.presets) ? json.presets : fallback;
  } catch {
    presets = fallback;
  }
  populatePresetSelect();
}

function populatePresetSelect() {
  presetSelect.innerHTML = "";
  presets.forEach((p, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = p.name || `Preset ${idx + 1}`;
    presetSelect.appendChild(opt);
  });
  if (presets.length === 0) {
    const opt = document.createElement("option");
    opt.value = "0";
    opt.textContent = "Default";
    presetSelect.appendChild(opt);
  }
}

function getSelectedPreset() {
  const index = Number(presetSelect.value || 0);
  return presets[index] || presets[0] || null;
}

function getSelectedPresetColor() {
  const preset = getSelectedPreset();
  return preset?.dominantColor || DEFAULT_COLOR;
}

function normalizeComment(raw, index) {
  const authorRaw = typeof raw?.author === "string" ? raw.author.trim() : "";
  const author = authorRaw.length > 0 ? authorRaw : "Anonymous";
  const comment = typeof raw?.comment === "string" ? raw.comment : "";

  let numberOfReaction = raw?.numberOfReaction;
  if (typeof numberOfReaction !== "number" || Number.isNaN(numberOfReaction)) {
    numberOfReaction = deterministicNumber(`${author}|${comment}`, index, 3, 99);
  }

  return { author, comment, numberOfReaction };
}

function drawBackground(dominant, width, height) {
  ctx.clearRect(0, 0, width, height);
  const dark = adjustColor(dominant, -40);
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, dominant);
  grad.addColorStop(1, dark);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

function buildLayout(commentCount, canvasW, canvasH) {
  const cols = 5;
  const scale = canvasW / CANVAS_W;
  const padding = Math.round(40 * scale);
  const gap = Math.round(20 * scale);

  const totalW = canvasW - padding * 2 - gap * (cols - 1);
  const cellW = totalW / cols;
  const needed = Math.max(0, commentCount);
  let rows = 4;
  while (rows * cols - 4 < needed) rows += 1;

  const availableH = canvasH - padding * 2 - gap * (rows - 1);
  const cellH = Math.max(1, availableH / rows);

  let placements = [];
  let centerRect = null;
  const startRow = Math.max(0, Math.floor((rows - 2) / 2));
  const occupied = Array.from({ length: rows }, () => Array(cols).fill(false));

  // Reserve logo 2x2 at columns 2-3
  for (let r = startRow; r < startRow + 2; r++) {
    for (let c = 2; c < 4; c++) {
      if (r >= 0 && r < rows) occupied[r][c] = true;
    }
  }

  centerRect = {
    x: padding + 2 * (cellW + gap),
    y: padding + startRow * (cellH + gap),
    w: cellW * 2 + gap,
    h: cellH * 2 + gap,
  };

  placements = placeCards(needed, rows, cols, occupied, cellW, cellH, padding, gap);

  return { placements, centerRect, rows, cellW, cellH, padding, gap };
}

function getCanvasSize() {
  const ratio = String(aspectSelect.value || "16:9");
  if (ratio === "4:3") return { width: 1600, height: 1200 };
  if (ratio === "1:1") return { width: 1400, height: 1400 };
  if (ratio === "3:4") return { width: 1350, height: 1800 };
  if (ratio === "9:16") return { width: 1080, height: 1920 };
  return { width: CANVAS_W, height: 1080 };
}

function placeCards(count, rows, cols, occupied, cellW, cellH, padding, gap) {
  const placements = [];
  for (let i = 0; i < count; i++) {
    const size = pickSize(i);
    const placed = tryPlace(size, rows, cols, occupied, cellW, cellH, padding, gap);
    if (!placed && (size.w !== 1 || size.h !== 1)) {
      const fallback = tryPlace({ w: 1, h: 1 }, rows, cols, occupied, cellW, cellH, padding, gap);
      if (fallback) placements.push(fallback);
      else break;
    } else if (placed) {
      placements.push(placed);
    } else {
      break;
    }
  }
  return placements;
}

function pickSize(index) {
  const roll = deterministicNumber("size", index, 0, 99);
  if (roll < 12) return { w: 2, h: 2 };
  if (roll < 32) return { w: 2, h: 1 };
  if (roll < 52) return { w: 1, h: 2 };
  return { w: 1, h: 1 };
}

function tryPlace(size, rows, cols, occupied, cellW, cellH, padding, gap) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (canPlace(r, c, size, rows, cols, occupied)) {
        occupy(r, c, size, occupied);
        const x = padding + c * (cellW + gap);
        const y = padding + r * (cellH + gap);
        const w = cellW * size.w + gap * (size.w - 1);
        const h = cellH * size.h + gap * (size.h - 1);
        return { rect: { x, y, w, h }, r, c, size };
      }
    }
  }
  return null;
}

function canPlace(r, c, size, rows, cols, occupied) {
  if (r + size.h > rows || c + size.w > cols) return false;
  for (let rr = r; rr < r + size.h; rr++) {
    for (let cc = c; cc < c + size.w; cc++) {
      if (occupied[rr][cc]) return false;
    }
  }
  return true;
}

function occupy(r, c, size, occupied) {
  for (let rr = r; rr < r + size.h; rr++) {
    for (let cc = c; cc < c + size.w; cc++) {
      occupied[rr][cc] = true;
    }
  }
}

function drawLogoPanel(rect, dominant, logoImg) {
  const radius = 26;
  const border = adjustColor(dominant, 20);
  const fill = adjustColor(dominant, -10);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  drawRoundedRect(rect.x, rect.y, rect.w, rect.h, radius, fill, border);
  ctx.restore();

  if (!logoImg) return;

  const pad = 28;
  const boxW = rect.w - pad * 2;
  const boxH = rect.h - pad * 2;
  const scale = Math.min(boxW / logoImg.width, boxH / logoImg.height);
  const w = logoImg.width * scale;
  const h = logoImg.height * scale;
  const x = rect.x + (rect.w - w) / 2;
  const y = rect.y + (rect.h - h) / 2;
  ctx.drawImage(logoImg, x, y, w, h);
}

function drawCommentCard(rect, data, dominant, cardColor, layout) {
  const scale = clamp(layout.cellH / BASE_CELL_H, 0.65, 1);
  const radius = Math.round(18 * scale);
  const palette = cardColor ? cardPalette(cardColor) : pastelPalette(dominant);
  const color = palette[(data.author.length + data.comment.length) % palette.length];

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;
  drawRoundedRect(rect.x, rect.y, rect.w, rect.h, radius, color, "rgba(0,0,0,0.05)");
  ctx.restore();

  const pad = Math.round(16 * scale);
  const contentX = rect.x + pad;
  const contentY = rect.y + pad;
  const contentW = rect.w - pad * 2;

  // Avatar
  const avatarR = Math.round(18 * scale);
  const avatarX = contentX + avatarR;
  const avatarY = contentY + avatarR;
  drawCircle(avatarX, avatarY, avatarR, adjustColor(dominant, 10));
  ctx.fillStyle = "#ffffff";
  ctx.font = buildCanvasFont(Math.round(14 * scale), "bold");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(getInitials(data.author), avatarX, avatarY);

  // Author
  ctx.fillStyle = "#1d2230";
  ctx.font = buildCanvasFont(Math.round(15 * scale), "bold");
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(truncateText(data.author, contentW - 80), contentX + avatarR * 2 + 8, contentY + 2);

  // Mini icon
  ctx.fillStyle = adjustColor(dominant, 20);
  ctx.font = buildCanvasFont(Math.round(14 * scale));
  ctx.fillText("❖", rect.x + rect.w - pad - 12, contentY + 2);

  // Comment
  const commentY = contentY + Math.round(48 * scale);
  const commentH = rect.h - pad * 2 - Math.round(56 * scale);
  ctx.fillStyle = "#1d2230";
  fitTextBlock(ctx, data.comment, contentX, commentY, contentW, commentH, scale);

  // Reactions
  const reactionY = rect.y + rect.h - pad - Math.round(26 * scale);
  drawReactionPill(contentX, reactionY, "❤", data.numberOfReaction, dominant, scale);
  const showSecond = deterministicNumber(data.author, data.comment.length, 0, 2) === 0;
  if (showSecond) {
    drawReactionPill(contentX + Math.round(74 * scale), reactionY, "🔥", "1", dominant, scale);
  }
}

function drawReactionPill(x, y, icon, count, dominant, scale) {
  const w = Math.round(60 * scale);
  const h = Math.round(24 * scale);
  const r = Math.round(12 * scale);
  ctx.save();
  ctx.fillStyle = tintColor(dominant, 0.75);
  ctx.strokeStyle = tintColor(dominant, 0.6);
  ctx.lineWidth = 1;
  drawRoundedRect(x, y, w, h, r, ctx.fillStyle, ctx.strokeStyle);
  ctx.fillStyle = "#1a1f2e";
  ctx.font = buildCanvasFont(Math.round(14 * scale));
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(icon, x + Math.round(8 * scale), y + h / 2 + 1);
  ctx.fillText(String(count), x + Math.round(26 * scale), y + h / 2 + 1);
  ctx.restore();
}

function drawRoundedRect(x, y, w, h, r, fill, stroke) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function drawCircle(x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function wrapText(context, text, x, y, maxWidth, lineHeight, maxHeight) {
  const words = text.split(/\s+/);
  let line = "";
  let offsetY = 0;

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + " ";
    const metrics = context.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      if (offsetY + lineHeight > maxHeight) break;
      context.fillText(line.trim(), x, y + offsetY);
      line = words[i] + " ";
      offsetY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (offsetY + lineHeight <= maxHeight) {
    context.fillText(line.trim(), x, y + offsetY);
  }
}

function fitTextBlock(context, text, x, y, maxWidth, maxHeight, scale = 1) {
  const base = [14, 13, 12, 11];
  const sizes = base.map((s) => Math.max(10, Math.round(s * scale)));
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i];
    const lineHeight = size + 4;
    context.font = buildCanvasFont(size);
    if (fitsText(context, text, maxWidth, lineHeight, maxHeight)) {
      wrapText(context, text, x, y, maxWidth, lineHeight, maxHeight);
      return;
    }
  }
  // Fallback with smallest size, truncate last line
  const size = sizes[sizes.length - 1];
  const lineHeight = size + 4;
  context.font = buildCanvasFont(size);
  const clipped = truncateToFit(context, text, maxWidth, lineHeight, maxHeight);
  wrapText(context, clipped, x, y, maxWidth, lineHeight, maxHeight);
}

function fitsText(context, text, maxWidth, lineHeight, maxHeight) {
  const words = text.split(/\s+/);
  let line = "";
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + " ";
    const metrics = context.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      lines += 1;
      line = words[i] + " ";
    } else {
      line = testLine;
    }
  }
  lines += 1;
  return lines * lineHeight <= maxHeight;
}

function truncateToFit(context, text, maxWidth, lineHeight, maxHeight) {
  const words = text.split(/\s+/);
  let line = "";
  const lines = [];
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + " ";
    const metrics = context.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      lines.push(line.trim());
      line = words[i] + " ";
    } else {
      line = testLine;
    }
  }
  if (line.trim().length > 0) lines.push(line.trim());

  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
  if (lines.length <= maxLines) return text;

  const allowed = lines.slice(0, maxLines);
  let last = allowed[allowed.length - 1];
  while (context.measureText(last + "…").width > maxWidth && last.length > 1) {
    last = last.slice(0, -1);
  }
  allowed[allowed.length - 1] = last + "…";
  return allowed.join(" ");
}

function getInitials(name) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function truncateText(text, maxWidth) {
  let t = text;
  while (ctx.measureText(t).width > maxWidth && t.length > 1) {
    t = t.slice(0, -1);
  }
  return t === text ? text : t.slice(0, -1) + "…";
}

function pastelPalette(dominant) {
  const base = [
    "#cfe4ff",
    "#d7f0d1",
    "#ffe3b0",
    "#ffd6c2",
    "#cfe5e0",
  ];
  return base.map((c) => mixColors(c, dominant, 0.15));
}

function cardPalette(baseColor) {
  const base = normalizeColor(baseColor);
  return [
    mixColors(base, "#ffffff", 0.15),
    mixColors(base, "#ffffff", 0.3),
    base,
    mixColors(base, "#000000", 0.06),
    mixColors(base, "#000000", 0.12),
  ];
}

function deterministicNumber(seedA, seedB, min, max) {
  const str = String(seedA) + "|" + String(seedB);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const rand = Math.abs(hash) % (max - min + 1);
  return min + rand;
}

function normalizeColor(color) {
  if (typeof color !== "string") return DEFAULT_COLOR;
  return color.startsWith("#") ? color : DEFAULT_COLOR;
}

function mixColors(c1, c2, amount) {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  if (!a || !b) return c1;
  const r = Math.round(a.r + (b.r - a.r) * amount);
  const g = Math.round(a.g + (b.g - a.g) * amount);
  const b2 = Math.round(a.b + (b.b - a.b) * amount);
  return rgbToHex(r, g, b2);
}

function tintColor(color, amount) {
  return mixColors("#ffffff", color, amount);
}

function adjustColor(color, amount) {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const r = clamp(rgb.r + amount, 0, 255);
  const g = clamp(rgb.g + amount, 0, 255);
  const b = clamp(rgb.b + amount, 0, 255);
  return rgbToHex(r, g, b);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return null;
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r, g, b) {
  const toHex = (v) => v.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
