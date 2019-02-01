'use strict';
const g = require('strong-globalize')();
const err = new Error();

module.exports = function(Verification) {
  Verification.sendCode = async function (mobile) {
    if (!(/^1[34578]\d{9}$/.test(mobile))) {
      err.statusCode = '400';
      err.message = g.f('手机号码错误，请输入有效的手机号码');
      throw err;
    }
    const verification = await Verification.findOne({where: {mobile}, order: 'created desc'});
    if (verification) {
      const now = Date.now();
      const created = verification.created;
      const elapsedSeconds = (now - created) / 1000;
      const secondsToLive = 60;
      if (elapsedSeconds < secondsToLive) {
        err.statusCode = '400';
        err.message = g.f('验证码获取过于频繁');
        throw err;
      }
    }

    const sms = Verification.app.get('sms');
    const option = {
      mobile,
      template: sms.templates.code
    };
    let code = "";
    for(let i = 0; i < 4; i++)
    {
      code += Math.floor(Math.random()*10);
    }
    option.code = code;
    const result = await Verification.app.messageSender(option);
    if (result.error) {
      throw result;
    }
    return await Verification.create({mobile, code});
  };

  Verification.verifyCode = async function (mobile, code) {
    const verification = await Verification.findOne({where: {mobile, code}, order: 'created desc'});
    if (!verification) {
      return false;
    }
    const now = Date.now();
    const created = verification.created;
    const elapsedSeconds = (now - created) / 1000;
    const secondsToLive = verification.ttl;
    return elapsedSeconds < secondsToLive;
  };

  Verification.remoteMethod('sendCode', {
    description: '发送验证码',
    accepts: [{arg: 'mobile', type: 'string', required: true, description: '手机号'}],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/code/send'}
  });

  Verification.remoteMethod('verifyCode', {
    description: '验证输入的验证码是否正确',
    accepts: [{arg: 'mobile', type: 'string', required: true, description: '手机号'},
      {arg: 'code', type: 'string', required: true, description: '验证码'}],
    returns: {arg: 'result', type: 'string'},
    http: {verb: 'get', path: '/code/verify'}
  });
};
