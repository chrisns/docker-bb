FROM debian@sha256:00cd074b40c4d99ff0c24540bdde0533ca3791edcdac0de36d6b9fb3260d89e2 as build
RUN apt-get update
RUN apt-get install -y wget make gcc curl
RUN wget https://sourceforge.net/projects/aa-project/files/aa-lib/1.4rc5/aalib-1.4rc5.tar.gz/download
RUN tar -xzf download && rm download
WORKDIR /aalib-1.4.0
RUN curl 'http://git.savannah.gnu.org/gitweb/?p=config.git;a=blob_plain;f=config.guess;hb=HEAD' > ./config.guess
RUN ./configure
RUN make
RUN make install

WORKDIR /
RUN wget https://sourceforge.net/projects/aa-project/files/bb/1.3rc1/bb-1.3rc1.tar.gz/download
RUN tar -xzf download && rm download
WORKDIR bb-1.3.0
RUN ./configure CFLAGS="-static"
RUN make LDFLAGS="--static"

FROM scratch
COPY --from=build /bb-1.3.0/bb /bb
CMD ["/bb", "-extended", "-loop"]
