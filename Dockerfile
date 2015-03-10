FROM iojs:1.5

ENV FDB_VERSION 3.0.6

RUN wget https://foundationdb.com/downloads/I_accept_the_FoundationDB_Community_License_Agreement/key-value-store/${FDB_VERSION}/foundationdb-clients_${FDB_VERSION}-1_amd64.deb \
 && dpkg -i foundationdb-clients_${FDB_VERSION}-1_amd64.deb

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json /usr/src/app/
RUN npm install

COPY . /usr/src/app

EXPOSE 3000

CMD [ "npm", "start" ]
