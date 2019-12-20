FROM debian as build
RUN apt-get update \
  && apt-get install -y bb
ENTRYPOINT /usr/games/bb -extended -loop
