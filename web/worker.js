// Runs bb.wasm inside a dedicated worker: `-loop` runs forever inside a
// single synchronous WASM call, which would otherwise freeze the page.
import { WASI } from "./wasi-shim.js";

let pending = new Uint8Array(0);

function append(bytes) {
  const merged = new Uint8Array(pending.length + bytes.length);
  merged.set(pending, 0);
  merged.set(bytes, pending.length);
  pending = merged;

  // aalib's stdout driver separates frames with a form-feed (0x0C) byte.
  let start = 0;
  for (let i = 0; i < pending.length; i++) {
    if (pending[i] === 0x0c) {
      const frame = pending.subarray(start, i);
      postMessage(new TextDecoder().decode(frame));
      start = i + 1;
    }
  }
  pending = pending.subarray(start);
}

const wasi = new WASI({
  args: ["bb", "-driver", "stdout", "-extended", "-loop"],
  onStdout: append,
  onStderr: (bytes) => console.error(new TextDecoder().decode(bytes)),
});

const { instance } = await WebAssembly.instantiateStreaming(fetch("bb.wasm"), {
  wasi_snapshot_preview1: wasi.wasiImport,
});

wasi.start(instance);
