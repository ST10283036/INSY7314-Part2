FROM node:22-slim

WORKDIR /APP

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
USER node
EXPOSE 5000

CMD ["node", "server.js"]