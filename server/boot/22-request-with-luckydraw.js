'use strict';

const debug = require('debug')('common:wechat-request');
const axios = require('axios');
const _ = require('lodash');
const errs = require('errs');
var querystring = require('querystring');

module.exports = function (app) {

  const luckydraw = app.get('luckydraw');

  app.axios = axios;
  axios.defaults.baseURL = luckydraw.url;
  axios.defaults.headers.common['Authorization'] = `Bearer ${luckydraw.token}`;
  axios.defaults.headers.post['Content-Type'] = 'application/x-www-form-urlencoded';

  app.luckydraw = {};


  app.luckydraw.payOrder = function (data) {
    return app.axios.post('/shoppingOnline/pay', data).catch(e => {
      return e.response || {
        data: {
          code: e.code
        }
      };
    })
  };

  app.luckydraw.refund = function (wxRefundData) {
    return app.axios.post('/shoppingOnline/refund', wxRefundData).catch(e => {
      return e.response || {
          data: {
            code: e.code
          }
        };
    })
  };

  app.luckydraw.getUserInfo = function (data) {
    return app.axios.post('/shoppingOnline/user', data).catch(e => {
      return e.response || {
          data: {
            code: e.code
          }
        };
    })
  };

  app.luckydraw.getUnionid = function (data) {
    return app.axios.post('/shoppingOnline/unionid', data).catch(e => {
      return e.response || {
          data: {
            code: e.code
          }
        };
    })
  };

  app.luckydraw.getWechatJSSDK = function (data) {
    return app.axios.post('/shoppingOnline/jsSDK', data).catch(e => {
      return e.response || {
          data: {
            code: e.code
          }
        };
    })
  };

  // 获取luckydraw-api的用户信息，不通过微信
  app.luckydraw.getCommonUser = function (data) {
    return app.axios.post('/shoppingOnline/commonUser', data).catch(e => {
      return e.response || {
          data: {
            code: e.code
          }
        };
    })
  };

  // 换取token
  app.luckydraw.getDrawToken = function (openid) {
    return app.axios.post('/shoppingOnline/getDrawToken', {openid}).catch(e => {
      return e.response || {
          data: {
            code: e.code
          }
        };
    })
  };

  // 发红包
  app.luckydraw.sendRedpacket = function (value, openid, billNo, ip) {
    return app.axios.post('/shoppingOnline/sendRedpacket', {value, billNo, openid, ip}).catch(e => {
      return e.response || {
          data: {
            code: e.code
          }
        };
    })
  };

  // app.post('/finishPay', async (req, res) => {
  //   debug('wechat url callback');
  //   let result = req.body;
  //   await app.models.Order.finishPay(result.orderId)
  // });
  //
  // app.post('/finishRefund', async (req, res) => {
  //   debug('wechat url callback');
  //   let result = req.body;
  //   await app.models.Order.finishRefund(result.orderId)
  // });

  app.post('/getOnlineOrders', async (req, res) => {
    let result = req.body;
    let orders = await app.models.Order.getOnlineOrders(result.filter, result.openid);
    res.json(orders)
  });

  app.post('/getOnlineOrdersCount', async (req, res) => {
    let result = req.body;
    let count = await app.models.Order.getOnlineOrdersCount(result.filter, result.openid);
    res.json(count)
  });

  app.post('/getOnlineAddress', async (req, res) => {
    let result = req.body;
    let orders = await app.models.Address.getAddressByOpenid(result.openid);
    res.json(orders)
  });

  app.post('/getOnlineToken', async (req, res) => {
    let result = req.body;
    let ans = await app.models.Account.loginOrCreateByOpenId(result.openid);
    res.json(ans)
  });

  app.post('/unionidToToken', async (req, res) => {
    let result = req.body;
    let ans = await app.models.Account.loginOrCreateByUnionid(result.unionid);
    res.json(ans)
  });

  app.get('/health', async (req, res) => {
    res.json({ "status" : "UP" })
  });

  app.post('/addCrystal', async (req, res) => {
    let result = req.body;
    let { unionid, count } = result;
    let user = await app.models.Account.findOrCreateByUnionid(unionid);
    let crystal = await app.models.Crystal.add(app.drawSetting.buyCrystal * count, user.id);
    res.json({added: app.drawSetting.buyCrystal * count, crystal})
  });
};
