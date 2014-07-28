var fs        = require('fs');
var protobuf  = require('node-protobuf');

var desc = fs.readFileSync(__dirname + '/cast_channel.desc');
var schema = new protobuf(desc);

var package_ = 'extensions.api.cast_channel';

var messages = [
  'CastMessage', 
  'AuthChallenge', 
  'AuthResponse', 
  'AuthError', 
  'DeviceAuthMessage'
];

messages.forEach(function(message) {
  var packagename = package_ + '.' + message;
  module.exports[message] = {
  	serialize: function(data) {
  		console.log(data);
  		return schema.serialize(data, packagename);
  	},
  	parse: function(data) {
  		return schema.parse(data, packagename);
  	}
  };
});