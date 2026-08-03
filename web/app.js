const screen = document.getElementById("screen");
const status = document.getElementById("status");

const FPS = 20;
const MAX_QUEUE = 4; // drop backlog rather than let display lag behind

const queue = [];
const worker = new Worker("worker.js", { type: "module" });

worker.onmessage = (event) => {
  status.remove();
  queue.push(event.data);
  while (queue.length > MAX_QUEUE) queue.shift();
};

worker.onerror = (event) => {
  status.textContent = `Failed to run bb.wasm: ${event.message}`;
};

setInterval(() => {
  const frame = queue.shift();
  if (frame !== undefined) screen.textContent = frame;
}, 1000 / FPS);
