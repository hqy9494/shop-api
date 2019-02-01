'use strict';

const moment = require('moment');

module.exports = function (app) {
  // type = 1, return result; type = 2, return result[0]
  app.makeSql = async function (sql, type) {
    let res = JSON.parse(await app.kvs.statistic.get(sql)) || {};
    type = type || 1;
    if (!res.updateAt || (res.updateAt && moment(res.updateAt).add(2, "hours").isBefore(moment()))) {
      let result = await new Promise((resolve, reject) => {
        app.models.Statistic.dataSource.connector.query(sql, async function (err, d) {
          if (err) reject(err);
          return type === 1 ? resolve(d) : resolve(d[0]);
        });
      });
      app.kvs.statistic.set(sql, JSON.stringify({data: result, updateAt: moment()}));
      return result
    } else if (res.updateAt && moment(res.updateAt).add(10, "seconds").isBefore(moment())) {
      app.models.Statistic.dataSource.connector.query(sql, function (err, d) {
        if (err) console.log("statisticSqlError", err);
        app.kvs.statistic.set(sql, JSON.stringify({data: type === 1 ? d : d[0], updateAt: moment()}));
      });
      return res.data;
    } else {
      return res.data;
    }
  }
};
