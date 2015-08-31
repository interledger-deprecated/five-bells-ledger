FROM iojs:3.0.0-slim

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json .npmrc npm-shrinkwrap.json /usr/src/app/
RUN npm install
COPY . /usr/src/app

EXPOSE 3000

CMD [ "npm", "start" ]
