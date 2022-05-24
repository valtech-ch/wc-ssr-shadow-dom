// client.js

import { createCmpButtonApp } from "./components/cmp-button.js";

customElements.define('cmp-button', class extends HTMLElement {
    connectedCallback() {
        const rootEl = this.shadowRoot;
        console.log('mounting on', rootEl.innerHTML);
        console.log('innerHTML', this.getInnerHTML({ includeShadowRoots: true }));
        createCmpButtonApp().mount(rootEl);
    }
});
