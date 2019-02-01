'use strict';

var schedule = require('node-schedule');

module.exports = function (app) {
  if (process.env.NODE_APP_INSTANCE === '0') {
    app.mergeOrderJob = schedule.scheduleJob(app.get('mergeOrderSchedule'), async function () {
      await app.models.MergeOrder.ordersMergeAndFahuo();
    });
  }
};
