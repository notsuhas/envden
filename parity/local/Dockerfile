# Throwaway Linux box for parity: the harness swaps system tools for stand-ins, so it never runs on a real machine.
FROM ubuntu:24.04

ARG BUN_VERSION
ARG GO_VERSION
ARG RUST_VERSION

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git unzip xz-utils build-essential pkg-config poppler-utils zsh fish procps \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
RUN curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-$(dpkg --print-architecture).tar.gz" | tar -C /usr/local -xz
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain "${RUST_VERSION}"

ENV PATH=/root/.bun/bin:/usr/local/go/bin:/root/.cargo/bin:$PATH CI=true
