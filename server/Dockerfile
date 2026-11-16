FROM node:22-alpine

ENV NODE_ENV=development \
    PORT=3000
WORKDIR /app

# The lockfile is at the workspace root; install only the API workspace.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci --omit=dev --workspace=@pizzahop/server --include-workspace-root=false

COPY server/src ./server/src
EXPOSE 3000
CMD ["node", "server/src/server.js"]
