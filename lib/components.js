import { h } from 'vue'

export const SlotFactory = ["slot-factory", {
  render: () => h("slot")
}];

export const ShadowTemplateFactory = ["shadow-template-factory", {
    render: function() {
        return h("template", // tag name
            { shadowroot: 'open' },
            this.$slots.default()
        );
    }
}];
