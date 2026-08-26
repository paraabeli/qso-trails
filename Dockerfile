FROM node:24.19.0-alpine3.24

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ARG QSO_TRAILS_SKIP_EARTH_BUILD=0

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force

COPY server.js ./
COPY qso-helpers.js ./
COPY safe-files.js ./
COPY security-helpers.js ./
COPY adif-parser.js ./
COPY privacy-guard.js ./
COPY network-guard.js ./
COPY privacy-defaults.js ./
COPY png-codec.js ./
COPY dxcc-rarity.js ./
COPY static-size.js ./
COPY static-info.js ./
COPY diagnostics.js ./
COPY admin-diagnostics.js ./
COPY earth-texture.js ./
COPY static-render.js ./
COPY static-publish.js ./
COPY static-theme-pack.js ./
COPY lotw-feature.js ./
COPY scripts ./scripts
COPY public ./public

RUN mkdir -p /app/data /app/earth-seed \
    && if [ "$QSO_TRAILS_SKIP_EARTH_BUILD" = "1" ]; then echo "Skipping external Earth texture fetch for this build."; else node scripts/build-earth-texture.js; fi \
    && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["npm", "start"]
