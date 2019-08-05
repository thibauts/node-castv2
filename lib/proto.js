var fs        = require('fs');
var protobuf  = require("protobufjs");

var builder = protobuf.load(__dirname + "/cast_channel.proto", onLoad);

var messages = [
  'CastMessage',
  'AuthChallenge',
  'AuthResponse',
  'AuthError',
  'DeviceAuthMessage'
];

var extensions = [];

function onLoad(err, root) {
  if (err) throw err;

  messages.forEach(function(message) {
    extensions[message] =
      root.lookupType(`extensions.api.cast_channel.${message}`);
  });
}

messages.forEach(function(message) {
  module.exports[message] = {
    serialize: function(data) {
      if (!extensions[message]) {
        throw new Error('extension not loaded yet');
      }
      var Message = extensions[message];
      return Message.encode(data).finish();
    },
    parse: function(data) {
      if (!extensions[message]) {
        throw new Error('extension not loaded yet');
      }
      var Message = extensions[message];
      return Message.decode(data);
    }
  };
});
