import { REWARDS } from "./content.js";

const PIN = "3662";
const STORAGE_KEY = "rg_state_v2";

const DEMO_ID = "demo";
const DEMO_REWARD = () => ({
  quote: "Bravo, t'as compris le principe 🎉 Maintenant à toi d'écrire tes vrais objectifs du week-end dans les 3 colonnes !",
  date: "",
  image: REWARDS[Math.floor(Math.random() * REWARDS.length)].image,
});

let state = loadState();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  let s = null;
  try { s = raw ? JSON.parse(raw) : null; } catch (e) { s = null; }
  if (!s) s = { locked: false, items: [], usedRewards: [] };
  if (!s.items) s.items = [];
  if (!s.usedRewards) s.usedRewards = [];
  if (!s.items.find((i) => i.id === DEMO_ID)) {
    s.items.unshift({
      id: DEMO_ID,
      text: "Clique-moi pour voir comment ça marche",
      category: null,
      done: false,
      doneAt: null,
      isDemo: true,
    });
  }
  return s;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

// ---------- PIN gate ----------
const pinGate = document.getElementById("pin-gate");
const appEl = document.getElementById("app");
const pinInput = document.getElementById("pin-input");
const pinError = document.getElementById("pin-error");

function unlockApp() {
  pinGate.style.display = "none";
  appEl.style.display = "block";
  startCountdowns();
  render();
}

document.getElementById("pin-submit").addEventListener("click", tryPin);
pinInput.addEventListener("keydown", (e) => { if (e.key === "Enter") tryPin(); });

function tryPin() {
  if (pinInput.value.trim() === PIN) {
    localStorage.setItem("rg_unlocked", "1");
    unlockApp();
  } else {
    pinError.textContent = "Nope, réessaie 🐾";
    pinInput.value = "";
  }
}

// ---------- countdowns ----------
const ECRIT = new Date("2026-09-01T08:00:00+02:00");
const ORAL = new Date("2026-09-01T16:00:00+02:00");

function fmt(ms) {
  if (ms <= 0) return "Bonne chance !";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return d > 0 ? `${d}j ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function startCountdowns() {
  const tick = () => {
    document.getElementById("cd-ecrit").textContent = fmt(ECRIT - new Date());
    document.getElementById("cd-oral").textContent = fmt(ORAL - new Date());
  };
  tick();
  setInterval(tick, 1000);
}

// ---------- hidden gesture to re-open adding ----------
let tapCount = 0;
let tapTimer = null;
document.getElementById("header-tap").addEventListener("click", () => {
  tapCount += 1;
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { tapCount = 0; }, 2000);
  if (tapCount >= 5) {
    tapCount = 0;
    state.locked = false;
    saveState();
  }
});

// ---------- add items (per column) ----------
document.querySelectorAll(".add-form.small").forEach((form) => {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = form.querySelector("input");
    const text = input.value.trim();
    if (!text) return;
    state.items.push({
      id: genId(),
      text,
      category: form.dataset.cat,
      done: false,
      doneAt: null,
    });
    input.value = "";
    saveState();
  });
});

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ---------- validate list (lock) ----------
document.getElementById("validate-btn").addEventListener("click", () => {
  const realItems = state.items.filter((i) => !i.isDemo);
  const errBox = document.getElementById("validate-error");
  if (realItems.length === 0) {
    errBox.textContent = "Ajoute au moins un objectif avant de valider !";
    return;
  }
  errBox.textContent = "";
  showConfirm(
    "Tu es sûre d'avoir tout écrit ? Impossible d'en rajouter après.",
    () => { state.locked = true; saveState(); }
  );
});

// ---------- toggle done ----------
function requestToggle(item) {
  if (item.done) {
    item.done = false;
    item.doneAt = null;
    saveState();
    return;
  }
  showConfirm(`Tu as vraiment fini : « ${item.text} » ?`, () => markDone(item));
}

function markDone(item) {
  item.done = true;
  item.doneAt = new Date().toISOString();
  const reward = item.isDemo ? DEMO_REWARD() : pickReward(item.category);
  saveState();
  showReward(reward);
}

function pickReward(category) {
  const isUnused = (idx) => !state.usedRewards.includes(idx);
  let candidates = REWARDS.map((r, idx) => ({ ...r, idx })).filter((r) => r.category === category && isUnused(r.idx));
  if (candidates.length === 0) candidates = REWARDS.map((r, idx) => ({ ...r, idx })).filter((r) => isUnused(r.idx));
  if (candidates.length === 0) candidates = REWARDS.map((r, idx) => ({ ...r, idx }));
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  state.usedRewards.push(picked.idx);
  return picked;
}

// ---------- modals ----------
function showConfirm(message, onYes) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-overlay" id="confirm-overlay">
      <div class="modal-card confirm-card">
        <div class="modal-body">
          <p class="quote" style="font-style:normal;">${escapeHtml(message)}</p>
          <div style="display:flex; gap:10px; justify-content:center; margin-top:14px;">
            <button class="secondary" id="confirm-no">Pas encore</button>
            <button id="confirm-yes">Oui, c'est fait ✅</button>
          </div>
        </div>
      </div>
    </div>`;
  document.getElementById("confirm-yes").addEventListener("click", () => { root.innerHTML = ""; onYes(); });
  document.getElementById("confirm-no").addEventListener("click", () => { root.innerHTML = ""; });
  document.getElementById("confirm-overlay").addEventListener("click", (e) => {
    if (e.target.id === "confirm-overlay") root.innerHTML = "";
  });
}

function showReward(reward) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-overlay" id="reward-overlay">
      <div class="modal-card">
        <img src="${reward.image}" alt="souvenir" />
        <div class="modal-body">
          <div class="kicker">Objectif validé 🎉</div>
          <p class="quote">${reward.quote}</p>
          ${reward.date ? `<div class="date">${reward.date}</div>` : ""}
          <button id="reward-close">Continuer</button>
        </div>
      </div>
    </div>`;
  document.getElementById("reward-close").addEventListener("click", () => { root.innerHTML = ""; });
  document.getElementById("reward-overlay").addEventListener("click", (e) => {
    if (e.target.id === "reward-overlay") root.innerHTML = "";
  });
}

// ---------- render ----------
function itemHtml(item, locked) {
  if (!locked) {
    return `
      <div class="item" data-id="${item.id}">
        <div class="text">${escapeHtml(item.text)}</div>
        <button class="del" data-action="delete">✕</button>
      </div>`;
  }
  return `
    <div class="item ${item.done ? "done" : ""}" data-id="${item.id}">
      <div class="check" data-action="toggle">${item.done ? "✓" : ""}</div>
      <div class="text">${escapeHtml(item.text)}</div>
    </div>`;
}

function deleteItem(id) {
  state.items = state.items.filter((i) => i.id !== id);
  saveState();
}

function render() {
  const demo = state.items.find((i) => i.id === DEMO_ID);
  const demoCard = document.getElementById("demo-card");
  demoCard.innerHTML = `
    <div class="item demo ${demo.done ? "done" : ""}" data-id="${demo.id}">
      <div class="check" data-action="toggle">${demo.done ? "✓" : ""}</div>
      <div class="text">🎁 ${escapeHtml(demo.text)}</div>
      <div class="cat-tag" style="background:var(--lavender);">test</div>
    </div>`;
  demoCard.querySelector('[data-action="toggle"]').addEventListener("click", () => requestToggle(demo));

  document.getElementById("setup-banner").style.display = state.locked ? "none" : "block";
  document.getElementById("banner-photo").style.display = state.locked ? "block" : "none";
  document.querySelectorAll(".add-form.small").forEach((f) => { f.style.display = state.locked ? "none" : "flex"; });

  const cats = { etudes: "col-etudes", sport: "col-sport", amour: "col-amour" };
  Object.entries(cats).forEach(([cat, colId]) => {
    const col = document.getElementById(colId);
    const items = state.items.filter((i) => i.category === cat);
    col.innerHTML = items.length
      ? items.map((i) => itemHtml(i, state.locked)).join("")
      : `<div class="empty-state" style="padding:14px 4px;">rien pour l'instant</div>`;
    col.querySelectorAll('[data-action="toggle"]').forEach((el) => {
      const id = el.closest(".item").dataset.id;
      const item = state.items.find((i) => i.id === id);
      el.addEventListener("click", () => requestToggle(item));
    });
    col.querySelectorAll('[data-action="delete"]').forEach((el) => {
      const id = el.closest(".item").dataset.id;
      el.addEventListener("click", () => deleteItem(id));
    });
  });

  const realItems = state.items.filter((i) => !i.isDemo);
  const done = realItems.filter((i) => i.done).length;
  const pct = realItems.length === 0 ? 0 : Math.round((done / realItems.length) * 100);
  document.getElementById("progress-fill").style.width = pct + "%";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

if (localStorage.getItem("rg_unlocked") === "1") unlockApp();
