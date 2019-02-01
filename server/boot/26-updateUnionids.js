const debug = require('debug')("shop-api:updateUnionids");

module.exports = function (app) {
  // 更新所有的unionid
  if (process.env.NODE_APP_INSTANCE === '0') {
    async function undateUnionids (app) {
      let skip = 0;
      let users = await app.models.Account.find({where: {openid: {neq: null}}, limit: 50, skip: skip, order: "createdAt ASC"});
      while (users.length > 0) {
        await app.models.Account.getUnionid(users);
        console.log('update user unionid', skip);
        skip = skip + 50;
        users = await app.models.Account.find({where: {openid: {neq: null}}, limit: 50, skip: skip, order: "createdAt ASC"});
      }
    }

    undateUnionids(app)
  }
};
