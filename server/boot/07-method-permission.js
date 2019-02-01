// 'use strict';
//
// const _ = require('lodash');
// var LoopBackContext = require('loopback-context');
// const debug = require('debug')("common:method-permission");
// const permissionWhitelist = require('../permission-whitelist.json');
//
// module.exports = function (app) {
//   _.forIn(app.models, function (model, key) {
//     let methods = model.sharedClass
//       .methods()
//       .reduce((result, sharedMethod) => {
//         result.push(sharedMethod.name);
//         return result;
//       }, []);
//
//     console.log(key);
//     console.log(methods)
//
//     for (let i = 0; i < methods.length; i++) {
//       model.beforeRemote(methods[i], function (ctx, _modelInstance_, next) {
//         if (notInWhitelist(ctx.method.sharedClass.name + '.' + ctx.method.name)) {
//           checkPermission(ctx.method.sharedClass.name, ctx.method.name, ctx, next)
//         } else {
//           return next()
//         }
//       })
//     }
//   });
  //
  // // 白名单方法不予校验
  // function notInWhitelist(methodName) {
  //   return _.indexOf(permissionWhitelist.methods, methodName) === -1
  // }
  //
  // function checkPermission(modelName, methodName, ctx, next) {
  //   if (ctx.req.accessToken) {
  //     app.models.RoleMapping.find({where: {principalId: ctx.req.accessToken.userId}}, function (err, roles) {
  //       if (err) {
  //         return next(err)
  //       }
  //       if (roles.length === 0) {
  //         return next(new Error('No role with this access token was found.'));
  //       }
  //
  //       let roleIds = roles.map(v => {return v.roleId});
  //
  //       // admin用户id
  //       if (roleIds[0] === permissionWhitelist.adminId) {
  //         return next();
  //       }
  //
  //       app.models.Permission.find({where: {modelName, methodName, roleId: {inq: roleIds}, enable: true}}, function (err, permission) {
  //         if (err) {
  //           return next(err)
  //         }
  //
  //         if (permission.length === 0) {
  //           return next(new Error('无权限'));
  //         }
  //
  //         return next()
  //       });
  //     });
  //   } else {
  //     return next(new Error('access token was not found'));
  //   }
  // }
// };
