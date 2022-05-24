import { renderToString } from 'vue/server-renderer'
import { attributesToMap } from '../utils.js';

function wrapAsShadowDOM(html) {
    return `<template shadowroot="open">${html}</template>`;
}

export async function renderVue3(create, attributes) {
    const attrMap = attributesToMap(attributes);

    const app = create(attrMap);
    const html = await renderToString(app);

    return wrapAsShadowDOM(html);
}
