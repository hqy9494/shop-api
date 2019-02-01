'use strict';
const farmhash = require('farmhash');
const g = require('strong-globalize')();
const xlsx = require('node-xlsx').default;
const moment = require('moment');

module.exports = function(DrawRecord) {
  // 抽奖
  DrawRecord.draw = async function (req, options) {
    let userId = options.accessToken.userId;
    let setting = await DrawRecord.app.models.DrawSetting.findOne();
    let crystal = await DrawRecord.app.models.Crystal.findOne({where: {userId}});
    if (!crystal) {
      const err = new Error(g.f('水晶数量不足'));
      err.statusCode = 400;
      throw err;
    }
    if (crystal.count < setting.drawCrystal) {
      const err = new Error(g.f('水晶数量不足'));
      err.statusCode = 400;
      throw err;
    }

    let currentList = setting.currentList;
    let defaultList = setting.defaultList;

    const tx = await DrawRecord.beginTransaction({isolationLevel: 'READ COMMITTED', timeout: 15000});
    let lock = await DrawRecord.app.lock(`box:shopping:online:draw`);

    try {
      if (currentList.length === 0) {
        // 开始新的轮次
        currentList = [];
        for (let i = 0; i < setting.defaultList.length; i++) {
          for (let j = 0; j < setting.defaultList[i].count; j ++) {
            currentList.push(setting.defaultList[i])
          }
        }
        await setting.updateAttributes({
          currentNo: setting.currentNo + 1
        }, {transaction: tx})
      }

      let luckyNum = parseInt(Math.random() * currentList.length);
      let prize = currentList[luckyNum];

      // 奖处理
      let handle = await DrawRecord.app.drawHandle.prizeHandle(prize, defaultList, tx, {req, options});
      prize = handle.prize || prize;
      defaultList = handle.defaultList || defaultList;

      // 删除奖池中 中奖的奖品
      currentList.splice(luckyNum, 1);

      await setting.updateAttributes({
        currentList: currentList,
        defaultList: defaultList
      }, {transaction: tx});

      // 核销水晶
      await DrawRecord.app.models.Crystal.subtract(setting.drawCrystal, userId, true, tx);

      let result = DrawRecord.create({
        prizeType: prize.type,
        batchNo: setting.currentNo,
        prizeValue: prize.value,
        prizeName: prize.name,
        prizeCost: prize.cost,
        prizePicture: prize.picture,
        userId: userId
      }, {transaction: tx});

      await tx.commit();

      return result
    } catch (e) {
      await tx.rollback();
      throw e;
    } finally {
      await lock.unlock();
    }
    return null;
  };

  // 获取我的中奖记录
  DrawRecord.getMy = async function (filter, options) {
    let userId = options.accessToken.userId;
    filter = filter || {};
    filter.where = filter.where || {};
    filter.where.userId = userId;
    return DrawRecord.find(filter)
  };

  // 获取中奖记录
  DrawRecord.getAll = async function (filter) {
    filter = filter || {};
    filter.where = filter.where || {};
    filter.limit = filter.limit || 20;
    let records = await DrawRecord.find(filter);
    for (let i = 0; i < records.length; i++) {
      records[i].address = records[i].addressId && await DrawRecord.app.models.Address.findById(records[i].addressId);
      records[i].account = records[i].userId && await DrawRecord.app.models.Account.findById(records[i].userId);
    }
    return records
  };

  // 导出中奖记录
  DrawRecord.getALLEXCEL = async function (filter, req, res) {
    filter = filter || {};
    filter.where = filter.where || {};
    filter.limit = filter.limit || 10000;
    let records = await DrawRecord.find(filter);
    for (let i = 0; i < records.length; i++) {
      records[i].address = records[i].addressId && await DrawRecord.app.models.Address.findById(records[i].addressId);
      records[i].account = records[i].userId && await DrawRecord.app.models.Account.findById(records[i].userId);
    }

    let data = [["奖品名称", "奖品金额", "奖品类型", "中奖粉丝", "收货人名称", "号码", "地址"]];
    records.map(v => {
      data.push([
        v.prizeName,
        v.prizeValue,
        v.prizeType,
        v.account && v.account.nickname,
        v.address && v.address.userName,
        v.address && v.address.telNumber,
        v.address && (v.address.provinceName + (v.address.cityName || "") + (v.address.countryName || "") + (v.address.districtName || "") + v.address.detailInfo),
      ])
    });

    let xxx = xlsx.build([{name: "mySheetName", data: data}]);
    res.setHeader('Pragma', 'public');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Description', 'File Transfer');
    res.setHeader('Content-Disposition', `attachment;filename=${Date.now()}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; charset=utf-8');
    res.send(xxx);
  };


  // 实物奖添加地址
  DrawRecord.addAddress = async function (id, addressId, options) {
    let userId = options.accessToken.userId;
    let record = await DrawRecord.findById(id);
    if (record.userId !== userId) {
      const err = new Error(g.f('权限错误'));
      err.statusCode = 401;
      throw err;
    }
    return record.updateAttributes({
      addressId
    })
  };

  // 实物奖发货
  DrawRecord.fahuo = async function (recordId, expressNo, company) {
    let record = await DrawRecord.findById(recordId);

    if (record.prizeType !== DrawRecord.app.models.DrawSetting.TYPE_METARIAL) {
      const err = new Error(g.f('奖品非实物奖'));
      err.statusCode = 400;
      throw err;
    }

    await DrawRecord.app.models.Logistics.create({
      id: `drawRecord_${recordId}`,
      orderId: recordId,
      company,
      no: expressNo
    });

    return record.updateAttributes({expressNo, isChecked: true});
  };

  // 获取物流
  DrawRecord.getLogisticsDetail = async function (id) {
    let record = await DrawRecord.findById(id);
    if (!record.expressNo) {
      return {record}
    }
    let logistics = await DrawRecord.app.models.Logistics.findById(`drawRecord_${id}`);
    if (!logistics) {
      return {record}
    }
    if (logistics.state !== 4) {
      if (!logistics.lastFetchTime || (moment(logistics.lastFetchTime).add(DrawRecord.app.get('LogisticsInterval'), 'hour').isBefore(moment()))) {
        let details = await DrawRecord.app.getOldLogisticsDetails(logistics.company, logistics.no);
        logistics = await logistics.updateAttributes({
          details: details.Traces,
          state: details.State,
          lastFetchTime: moment().toDate()
        });
      }
    }
    return {record, logistics};
  };

  DrawRecord.remoteMethod('draw', {
    description: '抽奖',
    accepts: [
      {arg: 'req', type: 'object', 'http': {source: 'req'}},
      {arg: 'options', type: 'object', http: 'optionsFromRequest'}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'post', path: '/draw'},
  });

  DrawRecord.remoteMethod('getMy', {
    description: '获取我的中奖记录(前台)',
    accepts: [
      {arg: 'filter', type: 'object'},
      {arg: 'options', type: 'object', http: 'optionsFromRequest'}
    ],
    returns: {arg: 'data', type: 'array', root: true},
    http: {verb: 'get', path: '/my'},
  });

  DrawRecord.remoteMethod('getAll', {
    description: '获取全部中奖记录(后台)',
    accepts: [
      {arg: 'filter', type: 'object'}
    ],
    returns: {arg: 'data', type: 'array', root: true},
    http: {verb: 'get', path: '/all'},
  });

  DrawRecord.remoteMethod('addAddress', {
    description: '实物奖绑定地址',
    accepts: [
      {arg: 'id', type: 'string', required: true, description: "中奖记录id"},
      {arg: 'addressId', type: 'string', required: true, description: "地址id"},
      {arg: 'options', type: 'object', http: 'optionsFromRequest'}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'post', path: '/addAddress'},
  });

  DrawRecord.remoteMethod('fahuo', {
    description: '中实物奖发货',
    accessType: 'READ',
    accepts: [
      {arg: 'recordId', type: 'string', required: true, description: '订单id'},
      {arg: 'expressNo', type: 'string', required: true, description: '快递信息id'},
      {arg: 'company', type: 'string', required: true, description: '快递公司'}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'post', path: '/fahuo'},
  });

  DrawRecord.remoteMethod('getLogisticsDetail', {
    description: '获取物流信息',
    accepts: [
      {arg: 'id', type: 'string', required: true}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'get', path: '/getLogisticsDetail'},
  });

  DrawRecord.remoteMethod('getALLEXCEL', {
    description: '下载excel',
    accepts: [
      {arg: 'filter', type: 'object'},
      {arg: 'req', type: 'object', http: {source: 'req'}},
      {arg: 'res', type: 'object', http: {source: 'res'}}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'get', path: '/getALLEXCEL'},
  });
};
