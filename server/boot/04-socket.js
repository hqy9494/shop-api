'use strict';
const socket = require('socket.io');
const debug = require('debug')("common:socket");
const socketioAuth = require('socketio-auth');

module.exports = function (app) {
  setTimeout(function () {
    const io = socket(app.server);
    app.io = io;
    // TODO 开启io验证
    socketioAuth(io, {
      authenticate: function (socketio, data, cb) {
        debug('socket authenticate: ', JSON.stringify(data));
        const token = data.token;
        app.models.AccessToken.resolve(token, function (err, t) {
          if (err) return cb(err);
          if (!t) return cb(new Error("Token not found"));
          debug('socket connect:', token);
          return cb(null, t);
        });
      }
    });
    app.publishIO = {};

    app.publishIO.orderPayment = function (orderId) {
      debug(`Order ${orderId} progress published`);
      io.emit(`/order/${orderId}/payed`, {orderId, payed: true});
    };


    app.publishIO.orderComplete = function (orderId) {
      debug(`order complete`);
      io.emit(`/order/${orderId}/complete`, {
        orderId: orderId,
        completed: true
      });
    };
  }, 3 * 1000);

};
