'use strict';

const farmhash = require('farmhash');
const g = require('strong-globalize')();

module.exports = function (LPSupport) {

  LPSupport.support = async function (teamId, userId, tx) {
    let lpTeamAccount = await LPSupport.app.models.LPTeamAccount.findOne({where: {accountId: userId, LPTeamId: teamId}})
    if (lpTeamAccount) {
      const err = new Error(g.f('不能给自己队伍点赞'));
      err.statusCode = 400;
      throw err;
    }

    let lpSupport = await LPSupport.findOne({where: {teamId, userId}});
    if (lpSupport) {
      const err = new Error(g.f('您已经点赞'));
      err.statusCode = 400;
      throw err;
    }

    // 点赞者增加水晶 并记录在lpsupport中
    let setting = await LPSupport.app.models.LPSetting.getSetting();

    let crystal = parseInt(Math.random() * (setting.supportRight - setting.supportLeft)) + setting.supportLeft;
    if (!crystal) {
      const err = new Error(g.f('水晶设置错误'));
      err.statusCode = 400;
      throw err;
    }

    await LPSupport.app.models.Crystal.add(crystal, userId, tx);

    return LPSupport.create({teamId, userId, crystal}, {transaction: tx})
  };
};
