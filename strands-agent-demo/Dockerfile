FROM --platform=linux/arm64 public.ecr.aws/docker/library/node:20-slim
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install --legacy-peer-deps
COPY src/ ./src/
RUN npm run build
EXPOSE 8080
CMD ["npm", "start"]
