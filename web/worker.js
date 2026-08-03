// Runs bb.wasm inside a dedicated worker: `-loop` runs forever inside a
// single synchronous WASM call, which would otherwise freeze the page.
import { WASI } from "./wasi-shim.js";

// -width/-height pin aalib's stdout driver to an exact, known frame size.
// The patched web/patches/aastdout.c (see that file) writes each frame as
// two WIDTH*HEIGHT+HEIGHT-byte planes -- a character plane, then an
// attribute-class plane (each cell's class 0-4 as an ASCII digit) -- then
// a form-feed and a newline. No -extended: that mode uses aalib's full
// 256-value character palette as raw byte codes meant for the linux/
// curses drivers' custom font remapping, not as printable text -- fed
// into the page, those bytes produce invalid-UTF-8 replacement glyphs
// and, worse, spurious embedded newlines wherever a "pixel" happens to
// equal 0x0A or 0x0C. The plain character set is safe, printable ASCII.
// Even so, count bytes for framing rather than scanning for the
// trailer -- more robust regardless of what's in the content.
const params = new URL(self.location.href).searchParams;
const WIDTH = Number(params.get("w")) || 80;
const HEIGHT = Number(params.get("h")) || 25;
const ROW_BYTES = WIDTH + 1; // + row newline
const PLANE_BYTES = ROW_BYTES * HEIGHT;
const FRAME_STRIDE = 2 * PLANE_BYTES + 2; // char plane + attr plane + "\f\n"

postMessage({ type: "meta", width: WIDTH, height: HEIGHT });

function toRows(frame) {
  const chars = frame.subarray(0, PLANE_BYTES);
  const attrs = frame.subarray(PLANE_BYTES, 2 * PLANE_BYTES);
  const decoder = new TextDecoder();
  const rows = [];
  for (let y = 0; y < HEIGHT; y++) {
    const rowOffset = y * ROW_BYTES;
    const segments = [];
    let start = 0;
    let currentAttr = attrs[rowOffset] - 0x30;
    for (let x = 1; x <= WIDTH; x++) {
      const attr = x < WIDTH ? attrs[rowOffset + x] - 0x30 : -1;
      if (attr !== currentAttr) {
        segments.push([currentAttr, decoder.decode(chars.subarray(rowOffset + start, rowOffset + x))]);
        start = x;
        currentAttr = attr;
      }
    }
    rows.push(segments);
  }
  return rows;
}

let pending = new Uint8Array(0);

function append(bytes) {
  const merged = new Uint8Array(pending.length + bytes.length);
  merged.set(pending, 0);
  merged.set(bytes, pending.length);
  pending = merged;

  let offset = 0;
  while (offset + FRAME_STRIDE <= pending.length) {
    postMessage({ type: "frame", rows: toRows(pending.subarray(offset, offset + FRAME_STRIDE)) });
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
