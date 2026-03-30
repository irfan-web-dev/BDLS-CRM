#!/bin/sh
set -e

echo "Running database migrations..."
npx sequelize-cli db:migrate

echo "Running conditional seed..."
node src/seed.js

echo "Starting server..."
exec node src/index.js
