import { create, stable, useStable } from "./main";
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
    const stable = useStable({
      onClick: () => setCount(count + 1),
    });
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

test("useStable with extra", () => {
  let rerenderCount = 0;

  const ClickMe = memo((props: { onClick: VoidFunction }) => {
    rerenderCount++;
    return <div data-testid="click-me" onClick={props.onClick} />;
  });

  const Container = () => {
    const [count, setCount] = useState(0);
    const stable = useStable({
      $extra: {
        increment: () => count + 1,
        dispatch: setCount,
      },
      onClick() {
        this.$extra.increment();
      },
    });
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

test("create with generic type", () => {
  const R = create(<T,>(props: { obj: T; name: keyof T; other?: number }) => {
    return <>{props.name}</>;
  }).end();

  <R obj={{ aaa: 1, bb: 2 }} name="bb" />;
});

test("prop() with map", () => {
  const C = create((props: { size?: "small" | "large" | "medium" }) => (
    <div data-testid="output">{props.size}</div>
  ))
    .prop("size", { sm: "small", lg: "large" })
    .end();
  const { getByTestId } = render(<C sm />);
  expect(getByTestId("output").textContent).toBe("small");
});

test("create", () => {
  let renderCount = 0;
  const Container = create(() => {
    renderCount++;
    return <div data-testid="test">test</div>;
  })
    .memo()
    .end();
  const { getByTestId, rerender } = render(<Container />);
  expect(getByTestId("test").textContent).toBe("test");
  rerender(<Container />);
  rerender(<Container />);
  expect(renderCount).toBe(1);
});
