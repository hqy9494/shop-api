const axios = require("axios");
const debug = require('debug')("luckydraw:logistics");
const moment = require('moment');
const md5 = require('md5');
const xml2js = require('xml2js');
const parseString = require('xml2js').parseString;

module.exports = function (app) {
  // 原有物流
  let config = app.get('logistics');
  const instance = axios.create({
    baseURL: config.url,
    timeout: 5 * 1000
  });

  app.getOldLogisticsDetails = async function (company, num) {
    debug(`Query logistics ${company} ${num}`);
    let result = await instance.get(`/openapi-api.html?key=${config.key}&exp=${company}&num=${num}`).then(d => {
      return d.data;
    });
    return result;
  };

  // 发网物流
  const finexx = app.get('finexx');
  const finexxReq = axios.create({
    timeout: 5 * 1000,
    headers: {'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'}
  });

  // 统一请求接口
  app.getfineexResult = async function (method, data) {

    let builder = new xml2js.Builder();
    let xml = builder.buildObject(data);


    let app_key = finexx.app_key;
    // let method = "fineex.wms.trades.add";
    let partner_id = finexx.partner_id;
    let timestamp = moment().format("YYYY-MM-DD HH:mm:ss");
    let v = "2.0";
    let secret = finexx.app_secret;

    let signString = `${secret}app_key${app_key}method${method}partner_id${partner_id}timestamp${timestamp}v${v}${xml}${secret}`;

    let sign = md5(signString).toUpperCase();

    let result = await finexxReq.post(`${finexx.url}?method=${method}&timestamp=${timestamp}&app_key=${app_key}&v=2.0&partner_id=${partner_id}&sign=${sign}`, xml).catch(e => {
      return e.response || {
          data: {
            code: e.code
          }
        };
    });

    let re = {};
    parseString(result.data, function (err, result) {
      if (err) {
      } else {
        re = result
      }
    });

    return re
  };

  // 获取物流信息
  app.getLogisticsDetails = async function (company, num) {
    debug(`Query logistics ${company} ${num}`);

    let xmldata = {
      request: {
        expressCode: num
      }
    };

    let result = await app.getfineexResult("fineex.wms.trade.waybillprocess.get", xmldata);

    return result && result.response && result.response.processes && result.response.processes[0] && result.response.processes[0].processe || {err: true}
  };

  // 订单取消
  app.cancelLogistics = async function (order) {
    let xmldata = {
      request: {
        saleOrderCode: order.id,
        remark: "取消订单"
      }
    };

    let result = await app.getfineexResult("fineex.wms.trade.cancel", xmldata);
    return result && result.response
  };

  // 新增订单推送
  app.fineexWmsTradesAdd = async function (order) {
    let address = await app.models.Address.findById(order.addressId);

    let xmldata = {
      request: {
        orders: {order: {
          wareHouseCode: finexx.wareHouseCode,
          saleOrderCode: order.id,
          logisticsCode: "SF",
          saleDate: moment().format("YYYY-MM-DD HH:mm:ss"),
          payment: 0,
          insuranceValue: 0,
          sourcePlatformCode: "OTHER",
          receiver: {
            name: address.userName,
            province: address.provinceName,
            city: address.cityName,
            mobilePhone: address.telNumber,
            address: (address.districtName || "") + (address.detailInfo || "")
          },
          sender: {
            senderName: "心愿先生"
          },
          items: {
            item: {
              barCode: finexx.barCode,
              itemName: "心愿盒子",
              quantity: order.total
            }
          }
        }}
      }
    };

    return await app.getfineexResult("fineex.wms.trades.add", xmldata);
  };

  // 订单发送成功回调
  app.post('/fineex/callback', async (req, res) => {
    // 返回的xml数据
    let xmlData = Object.keys(req.body)[0];

    // md5 加密对比
    const query = req.query;
    const secret = finexx.app_secret;
    let signString = `${secret}app_key${query.app_key}method${query.method}partner_id${query.partner_id}timestamp${query.timestamp}v${query.v}${xmlData}${secret}`;
    let sign = md5(signString).toUpperCase();

    if (sign === query.sign) {
      let order = {};
      parseString(xmlData, function (err, result) {
        if (err) {
          console.log("wuliu error:", err);
        } else {
          order = result && result.request
        }
      });

      let orderId = order && order.saleOrderCode && order.saleOrderCode[0];
      let expressCode = order && order.expressCode && order.expressCode[0];
      let logisticsCode = order && order.logisticsCode && order.logisticsCode[0];

      // 是否是合并订单推送
      let mod = orderId && await app.models.MergeOrder.findOne({where: {id: orderId}});
      if (mod) {
        await app.models.MergeOrder.splitOrders(orderId, expressCode, logisticsCode);
      } else {
        await app.models.Order.fahuoOrder(orderId, expressCode, logisticsCode);
      }

      let builder = new xml2js.Builder();
      let xml = builder.buildObject({response: {flag: true, code: " ", message: "success"}});
      res.send(xml)
    } else {
      let builder = new xml2js.Builder();
      let xml = builder.buildObject({response: {flag: false, code: " ", message: "签名错误"}});
      res.send(xml)
    }
  });

  //
  // async function xxxx() {
  //   let aaa = await app.getLogisticsDetails("xx", "VB43740964105");
  //   console.log(7777, aaa);
  // }
  // xxxx();
};
