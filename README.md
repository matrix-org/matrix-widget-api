# matrix-widget-api
JavaScript/TypeScript API for widgets &amp; web clients to communicate.

For help and support, visit [#matrix-dev:matrix.org](https://matrix.to/#/#matrix-dev:matrix.org) on Matrix.

## Not yet ready for usage

This is currently not validated and thus should not be relied upon until this notice goes away. Installation
instructions will take this notice's place.

## Usage for widgets

The general usage for this would be:

```typescript
const widgetId = null; // if you know the widget ID, supply it.
const api = new WidgetApi(widgetId);

// Before doing anything else, request capabilities:
api.requestCapability(MatrixCapabilities.Screenshots);
api.requestCapabilities(StickerpickerCapabilities);

// Add custom action handlers (if needed)
api.addEventListener("visibility", (ev: CustomEvent<IVisibilityActionRequest>) => {
    console.log(ev.detail); // custom handling here
    api.transport.reply(ev.detail, <IWidgetApiErrorResponseData>{error: {message: "Request failed"}});
});
api.addEventListener("com.example.my_action", (ev: CustomEvent<ICustomActionRequest>) => {
    console.log(ev.detail); // custom handling here
    api.transport.reply(ev.detail, <IWidgetApiErrorResponseData>{error: {message: "Request failed"}});
});

// Start the messaging
api.start();

// If waitForIframeLoad is false, tell the client that we're good to go
api.sendContentLoaded();

// Later, do something else (if needed)
api.setAlwaysOnScreen(true);
api.transport.send("com.example.my_action", {isExample: true});
```

## Usage for web clients

Sorry, this JS API is geared towards web-based widgets and clients 😢

TODO: Improve this

```typescript
const api = new ClientWidgetApi();
// TODO
``` 
