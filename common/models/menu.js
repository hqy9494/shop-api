'use strict';
const debug = require('debug')('common:models');
const g = require('strong-globalize')();
const PromiseA = require('bluebird');
const errs = require('errs');

module.exports = function (Menu) {
  Menu.getFirstMenus = async function () {
    return await Menu.find({where: {preMenuId: "1"}, order: 'sort ASC'})
  };

  Menu.getChildMenus = async function (id) {
    return await Menu.find({where: {preMenuId: id, enable: true}, order: 'sort ASC'})
  };

  Menu.getMenuJson = async function () {
    let menus = await Menu.find({order: 'sort ASC'});
    return await Menu.app.models.RoleMenu.menusToJson(menus)
  };

  Menu.getById = async function (id) {
    return await Menu.findById(id)
  };

  Menu.updateById = async function (id, data) {
    const menu = await Menu.findById(id);
    if (!menu) {
      throw errs.create({
        code: 'MENU_NOT_FOUND',
        status: 400,
        statusCode: 400,
        message: '菜单不存在'
      });
    }
    return await menu.updateAttributes(data)
  };

  Menu.createMenu = async function (data) {
    let {name, eName, sort, preMenuId, enable, component, query} = data;
    if (!name || !eName || !sort || !component) {
      throw errs.create({
        code: 'INVALID_PARAMETERS',
        status: 400,
        statusCode: 400,
        message: '新建菜单参数不正确'
      });
    }
    if (preMenuId) {
      let pMenu = Menu.findOne({where: {id: preMenuId}});
      if (!pMenu) {
        throw errs.create({
          code: 'INVALID_PARAMETERS',
          status: 400,
          statusCode: 400,
          message: '前置菜单不存在'
        });
      }
    }
    return await Menu.create({name, eName, sort, preMenuId, enable, component, query})
  };

  Menu.remoteMethod('getFirstMenus', {
    description: '获取一级菜单',
    accessType: 'READ',
    accepts: [],
    returns: {arg: 'result', type: 'array', root: true},
    http: {verb: 'get', path: '/oneLevel'},
  });

  Menu.remoteMethod('getChildMenus', {
    description: '获取一个菜单下的子菜单',
    accessType: 'READ',
    accepts: [{arg: 'id', type: 'string', required: true, http: {source: 'path'}}],
    returns: {arg: 'result', type: 'array', root: true},
    http: {verb: 'get', path: '/:id/children'},
  });

  Menu.remoteMethod('getMenuJson', {
    description: '获取所有菜单json',
    accessType: 'READ',
    accepts: [],
    returns: {arg: 'result', type: 'array', root: true},
    http: {verb: 'get', path: '/all'},
  });

  Menu.remoteMethod('getById', {
    description: '获取菜单',
    accessType: 'READ',
    accepts: [{arg: 'id', type: 'string', required: true, http: {source: 'path'}}],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/:id'},
  });

  Menu.remoteMethod('updateById', {
    description: '修改菜单',
    accessType: 'WRITE',
    accepts: [
      {arg: 'id', type: 'string', required: true, description: '菜单id'},
      {arg: 'data', type: 'object', required: true, http: {source: 'body'}}
    ],
    returns: {
      arg: 'result', type: 'object', root: true
    },
    http: {verb: 'put', path: '/:id'}
  });

  Menu.remoteMethod('createMenu', {
    description: '创建菜单',
    accessType: 'WRITE',
    accepts: [
      {arg: 'data', type: 'object', required: true, http: {source: 'body'}, description: "data: {name, eName, sort, preMenuId, enable, component, query},(name, eName, sort, component必传)"}
    ],
    returns: {
      arg: 'result', type: 'object', root: true
    },
    http: {verb: 'post', path: '/'}
  });
};


