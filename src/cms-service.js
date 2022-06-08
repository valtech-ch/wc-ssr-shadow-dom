import * as jsdom from 'jsdom';
import { CmpHeader } from '../lib/react/components/cmp-header.js';
import { renderReact } from '../lib/react/renderer.js';
import { createCmpButtonApp } from '../lib/vue3/components/cmp-button.js';
import { createCmpContainerApp } from '../lib/vue3/components/cmp-container.js';
import { renderVue3 } from '../lib/vue3/renderer.js';

const { JSDOM } = jsdom
const DOM = new JSDOM();
global.DOMParser = DOM.window.DOMParser;
global.document = DOM.window.document;

export async function getPageFromCMS() {
    return Promise.resolve(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Vue SSR Example</title>
        <script crossorigin="true" src="https://unpkg.com/react@18/umd/react.development.js"></script>
        <script crossorigin="true" src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
        <script type="importmap">
  {
    "imports": {
        "vue": "https://cdnjs.cloudflare.com/ajax/libs/vue/3.0.0-beta.15/vue.esm-browser.js",
        "react": "https://unpkg.com/react@18/umd/react.development.js",
        "react-dom": "https://unpkg.com/react-dom@18/umd/react-dom.development.js"
    }
  }
        </script>
        <script type="module" src="/lib/vue3/client.js"></script>
        <script type="module" src="/lib/react/client.js"></script>
      </head>
      <body>
        <cmp-header>Some passthrough contents and a vue app: <cmp-button>Another Counter button</cmp-button></cmp-header>
        <cmp-container title-color="blue">
            <cmp-button id="app">Mario</cmp-button>
        </cmp-container>
      </body>
    </html>
    `)
}


const componentToRendererMap = {
    'cmp-button': {
        createApp: createCmpButtonApp,
        render: renderVue3
    },
    'cmp-container': {
        createApp: createCmpContainerApp,
        render: renderVue3
    },
    'cmp-header': {
        createApp: CmpHeader,
        render: renderReact
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
        const renderedHTML = await render(createApp, node.attributes);

        console.log('rendered app from web component:', nodeName, renderedHTML);

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