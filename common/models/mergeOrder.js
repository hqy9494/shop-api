'use strict';
const farmhash = require('farmhash');
const g = require('strong-globalize')();
const moment = require('moment');

module.exports = function (MergeOrder) {

  MergeOrder.ordersMergeAndFahuo = async function () {
    let date = moment().subtract(1, "day").format("YYYY-MM-DD");
    let sql = "select GROUP_CONCAT(x.id) as orderIds,count(x.id) as count,sum(x.total) as sum,x.addressId from `Order` as x where x.status='PAID' and " + `x.createdAt>="${moment(date).startOf('day').utc().format()}" and x.createdAt<="${moment(date).endOf('day').utc().format()}"` + " group by addressId";
    let result = await new Promise((resolve, reject) => {
      MergeOrder.dataSource.connector.query(sql, async function (err, d) {
        if (err) reject(err);
        return resolve(d);
      });
    });

    for (let i = 0; i < result.length; i++) {
      let mergeOrder = await MergeOrder.create({
        orderIds: result[i].orderIds,
        total: result[i].sum,
        addressId: result[i].addressId
      });
      MergeOrder.app.fineexWmsTradesAdd(mergeOrder);
    }

    return {}
  };

  MergeOrder.splitOrders = async function (mid, expressNo, company) {
    let mergeOrder = await MergeOrder.findOne({where: {id: mid}});
    if (!mergeOrder) {
      const err = new Error(g.f(`合并订单号${mid}不存在`));
      err.statusCode = 400;
      throw err;
    }

    await mergeOrder.updateAttributes({
      expressNo
    });

    let orderIds = mergeOrder.orderIds.split(',');
    for (let i = 0; i < orderIds.length; i++) {
      await MergeOrder.app.models.Order.fahuoOrder(orderIds[i], expressNo, company)
    }
  };
};
