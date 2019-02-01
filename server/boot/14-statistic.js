'use strict';

var schedule = require('node-schedule');

module.exports = function (app) {
  console.log("APP_INSTANCE", process.env.NODE_APP_INSTANCE);

  if (process.env.NODE_APP_INSTANCE === '0') {
    app.statisticJob = schedule.scheduleJob(app.get('statistic'), async function () {
      await app.models.Statistic.getDailyStatistic(true);
    });
  }
};
