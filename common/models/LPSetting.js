'use strict';

const farmhash = require('farmhash');
const g = require('strong-globalize')();
const moment = require("moment");

module.exports = function (LPSetting) {
  // TEAM-组队活动 SIGNIN-签到活动
  LPSetting.CODE_TEAM = "TEAM";
  LPSetting.CODE_SIGNIN = "SIGNIN";

  LPSetting.createDefaultSetting = async function () {
    let team_setting = await LPSetting.findOne({where: {code: LPSetting.CODE_TEAM}});
    if (!team_setting) {
      await LPSetting.create({
        name: "组队活动",
        code: LPSetting.CODE_TEAM,
        config: {
          randomLeft: 5,   //随机奖励水晶左(单人奖励)
          randomRight: 20, //随机奖励水晶右(单人奖励)
          supportLeft: 1,  //点赞奖励水晶左
          supportRight: 3  //点赞奖励水晶右
        }
      })
    }

    let signin_setting = await LPSetting.findOne({where: {code: LPSetting.CODE_SIGNIN}});
    if (!signin_setting) {
      await LPSetting.create({
        name: "签到活动",
        code: LPSetting.CODE_SIGNIN,
        config: {
          randomLeft: 5,    //签到奖励水晶左
          randomRight: 20,  //签到奖励水晶右
          magnifyDays: 3,   //购买膨胀时间（天）
          magnifyLeft: 5,   //膨胀倍率左（倍）
          magnifyRight: 10, //膨胀倍率右（倍）
          addDays: 2,       //补签往前能到时间（天）
        }
      })
    }
  };

  LPSetting.getSetting = async function (code) {
    code = code || LPSetting.CODE_TEAM;
    let setting = await LPSetting.findOne({where: {code}});
    return Object.assign({}, setting.__data, setting.config);
  };

  LPSetting.updateSetting = async function (code, data) {
    // ds = default setting
    let ds = code && await LPSetting.findOne({where: {code}});
    if (ds) {
      return ds.updateAttributes(data)
    } else {
      return LPSetting.create(data)
    }
  };

  LPSetting.remoteMethod('getSetting', {
    description: '获取配置',
    accessType: 'READ',
    accepts: [
      {arg: 'code', type: 'string'}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/getSetting'},
  });

  LPSetting.remoteMethod('updateSetting', {
    description: '修改配置',
    accessType: 'WRITE',
    accepts: [
      {arg: 'code', type: 'string'},
      {arg: 'data', type: 'object', http: {source: 'body'}}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'put', path: '/updateSetting'},
  });
};
