const screen = document.getElementById("screen");
const status = document.getElementById("status");
const sizesEl = document.getElementById("sizes");

const SIZES = [
  { label: "40×12", w: 40, h: 12 },
  { label: "80×25", w: 80, h: 25 },
  { label: "120×37", w: 120, h: 37 },
  { label: "160×50", w: 160, h: 50 },
];
const DEFAULT_SIZE = SIZES[1];

const FPS = 20;
const MAX_QUEUE = 4; // drop backlog rather than let display lag behind
const CHAR_W_RATIO = 0.6; // ~character-width:font-size ratio for monospace
const LINE_H_RATIO = 1.2; // ~line-height:font-size ratio

const ESCAPE = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ESCAPE[c]);

// Attribute classes from aa_render(), per aalib's aamktabl.c: 0 normal,
// 1 dim, 2 bold, 3 boldfont (unused here -- font-switching only makes
// sense for curses/X11), 4 reverse. Anything else is a fill-table miss
// (aarender.c falls back to an unused sentinel table slot); style it as
// normal rather than give it special meaning.
function rowsToHtml(rows) {
  let html = "";
  for (const row of rows) {
    for (const [attr, text] of row) {
      const cls = attr >= 0 && attr <= 4 ? attr : 0;
      html += `<span class="a${cls}">${escapeHtml(text)}</span>`;
    }
    html += "\n";
  }
  return html;
}

let worker = null;
let queue = [];
let cols = DEFAULT_SIZE.w;
let rows = DEFAULT_SIZE.h;
let manualSize = DEFAULT_SIZE; // restored when leaving fullscreen's auto-res

function startWorker(size) {
  if (worker) worker.terminate();
  queue = [];
  status.textContent = "Loading bb.wasm…";
  screen.after(status);
  worker = new Worker(`worker.js?w=${size.w}&h=${size.h}`, { type: "module" });
  worker.onmessage = (event) => {
    const msg = event.data;
    if (msg.type === "meta") {
      cols = msg.width;
      rows = msg.height;
      fitFont();
      return;
    }
    status.remove();
    queue.push(msg.rows);
    while (queue.length > MAX_QUEUE) queue.shift();
  };
  worker.onerror = (event) => {
    status.textContent = `Failed to run bb.wasm: ${event.message}`;
    screen.after(status);
  };
}

function reservedHeight() {
  const ids = document.fullscreenElement ? ["controls"] : ["logo", "sizes", "controls", "status"];
  const els = ids.map((id) => document.getElementById(id));
  const footer = document.fullscreenElement ? 0 : document.querySelector("footer").getBoundingClientRect().height;
  return els.reduce((sum, el) => sum + (el && el.isConnected ? el.getBoundingClientRect().height + 12 : 0), 0) + footer;
}

function fitFont() {
  const availWidth = window.innerWidth - 32;
  const availHeight = window.innerHeight - reservedHeight() - 16;
  const fontByWidth = availWidth / cols / CHAR_W_RATIO;
  const fontByHeight = availHeight / rows / LINE_H_RATIO;
  const fontSize = Math.max(3, Math.min(fontByWidth, fontByHeight, 22));
  screen.style.fontSize = `${fontSize}px`;
}

// Fullscreen goes for maximum ascii resolution rather than reusing
// whichever preset was picked before -- a target character-cell size,
// scaled to however much screen the user actually has (an ultrawide gets
// a proportionally wider grid, not just a bigger font on the same 80x25).
const AUTO_CHAR_PX = 8;
const AUTO_MIN = { w: 40, h: 12 };
const AUTO_MAX = { w: 300, h: 100 };
function computeAutoSize() {
  const availWidth = window.innerWidth - 16;
  const availHeight = window.innerHeight - reservedHeight() - 16;
  const w = Math.round(availWidth / (AUTO_CHAR_PX * CHAR_W_RATIO));
  const h = Math.round(availHeight / (AUTO_CHAR_PX * LINE_H_RATIO));
  return {
    w: Math.max(AUTO_MIN.w, Math.min(w, AUTO_MAX.w)),
    h: Math.max(AUTO_MIN.h, Math.min(h, AUTO_MAX.h)),
  };
}

for (const size of SIZES) {
  const button = document.createElement("button");
  button.textContent = size.label;
  button.setAttribute("aria-pressed", size === DEFAULT_SIZE);
  button.onclick = () => {
    for (const b of sizesEl.children) b.setAttribute("aria-pressed", b === button);
    manualSize = size;
    startWorker(size);
  };
  sizesEl.appendChild(button);
}

window.addEventListener("resize", fitFont);

const fullscreenButton = document.getElementById("fullscreen");
fullscreenButton.onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.body.requestFullscreen();
};
document.addEventListener("fullscreenchange", () => {
  fullscreenButton.textContent = document.fullscreenElement ? "⛶ Exit fullscreen" : "⛶ Fullscreen";
  if (document.fullscreenElement) {
    startWorker(computeAutoSize());
    screen.style.fontSize = `${AUTO_CHAR_PX}px`;
  } else {
    startWorker(manualSize);
  }
});

startWorker(DEFAULT_SIZE);

setInterval(() => {
  const rows = queue.shift();
  if (rows !== undefined) screen.innerHTML = rowsToHtml(rows);
}, 1000 / FPS);
