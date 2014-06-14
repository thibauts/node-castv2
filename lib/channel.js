var EventEmitter  = require('events').EventEmitter;
var util          = require('util');
var debug         = require('debug')('castv2');

function Channel(bus, sourceId, destinationId, namespace, encoding) {
  EventEmitter.call(this);

  this.bus = bus;
  this.sourceId = sourceId;
  this.destinationId = destinationId;
  this.namespace = namespace;
  this.encoding = encoding;

  var self = this;

  this.bus.on('message', onmessage);
  this.once('close', onclose);

  function onmessage(sourceId, destinationId, namespace, data) {
    if(sourceId !== self.destinationId) return;
    if(destinationId !== self.sourceId && destinationId !== '*') return;
    if(namespace !== self.namespace) return;
    self.emit('message', decode(data, self.encoding), destinationId === '*');
  }

  function onclose() {
    self.bus.removeListener('message', onmessage);
  }
}

util.inherits(Channel, EventEmitter);

Channel.prototype.send = function(data) {
  this.bus.send(
    this.sourceId,
    this.destinationId,
    this.namespace,
    encode(data, this.encoding)
  );
};

Channel.prototype.close = function() {
  this.emit('close');
};

function encode(data, encoding) {
  if(!encoding) return data;
  switch(encoding) {
    case 'JSON': return JSON.stringify(data);
    default: throw new Error('Unsupported channel encoding: ' + encoding);
  }
}

function decode(data, encoding) {
  if(!encoding) return data;
  switch(encoding) {
    case 'JSON': return JSON.parse(data);
    default: throw new Error('Unsupported channel encoding: ' + encoding);
  }
}

module.exports = Channel;