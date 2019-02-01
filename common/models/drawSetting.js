'use strict';
const farmhash = require('farmhash');
const g = require('strong-globalize')();
const moment = require('moment');

module.exports = function(DrawSetting) {
  // METARIAL-实物 COUPON-优惠券 RED_PACKET-红包 BOOK_CARD-读书卡
  DrawSetting.TYPE_METARIAL = "METARIAL";
  DrawSetting.TYPE_COUPON = "COUPON";
  DrawSetting.TYPE_RED_PACKET = "RED_PACKET";
  DrawSetting.TYPE_BOOK_CARD = "BOOK_CARD";

  DrawSetting.getSetting = async function () {
    return DrawSetting.findOne()
  };

  DrawSetting.updateSetting = async function (data) {
    const { drawCrystal, drawLuckyPoint, buyCrystal, buyLimit, dayBuyLimit} = data;
    let setting = await DrawSetting.findOne();
    DrawSetting.app.drawSetting = await setting.updateAttributes({
      drawCrystal, drawLuckyPoint, buyCrystal, buyLimit, dayBuyLimit
    });
    return DrawSetting.app.drawSetting
  };

  // 修改抽奖奖池
  DrawSetting.updatePrizeContent = async function (data) {
    if (!Array.isArray(data)) {
      const err = new Error(g.f('参数错误'));
      err.statusCode = 400;
      throw err;
    }

    data.map(v => {
      let check = DrawSetting.checkPrize(v);
      if (check.err) {
        const err = new Error(g.f(check.err));
        err.statusCode = 400;
        throw err;
      }
    });

    let setting = await DrawSetting.findOne();
    // 生成当前轮次的完整数据
    let currentList = [];
    for (let i = 0; i < data.length; i++) {
      for (let j = 0; j < data[i].count; j ++) {
        currentList.push(data[i])
      }
    }

    DrawSetting.app.drawSetting = await setting.updateAttributes({
      defaultList: data,
      currentList: currentList,
      currentNo: setting.currentNo + 1
    });
    return DrawSetting.app.drawSetting
  };

  // 审核奖池
  DrawSetting.checkPrize = function (value) {
    let prizeTypeArr = [DrawSetting.TYPE_METARIAL, DrawSetting.TYPE_COUPON, DrawSetting.TYPE_RED_PACKET, DrawSetting.TYPE_BOOK_CARD];
    if (!value.type || prizeTypeArr.indexOf(value.type) == -1) {
      return {err: "奖品类型错误"}
    }

    if (!value.picture) {
      return {err: "奖品图片缺失"}
    }

    if (!Number.isInteger(value.count) || value.count < 0) {
      return {err: "奖品轮次数量错误"}
    }

    if (!value.value || value.value <= 0) {
      return {err: "奖品价格错误"}
    }

    if (!value.cost || value.cost <= 0 || value.cost >= value.value) {
      return {err: "奖品成本错误"}
    }

    if (!value.name) {
      return {err: "奖品名称错误"}
    }

    if (value.type === DrawSetting.TYPE_METARIAL) {
      if (!Number.isInteger(value.stock) || value.stock < 0) {
        return {err: "实物奖品库存错误"}
      }
    }

    return {success: true}
  };

  // 营业还是打烊
  DrawSetting.open = async function (open) {
    let setting = await DrawSetting.findOne();
    DrawSetting.app.drawSetting = await setting.updateAttributes({
      open
    });
    return DrawSetting.app.drawSetting
  };

  DrawSetting.remoteMethod('getSetting', {
    description: '获取配置',
    accepts: [
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'get', path: '/'},
  });

  DrawSetting.remoteMethod('updateSetting', {
    description: '修改配置',
    accepts: [
      {arg: 'data', type: 'object', required: true, http: {source: 'body'},
        description: "drawCrystal 抽一次消耗水晶, drawLuckyPoint 抽一次赠送的幸运值, buyCrystal 买一次赠送水晶, buyLimit 每人每日购买限制, dayBuyLimit 每日购买限制, "}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'put', path: '/'},
  });

  DrawSetting.remoteMethod('updatePrizeContent', {
    description: '修改奖池配置',
    accepts: [
      {arg: 'data', type: 'array', required: true, http: {source: 'body'},
        description: "[{type: 'METARIAL', picture: 'www.baidu.com', count: 10, value: 100, cost: 80, name: '饮水机', stock: 20}]"}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'put', path: '/updatePrizeContent'},
  });

  DrawSetting.remoteMethod('open', {
    description: '店铺打烊或者开启',
    accepts: [
      {arg: 'open', type: 'boolean', required: true}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'put', path: '/open'},
  });
};
