- [`useStable`](#usestable)
  - [Installation](#installation)
  - [Motivation](#motivation)
    - [Stable identity callback](#stable-identity-callback)
    - [Geting fresh values in callbacks](#geting-fresh-values-in-callbacks)
  - [API references](#api-references)

# `useStable`

A React hook to create stable component/object

## Installation

**with NPM**

```bash
npm i usestable --save
```

**with YARN**

```bash
yarn add usestable
```

## Motivation

Inspired by [useEvent RFC](https://github.com/reactjs/rfcs/pull/220). What's useEvent does:

### Stable identity callback

```js
import { useEvent } from "react";

function Chat() {
  const [text, setText] = useState("");

  const onClick = useEvent(() => {
    sendMessage(text);
  });

  return <SendButton onClick={onClick} />;
}
```

with useStable

```js
import { useStable } from "react";

function Chat() {
  const [text, setText] = useState("");
  const stable = useStable({
    onClick: () => {
      sendMessage(text);
    },
  });

  return <SendButton onClick={stable.onClick} />;
}
```

For above examples, you must wrap your SendButton with memo(). Need to useEvent every time and easy to forget.

**Better solution: wrap once, use everywhere**

```js
import { stable } from "usestable";

const SendButton = stable((props) => {
  // implementation
});

// you also wrap 3rd-party components
import { Button } from "antd";

// even with specified props only. by default, all props will be stable
const SendButton = stable(Button, { props: ["onClick"] });
```

There you go, no need to wrap any event callbacks. You also free with inline callbacks

```js
function Chat({ rooms }) {
  const [text, setText] = useState("");

  return rooms.map((room) => (
    <SendButton
      // if you wrap SendButton with stable(), you dont not worry this
      onClick={
        () => sendMessage(room, text)
        // 🙁 Can't wrap it with useEvent
      }
    />
  ));
}
```

### Geting fresh values in callbacks

```js
const contextVariable = useContext(SomeContext);
const callback = useEvent(async () => {
  // the contextVariable is fresh now
  console.log(contextVariable);
  await callAsyncMethod();
  // but it is outdated now
  console.log(contextVariable);
});
```

You must use more useEvent hook to handle above case

```js
const contextVariable = useContext(SomeContext);
const onDone = useEvent(() => {
  console.log(contextVariable);
});
const callback = useEvent(async () => {
  // the contextVariable is fresh now
  console.log(contextVariable);
  await callAsyncMethod();
  onDone();
});
```

You totally archive same goal with useStable() hook

```js
import { useStable } from "usestable";

const contextVariable = useContext(SomeContext);
// create stable object to hold contextVariable
const stable = useStable({ contextVariable });
const callback = useCallback(async () => {
  // the contextVariable is fresh now
  console.log(stable.contextVariable);
  await callAsyncMethod();
  // and it is still fresh now and after. Easy ?
  console.log(stable.contextVariable);
}, [stable]);
```

You even use stable object with any React's hook

```js
const stable = useStable({
  some,
  stable,
  variables,
  here,
  dateValue, // useStable will not update date values if its timestamp does not change
  stableCallback() {},
});

const flexibleCallback = useCallback(() => {
  console.log(unstableVar);
  console.log(stable.variables);
}, [stable, unstableVar /* add dependencies to control callback re-create */]);

useEffect(() => {
  socket.on("connected", () => {
    console.log(stable.some);
    console.log(stable.variables);
  });
}, [stable /* add more dependencies ad you need */]);
```

## API references

https://linq2js.github.io/usestable/
