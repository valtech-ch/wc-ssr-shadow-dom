import { attributesToMap } from "../utils.js";
import { CmpHeader } from "./components/cmp-header.js";

defineReactElement('cmp-header', CmpHeader)

function defineReactElement(name, createFn) {
    customElements.define(name, class extends HTMLElement {
        connectedCallback() {
            const rootEl = this.shadowRoot;
            console.log('mounting React on', rootEl.innerHTML);
            console.log('innerHTML', this.getInnerHTML({ includeShadowRoots: true }));
    
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
                    passthroughChildren.forEach(el => slot.appendChild(el));
                });
            } else {
                ReactDOM.hydrateRoot(rootEl, createFn(props));
            }
        }
    });
}