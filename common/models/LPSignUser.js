'use strict';

const farmhash = require('farmhash');
const g = require('strong-globalize')();
const moment = require('moment');

module.exports = function (LPSignUser) {
  // 更新用户签到统计信息
  LPSignUser.updateUser = async function (userId, crystal, tx) {
    let signUser = await LPSignUser.findOne({where: {userId}});
    if (!signUser) {
      let user = await LPSignUser.app.models.Account.findOne({where: {id: userId}});
      if (!user) {
        const err = new Error(g.f('用户不存在'));
        err.statusCode = 400;
        throw err;
      }
      return await LPSignUser.create({
        nickname: user.nickname,
        userId,
        times: 1,
        crystal
      }, {transaction: tx})
    } else {
      return await signUser.updateAttributes({
        times: signUser.times + 1,
        crystal: signUser.crystal + crystal
      }, {transaction: tx})
    }
  };

  // 获取用户签到信息
  LPSignUser.getInfo = async function (options) {
    const userId = options.accessToken.userId;
    return LPSignUser.findOne({where: {userId}})
  };


  // 分享点击
  LPSignUser.click = async function (userId) {
    let signUser = userId && await LPSignUser.findOne({where: {userId}});
    if (!signUser) {
      const err = new Error(g.f('用户未签到'));
      err.statusCode = 400;
      throw err;
    }

    return signUser.updateAttributes({
      clickTimes: signUser.clickTimes + 1
    })
  };

  LPSignUser.remoteMethod('getInfo', {
    description: '获取用户签到统计',
    accessType: 'READ',
    accepts: [
      {arg: 'options', type: 'object', http: 'optionsFromRequest'}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/getInfo'},
  });

  LPSignUser.remoteMethod('click', {
    description: '分享点击',
    accessType: 'WRITE',
    accepts: [
      {arg: 'userId', type: 'string', required: true, description: "分享者id"}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'post', path: '/click'},
  });
};
