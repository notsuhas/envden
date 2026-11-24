FROM --platform=$BUILDPLATFORM alpine:3.22@sha256:49340b346798875b5592e5d420241f2f9cfba5f47e62ebb1446a1b34734e898f AS binary
ARG TARGETARCH
COPY --from=release-artifacts / /release/
RUN case "$TARGETARCH" in amd64) target=x64 ;; arm64) target=arm64 ;; *) exit 1 ;; esac; \
    tar -xzf /release/envden-linux-$target-musl.tar.gz -C / envden && chmod 755 /envden

FROM tailscale/tailscale:v1.90.9@sha256:9975353aae933e8fbd1a81226d092a9225b9a0f98b173d365a9d525eca1cc298 AS tailscale
FROM alpine:3.22@sha256:49340b346798875b5592e5d420241f2f9cfba5f47e62ebb1446a1b34734e898f
RUN apk add --no-cache ca-certificates=20261020-r0 libstdc++=14.2.0-r6 && adduser -D -u 10001 envden
COPY --from=tailscale /usr/local/bin/tailscale /usr/local/bin/tailscale
COPY --from=tailscale /usr/local/bin/tailscaled /usr/local/bin/tailscaled
COPY --from=binary /envden /usr/local/bin/envden
COPY packaging/docker/entrypoint.sh /usr/local/bin/entrypoint
RUN chmod 755 /usr/local/bin/entrypoint && mkdir -p /data /var/lib/tailscale /var/run/tailscale && chown -R envden:envden /data /var/lib/tailscale /var/run/tailscale
USER 10001:10001
ENV ENVDEN_PORT=4280
VOLUME ["/data", "/var/lib/tailscale"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -q -O /dev/null "http://127.0.0.1:${ENVDEN_PORT}/v1/hello?challenge=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" && tailscale status --json | grep -Eq '"BackendState"[[:space:]]*:[[:space:]]*"Running"'
ENTRYPOINT ["/usr/local/bin/entrypoint"]
