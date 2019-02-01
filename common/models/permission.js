'use strict';
const debug = require('debug')('common:models');
const g = require('strong-globalize')();
const PromiseA = require('bluebird');
const _ = require('lodash');
const errs = require('errs');
const whitelist = require('../../server/permission-whitelist.json');

module.exports = function (Permission) {
  Permission.createPermissions = async function (data) {
    const { roleName, acls } = data;
    if (!Array.isArray(acls)) {
      throw errs.create({
        code: 'INVALID_PARAMETERS',
        status: 404,
        statusCode: 404,
        message: 'data参数类型错误'
      });
    }

    for (let i = 0; i < acls.length; i++) {
      await Permission.app.models.ACL.upsertWithWhere(
        {principalId: roleName, model: acls[i]['model'], property: acls[i]['property']},
        {
          principalId: roleName,
          model: acls[i]['model'],
          property: acls[i]['property'],
          principalType: "ROLE",
          accessType: "*",
          permission: acls[i]['permission'] === 'ALLOW' ? 'ALLOW' : 'DENY'
        }
        )
    }
  };

  Permission.getMethods = async function () {
    let result = [];
    _.forIn(Permission.app.models, function (model, key) {
      if (_.indexOf(whitelist, key) === -1) {
        let methods = model.sharedClass
          .methods()
          .reduce((result, sharedMethod) => {
            result.push({name: sharedMethod.name, description: sharedMethod.description});
            return result;
          }, []);

        result.push({
          model: key,
          methods
        });
      }
    });

    return result
  };

  function filePermission(permissions) {
    let result = [];
    let models = _.uniq(permissions.map(v => {return v.model}));
    for (let i = 0; i < models.length; i ++) {
      result.push({
        model: models[i],
        methods: _.compact(permissions.map(v => {return v.model === models[i] && v}))
      })
    }
    return result
  }

  Permission.getAccessMethodsByRole = async function (roleName) {
    let permissions = await Permission.app.models.ACL.find({where: {principalId: roleName, permission: "ALLOW"}});
    return filePermission(permissions);
  };

  Permission.getRolesByAccessMethod = async function (model, methodName) {
    let permissions = await Permission.app.models.ACL.find({where: {model, property: methodName, permission: "ALLOW"}});
    let roleNames = permissions.map(v => {return v.principalId});
    return await Permission.app.models.Role.find({where: {name: {inq: roleNames}}})
  };

  Permission.remoteMethod('createPermissions', {
    description: '权限控制',
    accessType: 'WRITE',
    accepts: [{arg: 'data', type: 'object', required: true, http: {source: 'body'}, description: "data: {roleName, acls: [{model: 'User', property: 'getUser', permission: 'ALLOW || DENY'}, {...}]}, menus为菜单数组 "}],
    returns: {arg: 'result', type: 'array', root: true},
    http: {verb: 'post', path: '/set'}
  });

  Permission.remoteMethod('getMethods', {
    description: '获取全部接口',
    accessType: 'READ',
    accepts: [],
    returns: {arg: 'result', type: 'array', root: true},
    http: {verb: 'get', path: '/methods'}
  });

  Permission.remoteMethod('getRolesByAccessMethod', {
    description: '获取某个接口有权限访问的角色',
    accessType: 'READ',
    accepts: [
      {arg: 'model', type: 'string', required: true, description: ""},
      {arg: 'methodName', type: 'string', required: true, description: ""}
    ],
    returns: {arg: 'result', type: 'array', root: true},
    http: {verb: 'get', path: '/methods/allRoles'}
  });

  Permission.remoteMethod('getAccessMethodsByRole', {
    description: '获取某个角色有权限的接口',
    accessType: 'READ',
    accepts: [
      {arg: 'roleName', type: 'string', required: true, http: {source: 'path'}, description: ""}
    ],
    returns: {arg: 'result', type: 'array', root: true},
    http: {verb: 'get', path: '/methods/:roleName/allow'}
  });
};


