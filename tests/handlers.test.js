import React from "react";
import expect, { spyOn } from "expect";
import { renderToStaticMarkup as render } from "react-dom/server";
import Enzyme from "enzyme";
import Adapter from "enzyme-adapter-react-16";
import "../demo/src/index.css";

import { Pannellum } from "src/";
import image from "../demo/src/images/milan.jpg";

Enzyme.configure({ adapter: new Adapter() });

describe("Pannellum Component Test", () => {
  beforeEach(() => {
    spyOn(console, "error");

    this.ref = React.createRef();

    this.pan = render(
      <Pannellum
        ref={this.ref}
        id="test"
        width="100%"
        height="500px"
        image={image}
        autoLoad={true}
        hotspots={[
          {
            pitch: 2,
            yaw: 80,
            type: "custom",
            cssClass: "arrow-hotspot",
            clickHandlerFunc: () => {
              console.log("Go to next scene");
            }
          }
        ]}
      />
    );
  });

  it("should render the wrapper div", () => {
    expect(this.pan)
      .toInclude('<div id="test" style="width:100%;height:500px"></div>');
  });
});
