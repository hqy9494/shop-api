'use strict';

const PromiseA = require('bluebird');
const errs = require('errs');
const moment = require('moment');
const debug = require('debug')('luckydraw:jackpot');

module.exports = function (TaobaoCoupon) {

  // TaobaoCoupon.getMyCoupon = async function (options) {
  //
  //   let taobaoCouponUsers = await TaobaoCoupon.app.models.TaobaoCouponRecord.find({
  //     where: {
  //       userId: options.accessToken.userId,
  //       endTime: {gt: moment().toDate()}
  //     }
  //   });
  //
  //   return TaobaoCoupon.find({
  //     where: {
  //       id: {
  //         inq: taobaoCouponUsers.map(t => {
  //           return t.taobaoCouponId;
  //         })
  //       },
  //       endTime: {
  //         gt: moment().toDate()
  //       }
  //     }
  //   });
  // };

  TaobaoCoupon.prototype.formatTime = function () {
    let tc = this;
    tc.startTimeString = moment(tc.startTime).format('YYYY.MM.DD');
    tc.endTimeString = moment(tc.endTime).format('YYYY.MM.DD');
  };

  TaobaoCoupon.get = async function (id) {
    let tc = await TaobaoCoupon.findById(id);
    tc.formatTime();
    return tc;
  };

  TaobaoCoupon.getTaobaoCouponsByValue = async function (value) {
    return await TaobaoCoupon.find({where: {
      value: value,
      endTime: {
        gt: moment().toDate()
      }
    }})
  };

  // TaobaoCoupon.remoteMethod('getMyCoupon', {
  //   description: '获取我的优惠券',
  //   accessType: 'READ',
  //   accepts: [
  //     {arg: 'options', type: 'object', http: 'optionsFromRequest'}
  //   ],
  //   returns: {arg: 'result', type: 'object', root: true},
  //   http: {verb: 'get', path: '/my'},
  // });

  TaobaoCoupon.remoteMethod('getTaobaoCouponsByValue', {
    description: '获取优惠券',
    accessType: 'READ',
    accepts: [
      {arg: 'value', type: 'number'}
    ],
    returns: {arg: 'result', type: 'array', root: true},
    http: {verb: 'get', path: '/byValue'},
  });

  TaobaoCoupon.remoteMethod('get', {
    description: '获取优惠券 by id',
    accessType: 'READ',
    accepts: [
      {arg: 'id', type: 'string', http: {source: 'path'}}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/:id'},
  });
};
