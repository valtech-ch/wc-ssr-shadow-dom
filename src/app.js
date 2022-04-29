import { createSSRApp } from 'vue'
import { SlotFactory, ShadowTemplateFactory } from '../lib/components.js'
// app.js (shared between server and client)

const SSRShadowButton = ['ssr-shadow-button', {
  template: `
  <button @click="count++">
    <slot-factory></slot-factory>
    {{ count }}
  </button>
  `,
  data: () => ({ count: 1 }),
}];

export function createApp() {
  const app = createSSRApp({
    data: () => ({ count: 1 }),
    template: `<ssr-shadow-button>Some Text</ssr-shadow-button>`
  });

  app.component(...SlotFactory);
  app.component(...ShadowTemplateFactory);
  app.component(...SSRShadowButton);

  return app;
}
