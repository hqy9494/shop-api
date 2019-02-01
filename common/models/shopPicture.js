'use strict';
const errs = require('errs');
const _ = require('lodash');
const xlsx = require('node-xlsx').default;
const path = require('path');
const g = require('strong-globalize')();

module.exports = function (ShopPicture) {
  ShopPicture.afterRemote('upload', async function(context, res, next) {
    const imageDomain = ShopPicture.app.get('domain');
    let pics = res.result && res.result.files && res.result.files[Object.keys(res.result.files)[0]];
    res.src = `${imageDomain}/static/${pics && pics[0] && pics[0].container}/${pics && pics[0] && pics[0].name}`;
    // 上传读书卡
    if (pics && pics[0] && pics[0].container == "bookCard") {
      const workSheetsFromBuffer = xlsx.parse(path.join(__dirname, `../../static/bookCard/${pics && pics[0] && pics[0].name}`));
      let data = workSheetsFromBuffer[0] && workSheetsFromBuffer[0].data || [];
      let firD = data[1] && await ShopPicture.app.models.BookCard.findOne({where: {code: data[1][0]}});
      if (!firD) {
        for (let i = 1; i < data.length; i++) {
          if (data[i]) {
            await ShopPicture.app.models.BookCard.create({
              code: data[i][0],
              value: data[i][1]
            })
          }
        }
      } else {
        const err = new Error(g.f('请勿重复上传'));
        err.statusCode = 400;
        throw err;
      }
    } else if (pics && pics[0] && pics[0].container == "express") {
      const workSheetsFromBuffer = xlsx.parse(path.join(__dirname, `../../static/express/${pics && pics[0] && pics[0].name}`));
      let data = workSheetsFromBuffer[0] && workSheetsFromBuffer[0].data || [];
      await ShopPicture.app.models.Order.refreshOrderExpressNo(data)
    }
  })
};
