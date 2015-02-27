FROM node:0.12

ENV FDB_VERSION 3.0.6

RUN wget https://foundationdb.com/downloads/I_accept_the_FoundationDB_Community_License_Agreement/key-value-store/${FDB_VERSION}/foundationdb-clients_${FDB_VERSION}-1_amd64.deb \
 && dpkg -i foundationdb-clients_${FDB_VERSION}-1_amd64.deb

RUN mkdir /var/app
WORKDIR /var/app

COPY package.json /var/app/package.json
RUN npm install

COPY . /var/app

EXPOSE 3000

CMD npm start
