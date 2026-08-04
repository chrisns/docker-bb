# bb — the 1997 [BB](http://aa-project.sourceforge.net/bb/) ASCII art demo

**▶ [Try it live in your browser](https://bb.cns.me/)** — compiled to WebAssembly, runs entirely client-side, no install.

> This demo requires computer at least as fast as 486/33 with coprocesor. But speed of 486/66 or pentium is highly recommended (especially for high resolution SVGA modes). PC speaker driver eats lots of CPU so running it at computers slower than pentium is really not good idea.

![ASCII zebra](https://upload.wikimedia.org/wikipedia/commons/4/45/BB-ASCII-art-screenshot-zebra.png)

## Or run it in a terminal

```
docker run --rm -it ghcr.io/chrisns/docker-bb
```

Multi-arch (amd64, arm/v6, arm/v7, arm64, ppc64le, s390x), built `FROM scratch`.

## Or download a static binary

No Docker? [Releases](../../releases/latest) has standalone binaries for far more than Docker can run as a container platform — 20-odd Linux architectures (including riscv32/64, mips, loongarch64, both ppc64 endiannesses, even a Hexagon DSP) plus native FreeBSD, NetBSD, OpenBSD, Windows, and macOS builds, all cross-compiled with [zig cc](https://andrewkelley.me/post/zig-cc-powerful-drop-in-substitute-gcc-clang.html).

## Watch a video
[![](https://img.youtube.com/vi/C0Jts9eajH0/0.jpg)](https://www.youtube.com/watch?v=C0Jts9eajH0)
