'use strict';
const farmhash = require('farmhash');
const g = require('strong-globalize')();
const moment = require('moment');

module.exports = function(Crystal) {
  // 增加水晶
  Crystal.add = async function (num, userId, tx) {
    if (num <= 0 || !Number.isInteger(num)) {
      const err = new Error(g.f('水晶数量有误'));
      err.statusCode = 400;
      throw err;
    }

    let crystal = userId && await Crystal.findOne({where: {userId}});
    if (!crystal) {
      crystal = await Crystal.create({
        userId
      })
    }

    return crystal.updateAttributes({
      count: crystal.count + num
    }, {transaction: tx})
  };

  // 减少水晶, draw === true 抽奖消耗水晶
  Crystal.subtract = async function (num, userId, draw, tx) {
    if (num <= 0 || !Number.isInteger(num)) {
      const err = new Error(g.f('水晶数量有误'));
      err.statusCode = 400;
      throw err;
    }

    let crystal = await Crystal.findOne({where: {userId}});
    if (!crystal || crystal.count < num) {
      const err = new Error(g.f('水晶不足'));
      err.statusCode = 400;
      throw err;
    }

    return crystal.updateAttributes({
      count: crystal.count - num,
      drawLuckyPoint: draw ? crystal.drawLuckyPoint + Crystal.app.drawSetting.drawLuckyPoint : crystal.drawLuckyPoint
    }, {transaction: tx})
  };

  // 核对水晶
  Crystal.check = async function (num, userId) {
    if (num <= 0 || !Number.isInteger(num)) {
      const err = new Error(g.f('水晶数量有误'));
      err.statusCode = 400;
      throw err;
    }

    let crystal = await Crystal.findOne({where: {userId}});
    if (!crystal || crystal.count < num) {
      return false
    } else {
      return true
    }
  };

  // 获取我的水晶数量
  Crystal.getMy = async function (options) {
    let userId = options.accessToken.userId;
    return Crystal.findOne({where: {userId}})
  };

  // 修改幸运值
  Crystal.updateLuckyPoint = async function (crystalId, luckyPoint) {
    let crystal = await Crystal.findById(crystalId);
    return crystal && await crystal.updateAttributes({
        drawLuckyPoint: luckyPoint
      })
  };

  Crystal.remoteMethod('getMy', {
    description: '获取我的水晶',
    accepts: [
      {arg: 'options', type: 'object', http: 'optionsFromRequest'}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'get', path: '/my'},
  });

  Crystal.remoteMethod('updateLuckyPoint', {
    description: '修改幸运值',
    accepts: [
      {arg: 'crystalId', type: 'string', description: "水晶id", required: true},
      {arg: 'luckyPoint', type: 'number', description: "幸运值", required: true}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'put', path: '/updateLuckyPoint'},
  });
};
