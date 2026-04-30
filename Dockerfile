FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS build

WORKDIR /app

COPY . .

ARG VITE_UGEL_API_URL
ARG VITE_WHATSAPP_API_URL

ENV VITE_UGEL_API_URL=${VITE_UGEL_API_URL}
ENV VITE_WHATSAPP_API_URL=${VITE_WHATSAPP_API_URL}

RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3006

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server.ts ./
COPY --from=build /app/dist ./dist

EXPOSE 3006

CMD ["npx", "tsx", "server.ts"]
