FROM node:22-alpine

ENV NODE_ENV=development
WORKDIR /app

# Vite is a development dependency, so install the client workspace including dev packages.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci --workspace=@pizzahop/client --include-workspace-root=false

COPY client ./client
EXPOSE 5173
CMD ["npm", "run", "dev", "--workspace=@pizzahop/client", "--", "--host", "0.0.0.0"]
