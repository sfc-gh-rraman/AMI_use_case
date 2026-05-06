# Build stage
FROM node:20-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY vite.config.js postcss.config.js tailwind.config.js index.html ./
COPY src ./src
RUN npx vite build

# Runtime stage
FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --omit=optional
COPY server ./server
COPY --from=build /app/dist ./dist
ENV PORT=8080 HOSTNAME=0.0.0.0
EXPOSE 8080
CMD ["node", "server/index.js"]
