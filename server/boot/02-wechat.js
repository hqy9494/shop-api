'use strict';
const wechat = require('wechat');
const _ = require('lodash');
const WechatAPI = require('wechat-api');
const OAuth = require('wechat-oauth');
const crypto = require('crypto');
const Payment = require('wechat-pay').Payment;
const middleware = require('wechat-pay').middleware;
const debug = require('debug')("common:wechat");
const fs = require('fs');
const path = require('path');

const PromiseA = require('bluebird');

module.exports = function (app) {
  const wechatConfig = app.get('wechat');

  const client = new OAuth(wechatConfig.appid, wechatConfig.appSecret);

  const notifyUrl = `${wechatConfig.domain}/payment/callback`;
  const payConfig = {
    partnerKey: wechatConfig.partnerKey,
    appId: wechatConfig.appid,
    mchId: wechatConfig.mchId,
    notifyUrl,
    pfx: fs.readFileSync(path.join(__dirname, '../files/apiclient_cert.p12'))
  };

  const payment = new Payment(payConfig);
  app.payment = payment;

  app.use('/payment/simulation', async function (req, res) {
    const orderId = req.query.orderId;
    const password = req.query.password;
    if (password !== app.get('simulationPayCallbackPassword')) {
      res.send('failure');
    } else {
      debug(`Simulation payment callback, orderId ${orderId}`);
      app.models.Order.finishPay(orderId, 'simulation', {out_trade_no: orderId});
      res.send('success');
    }
  });

  // 支付成功回调
  app.use('/payment/callback', middleware(payConfig).getNotify().done(async function (message, req, res) {
    const orderId = message.out_trade_no;
    debug(`Wechat payment callback, orderId ${orderId},${JSON.stringify(message)}`);
    app.models.Order.finishPay(orderId, 'wechat', message);
    res.reply('success');
  }));

  // 退款回调
  app.use('/payment/refund/callback', middleware(payConfig).getRefundNotify().done(function (message, req, res) {
    const refundOrderId = message.out_refund_no;
    const orderId = message.out_trade_no;
    // TODO 处理退款成功后状态变更
    app.models.Order.finishRefund(orderId, refundOrderId, message);
    debug(`Wechat payment refund callback, orderId: ${orderId}, refundOrderId: ${refundOrderId}, ${JSON.stringify(message)}`);
    res.reply('success');
  }));

  // 获取微信支付公众号openid
  app.get('/wx/wechat_payment_openid', (req, res) => {
    const openid = req.query.openId;
    const to = req.query.to;
    const url = client.getAuthorizeURL(`${wechatConfig.domain}/wx/wechat_payment_openid/token?openId=${openid}&to=${to}`, '123456', 'snsapi_base');
    res.redirect(url);
  });

  app.get('/wx/wechat_payment_openid/token', async (req, res) => {
    const code = req.query.code;
    const openid = req.query.openId;
    const to = req.query.to;
    let result = await PromiseA.fromCallback(cb => client.getAccessToken(code, cb));
    const wechat_payment_openid = result.data.openid;
    await app.models.Account.updateWechatPaymentOpenid(openid, wechat_payment_openid);
    res.redirect(`${wechatConfig.cdnDomain}/#/login?openId=${openid}${(to && to !== "undefined") ? "&to=" + to : ""}`);
  });
};
