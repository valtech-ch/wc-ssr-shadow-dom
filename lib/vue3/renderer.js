import { renderToString } from 'vue/server-renderer'

function wrapAsShadowDOM(html) {
    return `<template shadowroot="open">${html}</template>`;
}

export async function renderVue3(create) {
    const app = create();
    const html = await renderToString(app);

    return wrapAsShadowDOM(html);
}
