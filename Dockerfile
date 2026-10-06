# keylang in a container: the CLI, `clone` and `web` with git inside.
#   docker build -t keylang .
#   docker run --rm -v keylang-cache:/cache keylang clone https://github.com/owner/repo
#   docker run --rm -p 7070:7070 -v keylang-cache:/cache keylang web https://github.com/owner/repo --host 0.0.0.0
#   docker run --rm -v "$PWD":/work keylang check
# The image installs the packed npm package, the same files `npm install keylang` gets.

FROM node:22-slim AS pack
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm pack --silent && mv keylang-*.tgz /keylang.tgz

FROM node:22-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  # A mounted /work belongs to the host's user; git refuses such a tree without this.
  && git config --system safe.directory '*'
COPY --from=pack /keylang.tgz /tmp/keylang.tgz
# Voice (whisper, microphone) is optional and has no use in a container: ~300 MB less.
RUN npm install --global --omit=dev --omit=optional /tmp/keylang.tgz && rm /tmp/keylang.tgz \
  && mkdir -p /cache /work && chown node:node /cache /work
# Clones live in the volume: a rerun of `clone` fetches instead of cloning again.
ENV XDG_CACHE_HOME=/cache
VOLUME /cache
WORKDIR /work
USER node
EXPOSE 7070
ENTRYPOINT ["keylang"]
CMD ["--help"]
