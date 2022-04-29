// client.js
import { createApp } from './app.js'

customElements.define('app-example', class extends HTMLElement {
    connectedCallback() {
        const rootEl = this.shadowRoot;
        console.log('mounting on', rootEl.innerHTML);
        console.log('innerHTML', this.getInnerHTML({ includeShadowRoots: true }));
        createApp().mount(rootEl);
    }
});
