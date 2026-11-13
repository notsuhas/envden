FROM oven/bun:1.4.0 AS build
WORKDIR /src
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts
ARG TARGETARCH
RUN case "$TARGETARCH" in amd64) target=x64 ;; arm64) target=arm64 ;; *) exit 1 ;; esac; \
    bun apps/cli/scripts/build-all.ts linux-$target-musl && \
    mv apps/cli/dist/envden-linux-$target-musl /envden

FROM tailscale/tailscale:v1.90.9 AS tailscale
FROM alpine:3.22
RUN apk add --no-cache ca-certificates libstdc++ su-exec && adduser -D -u 10001 envden
COPY --from=tailscale /usr/local/bin/tailscale /usr/local/bin/tailscale
COPY --from=tailscale /usr/local/bin/tailscaled /usr/local/bin/tailscaled
COPY --from=build /envden /usr/local/bin/envden
COPY packaging/docker/entrypoint.sh /usr/local/bin/entrypoint
RUN chmod 755 /usr/local/bin/entrypoint
ENV ENVDEN_PORT=4280
VOLUME ["/data", "/var/lib/tailscale"]
ENTRYPOINT ["/usr/local/bin/entrypoint"]
