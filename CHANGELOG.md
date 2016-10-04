# Changelog

### vNEXT
- Pass WebSocketRequest to onSubscribe to support reading HTTP headers when creating a subscription

### v0.2.4
- Server reports back an error on an unparsable client message
- Server reports back an error on an unsupported client message type
- Fix intermittent failure in timeout test case
- Standardize server and client errors handling to always create an array of errors with a message property
