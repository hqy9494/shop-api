'use strict';
const errs = require('errs');
const moment = require('moment');

module.exports = function (Track) {

  // 增加pv
  Track.addPV = async function () {
    const date = moment().format("YYYY-MM-DD");
    let track = await Track.findOne({where: {date}});
    if (!track) {
      await Track.create({
        date,
        pv:1,
        uv:1
      })
    } else {
      await track.updateAttributes({
        pv: track.pv + 1
      })
    }
  };

  // 增加uv
  Track.addUV = async function () {
    const date = moment().format("YYYY-MM-DD");
    let track = await Track.findOne({where: {date}});
    if (!track) {
      await Track.create({
        date,
        pv:1,
        uv:1
      })
    } else {
      await track.updateAttributes({
        pv: track.pv + 1,
        uv: track.uv + 1
      })
    }
  };

  Track.remoteMethod('addPV', {
    description: '增加pv',
    accessType: 'READ',
    accepts: [
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/addPV'},
  });

  Track.remoteMethod('addUV', {
    description: '增加uv',
    accessType: 'READ',
    accepts: [],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/addUV'},
  })
};
