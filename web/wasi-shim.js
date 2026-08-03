// Minimal WASI preview1 host, covering exactly the imports bb.wasm needs:
// args_get, args_sizes_get, environ_get, environ_sizes_get, clock_time_get,
// fd_fdstat_get, fd_read, fd_seek, fd_write, poll_oneoff, proc_exit, fd_close.
// There is no real stdin/terminal here, so reads/polls always report
// "nothing available" -- bb.wasm treats that the same way a real terminal
// with no pending keypress would.
export class WASIExit extends Error {
  constructor(code) {
    super(`proc_exit(${code})`);
    this.code = code;
  }
}

const ESUCCESS = 0;
const ESPIPE = 70;

export class WASI {
  constructor({ args = [], onStdout, onStderr } = {}) {
    this.args = args;
    this.onStdout = onStdout || (() => {});
    this.onStderr = onStderr || (() => {});
    this.instance = null;

    this.wasiImport = {
      args_sizes_get: (argcPtr, argvBufSizePtr) => {
        const view = this._view();
        view.setUint32(argcPtr, this.args.length, true);
        const bufSize = this.args.reduce((n, a) => n + Buffer_byteLength(a) + 1, 0);
        view.setUint32(argvBufSizePtr, bufSize, true);
        return ESUCCESS;
      },
      args_get: (argvPtr, argvBufPtr) => {
        const view = this._view();
        let offset = argvBufPtr;
        this.args.forEach((arg, i) => {
          view.setUint32(argvPtr + i * 4, offset, true);
          offset += this._writeCString(arg, offset);
        });
        return ESUCCESS;
      },
      environ_sizes_get: (countPtr, bufSizePtr) => {
        const view = this._view();
        view.setUint32(countPtr, 0, true);
        view.setUint32(bufSizePtr, 0, true);
        return ESUCCESS;
      },
      environ_get: () => ESUCCESS,
      clock_time_get: (_clockId, _precision, timePtr) => {
        const view = this._view();
        const nanos = BigInt(Math.round(performance.now() * 1e6));
        view.setBigUint64(timePtr, nanos, true);
        return ESUCCESS;
      },
      fd_fdstat_get: (_fd, bufPtr) => {
        const view = this._view();
        view.setUint8(bufPtr + 0, 2); // filetype: character_device
        view.setUint16(bufPtr + 2, 0, true); // fs_flags
        view.setBigUint64(bufPtr + 8, 0xffffffffffffffffn, true); // fs_rights_base
        view.setBigUint64(bufPtr + 16, 0xffffffffffffffffn, true); // fs_rights_inheriting
        return ESUCCESS;
      },
      fd_read: (_fd, _iovsPtr, _iovsLen, nreadPtr) => {
        this._view().setUint32(nreadPtr, 0, true); // always EOF, no real stdin
        return ESUCCESS;
      },
      fd_seek: () => ESPIPE, // stdio isn't seekable
      fd_close: () => ESUCCESS,
      fd_write: (fd, iovsPtr, iovsLen, nwrittenPtr) => {
        const view = this._view();
        const bytes = this._bytes();
        let total = 0;
        const chunks = [];
        for (let i = 0; i < iovsLen; i++) {
          const ptr = view.getUint32(iovsPtr + i * 8, true);
          const len = view.getUint32(iovsPtr + i * 8 + 4, true);
          chunks.push(bytes.subarray(ptr, ptr + len));
          total += len;
        }
        const merged = chunks.length === 1 ? chunks[0] : Uint8Array_concat(chunks, total);
        if (fd === 1) this.onStdout(merged);
        else if (fd === 2) this.onStderr(merged);
        view.setUint32(nwrittenPtr, total, true);
        return ESUCCESS;
      },
      poll_oneoff: (inPtr, outPtr, nsubscriptions, neventsPtr) => {
        const view = this._view();
        let fired = 0;
        for (let i = 0; i < nsubscriptions; i++) {
          const subOff = inPtr + i * 48;
          const userdata = view.getBigUint64(subOff, true);
          const tag = view.getUint8(subOff + 8);
          if (tag !== 0) continue; // only clock subscriptions ever fire: no
          // real stdin, so fd_read/fd_write readiness never happens.
          const evOff = outPtr + fired * 32;
          view.setBigUint64(evOff, userdata, true); // userdata
          view.setUint16(evOff + 8, ESUCCESS, true); // error
          view.setUint8(evOff + 10, 0); // type: clock
          view.setBigUint64(evOff + 16, 0n, true); // fd_readwrite.nbytes
          view.setUint16(evOff + 24, 0, true); // fd_readwrite.flags
          fired++;
        }
        if (fired === 0 && nsubscriptions > 0) {
          // Never block forever: if nothing was a clock subscription, still
          // report the first one as elapsed so callers can't hang.
          const userdata = view.getBigUint64(inPtr, true);
          view.setBigUint64(outPtr, userdata, true);
          view.setUint16(outPtr + 8, ESUCCESS, true);
          view.setUint8(outPtr + 10, 0);
          view.setBigUint64(outPtr + 16, 0n, true);
          view.setUint16(outPtr + 24, 0, true);
          fired = 1;
        }
        view.setUint32(neventsPtr, fired, true);
        return ESUCCESS;
      },
      proc_exit: (code) => {
        throw new WASIExit(code);
      },
    };
  }

  setInstance(instance) {
    this.instance = instance;
  }

  start(instance) {
    this.setInstance(instance);
    try {
      instance.exports._start();
    } catch (e) {
      if (e instanceof WASIExit) return e.code;
      throw e;
    }
    return 0;
  }

  _view() {
    return new DataView(this.instance.exports.memory.buffer);
  }

  _bytes() {
    return new Uint8Array(this.instance.exports.memory.buffer);
  }

  _writeCString(str, ptr) {
    const bytes = new TextEncoder().encode(str);
    this._bytes().set(bytes, ptr);
    this._view().setUint8(ptr + bytes.length, 0);
    return bytes.length + 1;
  }
}

function Buffer_byteLength(str) {
  return new TextEncoder().encode(str).length;
}

function Uint8Array_concat(chunks, total) {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
