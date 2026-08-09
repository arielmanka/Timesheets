FROM node:22-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY . .

# Development: use tsx watch for hot reload
FROM base AS development
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Production: build TypeScript and run compiled JS
FROM base AS production
RUN npm run build
RUN npm prune --production
EXPOSE 3000
CMD ["npm", "start"]
