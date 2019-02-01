'use strict';

const _ = require('lodash');
const farmhash = require('farmhash');

module.exports = function (app) {
  app.drawHandle = {};

  // 中奖前后特殊处理
  app.drawHandle.prizeHandle = async function (prize, defaultList, tx, options) {
    if (app.drawHandle[prize.type]) {
      return app.drawHandle[prize.type](prize, defaultList, tx, options)
    } else {
      return {prize, defaultList}
    }
  };

  // 实物奖处理
  app.drawHandle[app.models.DrawSetting.TYPE_METARIAL] = async function (prize, defaultList) {
    let selectedPrize = {};
    let selectedKey;
    for (let i = 0; i < defaultList.length; i++) {
      if (defaultList[i].type === prize.type && defaultList[i].name === prize.name) {
        selectedPrize = defaultList[i];
        selectedKey = i;
      }
    }

    // 库存 = 0
    if (selectedPrize && selectedPrize.stock <= 0) {
      // 库存不足 优惠券来凑
      return {
        prize: {type: app.models.DrawSetting.TYPE_COUPON, value: 100, cost: 0, name: "100元优惠券"},
        defaultList
      }
    }

    // 库存 -1
    if (selectedKey || selectedKey === 0) {
      selectedPrize.stock = selectedPrize.stock - 1;
      defaultList[selectedKey] = selectedPrize
    }

    return {prize, defaultList}
  };

  // 红包处理
  app.drawHandle[app.models.DrawSetting.TYPE_RED_PACKET] = async function (prize, defaultList, tx, options) {
    // 发红包
    const r = (Math.random() * 10000 + '').substring(5, 9) + (Math.random() * 10000 + '').substring(5, 9); // 8位
    const u = farmhash.hash32(options.options.accessToken.userId).toString().substring(1, 6); // 5位
    const now = Date.now(); // 13位
    const billNo = now + u + r;

    const req = options.req;
    const headers = req && req.headers || {};
    let ip = headers['x-real-ip'] || headers['x-forwarded-for'];

    let user = await app.models.Account.findById(options.options.accessToken.userId);
    await app.luckydraw.sendRedpacket(prize.value, user.openid, billNo, ip);
    return {prize, defaultList}
  }
};
