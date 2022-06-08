import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import { attributesToMap, wrapAsShadowDOM } from '../utils.js';

export async function renderReact(create, attributes) {
    const attrMap = attributesToMap(attributes);

    const app = create(attrMap);
    const html = await ReactDOMServer.renderToString(app);

    return wrapAsShadowDOM(html);
}