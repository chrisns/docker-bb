FROM debian:buster-20211220-slim as build
RUN apt-get update \
  && apt-get install -y bb \
  && apt-get clean
ENTRYPOINT /usr/games/bb -extended -loop
