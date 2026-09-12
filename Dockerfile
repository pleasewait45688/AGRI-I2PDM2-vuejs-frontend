# First stage: Build the Node.js application
FROM node:20-alpine3.19 AS build-stage
WORKDIR /app
COPY ./i2pdm2-demo-cam/package*.json ./
RUN npm install
COPY ./i2pdm2-demo-cam .
# Defaults are for local testing. To point this build at a different domain,
# pass --build-arg (or set them in docker-compose.yaml's build.args).
ARG VITE_API_BASE_URL=http://localhost:28000/api/v1
ARG VITE_BASE_PATH=/
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_BASE_PATH=$VITE_BASE_PATH
# Build the app
RUN npm run build

# Second stage: Serve with Nginx
FROM nginx:stable-alpine AS production-stage
# Copy built files from the first stage
COPY --from=build-stage /app/dist /usr/share/nginx/html
# COPY ./frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY ./i2pdm2-demo-cam/nginx.conf /etc/nginx/conf.d/default.conf
CMD ["nginx", "-g", "daemon off;"]


# docker build -t pest-vue .
# docker run -it -p 8080:80 --rm --name pest-vue-1 pest-vue
# localhost:8080