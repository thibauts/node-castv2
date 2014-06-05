var fs        = require('fs');
var protobuf  = require('protobuf');

var desc = fs.readFileSync(__dirname + '/cast_channel.desc');
var schema = new protobuf.Schema(desc);

var package_ = 'extensions.api.cast_channel';

var messages = [
  'CastMessage', 
  'AuthChallenge', 
  'AuthResponse', 
  'AuthError', 
  'DeviceAuthMessage'
];

messages.forEach(function(message) {
  module.exports[message] = schema[package_ + '.' + message];
});