// client.js

import { attributesToMap } from "../utils.js";
import { createCmpButtonApp } from "./components/cmp-button.js";
import { createCmpContainerApp } from "./components/cmp-container.js";

defineElement('cmp-button', createCmpButtonApp);
defineElement('cmp-container', createCmpContainerApp);

function defineElement(name, createFn) {
    customElements.define(name, class extends HTMLElement {
        connectedCallback() {
            const rootEl = this.shadowRoot;
            console.log('mounting on', rootEl.innerHTML);
            console.log('innerHTML', this.getInnerHTML({ includeShadowRoots: true }));
    
            const props = attributesToMap(this.attributes);
    
            createFn(props).mount(rootEl);
        }
    });
}
