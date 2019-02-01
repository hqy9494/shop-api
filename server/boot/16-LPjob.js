'use strict';

var schedule = require('node-schedule');
const moment = require('moment');

module.exports = function (app) {

  if (process.env.NODE_APP_INSTANCE === '0') {
    // 统计定时任务
    app.LPStatisticJob = schedule.scheduleJob(app.get('LP').statistic, async function () {
      await app.models.LPStatistic.getDailyStatistic(true);
    });

    // 夜晚结算昨日订单
    app.LPSettle = schedule.scheduleJob(app.get('LP').settle, async function () {
      await app.settleTeam()
    });
  }

  app.settleTeam = async function () {
    let preTeams = await app.models.LPTeam.find({where: {enable: true, createdAt: {between: [moment().subtract(1,'day').startOf('day').utc().format(), moment().subtract(1,'day').endOf('day').utc().format()]}}})
    for (let i = 0; i < preTeams.length; i++) {
      let team = preTeams[i];
      let againstTeam = await app.models.LPTeam.findOne({where: {id: team.againstTeamId}});
      if (team.support && team.support > againstTeam.support) {
        // 获胜 增加水晶
        let setting = await app.models.LPSetting.getSetting();
        let crystal = parseInt(Math.random() * (setting.randomRight - setting.randomLeft)) + setting.randomLeft;
        if (!crystal) {
          crystal = 10;
        }

        // 队长 *2
        await app.models.Crystal.add(crystal*2, team.leaderId);
        // 队员
        for (let j = 0; j < team.memberList.length; j++) {
          await app.models.Crystal.add(crystal, team.memberList[j]);
        }

        await team.updateAttributes({
          isChecked: true,
          crystal: crystal*5
        })
      } else {
        await team.updateAttributes({
          isChecked: true
        })
      }
    }
  };
};
