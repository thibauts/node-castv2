var Client = require('./lib/client');
var Server = require('./lib/server');
var DeviceAuthMessage = require('./lib/proto').DeviceAuthMessage;

module.exports.Client = Client;
module.exports.Server = Server;
module.exports.DeviceAuthMessage = DeviceAuthMessage;