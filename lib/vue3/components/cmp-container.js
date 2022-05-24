import { createSSRApp } from "vue";
import { ShadowTemplateFactory, SlotFactory } from "../factories.js";

const CmpContainer = ['cmp-container', {
  template: `
  <div style="max-width: 720px; margin: 0 auto; box-shadow: 0px 4px 4px 2px #ddd" @click="invertTitle">
    <div style="border-bottom: solid 1px #ccc; padding: 6px 24px">
        <h1 :style="titleStyle">{{ title }}</h1>
    </div>
    <div style="padding: 24px">
        <slot-factory></slot-factory>
    </div>
  </div>
  `,
  props: ['titleColor'],
  data: () => ({ title: 'Some Title' }),
  computed: {
      titleStyle() {
        return `color: ${this.titleColor || 'black'}`
      }
  },
  methods: {
      invertTitle() {
        this.title = this.title === 'Some Title' ? 'Some Other Title' : 'Some Title';
      }
  }
}];

export function createCmpContainerApp(props) {
    console.log('elaborating props:', props);
  const app = createSSRApp({
    data: () => ({ titleColor: props['title-color'] }),
    template: `<cmp-container :titleColor="titleColor">This Will be ignored since there's no Vue slot in the template of cmp-container</cmp-container>`
  });

  app.component(...SlotFactory);
  app.component(...ShadowTemplateFactory);
  app.component(...CmpContainer);

  return app;
}
