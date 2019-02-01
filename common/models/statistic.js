'use strict';
const errs = require('errs');
const moment = require('moment');

module.exports = function (Statistic) {
  Statistic.getDailyStatistic = async function (create) {
    let date = moment().format("YYYY-MM-DD");
    if (create) {
      date = moment().subtract(1, "day").format("YYYY-MM-DD");
    }

    let orderCount = await Statistic.app.models.Order.count({createdAt: {between: [moment(date).startOf('day').utc().format(), moment(date).endOf('day').utc().format()]}, status: {neq: "WAIT_PAY"}});

    let boxCountSQL = 'select sum(x.total) as count from `Order` as x where ' + `x.createdAt>="${moment(date).startOf('day').utc().format()}" and x.createdAt<="${moment(date).endOf('day').utc().format()}" and x.status!='WAIT_PAY'`;
    let boxCount = await Statistic.app.makeSql(boxCountSQL, 2);

    let drawCountSQL = `select count(x.id) as count from DrawRecord as x where x.createdAt>="${moment(date).startOf('day').utc().format()}" and x.createdAt<="${moment(date).endOf('day').utc().format()}"`;
    let drawCount = await Statistic.app.makeSql(drawCountSQL, 2);

    let buyUserSQL = 'select count(DISTINCT x.buyerId) as count from `Order` as x where ' + `x.createdAt>="${moment(date).startOf('day').utc().format()}" and x.createdAt<="${moment(date).endOf('day').utc().format()}" and x.status!='WAIT_PAY'`;
    let buyUser = await Statistic.app.makeSql(buyUserSQL, 2);

    let newUser = await Statistic.app.models.Account.count({createdAt: {between: [moment(date).startOf('day').utc().format(), moment(date).endOf('day').utc().format()]}, buyTimes: {neq: 0}});
    let frequentUser = (buyUser && buyUser.count || 0) - newUser;

    if (create) {
      let hasToday = await Statistic.findOne({where: {date: date}});
      if (hasToday) {
        return hasToday
      } else {
        return await Statistic.create({
          date: date,
          orderCount,
          boxCount: boxCount.count || 0,
          drawCount: drawCount.count,
          newUser,
          frequentUser
        })
      }
    } else {
      return {
        date: date,
        orderCount,
        boxCount: boxCount.count || 0,
        drawCount: drawCount.count,
        newUser,
        frequentUser
      }
    }
  };

  Statistic.getAll = async function (filter) {
    filter = filter || {};
    if (!filter.skip || filter.skip === 0) {
      let ps = await Statistic.find(filter);
      let ts = await Statistic.getDailyStatistic();
      return [ts, ...ps]
    } else {
      return Statistic.find(filter)
    }
  };

  // 获取固定统计数据
  Statistic.getFixedStatistic = async function () {

    // 待发货订单
    let paidOrder = await Statistic.app.models.Order.count({status: Statistic.app.models.Order.STATE_PAID});

    // 今日待发货订单
    let todayPaidOrder = await Statistic.app.models.Order.count({createdAt: {between: [moment().startOf('day').utc().format(), moment().endOf('day').utc().format()]}, status: Statistic.app.models.Order.STATE_PAID});

    // 今日订单数
    let todayOrder = await Statistic.app.models.Order.count({createdAt: {between: [moment().startOf('day').utc().format(), moment().endOf('day').utc().format()]}, status: {neq: "WAIT_PAY"}});

    // 销售盒数
    let boxCountSQL = 'select sum(t.total) as count from `Order` as t where t.status!="WAIT_PAY"';
    let boxCount = await Statistic.app.makeSql(boxCountSQL, 2);

    // 销售金额
    let saleSum = (boxCount && boxCount.count || 0)*30;

    // 购买用户
    let buyUser = await Statistic.app.models.Account.count({buyTimes: {neq: 0}});

    return {
      paidOrder,
      todayPaidOrder,
      todayOrder,
      saleSum,
      boxCount: boxCount && boxCount.count || 0,
      buyUser
    }
  };

  // 根据时间段获得统计数据
  Statistic.getStatisticByRangeDate = async function (startDate, endDate) {
    let statistics = await Statistic.find({where: {date: {between: [startDate, endDate]}}});
    let tracks = await Statistic.app.models.Track.find({where: {date: {between: [startDate, endDate]}}});
    let orderCount = 0;
    let boxCount = 0;
    let drawCount = 0;
    let user = 0;
    let pv = 0;
    let uv = 0;

    for (let i = 0; i < statistics.length; i++) {
      orderCount += statistics[i].orderCount;
      boxCount += statistics[i].boxCount;
      drawCount += statistics[i].drawCount;
      user = user + statistics[i].newUser + statistics[i].frequentUser;
    }

    for (let j = 0; j < tracks.length; j++) {
      pv += tracks[j].pv;
      uv += tracks[j].uv;
    }

    return {
      orderCount,
      boxCount,
      drawCount,
      user,
      pv,
      uv
    }
  };

  // 人均购买盒数，复购率，人均抽奖次数，日均购买盒数
  Statistic.getAverageData = async function () {
    // 销售盒数
    let boxCountSQL = 'select sum(t.total) as count from `Order` as t where t.status!="WAIT_PAY"';
    let boxCount = await Statistic.app.makeSql(boxCountSQL, 2);
    // 购买人数
    let buyUser = await Statistic.app.models.Account.count({buyTimes: {neq: 0}});
    // 购买超过一次人数
    let regularBuyUser = await Statistic.app.models.Account.count({buyTimes: {gt: 1}});

    // 抽奖次数
    let drawCount = await Statistic.app.models.DrawRecord.count();

    // 开始时间
    let startDate = "2018-10-06";

    return {
      description: "boxCount销售盒数; buyUser购买人数; regularBuyUser购买超过一次人数; drawCount抽奖次数; startDate开始时间",
      boxCount: boxCount && boxCount.count || 0,
      buyUser,
      regularBuyUser,
      drawCount,
      startDate
    }
  };

  // 交易概况
  Statistic.tradeSurvey = async function (startDate, endDate) {
    // 访问人数
    let uvSQL = 'select sum(x.uv) as count from `Track` as x where ' + `x.createdAt>="${moment(startDate).startOf('day').utc().format()}" and x.createdAt<="${moment(endDate).endOf('day').utc().format()}"`;
    let uv = await Statistic.app.makeSql(uvSQL, 2);

    // 下单买家数
    let buyUserSQL = 'select count(DISTINCT x.buyerId) as count from `Order` as x where ' + `x.createdAt>="${moment(startDate).startOf('day').utc().format()}" and x.createdAt<="${moment(endDate).endOf('day').utc().format()}"`;
    let buyUser = await Statistic.app.makeSql(buyUserSQL, 2);

    // 支付买家数
    let payUserSQL = 'select count(DISTINCT x.buyerId) as count from `Order` as x where ' + `x.createdAt>="${moment(startDate).startOf('day').utc().format()}" and x.createdAt<="${moment(endDate).endOf('day').utc().format()}" and x.status!='WAIT_PAY'`;
    let payUser = await Statistic.app.makeSql(payUserSQL, 2);

    // 下单盒数
    let buyBoxCountSQL = 'select sum(x.total) as count from `Order` as x where ' + `x.createdAt>="${moment(startDate).startOf('day').utc().format()}" and x.createdAt<="${moment(endDate).endOf('day').utc().format()}"`;
    let buyBoxCount = await Statistic.app.makeSql(buyBoxCountSQL, 2);

    // 支付盒数
    let payBoxCountSQL = 'select sum(x.total) as count from `Order` as x where ' + `x.createdAt>="${moment(startDate).startOf('day').utc().format()}" and x.createdAt<="${moment(endDate).endOf('day').utc().format()}" and x.status!='WAIT_PAY'`;
    let payBoxCount = await Statistic.app.makeSql(payBoxCountSQL, 2);

    return {
      description: "uv访客人数; buyUser下单买家数; payUser支付买家数; buyBoxCount下单盒数; payBoxCount支付盒数",
      uv: uv && uv.count || 0,
      buyUser: buyUser && buyUser.count || 0,
      payUser: payUser && payUser.count || 0,
      buyBoxCount: buyBoxCount && buyBoxCount.count || 0,
      payBoxCount: payBoxCount && payBoxCount.count || 0
    }
  };

  // 复购率
  Statistic.regularRate = async function () {

    // 总人数
    let userCount = await Statistic.app.models.Account.count();

    // 购买一次人数
    let onceBuyUser = await Statistic.app.models.Account.count({buyTimes: 1});

    // 购买二次人数
    let twiceBuyUser = await Statistic.app.models.Account.count({buyTimes: 2});

    // 购买三到十次
    let frequentlyBuyUser = await Statistic.app.models.Account.count({buyTimes: {between: [3, 10]}});

    // 购买十次以上
    let crazyBuyUser = await Statistic.app.models.Account.count({buyTimes: {gt: 10}});

    return {
      description: "userCount总人数; onceBuyUser购买一次人数; twiceBuyUser购买二次人数, frequentlyBuyUser购买三到十次, crazyBuyUser购买十次以上",
      userCount,
      onceBuyUser,
      twiceBuyUser,
      frequentlyBuyUser,
      crazyBuyUser
    }
  };

  Statistic.remoteMethod('getAll', {
    description: '查询',
    accessType: 'READ',
    accepts: [
      {arg: 'filter', type: 'object'}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/all'},
  });

  Statistic.remoteMethod('getFixedStatistic', {
    description: '获取固定统计数据',
    accessType: 'READ',
    accepts: [],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/getFixedStatistic'},
  });

  Statistic.remoteMethod('getStatisticByRangeDate', {
    description: '根据时间段获得统计数据（今日详情）',
    accessType: 'READ',
    accepts: [
      {arg: 'startDate', type: 'string', required: true, description: "格式如：2018-09-01"},
      {arg: 'endDate', type: 'string', required: true, description: "格式如：2018-09-01"}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/getStatisticByRangeDate'},
  });

  Statistic.remoteMethod('getAverageData', {
    description: '人均购买盒数，复购率，人均抽奖次数，日均购买盒数',
    accessType: 'READ',
    accepts: [
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/getAverageData'},
  });

  Statistic.remoteMethod('tradeSurvey', {
    description: '交易概况',
    accessType: 'READ',
    accepts: [
      {arg: 'startDate', type: 'string', required: true, description: "格式如：2018-09-01"},
      {arg: 'endDate', type: 'string', required: true, description: "格式如：2018-09-01"}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/tradeSurvey'},
  });

  Statistic.remoteMethod('regularRate', {
    description: '复购率',
    accessType: 'READ',
    accepts: [
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/regularRate'},
  });
};
