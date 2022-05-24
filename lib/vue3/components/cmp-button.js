import { createSSRApp } from "vue";
import { ShadowTemplateFactory, SlotFactory } from "../factories.js";

const CmpButton = ['ssr-shadow-button', {
  template: `
  <button @click="count++">
    <slot-factory></slot-factory>
    {{ count }}
  </button>
  `,
  data: () => ({ count: 1 }),
}];

export function createCmpButtonApp() {
  const app = createSSRApp({
    data: () => ({ count: 1 }),
    template: `<ssr-shadow-button>Some Text</ssr-shadow-button>`
  });

  app.component(...SlotFactory);
  app.component(...ShadowTemplateFactory);
  app.component(...CmpButton);

  return app;
}
