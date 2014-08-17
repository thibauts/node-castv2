castv2
======
### An implementation of the Chromecast CASTV2 protocol

This module is an implementation of the Chromecast CASTV2 protocol over TLS. The internet is very scarse on information about the new Chromecast protocol so big props go to [github.com/vincentbernat](https://github.com/vincentbernat) and his [nodecastor](https://github.com/vincentbernat/nodecastor) module that helped me start off on the right foot and save a good deal of time in my research.

The module provides both a `Client` and a `Server` implementation of the low-level protocol. The server is (sadly) pretty useless because device authentication gets in the way for now (and maybe for good). The client still allows you to connect and exchange messages with a Chromecast dongle without any restriction. 

Installation
------------

``` bash
$ npm install castv2
```

On windows, to avoid native modules dependencies, use

``` bash
$ npm install castv2 --no-optional
```

Usage
-----

``` javascript
var Client = require('castv2').Client;
var mdns = require('mdns');

var browser = mdns.createBrowser(mdns.tcp('googlecast'));

browser.on('serviceUp', function(service) {
  console.log('found device %s at %s:%d', service.name, service.addresses[0], service.port);
  ondeviceup(service.addresses[0]);
  browser.stop();
});

browser.start();

function ondeviceup(host) {

  var client = new Client();
  client.connect(host, function() {
    // create various namespace handlers
    var connection = client.createChannel('sender-0', 'receiver-0', 'urn:x-cast:com.google.cast.tp.connection', 'JSON');
    var heartbeat  = client.createChannel('sender-0', 'receiver-0', 'urn:x-cast:com.google.cast.tp.heartbeat', 'JSON');
    var receiver   = client.createChannel('sender-0', 'receiver-0', 'urn:x-cast:com.google.cast.receiver', 'JSON');

    // establish virtual connection to the receiver
    connection.send({ type: 'CONNECT' });

    // start heartbeating
    setInterval(function() {
      heartbeat.send({ type: 'PING' });
    }, 5000);

    // launch YouTube app
    receiver.send({ type: 'LAUNCH', appId: 'YouTube', requestId: 1 });

    // display receiver status updates
    receiver.on('message', function(data, broadcast) {
      if(data.type = 'RECEIVER_STATUS') {
        console.log(data.status);
      }
    });
  });

}
```

Run it with the following command to get a full trace of the messages exchanged with the dongle.

```bash 
$ DEBUG=* node example.js
```

Protocol description
--------------------

This is an attempt at documenting the low-level protocol. I hope it will give sender-app makers a clearer picture of what is happening behind the curtain, and give the others ideas about how this kind of protocol can be implemented. The information presented here has been collated from various internet sources (mainly exemple code and other attempts to implement the protocol) and my own trial and error. Correct me as needed as I may have gotten concepts or namings wrong.

### The TLS / Protocol Buffers layer

The client connects to the Chromecast through TLS on port 8009. Once the connection is established server and client exchange length-prefixed binary messages (that we'll call packets).

Packets have the following structure :

```
+----------------+------------------------------------------------+
| Packet length  |               Payload (message)                |
+----------------+------------------------------------------------+
```

Packet length is a 32 bits Big Endian Unsigned Integer (UInt32BE in nodejs parlance) that determines the payload size.

Messages are serialized with Protocol Buffers and structured as follows (excerpt of `cast_channel.proto` with comments stripped) :

```protobuf
message CastMessage {
  enum ProtocolVersion {
    CASTV2_1_0 = 0;
  }
  required ProtocolVersion protocol_version = 1;

  required string source_id = 2;
  required string destination_id = 3;

  required string namespace = 4;

  enum PayloadType {
    STRING = 0;
    BINARY = 1;
  }
  required PayloadType payload_type = 5;

  optional string payload_utf8 = 6;
  optional bytes payload_binary = 7;
}

```

The original .proto file can also be found in the Chromium source tree.

Using this structure the sender and receiver *platforms* (eg. The Chrome browser and the Chromecast device) as well as sender and receiver *applications* (eg. a Chromecast receiver app and a Chrome browser sender app for YouTube) communicate on *channels*.

Senders and receivers identify themselves through IDs : `source_id` and `destination_id`. The sending platform (eg. the Chrome browser) usually uses `sender-0`. The receiving platform (the Chromecast dongle) uses `receiver-0`. Other senders and receivers use identifiers such as `sender-sdqo7ozi6s4a`, `client-4637` or `web-4`. We'll dig into that later.

### Namespaces

Senders and receivers communicate through *channels* defined by the `namespace` field. Each namespace corresponds to a protocol that can have its own semantics. Protocol-specific data is carried in the `payload_utf8` or `payload_binary` fields. Either one or the other is present in the message depending on the `payload_type` field value. Thanks to that, applications can define their own protocols and transparently exchange arbitrary data, including binary data, alleviating the need to establish additional connections (ie. websockets).

Though, many protocols use JSON encoded messages / commands, which makes them easy to understand and implement.

Each *sender* or *receiver* can implement one or multiple protocols. For instance the Chromecast *platform* (`receiver-0`) implements the protocols for the following namespaces : `urn:x-cast:com.google.cast.tp.connection`, `urn:x-cast:com.google.cast.tp.heartbeat`, `urn:x-cast:com.google.cast.receiver` and `urn:x-cast:com.google.cast.tp.deviceauth`.

### Communicating with receivers

Before being able to echange messages with a receiver (be it an *application* or the *platform*), a sender must establish a *virtual connection* with it. This is accomplished through the `urn:x-cast:com.google.cast.tp.connection` namespace / protocol. This has the effect of both allowing the sender to send messages to the receiver, and of subscribing the sender to the receiver's broadcasts (eg. status updates).

The protocol is JSON encoded and the semantics are pretty simple :

| **Message payload**     | **Description** 
|:------------------------|:-----------------------------------------------------------------------
| `{ "type": "CONNECT" }` | establishes a virtual connection between the sender and the receiver 
| `{ "type": "CLOSE" }`   | closes a virtual connection 

The sender may receive a `CLOSE` message from the receiver that terminates the virtual connection. This sometimes happens in error cases.

Once the virtual connection is established messages can be exchanged. Broadcasts from the receiver will have a `*` value for the `destination_id` field.

### Keeping the connection alive

Connections are kept alive through the `urn:x-cast:com.google.cast.tp.heartbeat` namespace / protocol. At regular intervals the sender must send a `PING` message that will get answered by a `PONG`. The protocol is JSON encoded.

| **Message payload**     | **Description** 
|:------------------------|:-----------------------------------------------------------------------
| `{ "type": "PING" }`    | notifies the other end that we are sill alive
| `{ "type": "PONG" }`    | the other end acknowledges that we are

Failing to do so will lead to connection termination. The default interval seems to be 5 seconds. This protocol allows the Chromecast to detect unresponsive / offline senders much quicker than the TCP keepalive mechanism.

### Device authentication

Device authentication enables a sender to authenticate a Chromecast device. Authenticating the device is purely optional from a sender's perspective, though the official SDK libraries do it to prevent rogue Chromecast devices to communicate with the official sender platforms. Device authentication is taken care of by the `urn:x-cast:com.google.cast.tp.deviceauth` namespace / protocol.

First the sender sends a *challenge* message to the platform receiver `receiver-0` which responds by either a *response* message containing a signature and a certificate or an *error* message. These 3 payloads are protocol buffers encoded and described in `cast_channel.proto` as follows :

```protobuf
message AuthChallenge {
}

message AuthResponse {
  required bytes signature = 1;
  required bytes client_auth_certificate = 2;
}

message AuthError {
  enum ErrorType {
    INTERNAL_ERROR = 0;
    NO_TLS = 1;  // The underlying connection is not TLS
  }
  required ErrorType error_type = 1;
}

message DeviceAuthMessage {
  optional AuthChallenge challenge = 1;
  optional AuthResponse response = 2;
  optional AuthError error = 3;
}
```

The challenge message is empty in the current version of the protocol (CAST v2.1.0), yet official sender platforms are checking the returned certificate and signature. Details of the verification process can be found in [this issue](https://github.com/thibauts/node-castv2-messagebus/issues/2).

### Controlling applications

The platform receiver `receiver-0` implements the `urn:x-cast:com.google.cast.receiver` namespace / protocol which provides an interface to *launch*, *stop*, and *query the status* of running applications. `receiver-0` also broadcast status messages on this namespace when other senders launch, stop, or affect the status of running apps. It also allows to check app for availability.

The protocol is JSON encoded and is request / response based. Requests include a `type` field containing the type of the request, namely `LAUNCH`, `STOP`, `GET_STATUS` and `GET_APP_AVAILABILITY`, and a `requestId` field that will be reflected in the receiver's response and allows the sender to pair request and responses. `requestId` is not shown in the table below but must be present in every request. In the wild it is an initially random integer that gets incremented for each subsequent request.

| **Message payload**                                  | **Description** 
|:-----------------------------------------------------|:-----------------------------------------------------------------------
| `{ "type": "LAUNCH", appId: <string> }`              | launches an application
| `{ "type": "STOP", sessionId: <string> }`            | stops a running instance of an application
| `{ "type": "GET_STATUS" }`                           | returns the status of the platform receiver, including details about running apps.
| `{ "type": "GET_APP_AVAILABILITY", appId: <array> }` | returns availability of requested apps. `appId` is an array of application IDs.

`appId` may be eg. `YouTube` or `CC1AD845` for the *Default Media Receiver* app. A `sessionId` identifies a running instance of an application and is provided in status messages.

As these requests affect the receiver's status they all return a `RECEIVER_STATUS` message of the following form :

```json
{
  "requestId": 8476438,
  "status": { 
    "applications": [
      { "appId": "CC1AD845",
        "displayName": "Default Media Receiver",
        "namespaces": [ 
          "urn:x-cast:com.google.cast.player.message",
          "urn:x-cast:com.google.cast.media"
        ],
        "sessionId": "7E2FF513-CDF6-9A91-2B28-3E3DE7BAC174",
        "statusText": "Ready To Cast",
        "transportId":  "web-5" }
    ],
    "isActiveInput": true,
    "volume": { 
      "level": 1,
      "muted": false 
    }
  },
  "type": "RECEIVER_STATUS"
}
```

This response indicates an instance of the *Default Media Receiver* is running with `sessionId 7E2FF513-CDF6-9A91-2B28-3E3DE7BAC174`. `namespaces` indicates which protocols are supported by the running app. This could allow any *sender application* implementing the *media protocol* to control playback on this session.

Another important field here is `transportId` as it is the destinationId to be used to communicate with the app. Note that the app being a receiver like any other you must issue it a `CONNECT` message through the `urn:x-cast:com.google.cast.tp.connection` procotol before being able to send messages. In this case this will have the side effect of subscribing you to media updates (on the media channel) of this *Default Media Player* session.

You can join an existing session (launched by another sender) by issuing the same `CONNECT` message.

### Controlling device volume

`receiver-0` allows setting volume and muting at the device-level through the `SET_VOLUME` request on `urn:x-cast:com.google.cast.receiver`.

| **Message payload**                                        | **Description** 
|:-----------------------------------------------------------|:-----------------------------------------------------------
| `{ "type": "SET_VOLUME", "volume": { level: <float> } }`   | sets volume. `level` is a float between 0 and 1
| `{ "type": "SET_VOLUME", "volume": { muted: <boolean> } }` | mutes / unmutes. `muted` is true or false

