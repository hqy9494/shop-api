'use strict';
const farmhash = require('farmhash');
const g = require('strong-globalize')();

module.exports = function (Logistics) {

  Logistics.getLogisticsDetails = async function (orderId) {
    return await Logistics.findOne({where: {orderId}});
  };

  Logistics.updateLogistics = async function (orderId, data) {
    let { company, no } = data;
    if (!company || !no) {
      const err = new Error(g.f('参数缺失'));
      err.statusCode = 404;
      throw err;
    }
    let logistics = await Logistics.findOne({where: {orderId}});
    return logistics && logistics.updateAttributes({
      company,
      no,
      lastFetchTime: null,
      state: 0,
      details: []
    })
  };

  Logistics.remoteMethod('getLogisticsDetails', {
    description: '查询',
    accessType: 'READ',
    accepts: [
      {arg: 'orderId', type: 'string', required: true}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/'},
  });

  Logistics.remoteMethod('updateLogistics', {
    description: '更改物流状态',
    accessType: 'READ',
    accepts: [
      {arg: 'orderId', type: 'string', required: true, http: {source: 'path'}},
      {arg: 'data', type: 'object', description: 'company, no'}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'put', path: '/:orderId'},
  });
};
