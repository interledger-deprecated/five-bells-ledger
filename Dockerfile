FROM iojs:2.0.0

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json .npmrc /usr/src/app/
RUN npm install
COPY . /usr/src/app

EXPOSE 3000

CMD [ "npm", "start" ]
