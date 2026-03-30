FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY . .

RUN chmod +x ./entrypoint.sh

EXPOSE 5001

CMD ["./entrypoint.sh"]
