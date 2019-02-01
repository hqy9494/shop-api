'use strict';
const SMSClient = require('@alicloud/sms-sdk');

module.exports = function (app) {

  let sms = app.get('sms');
  app.smsClient = new SMSClient({
    accessKeyId: sms.accessKeyId,
    secretAccessKey: sms.secretAccessKey
  });

  app.messageSender = function (option) {
    return new Promise((resolve,reject)=> {
      return app.smsClient.sendSMS({
        PhoneNumbers: option.mobile,
        SignName: sms.sign,
        TemplateCode: option.template,
        TemplateParam: `{"code":"${option.code}"}`
      }).then(function (res) {
        return resolve(res);
      }, function (err) {
        return reject(err);
      })
    })
  };
};
