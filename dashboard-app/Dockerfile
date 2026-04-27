# Build stage: install deps and build React bundle
FROM node:20-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY vite.config.js index.html ./
COPY src ./src
RUN npx vite build

# Runtime stage
FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server ./server
COPY --from=build /app/dist ./dist
ENV PORT=8080 HOSTNAME=0.0.0.0
EXPOSE 8080
CMD ["node", "server/index.js"]
