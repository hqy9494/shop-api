'use strict';
const errs = require('errs');
const moment = require('moment');

module.exports = function (LPStatistic) {
  LPStatistic.getDailyStatistic = async function (create) {
    let date = moment().format("YYYY-MM-DD");
    if (create) {
      date = moment().subtract(1, "day").format("YYYY-MM-DD");
    }

    let supportCount = await LPStatistic.app.models.LPSupport.count({createdAt: {between: [moment(date).startOf('day').utc().format(), moment(date).endOf('day').utc().format()]}});

    let boxCountSQL = 'select sum(x.total) as count from `Order` as x where ' + `x.createdAt>="${moment(date).startOf('day').utc().format()}" and x.createdAt<="${moment(date).endOf('day').utc().format()}" and x.status!='WAIT_PAY'`;
    let boxCount = await LPStatistic.app.makeSql(boxCountSQL, 2);

    let teamCountSQL = `select count(x.id) as count from LPTeam as x where x.createdAt>="${moment(date).startOf('day').utc().format()}" and x.createdAt<="${moment(date).endOf('day').utc().format()}"`;
    let teamCount = await LPStatistic.app.makeSql(teamCountSQL, 2);

    let successTeamCountSQL = `select count(x.id) as count from LPTeam as x where x.createdAt>="${moment(date).startOf('day').utc().format()}" and x.createdAt<="${moment(date).endOf('day').utc().format()}" and x.enable=true`;
    let successTeamCount = await LPStatistic.app.makeSql(successTeamCountSQL, 2);

    let teamCrystalSQL = `select sum(x.crystal) as count from LPTeam as x where x.createdAt>="${moment(date).startOf('day').utc().format()}" and x.createdAt<="${moment(date).endOf('day').utc().format()}" and x.enable=true`;
    let teamCrystal = await LPStatistic.app.makeSql(teamCrystalSQL, 2);

    let supportCrystalSQL = `select sum(x.crystal) as count from LPSupport as x where x.createdAt>="${moment(date).startOf('day').utc().format()}" and x.createdAt<="${moment(date).endOf('day').utc().format()}"`;
    let supportCrystal = await LPStatistic.app.makeSql(supportCrystalSQL, 2);

    let signTimes = await LPStatistic.app.models.LPSignin.count({createdAt: {between: [moment(date).startOf('day').utc().format(), moment(date).endOf('day').utc().format()]}});

    let addSignTimes = await LPStatistic.app.models.LPSignin.count({isAdd: true, createdAt: {between: [moment(date).startOf('day').utc().format(), moment(date).endOf('day').utc().format()]}});

    let signBuyerSQL = 'select count(DISTINCT x.userId) as count from LPSignin as x join `Order` as t on x.userId=t.buyerId and t.status != "WAIT_PAY" and '
      + `x.createdAt>="${moment(date).startOf('day').utc().format()}" and x.createdAt<="${moment(date).endOf('day').utc().format()}" and t.createdAt>="${moment(date).startOf('day').utc().format()}" and t.createdAt<="${moment(date).endOf('day').utc().format()}" `;
    let signBuyer = await LPStatistic.app.makeSql(signBuyerSQL, 2);

    let preClickTimesSQL = `select sum(LPStatistic.clickTimes) as count from LPStatistic`;
    let preClickTimes = await LPStatistic.app.makeSql(preClickTimesSQL, 2);

    let allClickTimesSQL = `select sum(LPSignUser.clickTimes) as count from LPSignUser`;
    let allClickTimes = await LPStatistic.app.makeSql(allClickTimesSQL, 2);

    let clickTimes = (allClickTimes.count || 0) - (preClickTimes.count || 0);

    if (create) {
      let hasToday = await LPStatistic.findOne({where: {date: date}});
      if (hasToday) {
        return hasToday
      } else {
        return await LPStatistic.create({
          date: date,
          supportCount,
          boxCount: boxCount.count || 0,
          teamCount: teamCount.count || 0,
          successTeamCount: successTeamCount.count || 0,
          teamCrystal: teamCrystal.count || 0,
          supportCrystal: supportCrystal.count || 0,
          signTimes,
          addSignTimes,
          signBuyer: signBuyer.count || 0,
          clickTimes
        })
      }
    } else {
      return {
        date: date,
        supportCount,
        boxCount: boxCount.count || 0,
        teamCount: teamCount.count || 0,
        successTeamCount: successTeamCount.count || 0,
        teamCrystal: teamCrystal.count || 0,
        supportCrystal: supportCrystal.count || 0,
        signTimes,
        addSignTimes,
        signBuyer: signBuyer.count || 0,
        clickTimes
      }
    }
  };

  LPStatistic.getAll = async function (filter) {
    filter = filter || {};
    if (!filter.skip || filter.skip === 0) {
      let ps = await LPStatistic.find(filter);
      let ts = await LPStatistic.getDailyStatistic();
      return [ts, ...ps]
    } else {
      return LPStatistic.find(filter)
    }
  };

  // 获取固定统计数据
  LPStatistic.getFixedStatistic = async function () {

    // 点赞数
    let supportCount = await LPStatistic.app.models.LPSupport.count();

    // 组队数
    let teamCountSQL = `select count(x.id) as count from LPTeam as x`;
    let teamCount = await LPStatistic.app.makeSql(teamCountSQL, 2);

    // 组队成功数
    let successTeamCountSQL = `select count(x.id) as count from LPTeam as x where x.enable=true`;
    let successTeamCount = await LPStatistic.app.makeSql(successTeamCountSQL, 2);

    return {
      supportCount,
      teamCount: teamCount && teamCount.count || 0,
      successTeamCount: successTeamCount && successTeamCount.count || 0,
    }
  };

  // 获取签到固定统计
  LPStatistic.getSignStatistic = async function () {
    let userCount = await LPStatistic.app.models.LPSignUser.count();
    let signCount = await LPStatistic.app.models.LPSignin.count();
    return {
      userCount,
      signCount
    }
  };

  LPStatistic.remoteMethod('getAll', {
    description: '按日期统计查询',
    accessType: 'READ',
    accepts: [
      {arg: 'filter', type: 'object'}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/all'},
  });

  LPStatistic.remoteMethod('getFixedStatistic', {
    description: '获取固定统计数据',
    accessType: 'READ',
    accepts: [],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/getFixedStatistic'},
  })

  LPStatistic.remoteMethod('getSignStatistic', {
    description: '获取签到固定统计数据',
    accessType: 'READ',
    accepts: [],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/getSignStatistic'},
  })
};
