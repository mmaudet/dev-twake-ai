# n8n with the Enterprise license check around `feat:oidc` short-circuited
# to true. The base image is Docker Hardened Alpine without apk, but it
# ships Node, so we use a tiny Node one-liner to patch the compiled
# license-state.js in place.
#
# Upstream pin: n8nio/n8n:latest
FROM n8nio/n8n:latest

USER root

COPY patch-license.js /tmp/patch-license.js
RUN node /tmp/patch-license.js && rm /tmp/patch-license.js

USER node
