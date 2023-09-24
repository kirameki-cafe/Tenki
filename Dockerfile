FROM node:18 AS build
WORKDIR /home/node/app

COPY . .

RUN yarn
RUN yarn build

FROM node:17
WORKDIR /home/node/app

COPY --from=build /home/node/app/package.json .
COPY --from=build /home/node/app/yarn.lock .

RUN yarn

COPY --from=build /home/node/app/dist .

CMD [ "node", "index.js"]