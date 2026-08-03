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

function fitFont() {
  const reserved = ["logo", "sizes", "music", "status"]
    .map((id) => document.getElementById(id))
    .reduce((sum, el) => sum + (el && el.isConnected ? el.getBoundingClientRect().height + 12 : 0), 0);
  const footer = document.querySelector("footer").getBoundingClientRect().height;
  const availWidth = window.innerWidth - 32;
  const availHeight = window.innerHeight - reserved - footer - 48;
  const fontByWidth = availWidth / cols / 0.6; // ~character-width:font-size ratio for monospace
  const fontByHeight = availHeight / rows / 1.2; // ~line-height:font-size ratio
  const fontSize = Math.max(3, Math.min(fontByWidth, fontByHeight, 22));
  screen.style.fontSize = `${fontSize}px`;
}

for (const size of SIZES) {
  const button = document.createElement("button");
  button.textContent = size.label;
  button.setAttribute("aria-pressed", size === DEFAULT_SIZE);
  button.onclick = () => {
    for (const b of sizesEl.children) b.setAttribute("aria-pressed", b === button);
    startWorker(size);
  };
  sizesEl.appendChild(button);
}

window.addEventListener("resize", fitFont);
startWorker(DEFAULT_SIZE);

setInterval(() => {
  const rows = queue.shift();
  if (rows !== undefined) screen.innerHTML = rowsToHtml(rows);
}, 1000 / FPS);
