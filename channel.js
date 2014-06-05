var EventEmitter  = require('events').EventEmitter;
var util          = require('util');
var debug         = require('debug')('castv2-message-bus');

function Channel(bus, namespace) {
  EventEmitter.call(this);

  this.bus = bus;
  this.namespace = namespace;

  var self = this;

  this.bus.on('message', onmessage);
  this.once('close', onclose);

  function onmessage(sourceId, destinationId, namespace, data) {
    if(namespace !== self.namespace) return;
    self.emit('message', sourceId, destinationId, data);    
  }

  function onclose() {
    self.bus.removeListener('message', onmessage);
  }
}

util.inherits(Channel, EventEmitter);

Channel.prototype.send = function(sourceId, destinationId, data) {
  this.bus.send(
    sourceId,
    destinationId,
    this.namespace,
    data
  );
};

Channel.prototype.close = function() {
  this.emit('close');
};

module.exports = Channel;