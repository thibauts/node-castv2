var EventEmitter  = require('events').EventEmitter;
var inherits      = require('util').inherits;

var WAITING_HEADER  = 0;
var WAITING_PACKET = 1;

function PacketStreamWrapper(stream) {
  EventEmitter.call(this);

  this.stream = stream;

  var state = WAITING_HEADER;
  var packetLength = 0;

  var self = this;
  this.stream.on('readable', function() {
    while(true) {
      switch(state) {
        case WAITING_HEADER:
          var header = stream.read(4);
          if(header === null) return;
          packetLength = header.readUInt32BE(0);
          state = WAITING_PACKET;
          break;
        case WAITING_PACKET:
          var packet = stream.read(packetLength);
          if(packet === null) return;
          self.emit('packet', packet);
          state = WAITING_HEADER;
          break;
      }
    }
  });
}

inherits(PacketStreamWrapper, EventEmitter);

PacketStreamWrapper.prototype.send = function(buf) {
  var header = new Buffer(4);
  header.writeUInt32BE(buf.length, 0);
  this.stream.write(Buffer.concat([header, buf]));
};

module.exports = PacketStreamWrapper;