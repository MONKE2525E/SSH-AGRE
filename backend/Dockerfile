FROM node:20-alpine

WORKDIR /app

# Install dependencies for SSH2
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --only=production

COPY src/ ./src/

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3001

CMD ["node", "src/index.js"]
