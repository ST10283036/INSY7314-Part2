FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run lint && npm test && npm run build

FROM nginx:stable-alpine AS runtime
RUN apk add --no-cache curl
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8443
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl --silent --show-error --fail --cacert /etc/nginx/certs/localhost-cert.pem https://localhost:8443/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
