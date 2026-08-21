FROM node:24.19.0-alpine3.24

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force

COPY server.js ./
COPY static-render.js ./
COPY static-publish.js ./
COPY lotw-feature.js ./
COPY public ./public

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["npm", "start"]
