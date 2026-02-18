# ── Frontend Dockerfile ────────────────────────────────
# Stage 1: Build the React app
# Stage 2: Serve with Nginx

# ── Build Stage ───────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first (cache-friendly)
COPY package.json package-lock.json* ./
RUN npm ci --silent

# Copy source and build
COPY . .

# Pass the API URL at build time (Vite embeds env vars during build)
ARG VITE_API_BASE=""
ENV VITE_API_BASE=$VITE_API_BASE

RUN npm run build

# ── Serve Stage (Nginx) ──────────────────────────────
FROM nginx:alpine AS production

# Remove default Nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Custom Nginx config for SPA routing + API proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
