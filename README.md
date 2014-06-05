castv2-messagebus
=================
### An implementation of the Chromecast CASTV2 message bus protocol

This module is an implementation of the Chromecast message bus protocol over TLS. The internet is very scarse on information about the new Chromecast protocols so big props go to [github.com/vincentbernat](https://github.com/vincentbernat) and his [nodecastor](https://github.com/vincentbernat/nodecastor) module that helped me start off on the right foot and save a good deal of time in my research.

The module provides both a `Client` and a `Server` implementation of the low-level message bus protocol. The server is (sadly) pretty useless because device authentication gets in the way for now (and maybe for good). The client still allows you to connect and exchange messages with a Chromecast dongle without any restriction. 

Examples
--------

A simple client doing the deviceauth handshake, connecting to the receiver and starting the heartbeat :

``` javascript
var messagebus = require('castv2-messagebus');

var Client = messagebus.Client;
var DeviceAuthMessage = messagebus.DeviceAuthMessage;

var client = new Client();

client.connect('192.168.1.10', function() {
  console.log('connected');

  client.send(
    'sender-0',
    'receiver-0',
    'urn:x-cast:com.google.cast.tp.deviceauth',
    DeviceAuthMessage.serialize({ challenge: {} })
  );

});

client.on('message', function(sourceId, destinationId, namespace, data) {
  if(namespace === 'urn:x-cast:com.google.cast.tp.deviceauth') {
    if(data.error) throw new Error('device authentication failed'); // This is very unlikely

    console.log('device authentication ok');
    onconnected();
  }
});

client.on('close', function() {
  console.log('connection closed');
});

client.on('error', function(err) {
  console.log('error', err);
  client.close();
});

function onconnected() {
  /* 
   * Channels allow clients to scope messages. An optional `encoding` parameter
   * can be specified for automatic data parsing / serialization
   */
  var connection = client.createChannel('urn:x-cast:com.google.cast.tp.connection', 'JSON');
  connection.send('sender-0', 'receiver-0', { type: 'CONNECT' });

  var heartbeat = client.createChannel('urn:x-cast:com.google.cast.tp.heartbeat', 'JSON');

  function onheartbeat() {
    heartbeat.send('sender-0', 'receiver-0', { type: 'PING' });
  }
  setInterval(onheartbeat, 5000);

  heartbeat.on('message', function(sourceId, destinationId, data) {
    console.log(data.type); // PONG
  });
}
```

Run it with the following command to get a full trace of the messages exchanged with the dongle.

```bash 
$ DEBUG=* node example.js
```

Device discovery with the `mdns` module :

```javascript
var mdns = require('mdns');

var browser = mdns.createBrowser(mdns.tcp('googlecast'));

browser.on('serviceUp', function(service) {
  console.log('found device %s at %s:%d', service.name, service.addresses[0], service.port);
});

browser.start();
```