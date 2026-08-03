// Runs bb.wasm inside a dedicated worker: `-loop` runs forever inside a
// single synchronous WASM call, which would otherwise freeze the page.
import { WASI } from "./wasi-shim.js";

// -width/-height pin aalib's stdout driver to an exact, known frame size.
// aalib's stdout driver (aastdout.c) writes each frame as WIDTH*HEIGHT
// content bytes (HEIGHT newline-terminated rows) followed by a form-feed
// and a newline. No -extended: that mode uses aalib's full 256-value
// palette as raw byte codes meant for the linux/curses drivers' custom
// font remapping, not as printable text -- fed into textContent, those
// bytes produce invalid-UTF-8 replacement glyphs and, worse, spurious
// embedded newlines wherever a "pixel" happens to equal 0x0A or 0x0C.
// The plain character set is safe, printable ASCII. Even so, count
// bytes for framing rather than scanning for the trailer -- more robust
// regardless of what's in the content.
const WIDTH = 80;
const HEIGHT = 25;
const FRAME_BYTES = WIDTH * HEIGHT + HEIGHT;
const FRAME_STRIDE = FRAME_BYTES + 2; // + trailing "\f\n"

let pending = new Uint8Array(0);

function append(bytes) {
  const merged = new Uint8Array(pending.length + bytes.length);
  merged.set(pending, 0);
  merged.set(bytes, pending.length);
  pending = merged;

  let offset = 0;
  while (offset + FRAME_STRIDE <= pending.length) {
    const frame = pending.subarray(offset, offset + FRAME_BYTES);
    postMessage(new TextDecoder().decode(frame));
    offset += FRAME_STRIDE;
  }
  pending = pending.subarray(offset);
}

const wasi = new WASI({
  args: ["bb", "-driver", "stdout", "-width", String(WIDTH), "-height", String(HEIGHT), "-loop"],
  onStdout: append,
  onStderr: (bytes) => console.error(new TextDecoder().decode(bytes)),
});

const { instance } = await WebAssembly.instantiateStreaming(fetch("bb.wasm"), {
  wasi_snapshot_preview1: wasi.wasiImport,
});

wasi.start(instance);
