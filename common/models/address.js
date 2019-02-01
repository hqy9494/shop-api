'use strict';
const g = require('strong-globalize')();

module.exports = function (Address) {

  Address.addressMy = async function (options) {
    let userId = options.accessToken.userId;
    let addressData = await Address.find({
      where:{
        userId,
        enable: true
      }
    });
    return addressData;
  };

  Address.getAddressByOpenid = async function (openid) {
    let user = await Address.app.models.Account.findOne({where: {openid}});
    if (!user) {
      return []
    }
    let addressData = await Address.find({
      where:{
        userId: user.id,
        enable: true
      }
    });
    return addressData;
  };

  Address.getAddressById = async function (id, options) {
    return await Address.findById(id);
  };

  Address.updateAddress = async function (id, data, options) {
    let address = await Address.findById(id);
    let userId = options.accessToken.userId;
    if (address.userId !== userId) {
      const err = new Error(g.f('用户错误'));
      err.statusCode = 400;
      throw err;
    }
    return address.updateAttributes(data)
  };

  Address.updateAddressByAdmin = async function (id, data) {
    let address = await Address.findById(id);
    return address.updateAttributes(data)
  };

  Address.createAddressByAdmin = async function (userId, data) {
    let newAddressData = await Address.create({ ...data,
      userId
    });
    return newAddressData;
  };

  Address.addressCreateMy = async function (data, options) {
    let userId = options.accessToken.userId;
    let newAddressData = await Address.create({ ...data,
      userId
    });
    return newAddressData;
  };

  Address.getWechatSDK = async function (url) {
    let result = await Address.app.luckydraw.getWechatJSSDK({url: url});
    return result.data
  };

  Address.remoteMethod('addressMy', {
    description: '我的收货地址',
    accessType: 'READ',
    accepts: [{
      arg: 'options',
      type: 'object',
      http: 'optionsFromRequest'
    }],
    returns: {
      arg: 'result',
      type: 'object',
      root: true
    },
    http: {
      verb: 'get',
      path: '/my'
    },
  });

  Address.remoteMethod('addressCreateMy', {
    description: '新建我的收货地址',
    accessType: 'READ',
    accepts: [{
        arg: 'data',
        type: 'object',
        description: '参数：'
      },
      {
        arg: 'options',
        type: 'object',
        http: 'optionsFromRequest'
      }
    ],
    returns: {
      arg: 'result',
      type: 'object',
      root: true
    },
    http: {
      verb: 'post',
      path: '/create/my'
    },
  });

  Address.remoteMethod('getAddressById', {
    description: '获取地址',
    accepts: [
      {arg: 'id', type: 'string', required: true, http: {source: 'path'}}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'get', path: '/:id'},
  });

  Address.remoteMethod('updateAddress', {
    description: '修改地址',
    accepts: [
      {arg: 'id', type: 'string', required: true, http: {source: 'path'}},
      {arg: 'data', type: 'object', required: true, http: {source: 'body'}},
      {arg: 'options', type: 'object', http: 'optionsFromRequest'}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'put', path: '/:id'},
  });

  Address.remoteMethod('updateAddressByAdmin', {
    description: '修改地址(后台)',
    accepts: [
      {arg: 'id', type: 'string', required: true, http: {source: 'path'}},
      {arg: 'data', type: 'object', required: true, http: {source: 'body'}}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'put', path: '/:id/updateAddressByAdmin'},
  });

  Address.remoteMethod('createAddressByAdmin', {
    description: '创建地址(后台)',
    accepts: [
      {arg: 'userId', type: 'string', required: true},
      {arg: 'data', type: 'object', required: true, http: {source: 'body'}}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'post', path: '/createAddressByAdmin'},
  });

  Address.remoteMethod('getWechatSDK', {
    description: '获取jssdk',
    accepts: [
      {arg: 'url', type: 'string', required: true}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'get', path: '/getWechatSDK'},
  });
};
