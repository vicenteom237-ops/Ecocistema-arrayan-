FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY package.json ./
COPY server.js ./
COPY src ./src
COPY public ./public
COPY scripts/demo.js ./scripts/demo.js
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "--no-warnings=ExperimentalWarning", "server.js"]
