# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89
#
# Cross-compiles bb to wasm32-wasi with zig cc (see the top-level Dockerfile
# for the same technique targeting native platforms). Run with:
#   docker build -f web/Dockerfile --output type=local,dest=web/dist .
# to place bb.wasm directly in web/dist alongside the static page assets.
FROM --platform=$BUILDPLATFORM debian:trixie-slim@sha256:020c0d20b9880058cbe785a9db107156c3c75c2ac944a6aa7ab59f2add76a7bd AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl xz-utils ca-certificates make binutils autotools-dev \
    && rm -rf /var/lib/apt/lists/*

ARG ZIG_VERSION=0.16.0
ARG BUILDARCH
RUN set -eux; \
    case "${BUILDARCH}" in \
      amd64) zigarch=x86_64 ;; \
      arm64) zigarch=aarch64 ;; \
      *) echo "unsupported builder arch ${BUILDARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fL "https://ziglang.org/download/${ZIG_VERSION}/zig-${zigarch}-linux-${ZIG_VERSION}.tar.xz" | tar -xJ -C /opt \
    && mv "/opt/zig-${zigarch}-linux-${ZIG_VERSION}" /opt/zig
ENV PATH="/opt/zig:${PATH}"

RUN printf '#!/bin/sh\nexec zig cc -target wasm32-wasi-musl "$@"\n' > /usr/local/bin/musl-cc \
    && printf '#!/bin/sh\nexec zig ar "$@"\n' > /usr/local/bin/musl-ar \
    && printf '#!/bin/sh\nexec zig ranlib "$@"\n' > /usr/local/bin/musl-ranlib \
    && chmod +x /usr/local/bin/musl-cc /usr/local/bin/musl-ar /usr/local/bin/musl-ranlib
ENV CC=/usr/local/bin/musl-cc AR=/usr/local/bin/musl-ar RANLIB=/usr/local/bin/musl-ranlib
# gnu89 + -Wno-*: same ancient-C-vs-modern-clang fixes as the native build.
# -D_WASI_EMULATED_SIGNAL: wasi-libc's signal.h errors out unless opted in;
# bb.h's SIGFPE-ignore is a real (if inert) use we want to keep compiling.
ENV CFLAGS="-static -std=gnu89 -O2 -fwrapv -D_WASI_EMULATED_SIGNAL -Wno-date-time -Wno-implicit-int -Wno-implicit-function-declaration -Wno-int-conversion -Wno-incompatible-function-pointer-types -Wno-return-type"

# aalib's configure.in decides whether to compile in the "Linux console"
# driver by running bare `uname` on the machine running configure -- which
# reports Linux even when cross-compiling to wasm32-wasi. Shadow it (only
# for the no-argument form; config.guess's `uname -s`/`-m` pass through)
# so the driver-detection heuristic sees a non-Linux build system, like it
# would on a genuine cross build.
RUN printf '#!/bin/sh\nif [ $# -eq 0 ]; then echo wasm; else exec /usr/bin/uname "$@"; fi\n' > /usr/local/bin/uname \
    && chmod +x /usr/local/bin/uname

RUN curl -fL 'https://sourceforge.net/projects/aa-project/files/aa-lib/1.4rc5/aalib-1.4rc5.tar.gz/download' -o aalib.tar.gz \
    && tar -xzf aalib.tar.gz && rm aalib.tar.gz
WORKDIR /aalib-1.4.0
# aaslnkbd.c/aaslang.c/aacurkbd.c/aacurmou.c/aacurses.c/aagpm.c unconditionally
# #include <setjmp.h>/<signal.h> at the top of the file even though the code
# using them is entirely inside an #ifdef for a driver we never enable
# (slang/curses/gpm aren't installed) -- wasi-libc's headers #error out on
# inclusion regardless of whether anything in the file actually calls
# setjmp/signal. Move the includes inside the guard, where they belong.
RUN for f in src/aaslnkbd.c src/aaslang.c src/aacurkbd.c src/aacurmou.c src/aacurses.c src/aagpm.c; do \
      sed -i '1,2d' "$f"; \
      sed -i '0,/^#ifdef /{s/^#ifdef \(.*\)/#ifdef \1\n#include <setjmp.h>\n#include <signal.h>/}' "$f"; \
    done
# aastdin.c's stdin keyboard driver is always compiled in and genuinely uses
# SIGWINCH + setjmp/longjmp to interrupt a blocking read on terminal resize.
# There's no real terminal (or resize signal) in a WASI/browser context, and
# setjmp/longjmp aren't supported on wasm32 without the (non-standard)
# exception-handling proposal, so drop the resize-interrupt trick entirely --
# it's meaningless here regardless.
# aastdout.c's driver only advertises AA_NORMAL_MASK, so aa_render() never
# picks any other attribute class -- attrbuffer is always 0, no color/dim/
# bold/reverse variation is possible no matter what the web page does with
# it. Advertise DIM/BOLD/REVERSE too, and emit an attribute plane alongside
# the character plane (see the file for the exact format web/worker.js
# expects).
COPY web/patches/aastdin.c src/aastdin.c
COPY web/patches/aastdout.c src/aastdout.c
RUN cp /usr/share/misc/config.guess /usr/share/misc/config.sub . \
    && ./configure --host=wasm32-wasi --disable-shared --enable-static \
    && make && make install

WORKDIR /
RUN curl -fL 'https://sourceforge.net/projects/aa-project/files/bb/1.3rc1/bb-1.3rc1.tar.gz/download' -o bb.tar.gz \
    && tar -xzf bb.tar.gz && rm bb.tar.gz
WORKDIR /bb-1.3.0
# Same x86-only regparm fix as the native build.
RUN sed -i 's/#define REGISTERS(n) __attribute__ ((regparm(n)))/#if defined(__i386__) || defined(__x86_64__)\n#define REGISTERS(n) __attribute__ ((regparm(n)))\n#else\n#define REGISTERS(n)\n#endif/' config.h
# bb.c calls time(NULL) without #include <time.h>, so the compiler assumes
# the implicit K&R prototype `int time()`. On native ABIs the real 64-bit
# time_t return value happens to still work (just truncated); wasm validates
# call signatures strictly and rejects the i32/i64 mismatch outright.
RUN sed -i '/#include <string.h>/i #include <time.h>' bb.c
RUN cp /usr/share/misc/config.guess /usr/share/misc/config.sub . \
    && ./configure --host=wasm32-wasi \
    && make LDFLAGS="-static"

# bb never compiled in sound (libmikmod is missing, per its own configure
# output), and there's no realistic path to changing that: WASI has no
# audio API at all, so even a working libmikmod couldn't play anything
# from inside the wasm module. Playing bb's actual soundtrack means doing
# it independently, client-side, with an existing tracker-module player --
# libopenmpt (BSD-3-Clause/BSL-1.0) is the mature, actively maintained one,
# with an official prebuilt WebAssembly build for exactly this.
FROM --platform=$BUILDPLATFORM debian:trixie-slim@sha256:020c0d20b9880058cbe785a9db107156c3c75c2ac944a6aa7ab59f2add76a7bd AS openmpt
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ARG LIBOPENMPT_VERSION=0.8.7
RUN curl -fL "https://lib.openmpt.org/files/libopenmpt/dev/libopenmpt-${LIBOPENMPT_VERSION}+release.dev.js.tar.gz" | tar -xz -C /opt \
    && mv "/opt/libopenmpt-${LIBOPENMPT_VERSION}+release/bin/wasm" /opt/libopenmpt

FROM scratch AS export
COPY --from=build /bb-1.3.0/bb /bb.wasm
COPY --from=build /bb-1.3.0/bb.s3m /bb.s3m
COPY --from=openmpt /opt/libopenmpt/libopenmpt.js /opt/libopenmpt/libopenmpt.wasm /
COPY web/index.html web/wasi-shim.js web/worker.js web/app.js web/audio.js web/bb-logo.jpg /
