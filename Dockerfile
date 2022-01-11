FROM debian:buster-20211220-slim@sha256:abf70524e9b8a32c7453eeab4af6389468ca47bbe38b35e691651d6e6af6be55 as build
RUN apt-get update \
  && apt-get install -y bb \
  && apt-get clean
ENTRYPOINT /usr/games/bb -extended -loop
