'use strict';

const farmhash = require('farmhash');
const g = require('strong-globalize')();

module.exports = function (BookCard) {
  // 兑换读书卡
  BookCard.getCard = async function (drawRecordId, options) {
    let userId = options.accessToken.userId;
    let drawRecord = await BookCard.app.models.DrawRecord.findById(drawRecordId);
    if (!drawRecord || drawRecord.prizeType !== BookCard.app.models.DrawSetting.TYPE_BOOK_CARD) {
      const err = new Error(g.f('中奖不存在或中奖非读书卡'));
      err.statusCode = 400;
      throw err;
    }
    let bookcard = await BookCard.findOne({where: {enable: true}});
    bookcard.updateAttributes({
      enable: false,
      userId: userId
    });
    return bookcard
  };

  BookCard.getAll = async function (filter) {
    filter = filter || {};
    filter.where = filter.where || {};
    filter.limit = filter.limit || 30;
    return BookCard.find(filter)
  };

  BookCard.getMy = async function (filter, options) {
    let userId = options.accessToken.userId;
    filter = filter || {};
    filter.where = filter.where || {};
    filter.where.userId = userId;
    filter.limit = filter.limit || 30;
    return BookCard.find(filter)
  };

  BookCard.remoteMethod('getCard', {
    description: '兑换读书卡',
    accepts: [
      {arg: 'drawRecordId', type: 'string', required: true, description: "中奖记录id"},
      {arg: 'options', type: 'object', http: 'optionsFromRequest'}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'get', path: '/getCard'},
  });

  BookCard.remoteMethod('getMy', {
    description: '获取我的读书卡',
    accepts: [
      {arg: 'filter', type: 'object'},
      {arg: 'options', type: 'object', http: 'optionsFromRequest'}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'get', path: '/getMy'},
  });

  BookCard.remoteMethod('getAll', {
    description: '获取读书卡',
    accepts: [
      {arg: 'filter', type: 'object'}
    ],
    returns: {arg: 'data', type: 'array', root: true},
    http: {verb: 'get', path: '/'},
  });
};
