FROM node:26.7.0-alpine3.24

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ARG QSO_TRAILS_SKIP_EARTH_BUILD=0

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force

# Keep the imagery in its own cached image layer. Normal application-source
# changes below do not invalidate this layer, so a cached Docker build does not
# repeatedly contact the upstream imagery host.
COPY png-codec.js diagnostics.js earth-texture.js ./
COPY scripts/build-earth-texture.js ./scripts/build-earth-texture.js
RUN mkdir -p /app/earth-seed \
    && if [ "$QSO_TRAILS_SKIP_EARTH_BUILD" = "1" ]; then echo "Skipping external Earth texture fetch for this build."; else node scripts/build-earth-texture.js; fi

COPY server.js ./
COPY qso-helpers.js ./
COPY safe-files.js ./
COPY security-helpers.js ./
COPY adif-parser.js ./
COPY privacy-guard.js ./
COPY network-guard.js ./
COPY privacy-defaults.js ./
COPY dxcc-rarity.js ./
COPY static-size.js ./
COPY static-info.js ./
COPY admin-diagnostics.js ./
COPY static-render.js ./
COPY static-publish.js ./
COPY static-theme-pack.js ./
COPY lotw-feature.js ./
COPY public ./public

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["npm", "start"]
