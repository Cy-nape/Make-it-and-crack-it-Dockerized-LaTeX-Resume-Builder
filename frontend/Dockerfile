FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
# The production Docker stack routes /api through Nginx to the backend container.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_GEMINI_API_KEY=
ENV VITE_GEMINI_API_KEY=$VITE_GEMINI_API_KEY
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
