import { renderToString } from 'vue/server-renderer'
import { attributesToMap, wrapAsShadowDOM } from '../utils.js';


export async function renderVue3(create, attributes) {
    const attrMap = attributesToMap(attributes);

    const app = create(attrMap);
    const html = await renderToString(app);

    return wrapAsShadowDOM(html);
}
