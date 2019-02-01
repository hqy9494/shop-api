'use strict';

const _ = require('lodash');
const PromiseA = require('bluebird');

module.exports = function (app, done) {
  const dataSources = _(app.datasources).values().uniq().value();
  PromiseA.each(dataSources, ds => ds.autoupdate && ds.autoupdate()).then(async () => {
    initFixtures(app);
    await checkDrawSetting(app);
    await checkLPTeamSetting(app);
    await app.models.LPSetting.createDefaultSetting();
  }).asCallback(done);
};

function initFixtures(app) {
  if (app.enabled('skipInitFixtures')) {
    return;
  }
  const {Account, Role, RoleMapping, Product} = app.models;
  return PromiseA.all([
    PromiseA.fromCallback(cb => Role.upsertWithWhere({name: 'admin'}, {name: 'admin', description: '系统管理员'}, cb)),
    _findOrCreate(Account, {where: {username: 'admin'}}, {
      username: 'admin',
      fullname: 'Administrator',
      password: 'mmp0ss'
    }),
    PromiseA.fromCallback(cb => Role.upsertWithWhere({name: 'user'}, {name: 'user', description: '注册用户'}, cb)),
    PromiseA.fromCallback(cb => Product.upsertWithWhere({name: '幸运盒子'}, {name: '幸运盒子', price: 3000}, cb))
  ]).then(async ([adminRole, adminUser, userRole, product]) => {
    app.roleUser = userRole;
    app.roleAdmin = adminRole;
    app.box_product = product;
    let roleMapping = await RoleMapping.findOne({
      where: {
        principalType: app.models.RoleMapping.USER,
        principalId: adminUser[0].id,
        roleId: adminRole.id
      }
    });
    if (!roleMapping)
      await adminRole.principals.create({principalType: RoleMapping.USER, principalId: adminUser[0].id});

    return;
  });
}

async function checkDrawSetting(app) {
  let setting = await app.models.DrawSetting.findOne();
  if (!setting) {
    app.drawSetting = await app.models.DrawSetting.create({
      drawCrystal: 100,
      drawLuckyPoint: 1,
      buyCrystal: 300
    })
  } else {
    app.drawSetting = setting
  }
}

// 组队活动配置
async function checkLPTeamSetting(app) {
  let setting = await app.models.LPSetting.findOne();
  if (!setting) {
    await app.models.LPSetting.create({});
    let user = await app.models.Account.findOne();
    let userT = await app.models.Account.findOne({where: {id: {neq: user.id}}});
    await app.models.LPTeam.create({
      leaderId: user.id,
      memberList: [user.id, userT.id],
      support: 5,
      againstTeamId: "test",
      enable: true
    })
  }
}

// find or create use loopback style to avoid use OptimizedFindOrCreate
function _findOrCreate(Model, query, data, options) {
  return Model.findOne(query, options).then(record => {
    if (record) return [record, false];
    return Model.create(data, options).then(record => {
      return [record, !_.isNil(record)];
    });
  });
}
