var EventEmitter        = require('events').EventEmitter;
var util                = require('util');
var tls                 = require('tls');
var debug               = require('debug')('castv2');
var protocol            = require('./proto');
var PacketStreamWrapper = require('./packet-stream-wrapper');

var CastMessage = protocol.CastMessage;

function Server(options) {
  EventEmitter.call(this);

  this.server = new tls.Server(options);
  this.clients = {};
}

util.inherits(Server, EventEmitter);

Server.prototype.listen = function(port, host, callback) {
  var self = this;

  var args = Array.prototype.slice.call(arguments);
  if(typeof args[args.length - 1] === 'function') {
    callback = args.pop();
  }

  this.server.listen.apply(this.server, args.concat([onlisten]));

  this.server.on('secureConnection', onconnect);
  this.server.on('error', onerror);
  this.server.once('close', onshutdown);

  function onlisten() {
    var addr = self.server.address();
    debug('server listening on %s:%d', addr.address, addr.port);
    if(callback) callback();
  }

  function onconnect(socket) {
    debug('connection from %s:%d', socket.remoteAddress, socket.remotePort);
    var ps = new PacketStreamWrapper(socket);

    var clientId = genClientId(socket);

    ps.on('packet', onpacket);
    socket.once('close', ondisconnect);

    function onpacket(buf) {
      var message = CastMessage.parse(buf);

      debug(
        'recv message: clientId=%s protocolVersion=%s sourceId=%s destinationId=%s namespace=%s data=%s',
        clientId,
        message.protocolVersion,
        message.sourceId,
        message.destinationId,
        message.namespace,
        message.payloadType === 'BINARY' 
          ? util.inspect(message.payloadBinary)
          : message.payloadUtf8
      );

      if(message.protocolVersion !== 'CASTV2_1_0') {
        debug('client error: clientId=%s unsupported protocol version (%s)', clientId, message.protocolVersion);
        var socket = self.clients[clientId].socket;
        socket.end();
        return;
      }

      self.emit('message',
        clientId,
        message.sourceId,
        message.destinationId,
        message.namespace,
        message.payloadType === 'BINARY' 
          ? message.payloadBinary 
          : message.payloadUtf8
      );          
    }

    function ondisconnect() {
      debug('client %s disconnected', clientId);
      ps.removeListener('packet', onpacket);
      delete self.clients[clientId];
    }

    self.clients[clientId] = {
      socket: socket,
      ps: ps
    };
  }

  function onshutdown() {
    debug('server shutting down');
    self.server.removeListener('secureConnection', onconnect);
    self.emit('close');
  }

  function onerror(err) {
    debug('error: %s %j', err.message, err);
    self.emit('error', err);
  }

};

Server.prototype.close = function() {
  this.server.close();
  for(var clientId in this.clients) {
    var socket = this.clients[clientId].socket;
    socket.end();
  }
};

Server.prototype.send = function(clientId, sourceId, destinationId, namespace, data) {
  var message = {
    protocolVersion: 0, // CASTV2_1_0
    sourceId: sourceId,
    destinationId: destinationId,
    namespace: namespace
  };

  if(Buffer.isBuffer(data)) {
    message.payloadType = 1 // BINARY;
    message.payloadBinary = data;
  } else {
    message.payloadType = 0 // STRING;
    message.payloadUtf8 = data;
  }

  debug(
    'send message: clientId=%s protocolVersion=%s sourceId=%s destinationId=%s namespace=%s data=%s',
    clientId,
    message.protocolVersion,
    message.sourceId,
    message.destinationId,
    message.namespace,
    message.payloadType === 1 // BINARY
      ? util.inspect(message.payloadBinary)
      : message.payloadUtf8
  );

  var buf = CastMessage.serialize(message);
  var ps = this.clients[clientId].ps;
  ps.send(buf);
};

function genClientId(socket) {
  return [socket.remoteAddress, socket.remotePort].join(':');
}

module.exports = Server;