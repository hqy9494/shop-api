'use strict';
const debug = require('debug')('common:models');
const g = require('strong-globalize')();
const PromiseA = require('bluebird');
const errs = require('errs');

module.exports = function (RoleMenu) {
  async function menusToJson(menus, id) {
    id = id || "1";
    let selectMenus = [];
    for (let i = 0; i < menus.length; i++) {
      if (menus[i].preMenuId === id) {
        let children = await menusToJson(menus, menus[i]["id"]);
        selectMenus.push(Object.assign({}, menus[i].__data, {children}))
      }
    }
    return selectMenus
  }

  RoleMenu.menusToJson = menusToJson;

  RoleMenu.getMyMenu = async function (options) {
    let roleMapping = await RoleMenu.app.models.RoleMapping.find({where: {principalId: options.accessToken.userId}});
    let roleIds = roleMapping.map(v => {return v.roleId});
    let roleMenus = await RoleMenu.find({where: {roleId: {inq: roleIds}, enable: true}});
    let menuIds = roleMenus.map(v => {return v.menuId});
    let menus = await RoleMenu.app.models.Menu.find({where: {id: {inq: menuIds}}, order: 'sort ASC'});
    return await menusToJson(menus)
  };

  RoleMenu.getMenusByRoleId = async function (roleId) {
    let roleIds = [roleId];
    let roleMenus = await RoleMenu.find({where: {roleId: {inq: roleIds}, enable: true}});
    let menuIds = roleMenus.map(v => {return v.menuId});
    let menus = await RoleMenu.app.models.Menu.find({where: {id: {inq: menuIds}}, order: 'sort ASC'});
    return await menusToJson(menus)
  };

  RoleMenu.setMenuOfRole = async function (data) {
    let {roleId, menus} = data;
    if (!Array.isArray(menus)) {
      throw errs.create({
        code: 'INVALID_PARAMETERS',
        status: 404,
        statusCode: 404,
        message: '参数类型错误'
      });
    }
    for (let i = 0; i < menus.length; i++) {
      await RoleMenu.upsertWithWhere({roleId, menuId: menus[i]['id']}, {roleId, menuId: menus[i]['id'], enable: menus[i]['enable']})
    }
    return {success: true}
  };

  RoleMenu.getRolesByMenuId = async function (menuId) {
    let roleMenus = await RoleMenu.find({where: {menuId}});
    let roleIds = roleMenus.map(v => {return v.roleId});
    return await RoleMenu.app.models.Role.find({where: {id: {inq: roleIds}}})
  };

  RoleMenu.getAllRole = async function () {
    return await RoleMenu.app.models.Role.find()
  };

  RoleMenu.getUsersByRoleId = async function (roleId, skip, limit) {
    let skipAndLimit = RoleMenu.skipAndLimit(skip, limit);
    let roleMappings = await RoleMenu.app.models.RoleMapping.find({where: {roleId}, limit: skipAndLimit.limit, skip: skipAndLimit.skip})
    let userIds = roleMappings.map(v => {return v.principalId});
    return await RoleMenu.app.models.Account.find({where: {id: {inq: userIds}}})
  };

  RoleMenu.updateRole = async function (roleId, data) {
    const {name, description} = data;
    let role = await RoleMenu.app.models.Role.findById(roleId);
    return await role.updateAttributes({name, description})
  };

  RoleMenu.remoteMethod('getMyMenu', {
    description: '获取个人菜单',
    accessType: 'READ',
    accepts: [{arg: 'options', type: 'object', http: 'optionsFromRequest'}],
    returns: {arg: 'result', type: 'array', root: true},
    http: {verb: 'get', path: '/'}
  });

  RoleMenu.remoteMethod('setMenuOfRole', {
    description: '设置某个角色菜单',
    accessType: 'WRITE',
    accepts: [{arg: 'data', type: 'object', required: true, http: {source: 'body'}, description: "data: {roleId, menus: [{id: 'xxx', enable: false}, {...}]}, menus为菜单数组 "}],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'post', path: '/'}
  });

  RoleMenu.remoteMethod('getAllRole', {
    description: '获取所有角色',
    accessType: 'READ',
    accepts: [],
    returns: {arg: 'result', type: 'array', root: true},
    http: {verb: 'get', path: '/roles'}
  });

  RoleMenu.remoteMethod('getRolesByMenuId', {
    description: '获取某个菜单可访问的角色',
    accessType: 'READ',
    accepts: [{arg: 'menuId', type: 'string', http: {source: 'path'}, description: '菜单id'}],
    returns: {arg: 'result', type: 'array', root: true},
    http: {verb: 'get', path: '/menu/:menuId'}
  });

  RoleMenu.remoteMethod('getUsersByRoleId', {
    description: '获取某个角色所含用户',
    accessType: 'READ',
    accepts: [
      {arg: 'roleId', type: 'string', http: {source: 'path'}, description: '角色id'},
      {arg: 'skip', type: 'string', description: ''},
      {arg: 'limit', type: 'string', description: ''}],
    returns: {arg: 'result', type: 'array', root: true},
    http: {verb: 'get', path: '/users/:roleId'}
  });

  RoleMenu.remoteMethod('getMenusByRoleId', {
    description: '获取某个角色的菜单',
    accessType: 'READ',
    accepts: [{arg: 'roleId', type: 'string', http: {source: 'path'}, description: '角色id'}],
    returns: {arg: 'result', type: 'array', root: true},
    http: {verb: 'get', path: '/:roleId'}
  });

  RoleMenu.remoteMethod('updateRole', {
    description: '修改角色',
    accessType: 'WRITE',
    accepts: [
      {arg: 'roleId', type: 'string', required: true, http: {source: 'path'}},
      {arg: 'data', type: 'object', required: true, http: {source: 'body'}, description: 'name, description'}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'put', path: '/role/:roleId'}
  });
};
