import * as React from "react"

const e = React?.createElement || window.React.createElement;

export function SlotFactory() {
    return e('slot', null, null)
}
