# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89
#
# True cross-compilation, no QEMU: this stage always runs on the native
# builder architecture (--platform=$BUILDPLATFORM) and uses zig cc [1] to
# cross-compile static musl binaries for every requested TARGETPLATFORM.
# Faster and far more reliable than emulating apt/configure/make per-arch.
# [1] https://andrewkelley.me/post/zig-cc-powerful-drop-in-substitute-gcc-clang.html
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

# Map Docker's target platform to a zig/musl target triple. arm/v6 and arm/v7
# share one triple: the v6 baseline zig emits runs fine on v7 hardware too.
ARG TARGETARCH
ARG TARGETVARIANT
RUN set -eux; \
    case "${TARGETARCH}${TARGETVARIANT}" in \
      amd64)   triple=x86_64-linux-musl ;; \
      arm64)   triple=aarch64-linux-musl ;; \
      armv6)   triple=arm-linux-musleabihf ;; \
      armv7)   triple=arm-linux-musleabihf ;; \
      ppc64le) triple=powerpc64le-linux-musl ;; \
      s390x)   triple=s390x-linux-musl ;; \
      *) echo "unsupported platform ${TARGETARCH}${TARGETVARIANT}" >&2; exit 1 ;; \
    esac; \
    echo "$triple" > /triple; \
    printf '#!/bin/sh\nexec zig cc -target %s "$@"\n' "$triple" > /usr/local/bin/musl-cc; \
    printf '#!/bin/sh\nexec zig ar "$@"\n' > /usr/local/bin/musl-ar; \
    printf '#!/bin/sh\nexec zig ranlib "$@"\n' > /usr/local/bin/musl-ranlib; \
    chmod +x /usr/local/bin/musl-cc /usr/local/bin/musl-ar /usr/local/bin/musl-ranlib

ENV CC=/usr/local/bin/musl-cc AR=/usr/local/bin/musl-ar RANLIB=/usr/local/bin/musl-ranlib
# gnu89: this 2001-era C needs implicit-int/implicit-function-declaration/
# incompatible-pointer-types downgraded from modern clang's default errors.
# -O2 -fwrapv: zig cc's default -O0 traps signed-overflow (a real latent bug
# in aalib's aamktabl.c this code has always relied on silently wrapping).
ENV CFLAGS="-static -std=gnu89 -O2 -fwrapv -Wno-date-time -Wno-implicit-int -Wno-implicit-function-declaration -Wno-int-conversion -Wno-incompatible-function-pointer-types -Wno-return-type"

RUN curl -fL 'https://sourceforge.net/projects/aa-project/files/aa-lib/1.4rc5/aalib-1.4rc5.tar.gz/download' -o aalib.tar.gz \
    && tar -xzf aalib.tar.gz && rm aalib.tar.gz
WORKDIR /aalib-1.4.0
RUN cp /usr/share/misc/config.guess /usr/share/misc/config.sub . \
    && ./configure --host="$(cat /triple)" --disable-shared --enable-static \
    && make && make install

WORKDIR /
RUN curl -fL 'https://sourceforge.net/projects/aa-project/files/bb/1.3rc1/bb-1.3rc1.tar.gz/download' -o bb.tar.gz \
    && tar -xzf bb.tar.gz && rm bb.tar.gz
WORKDIR /bb-1.3.0
# regparm is an x86-only GCC attribute; bb's checked-in config.h applies it
# unconditionally under __GNUC__, which zig's clang hard-errors on elsewhere.
RUN sed -i 's/#define REGISTERS(n) __attribute__ ((regparm(n)))/#if defined(__i386__) || defined(__x86_64__)\n#define REGISTERS(n) __attribute__ ((regparm(n)))\n#else\n#define REGISTERS(n)\n#endif/' config.h \
    && cp /usr/share/misc/config.guess /usr/share/misc/config.sub . \
    && ./configure --host="$(cat /triple)" \
    && make LDFLAGS="-static"

FROM scratch
COPY --from=build /bb-1.3.0/bb /bb
CMD ["/bb", "-extended", "-loop"]
