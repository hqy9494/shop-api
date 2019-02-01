'use strict';

const kvs = require('kvs');

module.exports = function (app) {
  const config = app.get('kvs');
  const redisStore = new kvs.store(config.adapter, {db: config.db});
  const statistic = redisStore.createBucket('statistic');
  app.kvs = {
    statistic
  };
};
