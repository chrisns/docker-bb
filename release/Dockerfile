# syntax=docker/dockerfile:1
#
# Cross-compiles bb as a single standalone binary for one TARGET (a zig
# target triple), using the same zig cc technique as the top-level and
# web/ Dockerfiles. Unlike those, this isn't limited to what Docker/
# buildx has a platform for: zig can cross-compile for anything it has
# an LLVM backend and libc for, so this also reaches architectures
# Docker has no buildx platform for (mips, riscv32, loongarch64, s390x,
# ppc64 big-endian, even a Qualcomm Hexagon DSP) and OSes a Linux
# container can never run at all (FreeBSD, NetBSD, OpenBSD, Windows,
# macOS).
#
# Run with:
#   docker build -f release/Dockerfile --build-arg TARGET=riscv64-linux-musl \
#     --output type=local,dest=release/dist .
FROM --platform=$BUILDPLATFORM debian:trixie-slim AS build
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

ARG TARGET
RUN test -n "$TARGET" || (echo "TARGET build-arg is required, e.g. --build-arg TARGET=riscv64-linux-musl" >&2; exit 1)

# Autoconf's config.guess/config.sub (from 1999-2001) don't recognize
# zig's triple spelling for every OS -- Windows needs the classic mingw32
# triple or config.sub rejects it outright. Static linking isn't
# available for every OS's libc either: musl (all the *-linux-musl*
# targets) and mingw both support it, but FreeBSD/NetBSD/OpenBSD/macOS's
# own libc doesn't ("libc of the specified target requires dynamic
# linking").
RUN <<'SETUP'
set -eux
case "$TARGET" in
  *-windows-gnu)
    arch="${TARGET%%-*}"
    echo "${arch}-w64-mingw32" > /host
    echo "-static" > /static-flag
    echo 1 > /is-windows
    ;;
  *-macos-none|*-freebsd-none|*-netbsd-none|*-openbsd-none)
    echo "$TARGET" > /host
    echo "" > /static-flag
    echo 0 > /is-windows
    ;;
  *)
    echo "$TARGET" > /host
    echo "-static" > /static-flag
    echo 0 > /is-windows
    ;;
esac

# zig cc, compiling (-c) without an explicit -o, defaults to a .obj
# extension for Windows targets (matching MSVC convention) -- these
# 2001-era Makefiles hardcode .o throughout their implicit rules. Force
# it explicitly rather than let zig choose.
if [ "$(cat /is-windows)" = 1 ]; then
  cat > /usr/local/bin/musl-cc <<WRAPEOF
#!/bin/sh
has_c=0; has_o=0; src=""
for a in "\$@"; do
  case "\$a" in
    -c) has_c=1 ;;
    -o) has_o=1 ;;
    *.c) src="\$a" ;;
  esac
done
if [ "\$has_c" = 1 ] && [ "\$has_o" = 0 ] && [ -n "\$src" ]; then
  exec zig cc -target $TARGET "\$@" -o "\$(basename "\$src" .c).o"
fi
exec zig cc -target $TARGET "\$@"
WRAPEOF
else
  printf '#!/bin/sh\nexec zig cc -target %s "$@"\n' "$TARGET" > /usr/local/bin/musl-cc
fi
printf '#!/bin/sh\nexec zig ar "$@"\n' > /usr/local/bin/musl-ar
printf '#!/bin/sh\nexec zig ranlib "$@"\n' > /usr/local/bin/musl-ranlib
chmod +x /usr/local/bin/musl-cc /usr/local/bin/musl-ar /usr/local/bin/musl-ranlib

# aalib's configure.in decides whether to compile in the Linux-console
# driver by running bare `uname` on the machine running configure --
# correct (and wanted -- these binaries run on a real terminal) for the
# linux targets, wrong for every other OS, since the build machine is
# always Linux regardless of TARGET. Shadow it only when cross-building
# for a non-Linux OS, same as web/Dockerfile does unconditionally for wasm.
case "$TARGET" in
  *-linux-*) ;;
  *)
    printf '#!/bin/sh\nif [ $# -eq 0 ]; then echo notlinux; else exec /usr/bin/uname "$@"; fi\n' > /usr/local/bin/uname
    chmod +x /usr/local/bin/uname
    ;;
esac
SETUP
ENV CC=/usr/local/bin/musl-cc AR=/usr/local/bin/musl-ar RANLIB=/usr/local/bin/musl-ranlib

# gnu89 + -Wno-*: 2001-era C tripping modern clang's stricter default-error
# diagnostics, same fixes as the other Dockerfiles in this repo.
# -Wno-option-ignored: zig warns "ignoring '-fno-PIC'" for the mips64/
# mips64el N64 ABI specifically; the warning is harmless (compilation
# still succeeds) but its mere presence on stderr is enough to make
# autoconf's crude AC_PROG_CPP sanity check conclude the preprocessor is
# broken and fall back to a hardcoded, nonexistent /lib/cpp, which then
# fails every single header/type check that follows.
RUN <<'SETUP'
set -eux
STATIC="$(cat /static-flag)"
{
  echo "export CFLAGS='-std=gnu89 -O2 -fwrapv $STATIC -Wno-date-time -Wno-implicit-int -Wno-implicit-function-declaration -Wno-int-conversion -Wno-incompatible-function-pointer-types -Wno-return-type -Wno-option-ignored'"
  echo "export CPPFLAGS='-Wno-option-ignored'"
} > /build.env
SETUP

RUN curl -fL 'https://sourceforge.net/projects/aa-project/files/aa-lib/1.4rc5/aalib-1.4rc5.tar.gz/download' -o aalib.tar.gz \
    && tar -xzf aalib.tar.gz && rm aalib.tar.gz
WORKDIR /aalib-1.4.0
# aaslnkbd.c/aaslang.c/aacurkbd.c/aacurmou.c/aacurses.c/aagpm.c/aax.c/
# aaxkbd.c/aaxmouse.c unconditionally #include headers (setjmp.h/signal.h,
# or in aax*.c's case malloc.h, a nonstandard Linux-only header that
# doesn't exist on BSD/macOS) at the top of the file even though the code
# using them is entirely inside an #ifdef for a driver we never enable
# (slang/curses/gpm/X11 aren't installed) -- some libc's headers error on
# inclusion regardless of whether anything in the file actually uses them.
# malloc.h itself is always redundant with stdlib.h (which every one of
# these files already includes), so just drop it outright everywhere.
RUN find . -name '*.c' -exec sed -i '/^#include <malloc.h>$/d' {} + \
    && for f in src/aaslnkbd.c src/aaslang.c src/aacurkbd.c src/aacurmou.c src/aacurses.c src/aagpm.c; do \
         sed -i '1,2d' "$f"; \
         sed -i '0,/^#ifdef /{s/^#ifdef \(.*\)/#ifdef \1\n#include <setjmp.h>\n#include <signal.h>/}' "$f"; \
       done
# aastdin.c's stdin keyboard driver unconditionally uses fd_set/select()
# for a non-blocking "is a key waiting" check. mingw's libc only provides
# those for winsock sockets, not stdin/console handles, so it doesn't
# compile at all on Windows -- and real POSIX select() on a regular file
# descriptor isn't something Windows can do regardless of headers, so
# there's no portable fix here, only "skip the peek" (same conclusion as
# web/patches/aastdin.c reached for the same reason on WASI, which has no
# real stdin either). Everywhere else this file is unchanged.
COPY release/patches/aastdin.c.txt src/aastdin.c
RUN cp /usr/share/misc/config.guess /usr/share/misc/config.sub . \
    && . /build.env && HOST="$(cat /host)" \
    && ./configure --host="$HOST" --disable-shared --enable-static \
    && find . -exec touch {} +
# aalib also builds its own bonus command-line utilities (aainfo/aatest/
# aafire/aasavefont) that bb doesn't need. Everywhere but Windows they
# build fine (plain `make && make install`); on Windows they're compiled
# via a non-libtool rule that -- unlike everything else -- doesn't route
# through our .obj-forcing CC wrapper, so plain `make` fails there for a
# reason with nothing to do with bb itself. install-libLTLIBRARIES +
# install-includeHEADERS is everything bb's own configure/build actually
# needs, so skip straight to those instead.
RUN . /build.env && find . -exec touch {} + \
    && if [ "$(cat /is-windows)" = 1 ]; then \
         make -C src libaa.la \
         && make -C src install-libLTLIBRARIES install-includeHEADERS \
         && make install-exec-am install-data-am; \
       else \
         make && make install; \
       fi

WORKDIR /
RUN curl -fL 'https://sourceforge.net/projects/aa-project/files/bb/1.3rc1/bb-1.3rc1.tar.gz/download' -o bb.tar.gz \
    && tar -xzf bb.tar.gz && rm bb.tar.gz
WORKDIR /bb-1.3.0
# Same x86-only regparm fix as the other Dockerfiles, and the same
# always-redundant-with-stdlib.h malloc.h drop as aalib's tree above --
# bb's own sources (timers.c, zoom.c, messager.c, credits.c, credits2.c,
# textform.c, uncompfn.c, scene5.c, scene8.c) include it unconditionally
# too.
RUN sed -i 's/#define REGISTERS(n) __attribute__ ((regparm(n)))/#if defined(__i386__) || defined(__x86_64__)\n#define REGISTERS(n) __attribute__ ((regparm(n)))\n#else\n#define REGISTERS(n)\n#endif/' config.h \
    && find . -name '*.c' -exec sed -i '/^#include <malloc.h>$/d' {} +
# bb's AC_TYPE_PID_T/AC_TYPE_SIZE_T checks (from the same autoconf vintage)
# try to run the preprocessor via a hardcoded /lib/cpp that hasn't existed
# on any system in decades, so they always conclude "missing" and inject
# #define pid_t int / #define size_t unsigned into aconfig.h as a
# pre-2001 compatibility fallback -- wrong on every target we build for,
# and fatal on ones whose libc header doesn't happen to guard its own
# typedef against exactly this kind of macro collision (mips64/
# mips64el-musl: "typedef int pid_t" becomes "typedef int int" after
# macro expansion).
RUN cp /usr/share/misc/config.guess /usr/share/misc/config.sub . \
    && . /build.env && HOST="$(cat /host)" \
    && ./configure --host="$HOST" \
    && sed -i '/^#define pid_t int$/d; /^#define size_t unsigned$/d' aconfig.h \
    && find . -exec touch {} +
RUN . /build.env && make LDFLAGS="$(cat /static-flag)"

FROM scratch AS export
COPY --from=build /bb-1.3.0/bb /bb
