import * as React from "react";
import { SlotFactory } from "./factories.js";

const Component = React?.Component || window.React.Component;
const e = React?.createElement || window.React.createElement;

class CmpHeaderClass extends Component {

    constructor() {
        super();
        this.state = {
            color: '#8BC34A',
        };
    }
    handleClick = () => {
        this.setState({
            color: this.state.color === '#8BC34A' ? 'blue' : '#8BC34A'
        });
    };

    render() {
        return e(
            'nav',
            {
                style: {
                    display: 'flex',
                    backgroundColor: this.state.color,
                    color: 'white',
                },
                onClick: this.handleClick,
            },
            e(
                'h1',
                {
                    style: {
                        margin: 0,
                        fontSize: '24px',
                    }
                },
                "Pass through header is: ",
                SlotFactory(),
            ),
        );
    }
}

export function CmpHeader(props) {
    return e(CmpHeaderClass, props, null);
}