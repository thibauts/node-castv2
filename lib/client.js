var EventEmitter        = require('events').EventEmitter;
var util                = require('util');
var tls                 = require('tls');
var debug               = require('debug')('castv2');
var protocol            = require('./proto');
var PacketStreamWrapper = require('./packet-stream-wrapper');
var Channel             = require('./channel');

var CastMessage = protocol.CastMessage;

function Client() {
  EventEmitter.call(this);
  this.socket = null;
  this.ps = null;
}

util.inherits(Client, EventEmitter);

Client.prototype.connect = function(options, callback) {
  var self = this;

  if(typeof options === 'string') {
    options = {
      host: options
    };
  }

  options.port = options.port || 8009;
  options.rejectUnauthorized = false;

  if(callback) this.once('connect', callback);

  debug('connecting to %s:%d ...', options.host, options.port);

  this.socket = tls.connect(options, function() {
    self.ps = new PacketStreamWrapper(self.socket);
    self.ps.on('packet', onpacket);

    debug('connected');
    self.emit('connect');
  });

  this.socket.on('error', onerror);
  this.socket.once('close', onclose);

  function onerror(err) {
    debug('error: %s %j', err.message, err);
    self.emit('error', err);
  }

  function onclose() {
    debug('connection closed');
    self.ps.removeListener('packet', onpacket);
    self.socket.removeListener('error', onerror);
    self.socket = null;
    self.ps = null;
    self.emit('close');
  }

  function onpacket(buf) {
    var message = CastMessage.parse(buf);

    debug(
      'recv message: protocolVersion=%s sourceId=%s destinationId=%s namespace=%s data=%s',
      message.protocol_version,
      message.source_id,
      message.destination_id,
      message.namespace,
      (message.payload_type === 1) // BINARY
        ? util.inspect(message.payload_binary)
        : message.payload_utf8
    );
    if(message.protocol_version !== 0) { // CASTV2_1_0
      self.emit('error', new Error('Unsupported protocol version: ' + message.protocol_version));
      self.close();
      return;
    }

    self.emit('message',
      message.source_id,
      message.destination_id,
      message.namespace,
      (message.payload_type === 1) // BINARY
        ? message.payload_binary 
        : message.payload_utf8
    );    
  }

};

Client.prototype.close = function() {
  debug('closing connection ...');
  // using socket.destroy here because socket.end caused stalled connection
  // in case of dongles going brutally down without a chance to FIN/ACK
  this.socket.destroy();
};

Client.prototype.send = function(sourceId, destinationId, namespace, data) {
  var message = {
    protocol_version: 0, // CASTV2_1_0
    source_id: sourceId,
    destination_id: destinationId,
    namespace: namespace
  };

  if(Buffer.isBuffer(data)) {
    message.payload_type = 1 // BINARY;
    message.payload_binary = data;
  } else {
    message.payload_type = 0 // STRING;
    message.payload_utf8 = data;
  }

  debug(
    'send message: protocolVersion=%s sourceId=%s destinationId=%s namespace=%s data=%s',
    message.protocol_version,
    message.source_id,
    message.destination_id,
    message.namespace,
    (message.payload_type === 1) // BINARY
      ? util.inspect(message.payload_binary)
      : message.payload_utf8
  );

  var buf = CastMessage.serialize(message);
  this.ps.send(buf);
};

Client.prototype.createChannel = function(sourceId, destinationId, namespace, encoding) {
  return new Channel(this, sourceId, destinationId, namespace, encoding);
};

module.exports = Client;