'use strict';

const farmhash = require('farmhash');
const g = require('strong-globalize')();
const moment = require('moment');

module.exports = function (LPSignin) {
  // 签到
  LPSignin.signin = async function (date, options) {
    const userId = options.accessToken.userId;
    const setting = await LPSignin.getSetting();
    const { randomLeft, randomRight, magnifyLeft, magnifyRight, magnifyDays, addDays, enable } = setting;
    if (!enable) {
      const err = new Error(g.f('签到活动已关闭'));
      err.statusCode = 400;
      throw err;
    }

    let preSign = await LPSignin.findOne({where: {userId, date}});
    if (preSign) {
      const err = new Error(g.f('已签到'));
      err.statusCode = 400;
      throw err;
    }

    if (moment(date).add(addDays + 1, "days").isBefore(moment())) {
      const err = new Error(g.f('无法签到'));
      err.statusCode = 400;
      throw err;
    }

    if (moment(date).isAfter(moment().endOf('day'))) {
      const err = new Error(g.f('无法提前签到'));
      err.statusCode = 400;
      throw err;
    }

    let crystal = parseInt(Math.random() * (randomRight - randomLeft)) + randomLeft;
    let magnify = parseInt(Math.random() * (magnifyRight - magnifyLeft)) + magnifyLeft;

    // 补签
    if (moment(date).endOf('day').isBefore(moment())) {
      return await LPSignin.addCrystal(date, userId, crystal, true, 1);
    } else {
      let lastOrder = await LPSignin.app.models.Order.findOne({where: {status: {neq: "WAIT_PAY"}, buyerId: userId}, order: "createdAt DESC"});
      if (lastOrder && moment(lastOrder.createdAt).add(magnifyDays, 'days').endOf('day').isAfter(moment())) {
        // 倍率影响
        return await LPSignin.addCrystal(date, userId, crystal * magnify, false, magnify);
      } else {
        // 普通签到
        return await LPSignin.addCrystal(date, userId, crystal, false, 1);
      }
    }
  };

  // 获取用户签到信息
  LPSignin.getSignInfo = async function (options) {
    const userId = options.accessToken.userId;
    const setting = await LPSignin.getSetting();
    let result = [];
    let lastOrder = await LPSignin.app.models.Order.findOne({where: {status: {neq: "WAIT_PAY"}, buyerId: userId}, order: "createdAt DESC"});

    for (let i = -2; i <= setting.magnifyDays; i++) {
      let date = moment().add(i, "days").format("YYYY-MM-DD");
      let signin = await LPSignin.findOne({where: {date, userId}});
      let couldMagnify = lastOrder && moment(date).isBetween(moment(lastOrder.createdAt).subtract(1, 'day').format("YYYY-MM-DD"), moment(lastOrder.createdAt).add(setting.magnifyDays + 1, 'day').format("YYYY-MM-DD")) || false;
      result.push((signin && Object.assign({}, signin.__data, {couldMagnify})) || {date, couldMagnify})
    }
    return result
  };

  // 配置
  LPSignin.getSetting = async function () {
    const { LPSetting } = LPSignin.app.models;
    return LPSetting.getSetting(LPSetting.CODE_SIGNIN)
  };

  // 签到奖励水晶
  LPSignin.addCrystal = async function (date, userId, crystal, isAdd, magnify) {
    const tx = await LPSignin.beginTransaction({isolationLevel: 'READ COMMITTED', timeout: 15000});
    try {
      await LPSignin.app.models.Crystal.add(crystal, userId, tx);
      await LPSignin.app.models.LPSignUser.updateUser(userId, crystal, tx);
      let sign = await LPSignin.create({
        date,
        userId,
        crystal,
        isAdd,
        magnify
      }, {transaction: tx});
      await tx.commit();
      return sign
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  };

  LPSignin.remoteMethod('signin', {
    description: '签到',
    accessType: 'READ',
    accepts: [
      {arg: 'date', type: 'string', required: true, description: "2018-09-08"},
      {arg: 'options', type: 'object', http: 'optionsFromRequest'}
      ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'post', path: '/signin'},
  });

  LPSignin.remoteMethod('getSignInfo', {
    description: '获取用户签到信息',
    accessType: 'READ',
    accepts: [
      {arg: 'options', type: 'object', http: 'optionsFromRequest'}
    ],
    returns: {arg: 'result', type: 'array', root: true},
    http: {verb: 'get', path: '/getSignInfo'},
  });

  LPSignin.remoteMethod('getSetting', {
    description: '获取签到活动配置',
    accessType: 'READ',
    accepts: [
      {arg: 'options', type: 'object', http: 'optionsFromRequest'}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/getSetting'},
  });
};
