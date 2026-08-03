// bb never compiled in sound (libmikmod is missing, and WASI has no audio
// API regardless -- there's no path to the wasm module playing anything
// itself). This plays bb's actual bb.s3m soundtrack independently,
// client-side, via libopenmpt (loaded as a classic script by index.html,
// which sets the global `libopenmpt`/`Module` this depends on). Not
// synced to whichever scene bb.wasm is currently rendering -- there's no
// signal from the wasm side to sync to -- just a soundtrack loop.
//
// Wrapped in an IIFE: libopenmpt.js is also a classic (non-module) script
// and litters the shared global scope with its own internal `var`s (e.g.
// wasmMemory, node, start all collide with obvious names -- discovered
// the hard way when `function wasmMemory(){}` here got silently
// clobbered by its same-named global).
(function () {
  const BUFFER_FRAMES = 4096;

  let audioCtx = null;
  let audioNode = null;
  let modPtr = 0;
  let outPtr = 0;
  let playing = false;

  // This build of libopenmpt.js doesn't expose memory-access helpers on
  // the Module object -- index.html captures the real wasm instance
  // exports by wrapping WebAssembly.instantiate(Streaming) instead. Even
  // export names are minified in this build (no "memory" key to look
  // up), so find the one export that's actually a WebAssembly.Memory
  // instead. Fetch fresh views each time rather than caching: growing
  // memory detaches old ArrayBuffers.
  function findWasmMemory() {
    for (const value of Object.values(window.__wasmExports)) {
      if (value instanceof WebAssembly.Memory) return value;
    }
    throw new Error("no WebAssembly.Memory export found on libopenmpt.wasm");
  }
  const memU8 = () => new Uint8Array(findWasmMemory().buffer);
  const memF32 = () => new Float32Array(findWasmMemory().buffer);

  function whenReady(cb) {
    const Module = window.libopenmpt;
    if (Module.calledRun) cb(Module);
    else {
      const prev = Module.onRuntimeInitialized;
      Module.onRuntimeInitialized = () => {
        prev?.();
        cb(Module);
      };
    }
  }

  async function startMusic(button) {
    button.disabled = true;
    button.textContent = "Loading…";
    const Module = await new Promise((resolve) => whenReady(resolve));

    const data = new Uint8Array(await (await fetch("bb.s3m")).arrayBuffer());
    const dataPtr = Module._malloc(data.length);
    memU8().set(data, dataPtr);
    modPtr = Module._openmpt_module_create_from_memory(dataPtr, data.length, 0, 0, 0);
    Module._free(dataPtr);
    if (!modPtr) {
      button.textContent = "Failed to load bb.s3m";
      return;
    }
    Module._openmpt_module_set_repeat_count(modPtr, -1); // loop forever

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    outPtr = Module._malloc(BUFFER_FRAMES * 2 * 4); // interleaved stereo float32
    audioNode = audioCtx.createScriptProcessor(BUFFER_FRAMES, 0, 2);
    audioNode.onaudioprocess = (event) => {
      const rendered = Module._openmpt_module_read_interleaved_float_stereo(
        modPtr,
        audioCtx.sampleRate,
        BUFFER_FRAMES,
        outPtr,
      );
      const interleaved = memF32().subarray(outPtr / 4, outPtr / 4 + rendered * 2);
      const left = event.outputBuffer.getChannelData(0);
      const right = event.outputBuffer.getChannelData(1);
      for (let i = 0; i < rendered; i++) {
        left[i] = interleaved[i * 2];
        right[i] = interleaved[i * 2 + 1];
      }
      for (let i = rendered; i < BUFFER_FRAMES; i++) left[i] = right[i] = 0;
    };
    audioNode.connect(audioCtx.destination);

    playing = true;
    button.disabled = false;
    button.textContent = "🔊 Pause music";
  }

  function stopMusic(button) {
    audioCtx.suspend();
    playing = false;
    button.textContent = "🔇 Play music";
  }

  function resumeMusic(button) {
    audioCtx.resume();
    playing = true;
    button.textContent = "🔊 Pause music";
  }

  const button = document.getElementById("music");
  button.onclick = () => {
    if (!audioCtx) startMusic(button);
    else if (playing) stopMusic(button);
    else resumeMusic(button);
  };
})();
