export function attributesToMap(attributes) {
    return Object.fromEntries([...attributes].map(at => [at.name, at.value]))
}

export function wrapAsShadowDOM(html) {
    return `<template shadowroot="open">${html}</template>`;
}