'use strict';

const moment = require('moment');
const debug = require('debug')('common:transaction');
const errs = require('errs');
const PromiseA = require('bluebird');
const shortid = require('shortid');

module.exports = function (app) {

  let txNums = 0;
  let waitings = [];

  let transactionChecking = false;

  let transactionLockId = shortid.generate();

  async function transactionCheck() {
    if (transactionChecking) {
      return;
    }
    transactionChecking = true;

    let waitingsLeft = [];

    await app.redlock.lock(`app:transaction:${transactionLockId}`, 5 * 1000).then(async lock => {
      try {
        for (let i = 0; i < waitings.length; i++) {
          let waiting = waitings[i];
          if (txNums < app.get('maxTransaction')) {
            let tx = await createTransaction(waiting.Model, waiting.tag);
            waiting.resolve(tx);
          } else {
            let start = moment(waiting.start).add(waiting.timeout || app.get('beginTransactionMaxWait'), 'milliseconds');
            let time = moment();
            if (time.isAfter(start)) {
              debug(`${waiting.tag} waiting transaction timeout`);
              waiting.reject(
                errs.create({
                  code: 'SYSTEM_BUSY',
                  status: 420,
                  statusCode: 420,
                  message: `Cant not begin tranaction ${waiting.tag},too busy`
                })
              );
            } else {
              waitingsLeft.push(waiting);
            }
          }
        }
        waitings = waitingsLeft;
        if (waitings.length == 0) {
          clearInterval(app.transactionInterval);
          app.transactionInterval = null;
        }
      } catch (e) {
        throw e;
      } finally {
        lock.unlock()
      }
    });
    transactionChecking = false;
    return;
  }

  async function createTransaction(Model, tag) {
    txNums++;
    let tx = await Model.beginTransaction({timeout: 15 * 1000});
    debug(`${tag} Begin Transaction ${tx.id} ${moment().format('YYYYMMDDHHmmss')}`);
    return {
      tx: tx,
      commit: async function () {
        debug(`${tag} transaction ${tx.id} start to commit `);
        const result = await PromiseA.fromCallback(cb => tx.commit(cb));
        txNums--;
        debug(`${tag} transaction ${tx.id} finish commit `);
        return result;
      },
      rollback: async function () {

        debug(`${tag} transaction ${tx.id} exception`);
        const result = await PromiseA.fromCallback(cb => tx.rollback(cb));
        txNums--;
        return result;
      },
      close: async function () {

      }
    }
  }


  app.beginTransaction = async function (Model, tag, timeout) {
    try {
      if (txNums >= app.get('maxTransaction') || waitings.length > 0) {
        let promise = new PromiseA(function (resolve, reject) {
          waitings.push({
            id: shortid.generate(),
            Model,
            tag,
            timeout,
            resolve,
            reject,
            start: new Date()
          });
        });
        if (!app.transactionInterval) {
          app.transactionInterval = setInterval(async function () {
            return await transactionCheck();
          }, 50);
        }
        return promise;

      } else {
        return await createTransaction(Model, tag);
      }
    } catch (e) {
      throw e;
    }
  }
};
