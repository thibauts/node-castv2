var fs        = require('fs');
var ProtoBuf  = require("protobufjs");
var path      = require('path');

var builder = ProtoBuf.loadProtoFile(path.join(__dirname, "/cast_channel.proto"));
var extensions = builder.build('extensions.api.cast_channel');

var messages = [
  'CastMessage', 
  'AuthChallenge', 
  'AuthResponse', 
  'AuthError', 
  'DeviceAuthMessage'
];

messages.forEach(function(message) {
  module.exports[message] = {
    serialize: function(data) {
      var msg = new extensions[message](data);
      return msg.encode().toBuffer();
    },
    parse: function(data) {
      return extensions[message].decode(data);
    }
  };
});