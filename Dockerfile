FROM node:18-alpine
WORKDIR /usr/src/app
COPY uniz-shared ./uniz-shared
COPY uniz-user-service ./uniz-user-service
WORKDIR /usr/src/app/uniz-shared
RUN npm install
RUN npm run build
WORKDIR /usr/src/app/uniz-user-service
RUN npm install
RUN npm run build
CMD ["npm", "start"]
