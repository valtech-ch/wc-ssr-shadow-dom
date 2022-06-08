The purpose of this repository is to demonstrate that is possible to have frontend framework applications inside of Web Components that are server-side-rendered.

This is done by leveraging the new [Declarative Shadow Dom API](https://web.dev/declarative-shadow-dom/#polyfill).

This is a follow up on [David Lorenz's article](https://itnext.io/a-deep-analysis-into-isomorphic-autonomous-cross-framework-usage-microfrontends-364271dc5fa9), which was attempting to do the same.
The trick here is to handle Web Components and frontend framework applications separately on the server. Please note that the Web Components are actually not server-side-rendered as an entity but composed out of the result of the rendering of the related frontend framework application.

## Rehydration

To put a Vue component in a shadow DOM we need the following:

1. Make it compile into a native `<template shadowroot="open">` element
2. Make it have a native `<slot>` element to be able to have slotted light DOM

Since both `<template>` and `<slot>` are built-in components of Vue that conflict with the Native APIs we need specific components to render them:

### Template

```js
export const ShadowTemplateFactory = [
  'shadow-template-factory',
  {
    render: function () {
      return h(
        'template', // tag name
        { shadowroot: 'open' },
        this.$slots.default(), // this ensures children are properly rendered
      )
    },
  },
]
```

As `ShadowTemplateFactory` is a root of an application, we can assume that no named slot is needed. Therefore, `this.$slots.default()` should cover our only use case.

### Slot

This one is pretty intuitive and as follow,

```js
export const SlotFactory = [
  'slot-factory',
  {
    render: () => h('slot'),
  },
]
```

Now put together, our simple component should look like this:

```js
const SSRShadowButton = [
  'ssr-shadow-button',
  {
    template: `
<shadow-template-factory>
  <button @click="count++">
    <slot-factory></slot-factory>
    {{ count }}
  </button>
</shadow-template-factory>
  `,
    data: () => ({ count: 1 }),
  },
]
```

and render (on server side) as

```html
<template shadowroot="open"
  ><button><slot></slot> 1</button></template
>
```

However, if we execute this, we're now running into a problem: `Hydration node mismatch`. This happens because of our client-side Web Component logic:

```js
customElements.define(
  'app-example',
  class extends HTMLElement {
    connectedCallback() {
      const rootEl = this.shadowRoot
      createApp().mount(rootEl)
    }
  },
)
```

When Vue tries to rehydrate the component it compares the SSR string (the compiled version) to the current one in the DOM. If we log the latter with `console.log('mounting on', rootEl.innerHTML);` we see where the mismatch is:

```html
<button><slot></slot> 1</button>
```

What about the `<template>`?

From the [declarative shadow dom documentation](https://web.dev/declarative-shadow-dom/):

> A template element with the shadowroot attribute is detected by the HTML parser and immediately applied as the shadow root of its parent element.

That means that the `<template>` element won't be serialized by the parent element's `innerHTML` nor by the shadowroot's. (Vue does not use, at the time of writing, the new `getInnerHTML({ includeShadowRoots: true })` API)

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

Now the outcome of the SSR is `<button><slot></slot> 1</button>` which is exactly the outcome of `this.shadowRoot.innedHTML`.
Rehydration works!

## Back to the main problem

The scenario is the following:

- We have some html content (maybe from a CMS or any source)
- This html may contain some Web Components written in some framework (eg. Vue)
- We want to server side render the html including the Vue (or whatever) application inside the Web Components
- We want rehydration to work.

As a reference example, we may have some html that looks like this

```html
<!-- some html structure -->
<app-example>some slotted content</app-example>
<!-- some more html -->
```

`<app-example>` is our Web Component which is our Vue application from above.

We already know how to have rehydration working but we actually have to process the html to include the ssr of `<app-example>` in the final result.

It should look like the following:

```html
<!-- some html structure -->
<app-example
  ><template shadowroot="open"
    ><button><slot>some slotted content</slot> 1</button></template
  ></app-example
>
<!-- some more html -->
```

One of the first things we could think of is to use Vue or some framework to handle the custom tags as framework-component and let it SSR the whole HTML from our source (CMS os whatever) in some special way.

However, this creates some other challenges or questions. Eg. how to handle frameworks in frameworks or how to make vue render tags with the same name as known vue components.. see infinite loop problem in [David Lorenz's article](https://itnext.io/a-deep-analysis-into-isomorphic-autonomous-cross-framework-usage-microfrontends-364271dc5fa9))

Looking at the two code slices above something pops up immediately: considering the DOM tree from that html, the transition between the 2 states (before and after the Vue application's SSR) is pretty simple:

1. Store the children (slotted content) somewhere
2. Set the rendered part as children of `<app-example>`
3. Find the `<slot>` in the rendered part
4. Attach the stored children to the slot.

Note: we can assume that if we can't find the `<slot>` inside the rendered part it means that the Vue application doesn't want to render it's children.

Following this we can leverage by using [jsdom](https://github.com/jsdom/jsdom) as follow:

1. Get the html from the source
2. Get some config about which web component to be rendered how
3. Parse the html into a virtual DOM
4. Traverse each node in the vDOM and create a parallel tree top-to-bottom:
   - If the node is a text node, just clone it.
   - If a node is a node whos `nodeName` is in the config:
     1. Create a new element with the `nodeName` for the parallel vDOM
     2. SSR the application as described in the config
     3. Parse the resulting string into a vDOM
     4. Attach this vDOM to the node just created
     5. Search for a `<slot>` inside the ssr-ed vDOM
     6. If the `<slot>` is found, iterate over the children of the current node and attach them to the `<slot>`
   - If the node is a generic one, recreate it and re-iterate on the children
   - Attach the cloned/re-created node to its new vDOM parent
5. Serialize the obtained tree and return it.

Let's put this into code:

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

Nothing complicated here, we're simulating some async source for the basic HTML. Now let's see how the config should look like:

```js
async function renderVue3(create) {
  const app = create()
  const html = await renderToString(app)

  return wrapAsShadowDOM(html)
}

const componentToRendererMap = {
  'app-example': {
    createApp,
    render: renderVue3,
  },
}
```

Note: `createApp` is the same function as the example on the top.

We need 3 main info: the name of the tag (used as key to have direct access), the ssr renderer function and the app itself.

Now as of the general logic, we'll have:

```js
export async function convertRawHTMLToDOMTree(htmlAsText) {
  // get CMS content
  const docu = new DOMParser().parseFromString(
    htmlAsText,
    'application/xml',
  ).documentElement

  // SSR it (as DOM tree)
  const parsedTree = await generateDomTree(docu)

  // Ship it
  return parsedTree.innerHTML
}
```

Also here it is pretty simple, we're calling `generateDomTree()` on the root of our source, it will reiterate over each node and return us a new tree structure with all the components rendered. From that we then return the innerHTML.

Note: parsedTree will be a root element (`<ghost>`) that will contain the whole document.

As of the `generateDomTree()` implementation:

```js
async function generateDomTree(node, parent) {
  // since we don't have a starting element, we first create it.
  // from there on, we perform side-effects to copy the original node
  // then attach it to the parent.
  // this allow us to iterate over children.
  const nodeName = node.nodeName.toLowerCase()
  if (!parent) {
    parent = document.createElement('ghost')
  }

  let newElement // this represents the SSR-ed version of the current node.

  if (nodeName === '#text') {
    // nothing to do with text nodes
    newElement = node.cloneNode()
  } else if (componentToRendererMap[nodeName]) {
    const { createApp, render } = componentToRendererMap[nodeName]
    const renderedHTML = await render(createApp) // let's SSR our component

    newElement = document.createElement(nodeName)

    // once we parsed it, we can manipulate it easily.
    const SSRed = new DOMParser().parseFromString(
      renderedHTML,
      'application/xml',
    ).documentElement
    newElement.appendChild(SSRed)

    const slot = newElement.querySelector('slot') // only 1 supported, no named slots

    if (slot) {
      // pass down children onto the <slot>
      const childNodes = [...node.childNodes]
      for (let childNode of childNodes) {
        await generateDomTree(childNode, slot)
      }
    }
    // it may happen that the HTML from the CMS has some children for a wc that has no slot.
    // such children are discarded.
  } else {
    // normal node
    newElement = document.createElement(nodeName)

    // pass down children
    const childNodes = [...node.childNodes]
    for (let childNode of childNodes) {
      await generateDomTree(childNode, newElement)
    }
  }

  // clone attributes for both normal node and our web component
  if (nodeName !== '#text') {
    const attributes = [...node.attributes]
    for (let attr of attributes) {
      newElement.setAttribute(attr.name, attr.value)
    }
  }

  // insert in new DOM
  parent.appendChild(newElement)

  return parent // every return value is ignored but the 1st call's one (that contains the root 'ghost' element)
}
```

The code is pretty straightforward and clear to follow.

Note: since `document` and `DOMParser` are browser-only features, we don't have them in NodeJS. In order to have them available here is how we use them via `jsdom`:

```js
import * as jsdom from 'jsdom'

const { JSDOM } = jsdom
const DOM = new JSDOM()
global.DOMParser = DOM.window.DOMParser
global.document = DOM.window.document
```

## Adding new components
We manage to SSR some Web Component (not really but close enough) and successfully re-hydrate the app within it. Now we want to know if this can scale up to a whole page full of these Apps.
To Add a new component definition we need to do 2 things:

1. add the web component code for the client.
2. implement the component :D

then we'll be ready for when our html source will pass us the new component.

let's start with 1:

### Add the web component code for the client.

we can generalize our web component code and simplify it's usage:

```js
function defineElement(name, createApp) {
  customElements.define(name, class extends HTMLElement {
    connectedCallback() {
      const rootEl = this.shadowRoot;
      const props = attributesToMap(this.attributes);

      createApp(props).mount(rootEl);
    }
  });
}
```

note the addition of `attributesToMap` and the fact that the `createApp` function accepts a parameter, more on that on next chapter.

what's left then is to initialize our component: `defineElement('new-comp-name', createNewCompFunction)`

2. Implement The Component
```js
const NewComp = ['new-comp-name', {
  template: `
  <div style="max-width: 720px; margin: 0 auto; box-shadow: 0px 4px 4px 2px #ddd" @click="invertTitle">
    <div style="border-bottom: solid 1px #ccc; padding: 6px 24px">
        <h1 :style="titleStyle">{{ title }}</h1>
    </div>
    <div style="padding: 24px">
        <slot-factory></slot-factory>
    </div>
  </div>
  `,
  props: ['titleColor'],
  data: () => ({ title: 'Some Title' }),
  computed: {
      titleStyle() {
        return `color: ${this.titleColor || 'black'}`
      }
  },
  methods: {
      invertTitle() {
        this.title = this.title === 'Some Title' ? 'Some Other Title' : 'Some Title';
      }
  }
}];

export function createNewCompFunction(props) {
  const app = createSSRApp({
    data: () => ({ titleColor: props['title-color'] }),
    template: `<new-comp-name :titleColor="titleColor">This Will be ignored since there's no Vue slot in the template of new-comp-name</new-comp-name>`
  });

  app.component(...SlotFactory);
  app.component(...NewComp);

  return app;
}
```

nothing much going on here, just a little interaction to make sure rehydration works and some styling to have it clearly visible on screen.

Note that we added a parameter `titleColor`. More on that on next chapter.

We can now update our mock html including this

```html
<new-comp-name title-color="blue">
  <app-example id="app">Mario</app-example>
</new-comp-name>
```

restart the server and see with satisfaction that it works.

## Parameters
The only way we have to introduce parameters in the apps is to add attributes in the html (see example above). In order to add them to the App we need to collect the attributes (note that the _snake-case_ is needed as html wants lower-case characters for attribute names.) and pass them as props.

Instead of making an automatic case conversion, the attributes are mapped manually when creating the app to the props of the specific component. this could be done differently and I know, so please don't judge me.

We of course need to make sure to get them both when SSR-ing and when re-hydrating.

## Using React:
React is (in theory) ingeneered to be used in Micro-Frontend architectures. This holds true if you stick with it for the whole architecture (mounting react pieces in a react orchestrator). In the moment we want to have some other framework nested in a React app or a totally different React app things get complicated.

> To prevent React from touching the DOM after mounting, we will return an empty `<div />` from the render() method. The `<div />` element has no properties or children, so React has no reason to update it, leaving the jQuery plugin free to manage that part of the DOM.

From the official documentation, this is the intended way to have multiple frameworks working with React. Seems easy then? well, we have SSR and apparently Re-hydration expects a certain app to not have anything past its point. This means that any content inside the `<slot />` will be considered unexpected and Re-hydration will fail (duplicate HTML FTW :)

Things we can take away from [this](https://reactjs.org/docs/integrating-with-other-libraries.html):
- we want to have a react component that only renders the `<slot />` so it'll never re-render and thus care about what's happening below it.
- to avoid memory leaks, we should unmount all the apps below a component when this gets unmounted; some mechanism is required to do this.

Othwerwise, the only issue we have related to Re-hydration is to make React not know about any children.

To do that we need to implement our client component maker a bit differently than how done for Vue:
```javascript
function defineReactElement(name, createFn) {
  customElements.define(name, class extends HTMLElement {
    connectedCallback() {
      const rootEl = this.shadowRoot;

      const props = attributesToMap(this.attributes);
      // detach anything under <slot> and reattach it after mounting the app

      const slot = rootEl.querySelector('slot');
      if (slot) {
        const passthroughChildren = Array.from(slot.childNodes);
        passthroughChildren.forEach(el => {
          slot.removeChild(el);
        });
        ReactDOM.hydrateRoot(rootEl, createFn(props));
        setTimeout(() => {
          // leave time to react to make the rendering
          passthroughChildren.forEach(el => slot.appendChild(el));
        });
      } else {
        ReactDOM.hydrateRoot(rootEl, createFn(props));
      }
    }
  });
}
```
once this issue is solved, the rest of React setup is very straightforward.

## Note on Nesting Apps and Re-hydration
For rehydration to work the SSRed string needs to be the same as the innerHTML of the App we want to re-hydrate.

In this case the SSRed string of each App doesn't really include the sub-apps. Right?

Wait a minute. How do Vue know what was on the server? - Quick answer it doesn't.

The string it can compare agains in nothing else than the page source, which includes the sub-Apps after the SSR.

This means that the Re-hydrator will see the current big innerHTML and compare to exactly the same big innerHTML coming from the source page.

Conclusion is: Nesting works out of the box.


## Final note:

At the time of writing, only Chromium supports [Declarative Shadow DOM](https://web.dev/declarative-shadow-dom/). This should be fine for SEO but for Safari and Firefox a [polyfill](https://web.dev/declarative-shadow-dom/#polyfill) should be used.

The implementation shouldn't change.
