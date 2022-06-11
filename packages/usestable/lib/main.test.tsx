import { stable, useStable } from "./main";
import { fireEvent, render } from "@testing-library/react";
import React, { memo, useState } from "react";

test("stable component", () => {
  let rerenderCount = 0;

  const ClickMe = stable((props: { onClick: VoidFunction }) => {
    rerenderCount++;
    return <div data-testid="click-me" onClick={props.onClick} />;
  });

  const Container = () => {
    const [count, setCount] = useState(0);
    return (
      <div>
        <div data-testid="count">{count}</div>
        <ClickMe onClick={() => setCount(count + 1)} />
      </div>
    );
  };
  const { getByTestId } = render(<Container />);
  // first rendering
  expect(rerenderCount).toBe(1);
  expect(getByTestId("count").textContent).toBe("0");
  // update count
  fireEvent.click(getByTestId("click-me"));
  expect(getByTestId("count").textContent).toBe("1");
  // no re-render
  expect(rerenderCount).toBe(1);
});

test("stable component with date prop", () => {
  let rerenderCount = 0;
  const initDate = Date.now();

  const ClickMe = stable((props: { onClick: VoidFunction; date: Date }) => {
    rerenderCount++;
    return <div data-testid="click-me" onClick={props.onClick} />;
  });

  const Container = () => {
    const [count, setCount] = useState(0);
    return (
      <div>
        <div data-testid="count">{count}</div>
        <ClickMe
          onClick={() => setCount(count + 1)}
          date={new Date(initDate)}
        />
      </div>
    );
  };
  const { getByTestId } = render(<Container />);
  // first rendering
  expect(rerenderCount).toBe(1);
  expect(getByTestId("count").textContent).toBe("0");
  // update count
  fireEvent.click(getByTestId("click-me"));
  expect(getByTestId("count").textContent).toBe("1");
  // no re-render
  expect(rerenderCount).toBe(1);
});

test("useStable", () => {
  let rerenderCount = 0;

  const ClickMe = memo((props: { onClick: VoidFunction }) => {
    rerenderCount++;
    return <div data-testid="click-me" onClick={props.onClick} />;
  });

  const Container = () => {
    const [count, setCount] = useState(0);
    const stable = useStable({ onClick: () => setCount(count + 1) });
    return (
      <div>
        <div data-testid="count">{count}</div>
        <ClickMe onClick={stable.onClick} />
      </div>
    );
  };
  const { getByTestId } = render(<Container />);
  // first rendering
  expect(rerenderCount).toBe(1);
  expect(getByTestId("count").textContent).toBe("0");
  // update count
  fireEvent.click(getByTestId("click-me"));
  expect(getByTestId("count").textContent).toBe("1");
  // no re-render
  expect(rerenderCount).toBe(1);
});
