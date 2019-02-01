'use strict';
const farmhash = require('farmhash');
const g = require('strong-globalize')();
const xlsx = require('node-xlsx').default;
const moment = require('moment');

module.exports = function(Order) {
  // WAIT_PAY-未付款 PAID-已付款(代发货) WAIT_REFUND-等待退款 REFUND-已退款 SEND-已发货 LOGISTIC_CANCEL-物流取消 CLOSED-已关闭 RECEIVED-已签收
  Order.STATE_WAIT_PAY = "WAIT_PAY";
  Order.STATE_PAID = "PAID";
  Order.STATE_WAIT_REFUND = "WAIT_REFUND";
  Order.STATE_REFUND = "REFUND";
  Order.STATE_CLOSED = "CLOSED";
  Order.STATE_SEND = "SEND";
  Order.STATE_RECEIVED = "RECEIVED";
  Order.STATE_LOGISTIC_CANCEL = "LOGISTIC_CANCEL";

  Order.createOrder = async function (data, req, options) {
    const arr = ['total', 'addressId', 'productNo'];
    for (let property of arr) {
      if (!data[property]) {
        const err = new Error(g.f(`缺少参数${property}`));
        err.statusCode = 400;
        throw err;
      }
    }

    // 订单每日限额
    let setting = await Order.app.models.DrawSetting.findOne();
    if (moment(setting.judgeDay).format("YYYY-MM-DD") === moment().format("YYYY-MM-DD")) {
      if (setting.todayBuyCount >= setting.dayBuyLimit) {
        const err = new Error(g.f(`今日盒子已卖完！`));
        err.statusCode = 400;
        throw err;
      }
    } else {
      setting.updateAttributes({judgeDay: moment(), todayBuyCount: 0})
    }

    const account = await Order.app.models.Account.findById(options.accessToken.userId);

    // 生成唯一订单号
    const r = (Math.random() * 10000 + '').substring(5, 9) + (Math.random() * 10000 + '').substring(5, 9); // 8位
    const u = farmhash.hash32(options.accessToken.userId).toString().substring(1, 6); // 5位
    const now = Date.now(); // 13位
    const orderId = now + u + r;

    const orderData = {
      id: orderId,
      no: orderId,
      buyOpenid: account.openid,
      price: Order.app.box_product.price,
      total: data.total,
      totalFee: data.total * Order.app.box_product.price,
      status: Order.STATE_WAIT_PAY,
      addressId: data.addressId,
      buyerId: account.id,
      productNo: data.productNo
    };
    const tx = await Order.beginTransaction({isolationLevel: 'READ COMMITTED', timeout: 15000});
    try {
      const order = await Order.create(orderData, {transaction: tx});

      const headers = req.headers;
      const proxy_ip = headers['x-real-ip'] || headers['x-forwarded-for'];
      let result = {id: order.id};
      const weOrder = {
        body: "幸运盒子",
        out_trade_no: order.no,
        total_fee: order.totalFee,
        spbill_create_ip: proxy_ip,
        openid: account.wechatPaymentOpenid,
        trade_type: 'JSAPI'
      };
      let payRes = await Order.app.payment.getBrandWCPayRequestParams(weOrder);
      result.result = payRes;
      await order.updateAttributes({payData: payRes}, {transaction: tx});
      await tx.commit();
      return result;
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  };

  Order.finishPay = async function (orderId) {
    let order = await Order.findById(orderId);
    let setting = await Order.app.models.DrawSetting.findOne();
    const tx = await Order.beginTransaction({isolationLevel: 'READ COMMITTED', timeout: 15000});

    try {
      order = await order.updateAttributes({
        status: Order.STATE_PAID,
        payTime: moment()
      }, {transaction: tx});

      await Order.app.models.Crystal.add(Order.app.drawSetting.buyCrystal * order.total, order.buyerId, tx);
      let user = await Order.app.models.Account.findById(order.buyerId);
      await user.updateAttributes({
        buyTimes: (user.buyTimes || 0) + order.total
      }, {transaction: tx});

      await setting.updateAttributes({todayBuyCount: setting.todayBuyCount + order.total});

      // 通知fineex 发货
      // await Order.app.fineexWmsTradesAdd(order);

      await tx.commit();
      return order
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  };

  Order.fahuoOrder = async function (orderId, expressNo, company) {
    let order = orderId && await Order.findOne({where: {id: orderId}});
    if (!order) {
      const err = new Error(g.f(`订单号${orderId}不存在`));
      err.statusCode = 400;
      throw err;
    }

    if (order.status === Order.STATE_WAIT_PAY) {
      const err = new Error(g.f(`订单${orderId}未支付`));
      err.statusCode = 400;
      throw err;
    }

    let log = await Order.app.models.Logistics.findOne({where: {id: `order_${orderId}`}});
    if (log) {
      await log.updateAttributes({
        orderId,
        company,
        no: expressNo,
        details: [],
        lastFetchTime: null
      })
    } else {
      await Order.app.models.Logistics.create({
        id: `order_${orderId}`,
        orderId,
        company,
        no: expressNo
      });
    }
    return order.updateAttributes({status: Order.STATE_SEND, expressNo});
  };

  Order.getOwnerOrder = async function (filter, options) {
    filter = filter || {};
    filter.where = filter.where || {};
    filter.where.buyerId = options.accessToken.userId;
    let orders  = await Order.find(filter);
    let product = await Order.app.models.Product.getProductSingle();
    for (let i = 0; i < orders.length; i++) {
      orders[i].address = await Order.app.models.Address.findById(orders[i].addressId);
      orders[i].account = await Order.app.models.Account.findById(orders[i].buyerId);
      orders[i].product = product
    }
    return orders
  };

  Order.getOwnerCount = async function (where, options) {
    where = where || {};
    where.buyerId = options.accessToken.userId;
    const count = await Order.count(where);
    return {count: count || 0};
  };

  Order.getOnlineOrders = async function (filter, openid) {
    let user = await Order.app.models.Account.findOne({where: {openid}});
    if (!user) {
      return []
    }
    filter = filter || {};
    filter.where = filter.where || {};
    filter.where.buyerId = user.id;
    let orders  = await Order.find(filter);
    let product = await Order.app.models.Product.getProductSingle();
    for (let i = 0; i < orders.length; i++) {
      orders[i].address = await Order.app.models.Address.findById(orders[i].addressId);
      orders[i].account = user;
      orders[i].product = product
    }
    return orders
  };

  Order.getOnlineOrdersCount = async function (where, openid) {
    let user = await Order.app.models.Account.findOne({where: {openid}});
    if (!user) {
      return {count: 0}
    }
    where = where || {};
    where.buyerId = user.id;
    const count = await Order.count(where);
    return {count: count || 0};
  };

  Order.refund = async function (id, reason, price, options) {
    price = price * 100;
    const order = await Order.findById(id);

    if (!order) {
      const err = new Error(g.f('订单不存在'));
      err.statusCode = 404;
      throw err;
    }

    if (order.status === Order.STATE_REFUND || order.status === Order.STATE_CLOSED) {
      const err = new Error(g.f('订单状态错误'));
      err.statusCode = 404;
      throw err;
    }

    if (price && price > order.totalFee) {
      const err = new Error(g.f('退款金额错误'));
      err.statusCode = 400;
      throw err;
    }

    const fee = price || order.totalFee;

    const tx = await Order.beginTransaction({isolationLevel: 'READ COMMITTED', timeout: 15000});
    try {
      const wxRefundData = {
        out_trade_no: order.no,
        out_refund_no: order.no + '_refund',
        total_fee: order.totalFee,
        refund_fee: fee,
        notify_url: `${Order.app.get('wechat').domain}/payment/refund/callback`
      };
      Order.app.payment.refund(wxRefundData);

      await order.updateAttributes({status: Order.STATE_WAIT_REFUND}, {transaction: tx});

      await Order.app.models.OrderRefundRecord.create({
        orderNo: order.no,
        refundOrderNo: order.no + '_refund',
        reason: reason,
        status: Order.STATE_WAIT_REFUND,
        fee: fee
      }, {transaction: tx});

      await tx.commit();
      return {order};
    } catch (e) {
      await tx.rollback();
      if (e.message) {
        const err = new Error(g.f(e.message));
        err.statusCode = 400;
        throw err;
      }
      throw e;
    }
  };

  Order.finishRefund = async function (orderId) {
    const order = await Order.findById(orderId);
    const orderRefundRecord = await Order.app.models.OrderRefundRecord.findOne({where: {orderNo: order.no}});

    await order.updateAttributes({status: Order.STATE_REFUND});
    await orderRefundRecord.updateAttributes({
      status: Order.STATE_REFUND
    });
  };

  Order.getOrderById = async function (id, filter) {
    filter = filter || {};
    const order = await Order.findById(id, filter);
    if (!order) {
      const err = new Error(g.f('订单不存在'));
      err.statusCode = 404;
      throw err;
    }
    let product = await Order.app.models.Product.getProductSingle();
    order.refundedRecord = await Order.app.models.OrderRefundRecord.findOne({where: {orderNo: order.no}});
    order.account = await Order.app.models.Account.findById(order.buyerId);
    order.address = await Order.app.models.Address.findById(order.addressId);
    order.product = product;
    return order;
  };

  Order.newCount = async function (where) {
    where = where || {};
    if (where.username || where.mobile) {
      let address = await Order.app.models.Address.find({where: {
        userName: where.username,
        telNumber: where.mobile
      }});
      let addressIds = address.map(v => {
        return v.id
      });
      where.addressId = {inq: addressIds};
      delete where.username;
      delete where.mobile;
    }
    return {count: await Order.count(where)}
  };

  Order.getAll = async function (filter) {
    filter = filter || {};
    filter.where = filter.where || {};
    if (filter.where.username || filter.where.mobile) {
      let address = await Order.app.models.Address.find({where: {
        userName: filter.where.username,
        telNumber: filter.where.mobile
      }});
      let addressIds = address.map(v => {
        return v.id
      });
      filter.where.addressId = {inq: addressIds};
      delete filter.where.username;
      delete filter.where.mobile;
    }
    let orders  = await Order.find(filter);
    let product = await Order.app.models.Product.getProductSingle();
    for (let i = 0; i < orders.length; i++) {
      orders[i].address = await Order.app.models.Address.findById(orders[i].addressId);
      orders[i].account = await Order.app.models.Account.findById(orders[i].buyerId);
      orders[i].product = product
    }
    return orders
  };

  Order.getLogisticsDetail = async function (id) {
    let logistics = await Order.app.models.Logistics.findById(`order_${id}`);
    let order = await Order.findById(id);
    if (!logistics) {
      return {order}
    }
    if (logistics.state !== 4) {
      if (!logistics.lastFetchTime || (moment(logistics.lastFetchTime).add(Order.app.get('LogisticsInterval'), 'hour').isBefore(moment()))) {
        let details = await Order.app.getLogisticsDetails(logistics.company, logistics.no);
        if (!details.err) {
          logistics = await logistics.updateAttributes({
            details: details,
            lastFetchTime: moment().toDate()
          });
        }
      }
    }
    return {order, logistics};
  };

  // 下载订单excel
  Order.getFahuo = async function (filter, req, res) {
    filter = filter || {};
    filter.where = filter.where || {};
    if (filter.where.username || filter.where.mobile) {
      let address = await Order.app.models.Address.find({where: {
        userName: filter.where.username,
        telNumber: filter.where.mobile
      }});
      let addressIds = address.map(v => {
        return v.id
      });
      filter.where.addressId = {inq: addressIds};
      delete filter.where.username;
      delete filter.where.mobile;
    }
    let orders  = await Order.find(filter);
    let product = await Order.app.models.Product.getProductSingle();
    for (let i = 0; i < orders.length; i++) {
      orders[i].address = await Order.app.models.Address.findById(orders[i].addressId);
      orders[i].account = await Order.app.models.Account.findById(orders[i].buyerId);
      orders[i].product = product
    }

    let data = [["订单编号", "商品名称", "用户名称", "联系方式", "购买价格", "购买数量", "交易状态", "下单时间", "地址"]];
    orders.map(v => {
      data.push([
        v.no,
        v.product.name,
        v.address && v.address.userName,
        v.address && v.address.telNumber,
        v.price && v.price/100,
        v.total,
        v.status,
        moment(v.payTime).format("YYYY-MM-DD HH:mm:SS"),
        v.address && (v.address.provinceName + (v.address.cityName || "") + (v.address.countryName || "") + (v.address.districtName || "") + v.address.detailInfo)])
    });

    let xxx = xlsx.build([{name: "mySheetName", data: data}]);
    res.setHeader('Pragma', 'public');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Description', 'File Transfer');
    res.setHeader('Content-Disposition', `attachment;filename=${Date.now()}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; charset=utf-8');
    res.send(xxx);
  };

  // 取消发货
  Order.cancelFahuo = async function (id) {
    let order = await Order.findById(id);
    let cancelresult = await Order.app.cancelLogistics(order);
    if (cancelresult.flag[0] === 'true') {
      await order.updateAttributes({
        status: Order.STATE_LOGISTIC_CANCEL
      });
      await Order.app.models.Logistics.deleteById(`order_${id}`);
      return {success: true}
    } else {
      const err = new Error(g.f(cancelresult.message[0]));
      err.statusCode = 400;
      throw err;
    }
  };

  // 取消发货后重新发货
  Order.reFahuo = async function (id, addressId) {
    let order = await Order.findById(id);
    await order.updateAttributes({status: Order.STATE_PAID, addressId});
    return await Order.app.fineexWmsTradesAdd(order);
  };

  // 手动通知发网发货
  Order.fahuoByAdmin = async function (id) {
    let order = await Order.findById(id);
    await order.updateAttributes({status: Order.STATE_PAID});
    return await Order.app.fineexWmsTradesAdd(order);
  };

  // 上传excel更新订单物流
  Order.refreshOrderExpressNo = async function (data) {
    for (let i = 1; i < data.length; i++) {
      if (data[i]) {
        await Order.fahuoOrder(data[i][0], data[i][1], data[i][2])
      }
    }
  };

  Order.remoteMethod('getOrderById', {
    description: '根据id获取订单详情',
    accepts: [
      {arg: 'id', type: 'string', required: true, http: {source: 'path'}},
      {
        arg: 'filter', type: 'object',
        description: 'Filter defining fields, where, include, order, offset, and limit - must be a JSON-encoded string ({"something":"value"})'
      },
      {arg: 'options', type: 'object', http: 'optionsFromRequest'}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'get', path: '/:id'},
  });

  Order.remoteMethod('createOrder', {
    description: '创建订单',
    accepts: [
      {arg: 'data', type: 'object', required: true, http: {source: 'body'},
        description: '必须参数：total(购买盒子总数)、addressId(地址id) productNo(产品编号)'},
      {arg: 'req', type: 'object', 'http': {source: 'req'}},
      {arg: 'options', type: 'object', http: 'optionsFromRequest'}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'post', path: '/'}
  });

  Order.remoteMethod('getOwnerOrder', {
    description: '获取自己的订单',
    accepts: [
      {
        arg: 'filter', type: 'object',
        description: 'Filter defining fields, where, include, order, offset, and limit - must be a JSON-encoded string ({"something":"value"})'
      },
      {arg: 'options', type: 'object', http: 'optionsFromRequest'}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'get', path: '/owner'}
  });

  Order.remoteMethod('getOwnerCount', {
    description: '获取总数',
    accepts: [{arg: 'where', type: 'object', description: 'Criteria to match model instances'},
      {arg: 'options', type: 'object', http: 'optionsFromRequest'}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/owner/count'}
  });

  Order.remoteMethod('refund', {
    description: '订单退款',
    accessType: 'READ',
    accepts: [
      {arg: 'id', type: 'string', required: true, description: '订单id'},
      {arg: 'reason', type: 'string', required: true, description: '退款理由'},
      {arg: 'price', type: 'number', description: '退款金额，可选（单位：元）'},
      {arg: 'options', type: 'object', http: 'optionsFromRequest'}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'post', path: '/:id/refund'},
  });

  Order.remoteMethod('finishRefund', {
    description: '订单退款回掉',
    accessType: 'READ',
    accepts: [
      {arg: 'orderId', type: 'string', required: true, description: '订单id'}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'post', path: '/:id/finishRefund'},
  });

  Order.remoteMethod('finishPay', {
    description: '订单支付回掉',
    accessType: 'READ',
    accepts: [
      {arg: 'orderId', type: 'string', required: true, description: '订单id'}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'post', path: '/:id/finishPay'},
  });

  Order.remoteMethod('fahuoOrder', {
    description: '订单发货',
    accessType: 'READ',
    accepts: [
      {arg: 'orderId', type: 'string', required: true, description: '订单id'},
      {arg: 'expressNo', type: 'string', required: true, description: '快递信息id'},
      {arg: 'company', type: 'string', required: true, description: '快递公司'}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'post', path: '/:id/fahuoOrder'},
  });

  Order.remoteMethod('getAll', {
    description: '获取所有订单',
    accepts: [
      {arg: 'filter', type: 'object'}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'get', path: '/all'},
  });

  Order.remoteMethod('newCount', {
    description: '获取订单数量',
    accepts: [
      {arg: 'where', type: 'object'}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'get', path: '/count'},
  });

  Order.remoteMethod('getLogisticsDetail', {
    description: '获取物流信息',
    accepts: [
      {arg: 'id', type: 'string', required: true}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'get', path: '/getLogisticsDetail'},
  });

  Order.remoteMethod('getFahuo', {
    description: '下载订单',
    accepts: [
      {arg: 'filter', type: 'object'},
      {arg: 'req', type: 'object', http: {source: 'req'}},
      {arg: 'res', type: 'object', http: {source: 'res'}}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'get', path: '/getFahuo'},
  });

  Order.remoteMethod('cancelFahuo', {
    description: '取消发货',
    accepts: [
      {arg: 'id', type: 'string', required: true}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'post', path: '/cancelFahuo'},
  });

  Order.remoteMethod('reFahuo', {
    description: '取消发货后重新发货',
    accepts: [
      {arg: 'id', type: 'string', required: true},
      {arg: 'addressId', type: 'string', required: true}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'post', path: '/reFahuo'},
  });

  Order.remoteMethod('fahuoByAdmin', {
    description: '手动通知发网发货',
    accepts: [
      {arg: 'id', type: 'string', required: true}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'post', path: '/fahuoByAdmin'},
  });
};
