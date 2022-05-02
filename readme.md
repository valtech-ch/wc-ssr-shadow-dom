The purpose of this repo is to demonstrate that is possible to have Frontend frameworks apps inside of webcomponents that are Server-Side-Rendered.

This is done leveraging the new [Declarative Shadow Dom API](https://web.dev/declarative-shadow-dom/#polyfill).

This is a follow up on [David Lorenz's article](https://itnext.io/a-deep-analysis-into-isomorphic-autonomous-cross-framework-usage-microfrontends-364271dc5fa9), which was attempting to do the same.
The trick here is to treat Web Components and Framework-App separately on the Server Side (the wc are not actually server side rendered as an entity but composed out of the result of the rendering of the related Framework-App).

## Rehydration

To put a Vue component in a shadow DOM we need the following:
1. make it compile into a native `<template shadowroot="open">` element
2. make it have a native `<slot>` element to be able to have slotted light DOM

since bot `<template>` and `<slot>` are built-in components of Vue that conflict with the Native APIs we need specific components to render them:

```js
export const ShadowTemplateFactory = ["shadow-template-factory", {
    render: function() {
        return h("template", // tag name
            { shadowroot: 'open' },
            this.$slots.default() // this make it render children properly
        );
    }
}];
```

since we're using `ShadowTemplateFactory` as a root of an App, we can assume no named slots to be needed ; therefore `this.$slots.default()` should cover our only use case.

```js
export const SlotFactory = ["slot-factory", {
  render: () => h("slot")
}];
```
this one is pretty intuitive.

Our simple component should now look like this:

```js
const SSRShadowButton = ['ssr-shadow-button', {
  template: `
<shadow-template-factory>
  <button @click="count++">
    <slot-factory></slot-factory>
    {{ count }}
  </button>
</shadow-template-factory>
  `,
  data: () => ({ count: 1 }),
}];
```
and render (on Server Side) as
```html
<template shadowroot="open"><button><slot></slot> 1</button></template>
```
if we execute this we're now incurring onto a problem: `Hydration node mismatch`. This happens because of our client-side web-component logic:

```js
customElements.define('app-example', class extends HTMLElement {
    connectedCallback() {
        const rootEl = this.shadowRoot;
        createApp().mount(rootEl);
    }
});
```
when Vue tryes to rehydrate the component it compares the SSR string (the compiled version) to the current one in the DOM. if we log the latter with `console.log('mounting on', rootEl.innerHTML);` we see where the mismatch is:
```html
<button><slot></slot> 1</button>
```

what about the `<template>`?
from the [declarative shadow dom documentation](https://web.dev/declarative-shadow-dom/):
> A template element with the shadowroot attribute is detected by the HTML parser and immediately applied as the shadow root of its parent element.

that means that the `<template>` element won't be serialized by the parent element's `innerHTML` nor by the shadowroot's. (Vue does not use, at the time of writing, the new `getInnerHTML({ includeShadowRoots: true })` API)

To solve this, we could simply remove the `<shadow-template-factory>` from the component and add the `<template>` tag later after the rendering:

```js
function wrapAsShadowDOM(html) {
    return `<template shadowroot="open">${html}</template>`;
}

// and later
res.send(`
...some html
`${wrapAsShadowDOM(html)}`
...someother html
```

now the outcome of the SSR is `<button><slot></slot> 1</button>` that is exactly the outcome of `this.shadowRoot.innedHTML` (rehydration works).

## Back to the main problem

The scenario is the following:
- we have some html content (maybe from a CMS or any source)
- this html may contain some web-components written in some framework (eg. Vue)
- we want to server side render the html including the Vue (or whatever) app inside the webcomponents
- we want rehydration to work.

As a reference example, we may have some html that looks like this
```html
<!-- some html structure -->
<app-example>some slotted content</app-example>
<!-- some more html -->
```
where `<app-example>` is our web component that is our Vue app from above.

We already know how to have rehydration to work but we actually have to process the html to include the ssr of `<app-example>` in the final result. It should look like something like this:
```html
<!-- some html structure -->
<app-example><template shadowroot="open"><button><slot>some slotted content</slot> 1</button></template></app-example>
<!-- some more html -->
```

One of the first things we could think of is to use Vue or some framework to handle the custom tags as framework-component and let it SSR the whole HTML from our source (CMS os whatever) in some special way.

This creates quite the number of issues (eg. how to handle frameworks in frameworks or how to make vue render tags with the same name as known vue components.. see infinite loop problem in [David Lorenz's article](https://itnext.io/a-deep-analysis-into-isomorphic-autonomous-cross-framework-usage-microfrontends-364271dc5fa9))

Looking at the two code slices above something pops up immediately: considering the DOM tree from that html, the transition between the 2 states (before and after the Vue app's SSR) is pretty simple:
1. store the children (slotted content) somewhere
2. set the rendered part as children of `<app-example>`
3. find the `<slot>` in the rendered part
4. attach the stored children to the slot.

on a note: we can assume that if we can't find the `<slot>` inside the rendered part it means that the Vue app doesn't want to render it's children.

Following this we can leverage the use of [jsdom](https://github.com/jsdom/jsdom) as follows:
1. get the html from the source
2. get some config about which web component to be rendered how
3. parse the html into a virtual DOM
4. traverse each node in the vDOM and create a parallel tree top-to-bottom:
    - if the node is a text node, just clone it.
    - if a node is a node whos `nodeName` is in the config:
      1. create a new element with the `nodeName` for the parallel vDOM
      2. ssr the app as described in the config
      3. parse the resulting string into a vDOM
      4. attach this vDOM to the node just created
      5. search for a `<slot>` inside the ssr-ed vDOM
      6. if the `<slot>` is found, iterate over the children of the current node and attach them to the `<slot>`
    - if the node is a generic one, recreate it and re-iterate on the children
    - attach the cloned/re-created node to its new vDOM parent
5. serialize the obtained tree and return it.

let's put this into code:

```js
export async function getPageFromCMS() {
    return Promise.resolve(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Vue SSR Example</title>
        <script type="importmap">
  {
    "imports": {
        "vue": "https://cdnjs.cloudflare.com/ajax/libs/vue/3.0.0-beta.15/vue.esm-browser.js"
    }
  }
        </script>
        <script type="module" src="/src/client.js"></script>
      </head>
      <body>
        <app-example id="app">Mario</app-example>
      </body>
    </html>
    `)
}
```
nothing complicated here, we're simulating some async source for the basic HTML. Now let's see how the config should look like:
```js
async function renderVue3(create) {
    const app = create();
    const html = await renderToString(app);

    return wrapAsShadowDOM(html);
}

const componentToRendererMap = {
    'app-example': {
        createApp,
        render: renderVue3 
    }
};
```
note that `createApp` is the same function as the example on the top.
We need 3 main info: the name of the tag (used as key to have direct access), the ssr renderer function and the app itself.

now as of the general logic: we'll have
```js
export async function convertRawHTMLToDOMTree(htmlAsText) {
    // get CMS content
    const docu = new DOMParser().parseFromString(
        htmlAsText,
        "application/xml"
    ).documentElement;

    // SSR it (as DOM tree)
    const parsedTree = await generateDomTree(docu);

    // Ship it
    return parsedTree.innerHTML;
}
```
also here's pretty simple, we're calling `generateDomTree()` on the root of our source, it will reiterate over each node and return us a new tree structure with all the components rendered. Of that we then return the innerHTML.

NOTE: parsedTree will be a root element (`<ghost>`) that will contain the whole document.

as of the `generateDomTree()` implementation:

```js
async function generateDomTree(node, parent) {
    // since we don't have a starting element, we first create it.
    // from there on, we perform side-effects to copy the original node
    // then attach it to the parent.
    // this allow us to iterate over children.
    const nodeName = node.nodeName.toLowerCase();
    if (!parent) {
        parent = document.createElement('ghost');
    }

    let newElement; // this represents the SSR-ed version of the current node.

    if (nodeName === '#text') {
        // nothing to do with text nodes
        newElement = node.cloneNode();
    } else if (componentToRendererMap[nodeName]) {
        const { createApp, render } = componentToRendererMap[nodeName];
        const renderedHTML = await render(createApp); // let's SSR our component

        newElement = document.createElement(nodeName);

        // once we parsed it, we can manipulate it easily.
        const SSRed = new DOMParser().parseFromString(renderedHTML, 'application/xml').documentElement;
        newElement.appendChild(SSRed);

        const slot = newElement.querySelector('slot'); // only 1 supported, no named slots

        if (slot) {
            // pass down children onto the <slot>
            const childNodes = [...node.childNodes];
            for (let childNode of childNodes) {
                await generateDomTree(childNode, slot);
            }
        }
        // it may happen that the HTML from the CMS has some children for a wc that has no slot.
        // such children are discarded.
    } else {
        // normal node
        newElement = document.createElement(nodeName);

        // pass down children
        const childNodes = [...node.childNodes];
        for (let childNode of childNodes) {
            await generateDomTree(childNode, newElement);
        }
    }

    // clone attributes for both normal node and our web component
    if (nodeName !== "#text") {
        const attributes = [...node.attributes];
        for (let attr of attributes) {
            newElement.setAttribute(attr.name, attr.value);
        }
    
    }

    // insert in new DOM
    parent.appendChild(newElement);

    return parent; // every return value is ignored but the 1st call's one (that contains the root 'ghost' element)
}
```

the code is pretty straightforward and clear to follow.
NOTE: since `document` and `DOMParser` are browser-only features, we don't have them in NodeJS. to have them available here's how we use them via `jsdom`:
```js
import * as jsdom from 'jsdom';

const { JSDOM } = jsdom
const DOM = new JSDOM();
global.DOMParser = DOM.window.DOMParser;
global.document = DOM.window.document;
```

final note:
at the time of writing, only Chromium supports [Declarative Shadow DOM](https://web.dev/declarative-shadow-dom/). This should be fine for SEO but for Safari and Firefox a [polyfill](https://web.dev/declarative-shadow-dom/#polyfill) should be used. The implementation shouldn't change.