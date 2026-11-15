FROM node:24-alpine
WORKDIR /app
COPY server.mjs ./server.mjs
ENV NODE_ENV=production
ENV HOST=0.0.0.0
CMD ["node", "server.mjs"]
