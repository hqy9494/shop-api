'use strict';

const _ = require('lodash');
const Redlock = require('redlock');

module.exports = function (app) {
  const redlockClient = require('redis').createClient(app.get('redlock'));
  const redlock = new Redlock(
    [redlockClient],
    {
      // the expected clock drift; for more details
      driftFactor: 0.01, // time in ms

      // the max number of times Redlock will attempt
      // to lock a resource before erroring
      retryCount: 10,

      // the time in ms between attempts
      retryDelay: 200, // time in ms

      // the max time in ms randomly added to retries
      // to improve performance under high contention
      retryJitter: 200 // time in ms
    }
  );
  app.redlockClient = redlockClient;
  app.redlock = redlock;

  app.lock = async function (key, timeout) {
    return await app.redlock.lock(key, timeout || 5 * 1000);
  }
};
