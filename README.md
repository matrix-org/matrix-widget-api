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
api.on(`action:${WidgetApiToWidgetAction.UpdateVisibility}`, (ev: CustomEvent<IVisibilityActionRequest>) => {
    ev.preventDefault(); // we're handling it, so stop the widget API from doing something.
    console.log(ev.detail); // custom handling here
    api.transport.reply(ev.detail, <IWidgetApiRequestEmptyData>{});
});
api.on("com.example.my_action", (ev: CustomEvent<ICustomActionRequest>) => {
    ev.preventDefault(); // we're handling it, so stop the widget API from doing something.
    console.log(ev.detail); // custom handling here
    api.transport.reply(ev.detail, {custom: "reply"});
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
const driver = new CustomDriver(); // an implementation of WidgetDriver
const api = new ClientWidgetApi(widget, iframe, driver);

// The API is automatically started, so we just have to wait for a ready before doing something
api.on("ready", () => {
    api.updateVisibility(true).then(() => console.log("Widget knows it is visible now"));
    api.transport.send("com.example.my_action", {isExample: true});
});

// Eventually, stop the API handling
api.stop();
``` 
