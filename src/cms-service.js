import * as jsdom from 'jsdom';
import { renderToString } from 'vue/server-renderer'
import { createApp } from './app.js'

const { JSDOM } = jsdom
const DOM = new JSDOM();
global.DOMParser = DOM.window.DOMParser;
global.document = DOM.window.document;

function wrapAsShadowDOM(html) {
    return `<template shadowroot="open">${html}</template>`;
}

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

async function generateDomTree(node, parent) {
    if (typeof node === 'string') {
        parent.appendChild(document.createTextNode(node));

        return;
    }
    const nodeName = node.nodeName.toLowerCase();
    if (!parent) {
        parent = document.createElement('ghost');
    }

    let newElement;

    if (nodeName === '#text') {
        // nothing to do with text nodes
        newElement = node.cloneNode();
    } else if (componentToRendererMap[nodeName]) {
        // put SSR here
        const { createApp, render } = componentToRendererMap[nodeName];
        const renderedHTML = await render(createApp);

        console.log('rendered vue app from web component:', nodeName, renderedHTML);

        newElement = document.createElement(nodeName);

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

    // clone attributes
    if (nodeName !== "#text") {
        const attributes = [...node.attributes];
        for (let attr of attributes) {
            newElement.setAttribute(attr.name, attr.value);
        }
    
    }

    // insert in new DOM
    parent.appendChild(newElement);

    return parent;
}

export async function convertRawHTMLToDOMTree(htmlAsText) {
    const docu = new DOMParser().parseFromString(
        htmlAsText,
        "application/xml"
    ).documentElement;

    const parsedTree = await generateDomTree(docu);

    return parsedTree.innerHTML;
}